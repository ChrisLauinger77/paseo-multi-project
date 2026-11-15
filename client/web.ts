import { createElement, type ChangeEvent } from "react";
import { Platform } from "react-native";
import type { CompactSelectProps } from "./compact-select";

// Browser elements stay behind this gate; native uses the host's SettingsSelect.
export function renderWebSelect<Value extends string>({
  label,
  value,
  options,
  disabled,
  theme,
  onValueChange,
}: CompactSelectProps<Value>) {
  if (Platform.OS !== "web") return null;
  const colors = theme.colors;
  return createElement(
    "select",
    {
      "aria-label": label,
      value,
      disabled,
      onChange: (event: ChangeEvent<HTMLSelectElement>) =>
        onValueChange(event.currentTarget.value as Value),
      style: {
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        font: "inherit",
        fontSize: 14,
        padding: "8px 10px",
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        backgroundColor: colors.surface1,
        color: colors.foreground,
        opacity: disabled ? 0.5 : 1,
      },
    },
    options.map((option) =>
      createElement(
        "option",
        {
          key: option.value,
          value: option.value,
          style: { backgroundColor: colors.surface1, color: colors.foreground },
        },
        option.label,
      ),
    ),
  );
}

export interface SelectedFile {
  fileName: string;
  mimeType: string;
  size: number;
  readBase64(): Promise<string>;
}
function selectedFiles(files: readonly File[]): SelectedFile[] {
  return files.map((file) => ({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    readBase64: () =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
        reader.onerror = () => reject(new Error(`Could not read ${file.name}. Choose it again.`));
        reader.onabort = () => reject(new Error(`Reading ${file.name} was cancelled.`));
        reader.readAsDataURL(file);
      }),
  }));
}
export function renderFilePicker(
  ref: { current: unknown },
  disabled: boolean,
  onFiles: (files: SelectedFile[]) => void,
) {
  if (Platform.OS !== "web") return null;
  return createElement("input", {
    type: "file",
    multiple: true,
    disabled,
    "aria-label": "Attach files",
    style: { display: "none" },
    ref: (node: HTMLInputElement | null) => {
      ref.current = node;
    },
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files || []);
      event.currentTarget.value = "";
      if (files.length) onFiles(selectedFiles(files));
    },
  });
}
export function openFilePicker(input: unknown) {
  if (Platform.OS === "web") (input as HTMLInputElement | null)?.click();
}
export function observeAttachmentFiles(parent: unknown, onFiles: (files: SelectedFile[]) => void) {
  if (Platform.OS !== "web" || !parent) return () => {};
  const node = parent as HTMLElement;
  const target = node.closest('[data-testid="multi-project-screen"]') || node;
  function drag(event: Event) {
    if (Array.from((event as DragEvent).dataTransfer?.types || []).includes("Files"))
      event.preventDefault();
  }
  function drop(event: Event) {
    const files = Array.from((event as DragEvent).dataTransfer?.files || []);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    onFiles(selectedFiles(files));
  }
  function paste(event: Event) {
    const files = Array.from((event as ClipboardEvent).clipboardData?.files || []);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    onFiles(selectedFiles(files));
  }
  target.addEventListener("dragover", drag);
  target.addEventListener("drop", drop);
  target.addEventListener("paste", paste, true);
  return () => {
    target.removeEventListener("dragover", drag);
    target.removeEventListener("drop", drop);
    target.removeEventListener("paste", paste, true);
  };
}
