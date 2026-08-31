// @ts-check
// clear-all-profile-reset.js — profile identity helpers for a durable clear-all.

import { encryptedGetItem } from './crypto.js';
import { profileStorageKey } from './profile-storage-key.js';
import {
  isDemoProfileRecord, markLocalProfileDeleteIntent, PROFILE_DELETE_INTENT_PREFIX,
  TOMBSTONE_QUARANTINE_PREFIX,
} from './profile-sync-policy.js';
import { parseSyncPayload } from './sync-payload.js';
import { SYNC_PROFILE_FIELDS } from './sync-profile-fields.js';
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

// Delete decisions are scoped to one Evolu owner. A new owner must not inherit
// the old owner's durable intent/quarantine state for matching profile IDs.
export function clearAllProfileSyncDeleteState() {
  let cleared = 0;
  try {
    const keys = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key && (key.startsWith(TOMBSTONE_QUARANTINE_PREFIX)
        || key.startsWith(PROFILE_DELETE_INTENT_PREFIX))) keys.push(key);
    }
    for (const key of keys) {
      localStorage.removeItem(key);
      cleared++;
    }
  } catch {}
  return cleared;
}

export function createSyncFallbackProfile(existingProfiles, replacedProfileId = '') {
  const ids = new Set((existingProfiles || []).map(profile => profile?.id).filter(Boolean));
  let id;
  do id = createUniqueId('p_'); while (ids.has(id));
  const now = Date.now();
  const profile = {
    id,
    name: 'Profile 1',
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
  // Local-only marker: a replacement row arriving moments later may discard
  // this untouched safety profile without leaving two empty profiles behind.
  if (replacedProfileId) profile._syncFallback = [replacedProfileId, now];
  return profile;
}

export async function findRelayReplacementProfile(latestLiveRows, tombIds) {
  for (const [profileId, row] of latestLiveRows) {
    if (tombIds.has(profileId)) continue;
    try {
      const payload = await parseSyncPayload(row?.dataJson || '');
      if (!payload?.profile || isDemoProfileRecord(payload.profile)) continue;
      const replacement = createSyncFallbackProfile([{ id: profileId }]);
      replacement.id = profileId;
      for (const field of SYNC_PROFILE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(payload.profile, field)) {
          replacement[field] = payload.profile[field];
        }
      }
      return replacement;
    } catch {}
  }
  return null;
}

export async function removeUntouchedSyncFallback(profiles) {
  for (const candidate of profiles) {
    if (!candidate?._syncFallback?.[0]) continue;
    const fallbackAt = Number(candidate._syncFallback[1] || 0);
    if (!fallbackAt || Date.now() - fallbackAt > 120_000
        || candidate.createdAt !== fallbackAt || candidate.lastUpdated !== fallbackAt) continue;
    try {
      const stored = await encryptedGetItem(profileStorageKey(candidate.id, 'imported'));
      const prefix = `labcharts-${candidate.id}-`;
      const hasScopedLocalState = Object.keys(localStorage)
        .some(key => key.startsWith(prefix) && key !== `${prefix}lastViewV1`);
      if (stored === null && !hasScopedLocalState) {
        profiles.splice(profiles.indexOf(candidate), 1);
        return candidate.id;
      }
    } catch {}
  }
  return '';
}
