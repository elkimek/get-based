// @ts-check
// sun-uvdata-config.js - encrypted Sun/UV data source config storage.

import { encryptedGetItem, encryptedSetItem, getEncryptionEnabled } from './crypto.js';

//
// Storage: meteo config (mode, selfhostUrl, selfhostBearer, privacyRounding)
// is encrypted at rest via crypto.js's encryptedSetItem / encryptedGetItem.
// `selfhostBearer` is sensitive — same threat-model class as the AI provider
// keys. The key `labcharts-meteo-config` is in `SENSITIVE_PATTERNS` (crypto.js)
// so encryptedSetItem auto-encrypts when the user has encryption enabled.
//
// To preserve the existing synchronous getMeteoConfig() API (sun-context.js,
// settings.js, the Sun-data-source picker all call it from sync paths),
// the decrypted config is cached in module state, refreshed at startup
// via initMeteoConfigCache(), and re-refreshed on encryption-state changes
// (disableEncryption / passphrase change). Cache miss falls back to a raw
// localStorage read which is correct for users without encryption enabled.
//

const STORAGE_KEY = 'labcharts-meteo-config';
let _warnedAboutEmptySelfhost = false;
// Sync-friendly decrypted-config cache. Populated by initMeteoConfigCache()
// on startup + after every saveMeteoConfig(). Lets the rest of the app
// keep calling getMeteoConfig() synchronously even though the at-rest
// representation is AES-GCM-encrypted via encryptedGetItem.
let _meteoConfigCache = null;

// Build a sanitized config from a parsed JSON value. Allowlist-style — only
// the four known fields, type-checked. Defence-in-depth against a stored
// value bearing `{"__proto__": {...}}` from spoofing config: building a
// fresh defaultConfig() and assigning known keys means a hostile parsed
// value can't reach Object.prototype.
function _buildConfigFromParsed(parsed) {
  const cfg = defaultConfig();
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (typeof parsed.mode === 'string') cfg.mode = parsed.mode;
    if (typeof parsed.selfhostUrl === 'string') cfg.selfhostUrl = parsed.selfhostUrl;
    if (typeof parsed.selfhostBearer === 'string') cfg.selfhostBearer = parsed.selfhostBearer;
    if (Number.isFinite(parsed.privacyRounding)) cfg.privacyRounding = parsed.privacyRounding;
  }
  return cfg;
}

// Apply runtime migrations + selfhost-empty-URL sanity. Returns a possibly-
// new config plus a flag indicating whether the persisted record needs
// rewriting (legacy `cams`/`noaa`/`manual` mode → `auto`).
function _applyConfigRuntimeFixups(cfg) {
  let needsPersist = false;
  // Migration: older configs may carry removed source modes. Manual UVI was
  // retired because it was easy to mistake an instrument reading for a full
  // atmospheric model and could silently disable current-data fetching.
  // CAMS-only also breaks clouds/temp, while NOAA blocks browser CORS.
  // Map every removed mode to `auto` silently.
  if (cfg.mode === 'cams' || cfg.mode === 'noaa' || cfg.mode === 'manual') {
    cfg.mode = 'auto';
    needsPersist = true;
  }
  // Sanity: `mode: 'selfhost'` with an empty `selfhostUrl` is a config
  // trap — the selfhost path falls through to Open-Meteo every request,
  // user expected CAMS quality. Treat as in-memory `auto` for sensible
  // behaviour, warn once per session, leave the persisted record alone
  // (the picker still shows what the user clicked).
  if (cfg.mode === 'selfhost' && (!cfg.selfhostUrl || cfg.selfhostUrl.trim() === '')) {
    if (!_warnedAboutEmptySelfhost) {
      try {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[meteo] mode=selfhost with empty selfhostUrl — falling back to auto for this session. Set the URL in Light & Sun → Sun data source, or switch mode to auto explicitly.');
        }
      } catch {}
      _warnedAboutEmptySelfhost = true;
    }
    cfg.mode = 'auto';
  }
  return { cfg, needsPersist };
}

// Async loader — decrypts via crypto.js's encryptedGetItem (which routes
// through the session key when encryption is enabled, falls through to
// raw localStorage otherwise). Called at startup from main.js's init
// sequence, and after encryption-state changes. Migration of pre-encrypt
// plaintext configs is automatic: encryptedGetItem returns the plaintext
// on first read, then saveMeteoConfig's encryptedSetItem writes it back
// in the new envelope.
export async function initMeteoConfigCache() {
  try {
    const raw = await encryptedGetItem(STORAGE_KEY);
    if (!raw) {
      _meteoConfigCache = defaultConfig();
      return;
    }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { _meteoConfigCache = defaultConfig(); return; }
    const cfg = _buildConfigFromParsed(parsed);
    const { needsPersist } = _applyConfigRuntimeFixups(cfg);
    _meteoConfigCache = cfg;
    if (needsPersist) {
      // Persist via saveMeteoConfig so legacy plaintext lands in the
      // encrypted envelope on its first migration save.
      saveMeteoConfig(cfg);
    }
  } catch (e) {
    _meteoConfigCache = defaultConfig();
  }
}

export function getMeteoConfig() {
  // Read localStorage every call so direct writes (tests, cross-tab)
  // are observed without cache invalidation gymnastics. Only the
  // encrypted-envelope path needs the cache (decryption is async; the
  // cache holds the post-startup decrypted form so this function can
  // stay synchronous).
  let raw;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { raw = null; }
  if (!raw) return defaultConfig();
  // Encrypted envelope — return the decrypted form from the cache that
  // initMeteoConfigCache populated at startup. If the cache is empty
  // (race window or test env), fall back to defaults rather than treat
  // ciphertext as JSON.
  if (typeof raw === 'string' && raw.startsWith('v1:')) {
    if (_meteoConfigCache) {
      const { cfg } = _applyConfigRuntimeFixups(Object.assign({}, _meteoConfigCache));
      return cfg;
    }
    return defaultConfig();
  }
  // Plaintext path — parse inline, apply runtime fixups, persist if a
  // legacy mode was migrated. Tests that use raw localStorage.setItem
  // exercise this branch directly.
  try {
    const parsed = JSON.parse(raw);
    const cfg = _buildConfigFromParsed(parsed);
    const { cfg: out, needsPersist } = _applyConfigRuntimeFixups(cfg);
    if (needsPersist) {
      try { saveMeteoConfig(out); } catch {}
    }
    return out;
  } catch (e) {
    return defaultConfig();
  }
}

export function saveMeteoConfig(cfg) {
  // Cache update first — keeps the synchronous getMeteoConfig contract
  // working immediately. Read sequence: getMeteoConfig hits localStorage,
  // sees the value below, parses inline. Cache only matters as a fallback
  // for the encrypted-envelope branch where parsing inline would fail.
  _meteoConfigCache = _buildConfigFromParsed(cfg);
  const json = JSON.stringify(cfg);
  // Sync plaintext write when encryption is OFF — getMeteoConfig
  // observes the new value immediately on next read (covers tests + the
  // common no-encryption case). When encryption is ON, skip the sync
  // plaintext write so we don't briefly expose the bearer on disk; reads
  // in the gap fall back to the in-memory cache populated above.
  let encryptionOn = false;
  try { encryptionOn = getEncryptionEnabled(); } catch {}
  if (!encryptionOn) {
    try { localStorage.setItem(STORAGE_KEY, json); } catch {}
    return;
  }
  // Encryption ON — async write through encryptedSetItem so the bearer
  // is encrypted at rest. Fire-and-forget; existing callers don't await.
  (async () => {
    try {
      await encryptedSetItem(STORAGE_KEY, json);
    } catch (_) {
      // Last-resort fallback so a crypto.js failure doesn't lose the save
      try { localStorage.setItem(STORAGE_KEY, json); } catch {}
    }
  })();
}

function defaultConfig() {
  return {
    // 'auto'       — CAMS direct UV/composition + satellite/Open-Meteo context
    // 'open-meteo' — Open-Meteo only, skip CAMS (privacy from CDS-API)
    // 'selfhost'   — user-run getbased-uvdata server (full privacy)
    // Legacy values 'cams', 'noaa', and 'manual' migrate to 'auto' on load.
    mode: 'auto',
    selfhostUrl: '',       // user's getbased-uvdata server URL
    selfhostBearer: '',    // optional bearer token for selfhost
    privacyRounding: 0.1,  // round lat/lon to this precision (deg) before network calls
  };
}
