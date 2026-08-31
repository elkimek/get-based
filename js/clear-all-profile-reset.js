// @ts-check
// clear-all-profile-reset.js — profile identity helpers for a durable clear-all.

import { markLocalProfileDeleteIntent } from './profile-sync-policy.js';
import { createUniqueId } from './unique-id.js';

/** @param {string} [name] @param {number} [now] */
export function createClearedProfileRecord(name = 'Profile 1', now = Date.now()) {
  return {
    id: createUniqueId('p_'),
    name,
    sex: null,
    dob: null,
    location: { country: '', zip: '' },
    tags: [],
    notes: '',
    status: 'active',
    avatar: null,
    height: null,
    heightUnit: 'cm',
    createdAt: now,
    lastUpdated: now,
    pinned: false,
  };
}

/**
 * A clear-all is an explicit deletion, not an empty update. Remember that
 * decision before yielding to any sync work so an incoming live row cannot
 * recreate one of the cleared profiles.
 * @param {Array<string | null | undefined>} profileIds
 * @returns {string[]}
 */
export function markClearedProfilesForSync(profileIds) {
  /** @type {string[]} */
  const validIds = [];
  for (const profileId of profileIds) {
    if (typeof profileId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(profileId)) {
      validIds.push(profileId);
    }
  }
  /** @type {string[]} */
  const marked = [];
  for (const profileId of new Set(validIds)) {
    if (markLocalProfileDeleteIntent(profileId, 'clear-all')) marked.push(profileId);
  }
  return marked;
}

/**
 * Relay propagation is best-effort. Durable delete intents above make an
 * offline/paused browser retry when those old rows are encountered later.
 * @param {string[]} profileIds
 * @param {(profileId: string) => Promise<any> | any} deleteProfileFromRelay
 */
export async function propagateClearedProfilesToRelay(profileIds, deleteProfileFromRelay) {
  return Promise.allSettled(profileIds.map(profileId => deleteProfileFromRelay(profileId)));
}
