import { getVeniceKey, getVeniceModel, getVeniceE2EE, isVeniceE2EEActive } from './api.js';
import { buildProviderSettingsModels, providerSettingsPricing, readProviderSettingsModels } from './provider-settings-models.js';
import type { StoredProviderModel } from './api-provider-storage.js';
import type { VeniceModelState, VeniceModeState, VeniceSettingsSnapshot, VeniceStatus } from './venice-settings-contract.js';

export function readVeniceModels(encrypted = getVeniceE2EE()): StoredProviderModel[] {
  return readProviderSettingsModels(encrypted ? 'labcharts-venice-e2ee-models' : 'labcharts-venice-models');
}
export function venicePricing(modelId: string): VeniceStatus { return providerSettingsPricing('venice', modelId); }
export function buildVeniceModelState(rows = readVeniceModels(), modelId = getVeniceModel()): VeniceModelState {
  return buildProviderSettingsModels('venice', rows, modelId);
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
