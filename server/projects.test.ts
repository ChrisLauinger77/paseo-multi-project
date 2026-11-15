import { describe, expect, it } from "vitest";
import { validateTargets } from "./projects";
import { launchSchema, type TaskProject } from "../shared/contracts";
const git: TaskProject = {
  projectId: "git",
  projectDisplayName: "Repository",
  projectRootPath: "/repo",
  projectKind: "git",
};
const notes: TaskProject = {
  projectId: "notes",
  projectDisplayName: "Notes",
  projectRootPath: "/notes",
  projectKind: "non_git",
};
describe("registered target validation", () => {
  it("keeps only the user's selected registered projects in selection order", () => {
    expect(validateTargets([notes, git], [git, notes], "local")).toEqual([notes, git]);
  });
  it("refuses removed and changed projects before creation", () => {
    expect(() => validateTargets([git], [], "local")).toThrow("no longer registered");
    expect(() =>
      validateTargets([git], [{ ...git, projectRootPath: "/changed" }], "local"),
    ).toThrow("changed");
  });
  it("never falls back from Worktree to Local for a non-Git target", () => {
    expect(() => validateTargets([git, notes], [git, notes], "worktree")).toThrow(
      "every selected project",
    );
    expect(validateTargets([git], [git, notes], "worktree")).toEqual([git]);
  });
});

it("preserves the task text verbatim while rejecting blank tasks", () => {
  const request = {
    id: "30beb5e0-a914-400a-9396-ec36defca468",
    task: "  Inspect the project.\n\n",
    projects: [git],
    isolation: "local",
    config: { provider: "codex", model: "test" },
  };
  expect(launchSchema.parse(request).task).toBe(request.task);
  expect(launchSchema.safeParse({ ...request, task: " \n " }).success).toBe(false);
});
