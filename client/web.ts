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
