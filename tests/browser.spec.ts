import { test, expect } from "@playwright/test";
import { fixture } from "./fixture";
import { TASK_LABEL } from "../shared/contracts";
import { mkdir } from "node:fs/promises";

for (const compact of [false, true]) {
  test(`stock browser ${compact ? "compact" : "desktop"}: selection, failure recovery and coordinator launch`, async ({
    page,
  }) => {
    const f = await fixture();
    try {
      await page.setViewportSize(
        compact ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      );
      const serverId = f.daemon.daemon.getServerId();
      const endpoint = `127.0.0.1:${f.daemon.port}`;
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
      await page.getByTestId("multi-project-prompt").fill("Coordinate the test repositories");
      for (const p of f.request.projects)
        await page.getByTestId(`multi-project-target-${p.projectId}`).click();
      await page.getByText("Local", { exact: true }).click();
      await page.getByText("Worktree", { exact: true }).click();
      const notes = f.projects.find((p) => p.projectKind !== "git")!;
      await page.getByTestId(`multi-project-target-${notes.projectId}`).click();
      await expect(page.getByText("Isolation: Local", { exact: true })).toBeVisible();
      await page.getByTestId(`multi-project-target-${notes.projectId}`).click();
      await page.getByText("Select a provider", { exact: true }).click();
      await page.getByText("Codex", { exact: true }).click();
      await expect(page.getByTestId("multi-project-launch")).toBeEnabled();
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
      await page.goto(url);
      await expect(page.getByTestId(`multi-project-task-${agents[0]!.agent.id}`)).toBeVisible();
      await mkdir("artifacts", { recursive: true });
      await page.screenshot({
        path: `artifacts/${compact ? "compact" : "desktop"}.png`,
        fullPage: true,
      });
    } finally {
      await f.close();
    }
  });
}
