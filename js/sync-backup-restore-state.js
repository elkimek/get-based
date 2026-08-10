// @ts-check
// sync-backup-restore-state.js - durable handoff from backup restore to Sync.

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
