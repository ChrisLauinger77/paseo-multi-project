import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, stat, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  attachmentSchema,
  MAX_ATTACHMENT_BYTES,
  MAX_TASK_ATTACHMENT_BYTES,
  type TaskAttachment,
  type ResolvedAttachment,
} from "../shared/contracts";

const storedSchema = attachmentSchema.extend({
  diskName: z.string().regex(/^content(?:\.[a-zA-Z0-9]{1,16})?$/),
  sha256: z.string().length(64),
});
export const isVisionImage = (mimeType: string) =>
  ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mimeType);
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export class AttachmentStore {
  constructor(
    readonly directory = process.env.PASEO_MULTI_PROJECT_DATA_DIR ||
      path.join(homedir(), ".paseo-multi-project", "attachments"),
  ) {}

  async upload(input: {
    fileName: string;
    mimeType: string;
    data: string;
  }): Promise<TaskAttachment> {
    const bytes = Buffer.from(input.data, "base64");
    if (bytes.toString("base64") !== input.data)
      throw new Error("Invalid attachment encoding. Choose the file again.");
    const file = attachmentSchema.parse({
      id: randomUUID(),
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: bytes.length,
    });
    const extension = path.extname(file.fileName);
    const diskName = "content" + (/^\.[a-zA-Z0-9]{1,16}$/.test(extension) ? extension : "");
    const directory = path.join(this.directory, file.id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      await writeFile(path.join(directory, diskName), bytes, { flag: "wx", mode: 0o600 });
      await writeFile(
        path.join(directory, "metadata.json"),
        JSON.stringify({ ...file, diskName, sha256: digest(bytes) }),
        { flag: "wx", mode: 0o600 },
      );
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
    return file;
  }

  async importFile(filePath: string, maxBytes = MAX_ATTACHMENT_BYTES): Promise<TaskAttachment> {
    const expanded = filePath.replace(/^~(?=[\\/])/, homedir());
    if (!path.isAbsolute(expanded)) throw new Error("Enter an absolute file path on this host.");
    const info = await stat(expanded);
    if (!info.isFile()) throw new Error("Choose a file, not a directory.");
    // Keep the per-file error distinct from the remaining-task-budget error below.
    if (info.size > MAX_ATTACHMENT_BYTES)
      throw new Error("Each attachment must be 5 MiB or smaller.");
    const limit = Math.min(maxBytes, MAX_ATTACHMENT_BYTES);
    if (info.size > limit)
      throw new Error("The file exceeds the remaining task attachment budget.");
    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
      ".md": "text/markdown",
      ".txt": "text/plain",
      ".json": "application/json",
      ".csv": "text/csv",
    };
    const bytes = await readFile(expanded);
    // A file can grow after stat; do not store a copy that exceeds the supplied budget.
    if (bytes.length > limit)
      throw new Error("The file exceeds the remaining task attachment budget.");
    return this.upload({
      fileName: path.basename(expanded),
      mimeType: mimeTypes[path.extname(expanded).toLowerCase()] || "application/octet-stream",
      data: bytes.toString("base64"),
    });
  }

  async resolve(
    files: readonly TaskAttachment[],
  ): Promise<Array<ResolvedAttachment & { bytes: Buffer }>> {
    const result = [];
    let total = 0;
    for (const input of files) {
      const file = attachmentSchema.parse(input);
      try {
        const directory = path.join(this.directory, file.id);
        const stored = storedSchema.parse(
          JSON.parse(await readFile(path.join(directory, "metadata.json"), "utf8")),
        );
        if (
          stored.id !== file.id ||
          stored.fileName !== file.fileName ||
          stored.mimeType !== file.mimeType ||
          stored.size !== file.size
        )
          throw new Error("Attachment metadata changed");
        const filePath = path.join(directory, stored.diskName);
        const bytes = await readFile(filePath);
        if (bytes.length !== file.size || digest(bytes) !== stored.sha256)
          throw new Error("Attachment contents changed");
        total += bytes.length;
        if (total > MAX_TASK_ATTACHMENT_BYTES)
          throw new Error("Attachments must total 20 MiB or less");
        result.push({ ...file, path: filePath, bytes });
      } catch (error) {
        throw new Error(
          `Cannot read attachment "${file.fileName}". Remove it and attach it again. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return result;
  }
}
