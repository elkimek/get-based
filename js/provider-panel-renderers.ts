import { LOCAL_AI_SETTINGS_HOST } from './local-ai-settings-contract.js';
import { CUSTOM_SETTINGS_HOST } from './custom-settings-contract.js';
import type { StoredProviderModel } from './api-provider-storage.js';

// provider-panel-renderers.js — AI provider settings panel markup

import { ROUTSTR_SETTINGS_HOST } from './routstr-settings-contract.js';
import { PPQ_SETTINGS_HOST } from './ppq-settings-contract.js';
import { VENICE_SETTINGS_HOST } from './venice-settings-contract.js';
import { OPENROUTER_SETTINGS_HOST } from './openrouter-settings-contract.js';
import { escapeHTML } from './utils.js';
import {
  selectLatestRecommendedModels
} from './api.js';

export function buildModelOptions<Model extends StoredProviderModel>(provider: string, models: Model[], currentModel: string, labelFn: (model: Model) => unknown) {
  const rec = selectLatestRecommendedModels(provider, models);
  const recIds = new Set(rec.map(function(m) { return m.id; }));
  const rest = models.filter(function(m) { return !recIds.has(m.id); });
  const modelOption = function(m: Model) {
    return '<option value="' + m.id + '"' + (currentModel === m.id ? ' selected' : '') + '>' + escapeHTML(labelFn(m)) + '</option>';
  };
  let html = '';
  if (rec.length) {
    html += '<optgroup label="Recommended">';
    html += rec.map(modelOption).join('');
    html += '</optgroup>';
  }
  if (rest.length) {
    html += (rec.length ? '<optgroup label="Other models">' : '');
    html += rest.map(modelOption).join('');
    if (rec.length) html += '</optgroup>';
  }
  return html;
}

function renderRoutstrProviderPanel(): string { return ROUTSTR_SETTINGS_HOST; }

function renderVeniceProviderPanel(): string { return VENICE_SETTINGS_HOST; }

function renderPpqProviderPanel(): string { return PPQ_SETTINGS_HOST; }

function renderCustomProviderPanel(): string { return CUSTOM_SETTINGS_HOST; }

function renderLocalAIProviderPanel(): string { return LOCAL_AI_SETTINGS_HOST; }

export function renderAIProviderPanel(provider: unknown) {
  if (provider === 'openrouter') return OPENROUTER_SETTINGS_HOST;
  if (provider === 'routstr') return renderRoutstrProviderPanel();
  if (provider === 'venice') return renderVeniceProviderPanel();
  if (provider === 'ppq') return renderPpqProviderPanel();
  if (provider === 'custom') return renderCustomProviderPanel();
  return renderLocalAIProviderPanel();
}
