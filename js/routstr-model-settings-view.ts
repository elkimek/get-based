import { getRoutstrKey, getRoutstrModel, isRoutstrTinfoilModel } from './api-provider-storage.js';
import { buildProviderSettingsModels, readProviderSettingsModels } from './provider-settings-models.js';
import type { StoredProviderModel } from './api-provider-storage.js';
import type { ProviderSettingsMode } from './provider-settings-contract.js';
import type { RoutstrModelSettingsSnapshot } from './routstr-model-settings-contract.js';

export function readRoutstrModels(privateMode = isRoutstrTinfoilModel(getRoutstrModel())): StoredProviderModel[] {
  const seen = new Set<string>();
  return readProviderSettingsModels(privateMode ? 'labcharts-routstr-private-models' : 'labcharts-routstr-models')
    .filter(row => {
      if (isRoutstrTinfoilModel(row.id) !== privateMode || seen.has(row.id)) return false;
      seen.add(row.id); return true;
    });
}
export function buildRoutstrModelState(rows = readRoutstrModels(), model = getRoutstrModel()) {
  return buildProviderSettingsModels('routstr', rows, model);
}
export function buildRoutstrModeState(): ProviderSettingsMode {
  const model = getRoutstrModel(), privateModels = readRoutstrModels(true);
  const enabled = isRoutstrTinfoilModel(model);
  return { enabled, available: privateModels.length > 0, active: enabled && privateModels.some(row => row.id === model) };
}
export function buildRoutstrModelSettingsSnapshot(): RoutstrModelSettingsSnapshot {
  return { connected: !!getRoutstrKey(), models: buildRoutstrModelState(), mode: buildRoutstrModeState() };
}
