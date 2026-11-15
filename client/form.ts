import type { TaskAgentConfig, TaskLaunch, TaskProject } from "../shared/contracts";
export interface TaskFormState {
  task: string;
  projects: TaskProject[];
  isolation: "local" | "worktree";
  config: TaskAgentConfig | null;
  pending: boolean;
  error: string | null;
  result: { agentId: string; workspaceId: string } | null;
}
export function createTaskForm() {
  let state: TaskFormState = {
    task: "",
    projects: [],
    isolation: "local",
    config: null,
    pending: false,
    error: null,
    result: null,
  };
  const listeners = new Set<() => void>();
  let attempt: { fingerprint: string; request: TaskLaunch } | undefined;
  function publish(patch: Partial<TaskFormState>) {
    state = { ...state, ...patch };
    if (!state.projects.every((p) => p.projectKind === "git")) state.isolation = "local";
    for (const listener of listeners) listener();
  }
  function edit(patch: Partial<TaskFormState>) {
    if (!state.pending) publish({ ...patch, error: null, result: null });
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setTask(task: string) {
      edit({ task });
    },
    setConfig(config: TaskAgentConfig | null) {
      edit({ config });
    },
    setIsolation(isolation: "local" | "worktree") {
      edit({ isolation });
    },
    toggleProject(project: TaskProject) {
      edit({
        projects: state.projects.some((p) => p.projectId === project.projectId)
          ? state.projects.filter((p) => p.projectId !== project.projectId)
          : [...state.projects, project],
      });
    },
    async submit(client: {
      prepare(): Promise<{ id: string }>;
      launch(input: TaskLaunch): Promise<{ agentId: string; workspaceId: string }>;
    }) {
      if (state.pending || !state.task.trim() || !state.projects.length || !state.config)
        return null;
      const input = {
        task: state.task,
        projects: state.projects,
        isolation: state.isolation,
        config: state.config,
      };
      const fingerprint = JSON.stringify(input);
      publish({ pending: true, error: null });
      try {
        if (attempt?.fingerprint !== fingerprint) {
          const { id } = await client.prepare();
          attempt = { fingerprint, request: { ...input, id } };
        }
        const result = await client.launch(attempt.request);
        publish({ pending: false, result });
        return result;
      } catch (error) {
        publish({ pending: false, error: error instanceof Error ? error.message : String(error) });
        return null;
      }
    },
  };
}
