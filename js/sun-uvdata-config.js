// @ts-check
// sun-uvdata-config.js - encrypted Sun/UV data source config storage.

import { encryptedGetItem, encryptedSetCredentialItem } from './crypto.js';

//
// Storage: meteo config (mode, selfhostUrl, selfhostBearer, privacyRounding)
// is always encrypted at rest via crypto.js's credential storage wrapper.
// `selfhostBearer` is sensitive — same threat-model class as the AI provider
// keys. The key `labcharts-meteo-config` is in `SENSITIVE_PATTERNS` (crypto.js)
// so it is device-encrypted even when profile encryption is disabled.
//
// To preserve the existing synchronous getMeteoConfig() API (sun-context.js,
// settings.js, the Sun-data-source picker all call it from sync paths),
// the decrypted config is cached in module state, refreshed at startup
// via initMeteoConfigCache(), and re-refreshed on encryption-state changes
// (disableEncryption / passphrase change). Legacy plaintext reads remain
// supported long enough for startup migration.
//

const STORAGE_KEY = 'labcharts-meteo-config';
let _warnedAboutEmptySelfhost = false;
// Sync-friendly decrypted-config cache. Populated by initMeteoConfigCache()
// on startup + after every saveMeteoConfig(). Lets the rest of the app
// keep calling getMeteoConfig() synchronously even though the at-rest
// representation is AES-GCM-encrypted via encryptedGetItem.
let _meteoConfigCache = null;
// Serialize encrypted writes so rapid settings changes cannot finish out of
// order. The previous durable envelope remains in place until its replacement
// has been encrypted successfully.
let _meteoPersistTail = Promise.resolve();
let _meteoPendingSaves = 0;

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
// through either the passphrase key or the device-local credential key).
// Called at startup from main.js's init
// sequence, and after encryption-state changes. Migration of pre-encrypt
// plaintext configs is automatic: encryptedGetItem returns the plaintext
// on first read, then saveMeteoConfig's credential wrapper writes it back
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
      await saveMeteoConfig(cfg);
    }
  } catch (e) {
    _meteoConfigCache = defaultConfig();
  }
}

export function getMeteoConfig() {
  // While a queued secure write is pending, the cache is the newest value;
  // localStorage intentionally still contains the previous durable record.
  if (_meteoPendingSaves > 0 && _meteoConfigCache) {
    const { cfg } = _applyConfigRuntimeFixups(Object.assign({}, _meteoConfigCache));
    return cfg;
  }
  // Read localStorage every call so direct writes (tests, cross-tab)
  // are observed without cache invalidation gymnastics. Only the
  // encrypted-envelope path needs the cache (decryption is async; the
  // cache holds the post-startup decrypted form so this function can
  // stay synchronous).
  let raw;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { raw = null; }
  if (!raw) {
    if (_meteoConfigCache) {
      const { cfg } = _applyConfigRuntimeFixups(Object.assign({}, _meteoConfigCache));
      return cfg;
    }
    return defaultConfig();
  }
  // Encrypted envelope — return the decrypted form from the cache that
  // initMeteoConfigCache populated at startup. If the cache is empty
  // (race window or test env), fall back to defaults rather than treat
  // ciphertext as JSON.
  if (typeof raw === 'string' && (raw.startsWith('v1:') || raw.startsWith('d1:'))) {
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
      try { void saveMeteoConfig(out); } catch {}
    }
    return out;
  } catch (e) {
    return defaultConfig();
  }
}

export function saveMeteoConfig(cfg) {
  // Cache update first — keeps the synchronous getMeteoConfig contract
  // working immediately while the encrypted write completes.
  _meteoConfigCache = _buildConfigFromParsed(cfg);
  const json = JSON.stringify(_meteoConfigCache);
  _meteoPendingSaves += 1;
  const write = _meteoPersistTail.then(() => encryptedSetCredentialItem(STORAGE_KEY, json));
  const result = write.then(
    () => true,
    error => {
      console.warn('[meteo] secure config persistence failed', error);
      return false;
    },
  ).finally(() => { _meteoPendingSaves -= 1; });
  // Keep the queue live after a failed write so a later settings change can
  // retry. `result` always resolves and therefore is also safe to ignore at
  // legacy synchronous call sites.
  _meteoPersistTail = result.then(() => undefined);
  return result;
}

function defaultConfig() {
  return {
    // 'auto'       — narrow CAMS relay + browser-direct Open-Meteo fallback
    // 'open-meteo' — browser-direct Open-Meteo
    // 'selfhost'   — user-run getbased-uvdata server (full privacy)
    // Legacy values 'cams', 'noaa', and 'manual' migrate to 'auto' on load.
    mode: 'auto',
    selfhostUrl: '',       // user's getbased-uvdata server URL
    selfhostBearer: '',    // optional bearer token for selfhost
    privacyRounding: 0.1,  // round lat/lon to this precision (deg) before network calls
  };
}
