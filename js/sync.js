// sync.js — Evolu sync layer (opt-in, E2E encrypted)
// Stores importedData + profile metadata per profile as a JSON blob.
// Last-write-wins at the profile level — fine for single-user cross-device sync.

import { state } from './state.js';
import { showNotification, isDebugMode, escapeHTML } from './utils.js';
import { profileStorageKey, getProfiles, saveProfiles, migrateProfileData } from './profile.js';
import { getEncryptionEnabled, encryptedSetItem, encryptedGetItem } from './crypto.js';
import { mergeImportedData, localHasRowsRemoteLacks, getAt } from './data-merge.js';
import {
  buildSyncPayload, collectAISettings,
  disablePhase2CutoverFlag, enablePhase2CutoverFlag, isPhase2CutoverEnabled,
  parseSyncPayload,
} from './sync-payload.js';
import {
  compactOwnerSelfServe, configureRelayHealth, fetchOwnerStorageFromRelay,
  getRelayHealthVerdict, getRelayQuotaEstimate, notePushCommitted,
  resetRelayQuotaEstimate, trackPushBytes, verifyPushLanded,
} from './sync-relay-health.js';
import {
  consumeRebroadcastBudget, getRecentSyncEvents,
  getSyncDisplayState as getSyncDisplayStateFromStatus, getSyncStatus,
  logSyncEvent, resetSyncStatus, subscribeSyncStatus, updateSyncStatus,
} from './sync-state.js';
import {
  applyAISettings, applyChatData, applyDisplayPrefs,
  getChatDataLocalLockRemainingMs, markChatDataLocal,
} from './sync-apply.js';
import {
  DELTA_ARRAYS, DELTA_MAPS, DELTA_SCALARS,
  _applyArrayDelta, _mergeItemRowsIntoImported, _planArrayDelta,
  _planKeyedMapDelta, _planScalarDelta, _recordPushTelemetry,
  _writeDeltaSnapshot, configureSyncDelta, getDeltaCutoverReadiness,
  getDeltaTelemetry, resetDeltaTelemetry,
} from './sync-delta.js';
import {
  applyPendingTombstone, applyRemoteTombstones, configureSyncTombstones,
  deleteProfileFromRelay, listPendingTombstones, rejectPendingTombstone,
} from './sync-tombstones.js';
import {
  configureSyncMessenger, generateMessengerToken, getMessengerToken,
  isMessengerEnabled, pushContextToGateway, revokeMessengerToken,
} from './sync-messenger.js';
import {
  checkRelayConnection, getSyncBlocker, getSyncRelay, setSyncRelay,
} from './sync-environment.js';
import {
  configureSyncIdentity, ensureBip39, ensureQRCode, getMnemonic,
  getMnemonicResolutionError, restoreFromMnemonic,
} from './sync-identity.js';

export {
  compactOwnerSelfServe, fetchOwnerStorageFromRelay, getRelayHealthVerdict,
  getRelayQuotaEstimate, resetRelayQuotaEstimate, verifyPushLanded,
  getRecentSyncEvents, subscribeSyncStatus,
  applyPendingTombstone, deleteProfileFromRelay, listPendingTombstones,
  rejectPendingTombstone,
  generateMessengerToken, getMessengerToken, isMessengerEnabled,
  pushContextToGateway, revokeMessengerToken,
  checkRelayConnection, getSyncBlocker, getSyncRelay, setSyncRelay,
  getMnemonic, getMnemonicResolutionError, restoreFromMnemonic,
};

function dbg(...args) { if (isDebugMode()) console.log('[sync]', ...args); }

configureRelayHealth({
  getAppOwner: () => _appOwner,
  getSyncRelay,
  onQuotaThreshold(q) {
    if (q.level === 'red') {
      logSyncEvent('skip', `Relay storage ${q.pct}% — pushes will start failing soon, compact!`);
      try { showNotification(`Relay storage ${q.pct}% full — compact soon or pushes will start failing silently. See Settings → Sync → Diagnose.`, 'error'); } catch {}
    } else {
      try { showNotification(`Relay storage ${q.pct}% — plan a compaction in the next few days. See Sync diagnose.`, 'warning'); } catch {}
    }
  },
});

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
    const liveRows = (evolu && profileQuery) ? evolu.getQueryRows(profileQuery) : [];
    const tombstoneRows = (evolu && tombstoneQuery) ? evolu.getQueryRows(tombstoneQuery) : [];
    const rows = [
      ...(liveRows || []).map(r => ({ ...r, isDeleted: false })),
      ...(tombstoneRows || []).map(r => ({ ...r, isDeleted: true })),
    ];
    for (const row of rows) {
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
        logSyncEvent('skip', `Diagnose row ${String(row.id || '?').slice(0, 8)} parse failed: ${String(e?.message || e).slice(0, 80)}`);
      }
      out.rows.push({
        profileId: row.profileId || payloadProfileId,
        profileIdSource: row.profileId ? 'column' : (payloadProfileId ? 'payload' : 'missing'),
        syncedAt: row.syncedAt,
        syncedAtMs: row.syncedAt ? new Date(row.syncedAt).getTime() : 0,
        sun, dev, format,
        isDeleted: !!row.isDeleted,
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
    lines.push('  profileId         del  syncedAtMs       sun  dev  size       fmt   src');
    for (const r of d.rows) {
      const pid = String(r.profileId || '?').padEnd(17);
      const del = r.isDeleted ? 'yes' : 'no ';
      const ts = String(r.syncedAtMs).padEnd(16);
      const sun = String(r.sun).padStart(3);
      const dev = String(r.dev).padStart(3);
      const size = String(r.bytes + 'b').padStart(9);
      const fmt = String(r.format || '?').padEnd(5);
      const src = String(r.profileIdSource || '?');
      lines.push(`  ${pid} ${del}  ${ts} ${sun}  ${dev}  ${size}  ${fmt} ${src}`);
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
const _chatPullRetryTimers = new Map();
let _aiSettingsPushTimer = null;
let _pollInterval = null;
let _lastPollRowCount = -1;
let _lastPollTombstoneCount = -1;
let _subscriptionFireCount = 0;
let _relayProbeInterval = null;

configureSyncDelta({
  getEvolu: () => evolu,
  getItemRowQuery: () => itemRowQuery,
});

configureSyncTombstones({
  getEvolu: () => evolu,
  getProfileQuery: () => profileQuery,
  getTombstoneQuery: () => tombstoneQuery,
  isSyncEnabled: () => _syncEnabled,
  pushProfile,
  debug: dbg,
});

configureSyncMessenger({
  getSyncRelay,
  debug: dbg,
});

configureSyncIdentity({
  getAppOwner: () => _appOwner,
  getAppOwnerError: () => _appOwnerError,
  getEvolu: () => evolu,
});

function getSyncDisplayState() {
  return getSyncDisplayStateFromStatus(_syncEnabled);
}

// ═══════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════

const SYNC_STORAGE_KEY = 'labcharts-sync-enabled';

export function primeSyncState() {
  if (!_syncStatePrimed) {
    _syncEnabled = localStorage.getItem(SYNC_STORAGE_KEY) === 'true';
    _syncStatePrimed = true;
  }
  return _syncEnabled;
}

export function isSyncEnabled() { return _syncStatePrimed ? _syncEnabled : primeSyncState(); }

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════

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
    // Tombstone rows live outside profileQuery's "isDeleted is not 1"
    // filter. Evolu refreshes subscribed queries after remote mutations,
    // so this subscription is required for device B to see device A's
    // profile-delete tombstone without waiting for a full reload.
    evolu.subscribeQuery(tombstoneQuery)(() => {
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
      if (!evolu || !profileQuery || !tombstoneQuery || _syncing || _pulling) return;
      const rows = evolu.getQueryRows(profileQuery);
      const tombstones = evolu.getQueryRows(tombstoneQuery);
      const count = rows?.length ?? 0;
      const tombstoneCount = tombstones?.length ?? 0;
      if (count !== _lastPollRowCount || tombstoneCount !== _lastPollTombstoneCount) {
        dbg(`poll: row/tombstone count changed ${_lastPollRowCount}/${_lastPollTombstoneCount} -> ${count}/${tombstoneCount}, triggering onSyncReceived`);
        _lastPollRowCount = count;
        _lastPollTombstoneCount = tombstoneCount;
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
  let localAiSettingsDiffer = false;
  try {
    const parsed = await parseSyncPayload(existing.dataJson);
    remoteImported = parsed?.importedData || null;
    const remoteAiSettings = parsed?.aiSettings || {};
    const localAiSettings = await collectAISettings();
    localAiSettingsDiffer = Object.entries(localAiSettings)
      .some(([key, val]) => remoteAiSettings?.[key] !== val);
  } catch {
    // Malformed row → reconciliation can't reason about it. The user can
    // still recover via the Force Resend button.
    return;
  }
  if (!remoteImported && !localAiSettingsDiffer) return;

  // Reuse the rebroadcast helper — same semantic ("local has anything remote
  // doesn't reflect"), same id-keyed array list, same pickTimestamp tiebreak.
  // Returns true on (a) new local ids, (b) same-id with lTs>rTs, (c) tombstones
  // local has remote lacks. Without (b) the start-then-stop-then-close sequence
  // strands the stop on the phone forever — relay row keeps endedAt=null and
  // every other device shows the session as still running.
  const localHasUnsynced = remoteImported ? localHasRowsRemoteLacks(state.importedData, remoteImported) : false;
  if (!localHasUnsynced && !localAiSettingsDiffer) {
    dbg('Startup reconciliation: localStorage, AI settings, and Evolu row match — nothing to do');
    return;
  }
  const reason = localHasUnsynced ? 'unsynced rows' : 'newer local AI settings';
  dbg(`Startup reconciliation: localStorage has ${reason} vs Evolu row`);
  logSyncEvent('reconcile', `Reconcile ${state.currentProfile.slice(0, 8)} — local has ${reason}`);
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
  for (const t of _chatPullRetryTimers.values()) clearTimeout(t);
  _chatPullRetryTimers.clear();
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
  resetSyncStatus();
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

export { isPhase2CutoverEnabled };

// Gated setter — refuses to enable cutover when readiness check finds
// blockers. Returns { ok, reason, blockerCount } so the UI can render
// a useful error. Disable is always allowed (escape hatch).
export function enablePhase2Cutover(profileId) {
  if (!profileId) return { ok: false, reason: 'no-profile' };
  const r = getDeltaCutoverReadiness(profileId);
  if (!r || !r.ready) {
    return { ok: false, reason: 'not-ready', blockerCount: r?.blockerCount || -1 };
  }
  if (enablePhase2CutoverFlag(profileId)) return { ok: true };
  return { ok: false, reason: 'storage' };
}
export function disablePhase2Cutover(profileId) {
  return disablePhase2CutoverFlag(profileId);
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
        logSyncEvent('skip', `Cutover drift: ${driftCheck.blockerCount} surface(s) missing per-row history — auto-reverted to dual-write (${blockerNames || 'unknown'})`);
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
    logSyncEvent('queue', queueMsg);

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
      logSyncEvent('push', okMsg);
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
      trackPushBytes((dataJson || '').length);
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
        logSyncEvent('skip', `Push stuck >30s — try reloading`);
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

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('labcharts-ai-settings-local-changed', () => {
    if (!_syncEnabled || !state.currentProfile || !state.importedData) return;
    if (_aiSettingsPushTimer) clearTimeout(_aiSettingsPushTimer);
    const profileId = state.currentProfile;
    const importedData = state.importedData;
    _aiSettingsPushTimer = setTimeout(() => {
      _aiSettingsPushTimer = null;
      pushProfile(profileId, importedData).catch(() => {});
    }, 250);
  });
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
  logSyncEvent('cleanup', msg);
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
  logSyncEvent('forced', `Force resend ${state.currentProfile?.slice(0,8) || '?'}`);
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

function scheduleChatPullRetry(profileId, delayMs) {
  if (!profileId || delayMs <= 0) return;
  const prev = _chatPullRetryTimers.get(profileId);
  if (prev) clearTimeout(prev);
  const waitMs = Math.min(Math.max(delayMs + 250, 1000), 120000);
  const timer = setTimeout(() => {
    _chatPullRetryTimers.delete(profileId);
    if (!evolu || !profileQuery) return;
    if (_syncing || _pulling) {
      scheduleChatPullRetry(profileId, 1000);
      return;
    }
    dbg(`Retrying chat pull for ${profileId.slice(0, 8)} after local freshness lock`);
    onSyncReceived();
  }, waitMs);
  _chatPullRetryTimers.set(profileId, timer);
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
          logSyncEvent('skip', `Pull ${profileId.slice(0, 8)} — malformed importedData shape, skipping row`);
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
        logSyncEvent('pull', mergeMsg);
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
        const chatApplied = chatData ? await applyChatData(profileId, chatData) : false;
        if (chatData && !chatApplied) {
          scheduleChatPullRetry(profileId, getChatDataLocalLockRemainingMs(profileId));
        }
        if (displayPrefs) applyDisplayPrefs(profileId, displayPrefs);

        // If this is the active profile, update in-memory state
        if (profileId === state.currentProfile) {
          state.importedData = merged;
          migrateProfileData(state.importedData);
          // Reload chat threads + active thread messages into memory and re-render
          if (chatApplied) {
            window.loadChatThreads?.();
            window.ensureActiveThread?.();
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
          if (getSyncStatus().push === 'pending') {
            dbg(`Row ${profileId.slice(0,8)}: rebroadcast deferred — push already pending`);
            logSyncEvent('skip', `Rebroadcast deferred — push pending`);
          } else if (!consumeRebroadcastBudget(profileId)) {
            dbg(`Row ${profileId.slice(0,8)}: rebroadcast suppressed — budget exhausted in last 5min (clock skew?)`);
            logSyncEvent('skip', `Rebroadcast budget exhausted — possible clock skew`);
          } else {
            dbg(`Row ${profileId.slice(0,8)}: rebroadcast — local had unsynced rows`);
            logSyncEvent('rebroadcast', `Rebroadcast ${profileId.slice(0,8)}`);
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
  markChatDataLocal();
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
  const s = getSyncStatus();
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
        const delCell = r.isDeleted ? '<span style="color:var(--orange);font-weight:600">yes</span>' : 'no';
        return `<tr><td style="padding:4px 8px;font-family:monospace;font-size:11px">${pidCell}${pidNote}</td><td style="padding:4px 8px;text-align:right;font-size:11px">${delCell}</td><td style="padding:4px 8px;font-family:monospace;font-size:11px;color:var(--text-muted)">${r.syncedAtMs}</td><td style="padding:4px 8px;text-align:right">${r.sun}</td><td style="padding:4px 8px;text-align:right">${r.dev}</td><td style="padding:4px 8px;text-align:right;color:var(--text-muted);font-size:11px">${r.bytes}b</td><td style="padding:4px 8px;text-align:right;font-size:11px">${fmtCell}</td></tr>`;
      }).join('')
    : '<tr><td colspan="7" style="padding:8px;color:var(--text-muted);text-align:center">No rows in local Evolu DB</td></tr>';
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
          <thead><tr style="border-bottom:1px solid var(--border);text-align:left"><th style="padding:4px 8px">profileId</th><th style="padding:4px 8px;text-align:right">deleted</th><th style="padding:4px 8px">syncedAt(ms)</th><th style="padding:4px 8px;text-align:right">sun</th><th style="padding:4px 8px;text-align:right">dev</th><th style="padding:4px 8px;text-align:right">size</th><th style="padding:4px 8px;text-align:right">fmt</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div style="color:var(--text-muted);font-size:11px;margin-top:6px">Compare this table on phone vs desktop. Same profileId, same deleted state, same syncedAt(ms), same sun/dev counts → both devices already have the same data and the issue is rendering. Different counts → relay-replication isn't propagating between Evolu instances. <b>fmt</b> column: <span style="color:var(--green)">gz</span> = v1.6.4 gzip envelope, plain = pre-v1.6.4. <span style="color:var(--orange)">*</span> next to a profileId means it was recovered from the payload because the column was empty.</div>
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
    logSyncEvent('cutover', `Phase 2 enabled for ${state.currentProfile.slice(0, 8)}`);
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
  logSyncEvent('backfill', `Backfilled ${cleared} surface(s) for ${profileId.slice(0, 8)}: ${blockers.join(',')}`);
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
    logSyncEvent('cutover', `Phase 2 disabled for ${state.currentProfile.slice(0, 8)}`);
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) overlay.remove();
    }
  } else {
    try { showNotification('Could not disable Phase 2', 'error'); } catch {}
  }
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
