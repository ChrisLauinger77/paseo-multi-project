import { expect, test } from "vitest";
import { fixture, TASK_LABEL, PLUGIN_LABEL, deferred } from "./fixture";
import {
  DISCOVERY_TOOL,
  ATTACHMENTS_TOOL,
  tasksRpc,
  archiveRpc,
  attachmentSchema,
  INPUT_LABEL,
  MAX_ATTACHMENT_BYTES,
  launchRpc,
  prepareRpc,
  type TaskLaunch,
  type TaskLaunchResult,
} from "../shared/contracts";
import { readFileSync } from "node:fs";
import { AttachmentStore } from "../server/attachments";
import { access, writeFile, readFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { archiveTask } from "../server/archive";
import { launchTask } from "../server/tasks";
import { createTaskForm } from "../client/form";
import { archiveEmptyWorkspaces } from "../server/workspace-cleanup";
import type { CreationSnapshot } from "@getpaseo/protocol/messages";

test("cleans a definite startup failure and retries unchanged input with a fresh identity", async () => {
  const f = await fixture();
  try {
    f.sessionFailures.remaining = 1;
    const form = createTaskForm();
    form.setTask("FAIL_COORDINATOR_START");
    for (const project of f.request.projects) form.toggleProject(project);
    form.setConfig(f.request.config);
    const requests: TaskLaunch[] = [];
    const replies: TaskLaunchResult[] = [];
    const client = {
      prepare: async () => prepareRpc.output.parse(await f.rpc(prepareRpc.name, {})),
      launch: async (input: TaskLaunch) => {
        requests.push(input);
        const reply = launchRpc.output.parse(await f.rpc(launchRpc.name, input));
        replies.push(reply);
        return reply;
      },
    };
    expect(await form.submit(client)).toBeNull();
    expect(form.getState().error).toContain("Test provider rejected coordinator startup");
    const failed = replies[0]!;
    expect(failed).toMatchObject({ retryWithNewIdentity: true });
    expect(await f.paseo.workspaces.ref(failed.workspaceId).refresh()).toBeNull();
    expect(
      (
        await f.paseo.agents.list({
          filter: { includeArchived: true, includeInternal: true },
          includeBackground: true,
        })
      ).entries,
    ).toEqual([]);
    await access(path.join(f.request.projects[0]!.projectRootPath, ".git"));
    // If the failure reply was lost, an old-identity replay must still tell the client
    // to reset, despite the daemon returning the completed, now-archived workspace.
    const replay = launchRpc.output.parse(await f.rpc(launchRpc.name, requests[0]!));
    expect(replay).toMatchObject({ retryWithNewIdentity: true, workspaceId: failed.workspaceId });
    expect(await f.paseo.workspaces.ref(failed.workspaceId).refresh()).toBeNull();
    const retried = await form.submit(client);
    expect(retried).not.toBeNull();
    expect(requests[1]!.id).not.toBe(requests[0]!.id);
    expect(retried!.workspaceId).not.toBe(failed.workspaceId);
    expect(await f.paseo.workspaces.ref(retried!.workspaceId).refresh()).not.toBeNull();
    expect((await f.tools(retried!.agentId)).names()).toContain(DISCOVERY_TOOL);
  } finally {
    await f.close();
  }
}, 60000);

test.each(["completed", "missing", "outcome unknown"])(
  "keeps context and the creation identity after an ambiguous coordinator response, progress=%s",
  async (progress) => {
    const f = await fixture();
    try {
      let workspaceId: string | undefined;
      const interrupted = {
        ...f.paseo,
        workspaces: {
          ...f.paseo.workspaces,
          async create(input: Parameters<typeof f.paseo.workspaces.create>[0]) {
            const workspace = await f.paseo.workspaces.create(input);
            workspaceId = workspace.id;
            return {
              ...workspace,
              agents: {
                async create(input: Parameters<typeof workspace.agents.create>[0]) {
                  let creation: CreationSnapshot | undefined;
                  await workspace.agents.create({
                    ...input,
                    onEvent: (snapshot) => {
                      creation = snapshot;
                      if (progress === "completed") input.onEvent?.(snapshot);
                    },
                  });
                  // Fault injection at the public SDK boundary, without altering daemon state.
                  if (progress === "outcome unknown")
                    input.onEvent?.({
                      ...creation!,
                      phase: "failed",
                      failedStage: "agent",
                      outcomeUnknown: true,
                      agent: undefined,
                      error: "Outcome unknown",
                    });
                  throw new Error("Response lost after coordinator creation");
                },
              },
            };
          },
        },
      };
      await expect(
        launchTask(f.request, interrupted, new AttachmentStore(f.attachmentDirectory)),
      ).rejects.toThrow("Response lost");
      expect(await f.paseo.workspaces.ref(workspaceId!).refresh()).not.toBeNull();
      const retried = await f.launch();
      expect(retried.workspaceId).toBe(workspaceId);
      expect((await f.paseo.agents.list()).entries.map((entry) => entry.agent.id)).toEqual([
        retried.agentId,
      ]);
    } finally {
      await f.close();
    }
  },
  60000,
);

test("requires no agents of any kind when cleaning failed-launch context", async () => {
  const f = await fixture();
  try {
    const workspace = await f.paseo.workspaces.create({
      source: { kind: "directory", path: f.request.projects[0]!.projectRootPath },
    });
    const agent = await workspace.agents.create({ config: { provider: "codex/gpt-5.4-mini" } });
    await agent.archive();
    expect(
      await archiveEmptyWorkspaces(new Set([workspace.id]), f.paseo, { requireNoAgents: true }),
    ).toEqual([]);
    expect(await workspace.refresh()).not.toBeNull();
  } finally {
    await f.close();
  }
}, 60000);

test("keeps an unchanged launch retry stable after a registry project rename", async () => {
  const f = await fixture();
  try {
    const coordinator = await f.launch();
    const projectId = f.request.projects[0]!.projectId;
    await f.driver.renameProject(projectId, "Renamed after launch");
    expect(
      (await f.paseo.projects.list()).projects.find((p) => p.projectId === projectId)
        ?.projectCustomName,
    ).toBe("Renamed after launch");
    expect(await f.launch()).toEqual(coordinator);
    expect(
      f.launches.filter((launch) => launch.context?.agentId === coordinator.agentId),
    ).toHaveLength(1);
  } finally {
    await f.close();
  }
}, 60000);

test("opens coordinators with invalid input and their children", async () => {
  const f = await fixture(true);
  try {
    const workspace = await f.paseo.workspaces.create({
      source: { kind: "directory", path: f.request.projects[0]!.projectRootPath },
    });
    const coordinator = await workspace.agents.create({
      config: { provider: "codex/gpt-5.4-mini" },
      labels: { [PLUGIN_LABEL]: "true", [INPUT_LABEL]: "invalid JSON" },
    });
    const tools = await f.tools(coordinator.id);
    expect(tools.names()).toContain(DISCOVERY_TOOL);
    expect(tools.names()).not.toContain(ATTACHMENTS_TOOL);
    const child = await workspace.agents.create({
      config: { provider: "codex/gpt-5.4-mini" },
      parent: coordinator.id,
    });
    expect((await f.tools(child.id)).names()).not.toContain(ATTACHMENTS_TOOL);
  } finally {
    await f.close();
  }
}, 60000);

test.each([false, true])(
  "stock 0.15.4 plugin orchestration over native=%s",
  async (native) => {
    expect(
      JSON.parse(
        readFileSync(
          new URL("../node_modules/@getpaseo/server/package.json", import.meta.url),
          "utf8",
        ),
      ).version,
    ).toBe("0.15.4");
    const f = await fixture(native);
    try {
      const coordinator = await f.launch();
      expect(await f.launch()).toEqual(coordinator);
      const tools = await f.tools(coordinator.agentId);
      expect(tools.names()).toContain(DISCOVERY_TOOL);
      expect(tools.names()).not.toContain("list_projects");
      const discovery = await tools.invoke(DISCOVERY_TOOL, {});
      expect(discovery.structuredContent).toEqual({
        projects: f.projects.map((p) => ({
          projectId: p.projectId,
          name: p.projectCustomName || p.projectDisplayName,
          path: p.projectRootPath,
          kind: p.projectKind,
        })),
      });
      const ordinary = await f.plainAgent();
      const ordinaryTools = await f.tools(ordinary.id);
      expect(ordinaryTools.names()).not.toContain(DISCOVERY_TOOL);
      const children = [];
      for (const [index, project] of f.request.projects.entries()) {
        const workspace = await tools.invoke("create_workspace", {
          projectId: project.projectId,
          path: project.projectRootPath,
          isolation: index === 0 ? "local" : "worktree",
        });
        expect(workspace.isError).not.toBe(true);
        const workspaceId = (workspace.structuredContent as { workspaceId: string }).workspaceId;
        const child = await tools.invoke("create_agent", {
          workspaceId,
          provider: "codex/gpt-5.4-mini",
          settings: { modeId: "bypassPermissions" },
          title: `Worker ${index + 1}`,
          initialPrompt: `WORKER ${index + 1}`,
          notifyOnFinish: true,
        });
        expect(child.isError).not.toBe(true);
        children.push((child.structuredContent as { agentId: string }).agentId);
      }
      await Promise.all(
        children.map((id) => f.daemon.daemon.agentManager.waitForAgentRunStart(id)),
      );
      const idleSignals = children.map((id) => {
        const signal = deferred();
        const remove = f.daemon.daemon.agentManager.subscribe(
          (event) => {
            if (
              event.type === "agent_state" &&
              event.agent.id === id &&
              event.agent.lifecycle === "idle"
            ) {
              remove();
              signal.resolve();
            }
          },
          { replayState: false },
        );
        return signal.promise;
      });
      // The coordinator yields after dispatch, as required by the orchestration prompt.
      const yielded = f.paseo.agents.ref(coordinator.agentId).waitForFinish(10000);
      f.coordinator.resolve();
      await yielded;
      f.workers.resolve();
      await deadline(f.firstSteer.promise, "first completion notification");
      await deadline(Promise.all(idleSignals), "worker completion");
      f.releaseSteer.resolve();
      await deadline(f.bothDelivered.promise, "both completion notifications");
      expect(
        Array.from(f.notifications.join("\n").matchAll(/kind="agent-notification"/g)),
      ).toHaveLength(2);
      for (const id of children) {
        expect(f.notifications.filter((p) => p.includes(id))).toHaveLength(1);
        const agent = await f.paseo.agents.ref(id).refresh();
        expect(agent!.agent.labels["paseo.parent-agent-id"]).toBe(coordinator.agentId);
      }
      const list = tasksRpc.output.parse(await f.rpc(tasksRpc.name, {}));
      expect(list.tasks.filter((t) => t.id === coordinator.agentId)).toEqual([
        expect.objectContaining({
          workers: expect.arrayContaining(children.map((id) => expect.objectContaining({ id }))),
        }),
      ]);
      const all = await f.paseo.agents.list();
      expect(all.entries.filter((e) => e.agent.labels[TASK_LABEL] === "true")).toHaveLength(1);
    } finally {
      await f.close();
    }
  },
  60000,
);

test("stock host rejects stale projects and disabled tools without creating a coordinator", async () => {
  const f = await fixture();
  try {
    await expect(
      f.launch({
        ...f.request,
        projects: [{ ...f.request.projects[0]!, projectRootPath: "/changed" }],
      }),
    ).rejects.toThrow("changed");
    await f.driver.patchDaemonConfig({ mcp: { injectIntoAgents: false } });
    await expect(f.launch()).rejects.toThrow("Enable Paseo tools");
    expect((await f.paseo.agents.list()).entries).toEqual([]);
  } finally {
    await f.close();
  }
}, 60000);

async function deadline<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test("a clean distributable loads without the plugin's development node_modules", async () => {
  const { mkdtemp, rm, access } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const scratch = await mkdtemp(join(tmpdir(), "paseo-plugin-package-"));
  try {
    const packed = JSON.parse(
      execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], {
        encoding: "utf8",
      }),
    );
    const artifact = Array.isArray(packed)
      ? packed[0]
      : (Object.values(packed)[0] as { filename: string });
    execFileSync("tar", ["-xzf", join(scratch, artifact.filename), "-C", scratch]);
    const directory = join(scratch, "package");
    await expect(access(join(directory, "node_modules"))).rejects.toThrow();
    const f = await fixture(false, directory);
    try {
      const catalog = await f.rpc("catalog.read", {});
      expect(catalog).toMatchObject({
        projects: f.projects,
        providers: expect.arrayContaining([
          expect.objectContaining({ id: "codex", status: "ready" }),
        ]),
      });
    } finally {
      await f.close();
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}, 60000);

test.each([
  [false, undefined],
  [true, undefined],
  [false, true],
  [true, true],
])(
  "archives a coordinator with archiveWorkers=%s, archiveEmptyWorkspaces=%s without touching unrelated agents or projects",
  async (archiveWorkers, archiveEmptyWorkspaces) => {
    const f = await fixture();
    try {
      const coordinator = await f.launch();
      const ownWorkspace = f.paseo.workspaces.ref(coordinator.workspaceId);
      const otherProject = f.request.projects[1]!;
      const otherWorkspace = await f.paseo.workspaces.create({
        source: {
          kind: "directory",
          path: otherProject.projectRootPath,
          projectId: otherProject.projectId,
        },
      });
      const config = { provider: "codex/gpt-5.4-mini" };
      const local = await ownWorkspace.agents.create({
        config,
        parent: coordinator.agentId,
        title: "Local worker",
      });
      const remote = await otherWorkspace.agents.create({
        config,
        parent: coordinator.agentId,
        title: "Other project worker",
      });
      const nested = await ownWorkspace.agents.create({
        config,
        parent: remote.id,
        title: "Nested worker",
      });
      const unrelated = await otherWorkspace.agents.create({ config, title: "Unrelated agent" });
      const input = { agentId: coordinator.agentId, archiveWorkers, archiveEmptyWorkspaces };
      await expect(
        f.rpc("tasks.archive", { agentId: unrelated.id, archiveWorkers: true }),
      ).rejects.toThrow("coordinator");
      const result = archiveRpc.output.parse(await f.rpc("tasks.archive", input));
      expect(result.workspaceCleanupErrors || []).toEqual([]);
      await f.rpc("tasks.archive", input);
      expect((await f.paseo.agents.ref(coordinator.agentId).refresh())!.agent.archivedAt).toEqual(
        expect.any(String),
      );
      for (const worker of [local, remote, nested]) {
        const snapshot = (await worker.refresh())!.agent;
        expect(snapshot.archivedAt).toEqual(archiveWorkers ? expect.any(String) : null);
      }
      if (!archiveWorkers) {
        for (const worker of [local, remote])
          expect((await worker.refresh())!.agent.labels["paseo.parent-agent-id"]).toBeUndefined();
        expect((await nested.refresh())!.agent.labels["paseo.parent-agent-id"]).toBe(remote.id);
      }
      expect((await unrelated.refresh())!.agent.archivedAt).toBeNull();
      if (archiveWorkers && archiveEmptyWorkspaces) expect(await ownWorkspace.refresh()).toBeNull();
      else expect(await ownWorkspace.refresh()).not.toBeNull();
      expect(await otherWorkspace.refresh()).not.toBeNull();
      for (const project of f.projects) await access(project.projectRootPath);
      expect((await f.paseo.projects.list()).projects).toHaveLength(f.projects.length);
      expect(tasksRpc.output.parse(await f.rpc(tasksRpc.name, {})).tasks).toEqual([]);
    } finally {
      await f.close();
    }
  },
  60000,
);

test("cleans empty task Local workspaces while preserving worktrees, terminals and unrelated empty workspaces", async () => {
  const f = await fixture();
  try {
    const coordinator = await f.launch();
    const project = f.request.projects[1]!;
    const source = {
      kind: "directory" as const,
      path: project.projectRootPath,
      projectId: project.projectId,
    };
    const local = await f.paseo.workspaces.create({ source });
    const occupied = await f.paseo.workspaces.create({ source });
    const unrelated = await f.paseo.workspaces.create({ source });
    const created = await (
      await f.tools(coordinator.agentId)
    ).invoke("create_workspace", {
      projectId: project.projectId,
      path: project.projectRootPath,
      isolation: "worktree",
    });
    expect(created.isError).not.toBe(true);
    const managed = f.paseo.workspaces.ref(
      (created.structuredContent as { workspaceId: string }).workspaceId,
    );
    const managedDirectory = (await managed.refresh())!.workspaceDirectory;
    const localFile = path.join(project.projectRootPath, "keep-local.txt");
    const managedFile = path.join(managedDirectory, "keep-worktree.txt");
    await writeFile(localFile, "Local changes");
    await writeFile(managedFile, "Worktree changes");
    let parent = coordinator.agentId;
    for (const workspace of [managed, local, occupied]) {
      const worker = await workspace.agents.create({
        config: { provider: "codex/gpt-5.4-mini" },
        parent,
      });
      parent = worker.id;
    }
    const terminal = await occupied.terminals.create({ command: "sleep", args: ["300"] });
    const result = archiveRpc.output.parse(
      await f.rpc(archiveRpc.name, {
        agentId: coordinator.agentId,
        archiveWorkers: true,
        archiveEmptyWorkspaces: true,
      }),
    );
    expect(result.workspaceCleanupErrors).toEqual([]);
    expect(await f.paseo.workspaces.ref(coordinator.workspaceId).refresh()).toBeNull();
    expect(await local.refresh()).toBeNull();
    for (const workspace of [managed, occupied, unrelated])
      expect(await workspace.refresh()).not.toBeNull();
    expect((await occupied.terminals.list()).entries.map((entry) => entry.id)).toContain(
      terminal.id,
    );
    expect(await readFile(localFile, "utf8")).toBe("Local changes");
    expect(await readFile(managedFile, "utf8")).toBe("Worktree changes");
  } finally {
    await f.close();
  }
}, 60000);

test.each([false, true])(
  "reports optional cleanup failure without failing task archival, payload error=%s",
  async (payloadError) => {
    const f = await fixture();
    try {
      const coordinator = await f.launch();
      const interrupted = {
        ...f.paseo,
        workspaces: {
          ...f.paseo.workspaces,
          ref(input: Parameters<typeof f.paseo.workspaces.ref>[0]) {
            const workspace = f.paseo.workspaces.ref(input);
            return {
              ...workspace,
              archive: async () => {
                if (!payloadError) throw new Error("Connection lost");
                return {
                  requestId: "cleanup-failure",
                  workspaceId: workspace.id,
                  archivedAt: null,
                  error: "Connection lost",
                };
              },
            };
          },
        },
      };
      const input = {
        agentId: coordinator.agentId,
        archiveWorkers: true,
        archiveEmptyWorkspaces: true,
      };
      const result = await archiveTask(input, interrupted);
      expect(result.archivedAt).toEqual(expect.any(String));
      expect(result.workspaceCleanupErrors).toEqual([expect.stringContaining("Connection lost")]);
      expect(await f.paseo.workspaces.ref(coordinator.workspaceId).refresh()).not.toBeNull();
      const retried = await archiveTask(input, f.paseo);
      expect(retried.workspaceCleanupErrors).toEqual([]);
      expect(await f.paseo.workspaces.ref(coordinator.workspaceId).refresh()).toBeNull();
    } finally {
      await f.close();
    }
  },
  60000,
);

test("keeps the coordinator available after a partial worker archive failure, then retries", async () => {
  const f = await fixture();
  try {
    const coordinator = await f.launch();
    const workspace = f.paseo.workspaces.ref(coordinator.workspaceId);
    const workers = [];
    for (const title of ["Worker one", "Worker two"])
      workers.push(
        await workspace.agents.create({
          config: { provider: "codex/gpt-5.4-mini" },
          parent: coordinator.agentId,
          title,
        }),
      );
    let archiveCalls = 0;
    // Fault injection around the real SDK: fail one operation before it reaches the daemon.
    const interrupted = {
      ...f.paseo,
      agents: {
        ...f.paseo.agents,
        ref(input: Parameters<typeof f.paseo.agents.ref>[0]) {
          const agent = f.paseo.agents.ref(input);
          return {
            ...agent,
            archive: async () => {
              if (++archiveCalls === 2) throw new Error("Connection lost");
              return agent.archive();
            },
          };
        },
      },
    };
    const input = { agentId: coordinator.agentId, archiveWorkers: true };
    await expect(archiveTask(input, interrupted)).rejects.toThrow(
      "The coordinator is kept so you can retry",
    );
    expect((await f.paseo.agents.ref(coordinator.agentId).refresh())!.agent.archivedAt).toBeNull();
    const afterFailure = await Promise.all(
      workers.map(async (worker) => (await worker.refresh())!.agent),
    );
    expect(afterFailure.filter((agent) => agent.archivedAt)).toHaveLength(1);
    await archiveTask(input, interrupted);
    for (const id of [coordinator.agentId, ...workers.map((worker) => worker.id)])
      expect((await f.paseo.agents.ref(id).refresh())!.agent.archivedAt).toEqual(
        expect.any(String),
      );
  } finally {
    await f.close();
  }
}, 60000);

test.each([false, true])(
  "uploads and imports attachments, sends image input, and shares durable file paths with workers native=%s",
  async (native) => {
    const f = await fixture(native);
    try {
      const content = "Shared requirements: update both selected projects.\n";
      const hostPath = path.join(f.root, "requirements.md");
      await writeFile(hostPath, content);
      const text = attachmentSchema.parse(await f.rpc("attachments.import", { path: hostPath }));
      const png =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
      const image = attachmentSchema.parse(
        await f.rpc("attachments.upload", {
          fileName: "reference.png",
          mimeType: "image/png",
          data: png,
        }),
      );
      const attachments = [text, image];
      const files = await new AttachmentStore(f.attachmentDirectory).resolve(attachments);
      expect(await readFile(files[0]!.path, "utf8")).toBe(content);
      expect(await readFile(files[1]!.path)).toEqual(Buffer.from(png, "base64"));
      // A new store instance verifies files survive a plugin process reload.
      expect(
        (await new AttachmentStore(f.attachmentDirectory).resolve(attachments)).map(
          (file) => file.id,
        ),
      ).toEqual(attachments.map((file) => file.id));
      const coordinator = await f.launch({ ...f.request, attachments });
      expect(await f.launch({ ...f.request, attachments })).toEqual(coordinator);
      const prompt = await f.firstPrompt.promise;
      expect(prompt).toEqual(
        expect.arrayContaining([{ type: "image", data: png, mimeType: "image/png" }]),
      );
      const promptText =
        typeof prompt === "string"
          ? prompt
          : prompt
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("\n");
      for (const file of files) {
        expect(promptText).toContain(file.path);
        expect(promptText).toContain(file.fileName);
      }
      expect(promptText).toContain("EVERY project worker");
      expect(promptText).toContain("Include the complete attachment list");
      const agent = (await f.paseo.agents.ref(coordinator.agentId).refresh())!.agent;
      expect(JSON.parse(agent.labels[INPUT_LABEL]!).attachments).toEqual(attachments);
      expect(agent.labels[INPUT_LABEL]).not.toContain(png);
      const expectedFiles = files.map(({ bytes: _bytes, ...file }) => file);
      for (const project of f.request.projects) {
        const workspace = await f.paseo.workspaces.create({
          source: {
            kind: "directory",
            path: project.projectRootPath,
            projectId: project.projectId,
          },
        });
        // No attachment metadata in this prompt: the hook must still give the worker its files.
        const worker = await workspace.agents.create({
          parent: coordinator.agentId,
          config: { provider: "codex/gpt-5.4-mini" },
          title: "Attachment worker",
          prompt: "WORKER: inspect shared task context",
        });
        const tools = await f.tools(worker.id);
        expect(tools.names()).toContain(ATTACHMENTS_TOOL);
        expect((await tools.invoke(ATTACHMENTS_TOOL, {})).structuredContent).toEqual({
          attachments: expectedFiles,
        });
        expect(await readFile(expectedFiles[0]!.path, "utf8")).toBe(content);
      }
      const ordinary = await f.plainAgent();
      expect((await f.tools(ordinary.id)).names()).not.toContain(ATTACHMENTS_TOOL);
    } finally {
      await f.close();
    }
  },
  60000,
);

test("rejects host imports above the remaining budget without leaving a stored directory", async () => {
  const f = await fixture();
  try {
    await mkdir(f.attachmentDirectory, { recursive: true });
    const hostPath = path.join(f.root, "requirements.txt");
    await writeFile(hostPath, "Task requirements");
    const before = await readdir(f.attachmentDirectory);
    await expect(f.rpc("attachments.import", { path: hostPath, maxBytes: 1 })).rejects.toThrow(
      "remaining task attachment budget",
    );
    for (const maxBytes of [0, -1, 1.5, MAX_ATTACHMENT_BYTES + 1])
      await expect(f.rpc("attachments.import", { path: hostPath, maxBytes })).rejects.toThrow();
    expect(await readdir(f.attachmentDirectory)).toEqual(before);
    const imported = attachmentSchema.parse(
      await f.rpc("attachments.import", { path: hostPath, maxBytes: 17 }),
    );
    expect(imported.size).toBe(17);
    expect(await readdir(f.attachmentDirectory)).toEqual([imported.id]);
  } finally {
    await f.close();
  }
}, 60000);

test("rejects bad or missing attachments before starting an agent", async () => {
  const f = await fixture();
  try {
    await expect(
      f.rpc("attachments.upload", {
        fileName: "../escape.txt",
        mimeType: "text/plain",
        data: "eA==",
      }),
    ).rejects.toThrow();
    await expect(
      f.rpc("attachments.upload", { fileName: "bad.txt", mimeType: "text/plain", data: "!!!" }),
    ).rejects.toThrow("Invalid attachment encoding");
    await expect(f.rpc("attachments.import", { path: f.root })).rejects.toThrow("Choose a file");
    const large = path.join(f.root, "large.txt");
    await writeFile(large, Buffer.alloc(MAX_ATTACHMENT_BYTES + 1));
    await expect(f.rpc("attachments.import", { path: large })).rejects.toThrow("5 MiB");
    const file = attachmentSchema.parse(
      await f.rpc("attachments.upload", {
        fileName: "requirements.txt",
        mimeType: "text/plain",
        data: "eA==",
      }),
    );
    await expect(
      f.launch({ ...f.request, attachments: [{ ...file, fileName: "changed.txt" }] }),
    ).rejects.toThrow("Cannot read attachment");
    await expect(
      f.launch({
        ...f.request,
        attachments: [{ ...file, id: "2512d7de-1da4-4b5c-8477-d778a0ee84ce" }],
      }),
    ).rejects.toThrow("Cannot read attachment");
    expect((await f.paseo.agents.list()).entries).toEqual([]);
  } finally {
    await f.close();
  }
}, 60000);
