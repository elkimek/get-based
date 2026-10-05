// profile-sync-policy.js — durable profile admission rules shared by sync paths.

export const TOMBSTONE_QUARANTINE_PREFIX = 'labcharts-tombstone-pending-';
export const PROFILE_DELETE_INTENT_PREFIX = 'labcharts-profile-delete-intent-';

export function isDemoProfileRecord(profile: unknown) {
  return !!(profile && Array.isArray((profile as { tags?: unknown }).tags)
    && ((profile as { tags: unknown[] }).tags).some(tag => String(tag || '').trim().toLowerCase() === 'demo'));
}

export function isDemoProfileId(profileId: string | null | undefined, profiles: readonly unknown[] | null = []) {
  if (!profileId) return false;
  return isDemoProfileRecord((profiles || []).find(profile => (profile as { id?: unknown } | null | undefined)?.id === profileId));
}

export function hasPendingProfileTombstone(profileId: string | null | undefined) {
  if (!profileId) return false;
  try { return !!localStorage.getItem(`${TOMBSTONE_QUARANTINE_PREFIX}${profileId}`); }
  catch { return false; }
}

export function hasLocalProfileDeleteIntent(profileId: string | null | undefined) {
  if (!profileId) return false;
  try { return !!localStorage.getItem(`${PROFILE_DELETE_INTENT_PREFIX}${profileId}`); }
  catch { return false; }
}

export function markLocalProfileDeleteIntent(profileId: string | null | undefined, source = 'local') {
  if (!profileId) return false;
  try {
    localStorage.setItem(`${PROFILE_DELETE_INTENT_PREFIX}${profileId}`, JSON.stringify({
      at: Date.now(),
      source,
    }));
    return true;
  } catch { return false; }
}

export function clearLocalProfileDeleteIntent(profileId: string | null | undefined) {
  if (!profileId) return false;
  try {
    localStorage.removeItem(`${PROFILE_DELETE_INTENT_PREFIX}${profileId}`);
    return true;
  } catch { return false; }
}

export function clearProfileSyncDeleteState(profileId: string | null | undefined) {
  if (!profileId) return false;
  const intentCleared = clearLocalProfileDeleteIntent(profileId);
  try {
    localStorage.removeItem(`${TOMBSTONE_QUARANTINE_PREFIX}${profileId}`);
    return true;
  } catch {
    return intentCleared;
  }
}

export function getProfileSyncBlockReason(profileId: string | null | undefined, profiles: readonly unknown[] | null = []) {
  if (!profileId) return '';
  if (isDemoProfileId(profileId, profiles)) return 'demo';
  if (hasLocalProfileDeleteIntent(profileId)) return 'delete-intent';
  if (hasPendingProfileTombstone(profileId)) return 'pending-delete';
  return '';
}

export function queueEligibleProfileSync(
  profileId: string | null | undefined, profiles: readonly unknown[] | null, importedData: unknown,
  deps: { deleteProfileFromRelay?: (profileId: string) => unknown; onProfileSaved?: (profileId: string, importedData: unknown) => unknown } = {},
) {
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
