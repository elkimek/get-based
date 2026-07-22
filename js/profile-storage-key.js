// @ts-check
// profile-storage-key.js — leaf helper for profile-scoped storage names.

/**
 * @param {string} profileId
 * @param {string} suffix
 * @returns {string}
 */
export function profileStorageKey(profileId, suffix) {
  return `labcharts-${profileId}-${suffix}`;
}
