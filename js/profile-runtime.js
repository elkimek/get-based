// @ts-check
// profile-runtime.js - Browser runtime refresh hooks for profile lifecycle.

import { isChatModuleLoaded, loadChatModule } from './chat-loader.js';
import { state } from './state.js';
import {
  reconcileManualMetricTombstones,
  isManualMetricTombstoned,
} from './wearables-manual.js';

/** @typedef {{
 * buildSidebar: () => void,
 * destroyAllCharts: () => void,
 * getInitialView: () => string,
 * hydrateNutritionSummary: (profileId: string) => Promise<unknown>,
 * invalidateLabContextCache: () => void,
 * migrateBiometricsToManual: (profileId: string, biometrics: Record<string, unknown> | null) => Promise<unknown>,
 * navigate: (view: string) => unknown,
 * renderProfileButton: () => void,
 * syncWearableSummary: (profileId: string, sources: object) => Promise<unknown>,
 * updateHeaderDates: () => void,
 * updateHeaderRangeToggle: () => void,
 * }} ProfileRefreshDependencies */
/** @type {ProfileRefreshDependencies} */
const profileRefreshDeps = {
  buildSidebar: () => {},
  destroyAllCharts: () => {},
  getInitialView: () => 'dashboard',
  hydrateNutritionSummary: async () => {},
  invalidateLabContextCache: () => {},
  migrateBiometricsToManual: async () => {},
  navigate: () => {},
  renderProfileButton: () => {},
  syncWearableSummary: async () => {},
  updateHeaderDates: () => {},
  updateHeaderRangeToggle: () => {},
};

/** @param {Partial<ProfileRefreshDependencies>} [deps] */
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
  const data = state.importedData;
  const isCurrent = () => state.currentProfile === profileId && state.importedData === data;
  if (!isCurrent()) return;
  try { await profileRefreshDeps.hydrateNutritionSummary(profileId); }
  catch { if (isCurrent()) state.nutritionSummary = null; }
  if (!isCurrent()) return;
  const chat = isChatModuleLoaded() ? await loadChatModule() : null;
  if (!isCurrent()) return;

  await chat?.loadCustomPersonalities?.();
  if (!isCurrent()) return;
  chat?.loadChatPersonality();
  const threadsLoaded = chat ? await chat.loadChatThreads?.() : false;
  if (!isCurrent()) return;
  if (threadsLoaded !== false && state.chatThreads.length > 0) chat?.ensureActiveThread?.();
  if (threadsLoaded !== false) await chat?.loadChatHistory?.();
  if (!isCurrent()) return;

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
  const data = state.importedData;
  const isCurrent = () => state.currentProfile === profileId && state.importedData === data;
  if (!isCurrent()) return;
  const connect = await import('./wearables-connect.js');
  if (!isCurrent()) return;
  // Finish any profile-side disconnect cleanup journaled atomically with a
  // prior credential/row purge whose profile save failed.
  try { await connect.recoverPendingWearableDisconnect(profileId, data); } catch {}
  if (!isCurrent()) return;
  try { await profileRefreshDeps.migrateBiometricsToManual(profileId, biometrics); } catch {}
  // The user can swap profile A→B during an IDB read. Abort before and after
  // summary persistence so A's metrics can never be saved into B's profile.
  if (!isCurrent()) return;
  try { await profileRefreshDeps.syncWearableSummary(profileId, connect.listConnectedSources()); } catch {}
  if (!isCurrent()) return;
  connect.syncStaleWearablesNow?.().catch(() => {});
}

// Apply newly pulled manual-reading deletion markers before sync-pull renders
// the active profile. `merged` is the object that pull will persist, so IDB,
// legacy biometrics, and the derived wearable summary converge atomically
// from the user's perspective.
export async function reconcilePulledManualWearables(profileId, merged) {
  if (!profileId || profileId !== state.currentProfile || !merged || typeof merged !== 'object') return false;
  // Reconcile the draft without exposing it as live data across an await.
  const result = await reconcileManualMetricTombstones(profileId, merged);
  if (!result || result.skipped) return false;
  let changed = !!(result.prunedRows || result.prunedLegacy);
  // L1 histories are device-local. A local rebuild cannot replace this shared
  // summary: invalidate only manual latest readings explicitly deleted by pull.
  for (const [metric, value] of Object.entries(merged.wearableSummary?.metrics || {})) {
    if (value?.primarySource === 'manual' && isManualMetricTombstoned(metric, value.latestDate, merged)) {
      delete merged.wearableSummary.metrics[metric];
      changed = true;
    }
  }
  return changed;
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
