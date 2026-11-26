import { View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsSwitch } from "@getpaseo/plugin/client/ui";
import type { TaskAgentConfig, TaskFeatures } from "../shared/contracts";
import type { CatalogProvider } from "./agent-config";
import { CompactSelect } from "./compact-select";

export const agentFieldGrid = {
  flexDirection: "row" as const,
  flexWrap: "wrap" as const,
  columnGap: 12,
  rowGap: 12,
};

export function agentFieldStyle(compact: boolean) {
  return {
    flexGrow: 1,
    flexBasis: compact ? ("100%" as const) : ("30%" as const),
    minWidth: compact ? 0 : 240,
  };
}

function selectOptions(options: readonly { id: string; label: string }[], selected: string) {
  const values = options.map(({ id, label }) => ({ value: id, label }));
  if (selected && !values.some(({ value }) => value === selected)) {
    values.unshift({ value: selected, label: `${selected} (unavailable)` });
  }
  return values;
}

export function AgentProviderSelect({
  providers,
  savedProviderIds = [],
  value,
  theme,
  disabled,
  onValueChange,
}: {
  providers: CatalogProvider[];
  savedProviderIds?: string[];
  value: string;
  theme: PluginSurfaceProps["theme"];
  disabled: boolean;
  onValueChange(id: string): void;
}) {
  const ready = providers.filter((p) => p.status === "ready" && p.models.length);
  const unavailable = savedProviderIds
    .filter((id) => !ready.some((provider) => provider.id === id))
    .map((id) => ({
      id,
      label: `${providers.find((provider) => provider.id === id)?.label ?? id} (unavailable)`,
    }));
  return (
    <CompactSelect
      theme={theme}
      label="Provider"
      value={value}
      options={[
        { value: "", label: "Select a provider" },
        ...selectOptions([...ready, ...unavailable], value),
      ]}
      disabled={disabled}
      onValueChange={onValueChange}
    />
  );
}

interface AgentFieldsProps {
  config: TaskAgentConfig;
  provider?: CatalogProvider;
  theme: PluginSurfaceProps["theme"];
  disabled: boolean;
  setConfig(config: TaskAgentConfig): void;
}

export function AgentModelSelect({
  config,
  provider,
  theme,
  disabled,
  setConfig,
}: AgentFieldsProps) {
  return (
    <CompactSelect
      theme={theme}
      label="Model"
      value={config.model}
      options={selectOptions(provider?.models || [], config.model)}
      disabled={disabled}
      onValueChange={(model) => setConfig({ provider: config.provider, model })}
    />
  );
}

export function AgentOptions({
  config,
  provider,
  features,
  compact,
  theme,
  disabled,
  setConfig,
  setFeatureValue,
  testID,
}: AgentFieldsProps & {
  features: TaskFeatures["features"];
  compact: boolean;
  setFeatureValue(id: string, value: boolean | string | null): void;
  testID?: string;
}) {
  const field = agentFieldStyle(compact);
  const thinking = provider?.models.find((m) => m.id === config.model)?.thinkingOptions || [];
  return (
    <View style={agentFieldGrid} testID={testID}>
      {provider?.modes.length || config.modeId ? (
        <View style={field}>
          <CompactSelect
            theme={theme}
            label="Mode"
            value={config.modeId || ""}
            options={[
              { value: "", label: "Provider default" },
              ...selectOptions(provider?.modes || [], config.modeId || ""),
            ]}
            disabled={disabled}
            onValueChange={(modeId) =>
              setConfig({ ...config, modeId: modeId || undefined, featureValues: undefined })
            }
          />
        </View>
      ) : null}
      {thinking.length || config.thinkingOptionId ? (
        <View style={field}>
          <CompactSelect
            theme={theme}
            label="Thinking"
            value={config.thinkingOptionId || ""}
            options={[
              { value: "", label: "Model default" },
              ...selectOptions(thinking, config.thinkingOptionId || ""),
            ]}
            disabled={disabled}
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
      {features.map((feature) => {
        const saved = config.featureValues?.[feature.id];
        const setValue = (value: boolean | string | null) => setFeatureValue(feature.id, value);
        return (
          <View key={feature.id} style={field}>
            {feature.type === "toggle" ? (
              <SettingsSwitch
                label={feature.label}
                value={typeof saved === "boolean" ? saved : feature.value}
                disabled={disabled}
                onValueChange={setValue}
              />
            ) : (
              <CompactSelect
                theme={theme}
                label={feature.label}
                value={String(saved === undefined ? (feature.value ?? "") : (saved ?? ""))}
                options={[
                  { value: "", label: "Provider default" },
                  ...selectOptions(feature.options, String(saved ?? "")),
                ]}
                disabled={disabled}
                onValueChange={(value) => setValue(value || null)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
