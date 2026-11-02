import type { LabEntry } from "../types/lab-data.js";

interface CollectionContext { [key: string]: unknown }
type CollectionEntry = Pick<Partial<LabEntry>, "date" | "markers" | "context" | "panelId"> & { specimen?: unknown; sampleTime?: unknown; fasting?: unknown };

// lab-context-collection.js — structured draw metadata for AI context

import { normalizeLabSampleTime } from './lab-entry.js';
import { identifyLabPanels, labPanelId } from './lab-panel-identity.js';
import { resolveActiveMarkerPath } from './marker-placement.js';
import { convertCanonicalToDisplay } from './unit-profiles.js';
import type { ActiveData } from './data-view-types.js';

function formatRecordedCyclePhase(context: CollectionContext) {
  const phase = String(context?.cyclePhase || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const detail = String(context?.cyclePhaseDetail || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const labels: Record<string, string> = {
    menstrual: 'menstrual', follicular: 'follicular', ovulatory: 'ovulatory', luteal: 'luteal',
    early_follicular: 'early follicular', late_follicular: 'late follicular', periovulatory: 'periovulatory',
    early_luteal: 'early luteal', mid_luteal: 'mid-luteal', late_luteal: 'late luteal',
  };
  const label = labels[detail] || labels[phase];
  if (!label) return '';
  const source = String(context?.cyclePhaseSource || '').toLowerCase() === 'predicted' ? 'predicted' : 'recorded';
  return `${label} phase (${source})`;
}

export function buildLabCollectionContextSection(entries: readonly (CollectionEntry | null | undefined)[] = []) {
  const samples = identifyLabPanels(entries.filter((entry): entry is CollectionEntry => !!entry?.date && Object.keys(entry.markers || {}).length > 0));
  const counts = new Map<unknown, number>();
  for (const entry of samples) counts.set(entry.date, (counts.get(entry.date) || 0) + 1);
  const rows: string[] = [];
  for (const entry of samples.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const context: CollectionContext = entry.context && typeof entry.context === 'object' && !Array.isArray(entry.context)
      ? { ...entry.context }
      : {};
    if (entry.sampleTime !== undefined && context.sampleTime === undefined) context.sampleTime = entry.sampleTime;
    if (entry.fasting !== undefined && context.fasting === undefined) context.fasting = entry.fasting;
    const sampleTime = normalizeLabSampleTime(context.sampleTime);
    const parts: string[] = [];
    if (sampleTime) parts.push(`collection time ${sampleTime}`);
    if (context.fasting === true) parts.push('fasting');
    else if (context.fasting === false) parts.push('not fasting');
    const cycleDay = Number(context.cycleDay);
    if (Number.isInteger(cycleDay) && cycleDay > 0) parts.push(`cycle day ${cycleDay}`);
    const cyclePhase = formatRecordedCyclePhase(context);
    if (cyclePhase) parts.push(cyclePhase);
    if (typeof entry.specimen === 'string' && entry.specimen.trim()) parts.push(`specimen ${entry.specimen.trim()}`);
    const multiple = (counts.get(entry.date) || 0) > 1;
    if (parts.length || multiple) rows.push(`- ${entry.date}: ${parts.join('; ') || 'collection details unknown'}${multiple ? ` [sample ${labPanelId(entry)}]` : ''}`);
  }
  if (!rows.length) return '';
  return `[section:labCollectionContext]\n## Lab Collection Context\nExplicitly reported metadata by draw. Omitted fields were not reported; do not infer them from the clock time, tests ordered, or marker values.\n${rows.join('\n')}\n[/section:labCollectionContext]\n\n`;
}

/** Date projections cannot represent repeated marker results. Keep each value
 * attached to its exact sample instead of choosing the final row on that date. */
export function buildLabSampleResultsSection(entries: readonly LabEntry[], data: ActiveData, unitSystem: unknown) {
  const counts = new Map<string, number>();
  for (const entry of entries) for (const key of Object.keys(entry.markers || {})) counts.set(`${key}:${entry.date}`, (counts.get(`${key}:${entry.date}`) || 0) + 1);
  const lines: string[] = [];
  for (const entry of entries) {
    const values: string[] = [];
    for (const [key, raw] of Object.entries(entry.markers || {})) {
      if ((counts.get(`${key}:${entry.date}`) || 0) < 2 || typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      const [category, markerKey] = key.split('.') as [string, string], marker = resolveActiveMarkerPath(data.categories, category, markerKey)?.marker;
      if (!marker) continue;
      values.push(`${marker.name || key} (${key}): ${convertCanonicalToDisplay(key, raw, unitSystem, marker.custom ? marker.unit || '' : null)}${marker.unit ? ` ${marker.unit}` : ''}`);
    }
    if (values.length) lines.push(`- ${entry.date} [sample ${labPanelId(entry)}]: ${values.join('; ')}`);
  }
  if (!lines.length) return '';
  return `[section:labSampleResults]\n## Lab Sample Results\nSeparate samples on the same date; match their sample IDs to collection details. Date-wide ranges, phases and trajectories do not select one of these samples. Read the exact sample before changing a result.\n${lines.join('\n')}\n[/section:labSampleResults]\n\n`;
}
