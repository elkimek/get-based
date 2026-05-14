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

// Load the app module surface so the Object.assign(window, …) blocks run and
// the window-export checks below resolve.
await import('../js/state.js');
await import('../js/crypto.js');
await import('../js/pii.js');
await import('../js/data.js');
await import('../js/profile.js');
await import('../js/nav.js');
await import('../js/views.js');
await import('../js/export.js');
await import('../js/settings.js');
await import('../js/chat.js');
await import('../js/utils.js');
await import('../js/backup.js');

// Seed a minimal profile registry — the app bootstraps one via
// initProfilesCache() on page load; in Node we seed it so the section-15
// getProfiles() check has something to read.
if (!localStorage.getItem('labcharts-profiles')) {
  localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'default', name: 'Test Profile' }]));
}
if (typeof window.initProfilesCache === 'function') await window.initProfilesCache();

// ═══════════════════════════════════════════════
// 1. Module & window exports exist
// ═══════════════════════════════════════════════
console.log('1. Module & window exports');
assert('window.initEncryption exists', typeof window.initEncryption === 'function');
assert('window.initBroadcastChannel exists', typeof window.initBroadcastChannel === 'function');
assert('window.getEncryptionEnabled exists', typeof window.getEncryptionEnabled === 'function');
assert('window.isUnlocked exists', typeof window.isUnlocked === 'function');
assert('window.encryptedSetItem exists', typeof window.encryptedSetItem === 'function');
assert('window.encryptedGetItem exists', typeof window.encryptedGetItem === 'function');
assert('window.showEnableEncryptionModal exists', typeof window.showEnableEncryptionModal === 'function');
assert('window.disableEncryption exists', typeof window.disableEncryption === 'function');
assert('window.changePassphrase exists', typeof window.changePassphrase === 'function');
assert('window.exportEncryptedBackup exists', typeof window.exportEncryptedBackup === 'function');
assert('window.importEncryptedBackup exists', typeof window.importEncryptedBackup === 'function');
assert('window.broadcastDataChanged exists', typeof window.broadcastDataChanged === 'function');
assert('window.renderEncryptionSection exists', typeof window.renderEncryptionSection === 'function');
assert('window.renderBackupSection exists', typeof window.renderBackupSection === 'function');
assert('window.isSensitiveKey exists', typeof window.isSensitiveKey === 'function');
assert('window.getCachedKey exists', typeof window.getCachedKey === 'function');
assert('window.updateKeyCache exists', typeof window.updateKeyCache === 'function');
assert('window.decryptKeyCache exists', typeof window.decryptKeyCache === 'function');
assert('window.initProfilesCache exists', typeof window.initProfilesCache === 'function');

// ═══════════════════════════════════════════════
// 2. Sensitive key detection
// ═══════════════════════════════════════════════
console.log('2. Sensitive key detection');
assert('labcharts-default-imported is sensitive', window.isSensitiveKey('labcharts-default-imported'));
assert('labcharts-abc123-imported is sensitive', window.isSensitiveKey('labcharts-abc123-imported'));
assert('labcharts-default-chat is sensitive', window.isSensitiveKey('labcharts-default-chat'));
assert('labcharts-profiles is sensitive', window.isSensitiveKey('labcharts-profiles'));
assert('labcharts-api-key IS sensitive', window.isSensitiveKey('labcharts-api-key'));
assert('labcharts-venice-key IS sensitive', window.isSensitiveKey('labcharts-venice-key'));
assert('labcharts-openrouter-key IS sensitive', window.isSensitiveKey('labcharts-openrouter-key'));
assert('labcharts-ollama IS sensitive', window.isSensitiveKey('labcharts-ollama'));
assert('labcharts-ai-provider is NOT sensitive', !window.isSensitiveKey('labcharts-ai-provider'));
assert('labcharts-default-units is NOT sensitive', !window.isSensitiveKey('labcharts-default-units'));
assert('labcharts-encryption-enabled is NOT sensitive', !window.isSensitiveKey('labcharts-encryption-enabled'));
assert('labcharts-time-format is NOT sensitive', !window.isSensitiveKey('labcharts-time-format'));
assert('labcharts-default-focusCard is NOT sensitive', !window.isSensitiveKey('labcharts-default-focusCard'));

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
  await window.encryptedSetItem(testKey, testVal);
  const stored = localStorage.getItem(testKey);
  assert('Non-sensitive key stored as plaintext', stored === testVal, `got: ${stored}`);
  assert('Non-sensitive key has no v1: prefix', !stored.startsWith('v1:'));
  const retrieved = await window.encryptedGetItem(testKey);
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
  const result = await window.encryptedGetItem('labcharts-nonexistent-key-xyz');
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
  const html = window.renderEncryptionSection();
  assert('renderEncryptionSection returns HTML', typeof html === 'string' && html.length > 50);
  assert('Encryption section has status card', html.includes('encryption-status-card'));
  const backupHtml = window.renderBackupSection();
  assert('renderBackupSection returns HTML', typeof backupHtml === 'string' && backupHtml.length > 50);
  assert('Backup section has download button', backupHtml.includes('Download Backup'));
  assert('Backup section has restore button', backupHtml.includes('Restore Backup'));
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
  assert('getEncryptionEnabled returns false when disabled', window.getEncryptionEnabled() === false);
  localStorage.setItem('labcharts-encryption-enabled', 'true');
  assert('getEncryptionEnabled returns true when enabled', window.getEncryptionEnabled() === true);
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
  const offHtml = window.renderEncryptionSection();
  assert('OFF state shows Enable button', offHtml.includes('Enable Encryption'));
  assert('OFF state shows encryption-status-off', offHtml.includes('encryption-status-off'));

  localStorage.setItem('labcharts-encryption-enabled', 'true');
  const onHtml = window.renderEncryptionSection();
  assert('ON state shows Change Passphrase', onHtml.includes('Change Passphrase'));
  assert('ON state shows Disable Encryption', onHtml.includes('Disable Encryption'));
  assert('ON state shows encryption-status-on', onHtml.includes('encryption-status-on'));
  assert('ON state mentions API keys encrypted', onHtml.includes('API keys are encrypted'));

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
  assert('getCachedKey falls back to localStorage', window.getCachedKey(testKey) === 'test-value');
  window.updateKeyCache(testKey, 'cached-value');
  assert('getCachedKey returns cached value after updateKeyCache', window.getCachedKey(testKey) === 'cached-value');
  window.updateKeyCache(testKey, null);
  localStorage.removeItem(testKey);
  assert('getCachedKey returns null after cleanup', window.getCachedKey(testKey) === null);
}

// ═══════════════════════════════════════════════
// 12. All existing window exports still present (regression)
// ═══════════════════════════════════════════════
console.log('12. Window exports regression');
const expectedExports = [
  // data.js
  'saveImportedData', 'getActiveData', 'filterDatesByRange', 'destroyAllCharts',
  'detectTrendAlerts', 'switchUnitSystem', 'switchRangeMode', 'updateHeaderDates',
  // profile.js
  'getProfiles', 'saveProfiles', 'loadProfile', 'switchProfile', 'createProfile',
  'deleteProfile', 'getProfileSex', 'setProfileSex', 'getProfileDob',
  // nav.js
  'buildSidebar', 'renderProfileDropdown',
  // views.js
  'navigate', 'showDashboard',
  // export.js
  'exportPDFReport', 'exportDataJSON', 'importDataJSON', 'clearAllData',
  // settings.js
  'openSettingsModal', 'closeSettingsModal',
  // chat.js
  'toggleChatPanel', 'closeChatPanel',
  // utils.js
  'showNotification', 'showConfirmDialog',
];
for (const name of expectedExports) {
  assert(`window.${name} exists`, typeof window[name] === 'function', `typeof: ${typeof window[name]}`);
}

// ═══════════════════════════════════════════════
// 13. CSS classes for passphrase modal exist
// ═══════════════════════════════════════════════
console.log('13. Passphrase modal CSS');
try {
  const cssText = read('styles.css');
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
  assert('crypto.js uses PBKDF2', src.includes('PBKDF2'));
  assert('crypto.js uses AES-GCM', src.includes('AES-GCM'));
  assert('crypto.js has 600000 iterations', src.includes('600000'));
  assert('crypto.js uses 12-byte IV', src.includes('Uint8Array(12)'));
  assert('crypto.js uses 16-byte salt', src.includes('Uint8Array(16)'));
  assert('crypto.js has BroadcastChannel', src.includes('BroadcastChannel'));
  assert('crypto.js has backup format', src.includes('labcharts-backup'));
  assert('crypto.js has v1: prefix', src.includes("'v1:'") || src.includes('`v1:'));
  assert('crypto.js never stores passphrase', !src.includes('localStorage') || (!src.includes('setItem') && !src.includes('passphrase')) || !src.match(/localStorage\.setItem\([^)]*passphrase/));
  assert('Forgot passphrase does NOT use showConfirmDialog', !src.includes("forgotBtn.addEventListener('click', () => {\n    showConfirmDialog"));
  assert('Forgot passphrase has inline confirm UI', src.includes('passphrase-forgot-confirm'));
  assert('Forgot passphrase has Go Back button', src.includes('passphrase-forgot-cancel'));
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
  const profiles = window.getProfiles();
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
  assert('loadProfile is async', src.includes('async function loadProfile'));
  assert('saveProfiles is async', src.includes('async function saveProfiles'));
  assert('initProfilesCache exists', src.includes('async function initProfilesCache'));
  assert('loadProfile uses encryptedGetItem', src.includes('encryptedGetItem'));
} catch (e) {
  assert('profile.js async check', false, e.message);
}

// ═══════════════════════════════════════════════
// 18. main.js async init
// ═══════════════════════════════════════════════
console.log('18. main.js async init');
try {
  const src = await fetchWithRetry('js/main.js');
  assert('DOMContentLoaded is async', src.includes('async ()'));
  assert('main.js awaits initEncryption', src.includes('await initEncryption()'));
  assert('main.js calls initBroadcastChannel', src.includes('initBroadcastChannel()'));
  assert('main.js awaits initProfilesCache', src.includes('await initProfilesCache()'));
  assert('main.js awaits encryptedGetItem', src.includes('await encryptedGetItem'));
  assert('main.js imports from crypto.js', src.includes("from './crypto.js'"));
} catch (e) {
  assert('main.js async check', false, e.message);
}

// ═══════════════════════════════════════════════
// 19. Settings modal includes security + backup
// ═══════════════════════════════════════════════
console.log('19. settings.js security + backup');
try {
  const src = await fetchWithRetry('js/settings.js');
  assert('settings.js imports renderEncryptionSection', src.includes('renderEncryptionSection'));
  assert('settings.js imports renderBackupSection', src.includes('renderBackupSection'));
  assert('settings.js has Security group', src.includes('Security'));
  assert('settings.js has Backup group', src.includes('Backup'));
  assert('settings.js has encryption-section id', src.includes('encryption-section'));
  assert('settings.js has backup-section id', src.includes('backup-section'));
} catch (e) {
  assert('settings.js security check', false, e.message);
}

// ═══════════════════════════════════════════════
// 20. Auto-backup window exports
// ═══════════════════════════════════════════════
console.log('20. Auto-backup window exports');
assert('window.scheduleAutoBackup exists', typeof window.scheduleAutoBackup === 'function');
assert('window.getAutoBackupSnapshots exists', typeof window.getAutoBackupSnapshots === 'function');
assert('window.restoreAutoBackup exists', typeof window.restoreAutoBackup === 'function');
assert('window.openBackupDB exists', typeof window.openBackupDB === 'function');
assert('window.buildBackupSnapshot exists', typeof window.buildBackupSnapshot === 'function');
assert('window.loadBackupSnapshots exists', typeof window.loadBackupSnapshots === 'function');

// ═══════════════════════════════════════════════
// 21. IndexedDB labcharts-backups can be opened
// ═══════════════════════════════════════════════
console.log('21. labcharts-backups IndexedDB');
try {
  const db = await window.openBackupDB();
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
  const cryptoSrc = await fetchWithRetry('js/crypto.js');
  assert('crypto.js has labcharts-last-autobackup', cryptoSrc.includes('labcharts-last-autobackup'));
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
  const html = window.renderBackupSection();
  assert('Backup section has auto-backup status', html.includes('backup-auto-status'));
  assert('Backup section has snapshot list container', html.includes('backup-snapshot-list'));
} catch (e) {
  assert('Backup section auto-backup UI', false, e.message);
}

// ═══════════════════════════════════════════════
// 25. CSS has auto-backup styles
// ═══════════════════════════════════════════════
console.log('25. Auto-backup CSS');
try {
  const cssText = read('styles.css');
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
  const snapshots = await window.getAutoBackupSnapshots();
  assert('getAutoBackupSnapshots returns array', Array.isArray(snapshots));
} catch (e) {
  assert('getAutoBackupSnapshots', false, e.message);
}

// ═══════════════════════════════════════════════
// 27. buildBackupSnapshot returns valid object
// ═══════════════════════════════════════════════
console.log('27. buildBackupSnapshot');
try {
  const snapshot = window.buildBackupSnapshot();
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
