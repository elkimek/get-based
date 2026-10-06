import { getVeniceKey, getVeniceModel, getVeniceE2EE, isVeniceE2EEActive, selectLatestRecommendedModels } from './api.js';
import { getModelPricing } from './schema.js';
import type { StoredProviderModel } from './api-provider-storage.js';
import type { VeniceModelState, VeniceModeState, VeniceSettingsSnapshot, VeniceStatus } from './venice-settings-contract.js';

function isStoredModel(value: unknown): value is StoredProviderModel {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && row.id.length > 0 && (row.name === undefined || typeof row.name === 'string');
}
export function readVeniceModels(encrypted = getVeniceE2EE()): StoredProviderModel[] {
  try {
    const cached: unknown = JSON.parse(localStorage.getItem(encrypted ? 'labcharts-venice-e2ee-models' : 'labcharts-venice-models') || '[]');
    return Array.isArray(cached) ? cached.filter(isStoredModel) : [];
  } catch { return []; }
}
export function venicePricing(modelId: string): VeniceStatus {
  const price = getModelPricing('venice', modelId);
  if (price.input === 0 && price.output === 0) return { text: 'Free', tone: 'success' };
  const prefix = price.approx ? '~' : '';
  return { text: `${prefix}$${price.input.toFixed(2)}/M in · ${prefix}$${price.output.toFixed(2)}/M out`, tone: 'secondary' };
}
export function buildVeniceModelState(rows = readVeniceModels(), modelId = getVeniceModel()): VeniceModelState {
  const recommended = selectLatestRecommendedModels('venice', rows);
  const ids = new Set(recommended.map(model => model.id));
  const other = rows.filter(model => !ids.has(model.id));
  const options = (models: readonly StoredProviderModel[]) => models.map(model => ({ value: model.id, label: model.name || model.id }));
  const groups = [];
  if (recommended.length) groups.push({ label: 'Recommended', options: options(recommended) });
  if (other.length) groups.push({ label: recommended.length ? 'Other models' : '', options: options(other) });
  const selected = rows.find(model => model.id === modelId);
  return { selectedModel: modelId, modelDisplay: selected?.name || modelId, groups, pricing: venicePricing(modelId) };
}
export function buildVeniceModeState(): VeniceModeState {
  return { enabled: getVeniceE2EE(), available: readVeniceModels(true).length > 0, active: isVeniceE2EEActive() };
}
export function buildVeniceSettingsSnapshot(): VeniceSettingsSnapshot {
  return { connected: !!getVeniceKey(), models: buildVeniceModelState(), mode: buildVeniceModeState() };
}
export function veniceBalance(balance: { diem?: unknown; canConsume?: unknown } | null): VeniceStatus {
  if (!balance) return { text: 'Balance: unavailable', tone: 'secondary' };
  if (balance.diem != null) {
    const value = parseFloat(String(balance.diem));
    if (!Number.isFinite(value)) return { text: 'Balance: unavailable', tone: 'secondary' };
    return { text: `Balance: $${value.toFixed(2)}`, tone: value < 0.1 ? 'danger' : value < 0.5 ? 'warning' : 'success' };
  }
  return { text: balance.canConsume ? 'Balance: Active' : 'Balance: No balance', tone: balance.canConsume ? 'success' : 'danger' };
}
