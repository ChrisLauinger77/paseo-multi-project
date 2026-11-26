import type { PluginHandlerContext } from "@getpaseo/plugin/server";
type PaseoApi = PluginHandlerContext["paseo"];
import type { RpcInput } from "@getpaseo/plugin";
import { z } from "zod";
import {
  agentOptionsSchema,
  featuresRpc,
  INPUT_LABEL,
  PLUGIN_LABEL,
  TASK_LABEL,
} from "../shared/contracts";
import { listProjects } from "./projects";

const taskOptionsSchema = z.object({ config: agentOptionsSchema });

function readTaskOptions(label: string) {
  try {
    return taskOptionsSchema.safeParse(JSON.parse(label)).data?.config;
  } catch {
    return undefined;
  }
}

async function lastUsedAgentOptions(paseo: PaseoApi, providerIds: string[]) {
  const remaining = new Set(providerIds);
  const options = new Map<string, z.infer<typeof agentOptionsSchema>>();
  let cursor: string | undefined;
  while (remaining.size) {
    const page = await paseo.agents.list({
      filter: { labels: { [TASK_LABEL]: "true", [PLUGIN_LABEL]: "true" }, includeArchived: true },
      sort: [{ key: "created_at", direction: "desc" }],
      page: { limit: 200, cursor },
    });
    for (const { agent } of page.entries) {
      const label = agent.labels[INPUT_LABEL];
      if (!label || !remaining.has(agent.provider) || agent.labels["paseo.parent-agent-id"])
        continue;
      const config = readTaskOptions(label);
      if (!config) continue;
      options.set(agent.provider, config);
      remaining.delete(agent.provider);
    }
    cursor = page.pageInfo.nextCursor ?? undefined;
    if (!cursor) break;
  }
  return options;
}

export async function readCatalog(paseo: PaseoApi) {
  const [projects, snapshot] = await Promise.all([
    listProjects(paseo),
    paseo.providers.waitForReady(),
  ]);
  const enabled = snapshot.entries.filter((p) => p.enabled);
  const lastUsed = await lastUsedAgentOptions(
    paseo,
    enabled.filter((p) => p.status === "ready").map((p) => p.provider),
  ).catch((error) => {
    console.warn("Could not read last-used agent options", error);
    return undefined;
  });
  return {
    projects,
    providers: enabled.map((p) => ({
      id: p.provider,
      label: p.label || p.provider,
      status: p.status,
      ...(p.error ? { error: p.error } : {}),
      lastUsedOptions: lastUsed?.get(p.provider),
      modes: (p.modes || []).map((m) => ({ id: m.id, label: m.label })),
      models: (p.models || [])
        .filter((m) => m.isSelectable !== false)
        .map((m) => ({
          id: m.id,
          label: m.label,
          thinkingOptions: (m.thinkingOptions || []).map((t) => ({ id: t.id, label: t.label })),
        })),
    })),
  };
}
export async function readFeatures(input: RpcInput<typeof featuresRpc>, paseo: PaseoApi) {
  const result = await paseo.providers.listFeatures({
    ...input.config,
    provider: `${input.config.provider}/${input.config.model}`,
    cwd: input.cwd,
  });
  if (result.error) throw new Error(result.error);
  return { features: result.features || [] };
}
