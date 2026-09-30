// profile-storage-key.js — leaf helper for profile-scoped storage names.

export function profileStorageKey(profileId: string, suffix: string): string {
  return `labcharts-${profileId}-${suffix}`;
}
