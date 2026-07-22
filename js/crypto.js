// @ts-check
// crypto.js — Encryption at rest, backup/restore, cross-tab sync

import { state } from './state.js';
import { showNotification, showConfirmDialog, escapeAttr, escapeHTML } from './utils.js';
import { profileStorageKey } from './profile.js';
import { getBlob, setBlob, deleteBlob, shouldUseBlob } from './blob-storage.js';
import { ensureImportedArray } from './data-merge.js';
import { clearKeyCache, getCachedKey, updateKeyCache } from './crypto-key-cache.js';

export { getCachedKey, updateKeyCache } from './crypto-key-cache.js';

const appWindow = /** @type {Window & typeof globalThis & {
  __WEARABLES_TEST?: boolean,
}} */ (typeof window !== 'undefined' ? window : {});
/**
 * @typedef {{
 *   buildSidebar: null | (() => void),
 *   migrateProfileData: null | ((data: any) => void),
 *   navigate: null | ((view: string) => void),
 * }} CryptoProfileDeps
 */

/** @type {CryptoProfileDeps} */
const cryptoProfileDeps = {
  buildSidebar: null,
  migrateProfileData: /** @type {null | ((data: any) => void)} */ (null),
  navigate: null,
};

function navigateCryptoView(view) {
  cryptoProfileDeps.navigate?.(view);
}

function buildCryptoSidebar() {
  cryptoProfileDeps.buildSidebar?.();
}

/** @param {Partial<CryptoProfileDeps>} [deps] */
export function configureCryptoProfileDeps(deps = {}) {
  const previous = { ...cryptoProfileDeps };
  if (Object.hasOwn(deps, 'buildSidebar') && (deps.buildSidebar === null || typeof deps.buildSidebar === 'function')) {
    cryptoProfileDeps.buildSidebar = deps.buildSidebar;
  }
  if (Object.hasOwn(deps, 'migrateProfileData') && (deps.migrateProfileData === null || typeof deps.migrateProfileData === 'function')) {
    cryptoProfileDeps.migrateProfileData = deps.migrateProfileData;
  }
  if (Object.hasOwn(deps, 'navigate') && (deps.navigate === null || typeof deps.navigate === 'function')) {
    cryptoProfileDeps.navigate = deps.navigate;
  }
  return previous;
}
const cryptoActionDelegateRoots = new WeakSet();
const CRYPTO_ACTION_DELEGATE_KEY = Symbol.for('getbased.cryptoActionDelegatesInstalled');
const CRYPTO_ACTION_ATTR = 'data-crypto-action';
const CRYPTO_ACTION_SELECTOR = `[${CRYPTO_ACTION_ATTR}]`;

function cryptoActionAttrs(action, attrs = {}) {
  let html = `${CRYPTO_ACTION_ATTR}="${escapeAttr(action)}"`;
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    const attr = key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    html += ` data-crypto-${attr}="${escapeAttr(String(value))}"`;
  }
  return html;
}

function closestCryptoAction(target) {
  return /** @type {HTMLElement | null} */ (
    target && typeof target.closest === 'function'
      ? target.closest(CRYPTO_ACTION_SELECTOR)
      : null
  );
}

function readSnapshotActionId(actionEl) {
  const raw = actionEl.dataset.cryptoSnapshotId;
  if (raw == null) return null;
  if (actionEl.dataset.cryptoSnapshotIdType === 'number') {
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
  }
  return raw;
}

function handleCryptoActionClick(event) {
  const actionEl = closestCryptoAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(CRYPTO_ACTION_ATTR);
  if (action === 'change-passphrase') changePassphrase();
  else if (action === 'disable-encryption') disableEncryption();
  else if (action === 'enable-encryption') showEnableEncryptionModal();
  else if (action === 'export-backup') exportEncryptedBackup();
  else if (action === 'toggle-backup-snapshots') toggleBackupSnapshots();
  else if (action === 'restore-auto-backup') {
    const id = readSnapshotActionId(actionEl);
    if (id == null) return;
    restoreAutoBackup(id);
  } else {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function handleCryptoActionKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestCryptoAction(event.target);
  if (!actionEl || actionEl.getAttribute('role') !== 'button') return;
  if (event.target?.closest?.('button, a, input, textarea, select')) return;
  handleCryptoActionClick(event);
}

function handleCryptoActionChange(event) {
  const actionEl = closestCryptoAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  if (actionEl.getAttribute(CRYPTO_ACTION_ATTR) !== 'import-backup') return;
  const fileInput = /** @type {HTMLInputElement} */ (actionEl);
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  importEncryptedBackup(file);
  fileInput.value = '';
  event.stopPropagation();
}

export function installCryptoActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || cryptoActionDelegateRoots.has(root) || root[CRYPTO_ACTION_DELEGATE_KEY]) return;
  cryptoActionDelegateRoots.add(root);
  Object.defineProperty(root, CRYPTO_ACTION_DELEGATE_KEY, { value: true, configurable: true });
  root.addEventListener('click', handleCryptoActionClick);
  root.addEventListener('keydown', handleCryptoActionKeydown);
  root.addEventListener('change', handleCryptoActionChange);
}

if (typeof document !== 'undefined') installCryptoActionDelegates();

// ═══════════════════════════════════════════════
// SENSITIVE KEY PATTERNS
// ═══════════════════════════════════════════════
const SENSITIVE_PATTERNS = [
  /^labcharts-.+-imported$/,
  /^labcharts-.+-chat$/,
  /^labcharts-.+-chat-threads$/,
  /^labcharts-.+-chat-t_.+$/,
  /^labcharts-imported$/,
  /^labcharts-profiles$/,
  /^labcharts-api-key$/,
  /^labcharts-venice-key$/,
  /^labcharts-openrouter-key$/,
  /^labcharts-routstr-key$/,
  /^labcharts-ppq-key$/,
  /^labcharts-custom-key$/,
  /^labcharts-lens-key$/,
  /^labcharts-ollama$/,
  /^labcharts-ollama-pii-key$/,
  /^labcharts-cashu-wallet-mnemonic$/,
  /^labcharts-meteo-config$/,
];

export function isSensitiveKey(key) {
  return SENSITIVE_PATTERNS.some(p => p.test(key));
}

// ═══════════════════════════════════════════════
// KEY LIFECYCLE
// ═══════════════════════════════════════════════
let _sessionKey = null;

// ═══════════════════════════════════════════════
// API KEY CACHE — sync access to decrypted API keys
// ═══════════════════════════════════════════════
const API_KEY_LS_KEYS = ['labcharts-api-key', 'labcharts-venice-key', 'labcharts-openrouter-key', 'labcharts-routstr-key', 'labcharts-ppq-key', 'labcharts-lens-key', 'labcharts-custom-key', 'labcharts-ollama', 'labcharts-ollama-pii-key', 'labcharts-cashu-wallet-mnemonic'];

export async function decryptKeyCache() {
  clearKeyCache();
  for (const lsKey of API_KEY_LS_KEYS) {
    const raw = localStorage.getItem(lsKey);
    if (!raw) continue;
    if (isEncryptedValue(raw) && _sessionKey) {
      const parsed = parseEncryptedValue(raw);
      if (!parsed) continue;
      try {
        const plaintext = await decrypt(_sessionKey, parsed.iv, parsed.ciphertext);
        updateKeyCache(lsKey, plaintext);
      } catch { /* skip if can't decrypt */ }
    } else if (!isEncryptedValue(raw)) {
      updateKeyCache(lsKey, raw);
    }
  }
}
const PBKDF2_ITERATIONS = 600000;

export function getEncryptionEnabled() {
  return localStorage.getItem('labcharts-encryption-enabled') === 'true';
}

export function isUnlocked() {
  return _sessionKey !== null;
}

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(key, plaintext) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

async function decrypt(key, iv, ciphertext) {
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return dec.decode(plaintext);
}

function toBase64(arr) {
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

function fromBase64(str) {
  const bin = atob(str);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function isEncryptedValue(val) {
  return typeof val === 'string' && val.startsWith('v1:');
}

function parseEncryptedValue(val) {
  const parts = val.split(':');
  if (parts.length < 3 || parts[0] !== 'v1') return null;
  return { iv: fromBase64(parts[1]), ciphertext: fromBase64(parts.slice(2).join(':')) };
}

function formatEncryptedValue(iv, ciphertext) {
  return `v1:${toBase64(iv)}:${toBase64(ciphertext)}`;
}

// ═══════════════════════════════════════════════
// OBJECT ENCRYPTION (for IDB rows where the envelope IS an object)
// ═══════════════════════════════════════════════
// Wearable L1 IndexedDB stores rows as objects; we don't want to base64-
// stringify them like we do for localStorage. These helpers wrap a JSON-
// serializable plain object into `{_enc:'v1', iv:Uint8Array, ct:Uint8Array}`
// that re-serializes through structured-clone (IDB) without coercion.
//
// Returns null when encryption is off / locked — callers fall back to
// writing the plain object. Reads detect the envelope marker and decrypt
// transparently; legacy plaintext rows pass through.

async function encryptObjectWithKey(plainObj, key) {
  const json = JSON.stringify(plainObj);
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(json),
  );
  return { _enc: 'v1', iv, ct: new Uint8Array(ct) };
}

export async function encryptObject(plainObj) {
  if (!getEncryptionEnabled() || !_sessionKey) return null;
  return encryptObjectWithKey(plainObj, _sessionKey);
}

export async function decryptObject(envelope) {
  if (!envelope || envelope._enc !== 'v1' || !_sessionKey) return null;
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: envelope.iv },
    _sessionKey,
    envelope.ct,
  );
  return JSON.parse(dec.decode(plaintext));
}

export function isEncryptedObject(o) {
  return o && typeof o === 'object' && o._enc === 'v1' &&
         o.iv instanceof Uint8Array && o.ct instanceof Uint8Array;
}

// TEST-ONLY: injects a freshly-derived key so behavioral tests can drive
// the encrypt/decrypt round-trip without going through the passphrase
// modal. Gated on the runtime __WEARABLES_TEST flag so a missed call site can't
// reach into production. The matching `_setEncryptionEnabledForTest`
// pair lives below.
export async function _setTestSessionKey(passphrase) {
  if (!appWindow.__WEARABLES_TEST) {
    throw new Error('_setTestSessionKey is test-only — enable the runtime __WEARABLES_TEST flag first');
  }
  if (passphrase === null) { _sessionKey = null; return; }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  _sessionKey = await deriveKey(passphrase, salt);
  return salt;
}

export async function _migrateAllStorageForTest(mode) {
  if (!appWindow.__WEARABLES_TEST) throw new Error('_migrateAllStorageForTest is test-only.');
  if (mode === 'encrypted') {
    await migrateSensitiveKeys();
    return migrateLocalIDB('encrypted');
  }
  if (mode === 'plain') {
    const migrated = await migrateLocalIDB('plain');
    await decryptAllSensitiveKeys();
    return migrated;
  }
  throw new Error(`Unsupported migration mode: ${mode}`);
}

// ═══════════════════════════════════════════════
// STORAGE WRAPPERS
// ═══════════════════════════════════════════════
export async function encryptedSetItem(key, value) {
  let stored;
  if (isSensitiveKey(key) && getEncryptionEnabled() && _sessionKey) {
    const { iv, ciphertext } = await encrypt(_sessionKey, value);
    stored = formatEncryptedValue(iv, ciphertext);
  } else {
    stored = value;
  }
  // Big-blob keys (currently `*-imported`) go to IndexedDB to escape
  // the ~5 MB localStorage cap. Failed IDB writes propagate so callers
  // can show a quota error — falling back to localStorage on failure
  // would just trade an explicit error for the silent wedge we're
  // trying to leave behind.
  if (shouldUseBlob(key)) {
    await setBlob(key, stored);
    // Best-effort cleanup of any localStorage leftover from a pre-IDB
    // install. We've already written to IDB above so the canonical
    // copy is safe.
    try { localStorage.removeItem(key); } catch {}
  } else {
    localStorage.setItem(key, stored);
  }
}

export async function encryptedGetItem(key) {
  let raw;
  if (shouldUseBlob(key)) {
    raw = await getBlob(key);
    // Migration path: pre-IDB installs have the blob in localStorage.
    // On the first read we copy it into IDB and (only on successful
    // write) clear it from localStorage. Failed migration keeps the
    // localStorage copy intact so the value isn't lost.
    if (raw == null) {
      const lsRaw = localStorage.getItem(key);
      if (lsRaw !== null) {
        raw = lsRaw;
        try {
          await setBlob(key, lsRaw);
          try { localStorage.removeItem(key); } catch {}
        } catch (e) {
          console.warn('[crypto] blob migration failed for', key, '—', e?.message || e);
        }
      }
    }
  } else {
    raw = localStorage.getItem(key);
  }
  if (raw == null) return null;
  if (isEncryptedValue(raw) && _sessionKey) {
    const parsed = parseEncryptedValue(raw);
    if (!parsed) return raw;
    try {
      return await decrypt(_sessionKey, parsed.iv, parsed.ciphertext);
    } catch {
      return null; // wrong key or corrupt
    }
  }
  return raw;
}

// Companion to encryptedSetItem/encryptedGetItem — ensures big-blob
// keys are removed from BOTH backends. Use this for any cleanup path
// that wipes profile data, otherwise IDB residue accumulates after
// profile deletion / reset.
export async function encryptedRemoveItem(key) {
  if (shouldUseBlob(key)) {
    try { await deleteBlob(key); } catch {}
  }
  try { localStorage.removeItem(key); } catch {}
}

// ═══════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════
export async function initEncryption() {
  if (!getEncryptionEnabled()) return;
  await new Promise((resolve) => {
    showPassphraseModal(resolve);
  });
  await migrateSensitiveKeys();
  await migrateLocalIDB('encrypted');
  await decryptKeyCache();
}

let _failCount = 0;

function showPassphraseModal(onSuccess) {
  let overlay = document.getElementById('passphrase-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'passphrase-overlay';
    overlay.className = 'passphrase-overlay';
    document.body.appendChild(overlay);
  }
  _failCount = 0;
  renderPassphraseForm(overlay, onSuccess);
}

function renderPassphraseForm(overlay, onSuccess) {
  overlay.innerHTML = `
    <div class="passphrase-dialog" role="dialog" aria-modal="true" aria-label="Enter passphrase">
      <div class="passphrase-icon">&#128274;</div>
      <h3 class="passphrase-title">Unlock getbased</h3>
      <p class="passphrase-desc">Your data is encrypted. Enter your passphrase to continue.</p>
      <input type="password" class="passphrase-input" id="passphrase-unlock-input" placeholder="Passphrase" autocomplete="current-password" autofocus>
      <div class="passphrase-error" id="passphrase-error"></div>
      <button class="passphrase-btn passphrase-btn-primary" id="passphrase-unlock-btn">Unlock</button>
      <button class="passphrase-btn passphrase-btn-link" id="passphrase-forgot-btn">Forgot passphrase?</button>
    </div>`;
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('passphrase-unlock-input'));
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('passphrase-unlock-btn'));
  const errorEl = document.getElementById('passphrase-error');
  const forgotBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('passphrase-forgot-btn'));
  if (!input || !btn || !errorEl || !forgotBtn) return;
  overlay.style.display = 'flex';

  async function attemptUnlock() {
    const passphrase = input.value;
    if (!passphrase) { errorEl.textContent = 'Please enter your passphrase'; return; }
    btn.disabled = true;
    btn.textContent = 'Decrypting...';
    errorEl.textContent = '';

    // Rate limit after 3 failures
    if (_failCount >= 3) {
      errorEl.textContent = 'Too many attempts. Please wait...';
      await new Promise(r => setTimeout(r, 5000));
      errorEl.textContent = '';
    }

    try {
      const saltHex = localStorage.getItem('labcharts-encryption-salt');
      if (!saltHex) throw new Error('No encryption salt found');
      const salt = fromBase64(saltHex);
      const key = await deriveKey(passphrase, salt);

      // Verify by trying to decrypt profiles
      const profilesRaw = localStorage.getItem('labcharts-profiles');
      if (profilesRaw && isEncryptedValue(profilesRaw)) {
        const parsed = parseEncryptedValue(profilesRaw);
        if (parsed) await decrypt(key, parsed.iv, parsed.ciphertext);
      }

      _sessionKey = key;
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      onSuccess();
    } catch {
      _failCount++;
      input.value = '';
      errorEl.textContent = `Wrong passphrase (attempt ${_failCount})`;
      btn.disabled = false;
      btn.textContent = 'Unlock';
      input.focus();
    }
  }

  btn.addEventListener('click', attemptUnlock);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptUnlock();
  });

  forgotBtn.addEventListener('click', () => {
    // Inline confirm inside the passphrase overlay (can't use showConfirmDialog — it's behind this z-index)
    const dialog = /** @type {HTMLElement | null} */ (overlay.querySelector('.passphrase-dialog'));
    if (!dialog) return;
    dialog.innerHTML = `
      <div class="passphrase-icon">&#9888;&#65039;</div>
      <h3 class="passphrase-title">Erase All Data?</h3>
      <p class="passphrase-desc">If you forgot your passphrase, the only option is to <strong>erase all data</strong> and start fresh. This cannot be undone.</p>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="passphrase-btn passphrase-btn-secondary" id="passphrase-forgot-cancel">Go Back</button>
        <button class="passphrase-btn passphrase-btn-primary" id="passphrase-forgot-confirm" style="background:var(--red)">Erase Everything</button>
      </div>`;
    document.getElementById('passphrase-forgot-cancel')?.addEventListener('click', () => {
      renderPassphraseForm(overlay, onSuccess);
    });
    document.getElementById('passphrase-forgot-confirm')?.addEventListener('click', async () => {
      try {
        const { eraseAllLocalAppData } = await import('./data-wipe.js');
        await eraseAllLocalAppData();
      } catch {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('labcharts')) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      }
      _sessionKey = null;
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      location.reload();
    });
  });

  setTimeout(() => input.focus(), 50);
}

// ═══════════════════════════════════════════════
// PASSPHRASE VALIDATION
// ═══════════════════════════════════════════════
function validatePassphrase(p) {
  if (p.length < 8) return { valid: false, message: 'At least 8 characters' };
  if (!/[a-z]/.test(p)) return { valid: false, message: 'At least 1 lowercase letter' };
  if (!/[A-Z]/.test(p)) return { valid: false, message: 'At least 1 uppercase letter' };
  if (!/[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(p)) return { valid: false, message: 'At least 1 special character' };
  return { valid: true, message: '' };
}

function getPassphraseStrength(p) {
  let score = 0;
  if (p.length >= 8) score++;
  if (/[a-z]/.test(p)) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(p)) score++;
  return score; // 0–4
}

// ═══════════════════════════════════════════════
// ENABLE / DISABLE ENCRYPTION
// ═══════════════════════════════════════════════
export function showEnableEncryptionModal() {
  let overlay = document.getElementById('passphrase-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'passphrase-overlay';
    overlay.className = 'passphrase-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="passphrase-dialog" role="dialog" aria-modal="true" aria-label="Set encryption passphrase">
      <div class="passphrase-icon">&#128274;</div>
      <h3 class="passphrase-title">Enable Encryption</h3>
      <p class="passphrase-desc">Set a passphrase to encrypt your medical data at rest. <strong>If you forget this passphrase, your data cannot be recovered.</strong></p>
      <input type="password" class="passphrase-input" id="passphrase-set-input" placeholder="Enter passphrase" autocomplete="new-password" autofocus>
      <input type="password" class="passphrase-input" id="passphrase-confirm-input" placeholder="Confirm passphrase" autocomplete="new-password">
      <div class="passphrase-strength" id="passphrase-strength">
        <div class="passphrase-strength-bars">
          <div class="passphrase-strength-bar" data-index="0"></div>
          <div class="passphrase-strength-bar" data-index="1"></div>
          <div class="passphrase-strength-bar" data-index="2"></div>
          <div class="passphrase-strength-bar" data-index="3"></div>
        </div>
        <ul class="passphrase-rules" id="passphrase-rules">
          <li data-rule="length">At least 8 characters</li>
          <li data-rule="lower">At least 1 lowercase letter</li>
          <li data-rule="upper">At least 1 uppercase letter</li>
          <li data-rule="special">At least 1 special character</li>
        </ul>
      </div>
      <div class="passphrase-error" id="passphrase-set-error"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="passphrase-btn passphrase-btn-secondary" id="passphrase-set-cancel">Cancel</button>
        <button class="passphrase-btn passphrase-btn-primary" id="passphrase-set-btn">Enable Encryption</button>
      </div>
    </div>`;
  const input1 = /** @type {HTMLInputElement | null} */ (document.getElementById('passphrase-set-input'));
  const input2 = /** @type {HTMLInputElement | null} */ (document.getElementById('passphrase-confirm-input'));
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('passphrase-set-btn'));
  const cancelBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('passphrase-set-cancel'));
  const errorEl = document.getElementById('passphrase-set-error');
  if (!input1 || !input2 || !btn || !cancelBtn || !errorEl) return;
  overlay.style.display = 'flex';

  // Live strength meter
  const strengthBars = /** @type {NodeListOf<HTMLElement>} */ (overlay.querySelectorAll('.passphrase-strength-bar'));
  const ruleItems = overlay.querySelectorAll('.passphrase-rules li');
  const barColors = ['var(--red)', 'var(--orange)', 'var(--yellow)', 'var(--green)'];
  let migrationStarted = false;

  function updateStrengthMeter() {
    const p = input1.value;
    const score = getPassphraseStrength(p);
    strengthBars.forEach((bar, i) => {
      bar.style.background = i < score ? barColors[score - 1] : 'var(--border)';
    });
    // Update checklist
    const checks = [p.length >= 8, /[a-z]/.test(p), /[A-Z]/.test(p), /[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(p)];
    ruleItems.forEach((li, i) => li.classList.toggle('met', checks[i]));
  }
  input1.addEventListener('input', updateStrengthMeter);

  cancelBtn.addEventListener('click', () => {
    overlay.style.display = 'none';
    overlay.innerHTML = '';
  });

  btn.addEventListener('click', async () => {
    const p1 = input1.value;
    const p2 = input2.value;
    if (!p1) { errorEl.textContent = 'Please enter a passphrase'; return; }
    const validation = validatePassphrase(p1);
    if (!validation.valid) { errorEl.textContent = validation.message; return; }
    if (p1 !== p2) { errorEl.textContent = 'Passphrases do not match'; return; }

    btn.disabled = true;
    btn.textContent = 'Encrypting...';
    errorEl.textContent = '';

    try {
      if (!migrationStarted) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        localStorage.setItem('labcharts-encryption-salt', toBase64(salt));
        _sessionKey = await deriveKey(p1, salt);
        localStorage.setItem('labcharts-encryption-enabled', 'true');
        migrationStarted = true;
      }
      await migrateSensitiveKeys();
      await migrateLocalIDB('encrypted');
      await decryptKeyCache();

      overlay.style.display = 'none';
      overlay.innerHTML = '';
      showNotification('Encryption enabled \u2014 keep your passphrase safe', 'success');
      // Refresh settings UI
      if (document.getElementById('encryption-section')) {
        document.getElementById('encryption-section').innerHTML = renderEncryptionSection();
      }
    } catch (err) {
      errorEl.textContent = 'Encryption failed: ' + err.message;
      btn.disabled = false;
      btn.textContent = migrationStarted ? 'Retry Encryption' : 'Enable Encryption';
    }
  });

  input2.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
  });

  setTimeout(() => input1.focus(), 50);
}

export function maybeShowEncryptionNudge() {
  if (getEncryptionEnabled()) return;
  if (localStorage.getItem('labcharts-encryption-nudge-dismissed')) return;
  setTimeout(() => {
    let overlay = document.getElementById('passphrase-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'passphrase-overlay';
      overlay.className = 'passphrase-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="passphrase-dialog" role="dialog" aria-modal="true" aria-label="Enable encryption">
        <div class="passphrase-icon">&#128274;</div>
        <h3 class="passphrase-title">Protect Your Data</h3>
        <p class="passphrase-desc">Your lab results are stored in your browser's local storage, where browser extensions and anyone with filesystem access can read them. Set a passphrase to encrypt your data at rest.</p>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="passphrase-btn passphrase-btn-secondary" id="encryption-nudge-dismiss">Not Now</button>
          <button class="passphrase-btn passphrase-btn-primary" id="encryption-nudge-enable">Enable Encryption</button>
        </div>
      </div>`;
    overlay.style.display = 'flex';
    document.getElementById('encryption-nudge-dismiss').addEventListener('click', () => {
      localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
      overlay.style.display = 'none';
      overlay.innerHTML = '';
    });
    document.getElementById('encryption-nudge-enable').addEventListener('click', () => {
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      showEnableEncryptionModal();
    });
  }, 800);
}

export function maybeShowBackupNudge() {
  // Don't compete with the guided tour. First-time users see the welcome
  // tour right after their first demo import; firing the backup nudge
  // behind it (or stealing focus) is an unwelcome interruption. The nudge
  // will re-evaluate on next app load anyway.
  if (document.getElementById('tour-overlay')) return;

  // Skip if no profiles or no actual data to back up
  const profiles = localStorage.getItem('labcharts-profiles');
  if (!profiles) return;
  let profileList;
  try { profileList = JSON.parse(profiles); if (profileList.length === 0) return; } catch { return; }
  const hasAnyData = profileList.some(p => {
    try { const d = JSON.parse(localStorage.getItem(`labcharts-${p.id}-imported`) || '{}'); return d.entries && d.entries.length > 0; } catch { return false; }
  });
  if (!hasAnyData) return;
  // Skip if folder backup is active and healthy
  const _fbState = getFolderBackupState();
  if (_fbState?.folderName && !_fbState?.permissionLost) return;
  // Skip if snoozed
  const snoozedUntil = localStorage.getItem('labcharts-backup-nudge-snoozed-until');
  if (snoozedUntil && Date.now() < Number(snoozedUntil)) return;
  // Skip if backed up within 30 days (manual download or folder backup)
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const lastManual = localStorage.getItem('labcharts-last-manual-backup');
  const lastFolder = localStorage.getItem('labcharts-folder-backup-last');
  const mostRecent = Math.max(
    lastManual ? new Date(lastManual).getTime() : 0,
    lastFolder ? new Date(lastFolder).getTime() : 0
  );
  if (mostRecent > 0 && (Date.now() - mostRecent) < THIRTY_DAYS) return;
  // Skip if another overlay is already showing
  const overlay = document.getElementById('passphrase-overlay');
  if (overlay && overlay.style.display === 'flex') return;

  setTimeout(() => {
    // Re-check overlay (encryption nudge may have appeared during delay)
    const ov = document.getElementById('passphrase-overlay');
    if (ov && ov.style.display === 'flex') return;

    let el = document.getElementById('passphrase-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'passphrase-overlay';
      el.className = 'passphrase-overlay';
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <div class="passphrase-dialog" role="dialog" aria-modal="true" aria-label="Backup reminder">
        <div class="passphrase-icon">&#128190;</div>
        <h3 class="passphrase-title">Back Up Your Data</h3>
        <p class="passphrase-desc">Your lab results only exist in this browser. Download a backup to protect against data loss.</p>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="passphrase-btn passphrase-btn-secondary" id="backup-nudge-snooze">Not Now</button>
          <button class="passphrase-btn passphrase-btn-primary" id="backup-nudge-download">Download Now</button>
        </div>
      </div>`;
    el.style.display = 'flex';
    document.getElementById('backup-nudge-snooze').addEventListener('click', () => {
      localStorage.setItem('labcharts-backup-nudge-snoozed-until', String(Date.now() + THIRTY_DAYS));
      el.style.display = 'none';
      el.innerHTML = '';
    });
    document.getElementById('backup-nudge-download').addEventListener('click', () => {
      el.style.display = 'none';
      el.innerHTML = '';
      exportEncryptedBackup();
    });
  }, 500);
}

async function migrationProfileIds() {
  const ids = new Set();
  for (const profile of Array.isArray(state.profiles) ? state.profiles : []) {
    if (profile?.id) ids.add(profile.id);
  }
  if (state.currentProfile) ids.add(state.currentProfile);
  const active = localStorage.getItem('labcharts-active-profile');
  if (active) ids.add(active);
  let profilesRaw = localStorage.getItem('labcharts-profiles');
  if (profilesRaw && isEncryptedValue(profilesRaw)) {
    const parsed = parseEncryptedValue(profilesRaw);
    if (!parsed || !_sessionKey) throw new Error('Encrypted profile list could not be read for storage migration.');
    profilesRaw = await decrypt(_sessionKey, parsed.iv, parsed.ciphertext);
  }
  if (profilesRaw) {
    const profiles = JSON.parse(profilesRaw);
    for (const profile of Array.isArray(profiles) ? profiles : []) {
      if (profile?.id) ids.add(profile.id);
    }
  }
  return [...ids];
}

async function sensitiveBlobKeys() {
  const keys = new Set(['labcharts-imported']);
  for (const profileId of await migrationProfileIds()) keys.add(profileStorageKey(profileId, 'imported'));
  return [...keys];
}

async function migrateSensitiveKeys() {
  if (!_sessionKey) throw new Error('Encryption key is locked.');
  const blobKeys = await sensitiveBlobKeys();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isSensitiveKey(key)) continue;
    const raw = localStorage.getItem(key);
    if (!raw || isEncryptedValue(raw)) continue; // already encrypted
    const { iv, ciphertext } = await encrypt(_sessionKey, raw);
    localStorage.setItem(key, formatEncryptedValue(iv, ciphertext));
  }
  for (const key of blobKeys) {
    const raw = await getBlob(key);
    if (typeof raw !== 'string' || !raw || isEncryptedValue(raw)) continue;
    const { iv, ciphertext } = await encrypt(_sessionKey, raw);
    await setBlob(key, formatEncryptedValue(iv, ciphertext));
  }
}

async function decryptAllSensitiveKeys() {
  if (!_sessionKey) throw new Error('Encryption key is locked.');
  const blobKeys = await sensitiveBlobKeys();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isSensitiveKey(key)) continue;
    const raw = localStorage.getItem(key);
    if (!raw || !isEncryptedValue(raw)) continue;
    const parsed = parseEncryptedValue(raw);
    if (!parsed) throw new Error(`Encrypted value ${key} is malformed.`);
    const plaintext = await decrypt(_sessionKey, parsed.iv, parsed.ciphertext);
    localStorage.setItem(key, plaintext);
  }
  for (const key of blobKeys) {
    const raw = await getBlob(key);
    if (typeof raw !== 'string' || !isEncryptedValue(raw)) continue;
    const parsed = parseEncryptedValue(raw);
    if (!parsed) throw new Error(`Encrypted value ${key} is malformed.`);
    await setBlob(key, await decrypt(_sessionKey, parsed.iv, parsed.ciphertext));
  }
}

async function transformPayloadRows(rows, keyFields, mode) {
  const changed = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?._payload) {
      if (mode === 'plain') continue;
      const keys = {};
      const payload = { ...row };
      for (const key of keyFields) {
        keys[key] = payload[key];
        delete payload[key];
      }
      changed.push({ ...keys, _payload: await encryptObjectWithKey(payload, _sessionKey) });
      continue;
    }
    if (!isEncryptedObject(row._payload)) throw new Error('Encrypted IndexedDB row has an invalid envelope.');
    if (mode === 'encrypted') continue;
    const payload = await decryptObject(row._payload);
    if (!payload) throw new Error('Encrypted IndexedDB row could not be decrypted.');
    const keys = {};
    for (const key of keyFields) keys[key] = row[key];
    changed.push({ ...keys, ...payload });
  }
  return changed;
}

async function migrateLocalIDB(mode) {
  if (!_sessionKey) throw new Error('Encryption key is locked.');
  const [wearableStore, cycleStore, cashuStore] = await Promise.all([
    import('./wearables-store.js'),
    import('./cycle-store.js'),
    import('./cashu-wallet-store.js'),
  ]);
  let migrated = await cashuStore.migrateCashuWalletStorage(mode);
  for (const profileId of await migrationProfileIds()) {
    const wearableRows = await transformPayloadRows(await wearableStore.getAllDailyRaw(profileId), ['source', 'date'], mode);
    const cycleRows = await transformPayloadRows(await cycleStore.getAllCycleObservationsRaw(profileId), ['source', 'date', 'importId'], mode);
    const importRows = await transformPayloadRows(await cycleStore.getAllCycleImportMetaRaw(profileId), ['importId', 'source'], mode);
    await wearableStore.upsertDailyBatchRaw(profileId, wearableRows);
    await cycleStore.upsertCycleObservationBatchRaw(profileId, cycleRows);
    await cycleStore.upsertCycleImportMetaBatchRaw(profileId, importRows);
    migrated += wearableRows.length + cycleRows.length + importRows.length;
  }
  return migrated;
}

export async function disableEncryption() {
  if (await showConfirmDialog('Disable encryption? Your data will be stored in plaintext.')) {
    try {
      // Decrypt every storage backend before dropping the only in-memory key.
      await migrateLocalIDB('plain');
      await decryptAllSensitiveKeys();
      localStorage.removeItem('labcharts-encryption-enabled');
      localStorage.removeItem('labcharts-encryption-salt');
      _sessionKey = null;
      clearKeyCache();
      showNotification('Encryption disabled', 'info');
      if (document.getElementById('encryption-section')) {
        document.getElementById('encryption-section').innerHTML = renderEncryptionSection();
      }
    } catch (err) {
      showNotification('Failed to disable encryption: ' + err.message, 'error');
    }
  }
}

export async function changePassphrase() {
  let overlay = document.getElementById('passphrase-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'passphrase-overlay';
    overlay.className = 'passphrase-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="passphrase-dialog" role="dialog" aria-modal="true" aria-label="Change passphrase">
      <div class="passphrase-icon">&#128274;</div>
      <h3 class="passphrase-title">Change Passphrase</h3>
      <input type="password" class="passphrase-input" id="passphrase-old-input" placeholder="Current passphrase" autocomplete="current-password" autofocus>
      <input type="password" class="passphrase-input" id="passphrase-new1-input" placeholder="New passphrase" autocomplete="new-password">
      <input type="password" class="passphrase-input" id="passphrase-new2-input" placeholder="Confirm new passphrase" autocomplete="new-password">
      <div class="passphrase-error" id="passphrase-change-error"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="passphrase-btn passphrase-btn-secondary" id="passphrase-change-cancel">Cancel</button>
        <button class="passphrase-btn passphrase-btn-primary" id="passphrase-change-btn">Change Passphrase</button>
      </div>
    </div>`;
  const oldInput = /** @type {HTMLInputElement | null} */ (document.getElementById('passphrase-old-input'));
  const new1Input = /** @type {HTMLInputElement | null} */ (document.getElementById('passphrase-new1-input'));
  const new2Input = /** @type {HTMLInputElement | null} */ (document.getElementById('passphrase-new2-input'));
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('passphrase-change-btn'));
  const cancelBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('passphrase-change-cancel'));
  const errorEl = document.getElementById('passphrase-change-error');
  if (!oldInput || !new1Input || !new2Input || !btn || !cancelBtn || !errorEl) return;
  overlay.style.display = 'flex';

  cancelBtn.addEventListener('click', () => {
    overlay.style.display = 'none';
    overlay.innerHTML = '';
  });

  btn.addEventListener('click', async () => {
    const oldP = oldInput.value;
    const newP = new1Input.value;
    const newP2 = new2Input.value;
    if (!oldP) { errorEl.textContent = 'Enter current passphrase'; return; }
    const validation = validatePassphrase(newP);
    if (!validation.valid) { errorEl.textContent = validation.message; return; }
    if (newP !== newP2) { errorEl.textContent = 'New passphrases do not match'; return; }

    btn.disabled = true;
    btn.textContent = 'Changing...';
    errorEl.textContent = '';

    try {
      // Verify old passphrase
      const oldSalt = fromBase64(localStorage.getItem('labcharts-encryption-salt'));
      const oldKey = await deriveKey(oldP, oldSalt);

      // Test decryption with old key
      const profilesRaw = localStorage.getItem('labcharts-profiles');
      if (profilesRaw && isEncryptedValue(profilesRaw)) {
        const parsed = parseEncryptedValue(profilesRaw);
        if (parsed) await decrypt(oldKey, parsed.iv, parsed.ciphertext);
      }

      // Decrypt every backend under the old key before replacing it.
      _sessionKey = oldKey;
      await migrateLocalIDB('plain');
      await decryptAllSensitiveKeys();

      // Re-encrypt localStorage, blob storage, and raw local databases.
      const newSalt = crypto.getRandomValues(new Uint8Array(16));
      localStorage.setItem('labcharts-encryption-salt', toBase64(newSalt));
      const newKey = await deriveKey(newP, newSalt);
      _sessionKey = newKey;
      await migrateSensitiveKeys();
      await migrateLocalIDB('encrypted');
      await decryptKeyCache();

      overlay.style.display = 'none';
      overlay.innerHTML = '';
      showNotification('Passphrase changed successfully', 'success');
    } catch {
      errorEl.textContent = 'Current passphrase is incorrect';
      btn.disabled = false;
      btn.textContent = 'Change Passphrase';
    }
  });

  setTimeout(() => oldInput.focus(), 50);
}

// ═══════════════════════════════════════════════
// Backup/restore, auto-backup, folder backup extracted to js/backup.js
import { buildBackupSnapshot, configureBackupRuntimeDeps, exportEncryptedBackup, importEncryptedBackup, scheduleAutoBackup, getAutoBackupSnapshots, restoreAutoBackup, openBackupDB, initFolderBackup, getFolderBackupState, renderFolderBackupSection, MAX_SNAPSHOTS } from './backup.js';
export { buildBackupSnapshot, scheduleAutoBackup, openBackupDB, initFolderBackup };

configureBackupRuntimeDeps({ encryptedGetItem, getEncryptionEnabled });

// ═══════════════════════════════════════════════
// CROSS-TAB SYNC (BroadcastChannel)
// ═══════════════════════════════════════════════
let _bc = null;

export function initBroadcastChannel() {
  if (typeof BroadcastChannel === 'undefined') return;
  _bc = new BroadcastChannel('labcharts-sync');
  _bc.onmessage = async (event) => {
    const { type, profileId } = event.data || {};
    if (type === 'data-changed' && profileId === state.currentProfile) {
      // Re-read from localStorage and re-render
      const raw = await encryptedGetItem(profileStorageKey(profileId, 'imported'));
      if (raw) {
        try {
          state.importedData = JSON.parse(raw);
          ensureImportedArray(state.importedData, 'notes');
          ensureImportedArray(state.importedData, 'supplements');
          cryptoProfileDeps.migrateProfileData?.(state.importedData);
          buildCryptoSidebar();
          // buildSidebar resets the .active class to Dashboard, so source
          // the target view from state.currentView (kept in sync by
          // navigate) rather than re-reading the stale DOM.
          navigateCryptoView(state.currentView || 'dashboard');
        } catch { /* ignore parse errors */ }
      }
    }
  };
}

export function broadcastDataChanged(profileId) {
  if (_bc) {
    _bc.postMessage({ type: 'data-changed', profileId });
  }
}

// ═══════════════════════════════════════════════
// SETTINGS UI — SECURITY SECTION
// ═══════════════════════════════════════════════
export function renderEncryptionSection() {
  const enabled = getEncryptionEnabled();
  if (enabled) {
    return `<div class="encryption-status-card encryption-status-on">
      <div class="encryption-status-icon">&#128274;</div>
      <div class="encryption-status-body">
        <div class="encryption-status-title">Encryption is ON</div>
        <div class="encryption-status-detail">Your medical data, chat history, wearable history, and API keys are encrypted with AES-256-GCM. Display preferences remain unencrypted.</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="import-btn import-btn-secondary" ${cryptoActionAttrs('change-passphrase')}>Change Passphrase</button>
      <button class="import-btn import-btn-secondary" ${cryptoActionAttrs('disable-encryption')}>Disable Encryption</button>
    </div>`;
  }
  return `<div class="encryption-status-card encryption-status-off">
    <div class="encryption-status-icon">&#128275;</div>
    <div class="encryption-status-body">
      <div class="encryption-status-title">Encryption is OFF</div>
      <div class="encryption-status-detail">Your data is stored as plaintext in localStorage. Browser extensions and anyone with filesystem access can read it.</div>
    </div>
  </div>
  <button class="import-btn import-btn-primary" style="margin-top:12px" ${cryptoActionAttrs('enable-encryption')}>Enable Encryption</button>`;
}

export function renderBackupSection() {
  const lastAuto = localStorage.getItem('labcharts-last-autobackup');
  const autoStatus = lastAuto
    ? `Last auto-backup: ${new Date(lastAuto).toLocaleString()}`
    : 'No auto-backups yet';
  return `<div class="ai-provider-desc" style="margin-bottom:10px">Create a full backup of all profiles, data, and chat history. ${getEncryptionEnabled() ? 'Backups inherit encryption \u2014 same passphrase required to restore.' : 'Backups are unencrypted unless encryption is enabled.'}</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="import-btn import-btn-primary" ${cryptoActionAttrs('export-backup')}>Download Backup</button>
    <label class="import-btn import-btn-secondary" style="cursor:pointer;display:inline-flex;align-items:center">
      Restore Backup
      <input type="file" accept=".json" style="display:none" ${cryptoActionAttrs('import-backup')}>
    </label>
  </div>
  <div class="backup-auto-status">${escapeHTML(autoStatus)}</div>
  <div class="backup-snapshots-toggle" ${cryptoActionAttrs('toggle-backup-snapshots')} id="backup-snapshots-toggle" role="button" tabindex="0" style="display:none">
    <span class="privacy-configure-arrow" id="backup-snapshots-arrow">&#9654;</span>
    Recent snapshots
  </div>
  <div class="backup-snapshot-list" id="backup-snapshot-list" style="display:none"></div>
  <div id="backup-folder-section">${renderFolderBackupSection()}</div>`;
}

export async function loadBackupSnapshots() {
  const list = document.getElementById('backup-snapshot-list');
  const toggle = document.getElementById('backup-snapshots-toggle');
  if (!list) return;
  const snapshots = await getAutoBackupSnapshots();
  if (snapshots.length === 0) {
    if (toggle) toggle.style.display = 'none';
    list.style.display = 'none';
    return;
  }
  if (toggle) toggle.style.display = '';
  const shown = snapshots.slice(0, MAX_SNAPSHOTS);
  list.innerHTML = shown.map(s => {
    const date = new Date(s.createdAt).toLocaleString();
    const profileCount = (s.snapshot && s.snapshot.profiles) ? s.snapshot.profiles.length : '?';
    const actionAttrs = cryptoActionAttrs('restore-auto-backup', {
      snapshotId: s.id,
      snapshotIdType: typeof s.id === 'number' ? 'number' : 'string',
    });
    return `<div class="backup-snapshot-item">
      <div class="backup-snapshot-info">
        <span class="backup-snapshot-date">${escapeHTML(date)}</span>
        <span class="backup-snapshot-meta">${profileCount} profile(s)${s.encrypted ? ' \u2022 encrypted' : ''}</span>
      </div>
      <button class="import-btn import-btn-secondary" style="padding:4px 10px;font-size:12px" ${actionAttrs}>Restore</button>
    </div>`;
  }).join('');
}

export function toggleBackupSnapshots() {
  const list = document.getElementById('backup-snapshot-list');
  const arrow = document.getElementById('backup-snapshots-arrow');
  if (!list) return;
  const open = list.style.display !== 'none';
  list.style.display = open ? 'none' : 'flex';
  if (arrow) arrow.innerHTML = open ? '&#9654;' : '&#9660;';
}
