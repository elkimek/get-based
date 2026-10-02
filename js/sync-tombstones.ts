import type { SyncProfileRecord, SyncProfileRow } from './sync-payload.js';

interface ProfileRelayClient {
  getQueryRows(query: unknown): readonly SyncProfileRow[] | null | undefined;
  update?(table: 'profileData', row: { id: unknown; profileId: string; isDeleted: 1; syncedAt: string }): unknown;
}
interface SyncTombstoneDeps {
  getEvolu: () => ProfileRelayClient | null | undefined;
  getProfileQuery: () => unknown;
  getTombstoneQuery: () => unknown;
  isSyncEnabled: () => boolean;
  pushProfile: null | ((profileId: string, data: unknown, options?: { allowTombstoneResurrection?: boolean }) => Promise<{ ok?: unknown; reason?: unknown } | null | undefined | void>);
  debug: (...args: unknown[]) => void;
  getProfiles: () => SyncProfileRecord[];
  saveProfiles: (profiles: SyncProfileRecord[]) => Promise<void>;
  loadProfile: (profileId: string) => unknown;
  notify: (message: string, type: string, duration: number) => unknown;
}

// sync-tombstones.ts - remote profile delete propagation and quarantine.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { profileStorageKey } from './profile-storage-key.js';
import { encryptedGetItem } from './crypto.js';
import { parseSyncPayload } from './sync-payload.js';
import { clearProfileStorage } from './profile-storage-cleanup.js';
import { getSyncDirtyToken } from './sync-dirty-state.js';
import {
  clearLocalProfileDeleteIntent, hasPendingProfileTombstone,
  isDemoProfileId, markLocalProfileDeleteIntent,
} from './profile-sync-policy.js';

let _getEvolu: SyncTombstoneDeps['getEvolu'] = () => null;
let _getProfileQuery: SyncTombstoneDeps['getProfileQuery'] = () => null;
let _getTombstoneQuery: SyncTombstoneDeps['getTombstoneQuery'] = () => null;
let _isSyncEnabled: SyncTombstoneDeps['isSyncEnabled'] = () => false;
let _pushProfile: SyncTombstoneDeps['pushProfile'] = null;
let _debug: SyncTombstoneDeps['debug'] = () => {};
let _getProfiles: SyncTombstoneDeps['getProfiles'] = () => [];
let _saveProfiles: SyncTombstoneDeps['saveProfiles'] = async () => {};
let _loadProfile: SyncTombstoneDeps['loadProfile'] = () => {};
let _notify: SyncTombstoneDeps['notify'] = showNotification;
let profileResetModulePromise: Promise<typeof import('./clear-all-profile-reset.js')> | undefined;

function loadProfileResetModule() {
  profileResetModulePromise ||= import('./clear-all-profile-reset.js');
  return profileResetModulePromise;
}

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
}: Partial<SyncTombstoneDeps> = {}) {
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

function readDependency<Value>(getValue: () => Value) {
  try { return getValue?.() || null; } catch { return null; }
}

function currentEvolu() {
  return readDependency(_getEvolu);
}

function currentProfileQuery() {
  return readDependency(_getProfileQuery);
}

function currentTombstoneQuery() {
  return readDependency(_getTombstoneQuery);
}

function dbg(...args: unknown[]) {
  try { _debug(...args); } catch {}
}

const TOMBSTONE_QUARANTINE_KEY = (profileId: string) => `labcharts-tombstone-pending-${profileId}`;
const TOMBSTONE_BATCH_THRESHOLD = 2; // two or more tombstones at once require confirm

async function wipeProfileLocal(profileId: string) {
  await clearProfileStorage(profileId);
}

function rowClock(row: SyncProfileRow | null | undefined) {
  const clock = Date.parse((row?.syncedAt || '') as string);
  return Number.isFinite(clock) ? clock : 0;
}

async function recoverRowProfileId(row: SyncProfileRow | null | undefined) {
  if (typeof row?.profileId === 'string' && /^[a-zA-Z0-9_-]+$/.test(row.profileId)) return row.profileId;
  try {
    const parsed = (await parseSyncPayload(row?.dataJson || '{}')) as { profile?: { id?: unknown } | null };
    const candidate = parsed?.profile?.id;
    return typeof candidate === 'string' && /^[a-zA-Z0-9_-]+$/.test(candidate) ? candidate : '';
  } catch { return ''; }
}

async function latestRowsByProfileId(rows: readonly SyncProfileRow[] | null | undefined) {
  const latest = new Map<string, SyncProfileRow>();
  for (const row of rows || []) {
    const profileId = await recoverRowProfileId(row);
    if (!profileId) continue;
    const previous = latest.get(profileId);
    if (!previous || rowClock(row) >= rowClock(previous)) latest.set(profileId, row);
  }
  return latest;
}

// Soft-delete a profile's row on the relay so other devices stop seeing it.
// Local wipe alone is insufficient: otherwise any peer that pulls the old
// Evolu row can resurrect the deleted profile.
export async function deleteProfileFromRelay(profileId: string | null | undefined) {
  const evolu = currentEvolu();
  const profileQuery = currentProfileQuery();
  if (!evolu || !profileQuery || !_isSyncEnabled()) return { skipped: true, reason: 'sync-off' };
  if (!profileId || typeof profileId !== 'string') return { skipped: true, reason: 'bad-id' };
  try {
    const rows = evolu.getQueryRows(profileQuery) || [];
    const matching: SyncProfileRow[] = [];
    for (const row of rows) {
      if (await recoverRowProfileId(row) === profileId) matching.push(row);
    }
    if (!matching.length) return { skipped: true, reason: 'no-row' };
    // Carry profileId explicitly so post-compaction replicas of this
    // tombstone still know which local profile to wipe.
    const syncedAt = new Date().toISOString();
    for (const row of matching) {
      evolu.update!('profileData', { id: row.id, profileId, isDeleted: 1, syncedAt });
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
  const tombIds = new Set<string>();
  for (const [profileId, tombstone] of latestTombstones) {
    const live = latestLiveRows.get(profileId);
    // A newer live row explicitly revives the profile. Retire both delete
    // layers or this browser would reject and tombstone that row again.
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

  const wipedIds: string[] = [];
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
    // Adopt a clear-all replacement already in this batch; otherwise create a
    // temporary fallback for the inbound pull to replace.
    const profileReset = await loadProfileResetModule();
    const relayReplacement = await profileReset.findRelayReplacementProfile(latestLiveRows, tombIds);
    survivors.push(relayReplacement || profileReset.createSyncFallbackProfile(profiles, wipedIds.join(',')));
  }
  await _saveProfiles(survivors);
  for (const id of wipedIds) localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(id));
  dbg(`Applied ${wipedIds.length} remote tombstone(s):`, wipedIds.join(', '));

  if (wipedIds.includes(state.currentProfile)) {
    _notify(`Profile was deleted on another device - switching to "${survivors[0]!.name || 'next'}"`, 'info', 3500);
    await _loadProfile(survivors[0]!.id);
  }
}

export function listPendingTombstones() {
  const out: Array<Record<string, unknown>> = [];
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

export async function applyPendingTombstone(profileId: string) {
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
  if (survivors.length === 0) {
    survivors.push((await loadProfileResetModule()).createSyncFallbackProfile(profiles, profileId));
  }
  await _saveProfiles(survivors);
  localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
  if (state.currentProfile === profileId) await _loadProfile(survivors[0]!.id);
  return { ok: true };
}

export async function rejectPendingTombstone(profileId: string) {
  const profiles = _getProfiles();
  if (isDemoProfileId(profileId, profiles)) {
    localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
    clearLocalProfileDeleteIntent(profileId);
    return { ok: true, skipped: true, reason: 'demo-local-only' };
  }
  if (!currentEvolu() || !_isSyncEnabled()) return { ok: false, reason: 'sync-off' };
  // Active edits can be newer than the persisted blob.
  let data: unknown = state.importedData;
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
  const result = await _pushProfile(profileId, data, { allowTombstoneResurrection: true }) as { ok?: unknown; reason?: unknown } | null | undefined;
  if (!result?.ok) return { ok: false, reason: result?.reason || 'push-failed' };
  localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
  clearLocalProfileDeleteIntent(profileId);
  return { ok: true };
}
