import type { LabEntry, MarkerProvenance } from '../types/lab-data.js';

// marker-detail-history.js — per-result collection context and provenance

import { escapeHTML } from './utils.js';

export function buildMarkerHistoryMetadata(entry: Pick<LabEntry, 'context' | 'sourceFile'> | null | undefined, source: MarkerProvenance | null | undefined, rawDate: unknown): { collectionContextHtml: string; sourceHtml: string } {
  const collectionContextParts: string[] = [];
  if (entry?.context?.sampleTime) collectionContextParts.push(`Collected ${entry.context.sampleTime}`);
  if (entry?.context?.fasting === true) collectionContextParts.push('fasting');
  else if (entry?.context?.fasting === false) collectionContextParts.push('not fasting');
  const rawPhase = String(entry?.context?.cyclePhase || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const rawPhaseDetail = String(entry?.context?.cyclePhaseDetail || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const phaseLabels: Record<string, string> = {
    menstrual: 'Menstrual', follicular: 'Follicular', ovulatory: 'Ovulatory', luteal: 'Luteal',
    early_follicular: 'Early follicular', late_follicular: 'Late follicular', periovulatory: 'Periovulatory',
    early_luteal: 'Early luteal', mid_luteal: 'Mid-luteal', late_luteal: 'Late luteal',
  };
  const phaseLabel = phaseLabels[rawPhaseDetail] || phaseLabels[rawPhase];
  const cycleDay = Number(entry?.context?.cycleDay);
  if (phaseLabel) {
    collectionContextParts.push(Number.isInteger(cycleDay) && cycleDay > 0
      ? `${phaseLabel} · cycle day ${cycleDay}`
      : phaseLabel);
  } else if (Number.isInteger(cycleDay) && cycleDay > 0) {
    collectionContextParts.push(`Cycle day ${cycleDay}`);
  }
  const collectionContextHtml = collectionContextParts.length
    ? `<div class="mv-collection-context">${escapeHTML(collectionContextParts.join(' · '))}</div>`
    : '';

  let sourceHtml = '';
  if (rawDate) {
    const fileName = source ? source.file : (entry?.sourceFile || '');
    if (fileName) {
      const display = fileName.length > 30 ? fileName.slice(0, 27) + '...' : fileName;
      sourceHtml = `<div class="mv-source" title="${escapeHTML(fileName)}">${escapeHTML(display)}</div>`;
      if (source?.manuallyEdited) sourceHtml += '<div class="mv-source mv-source-manual">manually edited</div>';
    } else if (source?.snapshotId) {
      sourceHtml = `<div class="mv-source">Imported report${source.manuallyEdited ? ' · manually edited' : ''}</div>`;
    } else if (source) {
      sourceHtml = '<div class="mv-source mv-source-manual">manual entry</div>';
    }
  }
  return { collectionContextHtml, sourceHtml };
}
