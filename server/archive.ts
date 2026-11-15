import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { TASK_LABEL } from "../shared/contracts";
import { listTaskAgents } from "./tasks";

type PaseoApi = PluginHandlerContext["paseo"];

export async function archiveTask(
  input: { agentId: string; archiveWorkers: boolean },
  paseo: PaseoApi,
) {
  const coordinator = paseo.agents.ref(input.agentId);
  const snapshot = (await coordinator.refresh())?.agent;
  if (
    !snapshot ||
    snapshot.labels[TASK_LABEL] !== "true" ||
    snapshot.labels["paseo.parent-agent-id"]
  )
    throw new Error("This agent is not a multi-project task coordinator. Refresh the task list.");
  if (snapshot.archivedAt) return { archivedAt: snapshot.archivedAt };

  const agents = await listTaskAgents(paseo);
  const directWorkers = agents.filter(
    (agent) => !agent.archivedAt && agent.labels["paseo.parent-agent-id"] === input.agentId,
  );
  if (input.archiveWorkers) {
    const visited = new Set([input.agentId]);
    async function archiveWorkers(parentId: string): Promise<void> {
      for (const agent of agents) {
        if (
          agent.archivedAt ||
          agent.labels["paseo.parent-agent-id"] !== parentId ||
          visited.has(agent.id)
        )
          continue;
        visited.add(agent.id);
        const worker = paseo.agents.ref(agent.id);
        const current = (await worker.refresh())?.agent;
        if (!current || current.archivedAt || current.labels["paseo.parent-agent-id"] !== parentId)
          continue;
        // Deepest first: stock parent archive can detach children in another workspace.
        await archiveWorkers(agent.id);
        try {
          await worker.archive();
        } catch (error) {
          throw new Error(
            `Could not archive worker "${agent.title || agent.id}". The coordinator is kept so you can retry. ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    await archiveWorkers(input.agentId);
  } else {
    // Detach even same-workspace workers; otherwise stock parent archive archives them.
    for (const agent of directWorkers) {
      const worker = paseo.agents.ref(agent.id);
      const current = (await worker.refresh())?.agent;
      if (
        current &&
        !current.archivedAt &&
        current.labels["paseo.parent-agent-id"] === input.agentId
      )
        await worker.detach();
    }
  }
  // Keep the coordinator visible if a worker operation fails partway through.
  return coordinator.archive();
}
