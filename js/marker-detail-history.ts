import type {HistoryCollection,HistorySource,MarkerDetailHistoryView} from './marker-detail-view.js';
import type { LabEntry, MarkerProvenance } from '../types/lab-data.js';

// marker-detail-history.js — per-result collection context and provenance

import {captureMarkerDetailText} from './marker-detail-projection.js';

export function buildMarkerHistoryMetadata(entry: Pick<LabEntry, 'context' | 'sourceFile'> | null | undefined, source: MarkerProvenance | null | undefined, rawDate: unknown): { collection: HistoryCollection|null; sources: readonly HistorySource[] } {
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
  const collection = collectionContextParts.length
    ? ({ kind: "collection-context", text: `${captureMarkerDetailText(collectionContextParts.join(' · '))}` } satisfies MarkerDetailHistoryView)
    : null;

  const sources: HistorySource[] = [];
  if (rawDate) {
    const fileName = source ? source.file : (entry?.sourceFile || '');
    if (fileName) {
      const display = fileName.length > 30 ? fileName.slice(0, 27) + '...' : fileName;
      sources.push({ kind: "source-file", title: `${captureMarkerDetailText(fileName)}`, text: `${captureMarkerDetailText(display)}` } satisfies MarkerDetailHistoryView);
      if (source?.manuallyEdited) sources.push({ kind: "source-edited" } satisfies MarkerDetailHistoryView);
    } else if (source?.snapshotId) {
      sources.push({ kind: "source-report", manualLabel: `${source.manuallyEdited ? ' · manually edited' : ''}` } satisfies MarkerDetailHistoryView);
    } else if (source) {
      sources.push({ kind: "source-manual" } satisfies MarkerDetailHistoryView);
    }
  }
  return { collection, sources };
}
