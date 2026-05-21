#!/usr/bin/env node
// test-openrouter.js — OpenRouter as 4th AI provider. Source inspection of
// api.js / schema.js / provider-panels.js / chat.js / pdf-import.js /
// service-worker.js + module-level behavioral tests (localStorage helpers,
// hasAIProvider gating, model pricing, PKCE generation).
//
// Run: node tests/test-openrouter.js  (or via npm test)
//
// DOM-runtime assertions (Settings modal rendering — section 10) live in
// tests/test-openrouter-dom.js on the puppeteer runner.

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

// api.js + provider-panels.js expose helpers via Object.assign(window, ...).
await import('../js/state.js');
await import('../js/api.js');
await import('../js/provider-panels.js');

// ─── 1. api.js source inspection ───
console.log('1. api.js source inspection');
const apiSrc = read('js/api.js');
assert('getOpenRouterKey exists', apiSrc.includes('function getOpenRouterKey()'));
assert('saveOpenRouterKey exists', apiSrc.includes('function saveOpenRouterKey('));
assert('hasOpenRouterKey exists', apiSrc.includes('function hasOpenRouterKey()'));
assert('getOpenRouterModel exists', apiSrc.includes('function getOpenRouterModel()'));
assert('setOpenRouterModel exists', apiSrc.includes('function setOpenRouterModel('));
assert('getOpenRouterModelDisplay exists', apiSrc.includes('function getOpenRouterModelDisplay()'));
assert('fetchOpenRouterModels exists', apiSrc.includes('function fetchOpenRouterModels('));
assert('validateOpenRouterKey exists', apiSrc.includes('function validateOpenRouterKey('));
assert('callOpenRouterAPI exists', apiSrc.includes('function callOpenRouterAPI('));
assert('extraHeaders in helper signature', apiSrc.includes('extraHeaders = {}'));
assert('extraHeaders spread in fetch headers', apiSrc.includes('...extraHeaders'));
assert('hasAIProvider handles openrouter', apiSrc.includes("provider === 'openrouter') return hasOpenRouterKey()"));
assert('callClaudeAPI handles openrouter', apiSrc.includes("provider === 'openrouter') return callOpenRouterAPI("));
assert('callOpenRouterAPI sends HTTP-Referer', apiSrc.includes("'HTTP-Referer'"));
assert('callOpenRouterAPI sends X-Title', apiSrc.includes("'X-Title': 'getbased'"));
// api.js carries the hyphenated 'anthropic/claude-sonnet-4-6' string as the
// legacy-ID it migrates FROM — getOpenRouterModel() rewrites it to the dotted
// canonical 'anthropic/claude-sonnet-4.6' (verified by the section-8 default
// assertion). This checks the legacy-migration source string is still present.
assert('api.js still references legacy hyphenated ID for migration', apiSrc.includes("'anthropic/claude-sonnet-4-6'"));
assert('OpenRouter API endpoint', apiSrc.includes('openrouter.ai/api/v1/chat/completions'));
assert('OpenRouter models endpoint', apiSrc.includes('openrouter.ai/api/v1/models'));

// ─── 2. schema.js + api.js: curated models + dynamic pricing ───
console.log('\n2. Curated models + dynamic pricing');
const schemaSrc = read('js/schema.js');
assert('MODEL_PRICING has openrouter block', schemaSrc.includes('openrouter:'));
assert('Has openrouter _default fallback', schemaSrc.includes("'_default':") && schemaSrc.includes('approx: true'));
assert('getModelPricing checks openrouter-pricing cache', schemaSrc.includes('labcharts-openrouter-pricing'));
assert('OPENROUTER_CURATED whitelist exists', apiSrc.includes('OPENROUTER_CURATED'));
assert('Curated: anthropic/claude-sonnet prefix', apiSrc.includes("'anthropic/claude-sonnet-4'"));
assert('Curated: anthropic/claude-opus prefix', apiSrc.includes("'anthropic/claude-opus-4'"));
assert('Curated: openai/gpt prefix', apiSrc.includes("'openai/gpt-5'"));
assert('Curated: google/gemini-3 prefix', apiSrc.includes("'google/gemini-3'"));
assert('Curated: google/gemini-2 prefix', apiSrc.includes("'google/gemini-2'"));
assert('Curated: deepseek prefix', apiSrc.includes("'deepseek/deepseek'"));
assert('Curated: qwen prefix', apiSrc.includes("'qwen/qwen'"));
assert('Curated: x-ai/grok prefix', apiSrc.includes("'x-ai/grok'"));
assert('OPENROUTER_EXCLUDE exists', apiSrc.includes('OPENROUTER_EXCLUDE'));
assert('Excludes codex variants', apiSrc.includes("'codex'"));
assert('Excludes audio variants', apiSrc.includes("'audio'"));
assert('Excludes image variants', apiSrc.includes("'image'"));
assert('Exclude filter applied in fetch', apiSrc.includes('OPENROUTER_EXCLUDE.some'));
assert('fetchOpenRouterModels extracts pricing.prompt', apiSrc.includes('m.pricing.prompt'));
assert('fetchOpenRouterModels converts to per-million', apiSrc.includes('* 1_000_000'));
assert('fetchOpenRouterModels caches pricing', apiSrc.includes("'labcharts-openrouter-pricing'"));
assert('getOpenRouterPricing function exists', apiSrc.includes('function getOpenRouterPricing('));
assert('window.getOpenRouterPricing is function', typeof window.getOpenRouterPricing === 'function');

const oldPricing = localStorage.getItem('labcharts-openrouter-pricing');
localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify({
  'anthropic/claude-sonnet-4-6': { input: 3.00, output: 15.00 }
}));
const dynResult = window.getOpenRouterPricing('anthropic/claude-sonnet-4-6');
assert('getOpenRouterPricing reads cached pricing', dynResult && dynResult.input === 3.00 && dynResult.output === 15.00);
assert('getOpenRouterPricing returns null for unknown', window.getOpenRouterPricing('unknown/model') === null);
if (oldPricing) localStorage.setItem('labcharts-openrouter-pricing', oldPricing);
else localStorage.removeItem('labcharts-openrouter-pricing');

// ─── 3. provider-panels.js source inspection (extracted from settings.js) ───
console.log('\n3. provider-panels.js source inspection');
const ppSrc = read('js/provider-panels.js');
assert('imports getOpenRouterKey', ppSrc.includes('getOpenRouterKey'));
assert('imports saveOpenRouterKey', ppSrc.includes('saveOpenRouterKey'));
assert('imports getOpenRouterModel', ppSrc.includes('getOpenRouterModel'));
assert('imports setOpenRouterModel', ppSrc.includes('setOpenRouterModel'));
assert('imports getOpenRouterModelDisplay', ppSrc.includes('getOpenRouterModelDisplay'));
assert('imports validateOpenRouterKey', ppSrc.includes('validateOpenRouterKey'));
assert('imports fetchOpenRouterModels', ppSrc.includes('fetchOpenRouterModels'));
const settingsSrc = read('js/settings.js');
assert('provider button with data-provider="openrouter"', settingsSrc.includes('data-provider="openrouter"'));
assert("switchAIProvider('openrouter') in onclick", settingsSrc.includes("switchAIProvider('openrouter')"));
assert('renderAIProviderPanel handles openrouter', ppSrc.includes("provider === 'openrouter'"));
assert('handleSaveOpenRouterKey exists', ppSrc.includes('function handleSaveOpenRouterKey()'));
assert('handleRemoveOpenRouterKey exists', ppSrc.includes('function handleRemoveOpenRouterKey()'));
assert('renderOpenRouterModelDropdown exists', ppSrc.includes('function renderOpenRouterModelDropdown('));
assert('updateOpenRouterModelPricing exists', ppSrc.includes('function updateOpenRouterModelPricing('));
assert('openrouter-key-input element', ppSrc.includes('openrouter-key-input'));
assert('openrouter-model-area element', ppSrc.includes('openrouter-model-area'));
assert('openrouter-model-pricing element', ppSrc.includes('openrouter-model-pricing'));
assert('OpenRouter link to openrouter.ai/keys', ppSrc.includes('openrouter.ai/keys'));
assert('initSettingsModelFetch fetches OpenRouter', ppSrc.includes('fetchOpenRouterModels(orKey)'));
const orPanelIdx = ppSrc.indexOf("provider === 'openrouter'");
const venicePanelIdx = ppSrc.indexOf("provider === 'venice'");
assert('renderAIProviderPanel: openrouter before venice', orPanelIdx < venicePanelIdx, `openrouter@${orPanelIdx}, venice@${venicePanelIdx}`);
assert('window exports handleSaveOpenRouterKey', ppSrc.includes('handleSaveOpenRouterKey,'));
assert('window exports handleRemoveOpenRouterKey', ppSrc.includes('handleRemoveOpenRouterKey,'));
assert('window exports renderOpenRouterModelDropdown', ppSrc.includes('renderOpenRouterModelDropdown,'));
assert('window exports updateOpenRouterModelPricing', ppSrc.includes('updateOpenRouterModelPricing,'));
assert('OpenRouter OAuth remembers previous provider before empty-key switch',
  ppSrc.includes('rememberOpenRouterOAuthPreviousProvider(previousProvider)'));
assert('manual OpenRouter key save clears pending OAuth restore state',
  ppSrc.includes('clearOpenRouterOAuthSession();'));

// ─── 4. chat.js source inspection ───
console.log('\n4. chat.js source inspection');
const chatSrc = read('js/chat.js');
assert('chat.js uses getActiveModelId for model resolution', chatSrc.includes('getActiveModelId'));

// ─── 5. pdf-import.js source inspection ───
console.log('\n5. pdf-import.js source inspection');
const pdfSrc = read('js/pdf-import.js');
assert('pdf-import imports getOpenRouterModel', pdfSrc.includes('getOpenRouterModel'));
assert('pdf-import imports getOpenRouterModelDisplay', pdfSrc.includes('getOpenRouterModelDisplay'));
assert('pdf-import has openrouter model-label case (costInfo display)', pdfSrc.includes("'openrouter' ? getOpenRouterModelDisplay()"));
assert('pdf-import uses getActiveModelId for model resolution', pdfSrc.includes('getActiveModelId'));

// ─── 6. service-worker.js ───
console.log('\n6. service-worker.js');
const swSrc = read('service-worker.js');
assert('SW uses importScripts for version', swSrc.includes("importScripts('/version.js')"));
assert('SW CACHE_NAME uses semver', swSrc.includes('`labcharts-v${self.APP_VERSION}`'));
assert('SW bypasses openrouter.ai', swSrc.includes('openrouter.ai'));

// ─── 7. Window function exports ───
console.log('\n7. Window function exports');
assert('window.getOpenRouterKey is function', typeof window.getOpenRouterKey === 'function');
assert('window.saveOpenRouterKey is function', typeof window.saveOpenRouterKey === 'function');
assert('window.hasOpenRouterKey is function', typeof window.hasOpenRouterKey === 'function');
assert('window.getOpenRouterModel is function', typeof window.getOpenRouterModel === 'function');
assert('window.setOpenRouterModel is function', typeof window.setOpenRouterModel === 'function');
assert('window.getOpenRouterModelDisplay is function', typeof window.getOpenRouterModelDisplay === 'function');
assert('window.fetchOpenRouterModels is function', typeof window.fetchOpenRouterModels === 'function');
assert('window.validateOpenRouterKey is function', typeof window.validateOpenRouterKey === 'function');
assert('window.callOpenRouterAPI is function', typeof window.callOpenRouterAPI === 'function');
assert('window.handleSaveOpenRouterKey is function', typeof window.handleSaveOpenRouterKey === 'function');
assert('window.handleRemoveOpenRouterKey is function', typeof window.handleRemoveOpenRouterKey === 'function');
assert('window.renderOpenRouterModelDropdown is function', typeof window.renderOpenRouterModelDropdown === 'function');
assert('window.updateOpenRouterModelPricing is function', typeof window.updateOpenRouterModelPricing === 'function');

// ─── 8. Key/model management (localStorage) ───
console.log('\n8. Key/model management');
const oldKey = localStorage.getItem('labcharts-openrouter-key');
window.saveOpenRouterKey('test-key-123');
assert('saveOpenRouterKey stores to localStorage', localStorage.getItem('labcharts-openrouter-key') === 'test-key-123');
assert('getOpenRouterKey returns saved key', window.getOpenRouterKey() === 'test-key-123');
assert('hasOpenRouterKey returns true with key', window.hasOpenRouterKey() === true);
localStorage.removeItem('labcharts-openrouter-key');
assert('hasOpenRouterKey returns false without key', window.hasOpenRouterKey() === false);
assert('getOpenRouterKey returns empty without key', window.getOpenRouterKey() === '');
if (oldKey) localStorage.setItem('labcharts-openrouter-key', oldKey);

const oldModel = localStorage.getItem('labcharts-openrouter-model');
localStorage.removeItem('labcharts-openrouter-model');
assert('getOpenRouterModel defaults to anthropic/claude-sonnet-4.6', window.getOpenRouterModel() === 'anthropic/claude-sonnet-4.6');
window.setOpenRouterModel('openai/gpt-4o');
assert('setOpenRouterModel persists', window.getOpenRouterModel() === 'openai/gpt-4o');
if (oldModel) localStorage.setItem('labcharts-openrouter-model', oldModel);
else localStorage.removeItem('labcharts-openrouter-model');

// ─── 9. hasAIProvider with openrouter ───
console.log('\n9. hasAIProvider integration');
const oldProvider = localStorage.getItem('labcharts-ai-provider');
const oldORKey = localStorage.getItem('labcharts-openrouter-key');
window.setAIProvider('openrouter');
localStorage.removeItem('labcharts-openrouter-key');
assert('hasAIProvider false for openrouter without key', window.hasAIProvider() === false);
window.saveOpenRouterKey('sk-or-test');
assert('hasAIProvider true for openrouter with key', window.hasAIProvider() === true);
if (oldProvider) localStorage.setItem('labcharts-ai-provider', oldProvider);
else localStorage.removeItem('labcharts-ai-provider');
if (oldORKey) localStorage.setItem('labcharts-openrouter-key', oldORKey);
else localStorage.removeItem('labcharts-openrouter-key');

// Section 10 (Settings modal DOM) lives in test-openrouter-dom.js — needs a
// live browser DOM (openSettingsModal renders, querySelectorAll on rendered
// .ai-provider-btn cards, getElementById on openrouter-* form fields).

// ─── 11. Model pricing (pure-logic string return) ───
console.log('\n11. Model pricing');
const savedPr = localStorage.getItem('labcharts-openrouter-pricing');
localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify({
  'anthropic/claude-sonnet-4-6': { input: 3.00, output: 15.00 }
}));
const pricing = window.renderModelPricingHint('openrouter', 'anthropic/claude-sonnet-4-6');
assert('renderModelPricingHint returns content for openrouter', pricing.length > 0);
assert('pricing includes dollar amounts', pricing.includes('$'));
assert('pricing is not approximate with cached data', !pricing.includes('~'));
const unknownPricing = window.renderModelPricingHint('openrouter', 'unknown/model-xyz');
assert('unknown model pricing is approximate', unknownPricing.includes('~'));
if (savedPr) localStorage.setItem('labcharts-openrouter-pricing', savedPr);
else localStorage.removeItem('labcharts-openrouter-pricing');
const ollamaPricing = window.renderModelPricingHint('ollama', '');
assert('ollama pricing still says Free', ollamaPricing.includes('Free'));

// ─── 12. Key removal clears pricing cache ───
console.log('\n12. Key removal clears pricing cache');
assert('handleRemoveOpenRouterKey clears pricing cache', ppSrc.includes("removeItem('labcharts-openrouter-pricing')"));

// ─── 13. OAuth PKCE flow ───
console.log('\n13. OAuth PKCE flow');
assert('window.generatePKCE is function', typeof window.generatePKCE === 'function');
assert('window.startOpenRouterOAuth is function', typeof window.startOpenRouterOAuth === 'function');
assert('window.exchangeOpenRouterCode is function', typeof window.exchangeOpenRouterCode === 'function');
const pkce = await window.generatePKCE();
assert('generatePKCE returns codeVerifier (43+ chars)', typeof pkce.codeVerifier === 'string' && pkce.codeVerifier.length >= 43);
assert('generatePKCE returns codeChallenge (43+ chars)', typeof pkce.codeChallenge === 'string' && pkce.codeChallenge.length >= 43);
assert('codeVerifier is base64url (no +/=)', !/[+=\/]/.test(pkce.codeVerifier));
assert('codeChallenge is base64url (no +/=)', !/[+=\/]/.test(pkce.codeChallenge));
assert('startOpenRouterOAuth stores verifier in sessionStorage', apiSrc.includes("sessionStorage.setItem('or_pkce_verifier'"));
assert('exchangeOpenRouterCode reads verifier from sessionStorage', apiSrc.includes("sessionStorage.getItem('or_pkce_verifier'"));
assert('startOpenRouterOAuth redirects to openrouter.ai/auth', apiSrc.includes('openrouter.ai/auth?callback_url='));
assert('exchangeOpenRouterCode posts to auth/keys endpoint', apiSrc.includes('openrouter.ai/api/v1/auth/keys'));
const startOAuthFn = apiSrc.match(/export async function startOpenRouterOAuth\(\) \{[\s\S]*?\n\}/)?.[0] || '';
assert('startOpenRouterOAuth preserves the previous provider for cancel/deny',
  startOAuthFn.includes('OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY') && startOAuthFn.includes('getAIProvider()'));
assert('startOpenRouterOAuth does not persist OpenRouter before callback success',
  !startOAuthFn.includes("setAIProvider('openrouter')"));
const startupOAuthSrc = read('js/startup-oauth-callbacks.js');
assert('startup-oauth-callbacks.js checks for code URL param', startupOAuthSrc.includes("urlParams.get('code')") || startupOAuthSrc.includes("get('code')"));
assert('startup-oauth-callbacks.js calls exchangeOpenRouterCode', startupOAuthSrc.includes('exchangeOpenRouterCode('));
assert('startup-oauth-callbacks.js cleans URL via replaceState', startupOAuthSrc.includes('history.replaceState'));
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
assert('sync preserves fresh OpenRouter OAuth provider/key against stale pull',
  syncSrc.includes('shouldKeepLocalOpenRouterOAuthSetting') && syncSrc.includes("'labcharts-openrouter-key'"));
assert('startup sync reconciliation pushes local AI setting drift',
  syncSrc.includes('newer local AI settings') && syncSrc.includes('collectAISettings()'));
const cssSrc = read('styles.css');
assert('CSS: .or-oauth-btn defined', cssSrc.includes('.or-oauth-btn'));
assert('CSS: .or-oauth-divider defined', cssSrc.includes('.or-oauth-divider'));
assert('provider-panels renders or-oauth-btn in OpenRouter panel', ppSrc.includes('or-oauth-btn'));
assert('provider-panels renders or-oauth-divider', ppSrc.includes('or-oauth-divider'));
assert('OAuth button conditional on !currentKey', ppSrc.includes("currentKey ? '' : '<button class=\"or-oauth-btn\""));
assert('Chat setup guide has or-oauth-btn', chatSrc.includes('or-oauth-btn'));
assert('Chat setup guide has startOpenRouterOAuth onclick', chatSrc.includes("onclick=\"startOpenRouterOAuth()\""));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
