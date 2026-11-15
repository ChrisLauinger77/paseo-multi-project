// Published 0.15.4 test adapters are used only in integration tests, never in plugin runtime code.
import { createTestPaseoDaemon } from "../node_modules/@getpaseo/server/dist/server/server/test-utils/paseo-daemon.js";
import { createTestAgentClient } from "../node_modules/@getpaseo/server/dist/server/server/test-utils/fake-agent-client.js";
import type {
  AgentClient,
  AgentLaunchContext,
  AgentSessionConfig,
} from "../node_modules/@getpaseo/server/dist/server/server/agent/agent-sdk-types.js";
import { DaemonClient } from "../node_modules/@getpaseo/server/dist/server/server/test-utils/daemon-client.js";
import { createPaseoApi } from "@getpaseo/client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  launchRpc,
  launchSchema,
  TASK_LABEL,
  PLUGIN_LABEL,
  type TaskLaunch,
} from "../shared/contracts";
export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
export async function fixture(
  native = false,
  pluginDirectory = fileURLToPath(new URL("../", import.meta.url)),
) {
  const root = await mkdtemp(path.join(tmpdir(), "paseo-multi-project-test-"));
  const workers = deferred();
  const coordinator = deferred();
  const firstSteer = deferred();
  const releaseSteer = deferred();
  const bothDelivered = deferred();
  const launches: Array<{ config: AgentSessionConfig; context?: AgentLaunchContext }> = [];
  const notifications: string[] = [];
  function recordNotification(prompt: unknown) {
    const text = typeof prompt === "string" ? prompt : JSON.stringify(prompt);
    if (!text.includes("agent-notification")) return;
    notifications.push(text);
    firstSteer.resolve();
    if (
      new Set(
        Array.from(
          notifications.join("\n").matchAll(/source-agent-id="([^"]+)"/g),
          (match) => match[1],
        ),
      ).size === 2
    )
      bothDelivered.resolve();
  }
  const inner = createTestAgentClient("codex", {
    supportsMcpServers: true,
    onStartTurn: recordNotification,
    beforeTurnComplete: async (prompt) => {
      const text = JSON.stringify(prompt);
      if (text.includes("Coordinate this multi-project task")) await coordinator.promise;
      if (text.includes("WORKER")) await workers.promise;
      if (text.includes("agent-notification")) await releaseSteer.promise;
    },
    steerActiveTurn: async (prompt) => {
      recordNotification(prompt);
      return { status: "accepted" };
    },
  });
  const provider: AgentClient = {
    provider: inner.provider,
    capabilities: { ...inner.capabilities, supportsNativePaseoTools: native },
    async createSession(config, context, options) {
      launches.push({ config, context });
      return inner.createSession(config, context, options);
    },
    async resumeSession(handle, config, context, options) {
      return inner.resumeSession(handle, config, context, options);
    },
    isAvailable: () => inner.isAvailable(),
    fetchCatalog: (options, context) => inner.fetchCatalog(options, context),
    listFeatures: (config) => inner.listFeatures?.(config) ?? Promise.resolve([]),
  };
  let daemon: Awaited<ReturnType<typeof createTestPaseoDaemon>> | undefined;
  let driver: DaemonClient | undefined;
  const mcps: Client[] = [];
  try {
    daemon = await createTestPaseoDaemon({
      daemonVersion: "0.15.4",
      paseoHomeRoot: path.join(root, "home"),
      agentClients: { codex: provider },
      mcpEnabled: true,
      webUi: {
        enabled: true,
        distDir: fileURLToPath(
          new URL("../node_modules/@getpaseo/server/dist/server/web-ui", import.meta.url),
        ),
      },
      pluginsEnabled: true,
      plugins: {
        "paseo-multi-project": {
          source: "directory",
          path: pluginDirectory,
          enabled: true,
        },
      },
    });
    driver = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws`, appVersion: "0.15.4" });
    await driver.connect();
    const plugin = (await driver.listPlugins()).find((p) => p.id === "paseo-multi-project");
    if (plugin?.error) throw new Error(plugin.error);
    const paseo = createPaseoApi(driver);
    const directories: string[] = [];
    for (const name of ["alpha", "beta", "notes"]) {
      const dir = path.join(root, name);
      await mkdir(dir);
      directories.push(dir);
      if (name !== "notes") {
        execFileSync("git", ["init", "-b", "main", dir]);
        execFileSync("git", [
          "-C",
          dir,
          "-c",
          "user.name=Test",
          "-c",
          "user.email=test@example.invalid",
          "commit",
          "--allow-empty",
          "-m",
          "Initial",
        ]);
      }
      await driver.addProject(dir);
    }
    const current = await paseo.projects.list();
    const projects = current.projects.map((p) => ({
      projectId: p.projectId,
      projectDisplayName: p.projectDisplayName,
      projectCustomName: p.projectCustomName,
      projectRootPath: p.projectRootPath,
      projectKind: p.projectKind,
    }));
    const request: TaskLaunch = {
      id: "30beb5e0-a914-400a-9396-ec36defca468",
      task: "Update the selected projects",
      projects: projects.filter((p) => p.projectKind === "git"),
      isolation: "local",
      config: { provider: "codex", model: "gpt-5.4-mini", modeId: "bypassPermissions" },
    };
    const rpc = async (method: string, input: unknown) =>
      driver!.invokePluginRpc("paseo-multi-project", method, input);
    async function launch(input: TaskLaunch = request) {
      return launchRpc.output.parse(await rpc(launchRpc.name, launchSchema.parse(input)));
    }
    async function tools(agentId: string) {
      if (native) {
        const catalog = launches.find((l) => l.context?.agentId === agentId)?.context?.paseoTools;
        if (!catalog) throw Error("Missing native catalog");
        return {
          names: () => [...catalog.tools.keys()],
          invoke: (name: string, args: Record<string, unknown>) => catalog.executeTool(name, args),
        };
      }
      const mcp = new Client({ name: "multi-project-test", version: "1" });
      mcps.push(mcp);
      await mcp.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${daemon!.port}/mcp/agents?callerAgentId=${agentId}`),
        ),
      );
      const names = (await mcp.listTools()).tools.map((t) => t.name);
      return {
        names: () => names,
        invoke: (name: string, args: Record<string, unknown>) =>
          mcp.callTool({ name, arguments: args }),
      };
    }
    return {
      root,
      daemon,
      driver,
      paseo,
      projects,
      request,
      launch,
      rpc,
      tools,
      launches,
      notifications,
      workers,
      coordinator,
      firstSteer,
      releaseSteer,
      bothDelivered,
      async plainAgent() {
        return paseo.agents.create({
          config: { provider: "codex/gpt-5.4-mini", modeId: "bypassPermissions" },
          cwd: directories[0]!,
        });
      },
      async close() {
        workers.resolve();
        coordinator.resolve();
        releaseSteer.resolve();
        await Promise.all(mcps.map((m) => m.close()));
        await paseo.dispose();
        await driver!.close();
        await daemon!.close();
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    workers.resolve();
    coordinator.resolve();
    releaseSteer.resolve();
    await driver?.close();
    await daemon?.close();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
export { TASK_LABEL, PLUGIN_LABEL };
