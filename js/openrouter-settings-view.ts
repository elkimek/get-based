import { getOpenRouterKey, getOpenRouterModel } from './api.js';
import { buildProviderSettingsModels, providerSettingsPricing, readProviderSettingsModels } from './provider-settings-models.js';
import type { StoredProviderModel } from './api-provider-storage.js';
import type { OpenRouterModelState, OpenRouterSettingsSnapshot, OpenRouterStatus } from './openrouter-settings-contract.js';

export function openRouterPricing(modelId: string): OpenRouterStatus {
  return providerSettingsPricing('openrouter', modelId);
}
export function buildOpenRouterModelState(models?: readonly StoredProviderModel[], modelId = getOpenRouterModel()): OpenRouterModelState {
  return buildProviderSettingsModels('openrouter', models ?? readProviderSettingsModels('labcharts-openrouter-models'), modelId);
}
export function buildOpenRouterSettingsSnapshot(): OpenRouterSettingsSnapshot {
  return { connected: !!getOpenRouterKey(), models: buildOpenRouterModelState() };
}
export function openRouterBalance(remaining: unknown): OpenRouterStatus {
  const value = parseFloat(String(remaining));
  if (!Number.isFinite(value)) return { text: 'Balance: unavailable', tone: 'secondary' };
  return { text: `Balance: $${value.toFixed(2)}`, tone: value < 0.1 ? 'danger' : value < 0.5 ? 'warning' : 'success' };
}
