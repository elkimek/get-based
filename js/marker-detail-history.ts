import type {HistoryCollection,HistorySource,MarkerDetailHistoryView} from './marker-detail-view.js';
import type { LabEntry, MarkerProvenance } from '../types/lab-data.js';

// marker-detail-history.js — per-result collection context and provenance

import { labPanelId } from './lab-panel-identity.js';
import { convertCanonicalToDisplay } from './unit-profiles.js';
import type { MarkerModalPoint } from '../types/marker-detail-modal-impl.js';
import {captureMarkerDetailText} from './marker-detail-projection.js';

export function buildMarkerHistoryMetadata(entry: (Pick<LabEntry, 'context' | 'sourceFile'> & { specimen?: unknown }) | null | undefined, source: MarkerProvenance | null | undefined, rawDate: unknown): { collection: HistoryCollection|null; sources: readonly HistorySource[] } {
  const collectionContextParts: string[] = [];
  if (entry && Object.hasOwn(entry, 'specimen') && typeof entry.specimen === 'string' && entry.specimen.trim()) collectionContextParts.push(entry.specimen.trim());
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

// Charts retain their date projection. History selects every actual same-day sample.
export function markerHistorySamplePoints(points: MarkerModalPoint[], dates: string[], entries: LabEntry[], markerKey: string, unitSystem: unknown, canonicalUnit: string | null) {
  return points.flatMap<MarkerModalPoint & { entry: LabEntry | undefined; panelId: string | undefined; multipleSamples: boolean; sampleIndex: number }>(point => {
    const rows = entries.filter(entry => entry.date === dates[point.i] && typeof entry.markers?.[markerKey] === 'number' && Number.isFinite(entry.markers[markerKey]));
    return rows.length ? rows.map((entry, sampleIndex) => ({ ...point, v: convertCanonicalToDisplay(markerKey, entry.markers![markerKey]!, unitSystem, canonicalUnit), entry, panelId: labPanelId(entry), multipleSamples: rows.length > 1, sampleIndex }))
      : [{ ...point, entry: undefined, panelId: undefined, multipleSamples: false, sampleIndex: 0 }];
  });
}
