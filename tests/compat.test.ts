import { expect, test } from "vitest";
import { fixture, TASK_LABEL, deferred } from "./fixture";
import { DISCOVERY_TOOL, tasksRpc } from "../shared/contracts";
import { readFileSync } from "node:fs";

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
