// @ts-check
// provider-model-controls.js - provider model dropdowns, pricing, and custom model selection.

import { escapeHTML, showNotification } from './utils.js';
import {
  fetchOpenRouterModelPricing,
  getCustomApiModel,
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

export function updateVeniceModelPricing(modelId) {
  const el = document.getElementById('venice-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('venice', modelId || getVeniceModel());
}

export function renderVeniceModelDropdown(models) {
  const area = document.getElementById('venice-model-area');
  if (!area || !models.length) return;
  const currentModel = getVeniceModel();
  const opts = buildModelOptions('venice', models, currentModel, function(m) { return m.name || m.id; });
  area.innerHTML = '<label style="font-size:12px;color:var(--text-muted)">Model</label>' +
    '<select class="api-key-input" id="venice-model-select" style="margin-top:4px" data-provider-panel-change="venice-model">' + opts + '</select>' +
    '<div id="venice-model-pricing" style="margin-top:4px">' + renderModelPricingHint('venice', currentModel) + '</div>';
}

export function onVeniceModelDropdownChange(value) {
  const previous = getVeniceModel();
  setVeniceModel(value);
  localStorage.setItem(getVeniceE2EE() ? 'labcharts-venice-model-e2ee' : 'labcharts-venice-model-regular', value);
  if (previous !== value) clearProviderE2EESessionRuntime();
  updateVeniceModelPricing(value);
}

export function toggleVeniceE2EE(on) {
  setVeniceE2EE(on);
  if (!on) clearProviderE2EESessionRuntime();
  // Swap model dropdown to E2EE or regular model list.
  const listKey = on ? 'labcharts-venice-e2ee-models' : 'labcharts-venice-models';
  let models = []; try { models = JSON.parse(localStorage.getItem(listKey) || '[]'); } catch {}
  if (models.length) {
    const prevKey = on ? 'labcharts-venice-model-regular' : 'labcharts-venice-model-e2ee';
    const restoreKey = on ? 'labcharts-venice-model-e2ee' : 'labcharts-venice-model-regular';
    localStorage.setItem(prevKey, getVeniceModel());
    const restored = localStorage.getItem(restoreKey);
    const newModel = restored && models.some(m => m.id === restored) ? restored : models[0].id;
    setVeniceModel(newModel);
    renderVeniceModelDropdown(models);
  }
  const el = document.getElementById('venice-e2ee-indicator');
  if (el) el.style.display = on ? '' : 'none';
  refreshProviderModelUiRuntime();
}

export function updateOpenRouterModelPricing(modelId) {
  const el = document.getElementById('openrouter-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('openrouter', modelId || getOpenRouterModel());
}

export function renderOpenRouterModelDropdown(models) {
  const area = document.getElementById('openrouter-model-area');
  if (!area || !models.length) return;
  const currentModel = getOpenRouterModel();
  const isCustom = !models.some(m => m.id === currentModel);
  const opts = buildModelOptions('openrouter', models, currentModel, function(m) { return m.name || m.id; });
  area.innerHTML = '<label style="font-size:12px;color:var(--text-muted)">Model</label>' +
    '<select class="api-key-input" id="openrouter-model-select" style="margin-top:4px" data-provider-panel-change="openrouter-model">' + opts + '</select>' +
    '<div style="margin-top:6px;display:flex;align-items:center;gap:8px"><input type="text" class="api-key-input" id="openrouter-custom-model" placeholder="Or enter model ID (e.g. arcee-ai/trinity-large-preview:free)" style="font-size:12px;flex:1' + (isCustom ? ';border-color:var(--accent)' : '') + '" value="' + (isCustom ? escapeHTML(currentModel) : '') + '" data-provider-panel-key="openrouter-custom-model"><span id="openrouter-model-health" style="font-size:16px;min-width:20px;text-align:center"></span></div>' +
    '<span style="font-size:11px;color:var(--text-muted);margin-top:2px;display:block">Press Enter to apply — checks model connectivity</span>' +
    '<div id="openrouter-model-pricing" style="margin-top:4px">' + renderModelPricingHint('openrouter', currentModel) + '</div>';
}

export async function applyCustomOpenRouterModel(modelId) {
  const id = modelId.trim();
  if (!id) return;
  setOpenRouterModel(id);
  const pricingEl = document.getElementById('openrouter-model-pricing');
  if (pricingEl) pricingEl.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">Checking pricing\u2026</span>';
  const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('openrouter-model-select'));
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('openrouter-custom-model'));
  const inDropdown = select && [...select.options].some(o => o.value === id);
  if (select) {
    if (inDropdown) {
      select.value = id;
      if (input) { input.value = ''; input.style.borderColor = ''; }
    } else {
      let customOpt = /** @type {HTMLOptionElement | null} */ (select.querySelector('option[value="__custom"]'));
      if (!customOpt) {
        customOpt = document.createElement('option');
        customOpt.value = '__custom';
        customOpt.disabled = true;
        customOpt.textContent = 'Using custom model';
        select.insertBefore(customOpt, select.firstChild);
      }
      customOpt.selected = true;
    }
  }
  const indicator = document.getElementById('openrouter-model-health');
  if (indicator) { indicator.textContent = '\u23f3'; indicator.title = 'Checking...'; indicator.style.color = 'var(--text-muted)'; }
  try {
    await callProviderModelSmokeTestRuntime();
    if (indicator) { indicator.textContent = '\u2713'; indicator.title = 'Model responding'; indicator.style.color = 'var(--green)'; }
    if (input && !inDropdown) input.style.borderColor = 'var(--green)';
    showNotification('Model set: ' + id, 'info');
    await fetchOpenRouterModelPricing(id);
    updateOpenRouterModelPricing(id);
  } catch (e) {
    if (indicator) { indicator.textContent = '\u2717'; indicator.title = e.message || 'Connection failed'; indicator.style.color = 'var(--red)'; }
    if (input) input.style.borderColor = 'var(--red)';
    updateOpenRouterModelPricing(id);
    showNotification('Model check failed: ' + (e.message || 'unknown error'), 'error');
  }
}

export function onOpenRouterDropdownChange(value) {
  setOpenRouterModel(value);
  updateOpenRouterModelPricing(value);
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('openrouter-custom-model'));
  if (input) { input.value = ''; input.style.borderColor = ''; }
  const health = document.getElementById('openrouter-model-health');
  if (health) { health.textContent = ''; health.title = ''; }
  const select = document.getElementById('openrouter-model-select');
  const customOpt = select?.querySelector('option[value="__custom"]');
  if (customOpt) customOpt.remove();
}

export function updateRoutstrModelPricing(modelId) {
  const el = document.getElementById('routstr-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('routstr', modelId || getRoutstrModel());
}

export function renderRoutstrModelDropdown(models) {
  const area = document.getElementById('routstr-model-area');
  if (!area || !models.length) return;
  let currentModel = getRoutstrModel();
  const modelIds = models.map(m => m.id);
  if (currentModel && !modelIds.includes(currentModel)) {
    currentModel = modelIds[0];
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
  let privateModels = [];
  try { privateModels = JSON.parse(localStorage.getItem('labcharts-routstr-private-models') || '[]'); } catch {}
  controls.style.display = privateModels.length || isRoutstrPrivateModeActive() ? '' : 'none';
  const toggle = /** @type {HTMLInputElement | null} */ (document.getElementById('routstr-private-toggle'));
  if (toggle) toggle.checked = isRoutstrPrivateModeActive();
  const indicator = document.getElementById('routstr-private-indicator');
  if (indicator) indicator.style.display = isRoutstrPrivateModeActive() ? '' : 'none';
}

export function onRoutstrModelDropdownChange(value) {
  setRoutstrModel(value);
  localStorage.setItem(value.startsWith('tinfoil-') ? 'labcharts-routstr-model-private' : 'labcharts-routstr-model-regular', value);
  updateRoutstrModelPricing(value);
  refreshRoutstrPrivateControls();
}

export function toggleRoutstrPrivateMode(on) {
  const listKey = on ? 'labcharts-routstr-private-models' : 'labcharts-routstr-models';
  let models = [];
  try { models = JSON.parse(localStorage.getItem(listKey) || '[]'); } catch {}
  if (!models.length) { refreshRoutstrPrivateControls(); return; }
  const previousKey = on ? 'labcharts-routstr-model-regular' : 'labcharts-routstr-model-private';
  const restoreKey = on ? 'labcharts-routstr-model-private' : 'labcharts-routstr-model-regular';
  localStorage.setItem(previousKey, getRoutstrModel());
  const restored = localStorage.getItem(restoreKey);
  const privatePreferredIds = ['tinfoil-gemma4-31b', 'tinfoil-kimi-k2-6', 'tinfoil-deepseek-v4-pro', 'tinfoil-glm-5-2'];
  const preferred = on ? privatePreferredIds.map(id => models.find(model => model.id === id)).find(Boolean) : null;
  const next = restored && models.some(model => model.id === restored) ? restored : (preferred?.id || models[0].id);
  setRoutstrModel(next);
  localStorage.setItem(restoreKey, next);
  renderRoutstrModelDropdown(models);
  refreshRoutstrPrivateControls();
  refreshProviderModelUiRuntime();
}

export function renderPpqModelDropdown(models) {
  const area = document.getElementById('ppq-model-area');
  if (!area || !models.length) return;
  const currentModel = getPpqModel();
  const opts = buildModelOptions('ppq', models, currentModel, function(m) { return m.name || m.id; });
  area.innerHTML = '<label style="font-size:12px;color:var(--text-muted)">Model</label>' +
    '<select class="api-key-input" id="ppq-model-select" style="margin-top:4px" data-provider-panel-change="ppq-model">' + opts + '</select>' +
    '<div id="ppq-model-pricing" style="margin-top:4px">' + renderModelPricingHint('ppq', currentModel) + '</div>';
}

export function togglePpqPrivateMode(on) {
  setPpqPrivateMode(on);
  const listKey = on ? 'labcharts-ppq-private-models' : 'labcharts-ppq-models';
  let models = []; try { models = JSON.parse(localStorage.getItem(listKey) || '[]'); } catch {}
  if (models.length) {
    const prevKey = on ? 'labcharts-ppq-model-regular' : 'labcharts-ppq-model-private';
    const restoreKey = on ? 'labcharts-ppq-model-private' : 'labcharts-ppq-model-regular';
    localStorage.setItem(prevKey, getPpqModel());
    const restored = localStorage.getItem(restoreKey);
    const newModel = restored && models.some(m => m.id === restored) ? restored : models[0].id;
    setPpqModel(newModel);
    renderPpqModelDropdown(models);
  }
  const el = document.getElementById('ppq-private-indicator');
  if (el) el.style.display = on ? '' : 'none';
  refreshProviderModelUiRuntime();
}

export function updatePpqModelPricing(modelId) {
  const el = document.getElementById('ppq-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('ppq', modelId);
}

export function renderCustomApiModelDropdown(models) {
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

export function updateCustomModelPricing(modelId) {
  const el = document.getElementById('custom-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('custom', modelId || getCustomApiModel());
}

export function applyCustomApiManualModel() {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('custom-manual-model'));
  if (!input) return;
  const model = input.value.trim();
  if (!model) { showNotification('Enter a model ID', 'error'); return; }
  setCustomApiModel(model);
  const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('custom-model-select'));
  if (select) select.value = model;
  updateCustomModelPricing(model);
  showNotification('Model set to ' + model, 'success');
}
