// @ts-check
// sync-push.js - Evolu profile push path and in-flight watchdog state.

import { getErrorMessage } from './caught-error.js';
import { buildSyncPayload } from './sync-payload.js';
import {
  notePushCommitted, scheduleOwnerStorageRefresh, trackPushBytes,
} from './sync-relay-health.js';
import {
  logSyncEvent, updateSyncStatus,
} from './sync-state.js';
import { getDeltaCutoverReadiness } from './sync-delta.js';
import { migrateProfileData } from './profile.js';
import { applyCommittedDeltas, planProfileDeltas } from './sync-push-deltas.js';
import {
  clearSyncProfileDirty, discardSyncProfileDirty, getSyncDirtyToken,
} from './sync-dirty-state.js';
import { noteLocalSyncCommit } from './sync-origin-state.js';
import { getProfileSyncBlockReason } from './profile-sync-policy.js';
import { sanitizeNutritionProfileData } from './nutrition-sync-sanitize.js';

/** @type {() => any} */
let _getEvolu = () => null;
/** @type {() => any} */
let _getProfileQuery = () => null;
let _isSyncEnabled = () => false;
/** @type {(profileId?: any) => boolean} */
let _isPhase2CutoverEnabled = () => false;
/** @type {(...args: any[]) => any} */
let _disablePhase2Cutover = () => {};
/** @type {(...args: any[]) => any} */
let _debug = () => {};
/** @type {() => any[]} */
let _getProfiles = () => [];

// Tracks when _syncing was last set so a hung push (Evolu onComplete never
// fires) can be detected and the flag cleared on the next push attempt
// instead of silently blocking every subsequent push for the session.
let _syncing = false;
let _syncingSince = 0;

/** @param {{
 *   getEvolu?: () => any,
 *   getProfileQuery?: () => any,
 *   isSyncEnabled?: () => boolean,
 *   isPhase2CutoverEnabled?: (profileId?: any) => boolean,
 *   disablePhase2Cutover?: (...args: any[]) => any,
 *   debug?: (...args: any[]) => any,
 *   getProfiles?: () => any[],
 * }} [deps]
 */
export function configureSyncPush({
  getEvolu,
  getProfileQuery,
  isSyncEnabled,
  isPhase2CutoverEnabled,
  disablePhase2Cutover,
  debug,
  getProfiles,
} = {}) {
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getProfileQuery === 'function') _getProfileQuery = getProfileQuery;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof isPhase2CutoverEnabled === 'function') _isPhase2CutoverEnabled = isPhase2CutoverEnabled;
  if (typeof disablePhase2Cutover === 'function') _disablePhase2Cutover = disablePhase2Cutover;
  if (typeof debug === 'function') _debug = debug;
  if (typeof getProfiles === 'function') _getProfiles = getProfiles;
}

export function isSyncPushInFlight() {
  return _syncing;
}

function normalizedImportedDataForPush(importedData) {
  if (!importedData || typeof importedData !== 'object') return importedData;
  let normalized;
  try {
    normalized = typeof structuredClone === 'function'
      ? structuredClone(importedData)
      : JSON.parse(JSON.stringify(importedData));
  } catch {
    normalized = { ...importedData };
  }
  migrateProfileData(normalized);
  return sanitizeNutritionProfileData(normalized);
}

export async function pushProfile(profileId, importedData, opts = {}) {
  if (!profileId || typeof profileId !== 'string') return;
  // Never turn a failed profile-storage read into an authoritative empty
  // relay update. Callers that intentionally create an empty profile pass an
  // explicit default object; null/undefined/arrays are always invalid here.
  if (!importedData || typeof importedData !== 'object' || Array.isArray(importedData)) {
    console.warn(`[sync] pushProfile skipped ${profileId.slice(0, 8)} — imported profile data is unavailable`);
    return { ok: false, skipped: true, reason: 'missing-profile-data' };
  }
  const blockReason = getProfileSyncBlockReason(profileId, _getProfiles());
  if (blockReason && !opts.allowTombstoneResurrection) {
    discardSyncProfileDirty(profileId);
    return { ok: true, skipped: true, reason: blockReason };
  }
  const evolu = _getEvolu();
  const profileQuery = _getProfileQuery();
  if (!evolu || !_isSyncEnabled()) return;
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
    return { ok: false, skipped: true, reason: 'in-flight' };
  }
  if (_syncing && !opts.force) console.warn('[sync] pushProfile clearing stale _syncing flag (>60s old)');
  if (opts.force && _syncing) console.warn('[sync] pushProfile force-overriding in-flight flag');
  _syncing = true;
  _syncingSince = Date.now();
  const dirtyToken = getSyncDirtyToken(profileId);
  const outboundData = normalizedImportedDataForPush(importedData);
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
  if (_isPhase2CutoverEnabled(profileId) && outboundData && typeof outboundData === 'object') {
    try {
      const driftCheck = getDeltaCutoverReadiness(profileId);
      if (driftCheck && !driftCheck.ready) {
        const blockerNames = Object.entries(driftCheck.surfaces || {})
          .filter(([, v]) => v && v.status === 'missing-rows')
          .map(([k]) => k)
          .slice(0, 3)
          .join(', ');
        console.warn(`[sync] Phase 2 cutover drift detected — auto-disabling. ${driftCheck.blockerCount} surface(s) lack per-row push history (e.g. ${blockerNames || 'unknown'}). This push will revert to v3 dual-write.`);
        _disablePhase2Cutover(profileId);
        logSyncEvent('skip', `Cutover drift: ${driftCheck.blockerCount} surface(s) missing per-row history — auto-reverted to dual-write (${blockerNames || 'unknown'})`);
      }
    } catch (e) { /* readiness check failures are non-fatal */ }
  }
  try {
    const dataJson = await buildSyncPayload(profileId, outboundData);
    const rows = evolu.getQueryRows(profileQuery);
    // A tombstone/recreate race can leave more than one live row for an ID.
    // Always update the newest row; updating an arbitrary older row lets a
    // stale duplicate keep winning pulls and encourages another recreation.
    const existing = (rows || [])
      .filter(r => r?.profileId === profileId)
      .sort((a, b) => Date.parse(b?.syncedAt || '') - Date.parse(a?.syncedAt || ''))[0];

    const sunCount = Array.isArray(outboundData?.sunSessions) ? outboundData.sunSessions.length : 0;
    const devCount = Array.isArray(outboundData?.lightDevices) ? outboundData.lightDevices.length : 0;
    const { deltaPlans, deltaOpCount } = await planProfileDeltas(profileId, outboundData);

    // Evolu's relay quota measures append-only message history, not the size
    // of the current profile. Updating an identical row therefore consumes
    // storage even though the user added nothing. Compare the complete wire
    // payload and delta plan before assigning a new syncedAt clock. Explicit
    // force pushes bypass this guard for relay rebuild/recovery workflows.
    if (!opts.force && existing?.dataJson === dataJson && deltaOpCount === 0) {
      const skipMsg = `No changes to push ${profileId.slice(0,8)}`;
      _debug(skipMsg);
      logSyncEvent('skip', skipMsg);
      updateSyncStatus({
        push: 'confirmed', pushStartedAt: null, pushConfirmedAt: Date.now(), lastError: null,
      });
      clearSyncProfileDirty(profileId, dirtyToken);
      _syncing = false;
      return { ok: true, skipped: true, reason: 'unchanged' };
    }

    const syncedAt = new Date().toISOString();
    const queueMsg = `Queued ${profileId.slice(0,8)} — sun=${sunCount} dev=${devCount}`;
    const queuedAt = Date.now();
    _debug(`${queueMsg} @ ${queuedAt}`);
    logSyncEvent('queue', queueMsg);
    updateSyncStatus({ push: 'pending', pushStartedAt: queuedAt });

    return await new Promise((resolve) => {
      let completed = false;
      let watchdogId = null;
      const finish = (result) => {
        _syncing = false;
        if (watchdogId !== null) { clearTimeout(watchdogId); watchdogId = null; }
        resolve(result);
      };
      const onComplete = () => {
        completed = true;
        const elapsed = Date.now() - queuedAt;
        updateSyncStatus({
          push: 'confirmed', pushStartedAt: null, pushConfirmedAt: Date.now(), lastError: null,
        });
        const okMsg = `Push committed ${profileId.slice(0,8)} (${elapsed}ms) — sun=${sunCount} dev=${devCount}`;
        _debug(okMsg);
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
        const syncedAtMs = new Date(syncedAt).getTime();
        localStorage.setItem(`labcharts-${profileId}-sync-ts`, String(syncedAtMs));
        noteLocalSyncCommit(profileId, syncedAtMs);
        // Track bytes immediately for the relay-storage estimate, then replace
        // it with authoritative storedBytes + configured quota via the
        // debounced self-service probe below.
        trackPushBytes((dataJson || '').length);
        scheduleOwnerStorageRefresh();
        applyCommittedDeltas(profileId, dataJson, deltaPlans, deltaOpCount, _debug);
        clearSyncProfileDirty(profileId, dirtyToken);
        finish({ ok: true });
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
          finish({ ok: false, reason: 'timeout' });
        }
      }, 30_000);

      try {
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
        updateSyncStatus({ push: 'error', lastError: { type: 'PushError', message: getErrorMessage(e), at: Date.now() } });
        finish({ ok: false, error: e });
      }
    });
  } catch (e) {
    console.error('[sync] Push failed:', e);
    updateSyncStatus({ push: 'error', lastError: { type: 'PushError', message: getErrorMessage(e), at: Date.now() } });
    // Synchronous error path — onComplete will never fire, release the lock.
    _syncing = false;
    return { ok: false, error: e };
  }
  // _syncing now released by onComplete / watchdog / catch — NOT here. The
  // earlier synchronous `finally { _syncing = false }` released it before
  // Evolu's async replication completed, so the concurrent-push guard the
  // outer 60s stale-clear logic relies on was effectively cosmetic.
}
