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

export function unavailableFeatureOptions(
  config: TaskAgentConfig | null,
  features?: TaskFeatures["features"],
) {
  if (!config?.featureValues || !features) return null;
  const featureValues = { ...config.featureValues };
  const messages = [];
  for (const [id, value] of Object.entries(config.featureValues)) {
    const feature = features.find((feature) => feature.id === id);
    const valid =
      feature?.type === "toggle"
        ? typeof value === "boolean"
        : feature?.type === "select" &&
          (value === null || feature.options.some((option) => option.id === value));
    if (valid) continue;
    delete featureValues[id];
    messages.push(
      feature
        ? `Value "${value}" for "${feature.label}" is unavailable.`
        : `Agent option "${id}" is unavailable.`,
    );
  }
  return messages.length
    ? {
        message: messages.join(" "),
        config: {
          ...config,
          featureValues: Object.keys(featureValues).length ? featureValues : undefined,
        },
      }
    : null;
}

// A null directory skips discovery. An omitted directory uses the daemon home.
export function useAgentFeatures(config: TaskAgentConfig | null, cwd?: string | null) {
  const readFeatures = useRpc(featuresRpc);
  const input = config && cwd !== null ? { config, cwd } : null;
  const scope = input && [
    input.cwd,
    input.config.provider,
    input.config.model,
    input.config.modeId,
    input.config.thinkingOptionId,
  ];
  return useQuery({
    queryKey: ["features", scope, input?.config.featureValues] as const,
    queryFn: input ? () => readFeatures(input) : skipToken,
    // Keep controls visible during option edits in the same directory and agent configuration.
    placeholderData(previous, query) {
      const previousScope = query?.queryKey[1];
      return previousScope && scope?.every((part, index) => part === previousScope[index])
        ? previous
        : undefined;
    },
    retry: false,
  });
}
