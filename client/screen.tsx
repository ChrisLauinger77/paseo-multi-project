import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import {
  Loading,
  ScrollView,
  TextInput,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogRpc, featuresRpc, launchRpc, prepareRpc, tasksRpc } from "../shared/contracts";
import { createTaskForm } from "./form";
import { ArchiveTask } from "./archive-task";

export function TaskScreen({ theme, layout, navigation }: PluginScreenProps) {
  const [form] = useState(createTaskForm);
  const state = useSyncExternalStore(form.subscribe, form.getState, form.getState);
  const readCatalog = useRpc(catalogRpc),
    readFeatures = useRpc(featuresRpc),
    readTasks = useRpc(tasksRpc),
    launch = useRpc(launchRpc),
    prepare = useRpc(prepareRpc);
  const queryClient = useQueryClient();
  const paseo = usePaseo();
  const [watchError, setWatchError] = useState<string | null>(null);
  const [watchVersion, setWatchVersion] = useState(0);
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => readCatalog({}), retry: false });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: () => readTasks({}), retry: false });
  const projects = catalog.data?.projects || [];
  const selectedProvider = catalog.data?.providers.find((p) => p.id === state.config?.provider);
  const selectedModel = selectedProvider?.models.find((m) => m.id === state.config?.model);
  const cwd = state.projects[0]?.projectRootPath || "";
  const featureInput = state.config && cwd ? { config: state.config, cwd } : null;
  const features = useQuery({
    queryKey: [
      "features",
      state.config?.provider,
      state.config?.model,
      state.config?.modeId,
      state.config?.thinkingOptionId,
      cwd,
    ],
    queryFn: featureInput ? () => readFeatures(featureInput) : skipToken,
    retry: false,
  });
  useEffect(() => {
    const lifetime = new AbortController();
    let release: (() => Promise<void>) | undefined;
    setWatchError(null);
    void paseo.agents
      .list({ subscribe: {}, signal: lifetime.signal })
      .then(async ({ subscription }) => {
        if (lifetime.signal.aborted) {
          await subscription!.release();
          return;
        }
        release = () => subscription!.release();
        subscription!.subscribe({
          snapshot: () => {
            void queryClient.invalidateQueries({ queryKey: ["tasks"] });
          },
          update: () => {
            void queryClient.invalidateQueries({ queryKey: ["tasks"] });
          },
          error: (error) => setWatchError(String(error)),
        });
      })
      .catch((error) => {
        if (!lifetime.signal.aborted)
          setWatchError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      lifetime.abort();
      void release?.();
    };
  }, [paseo, queryClient, watchVersion]);
  const missing = state.projects.some(
    (p) => !projects.some((current) => current.projectId === p.projectId),
  );
  const canWorktree =
    state.projects.length > 0 && state.projects.every((p) => p.projectKind === "git");
  const canSubmit =
    !state.pending &&
    Boolean(state.task.trim() && state.projects.length && state.config && selectedModel) &&
    !missing &&
    !features.isPending &&
    !features.error &&
    !catalog.error;
  const styles = useMemo(
    () => ({
      page: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: {
        padding: layout.compact ? 16 : 28,
        gap: 20,
        maxWidth: 920,
        width: "100%" as const,
        alignSelf: "center" as const,
      },
      heading: { color: theme.colors.foreground, fontSize: 22, fontWeight: "600" as const },
      label: { color: theme.colors.foreground, fontWeight: "600" as const },
      text: { color: theme.colors.foreground },
      muted: { color: theme.colors.foregroundMuted },
      error: { color: theme.colors.statusDanger },
      input: {
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        minHeight: 110,
        textAlignVertical: "top" as const,
      },
      row: {
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 4,
      },
      selected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.surface1 },
      button: {
        padding: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
        alignItems: "center" as const,
      },
      buttonText: { color: theme.colors.accentForeground, fontWeight: "600" as const },
      disabled: { opacity: 0.5 },
      group: { gap: 8 },
      toolbar: {
        flexDirection: "row" as const,
        gap: 12,
        alignItems: "center" as const,
        flexWrap: "wrap" as const,
      },
      link: { color: theme.colors.accent, paddingVertical: 6 },
    }),
    [theme, layout.compact],
  );
  function refresh() {
    void catalog.refetch();
    void tasks.refetch();
    if (featureInput) void features.refetch();
    setWatchVersion((v) => v + 1);
  }
  async function submit() {
    const result = await form.submit({ prepare: () => prepare({}), launch });
    if (result) {
      void tasks.refetch();
      navigation?.openAgent({ agentId: result.agentId });
    }
  }
  if (catalog.isPending) return <Loading />;
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      testID="multi-project-screen"
    >
      <View style={styles.toolbar}>
        <Text style={styles.heading}>New task</Text>
        <Pressable onPress={refresh} accessibilityRole="button" testID="multi-project-refresh">
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>
      {catalog.error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {catalog.error.message}
        </Text>
      ) : null}
      <View style={styles.group}>
        <Text style={styles.label}>Task</Text>
        <TextInput
          testID="multi-project-prompt"
          accessibilityLabel="Task"
          multiline
          editable={!state.pending}
          value={state.task}
          onChangeText={form.setTask}
          placeholder="Describe the change across your projects"
          placeholderTextColor={theme.colors.foregroundMuted}
          style={styles.input}
        />
      </View>
      <View style={styles.group}>
        <Text style={styles.label}>Projects</Text>
        {!projects.length ? (
          <Text style={styles.muted}>Add projects in Paseo before launching a task.</Text>
        ) : null}
        {projects.map((project) => {
          const selected = state.projects.some((p) => p.projectId === project.projectId);
          return (
            <Pressable
              key={project.projectId}
              testID={`multi-project-target-${project.projectId}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              disabled={state.pending}
              onPress={() => form.toggleProject(project)}
              style={[styles.row, selected && styles.selected]}
            >
              <Text style={styles.text}>
                {selected ? "✓ " : ""}
                {project.projectCustomName || project.projectDisplayName}
              </Text>
              <Text style={styles.muted}>{project.projectRootPath}</Text>
            </Pressable>
          );
        })}
        {missing ? (
          <Text style={styles.error} accessibilityRole="alert">
            A selected project was removed. Deselect it or refresh before retrying.
          </Text>
        ) : null}
        {state.projects
          .filter((p) => !projects.some((current) => current.projectId === p.projectId))
          .map((p) => (
            <Pressable key={p.projectId} onPress={() => form.toggleProject(p)}>
              <Text style={styles.error}>Remove missing project: {p.projectDisplayName}</Text>
            </Pressable>
          ))}
      </View>
      {canWorktree ? (
        <SettingsSelect
          label="Isolation"
          value={state.isolation}
          options={[
            { value: "local", label: "Local" },
            { value: "worktree", label: "Worktree" },
          ]}
          onValueChange={form.setIsolation}
          disabled={state.pending}
        />
      ) : (
        <Text style={styles.muted}>Isolation: Local</Text>
      )}
      <SettingsSelect
        label="Provider"
        value={state.config?.provider || ""}
        options={[
          { value: "", label: "Select a provider" },
          ...(catalog.data?.providers
            .filter((p) => p.status === "ready")
            .map((p) => ({ value: p.id, label: p.label })) || []),
        ]}
        disabled={state.pending}
        onValueChange={(provider) => {
          const p = catalog.data?.providers.find((p) => p.id === provider);
          form.setConfig(p?.models[0] ? { provider, model: p.models[0].id } : null);
        }}
      />
      {selectedProvider && state.config ? (
        <SettingsSelect
          label="Model"
          value={state.config.model}
          options={selectedProvider.models.map((m) => ({ value: m.id, label: m.label }))}
          disabled={state.pending}
          onValueChange={(model) => form.setConfig({ provider: state.config!.provider, model })}
        />
      ) : null}
      {selectedProvider?.modes.length && state.config ? (
        <SettingsSelect
          label="Mode"
          value={state.config.modeId || ""}
          options={[
            { value: "", label: "Provider default" },
            ...selectedProvider.modes.map((m) => ({ value: m.id, label: m.label })),
          ]}
          disabled={state.pending}
          onValueChange={(modeId) =>
            form.setConfig({
              ...state.config!,
              modeId: modeId || undefined,
              featureValues: undefined,
            })
          }
        />
      ) : null}
      {selectedModel?.thinkingOptions.length && state.config ? (
        <SettingsSelect
          label="Thinking"
          value={state.config.thinkingOptionId || ""}
          options={[
            { value: "", label: "Model default" },
            ...selectedModel.thinkingOptions.map((t) => ({ value: t.id, label: t.label })),
          ]}
          disabled={state.pending}
          onValueChange={(thinkingOptionId) =>
            form.setConfig({
              ...state.config!,
              thinkingOptionId: thinkingOptionId || undefined,
              featureValues: undefined,
            })
          }
        />
      ) : null}
      {features.data?.features.map((feature) =>
        feature.type === "toggle" ? (
          <SettingsSwitch
            key={feature.id}
            label={feature.label}
            value={Boolean(state.config?.featureValues?.[feature.id] ?? feature.value)}
            disabled={state.pending}
            onValueChange={(value) =>
              form.setConfig({
                ...state.config!,
                featureValues: { ...state.config?.featureValues, [feature.id]: value },
              })
            }
          />
        ) : (
          <SettingsSelect
            key={feature.id}
            label={feature.label}
            value={String(state.config?.featureValues?.[feature.id] ?? feature.value ?? "")}
            options={[
              { value: "", label: "Provider default" },
              ...feature.options.map((o) => ({ value: o.id, label: o.label })),
            ]}
            disabled={state.pending}
            onValueChange={(value) =>
              form.setConfig({
                ...state.config!,
                featureValues: { ...state.config?.featureValues, [feature.id]: value || null },
              })
            }
          />
        ),
      )}
      {featureInput && features.error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {features.error.message}
        </Text>
      ) : null}
      {state.error ? (
        <Text style={styles.error} accessibilityRole="alert" testID="multi-project-error">
          {state.error}
        </Text>
      ) : null}
      <Pressable
        testID="multi-project-launch"
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={() => {
          void submit();
        }}
        style={[styles.button, !canSubmit && styles.disabled]}
      >
        <Text style={styles.buttonText}>
          {state.pending ? "Starting coordinator…" : "Start task"}
        </Text>
      </Pressable>
      {state.result ? (
        <Pressable onPress={() => navigation?.openAgent({ agentId: state.result!.agentId })}>
          <Text style={styles.link}>Open created coordinator</Text>
        </Pressable>
      ) : null}
      <Text style={styles.heading}>Recent tasks</Text>
      {watchError ? (
        <Text style={styles.error} accessibilityRole="alert">
          Live updates unavailable: {watchError}. Refresh to retry.
        </Text>
      ) : null}
      {tasks.error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {tasks.error.message}
        </Text>
      ) : null}
      {tasks.isPending ? <Text style={styles.muted}>Loading tasks…</Text> : null}
      {tasks.data?.tasks.length === 0 ? (
        <Text style={styles.muted}>Your multi-project tasks will appear here.</Text>
      ) : null}
      {tasks.data?.tasks.map((task) => (
        <View key={task.id} style={styles.row} testID={`multi-project-task-${task.id}`}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation?.openAgent({ agentId: task.id })}
          >
            <Text style={styles.label}>{task.title}</Text>
            <Text style={styles.muted}>
              {task.permissions ? "Permission required" : task.status} · {task.workers.length}{" "}
              workers
            </Text>
          </Pressable>
          <ArchiveTask
            task={task}
            theme={theme}
            onArchived={() => {
              void tasks.refetch();
            }}
          />
          {task.workers.map((worker) => (
            <Pressable
              key={worker.id}
              accessibilityRole="button"
              onPress={() => navigation?.openAgent({ agentId: worker.id })}
            >
              <Text style={styles.link}>
                {worker.title} · {worker.permissions ? "Permission required" : worker.status}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
