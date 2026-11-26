import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { agentConfigSchema } from "./contracts";

export const agentDefaults = defineSettings({
  id: "agent-defaults",
  scope: "host",
  version: 1,
  schema: z.object({
    providers: z.record(z.string().min(1), agentConfigSchema.omit({ provider: true })).default({}),
  }),
});

export type ProviderDefaults = z.output<typeof agentDefaults.schema>["providers"];
