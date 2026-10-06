import type { StoredProviderModel } from './api-provider-storage.js';

// provider-panel-renderers.js — AI provider settings panel markup

import { PPQ_SETTINGS_HOST } from './ppq-settings-contract.js';
import { VENICE_SETTINGS_HOST } from './venice-settings-contract.js';
import { OPENROUTER_SETTINGS_HOST } from './openrouter-settings-contract.js';
import { escapeHTML, escapeAttr } from './utils.js';
import {
  getRoutstrKey, getRoutstrModel,
  isRoutstrPrivateModeActive,
  getCustomApiUrl, getCustomApiKey, getCustomApiModel,
  getRoutstrModelDisplay,
  renderModelPricingHint, selectLatestRecommendedModels,
  getOllamaConfig, getOllamaMainModel
} from './api.js';
import { getLocalAiExecutionLocation } from './local-ai-discovery.js';
// Preserve wallet startup hooks while consuming its button renderers directly.
import './provider-wallet-panels.js';
import { buildRoutstrNodeActions, routstrWalletActionButtons } from './provider-wallet-panel-buttons.js';
import {
  discoverRoutstrNodesFromRuntime,
  getSelectedRoutstrNodeFromRuntime,
  setSelectedRoutstrNodeFromRuntime,
} from './provider-panel-renderers-runtime.js';

function readStoredArray(key: string): StoredProviderModel[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

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

function renderRoutstrProviderPanel() {
  const currentKey = getRoutstrKey();
  const rsModel = getRoutstrModel();
  const nodeUrl = getSelectedRoutstrNodeFromRuntime();
  const cachedRSModels = readStoredArray('labcharts-routstr-models');
  const cachedPrivateRSModels = readStoredArray('labcharts-routstr-private-models');
  const routstrPrivate = isRoutstrPrivateModeActive();
  const displayedRSModels = routstrPrivate ? cachedPrivateRSModels : cachedRSModels;
  let rsModelHtml;
  if (displayedRSModels.length > 0) {
    const opts = buildModelOptions('routstr', displayedRSModels, rsModel, function(m) { return m.name || m.id; });
    rsModelHtml = `<div style="margin-top:12px" id="routstr-model-area">
      <label style="font-size:12px;color:var(--text-muted)">Model</label>
      <select class="api-key-input" id="routstr-model-select" style="margin-top:4px" data-provider-panel-change="routstr-model">${opts}</select>
      <div id="routstr-model-pricing" style="margin-top:4px">${renderModelPricingHint('routstr', rsModel)}</div>
    </div>`;
  } else {
    rsModelHtml = `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)" id="routstr-model-area">Model: <span style="color:var(--text-primary)">${escapeHTML(getRoutstrModelDisplay())}</span>${currentKey ? ' <span style="font-size:11px">(connect to a node to load models)</span>' : ''}</div>`;
  }
  const privateControls = `<div id="routstr-private-controls" style="${cachedPrivateRSModels.length || routstrPrivate ? '' : 'display:none;'}margin-top:12px">
    <div style="display:flex;align-items:center;gap:8px">
      <label class="toggle-switch" style="flex-shrink:0"><input type="checkbox" id="routstr-private-toggle" ${routstrPrivate ? 'checked' : ''} data-provider-panel-change="routstr-private-mode"><span class="toggle-slider"></span></label>
      <span style="font-size:13px">Private TEE Mode</span>
    </div>
    <div id="routstr-private-indicator" style="margin-top:6px;font-size:12px;${routstrPrivate ? '' : 'display:none'}"><span style="color:var(--green)">&#128274;</span> Prompts and responses are encrypted in your browser and decrypted only inside a verified Tinfoil TEE. The node still sees your session, selected model, and billing metadata. Web search and images are disabled.</div>
  </div>`;

  const pillStyle = 'font-size:11px;padding:3px 10px;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)';
  const sectionLabel = 'font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:6px;opacity:0.7';
  const walletHtml = `<div class="routstr-wallet-card" style="padding:10px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);margin-bottom:10px">
    <div style="${sectionLabel}">\u26a1 Wallet</div>
    <div style="font-size:10px;color:var(--text-muted);margin:-2px 0 3px">The funded Routstr node session syncs with your 24-word Data Sync mnemonic. Cashu proofs and their separate 12-word recovery seed stay on this device.</div>
    <div id="routstr-wallet-device-status" style="font-size:10px;color:var(--text-muted);margin-bottom:7px">Checking local wallet setup\u2026</div>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
      <div style="font-size:12px;font-weight:600;color:var(--text-primary)"><span id="routstr-wallet-balance">\u26a1 loading...</span> <a href="#" data-provider-panel-action="refresh-cashu-wallet-balance" style="color:var(--accent);font-size:10px;text-decoration:none" title="Verify proofs against mint">\u21bb</a></div>
      <div id="routstr-wallet-actions" style="display:flex;gap:4px;flex-wrap:wrap">
        ${routstrWalletActionButtons(null)}
      </div>
    </div>
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
      <div style="font-size:10px;color:var(--text-muted)">Mint: <span id="routstr-mint-label" style="font-family:var(--font-mono,monospace);opacity:0.8">loading...</span></div>
      <button class="import-btn import-btn-secondary" style="${pillStyle}" data-provider-panel-action="show-routstr-mint-edit">Mints &amp; balances</button>
    </div>
    <div id="routstr-mint-edit" style="display:none"></div>
    <div id="routstr-wallet-fund-area" style="display:none"></div>
  </div>`;

  const discovery = !nodeUrl ? discoverRoutstrNodesFromRuntime() : null;
  if (discovery) {
    discovery.then(nodes => {
      const online = nodes.filter(n => n.online);
      if (online.length) {
        const best = online[0]!;
        const bestUrl = (best.urls && best.urls[0]) || '';
        if (!bestUrl) return;
        setSelectedRoutstrNodeFromRuntime(bestUrl);
        const label = document.getElementById('routstr-node-label');
        if (label) label.innerHTML = escapeHTML(best.name || bestUrl.replace(/^https?:\/\//, ''));
        const acts = document.getElementById('routstr-node-actions');
        if (acts) acts.innerHTML = buildRoutstrNodeActions(bestUrl, false, null);
      } else {
        const label = document.getElementById('routstr-node-label');
        if (label) label.innerHTML = '<span style="color:var(--text-muted)">no nodes online</span>';
      }
    }).catch(() => {
      const label = document.getElementById('routstr-node-label');
      if (label) label.innerHTML = '<span style="color:var(--text-muted)">discovery failed</span>';
    });
  }

  const nodeLabel = nodeUrl ? escapeHTML(nodeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')) : 'discovering\u2026';
  const nodeActionsHtml = buildRoutstrNodeActions(nodeUrl, !!currentKey, null);
  const nodeHtml = `<div class="routstr-wallet-card" style="padding:10px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);margin-bottom:10px">
    <div style="${sectionLabel}">\ud83d\udd17 Node</div>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
      <div style="font-size:12px;color:var(--text-primary)"><span id="routstr-node-label">${currentKey ? '<span style="color:var(--green)">\u2713 ' + nodeLabel + '</span>' : nodeLabel}</span></div>
      <div id="routstr-node-actions" style="display:flex;gap:4px;flex-wrap:wrap">
        ${nodeActionsHtml}
      </div>
    </div>
    ${currentKey ? '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">Session: <span id="routstr-node-balance">\u26a1 loading...</span> <a href="#" data-provider-panel-action="refresh-routstr-balance" style="color:var(--accent);font-size:10px;text-decoration:none">\u21bb</a></div>' : ''}
    <div id="routstr-node-picker" style="display:none"></div>
  </div>`;

  return `<form class="ai-provider-panel">
    <input type="text" name="ai-provider" value="routstr" autocomplete="username" hidden>
    <div class="ai-provider-desc">Decentralized AI with Bitcoin. Fund your wallet, pick a node, start chatting.</div>
    ${walletHtml}
    ${nodeHtml}
    ${rsModelHtml}
    ${privateControls}
  </form>`;
}

function renderVeniceProviderPanel(): string { return VENICE_SETTINGS_HOST; }

function renderPpqProviderPanel(): string { return PPQ_SETTINGS_HOST; }

// Custom API panel — any OpenAI-compatible endpoint
function renderCustomProviderPanel() {
  const currentUrl = getCustomApiUrl();
  const currentKey = getCustomApiKey();
  const customModel = getCustomApiModel();
  const connected = currentUrl && currentKey;
  const cachedModels = readStoredArray('labcharts-custom-models');

  let modelHtml = '';
  if (connected && cachedModels.length) {
    const opts = buildModelOptions('custom', cachedModels, customModel, function(m) { return m.name || m.id; });
    const isCustom = cachedModels.length && !cachedModels.some(m => m.id === customModel) && customModel;
    modelHtml = `<div style="margin-top:12px" id="custom-model-area">
      <label style="font-size:12px;color:var(--text-muted)">Model</label>
      <select class="api-key-input" id="custom-model-select" style="margin-top:4px" data-provider-panel-change="custom-model">${isCustom ? '<option value="__custom" disabled selected>Using custom model</option>' : ''}${opts}</select>
      <div style="margin-top:6px;display:flex;align-items:center;gap:8px"><input type="text" id="custom-manual-model" placeholder="Or type any model ID and press Enter" style="font-size:11px;flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-primary);font-family:monospace${isCustom ? ';border-color:var(--accent)' : ''}" value="${isCustom ? escapeHTML(customModel) : ''}" data-provider-panel-key="custom-manual-model"></div>
      <div id="custom-model-pricing" style="margin-top:4px">${renderModelPricingHint('custom', customModel)}</div>
    </div>`;
  } else if (connected) {
    modelHtml = `<div style="margin-top:12px" id="custom-model-area">
      <label style="font-size:12px;color:var(--text-muted)">Model</label>
      <div style="margin-top:4px;display:flex;gap:8px;align-items:center"><input type="text" class="api-key-input" id="custom-manual-model" value="${escapeAttr(customModel)}" placeholder="e.g. gpt-4o" style="flex:1"><button class="import-btn import-btn-secondary" data-provider-panel-action="apply-custom-api-model" style="white-space:nowrap">Apply</button></div>
      <div id="custom-model-pricing" style="margin-top:4px">${renderModelPricingHint('custom', customModel)}</div>
    </div>`;
  }

  return `<form class="ai-provider-panel">
    <input type="text" name="ai-provider" value="custom" autocomplete="username" hidden>
    <div class="ai-provider-desc">Connect to any OpenAI-compatible API endpoint. Works with OpenAI, Mistral, Groq, Together, xAI, OpenCode, self-hosted, and more.</div>
    <div class="api-key-status" id="custom-key-status">
      ${connected ? '<span style="color:var(--green)">&#10003; Connected</span>' : '<span style="color:var(--text-muted)">Not connected</span>'}
    </div>
    <div style="margin-top:8px">
      <label style="font-size:12px;color:var(--text-muted)">Base URL</label>
      <input type="text" class="api-key-input" id="custom-url-input" value="${escapeAttr(currentUrl)}" placeholder="https://api.openai.com/v1" style="margin-top:4px">
    </div>
    <div style="margin-top:8px">
      <label style="font-size:12px;color:var(--text-muted)">API Key</label>
      <input type="password" class="api-key-input" id="custom-key-input" value="${escapeAttr(currentKey)}" placeholder="sk-..." style="margin-top:4px" autocomplete="new-password">
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="import-btn import-btn-primary" data-provider-panel-action="save-custom-api">Save & Validate</button>
      ${connected ? '<button class="import-btn import-btn-secondary" data-provider-panel-action="remove-custom-api">Remove</button>' : ''}
    </div>
    ${modelHtml}
    <div class="api-key-notice">Direct browser connection only. A connection check never includes your profile, chat, or voice content; some endpoints receive a fixed minimal compatibility probe. After it succeeds, getbased asks once before activating this endpoint for AI requests. Your key and requests go to the endpoint you configure, never through getbased.</div>
  </form>`;
}

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
