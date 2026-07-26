// @ts-check
// profile-runtime.js - Browser runtime refresh hooks for profile lifecycle.

import { isChatModuleLoaded, loadChatModule } from './chat-loader.js';
import { state } from './state.js';

export async function invalidateProfileContextCache() {
  try {
    const mod = await import('./lab-context.js');
    mod.invalidateLabContextCache?.();
  } catch (_) {}
}

export async function reloadProfileRuntimeShell(profileId) {
  const [
    chat,
    data,
    nav,
    views,
  ] = await Promise.all([
    isChatModuleLoaded() ? loadChatModule() : Promise.resolve(null),
    import('./data.js'),
    import('./nav.js'),
    import('./views.js'),
  ]);

  chat?.loadChatPersonality();
  const threadsLoaded = chat ? await chat.loadChatThreads?.() : false;
  if (threadsLoaded !== false && state.chatThreads.length > 0) chat?.ensureActiveThread?.();
  if (threadsLoaded !== false) await chat?.loadChatHistory?.();
  if (state.currentProfile !== profileId) return;

  chat?.renderThreadList?.();
  chat?.updateChatHeaderTitle?.();
  chat?.updatePersonalityBar?.();
  chat?.updateDiscussButton?.();
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
