import { getPpqKey, getPpqModel, getPpqPrivateMode, isPpqPrivateModeActive } from './api-provider-storage.js';
import { buildProviderSettingsModels, providerSettingsPricing, readProviderSettingsModels } from './provider-settings-models.js';
import type { ProviderSettingsStatus } from './provider-settings-contract.js';
export const readPpqModels = (privateMode = getPpqPrivateMode()) => readProviderSettingsModels(privateMode ? 'labcharts-ppq-private-models' : 'labcharts-ppq-models');
export const ppqPricing = (modelId: string) => providerSettingsPricing('ppq', modelId);
export const buildPpqModelState = (models = readPpqModels(), modelId = getPpqModel()) => buildProviderSettingsModels('ppq', models, modelId);
export const buildPpqModeState = () => ({ enabled: getPpqPrivateMode(), available: readPpqModels(true).length > 0, active: isPpqPrivateModeActive() && readPpqModels(true).some(model => model.id === getPpqModel()) });
export const buildPpqSettingsSnapshot = () => ({ connected: !!getPpqKey(), models: buildPpqModelState(), mode: buildPpqModeState() });
export function ppqBalance(balance: unknown): ProviderSettingsStatus {
  const value = balance == null ? NaN : parseFloat(String(balance));
  if (!Number.isFinite(value)) return { text: 'Balance: unavailable', tone: 'secondary' };
  return { text: `Balance: $${value.toFixed(2)}`, tone: value < 0.1 ? 'danger' : value < 0.5 ? 'warning' : 'success' };
}
