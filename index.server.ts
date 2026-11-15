import { randomUUID } from "node:crypto";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  catalogRpc,
  prepareRpc,
  launchRpc,
  tasksRpc,
  featuresRpc,
  PLUGIN_LABEL,
} from "./shared/contracts";
import { discoveryTool } from "./server/discovery";
import { launchTask, listTasks } from "./server/tasks";
import { readCatalog, readFeatures } from "./server/catalog";

export default function contribute(server: PluginServerContext) {
  server.handle(prepareRpc, () => ({ id: randomUUID() }));
  server.handle(catalogRpc, (_input, { paseo }) => readCatalog(paseo));
  server.handle(featuresRpc, (input, { paseo }) => readFeatures(input, paseo));
  server.handle(launchRpc, (input, { paseo }) => launchTask(input, paseo));
  server.handle(tasksRpc, (_input, { paseo }) => listTasks(paseo));
  return server.addHook("agent.open.before", async ({ request }) => {
    if (request.labels[PLUGIN_LABEL] !== "true") return;
    return { ...request, tools: [...request.tools, discoveryTool] };
  });
}
