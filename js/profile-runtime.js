// @ts-check
// profile-runtime.js - Browser runtime refresh hooks for profile lifecycle.

import { isChatModuleLoaded, loadChatModule } from './chat-loader.js';
import { state } from './state.js';

/** @type {Record<string, (...args: any[]) => any>} */
const profileRefreshDeps = {
  buildSidebar: () => {},
  destroyAllCharts: () => {},
  getInitialView: () => 'dashboard',
  invalidateLabContextCache: () => {},
  migrateBiometricsToManual: async () => {},
  navigate: () => {},
  renderProfileButton: () => {},
  syncWearableSummary: async () => {},
  updateHeaderDates: () => {},
  updateHeaderRangeToggle: () => {},
};

export function configureProfileRefreshDeps(deps = {}) {
  const previous = { ...profileRefreshDeps };
  for (const key of Object.keys(profileRefreshDeps)) {
    if (typeof deps[key] === 'function') profileRefreshDeps[key] = deps[key];
  }
  return previous;
}

export function invalidateProfileContextCache() {
  profileRefreshDeps.invalidateLabContextCache();
}

export async function reloadProfileRuntimeShell(profileId) {
  const chat = isChatModuleLoaded() ? await loadChatModule() : null;

  chat?.loadChatPersonality();
  const threadsLoaded = chat ? await chat.loadChatThreads?.() : false;
  if (threadsLoaded !== false && state.chatThreads.length > 0) chat?.ensureActiveThread?.();
  if (threadsLoaded !== false) await chat?.loadChatHistory?.();
  if (state.currentProfile !== profileId) return;

  chat?.renderThreadList?.();
  chat?.updateChatHeaderTitle?.();
  chat?.updatePersonalityBar?.();
  chat?.updateDiscussButton?.();
  profileRefreshDeps.destroyAllCharts();
  profileRefreshDeps.buildSidebar();
  profileRefreshDeps.navigate(profileRefreshDeps.getInitialView() || 'dashboard');
  profileRefreshDeps.updateHeaderDates();
  profileRefreshDeps.updateHeaderRangeToggle();
  profileRefreshDeps.renderProfileButton();
}

// Refresh wearable summary for the freshly-loaded profile so the strip
// reflects this profile's L1 IDB rather than carrying over stale state from
// the boot profile. Migration runs first (idempotent per profile), then the
// summary recomputes from this profile's connected sources.
export async function refreshProfileWearables(profileId, biometrics) {
  const connect = await import('./wearables-connect.js');
  try { await profileRefreshDeps.migrateBiometricsToManual(profileId, biometrics); } catch {}
  // The user can swap profile A→B during an IDB read. Abort before and after
  // summary persistence so A's metrics can never be saved into B's profile.
  if (state.currentProfile !== profileId) return;
  try { await profileRefreshDeps.syncWearableSummary(profileId, connect.listConnectedSources()); } catch {}
  if (state.currentProfile !== profileId) return;
  connect.syncStaleWearablesNow?.().catch(() => {});
}

export function refreshProfileButton() {
  profileRefreshDeps.renderProfileButton();
}

export function dispatchProfileSwitched(profileId) {
  if (typeof globalThis.CustomEvent !== 'function') return;
  try {
    globalThis.dispatchEvent(new CustomEvent('labcharts-profile-switched', { detail: { profileId } }));
  } catch (_) {}
}
