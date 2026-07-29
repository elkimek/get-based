// @ts-check
// sync-diagnose-ui.js - Sync Diagnose modal lifecycle and copy handling.

import { getErrorMessage } from './caught-error.js';
import { showNotification, isDebugMode } from './utils.js';
import { _evoluDiagnosticsText, getEvoluDiagnostics } from './sync-diagnostics.js';
import { getRelayQuotaEstimate, verifyPushLanded } from './sync-relay-health.js';
import {
  configureSyncDiagnoseActions,
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

export {
  confirmBackfillBlockers, confirmCompactRelay, confirmDisablePhase2,
  confirmEnablePhase2, confirmResetDeltaTelemetry, confirmRotateIdentity,
  refreshRelayStorage,
} from './sync-diagnose-actions.js';

/** @type {(profileId?: any) => boolean} */
let _isPhase2CutoverEnabled = () => false;

function handleSyncDiagnoseActionClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = /** @type {HTMLElement | null} */ (target.closest('[data-sync-diagnose-action]'));
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

/** @param {{
 *   enableSync?: (...args: any[]) => any,
 *   restoreFromMnemonic?: (...args: any[]) => any,
 *   isSyncEnabled?: (...args: any[]) => any,
 *   pushProfile?: (...args: any[]) => any,
 *   enablePhase2Cutover?: (...args: any[]) => any,
 *   disablePhase2Cutover?: (...args: any[]) => any,
 *   isPhase2CutoverEnabled?: (profileId?: any) => boolean,
 * }} [deps]
 */
export function configureSyncDiagnoseUI({
  enableSync,
  restoreFromMnemonic,
  isSyncEnabled,
  pushProfile,
  enablePhase2Cutover,
  disablePhase2Cutover,
  isPhase2CutoverEnabled,
} = {}) {
  if (typeof isPhase2CutoverEnabled === 'function') _isPhase2CutoverEnabled = isPhase2CutoverEnabled;
  configureSyncDiagnoseActions({
    enableSync,
    restoreFromMnemonic,
    isSyncEnabled,
    pushProfile,
    enablePhase2Cutover,
    disablePhase2Cutover,
    // Intentionally capture the module-scoped hoisted renderer, not a
    // caller-provided config field that could shadow it with undefined.
    showSyncDiagnose,
  });
}

// Read-only modal that dumps Evolu's local state. Both devices should show
// the same `ownerId`; recovery-phrase words are intentionally never exposed
// in diagnostics. Different owner IDs cannot see each other's data despite
// using the same relay URL.
export async function showSyncDiagnose() {
  const diagnostics = await getEvoluDiagnostics();
  /** @type {{ verdict: string, at: number, reason: string | null }} */
  let healthVerdict = { verdict: 'unknown', at: 0, reason: null };
  try { healthVerdict = await verifyPushLanded(); } catch {}

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = renderSyncDiagnoseModal({
    diagnostics,
    healthVerdict,
    quota: getRelayQuotaEstimate(),
    isDebug: isDebugMode(),
    cutoverEnabled: _isPhase2CutoverEnabled(diagnostics.activeProfileId),
  });
  // Stash diagnostics text on the modal node so the Copy button can read
  // the same snapshot the user is staring at (avoids racing a re-fetch).
  overlay.dataset.copyText = _evoluDiagnosticsText(diagnostics);
  document.body.appendChild(overlay);
  openModalOverlay(overlay);
  const close = () => {
    closeModalOverlay(overlay);
    overlay.remove();
  };
  overlay.querySelectorAll('[data-sync-diagnose-close]').forEach((btn) => {
    btn.addEventListener('click', close);
  });
  overlay.addEventListener('click', handleSyncDiagnoseActionClick);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

// Copies the Sync diagnose snapshot to the clipboard. Walks up to find
// the overlay so we read the same `data-copy-text` blob the modal was
// rendered from (no stale-snapshot races when sync ticks during read).
export async function copySyncDiagnose(btn) {
  const overlay = btn?.closest?.('.modal-overlay');
  const text = overlay?.dataset?.copyText || '';
  if (!text) {
    try { showNotification('Nothing to copy', 'error'); } catch {}
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for browsers without async clipboard permission.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const original = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch (e) {
    try { showNotification(`Copy failed: ${getErrorMessage(e, e)}`, 'error'); } catch {}
  }
}
