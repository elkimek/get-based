// sync.js — Evolu sync layer (opt-in, E2E encrypted)
// Stores importedData + profile metadata per profile as a JSON blob.
// Last-write-wins at the profile level — fine for single-user cross-device sync.

import { state } from './state.js';
import { showNotification, isDebugMode, escapeHTML } from './utils.js';
import { profileStorageKey, getProfiles, saveProfiles, migrateProfileData, loadProfile } from './profile.js';
import { getEncryptionEnabled, encryptedSetItem, encryptedGetItem, encryptedRemoveItem } from './crypto.js';
import { mergeImportedData, localHasRowsRemoteLacks } from './data-merge.js';

function dbg(...args) { if (isDebugMode()) console.log('[sync]', ...args); }

// Ring buffer of recent sync events — surfaced in the sync popover so phone
// users can see push/pull payload counts without USB-debugging the console.
// Each entry: { at: ms, kind: 'push'|'pull'|'skip'|'rebroadcast', text }.
const _syncEvents = [];
const _SYNC_EVENT_CAP = 12;
// Per-profile rebroadcast counters with a 5-minute reset window.
// Caps runaway rebroadcast loops if two devices' clocks skew enough
// that same-id timestamp comparisons keep flipping which side "won".
const _rebroadcastCounts = new Map(); // profileId → { count, since: ms }
const _REBROADCAST_CAP = 3;
const _REBROADCAST_WINDOW_MS = 5 * 60 * 1000;
function _consumeRebroadcastBudget(profileId) {
  const now = Date.now();
  let entry = _rebroadcastCounts.get(profileId);
  if (!entry || (now - entry.since) > _REBROADCAST_WINDOW_MS) {
    entry = { count: 0, since: now };
    _rebroadcastCounts.set(profileId, entry);
  }
  if (entry.count >= _REBROADCAST_CAP) return false;
  entry.count++;
  return true;
}
function _logSyncEvent(kind, text) {
  _syncEvents.push({ at: Date.now(), kind, text });
  if (_syncEvents.length > _SYNC_EVENT_CAP) _syncEvents.shift();
}
export function getRecentSyncEvents() { return _syncEvents.slice(); }

// Snapshot Evolu's current state for the in-popover Diagnose button. Used
// when push/pull behave correctly per-device but cross-device convergence
// stalls — usually a mnemonic mismatch (different Evolu owners, so devices
// can't see each other's rows) or stale-row replication (relay has the
// data, this device's local Evolu DB hasn't pulled it down yet).
export function getEvoluDiagnostics() {
  const out = {
    syncEnabled: _syncEnabled,
    relay: getSyncRelay(),
    ownerId: _appOwner?.id ? String(_appOwner.id).slice(0, 12) + '…' : null,
    mnemonicPrefix: _appOwner?.mnemonic ? _appOwner.mnemonic.split(' ').slice(0, 2).join(' ') + ' …' : null,
    rows: [],
    activeProfileId: state.currentProfile,
    activeImported: { sunSessions: 0, lightDevices: 0 },
  };
  try {
    const rows = (evolu && profileQuery) ? evolu.getQueryRows(profileQuery) : [];
    for (const row of rows || []) {
      let sun = 0, dev = 0;
      try {
        const parsed = JSON.parse(row.dataJson || '{}');
        const imp = parsed?.importedData || parsed;
        sun = Array.isArray(imp?.sunSessions) ? imp.sunSessions.length : 0;
        dev = Array.isArray(imp?.lightDevices) ? imp.lightDevices.length : 0;
      } catch {}
      out.rows.push({
        profileId: row.profileId,
        syncedAt: row.syncedAt,
        syncedAtMs: row.syncedAt ? new Date(row.syncedAt).getTime() : 0,
        sun, dev,
        bytes: (row.dataJson || '').length,
      });
    }
  } catch (e) { out.rowsError = String(e?.message || e); }
  // What's actually in this device's active state right now
  out.activeImported.sunSessions = Array.isArray(state.importedData?.sunSessions) ? state.importedData.sunSessions.length : 0;
  out.activeImported.lightDevices = Array.isArray(state.importedData?.lightDevices) ? state.importedData.lightDevices.length : 0;
  return out;
}

let evolu = null;
let profileQuery = null;
let tombstoneQuery = null;
let _syncEnabled = false;
let _syncing = false;
// Tracks when _syncing was last set so a hung push (Evolu onComplete never
// fires) can be detected and the flag cleared on the next push attempt
// instead of silently blocking every subsequent push for the session.
let _syncingSince = 0;
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

    // Startup reconciliation — handles the case where state.importedData
    // (loaded fresh from localStorage on this page-load) has rows that
    // the local Evolu DB row's dataJson doesn't have. This happens when
    // a previous session's pushProfile got wedged (Evolu's onComplete
    // never fired, _syncing stayed true until the watchdog), so saves
    // landed in localStorage but never reached Evolu's CRDT log. Fix:
    // detect the divergence after init + force-push so the row catches
    // up. Defer until after appOwner + initial query both load — those
    // are async and the CRDT row doesn't exist until then.
    Promise.all([_readyPromise, _queryLoaded]).then(() => {
      _reconcileLocalStorageWithEvolu().catch(e => {
        console.warn('[sync] Startup reconciliation failed:', e);
      });
    });
  } catch (e) {
    console.error('[sync] Failed to initialize Evolu:', e);
    _syncEnabled = false;
  }
}

// Compare state.importedData (loaded from localStorage on page-load) with
// the Evolu DB row's dataJson for the active profile. If localStorage has
// strictly more data than the row (id-set superset across the major
// id-keyed arrays — sunSessions, deviceSessions, lightDevices, lightAudits,
// lightMeasurements, entries, notes, supplements, healthGoals — or just a
// different sunSession/audit count), trigger a forced push so the wedge
// auto-recovers without the user needing to tap Force Resend.
async function _reconcileLocalStorageWithEvolu() {
  if (!evolu || !_syncEnabled || !state.currentProfile || !state.importedData) return;
  const rows = evolu.getQueryRows(profileQuery);
  const existing = rows?.find(r => r.profileId === state.currentProfile);
  // No existing row → first sync ever for this profile, normal push path
  // (onDataSaved or enableSync) will handle it. Skip.
  if (!existing) return;
  let remoteImported;
  try {
    const parsed = parseSyncPayload(existing.dataJson);
    remoteImported = parsed?.importedData || null;
  } catch {
    // Malformed row → reconciliation can't reason about it. The user can
    // still recover via the Force Resend button.
    return;
  }
  if (!remoteImported) return;

  // Compare id-keyed arrays. We don't need a perfect deep-diff — just any
  // signal that local has rows the remote row's dataJson lacks. Same
  // shape used elsewhere by the rebroadcast logic (localHasRowsRemoteLacks).
  const ID_ARRAYS = ['entries', 'notes', 'supplements', 'healthGoals', 'sunSessions',
    'deviceSessions', 'lightDevices', 'lightAudits', 'lightMeasurements'];
  let mismatch = null;
  for (const key of ID_ARRAYS) {
    const local = Array.isArray(state.importedData[key]) ? state.importedData[key] : [];
    const remote = Array.isArray(remoteImported[key]) ? remoteImported[key] : [];
    if (local.length === 0 && remote.length === 0) continue;
    const localIds = new Set(local.map(r => r?.id).filter(Boolean));
    const remoteIds = new Set(remote.map(r => r?.id).filter(Boolean));
    // Local has at least one id remote doesn't
    for (const id of localIds) {
      if (!remoteIds.has(id)) { mismatch = { key, missingId: id, localCount: local.length, remoteCount: remote.length }; break; }
    }
    if (mismatch) break;
  }
  if (!mismatch) {
    dbg('Startup reconciliation: localStorage and Evolu row match — nothing to do');
    return;
  }
  dbg('Startup reconciliation: localStorage has rows Evolu row lacks', mismatch);
  _logSyncEvent('reconcile', `Reconcile ${state.currentProfile.slice(0, 8)} — local has unsynced ${mismatch.key} (${mismatch.localCount} vs row ${mismatch.remoteCount})`);
  // Force-push so the next watchdog cycle can't lose us a clearly-needed
  // catch-up. Bypasses the _syncing guard if it was wedged from a prior
  // session — the same wedge that caused the divergence in the first place.
  await pushProfile(state.currentProfile, state.importedData, { force: true });
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
  dbg('Force pull triggered');
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

async function pushProfile(profileId, importedData, opts = {}) {
  if (!evolu || !_syncEnabled) return;
  if (!profileId || typeof profileId !== 'string') return;
  // _syncing was a guard against concurrent pushes, but if a previous push
  // hangs (Evolu's onComplete never fires) _syncing stays true and every
  // subsequent push (including manual Sync now / Reload-and-retry) silently
  // no-ops. Replaced with a stale-flag reset: if more than 60s have passed
  // since _syncing was set, assume the prior push is dead and proceed.
  // `opts.force` skips the in-flight check entirely — used by the Force
  // Resend popover button + startup reconciliation, both of which need to
  // run regardless of a stuck flag from a prior wedged push.
  if (!opts.force && _syncing && Date.now() - _syncingSince < 60_000) {
    console.warn('[sync] pushProfile bailed — another push is in-flight (set <60s ago)');
    return;
  }
  if (_syncing && !opts.force) console.warn('[sync] pushProfile clearing stale _syncing flag (>60s old)');
  if (opts.force && _syncing) console.warn('[sync] pushProfile force-overriding in-flight flag');
  _syncing = true;
  _syncingSince = Date.now();
  updateSyncStatus({ push: 'pending', pushStartedAt: Date.now() });
  try {
    const dataJson = await buildSyncPayload(profileId, importedData);
    const syncedAt = new Date().toISOString();

    const sunCount = Array.isArray(importedData?.sunSessions) ? importedData.sunSessions.length : 0;
    const devCount = Array.isArray(importedData?.lightDevices) ? importedData.lightDevices.length : 0;
    const queueMsg = `Queued ${profileId.slice(0,8)} — sun=${sunCount} dev=${devCount}`;
    const queuedAt = Date.now();
    dbg(`${queueMsg} @ ${queuedAt}`);
    _logSyncEvent('queue', queueMsg);

    let completed = false;
    let watchdogId = null;
    const finish = () => {
      _syncing = false;
      if (watchdogId !== null) { clearTimeout(watchdogId); watchdogId = null; }
    };
    const onComplete = () => {
      completed = true;
      const elapsed = Date.now() - queuedAt;
      updateSyncStatus({ push: 'confirmed', pushConfirmedAt: Date.now() });
      const okMsg = `Push committed ${profileId.slice(0,8)} (${elapsed}ms) — sun=${sunCount} dev=${devCount}`;
      dbg(okMsg);
      _logSyncEvent('push', okMsg);
      // Only advance the local-sync-ts watermark when the push actually
      // landed. The previous (synchronous) bump after evolu.update meant
      // a wedged push set the watermark anyway → subsequent pulls saw
      // `remote.syncedAt < local-sync-ts` and skipped, leaving the local
      // Evolu row stuck at older state with no auto-recovery. Now the
      // watermark only moves on real success.
      // Use syncedAt (same value stored in Evolu) so pulls see exact
      // equality and don't skip the row from 1ms clock drift.
      localStorage.setItem(`labcharts-${profileId}-sync-ts`, String(new Date(syncedAt).getTime()));
      finish();
    };
    // Watchdog: if Evolu never calls onComplete within 30s, the worker is
    // wedged (broken WS, OPFS lock, dead replication). Log explicitly so
    // the user / popover can show "Stuck — try reloading the page" instead
    // of silent forever-pending. Cleared on success so a slow-but-eventually-
    // successful push doesn't get a spurious "stuck" event in the activity log.
    watchdogId = setTimeout(() => {
      if (!completed) {
        const stuckMsg = `Push NOT committed after 30s ${profileId.slice(0,8)} — Evolu worker likely wedged`;
        console.warn(`[sync] ${stuckMsg}`);
        _logSyncEvent('skip', `Push stuck >30s — try reloading`);
        updateSyncStatus({ push: 'error', lastError: { type: 'PushStuck', message: 'Evolu replication did not complete in 30s', at: Date.now() } });
        finish();
      }
    }, 30_000);

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
    // local-sync-ts is now bumped inside onComplete only — see comment there.
  } catch (e) {
    console.error('[sync] Push failed:', e);
    updateSyncStatus({ push: 'error', lastError: { type: 'PushError', message: e.message, at: Date.now() } });
    // Synchronous error path — onComplete will never fire, release the lock.
    _syncing = false;
  }
  // _syncing now released by onComplete / watchdog / catch — NOT here. The
  // earlier synchronous `finally { _syncing = false }` released it before
  // Evolu's async replication completed, so the concurrent-push guard the
  // outer 60s stale-clear logic relies on was effectively cosmetic.
}

export async function pushCurrentProfile() {
  await pushProfile(state.currentProfile, state.importedData);
  pushContextToGateway();
}

// "Clean storage" — emergency localStorage compaction. The 'imported'
// blob can grow past the browser's 5 MB localStorage cap (caps were
// bypassed by the cross-device merge before the data-merge.js fix).
// When that happens every saveImportedData() throws QuotaExceededError
// and pushes wedge silently. This trims changeHistory to its intended
// 200-cap, drops cached model lists (re-fetched on demand), and reports
// before/after sizes via showNotification. Reachable from the sync
// popover so a phone user can run it without dev-tools access.
export async function cleanStorage() {
  let beforeBytes = 0;
  for (const key of Object.keys(localStorage)) beforeBytes += new Blob([localStorage.getItem(key) || '']).size;

  // 1. Drop ephemeral model-list caches — safe, will re-fetch on next API use
  const cacheKeys = [
    'labcharts-openrouter-models',
    'labcharts-venice-models',
    'labcharts-ppq-models',
    'labcharts-routstr-models',
    'labcharts-venice-e2ee-models',
  ];
  let cachesCleared = 0;
  for (const k of cacheKeys) {
    if (localStorage.getItem(k) != null) { localStorage.removeItem(k); cachesCleared++; }
  }

  // 2. Cap changeHistory in state.importedData if it's grown past 200
  let historyTrimmed = 0;
  if (Array.isArray(state.importedData?.changeHistory) && state.importedData.changeHistory.length > 200) {
    historyTrimmed = state.importedData.changeHistory.length - 200;
    state.importedData.changeHistory = state.importedData.changeHistory.slice(-200);
    // Persist immediately so localStorage shrinks
    try {
      const { saveImportedData } = await import('./data.js');
      await saveImportedData();
    } catch (e) {
      console.warn('[sync] cleanStorage: saveImportedData failed:', e?.message || e);
    }
  }

  let afterBytes = 0;
  for (const key of Object.keys(localStorage)) afterBytes += new Blob([localStorage.getItem(key) || '']).size;
  const freedKB = ((beforeBytes - afterBytes) / 1024).toFixed(0);
  const beforeMB = (beforeBytes / 1024 / 1024).toFixed(2);
  const afterMB = (afterBytes / 1024 / 1024).toFixed(2);

  const msg = `Storage: ${beforeMB} MB → ${afterMB} MB (freed ${freedKB} KB). ` +
              `Caches cleared: ${cachesCleared}. ` +
              `History trimmed: ${historyTrimmed}.`;
  _logSyncEvent('cleanup', msg);
  showNotification(msg, freedKB > 0 ? 'success' : 'info');
  return { beforeBytes, afterBytes, freedKB: +freedKB, cachesCleared, historyTrimmed };
}

// "Force resend" — bypasses the _syncing guard so a wedged in-flight flag
// doesn't silently no-op the push. Use when the local Evolu DB row is
// out of date with state.importedData and a normal Sync now isn't
// reaching evolu.update (most common cause: previous push set _syncing
// and Evolu's onComplete never fired, so subsequent pushes bail).
export async function forceResendCurrentProfile() {
  if (!evolu || !_syncEnabled) {
    showNotification('Sync is not enabled — nothing to push.', 'warning');
    return;
  }
  _logSyncEvent('forced', `Force resend ${state.currentProfile?.slice(0,8) || '?'}`);
  await pushProfile(state.currentProfile, state.importedData, { force: true });
  pushContextToGateway();
}

// User-triggered "Sync now" — pushes our local writes, then forces a pull so
// rows other devices pushed land here even if Evolu's auto-replication
// missed them. Symmetric — merge is order-independent.
export async function syncNow() {
  await pushCurrentProfile();
  _forcePull();
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
    // the relay, that's how we got here. The `-imported` blob lives in
    // IndexedDB now → encryptedRemoveItem hits both backends.
    await encryptedRemoveItem(profileStorageKey(tombId, 'imported'));
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
  // Mirror the inline cleanup from applyRemoteTombstones. The
  // `-imported` blob lives in IndexedDB now → encryptedRemoveItem
  // hits both backends so the IDB residue is also wiped.
  await encryptedRemoveItem(profileStorageKey(profileId, 'imported'));
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
        // Allowlist regex — defense-in-depth against a compromised relay
        // injecting a profileId that maps to a sensitive localStorage key
        // collision (e.g. "default-imported-chat-threads" → would land at
        // labcharts-default-imported-chat-threads-imported).
        if (!/^[a-zA-Z0-9_-]+$/.test(profileId)) continue;
        const remoteUpdated = row.syncedAt ? new Date(row.syncedAt).getTime() : 0;

        // Check local timestamp
        const localKey = profileStorageKey(profileId, 'imported');
        const localMeta = localStorage.getItem(`labcharts-${profileId}-sync-ts`);
        const localUpdated = localMeta ? parseInt(localMeta, 10) : 0;

        // Skip only when remote is strictly OLDER than what we've applied —
        // equal timestamps used to skip too, which left rows un-merged after
        // an earlier whole-blob-LWW pull stored its watermark but never
        // unioned local+remote. Reprocessing equal rows under the new merge
        // is idempotent (mergeImportedData is structurally pure) so this is
        // safe and fixes the "data already in localStorage but not visible
        // in state.importedData" stall.
        if (remoteUpdated < localUpdated) {
          const skipMsg = `Skip ${profileId.slice(0,8)} — remote older`;
          dbg(`Row ${profileId.slice(0,8)}: skip (remote ${remoteUpdated} < local ${localUpdated})`);
          _logSyncEvent('skip', skipMsg);
          continue;
        }
        dbg(`Row ${profileId.slice(0,8)}: PULLING (remote ${remoteUpdated} ${remoteUpdated === localUpdated ? '==' : '>'} local ${localUpdated})`);

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

        // Per-array union merge for id-keyed append-only arrays (sun feature
        // + a couple related). Without this, two devices each writing
        // independent rows clobber each other on whole-blob LWW. Single-
        // object subtrees and id-less arrays still LWW (handled inside
        // mergeImportedData).
        let localImportedForMerge = null;
        if (profileId === state.currentProfile) {
          localImportedForMerge = state.importedData || null;
        } else {
          try {
            const rawLocal = getEncryptionEnabled()
              ? await encryptedGetItem(localKey)
              : localStorage.getItem(localKey);
            if (rawLocal) localImportedForMerge = JSON.parse(rawLocal);
          } catch (e) {
            dbg('Could not read local importedData for merge:', e.message);
          }
        }
        const merged = localImportedForMerge
          ? mergeImportedData(localImportedForMerge, importedData)
          : importedData;
        const _ct = (b, k) => Array.isArray(b?.[k]) ? b[k].length : 0;
        const mergeMsg = `Pull ${profileId.slice(0,8)} — local sun=${_ct(localImportedForMerge,'sunSessions')}/dev=${_ct(localImportedForMerge,'lightDevices')} · remote sun=${_ct(importedData,'sunSessions')}/dev=${_ct(importedData,'lightDevices')} · merged sun=${_ct(merged,'sunSessions')}/dev=${_ct(merged,'lightDevices')}`;
        dbg(mergeMsg);
        _logSyncEvent('pull', mergeMsg);
        // wearableConnections preservation already happened on `importedData`;
        // mergeImportedData carries it through (since it's not in
        // ID_KEYED_ARRAYS, it falls into the LWW path which takes remote —
        // but `importedData` here was already patched with localWearableConnections).

        // If the merge added rows the remote didn't have (i.e. local had
        // unsynced state — the canonical case is "phone logged C, desktop
        // pushed Y first, neither sees the other"), the relay row still
        // reflects only the remote side. We need to rebroadcast the merged
        // result so the *other* device pulls our union next round. Without
        // this, convergence stalls at the first cross-device race because
        // pull-and-merge is local-only — nothing republishes the union.
        // Use a structural id-set diff (not JSON.stringify equality) — JSON
        // serialization order varies with merge-insertion order and would
        // cause an infinite ping-pong rebroadcast across devices.
        const needsRebroadcast = !!localImportedForMerge
          && localHasRowsRemoteLacks(localImportedForMerge, importedData);
        // Same diff in the *other* direction: did REMOTE bring rows local
        // didn't have? Used to gate the active-view re-render so we don't
        // wipe an in-progress form input on every pull where the merge
        // produced no observable change.
        const remoteBroughtNewRows = !!localImportedForMerge
          && localHasRowsRemoteLacks(importedData, localImportedForMerge);

        // Persist the merged importedData. Always go through
        // encryptedSetItem — it routes big-blob `-imported` keys to
        // IndexedDB regardless of encryption state. Bypassing this
        // (the old non-encryption branch did `localStorage.setItem`
        // directly) re-introduces the 5 MB quota wall.
        const importedJson = JSON.stringify(merged);
        await encryptedSetItem(localKey, importedJson);
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
          state.importedData = merged;
          migrateProfileData(state.importedData);
          // Reload chat threads + active thread messages into memory and re-render
          if (chatData) {
            window.loadChatThreads?.();
            window.renderThreadList?.();
            window.loadChatHistory?.(); // reloads state.chatHistory from localStorage + renders
          }
          // Re-render whatever view the user is on so the merged state
          // becomes visible — but ONLY when the merge actually produced
          // new content from the remote side. `localImportedForMerge`
          // already had everything ⇒ no observable change ⇒ skip the
          // re-render so an in-progress form (e.g. typing a duration
          // into the session log dialog) doesn't get wiped on every pull.
          const activeNav = document.querySelector('.nav-item.active');
          const cat = activeNav?.dataset?.category || 'dashboard';
          if (!remoteBroughtNewRows) {
            // Remote brought nothing new (local was already a superset or
            // identical for every id-keyed array). Profile-field / chat /
            // displayPrefs handlers above already re-rendered their own
            // surfaces; skip the global navigate() so an in-progress form
            // (e.g. typing a duration into the session log dialog) survives.
            dbg(`Pulled active profile ${profileId.slice(0,8)} — no new rows from remote, skipping re-render of '${cat}'`);
          } else {
            window.navigate?.(cat);
            if (cat !== 'dashboard') {
              showNotification('Data updated from another device', 'success');
            }
            dbg(`Pulled active profile ${profileId.slice(0,8)} → re-rendered '${cat}'`);
          }
        } else {
          dbg('Pulled profile:', profileId);
        }

        // Rebroadcast the union if local had rows the remote lacked. Defer
        // with setTimeout to avoid recursing inside the pull tick + give
        // chat/profile/aiSettings appliers a chance to settle first. Skipped
        // for non-active profiles — pushProfile uses state.importedData,
        // which is only valid for the current profile.
        if (needsRebroadcast && profileId === state.currentProfile) {
          // Don't pile rebroadcast pushes on top of an in-flight push — Evolu
          // serializes them and the relay can lag, producing the
          // sun=0/sun=1/sun=1 push storm seen in v1.7.5 diagnostics. Skip the
          // rebroadcast if a push is already pending; the next pull cycle
          // (after that push lands) will redo this check correctly.
          if (_syncStatus.push === 'pending') {
            dbg(`Row ${profileId.slice(0,8)}: rebroadcast deferred — push already pending`);
            _logSyncEvent('skip', `Rebroadcast deferred — push pending`);
          } else if (!_consumeRebroadcastBudget(profileId)) {
            dbg(`Row ${profileId.slice(0,8)}: rebroadcast suppressed — ${_REBROADCAST_CAP} already in last 5min (clock skew?)`);
            _logSyncEvent('skip', `Rebroadcast budget exhausted — possible clock skew`);
          } else {
            dbg(`Row ${profileId.slice(0,8)}: rebroadcast — local had unsynced rows`);
            _logSyncEvent('rebroadcast', `Rebroadcast ${profileId.slice(0,8)}`);
            // Snapshot importedData at SCHEDULE time and re-verify the
            // active profile when the timer fires. Without these, a profile
            // switch in the 100ms gap would push the new active profile's
            // state.importedData into the *original* profile's relay row.
            const snapshotImported = merged;
            setTimeout(() => {
              if (profileId !== state.currentProfile) {
                dbg(`Rebroadcast aborted — active profile switched`);
                return;
              }
              pushProfile(profileId, snapshotImported);
            }, 100);
          }
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
    // Earlier versions pre-bumped local-sync-ts to Date.now() here, to keep a
    // pull firing during the debounce window from clobbering a fresh local
    // write (back when pull did wholesale-replace). With the per-array merge
    // (data-merge.js mergeImportedData) the clobber is gone — pull now does
    // a union-by-id, and incidental local saves (re-renders, derived caches)
    // were silently shifting the watermark above incoming remote rows so
    // pulls skipped with `remoteUpdated <= localUpdated`. Letting pull run
    // and merge is correct: cross-device adds converge instead of skipping.
    // pushProfile still bumps sync-ts after a successful push.
    if (profileId) {
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
  const relayUrl = getSyncRelay();
  const relayDot = s.relay === 'connected' ? '#22c55e' : s.relay === 'unreachable' ? 'var(--red)' : 'var(--text-muted)';
  const relayLabel = s.relay === 'connected' ? 'Connected to relay' : s.relay === 'unreachable' ? 'Relay unreachable' : 'Checking\u2026';
  // Detect a stuck push: pending > 15s usually means Evolu's worker can't
  // reach the relay (offline phone, relay down, OPFS lock). Surface it so
  // the user knows clicking Sync now won't help \u2014 they need network back.
  // Also treat the post-watchdog `error: PushStuck` state as stuck so the
  // Reload button stays visible even after status flips off `pending`.
  const pendingMs = (s.push === 'pending' && s.pushStartedAt) ? (Date.now() - s.pushStartedAt) : 0;
  const isPushStuckError = s.push === 'error' && s.lastError?.type === 'PushStuck';
  const stuckPush = pendingMs > 15_000 || isPushStuckError;
  const pushLabel = s.push === 'confirmed' ? `Confirmed ${_timeAgo(s.pushConfirmedAt)}`
    : isPushStuckError ? `<span style="color:var(--red)">Stuck \u2014 relay didn't ack</span>`
    : pendingMs > 15_000 ? `<span style="color:var(--red)">Stuck for ${Math.round(pendingMs/1000)}s \u2014 relay unreachable?</span>`
    : s.push === 'pending' ? 'Pending\u2026'
    : s.push === 'error' ? '<span style="color:var(--red)">Failed</span>' : '\u2014';
  const pullLabel = s.pullReceivedAt ? `Checked ${_timeAgo(s.pullReceivedAt)}` : '\u2014';
  const errorLine = s.lastError ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px">${escapeHTML(s.lastError.type)} ${_timeAgo(s.lastError.at)}</div>` : '';

  pop = document.createElement('div');
  pop.id = 'sync-popover';
  pop.className = 'sync-popover';
  // Last few sync events — visible without USB-debugging the console.
  // Useful when phone vs desktop disagree on what's on the relay.
  const events = getRecentSyncEvents().slice(-6).reverse();
  const eventColor = { push: 'var(--accent)', pull: 'var(--green)', skip: 'var(--text-muted)', rebroadcast: 'var(--orange)' };
  const eventsHtml = events.length ? `
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:11px;color:var(--text-muted);max-height:160px;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-weight:600;color:var(--text-secondary);flex:1">Recent activity</span>
        ${(typeof window !== 'undefined' && window.isDebugMode && window.isDebugMode()) ? `<button class="ctx-btn-option" style="font-size:10px;padding:2px 8px" onclick="window.copySyncEvents(this)" title="Copy events to clipboard (debug mode only)">Copy</button>` : ''}
      </div>
      ${events.map(e => `<div style="margin-bottom:3px"><span style="color:${eventColor[e.kind] || 'var(--text-muted)'};font-weight:600">${e.kind}</span> · ${_timeAgo(e.at)} · <span style="font-family:monospace;font-size:10px">${escapeHTML(e.text)}</span></div>`).join('')}
    </div>` : '';
  pop.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="width:8px;height:8px;border-radius:50%;background:${relayDot};display:inline-block"></span><span style="font-size:13px">${relayLabel}</span></div>
    <div style="font-size:10px;color:var(--text-muted);font-family:monospace;margin-bottom:8px;word-break:break-all">${escapeHTML(relayUrl)}</div>
    <div style="font-size:12px;color:var(--text-muted);line-height:1.8">
      <div>Push: ${pushLabel}</div>
      <div>Pull: ${pullLabel}</div>
    </div>
    ${errorLine}
    ${eventsHtml}
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="ctx-btn-option" style="font-size:12px" onclick="syncNow();toggleSyncDetail()">Sync now</button>
      <button class="ctx-btn-option" style="font-size:12px${stuckPush ? ';color:var(--orange);border-color:var(--orange)' : ''}" onclick="forceResendCurrentProfile();toggleSyncDetail()" title="Bypasses the in-flight guard. Use when Sync now isn't reaching the relay (typically because a prior push got stuck and the worker still thinks it's running).">Force resend</button>
      <button class="ctx-btn-option" style="font-size:12px" onclick="cleanStorage().then(()=>toggleSyncDetail())" title="Trim changeHistory to its 200-entry cap and clear cached AI model lists. Use when localStorage is full and pushes throw QuotaExceededError silently.">Clean storage</button>
      <button class="ctx-btn-option" style="font-size:12px" onclick="checkRelayConnection().then(ok=>showNotification(ok?'Relay reachable':'Relay UNREACHABLE',ok?'success':'error'))">Test relay</button>
      <button class="ctx-btn-option" style="font-size:12px;${stuckPush ? 'color:var(--red);border-color:var(--red)' : ''}" onclick="window.location.reload()" title="Reloads the page to re-init the sync worker.">Reload</button>
      <button class="ctx-btn-option" style="font-size:12px" onclick="showSyncDiagnose()">Diagnose</button>
      <button class="ctx-btn-option" style="font-size:12px" onclick="toggleSyncDetail();openSettingsModal('data')">Settings</button>
    </div>`;
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(pop);
  // Close on outside click
  const close = (e) => { if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { pop.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

// Read-only modal that dumps Evolu's local state — both devices should
// show the same `ownerId` / `mnemonicPrefix`. If they differ, the two
// devices are talking to different Evolu owners and will never see each
// other's data despite using the same relay URL.
export function showSyncDiagnose() {
  const d = getEvoluDiagnostics();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  const rowsHtml = d.rows.length
    ? d.rows.map(r => `<tr><td style="padding:4px 8px;font-family:monospace;font-size:11px">${escapeHTML(r.profileId || '?')}</td><td style="padding:4px 8px;font-family:monospace;font-size:11px;color:var(--text-muted)">${r.syncedAtMs}</td><td style="padding:4px 8px;text-align:right">${r.sun}</td><td style="padding:4px 8px;text-align:right">${r.dev}</td><td style="padding:4px 8px;text-align:right;color:var(--text-muted);font-size:11px">${r.bytes}b</td></tr>`).join('')
    : '<tr><td colspan="5" style="padding:8px;color:var(--text-muted);text-align:center">No rows in local Evolu DB</td></tr>';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Sync diagnose" style="max-width:640px">
    <div class="modal-header"><h3>Sync diagnose</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button></div>
    <div class="modal-body" style="font-size:13px">
      <div style="margin-bottom:12px">
        <div><b>Sync enabled:</b> ${d.syncEnabled ? 'yes' : 'no'}</div>
        <div><b>Relay:</b> <span style="font-family:monospace;font-size:11px;word-break:break-all">${escapeHTML(d.relay || '—')}</span></div>
        <div><b>Owner ID:</b> <span style="font-family:monospace;font-size:11px">${escapeHTML(d.ownerId || '— (not initialized)')}</span></div>
        <div><b>Mnemonic prefix:</b> <span style="font-family:monospace;font-size:11px">${escapeHTML(d.mnemonicPrefix || '—')}</span></div>
        <div style="color:var(--text-muted);font-size:11px;margin-top:6px">If two devices show different Owner ID or Mnemonic prefix, they are using different identities and will never see each other's data even on the same relay.</div>
      </div>
      <div style="margin-bottom:12px">
        <div><b>Active profile (this device):</b> <span style="font-family:monospace;font-size:11px">${escapeHTML(d.activeProfileId || '?')}</span></div>
        <div>In-memory state: sunSessions=${d.activeImported.sunSessions} lightDevices=${d.activeImported.lightDevices}</div>
      </div>
      <div>
        <b>Rows in this device's local Evolu DB:</b>
        <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:12px">
          <thead><tr style="border-bottom:1px solid var(--border);text-align:left"><th style="padding:4px 8px">profileId</th><th style="padding:4px 8px">syncedAt(ms)</th><th style="padding:4px 8px;text-align:right">sun</th><th style="padding:4px 8px;text-align:right">dev</th><th style="padding:4px 8px;text-align:right">size</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div style="color:var(--text-muted);font-size:11px;margin-top:6px">Compare this table on phone vs desktop. Same profileId, same syncedAt(ms), same sun/dev counts → both devices already have the same data and the issue is rendering. Different counts → relay-replication isn't propagating between Evolu instances.</div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// Subscribe to status changes → repaint indicator + re-render the popover
// in place so a watchdog flip (e.g. 30s push-stuck) updates the labels and
// the Reload button styling without the user closing / reopening the panel.
subscribeSyncStatus(() => {
  updateSyncIndicator();
  if (document.getElementById('sync-popover')) {
    toggleSyncDetail(); toggleSyncDetail();
  }
});

// ═══════════════════════════════════════════════
// EXPORTS for window binding
// ═══════════════════════════════════════════════

// Copy the recent sync activity log to clipboard — meant for triage,
// when phone-side debugging needs the events shared without retyping.
// Format: ISO timestamp + kind + text per line. Falls back to a manual
// selection prompt on browsers without clipboard API permission.
async function copySyncEvents(btn) {
  const events = getRecentSyncEvents();
  const lines = events.map(e => `${new Date(e.at).toISOString()}  ${e.kind.padEnd(12)}  ${e.text}`);
  const blob = `Sync activity (${events.length} events) — ${new Date().toISOString()}\n` +
               `Relay: ${getSyncRelay() || '(none)'}\n` +
               `Sync enabled: ${isSyncEnabled()}\n\n` +
               lines.join('\n');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(blob);
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✓ Copied';
        setTimeout(() => { if (btn) btn.textContent = orig; }, 1200);
      }
      return;
    }
  } catch (e) {
    // Clipboard API blocked (e.g. iframe, insecure context, permissions
    // denied) → fall through to the textarea-select path so the user
    // can still grab the log manually.
  }
  const ta = document.createElement('textarea');
  ta.value = blob;
  ta.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:80vw;max-width:600px;height:60vh;z-index:10000;background:var(--bg-card,#222);color:var(--text-primary,#fff);border:1px solid var(--border,#444);padding:12px;font:12px monospace;border-radius:8px';
  document.body.appendChild(ta);
  ta.select();
  showNotification('Auto-copy blocked — select the text above and copy manually.', 'warning');
  ta.addEventListener('blur', () => ta.remove(), { once: true });
}

Object.assign(window, {
  enableSync,
  disableSync,
  getMnemonic,
  getMnemonicResolutionError,
  getSyncBlocker,
  restoreFromMnemonic,
  isSyncEnabled,
  pushCurrentProfile,
  forceResendCurrentProfile,
  cleanStorage,
  syncNow,
  showSyncDiagnose,
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
  copySyncEvents,
});
