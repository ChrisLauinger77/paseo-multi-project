import { randomUUID } from "node:crypto";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  archiveRpc,
  uploadAttachmentRpc,
  importAttachmentRpc,
  catalogRpc,
  prepareRpc,
  launchRpc,
  tasksRpc,
  featuresRpc,
  PLUGIN_LABEL,
} from "./shared/contracts";
import { attachmentTool, coordinatorAttachments } from "./server/attachment-tool";
import { AttachmentStore } from "./server/attachments";
import { discoveryTool } from "./server/discovery";
import { launchTask, listTasks } from "./server/tasks";
import { archiveTask } from "./server/archive";
import { readCatalog, readFeatures } from "./server/catalog";

export default function contribute(server: PluginServerContext) {
  const attachments = new AttachmentStore();
  server.handle(uploadAttachmentRpc, (input) => attachments.upload(input));
  server.handle(importAttachmentRpc, (input) => attachments.importFile(input.path));
  server.handle(prepareRpc, () => ({ id: randomUUID() }));
  server.handle(catalogRpc, (_input, { paseo }) => readCatalog(paseo));
  server.handle(featuresRpc, (input, { paseo }) => readFeatures(input, paseo));
  server.handle(launchRpc, (input, { paseo }) => launchTask(input, paseo, attachments));
  server.handle(tasksRpc, (_input, { paseo }) => listTasks(paseo));
  server.handle(archiveRpc, (input, { paseo }) => archiveTask(input, paseo));
  return server.addHook("agent.open.before", async ({ request }, { paseo }) => {
    const tools = [...request.tools];
    let files = [];
    if (request.labels[PLUGIN_LABEL] === "true") {
      tools.push(discoveryTool);
      files = coordinatorAttachments(request.labels);
    } else {
      const parentId = request.labels["paseo.parent-agent-id"];
      if (!parentId) return;
      const parent = (await paseo.agents.ref(parentId).refresh())?.agent;
      if (!parent || parent.labels[PLUGIN_LABEL] !== "true") return;
      files = coordinatorAttachments(parent.labels);
    }
    if (files.length) tools.push(attachmentTool(files, attachments));
    return { ...request, tools };
  });
}
