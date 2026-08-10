// @ts-check
// sync-backup-restore-state.js - durable handoff from backup restore to Sync.

import { clearProfileDeltaSnapshots } from './sync-delta-snapshot.js';
import { markSyncProfileDirty } from './sync-dirty-state.js';

export const SYNC_BACKUP_RESTORE_PENDING_KEY = 'labcharts-sync-backup-restore-pending';

/** @param {unknown} value */
function isSafeProfileId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
}

/** @param {unknown[]} profileIds */
export function markBackupRestorePending(profileIds) {
  const safeIds = [...new Set((Array.isArray(profileIds) ? profileIds : []).filter(isSafeProfileId))];
  if (safeIds.length === 0) return [];
  try {
    localStorage.setItem(SYNC_BACKUP_RESTORE_PENDING_KEY, JSON.stringify(safeIds));
  } catch {}
  return safeIds;
}

export function getPendingBackupRestoreProfileIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY) || '[]');
    return [...new Set((Array.isArray(parsed) ? parsed : []).filter(isSafeProfileId))];
  } catch {
    return [];
  }
}

export function clearBackupRestorePending() {
  try {
    localStorage.removeItem(SYNC_BACKUP_RESTORE_PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * A restored profile blob must win the first sync race after reload. Without
 * this reset, the per-row overlay can immediately reapply item tombstones
 * from the pre-restore state, making restored supplements briefly appear and
 * then disappear. Clearing planner snapshots also guarantees that an exact
 * restored copy is emitted again instead of being skipped by content hash.
 *
 * @param {any} backup
 */
export function prepareRestoredProfilesForSync(backup) {
  const profiles = Array.isArray(backup?.profiles) ? backup.profiles : [];
  const prepared = new Set();
  for (const profile of profiles) {
    const profileId = profile?.profileId;
    if (typeof profileId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(profileId) || prepared.has(profileId)) continue;
    prepared.add(profileId);
    clearProfileDeltaSnapshots(profileId);
    // A restored blob may not have complete per-row history, so force the
    // first recovery push to include the full v3 payload as a safety net.
    try { localStorage.removeItem(`labcharts-${profileId}-sync-cutover-v2`); } catch {}
    try { localStorage.removeItem(`labcharts-${profileId}-sync-ts`); } catch {}
    markSyncProfileDirty(profileId);
  }
  markBackupRestorePending([...prepared]);
  return prepared.size;
}
