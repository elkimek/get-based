#!/usr/bin/env node
// test-custom-api.js — Custom API as 6th AI provider. Source inspection of
// api.js / settings.js / provider-panels.js / pdf-import.js / service-worker
// / api/proxy.js / crypto.js, plus behavioral tests (URL/key/model management,
// hasAIProvider gating, callCustomAPI error paths, needsMaxCompletionTokens
// detection).
//
// Run: node tests/test-custom-api.js  (or via npm test)
//
// DOM-runtime assertions (sections 13, 14 — Settings modal rendering, the
// Custom panel form fields + connected-state model dropdown) live in
// tests/playwright/custom-api-settings.spec.js.

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

console.log('=== Custom API Provider Tests ===\n');

// Custom-provider helpers and provider-panel UI handlers are module-only APIs.
await import('../js/state.js');
const api = await import('../js/api.js');
const cryptoModule = await import('../js/crypto.js');
const providerPanels = await import('../js/provider-panels.js');

// ─── 1. api.js source inspection ───
console.log('1. api.js source inspection');
const apiSrc = read('js/api.js');
const apiModelsSrc = read('js/api-models.js');
const apiCustomSrc = read('js/api-custom.js');
const apiOpenAICompatibleSrc = read('js/api-openai-compatible.js');
const apiProviderStorageSrc = read('js/api-provider-storage.js');
assert('getCustomApiUrl exists', apiProviderStorageSrc.includes('function getCustomApiUrl()'));
assert('setCustomApiUrl exists', apiProviderStorageSrc.includes('function setCustomApiUrl('));
assert('getCustomApiKey exists', apiProviderStorageSrc.includes('function getCustomApiKey()'));
assert('saveCustomApiKey exists', apiProviderStorageSrc.includes('function saveCustomApiKey('));
assert('hasCustomApiKey exists', apiProviderStorageSrc.includes('function hasCustomApiKey()'));
assert('getCustomApiModel exists', apiProviderStorageSrc.includes('function getCustomApiModel()'));
assert('setCustomApiModel exists', apiProviderStorageSrc.includes('function setCustomApiModel('));
assert('getCustomApiModelDisplay exists', apiProviderStorageSrc.includes('function getCustomApiModelDisplay()'));
assert('fetchCustomApiModels exists', apiCustomSrc.includes('function fetchCustomApiModels('));
assert('validateCustomApiKey exists', apiCustomSrc.includes('function validateCustomApiKey('));
assert('callCustomAPI exists', apiCustomSrc.includes('function callCustomAPI('));
assert('hasAIProvider handles custom', apiProviderStorageSrc.includes("provider === 'custom') return hasCustomApiKey()"));
assert('hasAIProvider custom requires URL', apiProviderStorageSrc.includes("hasCustomApiKey() && !!getCustomApiUrl()"));
assert('getActiveModelId handles custom', apiModelsSrc.includes("provider === 'custom') return getCustomApiModel()"));
assert('getActiveModelDisplay handles custom', apiModelsSrc.includes("provider === 'custom') return getCustomApiModelDisplay()"));
assert('isRecommendedModel handles custom Sonnet 5', apiModelsSrc.includes("provider === 'custom'") && apiModelsSrc.includes('isCustomRecommendedModel'));
assert('isRecommendedModel handles custom Fable 5.1', apiModelsSrc.includes('isClaudeFable51Model'));
assert('isRecommendedModel handles custom GLM 5.3 Flash and Kimi K3', apiModelsSrc.includes('glm-5-3-flash') && apiModelsSrc.includes('kimi-k3'));
assert('callClaudeAPI handles custom', apiSrc.includes("provider === 'custom') return callCustomAPI("));
assert('supportsWebSearch false for custom', apiModelsSrc.includes("provider === 'custom') return false"));
assert('supportsVision true for custom', apiModelsSrc.includes("provider === 'custom') return true"));
assert('callCustomAPI routes through shared provider transport',
  apiCustomSrc.includes('return await callOpenAICompatibleAPI(')
    && apiCustomSrc.includes("'Custom',")
    && apiCustomSrc.includes('{ useProxy: false }'));
assert('saveCustomApiKey uses encrypted provider storage runtime', apiProviderStorageSrc.includes("encryptedSetProviderItemRuntime('labcharts-custom-key'"));
assert('getCustomApiKey uses getCachedKey', apiProviderStorageSrc.includes("getCachedKey('labcharts-custom-key')"));

// ─── 2. Module and UI handler exports ───
console.log('\n2. Module and UI handler exports');
assert('api.getCustomApiUrl is function', typeof api.getCustomApiUrl === 'function');
assert('api.setCustomApiUrl is function', typeof api.setCustomApiUrl === 'function');
assert('api.getCustomApiKey is function', typeof api.getCustomApiKey === 'function');
assert('api.saveCustomApiKey is function', typeof api.saveCustomApiKey === 'function');
assert('api.hasCustomApiKey is function', typeof api.hasCustomApiKey === 'function');
assert('api.getCustomApiModel is function', typeof api.getCustomApiModel === 'function');
assert('api.setCustomApiModel is function', typeof api.setCustomApiModel === 'function');
assert('api.getCustomApiModelDisplay is function', typeof api.getCustomApiModelDisplay === 'function');
assert('api.fetchCustomApiModels is function', typeof api.fetchCustomApiModels === 'function');
assert('api.validateCustomApiKey is function', typeof api.validateCustomApiKey === 'function');
assert('api.callCustomAPI is function', typeof api.callCustomAPI === 'function');
assert('providerPanels.handleSaveCustomApi is function', typeof providerPanels.handleSaveCustomApi === 'function');
assert('providerPanels.handleRemoveCustomApi is function', typeof providerPanels.handleRemoveCustomApi === 'function');
assert('providerPanels.renderCustomApiModelDropdown is function', typeof providerPanels.renderCustomApiModelDropdown === 'function');
assert('providerPanels.applyCustomApiManualModel is function', typeof providerPanels.applyCustomApiManualModel === 'function');
assert('custom provider handlers stay off window', !('handleSaveCustomApi' in window));

// ─── 3. URL management ───
console.log('\n3. URL management');
const oldUrl = localStorage.getItem('labcharts-custom-url');
localStorage.removeItem('labcharts-custom-url');
assert('getCustomApiUrl returns empty by default', api.getCustomApiUrl() === '');
api.setCustomApiUrl('https://api.example.com/v1');
assert('setCustomApiUrl persists', api.getCustomApiUrl() === 'https://api.example.com/v1');
assert('localStorage has labcharts-custom-url', localStorage.getItem('labcharts-custom-url') === 'https://api.example.com/v1');
if (oldUrl) localStorage.setItem('labcharts-custom-url', oldUrl);
else localStorage.removeItem('labcharts-custom-url');

// ─── 4. Key management ───
console.log('\n4. Key management');
const oldKey = localStorage.getItem('labcharts-custom-key');
localStorage.removeItem('labcharts-custom-key');
cryptoModule.updateKeyCache('labcharts-custom-key', '');
assert('getCustomApiKey returns empty by default', api.getCustomApiKey() === '');
assert('hasCustomApiKey returns false without key', api.hasCustomApiKey() === false);
if (oldKey) localStorage.setItem('labcharts-custom-key', oldKey);

// ─── 5. Model management ───
console.log('\n5. Model management');
const oldModel = localStorage.getItem('labcharts-custom-model');
const oldModels = localStorage.getItem('labcharts-custom-models');
localStorage.removeItem('labcharts-custom-model');
assert('getCustomApiModel returns empty by default', api.getCustomApiModel() === '');
assert('getCustomApiModelDisplay with no model', api.getCustomApiModelDisplay() === '(no model selected)');
api.setCustomApiModel('gpt-4o');
assert('setCustomApiModel persists', api.getCustomApiModel() === 'gpt-4o');
localStorage.setItem('labcharts-custom-models', JSON.stringify([
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' }
]));
assert('getCustomApiModelDisplay resolves name from cache', api.getCustomApiModelDisplay() === 'GPT-4o');
api.setCustomApiModel('claude-sonnet-4-6');
assert('getCustomApiModelDisplay resolves second model', api.getCustomApiModelDisplay() === 'Claude Sonnet 4.6');
api.setCustomApiModel('unknown-model-xyz');
assert('getCustomApiModelDisplay falls back to model ID', api.getCustomApiModelDisplay() === 'unknown-model-xyz');
if (oldModel) localStorage.setItem('labcharts-custom-model', oldModel);
else localStorage.removeItem('labcharts-custom-model');
if (oldModels) localStorage.setItem('labcharts-custom-models', oldModels);
else localStorage.removeItem('labcharts-custom-models');

// ─── 6. hasAIProvider integration ───
console.log('\n6. hasAIProvider integration');
const oldProvider = localStorage.getItem('labcharts-ai-provider');
const savedUrl = localStorage.getItem('labcharts-custom-url');
const savedKey = localStorage.getItem('labcharts-custom-key');
api.setAIProvider('custom');
localStorage.removeItem('labcharts-custom-url');
localStorage.removeItem('labcharts-custom-key');
cryptoModule.updateKeyCache('labcharts-custom-key', '');
assert('hasAIProvider false without URL or key', api.hasAIProvider() === false);
cryptoModule.updateKeyCache('labcharts-custom-key', 'test-key');
assert('hasAIProvider false with key but no URL', api.hasAIProvider() === false);
cryptoModule.updateKeyCache('labcharts-custom-key', '');
api.setCustomApiUrl('https://api.example.com/v1');
assert('hasAIProvider false with URL but no key', api.hasAIProvider() === false);
cryptoModule.updateKeyCache('labcharts-custom-key', 'test-key');
assert('hasAIProvider true with both URL and key', api.hasAIProvider() === true);
if (oldProvider) localStorage.setItem('labcharts-ai-provider', oldProvider);
else localStorage.removeItem('labcharts-ai-provider');
if (savedUrl) localStorage.setItem('labcharts-custom-url', savedUrl);
else localStorage.removeItem('labcharts-custom-url');
if (savedKey) localStorage.setItem('labcharts-custom-key', savedKey);
else localStorage.removeItem('labcharts-custom-key');
cryptoModule.updateKeyCache('labcharts-custom-key', '');

// ─── 7. getActiveModelId / getActiveModelDisplay ───
console.log('\n7. getActiveModelId / getActiveModelDisplay');
const savedProvider2 = localStorage.getItem('labcharts-ai-provider');
const savedModel2 = localStorage.getItem('labcharts-custom-model');
const savedModels2 = localStorage.getItem('labcharts-custom-models');
api.setAIProvider('custom');
api.setCustomApiModel('my-custom-model');
assert('getActiveModelId returns custom model', api.getActiveModelId() === 'my-custom-model');
localStorage.setItem('labcharts-custom-models', JSON.stringify([{ id: 'my-custom-model', name: 'My Custom Model' }]));
assert('getActiveModelDisplay returns display name', api.getActiveModelDisplay() === 'My Custom Model');
if (savedProvider2) localStorage.setItem('labcharts-ai-provider', savedProvider2);
else localStorage.removeItem('labcharts-ai-provider');
if (savedModel2) localStorage.setItem('labcharts-custom-model', savedModel2);
else localStorage.removeItem('labcharts-custom-model');
if (savedModels2) localStorage.setItem('labcharts-custom-models', savedModels2);
else localStorage.removeItem('labcharts-custom-models');

// ─── 8. supportsWebSearch / supportsVision ───
console.log('\n8. supportsWebSearch / supportsVision');
const savedProvider3 = localStorage.getItem('labcharts-ai-provider');
api.setAIProvider('custom');
assert('supportsWebSearch returns false for custom', api.supportsWebSearch() === false);
assert('supportsVision returns true for custom', api.supportsVision() === true);
if (savedProvider3) localStorage.setItem('labcharts-ai-provider', savedProvider3);
else localStorage.removeItem('labcharts-ai-provider');

// ─── 9. callCustomAPI error handling ───
console.log('\n9. callCustomAPI error handling');
const savedUrlErr = localStorage.getItem('labcharts-custom-url');
const savedKeyErr = localStorage.getItem('labcharts-custom-key');
localStorage.removeItem('labcharts-custom-url');
localStorage.removeItem('labcharts-custom-key');
cryptoModule.updateKeyCache('labcharts-custom-key', '');
try {
  await api.callCustomAPI({ system: '', messages: [{ role: 'user', content: 'test' }] });
  assert('callCustomAPI throws without URL', false, 'did not throw');
} catch (e) {
  assert('callCustomAPI throws without URL', e.message.includes('No Custom API URL'));
}
api.setCustomApiUrl('https://api.example.com/v1');
try {
  await api.callCustomAPI({ system: '', messages: [{ role: 'user', content: 'test' }] });
  assert('callCustomAPI throws without key', false, 'did not throw');
} catch (e) {
  assert('callCustomAPI throws without key', e.message.includes('No Custom API key'));
}
if (savedUrlErr) localStorage.setItem('labcharts-custom-url', savedUrlErr);
else localStorage.removeItem('labcharts-custom-url');
if (savedKeyErr) localStorage.setItem('labcharts-custom-key', savedKeyErr);
else localStorage.removeItem('labcharts-custom-key');
cryptoModule.updateKeyCache('labcharts-custom-key', '');

// ─── 10. fetchCustomApiModels returns empty without config ───
console.log('\n10. fetchCustomApiModels edge cases');
const emptyResult = await api.fetchCustomApiModels('', '');
assert('fetchCustomApiModels returns [] with empty args', Array.isArray(emptyResult) && emptyResult.length === 0);
const noKeyResult = await api.fetchCustomApiModels('https://api.example.com/v1', '');
assert('fetchCustomApiModels returns [] without key', Array.isArray(noKeyResult) && noKeyResult.length === 0);

// ─── 11. Model pricing ───
console.log('\n11. Model pricing');
const pricing = api.renderModelPricingHint('custom', 'any-model');
assert('custom pricing returns empty (unknown endpoint)', pricing === '');

// ─── 12. settings.js + provider panel source inspection ───
// Provider UI (including Custom) was extracted from settings.js. The button row
// remains in settings.js; provider behavior and markup live in provider modules.
console.log('\n12. settings.js + provider panel source inspection');
const settingsSrc = read('js/settings.js');
const panelsSrc = read('js/provider-panels.js');
const panelRenderSrc = read('js/provider-panel-renderers.js');
const providerModelControlsSrc = read('js/provider-model-controls.js');
const providerUiSrc = panelsSrc + panelRenderSrc + providerModelControlsSrc;
assert('settings.js has data-provider="custom" button', settingsSrc.includes('data-provider="custom"'));
assert('settings.js wires custom provider through delegated action',
  /<button[^>]*data-provider="custom"[^>]*data-settings-action="switch-ai-provider"/.test(settingsSrc));
assert('provider code imports getCustomApiUrl', providerUiSrc.includes('getCustomApiUrl'));
assert('provider-panels imports setCustomApiUrl', panelsSrc.includes('setCustomApiUrl'));
assert('provider code imports getCustomApiKey', providerUiSrc.includes('getCustomApiKey'));
assert('provider-panels imports saveCustomApiKey', panelsSrc.includes('saveCustomApiKey'));
assert('provider code imports getCustomApiModel', providerUiSrc.includes('getCustomApiModel'));
assert('provider-model-controls imports setCustomApiModel', providerModelControlsSrc.includes('setCustomApiModel'));
assert('provider-panels imports fetchCustomApiModels', panelsSrc.includes('fetchCustomApiModels'));
assert('provider-panels imports validateCustomApiKey', panelsSrc.includes('validateCustomApiKey'));
assert('renderAIProviderPanel handles custom', panelRenderSrc.includes("provider === 'custom'"));
assert('handleSaveCustomApi exists', panelsSrc.includes('function handleSaveCustomApi()'));
assert('handleRemoveCustomApi exists', panelsSrc.includes('function handleRemoveCustomApi()'));
assert('renderCustomApiModelDropdown exists', providerModelControlsSrc.includes('function renderCustomApiModelDropdown('));
assert('applyCustomApiManualModel exists', providerModelControlsSrc.includes('function applyCustomApiManualModel()'));
assert('custom-url-input element', panelRenderSrc.includes('custom-url-input'));
assert('custom-key-input element', panelRenderSrc.includes('custom-key-input'));
assert('custom-model-area element', providerUiSrc.includes('custom-model-area'));
assert('custom-model-select element', providerUiSrc.includes('custom-model-select'));
assert('custom-manual-model element', providerUiSrc.includes('custom-manual-model'));
assert('initSettingsModelFetch handles custom', panelsSrc.includes('fetchCustomApiModels(customUrl, customKey)'));
assert('window exports handleSaveCustomApi', panelsSrc.includes('handleSaveCustomApi,'));
assert('window exports handleRemoveCustomApi', panelsSrc.includes('handleRemoveCustomApi,'));
assert('window exports renderCustomApiModelDropdown', panelsSrc.includes('renderCustomApiModelDropdown,'));
assert('window exports applyCustomApiManualModel', panelsSrc.includes('applyCustomApiManualModel,'));
const customPanelIdx = panelRenderSrc.indexOf('// Custom API panel');
const localPanelIdx = panelRenderSrc.indexOf('// Local AI panel');
assert('Custom API panel before Local AI panel', customPanelIdx >= 0 && localPanelIdx >= 0 && customPanelIdx < localPanelIdx, `custom@${customPanelIdx}, local@${localPanelIdx}`);

// Sections 13, 14 (Settings modal DOM) live in
// tests/playwright/custom-api-settings.spec.js.

// ─── 15. pdf-import.js model switch ───
console.log('\n15. pdf-import.js model switch');
const pdfPreflightSrc = read('js/pdf-import-preflight.js');
assert('pdf-import preflight imports setCustomApiModel', pdfPreflightSrc.includes('setCustomApiModel'));
assert('pdf-import preflight handles custom in tryAutoSwitchModel', pdfPreflightSrc.includes("provider === 'custom') setCustomApiModel("));

// ─── 16. Service worker bypass ───
console.log('\n16. Service worker');
const swSrc = `${read('service-worker.js')}\n${read('service-worker-runtime.js')}`;
assert('SW bypasses cross-origin GETs by origin',
  swSrc.includes('url.origin === scope.location.origin') &&
  swSrc.includes("event.request.method !== 'GET' || !sameOrigin"));
assert('SW keeps same-origin localhost eligible for offline app-shell handling',
  swSrc.includes('cross-origin private/LAN hosts must stream directly') &&
  /NETWORK_ONLY_HOSTS\.has\(h\)\s*\|\|\s*\(!sameOrigin && isLocalOrPrivateHost\(h\)\)/.test(swSrc));

// ─── 17. Proxy supports GET passthrough ───
console.log('\n17. Proxy GET support');
const proxySrc = read('api/proxy.js');
const proxyPolicySrc = read('lib/proxy-policy.js');
assert('proxy extracts method field', proxySrc.includes('method: upstreamMethod'));
assert('proxy defaults to POST through shared method policy',
  proxySrc.includes('normalizeProxyMethod(upstreamMethod)')
  && proxyPolicySrc.includes("String(method || 'POST')"));
assert('proxy skips body for GET', proxySrc.includes("fetchMethod !== 'GET'"));
assert('_customApiFetchModels uses a direct browser request',
  apiCustomSrc.includes('function _customApiFetchModels(')
    && apiCustomSrc.includes("credentials: 'omit'"));
assert('Custom API never calls the hosted compatibility proxy',
  !apiCustomSrc.includes("fetch('/api/proxy'")
    && apiCustomSrc.includes("{ useProxy: false }"));
assert('Custom API explains browser inference compatibility failures',
  apiCustomSrc.includes('may not support browser-based inference')
    && apiCustomSrc.includes('did not retry the request through its servers'));

// ─── 18. needsMaxCompletionTokens — GPT-5 / o-series detection (#114) ───
console.log('\n18. needsMaxCompletionTokens (#114)');
assert('needsMaxCompletionTokens exists', typeof api.needsMaxCompletionTokens === 'function');
assert('detects gpt-5', api.needsMaxCompletionTokens('gpt-5') === true);
assert('detects gpt-5.4', api.needsMaxCompletionTokens('gpt-5.4') === true);
assert('detects gpt-5-codex', api.needsMaxCompletionTokens('gpt-5-codex') === true);
assert('detects openai/gpt-5 (prefixed)', api.needsMaxCompletionTokens('openai/gpt-5') === true);
assert('detects openai/gpt-5.4 (prefixed)', api.needsMaxCompletionTokens('openai/gpt-5.4') === true);
assert('detects o1', api.needsMaxCompletionTokens('o1') === true);
assert('detects o1-mini', api.needsMaxCompletionTokens('o1-mini') === true);
assert('detects o3', api.needsMaxCompletionTokens('o3') === true);
assert('detects o3-mini', api.needsMaxCompletionTokens('o3-mini') === true);
assert('detects o4-mini', api.needsMaxCompletionTokens('o4-mini') === true);
assert('detects openai/o3 (prefixed)', api.needsMaxCompletionTokens('openai/o3') === true);
assert('rejects gpt-4', api.needsMaxCompletionTokens('gpt-4') === false);
assert('rejects gpt-4o', api.needsMaxCompletionTokens('gpt-4o') === false);
assert('rejects gpt-4-turbo', api.needsMaxCompletionTokens('gpt-4-turbo') === false);
assert('rejects gpt-3.5-turbo', api.needsMaxCompletionTokens('gpt-3.5-turbo') === false);
assert('rejects claude-opus-4-6', api.needsMaxCompletionTokens('claude-opus-4-6') === false);
assert('rejects llama-3.3-70b', api.needsMaxCompletionTokens('llama-3.3-70b') === false);
assert('rejects gemini-3-pro', api.needsMaxCompletionTokens('gemini-3-pro') === false);
assert('rejects deepseek-r1', api.needsMaxCompletionTokens('deepseek-r1') === false);
assert('rejects empty string', api.needsMaxCompletionTokens('') === false);
assert('rejects null', api.needsMaxCompletionTokens(null) === false);
assert('rejects undefined', api.needsMaxCompletionTokens(undefined) === false);
assert('rejects gpt-50 (not GPT-5)', api.needsMaxCompletionTokens('gpt-50') === false);
assert('rejects ozone (no o[1-9] at start)', api.needsMaxCompletionTokens('ozone') === false);
assert('rejects openai/gpt-50', api.needsMaxCompletionTokens('openai/gpt-50') === false);
assert('callOpenAICompatibleAPI uses needsMaxCompletionTokens', apiOpenAICompatibleSrc.includes('needsMaxCompletionTokens(model)'));
assert('body uses dynamic tokenLimitField', apiOpenAICompatibleSrc.includes('[tokenLimitField]:'));
assert('tokenLimitField defaults to max_tokens', apiOpenAICompatibleSrc.includes("? 'max_completion_tokens' : 'max_tokens'"));

// ─── 19. Startup cache decrypts Custom API key (#124) ───
// Regression: API_KEY_LS_KEYS must include 'labcharts-custom-key' so
// decryptKeyCache() populates the in-memory cache on page reload.
console.log('\n19. Startup cache decrypts Custom API key (#124)');
const cryptoSrc = read('js/crypto.js');
const apiKeyListMatch = cryptoSrc.match(/const\s+API_KEY_LS_KEYS\s*=\s*\[([^\]]*)\]/);
assert('API_KEY_LS_KEYS array exists in crypto.js', !!apiKeyListMatch);
if (apiKeyListMatch) {
  const listBody = apiKeyListMatch[1];
  assert('API_KEY_LS_KEYS includes labcharts-custom-key', listBody.includes("'labcharts-custom-key'"),
    'Custom API key must be decrypted into in-memory cache at startup (issue #124)');
}
// Runtime rehydrate check is gated on encryption being unlocked — in Node
// it isn't, so only the source-string check above runs. The Playwright
// suite (which has the full crypto stack) exercises the runtime path.

// ─── 20. Streaming finish_reason length is surfaced ───
console.log('\n20. Streaming finish_reason length');
const savedProviderStream = localStorage.getItem('labcharts-ai-provider');
const savedUrlStream = localStorage.getItem('labcharts-custom-url');
const savedKeyStream = localStorage.getItem('labcharts-custom-key');
const savedRuntimeKeyStream = api.getCustomApiKey();
const savedModelStream = localStorage.getItem('labcharts-custom-model');
const savedFetch = globalThis.fetch;
try {
  api.setAIProvider('custom');
  api.setCustomApiUrl('http://localhost:9999/v1');
  api.setCustomApiModel('stream-test-model');
  cryptoModule.updateKeyCache('labcharts-custom-key', 'test-key');

  const encoder = new TextEncoder();
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"partial sentence"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"length"}],"usage":{"prompt_tokens":10,"completion_tokens":16}}\n\n'));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    }
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

  let streamed = '';
  const result = await api.callCustomAPI({
    system: '',
    messages: [{ role: 'user', content: 'test' }],
    maxTokens: 16,
    onStream(text) { streamed = text; },
  });
  assert('stream callback received content', streamed === 'partial sentence', streamed);
  assert('stream result preserves text', result.text === 'partial sentence', result.text);
  assert('stream result preserves finishReason', result.finishReason === 'length', result.finishReason);
  assert('stream result marks truncated', result.truncated === true, String(result.truncated));
} finally {
  globalThis.fetch = savedFetch;
  if (savedProviderStream) localStorage.setItem('labcharts-ai-provider', savedProviderStream);
  else localStorage.removeItem('labcharts-ai-provider');
  if (savedUrlStream) localStorage.setItem('labcharts-custom-url', savedUrlStream);
  else localStorage.removeItem('labcharts-custom-url');
  if (savedKeyStream) localStorage.setItem('labcharts-custom-key', savedKeyStream);
  else localStorage.removeItem('labcharts-custom-key');
  cryptoModule.updateKeyCache('labcharts-custom-key', savedRuntimeKeyStream);
  if (savedModelStream) localStorage.setItem('labcharts-custom-model', savedModelStream);
  else localStorage.removeItem('labcharts-custom-model');
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
