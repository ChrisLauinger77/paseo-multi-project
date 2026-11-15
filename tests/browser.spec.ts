import { test, expect } from "@playwright/test";
import { fixture, deferred } from "./fixture";
import { TASK_LABEL, INPUT_LABEL, MAX_ATTACHMENT_BYTES } from "../shared/contracts";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

for (const observationFails of [false, true]) {
  test(`reads tasks after observation settles, observation failure=${observationFails}`, async ({
    page,
  }) => {
    const f = await fixture();
    try {
      const serverId = f.daemon.daemon.getServerId();
      const endpoint = `127.0.0.1:${f.daemon.port}`;
      let observationRequestId: string | undefined;
      let releaseObservation: (() => void) | undefined;
      let observationSettled = false;
      let taskReads = 0;
      const readsBeforeObservation: string[] = [];
      await page.routeWebSocket(/\/ws(?:\?|$)/, (route) => {
        const server = route.connectToServer();
        route.onMessage((data) => {
          const text = data.toString();
          if (text.startsWith("{")) {
            const message = findRpc(JSON.parse(text));
            if (message?.type === "plugin.rpc.invoke.request") {
              if (message.method === "tasks.list") {
                taskReads++;
                if (!observationSettled) readsBeforeObservation.push(message.requestId);
              }
            }
            if (
              message?.type === "fetch_agents_request" &&
              message.subscribe &&
              !message.filter &&
              !message.page &&
              !observationRequestId
            ) {
              observationRequestId = message.requestId;
              releaseObservation = () => server.send(data);
              return;
            }
          }
          server.send(data);
        });
        server.onMessage((data) => {
          const text = data.toString();
          if (text.startsWith("{")) {
            const envelope = JSON.parse(text);
            const message = findRpc(envelope);
            // Only the initial snapshot can reveal the task created during the gap.
            if (message?.type === "agent_update") return;
            if (
              message?.type === "fetch_agents_response" &&
              message.payload.requestId === observationRequestId
            ) {
              observationSettled = true;
              if (observationFails)
                Object.assign(message, {
                  type: "rpc_error",
                  payload: {
                    requestId: observationRequestId,
                    error: "Test observation unavailable",
                  },
                });
              route.send(JSON.stringify(envelope));
              return;
            }
          }
          route.send(data);
        });
      });
      await page.addInitScript(
        ({ serverId, endpoint }) => {
          const connection = { id: `direct:${endpoint}`, type: "directTcp", endpoint };
          localStorage.setItem(
            "@paseo:daemon-registry",
            JSON.stringify([
              {
                serverId,
                label: "Plugin test",
                connections: [connection],
                preferredConnectionId: connection.id,
                createdAt: new Date(0).toISOString(),
                updatedAt: new Date(0).toISOString(),
              },
            ]),
          );
          localStorage.setItem(
            "@paseo:onboarding",
            JSON.stringify({ completedAt: new Date(0).toISOString() }),
          );
        },
        { serverId, endpoint },
      );
      await page.goto(`http://${endpoint}/h/${serverId}/plugin/paseo-multi-project/surface/tasks`);
      await expect(page.getByTestId("multi-project-screen")).toBeVisible();
      await expect.poll(() => Boolean(releaseObservation)).toBe(true);
      expect(taskReads).toBe(0);
      const coordinator = await f.launch({ ...f.request, task: "Task created before observation" });
      releaseObservation!();
      await expect(page.getByTestId(`multi-project-task-${coordinator.agentId}`)).toBeVisible();
      expect(readsBeforeObservation).toEqual([]);
      expect(taskReads).toBe(1);
      if (observationFails)
        await expect(page.getByRole("alert")).toContainText("Test observation unavailable");
    } finally {
      await f.close();
    }
  });
}

for (const compact of [false, true]) {
  test(`stock browser ${compact ? "compact" : "desktop"}: compact form, refresh, launch and archive recovery`, async ({
    page,
  }) => {
    const f = await fixture();
    try {
      await page.setViewportSize(
        compact ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      );
      for (let index = 0; index < 16; index++) {
        const directory = path.join(f.root, `extra-project-${index}`);
        await mkdir(directory);
        await f.driver.addProject(directory);
      }
      const serverId = f.daemon.daemon.getServerId();
      const endpoint = `127.0.0.1:${f.daemon.port}`;
      const featureRequests: unknown[] = [];
      let refreshWaiter: { requestId?: string; done(): void } | undefined;
      let archiveFailureAgentId: string | undefined;
      let injectCleanupWarning = false;
      let cleanupRequestId: string | undefined;
      await page.routeWebSocket(/\/ws(?:\?|$)/, (route) => {
        const server = route.connectToServer();
        route.onMessage((data) => {
          const text = data.toString();
          if (text.startsWith("{")) {
            const envelope = JSON.parse(text);
            const message = findRpc(envelope);
            if (message?.type === "plugin.rpc.invoke.request") {
              if (message.method === "features.read") featureRequests.push(message.input);
              if (message.method === "catalog.read" && refreshWaiter)
                refreshWaiter.requestId = message.requestId;
              if (message.method === "tasks.archive" && archiveFailureAgentId) {
                // Send one stale target through the real server's validation, then allow retry.
                message.input.agentId = archiveFailureAgentId;
                archiveFailureAgentId = undefined;
                server.send(JSON.stringify(envelope));
                return;
              }
              if (message.method === "tasks.archive" && injectCleanupWarning) {
                cleanupRequestId = message.requestId;
                injectCleanupWarning = false;
              }
            }
          }
          server.send(data);
        });
        server.onMessage((data) => {
          let response = data;
          if (cleanupRequestId && data.toString().startsWith("{")) {
            const envelope = JSON.parse(data.toString());
            const message = findRpc(envelope);
            if (
              message?.type === "plugin.rpc.invoke.response" &&
              message.payload.requestId === cleanupRequestId
            ) {
              // Preserve the real archive result and simulate a lost cleanup response.
              message.payload.output = {
                ...(message.payload.output as Record<string, unknown>),
                workspaceCleanupErrors: ["Workspace cleanup response lost."],
              };
              cleanupRequestId = undefined;
              response = JSON.stringify(envelope);
            }
          }
          route.send(response);
          if (refreshWaiter?.requestId && data.toString().includes(refreshWaiter.requestId)) {
            refreshWaiter.done();
            refreshWaiter = undefined;
          }
        });
      });
      await page.addInitScript(
        ({ serverId, endpoint }) => {
          const connection = { id: `direct:${endpoint}`, type: "directTcp", endpoint };
          localStorage.setItem(
            "@paseo:daemon-registry",
            JSON.stringify([
              {
                serverId,
                label: "Plugin test",
                connections: [connection],
                preferredConnectionId: connection.id,
                createdAt: new Date(0).toISOString(),
                updatedAt: new Date(0).toISOString(),
              },
            ]),
          );
          localStorage.setItem(
            "@paseo:onboarding",
            JSON.stringify({ completedAt: new Date(0).toISOString() }),
          );
        },
        { serverId, endpoint },
      );
      const url = `http://${endpoint}/h/${serverId}/plugin/paseo-multi-project/surface/tasks`;
      await page.goto(url);
      await expect(page.getByTestId("multi-project-screen")).toBeVisible();
      const refreshed = deferred();
      refreshWaiter = { done: () => refreshed.resolve() };
      await page.getByTestId("multi-project-refresh").click();
      let refreshTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          refreshed.promise,
          new Promise<never>((_, reject) => {
            refreshTimer = setTimeout(
              () => reject(new Error("Refresh catalog response not observed")),
              5000,
            );
          }),
        ]);
      } finally {
        clearTimeout(refreshTimer);
      }
      expect(featureRequests).toEqual([]);
      await expect(page.getByRole("alert")).toHaveCount(0);
      const picker = await page.getByTestId("multi-project-projects").boundingBox();
      expect(picker!.height).toBeLessThanOrEqual(compact ? 201 : 241);
      // Isolation can be chosen while the form is still empty.
      await page.getByRole("combobox", { name: "Isolation", exact: true }).selectOption("worktree");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.getByTestId("multi-project-prompt").fill("Coordinate the test repositories");
      const requirements = {
        name: "requirements.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("Shared requirements for every worker."),
      };
      const png = {
        name: "reference.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
          "base64",
        ),
      };
      const chooserPromise = page.waitForEvent("filechooser");
      await page.getByTestId("multi-project-attach-files").click();
      await (await chooserPromise).setFiles(requirements);
      await expect(
        page.getByRole("button", { name: "Remove attachment requirements.md", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Remove attachment requirements.md", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Remove attachment requirements.md", exact: true }),
      ).toHaveCount(0);
      await page.getByLabel("Attach files", { exact: true }).setInputFiles([requirements, png]);
      await expect(
        page.getByRole("button", { name: "Remove attachment reference.png", exact: true }),
      ).toBeVisible();
      const transfer = await page.evaluateHandle(() => {
        const data = new DataTransfer();
        data.items.add(
          new File(["Shared extra context."], "shared-context.txt", { type: "text/plain" }),
        );
        return data;
      });
      if (compact)
        await page.getByTestId("multi-project-prompt").evaluate((element, clipboardData) => {
          element.dispatchEvent(
            new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
          );
        }, transfer);
      else
        await page
          .getByTestId("multi-project-screen")
          .dispatchEvent("drop", { dataTransfer: transfer });
      await transfer.dispose();
      await expect(
        page.getByRole("button", { name: "Remove attachment shared-context.txt", exact: true }),
      ).toBeVisible();
      const search = page.getByTestId("multi-project-project-search");
      await search.fill("does-not-match");
      await expect(page.getByText("No matching projects.")).toBeVisible();
      for (const project of f.request.projects) {
        await search.fill(project.projectDisplayName);
        await page.getByTestId(`multi-project-target-${project.projectId}`).click();
      }
      await search.fill("");
      await expect(page.getByTestId("multi-project-selection-count")).toContainText("2 selected");
      await page.getByTestId("multi-project-selected-only").click();
      await expect(page.getByTestId("multi-project-projects").getByRole("checkbox")).toHaveCount(2);
      await page.getByTestId("multi-project-selected-only").click();
      await expect(page.getByRole("combobox", { name: "Isolation", exact: true })).toHaveValue(
        "worktree",
      );
      const notes = f.projects.find((p) => p.projectKind !== "git")!;
      await search.fill(notes.projectDisplayName);
      await page.getByTestId(`multi-project-target-${notes.projectId}`).click();
      await expect(page.getByRole("combobox", { name: "Isolation", exact: true })).toHaveValue(
        "local",
      );
      await expect(page.getByRole("combobox", { name: "Isolation", exact: true })).toBeDisabled();
      await expect(
        page.getByText("Worktree requires every selected project to be a Git repository."),
      ).toBeVisible();
      await page.getByTestId(`multi-project-target-${notes.projectId}`).click();
      await search.fill("");
      await page.getByRole("combobox", { name: "Provider", exact: true }).selectOption("codex");
      await expect(page.getByRole("combobox", { name: "Model", exact: true })).toHaveValue(
        "gpt-5.4-mini",
      );
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByTestId("multi-project-agent-options")).toHaveCount(0);
      await page.getByTestId("multi-project-options-toggle").click();
      await expect(page.getByTestId("multi-project-agent-options")).toBeVisible();
      await page.getByRole("combobox", { name: "Mode", exact: true }).selectOption("auto");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.getByTestId("multi-project-options-toggle").click();
      await expect(page.getByTestId("multi-project-options-summary")).toContainText("Auto");
      await expect(page.getByTestId("multi-project-launch")).toBeEnabled();
      await page.getByLabel("Attach files", { exact: true }).setInputFiles({
        name: "too-large.txt",
        mimeType: "text/plain",
        buffer: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1),
      });
      await expect(page.getByTestId("multi-project-attachment-error")).toContainText("5 MiB");
      await expect(page.getByTestId("multi-project-launch")).toBeDisabled();
      await page.getByRole("button", { name: "Dismiss attachment error", exact: true }).click();
      await expect(page.getByTestId("multi-project-launch")).toBeEnabled();
      await page.getByTestId("multi-project-attach-host").click();
      await page.getByTestId("multi-project-host-file-path").fill(path.join(f.root, "missing.txt"));
      await page.getByTestId("multi-project-host-file-add").click();
      await expect(page.getByTestId("multi-project-attachment-error")).toBeVisible();
      await expect(page.getByTestId("multi-project-launch")).toBeDisabled();
      const hostFile = path.join(f.root, "host-notes.md");
      await writeFile(hostFile, "Host file context.");
      await page.getByTestId("multi-project-host-file-path").fill(hostFile);
      await page.getByTestId("multi-project-host-file-add").click();
      await expect(
        page.getByRole("button", { name: "Remove attachment host-notes.md", exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("multi-project-attachment-error")).toHaveCount(0);
      await expect(page.getByTestId("multi-project-launch")).toBeEnabled();
      await mkdir("artifacts", { recursive: true });
      await page.screenshot({
        path: `artifacts/${compact ? "compact" : "desktop"}-form.png`,
        fullPage: true,
      });
      await f.driver.patchDaemonConfig({ mcp: { injectIntoAgents: false } });
      await page.getByTestId("multi-project-launch").click();
      await expect(page.getByTestId("multi-project-error")).toContainText("Enable Paseo tools");
      expect((await f.paseo.agents.list()).entries).toEqual([]);
      await f.driver.patchDaemonConfig({ mcp: { injectIntoAgents: true } });
      await page.getByTestId("multi-project-launch").click();
      await expect(page).not.toHaveURL(url);
      const agents = (await f.paseo.agents.list()).entries.filter(
        (e) => e.agent.labels[TASK_LABEL] === "true",
      );
      expect(agents).toHaveLength(1);
      const coordinator = agents[0]!.agent;
      expect(coordinator.currentModeId).toBe("auto");
      expect(
        JSON.parse(coordinator.labels[INPUT_LABEL]!).attachments.map(
          (file: { fileName: string }) => file.fileName,
        ),
      ).toEqual(["requirements.md", "reference.png", "shared-context.txt", "host-notes.md"]);
      const workers = [];
      for (const project of f.request.projects) {
        const workspace = await f.paseo.workspaces.create({
          source: {
            kind: "directory",
            path: project.projectRootPath,
            projectId: project.projectId,
          },
        });
        workers.push(
          await workspace.agents.create({
            config: { provider: "codex/gpt-5.4-mini" },
            parent: coordinator.id,
            title: `${project.projectDisplayName} worker`,
          }),
        );
      }
      const unrelated = await f.plainAgent();
      await page.goto(url);
      const task = page.getByTestId(`multi-project-task-${coordinator.id}`);
      await expect(task).toContainText("2 workers");
      await page.screenshot({
        path: `artifacts/${compact ? "compact" : "desktop"}.png`,
        fullPage: true,
      });
      await page.getByTestId(`multi-project-archive-${coordinator.id}`).click();
      await expect(page.getByText("Archive task and workers", { exact: true })).toBeVisible();
      const cleanup = page.getByTestId("multi-project-archive-workspaces").getByRole("switch");
      await expect(cleanup).not.toBeChecked();
      await cleanup.click();
      await expect(cleanup).toBeChecked();
      await page.getByTestId("multi-project-archive-cancel").click();
      await expect(task).toBeVisible();
      expect((await f.paseo.agents.ref(coordinator.id).refresh())!.agent.archivedAt).toBeNull();
      await page.getByTestId(`multi-project-archive-${coordinator.id}`).click();
      await expect(cleanup).not.toBeChecked();
      await cleanup.click();
      archiveFailureAgentId = unrelated.id;
      await page.getByTestId("multi-project-archive-confirm").click();
      await expect(page.getByTestId("multi-project-archive-error")).toContainText(
        "not a multi-project task coordinator",
      );
      await expect(page.getByTestId("multi-project-archive-confirm")).toBeEnabled();
      await expect(cleanup).toBeChecked();
      await page.screenshot({
        path: `artifacts/${compact ? "compact" : "desktop"}-archive.png`,
        fullPage: true,
      });
      injectCleanupWarning = compact;
      await page
        .getByTestId(compact ? "multi-project-archive-keep" : "multi-project-archive-confirm")
        .click();
      await expect(task).toHaveCount(0);
      await expect(page.getByText("Your multi-project tasks will appear here.")).toBeVisible();
      for (const worker of workers) {
        const snapshot = (await worker.refresh())!.agent;
        expect(snapshot.archivedAt).toEqual(compact ? null : expect.any(String));
        if (compact) expect(snapshot.labels["paseo.parent-agent-id"]).toBeUndefined();
      }
      expect((await unrelated.refresh())!.agent.archivedAt).toBeNull();
      const cleanupError = page.getByTestId("multi-project-workspace-cleanup-error");
      if (compact) {
        await expect(cleanupError).toContainText("Task archived.");
        await expect(cleanupError).toContainText("Workspace cleanup response lost.");
        await cleanupError.getByRole("button", { name: "Dismiss" }).click();
      }
      await expect(cleanupError).toHaveCount(0);
      await expect
        .poll(async () => await f.paseo.workspaces.ref(coordinator.workspaceId!).refresh())
        .toBeNull();
      for (const worker of workers) {
        const workspaceId = (await worker.refresh())!.agent.workspaceId!;
        const workspace = await f.paseo.workspaces.ref(workspaceId).refresh();
        if (compact) expect(workspace).not.toBeNull();
        else expect(workspace).toBeNull();
      }
    } finally {
      await f.close();
    }
  });
}

type BrowserRpc =
  | {
      type: "plugin.rpc.invoke.request";
      method: string;
      requestId: string;
      input: { agentId?: string };
    }
  | { type: "plugin.rpc.invoke.response"; payload: { requestId: string; output: unknown } }
  | {
      type: "fetch_agents_request";
      requestId: string;
      subscribe?: object;
      filter?: object;
      page?: object;
    }
  | { type: "fetch_agents_response"; payload: { requestId: string } }
  | { type: "agent_update" };

function findRpc(value: unknown): BrowserRpc | undefined {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (
    [
      "plugin.rpc.invoke.request",
      "plugin.rpc.invoke.response",
      "fetch_agents_request",
      "fetch_agents_response",
      "agent_update",
    ].includes(record.type as string)
  )
    return value as BrowserRpc;
  for (const child of Object.values(record)) {
    const rpc = findRpc(child);
    if (rpc) return rpc;
  }
}
