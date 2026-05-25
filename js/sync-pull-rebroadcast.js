// sync-pull-rebroadcast.js - safe pull-side rebroadcast scheduling.

import { state } from './state.js';
import {
  consumeRebroadcastBudget, getSyncStatus, logSyncEvent,
} from './sync-state.js';

function dbg(debug, ...args) {
  try { debug?.(...args); } catch {}
}

export function maybeScheduleRebroadcast({
  profileId,
  merged,
  needsRebroadcast,
  pushProfile,
  debug,
} = {}) {
  // Rebroadcast the union if local had rows the remote lacked. Defer
  // with setTimeout to avoid recursing inside the pull tick + give
  // chat/profile/aiSettings appliers a chance to settle first. Skipped
  // for non-active profiles - pushProfile uses state.importedData,
  // which is only valid for the current profile.
  if (!needsRebroadcast || profileId !== state.currentProfile) return false;

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

  // Snapshot importedData at SCHEDULE time and re-verify the
  // active profile when the timer fires. Without these, a profile
  // switch in the 100ms gap would push the new active profile's
  // state.importedData into the *original* profile's relay row.
  const snapshotImported = merged;
  setTimeout(() => {
    if (profileId !== state.currentProfile) {
      dbg(debug, `Rebroadcast aborted — active profile switched`);
      return;
    }
    pushProfile(profileId, snapshotImported);
  }, 100);
  return true;
}
