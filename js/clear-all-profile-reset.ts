import type { SyncProfileRecord, SyncProfileRow } from './sync-payload.js';

// clear-all-profile-reset.ts — profile identity helpers for a durable clear-all.

import { encryptedGetItem } from './crypto.js';
import { profileStorageKey } from './profile-storage-key.js';
import {
  isDemoProfileRecord, markLocalProfileDeleteIntent, PROFILE_DELETE_INTENT_PREFIX,
  TOMBSTONE_QUARANTINE_PREFIX,
} from './profile-sync-policy.js';
import { parseSyncPayload } from './sync-payload.js';
import { SYNC_PROFILE_FIELDS } from './sync-profile-fields.js';
import { createUniqueId } from './unique-id.js';

function emptyProfileRecord(id: string, name: string, now: number) {
  return {
    id,
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

export function createClearedProfileRecord(name = 'Profile 1', now = Date.now()) {
  return emptyProfileRecord(createUniqueId('p_'), name, now);
}

export function markClearedProfilesForSync(profileIds: Array<string | null | undefined>) {
  const validIds: string[] = [];
  for (const profileId of profileIds) {
    if (typeof profileId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(profileId)) {
      validIds.push(profileId);
    }
  }
  const marked: string[] = [];
  for (const profileId of new Set(validIds)) {
    if (markLocalProfileDeleteIntent(profileId, 'clear-all')) marked.push(profileId);
  }
  return marked;
}

export async function propagateClearedProfilesToRelay(profileIds: string[], deleteProfileFromRelay: (profileId: string) => unknown) {
  return Promise.allSettled(profileIds.map(profileId => deleteProfileFromRelay(profileId)));
}

// Delete decisions are scoped to one Evolu owner. A new owner must not inherit
// the old owner's durable intent/quarantine state for matching profile IDs.
export function clearAllProfileSyncDeleteState() {
  let cleared = 0;
  try {
    const keys: string[] = [];
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

export function createSyncFallbackProfile(existingProfiles: readonly SyncProfileRecord[], replacedProfileId = '') {
  const ids = new Set((existingProfiles || []).map(profile => profile?.id).filter(Boolean));
  let id: string;
  do id = createUniqueId('p_'); while (ids.has(id));
  const now = Date.now();
  const profile: SyncProfileRecord = emptyProfileRecord(id, 'Profile 1', now);
  // Local-only marker: a replacement row arriving moments later may discard
  // this untouched safety profile without leaving two empty profiles behind.
  if (replacedProfileId) profile._syncFallback = [replacedProfileId, now];
  return profile;
}

export async function findRelayReplacementProfile(latestLiveRows: ReadonlyMap<string, SyncProfileRow>, tombIds: ReadonlySet<string>) {
  for (const [profileId, row] of latestLiveRows) {
    if (tombIds.has(profileId)) continue;
    try {
      const payload = await parseSyncPayload(row?.dataJson || '');
      if (!payload?.profile || isDemoProfileRecord(payload.profile)) continue;
      const replacement = createSyncFallbackProfile([{ id: profileId }]);
      replacement.id = profileId;
      for (const field of SYNC_PROFILE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(payload.profile, field)) {
          replacement[field] = (payload.profile as Record<string, unknown>)[field];
        }
      }
      return replacement;
    } catch {}
  }
  return null;
}

export async function removeUntouchedSyncFallback(profiles: SyncProfileRecord[]) {
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
