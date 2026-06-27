// @ts-check
// provider-local-ai-controls.js - Local AI connection checks, model advisor, and hardware overrides.

import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import {
  getOllamaMainModel,
  getOllamaPIIModel,
  getOllamaPIIUrl,
  setOllamaMainModel,
  setOllamaPIIModel,
  setOllamaPIIUrl,
  writeProviderModelCacheMeta,
} from './api.js';
import { getOllamaConfig, checkOllama, checkOpenAICompatible, saveOllamaConfig, setOllamaPIIEnabled } from './pii.js';
import { detectHardware, assessModel, assessFitness, getBestModel, getUpgradeSuggestion, saveHardwareOverride, getHardwareOverride } from './hardware.js';
import { renderAgentRouterProviderModelDropdown } from './provider-model-controls.js';

let returnToChatIfOnboarding = function() {};
const LOCAL_AI_NOT_CONNECTED_TEXT = 'Not connected \u2014 check URL and ensure your server is running';
const LOCAL_AI_ACTION_ATTR = 'data-local-ai-action';
const LOCAL_AI_COMMAND_ATTR = 'data-local-ai-command';
const localAiControlDelegateRoots = new WeakSet();

export function configureLocalAiControls(options = {}) {
  if (typeof options.returnToChatIfOnboarding === 'function') {
    returnToChatIfOnboarding = options.returnToChatIfOnboarding;
  }
}

export function initSettingsOllamaCheck() {
  const config = getOllamaConfig();
  const mainUrl = config.url;
  const piiUrl = getOllamaPIIUrl();
  const sameUrl = mainUrl === piiUrl;

  if (document.getElementById('local-ai-dot')) {
    Promise.allSettled([
      checkOpenAICompatible(mainUrl, config.apiKey),
      checkOllama(mainUrl),
    ]).then(([openaiResult, ollamaResult]) => {
      const result = openaiResult.status === 'fulfilled' ? openaiResult.value : { available: false, models: [] };
      const ollama = ollamaResult.status === 'fulfilled' ? ollamaResult.value : { available: false, models: [], modelDetails: [] };
      const dot = document.getElementById('local-ai-dot');
      const text = document.getElementById('local-ai-status-text');
      const modelSection = document.getElementById('local-ai-model-section');
      const modelSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('local-ai-model-select'));
      if (!dot || !text) return;
      if (result.available && result.models.length > 0) {
        dot.classList.add('connected');
        let currentModel = getOllamaMainModel();
        if (!result.models.includes(currentModel)) {
          currentModel = result.models[0];
          setOllamaMainModel(currentModel);
        }
        text.textContent = `Connected (${currentModel})`;
        localStorage.setItem('labcharts-ollama-models', JSON.stringify(result.models));
        writeProviderModelCacheMeta('ollama', { endpoint: mainUrl.replace(/\/+$/, '') + '/v1/models' });
        if (modelSection && modelSelect) {
          modelSection.style.display = 'block';
          modelSelect.innerHTML = result.models.map(m => `<option value="${escapeHTML(m)}" ${m === currentModel ? 'selected' : ''}>${escapeHTML(m)}</option>`).join('');
        }
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
        localStorage.removeItem('labcharts-ollama-models');
        localStorage.removeItem('labcharts-ollama-models-meta');
      } else {
        dot.classList.add('disconnected');
        text.textContent = 'Not connected \u2014 start your local server to use';
        localStorage.removeItem('labcharts-ollama-models');
        localStorage.removeItem('labcharts-ollama-models-meta');
      }
      if (sameUrl) {
        window.updatePrivacyStatusCard?.(result.available && result.models.length > 0);
      } else {
        window.updatePrivacyStatusCard?.();
      }
    });
  } else {
    window.updatePrivacyStatusCard?.();
  }
}

function isLocalUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch { return true; }
}

function closestLocalAiAction(target) {
  if (!target || typeof target.closest !== 'function') return null;
  return target.closest(`[${LOCAL_AI_ACTION_ATTR}]`);
}

function toggleHardwareOverride(actionEl) {
  const body = actionEl.nextElementSibling;
  if (!(body instanceof HTMLElement)) return;
  const shouldOpen = body.style.display === 'none';
  body.style.display = shouldOpen ? 'flex' : 'none';
  actionEl.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

function handleLocalAiAction(actionEl) {
  const action = actionEl.getAttribute(LOCAL_AI_ACTION_ATTR) || '';
  if (action === 'copy-pull') {
    const command = actionEl.getAttribute(LOCAL_AI_COMMAND_ATTR) || '';
    if (command) copyOllamaPullCmd(command);
    return true;
  }
  if (action === 'toggle-override') {
    toggleHardwareOverride(actionEl);
    return true;
  }
  if (action === 'apply-hardware-override') {
    const input = document.getElementById('hw-vram-override-input');
    applyHardwareOverride(input instanceof HTMLInputElement ? input.value : '');
    return true;
  }
  if (action === 'clear-hardware-override') {
    clearHardwareOverride();
    return true;
  }
  return false;
}

function handleLocalAiActionClick(event) {
  const actionEl = closestLocalAiAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  if (!handleLocalAiAction(actionEl)) return;
  event.preventDefault();
  event.stopPropagation();
}

function handleLocalAiActionKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestLocalAiAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  if (event.target?.closest?.('button, input, select, textarea')) return;
  if (actionEl.getAttribute('role') !== 'button') return;
  if (!handleLocalAiAction(actionEl)) return;
  event.preventDefault();
  event.stopPropagation();
}

function installLocalAiControlDelegates(root) {
  if (!root || localAiControlDelegateRoots.has(root)) return;
  localAiControlDelegateRoots.add(root);
  root.addEventListener('click', handleLocalAiActionClick);
  root.addEventListener('keydown', handleLocalAiActionKeydown);
}

/**
 * @param {any[]} modelDetails
 * @param {HTMLSelectElement | null} modelSelect
 * @param {boolean} [isOllama]
 */
export async function renderModelAdvisor(modelDetails, modelSelect, isOllama = false) {
  const advisorEl = document.getElementById('local-ai-advisor');
  if (!advisorEl) return;
  installLocalAiControlDelegates(advisorEl);
  const serverUrl = getOllamaConfig().url;
  const isLocal = isLocalUrl(serverUrl);
  const hw = isLocal
    ? await detectHardware()
    : { gpu: { name: null, vram: getHardwareOverride(), unified: false, renderer: null, source: getHardwareOverride() ? 'manual' : 'remote' }, ram: { gb: null, source: 'unknown' }, cpuThreads: null };
  const currentModel = getOllamaMainModel();

  const best = getBestModel(modelDetails, hw.gpu.vram ? hw : null);

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

  const upgrade = getUpgradeSuggestion(modelDetails, hw.gpu.vram ? hw : null);
  const suggestHtml = upgrade ? `
    <div class="model-advisor-suggest">
      <div class="model-advisor-suggest-title">Upgrade recommendation</div>
      ${isOllama ? `<div class="model-advisor-pull-row">
        <code class="model-advisor-pull-cmd">ollama pull ${escapeHTML(upgrade.model)}</code>
        <button type="button" class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 8px" ${LOCAL_AI_ACTION_ATTR}="copy-pull" ${LOCAL_AI_COMMAND_ATTR}="${escapeAttr(`ollama pull ${upgrade.model}`)}">Copy</button>
      </div>` : `<div class="model-advisor-pull-row">
        <code class="model-advisor-pull-cmd">${escapeHTML(upgrade.model)}</code>
      </div>`}
      <div class="model-advisor-pull-why">${escapeHTML(upgrade.note)}</div>
    </div>` : '';

  const overrideVal = getHardwareOverride();
  const overrideOpen = (!isLocal && !overrideVal) ? 'flex' : 'none';
  const overrideLabel = isLocal ? 'Override VRAM' : 'Server VRAM';
  const overrideHtml = `
    <div class="model-advisor-override">
      <div class="model-advisor-override-toggle" role="button" tabindex="0" aria-expanded="${overrideOpen === 'flex' ? 'true' : 'false'}" ${LOCAL_AI_ACTION_ATTR}="toggle-override">
        \u25B8 ${overrideLabel}${overrideVal ? ` (${overrideVal} GB)` : ''}
      </div>
      <div class="model-advisor-override-body" style="display:${overrideOpen}">
        <input type="number" id="hw-vram-override-input" placeholder="${hw.gpu.vram || 'GB'}" value="${overrideVal || ''}" min="1" max="256" step="1">
        <span style="font-size:12px;color:var(--text-muted)">GB</span>
        <button type="button" class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 8px" ${LOCAL_AI_ACTION_ATTR}="apply-hardware-override">Apply</button>
        ${overrideVal ? `<button type="button" class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 8px" ${LOCAL_AI_ACTION_ATTR}="clear-hardware-override">Reset</button>` : ''}
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

function isHttpsToNonLocalhost(url) {
  if (location.protocol !== 'https:') return false;
  try {
    const host = new URL(url).hostname;
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
  } catch { return false; }
}

function normalizeLocalAiBaseUrl(rawUrl) {
  const value = (rawUrl || '').trim();
  if (!value) {
    return { error: 'Enter a Local AI server URL (example: http://localhost:11434)' };
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { error: 'Enter a valid Local AI URL (example: http://localhost:11434)' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Local AI URL must start with http:// or https://' };
  }
  return { url: parsed.href.replace(/\/+$/, '') };
}

function isFetchTransportError(e) {
  if (e instanceof TypeError) return true;
  const m = e.message || '';
  return m.includes('Failed to fetch') || m.includes('Load failed') || m.includes('NetworkError');
}

async function isLikelyCorsBlocked(url) {
  try {
    await fetch(`${url}/v1/models`, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    return true;
  } catch {
    return false;
  }
}

async function handleLocalAiPreflightError(error, url, dot, text) {
  if (!isFetchTransportError(error)) return false;
  if (!await isLikelyCorsBlocked(url)) return false;
  dot.classList.add('disconnected');
  text.textContent = getCORSHelpText();
  return true;
}

function getCORSHelpText() {
  const ua = navigator.userAgent || '';
  const isMac = /Mac/i.test(ua);
  const isWin = /Win/i.test(ua);
  if (isMac) return 'Blocked by CORS \u2014 Ollama: run launchctl setenv OLLAMA_ORIGINS "*" and restart. LM Studio: Settings \u2192 Enable CORS';
  if (isWin) return 'Blocked by CORS \u2014 Ollama: set OLLAMA_ORIGINS=* as system env var and restart. LM Studio: Settings \u2192 Enable CORS';
  return 'Blocked by CORS \u2014 Ollama: OLLAMA_ORIGINS=* ollama serve. LM Studio: Settings \u2192 Enable CORS';
}

export async function testOllamaConnection() {
  const urlInput = /** @type {HTMLInputElement | null} */ (document.getElementById('local-ai-url-input'));
  const dot = document.getElementById('local-ai-dot');
  const text = document.getElementById('local-ai-status-text');
  const modelSection = document.getElementById('local-ai-model-section');
  const modelSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('local-ai-model-select'));
  if (!urlInput || !text) return;
  const urlCheck = normalizeLocalAiBaseUrl(urlInput.value);
  const config = getOllamaConfig();
  const apiKeyInput = /** @type {HTMLInputElement | null} */ (document.getElementById('local-ai-apikey-input'));
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
  text.textContent = 'Testing...';
  dot.className = 'local-ai-status-dot';
  if (urlCheck.error) {
    dot.classList.add('disconnected');
    text.textContent = urlCheck.error;
    return;
  }
  const url = urlCheck.url;
  if (isHttpsToNonLocalhost(url)) {
    dot.classList.add('disconnected');
    text.textContent = 'Cannot reach LAN servers from HTTPS \u2014 Local AI must run on this machine (localhost)';
    return;
  }
  try {
    try { await fetch(`${url}/v1/models`, { method: 'HEAD', signal: AbortSignal.timeout(3000), ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}) }); }
    catch (preErr) { if (await handleLocalAiPreflightError(preErr, url, dot, text)) return; }
    const [result, ollamaResult] = await Promise.all([
      checkOpenAICompatible(url, apiKey),
      checkOllama(url).catch(() => ({ available: false, models: [], modelDetails: [] })),
    ]);
    if (!result.available) throw new Error('Not reachable');
    const models = result.models;
    if (models.length === 0) {
      dot.classList.add('disconnected');
      text.textContent = 'Connected but no models found. Load a model in your server.';
      localStorage.removeItem('labcharts-ollama-models');
      localStorage.removeItem('labcharts-ollama-models-meta');
    } else {
      dot.classList.add('connected');
      await saveOllamaConfig({ ...config, url, model: models[0], apiKey });
      localStorage.setItem('labcharts-ollama-models', JSON.stringify(models));
      writeProviderModelCacheMeta('ollama', { endpoint: url + '/v1/models' });
      if (!localStorage.getItem('labcharts-ollama-model')) setOllamaMainModel(models[0]);
      text.textContent = `Connected (${getOllamaMainModel()})`;
      if (modelSection && modelSelect) {
        const currentModel = getOllamaMainModel();
        modelSection.style.display = 'block';
        modelSelect.innerHTML = models.map(m => `<option value="${escapeHTML(m)}" ${m === currentModel ? 'selected' : ''}>${escapeHTML(m)}</option>`).join('');
        renderAgentRouterProviderModelDropdown('ollama', models);
      }
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
    window.updatePrivacyStatusCard?.();
    returnToChatIfOnboarding();
  } catch (e) {
    dot.classList.add('disconnected');
    text.textContent = LOCAL_AI_NOT_CONNECTED_TEXT;
    localStorage.removeItem('labcharts-ollama-models');
    localStorage.removeItem('labcharts-ollama-models-meta');
  }
}

export async function testPIIOllamaConnection() {
  const urlInput = /** @type {HTMLInputElement | null} */ (document.getElementById('pii-local-url-input'));
  const dot = document.getElementById('pii-local-dot');
  const text = document.getElementById('pii-local-status-text');
  const piiDropdown = document.getElementById('pii-model-dropdown');
  const piiSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('pii-model-select'));
  if (!urlInput || !text) return;
  const urlCheck = normalizeLocalAiBaseUrl(urlInput.value);
  const config = getOllamaConfig();
  text.textContent = 'Testing...';
  dot.className = 'local-ai-status-dot';
  if (urlCheck.error) {
    dot.classList.add('disconnected');
    text.textContent = urlCheck.error;
    return;
  }
  const url = urlCheck.url;
  if (isHttpsToNonLocalhost(url)) {
    dot.classList.add('disconnected');
    text.textContent = 'Cannot reach LAN servers from HTTPS \u2014 Local AI must run on this machine (localhost)';
    return;
  }
  try {
    try { await fetch(`${url}/v1/models`, { method: 'HEAD', signal: AbortSignal.timeout(3000), ...(config.apiKey ? { headers: { Authorization: `Bearer ${config.apiKey}` } } : {}) }); }
    catch (preErr) { if (await handleLocalAiPreflightError(preErr, url, dot, text)) return; }
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
      const toggle = /** @type {HTMLInputElement | null} */ (document.getElementById('pii-local-toggle'));
      if (toggle) toggle.checked = true;
      let currentPII = getOllamaPIIModel();
      if (!models.includes(currentPII)) { currentPII = models[0]; setOllamaPIIModel(currentPII); }
      text.textContent = `Connected \u2014 using ${currentPII}`;
      if (piiDropdown && piiSelect) {
        piiDropdown.style.display = 'block';
        piiSelect.innerHTML = models.map(m => `<option value="${escapeHTML(m)}" ${m === currentPII ? 'selected' : ''}>${escapeHTML(m)}</option>`).join('');
      }
    }
    window.updatePrivacyStatusCard?.();
  } catch (e) {
    dot.classList.add('disconnected');
    text.textContent = LOCAL_AI_NOT_CONNECTED_TEXT;
    window.updatePrivacyStatusCard?.();
  }
}

export function refreshModelAdvisor() {
  const details = window._lastOllamaModelDetails || [];
  const modelSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('local-ai-model-select'));
  if (details.length) renderModelAdvisor(details, modelSelect, !!window._lastIsOllamaServer);
}

export function copyOllamaPullCmd(cmd) {
  navigator.clipboard.writeText(cmd).then(() => showNotification('Copied: ' + cmd, 'info'));
}

export function applyHardwareOverride(vram) {
  const v = parseFloat(vram);
  if (isNaN(v) || v <= 0) { showNotification('Enter a valid VRAM amount in GB', 'error'); return; }
  saveHardwareOverride(v);
  const details = window._lastOllamaModelDetails || [];
  const modelSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('local-ai-model-select'));
  if (details.length) renderModelAdvisor(details, modelSelect, !!window._lastIsOllamaServer);
}

export function clearHardwareOverride() {
  saveHardwareOverride(null);
  const details = window._lastOllamaModelDetails || [];
  const modelSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('local-ai-model-select'));
  if (details.length) renderModelAdvisor(details, modelSelect, !!window._lastIsOllamaServer);
}
