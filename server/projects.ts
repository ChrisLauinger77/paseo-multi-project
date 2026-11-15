import type { PluginHandlerContext } from "@getpaseo/plugin/server";
type PaseoApi = PluginHandlerContext["paseo"];
import { projectSchema, type TaskProject } from "../shared/contracts";

export async function listProjects(paseo: PaseoApi): Promise<TaskProject[]> {
  const result = await paseo.projects.list();
  return result.projects.map((project) => projectSchema.parse(project));
}
export function validateTargets(
  selected: readonly TaskProject[],
  current: readonly TaskProject[],
  isolation: "local" | "worktree",
) {
  return selected.map((target) => {
    const project = current.find((p) => p.projectId === target.projectId);
    if (!project)
      throw new Error(
        `Project ${target.projectDisplayName} is no longer registered. Refresh projects and retry.`,
      );
    if (
      project.projectRootPath !== target.projectRootPath ||
      project.projectKind !== target.projectKind
    )
      throw new Error(
        `Project ${target.projectDisplayName} changed. Refresh projects and select it again.`,
      );
    if (isolation === "worktree" && project.projectKind !== "git")
      throw new Error("Worktree isolation requires every selected project to be a Git project.");
    return project;
  });
}
