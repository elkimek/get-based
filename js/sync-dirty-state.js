// @ts-check
// sync-dirty-state.js - Durable local-change markers for pull ordering.

let dirtySequence = 0;

/** @param {string} profileId */
function dirtyKey(profileId) {
  return `labcharts-${profileId}-sync-dirty`;
}

/** @param {string | null | undefined} profileId */
export function getSyncDirtyToken(profileId) {
  if (!profileId) return null;
  try { return localStorage.getItem(dirtyKey(profileId)); } catch { return null; }
}

/** @param {string | null | undefined} profileId */
export function markSyncProfileDirty(profileId) {
  if (!profileId) return null;
  const token = `${Date.now()}:${++dirtySequence}`;
  try { localStorage.setItem(dirtyKey(profileId), token); } catch { return null; }
  return token;
}

/**
 * Clear only the generation a push actually captured. A second save can land
 * while Evolu is committing the first one; that newer dirty token must remain
 * so the follow-up push is not lost.
 *
 * @param {string | null | undefined} profileId
 * @param {string | null | undefined} expectedToken
 */
export function clearSyncProfileDirty(profileId, expectedToken) {
  if (!profileId || !expectedToken) return false;
  try {
    const key = dirtyKey(profileId);
    if (localStorage.getItem(key) !== expectedToken) return false;
    localStorage.removeItem(key);
    return true;
  } catch { return false; }
}
