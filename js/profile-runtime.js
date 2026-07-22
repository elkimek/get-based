// @ts-check
// profile-runtime.js - Browser runtime refresh hooks for profile lifecycle.

import { state } from './state.js';

export async function invalidateProfileContextCache() {
  try {
    const mod = await import('./lab-context.js');
    mod.invalidateLabContextCache?.();
  } catch (_) {}
}

export async function reloadProfileRuntimeShell(profileId) {
  const [
    chatPersonalities,
    chatThreads,
    chatHistory,
    chatDiscussion,
    data,
    nav,
    views,
  ] = await Promise.all([
    import('./chat-personalities.js'),
    import('./chat-threads.js'),
    import('./chat-history.js'),
    import('./chat-discussion.js'),
    import('./data.js'),
    import('./nav.js'),
    import('./views.js'),
  ]);

  chatPersonalities.loadChatPersonality();
  const threadsLoaded = await chatThreads.loadChatThreads?.();
  if (threadsLoaded !== false && state.chatThreads.length > 0) chatThreads.ensureActiveThread?.();
  if (threadsLoaded !== false) await chatHistory.loadChatHistory?.();
  if (state.currentProfile !== profileId) return;

  chatThreads.renderThreadList?.();
  chatPersonalities.updateChatHeaderTitle?.();
  chatPersonalities.updatePersonalityBar?.();
  chatDiscussion.updateDiscussButton?.();
  data.destroyAllCharts();
  nav.buildSidebar();
  views.navigate(views.getInitialView?.() || 'dashboard');
  data.updateHeaderDates();
  data.updateHeaderRangeToggle();
  nav.renderProfileButton();
}

// Refresh wearable summary for the freshly-loaded profile so the strip
// reflects this profile's L1 IDB rather than carrying over stale state from
// the boot profile. Migration runs first (idempotent per profile), then the
// summary recomputes from this profile's connected sources.
export async function refreshProfileWearables(profileId, biometrics) {
  const [manual, summary, connect] = await Promise.all([
    import('./wearables-manual.js'),
    import('./wearables-summary.js'),
    import('./wearables-connect.js'),
  ]);
  try { await manual.migrateBiometricsToManual(profileId, biometrics); } catch {}
  // The user can swap profile A→B during an IDB read. Abort before and after
  // summary persistence so A's metrics can never be saved into B's profile.
  if (state.currentProfile !== profileId) return;
  try { await summary.syncWearableSummary(profileId, connect.listConnectedSources()); } catch {}
  if (state.currentProfile !== profileId) return;
  connect.syncStaleWearablesNow?.().catch(() => {});
}

export async function refreshProfileButton() {
  try {
    const mod = await import('./nav.js');
    mod.renderProfileButton();
  } catch (_) {}
}

export function dispatchProfileSwitched(profileId) {
  if (typeof globalThis.CustomEvent !== 'function') return;
  try {
    globalThis.dispatchEvent(new CustomEvent('labcharts-profile-switched', { detail: { profileId } }));
  } catch (_) {}
}
