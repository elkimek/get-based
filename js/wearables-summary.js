// @ts-check
// wearables-summary.js — L2 summary derivation + change gate
//
// Pure functions where possible so the gate logic is testable without IDB or DOM.
// Orchestrator at the bottom (`syncWearableSummary`) reads L1 rows, computes the
// canonical L2 snapshot, compares against the current importedData.wearableSummary,
// and only persists when a significance threshold trips — this is how we keep
// Evolu sync writes to ~4–8/month instead of ~30/month.

import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import {
  appendImportedArrayItem,
  ensureImportedArray,
  trimImportedArray,
} from './data-merge.js';
import { getDailyRange } from './wearables-store.js';
import { isoDay } from './wearable-adapters.js';
import { computeWearableSummary, shouldWriteL2 } from './wearables-summary-model.js';
export { computeWearableSummary, shouldWriteL2 } from './wearables-summary-model.js';
import { isDebugMode } from './utils.js';

/** @type {{ saveImportedData: () => any }} */
const wearableSummaryDeps = {
  saveImportedData: () => {},
};

/** @param {{ saveImportedData?: () => any }} [deps] */
export function configureWearableSummary(deps = {}) {
  const previous = { ...wearableSummaryDeps };
  if (typeof deps.saveImportedData === 'function') {
    wearableSummaryDeps.saveImportedData = deps.saveImportedData;
  }
  return previous;
}

// ─────────────────────────────────────────────────────────
// Tunables — see https://docs.getbased.health/developers/wearables-internals
// ─────────────────────────────────────────────────────────
const CHANGE_HISTORY_CAP    = 200;     // existing global cap; honour it when appending
const SUMMARY_WINDOW_DAYS   = 90;
const MANUAL_SUMMARY_START_DATE = '1970-01-01';

// ─────────────────────────────────────────────────────────
// Persist
// ─────────────────────────────────────────────────────────

function appendAnomalyToChangeHistory(events) {
  if (!events || events.length === 0) return;
  const imp = state.importedData;
  if (!imp) return;
  ensureImportedArray(imp, 'changeHistory');
  for (const e of events) {
    appendImportedArrayItem(imp, 'changeHistory', {
      ts: e.ts || Date.now(),
      type: 'wearable',
      kind: e.kind,
      metricId: e.metricId,
      source: e.source || null,
      from: e.from, to: e.to,
      message: e.message,
    });
  }
  trimImportedArray(imp, 'changeHistory', CHANGE_HISTORY_CAP);
}

export function persistWearableSummary(newSummary, anomalyEvents) {
  if (!state.importedData) return false;
  state.importedData.wearableSummary = newSummary;
  appendAnomalyToChangeHistory(anomalyEvents);
  wearableSummaryDeps.saveImportedData();
  return true;
}

async function refreshLocalMealTiming(profileId) {
  if (state.currentProfile !== profileId || !state.nutritionSummary?.totalMeals) return;
  try {
    const nutrition = await import('./nutrition-store.js');
    await nutrition.refreshNutritionSummaryFromWearables(profileId);
  } catch (error) {
    if (isDebugMode?.()) console.warn('[wearable-summary] local meal timing refresh failed:', getErrorMessage(error));
  }
}

// ─────────────────────────────────────────────────────────
// Orchestrator — reads L1, computes, persists if gate trips
// ─────────────────────────────────────────────────────────

export async function syncWearableSummary(profileId, connectedSources, { force = false } = {}) {
  if (!profileId || !connectedSources) return { wrote: false, reason: 'noop-inputs' };
  const sourceIds = Object.keys(connectedSources);
  if (sourceIds.length === 0) {
    if (state.currentProfile !== profileId) return { wrote: false, reason: 'profile-changed' };
    const old = state.importedData?.wearableSummary || null;
    const hasStaleSummary = !!old && (
      Object.keys(old.metrics || {}).length > 0
      || Object.keys(old.sources || {}).length > 0
    );
    if (!force && !hasStaleSummary) return { wrote: false, reason: 'no-sources' };
    const emptySummary = computeWearableSummary({}, {}, {});
    persistWearableSummary(emptySummary, []);
    await refreshLocalMealTiming(profileId);
    return {
      wrote: true,
      reason: force ? 'force-no-sources' : 'no-sources-cleared',
      summary: emptySummary,
      anomalies: [],
    };
  }

  // Pull last 90 days for vendor sources. Manual entries are sparse, user-
  // authored rows, so read all history; otherwise a single older pulse/BP
  // reading saves successfully but never creates a visible summary card.
  const endDate = isoDay();
  const start = new Date(); start.setDate(start.getDate() - SUMMARY_WINDOW_DAYS);
  const startDate = isoDay(start);

  /** @type {Record<string, import('./wearable-storage-types.js').StoredWearableRow[]>} */
  const rowsBySource = {};
  for (const sid of sourceIds) {
    const readStartDate = sid === 'manual' ? MANUAL_SUMMARY_START_DATE : startDate;
    try { rowsBySource[sid] = await getDailyRange(profileId, sid, readStartDate, endDate); }
    catch (e) { if (isDebugMode?.()) console.warn(`[wearable-summary] L1 read failed for ${sid}:`, getErrorMessage(e)); rowsBySource[sid] = []; }
  }

  // Profile-swap guard: cross-profile contamination guard. If the user
  // switched profiles during the IDB reads, the live `state.importedData`
  // now belongs to a DIFFERENT profile. Persisting the freshly-computed
  // summary into it would write A's metrics under B's localStorage key.
  if (state.currentProfile !== profileId) {
    if (isDebugMode?.()) console.log(`[wearable-summary] aborting — profile changed mid-read (${profileId} → ${state.currentProfile})`);
    return { wrote: false, reason: 'profile-changed' };
  }

  const primaryOverride = state.importedData?.wearablePrimaryOverride || {};
  const newSummary = computeWearableSummary(rowsBySource, connectedSources, primaryOverride);
  const old = state.importedData?.wearableSummary || null;
  // `force` bypasses the gate. Used by user-driven manual syncs so the
  // strip never appears stuck. The scheduled background path still goes
  // through `shouldWriteL2` so the Evolu write budget stays small.
  const gate = force
    ? { write: true, reason: 'force', anomalyEvents: [] }
    : shouldWriteL2(newSummary, old);

  if (!gate.write) {
    await refreshLocalMealTiming(profileId);
    return { wrote: false, reason: 'gate-not-tripped', summary: newSummary };
  }

  persistWearableSummary(newSummary, gate.anomalyEvents);
  await refreshLocalMealTiming(profileId);
  if (isDebugMode?.()) console.log(`[wearable-summary] L2 written: ${gate.reason}`);
  return { wrote: true, reason: gate.reason, summary: newSummary, anomalies: gate.anomalyEvents };
}
