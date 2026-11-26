import { test, expect, type Page } from "@playwright/test";
import { settingsRpc } from "@getpaseo/plugin";
import { fixture, deferred } from "./fixture";
import {
  TASK_LABEL,
  INPUT_LABEL,
  MAX_ATTACHMENT_BYTES,
  launchSchema,
  type TaskLaunch,
} from "../shared/contracts";
import { agentDefaults, type ProviderDefaults } from "../shared/agent-defaults";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function configureBrowserHost(page: Page, serverId: string, endpoint: string) {
  return page.addInitScript(
    ({ serverId, endpoint }) => {
      const connection = { id: "direct:" + endpoint, type: "directTcp", endpoint };
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
}

for (const compact of [false, true]) {
  test("stock browser provider defaults, compact=" + compact, async ({ page }) => {
    const f = await fixture(false, undefined, { additionalProviders: true });
    try {
      await page.setViewportSize(
        compact ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      );
      const serverId = f.daemon.daemon.getServerId();
      const endpoint = "127.0.0.1:" + f.daemon.port;
      const origin = "http://" + endpoint;
      const settingsUrl =
        origin + "/settings/hosts/" + serverId + "/plugins/paseo-multi-project/agent-defaults";
      const taskUrl = origin + "/h/" + serverId + "/plugin/paseo-multi-project/surface/tasks";
      const settings = settingsRpc(agentDefaults.id);
      async function readDefaults() {
        const result = settings.read.output.parse(await f.rpc(settings.read.name, {}));
        if (result.status !== "ready") throw new Error(result.error);
        return { revision: result.revision, ...agentDefaults.schema.parse(result.values) };
      }
      async function writeDefaults(providers: ProviderDefaults) {
        const { revision } = await readDefaults();
        const result = settings.write.output.parse(
          await f.rpc(settings.write.name, { revision, values: { providers } }),
        );
        if (result.status !== "saved") throw new Error(result.error);
        return result.revision;
      }
      const launchRequests: TaskLaunch[] = [];
      const settingsReads = new Set<string>();
      let browserRevision: string | undefined;
      let lostReply: string | undefined;
      await page.routeWebSocket(/\/ws(?:\?|$)/, (route) => {
        const server = route.connectToServer();
        route.onMessage((data) => {
          if (data.toString().startsWith("{")) {
            const message = findRpc(JSON.parse(data.toString()));
            if (message?.type === "plugin.rpc.invoke.request") {
              if (message.method === settings.read.name) settingsReads.add(message.requestId);
              if (message.method === "tasks.launch") {
                launchRequests.push(launchSchema.parse(message.input));
                if (launchRequests.length === 1) lostReply = message.requestId;
              }
            }
          }
          server.send(data);
        });
        server.onMessage((data) => {
          if (data.toString().startsWith("{")) {
            const envelope = JSON.parse(data.toString());
            const message = findRpc(envelope);
            if (message?.type === "plugin.rpc.invoke.response") {
              const { requestId, output } = message.payload;
              if (settingsReads.delete(requestId)) {
                const read = settings.read.output.parse(output);
                if (read.status === "ready") browserRevision = read.revision;
              }
              if (requestId === lostReply) {
                expect(output).toHaveProperty("agentId");
                Object.assign(message, {
                  type: "rpc_error",
                  payload: { requestId, error: "Coordinator response lost" },
                });
                lostReply = undefined;
                route.send(JSON.stringify(envelope));
                return;
              }
            }
          }
          route.send(data);
        });
      });
      await configureBrowserHost(page, serverId, endpoint);
      await page.goto(settingsUrl);
      const provider = page.getByRole("combobox", { name: "Provider", exact: true });
      const model = page.getByRole("combobox", { name: "Model", exact: true });
      const mode = page.getByRole("combobox", { name: "Mode", exact: true });
      const thinking = page.getByRole("combobox", { name: "Thinking", exact: true });
      const feature = page.getByRole("switch", { name: "Test feature" });
      const save = page.getByRole("button", { name: "Save", exact: true });
      const remove = page.getByRole("button", { name: "Remove saved default" });
      await provider.selectOption("codex");
      await mode.selectOption("full-access");
      await thinking.selectOption("high");
      await expect(feature).not.toBeChecked();
      await feature.click();
      await save.click();
      await expect(remove).toBeVisible();
      await provider.selectOption("claude");
      await model.selectOption("sonnet");
      await save.click();
      await expect(remove).toBeVisible();
      const { providers: saved } = await readDefaults();
      expect(saved).toEqual({
        codex: {
          model: "gpt-5.4-mini",
          modeId: "full-access",
          thinkingOptionId: "high",
          featureValues: { test_feature: true },
        },
        claude: { model: "sonnet" },
      });

      await page.reload();
      await provider.selectOption("codex");
      await expect(mode).toHaveValue("full-access");
      await expect(thinking).toHaveValue("high");
      await expect(feature).toBeChecked();
      await mode.selectOption("auto");
      await page.getByRole("button", { name: "Discard changes" }).click();
      await expect(mode).toHaveValue("full-access");
      await mode.selectOption("auto");
      const updated = {
        codex: { ...saved.codex!, modeId: "bypassPermissions" },
        claude: { model: "haiku" },
      };
      await writeDefaults(updated);
      await save.click();
      await expect(page.getByRole("alert")).toContainText(/changed|conflict/i);
      await expect(mode).toHaveValue("auto");
      expect((await readDefaults()).providers).toEqual(updated);
      await page.getByRole("button", { name: "Retry save" }).click();
      await expect(remove).toBeVisible();
      expect((await readDefaults()).providers).toEqual({
        codex: { model: "gpt-5.4-mini", modeId: "auto", thinkingOptionId: "high" },
        claude: { model: "haiku" },
      });
      await writeDefaults(updated);

      await page.goto(taskUrl);
      await provider.selectOption("claude");
      await expect(model).toHaveValue("haiku");
      await provider.selectOption("codex");
      await page.getByTestId("multi-project-prompt").fill("Use configured agent options");
      const project = f.request.projects[0]!;
      await page.getByTestId("multi-project-target-" + project.projectId).click();
      await page.getByTestId("multi-project-options-toggle").click();
      await expect(model).toHaveValue("gpt-5.4-mini");
      await expect(mode).toHaveValue("bypassPermissions");
      await expect(thinking).toHaveValue("high");
      await expect(feature).toBeChecked();
      await feature.click();
      await page.getByRole("button", { name: "Reset agent options", exact: true }).click();
      await expect(feature).toBeChecked();
      await feature.click();
      const launch = page.getByTestId("multi-project-launch");
      await launch.click();
      await expect(page.getByTestId("multi-project-error")).toHaveText("Coordinator response lost");
      expect((await readDefaults()).providers).toEqual(updated);
      const newerRevision = await writeDefaults({
        ...updated,
        codex: { ...updated.codex!, modeId: "full-access" },
      });
      await expect.poll(() => browserRevision).toBe(newerRevision);
      await expect(mode).toHaveValue("bypassPermissions");
      await expect(feature).not.toBeChecked();
      await launch.click();
      await expect.poll(() => launchRequests.length).toBe(2);
      expect(launchRequests[1]).toEqual(launchRequests[0]);
      expect(launchRequests[1]!.config).toEqual({
        ...updated.codex,
        provider: "codex",
        featureValues: { test_feature: false },
      });
      const agents = (await f.paseo.agents.list()).entries.filter(
        ({ agent }) => agent.labels[TASK_LABEL] === "true",
      );
      expect(agents).toHaveLength(1);
      expect(JSON.parse(agents[0]!.agent.labels[INPUT_LABEL]!).config).toEqual(
        launchRequests[0]!.config,
      );
      const launched = f.launches.find((item) => item.context?.agentId === agents[0]!.agent.id);
      expect(launched?.config).toMatchObject({
        model: "gpt-5.4-mini",
        modeId: "bypassPermissions",
        thinkingOptionId: "high",
      });
      const options =
        Reflect.get(launched!.config, "providerOptions") ??
        Reflect.get(launched!.config, "featureValues");
      expect(options).toMatchObject({ test_feature: false });
      const prompt = await f.firstPrompt.promise;
      const promptText =
        typeof prompt === "string"
          ? prompt
          : prompt
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("\n");
      expect(promptText).toContain(
        "Worker create_agent configuration (JSON):\n\n" +
          JSON.stringify(
            {
              provider: "codex/gpt-5.4-mini",
              settings: {
                modeId: "bypassPermissions",
                thinkingOptionId: "high",
                features: { test_feature: false },
              },
              notifyOnFinish: true,
            },
            null,
            2,
          ),
      );

      await page.goto(settingsUrl);
      await provider.selectOption("codex");
      await remove.click();
      await expect(remove).toHaveCount(0);
      expect((await readDefaults()).providers).toEqual({ claude: updated.claude });
      await page.goto(taskUrl);
      await provider.selectOption("codex");
      await expect(model).toHaveValue("gpt-5.4-mini");
      await expect(page.getByTestId("multi-project-options-summary")).toHaveText(
        "Default mode · Default thinking",
      );
      await writeDefaults({ codex: { model: "removed-model" }, claude: saved.claude! });
      await page.reload();
      await provider.selectOption("codex");
      await page.getByTestId("multi-project-prompt").fill("Recover from stale agent options");
      await page.getByTestId("multi-project-target-" + project.projectId).click();
      await expect(page.getByRole("alert")).toContainText('Model "removed-model" is unavailable.');
      await expect(launch).toBeDisabled();
      await page.getByRole("button", { name: "Use standard agent options" }).click();
      await expect(model).toHaveValue("gpt-5.4-mini");
      await expect(launch).toBeEnabled();
      expect((await readDefaults()).providers.codex).toEqual({ model: "removed-model" });
    } finally {
      await f.close();
    }
  });
}

test("stock browser uses project context and chosen values for provider options", async ({
  page,
}) => {
  const f = await fixture(false, undefined, { projectOptions: true });
  try {
    const serverId = f.daemon.daemon.getServerId();
    const endpoint = `127.0.0.1:${f.daemon.port}`;
    const origin = `http://${endpoint}`;
    let catalogRequests = 0;
    let failCatalog = false;
    let failedCatalogRequest: string | undefined;
    await page.routeWebSocket(/\/ws(?:\?|$)/, (route) => {
      const server = route.connectToServer();
      route.onMessage((data) => {
        if (data.toString().startsWith("{")) {
          const message = findRpc(JSON.parse(data.toString()));
          if (message?.type === "plugin.rpc.invoke.request" && message.method === "catalog.read") {
            catalogRequests++;
            if (failCatalog) {
              failCatalog = false;
              failedCatalogRequest = message.requestId;
            }
          }
        }
        server.send(data);
      });
      server.onMessage((data) => {
        if (failedCatalogRequest && data.toString().startsWith("{")) {
          const envelope = JSON.parse(data.toString());
          const message = findRpc(envelope);
          if (
            message?.type === "plugin.rpc.invoke.response" &&
            message.payload.requestId === failedCatalogRequest
          ) {
            Object.assign(message, {
              type: "rpc_error",
              payload: { requestId: failedCatalogRequest, error: "Catalog request failed" },
            });
            failedCatalogRequest = undefined;
            route.send(JSON.stringify(envelope));
            return;
          }
        }
        route.send(data);
      });
    });
    const alpha = f.projects.find((project) => path.basename(project.projectRootPath) === "alpha")!;
    const beta = f.projects.find((project) => path.basename(project.projectRootPath) === "beta")!;
    const provider = page.getByRole("combobox", { name: "Provider", exact: true });
    const projectOption = page.getByRole("switch", { name: "Project option" });
    const dependentOption = page.getByRole("switch", { name: "Dependent option" });
    const commonOption = page.getByRole("switch", { name: "Test feature" });

    await configureBrowserHost(page, serverId, endpoint);
    await page.goto(
      `${origin}/settings/hosts/${serverId}/plugins/paseo-multi-project/agent-defaults`,
    );
    await provider.selectOption("codex");
    await expect(commonOption).toBeVisible();
    expect(catalogRequests).toBe(0);
    await expect(projectOption).toHaveCount(0);
    await page.getByRole("button", { name: "Choose project context" }).click();
    await page.getByRole("combobox", { name: "Project context" }).selectOption(alpha.projectId);
    await commonOption.click();
    await expect(dependentOption).toHaveCount(0);
    await projectOption.click();
    await expect(dependentOption).toBeVisible();
    await dependentOption.click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove saved default" })).toBeVisible();

    await page.goto(`${origin}/h/${serverId}/plugin/paseo-multi-project/surface/tasks`);
    await page.getByTestId("multi-project-prompt").fill("Use project-specific defaults");
    await provider.selectOption("codex");
    await page.getByTestId(`multi-project-target-${alpha.projectId}`).click();
    await page.getByTestId("multi-project-options-toggle").click();
    await expect(projectOption).toBeChecked();
    await expect(dependentOption).toBeChecked();
    const launch = page.getByTestId("multi-project-launch");
    await expect(launch).toBeEnabled();

    failCatalog = true;
    const refresh = page.getByTestId("multi-project-refresh");
    await refresh.click();
    await expect(page.getByRole("alert")).toHaveText("Catalog request failed");
    await expect(launch).toBeDisabled();
    await refresh.click();
    await expect(launch).toBeEnabled();

    await page.getByTestId(`multi-project-target-${alpha.projectId}`).click();
    await page.getByTestId(`multi-project-target-${beta.projectId}`).click();
    await expect(page.getByRole("alert")).toContainText(
      'Agent option "project_feature" is unavailable.',
    );
    await expect(launch).toBeDisabled();
    await page.getByRole("button", { name: "Remove unavailable options" }).click();
    await expect(commonOption).toBeChecked();
    await expect(launch).toBeEnabled();
    const { read } = settingsRpc(agentDefaults.id);
    expect(await f.rpc(read.name, {})).toMatchObject({
      values: {
        providers: {
          codex: {
            featureValues: { test_feature: true, project_feature: true, dependent_feature: true },
          },
        },
      },
    });
  } finally {
    await f.close();
  }
});

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
      await configureBrowserHost(page, serverId, endpoint);
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
      await configureBrowserHost(page, serverId, endpoint);
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
      const prompt = page.getByTestId("multi-project-prompt");
      await prompt.fill("Coordinate the test repositories");
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
      const selectionCount = page.getByTestId("multi-project-selection-count");
      const selectedOnly = page.getByTestId("multi-project-selected-only");
      const projectList = page.getByTestId("multi-project-projects");
      const clearSearch = page.getByRole("button", { name: "Clear search", exact: true });
      await clearSearch.click();
      await expect(search).toHaveValue("");
      await expect(selectionCount).toContainText("2 selected");
      await selectedOnly.click();
      await expect(projectList.getByRole("checkbox")).toHaveCount(2);

      const firstProject = f.request.projects[0];
      await search.fill(firstProject.projectDisplayName);
      await page.getByRole("button", { name: "Clear selection", exact: true }).click();
      await expect(selectionCount).toContainText("0 selected");
      await expect(selectedOnly).not.toBeChecked();
      await expect(search).toHaveValue(firstProject.projectDisplayName);
      await expect(
        page.getByTestId(`multi-project-target-${firstProject.projectId}`),
      ).not.toBeChecked();

      await clearSearch.click();
      for (const project of f.request.projects) {
        await page.getByTestId(`multi-project-target-${project.projectId}`).click();
      }
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
      const launch = page.getByTestId("multi-project-launch");
      await expect(launch).toBeEnabled();
      await page.getByRole("button", { name: "Clear description", exact: true }).click();
      await expect(prompt).toHaveValue("");
      await expect(selectionCount).toContainText("2 selected");
      await expect(
        page.getByRole("button", { name: "Remove attachment reference.png", exact: true }),
      ).toBeVisible();
      await expect(launch).toBeDisabled();
      await prompt.fill("Coordinate the test repositories");
      await expect(launch).toBeEnabled();
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
