// @ts-check
// sync-lifecycle.js - Sync enable / pause / disconnect lifecycle actions.

import { showNotification } from './utils.js';
import { getSyncBlocker } from './sync-environment.js';
import {
  isSyncEnabled, isSyncPaused, setSyncEnabled, setSyncPaused,
} from './sync-settings-state.js';
import { clearSyncDisableStorage } from './sync-disable-cleanup.js';
import { resetSyncStatus } from './sync-state.js';
import { pushAllProfiles } from './sync-actions.js';
import { clearSyncSaveTimers } from './sync-save-hooks.js';
import { clearSyncPullTimers, forcePull } from './sync-pull.js';
import { clearSyncSubscriptionTimers } from './sync-subscriptions.js';
import { renderSyncIndicator } from './sync-ui.js';
import { initSync } from './sync-init.js';
import {
  clearSyncRuntimeState, getSyncAppOwner, getSyncAppOwnerError, getSyncEvolu,
  getSyncQueryLoadedPromise, getSyncReadyPromise, scheduleSyncRuntimeReload,
  setSyncAppOwnerError,
} from './sync-runtime.js';
import { getPendingBackupRestoreProfileIds } from './sync-backup-restore-state.js';

/** @param {{ skipPush?: boolean, persist?: boolean }} [options] */
export async function enableSync({ skipPush = false, persist = true } = {}) {
  const resuming = isSyncPaused();
  // Reject early if the webview can't actually run Evolu - no point flipping
  // the persisted flag and starting init only to time out at 30s.
  const blocker = getSyncBlocker();
  if (blocker) {
    showNotification(`Sync unavailable in this browser: ${blocker}`, 'error');
    return false;
  }
  if (persist) setSyncEnabled(true);
  else setSyncEnabled(true, { persist: false });
  setSyncAppOwnerError(null);
  await initSync();
  const readyPromise = getSyncReadyPromise();
  if (!getSyncEvolu() || !readyPromise) {
    // initSync bailed before evolu was created - likely an import / module
    // load failure. Already logged by initSync; surface a toast so the user
    // doesn't sit staring at a Resolving... spinner.
    showNotification(`Sync failed to initialize. ${getSyncAppOwnerError() || 'Check console for [sync] errors.'}`, 'error');
    return false;
  }
  // Race the owner-resolution promise against a 30s ceiling. A stuck
  // OPFS handle or a Web Lock that never resolves can leave Evolu's
  // appOwner promise pending forever - without this race the await
  // blocks toggleSync's finally, leaving the UI stuck.
  const timeout = new Promise(resolve => setTimeout(() => resolve('__timeout__'), 30000));
  const result = await Promise.race([readyPromise.then(() => 'ok'), timeout]);
  if (result === '__timeout__' || !getSyncAppOwner()) {
    const reason = getSyncAppOwnerError() || 'Evolu owner did not resolve within 30s';
    showNotification(`Sync init failed: ${reason}`, 'error');
    return false;
  }
  const queryLoaded = getSyncQueryLoadedPromise();
  if (queryLoaded) {
    // Cap query load too - same hang risk.
    await Promise.race([queryLoaded, new Promise(r => setTimeout(r, 30000))]);
  }
  if (!skipPush) {
    try { await forcePull(); } catch (e) { console.warn('[sync] initial pull failed:', e); }
    // A resumed runtime already has an Evolu row cache which may still be the
    // paused, pre-relay snapshot. Republishing every profile immediately can
    // race the first remote delivery and overwrite changes made on another
    // device while this one was paused. onSyncReceived flushes only durable
    // dirty profiles before merging; clean profiles should wait for the bound
    // relay subscriptions instead of being needlessly rewritten.
    if (!resuming) {
      try { await pushAllProfiles(); } catch (e) { console.warn('[sync] initial push failed:', e); }
    }
  }
  if (persist) {
    showNotification(resuming ? 'Sync resumed' : 'Sync enabled', 'success');
    renderSyncIndicator();
  }
  return true;
}

export async function pauseSync() {
  if (!isSyncEnabled()) return false;
  setSyncPaused(true);
  setSyncAppOwnerError(null);
  clearSyncSaveTimers();
  clearSyncPullTimers();
  clearSyncSubscriptionTimers();
  resetSyncStatus();
  renderSyncIndicator();

  // Keep Evolu's local database, owner, mnemonic, planner snapshots, runtime,
  // and dirty markers intact. Subscription/timer cleanup above stops inbound
  // application merges; paused local edits are queued by the normal hooks.
  showNotification('Sync paused', 'success');
  return true;
}

export async function disableSync() {
  const evolu = getSyncEvolu();
  if (evolu?.__evoluClientVersion === 8) {
    try {
      if (typeof evolu.prepareHistoryReset !== 'function') {
        throw new Error('Evolu 8 history-reset preflight is unavailable');
      }
      // This synchronous reservation makes the next generation durable before
      // the eventual reload. resetAppOwner consumes it without writing again.
      evolu.prepareHistoryReset();
    } catch {
      showNotification(
        'Sync was not disabled because this browser could not safely retire its local sync history. Free browser storage and try again.',
        'error',
      );
      return false;
    }
  }
  // Flip the persisted flag FIRST, before any awaits. If anything below
  // hangs (Evolu worker stuck on OPFS or a Web Lock), a manual page
  // reload will still see sync as off.
  setSyncEnabled(false);
  setSyncAppOwnerError(null);

  // Stop background timers + reset status (UI feedback before the reload).
  clearSyncSaveTimers();
  clearSyncPullTimers();
  clearSyncSubscriptionTimers();
  resetSyncStatus();
  renderSyncIndicator();

  // v1.7.11 audit fix: clear per-array delta snapshots too. After a
  // re-enable (which may bring a different Evolu owner via mnemonic
  // change), the OLD snapshot would tell the planner "I already pushed
  // these items" -> next push silently skips them, so the new owner's
  // relay never receives the user's existing data. Drop the snapshots
  // so the next push re-emits everything as inserts (relay starts
  // empty under the new owner anyway). Same for telemetry + cutover
  // flag (cutover was profile-scoped to the previous owner).
  const restoredProfileIds = getPendingBackupRestoreProfileIds();
  if (restoredProfileIds.length > 0) {
    clearSyncDisableStorage({ preserveDirtyProfileIds: restoredProfileIds });
  } else {
    clearSyncDisableStorage();
  }

  // Fire-and-forget the Evolu reset. We can't trust this await: if the
  // worker is hung (OPFS / lock contention), `resetAppOwner` never
  // resolves and the user sees the toggle silently do nothing.
  // The page reload below kills the worker process anyway, so a
  // half-completed reset is harmless - the new tab boots clean.
  if (evolu) {
    try {
      Promise.resolve(evolu.resetAppOwner({ reload: false }))
        .catch(e => console.warn('[sync] Evolu reset failed (proceeding anyway):', e));
    } catch (e) {
      console.warn('[sync] Evolu reset threw synchronously:', e);
    }
  }

  // Drop in-memory references so any stray callers see fresh-state behavior.
  clearSyncRuntimeState();

  showNotification('Sync disabled — reloading…', 'success');
  // Reload regardless of whether Evolu cooperated. ~250ms gives the toast
  // time to render before the page swaps.
  scheduleSyncRuntimeReload(250);
  return true;
}
