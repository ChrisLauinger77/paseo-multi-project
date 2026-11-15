import type { PluginSessionOpenRequest } from "@getpaseo/plugin/server";
import { z } from "zod";
import { attachmentSchema, INPUT_LABEL, MAX_ATTACHMENTS, PLUGIN_LABEL } from "../shared/contracts";
import { attachmentTool } from "./attachment-tool";
import type { AttachmentStore } from "./attachments";
import { discoveryTool } from "./discovery";

const attachmentInput = z.object({
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
});
type Labels = Readonly<Record<string, string>>;
type SessionPaseo = {
  agents: {
    ref(id: string): { refresh(): Promise<{ agent: { labels: Labels } } | null> };
  };
};

function warn(agentId: string, reason: string) {
  console.warn(`Multi-project session ${agentId}: ${reason}`);
}

function coordinatorAttachments(agentId: string, labels: Labels) {
  const label = labels[INPUT_LABEL];
  if (!label) {
    warn(agentId, "missing input label");
    return [];
  }
  let input: unknown;
  try {
    input = JSON.parse(label);
  } catch {
    warn(agentId, "malformed input JSON");
    return [];
  }
  const parsed = attachmentInput.safeParse(input);
  if (!parsed.success) {
    warn(agentId, "invalid attachments schema");
    return [];
  }
  return parsed.data.attachments || [];
}

export function sessionOpenHook(store: AttachmentStore) {
  return async (
    { request }: { request: PluginSessionOpenRequest },
    { paseo }: { paseo: SessionPaseo },
  ) => {
    if (request.purpose === "history") return;
    const tools = [...request.tools];
    let files;
    if (request.labels[PLUGIN_LABEL] === "true") {
      tools.push(discoveryTool);
      files = coordinatorAttachments(request.agentId, request.labels);
    } else {
      const parentId = request.labels["paseo.parent-agent-id"];
      if (!parentId) return;
      let parent;
      try {
        parent = (await paseo.agents.ref(parentId).refresh())?.agent;
      } catch {
        warn(request.agentId, "parent lookup failed");
        return;
      }
      if (!parent || parent.labels[PLUGIN_LABEL] !== "true") return;
      files = coordinatorAttachments(request.agentId, parent.labels);
    }
    if (files.length) tools.push(attachmentTool(files, store));
    return { ...request, tools };
  };
}
