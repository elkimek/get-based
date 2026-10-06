import { getLocalAiSettingsView, mountLocalAiSettings, disposeLocalAiSettings } from './local-ai-settings-component.js';
import { buildLocalAiSettingsSnapshot, localAiLocationSnapshot, checkedAdvisorModels, buildLocalAiAdvisor, buildLocalAiModelLabels } from './local-ai-settings-view.js';
import type { AdvisorHardware } from './local-ai-settings-view.js';
import type { AdvisorModel, LocalAiSettingsView } from './local-ai-settings-contract.js';
import { createLocalAiConnectionController, sameLocalAiConnection } from './local-ai-settings-controller.js';
import type { LocalAiDiscoveryView, LocalAiConnectionConfig } from './local-ai-settings-controller.js';
import { getChatBackend } from './agent-chat-settings.js';

type DiscoveryView = LocalAiDiscoveryView;
interface LocalAiControlOptions {
  returnToChatIfOnboarding?: () => void;
  requestProviderActivation?: (
    provider: string,
    options?: { endpoint?: string; modelId?: string },
  ) => Promise<boolean>;
}
type LocalAiConfig = LocalAiConnectionConfig;
type LocalAiEndpointConfig = Pick<LocalAiConfig, 'url' | 'mode'>;

// provider-local-ai-controls.js - Local AI connection checks, model advisor, and hardware overrides.

import { getErrorMessage } from './caught-error.js';
import { showNotification } from './utils.js';
import {
  getAIProvider, getOllamaConfig,
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
  getCachedLocalAiDiscovery, discoverLocalAI,
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
import { detectHardware, saveHardwareOverride, getHardwareOverride } from './hardware.js';
import {
  cacheLocalAiModelDetails,
  clearCachedLocalAiModelDetails,
  getCachedLocalAiModelDetails,
  updatePrivacyStatusCardFromRuntime,
  getPIIConnectionViewFromRuntime,
} from './provider-local-ai-runtime.js';

let returnToChatIfOnboarding = function() {};
let requestProviderActivation: NonNullable<LocalAiControlOptions['requestProviderActivation']> = async function() { return true; };
const LOCAL_AI_NOT_CONNECTED_TEXT = 'Not connected \u2014 check URL and ensure your server is running';
let mainDiscoveryGeneration = 0;
let piiDiscoveryGeneration = 0;
let discoveryEventInstalled = false;

export function configureLocalAiControls(options: LocalAiControlOptions = {}) {
  if (typeof options.returnToChatIfOnboarding === 'function') {
    returnToChatIfOnboarding = options.returnToChatIfOnboarding;
  }
  if (typeof options.requestProviderActivation === 'function') {
    requestProviderActivation = options.requestProviderActivation;
  }
}

function readLocalAiConnectionConfig(): LocalAiConnectionConfig {
  const config = getOllamaConfig();
  return { ...config, model: typeof config.model === 'string' ? config.model : 'llama3.2',
    mode: typeof config.mode === 'string' ? config.mode : 'ollama', apiKey: typeof config.apiKey === 'string' ? config.apiKey : '' };
}

export function hydrateLocalAiSettings(host = document.querySelector<HTMLElement>('#ai-provider-panel [data-local-ai-settings-host]')): void {
  if (!host) { disposeLocalAiSettings(); return; }
  const previous = getLocalAiSettingsView();
  const view = mountLocalAiSettings(host, buildLocalAiSettingsSnapshot(), {
    test: testOllamaConnection,
    select: model => {
      if (connectionController.isPending()) return;
      setOllamaMainModel(model);
      void refreshModelAdvisor();
    },
    copy: copyOllamaPullCmd,
    applyOverride: applyHardwareOverride,
    clearOverride: clearHardwareOverride,
  });
  if (view !== previous) {
    const config = readLocalAiConnectionConfig();
    view.setConnection({ url: config.url, apiKey: config.apiKey });
  }
}

function discoveryErrorText(result: DiscoveryView | null | undefined): string {
  const error = result?.error || result?.openai?.error;
  if (error?.kind === 'http' && error.status === 401) return 'Authentication failed — check the API key';
  if (error?.kind === 'http' && error.status) return `Server returned HTTP ${error.status}`;
  if (error?.kind === 'timeout') return 'Connection timed out — check the address and firewall';
  try {
    const port = new URL(result?.baseUrl || '').port;
    if (port === '1234') return 'No API answered on port 1234. In LM Studio, start the Developer server and enable CORS for browser access.';
    if (port === '8888') return 'No API answered on port 8888. Start Unsloth Studio, then check its API key and browser access settings.';
  } catch {}
  return LOCAL_AI_NOT_CONNECTED_TEXT;
}
function captureMainView(view = getLocalAiSettingsView()) {
  const config = { ...readLocalAiConnectionConfig() }, context = mainContext();
  return { view, config, current: () => !!view?.isCurrent() && mainContext() === context && sameLocalAiConnection(config, readLocalAiConnectionConfig()) };
}
function mainContext(): string { return getAIProvider() + ':' + getChatBackend(); }
async function applyMainDiscoveryResult(result: DiscoveryView, owner = captureMainView(), reconcileModel = true): Promise<void> {
  const view = owner.view;
  if (!view || !owner.current()) return;
  const models = result.models.filter((model): model is string => typeof model === 'string' && !!model);
  if (!result.available || !models.length) {
    view.setStatus('disconnected', result.available ? 'Connected but no text-generation models were found.' : discoveryErrorText(result));
    view.refresh({ ...buildLocalAiSettingsSnapshot(), models: [], advisor: null });
    clearCachedLocalAiModelDetails();
    return;
  }
  let selectedModel = getOllamaMainModel();
  if (!models.includes(selectedModel) && reconcileModel) { selectedModel = models[0]!; setOllamaMainModel(selectedModel); }
  const execution = getLocalAiExecutionLocation(result.baseUrl || owner.config.url, selectedModel);
  const location = execution === 'cloud' ? 'cloud' : execution === 'local' ? 'this device' : execution === 'lan' ? 'LAN server' : 'remote server';
  view.refresh({ ...localAiLocationSnapshot(owner.config.url, selectedModel), selectedModel, models: models.map(value => ({ value, label: value })), advisor: view.getSnapshot().advisor });
  view.setStatus('connected', `Connected via ${getLocalAiProviderAdapter(result.provider).label} (${selectedModel} · ${location})`, connectionController.isPending());
  const details = checkedAdvisorModels(result.modelDetails || []);
  cacheLocalAiModelDetails(result.modelDetails || [], result.provider === 'ollama');
  await renderModelAdvisor(details, null, result.provider === 'ollama');
}
function installDiscoveryRefreshEvent(): void {
  if (discoveryEventInstalled || typeof globalThis.addEventListener !== 'function') return;
  discoveryEventInstalled = true;
  globalThis.addEventListener('local-ai-discovery-updated', event => {
    const owner = captureMainView();
    const result = (event as CustomEvent<DiscoveryView>).detail;
    if (connectionController.isPending() || !owner.current() || !result || result !== getCachedLocalAiDiscovery(owner.config.url, owner.config.apiKey)) return;
    void applyMainDiscoveryResult(result, owner);
  });
}
export function initSettingsOllamaCheck(): void {
  installDiscoveryRefreshEvent();
  const owner = captureMainView(), generation = ++mainDiscoveryGeneration;
  if (!owner.view) { updatePrivacyStatusCardFromRuntime(); return; }
  if (connectionController.isPending()) return;
  owner.view.setStatus('testing', 'Checking connection...');
  // Opening Settings is passive; explicit Test is the activation boundary.
  void discoverLocalAI(owner.config.url, owner.config.apiKey, { force: true }).then(async result => {
    if (generation !== mainDiscoveryGeneration || !owner.current()) return;
    await applyMainDiscoveryResult(result, owner);
    if (!owner.current()) return;
    if (owner.config.url === getOllamaPIIUrl()) updatePrivacyStatusCardFromRuntime(result.available && filterPIIEligibleModels(result.models).length > 0);
    else updatePrivacyStatusCardFromRuntime();
  }).catch(() => {
    if (generation === mainDiscoveryGeneration && owner.current()) void applyMainDiscoveryResult({ available: false, models: [], error: { kind: 'network' } }, owner);
  });
}
function isLocalUrl(url: string): boolean {
  try { new URL(url); return isLocalAiLoopbackUrl(url); } catch { return true; }
}
let advisorGeneration = 0;
export async function renderModelAdvisor(modelDetails: readonly AdvisorModel[], _modelSelect: HTMLSelectElement | null, isOllama = false): Promise<void> {
  const owner = captureMainView(), generation = ++advisorGeneration, selected = getOllamaMainModel();
  if (!owner.view) return;
  const local = isLocalUrl(owner.config.url), override = getHardwareOverride();
  const hardware: AdvisorHardware = local ? await detectHardware() : {
    gpu: { name: null, vram: override, unified: false, renderer: null, source: override ? 'manual' : 'remote' },
    ram: { gb: null, source: 'unknown' }, cpuThreads: null,
  };
  if (!owner.current() || generation !== advisorGeneration || getOllamaMainModel() !== selected || getHardwareOverride() !== override) return;
  const details = checkedAdvisorModels(modelDetails);
  const models = owner.view.getSnapshot().models.map(model => model.value);
  owner.view.setAdvisor(buildLocalAiAdvisor(details, hardware, local, isOllama, selected, override), buildLocalAiModelLabels(models, details, hardware));
}

function isHttpsToNonLocalhost(url: string) {
  if (location.protocol !== 'https:') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && !isLocalAiLoopbackUrl(url);
  } catch { return false; }
}

function normalizeLocalAiBaseUrl(rawUrl: string) {
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

function isFetchTransportError(e: unknown) {
  if (e instanceof TypeError) return true;
  const m = (e as { message: string }).message || '';
  return m.includes('Failed to fetch') || m.includes('Load failed') || m.includes('NetworkError');
}

async function isLikelyCorsBlocked(url: string) {
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

async function getLocalAiPreflightHelp(error: unknown, url: string): Promise<string | null> {
  if (!isFetchTransportError(error) || !await isLikelyCorsBlocked(url)) return null;
  return getLocalAiCorsHelpText(url);
}

function localAiEndpointKind(url: string, savedConfig: LocalAiEndpointConfig = readLocalAiConnectionConfig()) {
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

export function getLocalAiCorsHelpText(url: string, options: { userAgent?: string; origin?: string; savedConfig?: LocalAiEndpointConfig } = {}) {
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

async function releasePlan(plan: ReturnType<typeof getLocalAiReleasePlan>, config: LocalAiConfig) {
  const outcome = await releaseLocalAiModels({ baseUrl: config.url, apiKey: config.apiKey, discovery: { provider: plan.providerId, modelDetails: plan.models } });
  if (outcome.complete) clearLocalAiDiscovery(config.url);
  return outcome;
}
async function releasePreviousLocalAiBeforeSwitch(config: LocalAiConfig, previous: DiscoveryView, next: DiscoveryView, view: LocalAiSettingsView, current: () => boolean): Promise<boolean> {
  const plan = getLocalAiReleasePlan(previous, { modelName: getOllamaMainModel() });
  if (!plan.supported || !plan.models.length) return true;
  const nextProvider = getLocalAiReleasePlan(next).providerLabel;
  if (!current()) return false;
  view.setStatus('testing', `Releasing ${plan.providerLabel} VRAM...`, true);
  const outcome = await releasePlan(plan, config);
  if (!current()) return false;
  if (outcome.complete) {
    clearLocalAiRuntimeUse(config.url);
    showNotification(`${plan.providerLabel} VRAM released. Connecting to ${nextProvider}.`, 'success', 4000);
    return true;
  }
  view.setStatus('disconnected', `${nextProvider} is reachable, but ${plan.providerLabel} could not release its loaded model. Unload it manually, then retry.`, true);
  showNotification(`Could not release ${outcome.failedModels.join(', ')} from ${plan.providerLabel}. The server switch was not saved.`, 'error', 7000);
  return false;
}
const connectionController = createLocalAiConnectionController();
export async function testOllamaConnection(): Promise<void> {
  ++mainDiscoveryGeneration;
  await connectionController.test(getLocalAiSettingsView(), {
    config: readLocalAiConnectionConfig, selectedModel: getOllamaMainModel, context: mainContext,
    normalize: normalizeLocalAiBaseUrl, mixedContent: isHttpsToNonLocalhost,
    sharesMachine: localAiEndpointsShareMachine,
    preflight: async (url, apiKey) => {
      try { await fetch(`${url}/v1/models`, { method: 'HEAD', signal: AbortSignal.timeout(3000), ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}) }); }
      catch (error) { return getLocalAiPreflightHelp(error, url); }
      return null;
    },
    discover: (url, apiKey) => discoverLocalAI(url, apiKey, { force: true }),
    release: releasePreviousLocalAiBeforeSwitch,
    activate: (endpoint, modelId) => requestProviderActivation('ollama', { endpoint, modelId }),
    persist: async (config, model) => { await saveOllamaConfig(config); setOllamaMainModel(model); },
    present: (view, result) => applyMainDiscoveryResult(result, captureMainView(view)),
    errorText: discoveryErrorText,
    committed: () => { updatePrivacyStatusCardFromRuntime(); returnToChatIfOnboarding(); },
  });
}

export async function testPIIOllamaConnection() {
  const generation = ++piiDiscoveryGeneration;
  const urlInput = document.getElementById('pii-local-url-input') as HTMLInputElement | null;
  const view = getPIIConnectionViewFromRuntime();
  if (!urlInput || !view) return;
  const apiKeyInput = document.getElementById('pii-local-apikey-input') as HTMLInputElement | null;
  const draftUrl = urlInput.value;
  const draftKey = apiKeyInput?.value ?? getOllamaPIIApiKey();
  const apiKey = draftKey.trim();
  const current = () => generation === piiDiscoveryGeneration && view.isCurrent()
    && urlInput.value === draftUrl && (!apiKeyInput || apiKeyInput.value === draftKey);
  const failed = (message: string) => view.update({ status: 'disconnected', message, models: [] });
  view.update({ status: 'testing', message: 'Testing...' });
  const urlCheck = normalizeLocalAiBaseUrl(draftUrl);
  if (urlCheck.error) { failed(urlCheck.error); return; }
  const url = urlCheck.url!;
  if (isHttpsToNonLocalhost(url)) {
    failed('Browser mixed-content rules block this HTTP LAN server. Use HTTPS, localhost, or an encrypted local tunnel.');
    return;
  }
  try {
    try { await fetch(`${url}/v1/models`, { method: 'HEAD', signal: AbortSignal.timeout(3000), ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}) }); }
    catch (preErr) {
      const help = await getLocalAiPreflightHelp(preErr, url);
      if (!current()) return;
      if (help) { failed(help); return; }
    }
    if (!current()) return;
    const result = await discoverLocalAI(url, apiKey, { force: true });
    if (!current()) return;
    if (!result.available) throw new Error(discoveryErrorText(result));
    const models = filterPIIEligibleModels(result.models);
    if (models.length === 0) {
      failed((result.models || []).some(isCloudModel)
        ? 'Connected, but only cloud/embedding models were found. Privacy protection requires an on-device text model.'
        : 'Connected but no eligible text-generation models were found.');
    } else {
      setOllamaPIIUrl(url);
      await saveOllamaPIIApiKey(apiKey);
      if (!current()) return;
      let currentPII = getOllamaPIIModel();
      if (!models.includes(currentPII)) { currentPII = models[0] as string; setOllamaPIIModel(currentPII); }
      view.update({ status: 'connected', message: `Connection verified — ${currentPII}. Turn on the privacy toggle to use it.`, models, selectedModel: currentPII });
    }
    updatePrivacyStatusCardFromRuntime();
  } catch (error) {
    if (!current()) return;
    failed(getErrorMessage(error, LOCAL_AI_NOT_CONNECTED_TEXT));
    updatePrivacyStatusCardFromRuntime();
  }
}

export async function refreshModelAdvisor(): Promise<void> {
  const owner = captureMainView(), generation = ++mainDiscoveryGeneration;
  if (!owner.view || connectionController.isPending()) return;
  try {
    const result = await discoverLocalAI(owner.config.url, owner.config.apiKey, { force: true });
    if (generation === mainDiscoveryGeneration && owner.current()) await applyMainDiscoveryResult(result, owner);
  } catch { if (owner.current()) owner.view.setStatus('disconnected', LOCAL_AI_NOT_CONNECTED_TEXT); }
}
export async function copyOllamaPullCmd(command: string): Promise<void> {
  const owner = captureMainView();
  if (!owner.current()) return;
  try { await navigator.clipboard.writeText(command); if (owner.current()) showNotification('Copied: ' + command, 'info'); }
  catch { if (owner.current()) showNotification('Could not copy the command. Select it manually.', 'info'); }
}
export function applyHardwareOverride(vram: string): void {
  if (!getLocalAiSettingsView() || connectionController.isPending()) return;
  const value = parseFloat(vram);
  if (!Number.isFinite(value) || value <= 0) { showNotification('Enter a valid VRAM amount in GB', 'error'); return; }
  saveHardwareOverride(value);
  const { modelDetails, isOllamaServer } = getCachedLocalAiModelDetails();
  if (modelDetails.length) void renderModelAdvisor(checkedAdvisorModels(modelDetails), null, isOllamaServer);
}
export function clearHardwareOverride(): void {
  if (!getLocalAiSettingsView() || connectionController.isPending()) return;
  saveHardwareOverride(null);
  const { modelDetails, isOllamaServer } = getCachedLocalAiModelDetails();
  if (modelDetails.length) void renderModelAdvisor(checkedAdvisorModels(modelDetails), null, isOllamaServer);
}
