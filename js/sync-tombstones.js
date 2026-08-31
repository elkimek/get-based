// @ts-check
// sync-tombstones.js - remote profile delete propagation and quarantine.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { profileStorageKey } from './profile-storage-key.js';
import { encryptedGetItem } from './crypto.js';
import { parseSyncPayload } from './sync-payload.js';
import { clearProfileStorage } from './profile-storage-cleanup.js';
import { createUniqueId } from './unique-id.js';
import { getSyncDirtyToken } from './sync-dirty-state.js';
import {
  clearLocalProfileDeleteIntent, hasPendingProfileTombstone,
  isDemoProfileId, isDemoProfileRecord, markLocalProfileDeleteIntent,
} from './profile-sync-policy.js';
import { SYNC_PROFILE_FIELDS } from './sync-profile-fields.js';

/** @type {() => any} */
let _getEvolu = () => null;
/** @type {() => any} */
let _getProfileQuery = () => null;
/** @type {() => any} */
let _getTombstoneQuery = () => null;
/** @type {() => boolean} */
let _isSyncEnabled = () => false;
/** @type {((profileId: string, data: any, options?: any) => Promise<any>) | null} */
let _pushProfile = null;
/** @type {(...args: any[]) => void} */
let _debug = () => {};
/** @type {() => any[]} */
let _getProfiles = () => [];
/** @type {(profiles: any[]) => Promise<void>} */
let _saveProfiles = async () => {};
/** @type {(profileId: string) => any} */
let _loadProfile = () => {};
/** @type {(...args: any[]) => any} */
let _notify = showNotification;

/** @param {{
 *   getEvolu?: () => any,
 *   getProfileQuery?: () => any,
 *   getTombstoneQuery?: () => any,
 *   isSyncEnabled?: () => boolean,
 *   pushProfile?: (profileId: string, data: any, options?: any) => Promise<any>,
 *   debug?: (...args: any[]) => void,
 *   getProfiles?: () => any[],
 *   saveProfiles?: (profiles: any[]) => Promise<void>,
 *   loadProfile?: (profileId: string) => any,
 *   notify?: (...args: any[]) => any,
 * }} [deps]
 */
export function configureSyncTombstones({
  getEvolu,
  getProfileQuery,
  getTombstoneQuery,
  isSyncEnabled,
  pushProfile,
  debug,
  getProfiles,
  saveProfiles,
  loadProfile,
  notify,
} = {}) {
  const previous = {
    getEvolu: _getEvolu,
    getProfileQuery: _getProfileQuery,
    getTombstoneQuery: _getTombstoneQuery,
    isSyncEnabled: _isSyncEnabled,
    pushProfile: _pushProfile,
    debug: _debug,
    getProfiles: _getProfiles,
    saveProfiles: _saveProfiles,
    loadProfile: _loadProfile,
    notify: _notify,
  };
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getProfileQuery === 'function') _getProfileQuery = getProfileQuery;
  if (typeof getTombstoneQuery === 'function') _getTombstoneQuery = getTombstoneQuery;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof pushProfile === 'function') _pushProfile = pushProfile;
  if (typeof debug === 'function') _debug = debug;
  if (typeof getProfiles === 'function') _getProfiles = getProfiles;
  if (typeof saveProfiles === 'function') _saveProfiles = saveProfiles;
  if (typeof loadProfile === 'function') _loadProfile = loadProfile;
  if (typeof notify === 'function') _notify = notify;
  return previous;
}

function currentEvolu() {
  try { return _getEvolu?.() || null; } catch { return null; }
}

function currentProfileQuery() {
  try { return _getProfileQuery?.() || null; } catch { return null; }
}

function currentTombstoneQuery() {
  try { return _getTombstoneQuery?.() || null; } catch { return null; }
}

function dbg(...args) {
  try { _debug(...args); } catch {}
}

/** @param {string} profileId */
const TOMBSTONE_QUARANTINE_KEY = (profileId) => `labcharts-tombstone-pending-${profileId}`;
const TOMBSTONE_BATCH_THRESHOLD = 2; // two or more tombstones at once require confirm

/** @param {string} profileId */
async function wipeProfileLocal(profileId) {
  await clearProfileStorage(profileId);
}

function rowClock(row) {
  const clock = Date.parse(row?.syncedAt || '');
  return Number.isFinite(clock) ? clock : 0;
}

async function recoverRowProfileId(row) {
  if (typeof row?.profileId === 'string' && /^[a-zA-Z0-9_-]+$/.test(row.profileId)) return row.profileId;
  try {
    const parsed = await parseSyncPayload(row?.dataJson || '{}');
    const candidate = parsed?.profile?.id;
    return typeof candidate === 'string' && /^[a-zA-Z0-9_-]+$/.test(candidate) ? candidate : '';
  } catch { return ''; }
}

async function latestRowsByProfileId(rows) {
  const latest = new Map();
  for (const row of rows || []) {
    const profileId = await recoverRowProfileId(row);
    if (!profileId) continue;
    const previous = latest.get(profileId);
    if (!previous || rowClock(row) >= rowClock(previous)) latest.set(profileId, row);
  }
  return latest;
}

function createFallbackProfile(existingProfiles, replacedProfileId = '') {
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
  // This marker is local-only (not in SYNC_PROFILE_FIELDS). If the deleting
  // device has also published a replacement profile but its row arrives a
  // moment later, the pull merge can discard this untouched safety profile
  // instead of leaving the peer with two empty profiles.
  if (replacedProfileId) {
    profile._syncFallback = [replacedProfileId, now];
  }
  return profile;
}

async function findRelayReplacementProfile(latestLiveRows, tombIds) {
  for (const [profileId, row] of latestLiveRows) {
    if (tombIds.has(profileId)) continue;
    try {
      const payload = await parseSyncPayload(row?.dataJson || '');
      if (!payload?.profile || isDemoProfileRecord(payload.profile)) continue;
      const now = Date.now();
      const replacement = createFallbackProfile([{ id: profileId }]);
      replacement.id = profileId;
      replacement.createdAt = now;
      replacement.lastUpdated = now;
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

// Soft-delete a profile's row on the relay so other devices stop seeing it.
// Local wipe alone is insufficient: otherwise any peer that pulls the old
// Evolu row can resurrect the deleted profile.
/** @param {string | null | undefined} profileId */
export async function deleteProfileFromRelay(profileId) {
  const evolu = currentEvolu();
  const profileQuery = currentProfileQuery();
  if (!evolu || !profileQuery || !_isSyncEnabled()) return { skipped: true, reason: 'sync-off' };
  if (!profileId || typeof profileId !== 'string') return { skipped: true, reason: 'bad-id' };
  try {
    const rows = evolu.getQueryRows(profileQuery) || [];
    const matching = [];
    for (const row of rows) {
      if (await recoverRowProfileId(row) === profileId) matching.push(row);
    }
    if (!matching.length) return { skipped: true, reason: 'no-row' };
    // Carry profileId explicitly so post-compaction replicas of this
    // tombstone still know which local profile to wipe.
    const syncedAt = new Date().toISOString();
    for (const row of matching) {
      evolu.update('profileData', { id: row.id, profileId, isDeleted: 1, syncedAt });
    }
    localStorage.removeItem(`labcharts-${profileId}-sync-ts`);
    dbg('Soft-deleted on relay:', profileId);
    return { ok: true, deletedRows: matching.length };
  } catch (e) {
    console.error('[sync] Profile delete propagation failed:', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Wipe local copies of any profiles that were tombstoned on the relay. Runs
// before live-row processing so deleted profiles do not remain as ghosts in
// the local profile list.
export async function applyRemoteTombstones() {
  const evolu = currentEvolu();
  const tombstoneQuery = currentTombstoneQuery();
  const profileQuery = currentProfileQuery();
  if (!evolu || !tombstoneQuery || !profileQuery) return;
  const tombs = evolu.getQueryRows(tombstoneQuery) || [];
  if (tombs.length === 0) return;
  const profiles = _getProfiles();

  const [latestTombstones, latestLiveRows] = await Promise.all([
    latestRowsByProfileId(tombs),
    latestRowsByProfileId(evolu.getQueryRows(profileQuery) || []),
  ]);
  const tombIds = new Set();
  for (const [profileId, tombstone] of latestTombstones) {
    const live = latestLiveRows.get(profileId);
    // A newer live row is an explicit Restore/Keep. An older tombstone must
    // not erase it again on every subscription callback. Retire the deleting
    // browser's durable intent too; otherwise its pull loop rejects the newer
    // live row and writes a fresh tombstone, creating a permanent delete loop.
    if (!live || rowClock(tombstone) >= rowClock(live)) tombIds.add(profileId);
    else {
      if (hasPendingProfileTombstone(profileId)) {
        localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
      }
      clearLocalProfileDeleteIntent(profileId);
    }
  }

  // Demos are local fixtures. Legacy demo tombstones must not delete a demo
  // that this browser can recreate without the relay.
  const localToWipe = profiles
    .filter(profile => tombIds.has(profile.id) && !isDemoProfileId(profile.id, profiles))
    .map(profile => profile.id);
  if (localToWipe.length === 0) return;

  // Batched remote deletes are powerful enough to wipe many local profiles.
  // A single delete also needs confirmation when it collides with unsynced
  // local edits; wiping it here would destroy the profile and its dirty token
  // before the pending snapshot gets a chance to reach the relay.
  const hasDirtyConflict = localToWipe.some(id => getSyncDirtyToken(id));
  // Once quarantined, confirmation itself is the durable gate. Do not make a
  // later pull depend on an auxiliary dirty token that another path, tab, or
  // older build may have cleared in the meantime.
  const pending = localToWipe.filter(id => !hasPendingProfileTombstone(id));
  if (localToWipe.length >= TOMBSTONE_BATCH_THRESHOLD || hasDirtyConflict || pending.length < localToWipe.length) {
    for (const id of pending) {
      localStorage.setItem(TOMBSTONE_QUARANTINE_KEY(id), JSON.stringify({ at: Date.now(), source: 'remote' }));
    }
    dbg(`Quarantined ${pending.length} tombstone(s) - require user confirm before wipe:`, pending.join(','));
    if (pending.length > 0) {
      const localChangeNotice = hasDirtyConflict ? ' with unsynced local changes' : '';
      _notify(
        `${pending.length} profile${pending.length === 1 ? '' : 's'} deleted on another device${localChangeNotice}. Open Settings → Data → Cross-Device Sync to choose Apply delete or Restore.`,
        'info', 6000
      );
    }
    return;
  }

  const wipedIds = [];
  for (const tombId of localToWipe) {
    markLocalProfileDeleteIntent(tombId, 'remote');
    try { await wipeProfileLocal(tombId); }
    catch (error) {
      clearLocalProfileDeleteIntent(tombId);
      throw error;
    }
    wipedIds.push(tombId);
  }
  if (wipedIds.length === 0) return;

  const survivors = profiles.filter(profile => !wipedIds.includes(profile.id));
  if (survivors.length === 0) {
    // Clear-all publishes a fresh profile id and tombstones the old ids in the
    // same relay update. Adopt that already-live replacement immediately;
    // otherwise deleting the last local profile creates a second, browser-only
    // fallback just before the pull loop materializes the intended fresh row.
    const relayReplacement = await findRelayReplacementProfile(latestLiveRows, tombIds);
    survivors.push(relayReplacement || createFallbackProfile(profiles, wipedIds.join(',')));
  }
  await _saveProfiles(survivors);
  for (const id of wipedIds) localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(id));
  dbg(`Applied ${wipedIds.length} remote tombstone(s):`, wipedIds.join(', '));

  if (wipedIds.includes(state.currentProfile)) {
    _notify(`Profile was deleted on another device - switching to "${survivors[0].name || 'next'}"`, 'info', 3500);
    await _loadProfile(survivors[0].id);
  }
}

export function listPendingTombstones() {
  const out = [];
  const profiles = _getProfiles();
  for (const p of profiles) {
    if (isDemoProfileId(p.id, profiles)) continue;
    const raw = localStorage.getItem(TOMBSTONE_QUARANTINE_KEY(p.id));
    if (!raw) continue;
    try { out.push({ id: p.id, name: p.name || p.id, ...(JSON.parse(raw) || {}) }); }
    catch { out.push({ id: p.id, name: p.name || p.id }); }
  }
  return out;
}

/** @param {string} profileId */
export async function applyPendingTombstone(profileId) {
  const profiles = _getProfiles();
  if (!profiles.some(profile => profile?.id === profileId)) {
    localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
    return { ok: true, skipped: true, reason: 'already-absent' };
  }
  markLocalProfileDeleteIntent(profileId, 'remote-confirmed');
  try { await wipeProfileLocal(profileId); }
  catch (error) {
    clearLocalProfileDeleteIntent(profileId);
    throw error;
  }
  const survivors = profiles.filter(p => p.id !== profileId);
  if (survivors.length === 0) survivors.push(createFallbackProfile(profiles, profileId));
  await _saveProfiles(survivors);
  localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
  if (state.currentProfile === profileId) await _loadProfile(survivors[0].id);
  return { ok: true };
}

/** @param {string} profileId */
export async function rejectPendingTombstone(profileId) {
  const profiles = _getProfiles();
  if (isDemoProfileId(profileId, profiles)) {
    localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
    clearLocalProfileDeleteIntent(profileId);
    return { ok: true, skipped: true, reason: 'demo-local-only' };
  }
  if (!currentEvolu() || !_isSyncEnabled()) return { ok: false, reason: 'sync-off' };
  // Active edits can be newer than the persisted blob.
  let data = state.importedData;
  if (profileId !== state.currentProfile) {
    const localKey = profileStorageKey(profileId, 'imported');
    // Imported profile blobs are IDB-backed even when encryption is disabled.
    const raw = await encryptedGetItem(localKey);
    if (!raw) {
      localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
      return { ok: false, reason: 'no-local-data' };
    }
    try { data = JSON.parse(raw); } catch { return { ok: false, reason: 'bad-local-json' }; }
  }
  if (!_pushProfile) return { ok: false, reason: 'sync-off' };
  const result = await _pushProfile(profileId, data, { allowTombstoneResurrection: true });
  if (!result?.ok) return { ok: false, reason: result?.reason || 'push-failed' };
  localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
  clearLocalProfileDeleteIntent(profileId);
  return { ok: true };
}
