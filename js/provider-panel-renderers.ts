import { CUSTOM_SETTINGS_HOST } from './custom-settings-contract.js';
import type { StoredProviderModel } from './api-provider-storage.js';

// provider-panel-renderers.js — AI provider settings panel markup

import { ROUTSTR_SETTINGS_HOST } from './routstr-settings-contract.js';
import { PPQ_SETTINGS_HOST } from './ppq-settings-contract.js';
import { VENICE_SETTINGS_HOST } from './venice-settings-contract.js';
import { OPENROUTER_SETTINGS_HOST } from './openrouter-settings-contract.js';
import { escapeHTML, escapeAttr } from './utils.js';
import {
  renderModelPricingHint, selectLatestRecommendedModels,
  getOllamaConfig, getOllamaMainModel
} from './api.js';
import { getLocalAiExecutionLocation } from './local-ai-discovery.js';
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

// Local AI panel — works with any OpenAI-compatible server (Ollama, LM Studio, Jan, etc.)
function renderLocalAIProviderPanel() {
  const config = getOllamaConfig();
  const executionLocation = getLocalAiExecutionLocation(config.url, getOllamaMainModel());
  const locationCopy = executionLocation === 'cloud'
    ? 'The selected model is cloud-hosted and sends requests off-device.'
    : executionLocation === 'local'
      ? 'The configured server is on this device.'
      : executionLocation === 'lan'
        ? 'The configured server is on your local network; requests leave this browser device.'
        : 'The configured endpoint is remote; its operator and transport determine privacy.';
  const insecureRemote = executionLocation !== 'local' && executionLocation !== 'cloud' && /^http:\/\//i.test(config.url);
  return `<form class="ai-provider-panel">
    <input type="text" name="ai-provider" value="local-ai" autocomplete="username" hidden>
    <div class="ai-provider-desc">Connects directly to an OpenAI-compatible server. ${escapeHTML(locationCopy)} Cloud-tagged models are not considered private/local. Works with <a href="https://ollama.com" target="_blank" rel="noopener" style="color:var(--accent)">Ollama</a>, <a href="https://lmstudio.ai" target="_blank" rel="noopener" style="color:var(--accent)">LM Studio</a>, <a href="https://unsloth.ai" target="_blank" rel="noopener" style="color:var(--accent)">Unsloth Studio</a>, <a href="https://jan.ai" target="_blank" rel="noopener" style="color:var(--accent)">Jan</a>, llama.cpp, LocalAI, and others.</div>
    ${insecureRemote ? '<div class="api-key-notice" style="color:var(--warning);margin-bottom:10px">This remote connection uses plain HTTP. Health data and API credentials are not protected by HTTPS unless your underlying VPN/tunnel encrypts the connection.</div>' : ''}
    <div class="local-ai-status" id="local-ai-status">
      <span class="local-ai-status-dot" id="local-ai-dot"></span>
      <span id="local-ai-status-text">Checking connection...</span>
    </div>
    <div style="margin-top:8px">
      <label style="font-size:12px;color:var(--text-muted)">Server address</label>
      <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
        <input type="text" class="api-key-input" id="local-ai-url-input" value="${escapeAttr(config.url)}" placeholder="http://localhost:11434" style="flex:1">
        <button class="import-btn import-btn-secondary" data-provider-panel-action="test-ollama-connection" style="white-space:nowrap">Test</button>
      </div>
    </div>
    <div style="margin-top:8px">
      <label style="font-size:12px;color:var(--text-muted)">API Key <span style="font-size:11px">(optional — most local servers don't need one)</span></label>
      <input type="password" class="api-key-input" id="local-ai-apikey-input" value="${escapeAttr(config.apiKey)}" placeholder="Leave empty if not required" style="margin-top:4px" autocomplete="new-password">
    </div>
    <div id="local-ai-model-section" style="margin-top:8px;display:none">
      <label style="font-size:12px;color:var(--text-muted)">AI Model</label>
      <select class="api-key-input" id="local-ai-model-select" style="margin-top:4px" data-provider-panel-change="local-ai-model"></select>
      <div style="margin-top:4px">${renderModelPricingHint('ollama', '')}</div>
    </div>
    <div id="local-ai-advisor"></div>
    <div class="api-key-notice" style="margin-top:12px">
      Connects via <code style="font-size:11px;padding:2px 4px;background:var(--bg-primary);border-radius:3px">/v1/chat/completions</code>. Test the server address above for endpoint-specific connection guidance.
    </div>
  </form>`;
}

export function renderAIProviderPanel(provider: unknown) {
  if (provider === 'openrouter') return OPENROUTER_SETTINGS_HOST;
  if (provider === 'routstr') return renderRoutstrProviderPanel();
  if (provider === 'venice') return renderVeniceProviderPanel();
  if (provider === 'ppq') return renderPpqProviderPanel();
  if (provider === 'custom') return renderCustomProviderPanel();
  return renderLocalAIProviderPanel();
}
