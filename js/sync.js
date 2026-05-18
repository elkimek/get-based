// sync.js — Evolu sync layer (opt-in, E2E encrypted)
// Stores importedData + profile metadata per profile as a JSON blob.
// Last-write-wins at the profile level — fine for single-user cross-device sync.

import { state } from './state.js';
import { showNotification, isDebugMode, escapeHTML, loadScriptOnce } from './utils.js';
import { profileStorageKey, getProfiles, saveProfiles, migrateProfileData, loadProfile } from './profile.js';
import { getEncryptionEnabled, encryptedSetItem, encryptedGetItem, encryptedRemoveItem } from './crypto.js';
import { mergeImportedData, localHasRowsRemoteLacks, COMPOSITE_KEYED_ARRAYS, pickTimestamp, getAt, setAt } from './data-merge.js';

function dbg(...args) { if (isDebugMode()) console.log('[sync]', ...args); }

let _bip39Load = null;
let _qrCodeLoad = null;

async function ensureBip39() {
  if (window.bip39) return window.bip39;
  if (!_bip39Load) {
    _bip39Load = loadScriptOnce('/vendor/bip39-minimal.js').then(() => {
      if (!window.bip39) throw new Error('BIP-39 library did not initialize');
      return window.bip39;
    }).catch(err => {
      _bip39Load = null;
      throw err;
    });
  }
  return _bip39Load;
}

async function ensureQRCode() {
  if (typeof qrcode === 'function') return qrcode;
  if (!_qrCodeLoad) {
    _qrCodeLoad = loadScriptOnce('/vendor/qrcode-generator.js').then(() => {
      if (typeof qrcode !== 'function') throw new Error('QR code library did not initialize');
      return qrcode;
    }).catch(err => {
      _qrCodeLoad = null;
      throw err;
    });
  }
  return _qrCodeLoad;
}

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
export async function getEvoluDiagnostics() {
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
      let sun = 0, dev = 0, payloadProfileId = null, format = 'plain';
      try {
        // parseSyncPayload routes plain JSON + the v1.6.4 GZ envelope.
        // Without it the new compressed rows would render as 0/0 + ? in
        // the diagnose modal (raw JSON.parse on `GZ|v1|<base64>` throws).
        if (typeof row.dataJson === 'string' && row.dataJson.startsWith('GZ|v1|')) format = 'gz';
        const parsed = await parseSyncPayload(row.dataJson || '{}');
        const imp = parsed?.importedData || parsed;
        sun = Array.isArray(imp?.sunSessions) ? imp.sunSessions.length : 0;
        dev = Array.isArray(imp?.lightDevices) ? imp.lightDevices.length : 0;
        // Fallback when the row's profileId column is empty (seen in the
        // wild on cross-device replication of older inserts) — read it
        // from the payload's nested profile object.
        payloadProfileId = parsed?.profile?.id || null;
      } catch (e) {
        // v1.7.15 audit fix: previously silent. The diagnose modal would
        // render the row as 0/0 — indistinguishable from a real empty row.
        // Log so triage can see which rows the parse path is rejecting
        // (gzip-bomb defence trips, malformed envelope, etc).
        _logSyncEvent('skip', `Diagnose row ${String(row.id || '?').slice(0, 8)} parse failed: ${String(e?.message || e).slice(0, 80)}`);
      }
      out.rows.push({
        profileId: row.profileId || payloadProfileId,
        profileIdSource: row.profileId ? 'column' : (payloadProfileId ? 'payload' : 'missing'),
        syncedAt: row.syncedAt,
        syncedAtMs: row.syncedAt ? new Date(row.syncedAt).getTime() : 0,
        sun, dev, format,
        bytes: (row.dataJson || '').length,
      });
    }
  } catch (e) { out.rowsError = String(e?.message || e); }
  // What's actually in this device's active state right now
  out.activeImported.sunSessions = Array.isArray(state.importedData?.sunSessions) ? state.importedData.sunSessions.length : 0;
  out.activeImported.lightDevices = Array.isArray(state.importedData?.lightDevices) ? state.importedData.lightDevices.length : 0;
  // Phase 1 dual-write health for the active profile. Surfaces (a) recent
  // push payload sizes (blob vs delta) so we can confirm the per-row
  // datapath is shipping a small fraction of the blob (Phase 2 cutover
  // gate), and (b) per-array row counts seen by the pull side (cross-
  // device replication gauge).
  out.deltaTelemetry = state.currentProfile ? getDeltaTelemetry(state.currentProfile) : null;
  // Phase 2 cutover readiness — per-surface gap analysis. Surfaces in
  // 'missing-rows' state would silently lose data on Phase 2 flip; the
  // modal renders the full table so any blocker is visible.
  out.cutoverReadiness = state.currentProfile ? getDeltaCutoverReadiness(state.currentProfile, state.importedData) : null;
  return out;
}

// Render the diagnostics object as plain text — meant for the Copy button
// in showSyncDiagnose, so a user can paste the device's state into chat /
// support without retyping. Mirrors the modal's structure exactly.
function _evoluDiagnosticsText(d) {
  const lines = [
    `Sync diagnose @ ${new Date().toISOString()}`,
    `Sync enabled: ${d.syncEnabled ? 'yes' : 'no'}`,
    `Relay: ${d.relay || '-'}`,
    `Owner ID: ${d.ownerId || '- (not initialized)'}`,
    `Mnemonic prefix: ${d.mnemonicPrefix || '-'}`,
    `Active profile: ${d.activeProfileId || '?'}`,
    `In-memory state: sunSessions=${d.activeImported.sunSessions} lightDevices=${d.activeImported.lightDevices}`,
    `Rows in this device's local Evolu DB:`,
  ];
  if (!d.rows.length) {
    lines.push('  (none)');
  } else {
    lines.push('  profileId         syncedAtMs       sun  dev  size       fmt   src');
    for (const r of d.rows) {
      const pid = String(r.profileId || '?').padEnd(17);
      const ts = String(r.syncedAtMs).padEnd(16);
      const sun = String(r.sun).padStart(3);
      const dev = String(r.dev).padStart(3);
      const size = String(r.bytes + 'b').padStart(9);
      const fmt = String(r.format || '?').padEnd(5);
      const src = String(r.profileIdSource || '?');
      lines.push(`  ${pid} ${ts} ${sun}  ${dev}  ${size}  ${fmt} ${src}`);
    }
  }
  if (d.rowsError) lines.push(`Rows read error: ${d.rowsError}`);
  const t = d.deltaTelemetry;
  if (t) {
    const s = t.summary;
    const pct = (s.ratio * 100).toFixed(1);
    lines.push('');
    lines.push(`Phase 1 dual-write health (last ${s.count} pushes):`);
    lines.push(`  blob total: ${s.totalBlobBytes}b · delta total: ${s.totalDeltaBytes}b · ops: ${s.totalOps}`);
    lines.push(`  ratio (delta:blob): ${pct}%  ${s.ratio < 0.05 ? '(healthy — Phase 2 cutover safe)' : '(still high — keep baking)'}`);
    if (t.pushes.length > 0) {
      lines.push('  recent pushes:');
      lines.push('    when                blob       delta      ops  arrays');
      for (const p of t.pushes.slice(-6).reverse()) {
        const when = new Date(p.at).toISOString().slice(11, 19) + 'Z';
        const blob = String((p.blobBytes || 0) + 'b').padStart(9);
        const delta = String((p.totalDeltaBytes || 0) + 'b').padStart(9);
        const ops = String(p.totalOps || 0).padStart(3);
        const arrs = Object.entries(p.perArray || {})
          .filter(([, v]) => (v.ins + v.upd + v.tom) > 0)
          .map(([k, v]) => `${k}(${v.ins}/${v.upd}/${v.tom})`).join(' ');
        lines.push(`    ${when}        ${blob}  ${delta}  ${ops}  ${arrs || '-'}`);
      }
      lines.push('    (arrays column: name(insert/update/tombstone))');
    }
    const pullArrays = Object.keys(t.pull.perArray || {});
    if (pullArrays.length > 0) {
      lines.push(`  pull-side rows (latest merge ${t.pull.mergedAt ? new Date(t.pull.mergedAt).toISOString() : '-'}):`);
      for (const name of pullArrays.sort()) {
        const v = t.pull.perArray[name];
        lines.push(`    ${name.padEnd(20)} live=${v.live} tombstones=${v.tombstones}`);
      }
      lines.push('    (compare across devices — diverging counts = relay replication lag)');
    }
  }
  const r = d.cutoverReadiness;
  if (r) {
    lines.push('');
    lines.push(`Phase 2 cutover readiness: ${r.ready ? 'READY ✓' : `BLOCKED — ${r.blockerCount} surface(s) missing rows`}`);
    lines.push(`  ${r.surfaceCount} surfaces total`);
    const blockers = Object.entries(r.surfaces).filter(([, v]) => v.status === 'missing-rows');
    if (blockers.length > 0) {
      lines.push(`  ⚠ BLOCKERS — surfaces with local data but no per-row push:`);
      for (const [name, v] of blockers) {
        lines.push(`    ${name.padEnd(20)} shape=${v.shape} local=${v.localCount} rows=${v.rowCount}`);
      }
    }
    const ok = Object.entries(r.surfaces).filter(([, v]) => v.status === 'ok');
    if (ok.length > 0) {
      lines.push(`  ✓ ok (${ok.length}): ${ok.map(([n]) => n).join(', ')}`);
    }
  }
  return lines.join('\n');
}

let evolu = null;
let profileQuery = null;
let tombstoneQuery = null;
let itemRowQuery = null;
let _syncEnabled = false;
let _syncStatePrimed = false;
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

export function primeSyncState() {
  if (!_syncStatePrimed) {
    _syncEnabled = localStorage.getItem(SYNC_STORAGE_KEY) === 'true';
    _syncStatePrimed = true;
  }
  return _syncEnabled;
}

export function isSyncEnabled() { return _syncStatePrimed ? _syncEnabled : primeSyncState(); }

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
  primeSyncState();
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
    const ItemRowId = id("ItemRow");
    // Per-array delta table (Phase 1 of the CRDT-delta refactor — see
    // memory/project_evolu_delta_refactor_plan.md). Each row holds ONE
    // item from one of the importedData arrays (sunSessions, lightDevices,
    // entries, …). Push side dual-writes: every successful pushProfile()
    // also emits inserts/updates/tombstones for items that changed since
    // the last successful push (snapshot diff). Pull side merges itemRow
    // payloads into state.importedData BEFORE the fat-blob merge runs, so
    // per-row data is authoritative when present and the blob acts as
    // fallback for pre-Phase-1 device pushes.
    //
    // ONE table with arrayName discriminator instead of N tables: adding a
    // new array doesn't require schema migration, single subscribeQuery
    // covers everything, identical merge logic per array.
    const Schema = {
      profileData: {
        id: ProfileDataId,
        profileId: NonEmptyString,
        dataJson: NonEmptyString,
        syncedAt: nullOr(NonEmptyString),
      },
      itemRow: {
        id: ItemRowId,
        profileId: NonEmptyString,
        arrayName: NonEmptyString,  // 'sunSessions' | 'lightDevices' | …
        itemId: NonEmptyString,     // the item.id field, e.g. 'sun_1714780123456'
        payload: NonEmptyString,    // gzip-base64-encoded JSON of one item
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

    // Per-array delta rows (live + tombstoned). The merge logic in
    // _mergeItemRowsIntoImported sorts on isDeleted, so a single query
    // returning every itemRow is sufficient. profileId filter applied
    // at merge time so subscribeQuery doesn't have to refire on each
    // currentProfile change.
    itemRowQuery = evolu.createQuery((db) =>
      db.selectFrom("itemRow").selectAll()
    );

    // Subscribe to sync updates
    evolu.subscribeQuery(profileQuery)(() => {
      _subscriptionFireCount++;
      dbg(`subscription fired (#${_subscriptionFireCount}), syncing: ${_syncing}, pulling: ${_pulling}`);
      if (!_syncing && !_pulling) onSyncReceived();
    });
    // itemRow rows arriving asynchronously must also retrigger the merge
    // — without this, a per-row push from device A would only land on
    // device B after the next blob-driven pull tick (which v1.6.4's 10s
    // debounce stretches out). Subscribing here gives near-real-time
    // delta propagation, which is half the point of Phase 1.
    evolu.subscribeQuery(itemRowQuery)(() => {
      if (!_syncing && !_pulling) onSyncReceived();
    });

    // Load initial data — store promise for enableSync to await
    _queryLoaded = Promise.all([
      evolu.loadQuery(profileQuery),
      evolu.loadQuery(tombstoneQuery),
      evolu.loadQuery(itemRowQuery),
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

    // Resume-from-suspended-tab recovery — Android browsers (Brave/Chrome on
    // mobile) aggressively kill background tab processes to save battery.
    // The renderer + Evolu's WebSocket worker get evicted; on resume we
    // come back with a stale (or no) WS, and Evolu's reconnect loop doesn't
    // automatically drain the push queue or trigger a fresh pull. Without
    // this hook the user has to swipe-to-refresh after every screen-off
    // cycle to converge — observed in production on Brave Android where
    // the device shows up in chrome://inspect/#devices, sync indicator
    // stays yellow, then disappears entirely once the renderer is reaped.
    //
    // Throttled to once per 30s — multiple visibility flips in quick
    // succession (notifications, recents-pane peeks) shouldn't pile up
    // pushes, and the existing 30s poll covers the steady-state case.
    let _lastVisibleSyncAt = 0;
    const _kickSync = (reason) => {
      if (!_syncEnabled || !evolu) return;
      const now = Date.now();
      if (now - _lastVisibleSyncAt < 30_000) return;
      _lastVisibleSyncAt = now;
      dbg(`Tab resume (${reason}) — kicking syncNow`);
      // Schedule via setTimeout so the visibilitychange handler returns
      // before any heavy push/pull work starts (browsers occasionally
      // throttle long-running sync work in the visibility transition).
      setTimeout(() => {
        pushCurrentProfile().catch(() => {});
        _forcePull();
      }, 100);
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') _kickSync('visibilitychange');
      });
    }
    if (typeof window !== 'undefined') {
      // pageshow fires when the tab is restored from the back/forward cache
      // or after the renderer was killed and the page is rehydrating.
      window.addEventListener('pageshow', (e) => {
        if (e.persisted) _kickSync('pageshow-persisted');
      });
      // Network came back — drain any pending pushes + toast the user.
      // Evolu queues writes locally while offline; the user has no other
      // signal that their edits are safely persisted (vs. lost). The
      // toasts are throttled — only one fires per offline → online
      // transition, not per visibilitychange.
      let _lastNetState = navigator.onLine ?? true;
      window.addEventListener('online', () => {
        _kickSync('online');
        if (!_lastNetState) {
          _lastNetState = true;
          if (window.showNotification) window.showNotification('Back online — syncing your changes.', 'success', 3000);
        }
      });
      window.addEventListener('offline', () => {
        _lastNetState = false;
        if (window.showNotification) window.showNotification('Offline — changes are saved locally and will sync when you reconnect.', 'info', 5000);
      });
    }

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
// the Evolu DB row's dataJson for the active profile. If local has unsynced
// changes — either new ids the remote lacks OR same-id rows where the local
// copy has a strictly higher pickTimestamp (the canonical signal data-merge.js
// uses to pick a winner) — trigger a forced push so the divergence catches up
// without the user needing to tap Force Resend.
//
// The within-id timestamp branch is what catches the "phone stopped a session
// then closed before the 10s debounce push fired" failure mode: ids match on
// both sides but local has the stopped session (endedAt set, ts=endedAt) while
// remote still has the active session (endedAt=null, ts=startedAt). Without it
// the stop sits in localStorage indefinitely until some other edit triggers
// onDataSaved.
async function _reconcileLocalStorageWithEvolu() {
  if (!evolu || !_syncEnabled || !state.currentProfile || !state.importedData) return;
  const rows = evolu.getQueryRows(profileQuery);
  const existing = rows?.find(r => r.profileId === state.currentProfile);
  // No existing row → first sync ever for this profile, normal push path
  // (onDataSaved or enableSync) will handle it. Skip.
  if (!existing) return;
  let remoteImported;
  try {
    const parsed = await parseSyncPayload(existing.dataJson);
    remoteImported = parsed?.importedData || null;
  } catch {
    // Malformed row → reconciliation can't reason about it. The user can
    // still recover via the Force Resend button.
    return;
  }
  if (!remoteImported) return;

  // Reuse the rebroadcast helper — same semantic ("local has anything remote
  // doesn't reflect"), same id-keyed array list, same pickTimestamp tiebreak.
  // Returns true on (a) new local ids, (b) same-id with lTs>rTs, (c) tombstones
  // local has remote lacks. Without (b) the start-then-stop-then-close sequence
  // strands the stop on the phone forever — relay row keeps endedAt=null and
  // every other device shows the session as still running.
  const localHasUnsynced = localHasRowsRemoteLacks(state.importedData, remoteImported);
  if (!localHasUnsynced) {
    dbg('Startup reconciliation: localStorage and Evolu row match — nothing to do');
    return;
  }
  dbg('Startup reconciliation: localStorage has unsynced rows (new ids or higher-ts same-id) vs Evolu row');
  _logSyncEvent('reconcile', `Reconcile ${state.currentProfile.slice(0, 8)} — local has unsynced rows (lost-debounce catch-up)`);
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

  // v1.7.11 audit fix: clear per-array delta snapshots too. After a
  // re-enable (which may bring a different Evolu owner via mnemonic
  // change), the OLD snapshot would tell the planner "I already pushed
  // these items" → next push silently skips them, so the new owner's
  // relay never receives the user's existing data. Drop the snapshots
  // so the next push re-emits everything as inserts (relay starts
  // empty under the new owner anyway). Same for telemetry + cutover
  // flag (cutover was profile-scoped to the previous owner).
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.includes('-delta-') || key.includes('-sync-cutover-v2') || key.includes('-relay-bytes-') || key === 'labcharts-relay-quota-warned') {
      localStorage.removeItem(key);
    }
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
  if (isDebugMode()) {
    console.table?.(info.evoluRows);
    console.log('[sync] Diagnostics:', JSON.stringify(info, null, 2));
  }
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
    // Clear sync timestamps + per-array delta snapshots + cutover flag.
    // After mnemonic restore, the new Evolu owner has zero rows; the OLD
    // delta snapshot would tell the planner "I already pushed these
    // items" → next push silently skips them, leaving the new owner's
    // relay forever empty for those items. Drop the snapshots so the
    // first push under the new identity re-emits everything as inserts.
    // (v1.7.11 audit fix.)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.endsWith('-sync-ts') || key.includes('-delta-') || key.includes('-sync-cutover-v2') || key.includes('-relay-bytes-') || key === 'labcharts-relay-quota-warned') {
        localStorage.removeItem(key);
      }
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
      if (!msgRaw) continue;
      // Per-thread try/catch — a single corrupted thread payload must NOT
      // nuke the entire chat-data collection (the outer try/catch returns
      // null, silently dropping every other thread on the way out).
      try { messages[t.id] = JSON.parse(msgRaw); } catch (_) {}
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

// Phase 2 cutover flag — when set, buildSyncPayload omits importedData
// from the blob entirely. Per-row CRDT deltas (DELTA_ARRAYS / DELTA_MAPS /
// DELTA_SCALARS) carry every field instead. Per-profile because different
// profiles may bake at different rates (e.g. a sun-only profile may be
// READY before a labs+sun+context-cards profile). Set via the diagnose UI
// only when getDeltaCutoverReadiness reports READY — see enablePhase2Cutover
// below for the gated setter.
function _cutoverFlagKey(profileId) {
  return `labcharts-${profileId}-sync-cutover-v2`;
}
export function isPhase2CutoverEnabled(profileId) {
  if (!profileId) return false;
  try { return localStorage.getItem(_cutoverFlagKey(profileId)) === '1'; } catch { return false; }
}
// Gated setter — refuses to enable cutover when readiness check finds
// blockers. Returns { ok, reason, blockerCount } so the UI can render
// a useful error. Disable is always allowed (escape hatch).
export function enablePhase2Cutover(profileId) {
  if (!profileId) return { ok: false, reason: 'no-profile' };
  const r = getDeltaCutoverReadiness(profileId);
  if (!r || !r.ready) {
    return { ok: false, reason: 'not-ready', blockerCount: r?.blockerCount || -1 };
  }
  try { localStorage.setItem(_cutoverFlagKey(profileId), '1'); return { ok: true }; }
  catch (e) { return { ok: false, reason: 'storage', error: String(e?.message || e) }; }
}
export function disablePhase2Cutover(profileId) {
  if (!profileId) return false;
  try { localStorage.removeItem(_cutoverFlagKey(profileId)); return true; } catch { return false; }
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
  const safeImported = stripGeneticsSnpsFromBlob(stripWearableCredentials(importedData));
  // Phase 2: when cutover is enabled (readiness-gated), drop importedData
  // from the blob. Per-row deltas carry every field. The blob still
  // ships the small profile/aiSettings/chatData/displayPrefs envelope
  // because those don't have a per-row datapath (they're multi-key,
  // cross-cutting client config — different responsibility than the
  // data the user is tracking). Net push size drops from ~150 KB
  // (gzipped blob) to ~5–10 KB (envelope only) + per-row deltas.
  const cutover = isPhase2CutoverEnabled(profileId);
  const inner = JSON.stringify({
    _v: cutover ? 4 : 3,
    importedData: cutover ? undefined : safeImported,
    profile: profile || null,
    aiSettings: Object.keys(aiSettings).length > 0 ? aiSettings : undefined,
    chatData: chatData || undefined,
    displayPrefs: displayPrefs || undefined,
  });
  // Gzip + base64 envelope. v3 plain-JSON pushes were averaging ~500 KB,
  // hitting the relay's 50 MB per-owner cap in ~95 pushes (≈2 days of
  // moderate use) since Evolu stores every CRDT message in evolu_message
  // and (when Phase 2 cutover is OFF) we ship the entire importedData
  // blob each push. Gzip drops typical payloads ~70%, base64 reinflates
  // ~33%, net ~3× more pushes per quota. With Phase 2 cutover ON the
  // blob is omitted entirely (importedData absent above) and the inner
  // payload shrinks to a few KB envelope — gzip is still cheap enough
  // to stay on rather than special-case the smaller path.
  // Discriminator: pre-existing v3 plain JSON starts with "{"; the new
  // envelope starts with "GZ|" which is unambiguously not JSON. The
  // 1 KB threshold avoids spending the round-trip on tiny payloads
  // where gzip overhead dominates.
  if (typeof CompressionStream !== 'undefined' && inner.length > 1024) {
    try {
      const gz = await _gzipString(inner);
      return `GZ|v1|${_bytesToBase64(gz)}`;
    } catch {
      // Fall through to plain JSON. Never block a push on a compression
      // glitch — the relay accepts both formats.
    }
  }
  return inner;
}

async function _gzipString(str) {
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

// v1.7.12 audit fix: decompression-bomb defence for per-row payloads.
// A relay-controlled itemRow.payload could be a tiny gzip envelope
// (~few KB) that decompresses to hundreds of MB — gzip ratios above
// 1000:1 are trivial. Multiplied across 31 surfaces × N rows per
// surface, the tab OOMs. Per-row payloads are individual items
// (sun session, marker note, scalar object) — 1 MB is comfortably
// above any legitimate single-item size and well below any tab-killing
// threshold. Stream-reads with an in-flight cap so a 100-MB bomb
// fails fast instead of waiting for full decompression to OOM.
const _PER_ROW_DECOMPRESSED_CAP_BYTES = 1024 * 1024;
async function _gunzipToStringCapped(bytes, maxBytes = _PER_ROW_DECOMPRESSED_CAP_BYTES) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error(`per-row payload exceeds ${maxBytes} bytes after gunzip — refusing to trust (decompression-bomb defence)`);
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

// Test hook — exposes the cap helper for boundary regression tests.
// Not a public API; consumers should never reach into this object.
if (typeof window !== 'undefined') {
  window._syncTestHooks = Object.assign(window._syncTestHooks || {}, {
    gunzipCapped: _gunzipToStringCapped,
    perRowCapBytes: _PER_ROW_DECOMPRESSED_CAP_BYTES,
  });
}

function _bytesToBase64(bytes) {
  let s = '';
  // Chunked to avoid the call-stack-size cap on huge spreads (~100 KB+).
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function _base64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function stripWearableCredentials(importedData) {
  if (!importedData?.wearableConnections) return importedData;
  const { wearableConnections, ...rest } = importedData;
  return rest;
}

// Strip `genetics.snps` from the legacy blob payload so the only carrier
// for SNP membership is the per-key `genetics.snps` DELTA_MAPS path.
// Without this, mergeImportedData on pull treats genetics as a remote-
// wins scalar and replays whatever snps blob was on the relay — which
// can stomp a fresh local re-import. The per-row map merger that runs
// after blob merge re-applies the relay's individual rsID rows; that's
// the source of truth.
function stripGeneticsSnpsFromBlob(importedData) {
  if (!importedData?.genetics || typeof importedData.genetics !== 'object') return importedData;
  const { snps, ...geneticsMetadata } = importedData.genetics;
  return { ...importedData, genetics: geneticsMetadata };
}

// 5 MB cap. Pre-cap was 50 MB which let a pathological deeply-nested JSON
// OOM the tab on parse — a normal payload is well under 1 MB, so 5 MB is
// already 5× anticipated headroom. Unilateral lower bound on a malicious
// relay's blast radius.
const MAX_SYNC_PAYLOAD_BYTES = 5_000_000;

async function parseSyncPayload(dataJson) {
  if (typeof dataJson !== 'string' || dataJson.length > MAX_SYNC_PAYLOAD_BYTES) {
    throw new Error('Invalid sync payload: bad type or too large');
  }
  // Gzip envelope: "GZ|v1|<base64>". Decompress before JSON.parse.
  // Plain v3 payloads still start with "{" and skip this branch.
  // v1.7.14 audit fix: routed through _gunzipToStringCapped so a
  // gzip-bomb (max ratio ~1032×; pathological zero-fill achieves it)
  // cannot decompress past MAX_SYNC_PAYLOAD_BYTES into memory before
  // the size check fires. The previous post-decompression `inner.length`
  // check ran *after* the full gunzipped output had been buffered, so
  // a 5 MB compressed bomb could OOM the tab before failing the cap.
  let inner = dataJson;
  if (dataJson.startsWith('GZ|v1|')) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Invalid sync payload: gzip envelope but no DecompressionStream');
    }
    const b64 = dataJson.slice(6);
    const bytes = _base64ToBytes(b64);
    inner = await _gunzipToStringCapped(bytes, MAX_SYNC_PAYLOAD_BYTES);
  }
  const parsed = JSON.parse(inner);
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
  // v4 (Phase 2 cutover): importedData omitted — per-row CRDT deltas
  // carry every field. The receiving merger sees `importedData: null`,
  // skips its blob-merge step, and relies entirely on the per-row pull
  // path (_mergeItemRowsIntoImported). v3 / v2 / v1 sources still merge
  // both ways for back-compat — Phase 2 is per-profile, per-device opt-in.
  if (parsed._v === 4) {
    return { importedData: null, profile: parsed.profile, aiSettings: parsed.aiSettings, chatData: parsed.chatData, displayPrefs: parsed.displayPrefs };
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

// ═══════════════════════════════════════════════
// PER-ARRAY DELTA SYNC — Phase 1 of CRDT-delta refactor
// ═══════════════════════════════════════════════
//
// See memory/project_evolu_delta_refactor_plan.md for full design + risk
// register. Short version: every pushProfile writes the entire ~200 KB
// importedData blob into one CRDT message. Evolu's per-owner relay quota
// fills in ~280 pushes (~few weeks of normal use), creating a recurring
// "phone says committed, desktop sees stale" wedge. The cure is to use
// Evolu the way it expects — many small rows mutated independently —
// so each push is a few KB of CRDT delta instead of half a megabyte of
// full-state snapshot.
//
// Phase 1 (v1.7.0–v1.7.6) is the additive datapath: per-row CRDT messages
// run alongside the existing fat-blob push so devices on older versions
// stay in sync. Pull-side: blob merge establishes the baseline first,
// then per-row state overlays on top — per-row wins on disagreement
// because each row carries its own LWW timestamp and reflects the
// up-to-the-moment state, while the blob may be a stale snapshot from
// before another device synced.
//
// Phase 2 (v1.7.10) introduces a per-profile cutover flag — when on,
// buildSyncPayload omits importedData entirely and per-row deltas
// become the only carrier. v1.7.9's getDeltaCutoverReadiness gates
// the flag so it can't be enabled while any surface still has local
// data without a per-row push (which would silently lose it).

// Arrays subject to delta sync. Highest-velocity first — these drive the
// fat-blob size that fills the quota. Adding to this list does NOT
// require schema migration since the itemRow table is generic.
// Dotted paths (e.g. `lightEnvironment.rooms`) are honored — getAt/setAt
// from data-merge.js walk them. The Phase 2 cutover (which drops the blob
// path entirely) requires nested-array surfaces ride the per-row planner;
// otherwise wholesale-LWW silently regresses cross-device room/screen
// edits to last-write-wins clobber.
const DELTA_ARRAYS = [
  'sunSessions',         // 1–10/day, ~500 B each
  'lightDevices',        // rare add but per-device session logs are frequent
  'deviceSessions',
  'lightAudits',
  'lightMeasurements',
  'lightEnvironment.rooms',   // nested array — needs per-row CRDT, not whole-object LWW
  'lightEnvironment.screens', // same
  'entries',             // 1–4/month at lab cadence, ~2 KB each
  'notes',               // ad-hoc; user-driven cadence
  'supplements',         // editorial churn during routine tweaking
  'healthGoals',
  'changeHistory',       // composite-keyed (field|date), capped at 200, append+update only
  'chatSummaries',       // per-thread AI-generated summaries, keyed by threadId; 1–50 entries/profile
];

// Per-array overrides for arrays that don't fit the default
// `it.id` / tombstone-on-removal contract. Two knobs:
//   itemIdFn(item) — derive a stable allowlist-safe itemId for items
//     without a `.id` field (e.g. composite keys). Returning a string
//     that fails the allowlist regex causes the item to be skipped
//     defensively (same as malformed `.id` for default arrays).
//   noTombstones: true — don't emit tombstones when an item disappears
//     from the local array. Use for arrays where local eviction is
//     expected (capped lists like changeHistory) and a tombstone would
//     destroy the same item on a peer device whose window happens to
//     still include it. Cap is enforced consumer-side via data-merge.js,
//     so the relay accumulating extra rows is fine — they're harmless
//     until someone genuinely deletes the entry.
const DELTA_ARRAY_CONFIG = {
  // changeHistory entries are { field, date, snapshot, ... } with no `id`.
  // Synthesize a stable itemId from the same composite key data-merge.js
  // uses (`field|date`), but encoded in the allowlist alphabet — `.field`
  // is already category.markerKey shape, `Date.parse(date)` is numeric.
  // Sanitize defensively so a future schema add (e.g. unicode field names)
  // doesn't bypass the regex; replacement keeps uniqueness because `field`
  // and `date` are independent dimensions.
  changeHistory: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object' || !it.field || !it.date) return null;
      const ts = Date.parse(it.date);
      if (!Number.isFinite(ts)) return null;
      return `${it.field}.${ts}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    },
    noTombstones: true,
  },
  // lightMeasurements: every deletion path (_supersedePriorMeasurement
  // on save, _collapseToLatestPerRoomTool one-time migration,
  // deleteMeasurement on user delete) explicitly writes to _deleted via
  // recordTombstone. Under Phase 1 (v3 blob) those tombstones ride the
  // fat blob. Under Phase 2 (v4, blob omitted) the planner's automatic
  // per-row tombstone emission is the ONLY carrier — so we MUST allow
  // it (no `noTombstones: true`). The storm guard upstream still blocks
  // a >50% drop from N>=20 rows, so a one-time migration that collapses
  // historical data won't broadcast accidental peer-wipes.
  // Lab entries — `{date, markers, ...}` with no `.id`. The import path
  // already enforces date-uniqueness (import-dedup filter on `date`), so
  // `date` is the natural composite-free key. `YYYY-MM-DD` matches the
  // allowlist regex directly. Without this, every entry produced by
  // PDF-import / JSON-import / manual entry was silently filtered out
  // of the per-row planner because the default itemIdFn requires
  // `it.id` as a string.
  entries: {
    itemIdFn: (it) => (it && typeof it.date === 'string' && _isAllowlistSafeId(it.date)) ? it.date : null,
  },
  // Supplements — `{name, dosage, type, startDate, endDate}` with no `.id`.
  // Use content hash over (name + startDate + type) so the same supplement
  // on the same start date with the same type lands on the same itemId
  // across devices. Different devices migrating identical pre-existing data
  // independently derive the same id — critical for preventing cross-device
  // duplication. Editing dosage / endDate flips the hash → tombstone old +
  // insert new, which presents as "delete + insert" cross-device. Acceptable
  // for this surface's append-mostly cadence (1-2 edits/year per supplement).
  supplements: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object') return null;
      const sig = `${it.name || ''}|${it.startDate || ''}|${it.type || ''}`;
      return sig === '||' ? null : `s_${_djb2(sig)}`;
    },
  },
  // Health goals — `{text, severity}` with no `.id`. Hash the user-typed
  // text — different goals have different texts; identical texts dedupe
  // by design (a user adding the same goal twice would expect one row).
  // Severity changes hash, but severity is rarely edited post-creation.
  healthGoals: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object' || !it.text) return null;
      return `g_${_djb2(it.text)}`;
    },
  },
  // Notes — `{date, text}` with no `.id` (saveNote in js/notes.js). Without
  // this override the default itemIdFn requires `it.id`, returns null for
  // every note, and the planner emits zero rows. That's both an empty
  // delta AND a permanent Phase 2 cutover blocker (getDeltaCutoverReadiness
  // sees rowCount=0 vs localCount>0 and refuses to flip). Hash (date,text)
  // — same content-hash pattern as supplements/healthGoals. Note edits
  // tombstone the old hash + insert a new one (acceptable for the rare
  // edit cadence on this surface; Greptile re-review #175).
  notes: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object') return null;
      const sig = `${it.date || ''}|${it.text || ''}`;
      return sig === '|' ? null : `n_${_djb2(sig)}`;
    },
  },
  // chatSummaries — `{id, threadId, ...}` where `.id` is `s_<base36-timestamp>`
  // (chat.js:778). Default itemIdFn would key by `.id`, which is timestamp-
  // unique per device — so two devices summarising the same thread
  // independently each create a row with a different itemId, and
  // unionById in mergeImportedData keeps both as distinct objects (a
  // duplicate that the threadId-based local replacement logic in
  // chat.js:813 silently masks but never cleans up). Override to derive
  // the itemId from threadId so concurrent same-thread summaries collapse
  // to one row cross-device (LWW per the relay; whichever device's
  // summary lands last wins). Greptile re-review #175 caught this.
  chatSummaries: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object' || !it.threadId) return null;
      return `cs_${_djb2(String(it.threadId))}`;
    },
  },
};

// Importance-scoped maps subject to delta sync. Parallel to DELTA_ARRAYS
// but for keyed-object shapes (`{ [key]: value }`) — markerNotes today,
// customMarkers a likely follow-up. The itemRow table is shape-agnostic
// (arrayName + itemId + payload), so the only difference vs the array
// path is how items are enumerated and reconstructed. Keys that fail
// the allowlist regex are silently skipped at the planner — same
// defence-in-depth posture as malformed `.id` fields on the array path.
const DELTA_MAPS = [
  'markerNotes',         // user-attached freeform notes per marker, ~bytes per entry, frequent edits
  'markerValueNotes',    // user-attached freeform notes per (marker, date) — keyed `category.markerKey:date`
  'customMarkers',       // user-defined markers (PDF imports + manual creation), keyed by `category.markerKey`
  'manualValues',        // membership flags for manually-typed entry values, keyed `category.markerKey:date` (synth-id)
  'refOverrides',        // user-edited reference ranges per marker, keyed by `category.markerKey`
  'categoryLabels',      // user-renamed category labels, keyed by category key
  'categoryIcons',       // user-picked category icons, keyed by category key
  'markerLabels',        // user-renamed marker labels, keyed by `category.markerKey`
  'wearablePrimaryOverride', // per-metric primary-source override, keyed by canonical metricId
  // Dotted path: genetics.snps was DELTA_SCALARS via the parent `genetics`
  // object until 2026-05. Whole-blob LWW meant two devices each importing
  // a fresh raw DNA file in overlapping windows would lose one side's
  // additions — Brave wrote 43 SNPs, Chrome (open all day, kept saving)
  // overwrote the relay row with its stale 40-SNP blob. Per-key CRDT
  // here means each rsID is independently last-write-wins, so cross-
  // device adds compose instead of compete. The rest of `genetics`
  // (source, importDate, coverage, mtdna) stays in DELTA_SCALARS.
  'genetics.snps',
  // Light Today daily verdict — singleton-per-day map keyed by ISO date.
  // Each device generates a verdict from its own state; the LAST one wins
  // per date (acceptable: verdicts are deterministic-ish and the user
  // owns both devices). Without this entry, Phase 2 cutover would silently
  // drop every cached daily verdict on cross-device sync.
  'lightDailyVerdicts',
];

// Singleton-shape importedData fields (scalars — null/object/string defaults
// that flip wholesale on edit). Until v1.7.6 these were the entire reason
// menstrualCycle / context cards / DNA / etc still rode the fat blob path:
// they're not enumerable as items, so no array/map planner could touch
// them. Phase 2 cutover would have silently stopped syncing all of these.
//
// Each scalar gets ONE itemRow per profile, itemId = the scalar's field
// name. Payload is `{v: scalarValue}` so the value can be any JSON
// (object, string, number, null after delete). On edit, the row updates;
// on initial null→object transition, the row inserts; on object→null the
// row tombstones (semantically: "this scalar has been cleared").
const DELTA_SCALARS = [
  // Context cards
  'diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian',
  'stress', 'loveLife', 'environment',
  // Free-form text on the dashboard
  'interpretiveLens', 'contextNotes',
  // Domain modules
  'menstrualCycle', 'emfAssessment', 'genetics', 'biometrics',
  // `lightEnvironment` itself is NOT a scalar — its rooms/screens arrays
  // ride the per-row CRDT path via DELTA_ARRAYS' nested-path entries
  // above. Earlier draft included it here, which would have caused
  // Phase 2 cutover to ship the whole object as one row and silently
  // regress cross-device room/screen edits to wholesale-LWW.
  // BUT: `lightEnvironment.burdenAI` IS a singleton AI verdict (one per
  // user, not per-room) and needs its own scalar slot. Dotted-path
  // entries are honored by _planScalarDelta + _mergeItemRowsIntoImported
  // via getAt/setAt — same pattern as DELTA_MAPS' `genetics.snps`.
  // Without this entry, Phase 2 cutover (v: 4) silently wipes burdenAI
  // on every cross-device pull (the per-row overlay rebuilds the
  // lightEnvironment object from rooms+screens only).
  'lightEnvironment.burdenAI',
  'sunCorrelations', 'lifelightProfile', 'sunDefaults',
  // Channel-mix AI verdict — the "Your light, by what it does" synthesis
  // that reasons across 6 biological light channels. Singleton object;
  // last-write-wins across devices is fine for the same reason as
  // lightDailyVerdicts. Earlier: shipped only via the legacy fat-blob
  // path, so Phase 2 cutover (v: 4) would have silently dropped it.
  'channelMixAI',
  // Wearable L2 derived state — wearableConnections is intentionally NOT
  // listed (refresh tokens stay per-device; see stripWearableCredentials).
  'wearableSummary', 'wearableCardOrder',
];

// Per-map overrides parallel to DELTA_ARRAY_CONFIG. `keyIdFn(rawKey)`
// derives the row's itemId from the map key when the raw key isn't
// allowlist-safe; the original raw key still travels in the payload's
// `k` field, so the pull side rebuilds the map under its real key.
const DELTA_MAP_CONFIG = {
  // manualValues keys are `category.markerKey:date` — `:` fails the
  // allowlist regex. Use a doubling-escape for unambiguous synthesis:
  // each original `_` becomes `__`, then each `:` becomes a single `_`.
  // Distinct rawKeys produce distinct synth itemIds (the v1.7.5 naive
  // `:` → `_` substitution could collide for marker keys containing
  // `_`; v1.7.13 audit fix). Pull side restores the original `:`-bearing
  // key from payload.k regardless.
  manualValues: {
    keyIdFn: (rawKey) => {
      if (typeof rawKey !== 'string' || rawKey.length === 0) return null;
      const safe = rawKey.replace(/_/g, '__').replace(/:/g, '_');
      return /^[a-zA-Z0-9_.-]+$/.test(safe) ? safe : null;
    },
  },
  // Same `category.markerKey:date` shape as manualValues — share the escape.
  markerValueNotes: {
    keyIdFn: (rawKey) => {
      if (typeof rawKey !== 'string' || rawKey.length === 0) return null;
      const safe = rawKey.replace(/_/g, '__').replace(/:/g, '_');
      return /^[a-zA-Z0-9_.-]+$/.test(safe) ? safe : null;
    },
  },
};

// Returns the localStorage key holding the last-pushed snapshot
// (`{itemId: contentHash}`) for one (profileId, arrayName). Snapshot is
// updated only after a successful onComplete so a wedged push doesn't
// strand future deltas behind a never-cleared diff.
function _deltaSnapshotKey(profileId, arrayName) {
  return `labcharts-${profileId}-delta-${arrayName}`;
}

function _readDeltaSnapshot(profileId, arrayName) {
  try {
    const raw = localStorage.getItem(_deltaSnapshotKey(profileId, arrayName));
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch { return {}; }
}

// v1.7.16 audit fix: snapshot write is now plannedAt-gated. The
// _syncing 60s in-flight guard plus delayed onComplete writing meant
// push A planned at T=0 could have its onComplete fire at T=70s
// AFTER push B started at T=65s and already wrote its snapshot —
// A's late onComplete would clobber B's fresher view, and the next
// push would diff against A's stale state, silently skipping items
// B had already added. Stamping each plan with its planning time
// and refusing to overwrite a snapshot whose plannedAt is newer
// than this plan's closes that race.
function _writeDeltaSnapshot(profileId, arrayName, snap, plannedAt) {
  try {
    const metaKey = `${_deltaSnapshotKey(profileId, arrayName)}-meta`;
    if (Number.isFinite(plannedAt)) {
      const prevMetaRaw = localStorage.getItem(metaKey);
      if (prevMetaRaw) {
        try {
          const m = JSON.parse(prevMetaRaw);
          if (Number.isFinite(m?.plannedAt) && m.plannedAt >= plannedAt) {
            // `>=` (not `>`) so same-millisecond plannedAt collisions don't
            // let a slow-to-onComplete A clobber a faster-to-finish B that
            // already shipped fresher items. Date.now() granularity is 1ms.
            return false;
          }
        } catch {}
      }
      localStorage.setItem(metaKey, JSON.stringify({ plannedAt }));
    }
    localStorage.setItem(_deltaSnapshotKey(profileId, arrayName), JSON.stringify(snap));
    return true;
  } catch { return false; }
}

// Stable hash for content-equality detection. djb2 — fine for our
// purpose (ferret out unchanged items so we don't re-push). Scoped
// to this module; not exported.
function _djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Defence-in-depth against prototype pollution via relay-controlled itemId
// or map key. The allowlist regex `[a-zA-Z0-9_.-]+` accepts `__proto__`,
// `constructor`, and `prototype` — all three would set Object.prototype
// when used as a map write key (`imported[arrayName]['__proto__'] = v`).
// Reject these explicitly at every itemId-from-payload path: planner
// allowlist on push, _mergeItemRowsIntoImported on pull, getDeltaCutoverReadiness
// when iterating row.itemId. Net cost: O(1) per check.
const _PROTO_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function _isAllowlistSafeId(id) {
  return typeof id === 'string'
    && id.length > 0
    && /^[a-zA-Z0-9_.-]+$/.test(id)
    && !_PROTO_POLLUTION_KEYS.has(id);
}

// Push the diff between the current array state and the last-pushed
// snapshot. Returns the candidate-new snapshot (caller commits it from
// onComplete after the blob push lands successfully).
async function _planArrayDelta(profileId, arrayName, items) {
  const plannedAt = Date.now();
  const cfg = DELTA_ARRAY_CONFIG[arrayName] || {};
  const itemIdFn = typeof cfg.itemIdFn === 'function' ? cfg.itemIdFn : (it => (it && typeof it.id === 'string' ? it.id : null));
  const prev = _readDeltaSnapshot(profileId, arrayName);
  const next = {};
  const ops = []; // collected pending evolu mutations

  // Index existing itemRow rows for this (profile, array) so we can
  // reuse their `id` on update instead of creating phantom duplicates.
  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  const matching = allItemRows.filter(r => r.profileId === profileId && r.arrayName === arrayName);
  const rowByItemId = new Map(matching.map(r => [r.itemId, r]));

  // Build [item, itemId] tuples, dropping anything whose derived itemId
  // fails _isAllowlistSafeId (covers regex + proto-pollution rejection).
  const tuples = Array.isArray(items)
    ? items.map(it => [it, itemIdFn(it)]).filter(([, id]) => _isAllowlistSafeId(id))
    : [];
  for (const [item, itemId] of tuples) {
    const json = JSON.stringify(item);
    const hash = _djb2(json);
    next[itemId] = hash;
    if (prev[itemId] === hash) continue; // unchanged — skip push

    // Compress payload the same way buildSyncPayload does — itemRow.payload
    // is a NonEmptyString, gzip+base64 envelope keeps small items tiny.
    let payload = json;
    if (typeof CompressionStream !== 'undefined' && json.length > 256) {
      try { payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`; } catch {}
    }
    const existing = rowByItemId.get(itemId);
    const syncedAt = new Date().toISOString();
    // v1.7.11 audit fix: when the existing row is tombstoned (user deleted
    // the item, then re-added it), evolu.update without isDeleted leaves
    // the LWW register stuck at 1 — peers keep seeing it as a delete.
    // Explicitly set isDeleted to null so the resurrect wins LWW.
    const resurrect = existing?.isDeleted ? { isDeleted: null } : {};
    if (existing) {
      ops.push({ kind: 'update', args: { id: existing.id, profileId, arrayName, itemId, payload, syncedAt, ...resurrect } });
    } else {
      ops.push({ kind: 'insert', args: { profileId, arrayName, itemId, payload, syncedAt } });
    }
  }

  // Tombstones: items that were in the prev snapshot but no longer in
  // the array. Skip if the row is already tombstoned, or if no row
  // exists yet (could just be a snapshot/local-storage drift on a
  // fresh device; safer to no-op than to push a phantom delete).
  // Skipped entirely for arrays flagged noTombstones — capped lists where
  // local eviction is expected and a tombstone would destroy data on a
  // peer whose window happens to still include the item.
  //
  // Tombstone-storm guard (mirrors _planKeyedMapDelta): if the array went
  // from N>=20 items to <50% of that in a single push, refuse to emit
  // tombstones. A drop that large is almost always a transient state
  // issue (mid-import, mid-pull-merge, in-progress reset) rather than
  // the user genuinely deleting half their data. Letting it through
  // would propagate a wipe to peers via the relay. Concrete cases this
  // protects: sunSessions / deviceSessions / lightAudits / lightMeasurements
  // / entries — all user-owned, append-mostly, and rarely halve in normal
  // use. Logged at warn so debug mode surfaces when it fires; the user
  // can still genuinely empty an array (do it in two steps or via
  // explicit clear-data flows that bypass the planner).
  if (!cfg.noTombstones) {
    const prevCount = Object.keys(prev).length;
    const nextCount = Object.keys(next).length;
    const wouldEmitMassiveTombstone = prevCount >= 20 && nextCount < prevCount * 0.5;
    if (wouldEmitMassiveTombstone) {
      try {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[sync] _planArrayDelta refused tombstone storm for ${arrayName}: prev=${prevCount} next=${nextCount}. Likely transient state during pull-merge — push deferred.`);
        }
      } catch {}
    } else {
      for (const prevId of Object.keys(prev)) {
        if (Object.prototype.hasOwnProperty.call(next, prevId)) continue;
        const row = rowByItemId.get(prevId);
        if (!row || row.isDeleted) continue;
        ops.push({ kind: 'tombstone', args: { id: row.id, isDeleted: 1, syncedAt: new Date().toISOString() } });
      }
    }
  }

  return { ops, next, plannedAt };
}

// Keyed-map planner. Same shape as _planArrayDelta but iterates
// Object.entries() and uses the map key (sanitized) as itemId. Payload
// is `{k, v}` so the pull side can verify the key column matches the
// payload's claimed key — same defence-in-depth as itemIdFn(item) ===
// row.itemId on the array path. Tombstones DO emit (unlike changeHistory):
// markerNote keys are user-owned, `delete state.importedData.markerNotes[k]`
// is real intent that must propagate.
async function _planKeyedMapDelta(profileId, mapName, mapObj) {
  const plannedAt = Date.now();
  const cfg = DELTA_MAP_CONFIG[mapName] || {};
  // keyIdFn: derive itemId from raw key. Default = identity-with-allowlist
  // (rejects unsafe keys including __proto__); custom fns may sanitize
  // colons etc but every result still goes through _isAllowlistSafeId
  // below for proto-pollution defence regardless of what the cfg returns.
  const keyIdFn = typeof cfg.keyIdFn === 'function'
    ? cfg.keyIdFn
    : (k => (_isAllowlistSafeId(k) ? k : null));
  const prev = _readDeltaSnapshot(profileId, mapName);
  const next = {};
  const ops = [];

  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  const matching = allItemRows.filter(r => r.profileId === profileId && r.arrayName === mapName);
  const rowByItemId = new Map(matching.map(r => [r.itemId, r]));

  const obj = (mapObj && typeof mapObj === 'object' && !Array.isArray(mapObj)) ? mapObj : {};
  for (const [rawKey, value] of Object.entries(obj)) {
    const itemId = keyIdFn(rawKey);
    // Defence-in-depth: even if cfg.keyIdFn returns a string that passes
    // its own check, re-validate via _isAllowlistSafeId so a buggy custom
    // fn can't smuggle __proto__/constructor through.
    if (!_isAllowlistSafeId(itemId)) continue;
    if (value === null || value === undefined) continue;
    // payload.k carries the ORIGINAL key — pull side rebuilds the map
    // under that key, not the synth itemId, so consumers reading the
    // raw `category.markerKey:date` form keep working.
    const payloadObj = { k: rawKey, v: value };
    const json = JSON.stringify(payloadObj);
    const hash = _djb2(json);
    next[itemId] = hash;
    if (prev[itemId] === hash) continue;

    let payload = json;
    if (typeof CompressionStream !== 'undefined' && json.length > 256) {
      try { payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`; } catch {}
    }
    const existing = rowByItemId.get(itemId);
    const syncedAt = new Date().toISOString();
    // v1.7.11 audit fix: resurrect a tombstoned row by explicitly clearing
    // isDeleted (otherwise the LWW register stays 1 and peers keep seeing
    // a delete). Same fix as the array planner.
    const resurrect = existing?.isDeleted ? { isDeleted: null } : {};
    if (existing) {
      ops.push({ kind: 'update', args: { id: existing.id, profileId, arrayName: mapName, itemId, payload, syncedAt, ...resurrect } });
    } else {
      ops.push({ kind: 'insert', args: { profileId, arrayName: mapName, itemId, payload, syncedAt } });
    }
  }

  // Tombstones: keys present in prev snapshot but not in current map.
  // Same conservative guard as the array path — only emit if a row
  // actually exists for that itemId, and isn't already tombstoned.
  //
  // Tombstone-storm guard: if the map went from N>=20 keys to <50% of
  // that, refuse to emit tombstones for this push. A drop that large
  // is almost always a transient state issue (mid-import, mid-pull-
  // merge, in-progress reset) rather than the user genuinely deleting
  // half their map. Letting it through would propagate a wipe to
  // peers via the relay. Concrete instance this guards against:
  // genetics.snps had 43 keys, a pull-merge race momentarily set it
  // to 0, the next save's planner emitted 43 tombstones, every other
  // device pulled the wipe and lost their genetics.snps.
  // The user can still genuinely empty a map — they just have to do
  // it in two steps (or via explicit clear-data flows that bypass the
  // planner). Logged at info so debug mode shows when it fires.
  const prevCount = Object.keys(prev).length;
  const nextCount = Object.keys(next).length;
  const wouldEmitMassiveTombstone = prevCount >= 20 && nextCount < prevCount * 0.5;
  if (wouldEmitMassiveTombstone) {
    try {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[sync] _planKeyedMapDelta refused tombstone storm for ${mapName}: prev=${prevCount} next=${nextCount}. Likely transient state during pull-merge — push deferred.`);
      }
    } catch {}
  } else {
    for (const prevId of Object.keys(prev)) {
      if (Object.prototype.hasOwnProperty.call(next, prevId)) continue;
      const row = rowByItemId.get(prevId);
      if (!row || row.isDeleted) continue;
      ops.push({ kind: 'tombstone', args: { id: row.id, isDeleted: 1, syncedAt: new Date().toISOString() } });
    }
  }

  return { ops, next, plannedAt };
}

// Scalar planner. Singleton-shape fields (menstrualCycle, context cards,
// DNA, etc) — one itemRow per scalar, itemId = the scalar's field name.
// Payload is `{v: value}` for symmetry with the map shape (and so the
// pull side can defensively check `parsed` is an object before reading).
// Tombstones emit when the scalar transitions from non-null → null/undefined
// (real user intent: "I cleared this card"); they DON'T emit on initial
// load when the scalar has always been null (no prev snapshot row exists).
async function _planScalarDelta(profileId, scalarName, scalarValue) {
  const plannedAt = Date.now();
  const prev = _readDeltaSnapshot(profileId, scalarName);
  const next = {};
  const ops = [];

  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  const matching = allItemRows.filter(r => r.profileId === profileId && r.arrayName === scalarName);
  // Only one row per scalar; if multiples slipped in (e.g. a v1.7.5-era
  // race), use the most-recently-synced as canonical so the next update
  // overwrites that one and the others naturally fade.
  const canonical = matching.length === 0
    ? null
    : matching.slice().sort((a, b) => String(b.syncedAt || '').localeCompare(String(a.syncedAt || '')))[0];
  // Empty / null / undefined treated as absence — same posture as the
  // existing blob path, where buildSyncPayload sends null and the merger
  // treats it as "no opinion this push".
  const hasValue = scalarValue !== null && scalarValue !== undefined
    && !(typeof scalarValue === 'string' && scalarValue.length === 0);

  if (hasValue) {
    const payloadObj = { v: scalarValue };
    const json = JSON.stringify(payloadObj);
    const hash = _djb2(json);
    next[scalarName] = hash;
    if (prev[scalarName] !== hash) {
      let payload = json;
      if (typeof CompressionStream !== 'undefined' && json.length > 256) {
        try { payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`; } catch {}
      }
      const syncedAt = new Date().toISOString();
      // v1.7.11 audit fix: resurrect after delete (object→null→object).
      // canonical may be tombstoned if the user previously cleared the
      // scalar; reusing its id without isDeleted: null leaves the LWW
      // register stuck at 1 and peers keep treating the scalar as null.
      const resurrect = canonical?.isDeleted ? { isDeleted: null } : {};
      if (canonical) {
        ops.push({ kind: 'update', args: { id: canonical.id, profileId, arrayName: scalarName, itemId: scalarName, payload, syncedAt, ...resurrect } });
      } else {
        ops.push({ kind: 'insert', args: { profileId, arrayName: scalarName, itemId: scalarName, payload, syncedAt } });
      }
    }
  } else if (prev[scalarName] && canonical && !canonical.isDeleted) {
    // non-null → null transition. Conservative tombstone — only emit if
    // we previously pushed a value (prev hash exists) AND a row actually
    // exists for it. Skips the boot-with-default-null case.
    ops.push({ kind: 'tombstone', args: { id: canonical.id, isDeleted: 1, syncedAt: new Date().toISOString() } });
  }
  return { ops, next, plannedAt };
}

// Apply the planned ops via Evolu. Called from pushProfile's onComplete
// after the fat-blob push lands.
//
// v1.7.12 audit fix: returns true only when every op succeeded. The
// caller (`onComplete`) skips the snapshot advance when this returns
// false — a partial failure used to silently advance the snapshot,
// poisoning future pushes (next push thought the failed items were
// already shipped to the relay and skipped them).
function _applyArrayDelta(arrayName, plan) {
  let allOk = true;
  for (const op of plan.ops) {
    try {
      if (op.kind === 'insert') evolu.insert("itemRow", op.args);
      else if (op.kind === 'update') evolu.update("itemRow", op.args);
      else if (op.kind === 'tombstone') evolu.update("itemRow", op.args);
    } catch (e) {
      allOk = false;
      console.warn(`[sync] delta op ${op.kind} ${arrayName} failed:`, e?.message || e);
    }
  }
  return allOk;
}

// Pull-side row-count snapshot, refreshed on every _mergeItemRowsIntoImported
// run. Used by getDeltaTelemetry / Sync diagnose so a user comparing two
// devices can see whether the relay actually replicated per-row state evenly
// (e.g. desktop sees 14 sunSession rows, phone sees 12 → relay replication
// lag, not a local merge bug). In-memory only — re-derives on every merge,
// no localStorage churn.
const _pullDeltaSnapshot = { profileId: null, perArray: {}, mergedAt: 0 };

// Pull-side: walk every itemRow for this profileId, group by arrayName,
// apply tombstones (drop matching items from imported[arrayName]) and
// upsert live payloads (replace by item.id, or push if unseen). Per-row
// state is authoritative — a tombstone here removes an item even if the
// blob still has it, and a live payload here overrides the blob's copy.
async function _mergeItemRowsIntoImported(profileId, imported) {
  if (!evolu || !itemRowQuery) return imported;
  const rows = evolu.getQueryRows(itemRowQuery) || [];
  const byArray = new Map();
  for (const row of rows) {
    if (!row || row.profileId !== profileId) continue;
    if (!byArray.has(row.arrayName)) byArray.set(row.arrayName, []);
    byArray.get(row.arrayName).push(row);
  }
  // Reset the pull-side telemetry snapshot for this merge — only keep
  // counts for arrays still present in the relay's row set so a profile
  // switch doesn't carry stale counts forward.
  _pullDeltaSnapshot.profileId = profileId;
  _pullDeltaSnapshot.perArray = {};
  _pullDeltaSnapshot.mergedAt = Date.now();
  const _DELTA_MAPS_SET = new Set(DELTA_MAPS);
  const _DELTA_SCALARS_SET = new Set(DELTA_SCALARS);
  for (const [arrayName, arrRows] of byArray) {
    // Scalar shape (menstrualCycle, context cards, DNA, etc) — one row
    // per scalar field. Pick the most recent live row, set
    // imported[arrayName] = parsed.v. A tombstone clears the field
    // (sets to null) — same posture the blob path had when the user
    // explicitly cleared a card.
    if (_DELTA_SCALARS_SET.has(arrayName)) {
      let live = 0, tombs = 0;
      let chosen = null;
      let chosenAt = '';
      let tombstoned = false;
      let tombstonedAt = '';
      for (const row of arrRows) {
        if (row.itemId !== arrayName) continue; // defence: ignore foreign rows in this slot
        if (row.isDeleted) {
          if (String(row.syncedAt || '') > tombstonedAt) {
            tombstoned = true;
            tombstonedAt = String(row.syncedAt || '');
          }
          tombs++;
          continue;
        }
        try {
          let json = row.payload;
          if (typeof json === 'string' && json.startsWith('GZ|v1|')) {
            if (typeof DecompressionStream === 'undefined') continue;
            json = await _gunzipToStringCapped(_base64ToBytes(json.slice(6)));
          }
          const parsed = JSON.parse(json);
          if (!parsed || typeof parsed !== 'object') continue;
          // Prefer the most-recently-synced live row when multiples exist.
          const ts = String(row.syncedAt || '');
          if (ts > chosenAt) { chosen = parsed; chosenAt = ts; }
          live++;
        } catch {}
      }
      // Latest write wins between live + tombstone — tombstone only
      // overwrites when its syncedAt is at-or-newer than the chosen
      // live row (otherwise an old delete would obliterate a fresh edit).
      const isNestedScalar = arrayName.includes('.');
      if (tombstoned && tombstonedAt >= chosenAt) {
        // Symmetric snps preservation — the live branch below restores
        // imported.genetics.snps when the map merge ran first; the
        // tombstone branch needs the same guard or `genetics.snps` rows
        // get silently wiped whenever the per-row map merger happens to
        // run before this scalar branch (byArray iteration order is
        // determined by relay row ordering, so it's racy). Concrete
        // failure mode: device imports DNA, deletes it, re-imports —
        // the in-flight delete tombstone has a later syncedAt than the
        // re-import scalar update on a peer, the peer's map branch
        // populates 41 snps under imported.genetics, then this scalar
        // branch wipes imported.genetics = null. End state: peer shows
        // null genetics despite 41 live snps rows on the relay. This
        // guard keeps the per-row layer's snps independent.
        if (arrayName === 'genetics'
            && imported.genetics && typeof imported.genetics === 'object'
            && imported.genetics.snps && typeof imported.genetics.snps === 'object'
            && Object.keys(imported.genetics.snps).length > 0) {
          imported.genetics = { snps: imported.genetics.snps };
        } else if (isNestedScalar) {
          // Dotted-path scalar tombstone clears just the leaf, not the
          // parent — sibling fields (e.g. lightEnvironment.rooms) keep
          // riding their own DELTA_ARRAYS path independently.
          setAt(imported, arrayName, null);
        } else {
          imported[arrayName] = null;
        }
      } else if (chosen) {
        // Preserve nested fields owned by a DELTA_MAPS dotted path —
        // the scalar payload is metadata-only by contract, so a remote
        // scalar must not blow away the local map. The dotted-path
        // map merger that runs after this loop is authoritative for
        // those fields. Concrete instance: `genetics.snps` is a
        // DELTA_MAPS entry; the `genetics` scalar row carries source/
        // importDate/coverage/mtdna only. Restoring snps here keeps
        // the per-row layer's prior state intact for the moment until
        // the map branch below runs and re-applies the relay's rows.
        if (arrayName === 'genetics'
            && imported.genetics && typeof imported.genetics === 'object'
            && imported.genetics.snps && typeof imported.genetics.snps === 'object') {
          const localSnps = imported.genetics.snps;
          imported.genetics = chosen.v;
          if (imported.genetics && typeof imported.genetics === 'object') {
            imported.genetics.snps = localSnps;
          }
        } else if (isNestedScalar) {
          // Dotted-path scalar write — only the leaf, not the parent.
          setAt(imported, arrayName, chosen.v);
        } else {
          imported[arrayName] = chosen.v;
        }
      }
      _pullDeltaSnapshot.perArray[arrayName] = { live, tombstones: tombs };
      continue;
    }
    // Keyed-map shape (markerNotes etc) reconstructs an object, not an
    // array. Same itemRow source, different output container — payload
    // carries `{k, v}` so we can verify the row's itemId column matches
    // what the payload claims (defence-in-depth against a relay swapping
    // payloads between rows).
    if (_DELTA_MAPS_SET.has(arrayName)) {
      // Dotted-path support — same getAt/setAt walk as the array path.
      // Required for entries like `genetics.snps` so per-key CRDT lands
      // in the nested object instead of clobbering it as a top-level
      // sibling. Defaults to flat for the common case.
      const isNestedMap = arrayName.includes('.');
      const readMap = () => isNestedMap ? getAt(imported, arrayName) : imported[arrayName];
      const writeMap = (v) => isNestedMap ? setAt(imported, arrayName, v) : (imported[arrayName] = v);
      let curMap = readMap();
      if (!curMap || typeof curMap !== 'object' || Array.isArray(curMap)) {
        // Object.create(null) (no Object.prototype chain) so a relay-
        // controlled key like '__proto__' that somehow slipped past the
        // _isAllowlistSafeId checks below would be a regular property
        // write, not a prototype-pollution sink. Defence-in-depth.
        curMap = Object.create(null);
        writeMap(curMap);
      }
      // Same keyIdFn as push so synth-id maps verify correctly. Default
      // (identity-with-allowlist) collapses to `parsed.k === row.itemId`
      // for the markerNotes / customMarkers case. Wrapped with
      // _isAllowlistSafeId so a misbehaving cfg.keyIdFn can't bypass
      // the proto-pollution rejection.
      const mapCfg = DELTA_MAP_CONFIG[arrayName] || {};
      const rawKeyIdFn = typeof mapCfg.keyIdFn === 'function'
        ? mapCfg.keyIdFn
        : (k => (_isAllowlistSafeId(k) ? k : null));
      const keyIdFn = (k) => { const id = rawKeyIdFn(k); return _isAllowlistSafeId(id) ? id : null; };
      // Build a tombstone-key set first so deletes can find the original
      // raw key in the current map even when the row only carries the
      // synth itemId (synth-id maps don't preserve the original key on
      // the row itself — it's only in the payload).
      const liveByRawKey = new Map(); // rawKey → { v, syncedAt }
      const tombItemIds = new Set();
      for (const row of arrRows) {
        if (row.isDeleted) { tombItemIds.add(row.itemId); continue; }
        try {
          let json = row.payload;
          if (typeof json === 'string' && json.startsWith('GZ|v1|')) {
            if (typeof DecompressionStream === 'undefined') continue;
            json = await _gunzipToStringCapped(_base64ToBytes(json.slice(6)));
          }
          const parsed = JSON.parse(json);
          if (!parsed || typeof parsed !== 'object' || typeof parsed.k !== 'string') continue;
          // Defence-in-depth: re-derive itemId from the payload's claimed
          // k and verify it matches the row column. Catches a relay
          // swapping payloads between rows even for synth-id maps.
          if (keyIdFn(parsed.k) !== row.itemId) continue;
          // Iteration-order tiebreak hardening (mirrors the array path):
          // when two devices race a same-key edit, prefer the row with the
          // newer relay-stamped syncedAt over whichever happened to come
          // last in the unordered SQLite scan.
          const sa = String(row.syncedAt || '');
          const cur = liveByRawKey.get(parsed.k);
          if (!cur || sa >= cur.syncedAt) {
            liveByRawKey.set(parsed.k, { v: parsed.v, syncedAt: sa });
          }
        } catch {}
      }
      // Apply tombstones: walk current map keys, drop any whose synth
      // itemId is in the tombstone set. Skips entries that just happened
      // to be re-inserted in this batch (liveByRawKey wins via overwrite).
      if (tombItemIds.size > 0) {
        for (const k of Object.keys(curMap)) {
          if (liveByRawKey.has(k)) continue;
          const synth = keyIdFn(k);
          if (synth && tombItemIds.has(synth)) delete curMap[k];
        }
      }
      // Apply live entries under their ORIGINAL key (preserves the `:`
      // for manualValues etc — consumers read the raw key, not the synth).
      // Defence-in-depth: even though the synth itemId path validates via
      // _isAllowlistSafeId, the raw `parsed.k` is what we WRITE to curMap.
      // For synth-id maps like manualValues, keyIdFn('__proto__') returns
      // '____proto____' (doubling-escape) which IS allowlist-safe, so a
      // hostile relay row could carry parsed.k='__proto__' through every
      // earlier check and reach this write. Reject at the assignment site
      // — the cost is one Set.has per live entry; the win is closing a
      // prototype-pollution sink on imported.manualValues.
      for (const [rawKey, entry] of liveByRawKey) {
        if (_PROTO_POLLUTION_KEYS.has(rawKey)) continue;
        curMap[rawKey] = entry.v;
      }
      _pullDeltaSnapshot.perArray[arrayName] = { live: liveByRawKey.size, tombstones: tombItemIds.size };
      continue;
    }
    // Read/write the target array — flat top-level for most surfaces,
    // dotted-path walk via getAt/setAt for nested ones (e.g.
    // `lightEnvironment.rooms`). Same code path either way so we don't
    // bifurcate the merger.
    const isNested = arrayName.includes('.');
    const readArr = () => isNested ? getAt(imported, arrayName) : imported[arrayName];
    const writeArr = (v) => isNested ? setAt(imported, arrayName, v) : (imported[arrayName] = v);
    let curArr = readArr();
    if (!Array.isArray(curArr)) { curArr = []; writeArr(curArr); }
    // Same itemId derivation push side used. For arrays without `.id`
    // (composite-keyed like changeHistory) this matches the synth-id
    // path so replace-or-insert finds the right slot instead of always
    // appending and silently doubling. Wrap the itemIdFn so any result
    // failing _isAllowlistSafeId becomes null (proto-pollution defence)
    // even if a future cfg.itemIdFn returned __proto__ for some reason.
    const cfg = DELTA_ARRAY_CONFIG[arrayName] || {};
    const rawItemIdFn = typeof cfg.itemIdFn === 'function' ? cfg.itemIdFn : (it => (it && typeof it.id === 'string' ? it.id : null));
    const itemIdFn = (it) => { const id = rawItemIdFn(it); return _isAllowlistSafeId(id) ? id : null; };
    // Seed the tombstone set with the local blob's `_deleted[path]` list
    // BEFORE walking relay rows. The blob and per-row datapaths run in
    // parallel under Phase 1 dual-write, and a peer that hadn't pulled
    // our delete yet may push the row back as live — without this seed,
    // a deleted-here-then-pushed-back-by-peer item resurrects locally
    // because the relay row carries isDeleted=0 and the per-row merge
    // re-inserts it. Trust local user intent: if the deletion is in the
    // blob, the item stays dropped on this device until our own
    // tombstone push lands and the peer applies it.
    const tombs = new Set();
    try {
      const localDel = imported && imported._deleted;
      const localList = localDel && Array.isArray(localDel[arrayName]) ? localDel[arrayName] : null;
      if (localList) for (const id of localList) if (typeof id === 'string') tombs.add(id);
    } catch {}
    const liveById = new Map(); // itemId → { item, ts, syncedAt }
    for (const row of arrRows) {
      if (row.isDeleted) { tombs.add(row.itemId); continue; }
      try {
        let json = row.payload;
        if (typeof json === 'string' && json.startsWith('GZ|v1|')) {
          if (typeof DecompressionStream === 'undefined') continue;
          json = await _gunzipToStringCapped(_base64ToBytes(json.slice(6)));
        }
        const item = JSON.parse(json);
        // Verify the payload's derived itemId matches the row column —
        // catches a compromised relay swapping payloads between rows.
        if (item && typeof item === 'object' && itemIdFn(item) === row.itemId) {
          // When a cross-device race produces multiple itemRow rows for the
          // same itemId (each device wrote its own row before seeing the
          // other), iteration-order winners can silently undo a stop / edit
          // — e.g. a freshly-stopped sun session loses to a still-active
          // copy from another device. Pick the higher embedded timestamp
          // first (mirrors data-merge.js unionById), syncedAt as secondary
          // tiebreak so two rows with identical embedded ts don't ping-pong.
          const ts = pickTimestamp(item);
          const sa = String(row.syncedAt || '');
          const cur = liveById.get(row.itemId);
          if (!cur || ts > cur.ts || (ts === cur.ts && sa > cur.syncedAt)) {
            liveById.set(row.itemId, { item, ts, syncedAt: sa });
          }
        }
      } catch {}
    }
    // Apply tombstones (drop) + live (replace or insert). Both sides key
    // on itemIdFn so changeHistory finds existing entries by their
    // synthesized field|date id rather than appending duplicates.
    let nextArr = curArr.filter(it => !tombs.has(itemIdFn(it)));
    // Dedup `nextArr` by itemIdFn BEFORE the liveById overlay. The blob
    // LWW merge can leave two items collapsing to the same synth itemId
    // (e.g. two chatSummaries on the same threadId carried from a peer).
    // The earlier code's `seen` Map only retained the LAST position, so
    // liveById would overwrite that slot but the EARLIER duplicate stayed
    // in nextArr untouched. End state: one stale duplicate per cross-
    // device race that the next push then re-emits as state truth. Keep
    // the FIRST occurrence and drop the rest — the live overlay below
    // will replace it with the relay-authoritative version anyway.
    const seen = new Map();
    nextArr = nextArr.filter((it, i) => {
      const k = itemIdFn(it);
      if (k == null) return true; // unkeyed items kept (legacy/no-id case)
      if (seen.has(k)) return false; // drop duplicate
      seen.set(k, i);
      return true;
    });
    // Re-index after the dedup filter so seen.get(itemId) maps to the
    // correct position in the trimmed nextArr.
    seen.clear();
    for (let i = 0; i < nextArr.length; i++) {
      const k = itemIdFn(nextArr[i]);
      if (k != null) seen.set(k, i);
    }
    for (const [itemId, entry] of liveById) {
      // Honour blob tombstones seeded above — a peer that pushed the row
      // back as live before pulling our delete would otherwise resurrect
      // it here via nextArr.push.
      if (tombs.has(itemId)) continue;
      const item = entry.item;
      const idx = seen.get(itemId);
      if (idx !== undefined) nextArr[idx] = item;
      else nextArr.push(item);
    }
    writeArr(nextArr);
    // v1.7.12 audit fix: re-apply COMPOSITE_KEYED_ARRAYS cap after the
    // per-row overlay. mergeImportedData (the blob path) caps automatically,
    // but v4 cutover skips the blob merge entirely — without this re-cap,
    // changeHistory would grow past 200 entries on a v4 device because
    // `noTombstones: true` means the relay accumulates rows forever and
    // the pull replays all of them. Sort by timestamp (newest first via
    // pickTimestamp-equivalent inline) and trim to cap.
    const cap = COMPOSITE_KEYED_ARRAYS.find(c => c.path === arrayName)?.cap;
    if (cap && imported[arrayName].length > cap) {
      imported[arrayName].sort((a, b) => {
        const ta = a?.updatedAt ?? a?.createdAt ?? a?.at ?? (typeof a?.date === 'string' ? Date.parse(a.date) : 0) ?? 0;
        const tb = b?.updatedAt ?? b?.createdAt ?? b?.at ?? (typeof b?.date === 'string' ? Date.parse(b.date) : 0) ?? 0;
        return tb - ta;
      });
      imported[arrayName] = imported[arrayName].slice(0, cap);
    }
    _pullDeltaSnapshot.perArray[arrayName] = { live: liveById.size, tombstones: tombs.size };
  }
  return imported;
}

// ═══════════════════════════════════════════════
// RELAY QUOTA ESTIMATE (client-side, with optional real probe)
// ═══════════════════════════════════════════════
//
// The relay caps each owner at 50 MB of evolu_message rows; once that
// fills, writes are silently rejected and clients see "push committed"
// with no actual durable write. The cumulative-bytes counter below is
// the always-available fallback; getbased-relay 1.2.0+ exposes a real
// probe at GET /self/owner-storage that returns the relay's
// authoritative storedBytes (signed with the client's own writeKey, no
// admin token involved). When that probe succeeds we mirror its result
// into the same localStorage key so the rest of the UI stays
// synchronous — see _maybeRefreshFromRelay below. The counter still
// drives the UI when the probe is unreachable (older relay, offline,
// CORS misroute), so the wedge-warning never goes blind.

const RELAY_OWNER_QUOTA_BYTES = 50 * 1024 * 1024;
function _ownerStorageKey() {
  const owner = _appOwner?.id ? String(_appOwner.id) : 'unknown';
  return `labcharts-relay-bytes-${owner}`;
}
function _trackPushBytes(bytes) {
  if (!_appOwner?.id || !Number.isFinite(bytes) || bytes <= 0) return;
  try {
    const key = _ownerStorageKey();
    const cur = parseInt(localStorage.getItem(key) || '0', 10) || 0;
    localStorage.setItem(key, String(cur + bytes));
  } catch {}
  // After every successful push, check whether we crossed an alert
  // threshold (80% amber, 95% red). One toast per transition so the user
  // gets a single clear notice, not a per-push spammer.
  _maybeWarnQuotaThreshold();
}
export function getRelayQuotaEstimate() {
  if (!_appOwner?.id) return null;
  let bytes = 0;
  try { bytes = parseInt(localStorage.getItem(_ownerStorageKey()) || '0', 10) || 0; } catch {}
  const cap = RELAY_OWNER_QUOTA_BYTES;
  const pct = Math.min(100, Math.round((bytes / cap) * 100));
  let level = 'green';
  if (pct >= 95) level = 'red';
  else if (pct >= 80) level = 'amber';
  return { bytes, cap, pct, level };
}
export function resetRelayQuotaEstimate() {
  if (!_appOwner?.id) return false;
  try { localStorage.removeItem(_ownerStorageKey()); return true; } catch { return false; }
}

// Set the cached estimate to a known absolute value. Used by the relay
// probe so the rest of the UI stays synchronous (no awaiting a network
// roundtrip on every render).
function _setRelayQuotaBytes(bytes) {
  if (!_appOwner?.id || !Number.isFinite(bytes) || bytes < 0) return;
  try { localStorage.setItem(_ownerStorageKey(), String(Math.round(bytes))); } catch {}
}

// ─── Relay self-service (writeKey-HMAC-authed) ─────────────
//
// Mirrors the /self/* endpoints introduced in getbased-relay 1.2.0.
// Each request is HMAC-SHA256 signed with the user's own writeKey
// (the same Evolu secret the client already holds for pushes), so no
// admin token leaves the relay VM and one user can't ever act on
// another user's owner. See packages/getbased-relay/src/lib/self-server.ts.

// Derive the HTTP base URL for /self/* from the wss:// relay URL.
// Production: wss://sync.getbased.health → https://sync.getbased.health
// (Caddy routes /self/* to localhost:4003 alongside the WebSocket relay
// at the root path.) Self-hosters who can't terminate TLS leave it as
// http://; localhost dev uses ws://localhost:4000 → http://localhost:4003.
//
// A self-hoster who runs the relay on its native port (e.g.
// `wss://relay.example.com:4000`) without a reverse proxy CAN'T have
// /self/* path-routed onto the WebSocket port — they have to expose
// 4003 separately. The localStorage override below lets them point
// the client at the right URL without us trying to autodetect the
// shape of every possible self-host topology.
const SELF_URL_OVERRIDE_KEY = 'labcharts-self-url';
function _getSelfBaseUrl() {
  // Manual override — wins over autoderivation. Useful when the relay
  // and self-service ports live on different hostnames or ports
  // (e.g. self-host with no reverse proxy, or `self.example.com` on
  // a dedicated subdomain).
  try {
    const override = localStorage.getItem(SELF_URL_OVERRIDE_KEY);
    if (override && /^https?:\/\//i.test(override)) {
      return override.replace(/\/+$/, '');
    }
  } catch {}
  const wss = getSyncRelay();
  if (typeof wss !== 'string' || !wss) return null;
  try {
    const u = new URL(wss);
    if (u.protocol === 'wss:') u.protocol = 'https:';
    else if (u.protocol === 'ws:') u.protocol = 'http:';
    else return null;
    // Strip path + query — relay URL might carry a /ping suffix from
    // probe code. /self/* always lives at the root.
    u.pathname = '';
    u.search = '';
    u.hash = '';
    // Localhost dev: relay listens on 4000, self on 4003. In hosted
    // (Caddy) deployments both ride the same hostname/port via path
    // routing, so leave the port alone there.
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      u.port = '4003';
    }
    return u.toString().replace(/\/$/, '');
  } catch { return null; }
}

// Sign {context}:{ownerId}:{timestamp} with the owner's writeKey. Returns
// {ownerId, timestamp, signature} in the exact shape /self/* expects.
// Throws if no owner / writeKey is loaded — caller catches.
async function _signSelfRequest(context) {
  if (!_appOwner?.id || !_appOwner?.writeKey) {
    throw new Error('owner_not_ready');
  }
  if (!globalThis.crypto?.subtle?.importKey) {
    throw new Error('subtle_crypto_unavailable');
  }
  const ownerId = String(_appOwner.id);
  const timestamp = Date.now();
  const message = `${context}:${ownerId}:${timestamp}`;
  const key = await crypto.subtle.importKey(
    'raw',
    _appOwner.writeKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const sig = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return { ownerId, timestamp, signature: sig };
}

// Fetch the relay's authoritative storedBytes for our owner. On
// success, mirrors the value into the local quota cache so the
// synchronous getRelayQuotaEstimate() reflects ground truth. Returns
// {storedBytes, quotaBytes, messageCount, lastWriteToken} or null on
// any failure. The latter two are surfaced by relay >= 1.2.3 — older
// relays return null for them, which the caller treats as "unknown"
// (not an error condition).
export async function fetchOwnerStorageFromRelay() {
  const base = _getSelfBaseUrl();
  if (!base) return null;
  try {
    const { ownerId, timestamp, signature } = await _signSelfRequest('storage');
    const url = `${base}/self/owner-storage?ownerId=${encodeURIComponent(ownerId)}&timestamp=${timestamp}&signature=${signature}`;
    // 5s timeout — old relay (404), unreachable, or CORS-misrouted
    // shouldn't block the diagnose modal from rendering.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const body = await r.json();
    if (!body || typeof body.storedBytes !== 'number') return null;
    _setRelayQuotaBytes(body.storedBytes);
    return {
      storedBytes: body.storedBytes,
      quotaBytes: body.quotaBytes ?? null,
      // Relay 1.2.3+: messageCount + lastWriteToken let us verify
      // "did the relay actually persist my last push?". Older relays
      // omit these → null. Code reading them must handle null = unknown.
      messageCount: typeof body.messageCount === 'number' ? body.messageCount : null,
      lastWriteToken: typeof body.lastWriteToken === 'string' ? body.lastWriteToken : null,
    };
  } catch { return null; }
}

// ─── Push verification (Evolu silent-reject detector) ────────────────
// After every "push committed" event, we snapshot what the relay reports
// for our owner and stash it. The NEXT verifyPushLanded() call hits
// /self/owner-storage again and compares — if storedBytes hasn't
// increased AND messageCount hasn't increased AND lastWriteToken
// hasn't changed, the push was silently dropped server-side (the
// Evolu silent-reject bug 2026-05-11: WS round-trip looks healthy,
// relay acks "Push committed", but evolu_message gets zero rows
// written). Three-state verdict so we can surface a colored dot
// without false-alarming on transient errors or pre-1.2.3 relays:
//   'healthy'  — relay advanced; push landed
//   'wedged'   — relay didn't advance; push was silently dropped
//   'unknown'  — couldn't probe (old relay, offline, no prior snapshot)
let _lastRelaySnapshot = null;  // { storedBytes, messageCount, lastWriteToken, at }
let _lastVerifyVerdict = { verdict: 'unknown', at: 0, reason: null };
// Track the most recent local "push committed" event. The verifier only
// reports 'wedged' if a push completed AFTER the last snapshot — without
// this gate, two consecutive verify calls with no push between them
// would always report 'wedged' (nothing changed on the relay because
// nothing was pushed, but the user gets a misleading red dot).
let _lastPushCommittedAt = 0;

export function getRelayHealthVerdict() {
  return { ..._lastVerifyVerdict };
}

// Called from onComplete inside the push pipeline once a "Push committed"
// event has fired. Used by verifyPushLanded to gate the wedged verdict —
// otherwise idle calls would always be 'wedged'.
function notePushCommitted() {
  _lastPushCommittedAt = Date.now();
}

// Verify that the most recent push actually advanced the relay's state.
// Returns the verdict object. Caller is the diagnose modal renderer.
export async function verifyPushLanded() {
  // Old relay (< 1.2.3): messageCount + lastWriteToken come back null.
  // We can still check storedBytes, but it can advance and then drop
  // back to its prior value after a compaction, so it's a weaker signal.
  // Treat the pre-1.2.3 case as 'unknown' to avoid false alarms.
  const fresh = await fetchOwnerStorageFromRelay();
  if (!fresh) {
    _lastVerifyVerdict = { verdict: 'unknown', at: Date.now(), reason: 'relay-unreachable' };
    return _lastVerifyVerdict;
  }
  // `messageCount` is the discriminator for relay version: v1.2.3+
  // always returns an integer (0 for empty owners, > 0 otherwise);
  // older relays omit the field and the fetcher maps the absence to
  // null. We CANNOT use `lastWriteToken` here — it's null both for
  // pre-1.2.3 AND for legit wedged owners (zero writes ever landed),
  // which is exactly the state we want to detect. (Greptile follow-up.)
  if (fresh.messageCount === null) {
    _lastVerifyVerdict = { verdict: 'unknown', at: Date.now(), reason: 'pre-1.2.3-relay' };
    return _lastVerifyVerdict;
  }
  // Absolute-value sanity check: if we've pushed at least once this
  // session AND the relay reports zero messages, we're in the exact
  // 2026-05-11 wedged-owner shape. No baseline needed — pushes
  // succeeded locally, relay has nothing. Strongest signal we have.
  if (_lastPushCommittedAt > 0 && fresh.messageCount === 0 && fresh.storedBytes === 0) {
    _lastVerifyVerdict = {
      verdict: 'wedged',
      at: Date.now(),
      reason: 'pushes committed locally but relay reports zero messages and zero bytes',
    };
    return _lastVerifyVerdict;
  }
  if (!_lastRelaySnapshot) {
    // First call this session — snapshot now, can't verify yet.
    _lastRelaySnapshot = {
      storedBytes: fresh.storedBytes,
      messageCount: fresh.messageCount,
      lastWriteToken: fresh.lastWriteToken,
      at: Date.now(),
    };
    _lastVerifyVerdict = { verdict: 'unknown', at: Date.now(), reason: 'no-baseline-yet' };
    return _lastVerifyVerdict;
  }
  // Only report 'wedged' from a delta if a push happened SINCE the
  // baseline was captured. Otherwise the relay has nothing to advance
  // past and we'd be flagging idle-as-wedged.
  if (_lastPushCommittedAt <= _lastRelaySnapshot.at) {
    _lastVerifyVerdict = { verdict: 'unknown', at: Date.now(), reason: 'no-push-since-baseline' };
    // Don't roll the baseline — we want the NEXT verify (after a real
    // push) to compare against the same snapshot.
    return _lastVerifyVerdict;
  }
  const advanced =
    fresh.storedBytes > _lastRelaySnapshot.storedBytes
    || fresh.messageCount > _lastRelaySnapshot.messageCount
    || (fresh.lastWriteToken && fresh.lastWriteToken !== _lastRelaySnapshot.lastWriteToken);
  if (advanced) {
    _lastVerifyVerdict = { verdict: 'healthy', at: Date.now(), reason: null };
  } else {
    _lastVerifyVerdict = {
      verdict: 'wedged',
      at: Date.now(),
      reason: `pushed at ${new Date(_lastPushCommittedAt).toISOString()} but relay still reports storedBytes=${fresh.storedBytes} messageCount=${fresh.messageCount}`,
    };
  }
  // Roll the baseline forward so the next push-verify pair measures the
  // next interval, not all of session-history.
  _lastRelaySnapshot = {
    storedBytes: fresh.storedBytes,
    messageCount: fresh.messageCount,
    lastWriteToken: fresh.lastWriteToken,
    at: Date.now(),
  };
  return _lastVerifyVerdict;
}

// Hit POST /self/compact-owner — drops every evolu_message row for our
// owner and zeroes the relay's stored-bytes counter. The local cache
// is reset on success to match. Throws on any non-200 with a sanitized
// message so the caller can surface it; never re-throws raw network
// detail (might leak relay path / IP).
export async function compactOwnerSelfServe() {
  const base = _getSelfBaseUrl();
  if (!base) throw new Error('No relay configured');
  const { ownerId, timestamp, signature } = await _signSelfRequest('compact');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let r;
  try {
    r = await fetch(`${base}/self/compact-owner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId, timestamp, signature }),
      signal: ctrl.signal,
    });
  } finally { clearTimeout(timer); }
  if (!r.ok) {
    let detail = '';
    try { const body = await r.json(); detail = body?.error ? ` (${body.error})` : ''; } catch {}
    throw new Error(`Relay returned ${r.status}${detail}`);
  }
  const body = await r.json();
  // Reset local counter to whatever the relay reports as afterStoredBytes
  // (typically 0). On parse trouble fall back to clearing the key
  // outright — the relay state is the truth.
  if (typeof body?.afterStoredBytes === 'number') {
    _setRelayQuotaBytes(body.afterStoredBytes);
  } else {
    resetRelayQuotaEstimate();
  }
  // Clear "already toasted" markers so future thresholds re-warn.
  try { localStorage.removeItem('labcharts-relay-quota-warned'); } catch {}
  try {
    localStorage.removeItem(`labcharts-${ownerId}-relay-quota-warned`);
  } catch {}
  return body;
}

// ═══════════════════════════════════════════════
// PHASE 1 DELTA TELEMETRY (observability for cutover decision)
// ═══════════════════════════════════════════════
//
// Phase 2 of the CRDT-delta refactor (drop blob writes entirely) is gated
// on ≥2 weeks of cross-device bake under real traffic with the per-row
// datapath proven healthy. "Healthy" = (a) per-push delta payload is a
// small fraction of the blob (proves we're not double-shipping the same
// content), and (b) every device's local Evolu DB shows the same per-array
// row counts (proves relay replication is propagating per-row state, not
// just blob updates). This module records both signals to localStorage
// and surfaces them in the Sync diagnose modal — no telemetry leaves the
// device, no extra network I/O. When the ratio sits at <0.05 across N
// devices and per-array counts converge, Phase 2 is safe to ship.

const _DELTA_TELEMETRY_CAP = 50; // last-N pushes; ~6 KB at p99 entry size
function _deltaTelemetryKey(profileId) {
  return `labcharts-${profileId}-delta-telemetry`;
}
function _readDeltaTelemetry(profileId) {
  try {
    const raw = localStorage.getItem(_deltaTelemetryKey(profileId));
    return raw ? (JSON.parse(raw) || { pushes: [] }) : { pushes: [] };
  } catch { return { pushes: []  }; }
}
function _recordPushTelemetry(profileId, blobBytes, deltaPlans) {
  if (!profileId) return;
  const perArray = {};
  let totalDeltaBytes = 0;
  let totalOps = 0;
  for (const { arrayName, plan } of deltaPlans) {
    let ins = 0, upd = 0, tom = 0, bytes = 0;
    for (const op of plan.ops) {
      if (op.kind === 'insert') ins++;
      else if (op.kind === 'update') upd++;
      else if (op.kind === 'tombstone') tom++;
      bytes += (op.args?.payload || '').length;
    }
    perArray[arrayName] = { ins, upd, tom, bytes };
    totalDeltaBytes += bytes;
    totalOps += plan.ops.length;
  }
  const entry = { at: Date.now(), blobBytes: blobBytes | 0, totalDeltaBytes, totalOps, perArray };
  try {
    const cur = _readDeltaTelemetry(profileId);
    cur.pushes.push(entry);
    if (cur.pushes.length > _DELTA_TELEMETRY_CAP) cur.pushes.splice(0, cur.pushes.length - _DELTA_TELEMETRY_CAP);
    localStorage.setItem(_deltaTelemetryKey(profileId), JSON.stringify(cur));
  } catch {}
}
// Public read accessor — returns recent pushes + latest pull-side row
// counts for the active profile. Pull snapshot is in-memory (re-derived
// every merge), pushes persist across reloads.
export function getDeltaTelemetry(profileId) {
  if (!profileId) return null;
  const t = _readDeltaTelemetry(profileId);
  const pushes = Array.isArray(t.pushes) ? t.pushes : [];
  // Aggregate over the last N pushes for the diagnose summary row.
  let aggBlob = 0, aggDelta = 0, aggOps = 0;
  for (const p of pushes) {
    aggBlob += p.blobBytes || 0;
    aggDelta += p.totalDeltaBytes || 0;
    aggOps += p.totalOps || 0;
  }
  const ratio = aggBlob > 0 ? aggDelta / aggBlob : 0;
  return {
    pushes,
    pull: _pullDeltaSnapshot.profileId === profileId
      ? { perArray: { ..._pullDeltaSnapshot.perArray }, mergedAt: _pullDeltaSnapshot.mergedAt }
      : { perArray: {}, mergedAt: 0 },
    summary: { count: pushes.length, totalBlobBytes: aggBlob, totalDeltaBytes: aggDelta, totalOps: aggOps, ratio },
  };
}
export function resetDeltaTelemetry(profileId) {
  if (!profileId) return false;
  try { localStorage.removeItem(_deltaTelemetryKey(profileId)); return true; } catch { return false; }
}

// ═══════════════════════════════════════════════
// PHASE 2 CUTOVER READINESS (v1.7.9)
// ═══════════════════════════════════════════════
//
// Once cross-device bake completes (≥2 weeks of real traffic on v1.7.0+),
// dropping the fat-blob writes is a one-line change in buildSyncPayload.
// This check is the hard gate before that flip — it surveys every
// DELTA_ARRAYS / DELTA_MAPS / DELTA_SCALARS field for the active profile
// and reports whether each surface that has LOCAL data also has at least
// one corresponding itemRow in this device's Evolu DB. If any surface
// has data locally but no per-row row, the per-row datapath isn't
// carrying that surface yet — flipping Phase 2 would silently lose it.
//
// Returns a structured `{ ready: bool, surfaces: { [name]: { localCount,
// rowCount, status } } }` so the caller can render a per-surface table.
// status values: 'ok' (data on both sides), 'no-data' (nothing locally,
// nothing to verify), 'missing-rows' (local data exists but no rows
// shipped — BLOCKER), 'rows-only' (rows exist but no local data —
// fine: another device pushed, this one hasn't synced or had it).
export function getDeltaCutoverReadiness(profileId, importedData) {
  if (!profileId) return { ready: false, error: 'no-profile', surfaces: {} };
  if (!importedData) importedData = state.importedData || {};
  const surfaces = {};
  let blockers = 0;

  // Index existing itemRow rows for this profile so each surface check
  // is a Map lookup, not an O(n) scan.
  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  const rowsByName = new Map();
  for (const r of allItemRows) {
    if (!r || r.profileId !== profileId) continue;
    if (!rowsByName.has(r.arrayName)) rowsByName.set(r.arrayName, []);
    rowsByName.get(r.arrayName).push(r);
  }

  function classify(name, localCount, rowCount) {
    let status;
    if (localCount === 0 && rowCount === 0) status = 'no-data';
    else if (localCount > 0 && rowCount === 0) { status = 'missing-rows'; blockers++; }
    else if (localCount === 0 && rowCount > 0) status = 'rows-only';
    else status = 'ok';
    surfaces[name] = { shape: undefined, localCount, rowCount, status };
  }

  for (const arrayName of DELTA_ARRAYS) {
    // Honor nested paths the same way the planner + merger do.
    const raw = arrayName.includes('.')
      ? getAt(importedData, arrayName)
      : importedData[arrayName];
    const items = Array.isArray(raw) ? raw : [];
    const rows = (rowsByName.get(arrayName) || []).filter(r => !r.isDeleted);
    classify(arrayName, items.length, rows.length);
    surfaces[arrayName].shape = 'array';
  }
  for (const mapName of DELTA_MAPS) {
    // Dotted-path entries (e.g. `genetics.snps`) walk via getAt so the
    // readiness check counts the nested map, not a flat top-level
    // sibling that doesn't exist. Without this, the gate would always
    // report `localCount=0` for nested maps and silently pass even
    // when the cutover would drop genuine data.
    const obj = mapName.includes('.') ? getAt(importedData, mapName) : importedData[mapName];
    const localCount = (obj && typeof obj === 'object' && !Array.isArray(obj)) ? Object.keys(obj).length : 0;
    const rows = (rowsByName.get(mapName) || []).filter(r => !r.isDeleted);
    classify(mapName, localCount, rows.length);
    surfaces[mapName].shape = 'map';
  }
  for (const scalarName of DELTA_SCALARS) {
    // Dotted-path scalars walk via getAt so nested entries
    // (e.g. `lightEnvironment.burdenAI`) report local-presence accurately.
    const v = scalarName.includes('.')
      ? getAt(importedData, scalarName)
      : importedData[scalarName];
    const hasValue = v !== null && v !== undefined && !(typeof v === 'string' && v.length === 0);
    const rows = (rowsByName.get(scalarName) || []).filter(r => !r.isDeleted);
    classify(scalarName, hasValue ? 1 : 0, rows.length);
    surfaces[scalarName].shape = 'scalar';
  }

  return {
    ready: blockers === 0,
    blockerCount: blockers,
    surfaceCount: Object.keys(surfaces).length,
    surfaces,
  };
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
  // Post-enable schema-drift detection. enablePhase2Cutover gates ON
  // readiness AT FLIP TIME, but if a future commit adds a new write site
  // OUTSIDE DELTA_ARRAYS/MAPS/SCALARS (the exact failure mode of the
  // burdenAI bug fixed alongside this change), v4 silently drops it: the
  // blob is suppressed, no per-row planner exists for the new field, and
  // peers pulling v4 see no rows. This re-runs the readiness check on
  // every push when cutover is on; on drift, auto-disable cutover (so
  // the next push reverts to v3 dual-write and the data flows again),
  // log the event for the diagnose modal, and reload the cutover flag
  // for the rest of this push so it ships v3 too. Cost: one walk of 37
  // surfaces, ~1-3 ms — paid only when cutover is on.
  if (isPhase2CutoverEnabled(profileId) && importedData && typeof importedData === 'object') {
    try {
      const driftCheck = getDeltaCutoverReadiness(profileId);
      if (driftCheck && !driftCheck.ready) {
        const blockerNames = Object.entries(driftCheck.surfaces || {})
          .filter(([, v]) => v && v.status === 'missing-rows')
          .map(([k]) => k)
          .slice(0, 3)
          .join(', ');
        console.warn(`[sync] Phase 2 cutover drift detected — auto-disabling. ${driftCheck.blockerCount} surface(s) lack per-row push history (e.g. ${blockerNames || 'unknown'}). This push will revert to v3 dual-write.`);
        disablePhase2Cutover(profileId);
        _logSyncEvent('skip', `Cutover drift: ${driftCheck.blockerCount} surface(s) missing per-row history — auto-reverted to dual-write (${blockerNames || 'unknown'})`);
      }
    } catch (e) { /* readiness check failures are non-fatal */ }
  }
  try {
    const dataJson = await buildSyncPayload(profileId, importedData);
    const syncedAt = new Date().toISOString();

    const sunCount = Array.isArray(importedData?.sunSessions) ? importedData.sunSessions.length : 0;
    const devCount = Array.isArray(importedData?.lightDevices) ? importedData.lightDevices.length : 0;
    const queueMsg = `Queued ${profileId.slice(0,8)} — sun=${sunCount} dev=${devCount}`;
    const queuedAt = Date.now();
    dbg(`${queueMsg} @ ${queuedAt}`);
    _logSyncEvent('queue', queueMsg);

    // Phase 1 of CRDT-delta refactor: plan per-array deltas BEFORE the
    // blob update so the diff is computed against the same importedData
    // snapshot we're about to ship. Apply runs from onComplete so a
    // wedged blob push doesn't strand the snapshot pointer past the
    // unmerged delta.
    const deltaPlans = [];
    let deltaOpCount = 0;
    if (importedData && typeof importedData === 'object') {
      for (const arrayName of DELTA_ARRAYS) {
        // arrayName may be a dotted path (`lightEnvironment.rooms`); the
        // planner reads via getAt so flat and nested paths share the
        // same code path.
        const raw = arrayName.includes('.')
          ? getAt(importedData, arrayName)
          : importedData[arrayName];
        const items = Array.isArray(raw) ? raw : [];
        try {
          const plan = await _planArrayDelta(profileId, arrayName, items);
          if (plan.ops.length > 0) {
            deltaPlans.push({ arrayName, plan });
            deltaOpCount += plan.ops.length;
          }
        } catch (e) {
          console.warn(`[sync] delta-plan ${arrayName} failed:`, e?.message || e);
        }
      }
      // Keyed-map shapes (markerNotes etc) — same itemRow table, different
      // enumeration. Tagged with the same arrayName field on the row so
      // telemetry + the diagnose UI render them uniformly with the array
      // arrays.
      for (const mapName of DELTA_MAPS) {
        // Dotted-path support (e.g. `genetics.snps`) — same getAt walk
        // as the array planner. Flat names hit the obvious top-level.
        const obj = mapName.includes('.') ? getAt(importedData, mapName) : importedData[mapName];
        try {
          const plan = await _planKeyedMapDelta(profileId, mapName, obj);
          if (plan.ops.length > 0) {
            deltaPlans.push({ arrayName: mapName, plan });
            deltaOpCount += plan.ops.length;
          }
        } catch (e) {
          console.warn(`[sync] delta-plan map ${mapName} failed:`, e?.message || e);
        }
      }
      // Scalars (menstrualCycle / context cards / DNA / etc) — one row
      // per scalar. Without this loop, Phase 2 (drop blob writes) would
      // silently stop syncing all 18 scalar fields. Same plan/apply
      // contract so telemetry + cap watchdog cover them uniformly.
      for (const scalarName of DELTA_SCALARS) {
        // Dotted-path scalars (e.g. `lightEnvironment.burdenAI`) read via
        // getAt so a nested singleton can ride the scalar planner without
        // colliding with its sibling arrays/maps on the same parent.
        let value = scalarName.includes('.')
          ? getAt(importedData, scalarName)
          : importedData[scalarName];
        // Strip nested fields that ride a DELTA_MAPS dotted path so the
        // scalar carries only metadata, not a stale copy of the per-key
        // map. Without this, the relay's `genetics` scalar row keeps
        // re-applying the old whole-snps blob on every pull, beating
        // the per-row genetics.snps merge that's actually the source
        // of truth for SNP membership.
        if (scalarName === 'genetics' && value && typeof value === 'object' && !Array.isArray(value)) {
          const { snps, ...metadata } = value;
          value = metadata;
        }
        try {
          const plan = await _planScalarDelta(profileId, scalarName, value);
          if (plan.ops.length > 0) {
            deltaPlans.push({ arrayName: scalarName, plan });
            deltaOpCount += plan.ops.length;
          }
        } catch (e) {
          console.warn(`[sync] delta-plan scalar ${scalarName} failed:`, e?.message || e);
        }
      }
    }

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
      // Mark the moment a push committed locally so the relay-health
      // verifier (verifyPushLanded) can distinguish "no push happened
      // yet" from "push happened but relay didn't advance" (silent
      // reject).
      notePushCommitted();
      // Only advance the local-sync-ts watermark when the push actually
      // landed. The previous (synchronous) bump after evolu.update meant
      // a wedged push set the watermark anyway → subsequent pulls saw
      // `remote.syncedAt < local-sync-ts` and skipped, leaving the local
      // Evolu row stuck at older state with no auto-recovery. Now the
      // watermark only moves on real success.
      // Use syncedAt (same value stored in Evolu) so pulls see exact
      // equality and don't skip the row from 1ms clock drift.
      localStorage.setItem(`labcharts-${profileId}-sync-ts`, String(new Date(syncedAt).getTime()));
      // Track bytes for the local relay-storage estimate (see
      // getRelayQuotaEstimate). Each successful push adds dataJson.length
      // to the cumulative — close enough to relay's storedBytes to warn
      // the user before the 50 MB wall.
      _trackPushBytes((dataJson || '').length);
      // Phase 1 of CRDT-delta refactor: apply the planned per-array
      // deltas now that the blob committed. Snapshot is committed only
      // after the per-row mutations are queued — failure to apply a
      // delta will retry on the next push since the snapshot still
      // reflects what was last successfully reflected to the relay.
      if (deltaPlans.length > 0) {
        let snapshotsAdvanced = 0;
        for (const { arrayName, plan } of deltaPlans) {
          // v1.7.12 audit fix: only advance the snapshot when every op in
          // the plan succeeded. A partial failure (e.g. one row's evolu.insert
          // throwing on duplicate-id) used to advance the snapshot anyway,
          // so the next push diff'd against state that didn't match the
          // relay → failed items got silently skipped forever.
          const allOk = _applyArrayDelta(arrayName, plan);
          if (allOk) {
            // v1.7.16: thread plannedAt so a stale onComplete (push A
            // arriving after push B has already written its snapshot)
            // doesn't clobber the fresher view.
            const wrote = _writeDeltaSnapshot(profileId, arrayName, plan.next, plan.plannedAt);
            if (wrote) snapshotsAdvanced++;
          }
        }
        dbg(`Applied ${deltaOpCount} delta ops across ${deltaPlans.length} array(s) — ${snapshotsAdvanced}/${deltaPlans.length} snapshots advanced`);
      }
      // Phase 1 telemetry: record blob size + per-array delta breakdown.
      // Always recorded — even when deltaPlans is empty (a no-delta push
      // is a valid signal: the user is online but didn't change anything,
      // and the still-shipped blob is pure overhead Phase 2 will remove).
      _recordPushTelemetry(profileId, (dataJson || '').length, deltaPlans);
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
      // profileId is repeated on every update so post-compaction replicas
      // see it on every CRDT message — without this, a relay that drops
      // the original insert from `evolu_message` (e.g. /compact-owner)
      // strands every receiving device with an empty profileId column,
      // which onSyncReceived's allowlist regex rejects → row never merges.
      evolu.update("profileData", {
        id: existing.id,
        profileId,
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
    // profileId carried explicitly so post-compaction replicas of this
    // tombstone still know which local profile to wipe.
    evolu.update('profileData', { id: row.id, profileId, isDeleted: 1, syncedAt: new Date().toISOString() });
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
  // Same payload-fallback as onSyncReceived: a tombstone row whose
  // profileId column was lost to compaction still carries profile.id
  // inside dataJson, so we recover it before deciding what to wipe.
  const tombIdsArr = [];
  for (const t of tombs) {
    if (t.profileId) { tombIdsArr.push(t.profileId); continue; }
    try {
      const parsed = await parseSyncPayload(t.dataJson || '{}');
      const candidate = parsed?.profile?.id;
      if (typeof candidate === 'string' && /^[a-zA-Z0-9_-]+$/.test(candidate)) {
        tombIdsArr.push(candidate);
      }
    } catch {}
  }
  const tombIds = new Set(tombIdsArr);
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
    localStorage.removeItem(`labcharts-${tombId}-emptyTour`);
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
  for (const k of ['chat','chat-threads','chatRailOpen','chatPersonality','chatPersonalityCustom','focusCard','contextHealth','onboarded','emptyTour','tour','cycleTour','phaseOverlay','sync-ts']) {
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

// One-time cleanup: the v1.6.0–v1.6.2 hash-skip mechanism wrote
// `labcharts-{profileId}-sync-hash` keys; v1.6.3 removed the skip
// path entirely (bytes were occasionally stranding rows when local
// state went out of sync with the stored hash). Sweep the now-orphan
// keys on first pull after upgrade. Linear in localStorage keys,
// idempotent via the migration flag.
function _onceClearStaleSyncHashes() {
  try {
    if (localStorage.getItem('labcharts-sync-hash-v2-migrated')) return;
    const toClear = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('labcharts-') && k.endsWith('-sync-hash')) toClear.push(k);
    }
    for (const k of toClear) localStorage.removeItem(k);
    localStorage.setItem('labcharts-sync-hash-v2-migrated', '1');
    if (toClear.length) dbg(`Cleared ${toClear.length} stale -sync-hash keys (one-time migration)`);
  } catch (e) {}
}

async function onSyncReceived() {
  if (!evolu || !profileQuery || _pulling) {
    dbg('onSyncReceived skipped:', !evolu ? 'no evolu' : !profileQuery ? 'no query' : 'already pulling');
    return;
  }
  _pulling = true;
  _onceClearStaleSyncHashes();
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

    // Pre-pass: recover profileId from the payload when the column is empty.
    // After a relay compaction, only the latest evolu.update messages survive
    // — those don't carry profileId — so a fresh device replicating a
    // post-compact log materializes the row with a blank profileId column.
    // The payload itself still contains profile.id, so we read that and use
    // it as the row's effective profileId for dedupe + merge.
    const enrichedRows = [];
    for (const row of rawRows) {
      if (!row) continue;
      let effectiveProfileId = row.profileId || null;
      if (!effectiveProfileId) {
        try {
          const parsed = await parseSyncPayload(row.dataJson || '{}');
          const candidate = parsed?.profile?.id;
          if (typeof candidate === 'string' && /^[a-zA-Z0-9_-]+$/.test(candidate)) {
            effectiveProfileId = candidate;
          }
        } catch {
          // Malformed payload + empty column → can't merge, drop the row.
        }
      }
      if (!effectiveProfileId) continue;
      enrichedRows.push({ ...row, profileId: effectiveProfileId });
    }

    // Dedupe by profileId, keeping the row with the highest syncedAt.
    // Evolu can return multiple rows per profileId after a tombstone +
    // recreate or a restore-from-mnemonic race; iterating in CRDT order
    // could let an older row land last and overwrite the newer pull
    // (because the per-profile localStorage timestamp is bumped only at
    // the bottom of the loop). Sort descending so the freshest row is
    // processed first, then the older row's `remoteUpdated <= localUpdated`
    // guard short-circuits as intended.
    const byProfile = new Map();
    for (const row of enrichedRows) {
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
        const localKey = profileStorageKey(profileId, 'imported');
        const localMeta = localStorage.getItem(`labcharts-${profileId}-sync-ts`);
        const localUpdated = localMeta ? parseInt(localMeta, 10) : 0;

        // No skip-decision before the merge runs. Both the timestamp-skip
        // and the hash-skip have caused users to miss cross-device data:
        // - Timestamp-skip: clock-skew across phone vs desktop made the
        //   strictly-older comparison silently drop newer pushes.
        // - Hash-skip: a stale -sync-hash from a previous code version
        //   matched the relay row's content but the local state didn't
        //   actually have the data, so the skip path stranded the row.
        // The merge itself (mergeImportedData) is structurally idempotent
        // and union-based, so re-applying the same bytes is a no-op when
        // local already equals remote. Cheap (one JSON parse + one
        // pass over id-keyed arrays per pull tick); cheaper than a sync
        // bug that leaves users insisting it's broken.
        dbg(`Row ${profileId.slice(0,8)}: PULLING (remote ${remoteUpdated}, local ${localUpdated})`);

        // Remote is newer — parse payload (async because the gzip envelope
        // routes through DecompressionStream)
        const { importedData, profile, aiSettings, chatData, displayPrefs } = await parseSyncPayload(row.dataJson);

        // Track latest AI settings (apply once, from most recent row)
        if (aiSettings && remoteUpdated > latestAiTs) {
          latestAiSettings = aiSettings;
          latestAiTs = remoteUpdated;
        }

        // Validate importedData shape. v4 (Phase 2 cutover) intentionally
        // omits importedData — it's null by design, not malformed. We
        // still want to run the per-row pull for that case, so detect v4
        // (importedData strictly === null after parseSyncPayload) and
        // continue with an empty-object placeholder; the per-row overlay
        // step downstream will fill in every field from itemRow data.
        // Anything else falsy/non-object is genuinely malformed → skip.
        const isV4Cutover = importedData === null;
        if (!isV4Cutover && (!importedData || typeof importedData !== 'object')) {
          // v1.7.15 audit fix: log so a chronically-corrupted row is
          // visible in the activity log instead of silently disappearing.
          _logSyncEvent('skip', `Pull ${profileId.slice(0, 8)} — malformed importedData shape, skipping row`);
          continue;
        }

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
        if (localWearableConnections && importedData) {
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
        // v4 cutover: importedData is null by design. Use local as the
        // baseline; per-row overlay below fills in every field. v3 and
        // older still merge blob-into-local as before.
        let merged = localImportedForMerge
          ? (importedData ? mergeImportedData(localImportedForMerge, importedData) : localImportedForMerge)
          : (importedData || {});
        // Phase 1 of CRDT-delta refactor: overlay per-row tables AFTER
        // the blob merge. Per-row state is authoritative — a tombstone
        // here drops the corresponding item even if the blob (which is
        // older or written by a pre-Phase-1 device) still carried it.
        // Order matters: blob first establishes baseline, then per-row
        // applies the up-to-date deltas on top. Idempotent: if the blob
        // and per-row tables agree, the overlay is a no-op.
        try {
          merged = await _mergeItemRowsIntoImported(profileId, merged) || merged;
        } catch (e) {
          console.warn('[sync] per-row overlay merge failed (blob still applied):', e?.message || e);
        }
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
        // v4 cutover: importedData is null, so the diff is meaningless
        // (per-row deltas already drove the merge). Skip the rebroadcast
        // gate — per-row pushes don't have the "local has rows remote
        // lacks" pathology since each row is its own CRDT message.
        const needsRebroadcast = !!localImportedForMerge && !!importedData
          && localHasRowsRemoteLacks(localImportedForMerge, importedData);
        // Same diff in the *other* direction: did REMOTE bring rows local
        // didn't have? Used to gate the active-view re-render so we don't
        // wipe an in-progress form input on every pull where the merge
        // produced no observable change.
        const remoteBroughtNewRows = !!localImportedForMerge && !!importedData
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
          // re-render so an in-progress form doesn't get wiped on pull.
          // Source: state.currentView (canonical). DOM .nav-item.active
          // is briefly absent during buildSidebar→navigate cycles and
          // would yank the user to 'dashboard' on a pull landing in
          // that gap (user-reported flicker/sync race).
          const cat = state.currentView || document.querySelector('.nav-item.active')?.dataset?.category || 'dashboard';
          // Sidebar nav items are conditional on data presence (e.g. the
          // Genetics entry only renders when state.importedData.genetics
          // exists). Per-row CRDT deltas can populate scalars/maps that
          // localHasRowsRemoteLacks() doesn't see — it only diffs id-keyed
          // arrays in the blob. Always rebuild the sidebar after a pull so
          // those entries appear/disappear without waiting for the next
          // local action. Cheap (~1ms) and doesn't disturb in-progress
          // forms in the main pane.
          if (window.buildSidebar) try { window.buildSidebar(); } catch (e) {}
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
          // Broadcast for any detached UI listening for cross-device
          // updates (e.g., the All-Sessions modal in views.js). The
          // navigate() above already rebuilt the inline page; this
          // event covers floating modals that aren't part of the main
          // tree. Greptile PR #178 P2 comment.
          if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
            try { window.dispatchEvent(new CustomEvent('labcharts-sync-applied')); } catch (_) {}
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
          setTimeout(() => { pushProfile(profileId, data).catch(() => {}); }, 1000);
        } else {
          pushProfile(profileId, data).catch(() => {});
        }
      }, 10_000);
      _debounceTimers.set(profileId, timer);
    }
  }
  // Messenger context push
  pushContextToGateway();
}

// Called from chat.js when threads/messages change. Per-profile keyed
// timers — earlier draft used a single module-scoped timer that captured
// state.currentProfile + state.importedData at FIRE TIME. Switching
// profile within the 10s window pushed the new profile's data with the
// new profile's id, silently dropping the original profile's chat
// changes. Mirrors the same pattern as onDataSaved's _debounceTimers.
const _chatSyncTimers = new Map();
export function onChatSaved() {
  if (!_syncEnabled || !evolu) return;
  // Capture the active profile + data at QUEUE time so a mid-window
  // profile switch doesn't repoint the push.
  const profileId = state.currentProfile;
  const data = state.importedData;
  if (!profileId) return;
  const prev = _chatSyncTimers.get(profileId);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    _chatSyncTimers.delete(profileId);
    if (_syncing) {
      setTimeout(() => { pushProfile(profileId, data).catch(() => {}); }, 1000);
    } else {
      pushProfile(profileId, data).catch(() => {});
    }
  }, 10000); // 10s debounce — chat saves are frequent during streaming
  _chatSyncTimers.set(profileId, timer);
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
  // Recent sync events list — debug-only. Useful when phone vs desktop
  // disagree on what's on the relay; meaningless to a regular user.
  const debugMode = isDebugMode();
  const events = debugMode ? getRecentSyncEvents().slice(-6).reverse() : [];
  const eventColor = { push: 'var(--accent)', pull: 'var(--green)', skip: 'var(--text-muted)', rebroadcast: 'var(--orange)' };
  const eventsHtml = events.length ? `
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:11px;color:var(--text-muted);max-height:160px;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-weight:600;color:var(--text-secondary);flex:1">Recent activity</span>
        <button class="ctx-btn-option" style="font-size:10px;padding:2px 8px" onclick="window.copySyncEvents(this)" title="Copy events to clipboard">Copy</button>
      </div>
      ${events.map(e => `<div style="margin-bottom:3px"><span style="color:${eventColor[e.kind] || 'var(--text-muted)'};font-weight:600">${e.kind}</span> · ${_timeAgo(e.at)} · <span style="font-family:monospace;font-size:10px">${escapeHTML(e.text)}</span></div>`).join('')}
    </div>` : '';
  // Relay storage estimate. Local cumulative bytes-pushed counter; close
  // enough to relay's actual storedBytes to warn before the 50 MB wall.
  const q = getRelayQuotaEstimate();
  let quotaLine = '';
  if (q && q.bytes > 0) {
    const mb = (q.bytes / (1024 * 1024)).toFixed(1);
    const capMb = (q.cap / (1024 * 1024)).toFixed(0);
    const color = q.level === 'red' ? 'var(--red)' : q.level === 'amber' ? 'var(--orange)' : 'var(--text-muted)';
    const dot = q.level === 'red' ? 'var(--red)' : q.level === 'amber' ? 'var(--orange)' : 'var(--green)';
    quotaLine = `<div style="display:flex;align-items:center;gap:6px;margin-top:4px"><span style="width:6px;height:6px;border-radius:50%;background:${dot};display:inline-block"></span><span style="color:${color}">Storage: ${mb} / ${capMb} MB · ${q.pct}%</span></div>`;
  }
  pop.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="width:8px;height:8px;border-radius:50%;background:${relayDot};display:inline-block"></span><span style="font-size:13px">${relayLabel}</span></div>
    ${debugMode ? `<div style="font-size:10px;color:var(--text-muted);font-family:monospace;margin-bottom:8px;word-break:break-all">${escapeHTML(relayUrl)}</div>` : ''}
    <div style="font-size:12px;color:var(--text-muted);line-height:1.8">
      <div>Push: ${pushLabel}</div>
      <div>Pull: ${pullLabel}</div>
      ${quotaLine}
    </div>
    ${debugMode ? errorLine : ''}
    ${eventsHtml}
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="ctx-btn-option" style="font-size:12px" onclick="syncNow();toggleSyncDetail()">Sync now</button>
      ${stuckPush ? `<button class="ctx-btn-option" style="font-size:12px;color:var(--red);border-color:var(--red)" onclick="window.location.reload()" title="Reloads the page to re-init the sync worker.">Reload</button>` : ''}
      <button class="ctx-btn-option" style="font-size:12px" onclick="toggleSyncDetail();openSettingsModal('data')">Settings</button>
      ${isDebugMode() ? `
        <button class="ctx-btn-option" style="font-size:12px${stuckPush ? ';color:var(--orange);border-color:var(--orange)' : ''}" onclick="forceResendCurrentProfile();toggleSyncDetail()" title="Bypasses the in-flight guard. Use when Sync now isn't reaching the relay (typically because a prior push got stuck and the worker still thinks it's running).">Force resend</button>
        <button class="ctx-btn-option" style="font-size:12px" onclick="cleanStorage().then(()=>toggleSyncDetail())" title="Trim changeHistory to its 200-entry cap and clear cached AI model lists. Use when localStorage is full and pushes throw QuotaExceededError silently.">Clean storage</button>
        <button class="ctx-btn-option" style="font-size:12px" onclick="checkRelayConnection().then(ok=>showNotification(ok?'Relay reachable':'Relay UNREACHABLE',ok?'success':'error'))">Test relay</button>
        <button class="ctx-btn-option" style="font-size:12px" onclick="showSyncDiagnose()">Diagnose</button>
      ` : ''}
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
export async function showSyncDiagnose() {
  const d = await getEvoluDiagnostics();
  // Probe the relay so we can render a fresh "is the relay actually
  // persisting my pushes?" verdict. verifyPushLanded compares a stored
  // baseline against the relay's current state — if storedBytes /
  // messageCount / lastWriteToken haven't moved since the last probe,
  // the verdict is 'wedged'. First call this session is 'unknown' (just
  // seeds the baseline). Best-effort: any error path resolves to a
  // 'unknown' verdict, never blocks modal rendering.
  let healthVerdict = { verdict: 'unknown', at: 0, reason: null };
  try { healthVerdict = await verifyPushLanded(); } catch {}
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  const rowsHtml = d.rows.length
    ? d.rows.map(r => {
        const pidCell = escapeHTML(r.profileId || '?');
        // Mark a profileId pulled from the payload (column was empty) so
        // a divergence between desktop + phone diagnose tables is legible.
        const pidNote = r.profileIdSource === 'payload' ? ' <span style="color:var(--orange);font-size:10px" title="profileId column empty; recovered from payload">*</span>' : '';
        const fmtCell = r.format === 'gz' ? '<span title="gzip envelope (v1.6.4)" style="color:var(--green)">gz</span>' : 'plain';
        return `<tr><td style="padding:4px 8px;font-family:monospace;font-size:11px">${pidCell}${pidNote}</td><td style="padding:4px 8px;font-family:monospace;font-size:11px;color:var(--text-muted)">${r.syncedAtMs}</td><td style="padding:4px 8px;text-align:right">${r.sun}</td><td style="padding:4px 8px;text-align:right">${r.dev}</td><td style="padding:4px 8px;text-align:right;color:var(--text-muted);font-size:11px">${r.bytes}b</td><td style="padding:4px 8px;text-align:right;font-size:11px">${fmtCell}</td></tr>`;
      }).join('')
    : '<tr><td colspan="6" style="padding:8px;color:var(--text-muted);text-align:center">No rows in local Evolu DB</td></tr>';
  // Stash diagnostics text on the modal node so the Copy button can read
  // the same snapshot the user is staring at (avoids racing a re-fetch).
  const copyText = _evoluDiagnosticsText(d);
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
      ${(() => {
        // Sync health — relays ≥ 1.2.3 surface messageCount + lastWriteToken
        // on /self/owner-storage, letting us verify "did the relay actually
        // persist my push?" without operator help. Three-state verdict:
        //   healthy  → relay advanced; push landed (green dot)
        //   wedged   → relay didn't advance; push silently dropped (red dot)
        //   unknown  → couldn't compare (old relay, offline, first call) — render dim
        const v = healthVerdict?.verdict || 'unknown';
        if (v === 'unknown') {
          // Hide the tile when we genuinely don't know — avoids confusing
          // the user with "Unknown ✓" or similar. The relay-storage tile
          // above already covers the basics. We re-render with a real
          // verdict on the user's next open of this modal.
          return '';
        }
        const isHealthy = v === 'healthy';
        const color = isHealthy ? 'var(--green)' : 'var(--red)';
        const label = isHealthy ? 'Healthy — relay is persisting your pushes.' : 'Wedged — relay accepted the WebSocket round-trip but didn\'t persist anything.';
        const detail = isHealthy
          ? 'Last verified ' + new Date(healthVerdict.at).toISOString().slice(11, 19) + 'Z. Storage state has advanced since the previous check.'
          : (healthVerdict.reason || 'No relay-side advance observed since the previous check.');
        const recovery = isHealthy ? '' : '<div style="color:var(--text-muted);font-size:11px;margin-top:6px">This is the Evolu silent-reject pattern (2026-05-11 production incident). The fix is identity rotation — generate a fresh 24-word mnemonic and restore the other devices to it. See <a href="https://docs.getbased.health/guides/cross-device-sync" target="_blank" style="color:var(--accent)">cross-device sync docs</a>.</div>';
        return `<div style="margin-bottom:12px;padding:10px;border:1px solid var(--border);border-radius:6px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}"></span>
            <b>Relay sync health:</b>
            <span style="color:${color};font-weight:600">${escapeHTML(label)}</span>
          </div>
          <div style="color:var(--text-muted);font-size:11px">${escapeHTML(detail)}</div>
          ${recovery}
        </div>`;
      })()}
      ${(() => {
        const q = getRelayQuotaEstimate();
        if (!q) return '';
        const mb = (q.bytes / (1024 * 1024)).toFixed(2);
        const capMb = (q.cap / (1024 * 1024)).toFixed(0);
        const color = q.level === 'red' ? 'var(--red)' : q.level === 'amber' ? 'var(--orange)' : 'var(--green)';
        const note = q.level === 'red'
          ? 'Storage almost full — pushes will start silently rejecting at the cap. Use Compact storage to drop the older Evolu message log; clients re-establish their state on the next push.'
          : q.level === 'amber'
          ? 'Approaching the per-account storage cap. No action needed yet — keeps trimming on its own as data ages.'
          : 'Healthy.';
        // Real self-serve compact via /self/compact-owner (HMAC-authed
        // with the user's own writeKey — no admin token, no SSH, no
        // round-trip to the maintainer). Always shown so any user can
        // unwedge themselves at the cap, not just operators with relay
        // access. Refresh hits /self/owner-storage to replace the local
        // estimate with the relay's authoritative storedBytes.
        const buttons = `
          <button class="ctx-btn-option" style="font-size:11px" onclick="window.refreshRelayStorage(this)" title="Probe the relay for the actual storedBytes for this owner — replaces the local estimate.">Refresh</button>
          <button class="ctx-btn-option" style="font-size:11px" onclick="window.confirmCompactRelay(this)" title="Drops every Evolu message row for this owner on the relay and resets storedBytes to 0. Devices re-establish their state on the next push.">Compact storage</button>
          <button class="ctx-btn-option" style="font-size:11px" onclick="window.confirmRotateIdentity(this)" title="Generate a fresh 24-word mnemonic for this owner. Use when the relay-health verdict above shows 'wedged' (silent-reject pattern). You'll need to enter the new mnemonic on every other device.">Rotate identity</button>`;
        return `<div style="margin-bottom:12px;padding:10px;border:1px solid var(--border);border-radius:6px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:8px;flex-wrap:wrap">
            <b>Relay storage:</b>
            <div style="display:flex;gap:6px">${buttons}</div>
          </div>
          <div style="margin-bottom:4px"><span style="color:${color};font-weight:600">${mb} / ${capMb} MB · ${q.pct}%</span></div>
          <div style="height:8px;border-radius:4px;background:var(--surface);overflow:hidden;margin-bottom:6px"><div style="height:100%;width:${q.pct}%;background:${color}"></div></div>
          <div style="color:var(--text-muted);font-size:11px">${note}</div>
        </div>`;
      })()}
      ${(() => {
        if (!isDebugMode()) return '';
        const t = d.deltaTelemetry;
        if (!t || t.summary.count === 0) return '';
        const s = t.summary;
        const pct = (s.ratio * 100).toFixed(1);
        const healthy = s.ratio < 0.05;
        const ratioColor = healthy ? 'var(--green)' : 'var(--orange)';
        const recentRows = t.pushes.slice(-6).reverse().map(p => {
          const when = new Date(p.at).toISOString().slice(11, 19) + 'Z';
          const arrs = Object.entries(p.perArray || {})
            .filter(([, v]) => (v.ins + v.upd + v.tom) > 0)
            .map(([k, v]) => `${escapeHTML(k)}(${v.ins}/${v.upd}/${v.tom})`).join(' ');
          return `<tr><td style="padding:3px 6px;font-family:monospace;font-size:11px;color:var(--text-muted)">${when}</td><td style="padding:3px 6px;text-align:right;font-family:monospace;font-size:11px">${p.blobBytes}b</td><td style="padding:3px 6px;text-align:right;font-family:monospace;font-size:11px">${p.totalDeltaBytes}b</td><td style="padding:3px 6px;text-align:right;font-family:monospace;font-size:11px">${p.totalOps}</td><td style="padding:3px 6px;font-family:monospace;font-size:10px;color:var(--text-muted)">${arrs || '—'}</td></tr>`;
        }).join('');
        const pullArrays = Object.keys(t.pull.perArray || {}).sort();
        const pullHtml = pullArrays.length === 0 ? '' :
          `<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">
            <div style="margin-bottom:4px"><b>Pull-side rows (latest merge ${t.pull.mergedAt ? new Date(t.pull.mergedAt).toISOString().slice(11, 19) + 'Z' : '—'}):</b></div>
            <div style="font-family:monospace;font-size:11px">${pullArrays.map(name => {
              const v = t.pull.perArray[name];
              return `${escapeHTML(name)} live=${v.live} tomb=${v.tombstones}`;
            }).join(' · ')}</div>
            <div style="margin-top:4px">Compare across devices — diverging counts mean relay replication isn't propagating per-row state evenly.</div>
          </div>`;
        return `<div style="margin-bottom:12px;padding:10px;border:1px solid var(--border);border-radius:6px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:8px">
            <b>Push efficiency <span style="font-weight:normal;color:var(--text-muted);font-size:11px">(last ${s.count} pushes — lower % = leaner sync)</span></b>
            <button class="ctx-btn-option" style="font-size:11px;flex-shrink:0" onclick="window.confirmResetDeltaTelemetry(this)" title="Clears just the recent-push log shown here. Your data and relay state aren't touched.">Reset</button>
          </div>
          <div style="margin-bottom:4px">
            <span style="color:${ratioColor};font-weight:600">${pct}%</span>
            <span style="color:var(--text-muted);font-size:11px"> · ${s.totalBlobBytes}b full · ${s.totalDeltaBytes}b deltas · ${s.totalOps} row ops</span>
          </div>
          <div style="color:var(--text-muted);font-size:11px;margin-bottom:8px">${healthy ? 'Looking good — sync is mostly riding the lightweight per-row path.' : 'Still hefty — most state is going as a full blob. Will trim down as more changes flow through.'}</div>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead><tr style="border-bottom:1px solid var(--border);text-align:left"><th style="padding:3px 6px">when</th><th style="padding:3px 6px;text-align:right">blob</th><th style="padding:3px 6px;text-align:right">delta</th><th style="padding:3px 6px;text-align:right">ops</th><th style="padding:3px 6px">arrays(ins/upd/tom)</th></tr></thead>
            <tbody>${recentRows}</tbody>
          </table>
          ${pullHtml}
        </div>`;
      })()}
      ${(() => {
        if (!isDebugMode()) return '';
        const r = d.cutoverReadiness;
        if (!r) return '';
        const blockers = Object.entries(r.surfaces).filter(([, v]) => v.status === 'missing-rows');
        const okCount = Object.values(r.surfaces).filter(v => v.status === 'ok').length;
        const noDataCount = Object.values(r.surfaces).filter(v => v.status === 'no-data').length;
        const headerColor = r.ready ? 'var(--green)' : 'var(--orange)';
        const headerLabel = r.ready ? 'Ready ✓' : `${r.blockerCount} item${r.blockerCount === 1 ? '' : 's'} pending`;
        const blockerHtml = blockers.length === 0 ? '' : `
          <div style="margin-top:6px;padding:8px;background:var(--surface);border-left:3px solid var(--orange);border-radius:4px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
              <div style="color:var(--orange);font-weight:600;font-size:12px">These bits of data haven't been re-pushed yet:</div>
              <button class="ctx-btn-option" style="font-size:11px" onclick="window.confirmBackfillBlockers(this)" title="Forces a fresh push so each pending item ships as new. Safe — no data loss.">Push now</button>
            </div>
            <table style="width:100%;font-size:11px">
              ${blockers.map(([name, v]) => `<tr><td style="font-family:monospace;padding:2px 6px">${escapeHTML(name)}</td><td style="padding:2px 6px;color:var(--text-muted)">${v.shape}</td><td style="padding:2px 6px;text-align:right">local=${v.localCount} rows=${v.rowCount}</td></tr>`).join('')}
            </table>
            <div style="color:var(--text-muted);font-size:10px;margin-top:4px">Tap <b>Push now</b> to take care of all of them at once.</div>
          </div>`;
        const cutoverEnabled = isPhase2CutoverEnabled(state.currentProfile);
        // Cutover toggle: disabled when not READY (prevents accidental flip
        // before the per-row datapath is proven). When already enabled, the
        // button reads "Disable Phase 2" as an escape hatch — the user can
        // always revert to dual-write.
        const buttonHtml = cutoverEnabled
          ? `<button class="ctx-btn-option" style="font-size:11px;color:var(--orange);border-color:var(--orange)" onclick="window.confirmDisablePhase2(this)" title="Switches back to full-blob sync. Use this if a peer device shows missing data.">Disable</button>`
          : (r.ready
            ? `<button class="ctx-btn-option" style="font-size:11px;color:var(--green);border-color:var(--green)" onclick="window.confirmEnablePhase2(this)" title="Switch this device to lean sync (per-row deltas only). Reversible.">Enable</button>`
            : `<button class="ctx-btn-option" style="font-size:11px;opacity:0.5;cursor:not-allowed" disabled title="Push the pending items below first.">Enable</button>`);
        const cutoverBadge = cutoverEnabled
          ? `<span style="color:var(--green);font-size:10px;font-weight:600;padding:2px 6px;border:1px solid var(--green);border-radius:3px;margin-left:6px">ON</span>`
          : '';
        return `<div style="margin-bottom:12px;padding:10px;border:1px solid var(--border);border-radius:6px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:8px">
            <div><b>Lean sync mode</b>${cutoverBadge}<div style="font-weight:normal;color:var(--text-muted);font-size:11px;margin-top:2px">drops the full-blob backup once everything is reliably moving as per-row deltas — saves bandwidth + relay storage</div></div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <span style="color:${headerColor};font-weight:600">${headerLabel}</span>
              ${buttonHtml}
            </div>
          </div>
          <div style="color:var(--text-muted);font-size:11px">${okCount} of ${r.surfaceCount} synced · ${noDataCount} empty${blockers.length > 0 ? ` · ${blockers.length} pending` : ''}</div>
          <div style="color:var(--text-muted);font-size:11px;margin-top:4px">Wait for <b>Ready</b> on both devices and let the efficiency above settle below ~5% before flipping. Reversible per device any time.</div>
          ${blockerHtml}
        </div>`;
      })()}
      <div>
        <b>Rows in this device's local Evolu DB:</b>
        <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:12px">
          <thead><tr style="border-bottom:1px solid var(--border);text-align:left"><th style="padding:4px 8px">profileId</th><th style="padding:4px 8px">syncedAt(ms)</th><th style="padding:4px 8px;text-align:right">sun</th><th style="padding:4px 8px;text-align:right">dev</th><th style="padding:4px 8px;text-align:right">size</th><th style="padding:4px 8px;text-align:right">fmt</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div style="color:var(--text-muted);font-size:11px;margin-top:6px">Compare this table on phone vs desktop. Same profileId, same syncedAt(ms), same sun/dev counts → both devices already have the same data and the issue is rendering. Different counts → relay-replication isn't propagating between Evolu instances. <b>fmt</b> column: <span style="color:var(--green)">gz</span> = v1.6.4 gzip envelope, plain = pre-v1.6.4. <span style="color:var(--orange)">*</span> next to a profileId means it was recovered from the payload because the column was empty.</div>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
        <button class="ctx-btn-option" onclick="window.copySyncDiagnose(this)" title="Copy this snapshot to the clipboard so you can paste it elsewhere">Copy</button>
        <button class="ctx-btn-option" onclick="this.closest('.modal-overlay').remove()">Close</button>
      </div>
    </div>
  </div>`;
  overlay.dataset.copyText = copyText;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// Copies the Sync diagnose snapshot to the clipboard. Walks up to find
// the overlay so we read the same `data-copy-text` blob the modal was
// rendered from (no stale-snapshot races when sync ticks during read).
async function copySyncDiagnose(btn) {
  const overlay = btn?.closest?.('.modal-overlay');
  const text = overlay?.dataset?.copyText || '';
  if (!text) {
    try { showNotification('Nothing to copy', 'error'); } catch {}
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for browsers without async clipboard permission
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const original = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch (e) {
    try { showNotification(`Copy failed: ${e?.message || e}`, 'error'); } catch {}
  }
}

// "Compact storage" — calls POST /self/compact-owner on the relay,
// HMAC-signed with the user's own writeKey. Drops every Evolu message
// row for this owner and zeroes storedBytes; devices re-establish their
// state on the next push. Replaces the old "I just compacted" runbook
// flow that required SSH access and a manual local-counter reset.
async function confirmCompactRelay(btn) {
  const q = getRelayQuotaEstimate();
  const mb = q ? (q.bytes / 1024 / 1024).toFixed(1) : '?';
  const message = `Compact this owner's storage on the relay (currently ~${mb} MB)? Drops the Evolu message log; every device re-establishes its CRDT state on the next push (a few seconds). Your local data is untouched.`;
  // Helper unavailable (utils.js failed to load) → proceed without
  // confirmation rather than dead-end the user. Safety net mirrors the
  // pattern in the four sibling confirm* helpers below.
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Compacting…'; }
  try {
    const result = await compactOwnerSelfServe();
    const after = typeof result?.afterStoredBytes === 'number'
      ? `${(result.afterStoredBytes / (1024 * 1024)).toFixed(2)} MB`
      : '0 MB';
    showNotification(`Relay storage compacted · ${result?.deletedMessages ?? '?'} rows dropped · ${after}`, 'success');
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) overlay.remove();
    }
    if (document.getElementById('sync-popover')) {
      toggleSyncDetail(); toggleSyncDetail();
    }
  } catch (e) {
    showNotification(`Compact failed: ${e?.message || e}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Compact storage'; }
  }
}

// "Refresh" — probe /self/owner-storage for the relay's authoritative
// storedBytes for this owner. Mirrors into the local cache so the
// indicator is accurate, not an estimate. Useful after the maintainer
// or another device has compacted.
async function refreshRelayStorage(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Refreshing…'; }
  try {
    const result = await fetchOwnerStorageFromRelay();
    if (!result) {
      showNotification('Could not reach relay storage probe (older relay or offline?)', 'error');
      return;
    }
    showNotification(`Relay reports ${(result.storedBytes / (1024 * 1024)).toFixed(2)} MB`, 'success');
    if (document.getElementById('sync-popover')) {
      toggleSyncDetail(); toggleSyncDetail();
    }
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) {
        // Re-render the modal in place — close and reopen via the same
        // entrypoint so all sections (including the now-fresh quota
        // tile) re-derive from the updated cache.
        overlay.remove();
        if (typeof window.showSyncDiagnose === 'function') window.showSyncDiagnose();
      }
    }
  } catch (e) {
    showNotification(`Refresh failed: ${e?.message || e}`, 'error');
  } finally {
    if (btn && !btn.closest?.('.modal-overlay')?.parentElement) return;
    if (btn) { btn.disabled = false; btn.textContent = 'Refresh'; }
  }
}

// "Rotate identity" — generate a fresh 24-word BIP-39 mnemonic, show
// it (with QR for cross-device entry), confirm the user saved it, then
// apply locally via restoreFromMnemonic. The new ownerId is fresh on
// the relay (no ghost state from any prior Evolu silent-reject), so
// pushes start landing immediately. The other devices need to enter
// the same mnemonic to converge.
//
// This is the user-facing fix for the silent-reject pattern surfaced
// by the diagnose modal's red dot — closes the loop from detection
// (relay-health verdict) to recovery (one-click rotation). Without
// this, the only path was the manual `enableSync({skipPush:true}) →
// restoreFromMnemonic` dance from the 2026-05-11 incident.
async function confirmRotateIdentity(btn) {
  // Stage 1: warning dialog. Make sure the user understands the
  // implications BEFORE we generate a fresh mnemonic (which is what
  // makes this destructive — the old identity is recoverable until
  // we apply the new one, but most users won't think to save it).
  const warning =
    "Rotate sync identity — generate a fresh 24-word mnemonic for this device and apply it.\n\n" +
    "• You'll need to enter the new mnemonic on every OTHER device that should keep syncing with this one.\n" +
    "• The old identity's data stays on the relay until it ages out (no immediate loss), but new pushes will go under the new identity.\n" +
    "• This is the recovery path for a wedged owner (red dot above) — see the 2026-05-11 silent-reject bug.\n\n" +
    "Proceed?";
  // utils.js helper missing → proceed without confirmation. Mirrors the
  // pattern in the sibling confirm* helpers (see confirmCompactRelay)
  // so a utils-load failure doesn't dead-end the user. Native
  // confirm()/prompt()/alert() are banned by the no-native-dialogs test.
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(warning)
    : true;
  if (!proceed) return;

  // Stage 2: generate the new mnemonic. BIP-39 256 bits = 24 words.
  const bip39 = await ensureBip39().catch(() => null);
  if (!bip39 || typeof bip39.generateMnemonic !== 'function') {
    showNotification('BIP-39 library not loaded — cannot rotate identity', 'error');
    return;
  }
  let mnemonic;
  try {
    mnemonic = await bip39.generateMnemonic(256);
  } catch (e) {
    showNotification(`Mnemonic generation failed: ${e?.message || e}`, 'error');
    return;
  }
  if (typeof mnemonic !== 'string' || mnemonic.split(/\s+/).filter(Boolean).length !== 24) {
    showNotification('Generated mnemonic is malformed (expected 24 words)', 'error');
    return;
  }

  // Stage 3: present to the user. Show in a dedicated modal with QR for
  // phone-side entry, copy button, and a save-confirmation checkbox
  // that gates the Apply button. We do NOT auto-apply — the user has
  // to consciously confirm they saved it. Losing this mnemonic means
  // losing the new sync identity entirely (no recovery path).
  // Defensive: close any existing diagnose modal so its z-index / focus
  // trap doesn't fight us.
  const existing = btn?.closest?.('.modal-overlay');
  if (existing) existing.remove();

  let qrSvg = '';
  try {
    const makeQr = await ensureQRCode();
    const qr = makeQr(0, 'L');
    qr.addData(mnemonic);
    qr.make();
    qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  } catch (e) {
    // Non-fatal; the user can still copy-paste.
    qrSvg = '';
  }

  // The 24 words rendered as a grid with positional numbers so users
  // can sanity-check across devices ("word 13 is 'magic'") without
  // having to mentally count.
  const words = mnemonic.split(/\s+/).filter(Boolean);
  const wordsHtml = words
    .map((w, i) => `<span style="display:inline-flex;align-items:baseline;gap:4px;padding:2px 6px;background:var(--surface);border-radius:4px;font-family:monospace;font-size:12px"><span style="color:var(--text-muted);font-size:10px">${i + 1}.</span>${escapeHTML(w)}</span>`)
    .join(' ');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Rotate sync identity" style="max-width:560px">
    <div class="modal-header"><h3>Rotate sync identity — save your new mnemonic</h3><button class="modal-close" aria-label="Close">×</button></div>
    <div class="modal-body" style="font-size:13px">
      <div style="margin-bottom:12px;padding:8px;border:1px solid var(--red);border-radius:6px;background:rgba(255,80,80,0.08)">
        <div style="font-weight:600;margin-bottom:4px">⚠ Save this BEFORE you click Apply</div>
        <div style="font-size:12px;color:var(--text-muted)">Losing this 24-word mnemonic means losing your new cross-device sync identity — there is no recovery path. Save it in a password manager AND enter it on every device that should keep syncing.</div>
      </div>
      <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:12px">
        ${qrSvg ? `<div style="flex-shrink:0;background:#fff;padding:8px;border-radius:8px;width:180px;height:180px">${qrSvg}</div>` : ''}
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">${qrSvg ? 'Scan from another device, or copy the words below.' : 'Copy the words below — QR code unavailable on this build.'}</div>
          <div id="rotate-words" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${wordsHtml}</div>
          <button class="import-btn import-btn-secondary" id="rotate-copy-btn" style="font-size:11px">Copy mnemonic</button>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;cursor:pointer;font-size:12px">
        <input type="checkbox" id="rotate-saved-check"/>
        <span>I've saved this mnemonic in a safe place (password manager or written down).</span>
      </label>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="import-btn import-btn-secondary" id="rotate-cancel-btn">Cancel</button>
        <button class="import-btn import-btn-primary" id="rotate-apply-btn" disabled>Apply on this device</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  // Wire up: close handlers, copy, gate Apply on checkbox, then Apply.
  const closeBtn = overlay.querySelector('.modal-close');
  const cancelBtn = overlay.querySelector('#rotate-cancel-btn');
  const copyBtn = overlay.querySelector('#rotate-copy-btn');
  const check = overlay.querySelector('#rotate-saved-check');
  const applyBtn = overlay.querySelector('#rotate-apply-btn');
  const cleanup = () => {
    // Zero out the in-memory mnemonic — both the string AND the words
    // array, since the array is what the copy/apply handlers actually
    // hold via closure. Missing the array was a Greptile finding: the
    // string wipe alone left the seed live on the JS heap as long as
    // the modal's handlers stayed in scope. Mutate-in-place (fill +
    // length=0) so any closure that already captured the array sees
    // the zeroed-out version too, not a stale snapshot.
    mnemonic = null;
    if (Array.isArray(words)) {
      words.fill('');
      words.length = 0;
    }
    overlay.remove();
  };
  closeBtn?.addEventListener('click', cleanup);
  cancelBtn?.addEventListener('click', cleanup);
  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(words.join(' '));
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => { if (copyBtn) copyBtn.textContent = 'Copy mnemonic'; }, 1500);
    } catch {
      showNotification('Copy failed — select the words manually', 'error');
    }
  });
  check?.addEventListener('change', () => {
    if (applyBtn) applyBtn.disabled = !check.checked;
  });
  applyBtn?.addEventListener('click', async () => {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Applying…';
    try {
      // Ensure sync is enabled so Evolu exists before we restore. The
      // skipPush flag matters: enableSync would otherwise push the
      // current local state under a freshly-generated (wrong) mnemonic
      // before restoreFromMnemonic swaps the owner. skipPush=true
      // lets restoreFromMnemonic be the first push after the swap,
      // under the right identity.
      if (!isSyncEnabled()) {
        await enableSync({ skipPush: true });
      }
      const ok = await restoreFromMnemonic(words.join(' '));
      if (!ok) {
        showNotification('Restore returned false — generated mnemonic was rejected', 'error');
        applyBtn.disabled = false;
        applyBtn.textContent = 'Apply on this device';
        return;
      }
      // restoreFromMnemonic schedules window.location.reload() on
      // success — the cleanup happens implicitly when the page unloads.
      // No need to call cleanup() here.
    } catch (e) {
      showNotification(`Apply failed: ${e?.message || e}`, 'error');
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply on this device';
    }
  });
}

// "Reset window" — drops the rolling per-push telemetry log so the user
// can start a fresh measurement window (e.g. after a backfill push that
// would skew the ratio for days). Confirms via the same dialog helper
// as the relay-quota reset.
async function confirmResetDeltaTelemetry(btn) {
  const t = state.currentProfile ? getDeltaTelemetry(state.currentProfile) : null;
  const n = t?.summary?.count || 0;
  const message = `Reset the push-efficiency log? Drops the ${n} recent push entries used to compute the percentage. Your data and relay state aren't touched.`;
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  if (state.currentProfile && resetDeltaTelemetry(state.currentProfile)) {
    try { showNotification('Telemetry window reset', 'success'); } catch {}
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) overlay.remove();
    }
  } else {
    try { showNotification('Could not reset telemetry (no active profile?)', 'error'); } catch {}
  }
}

// "Enable Phase 2" — flips the fat-blob off for this profile on this
// device. Gated behind getDeltaCutoverReadiness READY (the diagnose UI
// already disables the button when not ready, but we re-check here as
// defence-in-depth in case the modal HTML was tampered with). Uses
// showConfirmDialog because this is a meaningful behaviour change with
// a (deliberate) impact on what other devices see when pulling.
async function confirmEnablePhase2(btn) {
  if (!state.currentProfile) return;
  const r = getDeltaCutoverReadiness(state.currentProfile);
  if (!r?.ready) {
    try { showNotification('Phase 2 not ready — resolve blockers first', 'error'); } catch {}
    return;
  }
  const message = `Switch this device to lean sync mode?\n\nFrom now on, this device will only push per-row deltas instead of the full data blob. Other devices keep working normally.\n\nReversible any time via Disable.`;
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  const result = enablePhase2Cutover(state.currentProfile);
  if (result.ok) {
    try { showNotification('Phase 2 enabled — next push will use per-row only', 'success'); } catch {}
    _logSyncEvent('cutover', `Phase 2 enabled for ${state.currentProfile.slice(0, 8)}`);
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) overlay.remove();
    }
  } else {
    try { showNotification(`Could not enable Phase 2 (${result.reason})`, 'error'); } catch {}
  }
}

// "Backfill blockers" — wipes the per-array snapshot for every surface
// flagged 'missing-rows' so the next push emits inserts for every local
// item from scratch (instead of diffing against a snapshot that thinks
// they were already shipped — the usual reason rowCount is stuck at 0
// despite localCount > 0). Then forces a push.
async function confirmBackfillBlockers(btn) {
  if (!state.currentProfile) return;
  const profileId = state.currentProfile;
  const r = getDeltaCutoverReadiness(profileId);
  const blockers = Object.entries(r?.surfaces || {}).filter(([, v]) => v.status === 'missing-rows').map(([n]) => n);
  if (blockers.length === 0) {
    try { showNotification('No blockers to backfill', 'success'); } catch {}
    return;
  }
  const message = `Force a push for ${blockers.length} item${blockers.length === 1 ? '' : 's'} that haven't synced as deltas yet?\n\n${blockers.join(', ')}\n\nSafe — this just re-sends data that should already be on the relay.`;
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  let cleared = 0;
  for (const name of blockers) {
    try {
      localStorage.removeItem(_deltaSnapshotKey(profileId, name));
      localStorage.removeItem(`${_deltaSnapshotKey(profileId, name)}-meta`);
      cleared++;
    } catch {}
  }
  try { await pushProfile(profileId, state.importedData, { force: true }); } catch (e) {
    try { showNotification(`Backfill push failed: ${e?.message || e}`, 'error'); } catch {}
    return;
  }
  try { showNotification(`Backfilled ${cleared} surface${cleared === 1 ? '' : 's'} — re-open Diagnose to verify`, 'success'); } catch {}
  _logSyncEvent('backfill', `Backfilled ${cleared} surface(s) for ${profileId.slice(0, 8)}: ${blockers.join(',')}`);
  if (btn) {
    const overlay = btn.closest?.('.modal-overlay');
    if (overlay) overlay.remove();
  }
}

async function confirmDisablePhase2(btn) {
  if (!state.currentProfile) return;
  const message = `Switch this device back to full-blob sync?\n\nPushes will include the full data blob again as a safety net. Use this if a peer device is missing data after going lean.\n\nNo data loss either way.`;
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  if (disablePhase2Cutover(state.currentProfile)) {
    try { showNotification('Phase 2 disabled — back to dual-write', 'success'); } catch {}
    _logSyncEvent('cutover', `Phase 2 disabled for ${state.currentProfile.slice(0, 8)}`);
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) overlay.remove();
    }
  } else {
    try { showNotification('Could not disable Phase 2', 'error'); } catch {}
  }
}

// Toast users when they cross the 80% / 95% threshold the first time.
// Uses a single-key marker so we don't re-fire on every push at the same
// threshold; resets when the counter is reset (i.e. after compaction).
// v1.7.14 audit fix: marker key is now owner-scoped — without this, a
// `restoreFromMnemonic` to a different owner inherited the previous
// owner's amber/red marker and silently suppressed the first warning
// for the new owner. The legacy global key 'labcharts-relay-quota-warned'
// is also cleaned up by disableSync/restoreFromMnemonic so pre-v1.7.14
// state doesn't linger.
function _maybeWarnQuotaThreshold() {
  try {
    const q = getRelayQuotaEstimate();
    if (!q || q.level === 'green') return;
    const owner = _appOwner?.id ? String(_appOwner.id) : 'unknown';
    const key = `labcharts-${owner}-relay-quota-warned`;
    const prev = localStorage.getItem(key) || '';
    const want = q.level; // 'amber' or 'red'
    // Only escalate (green→amber, amber→red), never re-fire same level.
    const order = { '': 0, green: 0, amber: 1, red: 2 };
    if (order[want] <= order[prev]) return;
    localStorage.setItem(key, want);
    if (q.level === 'red') {
      _logSyncEvent('skip', `Relay storage ${q.pct}% — pushes will start failing soon, compact!`);
      try { showNotification(`Relay storage ${q.pct}% full — compact soon or pushes will start failing silently. See Settings → Sync → Diagnose.`, 'error'); } catch {}
    } else {
      try { showNotification(`Relay storage ${q.pct}% — plan a compaction in the next few days. See Sync diagnose.`, 'warning'); } catch {}
    }
  } catch {}
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
  copySyncDiagnose,
  confirmCompactRelay,
  confirmRotateIdentity,
  refreshRelayStorage,
  fetchOwnerStorageFromRelay,
  verifyPushLanded,
  getRelayHealthVerdict,
  compactOwnerSelfServe,
  getRelayQuotaEstimate,
  resetRelayQuotaEstimate,
  getDeltaTelemetry,
  resetDeltaTelemetry,
  confirmResetDeltaTelemetry,
  getDeltaCutoverReadiness,
  isPhase2CutoverEnabled,
  enablePhase2Cutover,
  disablePhase2Cutover,
  confirmEnablePhase2,
  confirmDisablePhase2,
  confirmBackfillBlockers,
});
