// sync-reconcile.js - startup catch-up for local changes that missed a push.

import { state } from './state.js';
import { localHasRowsRemoteLacks } from './data-merge.js';
import { collectAISettings, parseSyncPayload } from './sync-payload.js';
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
// changes, trigger a forced push so the divergence catches up without the user
// needing to tap Force Resend.
export async function reconcileLocalStorageWithEvolu() {
  const evolu = _getEvolu();
  const profileQuery = _getProfileQuery();
  if (!evolu || !_isSyncEnabled() || !profileQuery || !state.currentProfile || !state.importedData) return;
  const rows = evolu.getQueryRows(profileQuery);
  const existing = rows?.find(r => r.profileId === state.currentProfile);
  // No existing row: first sync ever for this profile. The normal push path
  // (onDataSaved or enableSync) will handle it.
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
    // Malformed row: reconciliation can't reason about it. The user can still
    // recover via the Force Resend button.
    return;
  }
  if (!remoteImported && !localAiSettingsDiffer) return;

  // localHasRowsRemoteLacks catches (a) new local ids, (b) same-id rows with a
  // newer local pickTimestamp, and (c) local tombstones the remote lacks. Case
  // (b) is what catches start-then-stop-then-close: ids match, but local has
  // endedAt while the relay row still shows the session as active.
  const localHasUnsynced = remoteImported ? localHasRowsRemoteLacks(state.importedData, remoteImported) : false;
  if (!localHasUnsynced && !localAiSettingsDiffer) {
    _debug('Startup reconciliation: localStorage, AI settings, and Evolu row match - nothing to do');
    return;
  }

  const reason = localHasUnsynced ? 'unsynced rows' : 'newer local AI settings';
  _debug(`Startup reconciliation: localStorage has ${reason} vs Evolu row`);
  logSyncEvent('reconcile', `Reconcile ${state.currentProfile.slice(0, 8)} - local has ${reason}`);
  // Force-push so the next watchdog cycle can't lose us a clearly-needed
  // catch-up. This bypasses a stale _syncing guard from the prior session.
  await _pushProfile(state.currentProfile, state.importedData, { force: true });
}
