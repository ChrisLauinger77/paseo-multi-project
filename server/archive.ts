import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { TASK_LABEL, type TaskArchive, type TaskArchiveResult } from "../shared/contracts";
import { listTaskAgents } from "./tasks";
import { archiveEmptyWorkspaces } from "./workspace-cleanup";

type PaseoApi = PluginHandlerContext["paseo"];

export async function archiveTask(input: TaskArchive, paseo: PaseoApi): Promise<TaskArchiveResult> {
  const coordinator = paseo.agents.ref(input.agentId);
  const snapshot = (await coordinator.refresh())?.agent;
  if (
    !snapshot ||
    snapshot.labels[TASK_LABEL] !== "true" ||
    snapshot.labels["paseo.parent-agent-id"]
  )
    throw new Error("This agent is not a multi-project task coordinator. Refresh the task list.");
  if (snapshot.archivedAt && !input.archiveEmptyWorkspaces)
    return { archivedAt: snapshot.archivedAt };

  const agents = await listTaskAgents(paseo, { includeArchived: true, includeInternal: true });
  const workspaceIds = new Set<string>();
  if (input.archiveEmptyWorkspaces) {
    if (snapshot.workspaceId) workspaceIds.add(snapshot.workspaceId);
    if (input.archiveWorkers) {
      const visited = new Set([input.agentId]);
      function collectWorkspaces(parentId: string) {
        for (const agent of agents) {
          if (agent.labels["paseo.parent-agent-id"] !== parentId || visited.has(agent.id)) continue;
          visited.add(agent.id);
          if (agent.workspaceId) workspaceIds.add(agent.workspaceId);
          collectWorkspaces(agent.id);
        }
      }
      collectWorkspaces(input.agentId);
    }
  }
  const directWorkers = agents.filter(
    (agent) => !agent.archivedAt && agent.labels["paseo.parent-agent-id"] === input.agentId,
  );
  if (!snapshot.archivedAt && input.archiveWorkers) {
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
  } else if (!snapshot.archivedAt) {
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
  const result = snapshot.archivedAt
    ? { archivedAt: snapshot.archivedAt }
    : await coordinator.archive();
  if (!input.archiveEmptyWorkspaces) return result;
  // Cleanup is optional and happens only after task archival succeeds. Report failures
  // separately so the client cannot mistake an archived task for a failed task archive.
  return {
    ...result,
    workspaceCleanupErrors: await archiveEmptyWorkspaces(workspaceIds, paseo),
  };
}
