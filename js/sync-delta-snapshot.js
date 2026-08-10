// @ts-check
// sync-delta-snapshot.js — Delta snapshot storage keys and advancement gates.

// Returns the localStorage key holding the last-pushed snapshot
// (`{itemId: contentHash}`) for one (profileId, arrayName). Snapshot is
// updated only after a successful onComplete so a wedged push doesn't
// strand future deltas behind a never-cleared diff.
function _deltaSnapshotKey(profileId, arrayName) {
  return `labcharts-${profileId}-delta-${arrayName}`;
}

export function _readDeltaSnapshot(profileId, arrayName) {
  try {
    const raw = localStorage.getItem(_deltaSnapshotKey(profileId, arrayName));
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch { return {}; }
}

// v1.7.16 audit fix: snapshot write is now plannedAt-gated. The
// _syncing 60s in-flight guard plus delayed onComplete writing meant
// push A planned at T=0 could have its onComplete fire at T=70s
// AFTER push B started at T=65s and already wrote its snapshot —
// A's late onComplete would clobber B's fresher view, and the next
// push would diff against A's stale state, silently skipping items
// B had already added. Stamping each plan with its planning time
// and refusing to overwrite a snapshot whose plannedAt is newer
// than this plan's closes that race.
export function _writeDeltaSnapshot(profileId, arrayName, snap, plannedAt) {
  try {
    const metaKey = `${_deltaSnapshotKey(profileId, arrayName)}-meta`;
    if (Number.isFinite(plannedAt)) {
      const prevMetaRaw = localStorage.getItem(metaKey);
      if (prevMetaRaw) {
        try {
          const m = JSON.parse(prevMetaRaw);
          if (Number.isFinite(m?.plannedAt) && m.plannedAt >= plannedAt) {
            // `>=` (not `>`) so same-millisecond plannedAt collisions don't
            // let a slow-to-onComplete A clobber a faster-to-finish B that
            // already shipped fresher items. Date.now() granularity is 1ms.
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

export function clearDeltaSnapshot(profileId, arrayName) {
  try {
    localStorage.removeItem(_deltaSnapshotKey(profileId, arrayName));
    localStorage.removeItem(`${_deltaSnapshotKey(profileId, arrayName)}-meta`);
    return true;
  } catch { return false; }
}

/**
 * Forget every last-pushed surface snapshot for one profile. Backup restore
 * uses this before reload so restored rows are planned as fresh inserts (or
 * tombstone-clearing updates) instead of being skipped because their content
 * hash happens to match a pre-restore push snapshot.
 *
 * Keep delta telemetry: it is diagnostic history, not planner state.
 *
 * @param {string | null | undefined} profileId
 */
export function clearProfileDeltaSnapshots(profileId) {
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
