// @ts-check
// sync-profile-fields.js - Canonical profile metadata allowed on the sync wire.

export const SYNC_PROFILE_FIELDS = [
  'name', 'sex', 'dob', 'location', 'tags', 'archived', 'pinned',
  'flagged', 'avatar', 'color',
];

/**
 * Keep the profile envelope deterministic and limited to fields peers
 * actually consume. Volatile/local-only metadata such as `lastUpdated`,
 * notes, status, height, and createdAt used to make otherwise identical
 * devices continually replace the profile blob.
 *
 * @param {any} profile
 */
export function selectSyncedProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const selected = {};
  if (typeof profile.id === 'string' && profile.id) selected.id = profile.id;
  for (const field of SYNC_PROFILE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(profile, field)) {
      selected[field] = profile[field];
    }
  }
  return selected;
}
