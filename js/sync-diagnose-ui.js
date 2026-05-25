// sync-diagnose-ui.js - Sync Diagnose modal lifecycle and copy handling.

import { showNotification, isDebugMode } from './utils.js';
import { _evoluDiagnosticsText, getEvoluDiagnostics } from './sync-diagnostics.js';
import { getRelayQuotaEstimate, verifyPushLanded } from './sync-relay-health.js';
import { configureSyncDiagnoseActions } from './sync-diagnose-actions.js';
import { renderSyncDiagnoseModal } from './sync-diagnose-render.js';

export {
  confirmBackfillBlockers, confirmCompactRelay, confirmDisablePhase2,
  confirmEnablePhase2, confirmResetDeltaTelemetry, confirmRotateIdentity,
  refreshRelayStorage,
} from './sync-diagnose-actions.js';

let _isPhase2CutoverEnabled = () => false;

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

// Read-only modal that dumps Evolu's local state - both devices should
// show the same `ownerId` / `mnemonicPrefix`. If they differ, the two
// devices are talking to different Evolu owners and will never see each
// other's data despite using the same relay URL.
export async function showSyncDiagnose() {
  const diagnostics = await getEvoluDiagnostics();
  let healthVerdict = { verdict: 'unknown', at: 0, reason: null };
  try { healthVerdict = await verifyPushLanded(); } catch {}

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
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
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
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
    try { showNotification(`Copy failed: ${e?.message || e}`, 'error'); } catch {}
  }
}
