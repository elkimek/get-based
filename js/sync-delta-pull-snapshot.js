// sync-delta-pull-snapshot.js - Pull-side row-count snapshot for delta diagnose.

// Refreshed on every _mergeItemRowsIntoImported run. Used by telemetry /
// Sync diagnose so paired devices can compare whether the relay replicated
// per-row state evenly. In-memory only; no localStorage churn.
const _pullDeltaSnapshot = { profileId: null, perArray: {}, mergedAt: 0 };

export function resetPullDeltaSnapshot(profileId) {
  _pullDeltaSnapshot.profileId = profileId;
  _pullDeltaSnapshot.perArray = {};
  _pullDeltaSnapshot.mergedAt = Date.now();
}

export function recordPullDeltaSurface(arrayName, counts) {
  if (!arrayName || !counts) return;
  _pullDeltaSnapshot.perArray[arrayName] = {
    live: counts.live || 0,
    tombstones: counts.tombstones || 0,
  };
}

export function getPullDeltaSnapshot(profileId) {
  return _pullDeltaSnapshot.profileId === profileId
    ? { perArray: { ..._pullDeltaSnapshot.perArray }, mergedAt: _pullDeltaSnapshot.mergedAt }
    : { perArray: {}, mergedAt: 0 };
}
