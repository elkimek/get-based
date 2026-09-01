// @ts-check
// provider-local-ai-controls.js - Local AI connection checks, model advisor, and hardware overrides.

import { getErrorMessage } from './caught-error.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import {
  getOllamaConfig,
  getOllamaMainModel,
  getOllamaPIIModel,
  getOllamaPIIApiKey,
  getOllamaPIIUrl,
  saveOllamaConfig,
  saveOllamaPIIApiKey,
  setOllamaMainModel,
  setOllamaPIIModel,
  setOllamaPIIUrl,
} from './api.js';
import {
  discoverLocalAI,
  clearLocalAiDiscovery,
  filterPIIEligibleModels,
  getLocalAiExecutionLocation,
  isCloudModel,
} from './local-ai-discovery.js';
import {
  clearLocalAiRuntimeUse,
  getLocalAiReleasePlan,
  localAiEndpointsShareMachine,
  releaseLocalAiModels,
} from './local-ai-lifecycle.js';
import { isLocalAiLoopbackUrl } from './local-ai-provider-shared.js';
import { getLocalAiProviderAdapter } from './local-ai-provider-registry.js';
import { detectHardware, assessModel, assessFitness, getBestModel, getUpgradeSuggestion, saveHardwareOverride, getHardwareOverride } from './hardware.js';
import {
  cacheLocalAiModelDetails,
  clearCachedLocalAiModelDetails,
  getCachedLocalAiModelDetails,
  updatePrivacyStatusCardFromRuntime,
} from './provider-local-ai-runtime.js';

let returnToChatIfOnboarding = function() {};
/** @type {(provider: string, options?: { endpoint?: string, modelId?: string }) => Promise<boolean>} */
let requestProviderActivation = async function() { return true; };
const LOCAL_AI_NOT_CONNECTED_TEXT = 'Not connected \u2014 check URL and ensure your server is running';
const LOCAL_AI_ACTION_ATTR = 'data-local-ai-action';
const LOCAL_AI_COMMAND_ATTR = 'data-local-ai-command';
const localAiControlDelegateRoots = new WeakSet();
let mainDiscoveryGeneration = 0;
let piiDiscoveryGeneration = 0;
let discoveryEventInstalled = false;

export function configureLocalAiControls(options = {}) {
  if (typeof options.returnToChatIfOnboarding === 'function') {
    returnToChatIfOnboarding = options.returnToChatIfOnboarding;
  }
  if (typeof options.requestProviderActivation === 'function') {
    requestProviderActivation = options.requestProviderActivation;
  }
}

function clearMainDiscoveryUI() {
  const modelSection = document.getElementById('local-ai-model-section');
  const advisor = document.getElementById('local-ai-advisor');
  if (modelSection) modelSection.style.display = 'none';
  if (advisor) advisor.innerHTML = '';
  clearCachedLocalAiModelDetails();
}

function discoveryErrorText(result) {
  const error = result?.error || result?.openai?.error;
  if (error?.kind === 'http' && error.status === 401) return 'Authentication failed \u2014 check the API key';
  if (error?.kind === 'http' && error.status) return `Server returned HTTP ${error.status}`;
  if (error?.kind === 'timeout') return 'Connection timed out \u2014 check the address and firewall';
  try {
    const port = new URL(result?.baseUrl || '').port;
    if (port === '1234') return 'No API answered on port 1234. In LM Studio, start the Developer server and enable CORS for browser access.';
    if (port === '8888') return 'No API answered on port 8888. Start Unsloth Studio, then check its API key and browser access settings.';
  } catch {}
  return LOCAL_AI_NOT_CONNECTED_TEXT;
}

function applyMainDiscoveryResult(result, { reconcileModel = true } = {}) {
  const dot = document.getElementById('local-ai-dot');
  const text = document.getElementById('local-ai-status-text');
  const modelSection = document.getElementById('local-ai-model-section');
  const modelSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('local-ai-model-select'));
  if (!dot || !text) return;
  dot.className = 'local-ai-status-dot';
  if (!result.available || result.models.length === 0) {
    dot.classList.add('disconnected');
    text.textContent = result.available ? 'Connected but no text-generation models were found.' : discoveryErrorText(result);
    clearMainDiscoveryUI();
    return;
  }
  dot.classList.add('connected');
  let currentModel = getOllamaMainModel();
  if (!result.models.includes(currentModel) && reconcileModel) {
    currentModel = result.models[0];
    setOllamaMainModel(currentModel);
  }
  const location = getLocalAiExecutionLocation(result.baseUrl, currentModel);
  const locationLabel = location === 'cloud' ? 'cloud' : location === 'local' ? 'this device' : location === 'lan' ? 'LAN server' : 'remote server';
  text.textContent = `Connected via ${getLocalAiProviderAdapter(result.provider).label} (${currentModel} \u00b7 ${locationLabel})`;
  if (modelSection && modelSelect) {
    modelSection.style.display = 'block';
    modelSelect.innerHTML = result.models.map(model => `<option value="${escapeHTML(model)}" ${model === currentModel ? 'selected' : ''}>${escapeHTML(model)}</option>`).join('');
  }
  const isOllamaServer = result.provider === 'ollama';
  cacheLocalAiModelDetails(result.modelDetails || [], isOllamaServer);
  renderModelAdvisor(result.modelDetails || [], modelSelect, isOllamaServer);
}

function installDiscoveryRefreshEvent() {
  if (discoveryEventInstalled || typeof globalThis.addEventListener !== 'function') return;
  discoveryEventInstalled = true;
  globalThis.addEventListener('local-ai-discovery-updated', event => {
    const result = /** @type {CustomEvent} */ (event).detail;
    if (!result || result.baseUrl !== getOllamaConfig().url.replace(/\/+$/, '')) return;
    if (document.getElementById('local-ai-dot')) applyMainDiscoveryResult(result);
  });
}

export function initSettingsOllamaCheck() {
  installDiscoveryRefreshEvent();
  const config = getOllamaConfig();
  const generation = ++mainDiscoveryGeneration;
  const dot = document.getElementById('local-ai-dot');
  const text = document.getElementById('local-ai-status-text');
  if (!dot || !text) { updatePrivacyStatusCardFromRuntime(); return; }
  dot.className = 'local-ai-status-dot';
  text.textContent = 'Checking connection...';
  discoverLocalAI(config.url, config.apiKey, { force: true }).then(async result => {
    if (generation !== mainDiscoveryGeneration) return;
    applyMainDiscoveryResult(result);
    if (result.available && result.models.length) {
      const selectedModel = result.models.includes(getOllamaMainModel())
        ? getOllamaMainModel()
        : result.models[0];
      if (!await requestProviderActivation('ollama', {
        endpoint: config.url,
        modelId: selectedModel,
      }) && generation === mainDiscoveryGeneration) {
        dot.classList.add('connected');
        text.textContent = 'Connection verified — AI not activated';
      }
    }
    if (config.url === getOllamaPIIUrl()) updatePrivacyStatusCardFromRuntime(result.available && filterPIIEligibleModels(result.models).length > 0);
    else updatePrivacyStatusCardFromRuntime();
  }).catch(() => {
    if (generation !== mainDiscoveryGeneration) return;
    applyMainDiscoveryResult({ available: false, models: [], error: { kind: 'network' } });
  });
}

function isLocalUrl(url) {
  try {
    new URL(url);
    return isLocalAiLoopbackUrl(url);
  }
  catch { return true; }
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

async function releasePlan(plan, config) {
  const outcome = await releaseLocalAiModels({
    baseUrl: config.url,
    apiKey: config.apiKey,
    discovery: { provider: plan.providerId, modelDetails: plan.models },
  });
  if (outcome.complete) clearLocalAiDiscovery(config.url);
  return outcome;
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
      const sizeGb = detail.size ? `${detail.sizeSource === 'estimated' ? '~' : ''}${(detail.size / 1e9).toFixed(1)} GB` : '';
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
  const allocatedVram = modelDetails.reduce((total, model) => total + (Number(model.vramAllocated) || 0), 0);
  const providerId = isOllama ? 'ollama'
    : modelDetails.some(model => model.source === 'lmstudio') ? 'lmstudio'
      : modelDetails.some(model => model.source === 'unsloth') ? 'unsloth' : 'openai-compatible';
  const releasePlan = getLocalAiReleasePlan({ provider: providerId, modelDetails });
  const providerName = releasePlan.providerLabel;

  const fitnessLabel = { recommended: '\u2605 Recommended', capable: 'Capable', underpowered: 'Underpowered', inadequate: 'Inadequate' };
  const fitnessCss = { recommended: 'fitness-great', capable: 'fitness-good', underpowered: 'fitness-fair', inadequate: 'fitness-poor' };
  const rows = modelDetails.map(m => {
    const hasSize = m.size > 0;
    const assess = (m.executionLocation === 'cloud' || isCloudModel(m.name))
      ? assessModel(m, hw)
      : !hasSize ? { tier: 'unknown', badge: '?', label: 'Size unknown' }
        : hw.gpu.vram ? assessModel(m, hw) : { ...assessModel(m, { gpu: { vram: null, unified: false } }), label: !isLocal ? 'Enter VRAM' : 'Set VRAM to check' };
    const fitness = assessFitness(m.name);
    const sizeLabel = hasSize ? `${m.sizeSource === 'estimated' ? '~' : ''}${(m.size / 1e9).toFixed(1)} GB` : '';
    const runtimeDetails = [
      m.format,
      m.loaded === true ? 'loaded now' : '',
      m.loaded === false ? 'available \u2014 loads on first request' : '',
      m.loaded === null ? 'runtime load state unavailable' : '',
      m.contextLength > 0 ? `${Number(m.contextLength).toLocaleString()} token context loaded` : '',
      m.maxContextLength > m.contextLength ? `${Number(m.maxContextLength).toLocaleString()} max context` : '',
      m.vramAllocated > 0 ? `${(m.vramAllocated / 1e9).toFixed(1)} GB VRAM allocated` : '',
    ].filter(Boolean);
    const isActive = m.name === currentModel;
    const isBest = best && m.name === best.name;
    return `<div class="model-advisor-row${isActive ? ' active' : ''}">
      <span class="model-advisor-badge model-advisor-verdict ${assess.tier}">${assess.badge}</span>
      <span class="model-advisor-name">${escapeHTML(m.name)}${isActive ? ' <span style="font-size:10px;opacity:0.6">\u2190 active</span>' : ''}${isBest && !isActive ? ' <span style="font-size:10px;opacity:0.6">\u2190 best pick</span>' : ''}</span>
      <span class="model-advisor-size">${sizeLabel}${m.quantLevel ? ' \u00B7 ' + escapeHTML(m.quantLevel) : ''}${m.paramSize ? ' \u00B7 ' + escapeHTML(m.paramSize) : ''}${runtimeDetails.length ? ' \u00B7 ' + runtimeDetails.map(detail => escapeHTML(detail)).join(' \u00B7 ') : ''}</span>
      ${fitness ? `<span class="model-advisor-fitness ${fitnessCss[fitness.tier]}" title="${escapeAttr(fitness.note)}">${fitnessLabel[fitness.tier]}</span>` : '<span class="model-advisor-fitness" style="opacity:0.4">Unknown</span>'}
      <span class="model-advisor-verdict ${assess.tier}">${escapeHTML(assess.label)}</span>
    </div>`;
  }).join('');

  const upgrade = getUpgradeSuggestion(modelDetails, hw.gpu.vram ? hw : null);
  const suggestHtml = upgrade ? `
    <div class="model-advisor-suggest">
      <div class="model-advisor-suggest-title">Heuristic model suggestion</div>
      ${isOllama ? `<div class="model-advisor-pull-row">
        <code class="model-advisor-pull-cmd">ollama pull ${escapeHTML(upgrade.model)}</code>
        <button type="button" class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 8px" ${LOCAL_AI_ACTION_ATTR}="copy-pull" ${LOCAL_AI_COMMAND_ATTR}="${escapeAttr(`ollama pull ${upgrade.model}`)}">Copy</button>
      </div>` : `<div class="model-advisor-pull-row">
        <code class="model-advisor-pull-cmd">${escapeHTML(upgrade.model)}</code>
      </div>`}
      <div class="model-advisor-pull-why">${escapeHTML(upgrade.note)} Validate quality with Import Benchmarks on your own reports; this suggestion is not benchmark-derived.</div>
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
        ${allocatedVram > 0 ? `<span class="model-advisor-hw-chip">\uD83D\uDCCA ${providerName} currently allocated \u2014 ${(allocatedVram / 1e9).toFixed(1)} GB VRAM</span>` : ''}
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
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && !isLocalAiLoopbackUrl(url);
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
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/(?:v1(?:\/(?:models|chat\/completions))?|api\/v1\/models)\/?$/i, '') || '/';
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
  text.textContent = getLocalAiCorsHelpText(url);
  return true;
}

/** @param {string} url @param {any} [savedConfig] */
function localAiEndpointKind(url, savedConfig = getOllamaConfig()) {
  try {
    const parsed = new URL(url);
    const savedMode = String(savedConfig?.mode || '').toLowerCase();
    let savedOrigin = '';
    try { savedOrigin = new URL(savedConfig?.url || '').origin; } catch {}
    if (parsed.origin === savedOrigin && ['ollama', 'lmstudio', 'unsloth'].includes(savedMode)) return savedMode;
    const identity = `${parsed.hostname}:${parsed.port}`.toLowerCase();
    if (identity.includes('unsloth') || parsed.port === '8888') return 'unsloth';
    if (identity.includes('lmstudio') || identity.includes('lm-studio') || parsed.port === '1234') return 'lmstudio';
    if (identity.includes('ollama') || parsed.port === '11434') return 'ollama';
  } catch {}
  return 'openai-compatible';
}

/**
 * @param {string} url
 * @param {{userAgent?: string, origin?: string, savedConfig?: any}} [options]
 */
export function getLocalAiCorsHelpText(url, options = {}) {
  const ua = options.userAgent ?? globalThis.navigator?.userAgent ?? '';
  const origin = options.origin ?? globalThis.location?.origin ?? 'this app';
  const provider = localAiEndpointKind(url, options.savedConfig);
  if (provider === 'unsloth') {
    const command = isLocalAiLoopbackUrl(url)
      ? 'unsloth studio -p 8888 --disable-tools'
      : 'unsloth studio -H 0.0.0.0 -p 8888 --disable-tools';
    return `Blocked by CORS \u2014 Unsloth answered but did not allow ${origin}. Unsloth has no CORS toggle; its desktop/API-only backend accepts only its own app. Start its browser-capable CLI server with: ${command}, then use its API key.`;
  }
  if (provider === 'lmstudio') {
    return `Blocked by CORS \u2014 LM Studio did not allow ${origin}. Enable CORS in its Developer server settings, or restart it with: lms server start --cors. Keep API authentication enabled for LAN access.`;
  }
  const isMac = /Mac/i.test(ua);
  const isWin = /Win/i.test(ua);
  if (provider === 'ollama') {
    if (isMac) return `Blocked by CORS \u2014 allow ${origin} in Ollama: launchctl setenv OLLAMA_ORIGINS "${origin}", then restart Ollama.`;
    if (isWin) return `Blocked by CORS \u2014 set OLLAMA_ORIGINS=${origin} as a system environment variable, then restart Ollama.`;
    return `Blocked by CORS \u2014 start Ollama with OLLAMA_ORIGINS=${origin}.`;
  }
  return `Blocked by CORS \u2014 this Local AI endpoint answered but did not allow ${origin}. Enable browser/CORS access for this origin in that server.`;
}

async function releasePreviousLocalAiBeforeSwitch(config, previousDiscovery, nextDiscovery, dot, text) {
  const plan = getLocalAiReleasePlan(previousDiscovery, { modelName: getOllamaMainModel() });
  if (!plan.supported || plan.models.length === 0) return true;
  const nextProvider = getLocalAiReleasePlan(nextDiscovery).providerLabel;
  text.textContent = `Releasing ${plan.providerLabel} VRAM...`;
  const outcome = await releasePlan(plan, config);
  if (outcome.complete) {
    clearLocalAiRuntimeUse(config.url);
    showNotification(`${plan.providerLabel} VRAM released. Connecting to ${nextProvider}.`, 'success', 4000);
    return true;
  }
  dot.classList.add('disconnected');
  text.textContent = `${nextProvider} is reachable, but ${plan.providerLabel} could not release its loaded model. Unload it manually, then retry.`;
  showNotification(`Could not release ${outcome.failedModels.join(', ')} from ${plan.providerLabel}. The server switch was not saved.`, 'error', 7000);
  return false;
}

export async function testOllamaConnection() {
  const generation = ++mainDiscoveryGeneration;
  const urlInput = /** @type {HTMLInputElement | null} */ (document.getElementById('local-ai-url-input'));
  const dot = document.getElementById('local-ai-dot');
  const text = document.getElementById('local-ai-status-text');
  if (!urlInput || !dot || !text) return;
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
    text.textContent = 'Browser mixed-content rules block an HTTP LAN server from an HTTPS page. Use HTTPS for the server, localhost, or an encrypted local tunnel.';
    return;
  }
  const previousUrlCheck = normalizeLocalAiBaseUrl(config.url);
  const previousUrl = previousUrlCheck.url || config.url;
  const endpointChanged = previousUrl !== url;
  const previousDiscoveryPromise = endpointChanged && localAiEndpointsShareMachine(previousUrl, url)
    ? discoverLocalAI(previousUrl, config.apiKey, { force: true }).catch(() => null)
    : Promise.resolve(null);
  try {
    try { await fetch(`${url}/v1/models`, { method: 'HEAD', signal: AbortSignal.timeout(3000), ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}) }); }
    catch (preErr) { if (await handleLocalAiPreflightError(preErr, url, dot, text)) return; }
    const result = await discoverLocalAI(url, apiKey, { force: true });
    if (generation !== mainDiscoveryGeneration) return;
    if (!result.available) {
      applyMainDiscoveryResult(result);
      return;
    }
    const models = result.models;
    if (models.length === 0) {
      applyMainDiscoveryResult(result);
    } else {
      const previousDiscovery = await previousDiscoveryPromise;
      if (generation !== mainDiscoveryGeneration) return;
      if (previousDiscovery && !await releasePreviousLocalAiBeforeSwitch(config, previousDiscovery, result, dot, text)) return;
      if (generation !== mainDiscoveryGeneration) return;
      dot.classList.add('connected');
      let currentModel = getOllamaMainModel();
      const modelChanged = !models.includes(currentModel);
      if (modelChanged) currentModel = models[0];
      if (!await requestProviderActivation('ollama', { endpoint: url, modelId: currentModel })) {
        dot.classList.add('connected');
        text.textContent = 'Connection verified — AI not activated';
        return;
      }
      if (modelChanged) setOllamaMainModel(currentModel);
      await saveOllamaConfig({ ...config, url, model: currentModel, mode: result.provider, apiKey });
      applyMainDiscoveryResult(result);
    }
    updatePrivacyStatusCardFromRuntime();
    returnToChatIfOnboarding();
  } catch (e) {
    if (generation !== mainDiscoveryGeneration) return;
    dot.classList.add('disconnected');
    text.textContent = LOCAL_AI_NOT_CONNECTED_TEXT;
    clearMainDiscoveryUI();
  }
}

export async function testPIIOllamaConnection() {
  const generation = ++piiDiscoveryGeneration;
  const urlInput = /** @type {HTMLInputElement | null} */ (document.getElementById('pii-local-url-input'));
  const dot = document.getElementById('pii-local-dot');
  const text = document.getElementById('pii-local-status-text');
  const piiDropdown = document.getElementById('pii-model-dropdown');
  const piiSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('pii-model-select'));
  if (!urlInput || !dot || !text) return;
  const urlCheck = normalizeLocalAiBaseUrl(urlInput.value);
  const apiKeyInput = /** @type {HTMLInputElement | null} */ (document.getElementById('pii-local-apikey-input'));
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : getOllamaPIIApiKey();
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
    text.textContent = 'Browser mixed-content rules block this HTTP LAN server. Use HTTPS, localhost, or an encrypted local tunnel.';
    return;
  }
  try {
    try { await fetch(`${url}/v1/models`, { method: 'HEAD', signal: AbortSignal.timeout(3000), ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}) }); }
    catch (preErr) { if (await handleLocalAiPreflightError(preErr, url, dot, text)) return; }
    const result = await discoverLocalAI(url, apiKey, { force: true });
    if (generation !== piiDiscoveryGeneration) return;
    if (!result.available) throw new Error(discoveryErrorText(result));
    const models = filterPIIEligibleModels(result.models);
    if (models.length === 0) {
      dot.classList.add('disconnected');
      text.textContent = (result.models || []).some(isCloudModel)
        ? 'Connected, but only cloud/embedding models were found. Privacy protection requires an on-device text model.'
        : 'Connected but no eligible text-generation models were found.';
      if (piiDropdown) piiDropdown.style.display = 'none';
    } else {
      dot.classList.add('connected');
      setOllamaPIIUrl(url);
      await saveOllamaPIIApiKey(apiKey);
      let currentPII = getOllamaPIIModel();
      if (!models.includes(currentPII)) { currentPII = models[0]; setOllamaPIIModel(currentPII); }
      text.textContent = `Connection verified \u2014 ${currentPII}. Turn on the privacy toggle to use it.`;
      if (piiDropdown && piiSelect) {
        piiDropdown.style.display = 'block';
        piiSelect.innerHTML = models.map(m => `<option value="${escapeHTML(m)}" ${m === currentPII ? 'selected' : ''}>${escapeHTML(m)}</option>`).join('');
      }
    }
    updatePrivacyStatusCardFromRuntime();
  } catch (e) {
    if (generation !== piiDiscoveryGeneration) return;
    dot.classList.add('disconnected');
    text.textContent = getErrorMessage(e, LOCAL_AI_NOT_CONNECTED_TEXT);
    updatePrivacyStatusCardFromRuntime();
  }
}

export async function refreshModelAdvisor() {
  const config = getOllamaConfig();
  const generation = ++mainDiscoveryGeneration;
  const result = await discoverLocalAI(config.url, config.apiKey, { force: true });
  if (generation !== mainDiscoveryGeneration) return;
  applyMainDiscoveryResult(result);
}

export function copyOllamaPullCmd(cmd) {
  navigator.clipboard.writeText(cmd).then(() => showNotification('Copied: ' + cmd, 'info'));
}

export function applyHardwareOverride(vram) {
  const v = parseFloat(vram);
  if (isNaN(v) || v <= 0) { showNotification('Enter a valid VRAM amount in GB', 'error'); return; }
  saveHardwareOverride(v);
  const { modelDetails: details, isOllamaServer } = getCachedLocalAiModelDetails();
  const modelSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('local-ai-model-select'));
  if (details.length) renderModelAdvisor(details, modelSelect, isOllamaServer);
}

export function clearHardwareOverride() {
  saveHardwareOverride(null);
  const { modelDetails: details, isOllamaServer } = getCachedLocalAiModelDetails();
  const modelSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('local-ai-model-select'));
  if (details.length) renderModelAdvisor(details, modelSelect, isOllamaServer);
}
