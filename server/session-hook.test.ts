import { afterEach, expect, it, vi } from "vitest";
import type { PluginSessionOpenRequest } from "@getpaseo/plugin/server";
import { ATTACHMENTS_TOOL, DISCOVERY_TOOL, INPUT_LABEL, PLUGIN_LABEL } from "../shared/contracts";
import { AttachmentStore } from "./attachments";
import { sessionOpenHook } from "./session-hook";

const file = {
  id: "2512d7de-1da4-4b5c-8477-d778a0ee84ce",
  fileName: "reference.txt",
  mimeType: "text/plain",
  size: 1,
};
const labels = { [PLUGIN_LABEL]: "true", [INPUT_LABEL]: JSON.stringify({ attachments: [file] }) };
function request(labels: Record<string, string>): PluginSessionOpenRequest {
  return {
    agentId: "agent-id",
    workspaceId: null,
    provider: "codex",
    cwd: "/tmp",
    reason: "resume",
    purpose: "interactive",
    title: null,
    labels,
    tools: [],
    env: {},
    mcpServers: {},
  };
}
const hook = sessionOpenHook(new AttachmentStore("/tmp/paseo-session-hook-unused"));
const refresh = vi.fn(async (): Promise<{ agent: { labels: Record<string, string> } }> => ({
  agent: { labels },
}));
const paseo = { agents: { ref: vi.fn(() => ({ refresh })) } };
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("gives a valid coordinator discovery and attachment tools", async () => {
  const result = await hook({ request: request(labels) }, { paseo });
  expect(result?.tools.map((tool) => tool.name)).toEqual([DISCOVERY_TOOL, ATTACHMENTS_TOOL]);
  expect(paseo.agents.ref).not.toHaveBeenCalled();
});
it("gives a valid worker only its parent's attachment tool", async () => {
  const result = await hook({ request: request({ "paseo.parent-agent-id": "parent" }) }, { paseo });
  expect(result?.tools.map((tool) => tool.name)).toEqual([ATTACHMENTS_TOOL]);
  expect(paseo.agents.ref).toHaveBeenCalledWith("parent");
});
it.each([
  [undefined, "missing input label"],
  ["private task text", "malformed input JSON"],
  [
    JSON.stringify({ attachments: [{ ...file, size: -1 }], task: "private task text" }),
    "invalid attachments schema",
  ],
])("keeps discovery when input is invalid: %s", async (input, reason) => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = await hook(
    {
      request: request({
        [PLUGIN_LABEL]: "true",
        ...(input === undefined ? {} : { [INPUT_LABEL]: input }),
      }),
    },
    { paseo },
  );
  expect(result?.tools.map((tool) => tool.name)).toEqual([DISCOVERY_TOOL]);
  expect(warning).toHaveBeenCalledExactlyOnceWith(`Multi-project session agent-id: ${reason}`);
});
it("ignores launch schema limits and unknown fields", async () => {
  const result = await hook(
    {
      request: request({
        ...labels,
        [INPUT_LABEL]: JSON.stringify({
          attachments: [file],
          task: "x".repeat(100001),
          futureField: true,
        }),
      }),
    },
    { paseo },
  );
  expect(result?.tools.map((tool) => tool.name)).toEqual([DISCOVERY_TOOL, ATTACHMENTS_TOOL]);
});
it("continues without tools when parent refresh throws", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  refresh.mockRejectedValueOnce(new Error("private data"));
  expect(
    await hook({ request: request({ "paseo.parent-agent-id": "parent" }) }, { paseo }),
  ).toBeUndefined();
  expect(warning).toHaveBeenCalledExactlyOnceWith(
    "Multi-project session agent-id: parent lookup failed",
  );
});
it("ignores parents that are not plugin coordinators", async () => {
  refresh.mockResolvedValueOnce({ agent: { labels: {} } });
  expect(
    await hook({ request: request({ "paseo.parent-agent-id": "ordinary" }) }, { paseo }),
  ).toBeUndefined();
});
it("skips history before reading labels or parents", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const historyLabels: Record<string, string>[] = [
    { [PLUGIN_LABEL]: "true" },
    { "paseo.parent-agent-id": "parent" },
  ];
  for (const labels of historyLabels) {
    expect(
      await hook({ request: { ...request(labels), purpose: "history" } }, { paseo }),
    ).toBeUndefined();
  }
  expect(paseo.agents.ref).not.toHaveBeenCalled();
  expect(warning).not.toHaveBeenCalled();
});
