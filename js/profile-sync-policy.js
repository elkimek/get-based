// @ts-check
// profile-sync-policy.js — durable profile admission rules shared by sync paths.

const TOMBSTONE_QUARANTINE_PREFIX = 'labcharts-tombstone-pending-';
const PROFILE_DELETE_INTENT_PREFIX = 'labcharts-profile-delete-intent-';

/** @param {any} profile */
export function isDemoProfileRecord(profile) {
  return !!(profile && Array.isArray(profile.tags)
    && profile.tags.some(tag => String(tag || '').trim().toLowerCase() === 'demo'));
}

/** @param {string | null | undefined} profileId @param {any[]} [profiles] */
export function isDemoProfileId(profileId, profiles = []) {
  if (!profileId) return false;
  return isDemoProfileRecord((profiles || []).find(profile => profile?.id === profileId));
}

/** @param {string | null | undefined} profileId */
export function hasPendingProfileTombstone(profileId) {
  if (!profileId) return false;
  try { return !!localStorage.getItem(`${TOMBSTONE_QUARANTINE_PREFIX}${profileId}`); }
  catch { return false; }
}

/** @param {string | null | undefined} profileId */
export function hasLocalProfileDeleteIntent(profileId) {
  if (!profileId) return false;
  try { return !!localStorage.getItem(`${PROFILE_DELETE_INTENT_PREFIX}${profileId}`); }
  catch { return false; }
}

/** @param {string | null | undefined} profileId @param {string} [source] */
export function markLocalProfileDeleteIntent(profileId, source = 'local') {
  if (!profileId) return false;
  try {
    localStorage.setItem(`${PROFILE_DELETE_INTENT_PREFIX}${profileId}`, JSON.stringify({
      at: Date.now(),
      source,
    }));
    return true;
  } catch { return false; }
}

/** @param {string | null | undefined} profileId */
export function clearLocalProfileDeleteIntent(profileId) {
  if (!profileId) return false;
  try {
    localStorage.removeItem(`${PROFILE_DELETE_INTENT_PREFIX}${profileId}`);
    return true;
  } catch { return false; }
}

/**
 * An explicit backup restore revives the backed-up profile identity. Retire
 * both kinds of durable delete state so the recovery push can republish it.
 * @param {string | null | undefined} profileId
 */
export function clearProfileSyncDeleteState(profileId) {
  if (!profileId) return false;
  const intentCleared = clearLocalProfileDeleteIntent(profileId);
  try {
    localStorage.removeItem(`${TOMBSTONE_QUARANTINE_PREFIX}${profileId}`);
    return true;
  } catch {
    return intentCleared;
  }
}

/**
 * @param {string | null | undefined} profileId
 * @param {any[]} [profiles]
 * @returns {'demo'|'delete-intent'|'pending-delete'|''}
 */
export function getProfileSyncBlockReason(profileId, profiles = []) {
  if (!profileId) return '';
  if (isDemoProfileId(profileId, profiles)) return 'demo';
  if (hasLocalProfileDeleteIntent(profileId)) return 'delete-intent';
  if (hasPendingProfileTombstone(profileId)) return 'pending-delete';
  return '';
}

/**
 * Queue a normal profile save while retiring any legacy relay row for a demo.
 * Keeping the admission check here prevents profile CRUD from growing a second
 * implementation of the same demo/delete policy.
 *
 * @param {string | null | undefined} profileId
 * @param {any[]} profiles
 * @param {any} importedData
 * @param {{deleteProfileFromRelay?: (profileId: string) => any, onProfileSaved?: (profileId: string, importedData: any) => any}} deps
 */
export function queueEligibleProfileSync(profileId, profiles, importedData, deps = {}) {
  if (!profileId) return;
  const blockReason = getProfileSyncBlockReason(profileId, profiles);
  if (blockReason) {
    if (blockReason === 'demo') Promise.resolve(deps.deleteProfileFromRelay?.(profileId)).catch(() => {});
    return;
  }
  try {
    if (localStorage.getItem('labcharts-sync-enabled') !== 'true') return;
  } catch { return; }
  Promise.resolve(deps.onProfileSaved?.(profileId, importedData)).catch(() => {});
}
