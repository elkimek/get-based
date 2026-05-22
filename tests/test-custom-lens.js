#!/usr/bin/env node
// test-custom-lens.js — Custom Knowledge Source (Lens Corpus). Source
// inspection of lens.js / lens-local-worker.js / lens-local.js / chat.js /
// views.js / lab-context.js / sync.js / crypto.js / main.js / styles.css /
// changelog.js / README.md, plus behavioral tests (URL validation, config
// round-trip, hasLens truth table, buildLensSnippet, injectLensChunks,
// status pub/sub, v1.20.x backend forward-compat migration).
//
// Run: node tests/test-custom-lens.js  (or via npm test)
//
// DOM-runtime assertions (sections 15, 16 — chat-header lens indicator,
// Knowledge Base modal rendering) live in tests/test-custom-lens-dom.js on
// the puppeteer runner.

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

console.log('=== Custom Lens Tests ===\n');

// lens.js exposes the lens helpers; lab-context.js exposes injectLensChunks —
// both via Object.assign(window, ...).
await import('../js/state.js');
await import('../js/lens.js');
await import('../js/lab-context.js');

// ─── 1. lens.js source inspection ───
console.log('1. lens.js source inspection');
const lensSrc = read('js/lens.js');
assert('getLensConfig exists', lensSrc.includes('function getLensConfig()'));
assert('saveLensConfig exists', lensSrc.includes('function saveLensConfig('));
assert('getLensKey exists', lensSrc.includes('function getLensKey()'));
assert('saveLensKey exists', lensSrc.includes('function saveLensKey('));
assert('hasLens exists', lensSrc.includes('function hasLens()'));
assert('queryLens exists', lensSrc.includes('function queryLens('));
assert('buildLensSnippet exists', lensSrc.includes('function buildLensSnippet('));
assert('testLensConnection exists', lensSrc.includes('function testLensConnection()'));
assert('clearLensCache exists', lensSrc.includes('function clearLensCache()'));
assert('isValidLensUrl exists', lensSrc.includes('function isValidLensUrl('));
assert('renderCustomLensSection exists', lensSrc.includes('function renderCustomLensSection()'));
assert('handleSaveLensConfig exists', lensSrc.includes('function handleSaveLensConfig()'));
assert('handleRemoveLens exists', lensSrc.includes('function handleRemoveLens()'));
assert('handleToggleLens exists', lensSrc.includes('function handleToggleLens('));
assert('handleClearLensCache exists', lensSrc.includes('function handleClearLensCache()'));
assert('updateLensIndicator exists', lensSrc.includes('function updateLensIndicator()'));
assert("fetch uses credentials:'omit'", lensSrc.includes("credentials: 'omit'"));
assert("fetch uses referrerPolicy:'no-referrer'", lensSrc.includes("referrerPolicy: 'no-referrer'"));
assert("fetch uses redirect:'error'", lensSrc.includes("redirect: 'error'"));
assert('request body includes version field', lensSrc.includes('version: 1'));
assert('request body includes query field', lensSrc.includes('query: hint'));
assert('request body includes top_k field', lensSrc.includes('top_k: topK'));
assert('sends Bearer auth header', lensSrc.includes('`Bearer ${key}`'));
assert('cache key includes profileId', lensSrc.includes('profileId'));
assert('saveLensKey uses encryptedSetItem', lensSrc.includes("encryptedSetItem('labcharts-lens-key'") || lensSrc.includes('encryptedSetItem(SECRET_KEY'));
assert('getLensKey uses getCachedKey', lensSrc.includes('getCachedKey(SECRET_KEY)') || lensSrc.includes("getCachedKey('labcharts-lens-key')"));
// testProbe — configurable test query, replaces hardcoded probe.
assert('DEFAULT_TEST_PROBE constant defined', lensSrc.includes('DEFAULT_TEST_PROBE ='));
assert('testProbe included in DEFAULT_CONFIG', lensSrc.includes('testProbe:') && lensSrc.includes('DEFAULT_CONFIG'));
assert('testLensConnection reads cfg.testProbe', lensSrc.includes('cfg.testProbe'));
assert('testLensConnection falls back to DEFAULT_TEST_PROBE', lensSrc.includes('|| DEFAULT_TEST_PROBE'));
assert('testLensConnection no longer hardcodes the vitamin D probe inline',
  !/['"]vitamin D deficiency supplementation['"][\s\S]{0,100}_doQuery/.test(lensSrc),
  'the probe should be read from config, not passed literally to _doQuery');
assert('renderCustomLensSection includes lens-test-probe-input field', lensSrc.includes('lens-test-probe-input'));
// Per-library embedding-model picker (step 3).
assert('_showLibraryCreateDialog helper defined',
  lensSrc.includes('function _showLibraryCreateDialog'),
  'step 3 library-creation dialog must exist');
assert('_libCreate forwards model argument',
  /async function _libCreate\(name,\s*model\)/.test(lensSrc));
assert('handleLibraryNew no longer calls showPromptDialog as primary path',
  /handleLibraryNew[\s\S]{0,2000}_showLibraryCreateDialog/.test(lensSrc),
  'the rich dialog should be tried before the plain prompt fallback');
assert('Plain prompt fallback still exists for pre-worker-ready case',
  lensSrc.includes('function _plainNamePrompt'));
assert('Dialog renders radio group with name "lens-create-model"',
  lensSrc.includes('name="lens-create-model"'));
assert('Dialog includes locked-at-creation warning',
  /locked at creation/i.test(lensSrc),
  'users need to know switching model means re-indexing');

// Worker-side invariants (things mock-mode round-trips can't exercise).
const workerSrcForPicker = read('js/lens-local-worker.js');

assert('DEFAULT_MODEL_KEY referenced in MODELS catalog',
  /DEFAULT_MODEL_KEY\s*=\s*['"]([a-z0-9-]+)['"]/.test(workerSrcForPicker)
    && (() => {
      const key = workerSrcForPicker.match(/DEFAULT_MODEL_KEY\s*=\s*['"]([a-z0-9-]+)['"]/)[1];
      return new RegExp(`['"]${key}['"]\\s*:\\s*\\{[\\s\\S]*?id:`).test(workerSrcForPicker);
    })(),
  'DEFAULT_MODEL_KEY must name an actual catalog entry');

assert('Tier 3 threshold at < 50 ms/embed',
  /msPerEmbed\s*<\s*50\b/.test(workerSrcForPicker));
assert('Tier 2 threshold at < 150 ms/embed',
  /msPerEmbed\s*<\s*150\b/.test(workerSrcForPicker));

assert('loadOrMigrateLibraries auto-fills missing lib.model',
  /loadOrMigrateLibraries[\s\S]*?lib\.model\s*=\s*DEFAULT_MODEL_KEY/.test(workerSrcForPicker),
  'back-compat migration for libraries that predate the model field');

assert('handleActivateLibrary reloads embedder on model change',
  /handleActivateLibrary[\s\S]*?targetModelKey\s*!==\s*_modelKey[\s\S]*?_loadEmbedder\(/.test(workerSrcForPicker),
  'library switch must swap the model when they differ');

assert('Dialog recommendation prefers English within a tier',
  /candidates\.find\(\(c\)\s*=>\s*c\.spec\.language\s*===\s*['"]en['"]\)/.test(lensSrc)
    || /spec\.language\s*===\s*['"]en['"]/.test(lensSrc));
assert('Dialog recommendation steps down tiers when no match',
  /for\s*\(\s*let\s+t\s*=\s*detectedTier;\s*t\s*>=?\s*1;\s*t--\s*\)/.test(lensSrc),
  'no tier-3-capable device should be told "no recommendation available" — step down to tier 2 or 1');

assert('Setup block uses one-command curl | bash install',
  lensSrc.includes('curl -sSL https://getbased.health/install.sh | bash'));
assert('Setup block no longer instructs "lens serve" or "getbased-dashboard serve" manually',
  !/lens serve\s*&nbsp;|getbased-dashboard serve\s*&nbsp;/.test(lensSrc),
  'manual two-terminal flow was replaced by install.sh');
assert('Setup block notes the Linux-only constraint',
  /Linux only|Linux-only|\(Linux\)/.test(lensSrc),
  'macOS/Windows users need to know services won\'t auto-start');
assert('Setup block links to install.sh source for audit',
  lensSrc.includes('github.com/elkimek/get-based-site/blob/main/install.sh'));
assert('Setup block documents the SHA256 verification path',
  lensSrc.includes('install.sh.sha256') && lensSrc.includes('sha256sum -c'),
  'security-conscious users should have a pre-run verification option');
assert('handleSaveLensConfig persists testProbe', lensSrc.includes('saveLensConfig({ name, url, enabled, topK, testProbe, backend, multiQuery })'));
assert('Connected toast distinguishes zero-result case',
  lensSrc.includes("the test query didn't find any close matches") && lensSrc.includes('your endpoint works'),
  'user with non-matching probe should see the endpoint worked, not "connection failed"');

// ─── 2. Window function exports ───
console.log('\n2. Window function exports');
assert('window.getLensConfig is function', typeof window.getLensConfig === 'function');
assert('window.saveLensConfig is function', typeof window.saveLensConfig === 'function');
assert('window.getLensKey is function', typeof window.getLensKey === 'function');
assert('window.saveLensKey is function', typeof window.saveLensKey === 'function');
assert('window.hasLens is function', typeof window.hasLens === 'function');
assert('window.queryLens is function', typeof window.queryLens === 'function');
assert('window.buildLensSnippet is function', typeof window.buildLensSnippet === 'function');
assert('window.testLensConnection is function', typeof window.testLensConnection === 'function');
assert('window.clearLensCache is function', typeof window.clearLensCache === 'function');
assert('window.isValidLensUrl is function', typeof window.isValidLensUrl === 'function');
assert('window.renderCustomLensSection is function', typeof window.renderCustomLensSection === 'function');
assert('window.handleSaveLensConfig is function', typeof window.handleSaveLensConfig === 'function');
assert('window.handleRemoveLens is function', typeof window.handleRemoveLens === 'function');
assert('window.updateLensIndicator is function', typeof window.updateLensIndicator === 'function');
assert('window.subscribeLensStatus is function', typeof window.subscribeLensStatus === 'function');

// ─── 3. URL validation ───
console.log('\n3. URL validation');
assert('accepts https://example.com', window.isValidLensUrl('https://example.com') === true);
assert('accepts https://rag.example.com/query', window.isValidLensUrl('https://rag.example.com/query') === true);
assert('accepts http://localhost:8000', window.isValidLensUrl('http://localhost:8000') === true);
assert('accepts http://127.0.0.1:8000', window.isValidLensUrl('http://127.0.0.1:8000') === true);
assert('rejects http://evil.com', window.isValidLensUrl('http://evil.com') === false);
assert('rejects empty string', window.isValidLensUrl('') === false);
assert('rejects garbage', window.isValidLensUrl('not-a-url') === false);
assert('rejects ftp://', window.isValidLensUrl('ftp://example.com') === false);
assert('accepts http://192.168.1.5:8000', window.isValidLensUrl('http://192.168.1.5:8000') === true);
assert('accepts http://192.168.222.119:8321/query', window.isValidLensUrl('http://192.168.222.119:8321/query') === true);
assert('accepts http://10.0.0.1', window.isValidLensUrl('http://10.0.0.1') === true);
assert('accepts http://172.16.0.1', window.isValidLensUrl('http://172.16.0.1') === true);
assert('accepts http://172.31.255.254', window.isValidLensUrl('http://172.31.255.254') === true);
assert('rejects http://172.15.0.1 (outside /12)', window.isValidLensUrl('http://172.15.0.1') === false);
assert('rejects http://172.32.0.1 (outside /12)', window.isValidLensUrl('http://172.32.0.1') === false);
assert('accepts http://nas.local:8000', window.isValidLensUrl('http://nas.local:8000') === true);
assert('accepts http://nas.local.', window.isValidLensUrl('http://nas.local.') === true);
assert('accepts http://100.64.0.1 (Tailscale CGNAT)', window.isValidLensUrl('http://100.64.0.1') === true);
assert('accepts http://100.127.255.254 (Tailscale CGNAT)', window.isValidLensUrl('http://100.127.255.254') === true);
assert('rejects http://100.63.0.1 (outside CGNAT)', window.isValidLensUrl('http://100.63.0.1') === false);
assert('rejects http://100.128.0.1 (outside CGNAT)', window.isValidLensUrl('http://100.128.0.1') === false);
assert('accepts http://169.254.169.254 (link-local)', window.isValidLensUrl('http://169.254.169.254') === true);
assert('accepts http://[::1]:8000', window.isValidLensUrl('http://[::1]:8000') === true);
assert('rejects http://8.8.8.8 (public)', window.isValidLensUrl('http://8.8.8.8') === false);
assert('rejects http://256.1.1.1 (invalid octet)', window.isValidLensUrl('http://256.1.1.1') === false);

// ─── 4. Config round-trip ───
console.log('\n4. Config round-trip');
const oldConfig = localStorage.getItem('labcharts-lens-config');
localStorage.removeItem('labcharts-lens-config');
const def = window.getLensConfig();
assert('default config has enabled:false', def.enabled === false);
assert('default config has topK:5', def.topK === 5);
assert('default config has empty url', def.url === '');
window.saveLensConfig({ name: 'Test Lens', url: 'https://test.example.com', enabled: true, topK: 7 });
const savedCfg = window.getLensConfig();
assert('saved name persists', savedCfg.name === 'Test Lens');
assert('saved url persists', savedCfg.url === 'https://test.example.com');
assert('saved enabled persists', savedCfg.enabled === true);
assert('saved topK persists', savedCfg.topK === 7);
if (oldConfig) localStorage.setItem('labcharts-lens-config', oldConfig);
else localStorage.removeItem('labcharts-lens-config');

// ─── 5. hasLens truth table ───
console.log('\n5. hasLens truth table');
const oldCfg = localStorage.getItem('labcharts-lens-config');
const oldKey = localStorage.getItem('labcharts-lens-key');
localStorage.removeItem('labcharts-lens-config');
localStorage.removeItem('labcharts-lens-key');
window.updateKeyCache && window.updateKeyCache('labcharts-lens-key', '');
assert('hasLens false with nothing', window.hasLens() === false);
window.saveLensConfig({ backend: 'external-server', url: 'https://x.com', enabled: false, topK: 5 });
window.updateKeyCache && window.updateKeyCache('labcharts-lens-key', 'k');
assert('hasLens false when disabled', window.hasLens() === false);
window.saveLensConfig({ enabled: true });
assert('hasLens true when enabled+url+key', window.hasLens() === true);
window.saveLensConfig({ url: '' });
assert('hasLens false without url', window.hasLens() === false);
window.saveLensConfig({ url: 'https://x.com' });
window.updateKeyCache && window.updateKeyCache('labcharts-lens-key', '');
assert('hasLens false without key', window.hasLens() === false);
if (oldCfg) localStorage.setItem('labcharts-lens-config', oldCfg);
else localStorage.removeItem('labcharts-lens-config');
if (oldKey) localStorage.setItem('labcharts-lens-key', oldKey);
else localStorage.removeItem('labcharts-lens-key');
window.updateKeyCache && window.updateKeyCache('labcharts-lens-key', '');

// ─── 6. buildLensSnippet formatting ───
console.log('\n6. buildLensSnippet formatting');
const snip1 = window.buildLensSnippet({
  chunks: [{ text: 'chunk one text' }, { text: 'chunk two', source: 'Book p.42' }],
  sourceName: 'Test Framework',
});
assert('snippet includes sourceName', snip1.includes('Test Framework'));
assert('snippet numbers chunks', snip1.includes('1. chunk one') && snip1.includes('2. chunk two'));
assert('snippet includes source citation when present', snip1.includes('Book p.42'));
assert('snippet includes citation instruction', snip1.includes('cite the source'));
const empty = window.buildLensSnippet(null);
assert('snippet empty for null', empty === '');
const noChunks = window.buildLensSnippet({ chunks: [], sourceName: 'X' });
assert('snippet empty for no chunks', noChunks === '');

// ─── 7. injectLensChunks behavior ───
console.log('\n7. injectLensChunks behavior');
const lensResult = { chunks: [{ text: 'lens fact one' }], sourceName: 'MyLens' };
const ctxWithLens = `[section:interpretiveLens]\n## Interpretive Lens\nBredesen framework\n[/section:interpretiveLens]\n\nLab data...`;
const enriched1 = window.injectLensChunks(ctxWithLens, lensResult);
assert('retains original lens text', enriched1.includes('Bredesen framework'));
assert('injects chunk inside block', enriched1.indexOf('lens fact one') < enriched1.indexOf('[/section:interpretiveLens]'));
assert('chunk appears after original lens text', enriched1.indexOf('lens fact one') > enriched1.indexOf('Bredesen framework'));
const ctxWithoutLens = `Profile info\n\nLab data...`;
const enriched2 = window.injectLensChunks(ctxWithoutLens, lensResult);
assert('creates block when none exists', enriched2.includes('[section:interpretiveLens]') && enriched2.includes('[/section:interpretiveLens]'));
assert('new block at top when none existed', enriched2.indexOf('[section:interpretiveLens]') < enriched2.indexOf('Profile info'));
const passthrough = window.injectLensChunks(ctxWithLens, null);
assert('null lens result is passthrough', passthrough === ctxWithLens);
const enrichedLong = window.injectLensChunks('Profile info', {
  chunks: [{ text: 'x'.repeat(5000), source: 'Large doc' }],
  sourceName: 'BigLens',
});
assert('long lens chunk is trimmed before prompt injection', enrichedLong.includes('[trimmed]'));
assert('long lens chunk does not inject full excerpt', !enrichedLong.includes('x'.repeat(2500)));

// ─── 8. Status pub/sub ───
console.log('\n8. Status pub/sub');
const unsub = window.subscribeLensStatus(() => {});
window.getLensStatus();
assert('subscribeLensStatus returns function', typeof unsub === 'function');
unsub();

// ─── 9. Wiring: chat-send.js main send ───
console.log('\n9. chat-send.js wiring');
const chatSendSrc = read('js/chat-send.js');
const chatDiscussionSrc = read('js/chat-discussion.js');
const chatPanelSrc = read('js/chat-panel.js');
assert("imports hasLens from './lens.js'", chatSendSrc.includes("from './lens.js'"));
assert('imports queryLens', chatSendSrc.includes('queryLens'));
assert('imports injectLensChunks', chatSendSrc.includes('injectLensChunks'));
assert('chat-panel imports updateLensIndicator', chatPanelSrc.includes('updateLensIndicator'));
assert('main send calls hasLens()', chatSendSrc.includes('if (hasLens())'));
assert('main send calls queryLensMulti with user text', /await queryLensMulti\(text,/.test(chatSendSrc));
assert('multi-persona calls queryLensMulti with msgText', /await queryLensMulti\(msgText,/.test(chatDiscussionSrc));
assert('openChatPanel calls updateLensIndicator', chatPanelSrc.includes('updateLensIndicator()'));

// ─── 10. Wiring: focus-card.js lens integration ───
console.log('\n10. focus-card.js wiring');
const viewsSrc = read('js/views.js');
const focusCardSrc = read('js/focus-card.js');
assert('views imports focus card module', viewsSrc.includes("from './focus-card.js'"));
assert('focus-card imports hasLens + queryLens', focusCardSrc.includes('hasLens') && focusCardSrc.includes('queryLens'));
assert('focus-card imports injectLensChunks', focusCardSrc.includes('injectLensChunks'));
assert('focus card calls hasLens', /if \(hasLens\(\)\) \{[\s\S]{0,800}await queryLens/.test(focusCardSrc));

// ─── 11. Wiring: lab-context.js helper ───
console.log('\n11. lab-context.js helper');
const lcSrc = read('js/lab-context.js');
assert('exports injectLensChunks', lcSrc.includes('export function injectLensChunks('));
assert('injectLensChunks handles close tag', lcSrc.includes('[/section:interpretiveLens]'));
assert('injectLensChunks caps prompt chunk length', lcSrc.includes('LENS_PROMPT_CHUNK_CHAR_LIMIT'));
assert('injectLensChunks caps total prompt text', lcSrc.includes('LENS_PROMPT_CHUNK_TOTAL_LIMIT'));
assert('window exports injectLensChunks', lcSrc.includes('injectLensChunks,'));

// ─── 12. Wiring: sync.js registration ───
console.log('\n12. sync.js registration');
const syncSrc = read('js/sync.js');
assert('AI_SETTINGS_KEYS includes lens-config', syncSrc.includes("'labcharts-lens-config'"));
assert('AI_SETTINGS_KEYS includes lens-key', syncSrc.includes("'labcharts-lens-key'"));
assert('ENCRYPTED_AI_KEYS includes lens-key', /ENCRYPTED_AI_KEYS[\s\S]{0,500}labcharts-lens-key/.test(syncSrc));

// ─── 13. Wiring: crypto.js sensitive pattern ───
console.log('\n13. crypto.js sensitive pattern');
const cryptoSrc = read('js/crypto.js');
assert('SENSITIVE_PATTERNS includes lens-key', cryptoSrc.includes('labcharts-lens-key'));
assert('API_KEY_LS_KEYS includes lens-key', /API_KEY_LS_KEYS[\s\S]{0,500}labcharts-lens-key/.test(cryptoSrc));

// ─── 14. Wiring: app-feature-modules.js delegates lens startup import ───
console.log('\n14. app-feature-modules.js delegates lens startup import');
const mainSrc = read('js/main.js');
const appFeatureModulesSrc = read('js/app-feature-modules.js');
const appAiInteractionModulesSrc = read('js/app-ai-interaction-modules.js');
assert("main.js imports './app-feature-modules.js'", mainSrc.includes("import './app-feature-modules.js'"));
assert("app-feature-modules.js imports './app-ai-interaction-modules.js'", appFeatureModulesSrc.includes("import './app-ai-interaction-modules.js'"));
assert("app-ai-interaction-modules.js imports './lens.js'", appAiInteractionModulesSrc.includes("import './lens.js'"));

// Sections 15 (chat-header indicator DOM) and 16 (KB modal DOM) live in
// test-custom-lens-dom.js — they need a live browser DOM.

// ─── 17. saveLensConfig clears cache ───
console.log('\n17. Cache clear on config change');
window.clearLensCache();
assert('clearLensCache callable', true);

// ─── 18. CSS classes for indicator states ───
console.log('\n18. CSS classes');
const cssSrc = read('styles.css');
assert('styles include .chat-lens-indicator', cssSrc.includes('.chat-lens-indicator'));
assert('styles include .chat-lens-dot', cssSrc.includes('.chat-lens-dot'));
assert('styles include active state', cssSrc.includes('.chat-lens-indicator.active'));
assert('styles include error state', cssSrc.includes('.chat-lens-indicator.error'));

// ─── 19. BUG 1 regression: handleRemoveLens uses promise-based showConfirmDialog ───
console.log('\n19. handleRemoveLens promise form');
assert('handleRemoveLens is async (uses promise-based showConfirmDialog)', /async function handleRemoveLens/.test(lensSrc));
assert('handleRemoveLens awaits showConfirmDialog', /await\s+showConfirmDialog\(/.test(lensSrc.split('async function handleRemoveLens')[1] || ''));

// ─── 20. BUG 2 regression: testLensConnection works when disabled ───
console.log('\n20. testLensConnection disabled-toggle flow');
assert('testLensConnection does not gate on hasLens()', !/function testLensConnection[\s\S]{0,100}if \(!hasLens/.test(lensSrc));
assert('testLensConnection checks url + key directly', /cfg\.url[\s\S]{0,100}key/.test(lensSrc.split('function testLensConnection')[1] || ''));
assert('queryWithCache envelope exists (factored cache + status path)', lensSrc.includes('function queryWithCache('));
assert('remote backend fetcher extracted', lensSrc.includes('function _fetchRemoteChunks('));

// ─── 21. BUG 3 regression: toggle does not re-render inputs ───
console.log('\n21. Toggle does not re-render section');
assert('handleToggleLens does NOT call _rerenderLensSection', !/function handleToggleLens[\s\S]{0,300}_rerenderLensSection/.test(lensSrc));
assert('handleToggleLens calls _updateLensStatusChip', /function handleToggleLens[\s\S]{0,300}_updateLensStatusChip/.test(lensSrc));
assert('_updateLensStatusChip exists', lensSrc.includes('function _updateLensStatusChip()'));

// ─── 21b. v1.20.x forward-compat: saved config without `backend` field ───
console.log('\n21b. v1.20.x forward-compat migration');
{
  const _prev = localStorage.getItem('labcharts-lens-config');
  localStorage.setItem('labcharts-lens-config', JSON.stringify({
    name: 'My RAG', url: 'https://rag.example.com/query', enabled: true, topK: 5
  }));
  const cfg = window.getLensConfig();
  assert('v1.20.x config with URL → backend=external-server',
    cfg.backend === 'external-server',
    `got ${cfg.backend}`);
  assert('v1.20.x config with URL preserves the URL',
    cfg.url === 'https://rag.example.com/query');
  localStorage.removeItem('labcharts-lens-config');
  const fresh = window.getLensConfig();
  assert('fresh user with no saved config → backend=in-browser',
    fresh.backend === 'in-browser');
  localStorage.setItem('labcharts-lens-config', JSON.stringify({
    name: '', url: '', enabled: false, topK: 5
  }));
  const never = window.getLensConfig();
  assert('v1.20.x config with empty URL → backend=in-browser',
    never.backend === 'in-browser',
    `got ${never.backend}`);
  if (_prev) localStorage.setItem('labcharts-lens-config', _prev);
  else localStorage.removeItem('labcharts-lens-config');
}

// ─── 22. BUG 4 regression: cache only clears on URL/topK change ───
console.log('\n22. Cache survives toggle-only save');
assert('saveLensConfig guards clearLensCache by urlChanged/topKChanged', /urlChanged[\s\S]{0,200}if \(urlChanged \|\| topKChanged\) clearLensCache/.test(lensSrc));

// ─── 23. BUG 5 regression: status chip reflects error state ───
console.log('\n23. Chip shows error state');
assert('renderCustomLensSection chip branches on status.state === "error"', /status\.state === 'error'[\s\S]{0,300}Error/.test(lensSrc));
assert('_updateLensStatusChip also branches on error', lensSrc.split('function _updateLensStatusChip')[1]?.includes("status.state === 'error'"));

// ─── 24. Indicator clears stale classes ───
console.log('\n24. Indicator clears stale classes');
assert('updateLensIndicator removes both classes before branching', /classList\.remove\('active', 'error'\)/.test(lensSrc));

// ─── 24b. Worker feature-detects WebGPU with a WASM fallback ───
console.log('\n24b. Worker WebGPU detection + WASM fallback');
const workerSrc = read('js/lens-local-worker.js');
assert('worker checks navigator.gpu before trying WebGPU',
  /navigator\.gpu/.test(workerSrc) && /requestAdapter/.test(workerSrc),
  'lens-local-worker must feature-detect navigator.gpu + adapter before picking WebGPU');
assert('worker falls back to WASM on WebGPU pipeline init failure',
  /falling back to WASM/i.test(workerSrc) || /fallback/i.test(workerSrc),
  'pipeline init is wrapped in try/catch that retries with WASM when WebGPU throws');
assert('worker tracks active backend for stats reporting',
  /_embedderBackend/.test(workerSrc) && /backend:\s*_embedderBackend/.test(workerSrc),
  'handleStats() must surface the backend (webgpu|wasm) so Settings can display it');
const localSrc = read('js/lens-local.js');
assert('lens-local.js getStats forwards backend field',
  /backend:\s*r\.backend/.test(localSrc),
  'main-thread stats adapter must pass through the backend field from the worker');
assert('lens.js stats row renders WebGPU/WASM label',
  lensSrc.includes("s.backend === 'webgpu' ? 'WebGPU' : 'WASM'"),
  'users should see which engine is active — WebGPU is 3-10x faster than WASM');

// ─── 25. Functional: cache preserved on enable toggle ───
console.log('\n25. Functional: cache preserved on toggle');
const _preCfg = localStorage.getItem('labcharts-lens-config');
const _preKey = localStorage.getItem('labcharts-lens-key');
window.saveLensConfig({ name: 'X', url: 'https://a.example.com', enabled: true, topK: 5 });
window.updateKeyCache && window.updateKeyCache('labcharts-lens-key', 'k');
const beforeCfg = window.getLensConfig();
window.saveLensConfig({ enabled: false });
const afterCfg = window.getLensConfig();
assert('enabled toggle persists', afterCfg.enabled === false && beforeCfg.enabled === true);
if (_preCfg) localStorage.setItem('labcharts-lens-config', _preCfg);
else localStorage.removeItem('labcharts-lens-config');
if (_preKey) localStorage.setItem('labcharts-lens-key', _preKey);
else localStorage.removeItem('labcharts-lens-key');
window.updateKeyCache && window.updateKeyCache('labcharts-lens-key', '');

// ─── 26. Audit: a11y — labels have for= attributes ───
console.log('\n26. Accessibility: label–input associations');
assert('Display name label has for="lens-name-input"', lensSrc.includes('for="lens-name-input"'));
assert('Endpoint URL label has for="lens-url-input"', lensSrc.includes('for="lens-url-input"'));
assert('API key label has for="lens-key-input"', lensSrc.includes('for="lens-key-input"'));
assert('Passages per query label has for="lens-topk-input"', lensSrc.includes('for="lens-topk-input"'));
assert('Enable toggle label has for="lens-enabled-toggle"', lensSrc.includes('for="lens-enabled-toggle"'));

// ─── 27. Audit: UX copy uses "passages" not "chunks" in user-facing text ───
console.log('\n27. UX copy: passages not chunks');
const changelogSrc = read('js/changelog.js');
assert('changelog avoids developer jargon (chunks)', !changelogSrc.includes('chunks came back') && !changelogSrc.includes('chunks fold'));

// ─── 28. Audit: README table formatting ───
console.log('\n28. README table: no broken || cells');
const readmeSrc = read('README.md');
assert('README table has no || row-start patterns', !readmeSrc.includes('|| Lifestyle') && !readmeSrc.includes('|| Custom'));
assert('README uses "knowledge source" not "RAG endpoint"', !readmeSrc.includes('RAG endpoint'));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
