import { homedir } from "node:os";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
type PaseoApi = PluginHandlerContext["paseo"];
import type { RpcInput } from "@getpaseo/plugin";
import { featuresRpc } from "../shared/contracts";
import { listProjects } from "./projects";

export async function readCatalog(paseo: PaseoApi) {
  const [projects, snapshot] = await Promise.all([
    listProjects(paseo),
    paseo.providers.waitForReady(),
  ]);
  return {
    projects,
    providers: snapshot.entries
      .filter((p) => p.enabled)
      .map((p) => ({
        id: p.provider,
        label: p.label || p.provider,
        status: p.status,
        ...(p.error ? { error: p.error } : {}),
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
    cwd: input.cwd ?? homedir(),
  });
  if (result.error) throw new Error(result.error);
  return { features: result.features || [] };
}
