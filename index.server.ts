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
} from "./shared/contracts";
import { AttachmentStore } from "./server/attachments";
import { sessionOpenHook } from "./server/session-hook";
import { launchTask, listTasks } from "./server/tasks";
import { archiveTask } from "./server/archive";
import { readCatalog, readFeatures } from "./server/catalog";
import { agentDefaults } from "./shared/agent-defaults";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(agentDefaults);
  const attachments = new AttachmentStore();
  server.handle(uploadAttachmentRpc, (input) => attachments.upload(input));
  server.handle(importAttachmentRpc, (input) => attachments.importFile(input.path, input.maxBytes));
  server.handle(prepareRpc, () => ({ id: randomUUID() }));
  server.handle(catalogRpc, (_input, { paseo }) => readCatalog(paseo));
  server.handle(featuresRpc, (input, { paseo }) => readFeatures(input, paseo));
  server.handle(launchRpc, (input, { paseo }) => launchTask(input, paseo, attachments));
  server.handle(tasksRpc, (_input, { paseo }) => listTasks(paseo));
  server.handle(archiveRpc, (input, { paseo }) => archiveTask(input, paseo));
  return server.addHook("agent.open.before", sessionOpenHook(attachments));
}
