import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon, Modal, ScrollView, TextInput } from "@getpaseo/plugin/client/ui";

export function CompactSelect<Value extends string>({
  label,
  value,
  options,
  disabled,
  theme,
  onValueChange,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  disabled?: boolean;
  theme: PluginScreenProps["theme"];
  onValueChange(value: Value): void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const colors = theme.colors;
  const selected = options.find((option) => option.value === value)?.label || value;
  const visible = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected}`}
        disabled={disabled}
        onPress={() => {
          setSearch("");
          setOpen(true);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 8,
          backgroundColor: colors.surface1,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text numberOfLines={1} style={{ color: colors.foreground, flex: 1 }}>
          {selected}
        </Text>
        <Icon name="ChevronDown" size={14} color={colors.foregroundMuted} />
      </Pressable>
      <Modal title={label} open={open} onOpenChange={setOpen}>
        <Modal.Content scrollable={false}>
          {options.length > 8 ? (
            <TextInput
              accessibilityLabel={`Search ${label.toLowerCase()}`}
              value={search}
              onChangeText={setSearch}
              placeholder="Search options"
              placeholderTextColor={colors.foregroundMuted}
              style={{
                color: colors.foreground,
                padding: 10,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
              }}
            />
          ) : null}
          <ScrollView
            style={{ maxHeight: 360 }}
            contentContainerStyle={{ gap: 4 }}
            nestedScrollEnabled
          >
            {visible.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: value === option.value }}
                onPress={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                style={{
                  padding: 12,
                  backgroundColor: value === option.value ? colors.surface1 : undefined,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: colors.foreground }}>
                  {value === option.value ? "✓ " : ""}
                  {option.label}
                </Text>
              </Pressable>
            ))}
            {visible.length === 0 ? (
              <Text style={{ color: colors.foregroundMuted }}>No matching options.</Text>
            ) : null}
          </ScrollView>
        </Modal.Content>
      </Modal>
    </View>
  );
}
