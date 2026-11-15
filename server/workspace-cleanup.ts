import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { listTaskAgents } from "./tasks";

type PaseoApi = PluginHandlerContext["paseo"];

export async function archiveEmptyWorkspaces(workspaceIds: Set<string>, paseo: PaseoApi) {
  const errors: string[] = [];
  for (const workspaceId of workspaceIds) {
    let name = workspaceId;
    try {
      const workspace = paseo.workspaces.ref(workspaceId);
      const snapshot = await workspace.refresh();
      // Require explicit proof that workspace archival cannot remove a managed checkout.
      if (
        !snapshot ||
        (snapshot.workspaceKind !== "directory" && snapshot.workspaceKind !== "local_checkout") ||
        snapshot.project?.checkout.isPaseoOwnedWorktree !== false ||
        snapshot.gitRuntime?.isPaseoOwnedWorktree === true ||
        snapshot.internal ||
        snapshot.background ||
        snapshot.archivingAt ||
        snapshot.setupStatus === "running" ||
        snapshot.scripts.some((script) => script.lifecycle === "running")
      )
        continue;
      name = `${snapshot.projectDisplayName} / ${snapshot.title || snapshot.name}`;
      if ((await workspace.terminals.list()).entries.length) continue;
      // Re-read after agent archival, including hidden agents and every page.
      const agents = await listTaskAgents(paseo, { includeInternal: true });
      if (agents.some((agent) => !agent.archivedAt && agent.workspaceId === workspaceId)) continue;
      const result = await workspace.archive();
      if (result.error || !result.archivedAt)
        throw new Error(result.error || "Workspace archival was not confirmed.");
      // The stock host can report success after a partial teardown; check the active directory.
      if (await workspace.refresh()) throw new Error("The workspace is still active.");
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return errors;
}
