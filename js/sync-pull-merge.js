// sync-pull-merge.js - inbound row recovery and importedData merge helpers.

import { state } from './state.js';
import { profileStorageKey, getProfiles, saveProfiles } from './profile.js';
import { getEncryptionEnabled, encryptedSetItem, encryptedGetItem } from './crypto.js';
import { mergeImportedData, localHasRowsRemoteLacks } from './data-merge.js';
import { parseSyncPayload } from './sync-payload.js';
import { _mergeItemRowsIntoImported } from './sync-delta.js';

export const PROFILE_ID_RE = /^[a-zA-Z0-9_-]+$/;

// Allowed fields when merging a synced profile into the local profiles list.
const PROFILE_MERGE_FIELDS = ['name', 'sex', 'dob', 'location', 'tags', 'archived', 'pinned', 'flagged', 'avatar', 'color'];

export function isSafeProfileId(profileId) {
  return typeof profileId === 'string' && PROFILE_ID_RE.test(profileId);
}

export function isMalformedPulledImportedData(importedData) {
  return importedData !== null && (!importedData || typeof importedData !== 'object');
}

// Recover profileId from the payload when the column is empty. After relay
// compaction, surviving evolu.update messages can materialize rows with a
// blank profileId column; the payload's nested profile.id still identifies
// the owner row for dedupe + merge.
export async function recoverSyncPullRows(rawRows) {
  const enrichedRows = [];
  for (const row of rawRows || []) {
    if (!row) continue;
    let effectiveProfileId = row.profileId || null;
    if (!effectiveProfileId) {
      try {
        const parsed = await parseSyncPayload(row.dataJson || '{}');
        const candidate = parsed?.profile?.id;
        if (isSafeProfileId(candidate)) effectiveProfileId = candidate;
      } catch {
        // Malformed payload + empty column -> can't merge, drop the row.
      }
    }
    if (!effectiveProfileId) continue;
    enrichedRows.push({ ...row, profileId: effectiveProfileId });
  }
  return enrichedRows;
}

// Dedupe by profileId, keeping the row with the highest syncedAt. Evolu can
// return multiple rows per profileId after a tombstone + recreate or a
// restore-from-mnemonic race; newest-first processing prevents an older row
// from overwriting the latest pull.
export function dedupeSyncPullRows(enrichedRows) {
  const byProfile = new Map();
  for (const row of enrichedRows || []) {
    const ts = row.syncedAt ? new Date(row.syncedAt).getTime() : 0;
    const prev = byProfile.get(row.profileId);
    if (!prev || ts > (prev.syncedAt ? new Date(prev.syncedAt).getTime() : 0)) {
      byProfile.set(row.profileId, row);
    }
  }
  return Array.from(byProfile.values()).sort((a, b) => {
    const ta = a.syncedAt ? new Date(a.syncedAt).getTime() : 0;
    const tb = b.syncedAt ? new Date(b.syncedAt).getTime() : 0;
    return tb - ta;
  });
}

export async function prepareSyncPullRows(rawRows) {
  return dedupeSyncPullRows(await recoverSyncPullRows(rawRows));
}

async function readStoredImportedData(localKey, debug, label) {
  try {
    const rawLocal = getEncryptionEnabled()
      ? await encryptedGetItem(localKey)
      : localStorage.getItem(localKey);
    return rawLocal ? JSON.parse(rawLocal) : null;
  } catch (e) {
    try { debug?.(`Could not read local importedData for ${label}:`, e.message); } catch {}
    return null;
  }
}

function countArray(b, k) {
  return Array.isArray(b?.[k]) ? b[k].length : 0;
}

export async function mergePulledImportedData(profileId, importedData, { debug } = {}) {
  const localKey = profileStorageKey(profileId, 'imported');
  const localImportedForMerge = profileId === state.currentProfile
    ? (state.importedData || null)
    : await readStoredImportedData(localKey, debug, 'merge');

  // Preserve local wearableConnections - they're stripped from the push
  // payload (tokens stay per-device), so the remote blob never carries
  // them. Without this merge the pull would wipe this device's OAuth
  // tokens and silently disconnect every connected vendor.
  const localWearableConnections = profileId === state.currentProfile
    ? (state.importedData?.wearableConnections || null)
    : (localImportedForMerge?.wearableConnections || null);
  if (localWearableConnections && importedData) {
    importedData.wearableConnections = localWearableConnections;
  }

  // v4 cutover: importedData is null by design. Use local as the baseline;
  // per-row overlay below fills in every field. v3 and older still merge
  // blob-into-local as before.
  let merged = localImportedForMerge
    ? (importedData ? mergeImportedData(localImportedForMerge, importedData) : localImportedForMerge)
    : (importedData || {});

  // Phase 1 of CRDT-delta refactor: overlay per-row tables AFTER the blob
  // merge. Per-row state is authoritative - a tombstone here drops the
  // corresponding item even if the blob still carried it.
  try {
    merged = await _mergeItemRowsIntoImported(profileId, merged) || merged;
  } catch (e) {
    console.warn('[sync] per-row overlay merge failed (blob still applied):', e?.message || e);
  }

  const mergeMsg = `Pull ${profileId.slice(0,8)} — local sun=${countArray(localImportedForMerge,'sunSessions')}/dev=${countArray(localImportedForMerge,'lightDevices')} · remote sun=${countArray(importedData,'sunSessions')}/dev=${countArray(importedData,'lightDevices')} · merged sun=${countArray(merged,'sunSessions')}/dev=${countArray(merged,'lightDevices')}`;
  const needsRebroadcast = !!localImportedForMerge && !!importedData
    && localHasRowsRemoteLacks(localImportedForMerge, importedData);
  const remoteBroughtNewRows = !!localImportedForMerge && !!importedData
    && localHasRowsRemoteLacks(importedData, localImportedForMerge);

  return {
    localKey,
    localImportedForMerge,
    merged,
    mergeMsg,
    needsRebroadcast,
    remoteBroughtNewRows,
  };
}

export async function persistPulledImportedData(localKey, profileId, merged, remoteUpdated) {
  // Always go through encryptedSetItem - it routes big-blob `-imported`
  // keys to IndexedDB regardless of encryption state. Bypassing this
  // re-introduces the 5 MB quota wall.
  const importedJson = JSON.stringify(merged);
  await encryptedSetItem(localKey, importedJson);
  localStorage.setItem(`labcharts-${profileId}-sync-ts`, String(remoteUpdated));
}

export async function mergePulledProfile(profileId, profile) {
  if (!profile || typeof profile !== 'object') return false;
  const profiles = getProfiles();
  const idx = profiles.findIndex(p => p.id === profileId);
  if (idx >= 0) {
    const local = profiles[idx];
    for (const field of PROFILE_MERGE_FIELDS) {
      if (field in profile) local[field] = profile[field];
    }
    local.lastUpdated = Date.now();
  } else {
    const newProfile = { id: profileId, lastUpdated: Date.now() };
    for (const field of PROFILE_MERGE_FIELDS) {
      if (field in profile) newProfile[field] = profile[field];
    }
    profiles.push(newProfile);
  }
  await saveProfiles(profiles);
  return true;
}
