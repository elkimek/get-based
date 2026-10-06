import { getOpenRouterKey, getOpenRouterModel, selectLatestRecommendedModels } from './api.js';
import { getModelPricing } from './schema.js';
import type { StoredProviderModel } from './api-provider-storage.js';
import type { OpenRouterModelState, OpenRouterSettingsSnapshot, OpenRouterStatus } from './openrouter-settings-contract.js';

export function openRouterPricing(modelId: string): OpenRouterStatus {
  const pricing = getModelPricing('openrouter', modelId);
  if (pricing.input === 0 && pricing.output === 0) return { text: 'Free', tone: 'success' };
  const prefix = pricing.approx ? '~' : '';
  return { text: `${prefix}$${pricing.input.toFixed(2)}/M in · ${prefix}$${pricing.output.toFixed(2)}/M out`, tone: 'secondary' };
}
function isStoredModel(value: unknown): value is StoredProviderModel {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && row.id.length > 0
    && (row.name === undefined || typeof row.name === 'string');
}

export function buildOpenRouterModelState(models?: readonly StoredProviderModel[], modelId = getOpenRouterModel()): OpenRouterModelState {
  let rows = models;
  if (!rows) {
    try {
      const cached: unknown = JSON.parse(localStorage.getItem('labcharts-openrouter-models') || '[]');
      rows = Array.isArray(cached) ? cached.filter(isStoredModel) : [];
    }
    catch { rows = []; }
  }
  const recommended = selectLatestRecommendedModels('openrouter', [...rows]);
  const ids = new Set(recommended.map(model => model.id));
  const other = rows.filter(model => !ids.has(model.id));
  const options = (list: readonly StoredProviderModel[]) => list.map(model => ({ value: model.id, label: model.name || model.id }));
  const groups = [];
  if (recommended.length) groups.push({ label: 'Recommended', options: options(recommended) });
  if (other.length) groups.push({ label: recommended.length ? 'Other models' : '', options: options(other) });
  const selected = rows.find(model => model.id === modelId);
  const modelDisplay = selected?.name || selected?.id || modelId;
  return { selectedModel: modelId, modelDisplay, groups, pricing: openRouterPricing(modelId) };
}
export function buildOpenRouterSettingsSnapshot(): OpenRouterSettingsSnapshot {
  return { connected: !!getOpenRouterKey(), models: buildOpenRouterModelState() };
}
export function openRouterBalance(remaining: unknown): OpenRouterStatus {
  const value = parseFloat(String(remaining));
  if (!Number.isFinite(value)) return { text: 'Balance: unavailable', tone: 'secondary' };
  return { text: `Balance: $${value.toFixed(2)}`, tone: value < 0.1 ? 'danger' : value < 0.5 ? 'warning' : 'success' };
}
