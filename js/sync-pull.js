// sync-pull.js - inbound Evolu rows -> localStorage merge path.

import { parseSyncPayload } from './sync-payload.js';
import {
  applyAISettings, applyChatData, applyDisplayPrefs,
  getChatDataLocalLockRemainingMs,
} from './sync-apply.js';
import { refreshActiveProfileAfterPull } from './sync-pull-active-refresh.js';
import { clearStaleSyncHashKeysOnce } from './sync-pull-maintenance.js';
import {
  isMalformedPulledImportedData, isSafeProfileId, mergePulledImportedData,
  mergePulledProfile, persistPulledImportedData, prepareSyncPullRows,
} from './sync-pull-merge.js';
import { maybeScheduleRebroadcast } from './sync-pull-rebroadcast.js';
import { applyRemoteTombstones } from './sync-tombstones.js';
import {
  logSyncEvent, updateSyncStatus,
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
  clearStaleSyncHashKeysOnce(dbg);
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

    const rows = await prepareSyncPullRows(rawRows);

    let profilesChanged = false;
    let latestAiSettings = null;
    let latestAiTs = 0;

    for (const row of rows) {
      try {
        const profileId = row.profileId;
        // Allowlist regex - defense-in-depth against a compromised relay
        // injecting a profileId that maps to a sensitive localStorage key
        // collision (e.g. "default-imported-chat-threads" -> would land at
        // labcharts-default-imported-chat-threads-imported).
        if (!isSafeProfileId(profileId)) continue;
        const remoteUpdated = row.syncedAt ? new Date(row.syncedAt).getTime() : 0;
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
        if (isMalformedPulledImportedData(importedData)) {
          // v1.7.15 audit fix: log so a chronically-corrupted row is
          // visible in the activity log instead of silently disappearing.
          logSyncEvent('skip', `Pull ${profileId.slice(0, 8)} — malformed importedData shape, skipping row`);
          continue;
        }

        const {
          localKey, merged, mergeMsg,
          needsRebroadcast, remoteBroughtNewRows,
        } = await mergePulledImportedData(profileId, importedData, { debug: dbg });
        dbg(mergeMsg);
        logSyncEvent('pull', mergeMsg);

        await persistPulledImportedData(localKey, profileId, merged, remoteUpdated);

        if (await mergePulledProfile(profileId, profile)) {
          profilesChanged = true;
          dbg('Merged profile:', profileId, profile.name);
        }

        // Apply chat data and display preferences
        const chatApplied = chatData ? await applyChatData(profileId, chatData) : false;
        if (chatData && !chatApplied) {
          scheduleChatPullRetry(profileId, getChatDataLocalLockRemainingMs(profileId));
        }
        if (displayPrefs) applyDisplayPrefs(profileId, displayPrefs);

        if (!refreshActiveProfileAfterPull({
          profileId,
          merged,
          chatApplied,
          remoteBroughtNewRows,
          debug: dbg,
        })) {
          dbg('Pulled profile:', profileId);
        }

        maybeScheduleRebroadcast({
          profileId,
          merged,
          needsRebroadcast,
          pushProfile: _pushProfile,
          debug: dbg,
        });
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
