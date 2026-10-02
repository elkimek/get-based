import type { ProfileData, NormalizedProfileData } from '../types/app-state.js';
import type { StoredProfileRecord } from './profile-list-store.js';
import type { SyncProfileRow } from './sync-payload.js';
import type { BiologyAIAnswer } from './biology-score-persistence.js';

interface StoredContextReview { updatedAt?: unknown; fingerprintsByRange?: unknown; unlockedRanges?: unknown; fingerprint?: unknown; range?: unknown }
export type PulledImportedData = NonNullable<Parameters<typeof mergeImportedData>[0]> & {
  biologyScoreContextAI?: StoredContextReview | null;
  biologyScoreAI?: Record<string, BiologyAIAnswer | null | undefined> | null;
  wearableConnections?: unknown;
};
type MaybePulledData = PulledImportedData | null | undefined;
type RecoveredRow = SyncProfileRow & { profileId: unknown };

interface SyncPullMergeResult {
  localKey: string; localImportedForMerge: MaybePulledData; merged: NormalizedProfileData; mergeMsg: string;
  needsRebroadcast: boolean; remoteBroughtNewRows: boolean; localDataChanged: boolean; restoreJoinApplied: boolean;
}

// sync-pull-merge.js - inbound row recovery and importedData merge helpers.

import { queueProfileDataWrite, profileDataBaseline, mergeProfileMutation, adoptProfileData, rebaseLiveProfileData, rememberProfileData } from './profile-data-writes.js';
import { mergeBiologyScoreAIRecords } from './biology-score-persistence.js';
import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { invalidateActiveDataCache } from './data.js';
import {
  getProfiles, loadProfile, migrateProfileData, profileStorageKey, saveProfiles,
} from './profile.js';
import { encryptedSetItem, encryptedGetItem } from './crypto.js';
import { mergeImportedData, localHasRowsRemoteLacks, preserveFreshLocalLabEntries } from './data-merge.js';
import { parseSyncPayload } from './sync-payload.js';
import { _mergeItemRowsIntoImported } from './sync-delta.js';
import { isRestoreJoinPending } from './sync-identity.js';
import { CONTEXT_REVIEW_RANGES } from './biology-score-context-ai.js';
import { SYNC_PROFILE_FIELDS } from './sync-profile-fields.js';
import { isDemoProfileRecord } from './profile-sync-policy.js';
import { sanitizeNutritionProfileData } from './nutrition-sync-sanitize.js';

const pullBaselines = new WeakMap<object, { stored: MaybePulledData; live: MaybePulledData }>();

export const PROFILE_ID_RE = /^[a-zA-Z0-9_-]+$/;

export function isSafeProfileId(profileId: unknown): profileId is string {
  return typeof profileId === 'string' && PROFILE_ID_RE.test(profileId);
}

export function isMalformedPulledImportedData(importedData: unknown) {
  return importedData !== null && (!importedData || typeof importedData !== 'object');
}

// Recover profileId from the payload when the column is empty. After relay
// compaction, surviving evolu.update messages can materialize rows with a
// blank profileId column; the payload's nested profile.id still identifies
// the owner row for dedupe + merge.
export async function recoverSyncPullRows(rawRows: readonly (SyncProfileRow | null | undefined)[] | null | undefined) {
  const enrichedRows: RecoveredRow[] = [];
  for (const row of rawRows || []) {
    if (!row) continue;
    let effectiveProfileId = row.profileId || null;
    if (!effectiveProfileId) {
      try {
        const parsed = (await parseSyncPayload(row.dataJson || '{}')) as { profile?: { id?: unknown } | null };
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
export function dedupeSyncPullRows(enrichedRows: readonly RecoveredRow[] | null | undefined) {
  const byProfile = new Map<unknown, RecoveredRow>();
  for (const row of enrichedRows || []) {
    const ts = row.syncedAt ? new Date(row.syncedAt as string).getTime() : 0;
    const prev = byProfile.get(row.profileId);
    if (!prev || ts > (prev.syncedAt ? new Date(prev.syncedAt as string).getTime() : 0)) {
      byProfile.set(row.profileId, row);
    }
  }
  return Array.from(byProfile.values()).sort((a, b) => {
    const ta = a.syncedAt ? new Date(a.syncedAt as string).getTime() : 0;
    const tb = b.syncedAt ? new Date(b.syncedAt as string).getTime() : 0;
    return tb - ta;
  });
}

export async function prepareSyncPullRows(rawRows: readonly (SyncProfileRow | null | undefined)[] | null | undefined) {
  return dedupeSyncPullRows(await recoverSyncPullRows(rawRows));
}


function countArray(b: MaybePulledData, k: string) {
  return Array.isArray(b?.[k]) ? (b![k] as unknown[]).length : 0;
}

function stableSnapshotValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableSnapshotValue);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) out[key] = stableSnapshotValue((value as Record<string, unknown>)[key]);
  return out;
}

function importedDataSnapshot(importedData: unknown) {
  try {
    return JSON.stringify(stableSnapshotValue(importedData || null));
  } catch {
    return null;
  }
}

function importedDataMatches(snapshot: string | null | undefined, importedData: unknown) {
  const next = importedDataSnapshot(importedData);
  return snapshot !== null && next !== null && snapshot === next;
}

function getUpdatedAt(value: { updatedAt?: unknown } | null | undefined) {
  const n = Number(value?.updatedAt || 0);
  return Number.isFinite(n) ? n : 0;
}

function biologyContextReviewCoverageScore(review: StoredContextReview | null | undefined) {
  if (!review || typeof review !== 'object') return 0;
  const fps = review.fingerprintsByRange && typeof review.fingerprintsByRange === 'object'
    ? review.fingerprintsByRange as Record<string, unknown>
    : null;
  const unlocked = Array.isArray(review.unlockedRanges) ? review.unlockedRanges : [];
  const hasAllRangeFingerprints = !!fps && CONTEXT_REVIEW_RANGES.every(range => typeof fps[range] === 'string' && fps[range]);
  const unlocksAllRanges = CONTEXT_REVIEW_RANGES.every(range => unlocked.includes(range));
  if (hasAllRangeFingerprints && unlocksAllRanges) return 3;
  if (hasAllRangeFingerprints) return 2;
  if (review.fingerprint && review.range) return 1;
  return 0;
}

function compareBiologyContextReviews(a: StoredContextReview | null | undefined, b: StoredContextReview | null | undefined) {
  const coverageDelta = biologyContextReviewCoverageScore(a) - biologyContextReviewCoverageScore(b);
  if (coverageDelta !== 0) return coverageDelta;
  const timeDelta = getUpdatedAt(a) - getUpdatedAt(b);
  if (timeDelta !== 0) return timeDelta;
  return 0;
}

function preserveFreshLocalBiologyScoreContextAI(merged: PulledImportedData, localImported: MaybePulledData, remoteImported: MaybePulledData) {
  const candidates = [merged?.biologyScoreContextAI, localImported?.biologyScoreContextAI, remoteImported?.biologyScoreContextAI]
    .filter(item => item && typeof item === 'object');
  if (!candidates.length) return false;
  const best = candidates.reduce((winner, item) => compareBiologyContextReviews(item, winner) > 0 ? item : winner, candidates[0]);
  if (merged.biologyScoreContextAI === best) return false;
  if (compareBiologyContextReviews(best, merged?.biologyScoreContextAI) <= 0) return false;
  merged.biologyScoreContextAI = best!;
  return true;
}

function preserveFreshLocalBiologyScoreAI(merged: PulledImportedData, localImported: MaybePulledData, remoteImported: MaybePulledData) {
  const candidateMaps = [merged.biologyScoreAI || {}, localImported?.biologyScoreAI || {}, remoteImported?.biologyScoreAI || {}];
  const keys = new Set(candidateMaps.flatMap(map => Object.keys(map || {})));
  const mergedAnswers = { ...(merged.biologyScoreAI || {}) };
  let changed = false;
  for (const scoreId of keys) {
    const candidates = candidateMaps.map(map => map?.[scoreId]).filter(item => item && typeof item === 'object');
    if (!candidates.length) continue;
    const best = mergeBiologyScoreAIRecords(...candidates);
    if (JSON.stringify(mergedAnswers[scoreId]) !== JSON.stringify(best)) {
      mergedAnswers[scoreId] = best;
      changed = true;
    }
  }
  if (changed) merged.biologyScoreAI = mergedAnswers;
  return changed;
}

function withoutLocalTombstones(importedData: MaybePulledData) {
  if (!importedData || typeof importedData !== 'object') return importedData;
  if (!importedData._deleted && !importedData._deletedAt && !importedData._deletedClearedAt) return importedData;
  const { _deleted, _deletedAt, _deletedClearedAt, ...rest } = importedData;
  return rest;
}

function preserveLocalOnlyProfileData(merged: PulledImportedData, localImported: MaybePulledData) {
  if (!merged || typeof merged !== 'object') return;
  for (const key of ['importBenchmarks', 'deletedImportBenchmarkIds']) {
    if (localImported && Object.prototype.hasOwnProperty.call(localImported, key)) merged[key] = localImported[key];
    else delete merged[key];
  }
}

export async function mergePulledImportedData(profileId: string, importedData: PulledImportedData | null, options: { debug?: (...args: unknown[]) => unknown; remoteUpdated?: number } = {}) {
  const { remoteUpdated = 0 } = options;
  const localKey = profileStorageKey(profileId, 'imported');
  // Capture durable and live baselines before asynchronous row overlays. Read
  // errors must abort rather than letting a pull replace unreadable local data.
  const { stored, live, baseline } = await queueProfileDataWrite(profileId, async () => {
    const rawStored = await encryptedGetItem(localKey);
    const active = profileId === state.currentProfile;
    return {
      stored: rawStored ? JSON.parse(rawStored) as PulledImportedData : null,
      live: active ? structuredClone(state.importedData || null) : null,
      baseline: active ? profileDataBaseline(state.importedData) : null,
    };
  });
  const localImportedForMerge = live && baseline && stored
    ? mergeProfileMutation(baseline, live, stored) : (live || stored);
  const localImportedBeforeMerge = importedDataSnapshot(localImportedForMerge);
  const restoreJoinApplied = profileId === state.currentProfile && isRestoreJoinPending();
  const localBaselineForMerge = restoreJoinApplied
    ? withoutLocalTombstones(localImportedForMerge)
    : localImportedForMerge;
  const remoteImportedForFreshness = importedData && typeof importedData === 'object'
    ? JSON.parse(JSON.stringify(importedData)) as PulledImportedData
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
  // per-row overlay below fills in every field. Clone that baseline so the
  // asynchronous overlay cannot mutate active data before persistence.
  // v3 and older still merge
  // blob-into-local as before.
  let merged: PulledImportedData = localBaselineForMerge
    ? (importedData ? mergeImportedData(localBaselineForMerge, importedData) : JSON.parse(JSON.stringify(localBaselineForMerge)))
    : (importedData || {});

  // Overlay rows after the blob. A newer canonical blob protects only items
  // it contains; local delete intent and newer row tombstones still win.
  try {
    merged = await _mergeItemRowsIntoImported(profileId, merged, {
      baselineImported: importedData,
      baselineSyncedAt: remoteUpdated,
    }) || merged;
  } catch (e) {
    console.warn('[sync] per-row overlay merge failed (blob still applied):', getErrorMessage(e, e));
  }
  // Old peers and malformed per-row records may still carry original meal
  // photos. Strip them before persistence so an inbound sync can never put
  // full-size images back into this browser or a later outbound payload.
  merged = sanitizeNutritionProfileData(merged) as PulledImportedData || merged;
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
  migrateProfileData(merged as ProfileData);

  const mergeMsg = `Pull ${profileId.slice(0,8)} — local sun=${countArray(localImportedForMerge,'sunSessions')}/dev=${countArray(localImportedForMerge,'lightDevices')} · remote sun=${countArray(importedData,'sunSessions')}/dev=${countArray(importedData,'lightDevices')} · merged sun=${countArray(merged,'sunSessions')}/dev=${countArray(merged,'lightDevices')}`;
  const needsRebroadcast = preservedFreshLocalEntries || preservedFreshLocalContextAI || preservedFreshLocalScoreAI
    || (!!localImportedForMerge && !!importedData
      && localHasRowsRemoteLacks(localImportedForMerge, importedData));
  const remoteBroughtNewRows = !preservedFreshLocalEntries && !!localImportedForMerge && !!importedData
    && localHasRowsRemoteLacks(importedData, localImportedForMerge);
  const localDataChanged = !importedDataMatches(localImportedBeforeMerge, merged);

  pullBaselines.set(merged, { stored, live });
  return {
    localKey,
    localImportedForMerge,
    merged,
    mergeMsg,
    needsRebroadcast,
    remoteBroughtNewRows,
    localDataChanged,
    restoreJoinApplied,
  } as SyncPullMergeResult;
}

export async function persistPulledImportedData(localKey: string, profileId: string, merged: PulledImportedData, remoteUpdated: number) {
  return queueProfileDataWrite(profileId, async () => {
    const baseline = pullBaselines.get(merged);
    const raw = await encryptedGetItem(localKey);
    const latest = raw ? JSON.parse(raw) as PulledImportedData : null;
    // Rebase edits committed while the row overlay was running, under the same
    // lock as ordinary saves. Local changes since the pull began take priority.
    let committed = baseline ? mergeProfileMutation(baseline.stored || {}, latest || {}, merged) : structuredClone(merged);
    const liveBeforeWrite = profileId === state.currentProfile ? structuredClone(state.importedData || null) : null;
    if (baseline?.live && liveBeforeWrite) committed = mergeProfileMutation(baseline.live, liveBeforeWrite, committed);
    preserveFreshLocalBiologyScoreAI(committed, latest, null);
    migrateProfileData(committed as ProfileData);
    await encryptedSetItem(localKey, JSON.stringify(committed));
    localStorage.setItem(`labcharts-${profileId}-sync-ts`, String(remoteUpdated));
    const needsRebroadcast = !importedDataMatches(importedDataSnapshot(merged), committed);
    adoptProfileData(merged, committed);
    if (profileId === state.currentProfile && state.importedData) {
      const live = state.importedData;
      const result = rebaseLiveProfileData(liveBeforeWrite || {}, live, committed);
      adoptProfileData(live, result.data);
      rememberProfileData(live, result.baseline);
      invalidateActiveDataCache();
    }
    return { needsRebroadcast };
  });
}

export async function mergePulledProfile(profileId: string, profile: unknown) {
  if (!profile || typeof profile !== 'object') return false;
  if (isDemoProfileRecord(profile)) return false;
  const profiles = getProfiles();
  const idx = profiles.findIndex(p => p.id === profileId);
  if (idx >= 0) {
    const local = profiles[idx]!;
    let changed = false;
    for (const field of SYNC_PROFILE_FIELDS) {
      if (!(field in profile)) continue;
      if (JSON.stringify(local[field]) === JSON.stringify((profile as Record<string, unknown>)[field])) continue;
      local[field] = (profile as Record<string, unknown>)[field];
      changed = true;
    }
    // Pulling an identical profile must be a true no-op. Advancing this clock
    // on every pull changed the next sync payload and appended relay history
    // even when the user had not changed any data.
    if (!changed) return false;
    local.lastUpdated = Date.now();
  } else {
    const disposableFallbackId = await (await import('./clear-all-profile-reset.js'))
      .removeUntouchedSyncFallback(profiles);
    const newProfile: StoredProfileRecord = ({ id: profileId, lastUpdated: Date.now() });
    for (const field of SYNC_PROFILE_FIELDS) {
      if (field in profile) newProfile[field] = (profile as Record<string, unknown>)[field];
    }
    profiles.push(newProfile as ReturnType<typeof getProfiles>[number]);
    await saveProfiles(profiles);
    if (disposableFallbackId && state.currentProfile === disposableFallbackId) {
      await loadProfile(profileId);
    }
    return true;
  }
  await saveProfiles(profiles);
  return true;
}
