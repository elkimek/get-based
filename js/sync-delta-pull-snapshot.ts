// sync-delta-pull-snapshot.js - Pull-side row-count snapshot for delta diagnose.

// Refreshed on every _mergeItemRowsIntoImported run. Used by telemetry /
// Sync diagnose so paired devices can compare whether the relay replicated
// per-row state evenly. In-memory only; no localStorage churn.
export interface PullDeltaCounts { live: number; tombstones: number }
interface PullDeltaSnapshot {
  profileId: unknown;
  perArray: Record<string, PullDeltaCounts>;
  mergedAt: number;
}

const _pullDeltaSnapshot: PullDeltaSnapshot = { profileId: null, perArray: {}, mergedAt: 0 };

export function resetPullDeltaSnapshot(profileId: unknown) {
  _pullDeltaSnapshot.profileId = profileId;
  _pullDeltaSnapshot.perArray = {};
  _pullDeltaSnapshot.mergedAt = Date.now();
}

export function recordPullDeltaSurface(
  arrayName: string | null | undefined, counts: Partial<PullDeltaCounts> | null | undefined,
) {
  if (!arrayName || !counts) return;
  _pullDeltaSnapshot.perArray[arrayName] = {
    live: counts.live || 0,
    tombstones: counts.tombstones || 0,
  };
}

export function getPullDeltaSnapshot(profileId: unknown) {
  return _pullDeltaSnapshot.profileId === profileId
    ? { perArray: { ..._pullDeltaSnapshot.perArray }, mergedAt: _pullDeltaSnapshot.mergedAt }
    : { perArray: {}, mergedAt: 0 };
}
