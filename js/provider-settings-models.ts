import type { StoredProviderModel } from './api-provider-storage.js';
import { selectLatestRecommendedModels } from './api-models.js';
import { getModelPricing } from './schema.js';
import type { ProviderSettingsModels, ProviderSettingsStatus } from './provider-settings-contract.js';

function isStoredModel(value: unknown): value is StoredProviderModel {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && row.id.length > 0 && (row.name === undefined || typeof row.name === 'string');
}
export function readProviderSettingsModels(storageKey: string): StoredProviderModel[] {
  try {
    const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(cached) ? cached.filter(isStoredModel) : [];
  } catch { return []; }
}
export function providerSettingsPricing(provider: string, modelId: string): ProviderSettingsStatus {
  const price = getModelPricing(provider, modelId);
  if (price.input === 0 && price.output === 0) return { text: 'Free', tone: 'success' };
  const prefix = price.approx ? '~' : '';
  return { text: `${prefix}$${price.input.toFixed(2)}/M in · ${prefix}$${price.output.toFixed(2)}/M out`, tone: 'secondary' };
}
export function buildProviderSettingsModels(provider: string, rows: readonly StoredProviderModel[], modelId: string): ProviderSettingsModels {
  const recommended = selectLatestRecommendedModels(provider, [...rows]);
  const ids = new Set(recommended.map(model => model.id));
  const other = rows.filter(model => !ids.has(model.id));
  const options = (models: readonly StoredProviderModel[]) => models.map(model => ({ value: model.id, label: model.name || model.id }));
  const groups = [];
  if (recommended.length) groups.push({ label: 'Recommended', options: options(recommended) });
  if (other.length) groups.push({ label: recommended.length ? 'Other models' : '', options: options(other) });
  const selected = rows.find(model => model.id === modelId);
  return { selectedModel: modelId, modelDisplay: selected?.name || modelId, groups, pricing: providerSettingsPricing(provider, modelId) };
}
