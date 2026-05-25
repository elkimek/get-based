// sync-diagnose-relay-actions.js - Relay storage operations for Sync Diagnose.

import { showNotification } from './utils.js';
import {
  compactOwnerSelfServe, fetchOwnerStorageFromRelay, getRelayQuotaEstimate,
} from './sync-relay-health.js';
import { toggleSyncDetail } from './sync-ui.js';
import { showSyncDiagnoseForActions } from './sync-diagnose-actions-context.js';

// "Compact storage" - calls POST /self/compact-owner on the relay,
// HMAC-signed with the user's own writeKey. Drops every Evolu message
// row for this owner and zeroes storedBytes; devices re-establish their
// state on the next push. Replaces the old "I just compacted" runbook
// flow that required SSH access and a manual local-counter reset.
export async function confirmCompactRelay(btn) {
  const q = getRelayQuotaEstimate();
  const mb = q ? (q.bytes / 1024 / 1024).toFixed(1) : '?';
  const message = `Compact this owner's storage on the relay (currently ~${mb} MB)? Drops the Evolu message log; every device re-establishes its CRDT state on the next push (a few seconds). Your local data is untouched.`;
  // Helper unavailable (utils.js failed to load) -> proceed without
  // confirmation rather than dead-end the user. Safety net mirrors the
  // pattern in the confirm* helpers in the sibling action modules.
  const proceed = (typeof window.showConfirmDialog === 'function')
    ? await window.showConfirmDialog(message)
    : true;
  if (!proceed) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Compacting…'; }
  try {
    const result = await compactOwnerSelfServe();
    const after = typeof result?.afterStoredBytes === 'number'
      ? `${(result.afterStoredBytes / (1024 * 1024)).toFixed(2)} MB`
      : '0 MB';
    showNotification(`Relay storage compacted · ${result?.deletedMessages ?? '?'} rows dropped · ${after}`, 'success');
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) overlay.remove();
    }
    if (document.getElementById('sync-popover')) {
      toggleSyncDetail(); toggleSyncDetail();
    }
  } catch (e) {
    showNotification(`Compact failed: ${e?.message || e}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Compact storage'; }
  }
}

// "Refresh" - probe /self/owner-storage for the relay's authoritative
// storedBytes for this owner. Mirrors into the local cache so the
// indicator is accurate, not an estimate. Useful after the maintainer
// or another device has compacted.
export async function refreshRelayStorage(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Refreshing…'; }
  try {
    const result = await fetchOwnerStorageFromRelay();
    if (!result) {
      showNotification('Could not reach relay storage probe (older relay or offline?)', 'error');
      return;
    }
    showNotification(`Relay reports ${(result.storedBytes / (1024 * 1024)).toFixed(2)} MB`, 'success');
    if (document.getElementById('sync-popover')) {
      toggleSyncDetail(); toggleSyncDetail();
    }
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) {
        // Re-render the modal in place - close and reopen via the same
        // entrypoint so all sections (including the now-fresh quota
        // tile) re-derive from the updated cache.
        overlay.remove();
        showSyncDiagnoseForActions();
      }
    }
  } catch (e) {
    showNotification(`Refresh failed: ${e?.message || e}`, 'error');
  } finally {
    if (btn && !btn.closest?.('.modal-overlay')?.parentElement) return;
    if (btn) { btn.disabled = false; btn.textContent = 'Refresh'; }
  }
}
