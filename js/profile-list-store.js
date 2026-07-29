// @ts-check
// profile-list-store.js — Durable, serialized storage for profile metadata.

import { encryptedGetItem, encryptedSetItem } from './crypto.js';
import { state } from './state.js';
import { showNotification } from './utils.js';

/**
 * @typedef {{
 *   id: string,
 *   location?: { country: string, zip: string },
 *   tags?: string[],
 *   notes?: string,
 *   status?: string,
 *   createdAt?: number,
 *   lastUpdated?: number,
 *   pinned?: boolean,
 *   height?: number | string | null,
 *   heightUnit?: string,
 *   [key: string]: any,
 * }} StoredProfileRecord
 */

const profileListStoreDeps = {
  encryptedSetItem,
  showNotification,
};

/** @type {WeakMap<object, StoredProfileRecord[]>} */
const profileSnapshotOrigins = new WeakMap();

export function configureProfileListStoreDeps(deps = {}) {
  const previous = { ...profileListStoreDeps };
  if (typeof deps.encryptedSetItem === 'function') {
    profileListStoreDeps.encryptedSetItem = deps.encryptedSetItem;
  }
  if (typeof deps.showNotification === 'function') {
    profileListStoreDeps.showNotification = deps.showNotification;
  }
  return previous;
}

/** @param {StoredProfileRecord} profile */
function cloneProfileRecord(profile) {
  return {
    ...profile,
    location: profile.location ? { ...profile.location } : { country: '', zip: '' },
    tags: Array.isArray(profile.tags) ? [...profile.tags] : [],
  };
}

/** @param {StoredProfileRecord[]} profiles */
function cloneProfiles(profiles) {
  return profiles.map(cloneProfileRecord);
}

/**
 * Retain the durable base behind a caller-visible snapshot. Tracking both the
 * array and its records preserves provenance through common transforms such
 * as filter and spread.
 *
 * @param {StoredProfileRecord[]} snapshot
 */
function rememberProfileSnapshot(snapshot) {
  const base = cloneProfiles(snapshot);
  profileSnapshotOrigins.set(snapshot, base);
  for (const profile of snapshot) profileSnapshotOrigins.set(profile, base);
  return snapshot;
}

/** @param {StoredProfileRecord[]} profiles */
function getProfileSnapshotOrigin(profiles) {
  let origin = profileSnapshotOrigins.get(profiles);
  for (const profile of profiles) {
    const profileOrigin = profileSnapshotOrigins.get(profile);
    if (!profileOrigin) continue;
    if (origin && origin !== profileOrigin) return null;
    origin = profileOrigin;
  }
  return origin ? cloneProfiles(origin) : null;
}

/** @param {unknown} left @param {unknown} right */
function profileValuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Apply only the fields changed by the caller to the latest durable record.
 *
 * @param {StoredProfileRecord} base
 * @param {StoredProfileRecord} desired
 * @param {StoredProfileRecord} current
 */
function rebaseProfileRecord(base, desired, current) {
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
 * @param {StoredProfileRecord[]} base
 * @param {StoredProfileRecord[]} desired
 * @param {StoredProfileRecord[]} current
 */
function rebaseProfiles(base, desired, current) {
  const baseById = new Map(base.map(profile => [profile.id, profile]));
  const currentById = new Map(current.map(profile => [profile.id, profile]));
  const desiredIds = new Set(desired.map(profile => profile.id));
  const rebased = [];

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
 * @returns {StoredProfileRecord[]}
 */
export function getProfiles() {
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
  const raw = await encryptedGetItem('labcharts-profiles');
  /** @type {StoredProfileRecord[]} */
  let profiles = [];
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) profiles = parsed;
  } catch {}
  state.profiles = cloneProfiles(profiles);
  await migrateProfiles(profiles);
}

/** @param {StoredProfileRecord[]} profiles */
async function migrateProfiles(profiles) {
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

/**
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
function enqueueProfileWrite(operation) {
  const result = profileWriteTail.catch(() => {}).then(operation);
  profileWriteTail = result.then(() => {}, () => {});
  return result;
}

/** @param {StoredProfileRecord[]} profiles */
async function persistProfiles(profiles) {
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

/** @param {StoredProfileRecord[]} profiles */
export async function saveProfiles(profiles) {
  const base = getProfileSnapshotOrigin(profiles) || getProfiles();
  const desired = cloneProfiles(profiles);
  await enqueueProfileWrite(async () => {
    const rebased = rebaseProfiles(base, desired, getProfiles());
    await persistProfiles(rebased);
  });
}

/**
 * @template T
 * @param {(profiles: StoredProfileRecord[]) => { changed: boolean, value: T }} mutate
 * @returns {Promise<T>}
 */
export function mutateProfiles(mutate) {
  return enqueueProfileWrite(async () => {
    const profiles = getProfiles();
    const result = mutate(profiles);
    if (result.changed) await persistProfiles(profiles);
    return result.value;
  });
}
