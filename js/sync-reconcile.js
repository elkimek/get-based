// sync-reconcile.js - startup reconciliation for localStorage vs Evolu rows.

import { state } from './state.js';
import { localHasRowsRemoteLacks } from './data-merge.js';
import { collectAISettings } from './sync-payload-collectors.js';
import { parseSyncPayload } from './sync-payload.js';
import { logSyncEvent } from './sync-state.js';

let _getEvolu = () => null;
let _getProfileQuery = () => null;
let _isSyncEnabled = () => false;
let _pushProfile = async () => {};
let _debug = () => {};

export function configureSyncReconcile({
  getEvolu,
  getProfileQuery,
  isSyncEnabled,
  pushProfile,
  debug,
} = {}) {
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getProfileQuery === 'function') _getProfileQuery = getProfileQuery;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof pushProfile === 'function') _pushProfile = pushProfile;
  if (typeof debug === 'function') _debug = debug;
}

// Compare state.importedData (loaded from localStorage on page-load) with
// the Evolu DB row's dataJson for the active profile. If local has unsynced
// changes - either new ids the remote lacks OR same-id rows where the local
// copy has a strictly higher pickTimestamp (the canonical signal data-merge.js
// uses to pick a winner) - trigger a forced push so the divergence catches up
// without the user needing to tap Force Resend.
//
// The within-id timestamp branch is what catches the "phone stopped a session
// then closed before the 10s debounce push fired" failure mode: ids match on
// both sides but local has the stopped session (endedAt set, ts=endedAt) while
// remote still has the active session (endedAt=null, ts=startedAt). Without it
// the stop sits in localStorage indefinitely until some other edit triggers
// onDataSaved.
export async function reconcileLocalStorageWithEvolu() {
  const evolu = _getEvolu();
  const profileQuery = _getProfileQuery();
  if (!evolu || !_isSyncEnabled() || !state.currentProfile || !state.importedData) return;
  const rows = evolu.getQueryRows(profileQuery);
  const existing = rows?.find(r => r.profileId === state.currentProfile);
  // No existing row -> first sync ever for this profile, normal push path
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
    // Malformed row -> reconciliation can't reason about it. The user can
    // still recover via the Force Resend button.
    return;
  }
  if (!remoteImported && !localAiSettingsDiffer) return;

  // Reuse the rebroadcast helper - same semantic ("local has anything remote
  // doesn't reflect"), same id-keyed array list, same pickTimestamp tiebreak.
  // Returns true on (a) new local ids, (b) same-id with lTs>rTs, (c) tombstones
  // local has remote lacks. Without (b) the start-then-stop-then-close sequence
  // strands the stop on the phone forever - relay row keeps endedAt=null and
  // every other device shows the session as still running.
  const localHasUnsynced = remoteImported ? localHasRowsRemoteLacks(state.importedData, remoteImported) : false;
  if (!localHasUnsynced && !localAiSettingsDiffer) {
    _debug('Startup reconciliation: localStorage, AI settings, and Evolu row match - nothing to do');
    return;
  }
  const reason = localHasUnsynced ? 'unsynced rows' : 'newer local AI settings';
  _debug(`Startup reconciliation: localStorage has ${reason} vs Evolu row`);
  logSyncEvent('reconcile', `Reconcile ${state.currentProfile.slice(0, 8)} - local has ${reason}`);
  // Force-push so the next watchdog cycle can't lose us a clearly-needed
  // catch-up. Bypasses the _syncing guard if it was wedged from a prior
  // session - the same wedge that caused the divergence in the first place.
  await _pushProfile(state.currentProfile, state.importedData, { force: true });
}
