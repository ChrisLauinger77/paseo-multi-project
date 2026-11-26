import type { TaskCatalog } from "./contracts";

interface CatalogOption {
  id: string;
  label: string;
}

interface ProviderSnapshotEntry {
  provider: string;
  enabled: boolean;
  status: string;
  label?: string | null;
  error?: string | null;
  modes?: readonly CatalogOption[] | null;
  models?:
    | readonly (CatalogOption & {
        isSelectable?: boolean;
        thinkingOptions?: readonly CatalogOption[];
      })[]
    | null;
}

export function catalogProviders(snapshot: {
  entries: readonly ProviderSnapshotEntry[];
}): TaskCatalog["providers"] {
  return snapshot.entries
    .filter((provider) => provider.enabled)
    .map((provider) => ({
      id: provider.provider,
      label: provider.label || provider.provider,
      status: provider.status,
      ...(provider.error ? { error: provider.error } : {}),
      modes: (provider.modes || []).map(({ id, label }) => ({ id, label })),
      models: (provider.models || [])
        .filter((model) => model.isSelectable !== false)
        .map(({ id, label, thinkingOptions }) => ({
          id,
          label,
          thinkingOptions: (thinkingOptions || []).map(({ id, label }) => ({ id, label })),
        })),
    }));
}
