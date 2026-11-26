import { expect, it, vi } from "vitest";
import { catalogRpc, INPUT_LABEL, PLUGIN_LABEL, TASK_LABEL } from "../shared/contracts";
import { readCatalog } from "./catalog";

it("reads background and archived tasks and restores the latest valid coordinator across pages", async () => {
  const labels = { [TASK_LABEL]: "true", [PLUGIN_LABEL]: "true" };
  const entry = (day: number, label: string, parent?: string) => ({
    agent: {
      provider: "codex",
      createdAt: `2026-11-${day}T00:00:00.000Z`,
      labels: { ...labels, [INPUT_LABEL]: label, "paseo.parent-agent-id": parent },
    },
  });
  const older = JSON.stringify({ config: { model: "older", modeId: "default" } });
  const latest = { model: "latest", modeId: "auto", thinkingOptionId: "high" };
  const history = JSON.stringify({ config: { ...latest, featureValues: { extra: true } } });
  const list = vi
    .fn()
    .mockResolvedValueOnce({ entries: [entry(21, older)], pageInfo: { nextCursor: "next" } })
    .mockResolvedValueOnce({
      entries: [entry(22, history), entry(23, "invalid JSON"), entry(24, older, "parent")],
      pageInfo: { nextCursor: null },
    });
  const paseo = {
    projects: { list: async () => ({ projects: [] }) },
    providers: {
      waitForReady: async () => ({
        entries: [{ provider: "codex", enabled: true, status: "ready" }],
      }),
    },
    agents: { list },
  } as unknown as Parameters<typeof readCatalog>[0];

  const catalog = catalogRpc.output.parse(await readCatalog(paseo));

  const query = { includeBackground: true, filter: { labels, includeArchived: true } };
  expect(list.mock.calls).toEqual([
    [{ ...query, page: { limit: 200 } }],
    [{ ...query, page: { limit: 200, cursor: "next" } }],
  ]);
  expect(catalog.providers[0]?.lastUsedOptions).toEqual(latest);
});
