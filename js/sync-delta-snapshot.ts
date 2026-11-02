// sync-delta-snapshot.js — Delta snapshot storage keys and advancement gates.
import {clearScalarVersion} from './sync-scalar-snapshot.js';
import {DELTA_ARRAYS, DELTA_SCALARS} from './sync-delta-surfaces.js';
import {_isAllowlistSafeId} from './sync-delta-id.js';

export interface ArrayItemVersion { hash: string | null; clock: number }
export type ArrayItemVersions = Record<string, ArrayItemVersion>;
export type PulledArrayVersions = Record<string, ArrayItemVersions>;

// Separate from diff snapshots: these receipts identify the exact committed
// value and its row clock, including values received without a local push.
export function readArrayVersions(profileId: unknown, arrayName: string): ArrayItemVersions {
  const versions: ArrayItemVersions = Object.create(null);
  if (typeof profileId !== 'string' || !DELTA_ARRAYS.includes(arrayName)) return versions;
  try {
    const parsed = JSON.parse(localStorage.getItem(`${_deltaSnapshotKey(profileId, arrayName)}-versions`) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return versions;
    for (const [id, value] of Object.entries(parsed) as [string, Partial<ArrayItemVersion>][]) {
      if (_isAllowlistSafeId(id) && value && (typeof value.hash === 'string' || value.hash === null)
          && Number.isSafeInteger(value.clock) && value.clock! > 0) versions[id] = {hash: value.hash, clock: value.clock!};
    }
  } catch { /* Unknown receipts cannot authorize replacing a local edit. */ }
  return versions;
}

/** Upgrade merge base for values committed before row-version receipts existed.
 * The old planning clock is only a lower bound; an actual receipt takes priority. */
export function readLegacyArrayVersions(profileId: unknown, arrayName: string): ArrayItemVersions {
  const versions: ArrayItemVersions = Object.create(null);
  if (typeof profileId !== 'string' || !DELTA_ARRAYS.includes(arrayName)) return versions;
  let clock = 0;
  try {
    const meta = JSON.parse(localStorage.getItem(`${_deltaSnapshotKey(profileId, arrayName)}-meta`) || '{}');
    if (Number.isSafeInteger(meta?.plannedAt) && meta.plannedAt > 0) clock = meta.plannedAt;
  } catch { /* Older snapshots may predate planning-clock metadata as well. */ }
  for (const [id, hash] of Object.entries(_readDeltaSnapshot(profileId, arrayName))) {
    if (_isAllowlistSafeId(id) && typeof hash === 'string') versions[id] = {hash, clock};
  }
  return versions;
}

export function writeArrayVersions(profileId: string, arrayName: string, incoming: ArrayItemVersions): boolean {
  if (!DELTA_ARRAYS.includes(arrayName)) return false;
  const versions = readArrayVersions(profileId, arrayName), before = JSON.stringify(versions);
  // A partial query/plan cannot prove that an older receipt is obsolete.
  // Explicit snapshot/profile clearing removes these receipts with its data.
  for (const [id, version] of Object.entries(incoming)) {
    if (!_isAllowlistSafeId(id) || !Number.isSafeInteger(version.clock) || version.clock <= 0) continue;
    if (!versions[id] || version.clock >= versions[id]!.clock) versions[id] = version;
  }
  const next = JSON.stringify(versions);
  if (next === before) return true;
  try { localStorage.setItem(`${_deltaSnapshotKey(profileId, arrayName)}-versions`, next); return true; }
  catch { return false; }
}

// Returns the localStorage key holding the last-pushed snapshot
// (`{itemId: contentHash}`) for one (profileId, arrayName). Snapshot is
// updated only after a successful onComplete so a wedged push doesn't
// strand future deltas behind a never-cleared diff.
function _deltaSnapshotKey(profileId: unknown, arrayName: unknown) {
  return `labcharts-${profileId}-delta-${arrayName}`;
}

export function _readDeltaSnapshot(profileId: unknown, arrayName: unknown): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(_deltaSnapshotKey(profileId, arrayName));
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch { return {}; }
}

// Gate snapshot advancement by planning time so a delayed completion cannot
// overwrite a newer committed view and cause future pushes to skip missing rows.
export function _writeDeltaSnapshot(profileId: unknown, arrayName: unknown, snap: unknown, plannedAt?: number) {
  try {
    const metaKey = `${_deltaSnapshotKey(profileId, arrayName)}-meta`;
    if (Number.isFinite(plannedAt)) {
      const prevMetaRaw = localStorage.getItem(metaKey);
      if (prevMetaRaw) {
        try {
          const m = JSON.parse(prevMetaRaw);
          if (Number.isFinite(m?.plannedAt) && m.plannedAt >= plannedAt!) {
            // Equal-millisecond plans cannot replace the first committed view.
            return false;
          }
        } catch {}
      }
      localStorage.setItem(metaKey, JSON.stringify({ plannedAt }));
    }
    localStorage.setItem(_deltaSnapshotKey(profileId, arrayName), JSON.stringify(snap));
    return true;
  } catch { return false; }
}

export function clearDeltaSnapshot(profileId: unknown, arrayName: unknown) {
  try {
    localStorage.removeItem(_deltaSnapshotKey(profileId, arrayName));
    localStorage.removeItem(`${_deltaSnapshotKey(profileId, arrayName)}-meta`);
    localStorage.removeItem(`${_deltaSnapshotKey(profileId, arrayName)}-versions`);
    if (typeof profileId === 'string' && typeof arrayName === 'string' && DELTA_SCALARS.includes(arrayName)) return clearScalarVersion(profileId, arrayName);
    return true;
  } catch { return false; }
}

export function clearProfileDeltaSnapshots(profileId: unknown) {
  if (typeof profileId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(profileId)) return 0;
  const prefix = `labcharts-${profileId}-delta-`;
  const telemetryKey = `${prefix}telemetry`;
  let cleared = 0;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || key === telemetryKey || !key.startsWith(prefix)) continue;
      localStorage.removeItem(key);
      cleared++;
    }
  } catch {}
  return cleared;
}

// Phase 2 cutover flag — when set, buildSyncPayload omits importedData
// from the blob entirely. Per-row CRDT deltas carry every field instead.

function _cutoverFlagKey(profileId: string | null | undefined) {
  return `labcharts-${profileId}-sync-cutover-v2`;
}


export function isPhase2CutoverEnabled(profileId: string | null | undefined) {
  if (!profileId) return false;
  try { return localStorage.getItem(_cutoverFlagKey(profileId)) === '1'; } catch { return false; }
}


export function enablePhase2CutoverFlag(profileId: string | null | undefined) {
  if (!profileId) return false;
  try { localStorage.setItem(_cutoverFlagKey(profileId), '1'); return true; } catch { return false; }
}


export function disablePhase2CutoverFlag(profileId: string | null | undefined) {
  if (!profileId) return false;
  try { localStorage.removeItem(_cutoverFlagKey(profileId)); return true; } catch { return false; }
}
