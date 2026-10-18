import type { RuntimeDependencyUpdates } from './runtime-callbacks.js';
import type { SyncDiagnoseDependencies } from './sync-diagnose-actions-context.js';
import { configureSyncDiagnoseActions } from './sync-diagnose-actions.js';
import { createRetryingModuleLoader } from './retrying-module-loader.js';
import { beginSyncDiagnoseOpen } from './sync-diagnose-open-owner.js';
import { getErrorMessage } from './caught-error.js';
import { showNotification } from './utils.js';

// Keep configuration/actions/clipboard available without loading diagnostic UI.
export {
  confirmBackfillBlockers, confirmCompactRelay, confirmDisablePhase2,
  confirmEnablePhase2, confirmResetDeltaTelemetry, confirmRotateIdentity,
  refreshRelayStorage,
} from './sync-diagnose-actions.js';

let _isPhase2CutoverEnabled: (profileId?: string | null) => boolean = () => false;
type SyncDiagnoseUIDependencies = Omit<SyncDiagnoseDependencies, 'showSyncDiagnose'> & { isPhase2CutoverEnabled: typeof _isPhase2CutoverEnabled };
type DiagnoseUI = typeof import('./sync-diagnose-ui-impl.js');
const diagnoseUI = createRetryingModuleLoader<DiagnoseUI>(retry => retry
  ? import('./sync-diagnose-ui-impl.js?lazy-retry=1' as './sync-diagnose-ui-impl.js')
  : import('./sync-diagnose-ui-impl.js'));

export function configureSyncDiagnoseUI({
  enableSync,
  restoreFromMnemonic,
  isSyncEnabled,
  pushProfile,
  enablePhase2Cutover,
  disablePhase2Cutover,
  isPhase2CutoverEnabled,
}: RuntimeDependencyUpdates<SyncDiagnoseUIDependencies> = {}) {
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

/** First use owns its route/profile/modal context across loading and reads. */
export async function showSyncDiagnose(): Promise<void> {
  const owner = beginSyncDiagnoseOpen();
  try {
    const module = await diagnoseUI.load();
    if (!owner.current()) return;
    await module.showSyncDiagnose(owner, profileId => _isPhase2CutoverEnabled(profileId), copySyncDiagnose);
  } finally { owner.release(); }
}

// Copies the Sync diagnose snapshot to the clipboard. Walks up to find
// the overlay so we read the same `data-copy-text` blob the modal was
// rendered from (no stale-snapshot races when sync ticks during read).
export async function copySyncDiagnose(btn?: HTMLElement | null) {
  const overlay = btn?.closest?.<HTMLElement>('.modal-overlay');
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
    const original = btn!.textContent;
    btn!.textContent = 'Copied';
    setTimeout(() => { btn!.textContent = original; }, 1500);
  } catch (e) {
    try { showNotification(`Copy failed: ${getErrorMessage(e, e)}`, 'error'); } catch {}
  }
}
