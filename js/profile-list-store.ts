import { configureRuntimeFunctions } from './runtime-callbacks.js';
// profile-list-store.js — Durable, serialized storage for profile metadata.

import { encryptedGetItem, encryptedSetItem } from './crypto.js';
import { state } from './state.js';
import { showNotification } from './utils.js';

export interface StoredProfileRecord {
  id: string;
  name?: string;
  sex?: string | null;
  dob?: string | null;
  avatar?: string | null;
  location?: { country: string; zip: string };
  tags?: string[];
  notes?: string;
  status?: string;
  createdAt?: number;
  lastUpdated?: number;
  pinned?: boolean;
  height?: number | string | null;
  heightUnit?: string;
  [key: string]: unknown;
}
export interface ProfileListStoreDeps {
  encryptedSetItem: typeof encryptedSetItem;
  showNotification: typeof showNotification;
}

const profileListStoreDeps: ProfileListStoreDeps = {
  encryptedSetItem,
  showNotification,
};

const profileSnapshotOrigins = new WeakMap<object, StoredProfileRecord[]>();

export function configureProfileListStoreDeps(deps: Partial<ProfileListStoreDeps> = {}) {
  return configureRuntimeFunctions(profileListStoreDeps, deps, ["encryptedSetItem","showNotification"]);
}

function cloneProfileRecord(profile: StoredProfileRecord): StoredProfileRecord {
  return {
    ...profile,
    location: profile.location ? { ...profile.location } : { country: '', zip: '' },
    tags: Array.isArray(profile.tags) ? [...profile.tags] : [],
  };
}

function cloneProfiles(profiles: StoredProfileRecord[]) {
  return profiles.map(cloneProfileRecord);
}

/**
 * Retain the durable base behind a caller-visible snapshot. Tracking both the
 * array and its records preserves provenance through common transforms such
 * as filter and spread.
 *
 */
function rememberProfileSnapshot(snapshot: StoredProfileRecord[]) {
  const base = cloneProfiles(snapshot);
  profileSnapshotOrigins.set(snapshot, base);
  for (const profile of snapshot) profileSnapshotOrigins.set(profile, base);
  return snapshot;
}

function getProfileSnapshotOrigin(profiles: StoredProfileRecord[]) {
  let origin = profileSnapshotOrigins.get(profiles);
  for (const profile of profiles) {
    const profileOrigin = profileSnapshotOrigins.get(profile);
    if (!profileOrigin) continue;
    if (origin && origin !== profileOrigin) return null;
    origin = profileOrigin;
  }
  return origin ? cloneProfiles(origin) : null;
}

function profileValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Apply only the fields changed by the caller to the latest durable record.
 *
 */
function rebaseProfileRecord(base: StoredProfileRecord, desired: StoredProfileRecord, current: StoredProfileRecord) {
  const rebased = cloneProfileRecord(current);
  const keys = new Set([...Object.keys(base), ...Object.keys(desired)]);
  for (const key of keys) {
    if (profileValuesEqual(base[key], desired[key])) continue;
    if (Object.hasOwn(desired, key)) {
      rebased[key] = desired[key];
    } else {
      delete rebased[key];
    }
  }
  return cloneProfileRecord(rebased);
}

/**
 * Rebase a whole-list save over writes that completed after the caller read
 * the cache. Caller removals and additions win, while unrelated concurrent
 * profile and field changes remain intact.
 *
 */
function rebaseProfiles(base: StoredProfileRecord[], desired: StoredProfileRecord[], current: StoredProfileRecord[]) {
  const baseById = new Map(base.map(profile => [profile.id, profile]));
  const currentById = new Map(current.map(profile => [profile.id, profile]));
  const desiredIds = new Set(desired.map(profile => profile.id));
  const rebased: StoredProfileRecord[] = [];

  for (const desiredProfile of desired) {
    const baseProfile = baseById.get(desiredProfile.id);
    const currentProfile = currentById.get(desiredProfile.id);
    if (!baseProfile || !currentProfile) {
      const unchangedSinceRead = baseProfile
        && profileValuesEqual(baseProfile, desiredProfile);
      if (!unchangedSinceRead) rebased.push(cloneProfileRecord(desiredProfile));
      continue;
    }
    rebased.push(rebaseProfileRecord(baseProfile, desiredProfile, currentProfile));
  }

  for (const currentProfile of current) {
    const addedByEarlierWrite = !baseById.has(currentProfile.id);
    if (addedByEarlierWrite && !desiredIds.has(currentProfile.id)) {
      rebased.push(cloneProfileRecord(currentProfile));
    }
  }

  return rebased;
}

/**
 * Return a snapshot so callers cannot make the cache claim a change was
 * saved merely by mutating an object reference.
 *
 */
export function getProfiles(): StoredProfileRecord[] {
  if (Array.isArray(state.profiles)) {
    return rememberProfileSnapshot(cloneProfiles(state.profiles));
  }
  try {
    const raw = localStorage.getItem('labcharts-profiles');
    const profiles = raw ? JSON.parse(raw) : [];
    const snapshot = Array.isArray(profiles) ? cloneProfiles(profiles) : [];
    return rememberProfileSnapshot(snapshot);
  } catch {
    return rememberProfileSnapshot([]);
  }
}

export async function initProfilesCache() {
  const raw = await encryptedGetItem('labcharts-profiles', { throwOnDecryptError: true });
  let profiles: StoredProfileRecord[] = [];
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) profiles = parsed;
  } catch {}
  state.profiles = cloneProfiles(profiles);
  await migrateProfiles(profiles);
}

async function migrateProfiles(profiles: StoredProfileRecord[]) {
  const migrated = cloneProfiles(profiles);
  let changed = false;
  const now = Date.now();
  for (const profile of migrated) {
    if (!Array.isArray(profile.tags)) { profile.tags = []; changed = true; }
    if (typeof profile.notes !== 'string') { profile.notes = ''; changed = true; }
    if (!profile.status) { profile.status = 'active'; changed = true; }
    if (!profile.createdAt) { profile.createdAt = now; changed = true; }
    if (!profile.lastUpdated) { profile.lastUpdated = now; changed = true; }
    if (typeof profile.pinned !== 'boolean') { profile.pinned = false; changed = true; }
    if (profile.height === undefined) { profile.height = null; changed = true; }
    if (profile.heightUnit === undefined) { profile.heightUnit = 'cm'; changed = true; }
  }
  if (changed) await saveProfiles(migrated);
}

let profileWriteTail = Promise.resolve();

function enqueueProfileWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = profileWriteTail.catch(() => {}).then(operation);
  profileWriteTail = result.then(() => {}, () => {});
  return result;
}

async function persistProfiles(profiles: StoredProfileRecord[]) {
  try {
    const value = JSON.stringify(profiles);
    await profileListStoreDeps.encryptedSetItem('labcharts-profiles', value);
    state.profiles = profiles;
  } catch (error) {
    profileListStoreDeps.showNotification(
      'Storage limit reached — could not save profile changes.',
      'error',
    );
    throw error;
  }
}

export async function saveProfiles(profiles: StoredProfileRecord[]) {
  const base = getProfileSnapshotOrigin(profiles) || getProfiles();
  const desired = cloneProfiles(profiles);
  await enqueueProfileWrite(async () => {
    const rebased = rebaseProfiles(base, desired, getProfiles());
    await persistProfiles(rebased);
  });
}

export function mutateProfiles<T>(mutate: (profiles: StoredProfileRecord[]) => { changed: boolean; value: T }): Promise<T> {
  return enqueueProfileWrite(async () => {
    const profiles = getProfiles();
    const result = mutate(profiles);
    if (result.changed) await persistProfiles(profiles);
    return result.value;
  });
}
