// Explicit opt-in smoke: uses the installed Codex provider and its normal credentials.
import { expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { createPaseoApi } from "@getpaseo/client";
import { createTestPaseoDaemon } from "../node_modules/@getpaseo/server/dist/server/server/test-utils/paseo-daemon.js";
import { CodexAppServerAgentClient } from "../node_modules/@getpaseo/server/dist/server/server/agent/providers/codex-app-server-agent.js";
import { DaemonClient } from "../node_modules/@getpaseo/server/dist/server/server/test-utils/daemon-client.js";
import { launchRpc, type TaskLaunch } from "../shared/contracts";

test("real Codex coordinates two temporary projects on stock Paseo", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "paseo-plugin-real-"));
  const logger = pino({ level: "warn" });
  const daemon = await createTestPaseoDaemon({
    daemonVersion: "0.15.4",
    paseoHomeRoot: path.join(root, "home"),
    agentClients: { codex: new CodexAppServerAgentClient(logger) },
    mcpEnabled: true,
    pluginsEnabled: true,
    plugins: {
      "paseo-multi-project": {
        source: "directory",
        path: fileURLToPath(new URL("../", import.meta.url)),
        enabled: true,
      },
    },
  });
  const driver = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.15.4",
  });
  let remove = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await driver.connect();
    const paseo = createPaseoApi(driver);
    for (const name of ["alpha", "beta"]) {
      const dir = path.join(root, name);
      await mkdir(dir);
      await writeFile(path.join(dir, "README.md"), `Project: ${name}\n`);
      execFileSync("git", ["init", "-b", "main", dir]);
      execFileSync("git", [
        "-C",
        dir,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "add",
        "README.md",
      ]);
      execFileSync("git", [
        "-C",
        dir,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-m",
        "Initial",
      ]);
      await driver.addProject(dir);
    }
    const snapshot = await paseo.providers.waitForReady({ cwd: root });
    const provider = snapshot.entries.find((p) => p.provider === "codex");
    const model =
      provider?.models?.find((m) => m.id === "gpt-5.4-mini") ||
      provider?.models?.find((m) => m.isDefault) ||
      provider?.models?.[0];
    if (!model) throw Error(provider?.error || "Codex returned no models");
    console.info(`Real provider smoke: using ${model.id} on isolated port ${daemon.port}`);
    const input: TaskLaunch = {
      id: "30beb5e0-a914-400a-9396-ec36defca468",
      task: "For each selected project, read README.md and return its Project name. Do not modify files, install anything, access the network, or create commits. Each worker's final response must contain PROJECT_CHECK and its project name. After both workers finish, the coordinator must return COORDINATOR_RESULT with both project names and confirm there were no changes.",
      projects: (await paseo.projects.list()).projects,
      isolation: "local",
      config: {
        provider: "codex",
        model: model.id,
        modeId: process.env.PASEO_SMOKE_MODE || "auto",
      },
    };
    let coordinatorId: string | undefined;
    const seenRunning = new Set<string>();
    let checking = Promise.resolve();
    const completed = new Promise<void>((resolve, reject) => {
      timer = setTimeout(
        () => reject(Error("Real coordinator did not finish both projects within 3 minutes")),
        180000,
      );
      remove = daemon.daemon.agentManager.subscribe((event) => {
        if (event.type !== "agent_state") return;
        if (event.agent.lifecycle === "running") seenRunning.add(event.agent.id);
        checking = checking
          .then(async () => {
            const agents = daemon.daemon.agentManager.listAgents();
            const parent = agents.find((a) => a.labels["multi-project.plugin"] === "true");
            if (!parent) return;
            coordinatorId = parent.id;
            const children = agents.filter((a) => a.labels["paseo.parent-agent-id"] === parent.id);
            const permission = agents.find((a) => a.pendingPermissions.size > 0);
            if (permission)
              throw Error(
                `Permission required for ${permission.config.title || permission.id}; no permission was granted by this smoke`,
              );
            if (parent.lifecycle === "error" || children.some((a) => a.lifecycle === "error"))
              throw Error("A real smoke agent failed");
            if (
              children.length !== 2 ||
              parent.lifecycle !== "idle" ||
              !children.every((a) => seenRunning.has(a.id) && a.lifecycle === "idle")
            )
              return;
            const final = await daemon.daemon.agentManager.getLastAssistantMessage(parent.id);
            if (!final?.includes("COORDINATOR_RESULT")) return;
            for (const child of children)
              expect(await daemon.daemon.agentManager.getLastAssistantMessage(child.id)).toContain(
                "PROJECT_CHECK",
              );
            resolve();
          })
          .catch(reject);
      });
    });
    const launching = driver
      .invokePluginRpc("paseo-multi-project", launchRpc.name, input)
      .then((value) => {
        const launched = launchRpc.output.parse(value);
        if ("retryWithNewIdentity" in launched) throw new Error(launched.error);
        console.info(`Real provider smoke: coordinator ${launched.agentId}`);
        return launched;
      });
    await Promise.all([launching, completed]);
    const text = await daemon.daemon.agentManager.getLastAssistantMessage(coordinatorId!);
    expect(text).toContain("COORDINATOR_RESULT");
    expect(text).toContain("alpha");
    expect(text).toContain("beta");
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      "artifacts/real-smoke.json",
      JSON.stringify(
        { provider: "codex", model: model.id, mode: input.config.modeId, final: text, workers: 2 },
        null,
        2,
      ) + "\n",
    );
    for (const name of ["alpha", "beta"])
      expect(
        execFileSync("git", ["-C", path.join(root, name), "status", "--porcelain"], {
          encoding: "utf8",
        }),
      ).toBe("");
    console.info(
      "Real provider smoke passed: two workers, final consolidation, clean repositories",
    );
    await paseo.dispose();
  } finally {
    clearTimeout(timer);
    remove();
    await driver.close();
    await daemon.close();
    await rm(root, { recursive: true, force: true });
  }
});
