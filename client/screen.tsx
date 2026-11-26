import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import { Loading, ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { agentDefaults } from "../shared/agent-defaults";
import { catalogRpc, launchRpc, prepareRpc, tasksRpc } from "../shared/contracts";
import {
  catalogOptionError,
  initialAgentConfig,
  sameAgentConfig,
  useAgentFeatures,
} from "./agent-config";
import { createTaskForm } from "./form";
import { ArchiveTask } from "./archive-task";
import { ProjectPicker } from "./project-picker";
import { TaskAttachments } from "./attachments";
import { TaskSettings } from "./task-settings";
import { createTaskRefresh } from "./task-refresh";

export function TaskScreen({ theme, layout, navigation }: PluginScreenProps) {
  const [form] = useState(createTaskForm);
  const state = useSyncExternalStore(form.subscribe, form.getState, form.getState);
  const defaults = useSettings(agentDefaults);
  const readCatalog = useRpc(catalogRpc),
    readTasks = useRpc(tasksRpc),
    launch = useRpc(launchRpc),
    prepare = useRpc(prepareRpc);
  const queryClient = useQueryClient();
  const paseo = usePaseo();
  const [watchError, setWatchError] = useState<string | null>(null);
  const [archiveErrors, setArchiveErrors] = useState<string[]>([]);
  const [watchVersion, setWatchVersion] = useState(0);
  const [watchReady, setWatchReady] = useState(false);
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => readCatalog({}), retry: false });
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: () => readTasks({}),
    enabled: watchReady,
    // Re-enabling after subscription retry must refetch regardless of host query defaults.
    staleTime: 0,
    retry: false,
  });
  const projects = catalog.data?.projects || [];
  const providers = catalog.data?.providers || [];
  const selectedProvider = providers.find((p) => p.id === state.config?.provider);
  const catalogIssue = catalog.isSuccess
    ? catalogOptionError(state.config, selectedProvider)
    : null;
  const cwd = state.projects[0]?.projectRootPath ?? null;
  const featureConfig = catalog.isSuccess && !catalogIssue ? state.config : null;
  const features = useAgentFeatures(featureConfig, cwd, form.setConfig);
  const unavailable = features.unavailable;
  const standardConfig =
    selectedProvider?.status === "ready"
      ? initialAgentConfig(selectedProvider.id, selectedProvider)
      : null;
  function configForProvider(id: string) {
    return initialAgentConfig(
      id,
      providers.find((p) => p.id === id),
      defaults.status === "ready" ? defaults.values.providers : undefined,
    );
  }
  const resetConfig =
    state.config && catalog.isSuccess && defaults.status !== "loading"
      ? configForProvider(state.config.provider)
      : null;
  const canReset = resetConfig && state.config && !sameAgentConfig(state.config, resetConfig);
  const clearFeatureConfig =
    features.error && state.config?.featureValues
      ? { ...state.config, featureValues: undefined }
      : null;
  useEffect(() => {
    const lifetime = new AbortController();
    let release: (() => Promise<void>) | undefined;
    const refresh = createTaskRefresh(() => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    });
    setWatchError(null);
    setWatchReady(false);
    void paseo.agents
      .list({ subscribe: {}, signal: lifetime.signal })
      .then(async ({ subscription }) => {
        if (lifetime.signal.aborted) {
          await subscription!.release();
          return;
        }
        release = () => subscription!.release();
        subscription!.subscribe({
          snapshot: refresh.snapshot,
          update: refresh.update,
          error: (error) => setWatchError(String(error)),
        });
        // The first task read follows the observation, closing the initial snapshot gap.
        setWatchReady(true);
      })
      .catch((error) => {
        if (!lifetime.signal.aborted) {
          setWatchError(error instanceof Error ? error.message : String(error));
          // Still allow a task read when live observation is unavailable.
          setWatchReady(true);
        }
      });
    return () => {
      lifetime.abort();
      refresh.dispose();
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
    Boolean(state.task.trim() && state.projects.length && state.config) &&
    !missing &&
    !catalogIssue &&
    !unavailable &&
    features.isSuccess &&
    !features.isPlaceholderData &&
    catalog.isSuccess;
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
    if (featureConfig && cwd) void features.refetch();
    setWatchVersion((v) => v + 1);
  }
  function selectProvider(id: string) {
    if (defaults.status === "loading") return;
    form.setConfig(configForProvider(id));
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
      keyboardShouldPersistTaps="handled"
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
        <View style={styles.toolbar}>
          <Text style={styles.label}>Task</Text>
          {state.task.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              disabled={state.pending}
              onPress={() => form.setTask("")}
              style={state.pending && styles.disabled}
            >
              <Text style={styles.link}>Clear description</Text>
            </Pressable>
          ) : null}
        </View>
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
        onClear={form.clearProjects}
      />
      <TaskSettings
        config={state.config}
        isolation={state.isolation}
        providers={providers}
        features={features.data?.features || []}
        canWorktree={canWorktree}
        pending={state.pending}
        defaultsLoading={defaults.status === "loading"}
        compact={layout.compact}
        theme={theme}
        selectProvider={selectProvider}
        setConfig={form.setConfig}
        setFeatureValue={features.setFeatureValue}
        setIsolation={form.setIsolation}
      />
      {defaults.status === "error" || defaults.status === "invalid" ? (
        <View style={styles.group}>
          <Text style={styles.error} accessibilityRole="alert">
            Could not load saved agent defaults. You can configure this task manually.{" "}
            {defaults.error}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void defaults.reload()}>
            <Text style={styles.link}>Retry loading agent defaults</Text>
          </Pressable>
        </View>
      ) : null}
      {catalogIssue || unavailable || features.error ? (
        <View style={styles.group}>
          <Text style={styles.error} accessibilityRole="alert">
            {catalogIssue ?? unavailable?.message ?? features.error?.message}
          </Text>
          {catalogIssue && standardConfig ? (
            <Pressable
              accessibilityRole="button"
              disabled={state.pending}
              onPress={() => form.setConfig(standardConfig)}
            >
              <Text style={styles.link}>Use standard agent options</Text>
            </Pressable>
          ) : null}
          {unavailable || clearFeatureConfig ? (
            <Pressable
              accessibilityRole="button"
              disabled={state.pending}
              onPress={() => form.setConfig(unavailable?.config ?? clearFeatureConfig)}
            >
              <Text style={styles.link}>
                {unavailable ? "Remove unavailable options" : "Clear provider options"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {canReset ? (
        <Pressable
          accessibilityRole="button"
          disabled={state.pending}
          onPress={() => form.setConfig(resetConfig)}
        >
          <Text style={styles.link}>Reset agent options</Text>
        </Pressable>
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
      {archiveErrors.length ? (
        <View style={styles.group} testID="multi-project-workspace-cleanup-error">
          <Text style={styles.error} accessibilityRole="alert">
            Task archived. Some empty workspaces could not be archived. Use Paseo's workspace menu
            to retry. {archiveErrors.join(" ")}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setArchiveErrors([])}>
            <Text style={styles.link}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
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
            onArchived={(errors) => {
              setArchiveErrors(errors);
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
