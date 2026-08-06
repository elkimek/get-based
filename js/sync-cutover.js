// @ts-check
// sync-cutover.js - Phase 2 lean-sync cutover gate and flag helpers.

import {
  disablePhase2CutoverFlag, enablePhase2CutoverFlag, isPhase2CutoverEnabled,
} from './sync-payload.js';
import { getDeltaCutoverReadiness } from './sync-delta.js';
import { DELTA_ARRAYS, DELTA_MAPS, DELTA_SCALARS } from './sync-delta-registry.js';
import { clearDeltaSnapshot } from './sync-delta-snapshot.js';

export { isPhase2CutoverEnabled };

// Gated setter - refuses to enable cutover when readiness check finds
// blockers. Returns { ok, reason, blockerCount } so the UI can render
// a useful error. Disable is always allowed (escape hatch).
/** @param {string | null | undefined} profileId */
export function enablePhase2Cutover(profileId) {
  if (!profileId) return { ok: false, reason: 'no-profile' };
  const r = getDeltaCutoverReadiness(profileId);
  if (!r || !r.ready) {
    return { ok: false, reason: 'not-ready', blockerCount: r?.blockerCount || -1 };
  }
  if (enablePhase2CutoverFlag(profileId)) return { ok: true };
  return { ok: false, reason: 'storage' };
}

/** @param {string | null | undefined} profileId */
export function disablePhase2Cutover(profileId) {
  return disablePhase2CutoverFlag(profileId);
}

// Relay compaction removes the owner's complete append-only message log.
// Rebuilding must therefore bypass both optimizations that normally suppress
// old data: v4's omitted profile blob and the local "already pushed" delta
// snapshots. The next forced push then emits a complete v3 snapshot plus all
// current per-row surfaces.
/** @param {string | null | undefined} profileId */
export function prepareProfileForRelayRebuild(profileId) {
  if (!profileId) return false;
  disablePhase2CutoverFlag(profileId);
  const surfaces = new Set([...DELTA_ARRAYS, ...DELTA_MAPS, ...DELTA_SCALARS]);
  for (const surface of surfaces) clearDeltaSnapshot(profileId, surface);
  return true;
}
