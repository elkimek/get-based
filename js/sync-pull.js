// @ts-check
// sync-pull.js - inbound Evolu rows -> localStorage merge path.

import { parseSyncPayload } from './sync-payload.js';
import {
  applyAISettings, applyDisplayPrefs,
} from './sync-apply.js';
import { applyChatData, getChatDataLocalLockRemainingMs } from './sync-chat-apply.js';
import { refreshActiveProfileAfterPull } from './sync-pull-active-refresh.js';
import { clearStaleSyncHashKeysOnce } from './sync-pull-maintenance.js';
import {
  isMalformedPulledImportedData, isSafeProfileId, mergePulledImportedData,
  mergePulledProfile, persistPulledImportedData, prepareSyncPullRows,
} from './sync-pull-merge.js';
import { maybeScheduleRebroadcast } from './sync-pull-rebroadcast.js';
import { applyRemoteTombstones } from './sync-tombstones.js';
import { clearRestoreJoinPending, isRestoreJoinPending } from './sync-identity.js';
import {
  logSyncEvent, updateSyncStatus,
} from './sync-state.js';
import { state } from './state.js';
import { getSyncDirtyToken } from './sync-dirty-state.js';
import { isLocalSyncCommitEcho } from './sync-origin-state.js';

// These use var + self-preserving defaults because sync.js can be re-entered
// through app module cycles while sync-pull.js is still evaluating. An early
// configureSyncPull call must not hit TDZ or get overwritten by defaults.
var _getEvolu = _getEvolu || (() => null);
var _getProfileQuery = _getProfileQuery || (() => null);
var _isSyncPushInFlight = _isSyncPushInFlight || (() => false);
/** @type {(...args: any[]) => Promise<any>} */
var _pushProfile = _pushProfile || (async () => {});
var _renderProfileButton = _renderProfileButton || (() => {});
/** @type {(...args: any[]) => any} */
var _debug = _debug || (() => {});
let _pulling = false;
const _chatPullRetryTimers = new Map();
const ROUTSTR_SESSION_UPDATED_AT_KEY = 'labcharts-routstr-session-updated-at';
const ROUTSTR_SESSION_KEYS = [
  'labcharts-routstr-key',
  'labcharts-routstr-node',
  ROUTSTR_SESSION_UPDATED_AT_KEY,
];

export function createPulledAISettingsSelection() {
  return {
    latestAiSettings: null,
    latestAiRowTs: -1,
    latestRoutstrSettings: null,
    latestRoutstrClock: -1,
    latestRoutstrRowTs: -1,
  };
}

/**
 * AI settings are duplicated in every profile row. General settings follow
 * the newest profile row, while the global Routstr session follows its own
 * explicit clock so an unrelated newer profile save cannot hide funded keys.
 */
export function selectPulledAISettings(selection, settings, rowSyncedAt) {
  if (!settings || typeof settings !== 'object') return selection;
  const next = { ...selection };
  const rowTs = Number.isFinite(Number(rowSyncedAt)) ? Number(rowSyncedAt) : 0;
  if (rowTs > next.latestAiRowTs) {
    next.latestAiSettings = settings;
    next.latestAiRowTs = rowTs;
  }
  if (!ROUTSTR_SESSION_KEYS.some(key => Object.prototype.hasOwnProperty.call(settings, key))) return next;
  const rawClock = Number(settings[ROUTSTR_SESSION_UPDATED_AT_KEY] || 0);
  const clock = Number.isFinite(rawClock) && rawClock >= 0 ? rawClock : 0;
  if (clock > next.latestRoutstrClock
      || clock === next.latestRoutstrClock && rowTs > next.latestRoutstrRowTs) {
    next.latestRoutstrSettings = settings;
    next.latestRoutstrClock = clock;
    next.latestRoutstrRowTs = rowTs;
  }
  return next;
}

export function combinePulledAISettings(selection) {
  if (!selection.latestAiSettings && !selection.latestRoutstrSettings) return null;
  const combined = { ...(selection.latestAiSettings || {}) };
  if (!selection.latestRoutstrSettings) return combined;
  for (const key of ROUTSTR_SESSION_KEYS) delete combined[key];
  for (const key of ROUTSTR_SESSION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(selection.latestRoutstrSettings, key)) {
      combined[key] = selection.latestRoutstrSettings[key];
    }
  }
  return combined;
}

/** @param {{
 *   getEvolu?: () => any,
 *   getProfileQuery?: () => any,
 *   isSyncPushInFlight?: () => boolean,
 *   pushProfile?: (...args: any[]) => Promise<any>,
 *   renderProfileButton?: () => void,
 *   debug?: (...args: any[]) => any,
 * }} [deps]
 */
export function configureSyncPull({
  getEvolu,
  getProfileQuery,
  isSyncPushInFlight,
  pushProfile,
  renderProfileButton,
  debug,
} = {}) {
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getProfileQuery === 'function') _getProfileQuery = getProfileQuery;
  if (typeof isSyncPushInFlight === 'function') _isSyncPushInFlight = isSyncPushInFlight;
  if (typeof pushProfile === 'function') _pushProfile = pushProfile;
  if (typeof renderProfileButton === 'function') _renderProfileButton = renderProfileButton;
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
    return undefined;
  }
  _pulling = false;
  dbg('Force pull triggered');
  return onSyncReceived();
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

    let rawRows = evolu.getQueryRows(profileQuery);
    dbg(`onSyncReceived: ${rawRows?.length ?? 0} rows`);
    if (!rawRows || rawRows.length === 0) return;

    // Startup/query subscriptions can fire before the normal save debounce.
    // If this active profile has durable local edits, commit them into Evolu
    // before reading the query row; otherwise the stale row can erase scalar
    // edits that the structural array merge cannot infer as locally newer.
    const dirtyProfileId = state.currentProfile;
    if (dirtyProfileId && getSyncDirtyToken(dirtyProfileId)) {
      dbg(`Pull preflight: flushing dirty local profile ${dirtyProfileId.slice(0, 8)}`);
      const flushed = await _pushProfile(dirtyProfileId, state.importedData);
      if (!flushed?.ok) {
        logSyncEvent('skip', `Pull deferred — local changes for ${dirtyProfileId.slice(0, 8)} are not committed yet`);
        return;
      }
      rawRows = evolu.getQueryRows(profileQuery);
    }

    const rows = await prepareSyncPullRows(rawRows);
    // A restored device is joining an existing owner, so the relay's provider
    // session must win over any stale local key/5-minute edit lock left by the
    // browser before restore. Capture before the first profile merge clears
    // the restore marker; AI settings are applied once after the row loop.
    const preferRemoteAiSettings = isRestoreJoinPending();

    let profilesChanged = false;
    let aiSettingsSelection = createPulledAISettingsSelection();

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
        const localCommitEcho = isLocalSyncCommitEcho(profileId, remoteUpdated);

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

        aiSettingsSelection = selectPulledAISettings(aiSettingsSelection, aiSettings, remoteUpdated);

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
          needsRebroadcast, remoteBroughtNewRows, localDataChanged, restoreJoinApplied,
        } = await mergePulledImportedData(profileId, importedData, { debug: dbg });
        dbg(mergeMsg);
        logSyncEvent('pull', mergeMsg);

        await persistPulledImportedData(localKey, profileId, merged, remoteUpdated);
        if (restoreJoinApplied) clearRestoreJoinPending();

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
          localDataChanged,
          localCommitEcho,
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

    // Apply general settings from the newest row, but choose Routstr's global
    // session by its own clock across every profile row.
    const selectedAiSettings = combinePulledAISettings(aiSettingsSelection);
    if (selectedAiSettings) await applyAISettings(selectedAiSettings, { preferRemote: preferRemoteAiSettings });

    // Rebuild profile dropdown if profiles changed
    if (profilesChanged) {
      _renderProfileButton();
    }
  } finally {
    _pulling = false;
    updateSyncStatus({ pull: 'received', pullReceivedAt: Date.now() });
  }
}
