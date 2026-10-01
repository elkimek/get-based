// sync-backup-restore-state.js - durable handoff from backup restore to Sync.

import { clearProfileDeltaSnapshots } from './sync-delta-snapshot.js';
import { markSyncProfileDirty } from './sync-dirty-state.js';
import { clearProfileSyncDeleteState } from './profile-sync-policy.js';

export const SYNC_BACKUP_RESTORE_PENDING_KEY = 'labcharts-sync-backup-restore-pending';

function isSafeProfileId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
}

export function markBackupRestorePending(profileIds: readonly unknown[]) {
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

export function prepareRestoredProfilesForSync(backup: unknown) {
  const profiles = Array.isArray((backup as { profiles?: unknown } | null | undefined)?.profiles) ? (backup as { profiles: unknown[] }).profiles : [];
  const prepared = new Set<string>();
  for (const profile of profiles) {
    const profileId = (profile as { profileId?: unknown } | null | undefined)?.profileId;
    if (typeof profileId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(profileId) || prepared.has(profileId)) continue;
    prepared.add(profileId);
    // Restoring a backup is an explicit decision to revive this identity.
    // A successful delete from before the restore must not keep the restored
    // profile permanently blocked from its recovery push.
    clearProfileSyncDeleteState(profileId);
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
