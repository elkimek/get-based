// crypto.js — Encryption at rest, backup/restore, cross-tab sync

import { state } from './state.js';
import { showNotification, showConfirmDialog, escapeHTML } from './utils.js';
import { profileStorageKey } from './profile.js';
import { getBlob, setBlob, deleteBlob, shouldUseBlob } from './blob-storage.js';
import { ensureImportedArray } from './data-merge.js';

// ═══════════════════════════════════════════════
// SENSITIVE KEY PATTERNS
// ═══════════════════════════════════════════════
const SENSITIVE_PATTERNS = [
  /^labcharts-[^-]+-imported$/,
  /^labcharts-[^-]+-chat$/,
  /^labcharts-[^-]+-chat-threads$/,
  /^labcharts-[^-]+-chat-t_.+$/,
  /^labcharts-profiles$/,
  /^labcharts-api-key$/,
  /^labcharts-venice-key$/,
  /^labcharts-openrouter-key$/,
  /^labcharts-routstr-key$/,
  /^labcharts-ppq-key$/,
  /^labcharts-custom-key$/,
  /^labcharts-lens-key$/,
  /^labcharts-ollama$/,
  /^labcharts-cashu-wallet-mnemonic$/,
  /^labcharts-meteo-config$/,
];

function isSensitiveKey(key) {
  return SENSITIVE_PATTERNS.some(p => p.test(key));
}

// ═══════════════════════════════════════════════
// KEY LIFECYCLE
// ═══════════════════════════════════════════════
let _sessionKey = null;

// ═══════════════════════════════════════════════
// API KEY CACHE — sync access to decrypted API keys
// ═══════════════════════════════════════════════
const API_KEY_LS_KEYS = ['labcharts-api-key', 'labcharts-venice-key', 'labcharts-openrouter-key', 'labcharts-routstr-key', 'labcharts-ppq-key', 'labcharts-lens-key', 'labcharts-custom-key', 'labcharts-ollama', 'labcharts-cashu-wallet-mnemonic'];
const _keyCache = new Map();

export async function decryptKeyCache() {
  _keyCache.clear();
  for (const lsKey of API_KEY_LS_KEYS) {
    const raw = localStorage.getItem(lsKey);
    if (!raw) continue;
    if (isEncryptedValue(raw) && _sessionKey) {
      const parsed = parseEncryptedValue(raw);
      if (!parsed) continue;
      try {
        const plaintext = await decrypt(_sessionKey, parsed.iv, parsed.ciphertext);
        _keyCache.set(lsKey, plaintext);
      } catch { /* skip if can't decrypt */ }
    } else if (!isEncryptedValue(raw)) {
      _keyCache.set(lsKey, raw);
    }
  }
}

export function getCachedKey(lsKey) {
  if (_keyCache.has(lsKey)) return _keyCache.get(lsKey);
  // Fallback: raw localStorage (encryption off or cache not populated)
  return localStorage.getItem(lsKey);
}

export function updateKeyCache(lsKey, value) {
  if (value) _keyCache.set(lsKey, value);
  else _keyCache.delete(lsKey);
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

export async function encryptObject(plainObj) {
  if (!getEncryptionEnabled() || !_sessionKey) return null;
  const json = JSON.stringify(plainObj);
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    _sessionKey,
    enc.encode(json),
  );
  return { _enc: 'v1', iv, ct: new Uint8Array(ct) };
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
// modal. Gated on window.__WEARABLES_TEST so a missed call site can't
// reach into production. The matching `_setEncryptionEnabledForTest`
// pair lives below.
export async function _setTestSessionKey(passphrase) {
  if (!globalThis.window?.__WEARABLES_TEST) {
    throw new Error('_setTestSessionKey is test-only — set window.__WEARABLES_TEST first');
  }
  if (passphrase === null) { _sessionKey = null; return; }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  _sessionKey = await deriveKey(passphrase, salt);
  return salt;
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
  overlay.style.display = 'flex';

  const input = document.getElementById('passphrase-unlock-input');
  const btn = document.getElementById('passphrase-unlock-btn');
  const errorEl = document.getElementById('passphrase-error');
  const forgotBtn = document.getElementById('passphrase-forgot-btn');

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
    const dialog = overlay.querySelector('.passphrase-dialog');
    dialog.innerHTML = `
      <div class="passphrase-icon">&#9888;&#65039;</div>
      <h3 class="passphrase-title">Erase All Data?</h3>
      <p class="passphrase-desc">If you forgot your passphrase, the only option is to <strong>erase all data</strong> and start fresh. This cannot be undone.</p>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="passphrase-btn passphrase-btn-secondary" id="passphrase-forgot-cancel">Go Back</button>
        <button class="passphrase-btn passphrase-btn-primary" id="passphrase-forgot-confirm" style="background:var(--red)">Erase Everything</button>
      </div>`;
    document.getElementById('passphrase-forgot-cancel').addEventListener('click', () => {
      renderPassphraseForm(overlay, onSuccess);
    });
    document.getElementById('passphrase-forgot-confirm').addEventListener('click', () => {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('labcharts')) keysToRemove.push(k);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
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
  overlay.style.display = 'flex';

  const input1 = document.getElementById('passphrase-set-input');
  const input2 = document.getElementById('passphrase-confirm-input');
  const btn = document.getElementById('passphrase-set-btn');
  const cancelBtn = document.getElementById('passphrase-set-cancel');
  const errorEl = document.getElementById('passphrase-set-error');

  // Live strength meter
  const strengthBars = overlay.querySelectorAll('.passphrase-strength-bar');
  const ruleItems = overlay.querySelectorAll('.passphrase-rules li');
  const barColors = ['var(--red)', 'var(--orange)', 'var(--yellow)', 'var(--green)'];

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
      // Generate salt and derive key
      const salt = crypto.getRandomValues(new Uint8Array(16));
      localStorage.setItem('labcharts-encryption-salt', toBase64(salt));
      const key = await deriveKey(p1, salt);
      _sessionKey = key;

      // Migrate all sensitive keys: read plaintext, re-write encrypted
      await migrateSensitiveKeys();
      await decryptKeyCache();

      localStorage.setItem('labcharts-encryption-enabled', 'true');
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
      btn.textContent = 'Enable Encryption';
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
  const _fbState = window.getFolderBackupState?.();
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

async function migrateSensitiveKeys() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isSensitiveKey(key)) continue;
    const raw = localStorage.getItem(key);
    if (!raw || isEncryptedValue(raw)) continue; // already encrypted
    const { iv, ciphertext } = await encrypt(_sessionKey, raw);
    localStorage.setItem(key, formatEncryptedValue(iv, ciphertext));
  }
}

async function decryptAllSensitiveKeys() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isSensitiveKey(key)) continue;
    const raw = localStorage.getItem(key);
    if (!raw || !isEncryptedValue(raw)) continue;
    const parsed = parseEncryptedValue(raw);
    if (!parsed) continue;
    try {
      const plaintext = await decrypt(_sessionKey, parsed.iv, parsed.ciphertext);
      localStorage.setItem(key, plaintext);
    } catch {
      // skip if can't decrypt
    }
  }
}

// Walk every profile's wearable IndexedDB, decrypt rows with the CURRENT
// session key, and rewrite them in the chosen mode:
//   mode='plain'      → write back plaintext (used by disableEncryption)
//   mode='re-encrypt' → re-encrypt with whatever the current _sessionKey is
//                       (used by changePassphrase AFTER swapping the key)
// Best-effort per-profile / per-row — failures don't abort the whole walk;
// any unmigrated wrappers will surface on next read as `_payload`-shaped
// rows the strip can't render, which is preferable to silently writing
// over the user's intent.
async function _walkWearableIDB(mode) {
  let storeMod, profileMod;
  try {
    storeMod = await import('./wearables-store.js');
    profileMod = await import('./profile.js');
  } catch { return { walked: 0, errors: 1 }; }
  const profiles = profileMod.getProfiles?.() || [];
  let walked = 0, errors = 0;
  for (const p of profiles) {
    const KNOWN_SOURCES = ['oura', 'whoop', 'fitbit', 'withings', 'ultrahuman', 'polar', 'apple_health', 'manual'];
    for (const src of KNOWN_SOURCES) {
      try {
        // Read raw (wrappers preserved). Decrypt each. Write back via the
        // normal upsertDaily path which encrypts iff encryption is enabled
        // post-this-call (mode='plain' wants encryption already DISABLED;
        // mode='re-encrypt' wants the new key already SET).
        const rows = await storeMod.getDailyRangeRaw(p.id, src, '2000-01-01', '2099-12-31');
        if (rows.length === 0) continue;
        for (const row of rows) {
          if (!isEncryptedObject(row._payload)) continue; // plaintext — already in target shape for 'plain'; skip in re-encrypt too
          try {
            const decrypted = await decryptObject(row._payload);
            if (!decrypted) { errors++; continue; }
            // Rebuild plaintext shape: hoist decrypted fields back to top-level.
            const plainRow = { source: row.source, date: row.date, ...decrypted };
            await storeMod.upsertDaily(p.id, plainRow);
            walked++;
          } catch { errors++; }
        }
      } catch { /* db not yet created or other store-level error — skip */ }
    }
  }
  return { walked, errors };
}

export async function disableEncryption() {
  if (await showConfirmDialog('Disable encryption? Your data will be stored in plaintext.')) {
    try {
      // CRITICAL ORDER: walk wearable IDB BEFORE clearing _sessionKey, so
      // rows can decrypt under the current key. Then localStorage walk,
      // then drop the key. Without this the wearable IDB stays wrapped
      // forever — the strip silently goes blank for any encrypted rows.
      await _walkWearableIDB('plain');
      await decryptAllSensitiveKeys();
      localStorage.removeItem('labcharts-encryption-enabled');
      localStorage.removeItem('labcharts-encryption-salt');
      _sessionKey = null;
      _keyCache.clear();
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
  overlay.style.display = 'flex';

  const oldInput = document.getElementById('passphrase-old-input');
  const new1Input = document.getElementById('passphrase-new1-input');
  const new2Input = document.getElementById('passphrase-new2-input');
  const btn = document.getElementById('passphrase-change-btn');
  const cancelBtn = document.getElementById('passphrase-change-cancel');
  const errorEl = document.getElementById('passphrase-change-error');

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

      // Decrypt all with old key. Wearable IDB first — must run while
      // _sessionKey still holds the OLD key so wrappers decrypt. The walk
      // hoists every decrypted row back to plaintext via upsertDaily; the
      // re-encrypt below puts them back under the NEW key.
      _sessionKey = oldKey;
      await _walkWearableIDB('plain');
      await decryptAllSensitiveKeys();

      // Re-encrypt with new key (localStorage AND IDB).
      const newSalt = crypto.getRandomValues(new Uint8Array(16));
      localStorage.setItem('labcharts-encryption-salt', toBase64(newSalt));
      const newKey = await deriveKey(newP, newSalt);
      _sessionKey = newKey;
      await migrateSensitiveKeys();
      await decryptKeyCache();
      // Wearable IDB rows are currently plaintext (post-walk above). The
      // upsertDaily path now encrypts under the new key for any future
      // writes. Existing plaintext rows migrate write-on-touch on next
      // mutation, same as the OFF→ON migration path documented in the
      // encryption guide.

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
import { buildBackupSnapshot, exportEncryptedBackup, importEncryptedBackup, scheduleAutoBackup, getAutoBackupSnapshots, restoreAutoBackup, openBackupDB, initFolderBackup, getFolderBackupState, renderFolderBackupSection, MAX_SNAPSHOTS } from './backup.js';
export { buildBackupSnapshot, scheduleAutoBackup, openBackupDB, initFolderBackup };

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
          window.migrateProfileData(state.importedData);
          window.buildSidebar();
          // buildSidebar resets the .active class to Dashboard, so source
          // the target view from state.currentView (kept in sync by
          // navigate) rather than re-reading the stale DOM.
          window.navigate(state.currentView || 'dashboard');
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
      <button class="import-btn import-btn-secondary" onclick="changePassphrase()">Change Passphrase</button>
      <button class="import-btn import-btn-secondary" onclick="disableEncryption()">Disable Encryption</button>
    </div>`;
  }
  return `<div class="encryption-status-card encryption-status-off">
    <div class="encryption-status-icon">&#128275;</div>
    <div class="encryption-status-body">
      <div class="encryption-status-title">Encryption is OFF</div>
      <div class="encryption-status-detail">Your data is stored as plaintext in localStorage. Browser extensions and anyone with filesystem access can read it.</div>
    </div>
  </div>
  <button class="import-btn import-btn-primary" style="margin-top:12px" onclick="showEnableEncryptionModal()">Enable Encryption</button>`;
}

export function renderBackupSection() {
  const lastAuto = localStorage.getItem('labcharts-last-autobackup');
  const autoStatus = lastAuto
    ? `Last auto-backup: ${new Date(lastAuto).toLocaleString()}`
    : 'No auto-backups yet';
  return `<div class="ai-provider-desc" style="margin-bottom:10px">Create a full backup of all profiles, data, and chat history. ${getEncryptionEnabled() ? 'Backups inherit encryption \u2014 same passphrase required to restore.' : 'Backups are unencrypted unless encryption is enabled.'}</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="import-btn import-btn-primary" onclick="exportEncryptedBackup()">Download Backup</button>
    <label class="import-btn import-btn-secondary" style="cursor:pointer;display:inline-flex;align-items:center">
      Restore Backup
      <input type="file" accept=".json" style="display:none" onchange="if(this.files[0])importEncryptedBackup(this.files[0])">
    </label>
  </div>
  <div class="backup-auto-status">${escapeHTML(autoStatus)}</div>
  <div class="backup-snapshots-toggle" onclick="toggleBackupSnapshots()" id="backup-snapshots-toggle" style="display:none">
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
    return `<div class="backup-snapshot-item">
      <div class="backup-snapshot-info">
        <span class="backup-snapshot-date">${escapeHTML(date)}</span>
        <span class="backup-snapshot-meta">${profileCount} profile(s)${s.encrypted ? ' \u2022 encrypted' : ''}</span>
      </div>
      <button class="import-btn import-btn-secondary" style="padding:4px 10px;font-size:12px" onclick="restoreAutoBackup(${s.id})">Restore</button>
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

// ═══════════════════════════════════════════════
// WINDOW EXPORTS
// ═══════════════════════════════════════════════
Object.assign(window, {
  initEncryption,
  initBroadcastChannel,
  getEncryptionEnabled,
  isUnlocked,
  encryptedSetItem,
  encryptedGetItem,
  showEnableEncryptionModal,
  maybeShowEncryptionNudge,
  maybeShowBackupNudge,
  disableEncryption,
  changePassphrase,
  broadcastDataChanged,
  renderEncryptionSection,
  renderBackupSection,
  isSensitiveKey,
  getCachedKey,
  updateKeyCache,
  decryptKeyCache,
  loadBackupSnapshots,
  toggleBackupSnapshots,
});
