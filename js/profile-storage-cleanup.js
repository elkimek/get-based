// @ts-check
// profile-storage-cleanup.js — complete profile-scoped browser storage cleanup.

import { encryptedRemoveItem } from './crypto.js';
import { getBlobKeys } from './blob-storage.js';
import { profileStorageKey } from './profile-storage-key.js';
import { deleteCycleDB } from './cycle-store.js';
import { deleteWearablesDB } from './wearables-store.js';

const PROFILE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const PROFILE_BLOB_KEY_RE = /^labcharts-([A-Za-z0-9_-]{1,128})-imported(?:-corrupt)?$/;
const PROFILE_DATABASE_RE = /^(?:labcharts-(?:wearables|cycle)|getbased-nutrition)-([A-Za-z0-9_-]{1,128})$/;
const ALTERNATE_LOCAL_PREFIXES = [
  'labcharts-onboard-provider-skipped-',
  'labcharts-onboard-extras-done-',
  'labcharts-onboard-context-cards-skipped-',
  'labcharts-onboard-context-cards-done-',
  'labcharts-chat-nudge-dismissed-',
  'labcharts-wearable-stub-dismissed-',
  'labcharts-tombstone-pending-',
];

const cleanupDeps = {
  encryptedRemoveItem,
  getBlobKeys,
  getDatabaseNames: async () => {
    if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return [];
    const databases = await indexedDB.databases();
    return databases.map(database => database.name).filter(name => typeof name === 'string');
  },
  deleteWearablesDB: async (profileId) => {
    if (typeof indexedDB === 'undefined') return;
    await deleteWearablesDB(profileId);
  },
  deleteCycleDB: async (profileId) => {
    if (typeof indexedDB === 'undefined') return;
    await deleteCycleDB(profileId);
  },
  deleteNutritionDB: async (profileId) => {
    if (typeof indexedDB === 'undefined') return;
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(`getbased-nutrition-${profileId}`);
      request.onsuccess = () => resolve(undefined);
      request.onerror = () => reject(request.error || new Error('Meal data could not be deleted.'));
      request.onblocked = () => reject(new Error('Meal data deletion is blocked by another open tab.'));
    });
  },
};

export function configureProfileStorageCleanupDeps(deps = {}) {
  const previous = { ...cleanupDeps };
  for (const key of Object.keys(cleanupDeps)) {
    if (typeof deps[key] === 'function') cleanupDeps[key] = deps[key];
  }
  return previous;
}

function storageKeys(storage) {
  const keys = [];
  if (!storage) return keys;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }
  return keys;
}

function addProfileId(ids, value) {
  if (typeof value === 'string' && PROFILE_ID_RE.test(value)) ids.add(value);
}

function addProfileIdFromBlobKey(ids, key) {
  const match = typeof key === 'string' ? key.match(PROFILE_BLOB_KEY_RE) : null;
  if (match) addProfileId(ids, match[1]);
}

function addProfileIdFromDatabaseName(ids, name) {
  const match = typeof name === 'string' ? name.match(PROFILE_DATABASE_RE) : null;
  if (match) addProfileId(ids, match[1]);
}

export async function listStoredProfileIds(seedIds = []) {
  const ids = new Set();
  for (const id of seedIds) addProfileId(ids, id);
  for (const key of storageKeys(globalThis.localStorage)) addProfileIdFromBlobKey(ids, key);
  for (const key of await cleanupDeps.getBlobKeys()) addProfileIdFromBlobKey(ids, key);
  for (const name of await cleanupDeps.getDatabaseNames()) addProfileIdFromDatabaseName(ids, name);
  return [...ids];
}

function clearProfileLocalKeys(profileId) {
  const storage = globalThis.localStorage;
  const standardPrefix = `labcharts-${profileId}-`;
  const alternateKeys = new Set(ALTERNATE_LOCAL_PREFIXES.map(prefix => `${prefix}${profileId}`));
  for (const key of storageKeys(storage)) {
    if (key.startsWith(standardPrefix) || alternateKeys.has(key)) {
      storage.removeItem(key);
    }
  }
}

function clearProfileSessionKeys(profileId) {
  const storage = globalThis.sessionStorage;
  for (const key of storageKeys(storage)) {
    if (key.startsWith('chat-onboard-') && key.endsWith(`-${profileId}`)) {
      storage.removeItem(key);
    }
  }
}

export async function clearProfileStorage(profileId) {
  if (!PROFILE_ID_RE.test(profileId || '')) throw new Error('Invalid profile id for storage cleanup.');

  // Delete dedicated databases first. If another tab blocks either delete,
  // leave the canonical profile/localStorage records intact so the user can
  // close the tab and retry instead of seeing a false-success deletion.
  await Promise.all([
    cleanupDeps.deleteWearablesDB(profileId),
    cleanupDeps.deleteCycleDB(profileId),
    cleanupDeps.deleteNutritionDB(profileId),
  ]);

  await Promise.all([
    cleanupDeps.encryptedRemoveItem(
      profileStorageKey(profileId, 'imported'),
      { throwOnBlobError: true },
    ),
    cleanupDeps.encryptedRemoveItem(
      profileStorageKey(profileId, 'imported-corrupt'),
      { throwOnBlobError: true },
    ),
  ]);

  // Prefix cleanup covers chat messages even when an encrypted/corrupt thread
  // index cannot be parsed, plus new profile-scoped keys added in the future.
  clearProfileLocalKeys(profileId);
  clearProfileSessionKeys(profileId);
}
