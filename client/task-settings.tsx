import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { CompactSelect } from "./compact-select";
import type { TaskAgentConfig, TaskCatalog, TaskFeatures } from "../shared/contracts";

export function TaskSettings({
  config,
  isolation,
  providers,
  features,
  canWorktree,
  pending,
  compact,
  theme,
  setConfig,
  setIsolation,
}: {
  config: TaskAgentConfig | null;
  isolation: "local" | "worktree";
  providers: TaskCatalog["providers"];
  features: TaskFeatures["features"];
  canWorktree: boolean;
  pending: boolean;
  compact: boolean;
  theme: PluginScreenProps["theme"];
  setConfig(config: TaskAgentConfig | null): void;
  setIsolation(value: "local" | "worktree"): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const provider = providers.find((p) => p.id === config?.provider);
  const model = provider?.models.find((m) => m.id === config?.model);
  const grid = {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    columnGap: 12,
    rowGap: 12,
  };
  const field = {
    flexGrow: 1,
    flexBasis: compact ? ("100%" as const) : ("30%" as const),
    minWidth: compact ? 0 : 240,
  };
  const summary = [
    provider?.modes.find((m) => m.id === config?.modeId)?.label || "Default mode",
    model?.thinkingOptions.find((t) => t.id === config?.thinkingOptionId)?.label ||
      "Default thinking",
    ...Object.entries(config?.featureValues || {}).map(([id, value]) => {
      const feature = features.find((f) => f.id === id);
      const label = feature?.label || id;
      if (typeof value === "boolean") return `${label}: ${value ? "On" : "Off"}`;
      return `${label}: ${feature?.type === "select" ? feature.options.find((o) => o.id === value)?.label || "Default" : value || "Default"}`;
    }),
  ].join(" · ");
  return (
    <View style={{ gap: 8 }}>
      <View style={grid} testID="multi-project-main-settings">
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
          <CompactSelect
            theme={theme}
            label="Provider"
            value={config?.provider || ""}
            options={[
              { value: "", label: "Select a provider" },
              ...providers
                .filter((p) => p.status === "ready")
                .map((p) => ({ value: p.id, label: p.label })),
            ]}
            disabled={pending}
            onValueChange={(id) => {
              const current = providers.find((p) => p.id === id);
              setConfig(current?.models[0] ? { provider: id, model: current.models[0].id } : null);
            }}
          />
        </View>
        {provider && config ? (
          <View style={field}>
            <CompactSelect
              theme={theme}
              label="Model"
              value={config.model}
              options={provider.models.map((m) => ({ value: m.id, label: m.label }))}
              disabled={pending}
              onValueChange={(model) => setConfig({ provider: config.provider, model })}
            />
          </View>
        ) : null}
      </View>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
        {canWorktree
          ? "Local uses existing checkouts. Worktree creates a separate Git checkout per project."
          : "Worktree requires every selected project to be a Git repository."}
      </Text>
      {provider && config ? (
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
            <View style={grid} testID="multi-project-agent-options">
              {provider.modes.length ? (
                <View style={field}>
                  <CompactSelect
                    theme={theme}
                    label="Mode"
                    value={config.modeId || ""}
                    options={[
                      { value: "", label: "Provider default" },
                      ...provider.modes.map((m) => ({ value: m.id, label: m.label })),
                    ]}
                    disabled={pending}
                    onValueChange={(modeId) =>
                      setConfig({
                        ...config,
                        modeId: modeId || undefined,
                        featureValues: undefined,
                      })
                    }
                  />
                </View>
              ) : null}
              {model?.thinkingOptions.length ? (
                <View style={field}>
                  <CompactSelect
                    theme={theme}
                    label="Thinking"
                    value={config.thinkingOptionId || ""}
                    options={[
                      { value: "", label: "Model default" },
                      ...model.thinkingOptions.map((t) => ({ value: t.id, label: t.label })),
                    ]}
                    disabled={pending}
                    onValueChange={(thinkingOptionId) =>
                      setConfig({
                        ...config,
                        thinkingOptionId: thinkingOptionId || undefined,
                        featureValues: undefined,
                      })
                    }
                  />
                </View>
              ) : null}
              {features.map((feature) => (
                <View key={feature.id} style={field}>
                  {feature.type === "toggle" ? (
                    <SettingsSwitch
                      label={feature.label}
                      value={Boolean(config.featureValues?.[feature.id] ?? feature.value)}
                      disabled={pending}
                      onValueChange={(value) =>
                        setConfig({
                          ...config,
                          featureValues: { ...config.featureValues, [feature.id]: value },
                        })
                      }
                    />
                  ) : (
                    <CompactSelect
                      theme={theme}
                      label={feature.label}
                      value={String(config.featureValues?.[feature.id] ?? feature.value ?? "")}
                      options={[
                        { value: "", label: "Provider default" },
                        ...feature.options.map((o) => ({ value: o.id, label: o.label })),
                      ]}
                      disabled={pending}
                      onValueChange={(value) =>
                        setConfig({
                          ...config,
                          featureValues: { ...config.featureValues, [feature.id]: value || null },
                        })
                      }
                    />
                  )}
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
