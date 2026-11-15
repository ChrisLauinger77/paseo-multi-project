import type { PluginHandlerContext } from "@getpaseo/plugin/server";
type PaseoApi = PluginHandlerContext["paseo"];
type PaseoAgent = Awaited<ReturnType<PaseoApi["agents"]["list"]>>["entries"][number]["agent"];
import {
  TASK_LABEL,
  PLUGIN_LABEL,
  INPUT_LABEL,
  DISCOVERY_TOOL,
  ATTACHMENTS_TOOL,
  launchSchema,
  type TaskLaunch,
} from "../shared/contracts";
import { buildOrchestrationPrompt } from "../shared/prompt";
import { AttachmentStore, isVisionImage } from "./attachments";
import { listProjects, validateTargets } from "./projects";

export function deriveTitle(task: string) {
  return task.trim().split(/\r?\n/)[0]!.replace(/\s+/g, " ").slice(0, 60);
}

export async function launchTask(raw: TaskLaunch, paseo: PaseoApi, store = new AttachmentStore()) {
  const input = launchSchema.parse(raw);
  const projects = validateTargets(input.projects, await listProjects(paseo), input.isolation);
  const first = projects[0]!;
  const { config } = await paseo.config.get();
  if (config.mcp.enabled === false || !config.mcp.injectIntoAgents)
    throw new Error(
      "Enable Paseo tools in the host configuration before launching a multi-project task.",
    );
  const policy = config.providers[input.config.provider]?.paseoTools;
  if (
    policy?.enabled === false ||
    [
      "create_workspace",
      "create_agent",
      DISCOVERY_TOOL,
      ...(input.attachments?.length ? [ATTACHMENTS_TOOL] : []),
    ].some((t) => policy?.disabledTools?.includes(t))
  )
    throw new Error("The selected provider's tool policy disables a required multi-project tool.");
  const snapshot = await paseo.providers.waitForReady({ cwd: first.projectRootPath });
  const provider = snapshot.entries.find((p) => p.provider === input.config.provider);
  if (!provider?.enabled || provider.status !== "ready")
    throw new Error(provider?.error || "The selected provider is not ready on this host.");
  if (!provider.models?.some((m) => m.id === input.config.model && m.isSelectable !== false))
    throw new Error("The selected model is no longer available. Refresh the provider catalog.");
  const agentConfig = {
    ...input.config,
    provider: `${input.config.provider}/${input.config.model}`,
  };
  const features = await paseo.providers.listFeatures({
    ...agentConfig,
    cwd: first.projectRootPath,
  });
  if (features.error) throw new Error(features.error);
  const files = await store.resolve(input.attachments || []);
  const attachments = files.map(({ bytes: _bytes, ...file }) => file);
  // Both operations use daemon-owned idempotency; a lost RPC response can be retried unchanged.
  const workspace = await paseo.workspaces.create({
    source: { kind: "directory", path: first.projectRootPath, projectId: first.projectId },
    idempotencyKey: `multi-project:${input.id}:context`,
  });
  const coordinator = await workspace.agents.create({
    config: agentConfig,
    title: deriveTitle(input.task),
    attachments: attachments.map((file) => ({ type: "uploaded_file" as const, ...file })),
    images: files
      .filter((file) => isVisionImage(file.mimeType))
      .map((file) => ({ data: file.bytes.toString("base64"), mimeType: file.mimeType })),
    idempotencyKey: `multi-project:${input.id}:coordinator`,
    labels: { [TASK_LABEL]: "true", [PLUGIN_LABEL]: "true", [INPUT_LABEL]: JSON.stringify(input) },
    prompt: buildOrchestrationPrompt({
      task: input.task,
      projects: input.projects,
      isolation: input.isolation,
      agent: input.config,
      attachments,
    }),
  });
  return { agentId: coordinator.id, workspaceId: workspace.id };
}

function summary(agent: PaseoAgent) {
  return {
    id: agent.id,
    title: agent.title || "Untitled agent",
    status: agent.status,
    permissions: agent.pendingPermissions.length,
    workspaceId: agent.workspaceId ?? null,
  };
}
export async function listTaskAgents(
  paseo: PaseoApi,
  filter?: { includeArchived?: boolean; includeInternal?: boolean },
) {
  const agents: PaseoAgent[] = [];
  let cursor: string | undefined;
  do {
    const page = await paseo.agents.list({
      includeBackground: true,
      ...(filter ? { filter } : {}),
      page: { limit: 200, ...(cursor ? { cursor } : {}) },
    });
    agents.push(...page.entries.map((e) => e.agent));
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor);
  return agents;
}

export async function listTasks(paseo: PaseoApi) {
  const agents = await listTaskAgents(paseo);
  return {
    tasks: agents
      .filter(
        (a) =>
          !a.archivedAt && !a.labels["paseo.parent-agent-id"] && a.labels[TASK_LABEL] === "true",
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => ({
        ...summary(a),
        workers: agents
          .filter((c) => !c.archivedAt && c.labels["paseo.parent-agent-id"] === a.id)
          .map(summary),
      })),
  };
}
