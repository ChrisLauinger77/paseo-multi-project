import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import type { TaskProject } from "../shared/contracts";

export function ProjectPicker({
  projects,
  selected,
  pending,
  compact,
  theme,
  onToggle,
  onClear,
}: {
  projects: TaskProject[];
  selected: TaskProject[];
  pending: boolean;
  compact: boolean;
  theme: PluginScreenProps["theme"];
  onToggle(project: TaskProject): void;
  onClear(): void;
}) {
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const colors = theme.colors;
  const selectedIds = new Set(selected.map((p) => p.projectId));
  const query = search.trim().toLocaleLowerCase();
  const visible = projects.filter(
    (project) =>
      (!selectedOnly || selectedIds.has(project.projectId)) &&
      [project.projectCustomName, project.projectDisplayName, project.projectRootPath].some(
        (value) => value?.toLocaleLowerCase().includes(query),
      ),
  );
  const missing = selected.filter(
    (p) => !projects.some((current) => current.projectId === p.projectId),
  );
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <Text style={{ color: colors.foreground, fontWeight: "600" }}>Projects</Text>
        <Text testID="multi-project-selection-count" style={{ color: colors.foregroundMuted }}>
          {selected.length} selected · {projects.length} available
        </Text>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selectedOnly }}
          testID="multi-project-selected-only"
          onPress={() => setSelectedOnly((value) => !value)}
          style={{ paddingVertical: 6 }}
        >
          <Text style={{ color: colors.accent }}>{selectedOnly ? "✓ " : ""}Selected only</Text>
        </Pressable>
        {selected.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            disabled={pending}
            onPress={() => {
              onClear();
              setSelectedOnly(false);
            }}
            style={{ paddingVertical: 6, opacity: pending ? 0.5 : 1 }}
          >
            <Text style={{ color: colors.accent }}>Clear selection</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <TextInput
          accessibilityLabel="Search projects"
          testID="multi-project-project-search"
          value={search}
          onChangeText={setSearch}
          placeholder="Search projects by name or path"
          placeholderTextColor={colors.foregroundMuted}
          style={{
            flex: 1,
            minWidth: 0,
            color: colors.foreground,
            backgroundColor: colors.surface1,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 8,
            padding: 10,
          }}
        />
        {search.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setSearch("")}
            style={{ paddingVertical: 10 }}
          >
            <Text style={{ color: colors.accent }}>Clear search</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        testID="multi-project-projects"
        nestedScrollEnabled
        style={{ maxHeight: compact ? 200 : 240 }}
        contentContainerStyle={{ gap: 6 }}
      >
        {!projects.length ? (
          <Text style={{ color: colors.foregroundMuted }}>
            Add projects in Paseo before launching a task.
          </Text>
        ) : null}
        {projects.length > 0 && visible.length === 0 ? (
          <Text style={{ color: colors.foregroundMuted }}>No matching projects.</Text>
        ) : null}
        {visible.map((project) => {
          const checked = selectedIds.has(project.projectId);
          return (
            <Pressable
              key={project.projectId}
              testID={`multi-project-target-${project.projectId}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              disabled={pending}
              onPress={() => onToggle(project)}
              style={{
                padding: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: checked ? colors.accent : colors.border,
                backgroundColor: checked ? colors.surface1 : undefined,
                gap: 2,
              }}
            >
              <Text numberOfLines={1} style={{ color: colors.foreground }}>
                {checked ? "✓ " : ""}
                {project.projectCustomName || project.projectDisplayName}
              </Text>
              <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: 12 }}>
                {project.projectRootPath}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {missing.length ? (
        <Text accessibilityRole="alert" style={{ color: colors.statusDanger }}>
          A selected project was removed. Deselect it or refresh before retrying.
        </Text>
      ) : null}
      {missing.map((project) => (
        <Pressable key={project.projectId} disabled={pending} onPress={() => onToggle(project)}>
          <Text style={{ color: colors.statusDanger }}>
            Remove missing project: {project.projectDisplayName}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
