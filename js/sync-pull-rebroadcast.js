// @ts-check
// sync-pull-rebroadcast.js - safe pull-side rebroadcast scheduling.

import { state } from './state.js';
import {
  consumeRebroadcastBudget, getSyncStatus, logSyncEvent,
} from './sync-state.js';

// Evolu 8 opens its durable local database before relay replay necessarily
// finishes. After owner compaction that local view can contain the old rows
// while the relay's fresh canonical rebuild is still arriving. Publishing a
// union from that transient view can turn an incomplete row overlay into new,
// post-compaction mutations that win over the rebuild. initSync brackets this
// short startup window and performs a final pull before releasing it.
let _startupSettling = false;

export function beginSyncRebroadcastSettling() {
  _startupSettling = true;
}

export function finishSyncRebroadcastSettling() {
  _startupSettling = false;
}

export function isSyncRebroadcastSettling() {
  return _startupSettling;
}

/** @param {((...args: any[]) => any) | undefined} debug */
function dbg(debug, ...args) {
  try { debug?.(...args); } catch {}
}

/** @param {{
 *   profileId?: string,
 *   needsRebroadcast?: boolean,
 *   pushProfile?: (...args: any[]) => any,
 *   debug?: (...args: any[]) => any,
 * }} [options]
 */
export function maybeScheduleRebroadcast({
  profileId,
  needsRebroadcast,
  pushProfile,
  debug,
} = {}) {
  // Rebroadcast the union if local had rows the remote lacked. Defer
  // with setTimeout to avoid recursing inside the pull tick + give
  // chat/profile/aiSettings appliers a chance to settle first. Skipped
  // for non-active profiles - pushProfile uses state.importedData,
  // which is only valid for the current profile.
  if (!needsRebroadcast || profileId !== state.currentProfile || typeof pushProfile !== 'function') return false;

  if (_startupSettling) {
    dbg(debug, `Row ${profileId.slice(0,8)}: rebroadcast deferred — initial replica still settling`);
    logSyncEvent('skip', 'Rebroadcast deferred — initial replica settling');
    return false;
  }

  // Don't pile rebroadcast pushes on top of an in-flight push - Evolu
  // serializes them and the relay can lag, producing the
  // sun=0/sun=1/sun=1 push storm seen in v1.7.5 diagnostics. Skip the
  // rebroadcast if a push is already pending; the next pull cycle
  // (after that push lands) will redo this check correctly.
  if (getSyncStatus().push === 'pending') {
    dbg(debug, `Row ${profileId.slice(0,8)}: rebroadcast deferred — push already pending`);
    logSyncEvent('skip', `Rebroadcast deferred — push pending`);
    return false;
  }
  if (!consumeRebroadcastBudget(profileId)) {
    dbg(debug, `Row ${profileId.slice(0,8)}: rebroadcast suppressed — budget exhausted in last 5min (clock skew?)`);
    logSyncEvent('skip', `Rebroadcast budget exhausted — possible clock skew`);
    return false;
  }

  dbg(debug, `Row ${profileId.slice(0,8)}: rebroadcast — local had unsynced rows`);
  logSyncEvent('rebroadcast', `Rebroadcast ${profileId.slice(0,8)}`);

  // Re-verify the active profile when the timer fires, then publish its latest
  // state. Capturing `merged` here is unsafe: another pull or local edit can
  // replace state.importedData during the 100ms gap, and the delayed stale
  // snapshot would then regress scalar fields on every device.
  setTimeout(() => {
    if (profileId !== state.currentProfile) {
      dbg(debug, `Rebroadcast aborted — active profile switched`);
      return;
    }
    const latestImported = state.importedData;
    if (!latestImported || typeof latestImported !== 'object') {
      dbg(debug, `Rebroadcast aborted — active profile data unavailable`);
      return;
    }
    pushProfile(profileId, latestImported);
  }, 100);
  return true;
}
