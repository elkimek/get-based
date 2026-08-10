// @ts-check
// supplement-dashboard.js — Current supplement/medication timeline and evidence summary.

import { state } from './state.js';
import { escapeHTML } from './utils.js';
import { suppActionAttrs } from './supplement-action-delegates.js';
import {
  groupMitochondrialEvidenceMatches,
  hasMitoCompoundData,
  mitochondrialDirectionLabel,
  mitochondrialEvidenceIssueUrl,
  preloadMitoCompoundData,
  scanSupplementsForWarnings,
} from './supplement-warnings.js';
import {
  getSupplementPeriods,
  getSupplementStatus,
  getUpcomingSupplements,
  localDateKey,
} from './supplement-medication-domain.js';

/** @type {Promise<void> | null} */
let supplementWarningRefreshLoad = null;

/** @param {Array<any>} supplements */
function scheduleSupplementWarningRefresh(supplements) {
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

/** @param {any} evidence */
function directionClass(evidence) {
  return ['adverse', 'beneficial', 'mixed', 'null'].includes(evidence.direction)
    ? evidence.direction : 'mechanism';
}

/** @param {any} evidence */
function evidenceLinks(evidence) {
  const reportUrl = mitochondrialEvidenceIssueUrl(evidence);
  return `<a href="${evidence.url}" target="_blank" rel="noopener" class="supp-mitotox-link">Primary study · PMID ${evidence.pmid}</a><a href="${evidence.searchUrl}" target="_blank" rel="noopener" class="supp-mitotox-link">Related PubMed research</a><a href="${escapeHTML(reportUrl)}" target="_blank" rel="noopener" class="supp-mitotox-link supp-mito-report-link" title="Opens a public GitHub issue without your tracked product or dose">Report evidence issue</a>`;
}

/** @param {any} evidence */
function evidenceBadges(evidence) {
  const direction = mitochondrialDirectionLabel(evidence.direction, evidence.studyType);
  const scope = evidence.scopeLabel
    ? `<span class="supp-mito-scope">${escapeHTML(evidence.scopeLabel)}</span>` : '';
  return `<span class="supp-mito-badge">${escapeHTML(evidence.studyLabel)}</span><span class="supp-mito-direction supp-mito-direction-${directionClass(evidence)}">${escapeHTML(direction)}</span>${scope}`;
}

/** @param {any} evidence */
function evidenceDetail(evidence) {
  return `<div><strong>Study model:</strong> ${escapeHTML(evidence.model)}</div><div><strong>Exposure:</strong> ${escapeHTML(evidence.exposure)}</div><div><strong>What it cannot tell us:</strong> ${escapeHTML(evidence.limitations)}</div><div><strong>Source:</strong> ${escapeHTML(evidence.title)}</div><div>${evidenceLinks(evidence)}</div>`;
}

/** @param {Array<any>} warnings */
function renderMitochondrialEvidence(warnings) {
  const groups = groupMitochondrialEvidenceMatches(warnings);
  if (!groups.length) return '';
  const compoundCount = `${groups.length} matched compound${groups.length === 1 ? '' : 's'}`;
  const studyCount = `${warnings.length} verified stud${warnings.length === 1 ? 'y' : 'ies'}`;
  let html = `<div class="supp-mitotox">
    <div class="supp-mitotox-header"><span><strong>Primary mitochondrial evidence</strong> · ${compoundCount} · ${studyCount}</span><span class="supp-mitotox-ask" ${suppActionAttrs('ask-mito')}>ask AI for context</span></div>
    <div class="supp-mitotox-note">Matched to current active ingredients. The catalog is deliberately incomplete, so no match does not mean no effect. The study badge matters: laboratory and animal findings do not prove benefit or harm at your dose.</div>`;
  for (const group of groups) {
    const products = group.productNames.length ? group.productNames.join(', ') : group.compound;
    if (group.evidence.length === 1) {
      const evidence = group.evidence[0];
      html += `<details class="supp-mitotox-item" data-mito-compound="${escapeHTML(group.compound)}">
        <summary><strong>${escapeHTML(group.compound)}</strong>${evidenceBadges(evidence)}<span class="supp-mito-summary">${escapeHTML(evidence.summary)}</span></summary>
        <div class="supp-mito-detail"><div><strong>Matched in:</strong> ${escapeHTML(products)}</div>${evidenceDetail(evidence)}</div>
      </details>`;
      continue;
    }
    html += `<details class="supp-mitotox-item supp-mito-compound-group" data-mito-compound="${escapeHTML(group.compound)}">
      <summary><strong>${escapeHTML(group.compound)}</strong><span class="supp-mito-badge">${group.evidence.length} studies</span><span class="supp-mito-direction supp-mito-direction-mixed">Evidence differs by context</span><span class="supp-mito-summary">Expand to compare each study population and finding.</span></summary>
      <div class="supp-mito-detail supp-mito-study-list"><div class="supp-mito-group-match"><strong>Matched in:</strong> ${escapeHTML(products)}</div>`;
    for (const evidence of group.evidence) {
      html += `<section class="supp-mito-study">
        <div class="supp-mito-study-head">${evidenceBadges(evidence)}</div>
        <div class="supp-mito-study-summary">${escapeHTML(evidence.summary)}</div>
        ${evidenceDetail(evidence)}
      </section>`;
    }
    html += '</div></details>';
  }
  return `${html}</div>`;
}

export function renderSupplementsSection() {
  const supplements = state.importedData.supplements || [];
  const currentRows = supplements
    .map((supplement, index) => ({ supplement, index }))
    .filter(({ supplement }) => getSupplementStatus(supplement) === 'active');
  const currentSupplements = currentRows.map(({ supplement }) => supplement);
  const upcomingCount = getUpcomingSupplements(supplements).length;
  scheduleSupplementWarningRefresh(currentSupplements);
  let html = `<div class="supp-timeline-section">
    <div class="supp-timeline-header">
      <div><span class="context-section-title">Current supplements & medications</span>${supplements.length > currentRows.length ? `<span class="supp-history-count">${supplements.length - currentRows.length} saved in history</span>` : ''}</div>
      <button class="supp-add-btn" ${suppActionAttrs('open-editor')}>Manage</button>
    </div>`;
  if (!currentRows.length) {
    const emptyText = supplements.length
      ? `Nothing active today${upcomingCount ? ` · ${upcomingCount} scheduled` : ''}. Your previous items are ready in history.`
      : 'No supplements or medications tracked yet';
    return `${html}<div class="supp-timeline"><div class="supp-empty">${escapeHTML(emptyText)}</div></div></div>`;
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
  const formatAxis = date => new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const midDate = new Date((minTime + maxTime) / 2).toISOString().slice(0, 10);
  html += `<div class="supp-timeline"><div class="supp-timeline-axis"><span>${formatAxis(minDate)}</span><span>${formatAxis(midDate)}</span><span>${formatAxis(maxDate)}</span></div>`;
  for (const { supplement, index } of currentRows) {
    const typeClass = supplement.type === 'medication' ? 'supp-bar-medication' : 'supp-bar-supplement';
    const periods = getSupplementPeriods(supplement);
    let bars = '';
    for (let periodIndex = 0; periodIndex < periods.length; periodIndex += 1) {
      const period = periods[periodIndex];
      const startTime = new Date(`${period.start}T00:00:00`).getTime();
      const endTime = new Date(`${period.end || today}T00:00:00`).getTime();
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) continue;
      const left = ((startTime - minTime) / range * 100).toFixed(2);
      const width = (((endTime - startTime) / range) * 100).toFixed(2);
      if (periodIndex > 0 && periods[periodIndex - 1].end) {
        const gapStart = new Date(`${periods[periodIndex - 1].end}T00:00:00`).getTime();
        const gapLeft = ((gapStart - minTime) / range * 100).toFixed(2);
        const gapWidth = (((startTime - gapStart) / range) * 100).toFixed(2);
        if (parseFloat(gapWidth) > 0.3) bars += `<div class="supp-bar-gap" style="left:${gapLeft}%;width:${gapWidth}%"></div>`;
      }
      bars += `<div class="supp-bar ${typeClass}${period.end ? '' : ' supp-bar-ongoing'}" style="left:${left}%;width:${Math.max(parseFloat(width), 0.5)}%"></div>`;
    }
    const fullLabel = supplement.name + (supplement.dosage ? ` · ${supplement.dosage}` : '');
    const shortName = supplement.name.replace(/,?\s*\d+\s*x?\s*(?:ml|g|kg|oz|fl\.?\s*oz|caps(?:ules?)?|tabs?|tablets?|softgels?|ct)\b.*$/i, '').trim() || supplement.name;
    html += `<div class="supp-bar-row" role="button" tabindex="0" aria-label="Edit ${escapeHTML(fullLabel)}" ${suppActionAttrs('open-editor', `data-supp-index="${index}"`)}><span class="supp-bar-label" title="${escapeHTML(fullLabel)}">${escapeHTML(shortName)}</span><div class="supp-bar-track">${bars}</div></div>`;
  }
  html += `</div>${renderMitochondrialEvidence(scanSupplementsForWarnings(currentSupplements))}</div>`;
  return html;
}

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
