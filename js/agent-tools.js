// @ts-check
// agent-tools.js — read-only, schema-shaped app tools for the browser-local getbased agent

import { state } from './state.js';

/** @type {Record<string, string>} */
const MARKER_LABELS = {
  'lipids.ldl': 'LDL',
  'lipids.hdl': 'HDL',
  'lipids.triglycerides': 'Triglycerides',
  'inflammation.crp': 'CRP',
  'inflammation.hscrp': 'hs-CRP',
  'thyroid.tsh': 'TSH',
  'iron.ferritin': 'Ferritin',
  'glucose.glucose': 'Glucose',
  'diabetes.glucose': 'Glucose',
  'diabetes.insulin': 'Insulin',
  'diabetes.homaIR': 'HOMA-IR',
};

/** @param {{ importedData?: any }} [opts] */
function importedFrom(opts = {}) {
  return opts.importedData || state.importedData || {};
}

/** @param {any} importedData */
function entriesFrom(importedData) {
  return Array.isArray(importedData?.entries) ? importedData.entries.slice() : [];
}

/** @param {Array<any>} entries */
function sortEntriesByDate(entries) {
  return entries
    .filter(e => e && typeof e.date === 'string' && e.markers && typeof e.markers === 'object')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** @param {string} key */
export function markerLabel(key) {
  if (MARKER_LABELS[key]) return MARKER_LABELS[key];
  const tail = String(key || '').split('.').pop() || String(key || '');
  return tail
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** @param {any} value */
function numericValue(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** @param {number} previous @param {number} latest */
function percentChange(previous, latest) {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((latest - previous) / Math.abs(previous)) * 100;
}

/** @param {{ importedData?: any }} [opts] */
export function getAgentProfileSnapshot(opts = {}) {
  const importedData = importedFrom(opts);
  const entries = entriesFrom(importedData);
  return {
    labEntryCount: entries.length,
    latestLabDate: sortEntriesByDate(entries).at(-1)?.date || null,
    supplementCount: Array.isArray(importedData.supplements) ? importedData.supplements.length : 0,
    healthGoalCount: Array.isArray(importedData.healthGoals) ? importedData.healthGoals.length : 0,
    hasBiologyScoreContextReview: !!importedData.biologyScoreContextAI?.updatedAt,
    hasWearableSummary: !!importedData.wearableSummary,
    hasGenetics: !!(importedData.genetics && Object.keys(importedData.genetics.snps || {}).length),
  };
}

/** @param {{ importedData?: any }} [opts] */
export function compareLatestLabEntries(opts = {}) {
  const importedData = importedFrom(opts);
  const entries = sortEntriesByDate(entriesFrom(importedData));
  const latest = entries.at(-1) || null;
  const previous = entries.length > 1 ? entries.at(-2) : null;
  if (!latest || !previous) {
    return {
      latestDate: latest?.date || null,
      previousDate: previous?.date || null,
      changedMarkers: [],
      addedMarkers: latest ? Object.entries(latest.markers || {}).map(([key, value]) => ({ key, label: markerLabel(key), value })) : [],
      removedMarkers: [],
      hasEnoughData: false,
    };
  }
  const latestMarkers = latest.markers || {};
  const previousMarkers = previous.markers || {};
  const changedMarkers = [];
  const addedMarkers = [];
  const removedMarkers = [];
  for (const [key, latestRaw] of Object.entries(latestMarkers)) {
    if (!(key in previousMarkers)) {
      addedMarkers.push({ key, label: markerLabel(key), value: latestRaw });
      continue;
    }
    const latestValue = numericValue(latestRaw);
    const previousValue = numericValue(previousMarkers[key]);
    if (latestValue == null || previousValue == null || latestValue === previousValue) continue;
    const pct = percentChange(previousValue, latestValue);
    changedMarkers.push({
      key,
      label: markerLabel(key),
      previousValue,
      latestValue,
      delta: latestValue - previousValue,
      percentChange: pct,
      direction: latestValue > previousValue ? 'up' : 'down',
    });
  }
  for (const [key, value] of Object.entries(previousMarkers)) {
    if (!(key in latestMarkers)) removedMarkers.push({ key, label: markerLabel(key), value });
  }
  changedMarkers.sort((a, b) => Math.abs(b.percentChange ?? b.delta) - Math.abs(a.percentChange ?? a.delta));
  addedMarkers.sort((a, b) => a.label.localeCompare(b.label));
  removedMarkers.sort((a, b) => a.label.localeCompare(b.label));
  return {
    latestDate: latest.date,
    previousDate: previous.date,
    changedMarkers,
    addedMarkers,
    removedMarkers,
    hasEnoughData: true,
  };
}

export function getAgentToolRegistry() {
  return [
    { id: 'get_profile_context', writeLevel: 'read-only', description: 'Summarize profile/data availability for agent routing.' },
    { id: 'compare_latest_labs', writeLevel: 'read-only', description: 'Compare the latest lab entry with the previous lab entry.' },
    { id: 'open_labs_view', writeLevel: 'navigation', description: 'Open the Labs view; no data writes.' },
    { id: 'draft_lab_plan', writeLevel: 'draft-only', requiresConfirmation: true, description: 'Draft a lab plan in chat; requires explicit user confirmation before saving/sending anywhere.' },
  ];
}
