// sync-pull-active-refresh.js - active-profile UI refresh after inbound pulls.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { migrateProfileData } from './profile.js';

function dbg(debug, ...args) {
  try { debug?.(...args); } catch {}
}

export function refreshActiveProfileAfterPull({
  profileId,
  merged,
  chatApplied,
  remoteBroughtNewRows,
  debug,
} = {}) {
  if (profileId !== state.currentProfile) return false;

  state.importedData = merged;
  migrateProfileData(state.importedData);

  // Reload chat threads + active thread messages into memory and re-render.
  if (chatApplied) {
    window.loadChatThreads?.();
    window.ensureActiveThread?.();
    window.renderThreadList?.();
    window.loadChatHistory?.(); // reloads state.chatHistory from localStorage + renders
  }

  // Re-render whatever view the user is on so the merged state
  // becomes visible - but ONLY when the merge actually produced
  // new content from the remote side. When remoteBroughtNewRows
  // is false, local was already a superset => no observable change
  // => skip the re-render so an in-progress form doesn't get wiped on pull.
  // Source: state.currentView (canonical). DOM .nav-item.active
  // is briefly absent during buildSidebar->navigate cycles and
  // would yank the user to 'dashboard' on a pull landing in
  // that gap (user-reported flicker/sync race).
  const cat = state.currentView || document.querySelector('.nav-item.active')?.dataset?.category || 'dashboard';

  // Sidebar nav items are conditional on data presence (e.g. the
  // Genetics entry only renders when state.importedData.genetics
  // exists). Per-row CRDT deltas can populate scalars/maps that
  // localHasRowsRemoteLacks() doesn't see - it only diffs id-keyed
  // arrays in the blob. Always rebuild the sidebar after a pull so
  // those entries appear/disappear without waiting for the next
  // local action. Cheap (~1ms) and doesn't disturb in-progress
  // forms in the main pane.
  if (window.buildSidebar) try { window.buildSidebar(); } catch (e) {}

  if (!remoteBroughtNewRows) {
    // Remote brought nothing new (local was already a superset or
    // identical for every id-keyed array). Profile-field / chat /
    // displayPrefs handlers above already re-rendered their own
    // surfaces; skip the global navigate() so an in-progress form
    // (e.g. typing a duration into the session log dialog) survives.
    dbg(debug, `Pulled active profile ${profileId.slice(0,8)} — no new rows from remote, skipping re-render of '${cat}'`);
  } else {
    window.navigate?.(cat);
    if (cat !== 'dashboard') {
      showNotification('Data updated from another device', 'success');
    }
    dbg(debug, `Pulled active profile ${profileId.slice(0,8)} → re-rendered '${cat}'`);
  }

  // Broadcast for any detached UI listening for cross-device
  // updates (e.g., the All-Sessions modal in views.js). The
  // navigate() above already rebuilt the inline page; this
  // event covers floating modals that aren't part of the main
  // tree. Greptile PR #178 P2 comment.
  if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
    try { window.dispatchEvent(new CustomEvent('labcharts-sync-applied')); } catch (_) {}
  }

  return true;
}
