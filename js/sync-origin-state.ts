// sync-origin-state.js - Short-lived markers for this tab's committed pushes.
import { selectSyncedProfile } from './sync-profile-fields.js';

const LOCAL_COMMIT_TTL_MS = 10 * 60 * 1000;
const MAX_COMMITS_PER_PROFILE = 16;
const localCommitsByProfile = new Map<string, { timestamp: number; notedAt: number }[]>();
const supersededMetadata = new Map<string, { timestamp: number; profile: string; notedAt: number }[]>();

export function noteSupersededProfileMetadata(profileId: string, rows: readonly { syncedAt?: unknown; profile?: unknown }[]) {
  const now = Date.now();
  const entries = (supersededMetadata.get(profileId) || []).filter(entry => now - entry.notedAt <= LOCAL_COMMIT_TTL_MS);
  for (const row of rows) {
    const timestamp = normalizedTimestamp(row.syncedAt), profile = selectSyncedProfile(row.profile);
    if (timestamp === null || !profile) continue;
    const encoded = JSON.stringify(profile);
    if (!entries.some(entry => entry.timestamp === timestamp && entry.profile === encoded)) entries.push({ timestamp, profile: encoded, notedAt: now });
  }
  supersededMetadata.set(profileId, entries.slice(-MAX_COMMITS_PER_PROFILE));
}

/** Ignore only the exact cached metadata version replaced by a successful local
 * push. A different remote version is still eligible, regardless of clock skew. */
export function isSupersededProfileMetadata(profileId: string, syncedAt: unknown, profile: unknown) {
  const timestamp = normalizedTimestamp(syncedAt), encoded = JSON.stringify(selectSyncedProfile(profile));
  const entries = (supersededMetadata.get(profileId) || []).filter(entry => Date.now() - entry.notedAt <= LOCAL_COMMIT_TTL_MS);
  if (entries.length) supersededMetadata.set(profileId, entries); else supersededMetadata.delete(profileId);
  return entries.some(entry => entry.timestamp === timestamp && entry.profile === encoded);
}

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
  supersededMetadata.clear();
}
