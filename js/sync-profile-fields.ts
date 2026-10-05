// sync-profile-fields.js - Canonical profile metadata allowed on the sync wire.

export const SYNC_PROFILE_FIELDS = [
  'name', 'sex', 'dob', 'location', 'tags', 'archived', 'pinned',
  'flagged', 'avatar', 'color',
];

export function selectSyncedProfile(profile: unknown) {
  if (!profile || typeof profile !== 'object') return null;
  const selected: Record<string, unknown> = {};
  if (typeof (profile as Record<string, unknown>).id === 'string' && (profile as Record<string, unknown>).id) selected.id = (profile as Record<string, unknown>).id;
  for (const field of SYNC_PROFILE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(profile, field)) {
      selected[field] = (profile as Record<string, unknown>)[field];
    }
  }
  return selected;
}
