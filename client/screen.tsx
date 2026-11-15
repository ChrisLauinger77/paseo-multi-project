import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { Loading, ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogRpc, featuresRpc, launchRpc, prepareRpc, tasksRpc } from "../shared/contracts";
import { createTaskForm } from "./form";
import { ArchiveTask } from "./archive-task";
import { ProjectPicker } from "./project-picker";
import { TaskAttachments } from "./attachments";
import { TaskSettings } from "./task-settings";

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
  const canWorktree = state.projects.every((p) => p.projectKind === "git");
  const canSubmit =
    !state.pending &&
    !state.attachmentPending &&
    !state.attachmentError &&
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
        gap: 16,
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
        minHeight: 88,
        textAlignVertical: "top" as const,
      },
      row: {
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 4,
      },
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
      <TaskAttachments
        compact={layout.compact}
        files={state.attachments}
        pending={state.pending}
        uploading={state.attachmentPending}
        error={state.attachmentError}
        theme={theme}
        onChange={form.setAttachments}
        onStatus={form.setAttachmentStatus}
      />
      <ProjectPicker
        projects={projects}
        selected={state.projects}
        pending={state.pending}
        compact={layout.compact}
        theme={theme}
        onToggle={form.toggleProject}
      />
      <TaskSettings
        config={state.config}
        isolation={state.isolation}
        providers={catalog.data?.providers || []}
        features={features.data?.features || []}
        canWorktree={canWorktree}
        pending={state.pending}
        compact={layout.compact}
        theme={theme}
        setConfig={form.setConfig}
        setIsolation={form.setIsolation}
      />
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
