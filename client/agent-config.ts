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

export function featureOptionError(
  config: TaskAgentConfig | null,
  features?: TaskFeatures["features"],
) {
  if (!features) return null;
  for (const [id, value] of Object.entries(config?.featureValues ?? {})) {
    const feature = features.find((feature) => feature.id === id);
    if (!feature) return `Agent option "${id}" is unavailable.`;
    const valid =
      feature.type === "toggle"
        ? typeof value === "boolean"
        : value === null || feature.options.some((option) => option.id === value);
    if (!valid) return `Value "${value}" for "${feature.label}" is unavailable.`;
  }
  return null;
}

// A null directory skips discovery. An omitted directory uses the daemon home.
export function useAgentFeatures(config: TaskAgentConfig | null, cwd?: string | null) {
  const readFeatures = useRpc(featuresRpc);
  // Discover the available values even when a saved feature value is now invalid.
  const input =
    config && cwd !== null
      ? {
          config: {
            provider: config.provider,
            model: config.model,
            modeId: config.modeId,
            thinkingOptionId: config.thinkingOptionId,
          },
          cwd,
        }
      : null;
  return useQuery({
    queryKey: ["features", input],
    queryFn: input ? () => readFeatures(input) : skipToken,
    retry: false,
  });
}
