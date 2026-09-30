import type { LabEntry } from '../types/lab-data.js';
/**
 * Canonical lab values are stored in nmol/l. Keep this lookup independent of
 * global profile state so callers supply the profile snapshot they are using.
 */
export function latestVitaminDContext(entries: LabEntry[] | undefined): string {
  const latest = (entries || [])
    .filter(entry => Number.isFinite(entry.markers?.['vitamins.vitaminD']))
    .slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  return latest
    ? `Latest 25-OH-D: ${latest.markers['vitamins.vitaminD']} nmol/l (${latest.date})`
    : '';
}
