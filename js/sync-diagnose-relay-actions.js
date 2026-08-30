// @ts-check
// sync-diagnose-relay-actions.js - Relay storage operations for Sync Diagnose.

import { getErrorMessage } from './caught-error.js';
import { showNotification } from './utils.js';
import {
  compactOwnerSelfServe, fetchOwnerStorageFromRelay, getRelayQuotaEstimate,
} from './sync-relay-health.js';
import { toggleSyncDetail } from './sync-ui.js';
import { showSyncDiagnoseForActions } from './sync-diagnose-actions-context.js';
import { confirmSyncDiagnoseActionRuntime } from './sync-diagnose-runtime.js';
import { prepareRelayCompaction, rebuildOwnerRelayState } from './sync-actions.js';

async function waitForRelayRebuild() {
  const delays = [0, 500, 1500, 3000];
  let latest = null;
  for (const delay of delays) {
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    latest = await fetchOwnerStorageFromRelay();
    if (latest && latest.storedBytes > 0 && (latest.messageCount === null || latest.messageCount > 0)) {
      return latest;
    }
  }
  throw new Error('the relay still reports an empty message log after rebuild');
}

// "Compact storage" - calls POST /self/compact-owner on the relay,
// HMAC-signed with the user's own writeKey. Drops every Evolu message
// row for this owner and zeroes storedBytes; this action immediately rebuilds
// a complete snapshot and verifies it server-side. Replaces the old "I just
// compacted" runbook flow that required SSH and a manual counter reset.
export async function confirmCompactRelay(btn) {
  const rebuildOnly = btn?.dataset?.syncRebuildOnly === '1';
  const q = getRelayQuotaEstimate();
  const mb = q ? (q.bytes / 1024 / 1024).toFixed(1) : '?';
  const message = rebuildOnly
    ? 'Retry rebuilding the relay snapshot from this device? Keep this tab open until verification finishes.'
    : `Reduce storage (currently ~${mb} MB)? This replaces the relay log with a fresh snapshot from this device. Sync each device's latest changes first. Offline devices can reconnect safely later. Keep this tab open until the rebuild finishes; local data is untouched.`;
  // Never perform destructive relay maintenance if the confirmation adapter
  // is unavailable. A missing dialog must fail closed.
  const proceed = await confirmSyncDiagnoseActionRuntime(message, { fallback: false });
  if (!proceed) return;
  if (btn) { btn.disabled = true; btn.textContent = rebuildOnly ? 'Rebuilding…' : 'Reducing…'; }
  let compacted = rebuildOnly;
  try {
    let result = null;
    if (!rebuildOnly) {
      // Includes the Evolu 8 generation-persistence preflight. Nothing may
      // delete the relay log until that local history boundary is durable.
      await prepareRelayCompaction();
      result = await compactOwnerSelfServe();
      compacted = true;
    }
    if (btn) btn.textContent = 'Rebuilding…';
    const rebuilt = await rebuildOwnerRelayState();
    if (btn) btn.textContent = 'Verifying…';
    const fresh = await waitForRelayRebuild();
    const afterBytes = fresh?.storedBytes ?? result?.afterStoredBytes;
    const after = typeof afterBytes === 'number'
      ? `${(afterBytes / (1024 * 1024)).toFixed(2)} MB`
      : 'updated';
    showNotification(`Relay storage reduced and rebuilt · ${rebuilt.succeeded} profile(s) sent · ${after}`, 'success');
    if (btn?.dataset) delete btn.dataset.syncRebuildOnly;
    if (btn) {
      const overlay = btn.closest?.('.modal-overlay');
      if (overlay) overlay.remove();
    }
    if (document.getElementById('sync-popover')) {
      toggleSyncDetail(); toggleSyncDetail();
    }
  } catch (e) {
    showNotification(
      compacted
        ? `Relay storage was reduced, but the rebuild did not finish: ${getErrorMessage(e, e)}. Keep this device online and retry the rebuild.`
        : `Storage reduction failed: ${getErrorMessage(e, e)}`,
      'error',
    );
    if (btn) {
      btn.disabled = false;
      btn.textContent = compacted ? 'Retry rebuild' : 'Reduce storage';
      if (compacted && btn.dataset) btn.dataset.syncRebuildOnly = '1';
    }
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
    showNotification(`Refresh failed: ${getErrorMessage(e, e)}`, 'error');
  } finally {
    if (btn && !btn.closest?.('.modal-overlay')?.parentElement) return;
    if (btn) { btn.disabled = false; btn.textContent = 'Refresh'; }
  }
}
