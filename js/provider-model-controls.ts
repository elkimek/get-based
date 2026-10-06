import type { StoredProviderModel } from './api-provider-storage.js';

// provider-model-controls.js - provider model dropdowns, pricing, and custom model selection.

import { getVeniceSettingsView } from './venice-settings-component.js';
import { buildVeniceModelState, buildVeniceModeState, readVeniceModels, venicePricing } from './venice-settings-view.js';
import { getOpenRouterSettingsView } from './openrouter-settings-component.js';
import { buildOpenRouterModelState, openRouterPricing } from './openrouter-settings-view.js';
import { getErrorMessage } from './caught-error.js';
import { escapeHTML, showNotification } from './utils.js';
import {
  fetchOpenRouterModelPricing,
  getCustomApiModel,
  getAIProvider,
  getOpenRouterKey,
  getOpenRouterModel,
  getPpqModel,
  getRoutstrModel,
  isRoutstrPrivateModeActive,
  getVeniceE2EE,
  getVeniceModel,
  renderModelPricingHint,
  setCustomApiModel,
  setOpenRouterModel,
  setPpqModel,
  setPpqPrivateMode,
  setRoutstrModel,
  setVeniceE2EE,
  setVeniceModel,
} from './api.js';
import { buildModelOptions } from './provider-panel-renderers.js';
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

export function updateRoutstrModelPricing(modelId?: string) {
  const el = document.getElementById('routstr-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('routstr', modelId || getRoutstrModel());
}

export function renderRoutstrModelDropdown(models: StoredProviderModel[]) {
  const area = document.getElementById('routstr-model-area');
  if (!area || !models.length) return;
  let currentModel = getRoutstrModel();
  const modelIds = models.map(m => m.id);
  if (currentModel && !modelIds.includes(currentModel)) {
    currentModel = modelIds[0]!;
    setRoutstrModel(currentModel);
  }
  const opts = buildModelOptions('routstr', models, currentModel, function(m) { return m.name || m.id; });
  area.innerHTML = '<label style="font-size:12px;color:var(--text-muted)">Model</label>' +
    '<select class="api-key-input" id="routstr-model-select" style="margin-top:4px" data-provider-panel-change="routstr-model">' + opts + '</select>' +
    '<div id="routstr-model-pricing" style="margin-top:4px">' + renderModelPricingHint('routstr', currentModel) + '</div>';
}

export function refreshRoutstrPrivateControls() {
  const controls = document.getElementById('routstr-private-controls');
  if (!controls) return;
  let privateModels: unknown[] = [];
  try { privateModels = JSON.parse(localStorage.getItem('labcharts-routstr-private-models') || '[]'); } catch {}
  controls.style.display = privateModels.length || isRoutstrPrivateModeActive() ? '' : 'none';
  const toggle = (document.getElementById('routstr-private-toggle') as HTMLInputElement | null);
  if (toggle) toggle.checked = isRoutstrPrivateModeActive();
  const indicator = document.getElementById('routstr-private-indicator');
  if (indicator) indicator.style.display = isRoutstrPrivateModeActive() ? '' : 'none';
}

export function onRoutstrModelDropdownChange(value: string) {
  setRoutstrModel(value);
  localStorage.setItem(value.startsWith('tinfoil-') ? 'labcharts-routstr-model-private' : 'labcharts-routstr-model-regular', value);
  updateRoutstrModelPricing(value);
  refreshRoutstrPrivateControls();
}

export function toggleRoutstrPrivateMode(on: boolean) {
  const listKey = on ? 'labcharts-routstr-private-models' : 'labcharts-routstr-models';
  let models: StoredProviderModel[] = [];
  try { models = JSON.parse(localStorage.getItem(listKey) || '[]'); } catch {}
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

export function renderPpqModelDropdown(models: StoredProviderModel[]) {
  const area = document.getElementById('ppq-model-area');
  if (!area || !models.length) return;
  const currentModel = getPpqModel();
  const opts = buildModelOptions('ppq', models, currentModel, function(m) { return m.name || m.id; });
  area.innerHTML = '<label style="font-size:12px;color:var(--text-muted)">Model</label>' +
    '<select class="api-key-input" id="ppq-model-select" style="margin-top:4px" data-provider-panel-change="ppq-model">' + opts + '</select>' +
    '<div id="ppq-model-pricing" style="margin-top:4px">' + renderModelPricingHint('ppq', currentModel) + '</div>';
}

export function togglePpqPrivateMode(on: boolean) {
  setPpqPrivateMode(on);
  const listKey = on ? 'labcharts-ppq-private-models' : 'labcharts-ppq-models';
  let models: StoredProviderModel[] = []; try { models = JSON.parse(localStorage.getItem(listKey) || '[]'); } catch {}
  if (models.length) {
    const prevKey = on ? 'labcharts-ppq-model-regular' : 'labcharts-ppq-model-private';
    const restoreKey = on ? 'labcharts-ppq-model-private' : 'labcharts-ppq-model-regular';
    localStorage.setItem(prevKey, getPpqModel());
    const restored = localStorage.getItem(restoreKey);
    const newModel = restored && models.some(m => m.id === restored) ? restored : models[0]!.id;
    setPpqModel(newModel);
    renderPpqModelDropdown(models);
  }
  const el = document.getElementById('ppq-private-indicator');
  if (el) el.style.display = on ? '' : 'none';
  refreshProviderModelUiRuntime();
}

export function updatePpqModelPricing(modelId: string) {
  const el = document.getElementById('ppq-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('ppq', modelId);
}

export function renderCustomApiModelDropdown(models: StoredProviderModel[]) {
  const area = document.getElementById('custom-model-area');
  if (!area) return;
  const currentModel = getCustomApiModel();
  const opts = buildModelOptions('custom', models, currentModel, function(m) { return m.name || m.id; });
  const isCustom = !models.some(m => m.id === currentModel) && currentModel;
  area.innerHTML = `<label style="font-size:12px;color:var(--text-muted)">Model</label>
    <select class="api-key-input" id="custom-model-select" style="margin-top:4px" data-provider-panel-change="custom-model">${isCustom ? '<option value="__custom" disabled selected>Using custom model</option>' : ''}${opts}</select>
    <div style="margin-top:6px;display:flex;align-items:center;gap:8px"><input type="text" id="custom-manual-model" placeholder="Or type any model ID and press Enter" style="font-size:11px;flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-primary);font-family:monospace${isCustom ? ';border-color:var(--accent)' : ''}" value="${isCustom ? escapeHTML(currentModel) : ''}" data-provider-panel-key="custom-manual-model"></div>
    <div id="custom-model-pricing" style="margin-top:4px">${renderModelPricingHint('custom', currentModel)}</div>`;
}

export function updateCustomModelPricing(modelId?: string) {
  const el = document.getElementById('custom-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('custom', modelId || getCustomApiModel());
}

export function applyCustomApiManualModel() {
  const input = (document.getElementById('custom-manual-model') as HTMLInputElement | null);
  if (!input) return;
  const model = input.value.trim();
  if (!model) { showNotification('Enter a model ID', 'error'); return; }
  setCustomApiModel(model);
  const select = (document.getElementById('custom-model-select') as HTMLSelectElement | null);
  if (select) select.value = model;
  updateCustomModelPricing(model);
  showNotification('Model set to ' + model, 'success');
}
