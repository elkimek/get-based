// sync-tombstones.js - remote profile delete propagation and quarantine.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { profileStorageKey, getProfiles, saveProfiles, loadProfile } from './profile.js';
import { getEncryptionEnabled, encryptedGetItem, encryptedRemoveItem } from './crypto.js';
import { parseSyncPayload } from './sync-payload.js';

let _getEvolu = () => null;
let _getProfileQuery = () => null;
let _getTombstoneQuery = () => null;
let _isSyncEnabled = () => false;
let _pushProfile = null;
let _debug = () => {};

export function configureSyncTombstones({
  getEvolu,
  getProfileQuery,
  getTombstoneQuery,
  isSyncEnabled,
  pushProfile,
  debug,
} = {}) {
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getProfileQuery === 'function') _getProfileQuery = getProfileQuery;
  if (typeof getTombstoneQuery === 'function') _getTombstoneQuery = getTombstoneQuery;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof pushProfile === 'function') _pushProfile = pushProfile;
  if (typeof debug === 'function') _debug = debug;
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

const TOMBSTONE_QUARANTINE_KEY = (profileId) => `labcharts-tombstone-pending-${profileId}`;
const TOMBSTONE_BATCH_THRESHOLD = 2; // two or more tombstones at once require confirm

async function wipeProfileLocal(profileId) {
  await encryptedRemoveItem(profileStorageKey(profileId, 'imported'));
  for (const key of ['units', 'suppOverlay', 'noteOverlay', 'rangeMode', 'suppImpact']) {
    localStorage.removeItem(profileStorageKey(profileId, key));
  }
  for (const key of [
    'chat', 'chat-threads', 'chatRailOpen', 'chatPersonality',
    'chatPersonalityCustom', 'focusCard', 'contextHealth', 'onboarded',
    'emptyTour', 'tour', 'cycleTour', 'phaseOverlay', 'sync-ts',
  ]) {
    localStorage.removeItem(`labcharts-${profileId}-${key}`);
  }
  try {
    const wsMod = await import('./wearables-store.js');
    await wsMod.deleteWearablesDB(profileId).catch(() => {});
  } catch {}
}

// Soft-delete a profile's row on the relay so other devices stop seeing it.
// Local wipe alone is insufficient: otherwise any peer that pulls the old
// Evolu row can resurrect the deleted profile.
export async function deleteProfileFromRelay(profileId) {
  const evolu = currentEvolu();
  const profileQuery = currentProfileQuery();
  if (!evolu || !_isSyncEnabled()) return { skipped: true, reason: 'sync-off' };
  if (!profileId || typeof profileId !== 'string') return { skipped: true, reason: 'bad-id' };
  try {
    const rows = evolu.getQueryRows(profileQuery);
    const row = rows?.find(r => r.profileId === profileId);
    if (!row) return { skipped: true, reason: 'no-row' };
    // Carry profileId explicitly so post-compaction replicas of this
    // tombstone still know which local profile to wipe.
    evolu.update('profileData', { id: row.id, profileId, isDeleted: 1, syncedAt: new Date().toISOString() });
    localStorage.removeItem(`labcharts-${profileId}-sync-ts`);
    dbg('Soft-deleted on relay:', profileId);
    return { ok: true };
  } catch (e) {
    console.error('[sync] Profile delete propagation failed:', e);
    return { ok: false, error: e.message };
  }
}

// Wipe local copies of any profiles that were tombstoned on the relay. Runs
// before live-row processing so deleted profiles do not remain as ghosts in
// the local profile list.
export async function applyRemoteTombstones() {
  const evolu = currentEvolu();
  const tombstoneQuery = currentTombstoneQuery();
  if (!evolu || !tombstoneQuery) return;
  const tombs = evolu.getQueryRows(tombstoneQuery) || [];
  if (tombs.length === 0) return;
  const profiles = getProfiles();

  // Same payload fallback as the live-row pull path: compaction can lose
  // the profileId column, but profile.id still exists inside dataJson.
  const tombIdsArr = [];
  for (const t of tombs) {
    if (t.profileId) { tombIdsArr.push(t.profileId); continue; }
    try {
      const parsed = await parseSyncPayload(t.dataJson || '{}');
      const candidate = parsed?.profile?.id;
      if (typeof candidate === 'string' && /^[a-zA-Z0-9_-]+$/.test(candidate)) {
        tombIdsArr.push(candidate);
      }
    } catch {}
  }

  const tombIds = new Set(tombIdsArr);
  const survivors = profiles.filter(p => !tombIds.has(p.id));
  if (survivors.length === profiles.length) return;
  if (survivors.length === 0) {
    dbg('All profiles tombstoned remotely - keeping active profile as safety');
    return;
  }

  // Batched remote deletes are powerful enough to wipe many local profiles,
  // so quarantine them for explicit user confirmation.
  const localToWipe = profiles.filter(p => tombIds.has(p.id)).map(p => p.id);
  if (localToWipe.length >= TOMBSTONE_BATCH_THRESHOLD) {
    const pending = localToWipe.filter(id => !localStorage.getItem(TOMBSTONE_QUARANTINE_KEY(id)));
    for (const id of pending) {
      localStorage.setItem(TOMBSTONE_QUARANTINE_KEY(id), JSON.stringify({ at: Date.now(), source: 'remote' }));
    }
    dbg(`Quarantined ${pending.length} tombstone(s) - require user confirm before wipe:`, pending.join(','));
    showNotification(
      `${localToWipe.length} profiles deleted on another device - open Settings -> Sync to confirm`,
      'info', 6000
    );
    return;
  }

  const wipedIds = [];
  for (const tombId of tombIds) {
    if (!profiles.find(p => p.id === tombId)) continue;
    await wipeProfileLocal(tombId);
    wipedIds.push(tombId);
  }
  if (wipedIds.length === 0) return;

  await saveProfiles(survivors);
  for (const id of wipedIds) localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(id));
  dbg(`Applied ${wipedIds.length} remote tombstone(s):`, wipedIds.join(', '));

  if (wipedIds.includes(state.currentProfile)) {
    showNotification(`Profile was deleted on another device - switching to "${survivors[0].name || 'next'}"`, 'info', 3500);
    loadProfile(survivors[0].id);
  }
}

export function listPendingTombstones() {
  const out = [];
  const profiles = getProfiles();
  for (const p of profiles) {
    const raw = localStorage.getItem(TOMBSTONE_QUARANTINE_KEY(p.id));
    if (!raw) continue;
    try { out.push({ id: p.id, name: p.name || p.id, ...(JSON.parse(raw) || {}) }); }
    catch { out.push({ id: p.id, name: p.name || p.id }); }
  }
  return out;
}

export async function applyPendingTombstone(profileId) {
  const profiles = getProfiles();
  const survivors = profiles.filter(p => p.id !== profileId);
  if (survivors.length === 0) return { ok: false, reason: 'last-profile' };
  await wipeProfileLocal(profileId);
  await saveProfiles(survivors);
  localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
  if (state.currentProfile === profileId) loadProfile(survivors[0].id);
  return { ok: true };
}

export async function rejectPendingTombstone(profileId) {
  if (!currentEvolu() || !_isSyncEnabled()) return { ok: false, reason: 'sync-off' };
  const localKey = profileStorageKey(profileId, 'imported');
  const raw = getEncryptionEnabled()
    ? await encryptedGetItem(localKey)
    : localStorage.getItem(localKey);
  if (!raw) {
    localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
    return { ok: false, reason: 'no-local-data' };
  }
  let data;
  try { data = JSON.parse(raw); } catch { return { ok: false, reason: 'bad-local-json' }; }
  if (typeof _pushProfile !== 'function') return { ok: false, reason: 'sync-off' };
  await _pushProfile(profileId, data);
  localStorage.removeItem(TOMBSTONE_QUARANTINE_KEY(profileId));
  return { ok: true };
}
