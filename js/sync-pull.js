// sync-pull.js - inbound Evolu rows -> localStorage merge path.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { profileStorageKey, getProfiles, saveProfiles, migrateProfileData } from './profile.js';
import { getEncryptionEnabled, encryptedSetItem, encryptedGetItem } from './crypto.js';
import { mergeImportedData, localHasRowsRemoteLacks } from './data-merge.js';
import { parseSyncPayload } from './sync-payload.js';
import {
  applyAISettings, applyChatData, applyDisplayPrefs,
  getChatDataLocalLockRemainingMs,
} from './sync-apply.js';
import { _mergeItemRowsIntoImported } from './sync-delta.js';
import { applyRemoteTombstones } from './sync-tombstones.js';
import {
  consumeRebroadcastBudget, getSyncStatus, logSyncEvent, updateSyncStatus,
} from './sync-state.js';

let _getEvolu = () => null;
let _getProfileQuery = () => null;
let _isSyncPushInFlight = () => false;
let _pushProfile = async () => {};
let _debug = () => {};
let _pulling = false;
const _chatPullRetryTimers = new Map();

export function configureSyncPull({
  getEvolu,
  getProfileQuery,
  isSyncPushInFlight,
  pushProfile,
  debug,
} = {}) {
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getProfileQuery === 'function') _getProfileQuery = getProfileQuery;
  if (typeof isSyncPushInFlight === 'function') _isSyncPushInFlight = isSyncPushInFlight;
  if (typeof pushProfile === 'function') _pushProfile = pushProfile;
  if (typeof debug === 'function') _debug = debug;
}

function currentEvolu() {
  try { return _getEvolu?.() || null; } catch { return null; }
}

function currentProfileQuery() {
  try { return _getProfileQuery?.() || null; } catch { return null; }
}

function isPushInFlight() {
  try { return !!_isSyncPushInFlight?.(); } catch { return false; }
}

function dbg(...args) {
  try { _debug?.(...args); } catch {}
}

export function isSyncPulling() {
  return _pulling;
}

export function clearSyncPullTimers() {
  for (const t of _chatPullRetryTimers.values()) clearTimeout(t);
  _chatPullRetryTimers.clear();
}

export function forcePull() {
  if (!currentEvolu() || !currentProfileQuery()) {
    console.warn('[sync] Cannot force pull — Evolu not initialized');
    return;
  }
  _pulling = false;
  dbg('Force pull triggered');
  onSyncReceived();
  return 'triggered';
}

// Allowed fields when merging a synced profile into the local profiles list
const PROFILE_MERGE_FIELDS = ['name', 'sex', 'dob', 'location', 'tags', 'archived', 'pinned', 'flagged', 'avatar', 'color'];

// One-time cleanup: the v1.6.0-v1.6.2 hash-skip mechanism wrote
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
    if (!currentEvolu() || !currentProfileQuery()) return;
    if (isPushInFlight() || _pulling) {
      scheduleChatPullRetry(profileId, 1000);
      return;
    }
    dbg(`Retrying chat pull for ${profileId.slice(0, 8)} after local freshness lock`);
    onSyncReceived();
  }, waitMs);
  _chatPullRetryTimers.set(profileId, timer);
}

export async function onSyncReceived() {
  const evolu = currentEvolu();
  const profileQuery = currentProfileQuery();
  if (!evolu || !profileQuery || _pulling) {
    dbg('onSyncReceived skipped:', !evolu ? 'no evolu' : !profileQuery ? 'no query' : 'already pulling');
    return;
  }
  _pulling = true;
  _onceClearStaleSyncHashes();
  updateSyncStatus({ pull: 'pulling' });
  try {
    // Apply remote tombstones FIRST - when another device deleted a profile,
    // wipe our local copy before processing live rows. Skipping this leaves
    // orphan profiles in the local list that the active query no longer
    // returns, and the user sees ghost entries that resync never explains.
    await applyRemoteTombstones();

    const rawRows = evolu.getQueryRows(profileQuery);
    dbg(`onSyncReceived: ${rawRows?.length ?? 0} rows`);
    if (!rawRows || rawRows.length === 0) return;

    // Pre-pass: recover profileId from the payload when the column is empty.
    // After a relay compaction, only the latest evolu.update messages survive
    // - those don't carry profileId - so a fresh device replicating a
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
          // Malformed payload + empty column -> can't merge, drop the row.
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
        // Allowlist regex - defense-in-depth against a compromised relay
        // injecting a profileId that maps to a sensitive localStorage key
        // collision (e.g. "default-imported-chat-threads" -> would land at
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

        // Remote is newer - parse payload (async because the gzip envelope
        // routes through DecompressionStream)
        const { importedData, profile, aiSettings, chatData, displayPrefs } = await parseSyncPayload(row.dataJson);

        // Track latest AI settings (apply once, from most recent row)
        if (aiSettings && remoteUpdated > latestAiTs) {
          latestAiSettings = aiSettings;
          latestAiTs = remoteUpdated;
        }

        // Validate importedData shape. v4 (Phase 2 cutover) intentionally
        // omits importedData - it's null by design, not malformed. We
        // still want to run the per-row pull for that case, so detect v4
        // (importedData strictly === null after parseSyncPayload) and
        // continue with an empty-object placeholder; the per-row overlay
        // step downstream will fill in every field from itemRow data.
        // Anything else falsy/non-object is genuinely malformed -> skip.
        const isV4Cutover = importedData === null;
        if (!isV4Cutover && (!importedData || typeof importedData !== 'object')) {
          // v1.7.15 audit fix: log so a chronically-corrupted row is
          // visible in the activity log instead of silently disappearing.
          logSyncEvent('skip', `Pull ${profileId.slice(0, 8)} — malformed importedData shape, skipping row`);
          continue;
        }

        // Preserve local wearableConnections - they're stripped from the push
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
        // the blob merge. Per-row state is authoritative - a tombstone
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
        // ID_KEYED_ARRAYS, it falls into the LWW path which takes remote -
        // but `importedData` here was already patched with localWearableConnections).

        // If the merge added rows the remote didn't have (i.e. local had
        // unsynced state - the canonical case is "phone logged C, desktop
        // pushed Y first, neither sees the other"), the relay row still
        // reflects only the remote side. We need to rebroadcast the merged
        // result so the *other* device pulls our union next round. Without
        // this, convergence stalls at the first cross-device race because
        // pull-and-merge is local-only - nothing republishes the union.
        // Use a structural id-set diff (not JSON.stringify equality) - JSON
        // serialization order varies with merge-insertion order and would
        // cause an infinite ping-pong rebroadcast across devices.
        // v4 cutover: importedData is null, so the diff is meaningless
        // (per-row deltas already drove the merge). Skip the rebroadcast
        // gate - per-row pushes don't have the "local has rows remote
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
        // encryptedSetItem - it routes big-blob `-imported` keys to
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
            // New profile - pick only allowed fields + id
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
          // becomes visible - but ONLY when the merge actually produced
          // new content from the remote side. `localImportedForMerge`
          // already had everything => no observable change => skip the
          // re-render so an in-progress form doesn't get wiped on pull.
          // Source: state.currentView (canonical). DOM .nav-item.active
          // is briefly absent during buildSidebar->navigate cycles and
          // would yank the user to 'dashboard' on a pull landing in
          // that gap (user-reported flicker/sync race).
          const cat = state.currentView || document.querySelector('.nav-item.active')?.dataset?.category || 'dashboard';
          // Sidebar nav items are conditional on data presence (e.g. the
          // Genetics entry only renders when state.importedData.genetics
          // exists). Per-row CRDT deltas can populate scalars/maps that
          // localHasRowsRemoteLacks() doesn't see - it only diffs id-keyed
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
        // for non-active profiles - pushProfile uses state.importedData,
        // which is only valid for the current profile.
        if (needsRebroadcast && profileId === state.currentProfile) {
          // Don't pile rebroadcast pushes on top of an in-flight push - Evolu
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
              _pushProfile(profileId, snapshotImported);
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
