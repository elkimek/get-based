// profile-runtime.js - Browser runtime refresh hooks for profile lifecycle.

import { configureRuntimeDependencies } from './runtime-callbacks.js';
import { isChatModuleLoaded, loadChatModule } from './chat-loader.js';
import { state } from './state.js';
import { getSyncAppOwner } from './sync-runtime.js';
import {
  reconcileManualMetricTombstones,
  hasManualData,
  isManualMetricTombstoned,
} from './wearables-manual.js';

type ProfileRefreshDependencies = {[Key in 'buildSidebar'|'destroyAllCharts'|'getInitialView'|'hydrateNutritionSummary'|'invalidateLabContextCache'|'migrateBiometricsToManual'|'navigate'|'renderProfileButton'|'syncWearableSummary'|'updateHeaderDates'|'updateHeaderRangeToggle']:unknown};
interface ProfileRefreshOperations {buildSidebar():unknown;destroyAllCharts():unknown;getInitialView():unknown;hydrateNutritionSummary(profileId:string):unknown;invalidateLabContextCache():unknown;migrateBiometricsToManual(profileId:string,biometrics:unknown):unknown;navigate(view:unknown):unknown;renderProfileButton():unknown;syncWearableSummary(profileId:string,sources:Parameters<typeof import('./wearables-summary.js').syncWearableSummary>[1]):unknown;updateHeaderDates():unknown;updateHeaderRangeToggle():unknown}
interface PulledWearableMetric {primarySource?:unknown;latestDate?:unknown}
interface PulledWearableReader {wearableSummary?:{metrics?:Record<string,PulledWearableMetric|null|undefined>}|null}
const profileRefreshDeps: ProfileRefreshDependencies = {
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

export function configureProfileRefreshDeps(deps: unknown = {}) {
  return (configureRuntimeDependencies as (target:ProfileRefreshDependencies,deps:unknown)=>ProfileRefreshDependencies)(profileRefreshDeps, deps);
}

export function invalidateProfileContextCache() {
  (profileRefreshDeps as ProfileRefreshOperations).invalidateLabContextCache();
}

export async function reloadProfileRuntimeShell(profileId: string) {
  const data = state.importedData;
  const isCurrent = () => state.currentProfile === profileId && state.importedData === data;
  const history = state.chatHistory;
  // Profile activation clears Chat before hydration. Once native Chat claims it,
  // this older initialization must not restore over a new conversation/review.
  const canRestoreChat = () => isCurrent() && state.currentThreadId === null && state.chatHistory === history && history.length === 0;
  if (!isCurrent()) return;
  try { await (profileRefreshDeps as ProfileRefreshOperations).hydrateNutritionSummary(profileId); }
  catch { if (isCurrent()) state.nutritionSummary = null; }
  if (!isCurrent()) return;
  const chat = isChatModuleLoaded() ? await loadChatModule() : null;
  if (!isCurrent()) return;

  if (canRestoreChat()) {
    await chat?.loadCustomPersonalities?.();
    if (!isCurrent()) return;
    if (canRestoreChat()) chat?.loadChatPersonality();
    const threadsLoaded = canRestoreChat() && chat ? await chat.loadChatThreads?.() : false;
    if (!isCurrent()) return;
    if (canRestoreChat() && threadsLoaded !== false) {
      if (state.chatThreads.length > 0) chat?.ensureActiveThread?.();
      await chat?.loadChatHistory?.();
    }
  }
  if (!isCurrent()) return;

  chat?.renderThreadList?.();
  chat?.updateChatHeaderTitle?.();
  chat?.updatePersonalityBar?.();
  chat?.updateDiscussButton?.();
  (profileRefreshDeps as ProfileRefreshOperations).destroyAllCharts();
  (profileRefreshDeps as ProfileRefreshOperations).buildSidebar();
  (profileRefreshDeps as ProfileRefreshOperations).navigate((profileRefreshDeps as ProfileRefreshOperations).getInitialView() || 'dashboard');
  (profileRefreshDeps as ProfileRefreshOperations).updateHeaderDates();
  (profileRefreshDeps as ProfileRefreshOperations).updateHeaderRangeToggle();
  (profileRefreshDeps as ProfileRefreshOperations).renderProfileButton();
}

// Refresh wearable summary for the freshly-loaded profile so the strip
// reflects this profile's L1 IDB rather than carrying over stale state from
// the boot profile. Migration runs first (idempotent per profile), then the
// summary recomputes from this profile's connected sources.
export async function refreshProfileWearables(profileId: string, biometrics: unknown) {
  const data = state.importedData;
  const isCurrent = () => state.currentProfile === profileId && state.importedData === data;
  if (!isCurrent()) return;
  const connect = await import('./wearables-connect.js');
  if (!isCurrent()) return;
  // Finish any profile-side disconnect cleanup journaled atomically with a
  // prior credential/row purge whose profile save failed.
  try { await connect.recoverPendingWearableDisconnect(profileId, data); } catch {}
  if (!isCurrent()) return;
  try { await (profileRefreshDeps as ProfileRefreshOperations).migrateBiometricsToManual(profileId, biometrics); } catch {}
  // The user can swap profile A→B during an IDB read. Abort before and after
  // summary persistence so A's metrics can never be saved into B's profile.
  if (!isCurrent()) return;
  if (Object.keys(data.manualBodyReadings || {}).length || await hasManualData(profileId)) {
    if (!isCurrent()) return;
    const manual = await import('./wearables-manual-sync.js');
    if (!isCurrent()) return;
    try { await manual.catchUpManualBodyReadings(profileId); } catch {}
    if (!isCurrent()) return;
  }
  try { await (profileRefreshDeps as ProfileRefreshOperations).syncWearableSummary(profileId, connect.listConnectedSources()); } catch {}
  if (!isCurrent()) return;
  connect.syncStaleWearablesNow?.().catch(() => {});
}

// Apply newly pulled manual-reading deletion markers before sync-pull renders
// the active profile. `merged` is the object that pull will persist, so IDB,
// legacy biometrics, and the derived wearable summary converge atomically
// from the user's perspective.
export async function reconcilePulledManualWearables(profileId: unknown, merged: unknown) {
  if (!profileId || profileId !== state.currentProfile || !merged || typeof merged !== 'object') return false;
  const live = state.importedData, owner = getSyncAppOwner();
  const current = () => state.currentProfile === profileId && state.importedData === live && getSyncAppOwner() === owner;
  // Reconcile the draft without exposing it as live data across an await.
  const result = await (reconcileManualMetricTombstones as (profileId:unknown,imported:unknown)=>ReturnType<typeof reconcileManualMetricTombstones>)(profileId, merged);
  if (!current() || !result || result.skipped) return false;
  let changed = !!(result.prunedRows || result.prunedLegacy);
  if (Object.keys((merged as {manualBodyReadings?: object}).manualBodyReadings || {}).length) {
    const manual = await import('./wearables-manual-sync.js');
    if (!current()) return false;
    const applied = await manual.applyPulledManualBodyReadings(profileId as string, merged as Parameters<typeof manual.applyPulledManualBodyReadings>[1], current);
    changed ||= !!applied.written || applied.connected;
  }
  // L1 histories are device-local. A local rebuild cannot replace this shared
  // summary: invalidate only manual latest readings explicitly deleted by pull.
  for (const [metric, value] of Object.entries((merged as PulledWearableReader).wearableSummary?.metrics || {})) {
    if (value?.primarySource === 'manual' && (isManualMetricTombstoned as (metric:Parameters<typeof isManualMetricTombstoned>[0],date:Parameters<typeof isManualMetricTombstoned>[1],imported:unknown)=>ReturnType<typeof isManualMetricTombstoned>)(metric, value.latestDate, merged)) {
      delete (merged as {wearableSummary:{metrics:Record<string,unknown>}}).wearableSummary.metrics[metric];
      changed = true;
    }
  }
  return changed;
}

export function refreshProfileButton() {
  (profileRefreshDeps as ProfileRefreshOperations).renderProfileButton();
}

export function dispatchProfileSwitched(profileId: unknown) {
  if (typeof globalThis.CustomEvent !== 'function') return;
  try {
    globalThis.dispatchEvent(new CustomEvent('labcharts-profile-switched', { detail: { profileId } }));
  } catch (_) {}
}
