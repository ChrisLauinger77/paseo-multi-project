import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const TASK_LABEL = "paseo.multi-project-task";
export const PLUGIN_LABEL = "multi-project.plugin";
export const INPUT_LABEL = "multi-project.input";
export const DISCOVERY_TOOL = "multi_project_list_projects";
export const ATTACHMENTS_TOOL = "multi_project_task_attachments";
export const projectSchema = z.object({
  projectId: z.string(),
  projectDisplayName: z.string(),
  projectCustomName: z.string().nullable().optional(),
  projectRootPath: z.string(),
  projectKind: z.enum(["git", "non_git", "directory"]),
});
export type TaskProject = z.infer<typeof projectSchema>;
export const agentConfigSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  modeId: z.string().optional(),
  thinkingOptionId: z.string().optional(),
  featureValues: z.record(z.string(), z.union([z.boolean(), z.string(), z.null()])).optional(),
});
export type TaskAgentConfig = z.infer<typeof agentConfigSchema>;

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 8;
export const MAX_TASK_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const attachmentSchema = z.object({
  id: z.uuid(),
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine(
      (name) =>
        !name.includes("/") &&
        !name.includes("\\") &&
        Array.from(name).every((character) => character.charCodeAt(0) >= 32),
      "Use a file name without control characters or directory separators",
    ),
  mimeType: z.string().min(1).max(150),
  size: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
});
export type TaskAttachment = z.infer<typeof attachmentSchema>;
export interface ResolvedAttachment extends TaskAttachment {
  path: string;
}
export const uploadAttachmentRpc = defineRpc({
  name: "attachments.upload",
  input: z.object({
    fileName: attachmentSchema.shape.fileName,
    mimeType: attachmentSchema.shape.mimeType,
    data: z.string().max(Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4),
  }),
  output: attachmentSchema,
});
export const importAttachmentRpc = defineRpc({
  name: "attachments.import",
  input: z.object({ path: z.string().min(1).max(4096) }),
  output: attachmentSchema,
});

export const launchSchema = z
  .object({
    id: z.uuid(),
    task: z
      .string()
      .min(1)
      .max(100000)
      .refine((value) => Boolean(value.trim()), "Enter a task"),
    projects: z.array(projectSchema).min(1).max(100),
    isolation: z.enum(["local", "worktree"]),
    config: agentConfigSchema,
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
  })
  .refine(
    (input) => new Set(input.projects.map((p) => p.projectId)).size === input.projects.length,
    "Select each project once",
  )
  .refine(
    (input) =>
      new Set((input.attachments || []).map((file) => file.id)).size ===
      (input.attachments || []).length,
    "Attach each file once",
  )
  .refine(
    (input) =>
      (input.attachments || []).reduce((total, file) => total + file.size, 0) <=
      MAX_TASK_ATTACHMENT_BYTES,
    "Attachments must total 20 MiB or less",
  );
export type TaskLaunch = z.infer<typeof launchSchema>;
const optionSchema = z.object({ id: z.string(), label: z.string() });
export const catalogRpc = defineRpc({
  name: "catalog.read",
  input: z.object({}),
  output: z.object({
    projects: z.array(projectSchema),
    providers: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        status: z.string(),
        error: z.string().optional(),
        modes: z.array(optionSchema),
        models: z.array(optionSchema.extend({ thinkingOptions: z.array(optionSchema) })),
      }),
    ),
  }),
});
export const launchRpc = defineRpc({
  name: "tasks.launch",
  input: launchSchema,
  output: z.object({ agentId: z.string(), workspaceId: z.string() }),
});
export const featuresRpc = defineRpc({
  name: "features.read",
  input: z.object({ config: agentConfigSchema, cwd: z.string() }),
  output: z.object({
    features: z.array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("toggle"),
          id: z.string(),
          label: z.string(),
          value: z.boolean(),
        }),
        z.object({
          type: z.literal("select"),
          id: z.string(),
          label: z.string(),
          value: z.string().nullable(),
          options: z.array(optionSchema),
        }),
      ]),
    ),
  }),
});
const agentSummary = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  permissions: z.number(),
  workspaceId: z.string().nullable(),
});
export const tasksRpc = defineRpc({
  name: "tasks.list",
  input: z.object({}),
  output: z.object({ tasks: z.array(agentSummary.extend({ workers: z.array(agentSummary) })) }),
});

export const prepareRpc = defineRpc({
  name: "tasks.prepare",
  input: z.object({}),
  output: z.object({ id: z.uuid() }),
});

export type TaskSummary = z.infer<typeof tasksRpc.output>["tasks"][number];
export const archiveRpc = defineRpc({
  name: "tasks.archive",
  input: z.object({ agentId: z.string().min(1), archiveWorkers: z.boolean() }),
  output: z.object({ archivedAt: z.string() }),
});

export type TaskCatalog = z.infer<typeof catalogRpc.output>;
export type TaskFeatures = z.infer<typeof featuresRpc.output>;
