// provider-panel-renderers.js — AI provider settings panel markup

import { escapeHTML, escapeAttr } from './utils.js';
import {
  getVeniceKey, getOpenRouterKey,
  getVeniceModel, getOpenRouterModel,
  getRoutstrKey, getRoutstrModel,
  getPpqKey, getPpqModel,
  getCustomApiUrl, getCustomApiKey, getCustomApiModel,
  getVeniceE2EE, setVeniceE2EE, isVeniceE2EEActive,
  getVeniceModelDisplay, getOpenRouterModelDisplay,
  getRoutstrModelDisplay, getPpqModelDisplay,
  renderModelPricingHint, isRecommendedModel
} from './api.js';
import { getOllamaConfig } from './pii.js';
import { buildRoutstrNodeActions, routstrWalletActionButtons } from './provider-wallet-panels.js';

function readStoredArray(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

export function buildModelOptions(provider, models, currentModel, labelFn) {
  const rec = models.filter(function(m) { return isRecommendedModel(provider, m.id); });
  const rest = models.filter(function(m) { return !isRecommendedModel(provider, m.id); });
  let html = '';
  if (rec.length) {
    html += '<optgroup label="\u2605 Recommended for medical analysis">';
    html += rec.map(function(m) { return '<option value="' + m.id + '"' + (currentModel === m.id ? ' selected' : '') + '>' + escapeHTML(labelFn(m)) + '</option>'; }).join('');
    html += '</optgroup>';
  }
  if (rest.length) {
    html += (rec.length ? '<optgroup label="Other models">' : '');
    html += rest.map(function(m) { return '<option value="' + m.id + '"' + (currentModel === m.id ? ' selected' : '') + '>' + escapeHTML(labelFn(m)) + '</option>'; }).join('');
    if (rec.length) html += '</optgroup>';
  }
  return html;
}

function renderOpenRouterProviderPanel() {
  const currentKey = getOpenRouterKey();
  const orModel = getOpenRouterModel();
  const cachedORModels = readStoredArray('labcharts-openrouter-models');
  let orModelHtml;
  if (cachedORModels.length > 0) {
    const opts = buildModelOptions('openrouter', cachedORModels, orModel, function(m) { return m.name || m.id; });
    const isCustom = !cachedORModels.some(m => m.id === orModel);
    orModelHtml = `<div style="margin-top:12px" id="openrouter-model-area">
      <label style="font-size:12px;color:var(--text-muted)">Model</label>
      <select class="api-key-input" id="openrouter-model-select" style="margin-top:4px" onchange="onOpenRouterDropdownChange(this.value)">${isCustom ? '<option value="__custom" disabled selected>Using custom model</option>' : ''}${opts}</select>
      <div style="margin-top:6px;display:flex;align-items:center;gap:8px"><input type="text" id="openrouter-custom-model" placeholder="Or type any model ID and press Enter" style="font-size:11px;flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-primary);font-family:monospace${isCustom ? ';border-color:var(--accent)' : ''}" value="${isCustom ? escapeHTML(orModel) : ''}" onkeydown="if(event.key==='Enter'){applyCustomOpenRouterModel(this.value)}"><span id="openrouter-model-health" style="font-size:14px;min-width:18px;text-align:center"></span></div>
      <div id="openrouter-model-pricing" style="margin-top:4px">${renderModelPricingHint('openrouter', orModel)}</div>
    </div>`;
  } else {
    orModelHtml = `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)" id="openrouter-model-area">Model: <span style="color:var(--text-primary)">${escapeHTML(getOpenRouterModelDisplay())}</span>${currentKey ? ' <span style="font-size:11px">(save key to load models)</span>' : ''}</div>`;
  }
  return `<div class="ai-provider-panel">
    <div class="ai-provider-desc">API marketplace routing to 200+ models (Claude, GPT, Llama, Gemini, and more). Pay-per-use with a single key.</div>
    ${currentKey ? '' : '<button class="or-oauth-btn" onclick="startOpenRouterOAuth()">Connect with OpenRouter</button><div class="or-oauth-divider"><span>or enter key manually</span></div>'}
    <div class="api-key-status" id="openrouter-key-status">
      ${currentKey ? '<span style="color:var(--green)">&#10003; Connected</span>' : '<span style="color:var(--text-muted)">No key set</span>'}
    </div>
    <input type="password" class="api-key-input" id="openrouter-key-input" placeholder="sk-or-..." value="${escapeAttr(currentKey)}">
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="import-btn import-btn-primary" id="save-openrouter-key-btn" onclick="handleSaveOpenRouterKey()">Save & Validate</button>
      ${currentKey ? '<button class="import-btn import-btn-secondary" onclick="handleRemoveOpenRouterKey()">Remove Key</button>' : ''}
    </div>
    ${currentKey ? `<div style="margin-top:8px;font-size:12px;color:var(--text-muted)"><span id="or-balance">Balance: loading...</span> <a href="#" onclick="refreshOpenRouterBalance();return false" style="color:var(--accent);font-size:11px;text-decoration:none">\u21bb</a></div>` : ''}
    ${orModelHtml}
    <div class="api-key-notice">Your key is stored locally and sent directly to OpenRouter. <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" style="color:var(--accent)">Get an API key</a> &middot; <a href="https://openrouter.ai/settings/credits" target="_blank" rel="noopener" style="color:var(--accent)">Add credits</a></div>
  </div>`;
}

function renderRoutstrProviderPanel() {
  const currentKey = getRoutstrKey();
  const rsModel = getRoutstrModel();
  const nodeUrl = window.nostrGetSelectedNode ? window.nostrGetSelectedNode() : null;
  const cachedRSModels = readStoredArray('labcharts-routstr-models');
  let rsModelHtml;
  if (cachedRSModels.length > 0) {
    const opts = buildModelOptions('routstr', cachedRSModels, rsModel, function(m) { return m.name || m.id; });
    rsModelHtml = `<div style="margin-top:12px" id="routstr-model-area">
      <label style="font-size:12px;color:var(--text-muted)">Model</label>
      <select class="api-key-input" id="routstr-model-select" style="margin-top:4px" onchange="setRoutstrModel(this.value);updateRoutstrModelPricing(this.value)">${opts}</select>
      <div id="routstr-model-pricing" style="margin-top:4px">${renderModelPricingHint('routstr', rsModel)}</div>
    </div>`;
  } else {
    rsModelHtml = `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)" id="routstr-model-area">Model: <span style="color:var(--text-primary)">${escapeHTML(getRoutstrModelDisplay())}</span>${currentKey ? ' <span style="font-size:11px">(connect to a node to load models)</span>' : ''}</div>`;
  }

  const pillStyle = 'font-size:11px;padding:3px 10px;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)';
  const sectionLabel = 'font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:6px;opacity:0.7';
  const walletHtml = `<div style="padding:10px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);margin-bottom:10px">
    <div style="${sectionLabel}">\u26a1 Wallet</div>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
      <div style="font-size:13px;font-weight:600;color:var(--text-primary)"><span id="routstr-wallet-balance">\u26a1 loading...</span> <a href="#" onclick="refreshCashuWalletBalance();return false" style="color:var(--accent);font-size:10px;text-decoration:none" title="Verify proofs against mint">\u21bb</a></div>
      <div id="routstr-wallet-actions" style="display:flex;gap:4px;flex-wrap:wrap">
        ${routstrWalletActionButtons(null)}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
      <div style="font-size:10px;color:var(--text-muted)">Mint: <span id="routstr-mint-label" style="font-family:var(--font-mono,monospace);opacity:0.8">loading...</span></div>
      <button class="import-btn import-btn-secondary" style="${pillStyle};font-size:9px;padding:1px 6px" onclick="showRoutstrMintEdit()">Change</button>
    </div>
    <div id="routstr-mint-edit" style="display:none"></div>
    <div id="routstr-wallet-fund-area" style="display:none"></div>
  </div>`;

  if (!nodeUrl && window.nostrDiscoverNodes) {
    window.nostrDiscoverNodes().then(nodes => {
      const online = nodes.filter(n => n.online);
      if (online.length) {
        const best = online[0];
        const bestUrl = (best.urls && best.urls[0]) || '';
        if (!bestUrl) return;
        window.nostrSetSelectedNode(bestUrl);
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
  const nodeHtml = `<div style="padding:10px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);margin-bottom:10px">
    <div style="${sectionLabel}">\ud83d\udd17 Node</div>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
      <div style="font-size:12px;color:var(--text-primary)"><span id="routstr-node-label">${currentKey ? '<span style="color:var(--green)">\u2713 ' + nodeLabel + '</span>' : nodeLabel}</span></div>
      <div id="routstr-node-actions" style="display:flex;gap:4px;flex-wrap:wrap">
        ${nodeActionsHtml}
      </div>
    </div>
    ${currentKey ? '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">Session: <span id="routstr-node-balance">\u26a1 loading...</span> <a href="#" onclick="refreshRoutstrBalance();return false" style="color:var(--accent);font-size:10px;text-decoration:none">\u21bb</a></div>' : ''}
    <div id="routstr-node-picker" style="display:none"></div>
  </div>`;

  return `<div class="ai-provider-panel">
    <div class="ai-provider-desc">Decentralized AI with Bitcoin. Fund your wallet, pick a node, start chatting.</div>
    ${walletHtml}
    ${nodeHtml}
    ${rsModelHtml}
  </div>`;
}

function renderVeniceProviderPanel() {
  const currentKey = getVeniceKey();
  const veniceModel = getVeniceModel();
  const e2eeOn = getVeniceE2EE();
  const cachedE2EEModels = readStoredArray('labcharts-venice-e2ee-models');
  const cachedRegularModels = readStoredArray('labcharts-venice-models');
  const displayModels = e2eeOn && cachedE2EEModels.length ? cachedE2EEModels : cachedRegularModels;
  if (e2eeOn && !cachedE2EEModels.length) setVeniceE2EE(false);
  const hasE2EEModels = cachedE2EEModels.length > 0;
  let veniceModelHtml;
  if (displayModels.length > 0) {
    const opts = buildModelOptions('venice', displayModels, veniceModel, function(m) { return m.name || m.id; });
    veniceModelHtml = `<div style="margin-top:12px" id="venice-model-area">
      <label style="font-size:12px;color:var(--text-muted)">Model</label>
      <select class="api-key-input" id="venice-model-select" style="margin-top:4px" onchange="onVeniceModelDropdownChange(this.value)">${opts}</select>
      <div id="venice-model-pricing" style="margin-top:4px">${renderModelPricingHint('venice', veniceModel)}</div>
    </div>
    ${hasE2EEModels ? `<div style="margin-top:12px;display:flex;align-items:center;gap:8px">
      <label class="toggle-switch" style="flex-shrink:0"><input type="checkbox" id="venice-e2ee-toggle" ${getVeniceE2EE() ? 'checked' : ''} onchange="toggleVeniceE2EE(this.checked)"><span class="toggle-slider"></span></label>
      <span style="font-size:13px">End-to-End Encryption</span>
    </div>
    <div id="venice-e2ee-indicator" style="margin-top:6px;font-size:12px;${isVeniceE2EEActive() ? '' : 'display:none'}"><span style="color:var(--green)">&#128274;</span> Prompts encrypted in your browser, decrypted only inside a verified TEE. Web search and image attachments are disabled.</div>` : ''}`;
  } else {
    veniceModelHtml = `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)" id="venice-model-area">Model: <span style="color:var(--text-primary)">${escapeHTML(getVeniceModelDisplay())}</span>${currentKey ? ' <span style="font-size:11px">(save key to load models)</span>' : ''}</div>`;
  }
  return `<div class="ai-provider-panel">
    <div class="ai-provider-desc">Privacy-focused cloud AI. Uncensored models, no data stored. Requires API key.</div>
    <div class="api-key-status" id="venice-key-status">
      ${currentKey ? '<span style="color:var(--green)">&#10003; Connected</span>' : '<span style="color:var(--text-muted)">No key set</span>'}
    </div>
    <input type="password" class="api-key-input" id="venice-key-input" placeholder="venice-..." value="${escapeAttr(currentKey)}">
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="import-btn import-btn-primary" id="save-venice-key-btn" onclick="handleSaveVeniceKey()">Save & Validate</button>
      ${currentKey ? '<button class="import-btn import-btn-secondary" onclick="handleRemoveVeniceKey()">Remove Key</button>' : ''}
    </div>
    ${currentKey ? '<div style="margin-top:8px;font-size:12px;color:var(--text-muted)"><span id="venice-balance">Balance: loading...</span> <a href="#" onclick="refreshVeniceBalance();return false" style="color:var(--accent);font-size:11px;text-decoration:none">\u21bb</a></div>' : ''}
    ${veniceModelHtml}
    <div class="api-key-notice">Your key is stored locally and sent directly to Venice AI. No data is stored on their servers. <a href="https://venice.ai/chat?ref=lZ4P1b" target="_blank" rel="noopener" style="color:var(--accent)">Get an API key</a></div>
  </div>`;
}

function renderPpqProviderPanel() {
  const currentKey = getPpqKey();
  const ppqModel = getPpqModel();
  const cachedPpqModels = readStoredArray('labcharts-ppq-models');
  let ppqModelHtml;
  if (cachedPpqModels.length > 0) {
    const opts = buildModelOptions('ppq', cachedPpqModels, ppqModel, function(m) { return m.name || m.id; });
    ppqModelHtml = `<div style="margin-top:12px" id="ppq-model-area">
      <label style="font-size:12px;color:var(--text-muted)">Model</label>
      <select class="api-key-input" id="ppq-model-select" style="margin-top:4px" onchange="setPpqModel(this.value);updatePpqModelPricing(this.value)">${opts}</select>
      <div id="ppq-model-pricing" style="margin-top:4px">${renderModelPricingHint('ppq', ppqModel)}</div>
    </div>`;
  } else {
    ppqModelHtml = `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)" id="ppq-model-area">Model: <span style="color:var(--text-primary)">${escapeHTML(getPpqModelDisplay())}</span>${currentKey ? ' <span style="font-size:11px">(save key to load models)</span>' : ''}</div>`;
  }
  const balanceHtml = currentKey ? `<div style="margin-top:8px;display:flex;align-items:center;gap:8px">
      <div style="font-size:12px;color:var(--text-muted)"><span id="ppq-balance">Balance: loading...</span> <a href="#" onclick="refreshPpqBalance();return false" style="color:var(--accent);font-size:11px;text-decoration:none">\u21bb</a></div>
      <button class="import-btn import-btn-secondary" id="ppq-topup-toggle" style="font-size:11px;padding:2px 10px" onclick="showPpqTopup()">Top Up</button>
    </div>
    <div id="ppq-topup-area" style="display:none"></div>` : '';
  return `<div class="ai-provider-panel">
    <div class="ai-provider-desc">Pay-per-query AI aggregator. 300+ models, no subscription, no KYC. Top up with crypto or <a href="https://www.bitrefill.com/gift-cards/ppq-us/" target="_blank" rel="noopener" style="color:var(--accent)">gift cards</a>.</div>
    ${currentKey ? '' : '<button class="import-btn import-btn-primary" style="width:100%;margin-bottom:8px" onclick="handleCreatePpqAccount()">Create Account (instant, no signup)</button><div class="or-oauth-divider"><span>or enter existing key</span></div>'}
    <div class="api-key-status" id="ppq-key-status">
      ${currentKey ? '<span style="color:var(--green)">&#10003; Connected</span>' : '<span style="color:var(--text-muted)">No key set</span>'}
    </div>
    <input type="password" class="api-key-input" id="ppq-key-input" placeholder="sk-..." value="${escapeAttr(currentKey)}">
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="import-btn import-btn-primary" id="save-ppq-key-btn" onclick="handleSavePpqKey()">Save & Validate</button>
      ${currentKey ? '<button class="import-btn import-btn-secondary" onclick="handleRemovePpqKey()">Remove Key</button>' : ''}
    </div>
    ${balanceHtml}
    ${ppqModelHtml}
    <div class="api-key-notice">Your key is stored locally. No account data is shared with getbased. <a href="https://ppq.ai/invite/8f3017cd" target="_blank" rel="noopener" style="color:var(--accent)">ppq.ai</a></div>
  </div>`;
}

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
      <select class="api-key-input" id="custom-model-select" style="margin-top:4px" onchange="setCustomApiModel(this.value);updateCustomModelPricing(this.value)">${isCustom ? '<option value="__custom" disabled selected>Using custom model</option>' : ''}${opts}</select>
      <div style="margin-top:6px;display:flex;align-items:center;gap:8px"><input type="text" id="custom-manual-model" placeholder="Or type any model ID and press Enter" style="font-size:11px;flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-primary);font-family:monospace${isCustom ? ';border-color:var(--accent)' : ''}" value="${isCustom ? escapeHTML(customModel) : ''}" onkeydown="if(event.key==='Enter'){applyCustomApiManualModel()}"></div>
      <div id="custom-model-pricing" style="margin-top:4px">${renderModelPricingHint('custom', customModel)}</div>
    </div>`;
  } else if (connected) {
    modelHtml = `<div style="margin-top:12px" id="custom-model-area">
      <label style="font-size:12px;color:var(--text-muted)">Model</label>
      <div style="margin-top:4px;display:flex;gap:8px;align-items:center"><input type="text" class="api-key-input" id="custom-manual-model" value="${escapeAttr(customModel)}" placeholder="e.g. gpt-4o" style="flex:1"><button class="import-btn import-btn-secondary" onclick="applyCustomApiManualModel()" style="white-space:nowrap">Apply</button></div>
      <div id="custom-model-pricing" style="margin-top:4px">${renderModelPricingHint('custom', customModel)}</div>
    </div>`;
  }

  return `<div class="ai-provider-panel">
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
      <input type="password" class="api-key-input" id="custom-key-input" value="${escapeAttr(currentKey)}" placeholder="sk-..." style="margin-top:4px">
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="import-btn import-btn-primary" onclick="handleSaveCustomApi()">Save & Validate</button>
      ${connected ? '<button class="import-btn import-btn-secondary" onclick="handleRemoveCustomApi()">Remove</button>' : ''}
    </div>
    ${modelHtml}
    <div class="api-key-notice">Your key is stored locally and sent directly to the endpoint you configure.</div>
  </div>`;
}

// Local AI panel — works with any OpenAI-compatible server (Ollama, LM Studio, Jan, etc.)
function renderLocalAIProviderPanel() {
  const config = getOllamaConfig();
  return `<div class="ai-provider-panel">
    <div class="ai-provider-desc">Runs AI on your computer. Free, private, no data leaves your machine. Works with <a href="https://ollama.com" target="_blank" rel="noopener" style="color:var(--accent)">Ollama</a>, <a href="https://lmstudio.ai" target="_blank" rel="noopener" style="color:var(--accent)">LM Studio</a>, <a href="https://jan.ai" target="_blank" rel="noopener" style="color:var(--accent)">Jan</a>, llama.cpp, LocalAI, and others.</div>
    <div class="local-ai-status" id="local-ai-status">
      <span class="local-ai-status-dot" id="local-ai-dot"></span>
      <span id="local-ai-status-text">Checking connection...</span>
    </div>
    <div style="margin-top:8px">
      <label style="font-size:12px;color:var(--text-muted)">Server address</label>
      <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
        <input type="text" class="api-key-input" id="local-ai-url-input" value="${escapeAttr(config.url)}" placeholder="http://localhost:11434" style="flex:1">
        <button class="import-btn import-btn-secondary" onclick="testOllamaConnection()" style="white-space:nowrap">Test</button>
      </div>
    </div>
    <div style="margin-top:8px">
      <label style="font-size:12px;color:var(--text-muted)">API Key <span style="font-size:11px">(optional — most local servers don't need one)</span></label>
      <input type="password" class="api-key-input" id="local-ai-apikey-input" value="${escapeAttr(config.apiKey)}" placeholder="Leave empty if not required" style="margin-top:4px">
    </div>
    <div id="local-ai-model-section" style="margin-top:8px;display:none">
      <label style="font-size:12px;color:var(--text-muted)">AI Model</label>
      <select class="api-key-input" id="local-ai-model-select" style="margin-top:4px" onchange="setOllamaMainModel(this.value); refreshModelAdvisor()"></select>
      <div style="margin-top:4px">${renderModelPricingHint('ollama', '')}</div>
    </div>
    <div id="local-ai-advisor"></div>
    <div class="api-key-notice" style="margin-top:12px">
      Connects via the OpenAI-compatible API (<code style="font-size:11px;padding:2px 4px;background:var(--bg-primary);border-radius:3px">/v1/chat/completions</code>). All major local servers support this, including Ollama.
    </div>
  </div>`;
}

export function renderAIProviderPanel(provider) {
  if (provider === 'openrouter') return renderOpenRouterProviderPanel();
  if (provider === 'routstr') return renderRoutstrProviderPanel();
  if (provider === 'venice') return renderVeniceProviderPanel();
  if (provider === 'ppq') return renderPpqProviderPanel();
  if (provider === 'custom') return renderCustomProviderPanel();
  return renderLocalAIProviderPanel();
}
