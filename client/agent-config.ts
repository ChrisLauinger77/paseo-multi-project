import { useEffect, useRef } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { skipToken, useQuery } from "@tanstack/react-query";
import type { ProviderDefaults } from "../shared/agent-defaults";
import {
  featuresRpc,
  type TaskAgentConfig,
  type TaskCatalog,
  type TaskFeatures,
} from "../shared/contracts";

export type CatalogProvider = TaskCatalog["providers"][number];

export function initialAgentConfig(
  providerId: string,
  provider: CatalogProvider | undefined,
  defaults?: ProviderDefaults,
): TaskAgentConfig | null {
  if (defaults && Object.hasOwn(defaults, providerId)) {
    const saved = defaults[providerId]!;
    return {
      ...saved,
      provider: providerId,
      ...(saved.featureValues && { featureValues: { ...saved.featureValues } }),
    };
  }
  const model = provider?.models[0];
  return model ? { provider: providerId, model: model.id } : null;
}

export function catalogOptionError(config: TaskAgentConfig | null, provider?: CatalogProvider) {
  if (!config) return null;
  if (provider?.status !== "ready") return `Provider "${config.provider}" is unavailable.`;
  const model = provider.models.find((model) => model.id === config.model);
  if (!model) return `Model "${config.model}" is unavailable.`;
  if (config.modeId && !provider.modes.some((mode) => mode.id === config.modeId))
    return `Mode "${config.modeId}" is unavailable.`;
  if (
    config.thinkingOptionId &&
    !model.thinkingOptions.some((option) => option.id === config.thinkingOptionId)
  )
    return `Thinking option "${config.thinkingOptionId}" is unavailable.`;
  return null;
}

export function sameAgentConfig(left: TaskAgentConfig, right: TaskAgentConfig) {
  if (
    left.provider !== right.provider ||
    left.model !== right.model ||
    left.modeId !== right.modeId ||
    left.thinkingOptionId !== right.thinkingOptionId
  )
    return false;
  const leftFeatures = Object.entries(left.featureValues ?? {});
  const rightFeatures = right.featureValues ?? {};
  return (
    leftFeatures.length === Object.keys(rightFeatures).length &&
    leftFeatures.every(([id, value]) => rightFeatures[id] === value)
  );
}

type OptionValues = NonNullable<TaskAgentConfig["featureValues"]>;
type Feature = TaskFeatures["features"][number];

function acceptsValue(feature: Feature | undefined, value: OptionValues[string]) {
  return feature?.type === "toggle"
    ? typeof value === "boolean"
    : feature?.type === "select" &&
        (value === null || feature.options.some((option) => option.id === value));
}

function withoutOptions(config: TaskAgentConfig, ids: string[]) {
  const featureValues = { ...config.featureValues };
  for (const id of ids) delete featureValues[id];
  return {
    ...config,
    featureValues: Object.keys(featureValues).length ? featureValues : undefined,
  };
}

function unavailableFeatureOptions(config: TaskAgentConfig, features?: TaskFeatures["features"]) {
  if (!config.featureValues || !features) return null;
  const ids: string[] = [];
  const messages = [];
  for (const [id, value] of Object.entries(config.featureValues)) {
    const feature = features.find((feature) => feature.id === id);
    if (acceptsValue(feature, value)) continue;
    ids.push(id);
    messages.push(
      feature
        ? `Value "${value}" for "${feature.label}" is unavailable.`
        : `Agent option "${id}" is unavailable.`,
    );
  }
  return ids.length ? { message: messages.join(" "), config: withoutOptions(config, ids) } : null;
}

async function discoverFeatures(
  read: (input: { config: TaskAgentConfig; cwd?: string }) => Promise<TaskFeatures>,
  input: { config: TaskAgentConfig; cwd?: string },
) {
  try {
    return await read(input);
  } catch (error) {
    const { config, cwd } = input;
    const selected = Object.entries(config.featureValues ?? {});
    if (!selected.length) throw error;
    try {
      // Start with controls the provider can describe without overrides. Reapply supported
      // values in batches so parents can reveal any valid saved children.
      let result = await read({ config: { ...config, featureValues: undefined }, cwd });
      let remaining = selected;
      let applied: OptionValues = {};
      while (remaining.length) {
        const available = remaining.filter(([id, value]) =>
          acceptsValue(
            result.features.find((feature) => feature.id === id),
            value,
          ),
        );
        if (!available.length) return result;
        if (available.length === remaining.length) break;
        const batch = Object.fromEntries(available);
        applied = { ...applied, ...batch };
        remaining = remaining.filter(([id]) => !Object.hasOwn(batch, id));
        result = await read({ config: { ...config, featureValues: applied }, cwd });
      }
    } catch {
      // A baseline or partial request also failed, so the rejected values are unknown.
    }
    throw error;
  }
}

// A null directory skips discovery. An omitted directory uses the daemon home.
export function useAgentFeatures(
  config: TaskAgentConfig | null,
  cwd: string | null | undefined,
  setConfig: (config: TaskAgentConfig) => void,
) {
  const readFeatures = useRpc(featuresRpc);
  const edit = useRef<{
    config: TaskAgentConfig;
    cwd: typeof cwd;
    previousOptions: string[];
  } | null>(null);
  const input = config && cwd !== null ? { config, cwd } : null;
  const scope = input && [
    input.cwd,
    input.config.provider,
    input.config.model,
    input.config.modeId,
    input.config.thinkingOptionId,
  ];
  const query = useQuery({
    queryKey: ["features", scope, input?.config.featureValues] as const,
    queryFn: input ? () => discoverFeatures(readFeatures, input) : skipToken,
    // Keep controls visible during option edits in the same directory and agent configuration.
    placeholderData(previous, query) {
      const previousScope = query?.queryKey[1];
      return previousScope && scope?.every((part, index) => part === previousScope[index])
        ? previous
        : undefined;
    },
    retry: false,
  });
  const freshFeatures = query.isSuccess && !query.isPlaceholderData ? query.data.features : null;

  useEffect(() => {
    const change = edit.current;
    if (!change) return;
    if (change.config !== config || change.cwd !== cwd || query.isError) {
      edit.current = null;
      return;
    }
    if (!freshFeatures || query.isFetching) return;
    edit.current = null;
    // Only remove previously valid values hidden by this explicit edit in the same context.
    const hidden = change.previousOptions.filter(
      (id) => !freshFeatures.some((feature) => feature.id === id),
    );
    if (hidden.length) setConfig(withoutOptions(change.config, hidden));
  }, [config, cwd, freshFeatures, query.isError, query.isFetching, setConfig]);

  function setFeatureValue(id: string, value: OptionValues[string]) {
    if (!config) return;
    const next = { ...config, featureValues: { ...config.featureValues, [id]: value } };
    const previousOptions = Object.entries(config.featureValues ?? {})
      .filter(
        ([key, previous]) =>
          key !== id &&
          acceptsValue(
            query.data?.features.find((feature) => feature.id === key),
            previous,
          ),
      )
      .map(([key]) => key);
    edit.current = { config: next, cwd, previousOptions };
    setConfig(next);
  }

  return {
    ...query,
    unavailable: config && freshFeatures && unavailableFeatureOptions(config, freshFeatures),
    setFeatureValue,
  };
}
