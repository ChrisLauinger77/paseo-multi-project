import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { Modal, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { archiveRpc, type TaskSummary } from "../shared/contracts";

export function ArchiveTask({
  task,
  theme,
  onArchived,
}: {
  task: TaskSummary;
  theme: PluginScreenProps["theme"];
  onArchived(workspaceCleanupErrors: string[]): void;
}) {
  const archive = useRpc(archiveRpc);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveEmptyWorkspaces, setArchiveEmptyWorkspaces] = useState(false);
  const busy = useRef(false);
  const colors = theme.colors;
  const hasWorkers = task.workers.length > 0;
  async function confirm(archiveWorkers: boolean) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await archive({ agentId: task.id, archiveWorkers, archiveEmptyWorkspaces });
      setOpen(false);
      onArchived(result.workspaceCleanupErrors || []);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Archive ${task.title}`}
        testID={`multi-project-archive-${task.id}`}
        onPress={() => {
          setError(null);
          setArchiveEmptyWorkspaces(false);
          setOpen(true);
        }}
        style={{ alignSelf: "flex-start", paddingVertical: 8 }}
      >
        <Text style={{ color: colors.accent }}>Archive…</Text>
      </Pressable>
      <Modal
        title="Archive task"
        open={open}
        onOpenChange={(value) => {
          if (!busy.current) setOpen(value);
        }}
      >
        <Modal.Content>
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>{task.title}</Text>
          <Text style={{ color: colors.foregroundMuted }}>
            {hasWorkers
              ? `Also archive the ${task.workers.length} project ${task.workers.length === 1 ? "worker" : "workers"} and their subagents? Choose Keep workers to leave them as independent agents.`
              : "Archive this coordinator?"}
          </Text>
          <SettingsSwitch
            label="Archive empty Local workspaces"
            hint="Also hide this task's Local workspaces when they have no active agents, terminals or services. Shared workspaces and managed worktrees are kept."
            value={archiveEmptyWorkspaces}
            onValueChange={setArchiveEmptyWorkspaces}
            disabled={pending}
            testID="multi-project-archive-workspaces"
          />
          <Text style={{ color: colors.foregroundMuted }}>
            Archiving stops running agents and keeps their conversations in Paseo history. Project
            files and worktrees are kept.
          </Text>
          {error ? (
            <Text
              accessibilityRole="alert"
              testID="multi-project-archive-error"
              style={{ color: colors.statusDanger }}
            >
              {error}
            </Text>
          ) : null}
          <View style={{ gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              testID="multi-project-archive-confirm"
              disabled={pending}
              onPress={() => {
                void confirm(true);
              }}
              style={{
                padding: 12,
                borderRadius: 8,
                backgroundColor: colors.accent,
                opacity: pending ? 0.5 : 1,
              }}
            >
              <Text
                style={{ color: colors.accentForeground, fontWeight: "600", textAlign: "center" }}
              >
                {pending ? "Archiving…" : hasWorkers ? "Archive task and workers" : "Archive task"}
              </Text>
            </Pressable>
            {hasWorkers ? (
              <Pressable
                accessibilityRole="button"
                testID="multi-project-archive-keep"
                disabled={pending}
                onPress={() => {
                  void confirm(false);
                }}
                style={{ padding: 12 }}
              >
                <Text
                  style={{ color: colors.accent, textAlign: "center", opacity: pending ? 0.5 : 1 }}
                >
                  Keep workers
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              testID="multi-project-archive-cancel"
              disabled={pending}
              onPress={() => setOpen(false)}
              style={{ padding: 12 }}
            >
              <Text
                style={{
                  color: colors.foregroundMuted,
                  textAlign: "center",
                  opacity: pending ? 0.5 : 1,
                }}
              >
                Cancel
              </Text>
            </Pressable>
          </View>
        </Modal.Content>
      </Modal>
    </>
  );
}
