// sync-backup-restore-state.js - durable handoff from backup restore to Sync.

import { clearProfileDeltaSnapshots } from './sync-delta-snapshot.js';
import { discardSyncProfileDirty, getSyncDirtyToken, markSyncProfileDirty } from './sync-dirty-state.js';
import { clearProfileSyncDeleteState, getProfileSyncBlockReason } from './profile-sync-policy.js';
import { createUniqueId } from './unique-id.js';

export const SYNC_BACKUP_RESTORE_PENDING_KEY = 'labcharts-sync-backup-restore-pending';

/** Bind recovery to its intended identity without storing recovery words. */
export async function fingerprintBackupRestoreOwner(mnemonic: string) {
  const normalized = mnemonic.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');
  if (!normalized) throw new Error('Sync identity is unavailable');
  const bytes = new TextEncoder().encode(`getbased:sync-recovery-owner:${normalized}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function isSafeProfileId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
}

function pendingJournal() {
  try {
    const raw = localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY);
    const parsed: unknown = JSON.parse(raw || '[]');
    const entries: unknown[] = Array.isArray(parsed) ? parsed : [];
    const markers = entries.filter((entry): entry is {kind: string; generation: string; ownerFingerprint?: unknown} => !!entry && typeof entry === 'object'
      && (entry as {kind?: unknown}).kind === 'restore-generation' && typeof (entry as {generation?: unknown}).generation === 'string');
    const ownerFingerprint = markers.length === 1 ? markers[0]!.ownerFingerprint : undefined;
    return {readable: markers.length <= 1 && (ownerFingerprint === undefined || (typeof ownerFingerprint === 'string' && /^[a-f0-9]{64}$/.test(ownerFingerprint))),
      ownerFingerprint: typeof ownerFingerprint === 'string' ? ownerFingerprint : undefined, profileIds: [...new Set(entries.filter(isSafeProfileId))],
      generation: markers.length === 1 ? markers[0]!.generation : `legacy:${raw || '[]'}`};
  } catch { return {readable: false, profileIds: [] as string[], generation: ''}; }
}

function journalValue(profileIds: readonly string[], generation: string, ownerFingerprint?: string) {
  // Keep an array so older tabs still see every pending profile and ignore
  // this non-profile entry through their existing safe-ID filter.
  return JSON.stringify([...profileIds, {kind: 'restore-generation', generation, ...(ownerFingerprint ? {ownerFingerprint} : {})}]);
}

export interface BackupRestoreStage { rollback(): boolean }

function writePendingBackupRestore(profileIds: readonly unknown[], required: boolean, ownerFingerprint?: string) {
  const safeIds = [...new Set((Array.isArray(profileIds) ? profileIds : []).filter(isSafeProfileId))];
  let previous: string | null = null;
  let value: string | undefined;
  const rollback = () => {
    try {
      // A later restore owns its journal even if this owner operation fails.
      if (value === undefined || localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY) !== value) return true;
      if (previous === null) localStorage.removeItem(SYNC_BACKUP_RESTORE_PENDING_KEY);
      else localStorage.setItem(SYNC_BACKUP_RESTORE_PENDING_KEY, previous);
      return true;
    } catch { return false; }
  };
  if (safeIds.length === 0) return {profileIds: safeIds, rollback};
  try {
    if (required) previous = localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY);
    if (ownerFingerprint !== undefined && !/^[a-f0-9]{64}$/.test(ownerFingerprint)) throw new Error('Invalid recovery owner fingerprint');
    value = journalValue(safeIds, createUniqueId('restore_'), ownerFingerprint);
    localStorage.setItem(SYNC_BACKUP_RESTORE_PENDING_KEY, value);
    if (required && localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY) !== value) throw new Error('Recovery journal was not retained');
  } catch {
    if (required) { rollback(); throw new Error('Could not save sync recovery progress'); }
  }
  return {profileIds: safeIds, rollback};
}

export function markBackupRestorePending(profileIds: readonly unknown[], options: {required?: boolean} = {}) {
  return writePendingBackupRestore(profileIds, !!options.required).profileIds;
}

/** Confirm durable intent and retain an owned rollback for a rejected owner reset. */
export function stageBackupRestorePending(profileIds: readonly unknown[], options: {ownerFingerprint?: string} = {}): BackupRestoreStage {
  return writePendingBackupRestore(profileIds, true, options.ownerFingerprint);
}

export function getPendingBackupRestoreProfileIds() {
  return pendingJournal().profileIds;
}

function acknowledgeProfile(profileId: string, generation: string) {
  const current = pendingJournal();
  if (!current.readable || current.generation !== generation) return false;
  const remaining = current.profileIds.filter(id => id !== profileId);
  try {
    if (remaining.length) localStorage.setItem(SYNC_BACKUP_RESTORE_PENDING_KEY, journalValue(remaining, generation, current.ownerFingerprint));
    else localStorage.removeItem(SYNC_BACKUP_RESTORE_PENDING_KEY);
    return true;
  } catch { return false; }
}

interface RestorePublisher {
  runtime: unknown;
  ownerId: string;
  ownerMnemonic?: string;
  isCurrent(): boolean;
  getProfiles(): readonly {id?: unknown}[];
  pushProfilesById(ids: readonly string[], options: {force: true; completeSnapshot: true}): Promise<{succeeded: number; skipped: number; failed: number}>;
}
interface RestoreProgress {
  runtime: unknown; ownerId: string; generation: string;
  committed: Map<string, string | null>;
  attempts: Map<string, {dirtyToken: string | null; count: number; retryAt: number}>;
}
let progress: RestoreProgress | undefined;

/** An explicit Sync now/resume may retry failures; committed receipts survive. */
export function resetBackupRestoreRetryBudget() { progress?.attempts.clear(); }

/** Commit and acknowledge each profile once before accepting relay tombstones. */
export async function republishPendingBackupRestore(deps: RestorePublisher) {
  const journal = pendingJournal();
  const deferred = (reason: string) => ({complete: false, remaining: pendingJournal().profileIds.length, reason});
  if (!journal.readable) return deferred('progress-unavailable');
  if (!journal.profileIds.length) return {complete: true, remaining: 0, reason: ''};
  if (!deps.ownerId || !deps.isCurrent()) return deferred('identity-unavailable');
  if (journal.ownerFingerprint) {
    let actualFingerprint: string;
    try { actualFingerprint = await fingerprintBackupRestoreOwner(deps.ownerMnemonic || ''); }
    catch { return deferred('identity-unavailable'); }
    if (actualFingerprint !== journal.ownerFingerprint) return deferred('identity-changed');
  }
  if (!progress || progress.runtime !== deps.runtime || progress.ownerId !== deps.ownerId || progress.generation !== journal.generation) {
    progress = {runtime: deps.runtime, ownerId: deps.ownerId, generation: journal.generation, committed: new Map(), attempts: new Map()};
  }
  const owned = progress;
  const current = () => deps.isCurrent() && pendingJournal().generation === journal.generation;
  for (const profileId of journal.profileIds) {
    if (!current()) return deferred('identity-changed');
    const profiles = deps.getProfiles();
    if (!profiles.some(profile => profile.id === profileId)) continue;
    const blocked = getProfileSyncBlockReason(profileId, profiles);
    if (blocked === 'demo' || blocked === 'delete-intent') {
      discardSyncProfileDirty(profileId);
      if (!acknowledgeProfile(profileId, journal.generation)) return deferred('progress-unavailable');
      continue;
    }
    if (blocked) continue;
    const dirtyToken = getSyncDirtyToken(profileId);
    if (owned.committed.has(profileId) && (dirtyToken === null || dirtyToken === owned.committed.get(profileId))) {
      if (!acknowledgeProfile(profileId, journal.generation)) return deferred('progress-unavailable');
      owned.committed.delete(profileId); owned.attempts.delete(profileId);
      continue;
    }
    owned.committed.delete(profileId);
    const previous = owned.attempts.get(profileId);
    const attempt = previous?.dirtyToken === dirtyToken ? previous : {dirtyToken, count: 0, retryAt: 0};
    if (attempt.count >= 3 || Date.now() < attempt.retryAt) continue;
    attempt.count++; attempt.retryAt = Date.now() + 10_000; owned.attempts.set(profileId, attempt);
    let result;
    try { result = await deps.pushProfilesById([profileId], {force: true, completeSnapshot: true}); }
    catch { continue; }
    if (!current()) return deferred('identity-changed');
    if (result.succeeded !== 1 || result.failed || result.skipped) continue;
    const after = getSyncDirtyToken(profileId);
    if (after !== null && after !== dirtyToken) continue;
    owned.committed.set(profileId, dirtyToken);
    if (!acknowledgeProfile(profileId, journal.generation)) return deferred('progress-unavailable');
    owned.committed.delete(profileId); owned.attempts.delete(profileId);
  }
  const remaining = pendingJournal().profileIds.length;
  return {complete: remaining === 0, remaining, reason: remaining ? 'profiles-pending' : ''};
}

export function clearBackupRestorePending() {
  try {
    localStorage.removeItem(SYNC_BACKUP_RESTORE_PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}

export function prepareRestoredProfilesForSync(backup: unknown) {
  const profiles = Array.isArray((backup as { profiles?: unknown } | null | undefined)?.profiles) ? (backup as { profiles: unknown[] }).profiles : [];
  const prepared = new Set<string>();
  for (const profile of profiles) {
    const profileId = (profile as { profileId?: unknown } | null | undefined)?.profileId;
    if (typeof profileId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(profileId) || prepared.has(profileId)) continue;
    prepared.add(profileId);
    // Restoring a backup is an explicit decision to revive this identity.
    // A successful delete from before the restore must not keep the restored
    // profile permanently blocked from its recovery push.
    clearProfileSyncDeleteState(profileId);
    clearProfileDeltaSnapshots(profileId);
    // A restored blob may not have complete per-row history, so force the
    // first recovery push to include the full v3 payload as a safety net.
    try { localStorage.removeItem(`labcharts-${profileId}-sync-cutover-v2`); } catch {}
    try { localStorage.removeItem(`labcharts-${profileId}-sync-ts`); } catch {}
    markSyncProfileDirty(profileId);
  }
  markBackupRestorePending([...prepared]);
  return prepared.size;
}
