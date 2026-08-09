// @ts-check
// export-report-html.js — PDF report HTML renderer

import { state } from './state.js';
import { getStatus, formatValue, getTrend, showNotification } from './utils.js';
import { getEffectiveRange } from './marker-analysis.js';
import { effectiveTimesPerDay, formatSupplementTotal, ingredientDailyTotal } from './supplement-impact.js';
import { getSupplementPeriods, getSupplementStatus } from './supplement-medication-domain.js';
import {
  buildReportHeaderFacts,
  buildPreparedReportPayload,
  getReportHeaderProfile,
  normalizeReportOptions,
  renderReportAISummarySection,
  reportIncludes,
} from './export-report.js';

function getReportRuntimeWindow() {
  return typeof window !== 'undefined' ? window : null;
}

function openReportPreviewWindow() {
  const runtimeWindow = getReportRuntimeWindow();
  return typeof runtimeWindow?.open === 'function'
    ? runtimeWindow.open('', '_blank')
    : null;
}

function getReportSnpTableCache() {
  return getReportRuntimeWindow()?._snpTableCache || null;
}

export function exportPDFReport(options = {}) {
  const payload = buildPreparedReportPayload(options);
  const html = buildReportHTML(payload.profileName, payload.sexLabel, payload.data, payload.flags, payload.notes, payload.supps, payload.contextSections, payload.reportOptions);
  const win = openReportPreviewWindow();
  if (!win) { showNotification('Pop-up blocked - please allow pop-ups for this site', 'error'); return false; }
  win.document.write(html);
  win.document.close();
  const printBtn = typeof win.document.querySelector === 'function'
    ? win.document.querySelector('.report-print-btn')
    : null;
  if (printBtn) printBtn.addEventListener('click', () => win.print());
  showNotification('PDF preview opened. Use Print in the preview to save as PDF.', 'info', 2500);
  return true;
}

export function buildReportHTML(profileName, sexLabel, data, flags, notes, supps, contextSections, options = {}) {
  const reportOptions = normalizeReportOptions(options);
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const unitLabel = state.unitSystem === 'US' ? 'US (conventional)' : 'EU (SI)';
  const fmtDate = d => d && Number.isFinite(new Date(d + 'T00:00:00').getTime())
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'date not set';
  const fullDateLabels = data.dates.map(d => fmtDate(d));
  const dateRange = fullDateLabels.length > 0
    ? `${fullDateLabels[0]} \u2013 ${fullDateLabels[fullDateLabels.length - 1]}`
    : 'No lab dates in selected range';
  const hasReportValue = value => value !== null && value !== undefined;
  const trendItems = buildTrendItems();
  const reportStats = buildReportStats();
  const genetics = state.importedData.genetics;
  const snpTable = getReportSnpTableCache();
  const rangeModeLabel = getRangeModeLabel();
  const rangeModeTitle = rangeModeLabel.charAt(0).toUpperCase() + rangeModeLabel.slice(1);
  const headerDeck = buildHeaderDeck();
  const headerProfile = getReportHeaderProfile(profileName);
  const headerFacts = buildReportHeaderFacts({ profile: headerProfile, reportOptions, dateRange, sexLabel, unitLabel });
  const headerMetaHTML = headerFacts.map(fact => `<div><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)}</dd></div>`).join('');

  let body = '';

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
    <h1>${esc(profileName)} lab report</h1>
    <p class="report-deck">${esc(headerDeck)}</p>
    <dl class="report-meta">${headerMetaHTML}</dl>
  </header>`;

  body += `<div class="report-overview" aria-label="Report snapshot">
    <div class="report-stat">
      <span class="report-stat-label">Needs Attention</span>
      <strong class="report-stat-value">${flags.length}</strong>
      <span class="report-stat-note">latest out-of-range marker${flags.length === 1 ? '' : 's'}</span>
    </div>
    <div class="report-stat">
      <span class="report-stat-label">Markers Reviewed</span>
      <strong class="report-stat-value">${reportStats.totalWithData}</strong>
      <span class="report-stat-note">${reportStats.totalInRange} within ${rangeModeLabel} range</span>
    </div>
    <div class="report-stat">
      <span class="report-stat-label">Lab Dates</span>
      <strong class="report-stat-value">${data.dates.length}</strong>
      <span class="report-stat-note">${esc(dateRange)}</span>
    </div>
    <div class="report-stat">
      <span class="report-stat-label">Lab Groups</span>
      <strong class="report-stat-value">${reportStats.categoryCount}</strong>
      <span class="report-stat-note">with lab data</span>
    </div>
  </div>`;

  body += renderReportAISummarySection(reportOptions.aiSummary);

  if (reportIncludes(reportOptions, 'summary')) {
    body += renderSummarySection();
  }

  // Flagged Results
  if (reportIncludes(reportOptions, 'flagged') && flags.length > 0) {
    body += `<h2>Flagged Results</h2><table><thead><tr><th>Biomarker</th><th>Value</th><th>Range</th><th>Status</th></tr></thead><tbody>`;
    for (const f of flags) {
      const cls = f.status === 'high' ? 'val-high' : 'val-low';
      const label = f.status === 'high' ? 'HIGH' : 'LOW';
      body += `<tr><td>${esc(f.name)}</td><td class="${cls}">${f.value} ${esc(f.unit)}</td>
        <td>${formatValue(f.effectiveMin)} \u2013 ${formatValue(f.effectiveMax)}</td><td class="${cls}">${label}</td></tr>`;
    }
    body += `</tbody></table>`;
  }

  if (reportIncludes(reportOptions, 'trends') && trendItems.length > 0) {
    body += `<h2>Notable Trends</h2><ul class="report-list">${trendItems.join('')}</ul>`;
  }

  // Category tables
  if (reportIncludes(reportOptions, 'categories')) {
    for (const cat of Object.values(data.categories)) {
      const markersWithData = Object.entries(cat.markers).filter(([_, m]) => m.values && m.values.some(hasReportValue));
      if (markersWithData.length === 0) continue;
      const dateColumns = cat.singleDate
        ? [{ label: cat.singleDateLabel || 'N/A', index: 0 }]
        : fullDateLabels
            .map((label, index) => ({ label, index }))
            .filter(({ index }) => markersWithData.some(([, marker]) => hasReportValue(marker.values?.[index])));
      if (dateColumns.length === 0) continue;
      body += `<h2>${esc(cat.label)}</h2><table><thead><tr><th>Biomarker</th><th>Unit</th><th>Reference</th>`;
      for (const column of dateColumns) body += `<th>${esc(column.label)}</th>`;
      body += `<th>Trend</th></tr></thead><tbody>`;
      for (const [, marker] of markersWithData) {
        const r = getEffectiveRange(marker);
        const trendValues = marker.values.map(v => hasReportValue(v) ? v : null);
        const trend = getTrend(trendValues, r.min, r.max);
        let rangeStr = r.min != null && r.max != null ? `${formatValue(r.min)} \u2013 ${formatValue(r.max)}` : '\u2014';
        if (state.rangeMode === 'both' && marker.optimalMin != null) {
          rangeStr = `${formatValue(marker.refMin)} \u2013 ${formatValue(marker.refMax)}<br><span class="optimal">opt: ${formatValue(marker.optimalMin)} \u2013 ${formatValue(marker.optimalMax)}</span>`;
        }
        body += `<tr><td>${esc(marker.name)}</td><td class="muted">${esc(marker.unit)}</td><td class="muted">${rangeStr}</td>`;
        for (const column of dateColumns) {
          const v = marker.values[column.index] ?? null;
          const s = v !== null ? getStatus(v, r.min, r.max) : 'missing';
          const sPrefix = s === 'high' ? '\u25B2 ' : s === 'low' ? '\u25BC ' : '';
          body += `<td class="val-${s}">${v !== null ? sPrefix + formatValue(v) : '\u2014'}</td>`;
        }
        body += `<td>${trend.arrow}</td></tr>`;
      }
      body += `</tbody></table>`;
    }
  }

  // Supplements
  if (reportIncludes(reportOptions, 'supplements') && supps.length > 0) {
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
  if (reportIncludes(reportOptions, 'notes') && notes.length > 0) {
    body += `<h2>Notes</h2>`;
    for (const n of notes) {
      body += `<div class="note-item"><strong>${fmtDate(n.date)}</strong>: ${esc(n.text)}</div>`;
    }
  }

  // Genetics
  if (reportIncludes(reportOptions, 'genetics') && genetics && genetics.snps && snpTable) {
    const snpCount = Object.keys(genetics.snps).length;
    body += `<h2>Genetics</h2>`;
    body += `<p style="font-size:13px;color:#555;margin-bottom:12px"><strong>Source:</strong> ${esc(genetics.source)} &middot; <strong>SNPs:</strong> ${snpCount} &middot; <strong>Imported:</strong> ${genetics.importDate}${genetics.apoe ? ' &middot; <strong>APOE:</strong> ' + esc(genetics.apoe) : ''}</p>`;
    const apoeRsids = new Set(['rs429358', 'rs7412']);
    const byCat = {};
    const catLabels = { methylation: 'Methylation', iron: 'Iron', lipids: 'Lipids', vitaminD: 'Vitamin D', vitaminB12: 'Vitamin B12', bilirubin: 'Bilirubin', thyroid: 'Thyroid', fattyAcids: 'Fatty Acids', bloodSugar: 'Blood Sugar', sexHormones: 'Sex Hormones', alcohol: 'Alcohol', caffeine: 'Caffeine', bodyComposition: 'Body Composition', skin: 'Skin & Sun', other: 'Other' };
    for (const [rsid, stored] of Object.entries(genetics.snps)) {
      if (genetics.apoe && apoeRsids.has(rsid)) continue;
      const entry = snpTable[rsid];
      if (!entry) continue;
      const reversed = stored.genotype.length === 2 ? stored.genotype[1] + stored.genotype[0] : stored.genotype;
      const info = entry.genotypes[stored.genotype] || entry.genotypes[reversed];
      if (!info || info.effect === 'none') continue;
      const cat = entry.category || 'other';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push({ gene: stored.gene, variant: stored.variant, genotype: stored.genotype, effect: info.effect, note: info.note });
    }
    const catOrder = Object.entries(byCat).sort(([, a], [, b]) => {
      const aS = a.some(f => f.effect === 'significant') ? 0 : 1;
      const bS = b.some(f => f.effect === 'significant') ? 0 : 1;
      return aS - bS;
    });
    if (catOrder.length > 0) {
      body += `<table><thead><tr><th>Category</th><th>Gene</th><th>Variant</th><th>Genotype</th><th>Effect</th><th>Note</th></tr></thead><tbody>`;
      for (const [cat, findings] of catOrder) {
        findings.sort((a, b) => (a.effect === 'significant' ? 0 : 1) - (b.effect === 'significant' ? 0 : 1));
        for (const f of findings) {
          const effectLabel = f.effect === 'significant' ? 'Significant' : 'Moderate';
          const effectCls = f.effect === 'significant' ? 'val-high' : 'val-low';
          body += `<tr><td>${esc(catLabels[cat] || cat)}</td><td>${esc(f.gene)}</td><td>${esc(f.variant)}</td><td>${esc(f.genotype)}</td><td class="${effectCls}">${effectLabel}</td><td style="font-size:11px">${esc(f.note)}</td></tr>`;
        }
      }
      body += `</tbody></table>`;
    }
  }
  // mtDNA haplogroup
  if (reportIncludes(reportOptions, 'genetics') && genetics?.mtdna) {
    const mt = genetics.mtdna;
    if (!genetics.snps || !snpTable) body += `<h2>Genetics</h2>`;
    body += `<div style="margin:12px 0;font-size:13px"><strong>mtDNA Haplogroup:</strong> ${esc(mt.haplogroup)}`;
    if (mt.coupling) body += ` \u2014 ${esc(mt.coupling.label)} (${esc(mt.coupling.climate)})`;
    if (mt.source) body += ` &middot; Source: ${esc(mt.source)}`;
    body += `</div>`;
  }

  // Context sections
  if (reportIncludes(reportOptions, 'context') && contextSections.length > 0) {
    body += `<section class="profile-context" aria-labelledby="profile-context-heading"><h2 id="profile-context-heading">Profile Context</h2><div class="context-grid">`;
    for (const s of contextSections) {
      body += `<article class="context-card"><h3>${esc(s.title)}</h3>${renderContextBody(s.text)}</article>`;
    }
    body += `</div></section>`;
  }

  // Footer
  body += `<div class="report-footer">
    <p>Generated by getbased &middot; ${now}</p>
    <p class="disclaimer">This report is for informational purposes only and does not constitute medical advice. Always consult a qualified healthcare professional for interpretation of lab results.</p>
  </div>`;

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

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

  function getSupplementDosageParts(s) {
    const parts = [];
    if (s.dosage) parts.push(String(s.dosage));
    if (s.dose) parts.push(String(s.dose));
    if (s.amount) parts.push(String(s.amount));
    if (s.frequency && !parts.some(part => part.toLowerCase().includes(String(s.frequency).toLowerCase()))) {
      parts.push(String(s.frequency));
    }
    if (Array.isArray(s.ingredients) && s.ingredients.length > 0) {
      const ingredientParts = s.ingredients.map(ing => {
        const name = ing.name ? String(ing.name).trim() : '';
        const amount = ing.amount ? String(ing.amount).trim() : '';
        const base = [name, amount].filter(Boolean).join(' ').trim();
        if (!base) return '';
        const total = ingredientDailyTotal(ing, s);
        const times = effectiveTimesPerDay(ing, s);
        const timesStr = times && times > 1 ? ` x ${times}/day` : '';
        const totalStr = total ? ` -> ${formatSupplementTotal(total)}` : '';
        return `${base}${timesStr}${totalStr}`;
      }).filter(Boolean);
      if (ingredientParts.length > 0) parts.push(ingredientParts.join('; '));
    }
    if (Array.isArray(s.inactiveIngredients) && s.inactiveIngredients.length > 0) {
      parts.push(`Other label ingredients: ${s.inactiveIngredients.join(', ')}`);
    }
    if (Array.isArray(s.qualityTests) && s.qualityTests.length > 0) {
      parts.push(`Source-reported laboratory results: ${s.qualityTests.map(test => {
        const result = test.resultText || test.status || 'result not reported';
        return `${test.analyte || 'Unknown analyte'} ${result}${test.basis ? ` (${test.basis})` : ''}`;
      }).join('; ')}`);
    }
    if (s.timesPerDay && !parts.some(part => /\b\/day\b|\bx\s*\d/i.test(part))) {
      parts.push(`${s.timesPerDay}x/day`);
    }
    return [...new Set(parts)];
  }

  function formatSupplementDosage(s) {
    const parts = getSupplementDosageParts(s);
    return parts.length > 0 ? parts.map(part => esc(part)).join('<br>') : '\u2014';
  }

  function formatSupplementSummary(s) {
    const dosage = getSupplementDosageParts(s)[0];
    return `${esc(s.name)} [${esc(getSupplementStatus(s))}]${dosage ? ' (' + esc(dosage) + ')' : ''}`;
  }

  function getRangeModeLabel() {
    if (state.rangeMode === 'reference') return 'reference';
    if (state.rangeMode === 'both') return 'reference/optimal';
    return 'optimal';
  }

  function buildHeaderDeck() {
    if (reportStats.totalWithData === 0) {
      return 'No lab results are available for the selected report window; non-lab sections are included only when selected and available.';
    }
    const labDateText = data.dates.length === 1 ? '1 lab date' : `${data.dates.length} lab dates`;
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

  function buildReportStats() {
    let totalWithData = 0, totalInRange = 0, categoryCount = 0;
    for (const cat of Object.values(data.categories)) {
      let categoryHasData = false;
      for (const marker of Object.values(cat.markers)) {
        const li = getLatestReportValueIndex(marker.values);
        if (li !== -1) {
          categoryHasData = true;
          totalWithData++;
          const r = getEffectiveRange(marker);
          if (getStatus(marker.values[li], r.min, r.max) === 'normal') totalInRange++;
        }
      }
      if (categoryHasData) categoryCount++;
    }
    return { totalWithData, totalInRange, categoryCount };
  }

  function renderSummarySection() {
    let summary = `<section class="report-summary" aria-labelledby="report-summary-heading">
      <h2 id="report-summary-heading">Summary for Healthcare Provider</h2>
      <p class="report-intro">Generated from <strong>${data.dates.length}</strong> collection date${data.dates.length !== 1 ? 's' : ''}${fullDateLabels.length >= 2 ? ` spanning ${fullDateLabels[0]} \u2013 ${fullDateLabels[fullDateLabels.length - 1]}` : ''}.</p>`;

    const summaryFlags = flags.slice(0, 10);
    if (summaryFlags.length > 0) {
      summary += `<p class="report-subhead">Out of Range Highlights (${summaryFlags.length} of ${flags.length})</p><ul class="report-list">`;
      for (const f of summaryFlags) {
        const boundary = f.status === 'high' ? f.effectiveMax : f.effectiveMin;
        const diff = f.status === 'high' ? f.rawValue - boundary : boundary - f.rawValue;
        const pctBeyond = boundary !== 0 ? ((diff / boundary) * 100).toFixed(0) : '?';
        summary += `<li><strong>${esc(f.name)}</strong>: ${f.value} ${esc(f.unit)} \u2014 <span class="val-${f.status}">${f.status.toUpperCase()}</span> (${pctBeyond}% beyond ${f.status === 'high' ? 'upper' : 'lower'} limit; ref: ${formatValue(f.refMin)}\u2013${formatValue(f.refMax)}${f.optimalMin != null ? ', optimal: ' + formatValue(f.optimalMin) + '\u2013' + formatValue(f.optimalMax) : ''})</li>`;
      }
      summary += `</ul>`;
      if (flags.length > summaryFlags.length) {
        summary += `<p class="report-note">See Flagged Results for the full list of ${flags.length} out-of-range markers.</p>`;
      }
    } else {
      summary += `<p class="report-ok"><strong>No out-of-range results.</strong></p>`;
    }

    if (reportIncludes(reportOptions, 'trends') && trendItems.length > 0) {
      const summaryTrends = trendItems.slice(0, 8);
      summary += `<p class="report-subhead">Trend Highlights (&gt;10% change)</p><ul class="report-list">${summaryTrends.join('')}</ul>`;
      if (trendItems.length > summaryTrends.length) {
        summary += `<p class="report-note">See Notable Trends for the full list of ${trendItems.length} changes.</p>`;
      }
    }

    summary += `<p class="report-copy"><strong>Within ${rangeModeTitle} Range:</strong> ${reportStats.totalInRange} of ${reportStats.totalWithData} markers with data</p>`;

    if (reportIncludes(reportOptions, 'supplements') && supps.length > 0) {
      const suppList = supps.map(s => formatSupplementSummary(s)).join(', ');
      summary += `<p class="report-copy"><strong>Supplements/Medications:</strong> ${suppList}</p>`;
    }

    if (reportIncludes(reportOptions, 'genetics') && genetics && genetics.apoe) {
      summary += `<p class="report-copy"><strong>APOE:</strong> ${esc(genetics.apoe)}</p>`;
    }

    summary += `<p class="report-note">This summary was auto-generated by getbased. Values should be interpreted in clinical context.</p></section>`;
    return summary;
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>getbased Report - ${esc(profileName)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root { color-scheme: light; }
  html, body { background: #fff; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.55; padding: 36px; max-width: 1100px; margin: 0 auto; }
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
  .val-missing { color: #999; }
  .muted { color: #777; font-size: 11px; }
  .optimal { color: #059669; font-size: 10px; }
  .note-item { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
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
  @media print {
    @page { margin: 12mm; }
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
