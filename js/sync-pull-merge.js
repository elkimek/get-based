// @ts-check
// sync-pull-merge.js - inbound row recovery and importedData merge helpers.

import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { profileStorageKey, getProfiles, saveProfiles, migrateProfileData } from './profile.js';
import { getEncryptionEnabled, encryptedSetItem, encryptedGetItem } from './crypto.js';
import { mergeImportedData, localHasRowsRemoteLacks, preserveFreshLocalLabEntries } from './data-merge.js';
import { parseSyncPayload } from './sync-payload.js';
import { _mergeItemRowsIntoImported } from './sync-delta.js';
import { isRestoreJoinPending } from './sync-identity.js';
import { CONTEXT_REVIEW_RANGES } from './biology-score-context-ai.js';
import { SYNC_PROFILE_FIELDS } from './sync-profile-fields.js';

export const PROFILE_ID_RE = /^[a-zA-Z0-9_-]+$/;

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
    try { debug?.(`Could not read local importedData for ${label}:`, getErrorMessage(e)); } catch {}
    return null;
  }
}

function countArray(b, k) {
  return Array.isArray(b?.[k]) ? b[k].length : 0;
}

function stableSnapshotValue(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableSnapshotValue);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stableSnapshotValue(value[key]);
  return out;
}

function importedDataSnapshot(importedData) {
  try {
    return JSON.stringify(stableSnapshotValue(importedData || null));
  } catch {
    return null;
  }
}

function importedDataMatches(snapshot, importedData) {
  const next = importedDataSnapshot(importedData);
  return snapshot !== null && next !== null && snapshot === next;
}

function getUpdatedAt(value) {
  const n = Number(value?.updatedAt || 0);
  return Number.isFinite(n) ? n : 0;
}

function biologyContextReviewCoverageScore(review) {
  if (!review || typeof review !== 'object') return 0;
  const fps = review.fingerprintsByRange && typeof review.fingerprintsByRange === 'object'
    ? review.fingerprintsByRange
    : null;
  const unlocked = Array.isArray(review.unlockedRanges) ? review.unlockedRanges : [];
  const hasAllRangeFingerprints = !!fps && CONTEXT_REVIEW_RANGES.every(range => typeof fps[range] === 'string' && fps[range]);
  const unlocksAllRanges = CONTEXT_REVIEW_RANGES.every(range => unlocked.includes(range));
  if (hasAllRangeFingerprints && unlocksAllRanges) return 3;
  if (hasAllRangeFingerprints) return 2;
  if (review.fingerprint && review.range) return 1;
  return 0;
}

function compareBiologyContextReviews(a, b) {
  const coverageDelta = biologyContextReviewCoverageScore(a) - biologyContextReviewCoverageScore(b);
  if (coverageDelta !== 0) return coverageDelta;
  const timeDelta = getUpdatedAt(a) - getUpdatedAt(b);
  if (timeDelta !== 0) return timeDelta;
  return 0;
}

function preserveFreshLocalBiologyScoreContextAI(merged, localImported, remoteImported) {
  const candidates = [merged?.biologyScoreContextAI, localImported?.biologyScoreContextAI, remoteImported?.biologyScoreContextAI]
    .filter(item => item && typeof item === 'object');
  if (!candidates.length) return false;
  const best = candidates.reduce((winner, item) => compareBiologyContextReviews(item, winner) > 0 ? item : winner, candidates[0]);
  if (merged.biologyScoreContextAI === best) return false;
  if (compareBiologyContextReviews(best, merged?.biologyScoreContextAI) <= 0) return false;
  merged.biologyScoreContextAI = best;
  return true;
}

function preserveFreshLocalBiologyScoreAI(merged, localImported, remoteImported) {
  const candidateMaps = [merged.biologyScoreAI || {}, localImported?.biologyScoreAI || {}, remoteImported?.biologyScoreAI || {}];
  const keys = new Set(candidateMaps.flatMap(map => Object.keys(map || {})));
  const mergedAnswers = { ...(merged.biologyScoreAI || {}) };
  let changed = false;
  for (const scoreId of keys) {
    const candidates = candidateMaps.map(map => map?.[scoreId]).filter(item => item && typeof item === 'object');
    if (!candidates.length) continue;
    const best = candidates.reduce((winner, item) => getUpdatedAt(item) > getUpdatedAt(winner) ? item : winner, candidates[0]);
    if (mergedAnswers[scoreId] !== best && getUpdatedAt(best) > getUpdatedAt(mergedAnswers[scoreId])) {
      mergedAnswers[scoreId] = best;
      changed = true;
    }
  }
  if (changed) merged.biologyScoreAI = mergedAnswers;
  return changed;
}

function withoutLocalTombstones(importedData) {
  if (!importedData || typeof importedData !== 'object') return importedData;
  if (!importedData._deleted && !importedData._deletedAt && !importedData._deletedClearedAt) return importedData;
  const { _deleted, _deletedAt, _deletedClearedAt, ...rest } = importedData;
  return rest;
}

/** @param {any} merged @param {any} localImported */
function preserveLocalOnlyProfileData(merged, localImported) {
  if (!merged || typeof merged !== 'object') return;
  for (const key of ['importBenchmarks', 'deletedImportBenchmarkIds']) {
    if (localImported && Object.prototype.hasOwnProperty.call(localImported, key)) merged[key] = localImported[key];
    else delete merged[key];
  }
}

/** @param {{ debug?: (...args: any[]) => any }} [options] */
export async function mergePulledImportedData(profileId, importedData, options = {}) {
  const { debug } = options;
  const localKey = profileStorageKey(profileId, 'imported');
  const localImportedForMerge = profileId === state.currentProfile
    ? (state.importedData || null)
    : await readStoredImportedData(localKey, debug, 'merge');
  const localImportedBeforeMerge = importedDataSnapshot(localImportedForMerge);
  const restoreJoinApplied = profileId === state.currentProfile && isRestoreJoinPending();
  const localBaselineForMerge = restoreJoinApplied
    ? withoutLocalTombstones(localImportedForMerge)
    : localImportedForMerge;
  const remoteImportedForFreshness = importedData && typeof importedData === 'object'
    ? JSON.parse(JSON.stringify(importedData))
    : importedData;

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
  let merged = localBaselineForMerge
    ? (importedData ? mergeImportedData(localBaselineForMerge, importedData) : localBaselineForMerge)
    : (importedData || {});

  // Phase 1 of CRDT-delta refactor: overlay per-row tables AFTER the blob
  // merge. Per-row state is authoritative - a tombstone here drops the
  // corresponding item even if the blob still carried it.
  try {
    merged = await _mergeItemRowsIntoImported(profileId, merged) || merged;
  } catch (e) {
    console.warn('[sync] per-row overlay merge failed (blob still applied):', getErrorMessage(e, e));
  }
  // A legacy remote blob starts as the merge baseline. Restore device-local
  // benchmark history after that merge so an inbound sync cannot erase a run
  // that just completed on this machine.
  preserveLocalOnlyProfileData(merged, localImportedForMerge);
  const preservedFreshLocalEntries = preserveFreshLocalLabEntries(merged, localImportedForMerge);
  const preservedFreshLocalContextAI = preserveFreshLocalBiologyScoreContextAI(merged, localImportedForMerge, remoteImportedForFreshness);
  const preservedFreshLocalScoreAI = preserveFreshLocalBiologyScoreAI(merged, localImportedForMerge, remoteImportedForFreshness);
  // Normalize the merged payload before change detection and persistence. If a
  // remote row still carries an old schema key/shape, refreshing the active
  // profile used to migrate only in-memory state after persist; the next pull
  // then saw the same old remote row as a fresh local change again, causing
  // repeated "Data updated from another device" toasts and rebroadcast loops.
  migrateProfileData(merged);

  const mergeMsg = `Pull ${profileId.slice(0,8)} — local sun=${countArray(localImportedForMerge,'sunSessions')}/dev=${countArray(localImportedForMerge,'lightDevices')} · remote sun=${countArray(importedData,'sunSessions')}/dev=${countArray(importedData,'lightDevices')} · merged sun=${countArray(merged,'sunSessions')}/dev=${countArray(merged,'lightDevices')}`;
  const needsRebroadcast = preservedFreshLocalEntries || preservedFreshLocalContextAI || preservedFreshLocalScoreAI
    || (!!localImportedForMerge && !!importedData
      && localHasRowsRemoteLacks(localImportedForMerge, importedData));
  const remoteBroughtNewRows = !preservedFreshLocalEntries && !!localImportedForMerge && !!importedData
    && localHasRowsRemoteLacks(importedData, localImportedForMerge);
  const localDataChanged = !importedDataMatches(localImportedBeforeMerge, merged);

  return {
    localKey,
    localImportedForMerge,
    merged,
    mergeMsg,
    needsRebroadcast,
    remoteBroughtNewRows,
    localDataChanged,
    restoreJoinApplied,
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
    let changed = false;
    for (const field of SYNC_PROFILE_FIELDS) {
      if (!(field in profile)) continue;
      if (JSON.stringify(local[field]) === JSON.stringify(profile[field])) continue;
      local[field] = profile[field];
      changed = true;
    }
    // Pulling an identical profile must be a true no-op. Advancing this clock
    // on every pull changed the next sync payload and appended relay history
    // even when the user had not changed any data.
    if (!changed) return false;
    local.lastUpdated = Date.now();
  } else {
    const newProfile = /** @type {any} */ ({ id: profileId, lastUpdated: Date.now() });
    for (const field of SYNC_PROFILE_FIELDS) {
      if (field in profile) newProfile[field] = profile[field];
    }
    profiles.push(newProfile);
  }
  await saveProfiles(profiles);
  return true;
}
