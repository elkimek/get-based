// sync-origin-state.js - Short-lived markers for this tab's committed pushes.

const LOCAL_COMMIT_TTL_MS = 10 * 60 * 1000;
const MAX_COMMITS_PER_PROFILE = 16;
const localCommitsByProfile = new Map<string, { timestamp: number; notedAt: number }[]>();

function normalizedTimestamp(value: unknown) {
  const timestamp = typeof value === 'number' ? value : new Date(value as string).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function liveCommits(profileId: string, now = Date.now()) {
  const commits = localCommitsByProfile.get(profileId) || [];
  const live = commits.filter(commit => now - commit.notedAt <= LOCAL_COMMIT_TTL_MS);
  if (live.length) localCommitsByProfile.set(profileId, live);
  else localCommitsByProfile.delete(profileId);
  return live;
}

export function noteLocalSyncCommit(profileId: string | null | undefined, syncedAt: unknown) {
  const timestamp = normalizedTimestamp(syncedAt);
  if (!profileId || timestamp === null) return false;
  const commits = liveCommits(profileId).filter(commit => commit.timestamp !== timestamp);
  commits.push({ timestamp, notedAt: Date.now() });
  localCommitsByProfile.set(profileId, commits.slice(-MAX_COMMITS_PER_PROFILE));
  return true;
}

export function isLocalSyncCommitEcho(profileId: string | null | undefined, remoteUpdated: unknown) {
  const timestamp = normalizedTimestamp(remoteUpdated);
  if (!profileId || timestamp === null) return false;
  return liveCommits(profileId).some(commit => commit.timestamp === timestamp);
}

export function clearLocalSyncCommits() {
  localCommitsByProfile.clear();
}
