// @ts-check
// sync-pull-active-refresh.js - active-profile UI refresh after inbound pulls.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { migrateProfileData } from './profile.js';
import {
  dispatchSyncAppliedRuntime,
  navigatePulledActiveViewRuntime,
  rebuildPulledSidebarRuntime,
  refreshPulledChatRuntime,
} from './sync-pull-active-refresh-runtime.js';

const UPDATE_TOAST_COOLDOWN_MS = 2500;
let lastUpdateToastProfileId = null;
let lastUpdateToastAt = 0;

/** @param {((...args: any[]) => any) | undefined} debug */
function dbg(debug, ...args) {
  try { debug?.(...args); } catch {}
}

function shouldShowUpdateToast(profileId) {
  const now = Date.now();
  if (profileId === lastUpdateToastProfileId && now - lastUpdateToastAt < UPDATE_TOAST_COOLDOWN_MS) {
    return false;
  }
  lastUpdateToastProfileId = profileId;
  lastUpdateToastAt = now;
  return true;
}

function hasOpenModalOverlay() {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return false;
  return !!document.querySelector('.modal-overlay.show, #modal-overlay.show');
}

/** @param {{
 *   profileId?: string,
 *   merged?: any,
 *   chatApplied?: boolean,
 *   remoteBroughtNewRows?: boolean,
 *   localDataChanged?: boolean,
 *   localCommitEcho?: boolean,
 *   debug?: (...args: any[]) => any,
 * }} [options]
 */
export function refreshActiveProfileAfterPull({
  profileId,
  merged,
  chatApplied,
  remoteBroughtNewRows,
  localDataChanged,
  localCommitEcho,
  debug,
} = {}) {
  if (profileId !== state.currentProfile) return false;

  const shouldRefreshVisibleData = typeof localDataChanged === 'boolean'
    ? localDataChanged
    : !!remoteBroughtNewRows;

  state.importedData = merged;
  migrateProfileData(state.importedData);

  // Reload chat threads + active thread messages into memory and re-render.
  if (chatApplied) {
    refreshPulledChatRuntime();
  }

  // Re-render whatever view the user is on so the merged state becomes
  // visible - but ONLY when the merge actually changed local importedData.
  // Subscription bursts can re-deliver the same relay state via profile rows,
  // item rows, and the poll safety net; those no-op pulls must not create
  // duplicate "updated from another device" toasts or modal refreshes.
  // Source: state.currentView (canonical). DOM .nav-item.active
  // is briefly absent during buildSidebar->navigate cycles and
  // would yank the user to 'dashboard' on a pull landing in
  // that gap (user-reported flicker/sync race).
  const cat = state.currentView || document.querySelector('.nav-item.active')?.['dataset']?.category || 'dashboard';

  // Sidebar nav items are conditional on data presence (e.g. the
  // Genetics entry only renders when state.importedData.genetics
  // exists). Per-row CRDT deltas can populate scalars/maps that
  // localHasRowsRemoteLacks() doesn't see - it only diffs id-keyed
  // arrays in the blob. Always rebuild the sidebar after a pull so
  // those entries appear/disappear without waiting for the next
  // local action. Cheap (~1ms) and doesn't disturb in-progress
  // forms in the main pane.
  rebuildPulledSidebarRuntime();

  if (!shouldRefreshVisibleData) {
    // Profile-field / chat / displayPrefs handlers above already
    // re-rendered their own surfaces; skip the global navigate() so an
    // in-progress form (e.g. typing a duration into the session log dialog)
    // survives duplicate no-op pull triggers.
    dbg(debug, `Pulled active profile ${profileId.slice(0,8)} — no visible data change, skipping re-render of '${cat}'`);
  } else {
    navigatePulledActiveViewRuntime(cat, hasOpenModalOverlay() ? { preserveScroll: true } : undefined);
    if (cat !== 'dashboard' && !localCommitEcho && shouldShowUpdateToast(profileId)) {
      showNotification('Data updated from another device', 'success');
    }
    if (localCommitEcho) dbg(debug, `Suppressed local commit echo toast for ${profileId.slice(0,8)}`);
    dbg(debug, `Pulled active profile ${profileId.slice(0,8)} → re-rendered '${cat}'`);
  }

  // Broadcast for any detached UI listening for cross-device
  // updates (e.g., the All-Sessions modal in views.js). The
  // navigate() above already rebuilt the inline page; this
  // event covers floating modals that aren't part of the main
  // tree. Greptile PR #178 P2 comment.
  if (shouldRefreshVisibleData) dispatchSyncAppliedRuntime();

  return true;
}
