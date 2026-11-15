import { Platform, Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { renderWebSelect } from "./web";

export interface CompactSelectProps<Value extends string> {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  disabled?: boolean;
  theme: PluginScreenProps["theme"];
  onValueChange(value: Value): void;
}

export function CompactSelect<Value extends string>(props: CompactSelectProps<Value>) {
  if (Platform.OS !== "web") {
    return (
      <SettingsSelect
        label={props.label}
        value={props.value}
        options={props.options}
        disabled={props.disabled}
        onValueChange={props.onValueChange}
      />
    );
  }
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: props.theme.colors.foregroundMuted, fontSize: 12 }}>{props.label}</Text>
      {renderWebSelect(props)}
    </View>
  );
}
