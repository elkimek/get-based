// @ts-check
// sync-origin-state.js - Short-lived markers for this tab's committed pushes.

const LOCAL_COMMIT_TTL_MS = 10 * 60 * 1000;
const MAX_COMMITS_PER_PROFILE = 16;
const localCommitsByProfile = new Map();

function normalizedTimestamp(value) {
  const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function liveCommits(profileId, now = Date.now()) {
  const commits = localCommitsByProfile.get(profileId) || [];
  const live = commits.filter(commit => now - commit.notedAt <= LOCAL_COMMIT_TTL_MS);
  if (live.length) localCommitsByProfile.set(profileId, live);
  else localCommitsByProfile.delete(profileId);
  return live;
}

/**
 * Remember the exact `syncedAt` clock committed by this browser tab. Evolu
 * subscriptions echo local writes through the same pull path as remote rows;
 * this marker lets the UI suppress only the misleading remote-update toast.
 *
 * @param {string | null | undefined} profileId
 * @param {string | number | Date | null | undefined} syncedAt
 */
export function noteLocalSyncCommit(profileId, syncedAt) {
  const timestamp = normalizedTimestamp(syncedAt);
  if (!profileId || timestamp === null) return false;
  const commits = liveCommits(profileId).filter(commit => commit.timestamp !== timestamp);
  commits.push({ timestamp, notedAt: Date.now() });
  localCommitsByProfile.set(profileId, commits.slice(-MAX_COMMITS_PER_PROFILE));
  return true;
}

/** @param {string | null | undefined} profileId @param {number} remoteUpdated */
export function isLocalSyncCommitEcho(profileId, remoteUpdated) {
  const timestamp = normalizedTimestamp(remoteUpdated);
  if (!profileId || timestamp === null) return false;
  return liveCommits(profileId).some(commit => commit.timestamp === timestamp);
}

export function clearLocalSyncCommits() {
  localCommitsByProfile.clear();
}
