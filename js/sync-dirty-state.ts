// sync-dirty-state.js - Durable local-change markers for pull ordering.

let dirtySequence = 0;

function dirtyKey(profileId: string) {
  return `labcharts-${profileId}-sync-dirty`;
}

export function getSyncDirtyToken(profileId: string | null | undefined) {
  if (!profileId) return null;
  try { return localStorage.getItem(dirtyKey(profileId)); } catch { return null; }
}

export function markSyncProfileDirty(profileId: string | null | undefined) {
  if (!profileId) return null;
  const token = `${Date.now()}:${++dirtySequence}`;
  try { localStorage.setItem(dirtyKey(profileId), token); } catch { return null; }
  return token;
}

export function clearSyncProfileDirty(profileId: string | null | undefined, expectedToken: string | null | undefined) {
  if (!profileId || !expectedToken) return false;
  try {
    const key = dirtyKey(profileId);
    if (localStorage.getItem(key) !== expectedToken) return false;
    localStorage.removeItem(key);
    return true;
  } catch { return false; }
}

/** Clear a dirty marker when policy guarantees this profile must not sync. */
export function discardSyncProfileDirty(profileId: string | null | undefined) {
  if (!profileId) return false;
  try {
    localStorage.removeItem(dirtyKey(profileId));
    return true;
  } catch { return false; }
}
