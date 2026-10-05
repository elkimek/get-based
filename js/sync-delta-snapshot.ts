// sync-delta-snapshot.js — Delta snapshot storage keys and advancement gates.

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
