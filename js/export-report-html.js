// @ts-check
// export-report-html.js — PDF report HTML renderer

import { getCachedSnpCatalog } from './dna-evidence.js';
import { renderConciseReportBody, renderReportOriginNotice } from './export-report-summary-html.js';
import { buildReportDataSnapshot, buildReportGenetics, selectReportGenomeFindings, getSupplementDosageParts } from './export-report-data.js';
import { state } from './state.js';
import { getStatus, formatValue, getTrend, showNotification, escapeAttr } from './utils.js';
import { resolveMarkerRangeContext, getAllFlaggedMarkers } from './marker-analysis.js';
import { getUnitProfileLabel } from './unit-profiles.js';
import { getSupplementPeriods, getSupplementStatus } from './supplement-medication-domain.js';
import {
  buildReportHeaderFacts,
  buildPreparedReportPayload,
  loadReportDetails,
  REPORT_LAB_SECTION_IDS,
  getReportHeaderProfile,
  normalizeReportOptions,
  renderReportAISummarySection,
  reportIncludes,
} from './export-report.js';

function getReportRuntimeWindow() {
  return typeof window !== 'undefined' ? window : null;
}

export function openReportPreviewWindow() {
  const runtimeWindow = getReportRuntimeWindow();
  return typeof runtimeWindow?.open === 'function'
    ? runtimeWindow.open('', '_blank')
    : null;
}

function getReportSnpTableCache() {
  return getCachedSnpCatalog() || getReportRuntimeWindow()?._snpTableCache || null;
}

/** @param {any} options @param {Window | null} [previewWindow] @param {any} [preparedPayload] @param {any} [lifecycle] */
export function exportPDFReport(options = {}, previewWindow = null, preparedPayload = null, lifecycle = {}) {
  const captured = preparedPayload || buildPreparedReportPayload(options);
  const payload = { ...captured, reportOptions: { ...captured.reportOptions, aiSummary: options.aiSummary } };
  const win = previewWindow || openReportPreviewWindow();
  if (!win) { showNotification('Pop-up blocked - please allow pop-ups for this site', 'error'); return false; }
  const headerFacts = payload.headerFacts || buildReportHeaderFacts({
    profile: payload.profile, reportOptions: payload.reportOptions, dateRange: 'pending',
    sexLabel: payload.sexLabel, unitLabel: getUnitProfileLabel(payload.reportData.scope.unitSystem),
  });
  const finish = () => {
    if (win.closed || (lifecycle.isCurrent && !lifecycle.isCurrent())) { win.close?.(); return false; }
    lifecycle.onProgress?.('rendering');
    const html = buildReportHTML(
      payload.profileName, payload.sexLabel, payload.data, payload.flags, payload.reportData.notes,
      payload.reportData.supplements, payload.contextSections,
      { ...payload.reportOptions, reportData: payload.reportData, headerFacts },
    );
    win.document.open?.();
    win.document.write(html);
    win.document.close();
    const printBtn = typeof win.document.querySelector === 'function'
      ? win.document.querySelector('.report-print-btn') : null;
    if (printBtn) printBtn.addEventListener('click', () => win.print());
    showNotification('PDF preview opened. Use Print in the preview to save as PDF.', 'info', 2500);
    return true;
  };
  if (!payload.detailsLoaded && (Object.keys(payload.reportData.genetics?.snps || {}).length || payload.reportData.additionalSections.length)) {
    return loadReportDetails(payload).then(finish).catch(() => {
      win.close?.();
      showNotification('Could not load selected report data. Please retry the report.', 'error');
      return false;
    });
  }
  return finish();
}

export function buildReportHTML(profileName, sexLabel, data, flags, notes, supps, contextSections, options = {}) {
  const portableReport = options.reportData || null;
  const reportOptions = normalizeReportOptions(options);
  const renderOptions = { ...reportOptions, sections: options.detailed ? reportOptions.sections : reportOptions.appendixSections };
  const includesLabs = reportOptions.sections.some(section => REPORT_LAB_SECTION_IDS.includes(section));
  if (!includesLabs) { data = { ...data, dates: [], categories: {} }; flags = []; }
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const rangeMode = portableReport?.scope?.rangeMode || reportOptions.rangeMode;
  if (includesLabs && options.rangeMode) flags = getAllFlaggedMarkers(data, rangeMode);
  const unitLabel = getUnitProfileLabel(portableReport?.scope?.unitSystem || state.unitSystem);
  const fmtDate = d => d && Number.isFinite(new Date(d + 'T00:00:00').getTime())
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'date not set';
  const fullDateLabels = data.dates.map(d => fmtDate(d));
  const reportDates = new Set(data.dates || []);
  for (const category of Object.values(data.categories || {})) {
    for (const marker of Object.values(category.markers || {})) {
      if ((marker.singlePoint || category.singlePoint) && marker.values?.some(value => value != null)) {
        const date = marker.singleDate || category.singleDate;
        if (date) reportDates.add(date);
      }
    }
  }
  const reportDateLabels = [...reportDates].sort().map(fmtDate);
  const dateRange = !includesLabs ? 'Lab results not selected' : reportDateLabels.length > 0
    ? `${reportDateLabels[0]} \u2013 ${reportDateLabels[reportDateLabels.length - 1]}`
    : 'No lab dates in selected range';
  const hasReportValue = value => value !== null && value !== undefined;
  const trendItems = buildTrendItems();
  const reportStats = buildReportStats();
  const genetics = portableReport ? portableReport.genetics : buildReportGenetics(state.importedData.genetics, getReportSnpTableCache());
  const includeApoe = genetics?.apoe && (!reportOptions.genomeMode || reportOptions.genomeMode === 'all' || selectReportGenomeFindings(genetics, reportOptions).some(finding => ['rs429358', 'rs7412'].includes(finding.rsid)));
  const rangeModeLabel = getRangeModeLabel();
  const rangeModeTitle = rangeModeLabel.charAt(0).toUpperCase() + rangeModeLabel.slice(1);
  const headerDeck = buildHeaderDeck();
  const headerProfile = portableReport?.profile || getReportHeaderProfile(profileName);
  const headerFacts = (options.headerFacts || buildReportHeaderFacts({ profile: headerProfile, reportOptions, dateRange, sexLabel, unitLabel }))
    .map(fact => fact.label === 'Date range' ? { ...fact, value: dateRange } : fact);
  const headerMetaHTML = headerFacts.map(fact => `<div${fact.label === 'Included data' ? ' class="report-included-data"' : ''}><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)}</dd></div>`).join('');
  const portableMarkers = new Map((portableReport?.labs?.categories || []).flatMap(category =>
    category.markers.map(marker => [marker.storageDotKey, marker])
  ));

  let body = '';

  if (options.detailed) {
  body += `<div class="report-preview-toolbar" aria-label="Report preview actions">
    <button type="button" class="report-print-btn" data-report-print-action="print">Print / Save PDF</button>
  </div>`;

  // Header
  body += `<header class="report-header">
    <div class="report-head-top">
      <div>
        <div class="report-brand">getbased</div>
        <div class="report-kicker">${esc(reportOptions.presetLabel)}</div>
      </div>
      <div class="report-generated"><span>Generated</span><strong>${now}</strong></div>
    </div>
<h1>${esc(profileName)} health report</h1>
    ${renderReportOriginNotice(reportOptions.aiSummary)}
    <p class="report-deck">${esc(headerDeck)}</p>
    <dl class="report-meta">${headerMetaHTML}</dl>
  </header>`;

  if (includesLabs) body += `<div class="report-overview" aria-label="Report snapshot">${[
    ['Outside selected ranges', flags.length, `latest out-of-range marker${flags.length === 1 ? '' : 's'}`],
    ['Recorded markers', reportStats.totalWithData, `${reportStats.totalInRange} within ${rangeModeLabel} range${reportStats.totalUnrated ? ` · ${reportStats.totalUnrated} unrated` : ''}`],
    ['Lab Dates', reportDates.size, dateRange],
    ['Lab Groups', reportStats.categoryCount, 'with lab data'],
  ].map(([label, value, note]) => `<div class="report-stat"><span class="report-stat-label">${esc(label)}</span><strong class="report-stat-value">${esc(value)}</strong><span class="report-stat-note">${esc(note)}</span></div>`).join('')}</div>`;

  if (includesLabs) body += `<p class="report-note">Lab reference ranges are labeled when imported; other reference ranges come from app guidance or custom settings. ${rangeMode === 'reference' ? 'Flags use reference ranges.' : 'Flags use optimal ranges when available, otherwise reference ranges. Phase-specific reference ranges take precedence.'}</p>`;

  }
  if (options.detailed || renderOptions.sections.includes('categories')) body += renderCollectionContextSection();

  if (options.detailed) body += renderReportAISummarySection(reportOptions.aiSummary);

  if (reportIncludes(renderOptions, 'summary')) {
    body += renderSummarySection();
  }

  // Flagged Results
  if (reportIncludes(renderOptions, 'flagged') && flags.length > 0) {
    body += `<h2>Flagged Results</h2><table><thead><tr><th>Biomarker</th><th>Value</th><th>Range</th><th>Status</th></tr></thead><tbody>`;
    for (const f of flags) {
      const cls = f.status === 'high' ? 'val-high' : 'val-low';
      const label = f.status === 'high' ? 'HIGH' : 'LOW';
      body += `<tr><td>${esc(f.name)}</td><td class="${cls}">${esc(f.value)} ${esc(f.unit)}</td>
        <td>${f.displayedRanges?.length ? renderRangeSet({ displayedRanges: f.displayedRanges }, true) : esc(f.effectiveLabel || 'Range') + ' ' + formatRangeBounds(f)}</td><td class="${cls}">${label}</td></tr>`;
    }
    body += `</tbody></table>`;
  }

  if (reportIncludes(renderOptions, 'trends') && trendItems.length > 0) {
    body += `<h2>Notable Trends</h2><ul class="report-list">${trendItems.join('')}</ul>`;
  }

  // Category tables
  if (reportIncludes(renderOptions, 'categories')) {
    for (const [catKey, cat] of Object.entries(data.categories)) {
      const markersWithData = Object.entries(cat.markers).filter(([_, m]) => !m.hidden && m.values && m.values.some(hasReportValue));
      if (markersWithData.length === 0) continue;
      const dateColumns = cat.singleDate
        ? [{ label: cat.singleDateLabel || fmtDate(cat.singleDate), index: 0, date: cat.singleDate }]
        : fullDateLabels
            .map((label, index) => ({ label, index, date: data.dates[index] }))
            .filter(({ index }) => markersWithData.some(([, marker]) => !marker.singlePoint && hasReportValue(marker.values?.[index])));
      for (const [, marker] of markersWithData) {
        if (!marker.singlePoint) continue;
        const date = marker.singleDate || cat.singleDate || null;
        if (!dateColumns.some(column => column.date === date)) dateColumns.push({ label: fmtDate(date), date, index: -1 });
      }
      dateColumns.sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
      if (dateColumns.length === 0) continue;
      body += `<h2>${esc(cat.label)}</h2><table><thead><tr><th>Biomarker</th><th>Unit</th><th>Range</th>`;
      for (const column of dateColumns) body += `<th>${esc(column.label)}</th>`;
      body += `<th>Trend</th></tr></thead><tbody>`;
      for (const [markerKey, marker] of markersWithData) {
        const latestIndex = getLatestReportValueIndex(marker.values);
        const r = resolveMarkerRangeContext(marker, latestIndex, rangeMode).judgingRange;
        const trendValues = marker.values.map(v => hasReportValue(v) ? v : null);
        const trend = getTrend(trendValues, r.min, r.max);
        const markerColumns = dateColumns.map(column => ({ ...column,
          index: marker.singlePoint || cat.singlePoint
            ? (column.date === (marker.singleDate || cat.singleDate || null) ? 0 : -1) : column.index,
        }));
        const rangeStr = renderMarkerRanges(marker, markerColumns);
        const portableMarker = portableMarkers.get(marker.storageDotKey || `${catKey}.${markerKey}`)
          || [...portableMarkers.values()].find(item => item.id === marker.markerId);
        const markerNote = portableMarker?.note
          ? `<div class="report-marker-note">${esc(portableMarker.note)}</div>`
          : '';
        body += `<tr><td>${esc(marker.name)}${markerNote}</td><td class="muted">${esc(marker.unit)}</td><td class="muted">${rangeStr}</td>`;
        for (const column of markerColumns) {
          const v = marker.values[column.index] ?? null;
          const resultRange = resolveMarkerRangeContext(marker, column.index, rangeMode).judgingRange;
          const s = getReportStatus(v, resultRange);
          const sPrefix = s === 'high' ? '\u25B2 ' : s === 'low' ? '\u25BC ' : '';
          const resultDate = marker.singlePoint || cat.singlePoint
            ? (marker.singleDate || cat.singleDate || null)
            : (data.dates?.[column.index] || null);
          const portableResult = portableMarker?.results?.find(result =>
            result.date === resultDate || (!resultDate && result.dateIndex === column.index)
          );
          const resultNote = portableResult?.note
            ? `<div class="report-value-note">${esc(portableResult.note)}</div>`
            : '';
          body += `<td class="val-${s}">${v !== null ? sPrefix + formatValue(v) : '\u2014'}${resultNote}</td>`;
        }
        body += `<td>${trend.arrow}</td></tr>`;
      }
      body += `</tbody></table>`;
    }
  }

  // Supplements
  if (reportIncludes(renderOptions, 'supplements') && supps.length > 0) {
    body += `<h2>Supplements & Medications</h2><table><thead><tr><th>Name</th><th>Status</th><th>Dosage</th><th>Type</th><th>Period</th><th>Note</th></tr></thead><tbody>`;
    const orderedSupps = [...supps].sort((a, b) => (getSupplementStatus(a) === 'active' ? -1 : 1) - (getSupplementStatus(b) === 'active' ? -1 : 1));
    for (const s of orderedSupps) {
      const pds = getSupplementPeriods(s);
      const periodStr = pds.map(p => `${fmtDate(p.start)} \u2192 ${p.end ? fmtDate(p.end) : 'ongoing'}${p.dose ? ` · ${esc(p.dose)}` : ''}`).join('<br>');
      body += `<tr><td>${esc(s.name)}</td><td>${esc(getSupplementStatus(s))}</td><td>${formatSupplementDosage(s)}</td><td>${esc(s.type || '\u2014')}</td>
        <td>${periodStr}</td><td style="font-size:11px">${esc(s.note || '\u2014')}</td></tr>`;
    }
    body += `</tbody></table>`;
  }

  // Notes
  if (reportIncludes(renderOptions, 'notes') && notes.length > 0) {
    body += `<h2>Notes</h2>`;
    for (const n of notes) {
      body += `<div class="note-item"><strong>${fmtDate(n.date)}</strong>: ${esc(n.text)}</div>`;
    }
  }

  // Genome uses the same direction, evidence, relevance and genotype resolver as the app.
  if (reportIncludes(renderOptions, 'genetics') && genetics) {
    const findings = reportOptions.genomeMode ? selectReportGenomeFindings(genetics, reportOptions) : genetics.findings || [];
    body += `<h2>Genetics</h2><p><strong>Source:</strong> ${esc(genetics.source || 'Not specified')} &middot; <strong>Imported calls:</strong> ${findings.length} &middot; <strong>Imported:</strong> ${esc(genetics.importDate || 'Not specified')}${includeApoe ? ' &middot; <strong>APOE:</strong> ' + esc(genetics.apoe) : ''}</p>`;
    if (genetics.coverage) body += `<p class="muted">Catalog coverage at import: ${esc(genetics.coverage.found)} / ${esc(genetics.coverage.total)}. Re-import the original DNA file to include newly added catalog variants.</p>`;
    if (findings.length) {
      body += `<p class="muted">Direction, evidence strength, and personal relevance are separate. Strong evidence is not a diagnosis or a proven intervention. Reference findings are included; unclassified calls have no current catalog interpretation.</p>`;
      body += `<table class="genetics-table"><thead><tr><th>Variant / genotype</th><th>Direction</th><th>Evidence / relevance</th><th>Interpretation</th></tr></thead><tbody>`;
      for (const f of findings) {
        const e = f.evidence;
        const refs = (f.references || []).map(renderReference).join('; ');
        const tone = ['risk', 'protective', 'trait'].includes(f.tone) ? f.tone : 'neutral';
        body += `<tr><td><strong>${esc(f.gene)}</strong><br>${esc(f.variant)}<br>${esc(f.rsid)}: ${esc(f.genotype)}<br><span class="muted">${esc(f.category)}${f.apoeComponent ? ' · APOE component' : ''}</span></td><td><span class="genome-direction genome-${tone}">${esc(f.direction)}</span></td><td>${esc(e.evidenceLabel)}<br>${esc(e.relevanceLabel)}</td><td>${esc(f.note)}${e.scope ? '<br>Evidence scope: ' + esc(e.scope) : ''}${e.context ? '<br>Relevance context: ' + esc(e.context) : ''}${f.strandNote ? '<br>Genotype context: ' + esc(f.strandNote) : ''}${refs ? '<br>References: ' + refs : ''}</td></tr>`;
      }
      body += `</tbody></table>`;
    }
    const mt = !reportOptions.genomeMode || reportOptions.genomeMode === 'all' ? genetics.mtdna : null;
    if (mt) {
      body += `<p><strong>mtDNA Haplogroup:</strong> ${esc(mt.haplogroup || 'Not specified')}`;
      for (const [label, value] of Object.entries({ Source: mt.source, Imported: mt.importDate, Origin: mt.origin, 'Lineage context': mt.details, 'Coupling lens': mt.coupling?.label, Climate: mt.coupling?.climate, 'Coupling context': mt.coupling?.description, Implications: mt.coupling?.implications })) {
        if (value) body += `<br>${esc(label)}: ${esc(value)}`;
      }
      if (mt.matchedMutations != null && mt.totalDiagnostic != null) body += `<br>Marker match: ${esc(mt.matchedMutations)} / ${esc(mt.totalDiagnostic)}`;
      if (mt.coupling) body += `<br><span class="muted">Evolutionary context, not a direct measurement of personal coupling or proof that a climate causes symptoms.</span>`;
      body += `</p>`;
    }
  }

  // Context sections
  if (reportIncludes(renderOptions, 'context') && contextSections.length > 0) {
    body += `<section class="profile-context" aria-labelledby="profile-context-heading"><h2 id="profile-context-heading">Profile Context</h2><div class="context-grid">`;
    for (const s of contextSections) {
      body += `<article class="context-card"><h3>${esc(s.title)}</h3>${renderContextBody(s.text)}</article>`;
    }
    body += `</div></section>`;
  }

  for (const section of portableReport?.additionalSections || []) {
    if (!reportIncludes(renderOptions, section.id)) continue;
    body += `<h2>${esc(section.title)}</h2><p class="muted">${esc(section.note)}</p>`;
    if (!section.rows.length) { body += '<p>No records available in the selected date range.</p>'; continue; }
    body += `<table class="report-history"><thead><tr>${section.columns.map(label => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${section.rows.map(row => `<tr>${row.map(value => `<td>${esc(value).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  // Footer
  body += `<div class="report-footer">
    <p>Generated by getbased &middot; ${now}</p>
    <p class="disclaimer">This report is for informational purposes only and does not constitute medical advice. Always consult a qualified healthcare professional for interpretation of lab results.</p>
  </div>`;

  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function renderContextBody(text) {
    const lines = String(text || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
    if (lines.length <= 1) return `<p class="context-text">${esc(lines[0] || '')}</p>`;
    const rows = lines.map(line => {
      const splitAt = line.indexOf(': ');
      if (splitAt <= 0) return `<div class="context-row context-row-full"><dd>${esc(line)}</dd></div>`;
      const key = line.slice(0, splitAt);
      const value = line.slice(splitAt + 2);
      return `<div class="context-row"><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`;
    }).join('');
    return `<dl class="context-facts">${rows}</dl>`;
  }

  function renderCollectionContextSection() {
    const labs = portableReport?.labs;
    const entries = Object.entries(labs?.collectionContextByDate || {});
    if (!labs || entries.length === 0) return '';
    const markerResults = labs.categories.flatMap(category => category.markers.flatMap(marker => marker.results));
    const rows = entries.map(([date, context]) => {
      const details = Object.entries(context || {}).filter(([, value]) => value != null && value !== '').map(([key, value]) => {
        const label = String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, char => char.toUpperCase());
        const formatted = value === true ? 'Yes' : value === false ? 'No' : typeof value === 'object' ? JSON.stringify(value) : String(value);
        return `${label}: ${formatted}`;
      });
      const sourceFiles = [...new Set(markerResults
        .filter(result => result.date === date && result.source?.file)
        .map(result => result.source.file))];
      if (sourceFiles.length > 0) details.push(`Source: ${sourceFiles.join(', ')}`);
      return `<tr><td>${esc(fmtDate(date))}</td><td>${esc(details.join(' · '))}</td></tr>`;
    }).join('');
    return `<section class="report-collection-context"><h2>Collection Context</h2><table><thead><tr><th>Date</th><th>Reported draw context</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }

  function formatSupplementDosage(s) {
    const parts = getSupplementDosageParts(s);
    return parts.length > 0 ? parts.map(part => esc(part)).join('<br>') : '\u2014';
  }

  function formatSupplementSummary(s) {
    const dosage = getSupplementDosageParts(s)[0];
    return `${esc(s.name)} [${esc(getSupplementStatus(s))}]${dosage ? ' (' + esc(dosage) + ')' : ''}`;
  }

  function renderReference(reference) {
    try {
      const url = new URL(String(reference));
      if (!['https:', 'http:'].includes(url.protocol)) return esc(reference);
      const pubmedId = url.hostname === 'pubmed.ncbi.nlm.nih.gov' && url.pathname.match(/^\/(\d+)\/?$/)?.[1];
      return `<a href="${escapeAttr(url.href)}" target="_blank" rel="noopener noreferrer">${esc(pubmedId ? `PubMed ${pubmedId}` : url.hostname + url.pathname + url.search + url.hash)}</a>`;
    } catch { return esc(reference); }
  }

  function getRangeModeLabel() {
    if (rangeMode === 'reference') return 'reference';
    return 'optimal';
  }

  function buildHeaderDeck() {
    if (!includesLabs) return 'Selected non-lab sections are included below when available.';
    if (reportStats.totalWithData === 0) {
      return 'No lab results are available for the selected report window; non-lab sections are included only when selected and available.';
    }
    const labDateText = reportDates.size === 1 ? '1 lab date' : `${reportDates.size} lab dates`;
    const markerText = reportStats.totalWithData === 1 ? '1 marker' : `${reportStats.totalWithData} markers`;
    const groupText = reportStats.categoryCount === 1 ? '1 lab group' : `${reportStats.categoryCount} lab groups`;
    const flagText = flags.length === 0
      ? 'No latest markers are outside range.'
      : `${flags.length} latest marker${flags.length === 1 ? ' is' : 's are'} outside range.`;
    return `${labDateText} covering ${markerText} across ${groupText}. ${flagText}`;
  }

  function buildTrendItems() {
    const items = [];
    for (const cat of Object.values(data.categories)) {
      for (const marker of Object.values(cat.markers)) {
        const nonNull = marker.values.map((v,i) => ({v,i})).filter(x => hasReportValue(x.v));
        if (nonNull.length < 2) continue;
        const first = nonNull[0], last = nonNull[nonNull.length - 1];
        if (first.v === 0) continue;
        const pctChange = ((last.v - first.v) / first.v) * 100;
        if (Math.abs(pctChange) > 10) {
          const dir = pctChange > 0 ? 'increased' : 'decreased';
          const firstDate = fullDateLabels[first.i] || '';
          const lastDate = fullDateLabels[last.i] || '';
          items.push(`<li><strong>${esc(marker.name)}</strong> ${dir} ${Math.abs(pctChange).toFixed(0)}% (${formatValue(first.v)} \u2192 ${formatValue(last.v)} ${esc(marker.unit)}, ${firstDate} to ${lastDate})</li>`);
        }
      }
    }
    return items;
  }

  function getLatestReportValueIndex(values = []) {
    for (let i = values.length - 1; i >= 0; i--) {
      if (hasReportValue(values[i])) return i;
    }
    return -1;
  }

  function getReportStatus(value, range) {
    if (!hasReportValue(value)) return 'missing';
    if (range?.min == null && range?.max == null) return 'unrated';
    return getStatus(value, range.min, range.max);
  }

  function formatRangeBounds(range) {
    const min = Object.prototype.hasOwnProperty.call(range || {}, 'min') ? range.min : range?.effectiveMin;
    const max = Object.prototype.hasOwnProperty.call(range || {}, 'max') ? range.max : range?.effectiveMax;
    if (min == null && max == null) return 'not set';
    if (min == null) return `\u2264${formatValue(max)}`;
    if (max == null) return `\u2265${formatValue(min)}`;
    return `${formatValue(min)} \u2013 ${formatValue(max)}`;
  }

  function rangeSetIdentity(rangeContext) {
    return rangeContext.displayedRanges
      .map(range => [range.min ?? '', range.max ?? '', range.label || '', range.kind || '', range.source || ''].join('|'))
      .join('||');
  }

  function renderRangeSet(rangeContext, includeLabels) {
    return rangeContext.displayedRanges.map(range => {
      const bounds = formatRangeBounds(range);
      if (!includeLabels && rangeContext.displayedRanges.length === 1) return bounds;
      const isOptimal = range.kind === 'optimal';
      const prefix = isOptimal && range.label === 'Optimal'
        ? 'opt: '
        : `${esc(range.label || (isOptimal ? 'Optimal' : 'Range'))}: `;
      const content = `${prefix}${bounds}`;
      return isOptimal ? `<span class="optimal">${content}</span>` : content;
    }).join('<br>');
  }

  function renderMarkerRanges(marker, dateColumns) {
    const datedRanges = dateColumns
      .filter(column => hasReportValue(marker.values?.[column.index]))
      .map(column => ({
        label: column.label,
        context: resolveMarkerRangeContext(marker, column.index, rangeMode),
      }));
    if (datedRanges.length === 0) return '\u2014';
    const firstIdentity = rangeSetIdentity(datedRanges[0].context);
    const changesByDate = datedRanges.some(item => rangeSetIdentity(item.context) !== firstIdentity);
    if (!changesByDate) {
      return renderRangeSet(datedRanges[0].context, true);
    }
    return datedRanges.map(item => `${esc(item.label)}: ${renderRangeSet(item.context, true)}`).join('<br>');
  }

  function buildReportStats() {
    let totalWithData = 0, totalInRange = 0, totalUnrated = 0, categoryCount = 0;
    for (const cat of Object.values(data.categories)) {
      let categoryHasData = false;
      for (const marker of Object.values(cat.markers)) {
        const li = getLatestReportValueIndex(marker.values);
        if (li !== -1) {
          categoryHasData = true;
          totalWithData++;
          const r = resolveMarkerRangeContext(marker, li, rangeMode).judgingRange;
          const status = getReportStatus(marker.values[li], r);
          if (status === 'normal') totalInRange++;
          else if (status === 'unrated') totalUnrated++;
        }
      }
      if (categoryHasData) categoryCount++;
    }
    return { totalWithData, totalInRange, totalUnrated, categoryCount };
  }

  function renderSummarySection() {
    let summary = `<section class="report-summary" aria-labelledby="report-summary-heading">
      <h2 id="report-summary-heading">Recorded results summary</h2>
      <p class="report-intro">Generated from <strong>${reportDates.size}</strong> collection date${reportDates.size !== 1 ? 's' : ''}${reportDateLabels.length >= 2 ? ` spanning ${reportDateLabels[0]} \u2013 ${reportDateLabels[reportDateLabels.length - 1]}` : ''}.</p>`;

    const summaryFlags = flags.slice(0, 10);
    if (summaryFlags.length > 0) {
      summary += `<p class="report-subhead">Out of Range Highlights (${summaryFlags.length} of ${flags.length})</p><ul class="report-list">`;
      for (const f of summaryFlags) {
        const boundary = f.status === 'high' ? f.effectiveMax : f.effectiveMin;
        const diff = f.status === 'high' ? f.rawValue - boundary : boundary - f.rawValue;
        const pctBeyond = boundary !== 0 ? ((diff / boundary) * 100).toFixed(0) : '?';
        summary += `<li><strong>${esc(f.name)}</strong>: ${esc(f.value)} ${esc(f.unit)} \u2014 <span class="val-${f.status === 'high' ? 'high' : 'low'}">${esc(f.status.toUpperCase())}</span> (${pctBeyond}% beyond ${f.status === 'high' ? 'upper' : 'lower'} limit; ${esc(f.effectiveLabel || 'range')}: ${formatRangeBounds(f)})</li>`;
      }
      summary += `</ul>`;
      if (flags.length > summaryFlags.length) {
        summary += `<p class="report-note">See Flagged Results for the full list of ${flags.length} out-of-range markers.</p>`;
      }
    } else {
      summary += `<p class="report-ok"><strong>No out-of-range results.</strong></p>`;
    }

    if (reportIncludes(renderOptions, 'trends') && trendItems.length > 0) {
      const summaryTrends = trendItems.slice(0, 8);
      summary += `<p class="report-subhead">Trend Highlights (&gt;10% change)</p><ul class="report-list">${summaryTrends.join('')}</ul>`;
      if (trendItems.length > summaryTrends.length) {
        summary += `<p class="report-note">See Notable Trends for the full list of ${trendItems.length} changes.</p>`;
      }
    }

    summary += `<p class="report-copy"><strong>Within ${rangeModeTitle} Range:</strong> ${reportStats.totalInRange} of ${reportStats.totalWithData} markers with data${reportStats.totalUnrated ? ` (${reportStats.totalUnrated} unrated because no applicable bounds were available)` : ''}</p>`;

    if (reportIncludes(renderOptions, 'supplements') && supps.length > 0) {
      const suppList = supps.map(s => formatSupplementSummary(s)).join(', ');
      summary += `<p class="report-copy"><strong>Supplements/Medications:</strong> ${suppList}</p>`;
    }

    if (reportIncludes(renderOptions, 'genetics') && includeApoe) {
      summary += `<p class="report-copy"><strong>APOE:</strong> ${esc(genetics.apoe)}</p>`;
    }

    summary += `<p class="report-note">This summary is calculated from the selected records and ranges. Flags do not establish a diagnosis or treatment need.</p></section>`;
    return summary;
  }

  if (!options.detailed) {
    const report = portableReport || buildReportDataSnapshot({
      data, profile: { ...headerProfile, name: profileName }, importedData: { notes, supplements: supps, genetics: state.importedData.genetics },
      reportOptions, rangeMode, unitSystem: state.unitSystem, contextSections, snpTable: getReportSnpTableCache(),
    });
    const appendix = reportOptions.appendixSections.length ? `<section id="report-appendix"><h2>Appendix — selected detailed records</h2><p class="report-note">${esc(reportOptions.appendixSections.join(', '))} · <a href="#report-top">Back to summary</a></p>${body || '<p>No detailed records available for these selections.</p>'}</section>` : '';
    body = renderConciseReportBody(report, reportOptions, headerFacts, renderReportAISummarySection(reportOptions.aiSummary)) + appendix;
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>getbased Report - ${esc(profileName)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root { color-scheme: light; }
  html, body { background: #fff; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.55; padding: 36px; max-width: 1100px; margin: 0 auto; }
  #report-top .report-meta { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
  .report-contents { font-size: 12px; margin: 14px 0; }
  .report-summary-section { margin-top: 18px; }
  #report-appendix { break-before: page; }
  #report-environment { break-inside: avoid; }
  .report-history-summary { table-layout: fixed; }
  .report-purpose h2 { margin-top: 12px; }
  .report-summary-section h2 { margin-top: 16px; }
  a { color: #1d4ed8; text-decoration: underline; }
  .report-preview-toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: flex-end; margin: -16px -16px 22px; padding: 12px 16px; background: rgba(255,255,255,0.96); border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(10px); }
  .report-print-btn { border: 1px solid #111827; background: #111827; color: #fff; border-radius: 6px; padding: 8px 13px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
  .report-print-btn:hover { background: #374151; border-color: #374151; }
  .report-header { border-bottom: 2px solid #111827; padding-bottom: 18px; margin-bottom: 18px; }
  .report-head-top { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; margin-bottom: 10px; }
  .report-brand { color: #4b5563; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .report-kicker { color: #64748b; font-size: 12px; font-weight: 700; margin-top: 2px; }
  .report-generated { color: #64748b; font-size: 11px; line-height: 1.3; text-align: right; }
  .report-generated span { display: block; text-transform: uppercase; font-weight: 700; letter-spacing: 0.06em; }
  .report-generated strong { color: #111827; font-size: 13px; font-weight: 700; }
  .report-header h1 { color: #111827; font-size: 32px; font-weight: 750; letter-spacing: 0; line-height: 1.1; margin-top: 4px; }
  .report-deck { color: #374151; font-size: 14px; line-height: 1.5; max-width: 78ch; margin-top: 10px; }
  .report-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px 16px; margin-top: 16px; }
  .report-meta div { min-width: 0; padding-top: 8px; border-top: 1px solid #e5e7eb; }
  .report-meta dt { color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .report-meta dd { color: #111827; font-size: 13px; font-weight: 650; line-height: 1.35; margin-top: 2px; overflow-wrap: anywhere; }
  .report-overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0 0 24px; }
  .report-stat { border: 1px solid #d8e0ea; background: #f8fafc; padding: 10px 12px; min-height: 88px; break-inside: avoid; page-break-inside: avoid; }
  .report-stat-label { display: block; color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .report-stat-value { display: block; color: #111827; font-size: 24px; line-height: 1.15; margin-top: 6px; }
  .report-stat-note { display: block; color: #475569; font-size: 11px; line-height: 1.35; margin-top: 4px; }
  .report-ai-summary { border: 1px solid #cbd5e1; background: #f8fafc; padding: 16px 18px; margin: 0 0 22px; break-inside: avoid; page-break-inside: avoid; }
  .report-ai-summary h2 { margin-top: 0; }
  .report-ai-summary-body { color: #273449; font-size: 13px; line-height: 1.55; }
  .report-ai-summary-body p { margin-bottom: 9px; }
  .report-ai-subhead { color: #111827; font-size: 12px; font-weight: 750; letter-spacing: 0; margin: 12px 0 4px; text-transform: uppercase; }
  .report-ai-meta { color: #64748b; font-size: 11px; font-weight: 650; margin-top: 10px; }
  .report-ai-attribution { color: #475569; font-size: 11px; font-weight: 700; margin-top: 8px; }
  .report-summary { border: 1px solid #d8e0ea; background: #fbfcfe; padding: 16px 18px; margin: 0 0 22px; break-inside: avoid; page-break-inside: avoid; }
  h2 { color: #111827; font-size: 18px; font-weight: 750; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #d8e0ea; page-break-after: avoid; }
  .report-summary h2 { margin-top: 0; }
  .report-intro, .report-copy { color: #374151; font-size: 13px; margin-bottom: 10px; }
  .report-subhead { color: #111827; font-size: 14px; font-weight: 700; margin: 14px 0 6px; }
  .report-list { color: #374151; font-size: 13px; margin: 0 0 12px 20px; }
  .report-list li { margin-bottom: 3px; }
  .report-ok { color: #047857; font-size: 13px; margin-bottom: 12px; }
  .report-note { color: #6b7280; font-size: 11px; font-style: italic; margin-top: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 18px; border: 1px solid #e5e7eb; table-layout: auto; }
  thead { display: table-header-group; }
  th { background: #eef2f7; color: #374151; padding: 8px 9px; text-align: left; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 2px solid #d8e0ea; }
  td { padding: 6px 9px; border-bottom: 1px solid #edf0f4; font-variant-numeric: tabular-nums; vertical-align: top; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) { background: #fafafa; }
  th:first-child, td:first-child { font-weight: 600; }
  .val-normal { color: #059669; font-weight: 600; }
  .val-high { color: #dc2626; font-weight: 600; }
  .val-low { color: #d97706; font-weight: 600; }
  .val-unrated { color: #64748b; font-weight: 600; }
  .val-missing { color: #999; }
  .report-meta .report-included-data { grid-column: 1 / -1; }
  .genetics-table, .report-history { table-layout: fixed; overflow-wrap: anywhere; }
  .genome-direction { display: inline-block; padding: 3px 5px; border: 1px solid; border-radius: 4px; font-weight: 600; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .genome-risk { color: #b91c1c; background: #fef2f2; border-color: #fca5a5; }
  .genome-protective { color: #166534; background: #f0fdf4; border-color: #86efac; }
  .genome-trait { color: #1d4ed8; background: #eff6ff; border-color: #93c5fd; }
  .genome-neutral { color: #475569; background: #f8fafc; border-color: #cbd5e1; }
  .genetics-table a { color: #1d4ed8; text-decoration: underline; }
  .genetics-table th:nth-child(1) { width: 19%; }
  .genetics-table th:nth-child(2) { width: 14%; }
  .genetics-table th:nth-child(3) { width: 19%; }
  .muted { color: #777; font-size: 11px; }
  .optimal { color: #059669; font-size: 10px; }
  .note-item { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
  .report-marker-note, .report-value-note { color: #64748b; font-size: 9px; font-weight: 500; line-height: 1.35; margin-top: 3px; }
  .report-collection-context { break-inside: avoid; page-break-inside: avoid; }
  .profile-context { margin-top: 28px; break-inside: avoid; page-break-inside: avoid; }
  .context-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .context-card { border: 1px solid #d8e0ea; background: #fbfcfe; padding: 12px 14px; break-inside: avoid; page-break-inside: avoid; }
  .context-card h3 { color: #111827; font-size: 13px; font-weight: 750; letter-spacing: 0; margin-bottom: 8px; }
  .context-text { color: #374151; font-size: 12px; line-height: 1.55; max-width: 70ch; }
  .context-facts { display: grid; gap: 5px; }
  .context-row { display: grid; grid-template-columns: minmax(88px, 0.34fr) 1fr; gap: 8px; align-items: baseline; }
  .context-row dt { color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
  .context-row dd { color: #273449; font-size: 12px; line-height: 1.45; }
  .context-row-full { display: block; }
  .report-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 11px; color: #888; break-inside: avoid; page-break-inside: avoid; }
  .disclaimer { margin-top: 8px; font-style: italic; }
  .report-origin-notice { border: 2px solid #526b89; padding: 12px 14px; margin: 12px 0; font-size: 12px; color: #172b43; break-inside: avoid; }
  .report-origin-notice strong { display: block; font-size: 14px; }
  .report-origin-notice p { margin-top: 6px; line-height: 1.5; }
  .report-origin-note { font-size: 11px; line-height: 1.5; margin: 10px 0; color: #475569; }
  .report-ai-edit-hint { color: #475569; font-size: 12px; }
  .report-ai-summary-body[contenteditable]:focus { outline: 2px solid #2563eb; outline-offset: 4px; }
  @media print {
    .report-ai-edit-hint { display: none; }
    .report-ai-summary-body[contenteditable], .report-ai-summary-body[contenteditable]:focus { outline: none; }
    @page { margin: 12mm; @bottom-right { content: counter(page) " / " counter(pages); font: 9px sans-serif; color: #64748b; } }
    body { padding: 0; max-width: none; }
    .report-preview-toolbar { display: none; }
    .report-header { margin-bottom: 12px; padding-bottom: 12px; }
    .report-head-top { margin-bottom: 6px; }
    .report-header h1 { font-size: 26px; }
    .report-deck { font-size: 12px; margin-top: 6px; }
    .report-meta { gap: 6px 12px; margin-top: 10px; }
    .report-meta div { padding-top: 5px; }
    .report-overview { grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
    .report-stat { min-height: 68px; padding: 8px 10px; }
    .report-stat-value { font-size: 20px; margin-top: 4px; }
    .report-summary, .report-ai-summary, .profile-context { break-inside: auto; page-break-inside: auto; }
    .report-summary, .report-ai-summary { padding: 12px 14px; margin-bottom: 16px; }
    h2 { page-break-after: avoid; }
    table { page-break-inside: auto; }
    th { font-size: 9px; padding: 6px 7px; }
    td { font-size: 10px; padding: 5px 7px; }
    tr { page-break-inside: avoid; }
    .report-footer { break-inside: avoid; page-break-inside: avoid; }
  }
  @media (max-width: 720px) {
    body { padding: 20px; }
    .report-preview-toolbar { margin: -8px -8px 18px; padding: 10px 8px; }
    .report-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .context-grid { grid-template-columns: 1fr; }
  }
</style></head><body>${body}</body></html>`;
}
