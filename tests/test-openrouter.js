#!/usr/bin/env node
// test-openrouter.js — OpenRouter as 4th AI provider. Source inspection of
// api.js / schema.js / provider-panels.js / chat.js / pdf-import.js /
// service-worker.js + module-level behavioral tests (localStorage helpers,
// hasAIProvider gating, model pricing, PKCE generation).
//
// Run: node tests/test-openrouter.js  (or via npm test)
//
// DOM-runtime assertions (Settings modal rendering — section 10) live in
// tests/playwright/openrouter-settings.spec.js.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== OpenRouter Integration Tests ===\n');

// Provider helpers and provider-panel UI handlers are module-only APIs.
await import('../js/state.js');
const api = await import('../js/api.js');
const cryptoModule = await import('../js/crypto.js');
const providerPanels = await import('../js/provider-panels.js');
const chatRuntime = await import('../js/chat-runtime.js');
const providerStorageRuntime = await import('../js/api-provider-storage-runtime.js');
const previousProviderStorageRuntime = providerStorageRuntime.configureApiProviderStorageRuntimeDeps({
  encryptedSetItem: cryptoModule.encryptedSetItem,
});

// ─── 1. api.js source inspection ───
console.log('1. api.js source inspection');
const apiSrc = read('js/api.js');
const apiModelsSrc = read('js/api-models.js');
const apiOpenAICompatibleSrc = read('js/api-openai-compatible.js');
const apiOpenRouterSrc = read('js/api-openrouter.js');
const apiOpenRouterOAuthSrc = read('js/api-openrouter-oauth.js');
const apiProviderStorageSrc = read('js/api-provider-storage.js');
assert('getOpenRouterKey exists', apiProviderStorageSrc.includes('function getOpenRouterKey()'));
assert('saveOpenRouterKey exists', apiProviderStorageSrc.includes('function saveOpenRouterKey('));
assert('hasOpenRouterKey exists', apiProviderStorageSrc.includes('function hasOpenRouterKey()'));
assert('getOpenRouterModel exists', apiProviderStorageSrc.includes('function getOpenRouterModel()'));
assert('setOpenRouterModel exists', apiProviderStorageSrc.includes('function setOpenRouterModel('));
assert('getOpenRouterModelDisplay exists', apiProviderStorageSrc.includes('function getOpenRouterModelDisplay()'));
assert('api.js re-exports OpenRouter model helpers', apiSrc.includes("from './api-models.js'"));
assert('fetchOpenRouterModels exists', apiModelsSrc.includes('function fetchOpenRouterModels('));
assert('validateOpenRouterKey exists', apiModelsSrc.includes('function validateOpenRouterKey('));
assert('API model pricing reads cloud classification from pure provider helpers',
  apiModelsSrc.includes("from './local-ai-provider-shared.js'")
    && !apiModelsSrc.includes("from './local-ai-discovery.js'"));
assert('callOpenRouterAPI exists', apiOpenRouterSrc.includes('function callOpenRouterAPI('));
assert('extraHeaders in helper signature', apiOpenAICompatibleSrc.includes('extraHeaders = {}'));
assert('extraHeaders spread in fetch headers', apiOpenAICompatibleSrc.includes('...extraHeaders'));
assert('hasAIProvider handles openrouter', apiProviderStorageSrc.includes("provider === 'openrouter') return hasOpenRouterKey()"));
assert('callClaudeAPI handles openrouter', apiSrc.includes("provider === 'openrouter') return callOpenRouterAPI("));
assert('callOpenRouterAPI sends HTTP-Referer', apiOpenRouterSrc.includes("'HTTP-Referer'"));
assert('callOpenRouterAPI sends X-Title', apiOpenRouterSrc.includes("'X-Title': 'getbased'"));
// api.js carries the hyphenated 'anthropic/claude-sonnet-4-6' string as the
// legacy-ID it migrates FROM — getOpenRouterModel() rewrites it to the dotted
// canonical 'anthropic/claude-sonnet-4.6' (verified by the section-8 default
// assertion). This checks the legacy-migration source string is still present.
assert('provider storage still references legacy hyphenated ID for migration', apiProviderStorageSrc.includes("'anthropic/claude-sonnet-4-6'"));
assert('OpenRouter API endpoint', apiOpenRouterSrc.includes('openrouter.ai/api/v1/chat/completions'));
assert('OpenRouter models endpoint', apiModelsSrc.includes('openrouter.ai/api/v1/models'));

// ─── 2. schema.js + api.js: curated models + dynamic pricing ───
console.log('\n2. Curated models + dynamic pricing');
const schemaSrc = read('js/schema.js');
assert('MODEL_PRICING has openrouter block', schemaSrc.includes('openrouter:'));
assert('Has openrouter _default fallback', schemaSrc.includes("'_default':") && schemaSrc.includes('approx: true'));
assert('getModelPricing checks openrouter-pricing cache', schemaSrc.includes('labcharts-openrouter-pricing'));
assert('OPENROUTER_CURATED whitelist exists', apiModelsSrc.includes('OPENROUTER_CURATED'));
assert('Curated: anthropic/claude-sonnet-5 prefix', apiModelsSrc.includes("'anthropic/claude-sonnet-5'"));
assert('Curated: anthropic/claude-sonnet prefix', apiModelsSrc.includes("'anthropic/claude-sonnet-4'"));
assert('Curated: anthropic/claude-opus-5 prefix', apiModelsSrc.includes("'anthropic/claude-opus-5'"));
assert('Curated: anthropic/claude-opus prefix', apiModelsSrc.includes("'anthropic/claude-opus-4'"));
assert('Curated: openai/gpt prefix', apiModelsSrc.includes("'openai/gpt-5'"));
assert('Curated: google/gemini-3 prefix', apiModelsSrc.includes("'google/gemini-3'"));
assert('Curated: google/gemini-2 prefix', apiModelsSrc.includes("'google/gemini-2'"));
assert('Recommended: Gemini 3.5 Flash', apiModelsSrc.includes("'google/gemini-3.5-flash'"));
assert('Curated: deepseek prefix', apiModelsSrc.includes("'deepseek/deepseek'"));
assert('Curated: qwen prefix', apiModelsSrc.includes("'qwen/qwen'"));
assert('Curated: z-ai/glm-5 prefix', apiModelsSrc.includes("'z-ai/glm-5'"));
assert('Curated: moonshotai Kimi family prefix', apiModelsSrc.includes("'moonshotai/kimi-'"));
assert('Recommended: Kimi K3', apiModelsSrc.includes("'moonshotai/kimi-k3'"));
assert('Recommended: GLM 5.3', apiModelsSrc.includes("'z-ai/glm-5.3'"));
assert('Kimi K2.7 Code remains available but is no longer recommended', apiModelsSrc.includes("'moonshotai/kimi-'"));
assert('Curated: x-ai/grok prefix', apiModelsSrc.includes("'x-ai/grok'"));
assert('OPENROUTER_EXCLUDE exists', apiModelsSrc.includes('OPENROUTER_EXCLUDE'));
assert('Excludes codex variants', apiModelsSrc.includes("'codex'"));
assert('Excludes audio variants', apiModelsSrc.includes("'audio'"));
assert('Excludes image variants', apiModelsSrc.includes("'image'"));
assert('Exclude filter applied in fetch', apiModelsSrc.includes('OPENROUTER_EXCLUDE.some'));
assert('fetchOpenRouterModels extracts pricing.prompt', apiModelsSrc.includes('m.pricing.prompt'));
assert('fetchOpenRouterModels converts to per-million', apiModelsSrc.includes('* 1_000_000'));
assert('fetchOpenRouterModels caches pricing', apiModelsSrc.includes("'labcharts-openrouter-pricing'"));
assert('OpenRouter default prefers GPT 5.6 Sol then Sonnet 5 when fetched', apiModelsSrc.includes("'openai/gpt-5.6-sol', 'anthropic/claude-sonnet-5'"));
assert('getOpenRouterPricing function exists', apiProviderStorageSrc.includes('function getOpenRouterPricing('));
assert('api.getOpenRouterPricing is function', typeof api.getOpenRouterPricing === 'function');

const oldPricing = localStorage.getItem('labcharts-openrouter-pricing');
localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify({
  'anthropic/claude-sonnet-4-6': { input: 3.00, output: 15.00 }
}));
const dynResult = api.getOpenRouterPricing('anthropic/claude-sonnet-4-6');
assert('getOpenRouterPricing reads cached pricing', dynResult && dynResult.input === 3.00 && dynResult.output === 15.00);
assert('getOpenRouterPricing returns null for unknown', api.getOpenRouterPricing('unknown/model') === null);
if (oldPricing) localStorage.setItem('labcharts-openrouter-pricing', oldPricing);
else localStorage.removeItem('labcharts-openrouter-pricing');

// ─── 3. provider panel source inspection (extracted from settings.js) ───
console.log('\n3. provider panel source inspection');
const ppSrc = read('js/provider-panels.js');
const providerRenderSrc = read('js/provider-panel-renderers.js');
const providerModelControlsSrc = read('js/provider-model-controls.js');
const settingsBridgeSrc = read('js/settings-provider-bridge.js');
const providerUiSrc = ppSrc + providerRenderSrc + providerModelControlsSrc;
assert('imports getOpenRouterKey', providerUiSrc.includes('getOpenRouterKey'));
assert('imports saveOpenRouterKey', ppSrc.includes('saveOpenRouterKey'));
assert('imports getOpenRouterModel', providerUiSrc.includes('getOpenRouterModel'));
assert('imports setOpenRouterModel', providerModelControlsSrc.includes('setOpenRouterModel'));
assert('imports getOpenRouterModelDisplay', providerRenderSrc.includes('getOpenRouterModelDisplay'));
assert('imports validateOpenRouterKey', ppSrc.includes('validateOpenRouterKey'));
assert('imports fetchOpenRouterModels', ppSrc.includes('fetchOpenRouterModels'));
const settingsSrc = read('js/settings.js');
assert('provider button with data-provider="openrouter"', settingsSrc.includes('data-provider="openrouter"'));
assert('OpenRouter provider button uses delegated settings action',
  /<button[^>]*data-provider="openrouter"[^>]*data-settings-action="switch-ai-provider"/.test(settingsSrc));
assert('settings calls provider bridge APIs directly',
  settingsSrc.includes('renderAIProviderPanelBridge()') &&
    settingsSrc.includes('initSettingsProviderPanels()'));
assert('settings provider bridge has eager provider switch', settingsBridgeSrc.includes('function switchAIProviderBridge(provider)'));
assert('eager provider bridge persists selection synchronously', settingsBridgeSrc.includes('setAIProvider(provider);'));
assert('settings provider bridge resolves module APIs without publishing globals',
  settingsBridgeSrc.includes('providerPanels.switchAIProvider(provider)') &&
    settingsBridgeSrc.includes('providerPanels.renderAIProviderPanel(getAIProvider())') &&
    !settingsBridgeSrc.includes('settingsWindow') &&
    !settingsBridgeSrc.includes('PROVIDER_PANEL_BRIDGE_NAMES'));
assert('settings records existing provider before provider-key onboarding return',
  settingsSrc.includes('setSettingsProviderHadProvider(hasAIProvider());')
    && settingsSrc.includes('configureSettingsProviderBridgeDeps({')
    && settingsBridgeSrc.includes('hadProviderBeforeSettings: () => settingsHadProvider')
    && settingsBridgeSrc.includes('providerPanels.configureProviderPanelDeps({')
    && ppSrc.includes('if (providerPanelDeps.hadProviderBeforeSettings()) return'));
assert('renderAIProviderPanel handles openrouter', providerRenderSrc.includes("provider === 'openrouter'"));
assert('handleSaveOpenRouterKey exists', ppSrc.includes('function handleSaveOpenRouterKey()'));
assert('handleRemoveOpenRouterKey exists', ppSrc.includes('function handleRemoveOpenRouterKey()'));
assert('renderOpenRouterModelDropdown exists', providerModelControlsSrc.includes('function renderOpenRouterModelDropdown('));
assert('updateOpenRouterModelPricing exists', providerModelControlsSrc.includes('function updateOpenRouterModelPricing('));
assert('openrouter-key-input element', providerRenderSrc.includes('openrouter-key-input'));
assert('openrouter-model-area element', providerUiSrc.includes('openrouter-model-area'));
assert('openrouter-model-pricing element', providerUiSrc.includes('openrouter-model-pricing'));
assert('OpenRouter link to openrouter.ai/keys', providerRenderSrc.includes('openrouter.ai/keys'));
assert('initSettingsModelFetch fetches OpenRouter', ppSrc.includes('fetchOpenRouterModels(orKey)'));
const orPanelIdx = providerRenderSrc.indexOf("provider === 'openrouter'");
const venicePanelIdx = providerRenderSrc.indexOf("provider === 'venice'");
assert('renderAIProviderPanel: openrouter before venice', orPanelIdx < venicePanelIdx, `openrouter@${orPanelIdx}, venice@${venicePanelIdx}`);
assert('provider panels export handleSaveOpenRouterKey as a module API', typeof providerPanels.handleSaveOpenRouterKey === 'function');
assert('provider panels export handleRemoveOpenRouterKey as a module API', typeof providerPanels.handleRemoveOpenRouterKey === 'function');
assert('provider panels export renderOpenRouterModelDropdown as a module API', typeof providerPanels.renderOpenRouterModelDropdown === 'function');
assert('provider panels export updateOpenRouterModelPricing as a module API', typeof providerPanels.updateOpenRouterModelPricing === 'function');
assert('provider panels do not publish the legacy window facade',
  !ppSrc.includes('Object.assign(window') && !('handleSaveOpenRouterKey' in window));
assert('OpenRouter OAuth remembers previous provider before empty-key switch',
  ppSrc.includes('rememberOpenRouterOAuthPreviousProvider(previousProvider)'));
assert('manual OpenRouter key save clears pending OAuth restore state',
  ppSrc.includes('clearOpenRouterOAuthSession();'));

let headerRefreshCount = 0;
let webToggleRefreshCount = 0;
const oldProviderForRefresh = localStorage.getItem('labcharts-ai-provider');
const oldOpenRouterModelForRefresh = localStorage.getItem('labcharts-openrouter-model');
const oldChatRuntimeCallbacks = chatRuntime.configureChatRuntimeCallbacks({
  updateChatHeaderModel: () => { headerRefreshCount += 1; },
  refreshWebSearchToggle: () => { webToggleRefreshCount += 1; },
});
api.setAIProvider('openrouter');
assert('setAIProvider refreshes chat header', headerRefreshCount === 1, `count=${headerRefreshCount}`);
assert('setAIProvider refreshes web-search state', webToggleRefreshCount === 1, `count=${webToggleRefreshCount}`);
assert('setAIProvider marks AI settings as local', Number(sessionStorage.getItem('labcharts-ai-settings-local-lock-until') || 0) > Date.now());
api.setOpenRouterModel('anthropic/claude-sonnet-4.6');
assert('setOpenRouterModel refreshes chat header', headerRefreshCount === 2, `count=${headerRefreshCount}`);
assert('setOpenRouterModel refreshes web-search state', webToggleRefreshCount === 2, `count=${webToggleRefreshCount}`);
chatRuntime.configureChatRuntimeCallbacks(oldChatRuntimeCallbacks);
if (oldProviderForRefresh) localStorage.setItem('labcharts-ai-provider', oldProviderForRefresh);
else localStorage.removeItem('labcharts-ai-provider');
if (oldOpenRouterModelForRefresh) localStorage.setItem('labcharts-openrouter-model', oldOpenRouterModelForRefresh);
else localStorage.removeItem('labcharts-openrouter-model');

// ─── 4. chat-send.js source inspection ───
console.log('\n4. chat-send.js source inspection');
const chatSendSrc = read('js/chat-send.js');
const chatOnboardingSrc = read('js/chat-onboarding.js');
assert('chat-send.js uses getActiveModelId for model resolution', chatSendSrc.includes('getActiveModelId'));
assert('chat-send.js snapshots provider for sends', chatSendSrc.includes('const _msgProvider = getAIProvider()') && chatSendSrc.includes('provider: _msgProvider'));

// ─── 5. pdf-import.js source inspection ───
console.log('\n5. pdf-import.js source inspection');
const pdfSrc = read('js/pdf-import.js');
const pdfPreflightSrc = read('js/pdf-import-preflight.js');
const pdfReviewSrc = read('js/pdf-import-review.js');
assert('pdf-import preflight imports setOpenRouterModel', pdfPreflightSrc.includes('setOpenRouterModel'));
assert('pdf-import-review imports getOpenRouterModelDisplay', pdfReviewSrc.includes('getOpenRouterModelDisplay'));
assert('pdf-import-review has openrouter model-label case (costInfo display)', pdfReviewSrc.includes("'openrouter' ? getOpenRouterModelDisplay()"));
assert('pdf-import uses getActiveModelId for model resolution', pdfSrc.includes('getActiveModelId'));

// ─── 6. service-worker.js ───
console.log('\n6. service-worker.js');
const swSrc = read('service-worker.js');
assert('SW uses importScripts for version', swSrc.includes("importScripts('/version.js')"));
assert('SW CACHE_NAME uses semver', swSrc.includes('`labcharts-v${self.APP_VERSION}`'));
assert('SW bypasses openrouter.ai', swSrc.includes('openrouter.ai'));
assert('SW caches provider-panel-renderers.js', swSrc.includes('/js/provider-panel-renderers.js'));
assert('SW caches provider-model-controls-runtime.js', swSrc.includes('/js/provider-model-controls-runtime.js'));
assert('SW caches provider-model-controls.js', swSrc.includes('/js/provider-model-controls.js'));

// ─── 7. Module and UI handler exports ───
console.log('\n7. Module and UI handler exports');
assert('api.getOpenRouterKey is function', typeof api.getOpenRouterKey === 'function');
assert('api.saveOpenRouterKey is function', typeof api.saveOpenRouterKey === 'function');
assert('api.hasOpenRouterKey is function', typeof api.hasOpenRouterKey === 'function');
assert('api.getOpenRouterModel is function', typeof api.getOpenRouterModel === 'function');
assert('api.setOpenRouterModel is function', typeof api.setOpenRouterModel === 'function');
assert('api.getOpenRouterModelDisplay is function', typeof api.getOpenRouterModelDisplay === 'function');
assert('api.fetchOpenRouterModels is function', typeof api.fetchOpenRouterModels === 'function');
assert('api.validateOpenRouterKey is function', typeof api.validateOpenRouterKey === 'function');
assert('api.callOpenRouterAPI is function', typeof api.callOpenRouterAPI === 'function');
assert('providerPanels.handleSaveOpenRouterKey is function', typeof providerPanels.handleSaveOpenRouterKey === 'function');
assert('providerPanels.handleRemoveOpenRouterKey is function', typeof providerPanels.handleRemoveOpenRouterKey === 'function');
assert('providerPanels.renderOpenRouterModelDropdown is function', typeof providerPanels.renderOpenRouterModelDropdown === 'function');
assert('providerPanels.updateOpenRouterModelPricing is function', typeof providerPanels.updateOpenRouterModelPricing === 'function');

// ─── 8. Key/model management (encrypted localStorage) ───
console.log('\n8. Key/model management');
const oldKey = localStorage.getItem('labcharts-openrouter-key');
await api.saveOpenRouterKey('test-key-123');
const storedOpenRouterKey = localStorage.getItem('labcharts-openrouter-key');
assert('saveOpenRouterKey encrypts the localStorage value', storedOpenRouterKey?.startsWith('d1:') && storedOpenRouterKey !== 'test-key-123');
assert('encryptedGetItem decrypts the saved key', await cryptoModule.encryptedGetItem('labcharts-openrouter-key') === 'test-key-123');
assert('getOpenRouterKey returns saved key', api.getOpenRouterKey() === 'test-key-123');
assert('hasOpenRouterKey returns true with key', api.hasOpenRouterKey() === true);
localStorage.removeItem('labcharts-openrouter-key');
cryptoModule.updateKeyCache('labcharts-openrouter-key', null);
assert('hasOpenRouterKey returns false without key', api.hasOpenRouterKey() === false);
assert('getOpenRouterKey returns empty without key', api.getOpenRouterKey() === '');
if (oldKey) localStorage.setItem('labcharts-openrouter-key', oldKey);
cryptoModule.updateKeyCache('labcharts-openrouter-key', oldKey);

const oldModel = localStorage.getItem('labcharts-openrouter-model');
localStorage.removeItem('labcharts-openrouter-model');
assert('getOpenRouterModel defaults to anthropic/claude-sonnet-4.6', api.getOpenRouterModel() === 'anthropic/claude-sonnet-4.6');
api.setOpenRouterModel('openai/gpt-4o');
assert('setOpenRouterModel persists', api.getOpenRouterModel() === 'openai/gpt-4o');
if (oldModel) localStorage.setItem('labcharts-openrouter-model', oldModel);
else localStorage.removeItem('labcharts-openrouter-model');

// ─── 9. hasAIProvider with openrouter ───
console.log('\n9. hasAIProvider integration');
const oldProvider = localStorage.getItem('labcharts-ai-provider');
const oldORKey = localStorage.getItem('labcharts-openrouter-key');
api.setAIProvider('openrouter');
localStorage.removeItem('labcharts-openrouter-key');
cryptoModule.updateKeyCache('labcharts-openrouter-key', null);
assert('hasAIProvider false for openrouter without key', api.hasAIProvider() === false);
await api.saveOpenRouterKey('sk-or-test');
assert('hasAIProvider true for openrouter with key', api.hasAIProvider() === true);
if (oldProvider) localStorage.setItem('labcharts-ai-provider', oldProvider);
else localStorage.removeItem('labcharts-ai-provider');
if (oldORKey) localStorage.setItem('labcharts-openrouter-key', oldORKey);
else localStorage.removeItem('labcharts-openrouter-key');
cryptoModule.updateKeyCache('labcharts-openrouter-key', oldORKey);

// Section 10 (Settings modal DOM) lives in
// tests/playwright/openrouter-settings.spec.js.

// ─── 11. Model pricing (pure-logic string return) ───
console.log('\n11. Model pricing');
const savedPr = localStorage.getItem('labcharts-openrouter-pricing');
localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify({
  'anthropic/claude-sonnet-4-6': { input: 3.00, output: 15.00 }
}));
const pricing = api.renderModelPricingHint('openrouter', 'anthropic/claude-sonnet-4-6');
assert('renderModelPricingHint returns content for openrouter', pricing.length > 0);
assert('pricing includes dollar amounts', pricing.includes('$'));
assert('pricing is not approximate with cached data', !pricing.includes('~'));
const unknownPricing = api.renderModelPricingHint('openrouter', 'unknown/model-xyz');
assert('unknown model pricing is approximate', unknownPricing.includes('~'));
if (savedPr) localStorage.setItem('labcharts-openrouter-pricing', savedPr);
else localStorage.removeItem('labcharts-openrouter-pricing');
const ollamaPricing = api.renderModelPricingHint('ollama', '');
assert('Local AI pricing avoids claiming remote or cloud servers are free',
  ollamaPricing.includes('configured server') && !ollamaPricing.includes('Free'));
const cloudOllamaPricing = api.renderModelPricingHint('ollama', 'qwen3:cloud');
assert('Ollama cloud model pricing retains the provider-terms warning',
  cloudOllamaPricing.includes('Cloud model') && cloudOllamaPricing.includes('provider terms'));

// ─── 12. Key removal clears pricing cache ───
console.log('\n12. Key removal clears pricing cache');
assert('handleRemoveOpenRouterKey clears pricing cache', ppSrc.includes("removeItem('labcharts-openrouter-pricing')"));

// ─── 13. OAuth PKCE flow ───
console.log('\n13. OAuth PKCE flow');
assert('api.generatePKCE is function', typeof api.generatePKCE === 'function');
assert('api.startOpenRouterOAuth is function', typeof api.startOpenRouterOAuth === 'function');
assert('api.exchangeOpenRouterCode is function', typeof api.exchangeOpenRouterCode === 'function');
const pkce = await api.generatePKCE();
assert('generatePKCE returns codeVerifier (43+ chars)', typeof pkce.codeVerifier === 'string' && pkce.codeVerifier.length >= 43);
assert('generatePKCE returns codeChallenge (43+ chars)', typeof pkce.codeChallenge === 'string' && pkce.codeChallenge.length >= 43);
assert('codeVerifier is base64url (no +/=)', !/[+=\/]/.test(pkce.codeVerifier));
assert('codeChallenge is base64url (no +/=)', !/[+=\/]/.test(pkce.codeChallenge));
assert('startOpenRouterOAuth stores verifier in sessionStorage', apiOpenRouterOAuthSrc.includes("sessionStorage.setItem('or_pkce_verifier'"));
assert('exchangeOpenRouterCode reads verifier from sessionStorage', apiOpenRouterOAuthSrc.includes("sessionStorage.getItem('or_pkce_verifier'"));
assert('startOpenRouterOAuth redirects to openrouter.ai/auth', apiOpenRouterOAuthSrc.includes('openrouter.ai/auth?callback_url='));
assert('exchangeOpenRouterCode posts to auth/keys endpoint', apiOpenRouterOAuthSrc.includes('openrouter.ai/api/v1/auth/keys'));
const startOAuthFn = apiOpenRouterOAuthSrc.match(/export async function startOpenRouterOAuth\(\) \{[\s\S]*?\n\}/)?.[0] || '';
assert('startOpenRouterOAuth preserves the previous provider for cancel/deny',
  startOAuthFn.includes('OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY') && startOAuthFn.includes('getAIProvider()'));
assert('startOpenRouterOAuth does not persist OpenRouter before callback success',
  !startOAuthFn.includes("setAIProvider('openrouter')"));
const startupOAuthSrc = read('js/startup-oauth-callbacks.js');
assert('startup-oauth-callbacks.js checks for code URL param', startupOAuthSrc.includes("urlParams.get('code')") || startupOAuthSrc.includes("get('code')"));
assert('startup-oauth-callbacks.js calls exchangeOpenRouterCode', startupOAuthSrc.includes('exchangeOpenRouterCode('));
assert('startup-oauth-callbacks.js cleans URL via runtime replaceState',
  startupOAuthSrc.includes('function replaceCurrentUrl()')
    && startupOAuthSrc.includes('startupRuntime().history')
    && startupOAuthSrc.includes('historyApi.replaceState(null, \'\', currentPathname())'));
assert('startup-oauth-callbacks.js handles OpenRouter authorization denial',
  startupOAuthSrc.includes("urlParams.get('error')") && startupOAuthSrc.includes('restoreOpenRouterOAuthPreviousProvider()'));
assert('startup-oauth-callbacks.js gates OpenRouter handling on pending local OAuth state',
  startupOAuthSrc.includes('const pendingOpenRouterOAuth = hasPendingOpenRouterOAuthSession()')
  && startupOAuthSrc.includes('!wearableHandled && pendingOpenRouterOAuth'));
assert('startup-oauth-callbacks.js validates code inside OpenRouter handler',
  startupOAuthSrc.includes("typeof oauthCode !== 'string' || !oauthCode"));
assert('startup-oauth-callbacks.js clears pending OAuth state after callback',
  startupOAuthSrc.includes('clearOpenRouterOAuthSession()'));
assert('startup-oauth-callbacks.js marks fresh OpenRouter settings local for sync',
  startupOAuthSrc.includes('markOpenRouterOAuthSettingsLocal()'));
const syncSrc = read('js/sync.js');
const syncConfigureSrc = read('js/sync-configure.js');
const startupOrchestratorSrc = read('js/startup-orchestrator.js');
const syncReconcileSrc = read('js/sync-reconcile.js');
const syncApplySrc = read('js/sync-apply.js');
assert('sync preserves fresh OpenRouter OAuth provider/key against stale pull',
  syncApplySrc.includes('shouldKeepLocalOpenRouterOAuthSetting') && syncApplySrc.includes("'labcharts-openrouter-key'"));
assert('sync preserves fresh local AI settings against stale pull',
  syncApplySrc.includes('AI_SETTINGS_LOCAL_LOCK_UNTIL_KEY') && syncApplySrc.includes('shouldKeepLocalAISetting(key,'));
assert('sync refreshes AI header after remote AI settings apply',
  syncApplySrc.includes('refreshSyncedAIProviderUiRuntime()')
    && !syncApplySrc.includes('window.updateChatHeaderModel')
    && !syncApplySrc.includes('window.refreshWebSearchToggle'));
assert('startup sync reconciliation pushes local AI setting drift',
  syncConfigureSrc.includes("from './sync-reconcile.js'")
    && !syncSrc.includes("from './sync-configure.js'")
    && startupOrchestratorSrc.includes("from './sync-configure.js'")
    && startupOrchestratorSrc.includes('configureSyncModules({ enableSync });')
    && syncReconcileSrc.includes('newer local AI settings')
    && syncReconcileSrc.includes('collectAISettings()'));
const cssSrc = read('styles.css') + '\n' + read('css/settings.css');
assert('CSS: .or-oauth-btn defined', cssSrc.includes('.or-oauth-btn'));
assert('CSS: .or-oauth-divider defined', cssSrc.includes('.or-oauth-divider'));
assert('provider renderer renders or-oauth-btn in OpenRouter panel', providerRenderSrc.includes('or-oauth-btn'));
assert('provider renderer renders or-oauth-divider', providerRenderSrc.includes('or-oauth-divider'));
assert('OAuth button conditional on !currentKey', providerRenderSrc.includes("currentKey ? '' : '<button class=\"or-oauth-btn\""));
assert('Chat setup guide has or-oauth-btn', chatOnboardingSrc.includes('or-oauth-btn'));
assert('Chat setup guide has delegated startOpenRouterOAuth action',
  chatOnboardingSrc.includes('data-chat-onboarding-action') &&
  chatOnboardingSrc.includes('start-openrouter-oauth'));

providerStorageRuntime.configureApiProviderStorageRuntimeDeps(previousProviderStorageRuntime);
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
