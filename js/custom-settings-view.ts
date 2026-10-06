import { getCustomApiUrl, getCustomApiKey, getCustomApiModel } from './api.js';
import { buildProviderSettingsModels, readProviderSettingsModels } from './provider-settings-models.js';
import type { StoredProviderModel } from './api-provider-storage.js';
import type { CustomSettingsSnapshot } from './custom-settings-contract.js';
export function buildCustomModelState(rows: readonly StoredProviderModel[] = readProviderSettingsModels('labcharts-custom-models'), selected = getCustomApiModel()) {
  const seen = new Set<string>();
  const checked: StoredProviderModel[] = [];
  for (const row of rows) {
    if (typeof row?.id !== 'string' || !row.id || seen.has(row.id) || row.name !== undefined && typeof row.name !== 'string') continue;
    seen.add(row.id); checked.push(row);
  }
  return { ...buildProviderSettingsModels('custom', checked, selected), pricing: { text: '', tone: 'secondary' as const } };
}
export function buildCustomSettingsSnapshot(): CustomSettingsSnapshot {
  return { connected: !!getCustomApiUrl() && !!getCustomApiKey(), models: buildCustomModelState() };
}
