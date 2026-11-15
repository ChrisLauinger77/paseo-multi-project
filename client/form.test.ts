import { expect, it } from "vitest";
import { createTaskForm } from "./form";
const project = {
  projectId: "one",
  projectDisplayName: "One",
  projectRootPath: "/one",
  projectKind: "git" as const,
};
function ready() {
  const f = createTaskForm();
  f.setTask("Update tests");
  f.toggleProject(project);
  f.setConfig({ provider: "codex", model: "test" });
  return f;
}
it("requires a task, selected projects and an agent configuration", async () => {
  const f = createTaskForm();
  let calls = 0;
  expect(
    await f.submit({
      prepare: async () => {
        calls++;
        return { id: "a" };
      },
      launch: async () => {
        throw Error("must not launch");
      },
    }),
  ).toBeNull();
  expect(calls).toBe(0);
});
it("keeps Worktree selection for Git projects and switches to Local for non-Git projects", () => {
  const f = ready();
  f.setIsolation("worktree");
  expect(f.getState().isolation).toBe("worktree");
  f.toggleProject({ ...project, projectId: "notes", projectKind: "non_git" });
  expect(f.getState().isolation).toBe("local");
});
it("retains inputs and the same request identity after a lost response", async () => {
  const f = ready();
  let calls = 0;
  const requests: unknown[] = [];
  const client = {
    prepare: async () => ({ id: "30beb5e0-a914-400a-9396-ec36defca468" }),
    launch: async (request: unknown) => {
      requests.push(request);
      if (++calls === 1) throw Error("Disconnected after creation");
      return { agentId: "coordinator", workspaceId: "workspace" };
    },
  };
  expect(await f.submit(client)).toBeNull();
  expect(f.getState().error).toBe("Disconnected after creation");
  expect(f.getState().task).toBe("Update tests");
  expect(await f.submit(client)).toEqual({ agentId: "coordinator", workspaceId: "workspace" });
  expect(requests[0]).toBe(requests[1]);
});
it("blocks duplicate submission and edits during pending creation", async () => {
  const f = ready();
  let release!: (value: { agentId: string; workspaceId: string }) => void;
  const promise = new Promise<{ agentId: string; workspaceId: string }>((resolve) => {
    release = resolve;
  });
  const client = { prepare: async () => ({ id: "id" }), launch: async () => promise };
  const pending = f.submit(client);
  f.setTask("Changed");
  expect(await f.submit(client)).toBeNull();
  expect(f.getState().task).toBe("Update tests");
  release({ agentId: "a", workspaceId: "w" });
  await pending;
  expect(f.getState().pending).toBe(false);
});

it("allows choosing Worktree before selecting Git projects", () => {
  const f = createTaskForm();
  f.setIsolation("worktree");
  f.toggleProject(project);
  expect(f.getState().isolation).toBe("worktree");
});

it("retains attachment references and reuses them on a failed launch retry", async () => {
  const f = ready();
  const attachment = {
    id: "2512d7de-1da4-4b5c-8477-d778a0ee84ce",
    fileName: "requirements.md",
    mimeType: "text/markdown",
    size: 12,
  };
  f.setAttachments([attachment]);
  const requests: unknown[] = [];
  let calls = 0;
  const client = {
    prepare: async () => ({ id: "30beb5e0-a914-400a-9396-ec36defca468" }),
    launch: async (request: unknown) => {
      requests.push(request);
      if (++calls === 1) throw new Error("Connection lost");
      return { agentId: "coordinator", workspaceId: "workspace" };
    },
  };
  await f.submit(client);
  expect(f.getState().attachments).toEqual([attachment]);
  await f.submit(client);
  expect(requests[0]).toBe(requests[1]);
  expect(requests[0]).toMatchObject({ attachments: [attachment] });
});

it("blocks launch while attachments upload or have an unresolved error", async () => {
  const f = ready();
  const client = {
    prepare: async () => {
      throw new Error("must not prepare");
    },
    launch: async () => {
      throw new Error("must not launch");
    },
  };
  f.setAttachmentStatus(true);
  expect(await f.submit(client)).toBeNull();
  f.setAttachmentStatus(false, "Could not upload requirements.md");
  expect(await f.submit(client)).toBeNull();
  f.setAttachments([]);
  expect(f.getState().attachmentError).toBeNull();
});
