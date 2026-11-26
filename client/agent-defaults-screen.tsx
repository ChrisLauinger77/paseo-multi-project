import { useState } from "react";
import { Text, View } from "react-native";
import { type PluginSurfaceProps, useRpc, useSettings } from "@getpaseo/plugin/client";
import { Loading, SettingsAction, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { agentDefaults } from "../shared/agent-defaults";
import { catalogRpc, type TaskAgentConfig } from "../shared/contracts";
import {
  catalogOptionError,
  featureOptionError,
  initialAgentConfig,
  useAgentFeatures,
} from "./agent-config";
import { AgentModelSelect, AgentOptions, AgentProviderSelect } from "./agent-options";

export function AgentDefaultsScreen({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(agentDefaults);
  const readCatalog = useRpc(catalogRpc);
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => readCatalog({}), retry: false });
  const [providerId, setProviderId] = useState("");
  const [draft, setDraft] = useState<{ config: TaskAgentConfig; revision: string } | null>(null);
  const providers = catalog.data?.providers ?? [];
  const provider = providers.find((p) => p.id === providerId);
  const saved = settings.status === "ready" ? settings.values.providers : undefined;
  const hasSavedDefault = Boolean(saved && Object.hasOwn(saved, providerId));
  const config = draft?.config ?? initialAgentConfig(providerId, provider, saved);
  const standardConfig =
    provider?.status === "ready" ? initialAgentConfig(providerId, provider) : null;
  const catalogIssue = catalogOptionError(config, provider);
  const features = useAgentFeatures(catalogIssue ? null : config);
  const optionIssue = catalogIssue ?? featureOptionError(config, features.data?.features);
  const errorStyle = { color: theme.colors.statusDanger };

  async function save(remove: boolean) {
    if (settings.status !== "ready" || !config || settings.saving) return;
    const { model, modeId, thinkingOptionId, featureValues } = config;
    const defaults = {
      ...settings.values.providers,
      [providerId]: {
        model,
        ...(modeId && { modeId }),
        ...(thinkingOptionId && { thinkingOptionId }),
        ...(featureValues && { featureValues }),
      },
    };
    if (remove) delete defaults[providerId];
    if (await settings.save({ providers: defaults }, draft?.revision ?? settings.revision)) {
      setDraft(null);
      if (remove && !standardConfig) setProviderId("");
    }
  }

  if (settings.status === "loading") return <Loading />;
  if (settings.status !== "ready") {
    return (
      <SettingsSection title="Agent defaults">
        <Text accessibilityRole="alert" style={errorStyle}>
          {settings.error}
        </Text>
        <SettingsAction
          label="Agent defaults"
          actionLabel="Retry"
          onPress={() => void settings.reload()}
        />
      </SettingsSection>
    );
  }

  function updateConfig(next: TaskAgentConfig) {
    if (settings.status === "ready") {
      setDraft((current) => ({ config: next, revision: current?.revision ?? settings.revision }));
    }
  }

  return (
    <SettingsSection title="Agent defaults" testID="multi-project-agent-defaults">
      <View style={{ gap: 12 }}>
        {catalog.isPending ? <Loading /> : null}
        {catalog.error ? (
          <>
            <Text accessibilityRole="alert" style={errorStyle}>
              {catalog.error.message}
            </Text>
            <SettingsAction
              label="Provider catalog"
              actionLabel="Retry"
              onPress={() => void catalog.refetch()}
            />
          </>
        ) : null}
        <AgentProviderSelect
          theme={theme}
          providers={providers}
          savedProviderIds={Object.keys(settings.values.providers)}
          value={providerId}
          disabled={catalog.isPending || settings.saving || Boolean(draft)}
          onValueChange={setProviderId}
        />
        {config ? (
          <>
            <AgentModelSelect
              config={config}
              provider={provider}
              theme={theme}
              disabled={settings.saving}
              setConfig={updateConfig}
            />
            <AgentOptions
              config={config}
              provider={provider}
              features={features.data?.features ?? []}
              compact={layout.compact}
              theme={theme}
              disabled={settings.saving}
              setConfig={updateConfig}
            />
            {optionIssue ? (
              <>
                <Text accessibilityRole="alert" style={errorStyle}>
                  {optionIssue}
                </Text>
                {standardConfig ? (
                  <SettingsAction
                    label="Standard options"
                    actionLabel="Reset agent options"
                    disabled={settings.saving}
                    onPress={() => updateConfig(standardConfig)}
                  />
                ) : null}
              </>
            ) : null}
            {features.error ? (
              <>
                <Text accessibilityRole="alert" style={errorStyle}>
                  {features.error.message}
                </Text>
                <SettingsAction
                  label="Agent options"
                  actionLabel="Retry"
                  onPress={() => void features.refetch()}
                />
              </>
            ) : null}
            {settings.saveError ? (
              <>
                <Text accessibilityRole="alert" style={errorStyle}>
                  {settings.saveError}
                </Text>
                <SettingsAction
                  label="Saved configuration"
                  actionLabel="Reload saved values"
                  disabled={settings.saving}
                  onPress={() => {
                    setDraft(null);
                    void settings.reload();
                  }}
                />
              </>
            ) : null}
            <SettingsAction
              label="Provider default"
              actionLabel="Save"
              disabled={
                settings.saving ||
                Boolean(optionIssue || features.error) ||
                features.isPending ||
                (!draft && hasSavedDefault)
              }
              onPress={() => void save(false)}
            />
            {draft ? (
              <SettingsAction
                label="Unsaved changes"
                actionLabel="Discard changes"
                disabled={settings.saving}
                onPress={() => setDraft(null)}
              />
            ) : hasSavedDefault ? (
              <SettingsAction
                label="Saved configuration"
                actionLabel="Remove saved default"
                disabled={settings.saving}
                onPress={() => void save(true)}
              />
            ) : null}
          </>
        ) : null}
      </View>
    </SettingsSection>
  );
}
