import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { CompactSelect } from "./compact-select";
import {
  AgentModelSelect,
  AgentOptions,
  AgentProviderSelect,
  agentFieldGrid,
  agentFieldStyle,
} from "./agent-options";
import type { TaskAgentConfig, TaskCatalog, TaskFeatures } from "../shared/contracts";

export function TaskSettings({
  config,
  isolation,
  providers,
  features,
  canWorktree,
  pending,
  defaultsLoading,
  compact,
  theme,
  selectProvider,
  setConfig,
  setIsolation,
}: {
  config: TaskAgentConfig | null;
  isolation: "local" | "worktree";
  providers: TaskCatalog["providers"];
  features: TaskFeatures["features"];
  canWorktree: boolean;
  pending: boolean;
  defaultsLoading: boolean;
  compact: boolean;
  theme: PluginScreenProps["theme"];
  selectProvider(id: string): void;
  setConfig(config: TaskAgentConfig): void;
  setIsolation(value: "local" | "worktree"): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const provider = providers.find((p) => p.id === config?.provider);
  const model = provider?.models.find((m) => m.id === config?.model);
  const field = agentFieldStyle(compact);
  const summary = [
    provider?.modes.find((m) => m.id === config?.modeId)?.label || config?.modeId || "Default mode",
    model?.thinkingOptions.find((t) => t.id === config?.thinkingOptionId)?.label ||
      config?.thinkingOptionId ||
      "Default thinking",
    ...Object.entries(config?.featureValues || {}).map(([id, value]) => {
      const feature = features.find((f) => f.id === id);
      const label = feature?.label || id;
      if (typeof value === "boolean") return `${label}: ${value ? "On" : "Off"}`;
      const option = feature?.type === "select" && feature.options.find((o) => o.id === value);
      return `${label}: ${option ? option.label : (value ?? "Default")}`;
    }),
  ].join(" · ");
  return (
    <View style={{ gap: 8 }}>
      <View style={agentFieldGrid} testID="multi-project-main-settings">
        <View style={field}>
          <CompactSelect
            theme={theme}
            label="Isolation"
            value={isolation}
            options={[
              { value: "local", label: "Local" },
              { value: "worktree", label: "Worktree" },
            ]}
            onValueChange={setIsolation}
            disabled={pending || !canWorktree}
          />
        </View>
        <View style={field}>
          <AgentProviderSelect
            theme={theme}
            providers={providers}
            value={config?.provider || ""}
            disabled={pending || defaultsLoading}
            onValueChange={selectProvider}
          />
        </View>
        {config ? (
          <View style={field}>
            <AgentModelSelect
              config={config}
              provider={provider}
              theme={theme}
              disabled={pending}
              setConfig={setConfig}
            />
          </View>
        ) : null}
      </View>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
        {canWorktree
          ? "Local uses existing checkouts. Worktree creates a separate Git checkout per project."
          : "Worktree requires every selected project to be a Git repository."}
      </Text>
      {config ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            testID="multi-project-options-toggle"
            onPress={() => setExpanded((value) => !value)}
            style={{ paddingVertical: 8, gap: 4 }}
          >
            <Text style={{ color: theme.colors.accent }}>
              {expanded ? "Hide agent options" : "Agent options"}
            </Text>
            <Text
              testID="multi-project-options-summary"
              style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}
            >
              {summary}
            </Text>
          </Pressable>
          {expanded ? (
            <AgentOptions
              config={config}
              provider={provider}
              features={features}
              compact={compact}
              theme={theme}
              disabled={pending}
              setConfig={setConfig}
              testID="multi-project-agent-options"
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}
