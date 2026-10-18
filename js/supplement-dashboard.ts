// supplement-dashboard.js — Current supplement/medication timeline and evidence summary.

import { state } from './state.js';
import type { SupplementDomainRecord } from './supplement-medication-domain.js';
import {supplementHeader,supplementEmpty,supplementTimeline,supplementRow,supplementBar,supplementEvidence,renderSupplementSection,type SupplementRow,type SupplementBar} from './supplement-dashboard-presentation.js';
import {
  hasMitoCompoundData,
  preloadMitoCompoundData,
  scanSupplementsForWarnings,
} from './supplement-warnings.js';
import {
  getSupplementPeriods,
  getSupplementStatus,
  getUpcomingSupplements,
  localDateKey,
} from './supplement-medication-domain.js';

// Persisted rows are consumed without new validation; native domain readers keep leaves opaque.
type DashboardSupplement = SupplementDomainRecord;
type SupplementNameReader = { replace(pattern: RegExp, replacement: string): { trim(): unknown } };

let supplementWarningRefreshLoad: Promise<void> | null = null;

function scheduleSupplementWarningRefresh(supplements: readonly DashboardSupplement[]) {
  if (!supplements.length || hasMitoCompoundData() || supplementWarningRefreshLoad) return;
  supplementWarningRefreshLoad = preloadMitoCompoundData()
    .then(data => {
      if (!data) return;
      const section = document.querySelector('.supp-timeline-section');
      if (section) section.outerHTML = renderSupplementsSection();
    })
    .finally(() => {
      supplementWarningRefreshLoad = null;
    });
}

export function projectSupplementsSection() {
  const supplements = (state.importedData.supplements || []) as DashboardSupplement[];
  const currentRows = supplements
    .map((supplement, index) => ({ supplement, index }))
    .filter(({ supplement }) => getSupplementStatus(supplement) === 'active');
  const currentSupplements = currentRows.map(({ supplement }) => supplement);
  const upcomingCount = getUpcomingSupplements(supplements).length;
  scheduleSupplementWarningRefresh(currentSupplements);
  const header = supplementHeader(supplements.length > currentRows.length
    ? `${supplements.length - currentRows.length} saved in history` : null);
  if (!currentRows.length) {
    const emptyText = supplements.length
      ? `Nothing active today${upcomingCount ? ` · ${upcomingCount} scheduled` : ''}. Your previous items are ready in history.`
      : 'No supplements or medications tracked yet';
    return supplementEmpty(header, emptyText);
  }

  const today = localDateKey();
  let allDates = currentSupplements.flatMap(supplement => getSupplementPeriods(supplement)
    .flatMap(period => [period.start, period.end || today]));
  allDates = allDates.filter(date => date && !isNaN(new Date(`${date}T00:00:00`).getTime()));
  if (!allDates.length) allDates.push(today);
  allDates.sort();
  const minDate = allDates[0];
  const maxDate = allDates[allDates.length - 1];
  const minTime = new Date(`${minDate}T00:00:00`).getTime();
  const maxTime = new Date(`${maxDate}T00:00:00`).getTime();
  const range = maxTime - minTime || 1;
  const formatAxis = (date: unknown) => new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const midDate = new Date((minTime + maxTime) / 2).toISOString().slice(0, 10);
  const axis: [string, string, string] = [formatAxis(minDate), formatAxis(midDate), formatAxis(maxDate)];
  const rows:SupplementRow[]=[];
  for (const { supplement, index } of currentRows) {
    const typeClass = supplement.type === 'medication' ? 'supp-bar-medication' : 'supp-bar-supplement';
    const periods = getSupplementPeriods(supplement);
    const bars:SupplementBar[]=[];
    for (let periodIndex = 0; periodIndex < periods.length; periodIndex += 1) {
      const period = periods[periodIndex]!;
      const startTime = new Date(`${period.start}T00:00:00`).getTime();
      const endTime = new Date(`${period.end || today}T00:00:00`).getTime();
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) continue;
      const left = ((startTime - minTime) / range * 100).toFixed(2);
      const width = (((endTime - startTime) / range) * 100).toFixed(2);
      if (periodIndex > 0 && periods[periodIndex - 1]!.end) {
        const gapStart = new Date(`${periods[periodIndex - 1]!.end}T00:00:00`).getTime();
        const gapLeft = ((gapStart - minTime) / range * 100).toFixed(2);
        const gapWidth = (((startTime - gapStart) / range) * 100).toFixed(2);
        if (parseFloat(gapWidth) > 0.3) bars.push(supplementBar('gap', gapLeft, gapWidth));
      }
      const isOpen = !period.end;
      bars.push(supplementBar(typeClass === 'supp-bar-medication' ? 'medication' : 'supplement', left, Math.max(parseFloat(width), 0.5), isOpen));
    }
    const fullLabel = (supplement.name as string) + (supplement.dosage ? ` · ${supplement.dosage}` : '');
    const shortName = (supplement.name as SupplementNameReader).replace(/,?\s*\d+\s*x?\s*(?:ml|g|kg|oz|fl\.?\s*oz|caps(?:ules?)?|tabs?|tablets?|softgels?|ct)\b.*$/i, '').trim() || supplement.name;
    rows.push(supplementRow(index, fullLabel, shortName, bars));
  }
  return supplementTimeline(header, axis, rows, supplementEvidence(scanSupplementsForWarnings(currentSupplements)));
}

export function renderSupplementsSection(){return renderSupplementSection(projectSupplementsSection());}

export function askAIMitoContext() {
  const askButton = document.querySelector('[aria-label="Ask AI"]');
  if (askButton instanceof HTMLElement) askButton.click();
  setTimeout(() => {
    const textarea = document.querySelector('textarea.chat-input');
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    textarea.value = 'Review the primary-study mitochondrial evidence matched to my current active supplements and medications. Separate human observations from animal, cell, tissue, and isolated-mitochondria findings; relate exposure to my recorded regimen only when the evidence allows it; do not treat mechanistic findings as proof of benefit or harm, and do not advise stopping prescription medication. Cite each PMID and say clearly when the evidence is insufficient.';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
  }, 500);
}
