// sync-diagnose-cutover-actions.js - Telemetry and lean-sync mode actions.

import { state } from './state.js';
import { showNotification } from './utils.js';
import {
  clearDeltaSnapshot, getDeltaCutoverReadiness, getDeltaTelemetry,
  resetDeltaTelemetry,
} from './sync-delta.js';
import { logSyncEvent } from './sync-state.js';
import {
  disablePhase2CutoverForDiagnose,
  enablePhase2CutoverForDiagnose,
  pushProfileForDiagnose,
} from './sync-diagnose-actions-context.js';

// "Reset window" - drops the rolling per-push telemetry log so the user
// can start a fresh measurement window.
export async function confirmResetDeltaTelemetry(btn) {
  const t = state.currentProfile ? getDeltaTelemetry(state.currentProfile) : null;
  const n = t?.summary?.count || 0;
  const message = `Reset the push-efficiency log? Drops the ${n} recent push entries used to compute the percentage. Your data and relay state aren't touched.`;
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  if (state.currentProfile && resetDeltaTelemetry(state.currentProfile)) {
    try { showNotification('Telemetry window reset', 'success'); } catch {}
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) overlay.remove();
    }
  } else {
    try { showNotification('Could not reset telemetry (no active profile?)', 'error'); } catch {}
  }
}

// "Enable Phase 2" - flips the fat-blob off for this profile on this
// device. Gated behind getDeltaCutoverReadiness READY.
export async function confirmEnablePhase2(btn) {
  if (!state.currentProfile) return;
  const r = getDeltaCutoverReadiness(state.currentProfile);
  if (!r?.ready) {
    try { showNotification('Phase 2 not ready — resolve blockers first', 'error'); } catch {}
    return;
  }
  const message = `Switch this device to lean sync mode?\n\nFrom now on, this device will only push per-row deltas instead of the full data blob. Other devices keep working normally.\n\nReversible any time via Disable.`;
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  const result = enablePhase2CutoverForDiagnose(state.currentProfile);
  if (result.ok) {
    try { showNotification('Phase 2 enabled — next push will use per-row only', 'success'); } catch {}
    logSyncEvent('cutover', `Phase 2 enabled for ${state.currentProfile.slice(0, 8)}`);
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) overlay.remove();
    }
  } else {
    try { showNotification(`Could not enable Phase 2 (${result.reason})`, 'error'); } catch {}
  }
}

// "Backfill blockers" - wipes the per-array snapshot for every surface
// flagged 'missing-rows' so the next push emits inserts for every local
// item from scratch. Then forces a push.
export async function confirmBackfillBlockers(btn) {
  if (!state.currentProfile) return;
  const profileId = state.currentProfile;
  const r = getDeltaCutoverReadiness(profileId);
  const blockers = Object.entries(r?.surfaces || {}).filter(([, v]) => v.status === 'missing-rows').map(([n]) => n);
  if (blockers.length === 0) {
    try { showNotification('No blockers to backfill', 'success'); } catch {}
    return;
  }
  const message = `Force a push for ${blockers.length} item${blockers.length === 1 ? '' : 's'} that haven't synced as deltas yet?\n\n${blockers.join(', ')}\n\nSafe — this just re-sends data that should already be on the relay.`;
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  let cleared = 0;
  for (const name of blockers) {
    if (clearDeltaSnapshot(profileId, name)) cleared++;
  }
  try { await pushProfileForDiagnose(profileId, state.importedData, { force: true }); } catch (e) {
    try { showNotification(`Backfill push failed: ${e?.message || e}`, 'error'); } catch {}
    return;
  }
  try { showNotification(`Backfilled ${cleared} surface${cleared === 1 ? '' : 's'} — re-open Diagnose to verify`, 'success'); } catch {}
  logSyncEvent('backfill', `Backfilled ${cleared} surface(s) for ${profileId.slice(0, 8)}: ${blockers.join(',')}`);
  if (btn) {
    const overlay = btn.closest?.('.modal-overlay');
    if (overlay) overlay.remove();
  }
}

export async function confirmDisablePhase2(btn) {
  if (!state.currentProfile) return;
  const message = `Switch this device back to full-blob sync?\n\nPushes will include the full data blob again as a safety net. Use this if a peer device is missing data after going lean.\n\nNo data loss either way.`;
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  if (disablePhase2CutoverForDiagnose(state.currentProfile)) {
    try { showNotification('Phase 2 disabled — back to dual-write', 'success'); } catch {}
    logSyncEvent('cutover', `Phase 2 disabled for ${state.currentProfile.slice(0, 8)}`);
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) overlay.remove();
    }
  } else {
    try { showNotification('Could not disable Phase 2', 'error'); } catch {}
  }
}
