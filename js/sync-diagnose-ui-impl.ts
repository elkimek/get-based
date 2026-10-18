import type { RelayHealthVerdict } from './sync-relay-health.js';
// sync-diagnose-ui.js - Sync Diagnose modal lifecycle and copy handling.

import { isDebugMode } from './utils.js';
import type { SyncDiagnoseOpenOwner } from './sync-diagnose-open-owner.js';
import { _evoluDiagnosticsText } from './sync-diagnostics-text.js';
import { getEvoluDiagnostics } from './sync-diagnostics-snapshot.js';
import { getRelayQuotaEstimate, verifyPushLanded } from './sync-relay-health.js';
import {
  confirmBackfillBlockers,
  confirmCompactRelay,
  confirmDisablePhase2,
  confirmEnablePhase2,
  confirmResetDeltaTelemetry,
  confirmRotateIdentity,
  refreshRelayStorage,
} from './sync-diagnose-actions.js';
import { renderSyncDiagnoseModal } from './sync-diagnose-render.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';

function handleSyncDiagnoseActionClick(event: MouseEvent, copySyncDiagnose: (btn?: HTMLElement | null) => Promise<void>) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = (target.closest('[data-sync-diagnose-action]') as HTMLElement | null);
  if (!actionEl) return;
  event.preventDefault();

  const action = actionEl.dataset.syncDiagnoseAction || '';
  if (action === 'refresh-relay-storage') {
    void refreshRelayStorage(actionEl);
  } else if (action === 'compact-relay') {
    void confirmCompactRelay(actionEl);
  } else if (action === 'rotate-identity') {
    void confirmRotateIdentity(actionEl);
  } else if (action === 'reset-delta-telemetry') {
    void confirmResetDeltaTelemetry(actionEl);
  } else if (action === 'backfill-blockers') {
    void confirmBackfillBlockers(actionEl);
  } else if (action === 'disable-phase2') {
    void confirmDisablePhase2(actionEl);
  } else if (action === 'enable-phase2') {
    void confirmEnablePhase2(actionEl);
  } else if (action === 'copy-snapshot') {
    void copySyncDiagnose(actionEl);
  }
}

// Read-only modal that dumps Evolu's local state. Both devices should show
// the same `ownerId`; recovery-phrase words are intentionally never exposed
// in diagnostics. Different owner IDs cannot see each other's data despite
// using the same relay URL.
export async function showSyncDiagnose(owner: SyncDiagnoseOpenOwner, cutoverEnabled: (profileId?: string | null) => boolean, copySyncDiagnose: (btn?: HTMLElement | null) => Promise<void>): Promise<void> {
  const diagnostics = await getEvoluDiagnostics();
  if (!owner.current()) return;
  let healthVerdict: RelayHealthVerdict = { verdict: 'unknown', at: 0, reason: null };
  try { healthVerdict = await verifyPushLanded(); } catch {}
  if (!owner.current()) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = renderSyncDiagnoseModal({
    diagnostics,
    healthVerdict,
    quota: getRelayQuotaEstimate(),
    isDebug: isDebugMode(),
    cutoverEnabled: cutoverEnabled(diagnostics.activeProfileId),
  });
  // Stash diagnostics text on the modal node so the Copy button can read
  // the same snapshot the user is staring at (avoids racing a re-fetch).
  overlay.dataset.copyText = _evoluDiagnosticsText(diagnostics);
  if (!owner.current()) return;
  owner.release();
  document.body.appendChild(overlay);
  openModalOverlay(overlay);
  const close = () => {
    closeModalOverlay(overlay);
    overlay.remove();
  };
  overlay.querySelectorAll('[data-sync-diagnose-close]').forEach((btn) => {
    btn.addEventListener('click', close);
  });
  overlay.addEventListener('click', event => handleSyncDiagnoseActionClick(event, copySyncDiagnose));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

