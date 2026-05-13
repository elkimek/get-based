// provider-panels.js — AI provider panel rendering, model dropdowns, balance display, key validation

import { escapeHTML, escapeAttr, showNotification, showConfirmDialog } from './utils.js';
import {
  getVeniceKey, saveVeniceKey, getOpenRouterKey, saveOpenRouterKey, setAIProvider,
  getVeniceModel, setVeniceModel, getOpenRouterModel, setOpenRouterModel,
  getOllamaMainModel, setOllamaMainModel, getOllamaPIIModel, setOllamaPIIModel,
  getOllamaPIIUrl, setOllamaPIIUrl,
  validateVeniceKey, validateOpenRouterKey, fetchVeniceModels, fetchOpenRouterModels,
  renderModelPricingHint, isRecommendedModel,
  getVeniceModelDisplay, getOpenRouterModelDisplay,
  fetchOpenRouterModelPricing, getOpenRouterBalance, getVeniceBalance,
  getRoutstrKey, saveRoutstrKey, getRoutstrModel, setRoutstrModel, getRoutstrModelDisplay,
  fetchRoutstrModels, validateRoutstrKey, getRoutstrBalance, createRoutstrAccount,
  setAIPaused,
  isVeniceE2EEActive, getVeniceE2EE, setVeniceE2EE,
  getCustomApiUrl, setCustomApiUrl, getCustomApiKey, saveCustomApiKey,
  getCustomApiModel, setCustomApiModel, fetchCustomApiModels, validateCustomApiKey,
  getPpqKey, savePpqKey, getPpqModel, setPpqModel, getPpqModelDisplay,
  fetchPpqModels, validatePpqKey, createPpqAccount, getPpqBalance, savePpqCreditId,
  createPpqTopup, checkPpqTopupStatus
} from './api.js';
import { getOllamaConfig, checkOllama, checkOpenAICompatible, saveOllamaConfig, setOllamaPIIEnabled } from './pii.js';
import { detectHardware, assessModel, assessFitness, getBestModel, getUpgradeSuggestion, saveHardwareOverride, getHardwareOverride } from './hardware.js';
import { updateKeyCache, encryptedSetItem } from './crypto.js';
import { isValidExternalUrl } from './url-safety.js';


// ═══════════════════════════════════════════════
// MODEL DROPDOWN HELPER
// ═══════════════════════════════════════════════
function buildModelOptions(provider, models, currentModel, labelFn) {
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


// ═══════════════════════════════════════════════
// PROVIDER PANEL RENDERING
// ═══════════════════════════════════════════════
export function renderAIProviderPanel(provider) {
  if (provider === 'openrouter') {
    const currentKey = getOpenRouterKey();
    const orModel = getOpenRouterModel();
    let cachedORModels = []; try { cachedORModels = JSON.parse(localStorage.getItem('labcharts-openrouter-models') || '[]'); } catch(e) {}
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
  if (provider === 'routstr') {
    // Wallet-only mode (Direct mode removed)
    const currentKey = getRoutstrKey();
    const rsModel = getRoutstrModel();
    const nodeUrl = window.nostrGetSelectedNode ? window.nostrGetSelectedNode() : null;
    let cachedRSModels = []; try { cachedRSModels = JSON.parse(localStorage.getItem('labcharts-routstr-models') || '[]'); } catch(e) {}
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
    // Mode toggle removed — wallet-only
    const _pillStyle = 'font-size:11px;padding:3px 10px;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)';
    const _sectionLabel = 'font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:6px;opacity:0.7';
    // Wallet section
    const walletHtml = `<div style="padding:10px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);margin-bottom:10px">
      <div style="${_sectionLabel}">\u26a1 Wallet</div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary)"><span id="routstr-wallet-balance">\u26a1 loading...</span> <a href="#" onclick="refreshCashuWalletBalance();return false" style="color:var(--accent);font-size:10px;text-decoration:none" title="Verify proofs against mint">\u21bb</a></div>
        <div id="routstr-wallet-actions" style="display:flex;gap:4px;flex-wrap:wrap">
          ${_walletActionButtons(null)}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
        <div style="font-size:10px;color:var(--text-muted)">Mint: <span id="routstr-mint-label" style="font-family:var(--font-mono,monospace);opacity:0.8">loading...</span></div>
        <button class="import-btn import-btn-secondary" style="${_pillStyle};font-size:9px;padding:1px 6px" onclick="showRoutstrMintEdit()">Change</button>
      </div>
      <div id="routstr-mint-edit" style="display:none"></div>
      <div id="routstr-wallet-fund-area" style="display:none"></div>
    </div>`;
    // Node section — auto-discover if none selected
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
          if (acts) acts.innerHTML = _buildNodeActions(bestUrl, false, null);
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
    const _nodeActionsHtml = _buildNodeActions(nodeUrl, !!currentKey, null);
    const nodeHtml = `<div style="padding:10px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);margin-bottom:10px">
      <div style="${_sectionLabel}">\ud83d\udd17 Node</div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
        <div style="font-size:12px;color:var(--text-primary)"><span id="routstr-node-label">${currentKey ? '<span style="color:var(--green)">\u2713 ' + nodeLabel + '</span>' : nodeLabel}</span></div>
        <div id="routstr-node-actions" style="display:flex;gap:4px;flex-wrap:wrap">
          ${_nodeActionsHtml}
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
  if (provider === 'venice') {
    const currentKey = getVeniceKey();
    const veniceModel = getVeniceModel();
    const e2eeOn = getVeniceE2EE();
    let cachedE2EEModels = []; try { cachedE2EEModels = JSON.parse(localStorage.getItem('labcharts-venice-e2ee-models') || '[]'); } catch(e) {}
    let cachedRegularModels = []; try { cachedRegularModels = JSON.parse(localStorage.getItem('labcharts-venice-models') || '[]'); } catch(e) {}
    const displayModels = e2eeOn && cachedE2EEModels.length ? cachedE2EEModels : cachedRegularModels;
    // If E2EE is on but no E2EE models cached, turn it off
    if (e2eeOn && !cachedE2EEModels.length) { setVeniceE2EE(false); }
    const hasE2EEModels = cachedE2EEModels.length > 0;
    let veniceModelHtml;
    if (displayModels.length > 0) {
      const opts = buildModelOptions('venice', displayModels, veniceModel, function(m) { return m.name || m.id; });
      veniceModelHtml = `<div style="margin-top:12px" id="venice-model-area">
        <label style="font-size:12px;color:var(--text-muted)">Model</label>
        <select class="api-key-input" id="venice-model-select" style="margin-top:4px" onchange="setVeniceModel(this.value);updateVeniceModelPricing(this.value)">${opts}</select>
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
  if (provider === 'ppq') {
    const currentKey = getPpqKey();
    const ppqModel = getPpqModel();
    let cachedPpqModels = []; try { cachedPpqModels = JSON.parse(localStorage.getItem('labcharts-ppq-models') || '[]'); } catch(e) {}
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
  if (provider === 'custom') {
    const currentUrl = getCustomApiUrl();
    const currentKey = getCustomApiKey();
    const customModel = getCustomApiModel();
    const connected = currentUrl && currentKey;
    let cachedModels = []; try { cachedModels = JSON.parse(localStorage.getItem('labcharts-custom-models') || '[]'); } catch(e) {}

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
      // No model list available (endpoint doesn't expose /models) — show manual input as primary
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


// ═══════════════════════════════════════════════
// AI PAUSE / PROVIDER SWITCH
// ═══════════════════════════════════════════════
export function toggleAIPause(enabled) {
  setAIPaused(!enabled);
  showNotification(enabled ? 'AI features enabled' : 'AI features paused', 'info');
  // Refresh focus card — show cached content when paused, fetch new when enabled
  if (window.loadFocusCard) window.loadFocusCard();
}

export function switchAIProvider(provider) {
  setAIProvider(provider);
  // Clean up any running topup poll/countdown timers
  if (_ppqTopupPollTimer) { clearInterval(_ppqTopupPollTimer); _ppqTopupPollTimer = null; }
  if (_ppqCountdownTimer) { clearInterval(_ppqCountdownTimer); _ppqCountdownTimer = null; }
  if (_rsFundPollTimer) { clearInterval(_rsFundPollTimer); _rsFundPollTimer = null; }
  const panel = document.getElementById('ai-provider-panel');
  if (panel) panel.innerHTML = renderAIProviderPanel(provider);
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.querySelectorAll('.ai-provider-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.provider === provider));
  }
  initSettingsOllamaCheck();
  initSettingsModelFetch();
}


// ═══════════════════════════════════════════════
// MODEL FETCH / BALANCE INIT
// ═══════════════════════════════════════════════
export function initSettingsModelFetch() {
  const orKey = getOpenRouterKey();
  if (orKey && document.getElementById('openrouter-model-area')) {
    fetchOpenRouterModels(orKey).then(function(models) { if (models.length) renderOpenRouterModelDropdown(models); });
    getOpenRouterBalance().then(function(b) {
      const el = document.getElementById('or-balance');
      if (el && b) el.innerHTML = _orBalanceHtml(b.remaining);
      else if (el) el.textContent = 'Balance: unavailable';
    });
  }
  const veniceKey = getVeniceKey();
  if (veniceKey && document.getElementById('venice-model-area')) {
    fetchVeniceModels(veniceKey).then(function() {
      // After fetch, render the right list based on E2EE state
      const listKey = getVeniceE2EE() ? 'labcharts-venice-e2ee-models' : 'labcharts-venice-models';
      let models = []; try { models = JSON.parse(localStorage.getItem(listKey) || '[]'); } catch(e) {}
      if (models.length) renderVeniceModelDropdown(models);
    });
    getVeniceBalance().then(function(b) {
      const el = document.getElementById('venice-balance');
      if (el && b) el.innerHTML = _veniceBalanceHtml(b);
      else if (el) el.textContent = 'Balance: unavailable';
    });
  }
  const rsKey = getRoutstrKey();
  if (rsKey && document.getElementById('routstr-model-area')) {
    fetchRoutstrModels(rsKey).then(function(models) { if (models.length) renderRoutstrModelDropdown(models); });
    getRoutstrBalance().then(function(b) {
      const el = document.getElementById('routstr-node-balance');
      if (el && b) el.innerHTML = _rsBalanceHtml(b.sats);
      else if (el) el.textContent = 'unavailable';
    });
  }
  // Cashu wallet balance + mint label + pending recovery (always, even without node connection)
  if (document.getElementById('routstr-wallet-balance') && window.cashuGetBalance) {
    window.cashuGetBalance().then(function(bal) {
      const el = document.getElementById('routstr-wallet-balance');
      if (el) el.textContent = '\u26a1 ' + bal.toLocaleString() + ' sats';
    });
    if (window.cashuGetMintUrl) window.cashuGetMintUrl().then(function(url) {
      const el = document.getElementById('routstr-mint-label');
      if (el) el.textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    });
    // H6: Check for pending deposit recovery
    if (window.cashuRecoverPendingDeposit) window.cashuRecoverPendingDeposit().then(function(token) {
      if (!token) return;
      const area = document.getElementById('routstr-wallet-fund-area');
      if (area) {
        area.style.display = 'block';
        area.innerHTML = '<div style="margin-top:8px;padding:8px;background:rgba(255,160,0,0.1);border:1px solid var(--yellow, #f0a800);border-radius:6px">' +
          '<div style="font-size:11px;color:var(--yellow, #f0a800);margin-bottom:4px">\u26a0 Pending deposit recovery</div>' +
          '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">A previous node deposit failed. Your sats are safe in this token:</div>' +
          '<textarea class="api-key-input" style="font-size:10px;font-family:monospace;height:40px;resize:none;user-select:all" readonly onclick="this.select()">' + escapeHTML(token) + '</textarea>' +
          '<div style="display:flex;gap:4px;margin-top:4px">' +
          '<button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;flex:1" onclick="cashuImportWallet(document.querySelector(\'#routstr-wallet-fund-area textarea\').value).then(()=>{cashuClearPendingDeposit();showNotification(\'Recovered!\',\'success\');location.reload()}).catch(e=>showNotification(e.message,\'error\'))">Recover to Wallet</button>' +
          '<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" data-token="' + escapeAttr(token) + '" onclick="navigator.clipboard.writeText(this.dataset.token);this.textContent=\'\u2713 Copied\'">Copy Token</button>' +
          '</div></div>';
      }
    });
    // Check for pending withdraw recovery
    if (window.cashuRecoverPendingWithdraw) window.cashuRecoverPendingWithdraw().then(function(token) {
      if (!token) return;
      const area = document.getElementById('routstr-wallet-fund-area');
      if (!area || area.style.display === 'block') return; // don't overwrite deposit recovery
      area.style.display = 'block';
      area.innerHTML = '<div style="margin-top:8px;padding:8px;background:rgba(255,160,0,0.1);border:1px solid var(--yellow, #f0a800);border-radius:6px">' +
        '<div style="font-size:11px;color:var(--yellow, #f0a800);margin-bottom:4px">\u26a0 Pending withdraw recovery</div>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">A previous Lightning withdrawal failed mid-operation. Your sats are safe in this token:</div>' +
        '<textarea class="api-key-input" style="font-size:10px;font-family:monospace;height:40px;resize:none;user-select:all" readonly onclick="this.select()">' + escapeHTML(token) + '</textarea>' +
        '<div style="display:flex;gap:4px;margin-top:4px">' +
        '<button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;flex:1" onclick="cashuImportWallet(document.querySelector(\'#routstr-wallet-fund-area textarea\').value).then(()=>{cashuClearPendingWithdraw();showNotification(\'Recovered!\',\'success\');location.reload()}).catch(e=>showNotification(e.message,\'error\'))">Recover to Wallet</button>' +
        '<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" onclick="navigator.clipboard.writeText(document.querySelector(\'#routstr-wallet-fund-area textarea\').value);this.textContent=\'\u2713 Copied\'">Copy Token</button>' +
        '</div></div>';
    });
  }
  const ppqKey = getPpqKey();
  if (ppqKey && document.getElementById('ppq-model-area')) {
    fetchPpqModels(ppqKey).then(function(models) { if (models.length) renderPpqModelDropdown(models); });
    // Fetch balance
    getPpqBalance().then(function(balance) {
      const el = document.getElementById('ppq-balance');
      if (el && balance != null) {
        el.innerHTML = _ppqBalanceHtml(balance);
        // Auto-expand topup when balance is empty
        if (parseFloat(balance) === 0 && document.getElementById('ppq-topup-area')) showPpqTopup();
      }
      else if (el) el.textContent = 'Balance: unavailable';
    });
  }
  const customUrl = getCustomApiUrl();
  const customKey = getCustomApiKey();
  if (customUrl && customKey && document.getElementById('custom-model-area')) {
    fetchCustomApiModels(customUrl, customKey).then(function(models) {
      if (models.length) renderCustomApiModelDropdown(models);
    });
  }
}


// ═══════════════════════════════════════════════
// LOCAL AI CONNECTION CHECK
// ═══════════════════════════════════════════════
export function initSettingsOllamaCheck() {
  const config = getOllamaConfig();
  const mainUrl = config.url;
  const piiUrl = getOllamaPIIUrl();
  const sameUrl = mainUrl === piiUrl;

  // Check local server if the panel is visible (Local provider selected)
  if (document.getElementById('local-ai-dot')) {
    // Call both endpoints in parallel — OpenAI-compatible for model list, Ollama-native for model details
    Promise.allSettled([
      checkOpenAICompatible(mainUrl, config.apiKey),
      checkOllama(mainUrl),
    ]).then(([openaiResult, ollamaResult]) => {
      const result = openaiResult.value || { available: false, models: [] };
      const ollama = ollamaResult.value || { available: false, models: [], modelDetails: [] };
      const dot = document.getElementById('local-ai-dot');
      const text = document.getElementById('local-ai-status-text');
      const modelSection = document.getElementById('local-ai-model-section');
      const modelSelect = document.getElementById('local-ai-model-select');
      if (!dot || !text) return;
      if (result.available && result.models.length > 0) {
        dot.classList.add('connected');
        let currentModel = getOllamaMainModel();
        if (!result.models.includes(currentModel)) {
          currentModel = result.models[0];
          setOllamaMainModel(currentModel);
        }
        text.textContent = `Connected (${currentModel})`;
        if (modelSection && modelSelect) {
          modelSection.style.display = 'block';
          modelSelect.innerHTML = result.models.map(m => `<option value="${escapeHTML(m)}" ${m === currentModel ? 'selected' : ''}>${escapeHTML(m)}</option>`).join('');
        }
        // Render model advisor — prefer Ollama-native details (/api/tags has sizes),
        // fall back to OpenAI-compatible details (LM Studio, Jan, etc.)
        const isOllamaServer = ollama.available && ollama.modelDetails?.length > 0;
        const modelDetails = isOllamaServer
          ? ollama.modelDetails
          : (result.modelDetails || []);
        if (modelDetails.length > 0) {
          window._lastOllamaModelDetails = modelDetails;
          window._lastIsOllamaServer = isOllamaServer;
          renderModelAdvisor(modelDetails, modelSelect, isOllamaServer);
        }
      } else if (result.available) {
        dot.classList.add('disconnected');
        text.textContent = 'Connected but no models found. Load a model in your server.';
      } else {
        dot.classList.add('disconnected');
        text.textContent = 'Not connected — start your local server to use';
      }
      // Reuse result for privacy card if same URL
      if (sameUrl) {
        window.updatePrivacyStatusCard?.(result.available && result.models.length > 0);
      } else {
        window.updatePrivacyStatusCard?.();
      }
    });
  } else {
    // Main panel not visible — just update privacy card
    window.updatePrivacyStatusCard?.();
  }
}

function isLocalUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch { return true; }
}

async function renderModelAdvisor(modelDetails, modelSelect, isOllama = false) {
  const advisorEl = document.getElementById('local-ai-advisor');
  if (!advisorEl) return;
  const serverUrl = getOllamaConfig().url;
  const isLocal = isLocalUrl(serverUrl);
  // Only auto-detect hardware for localhost — remote server GPU ≠ browser GPU
  const hw = isLocal
    ? await detectHardware()
    : { gpu: { name: null, vram: getHardwareOverride(), unified: false, renderer: null, source: getHardwareOverride() ? 'manual' : 'remote' }, ram: { gb: null, source: 'unknown' }, cpuThreads: null };
  const currentModel = getOllamaMainModel();

  // Find the best model for auto-selection hint
  const best = getBestModel(modelDetails, hw.gpu.vram ? hw : null);

  // Enhance model dropdown with size/quant labels, can-run badges, and fitness stars
  if (modelSelect) {
    const opts = Array.from(modelSelect.options);
    for (const opt of opts) {
      const detail = modelDetails.find(d => d.name === opt.value);
      if (!detail) continue;
      const sizeGb = detail.size ? (detail.size / 1e9).toFixed(1) + ' GB' : '';
      const quant = detail.quantLevel || '';
      const assess = hw.gpu.vram ? assessModel(detail, hw) : null;
      const dot = assess ? assess.badge + ' ' : '';
      const fitness = assessFitness(opt.value);
      const star = (fitness && fitness.tier === 'recommended') ? '\u2605 ' : '';
      const parts = [opt.value, sizeGb, quant].filter(Boolean);
      opt.textContent = dot + star + parts.join(' \u00B7 ');
    }
  }

  // Build advisor panel HTML
  const gpuLabel = !isLocal && !hw.gpu.vram
    ? 'Remote server \u2014 enter VRAM below to check model fit'
    : hw.gpu.vram
      ? `${escapeHTML(hw.gpu.name || 'Server')} \u2014 ${hw.gpu.vram} GB ${hw.gpu.unified ? 'unified memory' : 'VRAM'}${hw.gpu.source === 'manual' ? ' (manual)' : ''}`
      : hw.gpu.source === 'blocked' || hw.gpu.source === 'unavailable'
        ? 'GPU not detected'
        : hw.gpu.renderer
          ? `${escapeHTML(hw.gpu.renderer)} (VRAM unknown)`
          : 'GPU not detected';
  const ramLabel = hw.ram.gb ? `${hw.ram.gb} GB` : 'Unknown';
  const cpuLabel = hw.cpuThreads ? `${hw.cpuThreads} threads` : '';

  // Model rows — with fitness rating
  const fitnessLabel = { recommended: '\u2605 Recommended', capable: 'Capable', underpowered: 'Underpowered', inadequate: 'Inadequate' };
  const fitnessCss = { recommended: 'fitness-great', capable: 'fitness-good', underpowered: 'fitness-fair', inadequate: 'fitness-poor' };
  const rows = modelDetails.map(m => {
    const hasSize = m.size > 0;
    const assess = !hasSize ? { tier: 'unknown', badge: '?', label: 'Size unknown' }
      : hw.gpu.vram ? assessModel(m, hw) : { tier: 'unknown', badge: '?', vramNeeded: (m.size / 1e9) * 1.15, label: !isLocal ? 'Enter VRAM' : 'Set VRAM to check' };
    const fitness = assessFitness(m.name);
    const sizeLabel = hasSize ? `${(m.size / 1e9).toFixed(1)} GB` : '';
    const isActive = m.name === currentModel;
    const isBest = best && m.name === best.name;
    return `<div class="model-advisor-row${isActive ? ' active' : ''}">
      <span class="model-advisor-badge model-advisor-verdict ${assess.tier}">${assess.badge}</span>
      <span class="model-advisor-name">${escapeHTML(m.name)}${isActive ? ' <span style="font-size:10px;opacity:0.6">\u2190 active</span>' : ''}${isBest && !isActive ? ' <span style="font-size:10px;opacity:0.6">\u2190 best pick</span>' : ''}</span>
      <span class="model-advisor-size">${sizeLabel}${m.quantLevel ? ' \u00B7 ' + escapeHTML(m.quantLevel) : ''}${m.paramSize ? ' \u00B7 ' + escapeHTML(m.paramSize) : ''}</span>
      ${fitness ? `<span class="model-advisor-fitness ${fitnessCss[fitness.tier]}" title="${escapeAttr(fitness.note)}">${fitnessLabel[fitness.tier]}</span>` : '<span class="model-advisor-fitness" style="opacity:0.4">Unknown</span>'}
      <span class="model-advisor-verdict ${assess.tier}">${escapeHTML(assess.label)}</span>
    </div>`;
  }).join('');

  // Upgrade suggestion — only show ollama pull command for Ollama servers
  const upgrade = getUpgradeSuggestion(modelDetails, hw.gpu.vram ? hw : null);
  const suggestHtml = upgrade ? `
    <div class="model-advisor-suggest">
      <div class="model-advisor-suggest-title">Upgrade recommendation</div>
      ${isOllama ? `<div class="model-advisor-pull-row">
        <code class="model-advisor-pull-cmd">ollama pull ${escapeHTML(upgrade.model)}</code>
        <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 8px" onclick="copyOllamaPullCmd('ollama pull ${escapeAttr(upgrade.model)}')">Copy</button>
      </div>` : `<div class="model-advisor-pull-row">
        <code class="model-advisor-pull-cmd">${escapeHTML(upgrade.model)}</code>
      </div>`}
      <div class="model-advisor-pull-why">${escapeHTML(upgrade.note)}</div>
    </div>` : '';

  // VRAM override section — open by default for remote servers without override
  const overrideVal = getHardwareOverride();
  const overrideOpen = (!isLocal && !overrideVal) ? 'flex' : 'none';
  const overrideLabel = isLocal ? 'Override VRAM' : 'Server VRAM';
  const overrideHtml = `
    <div class="model-advisor-override">
      <div class="model-advisor-override-toggle" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'flex' : 'none'">
        \u25B8 ${overrideLabel}${overrideVal ? ` (${overrideVal} GB)` : ''}
      </div>
      <div class="model-advisor-override-body" style="display:${overrideOpen}">
        <input type="number" id="hw-vram-override-input" placeholder="${hw.gpu.vram || 'GB'}" value="${overrideVal || ''}" min="1" max="256" step="1">
        <span style="font-size:12px;color:var(--text-muted)">GB</span>
        <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 8px" onclick="applyHardwareOverride(document.getElementById('hw-vram-override-input').value)">Apply</button>
        ${overrideVal ? '<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 8px" onclick="clearHardwareOverride()">Reset</button>' : ''}
      </div>
    </div>`;

  advisorEl.innerHTML = `
    <div class="model-advisor">
      <div class="model-advisor-hw">
        <span class="model-advisor-hw-chip">${isLocal ? '\uD83C\uDFAE' : '\uD83C\uDF10'} ${gpuLabel}</span>
        ${isLocal && hw.ram.gb ? `<span class="model-advisor-hw-chip">\uD83D\uDDA5\uFE0F ${ramLabel} RAM</span>` : ''}
        ${isLocal && cpuLabel ? `<span class="model-advisor-hw-chip">\u2699\uFE0F ${cpuLabel}</span>` : ''}
      </div>
      ${rows}
      ${suggestHtml}
      ${overrideHtml}
    </div>`;
}


// ═══════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════
/** After a successful key save, auto-close settings and return to chat if we came from onboarding. */
function _returnToChatIfOnboarding() {
  if (window._settingsHadProvider) return; // already had a provider — user is just reconfiguring
  if (!window.hasAIProvider?.()) return;
  window.closeSettingsModal?.();
  setTimeout(() => window.openChatPanel?.(), 300);
}

function isHttpsToNonLocalhost(url) {
  if (location.protocol !== 'https:') return false;
  try {
    const host = new URL(url).hostname;
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
  } catch { return false; }
}

function isCORSError(e) {
  if (e instanceof TypeError) return true;
  const m = e.message || '';
  return m.includes('Failed to fetch') || m.includes('Load failed') || m.includes('NetworkError');
}

function getCORSHelpText() {
  const ua = navigator.userAgent || '';
  const isMac = /Mac/i.test(ua);
  const isWin = /Win/i.test(ua);
  if (isMac) return 'Blocked by CORS — Ollama: run launchctl setenv OLLAMA_ORIGINS "*" and restart. LM Studio: Settings → Enable CORS';
  if (isWin) return 'Blocked by CORS — Ollama: set OLLAMA_ORIGINS=* as system env var and restart. LM Studio: Settings → Enable CORS';
  return 'Blocked by CORS — Ollama: OLLAMA_ORIGINS=* ollama serve. LM Studio: Settings → Enable CORS';
}


// ═══════════════════════════════════════════════
// LOCAL AI CONNECTION TESTS
// ═══════════════════════════════════════════════
export async function testOllamaConnection() {
  const urlInput = document.getElementById('local-ai-url-input');
  const dot = document.getElementById('local-ai-dot');
  const text = document.getElementById('local-ai-status-text');
  const modelSection = document.getElementById('local-ai-model-section');
  const modelSelect = document.getElementById('local-ai-model-select');
  if (!urlInput || !text) return;
  const url = urlInput.value.trim().replace(/\/+$/, '');
  const config = getOllamaConfig();
  const apiKeyInput = document.getElementById('local-ai-apikey-input');
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
  text.textContent = 'Testing...';
  dot.className = 'local-ai-status-dot';
  if (isHttpsToNonLocalhost(url)) {
    dot.classList.add('disconnected');
    text.textContent = 'Cannot reach LAN servers from HTTPS — Local AI must run on this machine (localhost)';
    return;
  }
  try {
    // Pre-flight CORS check — fetch a lightweight endpoint to detect CORS before check functions swallow the error
    try { await fetch(`${url}/v1/models`, { method: 'HEAD', signal: AbortSignal.timeout(3000), ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}) }); }
    catch (preErr) { if (isCORSError(preErr)) { dot.classList.add('disconnected'); text.textContent = getCORSHelpText(); return; } }
    const [result, ollamaResult] = await Promise.all([
      checkOpenAICompatible(url, apiKey),
      checkOllama(url).catch(() => ({ available: false, models: [], modelDetails: [] })),
    ]);
    if (!result.available) throw new Error('Not reachable');
    const models = result.models;
    if (models.length === 0) {
      dot.classList.add('disconnected');
      text.textContent = 'Connected but no models found. Load a model in your server.';
    } else {
      dot.classList.add('connected');
      await saveOllamaConfig({ ...config, url, model: models[0], apiKey });
      if (!localStorage.getItem('labcharts-ollama-model')) setOllamaMainModel(models[0]);
      text.textContent = `Connected (${getOllamaMainModel()})`;
      if (modelSection && modelSelect) {
        const currentModel = getOllamaMainModel();
        modelSection.style.display = 'block';
        modelSelect.innerHTML = models.map(m => `<option value="${escapeHTML(m)}" ${m === currentModel ? 'selected' : ''}>${escapeHTML(m)}</option>`).join('');
      }
      // Render model advisor — prefer Ollama-native, fall back to OpenAI-compatible
      const isOllamaServer = ollamaResult.available && ollamaResult.modelDetails?.length > 0;
      const modelDetails = isOllamaServer
        ? ollamaResult.modelDetails
        : (result.modelDetails || []);
      if (modelDetails.length > 0 && modelSection && modelSelect) {
        window._lastOllamaModelDetails = modelDetails;
        window._lastIsOllamaServer = isOllamaServer;
        renderModelAdvisor(modelDetails, modelSelect, isOllamaServer);
      }
    }
    // Also refresh privacy section status
    window.updatePrivacyStatusCard?.();
    _returnToChatIfOnboarding();
  } catch (e) {
    dot.classList.add('disconnected');
    text.textContent = isCORSError(e) ? getCORSHelpText() : 'Not connected — check URL and ensure your server is running';
  }
}

export async function testPIIOllamaConnection() {
  const urlInput = document.getElementById('pii-local-url-input');
  const dot = document.getElementById('pii-local-dot');
  const text = document.getElementById('pii-local-status-text');
  const piiDropdown = document.getElementById('pii-model-dropdown');
  const piiSelect = document.getElementById('pii-model-select');
  if (!urlInput || !text) return;
  const url = urlInput.value.trim().replace(/\/+$/, '');
  const config = getOllamaConfig();
  text.textContent = 'Testing...';
  dot.className = 'local-ai-status-dot';
  if (isHttpsToNonLocalhost(url)) {
    dot.classList.add('disconnected');
    text.textContent = 'Cannot reach LAN servers from HTTPS — Local AI must run on this machine (localhost)';
    return;
  }
  try {
    try { await fetch(`${url}/v1/models`, { method: 'HEAD', signal: AbortSignal.timeout(3000), ...(config.apiKey ? { headers: { Authorization: `Bearer ${config.apiKey}` } } : {}) }); }
    catch (preErr) { if (isCORSError(preErr)) { dot.classList.add('disconnected'); text.textContent = getCORSHelpText(); return; } }
    const result = await checkOpenAICompatible(url, config.apiKey);
    if (!result.available) throw new Error('Not reachable');
    const models = result.models;
    if (models.length === 0) {
      dot.classList.add('disconnected');
      text.textContent = 'Connected but no models found';
    } else {
      dot.classList.add('connected');
      setOllamaPIIUrl(url);
      setOllamaPIIEnabled(true);
      const toggle = document.getElementById('pii-local-toggle');
      if (toggle) toggle.checked = true;
      let currentPII = getOllamaPIIModel();
      if (!models.includes(currentPII)) { currentPII = models[0]; setOllamaPIIModel(currentPII); }
      text.textContent = `Connected — using ${currentPII}`;
      if (piiDropdown && piiSelect) {
        piiDropdown.style.display = 'block';
        piiSelect.innerHTML = models.map(m => `<option value="${escapeHTML(m)}" ${m === currentPII ? 'selected' : ''}>${escapeHTML(m)}</option>`).join('');
      }
    }
    window.updatePrivacyStatusCard?.();
  } catch (e) {
    dot.classList.add('disconnected');
    text.textContent = isCORSError(e) ? getCORSHelpText() : 'Not connected — check URL and ensure your server is running';
    window.updatePrivacyStatusCard?.();
  }
}


// ═══════════════════════════════════════════════
// VENICE HANDLERS
// ═══════════════════════════════════════════════
function _veniceBalanceHtml(b) {
  if (b.diem != null) {
    const v = parseFloat(b.diem); // 1 DIEM = 1 USD
    const color = v < 0.10 ? 'var(--red)' : v < 0.50 ? 'var(--yellow, #f0a800)' : 'var(--green)';
    return 'Balance: <span style="color:' + color + '">$' + v.toFixed(2) + '</span>';
  }
  return 'Balance: <span style="color:' + (b.canConsume ? 'var(--green)' : 'var(--red)') + '">' + (b.canConsume ? 'Active' : 'No balance') + '</span>';
}
export function refreshVeniceBalance() {
  const el = document.getElementById('venice-balance');
  if (el) el.textContent = 'Balance: refreshing...';
  getVeniceBalance().then(function(b) {
    if (el && b) el.innerHTML = _veniceBalanceHtml(b);
    else if (el) el.textContent = 'Balance: unavailable';
  });
}
export function updateVeniceModelPricing(modelId) {
  const el = document.getElementById('venice-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('venice', modelId || getVeniceModel());
}

export async function handleSaveVeniceKey() {
  const input = document.getElementById('venice-key-input');
  const btn = document.getElementById('save-venice-key-btn');
  const status = document.getElementById('venice-key-status');
  const key = input.value.trim();
  if (!key) { status.innerHTML = '<span style="color:var(--red)">Please enter an API key</span>'; return; }
  btn.disabled = true; btn.textContent = 'Validating...';
  const result = await validateVeniceKey(key);
  if (result.valid) {
    await saveVeniceKey(key);
    status.innerHTML = '<span style="color:var(--green)">Connected — loading models…</span>';
    await fetchVeniceModels(key);
    // Render the right list based on E2EE state
    const listKey = getVeniceE2EE() ? 'labcharts-venice-e2ee-models' : 'labcharts-venice-models';
    let models = []; try { models = JSON.parse(localStorage.getItem(listKey) || '[]'); } catch(e) {}
    if (models.length) {
      renderVeniceModelDropdown(models);
      status.innerHTML = '<span style="color:var(--green)">&#10003; Connected</span>';
    } else {
      status.innerHTML = '<span style="color:var(--green)">&#10003; Connected</span>';
    }
    showNotification('Venice API key saved', 'success');
    _returnToChatIfOnboarding();
  } else {
    status.innerHTML = `<span style="color:var(--red)">${escapeHTML(result.error)}</span>`;
  }
  btn.disabled = false; btn.textContent = 'Save & Validate';
}

export function handleRemoveVeniceKey() {
  localStorage.removeItem('labcharts-venice-key');
  updateKeyCache('labcharts-venice-key', null);
  localStorage.removeItem('labcharts-venice-models');
  localStorage.removeItem('labcharts-venice-model');
  localStorage.removeItem('labcharts-venice-e2ee');
  localStorage.removeItem('labcharts-venice-e2ee-models');
  localStorage.removeItem('labcharts-venice-model-regular');
  localStorage.removeItem('labcharts-venice-model-e2ee');
  window.clearE2EESession?.();
  showNotification('Venice API key removed', 'info');
  window.openSettingsModal?.();
}

export function renderVeniceModelDropdown(models) {
  const area = document.getElementById('venice-model-area');
  if (!area || !models.length) return;
  const currentModel = getVeniceModel();
  const opts = buildModelOptions('venice', models, currentModel, function(m) { return m.name || m.id; });
  area.innerHTML = '<label style="font-size:12px;color:var(--text-muted)">Model</label>' +
    '<select class="api-key-input" id="venice-model-select" style="margin-top:4px" onchange="setVeniceModel(this.value);updateVeniceModelPricing(this.value)">' + opts + '</select>' +
    '<div id="venice-model-pricing" style="margin-top:4px">' + renderModelPricingHint('venice', currentModel) + '</div>';
}

export function toggleVeniceE2EE(on) {
  setVeniceE2EE(on);
  if (!on) window.clearE2EESession?.();
  // Swap model dropdown to E2EE or regular model list
  const listKey = on ? 'labcharts-venice-e2ee-models' : 'labcharts-venice-models';
  let models = []; try { models = JSON.parse(localStorage.getItem(listKey) || '[]'); } catch {}
  if (models.length) {
    // Save current model for the mode we're leaving, restore the one for the mode we're entering
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
  window.updateChatHeaderModel?.();
  window.refreshWebSearchToggle?.();
}


// ═══════════════════════════════════════════════
// OPENROUTER HANDLERS
// ═══════════════════════════════════════════════
export function updateOpenRouterModelPricing(modelId) {
  const el = document.getElementById('openrouter-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('openrouter', modelId || getOpenRouterModel());
}

export async function handleSaveOpenRouterKey() {
  const input = document.getElementById('openrouter-key-input');
  const btn = document.getElementById('save-openrouter-key-btn');
  const status = document.getElementById('openrouter-key-status');
  const key = input.value.trim();
  if (!key) { status.innerHTML = '<span style="color:var(--red)">Please enter an API key</span>'; return; }
  btn.disabled = true; btn.textContent = 'Validating...';
  const result = await validateOpenRouterKey(key);
  if (result.valid) {
    await saveOpenRouterKey(key);
    status.innerHTML = '<span style="color:var(--green)">Connected — loading models\u2026</span>';
    const models = await fetchOpenRouterModels(key);
    if (models.length) {
      renderOpenRouterModelDropdown(models);
      status.innerHTML = '<span style="color:var(--green)">&#10003; Connected</span>';
    } else {
      status.innerHTML = '<span style="color:var(--green)">&#10003; Connected</span>';
    }
    showNotification('OpenRouter API key saved', 'success');
    _returnToChatIfOnboarding();
  } else {
    status.innerHTML = `<span style="color:var(--red)">${escapeHTML(result.error)}</span>`;
  }
  btn.disabled = false; btn.textContent = 'Save & Validate';
}

export function handleRemoveOpenRouterKey() {
  localStorage.removeItem('labcharts-openrouter-key');
  updateKeyCache('labcharts-openrouter-key', null);
  localStorage.removeItem('labcharts-openrouter-models');
  localStorage.removeItem('labcharts-openrouter-model');
  localStorage.removeItem('labcharts-openrouter-pricing');
  showNotification('OpenRouter API key removed', 'info');
  window.openSettingsModal?.();
}

export function renderOpenRouterModelDropdown(models) {
  const area = document.getElementById('openrouter-model-area');
  if (!area || !models.length) return;
  const currentModel = getOpenRouterModel();
  const isCustom = !models.some(m => m.id === currentModel);
  const opts = buildModelOptions('openrouter', models, currentModel, function(m) { return m.name || m.id; });
  area.innerHTML = '<label style="font-size:12px;color:var(--text-muted)">Model</label>' +
    '<select class="api-key-input" id="openrouter-model-select" style="margin-top:4px" onchange="onOpenRouterDropdownChange(this.value)">' + opts + '</select>' +
    '<div style="margin-top:6px;display:flex;align-items:center;gap:8px"><input type="text" class="api-key-input" id="openrouter-custom-model" placeholder="Or enter model ID (e.g. arcee-ai/trinity-large-preview:free)" style="font-size:12px;flex:1' + (isCustom ? ';border-color:var(--accent)' : '') + '" value="' + (isCustom ? escapeHTML(currentModel) : '') + '" onkeydown="if(event.key===\'Enter\'){applyCustomOpenRouterModel(this.value)}"><span id="openrouter-model-health" style="font-size:16px;min-width:20px;text-align:center"></span></div>' +
    '<span style="font-size:11px;color:var(--text-muted);margin-top:2px;display:block">Press Enter to apply — checks model connectivity</span>' +
    '<div id="openrouter-model-pricing" style="margin-top:4px">' + renderModelPricingHint('openrouter', currentModel) + '</div>';
}

function _orBalanceHtml(remaining) {
  const v = parseFloat(remaining);
  const color = v < 0.10 ? 'var(--red)' : v < 0.50 ? 'var(--yellow, #f0a800)' : 'var(--green)';
  return 'Balance: <span style="color:' + color + '">$' + v.toFixed(2) + '</span>';
}
export function refreshOpenRouterBalance() {
  const el = document.getElementById('or-balance');
  if (el) el.textContent = 'Balance: refreshing...';
  getOpenRouterBalance().then(function(b) {
    if (el && b) el.innerHTML = _orBalanceHtml(b.remaining);
    else if (el) el.textContent = 'Balance: unavailable';
  });
}

// Persistent modal shown when an OpenRouter API call returns 402 (out of
// credit). Previously this surfaced as a toast that vanished in seconds
// and left the user stuck. Single actionable path: add credits via OR's
// settings page in a new tab. The "switch to a free model" branch was
// removed — OpenRouter's free tier has no vision-capable models so
// image-mode imports broke silently, and the privacy story (free
// providers log + may train on prompts) is bad for medical data.
export function showInsufficientBalanceDialog() {
  let overlay = document.getElementById('or-no-balance-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'or-no-balance-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = '<div class="confirm-dialog ai-needed-dialog" role="dialog" aria-modal="true" aria-label="OpenRouter balance empty" style="max-width:480px">' +
    '<p class="confirm-message"><strong>Your OpenRouter balance is empty</strong></p>' +
    '<p style="font-size:13px;color:var(--text-muted);margin:0 0 14px">Add credits at OpenRouter to keep using AI. $10 covers weeks of typical use — chat, lab interpretation, and PDF imports.</p>' +
    '<button class="chat-quiz-option chat-quiz-recommended" id="or-add-credits" style="margin-bottom:8px">' +
      '<span class="chat-quiz-icon" aria-hidden="true">&#128179;</span>' +
      '<span class="chat-quiz-body"><strong>Add credits at openrouter.ai</strong>' +
      '<span>Opens in a new tab. Come back to getbased when done — the page picks up automatically.</span></span>' +
      '<span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>' +
    '</button>' +
    '<div style="text-align:right;margin-top:14px">' +
      '<button class="confirm-btn confirm-btn-cancel" id="or-nb-cancel">Not now</button>' +
    '</div>' +
  '</div>';
  overlay.classList.add('show');
  const close = function() { overlay.classList.remove('show'); };
  document.getElementById('or-add-credits').onclick = function() {
    close();
    window.open('https://openrouter.ai/settings/credits', '_blank', 'noopener');
  };
  document.getElementById('or-nb-cancel').onclick = close;
  overlay.onclick = function(e) { if (e.target === overlay) close(); };
}

export async function applyCustomOpenRouterModel(modelId) {
  const id = modelId.trim();
  if (!id) return;
  setOpenRouterModel(id);
  // Show "checking..." while we verify the model
  const pricingEl = document.getElementById('openrouter-model-pricing');
  if (pricingEl) pricingEl.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">Checking pricing\u2026</span>';
  const select = document.getElementById('openrouter-model-select');
  const input = document.getElementById('openrouter-custom-model');
  const inDropdown = select && [...select.options].some(o => o.value === id);
  if (select) {
    if (inDropdown) {
      select.value = id;
      if (input) { input.value = ''; input.style.borderColor = ''; }
    } else {
      // Show "Custom model" placeholder in dropdown
      let customOpt = select.querySelector('option[value="__custom"]');
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
  // Health check — verify model responds
  const indicator = document.getElementById('openrouter-model-health');
  if (indicator) { indicator.textContent = '⏳'; indicator.title = 'Checking...'; indicator.style.color = 'var(--text-muted)'; }
  try {
    await window.callClaudeAPI({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 1 });
    if (indicator) { indicator.textContent = '✓'; indicator.title = 'Model responding'; indicator.style.color = 'var(--green)'; }
    if (input && !inDropdown) input.style.borderColor = 'var(--green)';
    showNotification('Model set: ' + id, 'info');
    // Fetch actual pricing and update display
    await fetchOpenRouterModelPricing(id);
    updateOpenRouterModelPricing(id);
  } catch (e) {
    if (indicator) { indicator.textContent = '✗'; indicator.title = e.message || 'Connection failed'; indicator.style.color = 'var(--red)'; }
    if (input) input.style.borderColor = 'var(--red)';
    updateOpenRouterModelPricing(id);
    showNotification('Model check failed: ' + (e.message || 'unknown error'), 'error');
  }
}

export function onOpenRouterDropdownChange(value) {
  setOpenRouterModel(value);
  updateOpenRouterModelPricing(value);
  const input = document.getElementById('openrouter-custom-model');
  if (input) { input.value = ''; input.style.borderColor = ''; }
  const health = document.getElementById('openrouter-model-health');
  if (health) { health.textContent = ''; health.title = ''; }
  // Remove "Using custom model" placeholder if present
  const select = document.getElementById('openrouter-model-select');
  const customOpt = select?.querySelector('option[value="__custom"]');
  if (customOpt) customOpt.remove();
}


// ─── Routstr mode toggle ───
// Direct mode removed — wallet-only

// ─── Routstr handlers ───
export function updateRoutstrModelPricing(modelId) {
  const el = document.getElementById('routstr-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('routstr', modelId || getRoutstrModel());
}

export async function handleSaveRoutstrKey() {
  const input = document.getElementById('routstr-key-input');
  const btn = document.getElementById('save-routstr-key-btn');
  const status = document.getElementById('routstr-key-status');
  let key = input.value.trim();
  if (key.startsWith('cashu:')) key = key.slice(6); // strip URI prefix
  if (!key) { status.innerHTML = '<span style="color:var(--red)">Please enter a key or Cashu token</span>'; return; }
  btn.disabled = true; btn.textContent = 'Validating...';
  const result = await validateRoutstrKey(key);
  if (result.valid) {
    let finalKey = key;
    // Convert Cashu token to a session key so Lightning topup works
    if (key.startsWith('cashu')) {
      status.innerHTML = '<span style="color:var(--text-muted)">Converting token to session key\u2026</span>';
      try {
        const wallet = await createRoutstrAccount(key);
        if (wallet.api_key) finalKey = wallet.api_key;
      } catch (e) {
        status.innerHTML = '<span style="color:var(--red)">' + escapeHTML(e.message) + '</span>';
        btn.disabled = false; btn.textContent = 'Save & Validate';
        return;
      }
      // Cashu token is now spent — user MUST save the session key
      await saveRoutstrKey(finalKey);
      await fetchRoutstrModels();
      const panel = document.getElementById('ai-provider-panel');
      if (panel) {
        panel.innerHTML = `<div class="ai-provider-panel">
          <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--accent)">
            <div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:6px">\u26a0 Save your session key</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Your Cashu token has been redeemed. This session key is the <strong>only way to access your balance</strong>. Copy it now \u2014 there is no recovery.</div>
            <label style="font-size:11px;color:var(--text-muted)">Session Key</label>
            <div style="font-family:monospace;font-size:11px;word-break:break-all;background:var(--bg-primary);padding:8px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);user-select:all;cursor:text">${escapeHTML(finalKey)}</div>
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="import-btn import-btn-primary" style="font-size:12px" onclick="navigator.clipboard.writeText('${escapeAttr(finalKey)}');this.textContent='\u2713 Copied (clears in 60s)';clearTimeout(window._rsClipTimer);window._rsClipTimer=setTimeout(()=>navigator.clipboard.writeText(''),60000)">Copy Key</button>
              <button class="import-btn import-btn-secondary" style="font-size:12px" onclick="var p=document.getElementById('ai-provider-panel');if(p)p.innerHTML=renderAIProviderPanel('routstr');initSettingsModelFetch()">I\u2019ve saved it</button>
            </div>
          </div>
        </div>`;
      }
      btn.disabled = false; btn.textContent = 'Save & Validate';
      return;
    }
    await saveRoutstrKey(finalKey);
    status.innerHTML = '<span style="color:var(--green)">Connected \u2014 loading models\u2026</span>';
    const models = await fetchRoutstrModels();
    if (models.length) {
      renderRoutstrModelDropdown(models);
      status.innerHTML = '<span style="color:var(--green)">\u2713 Connected</span>';
    } else {
      status.innerHTML = '<span style="color:var(--green)">\u2713 Connected</span>';
    }
    if (result.warning) showNotification(result.warning, 'info', 5000);
    else showNotification('Routstr key saved', 'success');
    _returnToChatIfOnboarding();
  } else {
    status.innerHTML = `<span style="color:var(--red)">${escapeHTML(result.error)}</span>`;
  }
  btn.disabled = false; btn.textContent = 'Save & Validate';
}

export function handleRemoveRoutstrKey() {
  localStorage.removeItem('labcharts-routstr-key');
  updateKeyCache('labcharts-routstr-key', null);
  localStorage.removeItem('labcharts-routstr-models');
  localStorage.removeItem('labcharts-routstr-model');
  localStorage.removeItem('labcharts-routstr-pricing');
  localStorage.removeItem('labcharts-routstr-vision-models');
  showNotification('Routstr key removed', 'info');
  window.openSettingsModal?.();
}

export function renderRoutstrModelDropdown(models) {
  const area = document.getElementById('routstr-model-area');
  if (!area || !models.length) return;
  let currentModel = getRoutstrModel();
  // Auto-select first model if stored model isn't available on this node
  const modelIds = models.map(m => m.id);
  if (currentModel && !modelIds.includes(currentModel)) {
    currentModel = modelIds[0];
    setRoutstrModel(currentModel);
  }
  const opts = buildModelOptions('routstr', models, currentModel, function(m) { return m.name || m.id; });
  area.innerHTML = '<label style="font-size:12px;color:var(--text-muted)">Model</label>' +
    '<select class="api-key-input" id="routstr-model-select" style="margin-top:4px" onchange="setRoutstrModel(this.value);updateRoutstrModelPricing(this.value)">' + opts + '</select>' +
    '<div id="routstr-model-pricing" style="margin-top:4px">' + renderModelPricingHint('routstr', currentModel) + '</div>';
}

// ─── Routstr wallet handlers ───
function _rsBalanceHtml(sats) {
  const color = sats < 100 ? 'var(--red)' : sats < 500 ? 'var(--yellow, #f0a800)' : 'var(--green)';
  return 'Balance: <span style="color:' + color + '">\u26a1 ' + sats.toLocaleString() + ' sats</span>';
}
export function refreshCashuWalletBalance() {
  const el = document.getElementById('routstr-wallet-balance');
  if (el) el.textContent = '\u26a1 verifying...';
  if (window.cashuCheckProofStates) {
    window.cashuCheckProofStates().then(function(bal) {
      if (el) el.textContent = '\u26a1 ' + bal.toLocaleString() + ' sats';
    }).catch(function() {
      if (el) el.textContent = '\u26a1 check failed';
    });
  }
}

export function refreshRoutstrBalance() {
  const el = document.getElementById('routstr-node-balance') || document.getElementById('routstr-balance');
  if (el) el.textContent = 'Balance: refreshing...';
  getRoutstrBalance().then(function(b) {
    if (el && b) el.innerHTML = _rsBalanceHtml(b.sats);
    else if (el) el.textContent = 'Balance: unavailable';
  });
}
// ─── Routstr decentralized wallet UI ───
let _rsFundPollTimer = null;

export function showRoutstrWalletFund() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  if (area.style.display !== 'none' && _activeWalletAction === 'deposit') { area.style.display = 'none'; _setActiveWalletAction(null); return; }
  _setActiveWalletAction('deposit');
  _ensureWalletSeed(() => _renderWalletFundUI());
}

function _renderWalletFundUI() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  area.style.display = 'block';
  const presets = [1000, 5000, 10000, 25000];
  const feePct = typeof window.cashuGetFeePct === 'function' ? window.cashuGetFeePct() : 0;
  const feeNote = feePct > 0 ? `<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">${Math.round(feePct * 100)}% development fee applies</div>` : '';
  const cashuFeeLabel = feePct > 0 ? `or paste Cashu token (${Math.round(feePct * 100)}% fee)` : 'or paste Cashu token';
  area.innerHTML = `<div style="margin-top:8px">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:2px">Deposit with Lightning</div>
    ${feeNote}
    <div style="display:flex;flex-wrap:wrap;gap:4px">
      ${presets.map(s => `<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="doRoutstrWalletFund(${s})">\u26a1 ${s.toLocaleString()}</button>`).join('')}<div id="routstr-wfund-custom-slot" style="display:flex"><button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;color:var(--text-muted)" onclick="rsWalletFundCustomInput()">\u26a1\u2026</button></div>
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:5px;text-align:center">1,000 sats is enough for a few chats</div>
    <div style="margin-top:6px"><div class="or-oauth-divider"><span>${cashuFeeLabel}</span></div>
    <div style="display:flex;gap:6px;margin-top:4px">
      <input type="text" class="api-key-input" id="routstr-wcashu-input" placeholder="cashuA... / cashuB... / cashu:..." style="font-size:11px;flex:1;font-family:monospace">
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;white-space:nowrap" onclick="doRoutstrWalletReceiveCashu()">Deposit</button>
    </div></div>
    <div id="routstr-wfund-status"></div>
  </div>`;
}

export function rsWalletFundCustomInput() {
  const slot = document.getElementById('routstr-wfund-custom-slot');
  if (!slot) return;
  slot.innerHTML = '<input type="text" inputmode="numeric" id="routstr-wfund-custom" class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;width:80px;text-align:center;cursor:text;border:1px solid var(--accent)" placeholder="sats" onkeydown="if(event.key===\'Enter\')doRoutstrWalletFundCustom();if(event.key===\'Escape\')showRoutstrWalletFund()" onblur="if(this.value.trim())doRoutstrWalletFundCustom()">';
  document.getElementById('routstr-wfund-custom')?.focus();
}

export function doRoutstrWalletFundCustom() {
  const input = document.getElementById('routstr-wfund-custom');
  if (!input) return;
  const amount = parseInt(input.value.replace(/[^0-9]/g, ''), 10);
  if (!amount || amount < 100) {
    const s = document.getElementById('routstr-wfund-status');
    if (s) s.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Minimum 100 sats</div>';
    return;
  }
  doRoutstrWalletFund(amount);
}

export async function doRoutstrWalletFund(amountSats) {
  const statusEl = document.getElementById('routstr-wfund-status');
  if (!statusEl) return;
  statusEl.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Creating invoice\u2026</div>';
  try {
    const result = await window.cashuCreateFundingInvoice(amountSats);
    // QR code
    let qrSvg = '';
    if (typeof qrcode === 'function') {
      const qr = qrcode(0, 'L');
      qr.addData(result.invoice.toUpperCase());
      qr.make();
      qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    }
    const payUri = 'lightning:' + result.invoice;
    statusEl.innerHTML = `<div style="margin-top:8px;text-align:center">
      <div style="font-size:12px;font-weight:600;margin-bottom:4px">\u26a1 ${amountSats.toLocaleString()} sats</div>
      ${qrSvg ? `<a href="${payUri}" style="display:inline-block;background:#fff;padding:10px;border-radius:8px;width:220px;height:220px">${qrSvg}</a>` : ''}
      <div style="margin-top:6px"><button class="import-btn import-btn-secondary" style="font-size:10px;padding:2px 8px" onclick="navigator.clipboard.writeText('${escapeAttr(result.invoice)}');this.textContent='\u2713 Copied'">${result.invoice.slice(0, 20)}\u2026 copy</button></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px" id="routstr-wfund-poll">Waiting for payment\u2026</div>
    </div>`;
    // Poll for payment
    _rsFundPollTimer = setInterval(async function() {
      try {
        const s = await window.cashuCheckFundingStatus(result.quote);
        if (s && s.paid) {
          clearInterval(_rsFundPollTimer); _rsFundPollTimer = null;
          const feeText = s.fee ? ' (' + s.fee + ' fee)' : '';
          const credited = s.fee ? (amountSats - s.fee) : amountSats;
          statusEl.innerHTML = '<div style="margin-top:8px;text-align:center;font-size:12px;color:var(--green)">\u2713 +' + credited.toLocaleString() + ' sats added to wallet!' + feeText + '</div>';
          showNotification('Wallet funded \u26a1 ' + credited.toLocaleString() + ' sats', 'success');
          _refreshRoutstrWalletBalance();
          setTimeout(function() { const a = document.getElementById('routstr-wallet-fund-area'); if (a) a.style.display = 'none'; }, 3000);
        }
      } catch {}
    }, 3000);
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function doRoutstrWalletReceiveCashu() {
  const input = document.getElementById('routstr-wcashu-input');
  const statusEl = document.getElementById('routstr-wfund-status');
  if (!input || !statusEl) return;
  let token = input.value.trim();
  // Strip cashu: URI prefix if present
  if (token.startsWith('cashu:')) token = token.slice(6);
  if (!token || !token.startsWith('cashuA') && !token.startsWith('cashuB')) { statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Paste a valid Cashu token (starts with cashuA or cashuB)</div>'; return; }
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Depositing to wallet\u2026</div>';
  try {
    const result = await window.cashuReceiveToken(token);
    input.value = '';
    // Close the deposit area and show success inline
    const fundArea = document.getElementById('routstr-wallet-fund-area');
    if (fundArea) { fundArea.style.display = 'none'; _setActiveWalletAction(null); }
    showNotification('Wallet funded \u26a1 +' + result.received + ' sats' + (result.fee > 0 ? ' (' + result.fee + ' fee)' : ''), 'success');
    _refreshRoutstrWalletBalance();
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

// ─── Mint selection ───
export async function showRoutstrMintEdit() {
  const area = document.getElementById('routstr-mint-edit');
  if (!area) return;
  if (area.style.display !== 'none') { area.style.display = 'none'; return; }
  const currentMint = await window.cashuGetMintUrl();
  // Query connected node's accepted mints
  const nodeUrl = window.nostrGetSelectedNode?.() || '';
  let nodeMints = [];
  if (nodeUrl) {
    try {
      const res = await fetch(nodeUrl.replace(/\/+$/, '') + '/v1/info');
      if (res.ok) { const info = await res.json(); nodeMints = info.mints || []; }
    } catch {}
  }
  const nodeMintsHtml = nodeMints.length
    ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px">Node accepts: ${nodeMints.map(m => {
        const label = escapeHTML(m.replace(/^https?:\/\//, ''));
        const isCurrent = m === currentMint;
        return isCurrent ? '<strong style="color:var(--green)">' + label + '</strong>'
          : '<a href="#" onclick="document.getElementById(\'routstr-mint-input\').value=\'' + escapeAttr(m) + '\';return false" style="color:var(--accent);text-decoration:none">' + label + '</a>';
      }).join(', ')}</div>`
    : '';
  area.style.display = 'block';
  area.innerHTML = `<div style="margin-top:6px">
    <input type="text" class="api-key-input" id="routstr-mint-input" value="${escapeAttr(currentMint)}" placeholder="https://mint.example.com" style="font-size:11px;font-family:monospace">
    <div style="display:flex;gap:4px;margin-top:4px">
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;flex:1" onclick="doRoutstrMintChange()">Save</button>
      <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" onclick="document.getElementById('routstr-mint-edit').style.display='none'">Cancel</button>
    </div>
    ${nodeMintsHtml}
    <div style="font-size:10px;color:var(--text-muted);margin-top:4px">\u26a0 Changing mint resets wallet connection. Existing proofs stay tied to their mint.</div>
    <div id="routstr-mint-status"></div>
  </div>`;
}

export async function doRoutstrMintChange() {
  const input = document.getElementById('routstr-mint-input');
  const statusEl = document.getElementById('routstr-mint-status');
  if (!input || !statusEl) return;
  const url = input.value.trim().replace(/\/+$/, '');
  // Mint URL must be public HTTPS — block loopback / RFC1918 / link-local so
  // a malicious paste can't make the browser probe internal services.
  if (!url || !isValidExternalUrl(url)) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter a valid public mint URL (https://...)</div>';
    return;
  }
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Checking mint\u2026</div>';
  try {
    const res = await fetch(url + '/v1/info');
    if (!res.ok) throw new Error('Mint not reachable');
    const info = await res.json();
    if (!info.nuts) throw new Error('Not a valid Cashu mint');
    await window.cashuSetMintUrl(url);
    // Update label + balance
    const label = document.getElementById('routstr-mint-label');
    if (label) label.textContent = url.replace(/^https?:\/\//, '');
    document.getElementById('routstr-mint-edit').style.display = 'none';
    _refreshRoutstrWalletBalance();
    showNotification('Mint changed to ' + url.replace(/^https?:\/\//, ''), 'success');
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function showRoutstrWalletBackup() {
  _setActiveWalletAction('backup');
  try {
    const token = await window.cashuExportWallet();
    if (!token) { showNotification('Wallet is empty', 'info'); _setActiveWalletAction(null); return; }
    navigator.clipboard.writeText(token);
    showNotification('Wallet backup copied to clipboard (clears in 60s)', 'success');
    clearTimeout(window._rsCashuBackupTimer);
    window._rsCashuBackupTimer = setTimeout(() => navigator.clipboard.writeText(''), 60000);
  } catch (e) {
    showNotification('Backup failed: ' + e.message, 'error');
  }
  setTimeout(() => _setActiveWalletAction(null), 500);
}

export async function showRoutstrNodePicker() {
  const area = document.getElementById('routstr-node-picker');
  if (!area) return;
  if (area.style.display !== 'none') { area.style.display = 'none'; return; }
  area.style.display = 'block';
  area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Searching Nostr relays\u2026</div>';
  try {
    const allNodes = await window.nostrDiscoverNodes(true);
    const nodes = allNodes.filter(n => n.online);
    if (!nodes.length) {
      area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">No online nodes found (' + allNodes.length + ' discovered). Try again later.</div>';
      return;
    }
    area.innerHTML = '<div style="margin-top:8px">' + nodes.map(function(n) {
      const url = n.urls[0] || '';
      const domain = escapeHTML(url.replace(/^https?:\/\//, '').replace(/\/$/, ''));
      const label = escapeHTML(n.name || domain);
      const models = n.modelCount + ' model' + (n.modelCount !== 1 ? 's' : '');
      const onion = n.onion ? ' <span style="font-size:10px" title="Tor available">\ud83e\udde5</span>' : '';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
        <div><span style="font-size:12px;font-weight:500">${label}</span>${onion}<br><span style="font-size:10px;color:var(--text-muted)">${domain} \u00b7 ${models}</span></div>
        <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px" onclick="connectRoutstrNode('${escapeAttr(url)}')">Connect</button>
      </div>`;
    }).join('') + '</div>';
  } catch (e) {
    area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function connectRoutstrNode(nodeUrl) {
  const picker = document.getElementById('routstr-node-picker');
  if (picker) picker.style.display = 'block';
  const nodeLabel = escapeHTML(nodeUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));
  if (picker) picker.innerHTML = `<div style="margin-top:8px;padding:10px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--accent)">
    <div style="font-size:11px;color:var(--text-muted)">Checking ${nodeLabel}\u2026</div>
  </div>`;

  // Query node's accepted mints
  let nodeMints = [];
  try {
    const infoRes = await fetch(nodeUrl.replace(/\/+$/, '') + '/v1/info');
    if (infoRes.ok) {
      const info = await infoRes.json();
      nodeMints = info.mints || [];
    }
  } catch {}

  // Auto-set mint if node requires a specific one
  const currentMint = await window.cashuGetMintUrl();
  let mintSwitched = false;
  if (nodeMints.length > 0 && !nodeMints.includes(currentMint)) {
    // Current mint not accepted — switch to node's first mint.
    // nodeMints comes from the node's /v1/info response (untrusted), so
    // setMintUrl validates it and throws on a private/loopback target.
    try {
      await window.cashuSetMintUrl(nodeMints[0]);
      mintSwitched = true;
      const mintLabel = document.getElementById('routstr-mint-label');
      if (mintLabel) mintLabel.textContent = nodeMints[0].replace(/^https?:\/\//, '');
      showNotification('Mint switched to ' + nodeMints[0].replace(/^https?:\/\//, '') + ' (required by node)', 'info');
    } catch (e) {
      showNotification('Node requires an unsafe mint URL — refused. Try a different node.', 'error');
      if (picker) picker.style.display = 'none';
      return;
    }
  }

  const walletBalance = await window.cashuGetBalance();
  if (walletBalance < 1) {
    showNotification('Fund your wallet first' + (mintSwitched ? ' — mint was updated' : ''), 'error');
    showRoutstrWalletFund();
    return;
  }

  // Show deposit amount picker
  const mintNote = mintSwitched ? `<div style="font-size:10px;color:var(--accent);margin-bottom:4px">\u26a0 Mint switched to ${escapeHTML(nodeMints[0].replace(/^https?:\/\//, ''))}</div>` : '';
  const presets = [500, 1000, 2500, 5000].filter(v => v <= walletBalance);
  if (picker) picker.innerHTML = `<div style="margin-top:8px;padding:10px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--accent)">
    <div style="font-size:12px;margin-bottom:6px">Deposit to <strong>${nodeLabel}</strong></div>
    ${mintNote}
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Wallet: \u26a1 ${walletBalance.toLocaleString()} sats</div>
    <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
      <input type="number" class="api-key-input" id="routstr-deposit-amount" placeholder="sats" style="font-size:11px;flex:1" min="1" max="${walletBalance}">
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;white-space:nowrap" onclick="doRoutstrNodeDeposit('${escapeAttr(nodeUrl)}',parseInt(document.getElementById('routstr-deposit-amount')?.value))">Deposit</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">
      ${presets.map(v => `<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="document.getElementById('routstr-deposit-amount').value=${v};doRoutstrNodeDeposit('${escapeAttr(nodeUrl)}',${v})">\u26a1 ${v.toLocaleString()}</button>`).join('')}
      ${walletBalance > 0 ? `<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="document.getElementById('routstr-deposit-amount').value=${walletBalance};doRoutstrNodeDeposit('${escapeAttr(nodeUrl)}',${walletBalance})">All (${walletBalance.toLocaleString()})</button>` : ''}
    </div>
    <div id="routstr-deposit-status" style="margin-top:6px"></div>
  </div>`;
}

let _rsConnecting = false;
export async function doRoutstrNodeDeposit(nodeUrl, amount) {
  if (_rsConnecting) return;
  _rsConnecting = true;
  const statusEl = document.getElementById('routstr-deposit-status');
  if (!amount || amount < 1 || isNaN(amount)) {
    _rsConnecting = false;
    if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--red)">Enter a valid amount</div>';
    return;
  }
  if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted)">Depositing ' + amount.toLocaleString() + ' sats\u2026</div>';
  // Safety check: verify mint is accepted by node
  try {
    const infoRes = await fetch(nodeUrl.replace(/\/+$/, '') + '/v1/info');
    if (infoRes.ok) {
      const info = await infoRes.json();
      const nodeMints = info.mints || [];
      const currentMint = await window.cashuGetMintUrl();
      if (nodeMints.length > 0 && !nodeMints.includes(currentMint)) {
        _rsConnecting = false;
        if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--red)">Node doesn\u2019t accept mint ' + escapeHTML(currentMint.replace(/^https?:\/\//, '')) + '. Accepted: ' + escapeHTML(nodeMints.map(m => m.replace(/^https?:\/\//, '')).join(', ')) + '</div>';
        return;
      }
    }
  } catch {}
  try {
    const existingKey = getRoutstrKey();
    const result = await window.cashuDepositToNode(nodeUrl, amount, existingKey);
    // Topup returns no api_key — keep existing. Create returns new api_key.
    if (result.api_key) await saveRoutstrKey(result.api_key);
    window.nostrSetSelectedNode(nodeUrl);
    // Only clear models if this is a new node connection (new key)
    if (result.api_key) {
      localStorage.removeItem('labcharts-routstr-model');
      localStorage.removeItem('labcharts-routstr-models');
    }
    const models = await fetchRoutstrModels();
    showNotification('Connected to ' + nodeUrl.replace(/^https?:\/\//, '') + ' \u26a1 ' + amount.toLocaleString() + ' sats', 'success');
    const panel = document.getElementById('ai-provider-panel');
    if (panel) panel.innerHTML = renderAIProviderPanel('routstr');
    if (models.length) renderRoutstrModelDropdown(models);
    _refreshRoutstrWalletBalance();
    refreshRoutstrBalance();
    _returnToChatIfOnboarding();
  } catch (e) {
    if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
    _refreshRoutstrWalletBalance();
    // Show recovery banner if there's a pending deposit
    if (window.cashuRecoverPendingDeposit) window.cashuRecoverPendingDeposit().then(function(token) {
      if (!token) return;
      const area = document.getElementById('routstr-wallet-fund-area');
      if (!area) return;
      area.style.display = 'block';
      area.innerHTML = '<div style="padding:8px;background:rgba(255,160,0,0.1);border:1px solid var(--yellow, #f0a800);border-radius:6px;margin-top:8px">' +
        '<div style="font-size:11px;color:var(--yellow, #f0a800);margin-bottom:4px">\u26a0 Deposit failed \u2014 your sats are safe</div>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">The node rejected the deposit. Recover the token back to your wallet:</div>' +
        '<div style="display:flex;gap:4px">' +
        '<button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;flex:1" data-token="' + escapeAttr(token) + '" onclick="cashuImportWallet(this.dataset.token).then(()=>{cashuClearPendingDeposit();showNotification(\'Recovered!\',\'success\');location.reload()}).catch(e=>showNotification(e.message,\'error\'))">Recover to Wallet</button>' +
        '<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" data-token="' + escapeAttr(token) + '" onclick="navigator.clipboard.writeText(this.dataset.token);this.textContent=\'\u2713 Copied\'">Copy Token</button>' +
        '</div></div>';
    });
  }
  _rsConnecting = false;
}

export async function doRoutstrNodeWithdraw() {
  const nodeUrl = (window.nostrGetSelectedNode?.() || '').replace(/\/+$/, '');
  const key = getRoutstrKey();
  if (!nodeUrl || !key) { showNotification('No active node session', 'error'); return; }
  const picker = document.getElementById('routstr-node-picker');
  if (picker) {
    picker.style.display = 'block';
    picker.innerHTML = '<div style="margin-top:8px;padding:10px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--accent)"><div style="font-size:11px;color:var(--text-muted)">Withdrawing from node\u2026</div></div>';
  }
  try {
    const res = await fetch(nodeUrl + '/v1/wallet/refund', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail?.error?.message || err?.detail || 'Refund failed: ' + res.status);
    }
    const data = await res.json();
    const token = data.token || data.cashu_token || (typeof data === 'string' && data.startsWith('cashu') ? data : null);
    if (!token) throw new Error('No token returned from node');
    // Import the refunded token into wallet
    const imported = await window.cashuImportWallet(token);
    // Clear the session key — balance is now 0 on the node
    await saveRoutstrKey('');
    showNotification('Withdrawn \u26a1 ' + imported.toLocaleString() + ' sats to wallet', 'success');
    // Re-render panel
    const panel = document.getElementById('ai-provider-panel');
    if (panel) panel.innerHTML = renderAIProviderPanel('routstr');
    initSettingsModelFetch();
    _refreshRoutstrWalletBalance();
  } catch (e) {
    if (picker) picker.innerHTML = '<div style="margin-top:8px;padding:10px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--border)"><div style="font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div></div>';
  }
}

async function _refreshRoutstrWalletBalance() {
  const el = document.getElementById('routstr-wallet-balance');
  if (!el) return;
  try {
    const balance = await window.cashuGetBalance();
    el.textContent = '\u26a1 ' + balance.toLocaleString() + ' sats';
  } catch {
    el.textContent = '\u26a1 0 sats';
  }
  // Keep mint label fresh
  if (window.cashuGetMintUrl) window.cashuGetMintUrl().then(function(url) {
    const mintEl = document.getElementById('routstr-mint-label');
    if (mintEl) mintEl.textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  });
}

// ─── Node action buttons with active state ───
let _activeNodeAction = null;

function _buildNodeActions(nodeUrl, hasKey, active) {
  const _pill = 'font-size:11px;padding:3px 10px;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)';
  const _activePill = 'font-size:11px;padding:3px 10px';
  const btns = [];
  if (nodeUrl) btns.push({ id: 'deposit', label: 'Deposit', fn: "connectRoutstrNode('" + nodeUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "')" });
  if (hasKey && nodeUrl) btns.push({ id: 'withdraw', label: 'Withdraw', fn: 'doRoutstrNodeWithdraw()' });
  btns.push({ id: 'browse', label: 'Browse', fn: 'showRoutstrNodePicker()' });
  return btns.map(b => {
    const isActive = b.id === active;
    return `<button class="import-btn ${isActive ? 'import-btn-primary' : 'import-btn-secondary'}" style="${isActive ? _activePill : _pill}" onclick="_setActiveNodeAction('${b.id}');${b.fn}">${b.label}</button>`;
  }).join('');
}

function _setActiveNodeAction(actionId) {
  _activeNodeAction = actionId;
  const el = document.getElementById('routstr-node-actions');
  const nodeUrl = window.nostrGetSelectedNode?.() || '';
  const hasKey = !!window.getRoutstrKey?.();
  if (el) el.innerHTML = _buildNodeActions(nodeUrl, hasKey, actionId);
}

// ─── Wallet action buttons with active state ───
let _activeWalletAction = null;

function _walletActionButtons(active) {
  const _pill = 'font-size:11px;padding:3px 10px;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)';
  const _active = 'font-size:11px;padding:3px 10px';
  const mainBtns = [
    { id: 'deposit', label: 'Deposit', fn: 'showRoutstrWalletFund' },
    { id: 'withdraw', label: 'Withdraw', fn: 'showRoutstrWithdraw' },
  ];
  const menuItems = [
    { id: 'seed', label: '\ud83c\udf31 Seed & Restore', fn: 'showWalletSeedPhrase' },
    { id: 'backup', label: '\ud83d\udce4 Export Token', fn: 'showRoutstrWalletBackup' },
  ];
  const main = mainBtns.map(b => {
    const isActive = b.id === active;
    return `<button class="import-btn ${isActive ? 'import-btn-primary' : 'import-btn-secondary'}" style="${isActive ? _active : _pill}" onclick="${b.fn}()">${b.label}</button>`;
  }).join('');
  const menuActive = menuItems.some(b => b.id === active);
  const menu = `<div style="position:relative;display:inline-block">
    <button class="import-btn ${menuActive ? 'import-btn-primary' : 'import-btn-secondary'}" style="${menuActive ? _active : _pill}" onclick="var m=document.getElementById('routstr-wallet-menu');var show=m.style.display!=='block';m.style.display=show?'block':'none';if(show){var h=function(e){if(!m.contains(e.target)&&e.target!==this){m.style.display='none';document.removeEventListener('click',h,true)}}.bind(this);setTimeout(function(){document.addEventListener('click',h,true)},0)}">\u22ef</button>
    <div id="routstr-wallet-menu" style="display:none;position:absolute;right:0;top:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:4px;z-index:10;min-width:120px;box-shadow:var(--shadow-lg)">
      ${menuItems.map(b => `<button class="import-btn ${b.id === active ? 'import-btn-primary' : 'import-btn-secondary'}" style="font-size:11px;padding:4px 10px;width:100%;text-align:left;margin-bottom:2px;${b.id === active ? '' : 'background:transparent;border-color:transparent;color:var(--text-primary)'}" onclick="document.getElementById('routstr-wallet-menu').style.display='none';${b.fn}()">${b.label}</button>`).join('')}
    </div>
  </div>`;
  return main + menu;
}

function _setActiveWalletAction(actionId) {
  _activeWalletAction = actionId;
  // Clear fund poll timer when switching away from deposit
  if (actionId !== 'deposit' && _rsFundPollTimer) { clearInterval(_rsFundPollTimer); _rsFundPollTimer = null; }
  const el = document.getElementById('routstr-wallet-actions');
  if (el) el.innerHTML = _walletActionButtons(actionId);
}

// ─── Wallet seed onboarding gate ───
async function _ensureWalletSeed(thenAction) {
  const hasSeed = await window.cashuHasWalletSeed?.();
  if (hasSeed) { thenAction(); return; }
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  area.style.display = 'block';
  const { mnemonic } = await window.cashuGenerateWalletSeed();
  area.innerHTML = `<div style="padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--accent);margin-top:8px">
    <div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:6px">Your wallet seed phrase</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">This 12-word phrase is the <strong>only way to recover your wallet</strong>. Write it down and store it somewhere safe.</div>
    <div id="routstr-seed-phrase" style="font-family:monospace;font-size:13px;word-break:break-word;background:var(--bg-primary);padding:10px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);filter:blur(4px);cursor:pointer;user-select:all" onclick="this.style.filter=this.style.filter?'':'blur(4px)'">${escapeHTML(mnemonic)}</div>
    <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
      <button class="import-btn import-btn-secondary" style="font-size:11px" onclick="navigator.clipboard.writeText('${escapeAttr(mnemonic)}');this.textContent='\u2713 Copied (60s)';clearTimeout(window._seedClipTimer);window._seedClipTimer=setTimeout(()=>navigator.clipboard.writeText(''),60000)">Copy</button>
      <label style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px;cursor:pointer">
        <input type="checkbox" id="routstr-seed-ack" onchange="document.getElementById('routstr-seed-continue').disabled=!this.checked"> I have saved my seed phrase
      </label>
    </div>
    <button class="import-btn import-btn-primary" id="routstr-seed-continue" disabled style="margin-top:8px;width:100%;font-size:12px" onclick="walletSeedAcknowledged()">Continue</button>
  </div>`;
  window._walletSeedThenAction = thenAction;
}

export function walletSeedAcknowledged() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (area) area.style.display = 'none';
  if (window._walletSeedThenAction) {
    window._walletSeedThenAction();
    window._walletSeedThenAction = null;
  }
}

// ─── Wallet seed display ───
export async function showWalletSeedPhrase() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  if (area.style.display !== 'none' && _activeWalletAction === 'seed') { area.style.display = 'none'; _setActiveWalletAction(null); return; }
  _setActiveWalletAction('seed');
  area.style.display = 'block';
  const mnemonic = await window.cashuGetWalletMnemonic?.();
  if (mnemonic) {
    area.innerHTML = `<div style="margin-top:8px">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Wallet Seed Phrase</div>
      <div id="wallet-seed-display" style="font-family:monospace;font-size:13px;background:var(--bg-primary);padding:10px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);filter:blur(4px);cursor:pointer;user-select:all" onclick="this.style.filter=this.style.filter?'':'blur(4px)'">${escapeHTML(mnemonic)}</div>
      <div style="display:flex;gap:4px;margin-top:6px">
        <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" onclick="navigator.clipboard.writeText('${escapeAttr(mnemonic)}');this.textContent='\u2713 Copied (60s)';clearTimeout(window._seedClipTimer);window._seedClipTimer=setTimeout(()=>navigator.clipboard.writeText(''),60000)">Copy Seed</button>
      </div>
      <div style="margin-top:10px"><div class="or-oauth-divider"><span>restore from seed</span></div>
      <textarea class="api-key-input" id="routstr-restore-seed" placeholder="Enter 12-word seed phrase..." rows="2" style="font-size:12px;font-family:monospace;resize:none;margin-top:4px"></textarea>
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;margin-top:4px;width:100%" onclick="doRoutstrWalletRestore()">Restore</button>
      <div id="routstr-restore-status"></div>
      </div>
    </div>`;
  } else {
    area.innerHTML = `<div style="margin-top:8px">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Restore Wallet from Seed</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">No seed yet \u2014 a seed is generated when you first deposit.</div>
      <textarea class="api-key-input" id="routstr-restore-seed" placeholder="Enter 12-word seed phrase..." rows="2" style="font-size:12px;font-family:monospace;resize:none"></textarea>
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;margin-top:4px;width:100%" onclick="doRoutstrWalletRestore()">Restore</button>
      <div id="routstr-restore-status"></div>
    </div>`;
  }
}

// ─── Wallet withdraw ───
export async function showRoutstrWithdraw() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  if (area.style.display !== 'none' && _activeWalletAction === 'withdraw') { area.style.display = 'none'; _setActiveWalletAction(null); return; }
  _setActiveWalletAction('withdraw');
  area.style.display = 'block';
  const balance = await window.cashuGetBalance();
  area.innerHTML = `<div style="margin-top:8px">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Withdraw</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Wallet: \u26a1 ${balance.toLocaleString()} sats</div>
    <div style="display:flex;gap:4px;margin-bottom:6px">
      <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="showRoutstrWithdrawLightning()">\u26a1 Lightning</button>
      <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="showRoutstrWithdrawToken()">Cashu Token</button>
    </div>
    <div id="routstr-withdraw-status"></div>
  </div>`;
}

export function showRoutstrWithdrawLightning() {
  const statusEl = document.getElementById('routstr-withdraw-status');
  if (!statusEl) return;
  statusEl.innerHTML = `<div style="margin-top:4px">
    <input type="text" class="api-key-input" id="routstr-withdraw-input" placeholder="Lightning address (user@domain) or invoice (lnbc...)" style="font-size:11px;font-family:monospace">
    <div id="routstr-withdraw-ln-amount" style="display:none;margin-top:4px">
      <div style="display:flex;gap:4px;align-items:center">
        <input type="number" class="api-key-input" id="routstr-withdraw-amount" placeholder="sats" style="font-size:11px;flex:1" min="1">
        <button class="import-btn import-btn-secondary" style="font-size:10px;padding:2px 8px;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="cashuGetMaxWithdrawable().then(m=>{document.getElementById('routstr-withdraw-amount').value=m})">Max</button>
      </div>
    </div>
    <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;margin-top:6px;width:100%" onclick="doRoutstrWithdrawQuote()">Withdraw</button>
  </div>`;
  const input = document.getElementById('routstr-withdraw-input');
  input?.addEventListener('input', () => {
    const val = input.value.trim();
    const needsAmount = val.includes('@') && !val.match(/^ln(bc|tb|bcrt)/);
    document.getElementById('routstr-withdraw-ln-amount').style.display = needsAmount ? 'block' : 'none';
  });
}

export async function showRoutstrWithdrawToken() {
  const statusEl = document.getElementById('routstr-withdraw-status');
  if (!statusEl) return;
  const balance = await window.cashuGetBalance();
  const presets = [100, 500, 1000, 2500].filter(v => v <= balance);
  statusEl.innerHTML = `<div style="margin-top:4px">
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Send as Cashu token</div>
    <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
      <input type="number" class="api-key-input" id="routstr-token-amount" placeholder="sats" style="font-size:11px;flex:1" min="1" max="${balance}">
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;white-space:nowrap" onclick="doRoutstrSendToken(parseInt(document.getElementById('routstr-token-amount')?.value))">Send</button>
    </div>
    ${balance > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px">
      ${presets.map(v => `<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="document.getElementById('routstr-token-amount').value=${v};doRoutstrSendToken(${v})">\u26a1 ${v.toLocaleString()}</button>`).join('')}
      <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" onclick="document.getElementById('routstr-token-amount').value=${balance};doRoutstrSendToken(${balance})">All (${balance.toLocaleString()})</button>
    </div>` : '<div style="font-size:11px;color:var(--text-muted)">No balance to withdraw</div>'}
    <div id="routstr-token-result"></div>
  </div>`;
}

export async function doRoutstrSendToken(amount) {
  const resultEl = document.getElementById('routstr-token-result');
  if (!resultEl) return;
  if (!amount || amount < 1 || isNaN(amount)) {
    resultEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter a valid amount</div>';
    return;
  }
  resultEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Creating token\u2026</div>';
  try {
    const result = await window.cashuSendAsToken(amount);
    resultEl.innerHTML = `<div style="margin-top:6px">
      <div style="font-size:11px;color:var(--green);margin-bottom:4px">\u2713 Token created \u2014 \u26a1 ${result.amount.toLocaleString()} sats</div>
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Copy and share. Sats are deducted from your wallet now.</div>
      <textarea class="api-key-input" style="font-size:10px;font-family:monospace;height:60px;resize:none;user-select:all" readonly onclick="this.select()">${escapeHTML(result.token)}</textarea>
      <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;margin-top:4px;width:100%" onclick="navigator.clipboard.writeText('${escapeAttr(result.token)}');this.textContent='\u2713 Copied (60s)';clearTimeout(window._tokenClipTimer);window._tokenClipTimer=setTimeout(()=>navigator.clipboard.writeText(''),60000)">Copy Token</button>
    </div>`;
    showNotification('\u26a1 ' + result.amount.toLocaleString() + ' sats token ready', 'success');
    _refreshRoutstrWalletBalance();
  } catch (e) {
    resultEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function doRoutstrWithdrawQuote() {
  const input = document.getElementById('routstr-withdraw-input');
  const statusEl = document.getElementById('routstr-withdraw-status');
  if (!input || !statusEl) return;
  const val = input.value.trim();
  if (!val) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter a Lightning invoice or address</div>';
    return;
  }
  const isAddress = val.includes('@') && !val.match(/^ln(bc|tb|bcrt)/);
  if (isAddress) {
    const amountInput = document.getElementById('routstr-withdraw-amount');
    const amount = parseInt(amountInput?.value) || 0;
    if (!amount || amount < 1) {
      statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter an amount in sats</div>';
      return;
    }
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Withdrawing to ' + escapeHTML(val) + '\u2026</div>';
    try {
      await window.cashuWithdrawToAddress(val, amount);
      statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--green)">\u2713 Sent ' + amount.toLocaleString() + ' sats to ' + escapeHTML(val) + '</div>';
      showNotification('Withdrawal complete', 'success');
      _refreshRoutstrWalletBalance();
    } catch (e) {
      statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
    }
    return;
  }
  if (!val.match(/^ln(bc|tb|bcrt)/)) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter a Lightning invoice (lnbc\u2026) or address (user@domain)</div>';
    return;
  }
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Checking fee\u2026</div>';
  try {
    const quote = await window.cashuCreateWithdrawQuote(val);
    statusEl.innerHTML = `<div style="margin-top:6px;padding:8px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--border)">
      <div style="font-size:11px;color:var(--text-muted)">Amount: <strong>${quote.amount.toLocaleString()} sats</strong></div>
      <div style="font-size:11px;color:var(--text-muted)">Fee reserve: <strong>${quote.fee_reserve.toLocaleString()} sats</strong></div>
      <div style="font-size:11px;color:var(--text-muted)">Total: <strong>${(quote.amount + quote.fee_reserve).toLocaleString()} sats</strong></div>
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;margin-top:6px;width:100%" onclick="doRoutstrWithdrawExecute('${escapeAttr(quote.quote)}')">Confirm Withdraw</button>
    </div>`;
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function doRoutstrWithdrawExecute(quoteId) {
  const statusEl = document.getElementById('routstr-withdraw-status');
  if (!statusEl) return;
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Withdrawing\u2026</div>';
  try {
    await window.cashuExecuteWithdraw(quoteId);
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--green)">\u2713 Withdrawn! Lightning payment sent.</div>';
    showNotification('Withdrawal complete', 'success');
    _refreshRoutstrWalletBalance();
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

// ─── Wallet restore ───
// showRoutstrWalletRestore merged into showWalletSeedPhrase

export async function doRoutstrWalletRestore() {
  const input = document.getElementById('routstr-restore-seed');
  const statusEl = document.getElementById('routstr-restore-status');
  if (!input || !statusEl) return;
  const mnemonic = input.value.trim().toLowerCase();
  const words = mnemonic.split(/\s+/);
  if (words.length !== 12) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter exactly 12 words</div>';
    return;
  }
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Restoring from mint\u2026 (this may take a moment)</div>';
  try {
    const result = await window.cashuRestoreWalletFromSeed(mnemonic);
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--green)">\u2713 Restored! Balance: \u26a1 ' + result.balance.toLocaleString() + ' sats</div>';
    showNotification('Wallet restored', 'success');
    _refreshRoutstrWalletBalance();
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}


// ─── PPQ handlers ───
let _ppqCreating = false;
export async function handleCreatePpqAccount() {
  if (_ppqCreating) return;
  _ppqCreating = true;
  const createBtn = document.querySelector('[onclick="handleCreatePpqAccount()"]');
  if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Creating\u2026'; }
  const status = document.getElementById('ppq-key-status');
  if (status) status.innerHTML = '<span style="color:var(--text-muted)">Creating account\u2026</span>';
  try {
    const result = await createPpqAccount();
    if (!result.success && !result.api_key) throw new Error('Account creation failed');
    await savePpqKey(result.api_key);
    savePpqCreditId(result.credit_id);
    const models = await fetchPpqModels(result.api_key);
    // Show key reveal screen — user must save it before continuing
    const panel = document.getElementById('ai-provider-panel');
    if (panel) {
      panel.innerHTML = `<div class="ai-provider-panel">
        <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--accent)">
          <div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:6px">\u26a0 Save your account details</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">PPQ accounts are anonymous \u2014 <strong>there is no way to recover a lost key</strong>. Copy both values now and store them somewhere safe.</div>
          <label style="font-size:11px;color:var(--text-muted)">API Key</label>
          <div style="font-family:monospace;font-size:11px;word-break:break-all;background:var(--bg-primary);padding:8px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);user-select:all;cursor:text">${escapeHTML(result.api_key)}</div>
          <label style="font-size:11px;color:var(--text-muted);margin-top:8px;display:block">Credit ID <span style="font-size:10px">(enter at <a href="https://ppq.ai/invite/8f3017cd" target="_blank" rel="noopener" style="color:var(--accent)">ppq.ai</a> to access your account on the web)</span></label>
          <div style="font-family:monospace;font-size:11px;word-break:break-all;background:var(--bg-primary);padding:8px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);user-select:all;cursor:text">${escapeHTML(result.credit_id)}</div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="import-btn import-btn-primary" style="font-size:12px" onclick="navigator.clipboard.writeText('API Key: ${escapeAttr(result.api_key)}\\nCredit ID: ${escapeAttr(result.credit_id)}');this.textContent='\u2713 Copied (clears in 60s)';clearTimeout(window._ppqClipTimer);window._ppqClipTimer=setTimeout(()=>navigator.clipboard.writeText(''),60000)">Copy Both</button>
            <button class="import-btn import-btn-secondary" style="font-size:12px" onclick="dismissPpqKeyReveal()">I\u2019ve saved it</button>
          </div>
        </div>
      </div>`;
    }
  } catch (e) {
    if (status) status.innerHTML = '<span style="color:var(--red)">Failed to create account: ' + escapeHTML(e.message) + '</span>';
    if (createBtn) { createBtn.disabled = false; createBtn.textContent = 'Create Account (instant, no signup)'; }
  }
  _ppqCreating = false;
}

export function dismissPpqKeyReveal() {
  // Re-render panel to normal connected state + load models
  const panel = document.getElementById('ai-provider-panel');
  if (panel) panel.innerHTML = renderAIProviderPanel('ppq');
  let cachedModels = []; try { cachedModels = JSON.parse(localStorage.getItem('labcharts-ppq-models') || '[]'); } catch(e) {}
  if (cachedModels.length) renderPpqModelDropdown(cachedModels);
  getPpqBalance().then(function(balance) {
    const el = document.getElementById('ppq-balance');
    if (el && balance != null) el.innerHTML = _ppqBalanceHtml(balance);
  });
  // New accounts start at $0 — always show topup, never auto-return to chat
  showPpqTopup();
  showNotification('Account ready \u2014 top up to start using AI', 'info');
}

export async function handleSavePpqKey() {
  const input = document.getElementById('ppq-key-input');
  const btn = document.getElementById('save-ppq-key-btn');
  const status = document.getElementById('ppq-key-status');
  const key = input.value.trim();
  if (!key) { status.innerHTML = '<span style="color:var(--red)">Please enter an API key</span>'; return; }
  btn.disabled = true; btn.textContent = 'Validating...';
  const result = await validatePpqKey(key);
  if (result.valid) {
    await savePpqKey(key);
    status.innerHTML = '<span style="color:var(--green)">Connected \u2014 loading models\u2026</span>';
    const models = await fetchPpqModels(key);
    if (models.length) {
      renderPpqModelDropdown(models);
      status.innerHTML = '<span style="color:var(--green)">\u2713 Connected</span>';
    } else {
      status.innerHTML = '<span style="color:var(--green)">\u2713 Connected</span>';
    }
    showNotification('PPQ key saved', 'success');
    _returnToChatIfOnboarding();
  } else {
    status.innerHTML = `<span style="color:var(--red)">${escapeHTML(result.error)}</span>`;
  }
  btn.disabled = false; btn.textContent = 'Save & Validate';
}

export async function handleRemovePpqKey() {
  // Check balance before removing — warn if funds remain
  const balance = await getPpqBalance();
  const hasFunds = balance != null && parseFloat(balance) > 0;
  const msg = hasFunds
    ? `This account has $${parseFloat(balance).toFixed(2)} remaining. Removing this key will permanently lose access to those funds unless you\u2019ve saved the key elsewhere.\n\nRemove PPQ key?`
    : 'Remove PPQ key? Make sure you\u2019ve saved it if you want to reuse this account later.';
  if (await showConfirmDialog(msg)) {
    localStorage.removeItem('labcharts-ppq-key');
    updateKeyCache('labcharts-ppq-key', null);
    localStorage.removeItem('labcharts-ppq-models');
    localStorage.removeItem('labcharts-ppq-model');
    localStorage.removeItem('labcharts-ppq-pricing');
    localStorage.removeItem('labcharts-ppq-vision-models');
    localStorage.removeItem('labcharts-ppq-credit-id');
    showNotification('PPQ key removed', 'info');
    window.openSettingsModal?.();
  }
}

export function renderPpqModelDropdown(models) {
  const area = document.getElementById('ppq-model-area');
  if (!area || !models.length) return;
  const currentModel = getPpqModel();
  const opts = buildModelOptions('ppq', models, currentModel, function(m) { return m.name || m.id; });
  area.innerHTML = '<label style="font-size:12px;color:var(--text-muted)">Model</label>' +
    '<select class="api-key-input" id="ppq-model-select" style="margin-top:4px" onchange="setPpqModel(this.value);updatePpqModelPricing(this.value)">' + opts + '</select>' +
    '<div id="ppq-model-pricing" style="margin-top:4px">' + renderModelPricingHint('ppq', currentModel) + '</div>';
}

export function updatePpqModelPricing(modelId) {
  const el = document.getElementById('ppq-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('ppq', modelId);
}

function _ppqBalanceHtml(balance) {
  const v = parseFloat(balance);
  const color = v < 0.10 ? 'var(--red)' : v < 0.50 ? 'var(--yellow, #f0a800)' : 'var(--green)';
  return 'Balance: <span style="color:' + color + '">$' + v.toFixed(2) + '</span>';
}

export async function refreshPpqBalance() {
  const el = document.getElementById('ppq-balance');
  if (!el) return;
  el.textContent = 'Balance: refreshing\u2026';
  const balance = await getPpqBalance();
  if (balance != null) el.innerHTML = _ppqBalanceHtml(balance);
  else el.textContent = 'Balance: unavailable';
}

let _ppqTopupPollTimer = null;
let _ppqCountdownTimer = null;

const _ppqSvg = {
  lightning: '<svg viewBox="0 0 282 282"><circle cx="141" cy="141" r="141" fill="#7B1AF7"/><path d="M79.76 144.05L173.76 63.05C177.86 60.42 181.76 63.05 179.26 67.55L149.26 126.55H202.76C202.76 126.55 211.26 126.55 202.76 133.55L110.26 215.05C103.76 220.55 99.26 217.55 103.76 209.05L132.76 151.55H79.76C79.76 151.55 71.26 151.55 79.76 144.05Z" fill="#fff"/></svg>',
  btc: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#F7931A"/><path fill="#fff" fill-rule="nonzero" d="M23.189 14.02c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.114-.92-.22-1.385-.326l.695-2.783L15.596 6l-.708 2.839c-.376-.086-.746-.17-1.104-.26l.002-.009-2.384-.595-.46 1.846s1.283.294 1.256.312c.7.175.826.638.805 1.006l-.806 3.235c.048.012.11.03.18.057l-.183-.045-1.13 4.532c-.086.212-.303.531-.793.41.018.025-1.256-.313-1.256-.313l-.858 1.978 2.25.561c.418.105.828.215 1.231.318l-.715 2.872 1.727.43.708-2.84c.472.127.93.245 1.378.357l-.706 2.828 1.728.43.715-2.866c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.588-4.192 1.13-.26 1.98-1.003 2.207-2.538zm-3.95 5.538c-.533 2.147-4.148.986-5.32.695l.95-3.805c1.172.293 4.929.872 4.37 3.11zm.535-5.569c-.487 1.953-3.495.96-4.47.717l.86-3.45c.975.243 4.118.696 3.61 2.733z"/></svg>',
  xmr: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#FF6600"/><path fill="#fff" fill-rule="nonzero" d="M15.97 5.235c5.985 0 10.825 4.84 10.825 10.824a11.07 11.07 0 01-.558 3.432h-3.226v-9.094l-7.04 7.04-7.04-7.04v9.094H5.704a11.07 11.07 0 01-.557-3.432c0-5.984 4.84-10.824 10.824-10.824zM14.358 19.02L16 20.635l1.613-1.614 3.051-3.08v5.72h4.547a10.806 10.806 0 01-9.24 5.192c-3.902 0-7.334-2.082-9.24-5.192h4.546v-5.72l3.08 3.08z"/></svg>',
  ltc: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#A6A9AA"/><path fill="#fff" d="M10.427 19.214L9 19.768l.688-2.759 1.444-.58L13.213 8h5.129l-1.519 6.196 1.41-.571-.68 2.75-1.427.571-.848 3.483H23L22.127 24H9.252z"/></svg>',
  liquid: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#0D1437"/><path fill="#22E1C9" d="M16 7c-2.4 3.5-6 7.5-6 11.5C10 21.54 12.69 24 16 24s6-2.46 6-5.5C22 14.5 18.4 10.5 16 7zm0 14.5c-1.93 0-3.5-1.32-3.5-3 0-2.25 2.13-4.82 3.5-6.71 1.37 1.89 3.5 4.46 3.5 6.71 0 1.68-1.57 3-3.5 3z"/></svg>',
};
const PPQ_METHODS = [
  { id: 'btc-lightning', svg: _ppqSvg.lightning, label: 'Lightning', min: 1, amounts: [1, 2, 5, 10] },
  { id: 'btc', svg: _ppqSvg.btc, label: 'Bitcoin', min: 10, amounts: [10, 25, 50, 100] },
  { id: 'xmr', svg: _ppqSvg.xmr, label: 'Monero', min: 5, amounts: [5, 10, 25, 50] },
  { id: 'ltc', svg: _ppqSvg.ltc, label: 'Litecoin', min: 2, amounts: [2, 5, 10, 25] },
  { id: 'lbtc', svg: _ppqSvg.liquid, label: 'Liquid', min: 2, amounts: [2, 5, 10, 25] },
];
let _ppqSelectedMethod = 'btc-lightning';

function _ppqMethodBtn(m, active) {
  return `<button class="${active ? 'ppq-method-btn active' : 'ppq-method-btn'}" onclick="selectPpqMethod('${m.id}')"><span class="ppq-method-icon">${m.svg}</span><span class="ppq-method-label">${m.label}</span></button>`;
}

export function showPpqTopup() {
  const area = document.getElementById('ppq-topup-area');
  if (!area) return;
  const toggle = document.getElementById('ppq-topup-toggle');
  if (area.style.display !== 'none') {
    area.style.display = 'none';
    if (toggle) toggle.textContent = 'Top Up';
    return;
  }
  area.style.display = 'block';
  if (toggle) toggle.textContent = 'Close';
  _ppqSelectedMethod = 'btc-lightning';
  // Inject styles if not present
  if (!document.getElementById('ppq-topup-style')) {
    const style = document.createElement('style');
    style.id = 'ppq-topup-style';
    style.textContent = `.ppq-method-btn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:10px;border:2px solid var(--border);background:var(--bg-primary);color:var(--text-muted);cursor:pointer;flex:1;min-width:0;transition:all .15s}
.ppq-method-btn:hover{border-color:var(--text-muted);color:var(--text-primary)}
.ppq-method-btn.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,var(--bg-primary));box-shadow:0 0 0 1px var(--accent)}
.ppq-method-btn.active .ppq-method-label{color:var(--text-primary)}
.ppq-method-icon{width:24px;height:24px;display:block}
.ppq-method-icon svg{width:100%;height:100%}
.ppq-method-label{font-size:10px;font-weight:600;white-space:nowrap;letter-spacing:.01em}
.ppq-amt-btn{padding:7px 0;border-radius:8px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-size:13px;font-weight:600;flex:1;text-align:center;transition:all .15s}
.ppq-amt-btn:hover{border-color:var(--accent);color:var(--accent)}
@keyframes ppq-pulse{0%,100%{opacity:1}50%{opacity:.3}}`;
    document.head.appendChild(style);
  }
  _renderPpqTopupPicker(area);
}

function _renderPpqTopupPicker(area) {
  const method = PPQ_METHODS.find(function(m) { return m.id === _ppqSelectedMethod; }) || PPQ_METHODS[0];
  area.innerHTML = `<div style="margin-top:8px;padding:12px;background:var(--bg-secondary);border-radius:10px;border:1px solid var(--border)">
    <div style="display:flex;gap:6px;margin-bottom:10px">${PPQ_METHODS.map(function(m) { return _ppqMethodBtn(m, m.id === _ppqSelectedMethod); }).join('')}</div>
    <div style="display:flex;gap:6px">${method.amounts.map(function(v) {
      return '<button class="ppq-amt-btn" onclick="doPpqTopup(' + v + ')">$' + v + '</button>';
    }).join('')}<div id="ppq-custom-slot" style="flex:1;display:flex"><button class="ppq-amt-btn" style="width:100%;color:var(--text-muted)" onclick="ppqShowCustomInput()">$\u2026</button></div></div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:5px;text-align:center">$2 is enough for onboarding, a few imports, and chats \u00b7 min $${method.min}</div>
  </div>`;
}

export function selectPpqMethod(methodId) {
  _ppqSelectedMethod = methodId;
  const area = document.getElementById('ppq-topup-area');
  if (area) _renderPpqTopupPicker(area);
}

export function ppqShowCustomInput() {
  const slot = document.getElementById('ppq-custom-slot');
  if (!slot) return;
  slot.innerHTML = '<input type="text" inputmode="decimal" id="ppq-custom-amount" class="ppq-amt-btn" style="width:100%;text-align:center;cursor:text" placeholder="$" onkeydown="if(event.key===\'Enter\')doPpqTopupCustom();if(event.key===\'Escape\')selectPpqMethod(\'' + _ppqSelectedMethod + '\')" onblur="if(this.value.trim())doPpqTopupCustom()">';
  const input = document.getElementById('ppq-custom-amount');
  if (input) input.focus();
}

export function doPpqTopupCustom() {
  const input = document.getElementById('ppq-custom-amount');
  if (!input) return;
  const raw = input.value.replace(/[^0-9.]/g, '');
  const amount = parseFloat(raw);
  const method = PPQ_METHODS.find(function(m) { return m.id === _ppqSelectedMethod; }) || PPQ_METHODS[0];
  if (isNaN(amount) || amount < method.min) {
    showNotification('Minimum amount is $' + method.min, 'error');
    return;
  }
  doPpqTopup(amount);
}

export async function doPpqTopup(amount) {
  const area = document.getElementById('ppq-topup-area');
  if (!area) return;
  const method = PPQ_METHODS.find(function(m) { return m.id === _ppqSelectedMethod; }) || PPQ_METHODS[0];
  area.innerHTML = '<div style="margin-top:8px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);font-size:12px;color:var(--text-muted)">Generating invoice\u2026</div>';
  try {
    const result = await createPpqTopup(amount, _ppqSelectedMethod);
    const payString = result.lightning_invoice || result.payment_address || '';
    const invoiceId = result.invoice_id || '';
    const cryptoAmount = result.crypto_amount_due ? parseFloat(result.crypto_amount_due) : null;
    // QR data: Lightning invoices use uppercase for smaller QR; addresses stay as-is
    const isLightning = _ppqSelectedMethod === 'btc-lightning';
    let qrSvg = '';
    try {
      const qr = qrcode(0, 'L');
      qr.addData(isLightning ? payString.toUpperCase() : payString);
      qr.make();
      qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    } catch { /* QR generation failed, show text only */ }
    // URI scheme for "Open in Wallet"
    const walletUri = isLightning ? 'lightning:' + escapeAttr(payString)
      : _ppqSelectedMethod === 'btc' || _ppqSelectedMethod === 'lbtc' ? 'bitcoin:' + escapeAttr(payString)
      : _ppqSelectedMethod === 'ltc' ? 'litecoin:' + escapeAttr(payString)
      : _ppqSelectedMethod === 'xmr' ? 'monero:' + escapeAttr(payString)
      : '#';
    const copyLabel = isLightning ? 'Copy Invoice' : 'Copy Address';
    const detailLabel = isLightning ? 'Show invoice text' : 'Show address';
    const cryptoHint = cryptoAmount ? '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">' + cryptoAmount + '</div>' : '';
    area.innerHTML = `<div style="margin-top:8px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border)">
      <div style="display:flex;gap:12px;align-items:flex-start">
        ${qrSvg ? '<div style="flex-shrink:0;background:#fff;padding:6px;border-radius:6px;width:140px;height:140px">' + qrSvg + '</div>' : ''}
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:2px;display:flex;align-items:center;gap:4px"><span style="width:16px;height:16px;display:inline-block">${method.svg}</span> ${method.label} \u2014 $${parseFloat(amount).toFixed(2)}</div>
          ${cryptoHint}
          <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">
            <button class="import-btn import-btn-primary" style="font-size:11px;padding:4px 10px" onclick="navigator.clipboard.writeText('${escapeAttr(payString)}');this.textContent='\u2713 Copied!'">${copyLabel}</button>
            <a href="${walletUri}" class="import-btn import-btn-secondary" style="font-size:11px;padding:4px 10px;text-decoration:none;text-align:center">Open in Wallet</a>
            <button class="import-btn import-btn-secondary" style="font-size:11px;padding:4px 10px" onclick="cancelPpqTopup()">Cancel</button>
          </div>
          <div id="ppq-topup-status" style="margin-top:6px;font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:5px"><span id="ppq-topup-dot" style="width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block;animation:ppq-pulse 1.5s ease-in-out infinite"></span> <span id="ppq-topup-countdown"></span></div>
        </div>
      </div>
      <details style="margin-top:6px"><summary style="font-size:11px;color:var(--text-muted);cursor:pointer">${detailLabel}</summary>
        <div style="font-family:monospace;font-size:9px;word-break:break-all;background:var(--bg-primary);padding:6px;border-radius:4px;border:1px solid var(--border);color:var(--text-secondary);max-height:80px;overflow-y:auto;user-select:all;cursor:text;margin-top:4px">${escapeHTML(payString)}</div>
      </details>
    </div>`;
    // Live countdown timer
    const expiresTs = result.expires_at ? result.expires_at * 1000 : 0;
    _ppqCountdownTimer = setInterval(function() {
      const cdEl = document.getElementById('ppq-topup-countdown');
      if (!cdEl || !expiresTs) return;
      const remaining = Math.max(0, Math.floor((expiresTs - Date.now()) / 1000));
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      cdEl.textContent = remaining > 0
        ? 'Waiting for payment\u2026 ' + mins + ':' + (secs < 10 ? '0' : '') + secs
        : 'Invoice expired';
      if (remaining <= 0) clearInterval(_ppqCountdownTimer);
    }, 1000);
    // Poll for payment
    _ppqTopupPollTimer = setInterval(async function() {
      try {
        const status = await checkPpqTopupStatus(invoiceId);
        if (!status) return;
        const s = (status.status || '').toLowerCase();
        if (s === 'paid' || s === 'complete' || s === 'settled' || s === 'processing') {
          clearInterval(_ppqTopupPollTimer); _ppqTopupPollTimer = null;
          clearInterval(_ppqCountdownTimer); _ppqCountdownTimer = null;
          // Show paid state
          const topupArea = document.getElementById('ppq-topup-area');
          if (topupArea) {
            topupArea.innerHTML = '<div style="margin-top:8px;padding:16px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--green);text-align:center"><div style="font-size:24px;margin-bottom:6px">\u2713</div><div style="font-size:13px;font-weight:600;color:var(--green)">Payment received!</div><div style="font-size:12px;color:var(--text-muted);margin-top:4px">$' + parseFloat(amount).toFixed(2) + ' added to your balance</div></div>';
          }
          showNotification('Top-up successful!', 'success');
          // Refresh balance
          const balance = await getPpqBalance();
          const balEl = document.getElementById('ppq-balance');
          if (balEl && balance != null) balEl.innerHTML = _ppqBalanceHtml(balance);
          setTimeout(function() { _returnToChatIfOnboarding(); }, 2000);
        } else if (s === 'expired' || s === 'invalid') {
          clearInterval(_ppqTopupPollTimer); _ppqTopupPollTimer = null;
          clearInterval(_ppqCountdownTimer); _ppqCountdownTimer = null;
          const statusEl = document.getElementById('ppq-topup-status');
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Invoice expired. Try again.</span>';
        }
      } catch { /* ignore poll errors */ }
    }, 3000);
  } catch (e) {
    area.innerHTML = `<div style="margin-top:8px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);font-size:12px;color:var(--red)">${escapeHTML(e.message)}</div>`;
  }
}

export function cancelPpqTopup() {
  if (_ppqTopupPollTimer) { clearInterval(_ppqTopupPollTimer); _ppqTopupPollTimer = null; }
  if (_ppqCountdownTimer) { clearInterval(_ppqCountdownTimer); _ppqCountdownTimer = null; }
  const area = document.getElementById('ppq-topup-area');
  if (area) area.style.display = 'none';
}


// ─── Custom API handlers ───
async function handleSaveCustomApi() {
  const urlInput = document.getElementById('custom-url-input');
  const keyInput = document.getElementById('custom-key-input');
  if (!urlInput || !keyInput) return;
  const url = urlInput.value.trim().replace(/\/+$/, '');
  const key = keyInput.value.trim();
  if (!url) { showNotification('Please enter a base URL', 'error'); return; }
  if (!key) { showNotification('Please enter an API key', 'error'); return; }
  const result = await validateCustomApiKey(url, key);
  if (!result.valid) { showNotification(result.error, 'error'); return; }
  setCustomApiUrl(url);
  await saveCustomApiKey(key);
  showNotification('Connected', 'success');
  const models = await fetchCustomApiModels(url, key);
  // Re-render the full panel to show connected state
  const panel = document.getElementById('ai-provider-panel');
  if (panel) panel.innerHTML = renderAIProviderPanel('custom');
  if (models.length) renderCustomApiModelDropdown(models);
}

function handleRemoveCustomApi() {
  localStorage.removeItem('labcharts-custom-url');
  localStorage.removeItem('labcharts-custom-model');
  localStorage.removeItem('labcharts-custom-models');
  encryptedSetItem('labcharts-custom-key', '').then(function() { updateKeyCache('labcharts-custom-key', ''); });
  const panel = document.getElementById('ai-provider-panel');
  if (panel) panel.innerHTML = renderAIProviderPanel('custom');
}

function renderCustomApiModelDropdown(models) {
  const area = document.getElementById('custom-model-area');
  if (!area) return;
  const currentModel = getCustomApiModel();
  const opts = buildModelOptions('custom', models, currentModel, function(m) { return m.name || m.id; });
  const isCustom = !models.some(m => m.id === currentModel) && currentModel;
  area.innerHTML = `<label style="font-size:12px;color:var(--text-muted)">Model</label>
    <select class="api-key-input" id="custom-model-select" style="margin-top:4px" onchange="setCustomApiModel(this.value);updateCustomModelPricing(this.value)">${isCustom ? '<option value="__custom" disabled selected>Using custom model</option>' : ''}${opts}</select>
    <div style="margin-top:6px;display:flex;align-items:center;gap:8px"><input type="text" id="custom-manual-model" placeholder="Or type any model ID and press Enter" style="font-size:11px;flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-primary);font-family:monospace${isCustom ? ';border-color:var(--accent)' : ''}" value="${isCustom ? escapeHTML(currentModel) : ''}" onkeydown="if(event.key==='Enter'){applyCustomApiManualModel()}"></div>
    <div id="custom-model-pricing" style="margin-top:4px">${renderModelPricingHint('custom', currentModel)}</div>`;
}

function updateCustomModelPricing(modelId) {
  const el = document.getElementById('custom-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('custom', modelId || getCustomApiModel());
}

function applyCustomApiManualModel() {
  const input = document.getElementById('custom-manual-model');
  if (!input) return;
  const model = input.value.trim();
  if (!model) { showNotification('Enter a model ID', 'error'); return; }
  setCustomApiModel(model);
  // Update dropdown if it exists
  const select = document.getElementById('custom-model-select');
  if (select) select.value = model;
  updateCustomModelPricing(model);
  showNotification('Model set to ' + model, 'success');
}


// ─── Model advisor helpers ───
function refreshModelAdvisor() {
  const details = window._lastOllamaModelDetails || [];
  if (details.length) renderModelAdvisor(details, document.getElementById('local-ai-model-select'), !!window._lastIsOllamaServer);
}

function copyOllamaPullCmd(cmd) {
  navigator.clipboard.writeText(cmd).then(() => showNotification('Copied: ' + cmd, 'info'));
}

function applyHardwareOverrideFn(vram) {
  const v = parseFloat(vram);
  if (isNaN(v) || v <= 0) { showNotification('Enter a valid VRAM amount in GB', 'error'); return; }
  saveHardwareOverride(v);
  const details = window._lastOllamaModelDetails || [];
  if (details.length) renderModelAdvisor(details, document.getElementById('local-ai-model-select'), !!window._lastIsOllamaServer);
}

function clearHardwareOverrideFn() {
  saveHardwareOverride(null);
  const details = window._lastOllamaModelDetails || [];
  if (details.length) renderModelAdvisor(details, document.getElementById('local-ai-model-select'), !!window._lastIsOllamaServer);
}


// ═══════════════════════════════════════════════
// WINDOW EXPORTS (for HTML onclick handlers)
// ═══════════════════════════════════════════════
Object.assign(window, {
  renderAIProviderPanel,
  toggleAIPause,
  switchAIProvider,
  initSettingsModelFetch,
  initSettingsOllamaCheck,
  testOllamaConnection,
  testPIIOllamaConnection,
  refreshVeniceBalance,
  updateVeniceModelPricing,
  toggleVeniceE2EE,
  updateOpenRouterModelPricing,
  updateRoutstrModelPricing,
  handleSaveVeniceKey,
  handleRemoveVeniceKey,
  renderVeniceModelDropdown,
  handleSaveOpenRouterKey,
  handleRemoveOpenRouterKey,
  renderOpenRouterModelDropdown,
  applyCustomOpenRouterModel,
  onOpenRouterDropdownChange,
  handleSaveRoutstrKey,
  handleRemoveRoutstrKey,
  renderRoutstrModelDropdown,
  refreshCashuWalletBalance,
  refreshRoutstrBalance,
  showRoutstrWalletFund,
  rsWalletFundCustomInput,
  doRoutstrWalletFundCustom,
  doRoutstrWalletFund,
  doRoutstrWalletReceiveCashu,
  showRoutstrMintEdit,
  doRoutstrMintChange,
  showRoutstrWalletBackup,
  showRoutstrNodePicker,
  connectRoutstrNode,
  doRoutstrNodeDeposit,
  doRoutstrNodeWithdraw,
  _setActiveNodeAction,
  walletSeedAcknowledged,
  showWalletSeedPhrase,
  showRoutstrWithdraw,
  showRoutstrWithdrawLightning,
  showRoutstrWithdrawToken,
  doRoutstrSendToken,
  doRoutstrWithdrawQuote,
  doRoutstrWithdrawExecute,
  doRoutstrWalletRestore,
  handleCreatePpqAccount,
  dismissPpqKeyReveal,
  handleSavePpqKey,
  handleRemovePpqKey,
  renderPpqModelDropdown,
  updatePpqModelPricing,
  refreshPpqBalance,
  showPpqTopup,
  selectPpqMethod,
  doPpqTopup,
  ppqShowCustomInput,
  doPpqTopupCustom,
  cancelPpqTopup,
  refreshOpenRouterBalance,
  showInsufficientBalanceDialog,
  handleSaveCustomApi,
  handleRemoveCustomApi,
  renderCustomApiModelDropdown,
  applyCustomApiManualModel,
  updateCustomModelPricing,
  copyOllamaPullCmd,
  refreshModelAdvisor,
  applyHardwareOverride: applyHardwareOverrideFn,
  clearHardwareOverride: clearHardwareOverrideFn,
});
