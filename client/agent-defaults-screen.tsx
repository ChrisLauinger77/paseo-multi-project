import { useState } from "react";
import { Text, View } from "react-native";
import { settingsRpc } from "@getpaseo/plugin";
import { type PluginSurfaceProps, usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import { Loading, SettingsAction, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { agentDefaults } from "../shared/agent-defaults";
import { catalogProviders } from "../shared/catalog";
import type { TaskAgentConfig } from "../shared/contracts";
import { catalogOptionError, initialAgentConfig, useAgentFeatures } from "./agent-config";
import { AgentModelSelect, AgentOptions, AgentProviderSelect } from "./agent-options";
import { CompactSelect } from "./compact-select";

const readAgentDefaults = settingsRpc(agentDefaults.id).read;

export function AgentDefaultsScreen({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(agentDefaults);
  const readSaved = useRpc(readAgentDefaults);
  const paseo = usePaseo();
  const catalog = useQuery({
    queryKey: ["providers"],
    queryFn: async () => catalogProviders(await paseo.providers.waitForReady()),
    retry: false,
  });
  const [providerId, setProviderId] = useState("");
  const [showProjects, setShowProjects] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [draft, setDraft] = useState<{ config: TaskAgentConfig; revision: string } | null>(null);
  const [retryingSave, setRetryingSave] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const providers = catalog.data ?? [];
  const provider = providers.find((p) => p.id === providerId);
  const saved = settings.status === "ready" ? settings.values.providers : undefined;
  const hasSavedDefault = Boolean(saved && Object.hasOwn(saved, providerId));
  const config = draft?.config ?? initialAgentConfig(providerId, provider, saved);
  const standardConfig =
    provider?.status === "ready" ? initialAgentConfig(providerId, provider) : null;
  const projects = useQuery({
    queryKey: ["project-contexts"],
    queryFn: async () => (await paseo.projects.list()).projects,
    enabled: showProjects && Boolean(config),
    retry: false,
  });
  const project = projects.data?.find((project) => project.projectId === projectId);
  const projectMissing = Boolean(projectId && projects.isSuccess && !project);
  const cwd = projectId ? (project?.projectRootPath ?? null) : undefined;
  const catalogIssue = catalog.isSuccess ? catalogOptionError(config, provider) : null;
  const features = useAgentFeatures(
    catalog.isSuccess && !catalogIssue ? config : null,
    cwd,
    updateConfig,
  );
  const unavailable = features.unavailable;
  const optionIssue = catalogIssue ?? unavailable?.message;
  const errorStyle = { color: theme.colors.statusDanger };
  const saving = settings.saving || retryingSave;
  const canSave = !saving && !optionIssue && features.isSuccess && !features.isPlaceholderData;

  async function save(action: "save" | "remove" | "retry") {
    const remove = action === "remove";
    const retry = action === "retry";
    if (settings.status !== "ready" || !config || saving || (!remove && !canSave)) return;
    const { model, modeId, thinkingOptionId, featureValues } = config;
    if (retry) setRetryingSave(true);
    setRetryError(null);
    try {
      let values = settings.values;
      let revision = draft?.revision ?? settings.revision;
      if (retry) {
        const latest = await readSaved({});
        if (latest.status !== "ready") throw new Error(latest.error);
        values = agentDefaults.schema.parse(latest.values);
        revision = latest.revision;
      }
      const defaults = {
        ...values.providers,
        [providerId]: {
          model,
          ...(modeId && { modeId }),
          ...(thinkingOptionId && { thinkingOptionId }),
          ...(featureValues && { featureValues }),
        },
      };
      if (remove) delete defaults[providerId];
      if (await settings.save({ providers: defaults }, revision)) {
        setDraft(null);
        if (remove && !standardConfig) setProviderId("");
      }
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : String(error));
    } finally {
      if (retry) setRetryingSave(false);
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
          disabled={catalog.isPending || saving || Boolean(draft)}
          onValueChange={setProviderId}
        />
        {config ? (
          <>
            <AgentModelSelect
              config={config}
              provider={provider}
              theme={theme}
              disabled={saving}
              setConfig={updateConfig}
            />
            {showProjects ? (
              <>
                <CompactSelect
                  theme={theme}
                  label="Project context"
                  value={projectId}
                  options={[
                    { value: "", label: "Daemon home" },
                    ...(projectMissing ? [{ value: projectId, label: "Unavailable project" }] : []),
                    ...(projects.data ?? []).map((item) => ({
                      value: item.projectId,
                      label: item.projectCustomName || item.projectDisplayName,
                    })),
                  ]}
                  disabled={saving || projects.isPending}
                  onValueChange={setProjectId}
                />
                {projectMissing ? (
                  <Text accessibilityRole="alert" style={errorStyle}>
                    The selected project is no longer registered.
                  </Text>
                ) : null}
                {projects.error ? (
                  <SettingsAction
                    label={projects.error.message}
                    actionLabel="Retry loading projects"
                    onPress={() => void projects.refetch()}
                  />
                ) : null}
              </>
            ) : (
              <SettingsAction
                label="Project-specific options"
                actionLabel="Choose project context"
                disabled={saving}
                onPress={() => setShowProjects(true)}
              />
            )}
            <AgentOptions
              config={config}
              provider={provider}
              features={features.data?.features ?? []}
              compact={layout.compact}
              theme={theme}
              disabled={saving}
              setConfig={updateConfig}
              setFeatureValue={features.setFeatureValue}
            />
            {optionIssue ? (
              <>
                <Text accessibilityRole="alert" style={errorStyle}>
                  {optionIssue}
                </Text>
                {catalogIssue && standardConfig ? (
                  <SettingsAction
                    label="Standard options"
                    actionLabel="Use standard agent options"
                    disabled={saving}
                    onPress={() => updateConfig(standardConfig)}
                  />
                ) : null}
                {unavailable ? (
                  <SettingsAction
                    label="Current project context"
                    actionLabel="Remove unavailable options"
                    disabled={saving}
                    onPress={() => updateConfig(unavailable.config)}
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
                {config.featureValues ? (
                  <SettingsAction
                    label="Provider-specific options"
                    actionLabel="Clear provider options"
                    disabled={saving}
                    onPress={() => updateConfig({ ...config, featureValues: undefined })}
                  />
                ) : null}
              </>
            ) : null}
            {retryError || settings.saveError ? (
              <>
                <Text accessibilityRole="alert" style={errorStyle}>
                  {retryError ?? settings.saveError}
                </Text>
                {draft ? (
                  <SettingsAction
                    label="Save your draft over this provider’s current settings"
                    actionLabel="Retry save"
                    disabled={!canSave}
                    onPress={() => void save("retry")}
                  />
                ) : (
                  <SettingsAction
                    label="Saved configuration"
                    actionLabel="Reload saved values"
                    disabled={saving}
                    onPress={() => {
                      setRetryError(null);
                      void settings.reload();
                    }}
                  />
                )}
              </>
            ) : null}
            <SettingsAction
              label="Provider default"
              actionLabel="Save"
              disabled={!canSave || (!draft && hasSavedDefault)}
              onPress={() => void save("save")}
            />
            {draft ? (
              <SettingsAction
                label="Unsaved changes"
                actionLabel="Discard changes"
                disabled={saving}
                onPress={() => {
                  setDraft(null);
                  setRetryError(null);
                  if (settings.saveError) void settings.reload();
                }}
              />
            ) : hasSavedDefault ? (
              <SettingsAction
                label="Saved configuration"
                actionLabel="Remove saved default"
                disabled={saving}
                onPress={() => void save("remove")}
              />
            ) : null}
          </>
        ) : null}
      </View>
    </SettingsSection>
  );
}
