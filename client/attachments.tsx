import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import {
  uploadAttachmentRpc,
  importAttachmentRpc,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_TASK_ATTACHMENT_BYTES,
  type TaskAttachment,
} from "../shared/contracts";
import { observeAttachmentFiles, openFilePicker, renderFilePicker, type SelectedFile } from "./web";

export function TaskAttachments({
  files,
  compact,
  pending,
  uploading,
  error,
  theme,
  onChange,
  onStatus,
}: {
  files: TaskAttachment[];
  compact: boolean;
  pending: boolean;
  uploading: boolean;
  error: string | null;
  theme: PluginScreenProps["theme"];
  onChange(files: TaskAttachment[]): void;
  onStatus(pending: boolean, error?: string | null): void;
}) {
  const upload = useRpc(uploadAttachmentRpc);
  const importFile = useRpc(importAttachmentRpc);
  const input = useRef<unknown>(null);
  const container = useRef<View>(null);
  const busy = useRef(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [hostPath, setHostPath] = useState("");
  const colors = theme.colors;
  const disabled = pending || uploading;
  function validate(incoming: readonly { size: number }[]) {
    if (files.length + incoming.length > MAX_ATTACHMENTS)
      throw new Error("Attach up to 8 files per task.");
    if (incoming.some((file) => file.size > MAX_ATTACHMENT_BYTES))
      throw new Error("Each attachment must be 5 MiB or smaller.");
    if (
      [...files, ...incoming].reduce((total, file) => total + file.size, 0) >
      MAX_TASK_ATTACHMENT_BYTES
    )
      throw new Error("Attachments must total 20 MiB or less.");
  }
  async function addFiles(incoming: SelectedFile[]) {
    if (busy.current || pending) return;
    busy.current = true;
    onStatus(true);
    const next = [...files];
    try {
      validate(incoming);
      for (const file of incoming) {
        const attachment = await upload({
          fileName: file.fileName,
          mimeType: file.mimeType,
          data: await file.readBase64(),
        });
        next.push(attachment);
        onChange([...next]);
      }
      onStatus(false);
    } catch (error) {
      onStatus(false, error instanceof Error ? error.message : String(error));
    } finally {
      busy.current = false;
    }
  }
  async function addHostFile() {
    if (busy.current || pending || !hostPath.trim()) return;
    busy.current = true;
    onStatus(true);
    try {
      if (files.length >= MAX_ATTACHMENTS) throw new Error("Attach up to 8 files per task.");
      const file = await importFile({ path: hostPath.trim() });
      validate([file]);
      onChange([...files, file]);
      setHostPath("");
      setHostOpen(false);
      onStatus(false);
    } catch (error) {
      onStatus(false, error instanceof Error ? error.message : String(error));
    } finally {
      busy.current = false;
    }
  }
  useEffect(
    () =>
      observeAttachmentFiles(container.current, (incoming) => {
        void addFiles(incoming);
      }),
    [files, pending, upload, onChange, onStatus],
  );
  return (
    <View ref={container} style={{ gap: 8 }} testID="multi-project-attachments">
      {renderFilePicker(input, disabled, (incoming) => {
        void addFiles(incoming);
      })}
      <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        {Platform.OS === "web" ? (
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => openFilePicker(input.current)}
            testID="multi-project-attach-files"
            style={{ paddingVertical: 6, opacity: disabled ? 0.5 : 1 }}
          >
            <Text style={{ color: colors.accent }}>Attach files</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => setHostOpen((value) => !value)}
          testID="multi-project-attach-host"
          style={{ paddingVertical: 6, opacity: disabled ? 0.5 : 1 }}
        >
          <Text style={{ color: colors.accent }}>Add host file</Text>
        </Pressable>
        <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
          {uploading
            ? "Attaching files…"
            : `${files.length}/8 files · 5 MiB each · shared with all workers`}
        </Text>
      </View>
      {hostOpen ? (
        <View style={{ gap: 8 }}>
          <TextInput
            accessibilityLabel="File path on this host"
            testID="multi-project-host-file-path"
            value={hostPath}
            onChangeText={setHostPath}
            editable={!disabled}
            placeholder="Absolute file path on the daemon host"
            placeholderTextColor={colors.foregroundMuted}
            style={{
              color: colors.foreground,
              padding: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />
          <Pressable
            accessibilityRole="button"
            disabled={disabled || !hostPath.trim()}
            onPress={() => {
              void addHostFile();
            }}
            testID="multi-project-host-file-add"
            style={{ paddingVertical: 6 }}
          >
            <Text style={{ color: colors.accent }}>Add file</Text>
          </Pressable>
        </View>
      ) : null}
      {files.length ? (
        <ScrollView
          testID="multi-project-attachment-list"
          nestedScrollEnabled
          style={{ maxHeight: compact ? 156 : 104 }}
          contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
        >
          {files.map((file) => (
            <View
              key={file.id}
              testID={`multi-project-attachment-${file.id}`}
              style={{
                flexDirection: "row",
                flexBasis: compact ? "100%" : "45%",
                flexGrow: 1,
                minWidth: 0,
                gap: 12,
                alignItems: "center",
                padding: 8,
                borderRadius: 8,
                backgroundColor: colors.surface1,
              }}
            >
              <Text style={{ color: colors.foreground, flex: 1 }} numberOfLines={1}>
                {file.fileName} · {Math.ceil(file.size / 1024)} KiB
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove attachment ${file.fileName}`}
                disabled={disabled}
                onPress={() => onChange(files.filter((current) => current.id !== file.id))}
                style={{ padding: 4 }}
              >
                <Text style={{ color: colors.accent }}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      {error ? (
        <View style={{ gap: 4 }}>
          <Text
            accessibilityRole="alert"
            testID="multi-project-attachment-error"
            style={{ color: colors.statusDanger }}
          >
            {error}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => onStatus(false)}>
            <Text style={{ color: colors.accent }}>Dismiss attachment error</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
