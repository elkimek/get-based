// @ts-check
// sync-messenger.js - Agent Access token and context gateway helpers.

import { state } from './state.js';
import { bindSyncAppliedRefresh } from './utils.js';
import { addUtilsRuntimeListener } from './utils-runtime.js';
import { isDemoProfileId } from './profile-sync-policy.js';

const MESSENGER_TOKEN_KEY = 'labcharts-messenger-token';
const MESSENGER_ENABLED_KEY = 'labcharts-messenger-enabled';
const MESSENGER_CONTEXT_KEY_KEY = 'labcharts-agent-context-key';
const AGENT_ACCESS_SYNC_VERSION = 1;

/** @type {() => string} */
let _getSyncRelay = () => 'wss://sync.getbased.health';
/** @type {() => any} */
let _getAppOwner = () => null;
/** @type {(...args: any[]) => void} */
let _debug = () => {};
/** @type {(options?: any) => string} */
let _buildLabContext = () => '';
/** @type {(days: number, options?: any) => Promise<string>} */
let _buildWearableSeriesSection = async () => '';
/** @type {() => number} */
let _getAgentWearableSeriesDays = () => 0;
/** @type {() => any[]} */
let _getProfiles = () => [];
/** @type {number | null} */
let _contextPushTimer = null;
let _agentAccessMigrationDirty = false;

function cancelPendingContextPush() {
  if (_contextPushTimer != null) {
    clearTimeout(_contextPushTimer);
    _contextPushTimer = null;
  }
}

/** @param {{
 *   getSyncRelay?: () => string,
 *   getAppOwner?: () => any,
 *   debug?: (...args: any[]) => void,
 *   buildLabContext?: (options?: any) => string,
 *   buildWearableSeriesSection?: (days: number, options?: any) => Promise<string>,
 *   getAgentWearableSeriesDays?: () => number,
 *   getProfiles?: () => any[],
 * }} [deps]
 */
export function configureSyncMessenger({
  getSyncRelay,
  getAppOwner,
  debug,
  buildLabContext,
  buildWearableSeriesSection,
  getAgentWearableSeriesDays,
  getProfiles,
} = {}) {
  if (typeof getSyncRelay === 'function') _getSyncRelay = getSyncRelay;
  if (typeof getAppOwner === 'function') _getAppOwner = getAppOwner;
  if (typeof debug === 'function') _debug = debug;
  if (typeof buildLabContext === 'function') _buildLabContext = buildLabContext;
  if (typeof buildWearableSeriesSection === 'function') _buildWearableSeriesSection = buildWearableSeriesSection;
  if (typeof getAgentWearableSeriesDays === 'function') _getAgentWearableSeriesDays = getAgentWearableSeriesDays;
  if (typeof getProfiles === 'function') _getProfiles = getProfiles;
}

function currentSyncRelay() {
  try { return _getSyncRelay?.() || 'wss://sync.getbased.health'; } catch { return 'wss://sync.getbased.health'; }
}

function currentAppOwner() {
  try { return _getAppOwner?.() || null; } catch { return null; }
}

function dbg(...args) {
  try { _debug(...args); } catch {}
}

function buildLabContext(options) {
  return _buildLabContext(options);
}

function buildWearableSeriesSection(days, options) {
  return _buildWearableSeriesSection(days, options);
}

function getAgentWearableSeriesDays() {
  return _getAgentWearableSeriesDays();
}

function nowTs() { return Date.now(); }

function currentAgentAccess() {
  if (!state.importedData) (/** @type {any} */ (state)).importedData = { entries: [] };
  const imported = /** @type {any} */ (state.importedData);
  const aa = imported.agentAccess;
  return (aa && typeof aa === 'object') ? aa : null;
}

function writeAgentAccess(patch) {
  const prev = currentAgentAccess() || {};
  const next = {
    version: AGENT_ACCESS_SYNC_VERSION,
    ...prev,
    ...patch,
    updatedAt: nowTs(),
  };
  if (!state.importedData) (/** @type {any} */ (state)).importedData = { entries: [] };
  (/** @type {any} */ (state.importedData)).agentAccess = next;
  return next;
}

function legacyLocalEnabled() {
  try { return localStorage.getItem(MESSENGER_ENABLED_KEY) === 'true'; } catch { return false; }
}

function legacyLocalToken() {
  try { return localStorage.getItem(MESSENGER_TOKEN_KEY) || null; } catch { return null; }
}

function legacyLocalContextKey() {
  try { return localStorage.getItem(MESSENGER_CONTEXT_KEY_KEY) || null; } catch { return null; }
}

const AGENT_SERIES_DAYS = [0, 7, 30, 90];

function normalizeAgentSeriesDays(days) {
  const n = Number(days) || 0;
  return AGENT_SERIES_DAYS.includes(n) ? n : 0;
}

function currentAgentWearableSeriesDays(aa = currentAgentAccess()) {
  if (!state.importedData) (/** @type {any} */ (state)).importedData = { entries: [] };
  const imported = /** @type {any} */ (state.importedData);
  if (typeof imported.agentAccessWearableSeriesDays === 'number') {
    return normalizeAgentSeriesDays(imported.agentAccessWearableSeriesDays);
  }
  if (typeof aa?.wearableSeriesDays === 'number') return normalizeAgentSeriesDays(aa.wearableSeriesDays);
  // In this sync-layer API, 0 means "no synced series preference". Explicit
  // migration/refresh paths promote legacy localStorage before callers that need
  // migrated Agent Access state read this value. The public lab-context getter
  // uses null internally so it can still fall through to the legacy key before
  // migration.
  return 0;
}

let _lastAgentAccessMigrationSignature = null;

export function _resetAgentAccessMigrationStateForTesting() {
  _lastAgentAccessMigrationSignature = null;
  _agentAccessMigrationDirty = false;
}

export function isAgentAccessMigrationDirty() {
  return _agentAccessMigrationDirty;
}

export function clearAgentAccessMigrationDirty() {
  _agentAccessMigrationDirty = false;
}

export function clearLegacyAgentAccessSecrets() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(MESSENGER_TOKEN_KEY);
    localStorage.removeItem(MESSENGER_CONTEXT_KEY_KEY);
  } catch {}
}

function agentAccessMigrationSignature(existing, enabled, token, legacyContextKey) {
  const pid = state.currentProfile || (typeof localStorage !== 'undefined' && localStorage.getItem('labcharts-active-profile')) || 'default';
  // Deliberately exclude importedData.agentAccessWearableSeriesDays: that split
  // preference scalar is mirrored by setAgentAccessWearableSeriesDays() and
  // refreshAgentAccessFromSyncedProfile(), so preference-only changes must not
  // invalidate the one-shot credential migration signature.
  return [
    pid,
    existing?.updatedAt || '',
    existing?.enabled === true ? '1' : '0',
    existing?.token || '',
    existing?.contextKey || '',
    existing?.revokedAt || '',
    enabled ? '1' : '0',
    token || '',
    legacyContextKey || '',
  ].join('|');
}

export function migrateLocalAgentAccessToProfile() {
  const existing = currentAgentAccess();
  const enabled = legacyLocalEnabled();
  const token = legacyLocalToken();
  const legacyContextKey = legacyLocalContextKey();
  const signature = agentAccessMigrationSignature(existing, enabled, token, legacyContextKey);
  if (signature === _lastAgentAccessMigrationSignature) return existing || null;
  const contextKey = legacyContextKey || existing?.contextKey || (enabled && token ? generateAgentContextKeyValue() : null);
  // A synced revoke is an explicit cross-device credential tombstone. Mirror it
  // down to this origin and never let stale legacy localStorage resurrect the
  // token/context key after another device disabled Agent Access.
  // A legacy localStorage toggle is an explicit browser-local state only until
  // the first migration. After sync has any Agent Access credential or revoke
  // tombstone, the synced profile is authoritative: stale localStorage is only
  // repaired from sync, never written back over a newer token/key/revoke.
  const hasSyncedAgentAccess = !!(existing?.token || existing?.contextKey || existing?.enabled === true || existing?.revokedAt);
  if (hasSyncedAgentAccess) {
    if (existing?.revokedAt && existing.enabled !== true) {
      mirrorAgentAccessToLegacyLocalStorage(existing);
      _lastAgentAccessMigrationSignature = signature;
      return existing;
    }
    if (!(enabled && token)) {
      mirrorAgentAccessToLegacyLocalStorage(existing);
      _lastAgentAccessMigrationSignature = signature;
      return existing;
    }
    const tokenChanged = !!(existing.token && token && token !== existing.token);
    const contextKeyChanged = !!(existing.contextKey && legacyContextKey && legacyContextKey !== existing.contextKey);
    if (tokenChanged || contextKeyChanged) {
      mirrorAgentAccessToLegacyLocalStorage(existing);
      _lastAgentAccessMigrationSignature = signature;
      return existing;
    }
    // Matching legacy credentials are just a mirror of the synced profile. Do
    // not rewrite the credential scalar from localStorage, because that can
    // recompute preference fields from stale/missing legacy keys on read.
    _lastAgentAccessMigrationSignature = signature;
    return existing;
  }
  const seriesDays = (() => {
    try {
      const pid = state.currentProfile || localStorage.getItem('labcharts-active-profile') || 'default';
      const raw = localStorage.getItem(`labcharts-${pid}-agent-wearable-series`)
        || localStorage.getItem('labcharts-agent-wearable-series-days');
      if (raw === 'on') return 30;
      if (raw === 'off' || raw == null) return 0;
      const n = Number(raw);
      return [0, 7, 30, 90].includes(n) ? n : 0;
    } catch { return 0; }
  })();
  if (!enabled && !token && !contextKey) {
    _lastAgentAccessMigrationSignature = signature;
    return null;
  }
  if (!state.importedData) (/** @type {any} */ (state)).importedData = { entries: [] };
  (/** @type {any} */ (state.importedData)).agentAccessWearableSeriesDays = seriesDays;
  const migrated = writeAgentAccess({
    enabled: !!(enabled && token && contextKey),
    token: token || null,
    contextKey: contextKey || null,
    migratedFromLocalStorageAt: nowTs(),
  });
  _agentAccessMigrationDirty = true;
  _lastAgentAccessMigrationSignature = agentAccessMigrationSignature(migrated, enabled, token, legacyContextKey);
  return migrated;
}

function mirrorAgentAccessToLegacyLocalStorage(aa = currentAgentAccess()) {
  if (!aa || typeof localStorage === 'undefined') return;
  try {
    if (aa.enabled) localStorage.setItem(MESSENGER_ENABLED_KEY, 'true');
    else localStorage.setItem(MESSENGER_ENABLED_KEY, 'false');
    // One-shot legacy migration source only: after Agent Access is represented
    // inside encrypted profile data, never mirror raw bearer/decryption secrets
    // back into same-origin localStorage. UI reads credentials from synced
    // `state.importedData.agentAccess` instead.
    clearLegacyAgentAccessSecrets();
    const wearableSeriesDays = typeof aa?.wearableSeriesDays === 'number'
      ? normalizeAgentSeriesDays(aa.wearableSeriesDays)
      : currentAgentWearableSeriesDays(aa);
    if (typeof wearableSeriesDays === 'number') {
      const pid = state.currentProfile || localStorage.getItem('labcharts-active-profile') || 'default';
      localStorage.setItem(`labcharts-${pid}-agent-wearable-series`, wearableSeriesDays > 0 ? String(wearableSeriesDays) : 'off');
    }
  } catch {}
}

export function getAgentAccessState() {
  const aa = currentAgentAccess() || {
    version: AGENT_ACCESS_SYNC_VERSION,
    enabled: false,
    token: null,
    contextKey: null,
    wearableSeriesDays: 0,
  };
  return { ...aa, wearableSeriesDays: currentAgentWearableSeriesDays(aa) };
}

export function setAgentAccessWearableSeriesDays(days) {
  const raw = Number(days) || 0;
  if (!AGENT_SERIES_DAYS.includes(raw)) return null;
  const n = normalizeAgentSeriesDays(raw);
  const aa = currentAgentAccess() || (migrateLocalAgentAccessToProfile(), currentAgentAccess());
  if (!state.importedData) (/** @type {any} */ (state)).importedData = { entries: [] };
  (/** @type {any} */ (state.importedData)).agentAccessWearableSeriesDays = n;
  mirrorAgentAccessToLegacyLocalStorage(aa || { enabled: false, token: null, contextKey: null, wearableSeriesDays: n });
  return n;
}

export function refreshAgentAccessFromSyncedProfile({ migrateLegacy = true, clearWhenMissing = false } = {}) {
  const migrated = migrateLegacy ? migrateLocalAgentAccessToProfile() : null;
  const aa = migrated || currentAgentAccess();
  if (!aa) {
    const fallbackSeriesDays = clearWhenMissing ? 0 : currentAgentWearableSeriesDays(null);
    if (clearWhenMissing && state.importedData) {
      (/** @type {any} */ (state.importedData)).agentAccessWearableSeriesDays = fallbackSeriesDays;
    }
    const fallback = {
      version: AGENT_ACCESS_SYNC_VERSION,
      enabled: false,
      token: null,
      contextKey: null,
      wearableSeriesDays: fallbackSeriesDays,
    };
    if (clearWhenMissing) mirrorAgentAccessToLegacyLocalStorage(fallback);
    return fallback;
  }
  const withSeries = { ...aa, wearableSeriesDays: currentAgentWearableSeriesDays(aa) };
  mirrorAgentAccessToLegacyLocalStorage(withSeries);
  return withSeries;
}

bindSyncAppliedRefresh(() => { refreshAgentAccessFromSyncedProfile({ migrateLegacy: true }); });
addUtilsRuntimeListener('labcharts-profile-switched', () => {
  refreshAgentAccessFromSyncedProfile({ migrateLegacy: false, clearWhenMissing: true });
});

const AGENT_CONTEXT_CRYPTO_VERSION = 2;
const AGENT_CONTEXT_AAD_PREFIX = 'getbased-agent-context-v2';

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function ownerIdString(owner) {
  if (!owner?.id) return null;
  return String(owner.id);
}

function ownerWriteKeyBytes(owner) {
  if (!owner?.writeKey) return null;
  return owner.writeKey instanceof Uint8Array ? owner.writeKey : new Uint8Array(owner.writeKey);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return bytesToHex(new Uint8Array(digest));
}

async function signAgentContextRequest({ owner, token, profileId, relayContext, timestamp }) {
  if (!crypto?.subtle) throw new Error('Agent Access owner signing requires WebCrypto');
  const ownerId = ownerIdString(owner);
  const writeKey = ownerWriteKeyBytes(owner);
  if (!ownerId || !writeKey) throw new Error('Agent Access requires Sync identity — enable or restore Cross-device Sync first');
  const tokenHash = await sha256Hex(token);
  const contextHash = await sha256Hex(relayContext);
  const key = await crypto.subtle.importKey('raw', writeKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const message = `agent-context:${ownerId}:${timestamp}:${tokenHash}:${profileId || 'default'}:${contextHash}`;
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return { ownerId, tokenHash, contextHash, signature: bytesToHex(new Uint8Array(signature)) };
}

function base64UrlToBytes(value) {
  const raw = String(value || '').trim();
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=');
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function generateAgentContextKeyValue() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `gbctx_v1_${bytesToBase64Url(bytes)}`;
}

function decodeAgentContextKey(keyValue) {
  const trimmed = String(keyValue || '').trim();
  const encoded = trimmed.startsWith('gbctx_v1_') ? trimmed.slice('gbctx_v1_'.length) : trimmed;
  const bytes = base64UrlToBytes(encoded);
  if (bytes.length !== 32) throw new Error('Agent Context key must decode to 32 bytes');
  return bytes;
}

async function agentContextKeyId(rawKeyBytes) {
  const digest = await crypto.subtle.digest('SHA-256', rawKeyBytes);
  return bytesToBase64Url(new Uint8Array(digest).slice(0, 12));
}

async function importAgentContextCryptoKey(rawKeyBytes) {
  if (!crypto?.subtle) throw new Error('Agent Access encryption requires WebCrypto');
  return crypto.subtle.importKey('raw', rawKeyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
}

export async function encryptAgentContextForRelay(context, contextKey, profileId) {
  const rawKey = decodeAgentContextKey(contextKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAgentContextCryptoKey(rawKey);
  const aad = new TextEncoder().encode(`${AGENT_CONTEXT_AAD_PREFIX}:${profileId || 'default'}`);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    new TextEncoder().encode(String(context || '')),
  );
  return {
    version: AGENT_CONTEXT_CRYPTO_VERSION,
    alg: 'AES-256-GCM',
    keyDerivation: 'raw-256-bit-key',
    keyId: await agentContextKeyId(rawKey),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export function isMessengerEnabled() {
  const aa = getAgentAccessState();
  return !!(aa.enabled && aa.token && aa.contextKey);
}

export function getMessengerToken() {
  const aa = getAgentAccessState();
  return aa.token || null;
}

export function getMessengerContextKey() {
  const aa = getAgentAccessState();
  return aa.contextKey || null;
}

export function hasMessengerSyncIdentity() {
  const owner = currentAppOwner();
  return !!(ownerIdString(owner) && ownerWriteKeyBytes(owner));
}

export function ensureMessengerContextKey() {
  const existing = getMessengerContextKey();
  if (existing) return existing;
  const key = generateAgentContextKeyValue();
  const aa = writeAgentAccess({ contextKey: key });
  mirrorAgentAccessToLegacyLocalStorage(aa);
  return key;
}

export function generateMessengerContextKey() {
  const current = getAgentAccessState();
  const key = generateAgentContextKeyValue();
  const aa = writeAgentAccess({ contextKey: key, enabled: current.enabled === true });
  mirrorAgentAccessToLegacyLocalStorage(aa);
  return key;
}

export function revokeMessengerTokenRemote(token) {
  if (!token) return;
  const owner = currentAppOwner();
  const relay = currentSyncRelay().replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
  const profileId = state.currentProfile || (typeof localStorage !== 'undefined' && localStorage.getItem('labcharts-active-profile')) || 'default';
  const relayContext = '';
  const timestamp = Date.now();
  signAgentContextRequest({ owner, token, profileId, relayContext, timestamp })
    .then(ownerProof => fetch(`${relay}/api/context`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ownerId: ownerProof.ownerId,
        profileId,
        context: relayContext,
        timestamp,
        signature: ownerProof.signature,
      }),
    }))
    .then(res => {
      if (res && !res.ok) dbg(`Agent Access revoke returned ${res.status}`);
    })
    .catch(e => {
      // Local revocation still wins; the relay mapping expires by token
      // rotation/owner limits, and the user can delete relay data from the
      // server if this browser has already lost the Sync identity.
      console.warn('[sync] Agent Access remote revoke failed:', e);
    });
}

export function generateMessengerToken() {
  migrateLocalAgentAccessToProfile();
  const previousToken = getMessengerToken();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const contextKey = getMessengerContextKey() || generateAgentContextKeyValue();
  const aa = writeAgentAccess({
    enabled: true,
    token,
    contextKey,
    credentialCreatedAt: nowTs(),
    revokedAt: null,
  });
  mirrorAgentAccessToLegacyLocalStorage(aa);
  return { token, previousToken };
}

export function disableMessengerTokenLocal() {
  cancelPendingContextPush();
  const previousToken = getMessengerToken();
  const aa = writeAgentAccess({
    enabled: false,
    token: null,
    contextKey: null,
    revokedAt: nowTs(),
  });
  mirrorAgentAccessToLegacyLocalStorage(aa);
  return previousToken;
}

export function revokeMessengerToken() {
  const token = disableMessengerTokenLocal();
  revokeMessengerTokenRemote(token);
}

export function pushContextToGateway() {
  cancelPendingContextPush();
  migrateLocalAgentAccessToProfile();
  if (!isMessengerEnabled()) return;
  const token = getMessengerToken();
  if (!token) return;
  const contextKey = ensureMessengerContextKey();
  const profileId = state.currentProfile || 'default';
  // Demo profiles are intentionally local-only. Agent Access uses a separate
  // relay endpoint, so the Evolu push guard alone is not sufficient.
  if (isDemoProfileId(profileId, _getProfiles())) return;

  _contextPushTimer = setTimeout(async () => {
    try {
      const latest = getAgentAccessState();
      if (state.currentProfile !== profileId
        || latest.enabled !== true
        || latest.token !== token
        || latest.contextKey !== contextKey) {
        dbg(`Skipped stale Agent Access context push (profile: ${profileId})`);
        return;
      }
      const baseContext = buildLabContext({ skipGroupFilter: true, ignoreContextToggles: true });
      // Optional wearable daily-series section - user picks 0 (off) / 7 /
      // 30 / 90 days in Settings -> Agent Access. Reads L1 IDB on the
      // browser. Before anything touches the relay, encrypt the rendered
      // context locally with a dedicated Agent Context key. The Agent Access
      // token authorizes relay fetches; it is not AES key material.
      // Append AFTER the rest so the section parser treats it as a sibling.
      const seriesDays = getAgentWearableSeriesDays();
      const seriesBlock = seriesDays > 0
        ? await buildWearableSeriesSection(seriesDays, { ignoreContextToggles: true }).catch(() => '')
        : '';
      const context = seriesBlock ? `${baseContext}\n${seriesBlock}\n` : baseContext;
      const encryptedContext = await encryptAgentContextForRelay(context, contextKey, profileId);
      // The gateway only needs the active profileId - do not leak the full
      // profile-name list. Profile names can include real names; keep them
      // out of the relay envelope entirely.
      const relay = currentSyncRelay().replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

      const relayContext = JSON.stringify({ encryptedContext });
      const timestamp = Date.now();
      const ownerProof = await signAgentContextRequest({
        owner: currentAppOwner(),
        token,
        profileId,
        relayContext,
        timestamp,
      });
      const res = await fetch(`${relay}/api/context`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId,
          context: relayContext,
          ownerId: ownerProof.ownerId,
          timestamp,
          signature: ownerProof.signature,
        }),
      });
      if (!res.ok) {
        let detail = '';
        try {
          const body = await res.text();
          detail = body ? `: ${body.slice(0, 240)}` : '';
        } catch {}
        throw new Error(`Gateway returned ${res.status}${detail}`);
      }
      dbg(`Encrypted context pushed to gateway (profile: ${profileId}, series: ${seriesBlock ? 'yes' : 'no'})`);
    } catch (e) {
      console.warn('[sync] Context push failed:', e);
    }
  }, 5000); // 5s debounce - less urgent than sync
}
