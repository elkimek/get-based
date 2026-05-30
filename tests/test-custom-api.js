#!/usr/bin/env node
// test-custom-api.js — Custom API as 6th AI provider. Source inspection of
// api.js / settings.js / provider-panels.js / pdf-import.js / service-worker.js
// / api/proxy.js / crypto.js, plus behavioral tests (URL/key/model management,
// hasAIProvider gating, callCustomAPI error paths, needsMaxCompletionTokens
// detection).
//
// Run: node tests/test-custom-api.js  (or via npm test)
//
// DOM-runtime assertions (sections 13, 14 — Settings modal rendering, the
// Custom panel form fields + connected-state model dropdown) live in
// tests/test-custom-api-dom.js on the puppeteer runner.

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

// api.js + provider-panels.js expose the Custom-provider helpers via
// Object.assign(window, ...).
await import('../js/state.js');
await import('../js/api.js');
await import('../js/provider-panels.js');

// ─── 1. api.js source inspection ───
console.log('1. api.js source inspection');
const apiSrc = read('js/api.js');
assert('getCustomApiUrl exists', apiSrc.includes('function getCustomApiUrl()'));
assert('setCustomApiUrl exists', apiSrc.includes('function setCustomApiUrl('));
assert('getCustomApiKey exists', apiSrc.includes('function getCustomApiKey()'));
assert('saveCustomApiKey exists', apiSrc.includes('function saveCustomApiKey('));
assert('hasCustomApiKey exists', apiSrc.includes('function hasCustomApiKey()'));
assert('getCustomApiModel exists', apiSrc.includes('function getCustomApiModel()'));
assert('setCustomApiModel exists', apiSrc.includes('function setCustomApiModel('));
assert('getCustomApiModelDisplay exists', apiSrc.includes('function getCustomApiModelDisplay()'));
assert('fetchCustomApiModels exists', apiSrc.includes('function fetchCustomApiModels('));
assert('validateCustomApiKey exists', apiSrc.includes('function validateCustomApiKey('));
assert('callCustomAPI exists', apiSrc.includes('function callCustomAPI('));
assert('hasAIProvider handles custom', apiSrc.includes("provider === 'custom') return hasCustomApiKey()"));
assert('hasAIProvider custom requires URL', apiSrc.includes("hasCustomApiKey() && !!getCustomApiUrl()"));
assert('getActiveModelId handles custom', apiSrc.includes("provider === 'custom') return getCustomApiModel()"));
assert('getActiveModelDisplay handles custom', apiSrc.includes("provider === 'custom') return getCustomApiModelDisplay()"));
assert('callClaudeAPI handles custom', apiSrc.includes("provider === 'custom') return callCustomAPI("));
assert('supportsWebSearch false for custom', apiSrc.includes("provider === 'custom') return false"));
assert('supportsVision true for custom', apiSrc.includes("provider === 'custom') return true"));
assert('callCustomAPI routes through proxy', apiSrc.includes("'Custom', opts,\n    {}"));
assert('saveCustomApiKey uses encryptedSetItem', apiSrc.includes("encryptedSetItem('labcharts-custom-key'"));
assert('getCustomApiKey uses getCachedKey', apiSrc.includes("getCachedKey('labcharts-custom-key')"));

// ─── 2. Window function exports ───
console.log('\n2. Window function exports');
assert('window.getCustomApiUrl is function', typeof window.getCustomApiUrl === 'function');
assert('window.setCustomApiUrl is function', typeof window.setCustomApiUrl === 'function');
assert('window.getCustomApiKey is function', typeof window.getCustomApiKey === 'function');
assert('window.saveCustomApiKey is function', typeof window.saveCustomApiKey === 'function');
assert('window.hasCustomApiKey is function', typeof window.hasCustomApiKey === 'function');
assert('window.getCustomApiModel is function', typeof window.getCustomApiModel === 'function');
assert('window.setCustomApiModel is function', typeof window.setCustomApiModel === 'function');
assert('window.getCustomApiModelDisplay is function', typeof window.getCustomApiModelDisplay === 'function');
assert('window.fetchCustomApiModels is function', typeof window.fetchCustomApiModels === 'function');
assert('window.validateCustomApiKey is function', typeof window.validateCustomApiKey === 'function');
assert('window.callCustomAPI is function', typeof window.callCustomAPI === 'function');
assert('window.handleSaveCustomApi is function', typeof window.handleSaveCustomApi === 'function');
assert('window.handleRemoveCustomApi is function', typeof window.handleRemoveCustomApi === 'function');
assert('window.renderCustomApiModelDropdown is function', typeof window.renderCustomApiModelDropdown === 'function');
assert('window.applyCustomApiManualModel is function', typeof window.applyCustomApiManualModel === 'function');

// ─── 3. URL management ───
console.log('\n3. URL management');
const oldUrl = localStorage.getItem('labcharts-custom-url');
localStorage.removeItem('labcharts-custom-url');
assert('getCustomApiUrl returns empty by default', window.getCustomApiUrl() === '');
window.setCustomApiUrl('https://api.example.com/v1');
assert('setCustomApiUrl persists', window.getCustomApiUrl() === 'https://api.example.com/v1');
assert('localStorage has labcharts-custom-url', localStorage.getItem('labcharts-custom-url') === 'https://api.example.com/v1');
if (oldUrl) localStorage.setItem('labcharts-custom-url', oldUrl);
else localStorage.removeItem('labcharts-custom-url');

// ─── 4. Key management ───
console.log('\n4. Key management');
const oldKey = localStorage.getItem('labcharts-custom-key');
localStorage.removeItem('labcharts-custom-key');
window.updateKeyCache && window.updateKeyCache('labcharts-custom-key', '');
assert('getCustomApiKey returns empty by default', window.getCustomApiKey() === '');
assert('hasCustomApiKey returns false without key', window.hasCustomApiKey() === false);
if (oldKey) localStorage.setItem('labcharts-custom-key', oldKey);

// ─── 5. Model management ───
console.log('\n5. Model management');
const oldModel = localStorage.getItem('labcharts-custom-model');
const oldModels = localStorage.getItem('labcharts-custom-models');
localStorage.removeItem('labcharts-custom-model');
assert('getCustomApiModel returns empty by default', window.getCustomApiModel() === '');
assert('getCustomApiModelDisplay with no model', window.getCustomApiModelDisplay() === '(no model selected)');
window.setCustomApiModel('gpt-4o');
assert('setCustomApiModel persists', window.getCustomApiModel() === 'gpt-4o');
localStorage.setItem('labcharts-custom-models', JSON.stringify([
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' }
]));
assert('getCustomApiModelDisplay resolves name from cache', window.getCustomApiModelDisplay() === 'GPT-4o');
window.setCustomApiModel('claude-sonnet-4-6');
assert('getCustomApiModelDisplay resolves second model', window.getCustomApiModelDisplay() === 'Claude Sonnet 4.6');
window.setCustomApiModel('unknown-model-xyz');
assert('getCustomApiModelDisplay falls back to model ID', window.getCustomApiModelDisplay() === 'unknown-model-xyz');
if (oldModel) localStorage.setItem('labcharts-custom-model', oldModel);
else localStorage.removeItem('labcharts-custom-model');
if (oldModels) localStorage.setItem('labcharts-custom-models', oldModels);
else localStorage.removeItem('labcharts-custom-models');

// ─── 6. hasAIProvider integration ───
console.log('\n6. hasAIProvider integration');
const oldProvider = localStorage.getItem('labcharts-ai-provider');
const savedUrl = localStorage.getItem('labcharts-custom-url');
const savedKey = localStorage.getItem('labcharts-custom-key');
window.setAIProvider('custom');
localStorage.removeItem('labcharts-custom-url');
localStorage.removeItem('labcharts-custom-key');
window.updateKeyCache && window.updateKeyCache('labcharts-custom-key', '');
assert('hasAIProvider false without URL or key', window.hasAIProvider() === false);
window.updateKeyCache && window.updateKeyCache('labcharts-custom-key', 'test-key');
assert('hasAIProvider false with key but no URL', window.hasAIProvider() === false);
window.updateKeyCache && window.updateKeyCache('labcharts-custom-key', '');
window.setCustomApiUrl('https://api.example.com/v1');
assert('hasAIProvider false with URL but no key', window.hasAIProvider() === false);
window.updateKeyCache && window.updateKeyCache('labcharts-custom-key', 'test-key');
assert('hasAIProvider true with both URL and key', window.hasAIProvider() === true);
if (oldProvider) localStorage.setItem('labcharts-ai-provider', oldProvider);
else localStorage.removeItem('labcharts-ai-provider');
if (savedUrl) localStorage.setItem('labcharts-custom-url', savedUrl);
else localStorage.removeItem('labcharts-custom-url');
if (savedKey) localStorage.setItem('labcharts-custom-key', savedKey);
else localStorage.removeItem('labcharts-custom-key');
window.updateKeyCache && window.updateKeyCache('labcharts-custom-key', '');

// ─── 7. getActiveModelId / getActiveModelDisplay ───
console.log('\n7. getActiveModelId / getActiveModelDisplay');
const savedProvider2 = localStorage.getItem('labcharts-ai-provider');
const savedModel2 = localStorage.getItem('labcharts-custom-model');
const savedModels2 = localStorage.getItem('labcharts-custom-models');
window.setAIProvider('custom');
window.setCustomApiModel('my-custom-model');
assert('getActiveModelId returns custom model', window.getActiveModelId() === 'my-custom-model');
localStorage.setItem('labcharts-custom-models', JSON.stringify([{ id: 'my-custom-model', name: 'My Custom Model' }]));
assert('getActiveModelDisplay returns display name', window.getActiveModelDisplay() === 'My Custom Model');
if (savedProvider2) localStorage.setItem('labcharts-ai-provider', savedProvider2);
else localStorage.removeItem('labcharts-ai-provider');
if (savedModel2) localStorage.setItem('labcharts-custom-model', savedModel2);
else localStorage.removeItem('labcharts-custom-model');
if (savedModels2) localStorage.setItem('labcharts-custom-models', savedModels2);
else localStorage.removeItem('labcharts-custom-models');

// ─── 8. supportsWebSearch / supportsVision ───
console.log('\n8. supportsWebSearch / supportsVision');
const savedProvider3 = localStorage.getItem('labcharts-ai-provider');
window.setAIProvider('custom');
assert('supportsWebSearch returns false for custom', window.supportsWebSearch() === false);
assert('supportsVision returns true for custom', window.supportsVision() === true);
if (savedProvider3) localStorage.setItem('labcharts-ai-provider', savedProvider3);
else localStorage.removeItem('labcharts-ai-provider');

// ─── 9. callCustomAPI error handling ───
console.log('\n9. callCustomAPI error handling');
const savedUrlErr = localStorage.getItem('labcharts-custom-url');
const savedKeyErr = localStorage.getItem('labcharts-custom-key');
localStorage.removeItem('labcharts-custom-url');
localStorage.removeItem('labcharts-custom-key');
window.updateKeyCache && window.updateKeyCache('labcharts-custom-key', '');
try {
  await window.callCustomAPI({ system: '', messages: [{ role: 'user', content: 'test' }] });
  assert('callCustomAPI throws without URL', false, 'did not throw');
} catch (e) {
  assert('callCustomAPI throws without URL', e.message.includes('No Custom API URL'));
}
window.setCustomApiUrl('https://api.example.com/v1');
try {
  await window.callCustomAPI({ system: '', messages: [{ role: 'user', content: 'test' }] });
  assert('callCustomAPI throws without key', false, 'did not throw');
} catch (e) {
  assert('callCustomAPI throws without key', e.message.includes('No Custom API key'));
}
if (savedUrlErr) localStorage.setItem('labcharts-custom-url', savedUrlErr);
else localStorage.removeItem('labcharts-custom-url');
if (savedKeyErr) localStorage.setItem('labcharts-custom-key', savedKeyErr);
else localStorage.removeItem('labcharts-custom-key');
window.updateKeyCache && window.updateKeyCache('labcharts-custom-key', '');

// ─── 10. fetchCustomApiModels returns empty without config ───
console.log('\n10. fetchCustomApiModels edge cases');
const emptyResult = await window.fetchCustomApiModels('', '');
assert('fetchCustomApiModels returns [] with empty args', Array.isArray(emptyResult) && emptyResult.length === 0);
const noKeyResult = await window.fetchCustomApiModels('https://api.example.com/v1', '');
assert('fetchCustomApiModels returns [] without key', Array.isArray(noKeyResult) && noKeyResult.length === 0);

// ─── 11. Model pricing ───
console.log('\n11. Model pricing');
const pricing = window.renderModelPricingHint('custom', 'any-model');
assert('custom pricing returns empty (unknown endpoint)', pricing === '');

// ─── 12. settings.js + provider panel source inspection ───
// Provider UI (including Custom) was extracted from settings.js. The button row
// remains in settings.js; provider behavior and markup live in provider modules.
console.log('\n12. settings.js + provider panel source inspection');
const settingsSrc = read('js/settings.js');
const panelsSrc = read('js/provider-panels.js');
const panelRenderSrc = read('js/provider-panel-renderers.js');
const providerUiSrc = panelsSrc + panelRenderSrc;
assert('settings.js has data-provider="custom" button', settingsSrc.includes('data-provider="custom"'));
assert("settings.js wires switchAIProvider('custom')", settingsSrc.includes("switchAIProvider('custom')"));
assert('provider code imports getCustomApiUrl', providerUiSrc.includes('getCustomApiUrl'));
assert('provider-panels imports setCustomApiUrl', panelsSrc.includes('setCustomApiUrl'));
assert('provider code imports getCustomApiKey', providerUiSrc.includes('getCustomApiKey'));
assert('provider-panels imports saveCustomApiKey', panelsSrc.includes('saveCustomApiKey'));
assert('provider code imports getCustomApiModel', providerUiSrc.includes('getCustomApiModel'));
assert('provider-panels imports setCustomApiModel', panelsSrc.includes('setCustomApiModel'));
assert('provider-panels imports fetchCustomApiModels', panelsSrc.includes('fetchCustomApiModels'));
assert('provider-panels imports validateCustomApiKey', panelsSrc.includes('validateCustomApiKey'));
assert('renderAIProviderPanel handles custom', panelRenderSrc.includes("provider === 'custom'"));
assert('handleSaveCustomApi exists', panelsSrc.includes('function handleSaveCustomApi()'));
assert('handleRemoveCustomApi exists', panelsSrc.includes('function handleRemoveCustomApi()'));
assert('renderCustomApiModelDropdown exists', panelsSrc.includes('function renderCustomApiModelDropdown('));
assert('applyCustomApiManualModel exists', panelsSrc.includes('function applyCustomApiManualModel()'));
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

// Sections 13, 14 (Settings modal DOM) live in test-custom-api-dom.js.

// ─── 15. pdf-import.js model switch ───
console.log('\n15. pdf-import.js model switch');
const pdfPreflightSrc = read('js/pdf-import-preflight.js');
assert('pdf-import preflight imports setCustomApiModel', pdfPreflightSrc.includes('setCustomApiModel'));
assert('pdf-import preflight handles custom in tryAutoSwitchModel', pdfPreflightSrc.includes("provider === 'custom') setCustomApiModel("));

// ─── 16. Service worker bypass ───
console.log('\n16. Service worker');
const swSrc = read('service-worker.js');
assert('SW bypasses cross-origin GETs by origin', swSrc.includes('url.origin === self.location.origin') && swSrc.includes('if (!sameOrigin) return;'));
assert('SW keeps same-origin localhost eligible for offline app-shell handling',
  swSrc.includes('Same-origin localhost app files still need SW handling for local offline testing') &&
  /NETWORK_ONLY_HOSTS\.has\(h\)\s*\|\|\s*\(!sameOrigin && isLocalOrPrivateHost\(h\)\)/.test(swSrc));

// ─── 17. Proxy supports GET passthrough ───
console.log('\n17. Proxy GET support');
const proxySrc = read('api/proxy.js');
assert('proxy extracts method field', proxySrc.includes('method: upstreamMethod'));
assert('proxy defaults to POST', proxySrc.includes("upstreamMethod || 'POST'"));
assert('proxy skips body for GET', proxySrc.includes("fetchMethod !== 'GET'"));
assert('_customApiFetchModels uses proxy', apiSrc.includes('function _customApiFetchModels('));
assert('_customApiFetchModels sends method GET via proxy', apiSrc.includes("method: 'GET'"));

// ─── 18. needsMaxCompletionTokens — GPT-5 / o-series detection (#114) ───
console.log('\n18. needsMaxCompletionTokens (#114)');
assert('needsMaxCompletionTokens exists', typeof window.needsMaxCompletionTokens === 'function');
assert('detects gpt-5', window.needsMaxCompletionTokens('gpt-5') === true);
assert('detects gpt-5.4', window.needsMaxCompletionTokens('gpt-5.4') === true);
assert('detects gpt-5-codex', window.needsMaxCompletionTokens('gpt-5-codex') === true);
assert('detects openai/gpt-5 (prefixed)', window.needsMaxCompletionTokens('openai/gpt-5') === true);
assert('detects openai/gpt-5.4 (prefixed)', window.needsMaxCompletionTokens('openai/gpt-5.4') === true);
assert('detects o1', window.needsMaxCompletionTokens('o1') === true);
assert('detects o1-mini', window.needsMaxCompletionTokens('o1-mini') === true);
assert('detects o3', window.needsMaxCompletionTokens('o3') === true);
assert('detects o3-mini', window.needsMaxCompletionTokens('o3-mini') === true);
assert('detects o4-mini', window.needsMaxCompletionTokens('o4-mini') === true);
assert('detects openai/o3 (prefixed)', window.needsMaxCompletionTokens('openai/o3') === true);
assert('rejects gpt-4', window.needsMaxCompletionTokens('gpt-4') === false);
assert('rejects gpt-4o', window.needsMaxCompletionTokens('gpt-4o') === false);
assert('rejects gpt-4-turbo', window.needsMaxCompletionTokens('gpt-4-turbo') === false);
assert('rejects gpt-3.5-turbo', window.needsMaxCompletionTokens('gpt-3.5-turbo') === false);
assert('rejects claude-opus-4-6', window.needsMaxCompletionTokens('claude-opus-4-6') === false);
assert('rejects llama-3.3-70b', window.needsMaxCompletionTokens('llama-3.3-70b') === false);
assert('rejects gemini-3-pro', window.needsMaxCompletionTokens('gemini-3-pro') === false);
assert('rejects deepseek-r1', window.needsMaxCompletionTokens('deepseek-r1') === false);
assert('rejects empty string', window.needsMaxCompletionTokens('') === false);
assert('rejects null', window.needsMaxCompletionTokens(null) === false);
assert('rejects undefined', window.needsMaxCompletionTokens(undefined) === false);
assert('rejects gpt-50 (not GPT-5)', window.needsMaxCompletionTokens('gpt-50') === false);
assert('rejects ozone (no o[1-9] at start)', window.needsMaxCompletionTokens('ozone') === false);
assert('rejects openai/gpt-50', window.needsMaxCompletionTokens('openai/gpt-50') === false);
assert('callOpenAICompatibleAPI uses needsMaxCompletionTokens', apiSrc.includes('needsMaxCompletionTokens(model)'));
assert('body uses dynamic tokenLimitField', apiSrc.includes('[tokenLimitField]:'));
assert('tokenLimitField defaults to max_tokens', apiSrc.includes("? 'max_completion_tokens' : 'max_tokens'"));

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
// it isn't, so only the source-string check above runs. The puppeteer
// suite (which has the full crypto stack) exercises the runtime path.

// ─── 20. Streaming finish_reason length is surfaced ───
console.log('\n20. Streaming finish_reason length');
const savedProviderStream = localStorage.getItem('labcharts-ai-provider');
const savedUrlStream = localStorage.getItem('labcharts-custom-url');
const savedKeyStream = localStorage.getItem('labcharts-custom-key');
const savedRuntimeKeyStream = window.getCustomApiKey ? window.getCustomApiKey() : '';
const savedModelStream = localStorage.getItem('labcharts-custom-model');
const savedFetch = globalThis.fetch;
try {
  window.setAIProvider('custom');
  window.setCustomApiUrl('http://localhost:9999/v1');
  window.setCustomApiModel('stream-test-model');
  window.updateKeyCache && window.updateKeyCache('labcharts-custom-key', 'test-key');

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
  const result = await window.callCustomAPI({
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
  window.updateKeyCache && window.updateKeyCache('labcharts-custom-key', savedRuntimeKeyStream);
  if (savedModelStream) localStorage.setItem('labcharts-custom-model', savedModelStream);
  else localStorage.removeItem('labcharts-custom-model');
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
