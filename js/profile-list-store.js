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
 * Return a snapshot so callers cannot make the cache claim a change was
 * saved merely by mutating an object reference.
 *
 * @returns {StoredProfileRecord[]}
 */
export function getProfiles() {
  if (Array.isArray(state.profiles)) return cloneProfiles(state.profiles);
  try {
    const raw = localStorage.getItem('labcharts-profiles');
    const profiles = raw ? JSON.parse(raw) : [];
    return Array.isArray(profiles) ? cloneProfiles(profiles) : [];
  } catch {
    return [];
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
  const snapshot = cloneProfiles(profiles);
  await enqueueProfileWrite(() => persistProfiles(snapshot));
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
