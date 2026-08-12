// @ts-check
// lab-context-collection.js — structured draw metadata for AI context

import { normalizeLabSampleTime } from './lab-entry.js';

function formatRecordedCyclePhase(context) {
  const phase = String(context?.cyclePhase || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const detail = String(context?.cyclePhaseDetail || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const labels = {
    menstrual: 'menstrual', follicular: 'follicular', ovulatory: 'ovulatory', luteal: 'luteal',
    early_follicular: 'early follicular', late_follicular: 'late follicular', periovulatory: 'periovulatory',
    early_luteal: 'early luteal', mid_luteal: 'mid-luteal', late_luteal: 'late luteal',
  };
  const label = labels[detail] || labels[phase];
  if (!label) return '';
  const source = String(context?.cyclePhaseSource || '').toLowerCase() === 'predicted' ? 'predicted' : 'recorded';
  return `${label} phase (${source})`;
}

export function buildLabCollectionContextSection(entries = []) {
  const labDates = new Set();
  const contextByDate = new Map();
  for (const entry of entries) {
    if (!entry?.date) continue;
    if (Object.keys(entry.markers || {}).length > 0) labDates.add(entry.date);
    const entryContext = entry.context && typeof entry.context === 'object' && !Array.isArray(entry.context)
      ? { ...entry.context }
      : {};
    if (entry.sampleTime !== undefined && entryContext.sampleTime === undefined) entryContext.sampleTime = entry.sampleTime;
    if (entry.fasting !== undefined && entryContext.fasting === undefined) entryContext.fasting = entry.fasting;
    contextByDate.set(entry.date, { ...(contextByDate.get(entry.date) || {}), ...entryContext });
  }

  const rows = [];
  for (const date of [...labDates].sort()) {
    const context = contextByDate.get(date) || {};
    const sampleTime = normalizeLabSampleTime(context.sampleTime);
    const parts = [];
    if (sampleTime) parts.push(`collection time ${sampleTime}`);
    if (context.fasting === true) parts.push('fasting');
    else if (context.fasting === false) parts.push('not fasting');
    const cycleDay = Number(context.cycleDay);
    if (Number.isInteger(cycleDay) && cycleDay > 0) parts.push(`cycle day ${cycleDay}`);
    const cyclePhase = formatRecordedCyclePhase(context);
    if (cyclePhase) parts.push(cyclePhase);
    if (parts.length) rows.push(`- ${date}: ${parts.join('; ')}`);
  }
  if (!rows.length) return '';
  return `[section:labCollectionContext]\n## Lab Collection Context\nExplicitly reported metadata by draw. Omitted fields were not reported; do not infer them from the clock time, tests ordered, or marker values.\n${rows.join('\n')}\n[/section:labCollectionContext]\n\n`;
}
