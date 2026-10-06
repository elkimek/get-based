import { getCustomSettingsView } from './custom-settings-component.js';
import { buildCustomModelState } from './custom-settings-view.js';
import { getRoutstrModelSettingsView, mountRoutstrModelSettings, disposeRoutstrModelSettings } from './routstr-model-settings-component.js';
import { buildRoutstrModelSettingsSnapshot, buildRoutstrModelState, buildRoutstrModeState, readRoutstrModels } from './routstr-model-settings-view.js';
import { getPpqSettingsView } from './ppq-settings-component.js';
import { buildPpqModelState, buildPpqModeState, readPpqModels, ppqPricing } from './ppq-settings-view.js';
import type { StoredProviderModel } from './api-provider-storage.js';

// provider-model-controls.js - provider model dropdowns, pricing, and custom model selection.

import { getVeniceSettingsView } from './venice-settings-component.js';
import { buildVeniceModelState, buildVeniceModeState, readVeniceModels, venicePricing } from './venice-settings-view.js';
import { getOpenRouterSettingsView } from './openrouter-settings-component.js';
import { buildOpenRouterModelState, openRouterPricing } from './openrouter-settings-view.js';
import { getErrorMessage } from './caught-error.js';
import { showNotification } from './utils.js';
import {
  fetchOpenRouterModelPricing,
  getCustomApiModel,
  getAIProvider,
  getOpenRouterKey,
  getOpenRouterModel,
  getPpqModel,
  getRoutstrModel,
  getVeniceE2EE,
  getVeniceModel,
  setCustomApiModel,
  setOpenRouterModel,
  setPpqModel,
  setPpqPrivateMode,
  setRoutstrModel,
  setVeniceE2EE,
  setVeniceModel,
} from './api.js';
import {
  callProviderModelSmokeTestRuntime,
  clearProviderE2EESessionRuntime,
  refreshProviderModelUiRuntime,
} from './provider-model-controls-runtime.js';

export function updateVeniceModelPricing(modelId?: string): void {
  const view = getVeniceSettingsView();
  const selectedModel = modelId || getVeniceModel();
  if (!view) return;
  view.setModels({ ...view.getModels(), selectedModel, pricing: venicePricing(selectedModel) });
  view.setMode(buildVeniceModeState());
}
export function renderVeniceModelDropdown(models: StoredProviderModel[]): void {
  if (!models.length) return;
  const view = getVeniceSettingsView();
  view?.setModels(buildVeniceModelState(models));
  view?.setMode(buildVeniceModeState());
}

export function onVeniceModelDropdownChange(value: string) {
  const previous = getVeniceModel();
  setVeniceModel(value);
  localStorage.setItem(getVeniceE2EE() ? 'labcharts-venice-model-e2ee' : 'labcharts-venice-model-regular', value);
  if (previous !== value) clearProviderE2EESessionRuntime();
  updateVeniceModelPricing(value);
}

export function toggleVeniceE2EE(on: boolean) {
  setVeniceE2EE(on);
  if (!on) clearProviderE2EESessionRuntime();
  // Swap model dropdown to E2EE or regular model list.
  const models = readVeniceModels(on);
  if (models.length) {
    const prevKey = on ? 'labcharts-venice-model-regular' : 'labcharts-venice-model-e2ee';
    const restoreKey = on ? 'labcharts-venice-model-e2ee' : 'labcharts-venice-model-regular';
    localStorage.setItem(prevKey, getVeniceModel());
    const restored = localStorage.getItem(restoreKey);
    const newModel = restored && models.some(m => m.id === restored) ? restored : models[0]!.id;
    setVeniceModel(newModel);
    renderVeniceModelDropdown(models);
  }
  getVeniceSettingsView()?.setMode(buildVeniceModeState());
  refreshProviderModelUiRuntime();
}

export function updateOpenRouterModelPricing(modelId?: string): void {
  const view = getOpenRouterSettingsView();
  const selectedModel = modelId || getOpenRouterModel();
  if (view) view.setModels({ ...view.getModels(), selectedModel, pricing: openRouterPricing(selectedModel) });
}
export function renderOpenRouterModelDropdown(models: StoredProviderModel[]): void {
  if (!models.length) return;
  getOpenRouterSettingsView()?.setModels(buildOpenRouterModelState(models));
}
let openRouterModelAttempt = 0;
export async function applyCustomOpenRouterModel(modelId: string): Promise<void> {
  const id = modelId.trim();
  if (!id) return;
  const view = getOpenRouterSettingsView();
  if (!view || getAIProvider() !== 'openrouter') return;
  const credential = getOpenRouterKey();
  setOpenRouterModel(id);
  const sequence = ++openRouterModelAttempt;
  const current = () => !!view?.isCurrent() && sequence === openRouterModelAttempt && getOpenRouterModel() === id && getAIProvider() === 'openrouter' && getOpenRouterKey() === credential;
  view?.setModels({ ...view.getModels(), selectedModel: id, pricing: { text: 'Checking pricing…', tone: 'secondary' } });
  view?.setModelCheck('pending', 'Checking...');
  try {
    await callProviderModelSmokeTestRuntime();
    if (!current()) return;
    view!.setModelCheck('success', 'Model responding');
    showNotification('Model set: ' + id, 'info');
    await fetchOpenRouterModelPricing(id);
    if (!current()) return;
    view!.setModels({ ...view!.getModels(), selectedModel: id, pricing: openRouterPricing(id) });
  } catch (error) {
    if (!current()) return;
    view!.setModels({ ...view!.getModels(), selectedModel: id, pricing: openRouterPricing(id) });
    view!.setModelCheck('error', getErrorMessage(error, 'Connection failed'));
    showNotification('Model check failed: ' + getErrorMessage(error, 'unknown error'), 'error');
  }
}
export function onOpenRouterDropdownChange(value: string): void {
  ++openRouterModelAttempt;
  setOpenRouterModel(value);
  const view = getOpenRouterSettingsView();
  if (view) view.setModels({ ...view.getModels(), selectedModel: value, pricing: openRouterPricing(value) });
  getOpenRouterSettingsView()?.setModelCheck('idle');
}

export function hydrateRoutstrModelSettings(): void {
  const host = document.querySelector<HTMLElement>('#ai-provider-panel [data-routstr-model-settings-host]');
  if (!host) { disposeRoutstrModelSettings(); return; }
  mountRoutstrModelSettings(host, buildRoutstrModelSettingsSnapshot());
}
export function updateRoutstrModelPricing(modelId = getRoutstrModel()): void {
  const view = getRoutstrModelSettingsView();
  if (view) view.setModels(buildRoutstrModelState(readRoutstrModels(), modelId));
}
export function renderRoutstrModelDropdown(models: StoredProviderModel[]): void {
  if (!getRoutstrModelSettingsView()) hydrateRoutstrModelSettings();
  getRoutstrModelSettingsView()?.setModels(buildRoutstrModelState(models));
  refreshRoutstrPrivateControls();
}
export function refreshRoutstrPrivateControls(): void {
  getRoutstrModelSettingsView()?.setMode(buildRoutstrModeState());
}

export function onRoutstrModelDropdownChange(value: string) {
  setRoutstrModel(value);
  localStorage.setItem(value.startsWith('tinfoil-') ? 'labcharts-routstr-model-private' : 'labcharts-routstr-model-regular', value);
  updateRoutstrModelPricing(value);
  refreshRoutstrPrivateControls();
}

export function toggleRoutstrPrivateMode(on: boolean) {
  const models = readRoutstrModels(on);
  if (!models.length) { refreshRoutstrPrivateControls(); return; }
  const previousKey = on ? 'labcharts-routstr-model-regular' : 'labcharts-routstr-model-private';
  const restoreKey = on ? 'labcharts-routstr-model-private' : 'labcharts-routstr-model-regular';
  localStorage.setItem(previousKey, getRoutstrModel());
  const restored = localStorage.getItem(restoreKey);
  const privatePreferredIds = ['tinfoil-gemma4-31b', 'tinfoil-kimi-k2-6', 'tinfoil-deepseek-v4-pro', 'tinfoil-glm-5-2'];
  const preferred = on ? privatePreferredIds.map(id => models.find(model => model.id === id)).find(Boolean) : null;
  const next = restored && models.some(model => model.id === restored) ? restored : (preferred?.id || models[0]!.id);
  setRoutstrModel(next);
  localStorage.setItem(restoreKey, next);
  renderRoutstrModelDropdown(models);
  refreshRoutstrPrivateControls();
  refreshProviderModelUiRuntime();
}

export function renderPpqModelDropdown(models: StoredProviderModel[]): void {
  if (!models.length) return;
  const view = getPpqSettingsView();
  view?.setModels(buildPpqModelState(models));
  view?.setMode(buildPpqModeState());
}

export function togglePpqPrivateMode(on: boolean): void {
  setPpqPrivateMode(on);
  const models = readPpqModels(on);
  if (models.length) {
    const prevKey = on ? 'labcharts-ppq-model-regular' : 'labcharts-ppq-model-private';
    const restoreKey = on ? 'labcharts-ppq-model-private' : 'labcharts-ppq-model-regular';
    localStorage.setItem(prevKey, getPpqModel());
    const restored = localStorage.getItem(restoreKey);
    const newModel = restored && models.some(m => m.id === restored) ? restored : models[0]!.id;
    setPpqModel(newModel);
  }
  // Missing catalogs retain the user's private-mode intent without presenting
  // a regular-model list as a private catalog or claiming verified capability.
  getPpqSettingsView()?.setModels(buildPpqModelState(models));
  getPpqSettingsView()?.setMode(buildPpqModeState());
  refreshProviderModelUiRuntime();
}

export function updatePpqModelPricing(modelId: string): void {
  const view = getPpqSettingsView();
  if (view) view.setModels({ ...view.getModels(), selectedModel: modelId, pricing: ppqPricing(modelId) });
  view?.setMode(buildPpqModeState());
}

export function renderCustomApiModelDropdown(models: StoredProviderModel[]): void {
  getCustomSettingsView()?.setModels(buildCustomModelState(models));
}
export function updateCustomModelPricing(modelId?: string): void {
  const view = getCustomSettingsView();
  if (view) view.setModels({ ...view.getModels(), selectedModel: modelId || getCustomApiModel(), pricing: { text: '', tone: 'secondary' } });
}
export function applyCustomApiManualModel(): void {
  const view = getCustomSettingsView();
  if (!view || getAIProvider() !== 'custom') return;
  const model = view.readManualModel().trim();
  if (!model) { showNotification('Enter a model ID', 'error'); return; }
  setCustomApiModel(model); updateCustomModelPricing(model);
  showNotification('Model set to ' + model, 'success');
}
