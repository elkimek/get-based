// wearables/normalizer.js — Source priority resolver for biometric metrics
// When multiple providers have the same metric on the same date,
// resolveForDisplay picks the highest-priority source. ALL entries are
// kept in storage; filtering only happens at display time.

import { state } from '../state.js';

// ═══════════════════════════════════════════════
// SOURCE PRIORITY MAP
// ═══════════════════════════════════════════════
// Earlier source in array = higher priority (wins on same date)
export const SOURCE_PRIORITY = {
  weight:          ['withings', 'oura', 'manual'],
  bp:              ['withings', 'oura', 'manual'],
  pulse:           ['withings', 'oura', 'manual'],
  hrv:             ['oura', 'withings', 'manual'],
  sleep:           ['oura', 'withings', 'manual'],
  readiness:       ['oura', 'withings', 'manual'],
  steps:           ['oura', 'withings', 'manual'],
  activeCalories:  ['oura', 'withings', 'manual'],
  distance:        ['oura', 'withings', 'manual'],
  activeMinutes:   ['oura', 'withings', 'manual'],
  spo2:            ['oura', 'withings', 'manual'],
  pwv:             ['withings', 'manual'],
};

// ═══════════════════════════════════════════════
// RESOLVE FOR DISPLAY
// ═══════════════════════════════════════════════
// Given an array of entries for a metric, return filtered array with
// one entry per date (highest priority source wins).
export function resolveForDisplay(metricKey, entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];

  const priority = SOURCE_PRIORITY[metricKey] || ['withings', 'oura', 'manual'];
  const byDate = new Map();

  for (const entry of entries) {
    if (!entry || !entry.date) continue;
    const existing = byDate.get(entry.date);
    if (!existing) {
      byDate.set(entry.date, entry);
    } else {
      // Compare source priority — lower index = higher priority
      const existingIdx = priority.indexOf(existing.source || 'manual');
      const newIdx = priority.indexOf(entry.source || 'manual');
      // Priority defaults to last if source not found
      const existingPrio = existingIdx >= 0 ? existingIdx : priority.length;
      const newPrio = newIdx >= 0 ? newIdx : priority.length;
      if (newPrio < existingPrio) {
        byDate.set(entry.date, entry);
      }
    }
  }

  // Sort by date ascending
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ═══════════════════════════════════════════════
// GET DISPLAY ENTRIES (convenience)
// ═══════════════════════════════════════════════
// Gets entries from state.importedData.biometrics[metricKey]
// and runs resolveForDisplay. Falls back to empty array.
export function getDisplayEntries(metricKey) {
  const bio = state.importedData?.biometrics;
  if (!bio) return [];
  const entries = bio[metricKey];
  if (!Array.isArray(entries)) return [];
  return resolveForDisplay(metricKey, entries);
}