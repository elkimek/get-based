// sync-cutover.js - Phase 2 lean-sync cutover gate and flag helpers.

import {
  disablePhase2CutoverFlag, enablePhase2CutoverFlag, isPhase2CutoverEnabled,
} from './sync-payload.js';
import { getDeltaCutoverReadiness } from './sync-delta.js';

export { isPhase2CutoverEnabled };

// Gated setter - refuses to enable cutover when readiness check finds
// blockers. Returns { ok, reason, blockerCount } so the UI can render
// a useful error. Disable is always allowed (escape hatch).
export function enablePhase2Cutover(profileId) {
  if (!profileId) return { ok: false, reason: 'no-profile' };
  const r = getDeltaCutoverReadiness(profileId);
  if (!r || !r.ready) {
    return { ok: false, reason: 'not-ready', blockerCount: r?.blockerCount || -1 };
  }
  if (enablePhase2CutoverFlag(profileId)) return { ok: true };
  return { ok: false, reason: 'storage' };
}

export function disablePhase2Cutover(profileId) {
  return disablePhase2CutoverFlag(profileId);
}
