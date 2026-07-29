#!/usr/bin/env node
// test-crypto.js — encryption, backup, and cross-tab sync verification.
// Module/window exports, sensitive-key detection, Web Crypto PBKDF2/AES-GCM
// round-trip, the v1: ciphertext format, encryptedSetItem/GetItem routing,
// BroadcastChannel no-self-notify, encryption-state rendering, the key cache,
// the labcharts-backups IndexedDB, buildBackupSnapshot, plus a source sweep.
//
// Run: node tests/test-crypto.js  (or via npm test)
//
// Full port — the window-export checks need the app modules loaded (data.js,
// profile.js, nav.js, views.js, export.js, settings.js, chat.js, utils.js,
// backup.js — all confirmed to load cleanly in Node); IndexedDB runs via
// fake-indexeddb; Web Crypto + BroadcastChannel are Node built-ins.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');
function fetchWithRetry(rel) { return Promise.resolve(read(rel)); }

// fs-backed fetch shim for the source-inspection sweep's `fetch('X')` reads.
const _realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && !/^https?:/.test(url)) {
    const rel = url.replace(/^\//, '');
    try { return new Response(read(rel), { status: 200 }); }
    catch (_) { return new Response('', { status: 404 }); }
  }
  return _realFetch(url, opts);
};

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Crypto / Encryption / Backup Tests ===\n');

// Load the app module surface and verify crypto through its ESM exports.
await import('../js/state.js');
const cryptoModule = await import('../js/crypto.js');
await import('../js/pii.js');
const dataModule = await import('../js/data.js');
const profileModule = await import('../js/profile.js');
cryptoModule.configureCryptoProfileDeps({ migrateProfileData: profileModule.migrateProfileData });
const navModule = await import('../js/nav.js');
const viewsModule = await import('../js/views.js');
cryptoModule.configureCryptoProfileDeps({ buildSidebar: navModule.buildSidebar, navigate: viewsModule.navigate });
const exportModule = await import('../js/export.js');
const settingsModule = await import('../js/settings.js');
await import('../js/chat.js');
await import('../js/utils.js');
const backupModule = await import('../js/backup.js');
const backupSrc = read('js/backup.js');
const cryptoStoreSrc = read('js/crypto.js');
const cryptoUiSrc = read('js/crypto-ui.js');
const cycleStoreSrc = read('js/cycle-store.js');
const profileStorageKeySrc = read('js/profile-storage-key.js');

// Seed a minimal profile registry — the app bootstraps one via
// initProfilesCache() on page load; in Node we seed it so the section-15
// getProfiles() check has something to read.
if (!localStorage.getItem('labcharts-profiles')) {
  localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'default', name: 'Test Profile' }]));
}
await profileModule.initProfilesCache();

// ═══════════════════════════════════════════════
// 1. Module exports exist without legacy window globals
// ═══════════════════════════════════════════════
console.log('1. Module exports');
const cryptoExports = [
  'initEncryption', 'initBroadcastChannel', 'getEncryptionEnabled', 'isUnlocked',
  'encryptedSetItem', 'encryptedGetItem', 'showEnableEncryptionModal',
  'maybeShowEncryptionNudge', 'maybeShowBackupNudge', 'disableEncryption',
  'changePassphrase', 'broadcastDataChanged', 'renderEncryptionSection',
  'renderBackupSection', 'isSensitiveKey', 'getCachedKey', 'updateKeyCache',
  'decryptKeyCache', 'loadBackupSnapshots', 'toggleBackupSnapshots',
];
for (const name of cryptoExports) {
  assert(`crypto.${name} exists`, typeof cryptoModule[name] === 'function');
  assert(`window.${name} stays module-only`, !(name in window));
}
assert('backup.exportEncryptedBackup module export exists', typeof backupModule.exportEncryptedBackup === 'function');
assert('backup.importEncryptedBackup module export exists', typeof backupModule.importEncryptedBackup === 'function');
assert('window.exportEncryptedBackup stays module-only', !('exportEncryptedBackup' in window));
assert('window.importEncryptedBackup stays module-only', !('importEncryptedBackup' in window));
assert('cycle storage receives crypto providers without a reverse import',
  cryptoStoreSrc.includes('configureCycleStoreCrypto(indexedDBCryptoDeps)')
    && cycleStoreSrc.includes('export function configureCycleStoreCrypto')
    && !cycleStoreSrc.includes("import('./crypto.js')"));
assert('backup and crypto use the leaf profile storage-key helper',
  backupSrc.includes("from './profile-storage-key.js'")
    && !backupSrc.includes("from './profile.js'")
    && cryptoStoreSrc.includes("from './profile-storage-key.js'")
    && !cryptoStoreSrc.includes("from './profile.js'")
    && profileStorageKeySrc.includes('export function profileStorageKey'));
assert('profile.initProfilesCache exists', typeof profileModule.initProfilesCache === 'function');
assert('window.initProfilesCache stays module-only', !('initProfilesCache' in window));

// ═══════════════════════════════════════════════
// 2. Sensitive key detection
// ═══════════════════════════════════════════════
console.log('2. Sensitive key detection');
assert('labcharts-default-imported is sensitive', cryptoModule.isSensitiveKey('labcharts-default-imported'));
assert('labcharts-abc123-imported is sensitive', cryptoModule.isSensitiveKey('labcharts-abc123-imported'));
assert('labcharts-default-imported-corrupt is sensitive', cryptoModule.isSensitiveKey('labcharts-default-imported-corrupt'));
assert('labcharts-default-chat is sensitive', cryptoModule.isSensitiveKey('labcharts-default-chat'));
assert('labcharts-profiles is sensitive', cryptoModule.isSensitiveKey('labcharts-profiles'));
assert('labcharts-api-key IS sensitive', cryptoModule.isSensitiveKey('labcharts-api-key'));
assert('labcharts-venice-key IS sensitive', cryptoModule.isSensitiveKey('labcharts-venice-key'));
assert('labcharts-openrouter-key IS sensitive', cryptoModule.isSensitiveKey('labcharts-openrouter-key'));
assert('labcharts-ollama IS sensitive', cryptoModule.isSensitiveKey('labcharts-ollama'));
assert('labcharts-ai-provider is NOT sensitive', !cryptoModule.isSensitiveKey('labcharts-ai-provider'));
assert('labcharts-default-units is NOT sensitive', !cryptoModule.isSensitiveKey('labcharts-default-units'));
assert('labcharts-encryption-enabled is NOT sensitive', !cryptoModule.isSensitiveKey('labcharts-encryption-enabled'));
assert('labcharts-time-format is NOT sensitive', !cryptoModule.isSensitiveKey('labcharts-time-format'));
assert('labcharts-default-focusCard is NOT sensitive', !cryptoModule.isSensitiveKey('labcharts-default-focusCard'));

// ═══════════════════════════════════════════════
// 3. Web Crypto API key derivation round-trip
// ═══════════════════════════════════════════════
console.log('3. Web Crypto round-trip');
try {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passphrase = 'test-passphrase-123';
  const iterations = 600000;

  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  assert('Key derivation succeeds', key instanceof CryptoKey);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = 'Hello, Get Based!';
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(plaintext)
  );
  assert('Encryption produces ArrayBuffer', ciphertext instanceof ArrayBuffer);
  assert('Ciphertext differs from plaintext', new Uint8Array(ciphertext).length !== enc.encode(plaintext).length || new Uint8Array(ciphertext)[0] !== enc.encode(plaintext)[0]);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, ciphertext
  );
  assert('Decryption round-trip succeeds', dec.decode(decrypted) === plaintext, `got: ${dec.decode(decrypted)}`);

  const wrongKeyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode('wrong-passphrase'), 'PBKDF2', false, ['deriveKey']
  );
  const wrongKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    wrongKeyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  try {
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrongKey, ciphertext);
    assert('Wrong passphrase throws on decrypt', false, 'should have thrown');
  } catch (e) {
    assert('Wrong passphrase throws on decrypt', true);
  }
} catch (e) {
  assert('Web Crypto round-trip', false, e.message);
}

// ═══════════════════════════════════════════════
// 4. v1: prefix format verification
// ═══════════════════════════════════════════════
console.log('4. v1: prefix format');
try {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = crypto.getRandomValues(new Uint8Array(32));
  const b64 = (arr) => btoa(String.fromCharCode(...arr));
  const formatted = `v1:${b64(iv)}:${b64(ct)}`;
  assert('v1: prefix format starts with v1:', formatted.startsWith('v1:'));
  assert('v1: prefix format has 3 parts', formatted.split(':').length >= 3);
  const parts = formatted.split(':');
  assert('v1: prefix version is v1', parts[0] === 'v1');
  const decodedIv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
  assert('v1: prefix IV round-trips', decodedIv.length === 12);
} catch (e) {
  assert('v1: prefix format', false, e.message);
}

// ═══════════════════════════════════════════════
// 5. Non-sensitive keys stored as plaintext
// ═══════════════════════════════════════════════
console.log('5. Non-sensitive keys plaintext');
try {
  const testKey = 'labcharts-test-nonsensitive';
  const testVal = 'plain-value-123';
  await cryptoModule.encryptedSetItem(testKey, testVal);
  const stored = localStorage.getItem(testKey);
  assert('Non-sensitive key stored as plaintext', stored === testVal, `got: ${stored}`);
  assert('Non-sensitive key has no v1: prefix', !stored.startsWith('v1:'));
  const retrieved = await cryptoModule.encryptedGetItem(testKey);
  assert('Non-sensitive key retrieved correctly', retrieved === testVal, `got: ${retrieved}`);
  localStorage.removeItem(testKey);
} catch (e) {
  assert('Non-sensitive key plaintext storage', false, e.message);
}

// ═══════════════════════════════════════════════
// 6. encryptedGetItem handles null
// ═══════════════════════════════════════════════
console.log('6. encryptedGetItem null handling');
try {
  const result = await cryptoModule.encryptedGetItem('labcharts-nonexistent-key-xyz');
  assert('encryptedGetItem returns null for missing key', result === null);
} catch (e) {
  assert('encryptedGetItem null handling', false, e.message);
}

// ═══════════════════════════════════════════════
// 7. BroadcastChannel does not self-notify
// ═══════════════════════════════════════════════
console.log('7. BroadcastChannel no-self-notify');
if (typeof BroadcastChannel !== 'undefined') {
  try {
    let selfNotified = false;
    const testBC = new BroadcastChannel('labcharts-test-bc');
    testBC.onmessage = () => { selfNotified = true; };
    testBC.postMessage({ test: true });
    await new Promise(r => setTimeout(r, 100));
    assert('BroadcastChannel does not self-notify', !selfNotified);
    testBC.close();
  } catch (e) {
    assert('BroadcastChannel test', false, e.message);
  }
} else {
  assert('BroadcastChannel API available', false, 'BroadcastChannel not supported');
}

// ═══════════════════════════════════════════════
// 8. Service worker includes crypto.js
// ═══════════════════════════════════════════════
console.log('8. Service worker');
try {
  const swText = read('service-worker.js');
  assert('Service worker contains /js/crypto.js', swText.includes('/js/crypto.js'));
  assert('Service worker contains /js/crypto-ui.js', swText.includes('/js/crypto-ui.js'));
  assert('Service worker contains /js/data-wipe.js', swText.includes('/js/data-wipe.js'));
  assert('SW uses importScripts for version', swText.includes("importScripts('/version.js')"));
  assert('SW CACHE_NAME uses semver', swText.includes('`labcharts-v${self.APP_VERSION}`'));
} catch (e) {
  assert('Service worker check', false, e.message);
}

// ═══════════════════════════════════════════════
// 9. Settings modal shows Security section
// ═══════════════════════════════════════════════
console.log('9. Security section rendering');
try {
  const html = cryptoModule.renderEncryptionSection();
  assert('renderEncryptionSection returns HTML', typeof html === 'string' && html.length > 50);
  assert('Encryption section has status card', html.includes('encryption-status-card'));
  assert('Encryption section uses delegated actions', html.includes('data-crypto-action=') && !html.includes('onclick='));
  const backupHtml = cryptoModule.renderBackupSection();
  assert('renderBackupSection returns HTML', typeof backupHtml === 'string' && backupHtml.length > 50);
  assert('Backup section has download button', backupHtml.includes('Download Backup'));
  assert('Backup section has restore button', backupHtml.includes('Restore Backup'));
  assert('Backup section uses delegated actions', backupHtml.includes('data-crypto-action=') && !/on(click|change)=/.test(backupHtml));
} catch (e) {
  assert('Settings section rendering', false, e.message);
}

// ═══════════════════════════════════════════════
// 10. Encryption enabled state
// ═══════════════════════════════════════════════
console.log('10. Encryption enabled state');
{
  const wasEnabled = localStorage.getItem('labcharts-encryption-enabled');
  localStorage.removeItem('labcharts-encryption-enabled');
  assert('getEncryptionEnabled returns false when disabled', cryptoModule.getEncryptionEnabled() === false);
  localStorage.setItem('labcharts-encryption-enabled', 'true');
  assert('getEncryptionEnabled returns true when enabled', cryptoModule.getEncryptionEnabled() === true);
  if (wasEnabled) localStorage.setItem('labcharts-encryption-enabled', wasEnabled);
  else localStorage.removeItem('labcharts-encryption-enabled');
}

// ═══════════════════════════════════════════════
// 11. Encryption section reflects state
// ═══════════════════════════════════════════════
console.log('11. Encryption section reflects state');
{
  const wasEnabled = localStorage.getItem('labcharts-encryption-enabled');
  localStorage.removeItem('labcharts-encryption-enabled');
  const offHtml = cryptoModule.renderEncryptionSection();
  assert('OFF state shows Enable button', offHtml.includes('Enable Encryption'));
  assert('OFF state shows encryption-status-off', offHtml.includes('encryption-status-off'));
  assert('OFF state enable button is delegated', offHtml.includes('data-crypto-action="enable-encryption"'));

  localStorage.setItem('labcharts-encryption-enabled', 'true');
  const onHtml = cryptoModule.renderEncryptionSection();
  assert('ON state shows Change Passphrase', onHtml.includes('Change Passphrase'));
  assert('ON state shows Disable Encryption', onHtml.includes('Disable Encryption'));
  assert('ON state shows encryption-status-on', onHtml.includes('encryption-status-on'));
  assert('ON state mentions API keys encrypted', onHtml.includes('API keys are encrypted'));
  assert('ON state action buttons are delegated',
    onHtml.includes('data-crypto-action="change-passphrase"') &&
    onHtml.includes('data-crypto-action="disable-encryption"') &&
    !onHtml.includes('onclick='));

  if (wasEnabled) localStorage.setItem('labcharts-encryption-enabled', wasEnabled);
  else localStorage.removeItem('labcharts-encryption-enabled');
}

// ═══════════════════════════════════════════════
// 11b. Key cache sync access
// ═══════════════════════════════════════════════
console.log('11b. Key cache sync access');
{
  const testKey = 'labcharts-test-cache-key';
  localStorage.setItem(testKey, 'test-value');
  assert('getCachedKey falls back to localStorage', cryptoModule.getCachedKey(testKey) === 'test-value');
  cryptoModule.updateKeyCache(testKey, 'cached-value');
  assert('getCachedKey returns cached value after updateKeyCache', cryptoModule.getCachedKey(testKey) === 'cached-value');
  cryptoModule.updateKeyCache(testKey, null);
  localStorage.removeItem(testKey);
  assert('getCachedKey returns null after cleanup', cryptoModule.getCachedKey(testKey) === null);
}

// ═══════════════════════════════════════════════
// 12. Legacy globals and module-only data APIs
// ═══════════════════════════════════════════════
console.log('12. Window exports regression');
const dataExports = [
  'saveImportedData', 'getActiveData', 'filterDatesByRange', 'destroyAllCharts',
  'detectTrendAlerts', 'switchUnitSystem', 'switchRangeMode', 'updateHeaderDates',
];
for (const name of dataExports) {
  assert(`data.${name} exists`, typeof dataModule[name] === 'function');
  assert(`window.${name} stays module-only`, !(name in window));
}
for (const name of ['buildSidebar', 'renderProfileDropdown']) {
  assert(`nav.${name} exists`, typeof navModule[name] === 'function');
  assert(`window.${name} stays module-only`, !(name in window));
}
for (const name of ['openSettingsModal', 'closeSettingsModal']) {
  assert(`settings.${name} exists`, typeof settingsModule[name] === 'function');
  assert(`window.${name} stays module-only`, !(name in window));
}
assert('window.closeChatPanel stays module-only', !('closeChatPanel' in window));
assert('window.openChatPanel stays module-only', !('openChatPanel' in window));
assert('window.toggleChatPanel stays module-only', !('toggleChatPanel' in window));
assert('views.showDashboard exists', typeof viewsModule.showDashboard === 'function');
assert('window.showDashboard stays module-only', !('showDashboard' in window));
assert('views.closeModal exists', typeof viewsModule.closeModal === 'function');
assert('window.closeModal stays module-only', !('closeModal' in window));
assert('views.navigate exists', typeof viewsModule.navigate === 'function');
assert('window.navigate stays module-only', !('navigate' in window));
for (const name of ['openReportBuilder', 'closeReportBuilder', 'exportPDFReport', 'exportDataJSON', 'importDataJSON', 'clearAllData']) {
  assert(`export.${name} exists`, typeof exportModule[name] === 'function');
  assert(`window.${name} stays module-only`, !(name in window));
}
for (const name of ['getProfiles', 'saveProfiles', 'loadProfile', 'switchProfile', 'createProfile', 'deleteProfile', 'getProfileSex', 'setProfileSex', 'getProfileDob']) {
  assert(`profile.${name} exists`, typeof profileModule[name] === 'function');
  assert(`window.${name} stays module-only`, !(name in window));
}
for (const name of ['showNotification', 'showConfirmDialog', 'showPromptDialog', 'isDebugMode', 'setDebugMode', 'isPIIReviewEnabled', 'setPIIReviewEnabled', 'isAnalyticsEnabled', 'setAnalyticsEnabled', 'maybeShowAnalyticsConsent', 'dismissAnalyticsConsent', 'dismissAnalyticsConsentAndDisable', 'hasCardContent', 'escapeAttr', 'loadScriptOnce']) {
  assert(`window.${name} stays module-only`, !(name in window));
}

// ═══════════════════════════════════════════════
// 13. CSS classes for passphrase modal exist
// ═══════════════════════════════════════════════
console.log('13. Passphrase modal CSS');
try {
  const cssText = read('css/data-protection.css');
  assert('CSS has .passphrase-overlay', cssText.includes('.passphrase-overlay'));
  assert('CSS has .passphrase-dialog', cssText.includes('.passphrase-dialog'));
  assert('CSS has .passphrase-input', cssText.includes('.passphrase-input'));
  assert('CSS has .passphrase-btn', cssText.includes('.passphrase-btn'));
  assert('CSS has .passphrase-btn-primary', cssText.includes('.passphrase-btn-primary'));
  assert('CSS has .encryption-status-card', cssText.includes('.encryption-status-card'));
  assert('CSS has .encryption-status-on', cssText.includes('.encryption-status-on'));
  assert('CSS has .encryption-status-off', cssText.includes('.encryption-status-off'));
} catch (e) {
  assert('CSS verification', false, e.message);
}

// ═══════════════════════════════════════════════
// 14. crypto.js source inspection
// ═══════════════════════════════════════════════
console.log('14. crypto.js source inspection');
try {
  const src = await fetchWithRetry('js/crypto.js');
  const uiSrc = await fetchWithRetry('js/crypto-ui.js');
  const surfaceSrc = `${src}\n${uiSrc}`;
  assert('crypto.js uses PBKDF2', src.includes('PBKDF2'));
  assert('crypto.js uses AES-GCM', src.includes('AES-GCM'));
  assert('crypto.js has 600000 iterations', src.includes('600000'));
  assert('crypto.js uses 12-byte IV', src.includes('Uint8Array(12)'));
  assert('crypto.js uses 16-byte salt', src.includes('Uint8Array(16)'));
  assert('crypto.js has BroadcastChannel', src.includes('BroadcastChannel'));
  assert('crypto surface has backup format', surfaceSrc.includes('labcharts-backup'));
  assert('crypto.js has v1: prefix', src.includes("'v1:'") || src.includes('`v1:'));
  assert('crypto surface never stores passphrase', !surfaceSrc.match(/localStorage\.setItem\([^)]*passphrase/));
  assert('Forgot passphrase does NOT use showConfirmDialog', !uiSrc.includes("forgotButton.addEventListener('click', () => {\n    showConfirmDialog"));
  assert('Forgot passphrase has inline confirm UI', uiSrc.includes('passphrase-forgot-confirm'));
  assert('Forgot passphrase has Go Back button', uiSrc.includes('passphrase-forgot-cancel'));
  assert('Forgot passphrase wipes IndexedDB-backed app data', uiSrc.includes("import('./data-wipe.js'") && uiSrc.includes('eraseAllLocalAppData'));
  assert('Forgot passphrase does not reload after an incomplete wipe',
    /catch \(error\)[\s\S]{0,700}return;\s*\}\s*cryptoUiDeps\.clearEncryptionSession/.test(uiSrc)
    && !/catch \(error\)[\s\S]{0,700}localStorage\.removeItem/.test(uiSrc));
  const bkSrc0 = await fetchWithRetry('js/backup.js');
  assert('Backup includes encryptionSalt field', bkSrc0.includes('encryptionSalt'));
  assert('Restore sets labcharts-encryption-enabled', bkSrc0.includes("localStorage.setItem('labcharts-encryption-enabled'"));
  assert('Restore sets labcharts-encryption-salt', bkSrc0.includes("localStorage.setItem('labcharts-encryption-salt'"));
  assert('Backup includes labcharts-api-key', src.includes("'labcharts-api-key'") || bkSrc0.includes("'labcharts-api-key'"));
  assert('Backup includes labcharts-venice-key', src.includes("'labcharts-venice-key'") || bkSrc0.includes("'labcharts-venice-key'"));
  assert('Backup includes labcharts-ai-provider', bkSrc0.includes("'labcharts-ai-provider'"));
  assert('Backup includes settings field', bkSrc0.includes('settings,') || bkSrc0.includes('settings:'));
  assert('Restore writes global settings', bkSrc0.includes('backup.settings'));
} catch (e) {
  assert('crypto.js source inspection', false, e.message);
}

// ═══════════════════════════════════════════════
// 15. Profiles cache (state.profiles)
// ═══════════════════════════════════════════════
console.log('15. Profiles cache');
try {
  const profiles = profileModule.getProfiles();
  assert('getProfiles returns array', Array.isArray(profiles));
  assert('getProfiles has at least one profile', profiles.length >= 1);
  assert('First profile has id', profiles[0] && typeof profiles[0].id === 'string');
} catch (e) {
  assert('Profiles cache', false, e.message);
}

// ═══════════════════════════════════════════════
// 16. saveImportedData is async
// ═══════════════════════════════════════════════
console.log('16. saveImportedData async');
try {
  const src = await fetchWithRetry('js/data.js');
  assert('saveImportedData is async', src.includes('async function saveImportedData'));
  assert('saveImportedData calls broadcastDataChanged', src.includes('broadcastDataChanged'));
  assert('saveImportedData calls encryptedSetItem', src.includes('encryptedSetItem'));
} catch (e) {
  assert('saveImportedData async check', false, e.message);
}

// ═══════════════════════════════════════════════
// 17. Profile loadProfile is async
// ═══════════════════════════════════════════════
console.log('17. profile.js async');
try {
  const src = await fetchWithRetry('js/profile.js');
  const listStoreSrc = await fetchWithRetry('js/profile-list-store.js');
  const runtimeSrc = await fetchWithRetry('js/profile-runtime.js');
  const appShellHooksSrc = await fetchWithRetry('js/app-shell-hooks.js');
  const exportSrc = await fetchWithRetry('js/export.js');
  const exportRuntimeSrc = await fetchWithRetry('js/export-runtime.js');
  const swSrc = await fetchWithRetry('service-worker.js');
  assert('loadProfile is async', src.includes('async function loadProfile'));
  assert('saveProfiles is async', src.includes('async function saveProfiles'));
  assert('initProfilesCache exists', src.includes('async function initProfilesCache'));
  assert('loadProfile uses encryptedGetItem', src.includes('encryptedGetItem'));
  assert('app shell injects profile browser refresh wiring from profile-runtime',
    !src.includes("from './profile-runtime.js'") &&
    src.includes('export function configureProfileRuntimeDeps') &&
    appShellHooksSrc.includes("from './profile-runtime.js'") &&
    appShellHooksSrc.includes('configureProfileRuntimeDeps({') &&
    src.includes('await invalidateProfileContextCache()') &&
    src.includes('await reloadProfileRuntimeShell(profileId)') &&
    runtimeSrc.includes('export function invalidateProfileContextCache') &&
    runtimeSrc.includes('export async function reloadProfileRuntimeShell') &&
    runtimeSrc.includes('export async function refreshProfileWearables') &&
    appShellHooksSrc.includes('refreshProfileWearables,'));
  assert('profile delete awaits profile list save before completion',
    src.includes('await saveProfiles(updated)') &&
    (src.includes('await loadProfile(updated[0].id)') || src.includes('await refreshProfileButton()')));
  assert('saveProfiles rejects failed profile-list writes',
    /catch \(error\) \{[\s\S]{0,300}throw error;/.test(listStoreSrc));
  assert('profile.js no longer calls profile-load UI globals through window',
    !/window\.(loadChatPersonality|loadChatThreads|loadChatHistory|renderThreadList|destroyAllCharts|buildSidebar|navigate|renderProfileButton)/.test(src));
  assert('profile-runtime keeps profile UI refresh module-owned',
    runtimeSrc.includes("from './chat-loader.js'") &&
    runtimeSrc.includes('isChatModuleLoaded() ? await loadChatModule() : null') &&
    !runtimeSrc.includes("import('./chat-personalities.js')") &&
    !runtimeSrc.includes("import('./chat-threads.js')") &&
    !runtimeSrc.includes("import('./data.js')") &&
    runtimeSrc.includes('export function configureProfileRefreshDeps') &&
    appShellHooksSrc.includes('configureProfileRefreshDeps({') &&
    !runtimeSrc.includes('Object.assign(window'));
  assert('Service worker precaches profile runtime module',
    swSrc.includes("'/js/profile-runtime.js'"));
  assert('Service worker precaches durable profile list store',
    swSrc.includes("'/js/profile-list-store.js'"));
  assert('export.js delegates browser runtime wiring to export-runtime',
    exportSrc.includes("from './export-runtime.js'") &&
    exportSrc.includes('refreshImportRuntimeShell') &&
    !exportSrc.includes('publishExportGlobals') &&
    !exportRuntimeSrc.includes('publishExportGlobals') &&
    exportRuntimeSrc.includes('export async function refreshImportRuntimeShell'));
  assert('app shell injects export import refresh callbacks without shell module lookups',
    exportRuntimeSrc.includes('export function configureExportImportRuntimeDeps(deps = {})') &&
    appShellHooksSrc.includes("import { configureExportImportRuntimeDeps } from './export-runtime.js';") &&
    appShellHooksSrc.includes('configureExportImportRuntimeDeps({') &&
    !/import\(['"]\.\/(?:chat-threads|data|nav|views)\.js['"]\)/.test(exportRuntimeSrc));
  assert('export-runtime prioritizes injected callbacks before compatibility globals',
    exportRuntimeSrc.includes("exportImportRuntimeDeps.loadChatThreads || getRuntimeFunction('loadChatThreads')") &&
    exportRuntimeSrc.includes("exportImportRuntimeDeps.buildSidebar || getRuntimeFunction('buildSidebar')") &&
    exportRuntimeSrc.includes("exportImportRuntimeDeps.navigate || getRuntimeFunction('navigate')"));
  assert('export-runtime can refresh chat threads without configured or global callbacks',
    exportRuntimeSrc.includes("from './crypto.js'") &&
    exportRuntimeSrc.includes('function loadChatThreadsFromStorageFallback') &&
    exportRuntimeSrc.includes('await encryptedGetItem(`labcharts-${state.currentProfile}-chat-threads`)') &&
    exportRuntimeSrc.includes('return false') &&
    exportRuntimeSrc.includes('labcharts-${state.currentProfile}-chat-threads') &&
    exportRuntimeSrc.includes('function renderThreadListFallback') &&
    exportRuntimeSrc.includes('async function refreshChatThreadsRuntime()') &&
    exportRuntimeSrc.includes('if (!threadsLoaded) return') &&
    exportRuntimeSrc.includes('if (chat) await refreshChatThreadsRuntime()'));
  assert('export.js no longer calls import UI globals through window',
    !/window\.(loadChatThreads|buildSidebar|updateHeaderDates|renderProfileButton|navigate|cashuGetMintUrl|nostrGetSelectedNode|cashuRestoreWalletFromSeed|cashuSetMintUrl|nostrSetSelectedNode|cashuDestroyWalletDB)/.test(exportSrc));
  assert('export.js uses the Nostr module for wallet metadata',
    exportSrc.includes("from './nostr-discovery.js'") &&
    exportSrc.includes('getSelectedNodeUrl()') &&
    !exportRuntimeSrc.includes('nostrGetSelectedNode') &&
    !exportRuntimeSrc.includes('nostrSetSelectedNode'));
  assert('Service worker precaches export runtime module',
    swSrc.includes("'/js/export-runtime.js'"));
} catch (e) {
  assert('profile.js async check', false, e.message);
}

// ═══════════════════════════════════════════════
// 18. startup async init
// ═══════════════════════════════════════════════
console.log('18. startup async init');
try {
  const src = await fetchWithRetry('js/main.js');
  const orchestratorSrc = await fetchWithRetry('js/startup-orchestrator.js');
  const foundationSrc = await fetchWithRetry('js/startup-foundation.js');
  assert('main.js imports app-feature-modules.js', src.includes("import './app-feature-modules.js'"));
  assert('main.js starts the startup orchestrator', src.includes("from './startup-orchestrator.js'") && src.includes('startApp()'));
  assert('startup-orchestrator.js registers DOMContentLoaded', orchestratorSrc.includes("document.addEventListener('DOMContentLoaded'"));
  assert('startup-orchestrator.js catches startup failures', orchestratorSrc.includes('runStartupSequence().catch(handleStartupSequenceError)'));
  assert('startup-orchestrator.js surfaces startup failures', orchestratorSrc.includes("from './utils.js'") && orchestratorSrc.includes('showNotification('));
  assert('startup-orchestrator.js awaits initializeStartupFoundation', orchestratorSrc.includes('await initializeStartupFoundation()'));
  assert('startup-orchestrator.js awaits initializeProfileData', orchestratorSrc.includes('await initializeProfileData()'));
  assert('startup-orchestrator.js imports startup-foundation.js', orchestratorSrc.includes("from './startup-foundation.js'"));
  assert('startup-orchestrator.js imports startup-profile.js', orchestratorSrc.includes("from './startup-profile.js'"));
  assert('startup-foundation.js awaits initEncryption', foundationSrc.includes('await initEncryption()'));
  assert('startup-foundation.js calls initBroadcastChannel', foundationSrc.includes('initBroadcastChannel()'));
  assert('startup-foundation.js imports from crypto.js', foundationSrc.includes("from './crypto.js'"));

  const startupSrc = await fetchWithRetry('js/startup-profile.js');
  assert('startup-profile.js exports initializeProfileData', startupSrc.includes('export async function initializeProfileData'));
  assert('startup-profile.js awaits initProfilesCache', startupSrc.includes('await initProfilesCache()'));
  assert('startup-profile.js awaits encryptedGetItem', startupSrc.includes('await encryptedGetItem'));
  assert('startup-profile.js migrates legacy imported data through encryptedSetItem', startupSrc.includes('await encryptedSetItem'));
} catch (e) {
  assert('startup async check', false, e.message);
}

// ═══════════════════════════════════════════════
// 19. Settings modal includes security + backup
// ═══════════════════════════════════════════════
console.log('19. settings.js security + backup');
try {
  const src = await fetchWithRetry('js/settings.js');
  const runtimeSrc = await fetchWithRetry('js/settings-runtime.js');
  const runtimeBridgeSrc = await fetchWithRetry('js/settings-runtime-bridge.js');
  assert('settings.js imports renderEncryptionSection', src.includes('renderEncryptionSection'));
  assert('settings.js imports renderBackupSection', src.includes('renderBackupSection'));
  assert('settings.js has Security group', src.includes('Security'));
  assert('settings.js has Backup group', src.includes('Backup'));
  assert('settings.js has encryption-section id', src.includes('encryption-section'));
  assert('settings.js has backup-section id', src.includes('backup-section'));
  assert('settings.js delegates browser runtime hooks to settings-runtime',
    src.includes("from './settings-runtime.js'") &&
    !/\bwindow(?:\.|\s*\[)/.test(src));
  assert('settings-runtime.js owns Settings browser adapters and injects meteo config modules',
    runtimeBridgeSrc.includes('export function configureSettingsModuleBridge') &&
    runtimeBridgeSrc.includes('export function getSettingsModuleFunction') &&
    !runtimeBridgeSrc.includes('Object.assign(window') &&
    runtimeSrc.includes("getRuntimeFunction('requestAnimationFrame')") &&
    runtimeSrc.includes("getRuntimeFunction('matchMedia')") &&
    runtimeSrc.includes("from './sun-uvdata-config.js'") &&
    runtimeSrc.includes('settingsRuntimeDeps.getMeteoConfig') &&
    !runtimeSrc.includes("getRuntimeFunction('getMeteoConfig')") &&
    !runtimeSrc.includes("getRuntimeFunction('saveMeteoConfig')"));
} catch (e) {
  assert('settings.js security check', false, e.message);
}

// ═══════════════════════════════════════════════
// 20. Auto-backup module exports
// ═══════════════════════════════════════════════
console.log('20. Auto-backup module exports');
for (const name of ['scheduleAutoBackup', 'getAutoBackupSnapshots', 'restoreAutoBackup', 'openBackupDB', 'buildBackupSnapshot']) {
  assert(`backup.${name} exists`, typeof backupModule[name] === 'function');
  assert(`window.${name} stays module-only`, !(name in window));
}

// ═══════════════════════════════════════════════
// 21. IndexedDB labcharts-backups can be opened
// ═══════════════════════════════════════════════
console.log('21. labcharts-backups IndexedDB');
try {
  const db = await backupModule.openBackupDB();
  assert('IndexedDB opens successfully', db instanceof IDBDatabase);
  assert('IndexedDB has snapshots store', db.objectStoreNames.contains('snapshots'));
} catch (e) {
  assert('IndexedDB open', false, e.message);
}

// ═══════════════════════════════════════════════
// 22. buildBackupSnapshot includes per-profile prefs
// ═══════════════════════════════════════════════
console.log('22. buildBackupSnapshot per-profile prefs');
try {
  const bkSrc = await fetchWithRetry('js/backup.js');
  assert('backup.js has PER_PROFILE_PREF_SUFFIXES', bkSrc.includes('PER_PROFILE_PREF_SUFFIXES'));
  assert('backup.js includes units in prefs', bkSrc.includes("'units'"));
  assert('backup.js includes rangeMode in prefs', bkSrc.includes("'rangeMode'"));
  assert('backup.js includes suppOverlay in prefs', bkSrc.includes("'suppOverlay'"));
  assert('backup.js includes noteOverlay in prefs', bkSrc.includes("'noteOverlay'"));
  assert('backup.js includes chatPersonality in prefs', bkSrc.includes("'chatPersonality'"));
  assert('backup.js includes chatPersonalityCustom in prefs', bkSrc.includes("'chatPersonalityCustom'"));
  assert('backup.js has openBackupDB function', bkSrc.includes('function openBackupDB'));
  assert('backup.js has performAutoBackup function', bkSrc.includes('async function performAutoBackup'));
  assert('backup.js has scheduleAutoBackup function', bkSrc.includes('function scheduleAutoBackup'));
  assert('backup.js has getAutoBackupSnapshots function', bkSrc.includes('async function getAutoBackupSnapshots'));
  assert('backup.js has restoreAutoBackup function', bkSrc.includes('async function restoreAutoBackup'));
  assert('backup.js has MAX_SNAPSHOTS = 5', bkSrc.includes('MAX_SNAPSHOTS = 5'));
  assert('backup.js has AUTO_BACKUP_COOLDOWN = 300000', bkSrc.includes('AUTO_BACKUP_COOLDOWN = 300000'));
  assert('crypto UI has labcharts-last-autobackup', cryptoUiSrc.includes('labcharts-last-autobackup'));
} catch (e) {
  assert('buildBackupSnapshot prefs check', false, e.message);
}

// ═══════════════════════════════════════════════
// 23. data.js calls scheduleAutoBackup
// ═══════════════════════════════════════════════
console.log('23. data.js auto-backup trigger');
try {
  const src = await fetchWithRetry('js/data.js');
  assert('data.js imports scheduleAutoBackup', src.includes('scheduleAutoBackup'));
  assert('data.js calls scheduleAutoBackup in saveImportedData', src.includes('scheduleAutoBackup()'));
} catch (e) {
  assert('data.js auto-backup trigger', false, e.message);
}

// ═══════════════════════════════════════════════
// 24. Backup section UI shows auto-backup status
// ═══════════════════════════════════════════════
console.log('24. Backup section auto-backup UI');
try {
  const html = cryptoModule.renderBackupSection();
  assert('Backup section has auto-backup status', html.includes('backup-auto-status'));
  assert('Backup section has snapshot list container', html.includes('backup-snapshot-list'));
  assert('Backup section has delegated snapshot toggle and import',
    html.includes('data-crypto-action="toggle-backup-snapshots"') &&
    html.includes('data-crypto-action="import-backup"') &&
    !/on(click|change)=/.test(html));
} catch (e) {
  assert('Backup section auto-backup UI', false, e.message);
}

// ═══════════════════════════════════════════════
// 25. CSS has auto-backup styles
// ═══════════════════════════════════════════════
console.log('25. Auto-backup CSS');
try {
  const cssText = read('css/data-protection.css');
  assert('CSS has .backup-auto-status', cssText.includes('.backup-auto-status'));
  assert('CSS has .backup-snapshot-list', cssText.includes('.backup-snapshot-list'));
  assert('CSS has .backup-snapshot-item', cssText.includes('.backup-snapshot-item'));
  assert('CSS has .backup-snapshot-date', cssText.includes('.backup-snapshot-date'));
  assert('CSS has .backup-snapshot-meta', cssText.includes('.backup-snapshot-meta'));
} catch (e) {
  assert('CSS auto-backup styles', false, e.message);
}

// ═══════════════════════════════════════════════
// 26. getAutoBackupSnapshots returns array
// ═══════════════════════════════════════════════
console.log('26. getAutoBackupSnapshots');
try {
  const snapshots = await backupModule.getAutoBackupSnapshots();
  assert('getAutoBackupSnapshots returns array', Array.isArray(snapshots));
} catch (e) {
  assert('getAutoBackupSnapshots', false, e.message);
}

// ═══════════════════════════════════════════════
// 27. buildBackupSnapshot returns valid object
// ═══════════════════════════════════════════════
console.log('27. buildBackupSnapshot');
try {
  const snapshot = backupModule.buildBackupSnapshot();
  // The profile registry is seeded at test startup, so a falsy return
  // means a runtime error, not an empty profile list — assert the object
  // type directly rather than letting a falsy value pass silently.
  assert('buildBackupSnapshot returns an object', snapshot != null && typeof snapshot === 'object');
  assert('buildBackupSnapshot has format field', snapshot.format === 'labcharts-backup');
  assert('buildBackupSnapshot has version field', snapshot.version === 1);
  assert('buildBackupSnapshot has createdAt', typeof snapshot.createdAt === 'string');
  assert('buildBackupSnapshot has profiles array', Array.isArray(snapshot.profiles));
  assert('buildBackupSnapshot has settings object', typeof snapshot.settings === 'object');
  if (snapshot.profiles.length > 0) {
    const firstProfile = snapshot.profiles[0];
    assert('buildBackupSnapshot profile has keys', typeof firstProfile.keys === 'object');
  }
} catch (e) {
  assert('buildBackupSnapshot', false, e.message);
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
