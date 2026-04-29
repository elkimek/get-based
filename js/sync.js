// sync.js — Evolu sync layer (opt-in, E2E encrypted)
// Stores importedData + profile metadata per profile as a JSON blob.
// Last-write-wins at the profile level — fine for single-user cross-device sync.

import { state } from './state.js';
import { showNotification, isDebugMode, escapeHTML } from './utils.js';
import { profileStorageKey, getProfiles, saveProfiles, migrateProfileData, loadProfile } from './profile.js';
import { getEncryptionEnabled, encryptedSetItem, encryptedGetItem } from './crypto.js';

function dbg(...args) { if (isDebugMode()) console.log('[sync]', ...args); }

let evolu = null;
let profileQuery = null;
let tombstoneQuery = null;
let _syncEnabled = false;
let _syncing = false;
let _pulling = false;
let _appOwner = null;
let _appOwnerError = null;
let _readyPromise = null;
let _queryLoaded = null;
// Per-profile debounce timers. Switching profiles mid-debounce previously
// dropped the pending push for the prior profile because the single shared
// timer was overwritten. Keyed by profileId so each profile's pending push
// survives until it fires.
const _debounceTimers = new Map();
let _pollInterval = null;
let _lastPollRowCount = -1;
let _subscriptionFireCount = 0;
let _relayProbeInterval = null;

// ═══════════════════════════════════════════════
// SYNC STATUS — in-memory state + pub-sub
// ═══════════════════════════════════════════════

const _syncStatus = {
  relay: 'unknown',        // 'unknown' | 'connected' | 'unreachable'
  relayCheckedAt: null,
  push: 'idle',            // 'idle' | 'pending' | 'confirmed' | 'error'
  pushStartedAt: null,
  pushConfirmedAt: null,
  pull: 'idle',            // 'idle' | 'pulling' | 'received'
  pullReceivedAt: null,
  lastError: null,
};
const _syncStatusListeners = new Set();

function updateSyncStatus(partial) {
  Object.assign(_syncStatus, partial);
  for (const fn of _syncStatusListeners) fn(_syncStatus);
}

export function subscribeSyncStatus(fn) {
  _syncStatusListeners.add(fn);
  return () => _syncStatusListeners.delete(fn);
}

function getSyncDisplayState() {
  if (!_syncEnabled) return 'disabled';
  if (_syncStatus.lastError && _syncStatus.push === 'error') return 'error';
  if (_syncStatus.push === 'pending' && _syncStatus.pushStartedAt && Date.now() - _syncStatus.pushStartedAt > 8000) return 'error';
  if (_syncStatus.relay === 'unreachable') return 'offline';
  if (_syncStatus.push === 'pending' || _syncStatus.pull === 'pulling') return 'syncing';
  return 'synced';
}

// ═══════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════

const SYNC_STORAGE_KEY = 'labcharts-sync-enabled';
const SYNC_RELAY_KEY = 'labcharts-sync-relay';
const DEFAULT_RELAY = 'wss://sync.getbased.health';
const ONION_RELAY = 'ws://udou6gehyfpfccdjpibmuttaoauawmh5cgzszffnskbvczppvr2sfjad.onion';

export function isSyncEnabled() { return _syncEnabled; }

export function getSyncRelay() {
  const custom = localStorage.getItem(SYNC_RELAY_KEY);
  // On .onion, always use the onion relay (ignore stored clearnet relay)
  if (window.location.hostname.endsWith('.onion')) return ONION_RELAY;
  return custom || DEFAULT_RELAY;
}

export function setSyncRelay(url) {
  localStorage.setItem(SYNC_RELAY_KEY, url);
}

// Probe relay connectivity via a test WebSocket
export function checkRelayConnection(timeout = 4000) {
  return new Promise(resolve => {
    const relay = getSyncRelay();
    try {
      const ws = new WebSocket(relay + '/ping');
      const timer = setTimeout(() => { ws.close(); resolve(false); }, timeout);
      ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(true); };
      ws.onerror = () => { clearTimeout(timer); ws.close(); resolve(false); };
    } catch { resolve(false); }
  });
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════

/**
 * Returns null when sync is supported, or a human-readable reason string
 * when it isn't. Used to fail-fast with a clear message instead of letting
 * Evolu's worker hang for 30s on a missing primitive.
 *
 * Evolu uses dedicated Workers coordinated across tabs via BroadcastChannel
 * + navigator.locks (see createSharedWebWorker in evolu-bundle.js — the
 * "Shared" in the name refers to cross-tab sharing, not the SharedWorker
 * API). So the real requirements are locks + OPFS + WebCrypto.
 */
export function getSyncBlocker() {
  if (!navigator.locks?.request) return 'navigator.locks not available — browser missing Web Locks API';
  if (!navigator.storage) return 'navigator.storage not available — browser missing StorageManager API. Upgrade to a current browser (Chrome 86+, Firefox 105+, Safari 15.2+) for cross-device sync.';
  if (!navigator.storage.getDirectory) return 'OPFS (Origin Private File System) not available. Upgrade to a current browser for cross-device sync.';
  if (!crypto?.subtle) return 'crypto.subtle (WebCrypto) not available';
  return null;
}

export async function initSync() {
  _syncEnabled = localStorage.getItem(SYNC_STORAGE_KEY) === 'true';
  if (!_syncEnabled) return;

  // Fail fast if the webview doesn't have what Evolu needs. Otherwise the
  // worker hangs forever on appOwner and the toggle/restore flow looks
  // mysteriously broken — exactly the rabbit hole we just spent an hour in.
  const blocker = getSyncBlocker();
  if (blocker) {
    _appOwnerError = blocker;
    console.warn('[sync] Cannot init:', blocker);
    return;
  }

  // Re-entrancy guard — don't create duplicate Evolu instances
  if (evolu) return;

  // Defer to next microtask — Worker + navigator.locks can race during DOMContentLoaded
  await new Promise(r => setTimeout(r, 0));

  try {
    const { createEvolu, id, nullOr, SimpleName, NonEmptyString1000, NonEmptyString, evoluWebDeps } =
      await import('../vendor/evolu/evolu-bundle.js');

    const ProfileDataId = id("ProfileData");
    const Schema = {
      profileData: {
        id: ProfileDataId,
        profileId: NonEmptyString,
        dataJson: NonEmptyString,
        syncedAt: nullOr(NonEmptyString),
      },
    };

    const relay = getSyncRelay();
    evolu = createEvolu(evoluWebDeps)(Schema, {
      name: SimpleName.orThrow("getbased4"),
      reloadUrl: window.location.pathname,
      enableLogging: isDebugMode(),
      transports: [{ type: "WebSocket", url: relay }],
    });

    // Query all profile data rows
    profileQuery = evolu.createQuery((db) =>
      db.selectFrom("profileData")
        .selectAll()
        .where("isDeleted", "is not", 1)
    );

    // Companion query that returns ONLY tombstoned rows. Used during pull
    // to apply remote deletes locally — when device A tombstones profile X,
    // device B sees X here and wipes its local copy. Without this, B's
    // local profiles list keeps showing X even though A "deleted" it.
    tombstoneQuery = evolu.createQuery((db) =>
      db.selectFrom("profileData")
        .selectAll()
        .where("isDeleted", "=", 1)
    );

    // Subscribe to sync updates
    evolu.subscribeQuery(profileQuery)(() => {
      _subscriptionFireCount++;
      dbg(`subscription fired (#${_subscriptionFireCount}), syncing: ${_syncing}, pulling: ${_pulling}`);
      if (!_syncing && !_pulling) onSyncReceived();
    });

    // Load initial data — store promise for enableSync to await
    _queryLoaded = Promise.all([
      evolu.loadQuery(profileQuery),
      evolu.loadQuery(tombstoneQuery),
    ]).then(() => {
      dbg('Initial queries loaded');
    }).catch(e => {
      console.warn('[sync] Query load failed:', e);
    });

    // Wait for owner (mnemonic) — signals DB is ready
    _readyPromise = evolu.appOwner.then(owner => {
      _appOwner = owner;
      _appOwnerError = null;
      dbg('Owner resolved');
    }).catch(e => {
      // Don't silently swallow — Settings → Data shows "Resolving…" while
      // _appOwner is null and there's no other signal the user gets. We
      // stash the message so the UI can surface it instead of timing out
      // after 30s with the unhelpful "Could not resolve mnemonic".
      _appOwnerError = e?.message || String(e);
      console.warn('[sync] Owner resolution failed:', e);
    });

    // Debug helper. Gated on isDebugMode() — earlier versions exposed this
    // unconditionally, which leaked the BIP-39 mnemonic to anyone with
    // console access (screen-share, malicious extension, MCP evaluate_script
    // capability). The mnemonic decrypts every Evolu blob ever pushed to
    // the relay, so this had to be opt-in. Toggle Settings → Privacy →
    // Debug mode to expose.
    if (isDebugMode?.()) {
      window._syncDebug = {
        getRows: () => evolu.getQueryRows(profileQuery),
        getOwner: () => _appOwner,
        evolu,
      };
    }

    // Poll every 30s as safety net — subscribeQuery may miss remote changes
    _pollInterval = setInterval(() => {
      if (!evolu || !profileQuery || _syncing || _pulling) return;
      const rows = evolu.getQueryRows(profileQuery);
      const count = rows?.length ?? 0;
      if (count !== _lastPollRowCount) {
        dbg(`poll: row count changed ${_lastPollRowCount} → ${count}, triggering onSyncReceived`);
        _lastPollRowCount = count;
        onSyncReceived();
      }
    }, 30000);

    // Subscribe to Evolu errors — catches relay connection failures
    evolu.subscribeError((error) => {
      if (!error) return;
      const type = error?.type || 'unknown';
      dbg('Evolu error:', type);
      if (type.startsWith('WebSocket')) {
        updateSyncStatus({ relay: 'unreachable', lastError: { type, message: type, at: Date.now() } });
      }
    });

    // Initial relay probe + periodic 60s health check
    checkRelayConnection().then(ok => {
      updateSyncStatus({ relay: ok ? 'connected' : 'unreachable', relayCheckedAt: Date.now() });
    });
    _relayProbeInterval = setInterval(async () => {
      const ok = await checkRelayConnection();
      updateSyncStatus({ relay: ok ? 'connected' : 'unreachable', relayCheckedAt: Date.now() });
    }, 60000);

    dbg('Initialized, relay:', relay);
  } catch (e) {
    console.error('[sync] Failed to initialize Evolu:', e);
    _syncEnabled = false;
  }
}

// ═══════════════════════════════════════════════
// ENABLE / DISABLE
// ═══════════════════════════════════════════════

export async function enableSync({ skipPush = false } = {}) {
  // Reject early if the webview can't actually run Evolu — no point flipping
  // the persisted flag and starting init only to time out at 30s.
  const blocker = getSyncBlocker();
  if (blocker) {
    showNotification(`Sync unavailable in this browser: ${blocker}`, 'error');
    return;
  }
  localStorage.setItem(SYNC_STORAGE_KEY, 'true');
  _syncEnabled = true;
  _appOwnerError = null;
  await initSync();
  if (!evolu || !_readyPromise) {
    // initSync bailed before evolu was created — likely an import / module
    // load failure. Already logged by initSync; surface a toast so the user
    // doesn't sit staring at a Resolving… spinner.
    showNotification(`Sync failed to initialize. ${_appOwnerError || 'Check console for [sync] errors.'}`, 'error');
    return;
  }
  // Race the owner-resolution promise against a 30s ceiling. A stuck
  // OPFS handle or a Web Lock that never resolves can leave Evolu's
  // appOwner promise pending forever — without this race the await
  // blocks toggleSync's finally, leaving the UI stuck.
  const timeout = new Promise(resolve => setTimeout(() => resolve('__timeout__'), 30000));
  const result = await Promise.race([_readyPromise.then(() => 'ok'), timeout]);
  if (result === '__timeout__' || !_appOwner) {
    const reason = _appOwnerError || 'Evolu owner did not resolve within 30s';
    showNotification(`Sync init failed: ${reason}`, 'error');
    return;
  }
  if (_queryLoaded) {
    // Cap query load too — same hang risk
    await Promise.race([_queryLoaded, new Promise(r => setTimeout(r, 30000))]);
  }
  if (!skipPush) {
    try { await pushAllProfiles(); } catch (e) { console.warn('[sync] initial push failed:', e); }
  }
  showNotification('Sync enabled', 'success');
  renderSyncIndicator();
}

export async function disableSync() {
  // Flip the persisted flag FIRST, before any awaits. If anything below
  // hangs (Evolu worker stuck on OPFS or a Web Lock), a manual page
  // reload will still see sync as off.
  localStorage.setItem(SYNC_STORAGE_KEY, 'false');
  _syncEnabled = false;
  _appOwnerError = null;

  // Stop background timers + reset status (UI feedback before the reload)
  if (_relayProbeInterval) { clearInterval(_relayProbeInterval); _relayProbeInterval = null; }
  for (const t of _debounceTimers.values()) clearTimeout(t);
  _debounceTimers.clear();
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
  Object.assign(_syncStatus, { relay: 'unknown', relayCheckedAt: null, push: 'idle', pushStartedAt: null, pushConfirmedAt: null, pull: 'idle', pullReceivedAt: null, lastError: null });
  for (const fn of _syncStatusListeners) fn(_syncStatus);
  renderSyncIndicator();

  // Clear sync timestamps so a fresh pull can happen after re-enable
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.endsWith('-sync-ts')) localStorage.removeItem(key);
  }

  // Fire-and-forget the Evolu reset. We can't trust this await: if the
  // worker is hung (OPFS / lock contention), `resetAppOwner` never
  // resolves and the user sees the toggle silently do nothing.
  // The page reload below kills the worker process anyway, so a
  // half-completed reset is harmless — the new tab boots clean.
  if (evolu) {
    try {
      Promise.resolve(evolu.resetAppOwner({ reload: false }))
        .catch(e => console.warn('[sync] Evolu reset failed (proceeding anyway):', e));
    } catch (e) {
      console.warn('[sync] Evolu reset threw synchronously:', e);
    }
  }

  // Drop in-memory references so any stray callers see fresh-state behavior
  evolu = null;
  profileQuery = null;
  _appOwner = null;
  _readyPromise = null;
  _queryLoaded = null;

  showNotification('Sync disabled — reloading…', 'success');
  // Reload regardless of whether Evolu cooperated. ~250ms gives the toast
  // time to render before the page swaps.
  setTimeout(() => window.location.reload(), 250);
}

// ═══════════════════════════════════════════════
// DIAGNOSTICS
// ═══════════════════════════════════════════════

function _syncDiag() {
  const info = {
    enabled: _syncEnabled,
    evoluReady: !!evolu,
    relay: getSyncRelay(),
    mnemonic: _appOwner?.mnemonic ? '<set>' : null,
    subscriptionFires: _subscriptionFireCount,
    syncing: _syncing,
    pulling: _pulling,
  };
  if (evolu && profileQuery) {
    const rows = evolu.getQueryRows(profileQuery);
    info.evoluRows = (rows || []).map(r => ({
      profileId: r.profileId,
      syncedAt: r.syncedAt,
      dataSize: r.dataJson?.length ?? 0,
    }));
  }
  // Show local sync timestamps
  const tsList = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.endsWith('-sync-ts')) {
      tsList.push({ key, ts: parseInt(localStorage.getItem(key), 10), date: new Date(parseInt(localStorage.getItem(key), 10)).toISOString() });
    }
  }
  info.localTimestamps = tsList;
  console.table?.(info.evoluRows);
  console.log('[sync] Diagnostics:', JSON.stringify(info, null, 2));
  return info;
}

function _forcePull() {
  if (!evolu || !profileQuery) {
    console.warn('[sync] Cannot force pull — Evolu not initialized');
    return;
  }
  _pulling = false;
  console.log('[sync] Force pull triggered');
  onSyncReceived();
  return 'triggered';
}

// ═══════════════════════════════════════════════
// MNEMONIC (identity)
// ═══════════════════════════════════════════════

export function getMnemonic() {
  if (!_appOwner) return null;
  return _appOwner.mnemonic || null;
}

/**
 * Returns the last Evolu owner-resolution error, or null. The Settings UI
 * uses this to show an actionable message instead of looping on "Resolving…"
 * for 30s when Evolu's worker fails to start (OPFS contention, locked
 * IndexedDB, missing relay, etc.).
 */
export function getMnemonicResolutionError() {
  return _appOwnerError;
}

export async function restoreFromMnemonic(mnemonic) {
  if (!evolu) return false;
  try {
    await evolu.restoreAppOwner(mnemonic);
    // Clear sync timestamps only after successful restore
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.endsWith('-sync-ts')) localStorage.removeItem(key);
    }
    showNotification('Restored from mnemonic — reloading…', 'success');
    // Reload so the app re-initializes from the now-restored CRDT identity.
    // Without this, Evolu pulls remote records in the background but the
    // running JS keeps using the previous in-memory state, so the user sees
    // no UI change despite the toast saying "reloading…". Same pattern as
    // disableSync above.
    setTimeout(() => window.location.reload(), 500);
    return true;
  } catch (e) {
    console.error('[sync] Restore failed:', e);
    showNotification('Invalid mnemonic', 'error');
    return false;
  }
}

// ═══════════════════════════════════════════════
// SYNC PAYLOAD — wraps importedData + profile meta
// ═══════════════════════════════════════════════

// AI settings keys to sync (global, not per-profile)
const AI_SETTINGS_KEYS = [
  'labcharts-ai-provider',
  'labcharts-openrouter-key',    // OpenRouter key (encrypted)
  'labcharts-venice-key',        // Venice key (encrypted)
  'labcharts-routstr-key',       // Routstr key (encrypted)
  'labcharts-ppq-key',           // PPQ key (encrypted)
  'labcharts-ppq-credit-id',     // PPQ credit ID (for balance/topup)
  'labcharts-custom-key',        // Custom API key (encrypted)
  'labcharts-custom-url',        // Custom API base URL
  'labcharts-custom-model',      // Custom API selected model
  'labcharts-custom-models',     // Custom API model list cache
  'labcharts-ollama',            // Local AI server config (encrypted)
  'labcharts-openrouter-model',
  'labcharts-venice-model',
  'labcharts-routstr-model',
  'labcharts-ppq-model',
  'labcharts-venice-e2ee',
  'labcharts-ollama-model',
  'labcharts-ollama-pii-url',
  'labcharts-ollama-pii-model',
  'labcharts-cashu-wallet-mnemonic',  // Wallet seed (encrypted)
  'labcharts-cashu-wallet-mint',       // Wallet mint URL
  'labcharts-routstr-node',           // Selected Routstr node
  'labcharts-lens-config',            // Custom Knowledge Source config (name, url, enabled, topK)
  'labcharts-lens-key',               // Custom Knowledge Source API key (encrypted)
];

async function collectAISettings() {
  const settings = {};
  for (const key of AI_SETTINGS_KEYS) {
    const val = await encryptedGetItem(key);
    if (val) settings[key] = val;
  }
  return settings;
}

const ENCRYPTED_AI_KEYS = ['labcharts-openrouter-key', 'labcharts-venice-key', 'labcharts-routstr-key', 'labcharts-ppq-key', 'labcharts-ollama', 'labcharts-cashu-wallet-mnemonic', 'labcharts-lens-key', 'labcharts-custom-key'];

async function applyAISettings(settings) {
  if (!settings) return;
  for (const [key, val] of Object.entries(settings)) {
    if (!AI_SETTINGS_KEYS.includes(key)) continue;
    if (typeof val !== 'string' || val.length > 10000) continue; // sanity check
    if (ENCRYPTED_AI_KEYS.includes(key)) {
      await encryptedSetItem(key, val);
    } else {
      localStorage.setItem(key, val);
    }
  }
}

// Per-profile chat keys to sync
async function collectChatData(profileId) {
  const threadsKey = `labcharts-${profileId}-chat-threads`;
  const threadsRaw = await encryptedGetItem(threadsKey) || localStorage.getItem(threadsKey);
  if (!threadsRaw) return null;
  try {
    const threads = JSON.parse(threadsRaw);
    if (!Array.isArray(threads) || threads.length === 0) return null;
    const messages = {};
    for (const t of threads) {
      const msgKey = `labcharts-${profileId}-chat-t_${t.id}`;
      const msgRaw = await encryptedGetItem(msgKey) || localStorage.getItem(msgKey);
      if (msgRaw) messages[t.id] = JSON.parse(msgRaw);
    }
    // Custom personalities
    const customRaw = localStorage.getItem(`labcharts-${profileId}-chatPersonalityCustom`);
    const personality = localStorage.getItem(`labcharts-${profileId}-chatPersonality`);
    return {
      threads,
      messages,
      customPersonalities: customRaw ? JSON.parse(customRaw) : undefined,
      activePersonality: personality || undefined,
    };
  } catch { return null; }
}

async function applyChatData(profileId, chatData) {
  if (!chatData || !chatData.threads) return;
  // Thread index: always plain localStorage (matches saveChatThreadIndex in chat.js).
  // encryptAllSensitiveKeys handles at-rest encryption when session ends.
  const threadsKey = `labcharts-${profileId}-chat-threads`;
  localStorage.setItem(threadsKey, JSON.stringify(chatData.threads));
  if (chatData.messages) {
    for (const [threadId, msgs] of Object.entries(chatData.messages)) {
      const msgKey = `labcharts-${profileId}-chat-t_${threadId}`;
      const msgJson = JSON.stringify(msgs);
      if (getEncryptionEnabled()) {
        await encryptedSetItem(msgKey, msgJson);
      } else {
        localStorage.setItem(msgKey, msgJson);
      }
    }
  }
  if (chatData.customPersonalities) {
    localStorage.setItem(`labcharts-${profileId}-chatPersonalityCustom`, JSON.stringify(chatData.customPersonalities));
  }
  if (chatData.activePersonality) {
    localStorage.setItem(`labcharts-${profileId}-chatPersonality`, chatData.activePersonality);
  }
}

// Per-profile display preferences to sync
const DISPLAY_PREF_SUFFIXES = ['units', 'rangeMode', 'suppOverlay', 'noteOverlay', 'phaseOverlay'];

function collectDisplayPrefs(profileId) {
  const prefs = {};
  for (const suffix of DISPLAY_PREF_SUFFIXES) {
    const val = localStorage.getItem(`labcharts-${profileId}-${suffix}`);
    if (val != null) prefs[suffix] = val;
  }
  return Object.keys(prefs).length > 0 ? prefs : undefined;
}

function applyDisplayPrefs(profileId, prefs) {
  if (!prefs) return;
  for (const suffix of DISPLAY_PREF_SUFFIXES) {
    if (suffix in prefs) {
      localStorage.setItem(`labcharts-${profileId}-${suffix}`, prefs[suffix]);
    }
  }
}

async function buildSyncPayload(profileId, importedData) {
  const profiles = getProfiles();
  const profile = profiles.find(p => p.id === profileId);
  const aiSettings = await collectAISettings();
  const chatData = await collectChatData(profileId);
  const displayPrefs = collectDisplayPrefs(profileId);
  // Strip wearable OAuth credentials before sync. Per-row LWW would let a stale
  // device resurrect a disconnected vendor or overwrite a freshly-rotated
  // refresh token. Wearable summary (the L2 dashboard data) still syncs; the
  // tokens stay local. Users connect each wearable per-device — see the note
  // in the Settings → Integrations panel.
  const safeImported = stripWearableCredentials(importedData);
  return JSON.stringify({
    _v: 3,
    importedData: safeImported,
    profile: profile || null,
    aiSettings: Object.keys(aiSettings).length > 0 ? aiSettings : undefined,
    chatData: chatData || undefined,
    displayPrefs: displayPrefs || undefined,
  });
}

function stripWearableCredentials(importedData) {
  if (!importedData?.wearableConnections) return importedData;
  const { wearableConnections, ...rest } = importedData;
  return rest;
}

// 5 MB cap. Pre-cap was 50 MB which let a pathological deeply-nested JSON
// OOM the tab on parse — a normal payload is well under 1 MB, so 5 MB is
// already 5× anticipated headroom. Unilateral lower bound on a malicious
// relay's blast radius.
const MAX_SYNC_PAYLOAD_BYTES = 5_000_000;

function parseSyncPayload(dataJson) {
  if (typeof dataJson !== 'string' || dataJson.length > MAX_SYNC_PAYLOAD_BYTES) {
    throw new Error('Invalid sync payload: bad type or too large');
  }
  const parsed = JSON.parse(dataJson);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid sync payload');
  }
  // Defence-in-depth: strip `wearableConnections` from any incoming blob,
  // regardless of producer version. Push side already strips this via
  // stripWearableCredentials(), but a compromised relay could inject it
  // back. With this strip an injected access_token never reaches the
  // adapter dispatch — `wearableConnections` lives only in local state.
  function safe(imp) {
    if (!imp || typeof imp !== 'object') return imp;
    if ('wearableConnections' in imp) {
      const { wearableConnections: _drop, ...rest } = imp;
      return rest;
    }
    return imp;
  }
  // v3: includes chat data + display prefs
  if (parsed._v === 3) {
    return { importedData: safe(parsed.importedData), profile: parsed.profile, aiSettings: parsed.aiSettings, chatData: parsed.chatData, displayPrefs: parsed.displayPrefs };
  }
  // v2 compat: no chat data
  if (parsed._v === 2) {
    return { importedData: safe(parsed.importedData), profile: parsed.profile, aiSettings: parsed.aiSettings, chatData: null, displayPrefs: null };
  }
  // v1 compat: raw importedData only. Reject if it doesn't look like an
  // importedData shape at all — drops the catch-all "anything goes" branch
  // that earlier let a malformed/malicious row land an arbitrary object
  // into state.importedData wholesale.
  if (parsed.entries || parsed.notes || parsed.supplements) {
    return { importedData: safe(parsed), profile: null, aiSettings: null, chatData: null, displayPrefs: null };
  }
  throw new Error('Invalid sync payload: unknown shape');
}

// Allowed fields when merging a synced profile into the local profiles list
const PROFILE_MERGE_FIELDS = ['name', 'sex', 'dob', 'location', 'tags', 'archived', 'pinned', 'flagged', 'avatar', 'color'];

// ═══════════════════════════════════════════════
// PUSH — localStorage → Evolu
// ═══════════════════════════════════════════════

async function pushProfile(profileId, importedData) {
  if (!evolu || !_syncEnabled || _syncing) return;
  if (!profileId || typeof profileId !== 'string') return;
  _syncing = true;
  updateSyncStatus({ push: 'pending', pushStartedAt: Date.now() });
  try {
    const dataJson = await buildSyncPayload(profileId, importedData);
    const syncedAt = new Date().toISOString();

    const onComplete = () => {
      updateSyncStatus({ push: 'confirmed', pushConfirmedAt: Date.now() });
    };

    // Check if row exists for this profile
    const rows = evolu.getQueryRows(profileQuery);
    const existing = rows?.find(r => r.profileId === profileId);

    if (existing) {
      evolu.update("profileData", {
        id: existing.id,
        dataJson,
        syncedAt,
      }, { onComplete });
    } else {
      evolu.insert("profileData", {
        profileId,
        dataJson,
        syncedAt,
      }, { onComplete });
    }
    // Only update sync-ts after successful push.
    // Use syncedAt (same value stored in Evolu) so the pull side sees exact equality
    // and doesn't skip the row due to a 1ms clock drift between the two Date.now() calls.
    localStorage.setItem(`labcharts-${profileId}-sync-ts`, String(new Date(syncedAt).getTime()));
    dbg('Pushed:', profileId);
  } catch (e) {
    console.error('[sync] Push failed:', e);
    updateSyncStatus({ push: 'error', lastError: { type: 'PushError', message: e.message, at: Date.now() } });
  } finally {
    _syncing = false;
  }
}

export async function pushCurrentProfile() {
  await pushProfile(state.currentProfile, state.importedData);
  pushContextToGateway();
}

// Soft-delete a profile's row on the relay so other devices stop seeing it.
// Local wipe alone is insufficient — without this, the Evolu row keeps its
// full dataJson and any device that pulls (or any device the user re-syncs
// to later) resurrects the profile. Idempotent: missing row → no-op.
export async function deleteProfileFromRelay(profileId) {
  if (!evolu || !_syncEnabled) return { skipped: true, reason: 'sync-off' };
  if (!profileId || typeof profileId !== 'string') return { skipped: true, reason: 'bad-id' };
  try {
    const rows = evolu.getQueryRows(profileQuery);
    const row = rows?.find(r => r.profileId === profileId);
    if (!row) return { skipped: true, reason: 'no-row' };
    // Evolu's soft-delete idiom: set isDeleted=1; the local query filters
    // these out (see profileQuery's .where clause), and the row replicates
    // to peers carrying the tombstone — they apply the same filter and
    // stop seeing the profile. CRDT LWW means a stale device that hasn't
    // pulled yet won't accidentally resurrect the row, because its newer
    // tombstone wins on next pull-merge.
    evolu.update('profileData', { id: row.id, isDeleted: 1, syncedAt: new Date().toISOString() });
    localStorage.removeItem(`labcharts-${profileId}-sync-ts`);
    dbg('Soft-deleted on relay:', profileId);
    return { ok: true };
  } catch (e) {
    console.error('[sync] Profile delete propagation failed:', e);
    return { ok: false, error: e.message };
  }
}

// Push all profiles on first enable
async function pushAllProfiles() {
  const profiles = getProfiles();
  for (const p of profiles) {
    try {
      const storageKey = profileStorageKey(p.id, 'imported');
      let dataJson;
      if (p.id === state.currentProfile) {
        dataJson = state.importedData;
      } else {
        const raw = getEncryptionEnabled()
          ? await encryptedGetItem(storageKey)
          : localStorage.getItem(storageKey);
        if (!raw) continue;
        dataJson = JSON.parse(raw);
      }
      if (dataJson) await pushProfile(p.id, dataJson);
    } catch (e) {
      console.error('[sync] Push failed for profile:', p.id, e);
    }
  }
}

// ═══════════════════════════════════════════════
// PULL — Evolu → localStorage
// ═══════════════════════════════════════════════

// Wipe local copies of any profiles that were tombstoned on the relay (by
// this or another device). Mirrors the local-wipe steps in
// profile.js:deleteProfile so a tombstoned profile is fully gone — not just
// hidden by the active-rows query. The user's local profiles list is the
// source of truth for "what shows in the UI"; without this loop a remote
// delete would leave the entry there indefinitely.
// localStorage key for the per-profile "tombstone seen" marker. Used to
// decide whether a tombstone is auto-applied (we already saw it once and
// the user dismissed the confirm dialog by accepting) vs queued for review.
const TOMBSTONE_QUARANTINE_KEY = (profileId) => `labcharts-tombstone-pending-${profileId}`;
const TOMBSTONE_BATCH_THRESHOLD = 2; // ≥2 tombstones at once = require confirm

async function applyRemoteTombstones() {
  if (!tombstoneQuery) return;
  const tombs = evolu.getQueryRows(tombstoneQuery) || [];
  if (tombs.length === 0) return;
  const profiles = getProfiles();
  const tombIds = new Set(tombs.map(t => t.profileId).filter(Boolean));
  const survivors = profiles.filter(p => !tombIds.has(p.id));
  if (survivors.length === profiles.length) return; // nothing local to wipe

  // CRDT safety: never wipe the last profile out from under the user. If
  // every local profile is tombstoned (mass-delete from another device),
  // keep the active one as a safety landing pad — the user can finish
  // deleting it themselves once they confirm.
  if (survivors.length === 0) {
    dbg('All profiles tombstoned remotely — keeping active profile as safety');
    return;
  }

  // Quarantine: a remote-driven mass-delete (≥ TOMBSTONE_BATCH_THRESHOLD
  // local profiles tombstoned at once) is auth'd only by the BIP-39
  // mnemonic. If the mnemonic leaks, an attacker could publish tombstones
  // for every profileId and silently wipe paired devices. For a single
  // tombstone, auto-apply (most common: user just deleted on another
  // device). For batches, require the user to confirm before wiping.
  const localToWipe = profiles.filter(p => tombIds.has(p.id)).map(p => p.id);
  if (localToWipe.length >= TOMBSTONE_BATCH_THRESHOLD) {
    // Mark each as pending; surface a confirm UI in Settings → Sync (the
    // user's next visit there will offer to apply or reject).
    const pending = localToWipe.filter(id => !localStorage.getItem(TOMBSTONE_QUARANTINE_KEY(id)));
    for (const id of pending) {
      localStorage.setItem(TOMBSTONE_QUARANTINE_KEY(id), JSON.stringify({ at: Date.now(), source: 'remote' }));
    }
    dbg(`Quarantined ${pending.length} tombstone(s) — require user confirm before wipe:`, pending.join(','));
    showNotification?.(
      `${localToWipe.length} profiles deleted on another device — open Settings → Sync to confirm`,
      'info', 6000
    );
    return;
  }

  const wipedIds = [];
  for (const tombId of tombIds) {
    if (!profiles.find(p => p.id === tombId)) continue; // not local — nothing to wipe
    // Mirror profile.js:deleteProfile's local cleanup. Doing it inline here
    // (instead of calling deleteProfile) avoids the confirm dialog and the
    // recursive deleteProfileFromRelay call — the tombstone is already on
    // the relay, that's how we got here.
    localStorage.removeItem(profileStorageKey(tombId, 'imported'));
    localStorage.removeItem(profileStorageKey(tombId, 'units'));
    localStorage.removeItem(profileStorageKey(tombId, 'suppOverlay'));
    localStorage.removeItem(profileStorageKey(tombId, 'noteOverlay'));
    localStorage.removeItem(profileStorageKey(tombId, 'rangeMode'));
    localStorage.removeItem(profileStorageKey(tombId, 'suppImpact'));
    localStorage.removeItem(`labcharts-${tombId}-chat`);
    localStorage.removeItem(`labcharts-${tombId}-chat-threads`);
    localStorage.removeItem(`labcharts-${tombId}-chatRailOpen`);
    localStorage.removeItem(`labcharts-${tombId}-chatPersonality`);
    localStorage.removeItem(`labcharts-${tombId}-chatPersonalityCustom`);
    localStorage.removeItem(`labcharts-${tombId}-focusCard`);
    localStorage.removeItem(`labcharts-${tombId}-contextHealth`);
    localStorage.removeItem(`labcharts-${tombId}-onboarded`);
    localStorage.removeItem(`labcharts-${tombId}-tour`);
    localStorage.removeItem(`labcharts-${tombId}-cycleTour`);
    localStorage.removeItem(`labcharts-${tombId}-phaseOverlay`);
    localStorage.removeItem(`labcharts-${tombId}-sync-ts`);
    try {
      const wsMod = await import('./wearables-store.js');
      await wsMod.deleteWearablesDB(tombId).catch(() => {});
    } catch { /* wearables-store optional */ }
    wipedIds.push(tombId);
  }

  if (wipedIds.length === 0) return;
  await saveProfiles(survivors);
  // Clear any pending quarantine markers for ids we just wiped so the
  // confirm UI doesn't keep re-prompting on the next sync.
  for (const id of wipedIds) localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(id));
  dbg(`Applied ${wipedIds.length} remote tombstone(s):`, wipedIds.join(', '));

  // If the active profile got tombstoned remotely, swap to a survivor so
  // the UI doesn't dereference a wiped profile. loadProfile rehydrates
  // state.importedData from localStorage of the new id.
  if (wipedIds.includes(state.currentProfile)) {
    showNotification?.(`Profile was deleted on another device — switching to "${survivors[0].name || 'next'}"`, 'info', 3500);
    loadProfile(survivors[0].id);
  }
}

// Returns the list of profileIds with pending remote tombstones the user
// hasn't confirmed yet. Settings → Sync surfaces these with Apply / Reject
// buttons so the user can authorise the wipe out-of-band.
export function listPendingTombstones() {
  const out = [];
  const profiles = getProfiles();
  for (const p of profiles) {
    const raw = localStorage.getItem(TOMBSTONE_QUARANTINE_KEY(p.id));
    if (!raw) continue;
    try { out.push({ id: p.id, name: p.name || p.id, ...(JSON.parse(raw) || {}) }); }
    catch { out.push({ id: p.id, name: p.name || p.id }); }
  }
  return out;
}

// User confirmed: apply the wipe locally and clear the marker. The relay
// row is already isDeleted=1; we just propagate the consequence.
export async function applyPendingTombstone(profileId) {
  const profiles = getProfiles();
  const survivors = profiles.filter(p => p.id !== profileId);
  if (survivors.length === 0) return { ok: false, reason: 'last-profile' };
  // Mirror the inline cleanup from applyRemoteTombstones.
  localStorage.removeItem(profileStorageKey(profileId, 'imported'));
  for (const k of ['units','suppOverlay','noteOverlay','rangeMode','suppImpact']) {
    localStorage.removeItem(profileStorageKey(profileId, k));
  }
  for (const k of ['chat','chat-threads','chatRailOpen','chatPersonality','chatPersonalityCustom','focusCard','contextHealth','onboarded','tour','cycleTour','phaseOverlay','sync-ts']) {
    localStorage.removeItem(`labcharts-${profileId}-${k}`);
  }
  try {
    const wsMod = await import('./wearables-store.js');
    await wsMod.deleteWearablesDB(profileId).catch(() => {});
  } catch {}
  await saveProfiles(survivors);
  localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
  if (state.currentProfile === profileId) loadProfile(survivors[0].id);
  return { ok: true };
}

// User rejected the tombstone (suspicious mass-delete). Re-publishes the
// profile to the relay using the existing local data — the next pull on
// any device will resurrect the profile via the live-row branch. The
// previous tombstone row stays isDeleted=1 but loses to the new live row
// because Evolu LWW. Returns ok if the re-push succeeded.
export async function rejectPendingTombstone(profileId) {
  if (!evolu || !_syncEnabled) return { ok: false, reason: 'sync-off' };
  const localKey = profileStorageKey(profileId, 'imported');
  const raw = getEncryptionEnabled()
    ? await encryptedGetItem(localKey)
    : localStorage.getItem(localKey);
  if (!raw) {
    localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
    return { ok: false, reason: 'no-local-data' };
  }
  let data;
  try { data = JSON.parse(raw); } catch { return { ok: false, reason: 'bad-local-json' }; }
  // Re-insert as a new row (don't reuse the tombstoned row id) so the
  // live record cleanly replaces the tombstone in the local query view.
  await pushProfile(profileId, data);
  localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
  return { ok: true };
}

async function onSyncReceived() {
  if (!evolu || !profileQuery || _pulling) {
    dbg('onSyncReceived skipped:', !evolu ? 'no evolu' : !profileQuery ? 'no query' : 'already pulling');
    return;
  }
  _pulling = true;
  updateSyncStatus({ pull: 'pulling' });
  try {
    // Apply remote tombstones FIRST — when another device deleted a profile,
    // wipe our local copy before processing live rows. Skipping this leaves
    // orphan profiles in the local list that the active query no longer
    // returns, and the user sees ghost entries that resync never explains.
    await applyRemoteTombstones();

    const rawRows = evolu.getQueryRows(profileQuery);
    dbg(`onSyncReceived: ${rawRows?.length ?? 0} rows`);
    if (!rawRows || rawRows.length === 0) return;

    // Dedupe by profileId, keeping the row with the highest syncedAt.
    // Evolu can return multiple rows per profileId after a tombstone +
    // recreate or a restore-from-mnemonic race; iterating in CRDT order
    // could let an older row land last and overwrite the newer pull
    // (because the per-profile localStorage timestamp is bumped only at
    // the bottom of the loop). Sort descending so the freshest row is
    // processed first, then the older row's `remoteUpdated <= localUpdated`
    // guard short-circuits as intended.
    const byProfile = new Map();
    for (const row of rawRows) {
      if (!row?.profileId) continue;
      const ts = row.syncedAt ? new Date(row.syncedAt).getTime() : 0;
      const prev = byProfile.get(row.profileId);
      if (!prev || ts > (prev.syncedAt ? new Date(prev.syncedAt).getTime() : 0)) {
        byProfile.set(row.profileId, row);
      }
    }
    const rows = Array.from(byProfile.values()).sort((a, b) => {
      const ta = a.syncedAt ? new Date(a.syncedAt).getTime() : 0;
      const tb = b.syncedAt ? new Date(b.syncedAt).getTime() : 0;
      return tb - ta;
    });

    let profilesChanged = false;
    let latestAiSettings = null;
    let latestAiTs = 0;

    for (const row of rows) {
      try {
        const profileId = row.profileId;
        if (!profileId || typeof profileId !== 'string') continue;
        const remoteUpdated = row.syncedAt ? new Date(row.syncedAt).getTime() : 0;

        // Check local timestamp
        const localKey = profileStorageKey(profileId, 'imported');
        const localMeta = localStorage.getItem(`labcharts-${profileId}-sync-ts`);
        const localUpdated = localMeta ? parseInt(localMeta, 10) : 0;

        if (remoteUpdated <= localUpdated) {
          dbg(`Row ${profileId}: skip (remote ${remoteUpdated} <= local ${localUpdated})`);
          continue;
        }
        dbg(`Row ${profileId}: PULLING (remote ${remoteUpdated} > local ${localUpdated})`);

        // Remote is newer — parse payload
        const { importedData, profile, aiSettings, chatData, displayPrefs } = parseSyncPayload(row.dataJson);

        // Track latest AI settings (apply once, from most recent row)
        if (aiSettings && remoteUpdated > latestAiTs) {
          latestAiSettings = aiSettings;
          latestAiTs = remoteUpdated;
        }

        // Validate importedData shape
        if (!importedData || typeof importedData !== 'object') continue;

        // Preserve local wearableConnections — they're stripped from the push
        // payload (tokens stay per-device), so the remote blob never carries
        // them. Without this merge the pull would wipe this device's OAuth
        // tokens and silently disconnect every connected vendor.
        let localWearableConnections = null;
        if (profileId === state.currentProfile) {
          localWearableConnections = state.importedData?.wearableConnections || null;
        } else {
          try {
            const rawLocal = getEncryptionEnabled()
              ? await encryptedGetItem(localKey)
              : localStorage.getItem(localKey);
            if (rawLocal) {
              const parsed = JSON.parse(rawLocal);
              localWearableConnections = parsed?.wearableConnections || null;
            }
          } catch (e) {
            dbg('Could not read local wearableConnections for preserve:', e.message);
          }
        }
        if (localWearableConnections) {
          importedData.wearableConnections = localWearableConnections;
        }

        // Update importedData in localStorage
        const importedJson = JSON.stringify(importedData);
        if (getEncryptionEnabled()) {
          await encryptedSetItem(localKey, importedJson);
        } else {
          localStorage.setItem(localKey, importedJson);
        }
        localStorage.setItem(`labcharts-${profileId}-sync-ts`, String(remoteUpdated));

        // Merge profile into local profiles list (allowlisted fields only)
        if (profile && typeof profile === 'object') {
          const profiles = getProfiles();
          const idx = profiles.findIndex(p => p.id === profileId);
          if (idx >= 0) {
            const local = profiles[idx];
            for (const field of PROFILE_MERGE_FIELDS) {
              if (field in profile) local[field] = profile[field];
            }
            local.lastUpdated = Date.now();
          } else {
            // New profile — pick only allowed fields + id
            const newProfile = { id: profileId, lastUpdated: Date.now() };
            for (const field of PROFILE_MERGE_FIELDS) {
              if (field in profile) newProfile[field] = profile[field];
            }
            profiles.push(newProfile);
          }
          await saveProfiles(profiles);
          profilesChanged = true;
          dbg('Merged profile:', profileId, profile.name);
        }

        // Apply chat data and display preferences
        if (chatData) await applyChatData(profileId, chatData);
        if (displayPrefs) applyDisplayPrefs(profileId, displayPrefs);

        // If this is the active profile, update in-memory state
        if (profileId === state.currentProfile) {
          state.importedData = importedData;
          migrateProfileData(state.importedData);
          // Reload chat threads + active thread messages into memory and re-render
          if (chatData) {
            window.loadChatThreads?.();
            window.renderThreadList?.();
            window.loadChatHistory?.(); // reloads state.chatHistory from localStorage + renders
          }
          // Only auto-navigate if user is on the dashboard (don't interrupt other views)
          const activeNav = document.querySelector('.nav-item.active');
          if (!activeNav || activeNav.dataset.category === 'dashboard') {
            window.navigate?.('dashboard');
          } else {
            showNotification('Data updated from another device', 'success');
          }
          dbg('Pulled active profile:', profileId);
        } else {
          dbg('Pulled profile:', profileId);
        }
      } catch (e) {
        console.error('[sync] Pull failed for row:', e);
      }
    }

    // Apply AI settings once from the most recent row
    if (latestAiSettings) await applyAISettings(latestAiSettings);

    // Rebuild profile dropdown if profiles changed
    if (profilesChanged) {
      window.renderProfileDropdown?.();
    }
  } finally {
    _pulling = false;
    updateSyncStatus({ pull: 'received', pullReceivedAt: Date.now() });
  }
}

// ═══════════════════════════════════════════════
// HOOK — called from saveImportedData()
// ═══════════════════════════════════════════════

export function onDataSaved() {
  // Evolu sync
  if (_syncEnabled && evolu) {
    const profileId = state.currentProfile;
    const data = state.importedData;
    // Bump sync-ts immediately so a pull firing during the debounce window
    // sees local as newer and skips — otherwise it would clobber the fresh
    // local write (e.g. wearableConnections from OAuth callback) with the
    // pre-write relay snapshot. pushProfile bumps sync-ts again on success.
    if (profileId) {
      localStorage.setItem(`labcharts-${profileId}-sync-ts`, String(Date.now()));
      const prev = _debounceTimers.get(profileId);
      if (prev) clearTimeout(prev);
      const timer = setTimeout(() => {
        _debounceTimers.delete(profileId);
        if (_syncing) {
          setTimeout(() => pushProfile(profileId, data), 1000);
        } else {
          pushProfile(profileId, data);
        }
      }, 2000);
      _debounceTimers.set(profileId, timer);
    }
  }
  // Messenger context push
  pushContextToGateway();
}

// Called from chat.js when threads/messages change
let _chatSyncTimer = null;
export function onChatSaved() {
  if (!_syncEnabled || !evolu) return;
  clearTimeout(_chatSyncTimer);
  _chatSyncTimer = setTimeout(() => {
    const profileId = state.currentProfile;
    const data = state.importedData;
    if (_syncing) {
      setTimeout(() => pushProfile(profileId, data), 1000);
    } else {
      pushProfile(profileId, data);
    }
  }, 10000); // 10s debounce — chat saves are frequent during streaming
}

// ═══════════════════════════════════════════════
// MESSENGER ACCESS — push lab context to gateway
// ═══════════════════════════════════════════════

const MESSENGER_TOKEN_KEY = 'labcharts-messenger-token';
const MESSENGER_ENABLED_KEY = 'labcharts-messenger-enabled';

export function isMessengerEnabled() {
  return localStorage.getItem(MESSENGER_ENABLED_KEY) === 'true';
}

export function getMessengerToken() {
  return localStorage.getItem(MESSENGER_TOKEN_KEY) || null;
}

export function generateMessengerToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(MESSENGER_TOKEN_KEY, token);
  localStorage.setItem(MESSENGER_ENABLED_KEY, 'true');
  return token;
}

export function revokeMessengerToken() {
  localStorage.removeItem(MESSENGER_TOKEN_KEY);
  localStorage.setItem(MESSENGER_ENABLED_KEY, 'false');
}

let _contextPushTimer = null;
export function pushContextToGateway() {
  if (!isMessengerEnabled()) return;
  const token = getMessengerToken();
  if (!token) return;

  clearTimeout(_contextPushTimer);
  _contextPushTimer = setTimeout(async () => {
    try {
      const { buildLabContext, buildWearableSeriesSection, getAgentWearableSeriesDays } = await import('./lab-context.js');
      const baseContext = buildLabContext({ skipGroupFilter: true });
      // Optional wearable daily-series section — user picks 0 (off) / 7 /
      // 30 / 90 days in Settings → Integrations → Agent Access. Reads L1
      // IDB on the browser; the gateway only ever sees the rendered string.
      // Append AFTER the rest so the section parser treats it as a sibling.
      const seriesDays = getAgentWearableSeriesDays();
      const seriesBlock = seriesDays > 0
        ? await buildWearableSeriesSection(seriesDays).catch(() => '')
        : '';
      const context = seriesBlock ? `${baseContext}\n${seriesBlock}\n` : baseContext;
      const profileId = state.currentProfile || 'default';
      // The gateway only needs the active profileId — DON'T leak the full
      // profile-name list. Profile names can include real names; the relay
      // is unencrypted (the rest of the agent payload is by design too,
      // but profile names are gratuitous PII for the agent's needs).
      const relay = getSyncRelay().replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

      await fetch(`${relay}/api/context`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ context, profileId }),
      });
      dbg(`Context pushed to gateway (profile: ${profileId}, series: ${seriesBlock ? 'yes' : 'no'})`);
    } catch (e) {
      console.warn('[sync] Context push failed:', e);
    }
  }, 5000); // 5s debounce — less urgent than sync
}

// ═══════════════════════════════════════════════
// SYNC STATUS UI
// ═══════════════════════════════════════════════

function _timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function renderSyncIndicator() {
  const slot = document.getElementById('sync-indicator-slot');
  if (!slot) return;
  if (!_syncEnabled) { slot.innerHTML = ''; return; }
  const ds = getSyncDisplayState();
  const titles = { synced: 'Synced', syncing: 'Syncing\u2026', offline: 'Offline \u2014 changes saved locally', error: 'Sync error', disabled: '' };
  slot.innerHTML = `<button class="sync-indicator" id="sync-indicator-btn" onclick="toggleSyncDetail()" title="${titles[ds]}" aria-label="Sync status"><span class="sync-dot sync-dot-${ds}"></span></button>`;
}

export function updateSyncIndicator() {
  const dot = document.querySelector('#sync-indicator-btn .sync-dot');
  if (!dot) { renderSyncIndicator(); return; }
  const ds = getSyncDisplayState();
  dot.className = `sync-dot sync-dot-${ds}`;
  const titles = { synced: 'Synced', syncing: 'Syncing\u2026', offline: 'Offline \u2014 changes saved locally', error: 'Sync error' };
  dot.parentElement.title = titles[ds] || '';
}

export function toggleSyncDetail() {
  let pop = document.getElementById('sync-popover');
  if (pop) { pop.remove(); return; }
  const btn = document.getElementById('sync-indicator-btn');
  if (!btn) return;
  const ds = getSyncDisplayState();
  const s = _syncStatus;
  const relayDot = s.relay === 'connected' ? '#22c55e' : s.relay === 'unreachable' ? 'var(--red)' : 'var(--text-muted)';
  const relayLabel = s.relay === 'connected' ? 'Connected to relay' : s.relay === 'unreachable' ? 'Relay unreachable' : 'Checking\u2026';
  const pushLabel = s.push === 'confirmed' ? `Confirmed ${_timeAgo(s.pushConfirmedAt)}` : s.push === 'pending' ? 'Pending\u2026' : s.push === 'error' ? 'Failed' : '\u2014';
  const pullLabel = s.pullReceivedAt ? `Checked ${_timeAgo(s.pullReceivedAt)}` : '\u2014';
  const errorLine = s.lastError ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px">${escapeHTML(s.lastError.type)} ${_timeAgo(s.lastError.at)}</div>` : '';

  pop = document.createElement('div');
  pop.id = 'sync-popover';
  pop.className = 'sync-popover';
  pop.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><span style="width:8px;height:8px;border-radius:50%;background:${relayDot};display:inline-block"></span><span style="font-size:13px">${relayLabel}</span></div>
    <div style="font-size:12px;color:var(--text-muted);line-height:1.8">
      <div>Push: ${pushLabel}</div>
      <div>Pull: ${pullLabel}</div>
    </div>
    ${errorLine}
    <div style="margin-top:10px;display:flex;gap:8px">
      <button class="ctx-btn-option" style="font-size:12px" onclick="pushCurrentProfile();toggleSyncDetail()">Sync now</button>
      <button class="ctx-btn-option" style="font-size:12px" onclick="toggleSyncDetail();openSettingsModal('data')">Settings</button>
    </div>`;
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(pop);
  // Close on outside click
  const close = (e) => { if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { pop.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

// Subscribe to status changes → repaint indicator
subscribeSyncStatus(() => updateSyncIndicator());

// ═══════════════════════════════════════════════
// EXPORTS for window binding
// ═══════════════════════════════════════════════

Object.assign(window, {
  enableSync,
  disableSync,
  getMnemonic,
  getMnemonicResolutionError,
  getSyncBlocker,
  restoreFromMnemonic,
  isSyncEnabled,
  pushCurrentProfile,
  deleteProfileFromRelay,
  listPendingTombstones,
  applyPendingTombstone,
  rejectPendingTombstone,
  checkRelayConnection,
  isMessengerEnabled,
  getMessengerToken,
  generateMessengerToken,
  revokeMessengerToken,
  pushContextToGateway,
  _syncDiag,
  _forcePull,
  renderSyncIndicator,
  updateSyncIndicator,
  toggleSyncDetail,
});
