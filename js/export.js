// export.js — PDF report, JSON export/import, clear all data

import { state } from './state.js';
import { getStatus, formatValue, showNotification, showConfirmDialog, getTrend, escapeHTML, escapeAttr } from './utils.js';
import { getActiveData, saveImportedData } from './data.js';
import { getAllFlaggedMarkers, getEffectiveRange, getLatestValueIndex } from './marker-analysis.js';
import { getProfiles, profileStorageKey, createProfile, updateProfileMeta, loadProfile, saveProfiles, migrateProfileData } from './profile.js';
import { getBloodDrawPhases } from './cycle.js';
import { encryptedGetItem, encryptedSetItem, getEncryptionEnabled, encryptedRemoveItem } from './crypto.js';
import {
  appendImportedArrayItem,
  ensureImportedArray,
  replaceImportedArrayItem,
  sortImportedArray,
  trimImportedArray,
} from './data-merge.js';
import { findOrCreateLabEntry } from './lab-entry-mutations.js';
import { setLabEntryMarker } from './lab-entry.js';

// ═══════════════════════════════════════════════
// PDF REPORT EXPORT
// ═══════════════════════════════════════════════
const REPORT_BUILDER_OVERLAY_ID = 'report-builder-overlay';
const DEFAULT_REPORT_PRESET = 'clinician';

const REPORT_SECTION_DEFS = [
  { id: 'flagged', label: 'Flagged results' },
  { id: 'categories', label: 'Lab tables' },
  { id: 'summary', label: 'Healthcare summary' },
  { id: 'trends', label: 'Notable trends' },
  { id: 'supplements', label: 'Supplements and meds' },
  { id: 'notes', label: 'Notes' },
  { id: 'genetics', label: 'Genetics' },
  { id: 'context', label: 'Profile context' },
];
const REPORT_SECTION_IDS = REPORT_SECTION_DEFS.map(section => section.id);
const REPORT_LAB_SECTION_IDS = ['flagged', 'categories', 'summary', 'trends'];

const REPORT_PRESETS = {
  clinician: {
    label: 'Clinician summary',
    subtitle: 'Priority labs, flags, trends',
    sections: ['flagged', 'categories', 'summary', 'trends', 'supplements', 'context'],
    categoryMode: 'priority',
    dateRange: 'current',
  },
  full: {
    label: 'Full lab report',
    subtitle: 'All dates, all sections',
    sections: REPORT_SECTION_IDS,
    categoryMode: 'all',
    dateRange: 'all',
  },
  personal: {
    label: 'Personal snapshot',
    subtitle: 'Labs, notes, context',
    sections: ['flagged', 'categories', 'trends', 'supplements', 'notes', 'genetics', 'context'],
    categoryMode: 'all',
    dateRange: 'current',
  },
};

const REPORT_DATE_RANGE_OPTIONS = [
  { value: 'current', label: 'Current dashboard range' },
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: '1y', label: 'Last year' },
  { value: 'all', label: 'All dates' },
];

let reportBuilderDelegatesInstalled = false;

function getReportPreset(presetId) {
  return REPORT_PRESETS[presetId] || REPORT_PRESETS[DEFAULT_REPORT_PRESET];
}

function normalizeReportOptions(options = {}) {
  const hasExplicitOptions = options && Object.keys(options).length > 0;
  const fallbackPreset = hasExplicitOptions ? DEFAULT_REPORT_PRESET : 'full';
  const presetId = REPORT_PRESETS[options.preset] ? options.preset : fallbackPreset;
  const preset = getReportPreset(presetId);
  const sectionInput = Array.isArray(options.sections) && options.sections.length > 0
    ? options.sections
    : preset.sections;
  const sectionSet = new Set(sectionInput);
  const dateRange = REPORT_DATE_RANGE_OPTIONS.some(option => option.value === options.dateRange)
    ? options.dateRange
    : (hasExplicitOptions ? preset.dateRange : 'current');
  return {
    preset: presetId,
    presetLabel: options.presetLabel || preset.label,
    dateRange,
    sections: REPORT_SECTION_IDS.filter(id => sectionSet.has(id)),
    categoryKeys: Array.isArray(options.categoryKeys) ? options.categoryKeys.filter(Boolean) : null,
  };
}

function reportIncludes(options, sectionId) {
  return options.sections.includes(sectionId);
}

function filterDataByDateIndices(data, indices, cutoffStr) {
  const filtered = {
    dates: indices.map(i => data.dates[i]),
    dateLabels: indices.map(i => data.dateLabels?.[i] || data.dates[i]),
    ...(data.phaseLabels && { phaseLabels: indices.map(i => data.phaseLabels[i]) }),
    categories: {}
  };
  for (const [catKey, cat] of Object.entries(data.categories || {})) {
    const filteredCat = { ...cat, markers: {} };
    for (const [mKey, marker] of Object.entries(cat.markers || {})) {
      if (marker.singlePoint || cat.singlePoint) {
        const spDate = marker.singleDate || cat.singleDate;
        if (spDate && cutoffStr && spDate < cutoffStr) {
          filteredCat.markers[mKey] = { ...marker, values: [null], singleDate: null };
        } else {
          filteredCat.markers[mKey] = marker;
        }
      } else {
        filteredCat.markers[mKey] = {
          ...marker,
          values: indices.map(i => marker.values?.[i] ?? null),
          ...(marker.phaseRefRanges && { phaseRefRanges: indices.map(i => marker.phaseRefRanges[i]) }),
          ...(marker.phaseLabels && { phaseLabels: indices.map(i => marker.phaseLabels[i]) }),
        };
      }
    }
    filtered.categories[catKey] = filteredCat;
  }
  return filtered;
}

function getReportCutoffDate(range) {
  const effectiveRange = range === 'current' ? state.dateRangeFilter : range;
  if (!effectiveRange || effectiveRange === 'all') return null;
  const months = effectiveRange === '3m' ? 3 : effectiveRange === '6m' ? 6 : 12;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return cutoff.toISOString().slice(0, 10);
}

function filterDataByReportRange(rawData, range) {
  if (!rawData || range === 'all') return rawData;
  const cutoffStr = getReportCutoffDate(range);
  if (!cutoffStr) return rawData;
  const indices = [];
  for (let i = 0; i < (rawData.dates || []).length; i++) {
    if (rawData.dates[i] >= cutoffStr) indices.push(i);
  }
  return filterDataByDateIndices(rawData, indices, cutoffStr);
}

function filterReportCategories(data, categoryKeys) {
  if (!Array.isArray(categoryKeys)) return data;
  const allowed = new Set(categoryKeys);
  const categories = {};
  for (const [catKey, cat] of Object.entries(data.categories || {})) {
    if (allowed.has(catKey)) categories[catKey] = cat;
  }
  return { ...data, categories };
}

function getReportNotes(data, options) {
  const notes = (state.importedData.notes || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const cutoffStr = getReportCutoffDate(options.dateRange);
  if (!cutoffStr) return notes;
  return notes.filter(note => !note.date || note.date >= cutoffStr);
}

function buildReportContextSections(data) {
  const contextSections = [];
  const humanizeContextKey = key => String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\b(Am|Uv|Emf|Bp|If|Rf|Hr|Dna)\b/g, match => match.toUpperCase());
  const formatConditionItem = item => {
    if (typeof item !== 'object' || item == null) return String(item);
    const name = item.name || item.condition || item.text || '';
    const details = [];
    if (item.severity) details.push(item.severity);
    if (item.since) details.push(`since ${item.since}`);
    if (item.variant) details.push(item.variant);
    if (item.genotype) details.push(item.genotype);
    if (item.note) details.push(item.note);
    return [name, details.length ? `(${details.join(', ')})` : ''].filter(Boolean).join(' ');
  };
  const formatFamilyHistoryItem = item => {
    if (typeof item !== 'object' || item == null) return String(item);
    const relative = item.relative ? humanizeContextKey(item.relative) : 'Family';
    const details = [];
    if (item.onsetAge != null && item.onsetAge !== '') details.push(`onset ${item.onsetAge}`);
    if (item.note) details.push(item.note);
    return `${relative}: ${item.condition || 'Condition not specified'}${details.length ? ` (${details.join(', ')})` : ''}`;
  };
  const formatObjectItem = item => {
    if (typeof item !== 'object' || item == null) return String(item);
    if (item.relative || item.condition) return formatFamilyHistoryItem(item);
    if (item.name || item.severity || item.since) return formatConditionItem(item);
    const parts = [];
    for (const [key, value] of Object.entries(item)) {
      if (value == null || value === '') continue;
      parts.push(`${humanizeContextKey(key)}: ${formatContextValue(key, value)}`);
    }
    return parts.join('; ');
  };
  const formatContextValue = (key, value) => {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) {
      const items = value.map(item => {
        if (key === 'familyHistory') return formatFamilyHistoryItem(item);
        if (key === 'conditions') return formatConditionItem(item);
        return typeof item === 'object' ? formatObjectItem(item) : String(item);
      }).filter(Boolean);
      return items.join('; ');
    }
    if (typeof value === 'object') return formatObjectItem(value);
    return String(value);
  };
  const fmtCtx = obj => {
    if (typeof obj === 'string') return obj;
    const parts = [];
    for (const [k, v] of Object.entries(obj)) {
      if (v == null || k === 'note') continue;
      const formatted = formatContextValue(k, v);
      if (formatted) parts.push(`${humanizeContextKey(k)}: ${formatted}`);
    }
    if (obj.note) parts.push(`Note: ${obj.note}`);
    return parts.join('\n');
  };
  if (state.importedData.diagnoses) contextSections.push({ title: 'Medical History', text: fmtCtx(state.importedData.diagnoses) });
  if (state.importedData.diet) contextSections.push({ title: 'Diet & Digestion', text: fmtCtx(state.importedData.diet) });
  if (state.importedData.exercise) contextSections.push({ title: 'Exercise & Movement', text: fmtCtx(state.importedData.exercise) });
  if (state.importedData.sleepRest) contextSections.push({ title: 'Sleep & Rest', text: fmtCtx(state.importedData.sleepRest) });
  if (state.importedData.lightCircadian) contextSections.push({ title: 'Light & Circadian', text: fmtCtx(state.importedData.lightCircadian) });
  if (state.importedData.stress) contextSections.push({ title: 'Stress', text: fmtCtx(state.importedData.stress) });
  if (state.importedData.loveLife) contextSections.push({ title: 'Love Life & Relationships', text: fmtCtx(state.importedData.loveLife) });
  if (state.importedData.environment) contextSections.push({ title: 'Environment', text: fmtCtx(state.importedData.environment) });
  if (state.importedData.interpretiveLens) contextSections.push({ title: 'Interpretive Lens', text: state.importedData.interpretiveLens });
  if (state.importedData.contextNotes) contextSections.push({ title: 'Additional Notes', text: state.importedData.contextNotes });
  const hg = state.importedData.healthGoals || [];
  if (hg.length) {
    const goalsText = hg.map(g => `[${g.severity}] ${g.text}`).join('\n');
    contextSections.push({ title: 'Health Goals', text: goalsText });
  }
  const mc = state.importedData.menstrualCycle;
  if (mc && state.profileSex === 'female') {
    const regLabel = mc.regularity === 'very_irregular' ? 'very irregular' : mc.regularity || 'regular';
    let cycleText = `${mc.cycleLength || 28}-day cycle, ${regLabel}, ${mc.flow || 'moderate'} flow`;
    if (mc.contraceptive) cycleText += `. Contraceptive: ${mc.contraceptive}`;
    if (mc.conditions) cycleText += `. Conditions: ${mc.conditions}`;
    const phases = getBloodDrawPhases(mc, data.dates);
    const phaseDates = Object.entries(phases);
    if (phaseDates.length > 0) {
      cycleText += '\n\nBlood draw phases:\n' + phaseDates.map(([d, p]) => `${d}: Day ${p.cycleDay} (${p.phaseName})`).join('\n');
    }
    contextSections.push({ title: 'Menstrual Cycle', text: cycleText });
  }
  const pBio = state.importedData.biometrics;
  const pHeight = window.getProfileHeight ? window.getProfileHeight(state.currentProfile) : { height: null };
  // Fallback to the wearable summary when legacy biometrics arrays are empty -
  // wearable-only users (manual via Edit Client retired in Phase 4 + OAuth
  // sources) carry weight/BP/pulse only inside wearableSummary.metrics.
  const wm = state.importedData?.wearableSummary?.metrics;
  if (pBio || pHeight?.height || wm) {
    let bioText = '';
    if (pHeight?.height) bioText += `Height: ${pHeight.height} cm\n`;
    if (pBio?.weight?.length) {
      const latest = [...pBio.weight].sort((a, b) => b.date.localeCompare(a.date))[0];
      bioText += `Latest weight: ${latest.value} ${latest.unit} (${latest.date})\n`;
    } else if (typeof wm?.weight?.latest === 'number') {
      bioText += `Latest weight: ${wm.weight.latest} kg (${wm.weight.latestDate || '-'})\n`;
    }
    if (pBio?.bp?.length) {
      const latest = [...pBio.bp].sort((a, b) => b.date.localeCompare(a.date))[0];
      bioText += `Latest BP: ${latest.sys}/${latest.dia} mmHg (${latest.date})\n`;
    } else if (typeof wm?.bp_systolic?.latest === 'number' && typeof wm?.bp_diastolic?.latest === 'number') {
      bioText += `Latest BP: ${wm.bp_systolic.latest}/${wm.bp_diastolic.latest} mmHg (${wm.bp_systolic.latestDate || '-'})\n`;
    }
    if (pBio?.pulse?.length) {
      const latest = [...pBio.pulse].sort((a, b) => b.date.localeCompare(a.date))[0];
      bioText += `Latest pulse: ${latest.value} bpm (${latest.date})\n`;
    } else if (typeof wm?.rhr?.latest === 'number') {
      bioText += `Latest resting HR: ${wm.rhr.latest} bpm (${wm.rhr.latestDate || '-'})\n`;
    }
    if (bioText) contextSections.push({ title: 'Biometrics', text: bioText.trim() });
  }
  return contextSections.filter(section => String(section.text || '').trim());
}

export function exportPDFReport(options = {}) {
  const reportOptions = normalizeReportOptions(options);
  const rawData = getActiveData();
  let data = filterDataByReportRange(rawData, reportOptions.dateRange);
  data = filterReportCategories(data, reportOptions.categoryKeys);
  const profiles = getProfiles();
  const profileName = (profiles.find(p => p.id === state.currentProfile) || { name: 'Profile' }).name;
  const sexLabel = state.profileSex === 'female' ? 'Female' : state.profileSex === 'male' ? 'Male' : 'Not specified';
  const flags = getAllFlaggedMarkers(data);
  const notes = getReportNotes(data, reportOptions);
  const supps = state.importedData.supplements || [];
  const contextSections = buildReportContextSections(data);

  const html = buildReportHTML(profileName, sexLabel, data, flags, notes, supps, contextSections, reportOptions);
  const win = window.open('', '_blank');
  if (!win) { showNotification('Pop-up blocked - please allow pop-ups for this site', 'error'); return false; }
  win.document.write(html);
  win.document.close();
  showNotification('Opening PDF preview...', 'info', 2000);
  setTimeout(() => win.print(), 600);
  return true;
}

export function buildReportHTML(profileName, sexLabel, data, flags, notes, supps, contextSections, options = {}) {
  const reportOptions = normalizeReportOptions(options);
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const unitLabel = state.unitSystem === 'US' ? 'US (conventional)' : 'EU (SI)';
  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fullDateLabels = data.dates.map(d => fmtDate(d));
  const dateRange = fullDateLabels.length > 0
    ? `${fullDateLabels[0]} \u2013 ${fullDateLabels[fullDateLabels.length - 1]}`
    : 'No dates';
  const trendItems = buildTrendItems();
  const reportStats = buildReportStats();

  let body = '';

  // Header
  body += `<div class="report-header">
    <div class="report-brand">getbased</div>
    <h1>Lab Report</h1>
    <div class="report-meta">
      <span><strong>Profile:</strong> ${esc(profileName)}</span>
      <span><strong>Report:</strong> ${esc(reportOptions.presetLabel)}</span>
      <span><strong>Sex:</strong> ${sexLabel}</span>
      <span><strong>Units:</strong> ${unitLabel}</span>
      <span><strong>Date range:</strong> ${esc(dateRange)}</span>
      <span><strong>Generated:</strong> ${now}</span>
    </div>
  </div>`;

  body += `<div class="report-overview" aria-label="Report overview">
    <div class="report-stat">
      <span class="report-stat-label">Flagged</span>
      <strong class="report-stat-value">${flags.length}</strong>
      <span class="report-stat-note">out-of-range result${flags.length === 1 ? '' : 's'}</span>
    </div>
    <div class="report-stat">
      <span class="report-stat-label">Markers</span>
      <strong class="report-stat-value">${reportStats.totalWithData}</strong>
      <span class="report-stat-note">${reportStats.totalInRange} in ${state.rangeMode === 'reference' ? 'reference' : 'optimal'} range</span>
    </div>
    <div class="report-stat">
      <span class="report-stat-label">Collections</span>
      <strong class="report-stat-value">${data.dates.length}</strong>
      <span class="report-stat-note">${esc(dateRange)}</span>
    </div>
    <div class="report-stat">
      <span class="report-stat-label">Categories</span>
      <strong class="report-stat-value">${reportStats.categoryCount}</strong>
      <span class="report-stat-note">with lab data</span>
    </div>
  </div>`;

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
    for (const [catKey, cat] of Object.entries(data.categories)) {
      const markersWithData = Object.entries(cat.markers).filter(([_, m]) => m.values && m.values.some(v => v !== null));
      if (markersWithData.length === 0) continue;
      const labels = cat.singleDate ? [cat.singleDateLabel || 'N/A'] : fullDateLabels;
      body += `<h2>${esc(cat.label)}</h2><table><thead><tr><th>Biomarker</th><th>Unit</th><th>Reference</th>`;
      if (cat.singleDate) {
        body += `<th>${labels[0]}</th>`;
      } else {
        for (const l of labels) body += `<th>${l}</th>`;
      }
      body += `<th>Trend</th></tr></thead><tbody>`;
      for (const [mKey, marker] of markersWithData) {
        const r = getEffectiveRange(marker);
        const trend = getTrend(marker.values, r.min, r.max);
        let rangeStr = r.min != null && r.max != null ? `${formatValue(r.min)} \u2013 ${formatValue(r.max)}` : '\u2014';
        if (state.rangeMode === 'both' && marker.optimalMin != null) {
          rangeStr = `${formatValue(marker.refMin)} \u2013 ${formatValue(marker.refMax)}<br><span class="optimal">opt: ${formatValue(marker.optimalMin)} \u2013 ${formatValue(marker.optimalMax)}</span>`;
        }
        body += `<tr><td>${esc(marker.name)}</td><td class="muted">${esc(marker.unit)}</td><td class="muted">${rangeStr}</td>`;
        for (let i = 0; i < marker.values.length; i++) {
          const v = marker.values[i];
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
    body += `<h2>Supplements & Medications</h2><table><thead><tr><th>Name</th><th>Dosage</th><th>Type</th><th>Period</th><th>Note</th></tr></thead><tbody>`;
    for (const s of supps) {
      const pds = (s.periods && s.periods.length > 0) ? s.periods : [{ start: s.startDate, end: s.endDate }];
      const periodStr = pds.map(p => `${fmtDate(p.start)} \u2192 ${p.end ? fmtDate(p.end) : 'ongoing'}`).join('<br>');
      body += `<tr><td>${esc(s.name)}</td><td>${esc(s.dosage || '\u2014')}</td><td>${s.type}</td>
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
  const genetics = state.importedData.genetics;
  const snpTable = window._snpTableCache;
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

  function buildTrendItems() {
    const items = [];
    for (const cat of Object.values(data.categories)) {
      for (const marker of Object.values(cat.markers)) {
        const nonNull = marker.values.map((v,i) => ({v,i})).filter(x => x.v !== null);
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

  function buildReportStats() {
    let totalWithData = 0, totalInRange = 0, categoryCount = 0;
    for (const cat of Object.values(data.categories)) {
      let categoryHasData = false;
      for (const marker of Object.values(cat.markers)) {
        const li = getLatestValueIndex(marker.values);
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

    summary += `<p class="report-copy"><strong>Within ${state.rangeMode === 'reference' ? 'Reference' : 'Optimal'} Range:</strong> ${reportStats.totalInRange} of ${reportStats.totalWithData} markers with data</p>`;

    if (reportIncludes(reportOptions, 'supplements') && supps.length > 0) {
      const suppList = supps.map(s => `${esc(s.name)}${s.dosage ? ' (' + esc(s.dosage) + ')' : ''}`).join(', ');
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
  .report-header { border-bottom: 2px solid #111827; padding-bottom: 16px; margin-bottom: 18px; }
  .report-brand { color: #4b5563; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .report-header h1 { font-size: 30px; font-weight: 750; letter-spacing: -0.01em; margin-top: 4px; }
  .report-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px 18px; font-size: 13px; color: #4b5563; margin-top: 10px; }
  .report-overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0 0 24px; }
  .report-stat { border: 1px solid #d8e0ea; background: #f8fafc; padding: 10px 12px; min-height: 88px; break-inside: avoid; page-break-inside: avoid; }
  .report-stat-label { display: block; color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .report-stat-value { display: block; color: #111827; font-size: 24px; line-height: 1.15; margin-top: 6px; }
  .report-stat-note { display: block; color: #475569; font-size: 11px; line-height: 1.35; margin-top: 4px; }
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
    .report-overview { grid-template-columns: repeat(4, 1fr); }
    h2 { page-break-after: avoid; }
    table { page-break-inside: auto; }
    th { font-size: 9px; padding: 6px 7px; }
    td { font-size: 10px; padding: 5px 7px; }
    tr { page-break-inside: avoid; }
    .report-footer { break-inside: avoid; page-break-inside: avoid; }
  }
  @media (max-width: 720px) {
    body { padding: 20px; }
    .report-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .context-grid { grid-template-columns: 1fr; }
  }
</style></head><body>${body}</body></html>`;
}

function reportBuilderActionAttrs(action, attrs = {}) {
  const extraAttrs = Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => ` data-report-${name}="${escapeAttr(String(value))}"`)
    .join('');
  return `data-report-action="${escapeAttr(action)}"${extraAttrs}`;
}

function getReportCategoryOptions(data = getActiveData()) {
  const flags = getAllFlaggedMarkers(data);
  const flagCounts = new Map();
  for (const flag of flags) {
    flagCounts.set(flag.categoryKey, (flagCounts.get(flag.categoryKey) || 0) + 1);
  }
  return Object.entries(data.categories || {}).map(([key, cat]) => {
    const markers = Object.values(cat.markers || {}).filter(marker => !marker.hidden);
    const markerCount = markers.filter(marker => marker.values?.some(value => value !== null)).length;
    if (markerCount === 0) return null;
    return {
      key,
      label: cat.label || key,
      icon: cat.icon || '',
      markerCount,
      flaggedCount: flagCounts.get(key) || 0,
    };
  }).filter(Boolean);
}

function getDefaultReportCategoryKeys(presetId, categoryOptions) {
  const preset = getReportPreset(presetId);
  if (preset.categoryMode === 'priority') {
    const flagged = categoryOptions.filter(option => option.flaggedCount > 0);
    if (flagged.length > 0) return flagged.map(option => option.key);
  }
  return categoryOptions.map(option => option.key);
}

function renderReportPresetButton(presetId, activePresetId) {
  const preset = getReportPreset(presetId);
  const isActive = presetId === activePresetId;
  return `<button type="button" class="report-preset-btn${isActive ? ' active' : ''}" ${reportBuilderActionAttrs('set-preset', { preset: presetId })} aria-pressed="${isActive}">
    <span class="report-preset-title">${escapeHTML(preset.label)}</span>
    <span class="report-preset-meta">${escapeHTML(preset.subtitle)}</span>
  </button>`;
}

function renderReportSectionChecks(preset) {
  const selected = new Set(preset.sections);
  return REPORT_SECTION_DEFS.map(section => `<label class="report-builder-check">
    <input type="checkbox" data-report-section="${escapeAttr(section.id)}" ${selected.has(section.id) ? 'checked' : ''}>
    <span>${escapeHTML(section.label)}</span>
  </label>`).join('');
}

function renderReportCategoryChecks(categoryOptions, selectedCategoryKeys) {
  const selected = new Set(selectedCategoryKeys);
  if (categoryOptions.length === 0) {
    return `<div class="report-builder-empty">No lab categories with data.</div>`;
  }
  return categoryOptions.map(option => {
    const checked = selected.has(option.key);
    const flagText = option.flaggedCount > 0 ? `${option.flaggedCount} flagged` : `${option.markerCount} markers`;
    return `<label class="report-category-row">
      <input type="checkbox" data-report-category="${escapeAttr(option.key)}" data-report-priority="${option.flaggedCount > 0 ? 'true' : 'false'}" ${checked ? 'checked' : ''}>
      <span class="report-category-copy">
        <span class="report-category-title">${escapeHTML(option.icon)} ${escapeHTML(option.label)}</span>
        <span class="report-category-meta">${escapeHTML(flagText)}</span>
      </span>
    </label>`;
  }).join('');
}

function renderReportBuilder(presetId = DEFAULT_REPORT_PRESET) {
  const preset = getReportPreset(presetId);
  const rawData = getActiveData();
  const categoryOptions = getReportCategoryOptions(rawData);
  const selectedCategoryKeys = getDefaultReportCategoryKeys(presetId, categoryOptions);
  const presetButtons = Object.keys(REPORT_PRESETS)
    .map(id => renderReportPresetButton(id, presetId))
    .join('');
  const dateOptions = REPORT_DATE_RANGE_OPTIONS.map(option =>
    `<option value="${escapeAttr(option.value)}" ${preset.dateRange === option.value ? 'selected' : ''}>${escapeHTML(option.label)}</option>`
  ).join('');

  return `<div class="modal-overlay show" id="${REPORT_BUILDER_OVERLAY_ID}" data-report-builder-overlay data-report-preset="${escapeAttr(presetId)}">
    <div class="modal show gb-form-modal report-builder-modal" role="dialog" aria-modal="true" aria-labelledby="report-builder-title">
      <div class="gb-modal-head">
        <div>
          <div class="gb-modal-kicker">Export</div>
          <div class="gb-modal-title" id="report-builder-title">Reports</div>
        </div>
        <button type="button" class="modal-close" aria-label="Close" ${reportBuilderActionAttrs('close')}>&times;</button>
      </div>
      <div class="gb-form-body report-builder-body">
        <div class="report-builder-section">
          <div class="report-builder-label">Report type</div>
          <div class="report-preset-grid">${presetButtons}</div>
        </div>
        <div class="report-builder-section report-builder-two-col">
          <label class="report-builder-field" for="report-date-range">
            <span class="report-builder-label">Date range</span>
            <select id="report-date-range" class="report-builder-select">${dateOptions}</select>
          </label>
          <div class="report-builder-field">
            <span class="report-builder-label">Sections</span>
            <div class="report-section-grid">${renderReportSectionChecks(preset)}</div>
          </div>
        </div>
        <div class="report-builder-section">
          <div class="report-builder-row-head">
            <div class="report-builder-label">Lab categories</div>
            <div class="report-category-actions">
              <button type="button" class="report-mini-btn" ${reportBuilderActionAttrs('select-all-categories')}>All</button>
              <button type="button" class="report-mini-btn" ${reportBuilderActionAttrs('select-priority-categories')}>Priority</button>
              <button type="button" class="report-mini-btn" ${reportBuilderActionAttrs('clear-categories')}>Clear</button>
            </div>
          </div>
          <div class="report-category-list">${renderReportCategoryChecks(categoryOptions, selectedCategoryKeys)}</div>
        </div>
        <div class="gb-form-actions report-builder-actions">
          <button type="button" class="import-btn import-btn-secondary" ${reportBuilderActionAttrs('close')}>Cancel</button>
          <button type="button" class="import-btn" ${reportBuilderActionAttrs('export')}>Preview PDF</button>
        </div>
      </div>
    </div>
  </div>`;
}

function collectReportBuilderOptions(overlay) {
  return {
    preset: overlay.dataset.reportPreset || DEFAULT_REPORT_PRESET,
    dateRange: overlay.querySelector('#report-date-range')?.value || 'current',
    sections: Array.from(overlay.querySelectorAll('input[data-report-section]:checked'))
      .map(input => input.dataset.reportSection),
    categoryKeys: Array.from(overlay.querySelectorAll('input[data-report-category]:checked'))
      .map(input => input.dataset.reportCategory),
  };
}

function setReportCategoryChecks(overlay, mode) {
  const boxes = Array.from(overlay.querySelectorAll('input[data-report-category]'));
  if (mode === 'clear') {
    boxes.forEach(box => { box.checked = false; });
    return;
  }
  if (mode === 'priority') {
    const hasPriority = boxes.some(box => box.dataset.reportPriority === 'true');
    boxes.forEach(box => { box.checked = hasPriority ? box.dataset.reportPriority === 'true' : true; });
    return;
  }
  boxes.forEach(box => { box.checked = true; });
}

function handleReportBuilderClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  const actionEl = target?.closest('[data-report-action]');
  const overlay = actionEl?.closest(`#${REPORT_BUILDER_OVERLAY_ID}`);
  if (!actionEl || !overlay) return;
  const action = actionEl.dataset.reportAction;
  if (action === 'close') {
    closeReportBuilder();
  } else if (action === 'set-preset') {
    openReportBuilder(actionEl.dataset.reportPreset || DEFAULT_REPORT_PRESET);
  } else if (action === 'select-all-categories') {
    setReportCategoryChecks(overlay, 'all');
  } else if (action === 'select-priority-categories') {
    setReportCategoryChecks(overlay, 'priority');
  } else if (action === 'clear-categories') {
    setReportCategoryChecks(overlay, 'clear');
  } else if (action === 'export') {
    const options = collectReportBuilderOptions(overlay);
    const hasCategories = overlay.querySelectorAll('input[data-report-category]').length > 0;
    const hasLabSection = options.sections.some(section => REPORT_LAB_SECTION_IDS.includes(section));
    if (options.sections.length === 0) {
      showNotification('Choose at least one report section', 'error');
    } else if (hasLabSection && hasCategories && options.categoryKeys.length === 0) {
      showNotification('Choose at least one lab category or turn off lab sections', 'error');
    } else if (exportPDFReport(options)) {
      closeReportBuilder();
    }
  } else {
    return;
  }
  event.preventDefault();
}

function installReportBuilderDelegates() {
  if (reportBuilderDelegatesInstalled || typeof document === 'undefined') return;
  reportBuilderDelegatesInstalled = true;
  document.addEventListener('click', handleReportBuilderClick);
}

export function openReportBuilder(presetId = DEFAULT_REPORT_PRESET) {
  if (typeof document === 'undefined') return;
  const normalizedPresetId = REPORT_PRESETS[presetId] ? presetId : DEFAULT_REPORT_PRESET;
  closeReportBuilder();
  installReportBuilderDelegates();
  document.body.insertAdjacentHTML('beforeend', renderReportBuilder(normalizedPresetId));
  setTimeout(() => document.querySelector(`#${REPORT_BUILDER_OVERLAY_ID} .report-preset-btn.active`)?.focus(), 0);
}

export function closeReportBuilder() {
  document.getElementById(REPORT_BUILDER_OVERLAY_ID)?.remove();
}

// ═══════════════════════════════════════════════
// JSON EXPORT / IMPORT
// ═══════════════════════════════════════════════
// CHAT EXPORT/IMPORT HELPERS
// ═══════════════════════════════════════════════
async function _exportChatData(profileId) {
  const threadsRaw = await encryptedGetItem(`labcharts-${profileId}-chat-threads`);
  let threads;
  try { threads = threadsRaw ? JSON.parse(threadsRaw) : []; } catch { threads = []; }
  if (!threads.length) return null;
  const messages = {};
  for (const t of threads) {
    const raw = await encryptedGetItem(`labcharts-${profileId}-chat-t_${t.id}`);
    try { messages[t.id] = raw ? JSON.parse(raw) : []; } catch { messages[t.id] = []; }
  }
  const personality = localStorage.getItem(`labcharts-${profileId}-chatPersonality`) || null;
  const customRaw = localStorage.getItem(`labcharts-${profileId}-chatPersonalityCustom`) || null;
  let customPersonalities;
  try { customPersonalities = customRaw ? JSON.parse(customRaw) : null; } catch { customPersonalities = null; }
  return { threads, messages, personality, customPersonalities };
}

async function _importChatData(profileId, chat) {
  if (!chat || !Array.isArray(chat.threads)) return;
  // Read existing threads to merge
  let existingRaw;
  if (getEncryptionEnabled()) {
    try { existingRaw = await encryptedGetItem(`labcharts-${profileId}-chat-threads`); } catch { existingRaw = null; }
  } else {
    existingRaw = localStorage.getItem(`labcharts-${profileId}-chat-threads`);
  }
  let existing;
  try { existing = existingRaw ? JSON.parse(existingRaw) : []; } catch { existing = []; }
  const existingIds = new Set(existing.map(t => t.id));
  for (const t of chat.threads) {
    if (existingIds.has(t.id)) continue;
    existing.push(t);
    // Write thread messages
    const msgs = (chat.messages && chat.messages[t.id]) || [];
    const value = JSON.stringify(msgs);
    if (getEncryptionEnabled()) { await encryptedSetItem(`labcharts-${profileId}-chat-t_${t.id}`, value); }
    else { localStorage.setItem(`labcharts-${profileId}-chat-t_${t.id}`, value); }
  }
  const threadsJson = JSON.stringify(existing);
  if (getEncryptionEnabled()) { await encryptedSetItem(`labcharts-${profileId}-chat-threads`, threadsJson); }
  else { localStorage.setItem(`labcharts-${profileId}-chat-threads`, threadsJson); }
  // Restore personality + custom personas (only if not already set)
  if (chat.personality && !localStorage.getItem(`labcharts-${profileId}-chatPersonality`)) {
    localStorage.setItem(`labcharts-${profileId}-chatPersonality`, chat.personality);
  }
  if (chat.customPersonalities && !localStorage.getItem(`labcharts-${profileId}-chatPersonalityCustom`)) {
    localStorage.setItem(`labcharts-${profileId}-chatPersonalityCustom`, JSON.stringify(chat.customPersonalities));
  }
}

// ═══════════════════════════════════════════════
// Legacy alias — calls exportClientJSON for the active profile
export function exportDataJSON() {
  exportClientJSON(state.currentProfile);
}

export async function exportClientJSON(profileId, includeChat = false) {
  const profiles = getProfiles();
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) { showNotification('Profile not found', 'error'); return; }
  const raw = await encryptedGetItem(profileStorageKey(profileId, 'imported'));
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!data || !data.entries || data.entries.length === 0) { showNotification('No data to export for this client', 'error'); return; }
  const exportObj = {
    version: 2, exportedAt: new Date().toISOString(),
    profile: { name: profile.name, sex: profile.sex || null, dob: profile.dob || null, location: profile.location || null, tags: profile.tags || [], notes: profile.notes || '', status: profile.status || 'active', avatar: profile.avatar || null, pinned: profile.pinned || false, height: profile.height || null, heightUnit: profile.heightUnit || 'cm' },
    entries: data.entries || [], notes: data.notes || [], supplements: data.supplements || [],
    diagnoses: data.diagnoses || null, diet: data.diet || null, exercise: data.exercise || null,
    sleepRest: data.sleepRest || null, lightCircadian: data.lightCircadian || null,
    stress: data.stress || null, loveLife: data.loveLife || null, environment: data.environment || null,
    interpretiveLens: data.interpretiveLens || '', contextNotes: data.contextNotes || '',
    healthGoals: data.healthGoals || [], customMarkers: data.customMarkers || {},
    refOverrides: data.refOverrides || {},
    categoryLabels: data.categoryLabels || null,
    categoryIcons: data.categoryIcons || null,
    markerLabels: data.markerLabels || null,
    menstrualCycle: data.menstrualCycle || null,
    emfAssessment: data.emfAssessment || null,
    genetics: data.genetics || null,
    biometrics: data.biometrics || null,
    markerNotes: data.markerNotes || {},
    markerValueNotes: data.markerValueNotes || {},
    manualValues: data.manualValues || {},
    changeHistory: data.changeHistory || [],
    chatSummaries: data.chatSummaries || [],
    // Wearable layer (added v1.27.1). Only the synced surfaces — L2 summary
    // + user preferences. Raw L1 IDB rows are deliberately excluded; they
    // stay per-device. OAuth tokens are stripped via the same path the
    // Evolu sync uses (wearableConnections wholesale exclude).
    wearableSummary: data.wearableSummary || null,
    wearableCardOrder: data.wearableCardOrder || null,
    wearablePrimaryOverride: data.wearablePrimaryOverride || null,
    // Light & Sun stack — earlier export schema predated this lens and
    // silently dropped everything on export. importDataJSON learned to
    // restore these fields (v1.6.x); the export side has to ship them
    // for the round-trip to actually work.
    sunSessions: data.sunSessions || [],
    deviceSessions: data.deviceSessions || [],
    lightDevices: data.lightDevices || [],
    lightAudits: data.lightAudits || [],
    lightMeasurements: data.lightMeasurements || [],
    lightEnvironment: data.lightEnvironment || null,
    sunDefaults: data.sunDefaults || null,
    sunCorrelations: data.sunCorrelations || null,
    lifelightProfile: data.lifelightProfile || null,
    lightDailyVerdicts: data.lightDailyVerdicts || null,
    channelMixAI: data.channelMixAI || null
  };
  if (includeChat) {
    const chat = await _exportChatData(profileId);
    if (chat) exportObj.chat = chat;
  }
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  a.download = `getbased-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showNotification(`Exported "${profile.name}"`, 'success');
}

export async function buildAllDataBundle() {
  const profiles = getProfiles();
  if (profiles.length === 0) return null;
  const bundle = { version: 2, type: 'database', exportedAt: new Date().toISOString(), profiles: [] };
  for (const p of profiles) {
    const raw = await encryptedGetItem(profileStorageKey(p.id, 'imported'));
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
    const chat = await _exportChatData(p.id);
    const entry = {
      id: p.id, name: p.name, sex: p.sex || null, dob: p.dob || null,
      location: p.location || null, tags: p.tags || [], notes: p.notes || '',
      status: p.status || 'active', avatar: p.avatar || null, pinned: p.pinned || false,
      height: p.height || null, heightUnit: p.heightUnit || 'cm',
      data: data
    };
    if (chat) entry.chat = chat;
    bundle.profiles.push(entry);
  }
  // Include Cashu wallet settings (mnemonic excluded for security — restore via seed phrase)
  const walletMintUrl = typeof window.cashuGetMintUrl === 'function' ? await window.cashuGetMintUrl() : null;
  const walletNodeUrl = typeof window.nostrGetSelectedNode === 'function' ? window.nostrGetSelectedNode() : null;
  if (walletMintUrl || walletNodeUrl) {
    bundle.wallet = { mintUrl: walletMintUrl, nodeUrl: walletNodeUrl };
  }
  return JSON.stringify(bundle, null, 2);
}

export async function exportAllDataJSON() {
  const json = await buildAllDataBundle();
  if (!json) { showNotification('No profiles to export', 'error'); return; }
  const bundle = JSON.parse(json);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `getbased-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showNotification(`Exported ${bundle.profiles.length} client${bundle.profiles.length !== 1 ? 's' : ''}`, 'success');
}

export function importDataJSON(file) {
  // Returns a Promise that resolves when the FileReader pipeline finishes
  // (success OR error). Existing fire-and-forget callers (`importDataJSON(file)`)
  // ignore the return value and behave identically; the demo loader awaits
  // it to compute fingerprints against the imported state.
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target.result);
      // Database bundle — multi-profile import
      if (json.type === 'database' && Array.isArray(json.profiles)) {
        await _importDatabaseBundle(json);
        return;
      }
      if (!json.entries || !Array.isArray(json.entries)) {
        showNotification('Invalid JSON format: missing entries array', 'error');
        return;
      }
      // v2 client export with profile metadata — create a new profile
      if (json.profile?.name) {
        const p = json.profile;
        const profileId = createProfile(p.name, {
          sex: p.sex || null, dob: p.dob || null,
          location: p.location || null, tags: p.tags || [],
          avatar: p.avatar || null,
          height: p.height || null, heightUnit: p.heightUnit || 'cm'
        });
        await loadProfile(profileId);
      }
      let count = 0;
      const importTs = Date.now();
      for (const entry of json.entries) {
        if (!entry.date || !entry.markers) continue;
        // Earlier draft did `filter(ex => ex.date !== entry.date)` — same-
        // date entries clobbered each other. The demos legitimately ship
        // two entries per date (comprehensive panel + specialty add-on
        // like an OmegaQuant fatty-acid run on the same draw day) and the
        // second entry was silently dropped, losing every fatty-acid /
        // specialty marker on import. Merge markers + markerSources
        // instead so all data lands; later entries win on key conflicts.
        const existing = findOrCreateLabEntry(state.importedData, entry.date, { now: importTs });
        for (const [key, value] of Object.entries(entry.markers)) {
          const source = entry.markerSources?.[key]
            ? { ...entry.markerSources[key] }
            : null;
          setLabEntryMarker(existing, key, value, {
            now: importTs,
            mirrorInsulin: true,
            ...(source ? { source } : {}),
          });
        }
        if (entry.file && !existing.file) existing.file = entry.file;
        if (entry.sourceFile && !existing.sourceFile) existing.sourceFile = entry.sourceFile;
        if (Array.isArray(entry.sourceFiles)) {
          existing.sourceFiles = Array.from(new Set([...(existing.sourceFiles || []), ...entry.sourceFiles]));
        }
        if (entry.importedWith && !existing.importedWith) existing.importedWith = entry.importedWith;
        if (entry.importHash && !existing.importHash) existing.importHash = entry.importHash;
        count++;
      }
      if (count === 0 && (!json.notes || json.notes.length === 0)) { showNotification('No valid entries found in JSON', 'error'); return; }
      // Import context fields — handle both old string format (v1) and new object format (v2)
      function importContextField(field) {
        const val = json[field];
        if (!val) return;
        if (typeof val === 'object' && val !== null) {
          // v2 structured format — use directly
          state.importedData[field] = val;
        } else if (typeof val === 'string' && val.trim()) {
          // v1 legacy string — migrate to structured with note
          const migrations = {
            diagnoses: { conditions: [], note: val.trim() },
            diet: { type: null, restrictions: [], pattern: null, note: val.trim() },
            exercise: { frequency: null, types: [], intensity: null, dailyMovement: null, note: val.trim() },
            sleepRest: { duration: null, quality: null, schedule: null, issues: [], note: val.trim() }
          };
          if (migrations[field]) state.importedData[field] = migrations[field];
        }
      }
      importContextField('diagnoses');
      importContextField('diet');
      importContextField('exercise');
      // Import sleep & light/circadian (handle old sleepCircadian, old separate fields, or new split fields)
      if (json.sleepRest) {
        importContextField('sleepRest');
      } else if (json.sleepCircadian) {
        // Migrate old sleepCircadian → sleepRest
        const sc = json.sleepCircadian;
        if (typeof sc === 'object' && sc !== null) {
          const sleepIssues = (sc.issues || []).filter(i => !['blue light blockers', 'morning sunlight'].includes(i));
          const circPractices = (sc.issues || []).filter(i => ['blue light blockers', 'morning sunlight'].includes(i));
          state.importedData.sleepRest = { duration: sc.duration || null, quality: sc.quality || null, schedule: sc.schedule || null, issues: sleepIssues, note: sc.note || '' };
          if (circPractices.length && !state.importedData.lightCircadian) {
            state.importedData.lightCircadian = { practices: circPractices, timing: null, mealTiming: [], note: '' };
          }
        } else if (typeof sc === 'string' && sc.trim()) {
          state.importedData.sleepRest = { duration: null, quality: null, schedule: null, issues: [], note: sc.trim() };
        }
      } else {
        const parts = [json.circadian, json.sleep].filter(s => typeof s === 'string' && s.trim());
        if (parts.length) state.importedData.sleepRest = { duration: null, quality: null, schedule: null, issues: [], note: parts.map(s => s.trim()).join('\n\n') };
      }
      if (json.lightCircadian && typeof json.lightCircadian === 'object') state.importedData.lightCircadian = json.lightCircadian;
      // Import new context fields (v2 only)
      if (json.stress && typeof json.stress === 'object') state.importedData.stress = json.stress;
      if (json.loveLife && typeof json.loveLife === 'object') state.importedData.loveLife = json.loveLife;
      if (json.environment && typeof json.environment === 'object') state.importedData.environment = json.environment;
      if (json.contextNotes && typeof json.contextNotes === 'string') state.importedData.contextNotes = json.contextNotes;
      // Import interpretive lens (new merged field, or migrate old separate fields)
      if (json.interpretiveLens && typeof json.interpretiveLens === 'string' && json.interpretiveLens.trim()) {
        state.importedData.interpretiveLens = json.interpretiveLens.trim();
      } else {
        const parts = [json.fieldExperts, json.fieldLens].filter(s => typeof s === 'string' && s.trim());
        if (parts.length) state.importedData.interpretiveLens = parts.map(s => s.trim()).join('\n\n');
      }
      // Import health goals (merge, deduplicate by text)
      if (json.healthGoals && Array.isArray(json.healthGoals)) {
        const healthGoals = ensureImportedArray(state.importedData, 'healthGoals');
        for (const g of json.healthGoals) {
          if (!g.text || !g.severity) continue;
          const exists = healthGoals.some(x => x.text === g.text);
          if (!exists) appendImportedArrayItem(state.importedData, 'healthGoals', { text: g.text, severity: g.severity });
        }
      }
      // Import custom markers (merge, don't overwrite existing definitions)
      if (json.customMarkers && typeof json.customMarkers === 'object') {
        if (!state.importedData.customMarkers) state.importedData.customMarkers = {};
        for (const [key, def] of Object.entries(json.customMarkers)) {
          if (!state.importedData.customMarkers[key]) {
            state.importedData.customMarkers[key] = def;
          }
        }
      }
      // Import reference range overrides (merge, don't overwrite)
      if (json.refOverrides && typeof json.refOverrides === 'object') {
        if (!state.importedData.refOverrides) state.importedData.refOverrides = {};
        for (const [key, ovr] of Object.entries(json.refOverrides)) {
          if (!state.importedData.refOverrides[key]) state.importedData.refOverrides[key] = ovr;
        }
      }
      // Import category label/icon overrides
      if (json.categoryLabels && typeof json.categoryLabels === 'object') {
        if (!state.importedData.categoryLabels) state.importedData.categoryLabels = {};
        Object.assign(state.importedData.categoryLabels, json.categoryLabels);
      }
      if (json.categoryIcons && typeof json.categoryIcons === 'object') {
        if (!state.importedData.categoryIcons) state.importedData.categoryIcons = {};
        Object.assign(state.importedData.categoryIcons, json.categoryIcons);
      }
      if (json.markerLabels && typeof json.markerLabels === 'object') {
        if (!state.importedData.markerLabels) state.importedData.markerLabels = {};
        Object.assign(state.importedData.markerLabels, json.markerLabels);
      }
      // Import menstrual cycle
      if (json.menstrualCycle && typeof json.menstrualCycle === 'object') {
        if (!state.importedData.menstrualCycle) {
          state.importedData.menstrualCycle = json.menstrualCycle;
        } else {
          // Merge: overwrite profile fields, merge periods by startDate
          const mc = state.importedData.menstrualCycle;
          mc.cycleLength = json.menstrualCycle.cycleLength || mc.cycleLength;
          mc.periodLength = json.menstrualCycle.periodLength || mc.periodLength;
          mc.regularity = json.menstrualCycle.regularity || mc.regularity;
          mc.flow = json.menstrualCycle.flow || mc.flow;
          if (json.menstrualCycle.contraceptive) mc.contraceptive = json.menstrualCycle.contraceptive;
          if (json.menstrualCycle.conditions) mc.conditions = json.menstrualCycle.conditions;
          if (json.menstrualCycle.periods && Array.isArray(json.menstrualCycle.periods)) {
            if (!mc.periods) mc.periods = [];
            for (const p of json.menstrualCycle.periods) {
              if (!p.startDate) continue;
              const exists = mc.periods.some(x => x.startDate === p.startDate);
              if (!exists) mc.periods.push(p);
            }
          }
        }
      }
      // Import EMF assessment
      if (json.emfAssessment && json.emfAssessment.assessments) {
        if (!state.importedData.emfAssessment) {
          state.importedData.emfAssessment = json.emfAssessment;
        } else {
          const existing = state.importedData.emfAssessment.assessments;
          for (const a of json.emfAssessment.assessments) {
            if (!existing.some(x => x.id === a.id)) existing.push(a);
          }
        }
      }
      // Import genetics
      if (json.genetics && (json.genetics.snps || json.genetics.mtdna)) {
        state.importedData.genetics = json.genetics;
      }
      // Import biometrics
      if (json.biometrics && typeof json.biometrics === 'object') {
        if (!state.importedData.biometrics) {
          state.importedData.biometrics = json.biometrics;
        } else {
          for (const metric of ['weight', 'pulse']) {
            if (Array.isArray(json.biometrics[metric])) {
              if (!state.importedData.biometrics[metric]) state.importedData.biometrics[metric] = [];
              for (const e of json.biometrics[metric]) {
                if (!e.date) continue;
                if (!state.importedData.biometrics[metric].some(x => x.date === e.date)) {
                  state.importedData.biometrics[metric].push(e);
                }
              }
              state.importedData.biometrics[metric].sort((a, b) => a.date.localeCompare(b.date));
            }
          }
          if (Array.isArray(json.biometrics.bp)) {
            if (!state.importedData.biometrics.bp) state.importedData.biometrics.bp = [];
            for (const e of json.biometrics.bp) {
              if (!e.date) continue;
              if (!state.importedData.biometrics.bp.some(x => x.date === e.date)) {
                state.importedData.biometrics.bp.push(e);
              }
            }
            state.importedData.biometrics.bp.sort((a, b) => a.date.localeCompare(b.date));
          }
        }
      }
      // Import marker notes
      if (json.markerNotes && typeof json.markerNotes === 'object') {
        if (!state.importedData.markerNotes) state.importedData.markerNotes = {};
        Object.assign(state.importedData.markerNotes, json.markerNotes);
      }
      // Import per-value notes (keyed "category.markerKey:date")
      if (json.markerValueNotes && typeof json.markerValueNotes === 'object') {
        if (!state.importedData.markerValueNotes) state.importedData.markerValueNotes = {};
        Object.assign(state.importedData.markerValueNotes, json.markerValueNotes);
      }
      // Import manual value flags
      if (json.manualValues && typeof json.manualValues === 'object') {
        if (!state.importedData.manualValues) state.importedData.manualValues = {};
        Object.assign(state.importedData.manualValues, json.manualValues);
      }
      // Import Light & Sun stack (added v1.6.x; was missing from importDataJSON
      // entirely so demo + JSON imports silently dropped sun sessions, devices,
      // rooms, audits, measurements, sunDefaults, lightDailyVerdicts). Merge
      // semantics chosen to match other arrays here: id-keyed dedup for arrays,
      // first-write-wins for singletons so an in-progress profile keeps its
      // own setup over a re-import that lacks it.
      function _mergeArrayById(field) {
        if (!Array.isArray(json[field])) return;
        if (!Array.isArray(state.importedData[field])) state.importedData[field] = [];
        const known = new Set(state.importedData[field].map(x => x?.id).filter(Boolean));
        for (const item of json[field]) {
          if (!item || typeof item !== 'object') continue;
          if (item.id && known.has(item.id)) continue;
          state.importedData[field].push(item);
          if (item.id) known.add(item.id);
        }
      }
      _mergeArrayById('sunSessions');
      _mergeArrayById('deviceSessions');
      _mergeArrayById('lightDevices');
      _mergeArrayById('lightAudits');
      _mergeArrayById('lightMeasurements');
      // lightEnvironment is an object with `rooms` + `screens` + `burdenAI`.
      // Merge rooms/screens by id like the arrays above; burdenAI is a
      // singleton AI verdict — replace.
      if (json.lightEnvironment && typeof json.lightEnvironment === 'object') {
        if (!state.importedData.lightEnvironment) state.importedData.lightEnvironment = { rooms: [], screens: [] };
        for (const sub of ['rooms', 'screens']) {
          if (!Array.isArray(json.lightEnvironment[sub])) continue;
          if (!Array.isArray(state.importedData.lightEnvironment[sub])) state.importedData.lightEnvironment[sub] = [];
          const known = new Set(state.importedData.lightEnvironment[sub].map(x => x?.id).filter(Boolean));
          for (const item of json.lightEnvironment[sub]) {
            if (!item || typeof item !== 'object') continue;
            if (item.id && known.has(item.id)) continue;
            state.importedData.lightEnvironment[sub].push(item);
            if (item.id) known.add(item.id);
          }
        }
        if (json.lightEnvironment.burdenAI) state.importedData.lightEnvironment.burdenAI = json.lightEnvironment.burdenAI;
      }
      // Singletons — first-write-wins; re-importing a demo over an in-progress
      // profile keeps the user's own Light setup answers + correlations.
      for (const sk of ['sunDefaults', 'sunCorrelations', 'lifelightProfile']) {
        if (json[sk] && typeof json[sk] === 'object' && !state.importedData[sk]) {
          state.importedData[sk] = json[sk];
        }
      }
      // lightDailyVerdicts is a map keyed by ISO date — merge per-key.
      if (json.lightDailyVerdicts && typeof json.lightDailyVerdicts === 'object') {
        if (!state.importedData.lightDailyVerdicts) state.importedData.lightDailyVerdicts = {};
        for (const [date, verdict] of Object.entries(json.lightDailyVerdicts)) {
          if (!state.importedData.lightDailyVerdicts[date]) {
            state.importedData.lightDailyVerdicts[date] = verdict;
          }
        }
      }
      // channelMixAI is the singleton AI verdict for "Your light, by what
      // it does". Replace-on-import (matches lightEnvironment.burdenAI).
      // Without this branch, a demo / round-trip import silently dropped
      // the prefilled verdict — the channel-mix render then saw idle
      // status and auto-fired a real provider call against a freshly
      // loaded demo, defeating the no-API-on-demo guarantee.
      if (json.channelMixAI && typeof json.channelMixAI === 'object') {
        state.importedData.channelMixAI = json.channelMixAI;
      }
      // Import change history (merge by field+date, imported snapshot wins on conflict)
      if (Array.isArray(json.changeHistory)) {
        const changeHistory = ensureImportedArray(state.importedData, 'changeHistory');
        for (const entry of json.changeHistory) {
          if (!entry.field || !entry.date) continue;
          const idx = changeHistory.findIndex(e => e.field === entry.field && e.date === entry.date);
          if (idx >= 0) { replaceImportedArrayItem(state.importedData, 'changeHistory', idx, entry); }
          else { appendImportedArrayItem(state.importedData, 'changeHistory', entry); }
        }
        sortImportedArray(state.importedData, 'changeHistory', (a, b) => a.date.localeCompare(b.date));
        trimImportedArray(state.importedData, 'changeHistory', 200);
      }
      // Import wearable layer (added v1.27.1). The summary, card order, and
      // per-metric override flow in; raw L1 IDB rows do not (they're never
      // exported). On the destination device the strip will render with the
      // imported summary numbers, but the detail-modal chart will be empty
      // until the user re-OAuths each vendor — same shape as Evolu sync.
      if (json.wearableSummary && typeof json.wearableSummary === 'object') {
        state.importedData.wearableSummary = json.wearableSummary;
      }
      if (Array.isArray(json.wearableCardOrder)) {
        state.importedData.wearableCardOrder = json.wearableCardOrder;
      }
      if (json.wearablePrimaryOverride && typeof json.wearablePrimaryOverride === 'object') {
        // Prune entries pointing at sources that don't exist on this device
        // (no IDB rows yet, no connection record). The L2 picker would fall
        // through to auto anyway, but a stale override produces a misleading
        // ✓ in the source picker until the user re-OAuths the missing vendor.
        const liveSources = new Set([
          ...Object.keys(state.importedData?.wearableConnections || {}),
          ...Object.keys(json.wearableSummary?.sources || {}),
        ]);
        const pruned = {};
        for (const [metricId, sourceId] of Object.entries(json.wearablePrimaryOverride)) {
          if (liveSources.has(sourceId)) pruned[metricId] = sourceId;
        }
        state.importedData.wearablePrimaryOverride = pruned;
      }
      // Import chat summaries (merge by threadId)
      if (Array.isArray(json.chatSummaries)) {
        const chatSummaries = ensureImportedArray(state.importedData, 'chatSummaries');
        for (const s of json.chatSummaries) {
          if (!s.threadId) continue;
          const idx = chatSummaries.findIndex(e => e.threadId === s.threadId);
          if (idx >= 0) { replaceImportedArrayItem(state.importedData, 'chatSummaries', idx, s); }
          else { appendImportedArrayItem(state.importedData, 'chatSummaries', s); }
        }
      }
      // Import supplements
      if (json.supplements && Array.isArray(json.supplements)) {
        const supplements = ensureImportedArray(state.importedData, 'supplements');
        for (const s of json.supplements) {
          if (!s.name || !s.startDate) continue;
          const exists = supplements.some(x => x.name === s.name && x.startDate === s.startDate);
          if (!exists) {
            const entry = { name: s.name, dosage: s.dosage || '', startDate: s.startDate, endDate: s.endDate || null, type: s.type || 'supplement', note: s.note || '' };
            if (s.ingredients) entry.ingredients = s.ingredients;
            if (s.periods && s.periods.length > 1) entry.periods = s.periods;
            if (s.sourceUrl) {
              try {
                const sourceUrl = new URL(s.sourceUrl);
                if (sourceUrl.protocol === 'http:' || sourceUrl.protocol === 'https:') entry.sourceUrl = sourceUrl.toString();
              } catch {}
            }
            appendImportedArrayItem(state.importedData, 'supplements', entry);
          }
        }
      }
      // Import notes
      if (json.notes && Array.isArray(json.notes)) {
        const notes = ensureImportedArray(state.importedData, 'notes');
        for (const note of json.notes) {
          if (!note.date || !note.text) continue;
          // Avoid duplicates (same date + same text)
          const exists = notes.some(n => n.date === note.date && n.text === note.text);
          if (!exists) appendImportedArrayItem(state.importedData, 'notes', { date: note.date, text: note.text });
        }
      }
      migrateProfileData(state.importedData);
      saveImportedData();
      if (json.chat) {
        await _importChatData(state.currentProfile, json.chat);
        if (window.loadChatThreads) window.loadChatThreads();
      }
      // Demo-load completion: clear the loading sentinel (dashboard
      // empty-state renderer keys off this flag while data is en route).
      if (window._demoLoadingProfileId === state.currentProfile) {
        delete window._demoLoadingProfileId;
      }
      window.buildSidebar();
      window.updateHeaderDates();
      window.navigate('dashboard');
      const profileMsg = json.profile?.name ? ` into "${json.profile.name}"` : '';
      showNotification(`Imported ${count} date entr${count === 1 ? 'y' : 'ies'}${profileMsg}`, 'success');
    } catch (err) {
      delete window._demoLoadingProfileId;
      showNotification('Error parsing JSON: ' + err.message, 'error');
    } finally {
      resolve();
    }
  };
  reader.readAsText(file);
  });
}

async function _importDatabaseBundle(json) {
  const profiles = getProfiles();
  let created = 0, merged = 0, firstImportedId = null;
  for (const bp of json.profiles) {
    if (!bp.name && !bp.id) continue;
    // Match by id first, then by name
    let existing = profiles.find(p => p.id === bp.id);
    if (!existing && bp.name) existing = profiles.find(p => p.name === bp.name);
    const importData = bp.data || {};
    if (existing) {
      // Merge into existing profile — update metadata from bundle
      if (!firstImportedId) firstImportedId = existing.id;
      const meta = {};
      if (bp.name) meta.name = bp.name;
      if (bp.sex) meta.sex = bp.sex;
      if (bp.dob) meta.dob = bp.dob;
      if (bp.location) meta.location = bp.location;
      if (Array.isArray(bp.tags) && bp.tags.length) meta.tags = bp.tags;
      if (bp.notes) meta.notes = bp.notes;
      if (bp.status && bp.status !== 'active') meta.status = bp.status;
      if (bp.avatar) meta.avatar = bp.avatar;
      if (bp.pinned) meta.pinned = bp.pinned;
      if (bp.height) { meta.height = bp.height; meta.heightUnit = bp.heightUnit || 'cm'; }
      if (Object.keys(meta).length) updateProfileMeta(existing.id, meta);
      const storageKey = profileStorageKey(existing.id, 'imported');
      const raw = await encryptedGetItem(storageKey);
      let current;
      try { current = raw ? JSON.parse(raw) : {}; } catch { current = {}; }
      // Entries: date-keyed upsert
      if (Array.isArray(importData.entries)) {
        const entries = ensureImportedArray(current, 'entries');
        for (const entry of importData.entries) {
          if (!entry.date || !entry.markers) continue;
          const idx = entries.findIndex(ex => ex.date === entry.date);
          if (idx >= 0) { replaceImportedArrayItem(current, 'entries', idx, entry); }
          else { appendImportedArrayItem(current, 'entries', entry); }
        }
      }
      // Notes: deduplicate by date+text
      if (Array.isArray(importData.notes)) {
        const notes = ensureImportedArray(current, 'notes');
        for (const n of importData.notes) {
          if (!n.date || !n.text) continue;
          if (!notes.some(x => x.date === n.date && x.text === n.text)) appendImportedArrayItem(current, 'notes', n);
        }
      }
      // Supplements: deduplicate by name+startDate
      if (Array.isArray(importData.supplements)) {
        const supplements = ensureImportedArray(current, 'supplements');
        for (const s of importData.supplements) {
          if (!s.name || !s.startDate) continue;
          if (!supplements.some(x => x.name === s.name && x.startDate === s.startDate)) appendImportedArrayItem(current, 'supplements', s);
        }
      }
      // Health goals: deduplicate by text
      if (Array.isArray(importData.healthGoals)) {
        const healthGoals = ensureImportedArray(current, 'healthGoals');
        for (const g of importData.healthGoals) {
          if (!g.text) continue;
          if (!healthGoals.some(x => x.text === g.text)) appendImportedArrayItem(current, 'healthGoals', g);
        }
      }
      // Custom markers: merge (don't overwrite existing)
      if (importData.customMarkers && typeof importData.customMarkers === 'object') {
        if (!current.customMarkers) current.customMarkers = {};
        for (const [key, def] of Object.entries(importData.customMarkers)) {
          if (!current.customMarkers[key]) current.customMarkers[key] = def;
        }
      }
      // Ref overrides: merge (don't overwrite existing)
      if (importData.refOverrides && typeof importData.refOverrides === 'object') {
        if (!current.refOverrides) current.refOverrides = {};
        for (const [key, ovr] of Object.entries(importData.refOverrides)) {
          if (!current.refOverrides[key]) current.refOverrides[key] = ovr;
        }
      }
      // Context fields: replace if present in bundle
      for (const field of ['diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress', 'loveLife', 'environment', 'menstrualCycle', 'emfAssessment', 'genetics', 'biometrics']) {
        if (importData[field] != null) current[field] = importData[field];
      }
      if (importData.interpretiveLens) current.interpretiveLens = importData.interpretiveLens;
      if (importData.contextNotes) current.contextNotes = importData.contextNotes;
      // Change history: merge by field+date, imported snapshot wins on conflict
      if (Array.isArray(importData.changeHistory)) {
        const changeHistory = ensureImportedArray(current, 'changeHistory');
        for (const entry of importData.changeHistory) {
          if (!entry.field || !entry.date) continue;
          const idx = changeHistory.findIndex(e => e.field === entry.field && e.date === entry.date);
          if (idx >= 0) { replaceImportedArrayItem(current, 'changeHistory', idx, entry); }
          else { appendImportedArrayItem(current, 'changeHistory', entry); }
        }
        sortImportedArray(current, 'changeHistory', (a, b) => a.date.localeCompare(b.date));
        trimImportedArray(current, 'changeHistory', 200);
      }
      // Chat summaries: merge by threadId
      if (Array.isArray(importData.chatSummaries)) {
        const chatSummaries = ensureImportedArray(current, 'chatSummaries');
        for (const s of importData.chatSummaries) {
          if (!s.threadId) continue;
          const idx = chatSummaries.findIndex(e => e.threadId === s.threadId);
          if (idx >= 0) { replaceImportedArrayItem(current, 'chatSummaries', idx, s); }
          else { appendImportedArrayItem(current, 'chatSummaries', s); }
        }
      }
      // Display overrides: merge labels/icons/manualValues (don't overwrite existing)
      for (const field of ['categoryLabels', 'categoryIcons', 'markerLabels', 'manualValues']) {
        if (importData[field] && typeof importData[field] === 'object') {
          if (!current[field]) current[field] = {};
          for (const [k, v] of Object.entries(importData[field])) {
            if (!current[field][k]) current[field][k] = v;
          }
        }
      }
      // Save
      const value = JSON.stringify(current);
      if (getEncryptionEnabled()) { await encryptedSetItem(storageKey, value); }
      else { localStorage.setItem(storageKey, value); }
      if (bp.chat) await _importChatData(existing.id, bp.chat);
      merged++;
    } else {
      // Create new profile
      const id = createProfile(bp.name || 'Imported', {
        sex: bp.sex || null, dob: bp.dob || null,
        location: bp.location || { country: '', zip: '' },
        tags: bp.tags || [], notes: bp.notes || '',
        status: bp.status || 'active', avatar: bp.avatar || null,
        height: bp.height || null, heightUnit: bp.heightUnit || 'cm'
      });
      if (!firstImportedId) firstImportedId = id;
      if (bp.pinned) updateProfileMeta(id, { pinned: true });
      // Write data
      const storageKey = profileStorageKey(id, 'imported');
      const value = JSON.stringify(importData);
      if (getEncryptionEnabled()) { await encryptedSetItem(storageKey, value); }
      else { localStorage.setItem(storageKey, value); }
      if (bp.chat) await _importChatData(id, bp.chat);
      created++;
    }
  }
  // Switch to the first imported profile (so user lands on real data, not empty default)
  const targetId = firstImportedId || state.currentProfile;
  await loadProfile(targetId);
  // Restore Cashu wallet settings if present (mnemonic not included — user restores via seed phrase)
  if (json.wallet) {
    try {
      if (json.wallet.mnemonic && typeof window.cashuRestoreWalletFromSeed === 'function') {
        await window.cashuRestoreWalletFromSeed(json.wallet.mnemonic); // legacy bundles that included mnemonic
      }
      if (json.wallet.mintUrl && typeof window.cashuSetMintUrl === 'function') await window.cashuSetMintUrl(json.wallet.mintUrl);
      if (json.wallet.nodeUrl && typeof window.nostrSetSelectedNode === 'function') window.nostrSetSelectedNode(json.wallet.nodeUrl);
    } catch (e) {
      if (isDebugMode()) console.log('[import] Wallet restore failed:', e.message);
    }
  }
  const total = created + merged;
  showNotification(`Imported ${total} profile${total !== 1 ? 's' : ''} (${created} new, ${merged} merged)`, 'success');
}

export async function clearAllData() {
  const profiles = getProfiles();
  const msg = profiles.length > 1
    ? `Clear ALL data across ${profiles.length} profiles? This cannot be undone.`
    : 'Are you sure you want to clear all imported data? This cannot be undone.';
  if (await showConfirmDialog(msg)) {
    // Wipe storage for every profile
    for (const p of profiles) {
      const id = p.id;
      // The `-imported` blob lives in IndexedDB now → encryptedRemoveItem
      // hits both backends so the IDB residue is also wiped.
      await encryptedRemoveItem(profileStorageKey(id, 'imported'));
      localStorage.removeItem(profileStorageKey(id, 'units'));
      localStorage.removeItem(profileStorageKey(id, 'suppOverlay'));
      localStorage.removeItem(profileStorageKey(id, 'noteOverlay'));
      localStorage.removeItem(profileStorageKey(id, 'rangeMode'));
      localStorage.removeItem(profileStorageKey(id, 'suppImpact'));
      localStorage.removeItem(`labcharts-${id}-chat`);
      let threadIndexRaw;
      if (getEncryptionEnabled()) {
        try { threadIndexRaw = await encryptedGetItem(`labcharts-${id}-chat-threads`); } catch { threadIndexRaw = null; }
      } else {
        threadIndexRaw = localStorage.getItem(`labcharts-${id}-chat-threads`);
      }
      if (threadIndexRaw) {
        try { for (const t of JSON.parse(threadIndexRaw)) localStorage.removeItem(`labcharts-${id}-chat-t_${t.id}`); } catch {}
        localStorage.removeItem(`labcharts-${id}-chat-threads`);
      }
      localStorage.removeItem(`labcharts-${id}-chatRailOpen`);
      localStorage.removeItem(`labcharts-${id}-chatPersonality`);
      localStorage.removeItem(`labcharts-${id}-chatPersonalityCustom`);
      localStorage.removeItem(`labcharts-${id}-focusCard`);
      localStorage.removeItem(`labcharts-${id}-contextHealth`);
      localStorage.removeItem(`labcharts-${id}-onboarded`);
      localStorage.removeItem(`labcharts-${id}-emptyTour`);
      localStorage.removeItem(`labcharts-${id}-tour`);
      localStorage.removeItem(`labcharts-${id}-cycleTour`);
      localStorage.removeItem(`labcharts-${id}-phaseOverlay`);
      localStorage.removeItem(`labcharts-${id}-sync-ts`);
    }
    // Reset to single default profile
    const defaultId = profiles[0]?.id || 'default';
    const defaultName = profiles[0]?.name || 'Profile 1';
    saveProfiles([{ id: defaultId, name: defaultName, sex: null, dob: null, location: { country: '', zip: '' }, tags: [], notes: '', status: 'active', avatar: null, createdAt: Date.now(), lastUpdated: Date.now(), pinned: false }]);
    state.importedData = { entries: [], notes: [], supplements: [], healthGoals: [], diagnoses: null, diet: null, exercise: null, sleepRest: null, lightCircadian: null, stress: null, loveLife: null, environment: null, interpretiveLens: '', contextNotes: '', customMarkers: {}, refOverrides: {}, menstrualCycle: null, emfAssessment: null, genetics: null, biometrics: null };
    state.currentProfile = defaultId;
    localStorage.setItem('labcharts-active-profile', defaultId);
    // Clear Cashu wallet database
    if (typeof window.cashuDestroyWalletDB === 'function') {
      try { await window.cashuDestroyWalletDB(); } catch {}
    }
    localStorage.removeItem('labcharts-cashu-wallet-mint');
    localStorage.removeItem('labcharts-cashu-wallet-mnemonic');
    localStorage.removeItem('labcharts-routstr-node');
    localStorage.removeItem('labcharts-routstr-key');
    localStorage.removeItem('labcharts-routstr-model');
    localStorage.removeItem('labcharts-routstr-models');
    window.buildSidebar();
    window.updateHeaderDates();
    window.renderProfileButton();
    window.navigate('dashboard');
    showNotification('All data cleared', 'info');
  }
}

export async function loadDemoData(sex = 'male') {
  try {
    const file = sex === 'female' ? 'data/demo-female.json' : 'data/demo-male.json';
    const resp = await fetch(file);
    if (!resp.ok) throw new Error('Failed to load');
    const blob = await resp.blob();
    const { createProfile, switchProfile, setProfileSex, setProfileDob } = await import('./profile.js');
    const name = sex === 'female' ? 'Demo Sarah' : 'Demo Alex';
    const dob = sex === 'female' ? '1991-08-15' : '1987-11-22';
    const location = sex === 'female'
      ? { country: 'Czech Republic', zip: '11000' }
      : { country: 'United States', zip: '80301' };
    const avatar = sex === 'female'
      ? 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MCcgaGVpZ2h0PSc4MCcgdmlld0JveD0nMCAwIDgwIDgwJz4KPGNpcmNsZSBjeD0nNDAnIGN5PSc0MCcgcj0nNDAnIGZpbGw9JyNmMGM4YTAnLz4KPGVsbGlwc2UgY3g9JzQwJyBjeT0nMjgnIHJ4PScyMicgcnk9JzIwJyBmaWxsPScjNmIzYTJhJy8+CjxlbGxpcHNlIGN4PSc0MCcgY3k9JzQ4JyByeD0nMTYnIHJ5PScxOCcgZmlsbD0nI2Y1ZDViOCcvPgo8Y2lyY2xlIGN4PSczMycgY3k9JzQ0JyByPScyJyBmaWxsPScjNGEzNzI4Jy8+CjxjaXJjbGUgY3g9JzQ3JyBjeT0nNDQnIHI9JzInIGZpbGw9JyM0YTM3MjgnLz4KPHBhdGggZD0nTTM2IDUyIFE0MCA1NiA0NCA1Micgc3Ryb2tlPScjYzQ3YTZhJyBzdHJva2Utd2lkdGg9JzEuNScgZmlsbD0nbm9uZScgc3Ryb2tlLWxpbmVjYXA9J3JvdW5kJy8+CjxwYXRoIGQ9J00xOCAzMCBRMjAgMTIgNDAgMTAgUTYwIDEyIDYyIDMwIFE1OCAyMiA0MCAyMCBRMjIgMjIgMTggMzBaJyBmaWxsPScjNmIzYTJhJy8+CjxwYXRoIGQ9J00xNiAzNSBRMTQgMjAgMjUgMTUnIHN0cm9rZT0nIzZiM2EyYScgc3Ryb2tlLXdpZHRoPSc2JyBmaWxsPSdub25lJyBzdHJva2UtbGluZWNhcD0ncm91bmQnLz4KPHBhdGggZD0nTTY0IDM1IFE2NiAyMCA1NSAxNScgc3Ryb2tlPScjNmIzYTJhJyBzdHJva2Utd2lkdGg9JzYnIGZpbGw9J25vbmUnIHN0cm9rZS1saW5lY2FwPSdyb3VuZCcvPgo8L3N2Zz4='
      : 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MCcgaGVpZ2h0PSc4MCcgdmlld0JveD0nMCAwIDgwIDgwJz4KPGNpcmNsZSBjeD0nNDAnIGN5PSc0MCcgcj0nNDAnIGZpbGw9JyNkNGE4N2MnLz4KPGVsbGlwc2UgY3g9JzQwJyBjeT0nNDgnIHJ4PScxNycgcnk9JzE4JyBmaWxsPScjZThjNGEwJy8+CjxyZWN0IHg9JzIwJyB5PScxNCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzIyJyByeD0nOCcgZmlsbD0nIzNhMmExYScvPgo8Y2lyY2xlIGN4PSczMycgY3k9JzQ0JyByPScyJyBmaWxsPScjM2EyYTFhJy8+CjxjaXJjbGUgY3g9JzQ3JyBjeT0nNDQnIHI9JzInIGZpbGw9JyMzYTJhMWEnLz4KPHBhdGggZD0nTTM2IDUzIFE0MCA1NiA0NCA1Mycgc3Ryb2tlPScjYjA3MDYwJyBzdHJva2Utd2lkdGg9JzEuNScgZmlsbD0nbm9uZScgc3Ryb2tlLWxpbmVjYXA9J3JvdW5kJy8+CjxyZWN0IHg9JzMwJyBjeT0nNTgnIHk9JzU5JyB3aWR0aD0nMjAnIGhlaWdodD0nMycgcng9JzEnIGZpbGw9JyM4YjZiNTAnIG9wYWNpdHk9JzAuNCcvPgo8L3N2Zz4=';
    const height = sex === 'female' ? 168 : 182;
    const profileId = createProfile(name, { sex, dob, location, avatar, tags: ['demo'], height, heightUnit: 'cm' });
    // Remove empty Default profile when loading demo data
    const { getProfiles, saveProfiles: saveProfileList } = await import('./profile.js');
    const allProfiles = getProfiles();
    const emptyDefault = allProfiles.find(p => p.id === 'default');
    if (emptyDefault) {
      // `labcharts-default-imported` matches the `*-imported` suffix and now
      // lives in IndexedDB. encryptedGetItem migrates from localStorage on
      // first read, so this works whether the value is in either place.
      const defaultRaw = await encryptedGetItem('labcharts-default-imported');
      const defaultData = defaultRaw ? JSON.parse(defaultRaw) : {};
      if (!defaultData.entries || defaultData.entries.length === 0) {
        await saveProfileList(allProfiles.filter(p => p.id !== 'default'));
        await encryptedRemoveItem('labcharts-default-imported');
      }
    }
    // Mark the loading window so the dashboard renderer shows a
    // "Loading demo data…" placeholder instead of the empty Welcome
    // hero during the 2-3s gap between switchProfile and
    // importDataJSON-finish. Cleared by the import completion path.
    window._demoLoadingProfileId = profileId;
    // Await switchProfile fully — it's now async, and racing it against
    // importDataJSON used to leave state.currentProfile pointing at the
    // OLD profile when FileReader fired, causing the demo to land in
    // the wrong profile and the dashboard to render stale until the
    // user manually refreshed.
    await switchProfile(profileId);
    localStorage.setItem(profileStorageKey(profileId, 'onboarded'), 'profile-set');
    // Prefill caches BEFORE the import runs. importDataJSON's onload
    // ends with `navigate('dashboard')`, which immediately fires
    // loadFocusCard + loadContextHealthDots. If we wrote these caches
    // AFTER the import, those renders would beat us to the punch and
    // fire 9+1 AI calls before our prefill landed. Both writes are
    // demo-only by code path (regular importDataJSON does not touch
    // either localStorage cache).
    let demoJson = null;
    try { demoJson = JSON.parse(await blob.text()); } catch (_) {}
    if (demoJson?.focusCard?.text) {
      // Focus card cache ships without a fingerprint — loadFocusCard
      // treats that as a hand-authored prefill and never auto-refreshes
      // against a live provider. Manual ↻ clears the cache.
      localStorage.setItem(profileStorageKey(profileId, 'focusCard'),
        JSON.stringify({ text: demoJson.focusCard.text }));
    }
    if (demoJson?.contextHealth?.dots) {
      try {
        const { getCardFingerprint } = await import('./context-cards.js');
        // Compute fingerprints against the demo JSON directly — passing
        // an explicit ctx so getCardFingerprint doesn't read the live
        // state (which won't be populated until importDataJSON's onload
        // runs). The fingerprint values match what loadContextHealthDots
        // will compute post-import (same data, same sex/dob), so the
        // standard fp-match path renders cached without firing AI.
        //
        // CRITICAL: importDataJSON applies two transforms before the
        // dashboard renders, both of which influence the labPart hash:
        //   (1) merge same-date entries (commit 42415b1 — demos ship two
        //       entries per draw day for comprehensive + specialty
        //       add-on panels)
        //   (2) migrateProfileData (e.g. hematocrit fraction → percent
        //       per v1.6.1 migration)
        // Apply both to a deep-cloned demoJson here, otherwise every
        // fingerprint mismatches and all 9 dots fall through to stale
        // AI-fire on first dashboard render. Deep clone via
        // structuredClone keeps the original demoJson reference clean
        // for any downstream usage (currently none, but defensive).
        const _ctxData = structuredClone(demoJson);
        const _ctxSourceEntries = Array.isArray(_ctxData.entries) ? _ctxData.entries : [];
        const _ctxImportTs = Date.now();
        _ctxData.entries = [];
        for (const entry of _ctxSourceEntries) {
          if (!entry.date || !entry.markers) continue;
          const existing = findOrCreateLabEntry(_ctxData, entry.date, { now: _ctxImportTs });
          for (const [key, value] of Object.entries(entry.markers)) {
            setLabEntryMarker(existing, key, value, { now: _ctxImportTs, mirrorInsulin: true });
          }
        }
        try { migrateProfileData(_ctxData); } catch (_) {}
        const ctx = {
          importedData: _ctxData,
          profileSex: sex,
          profileDob: dob,
        };
        const cacheKey = profileStorageKey(profileId, 'contextHealth');
        const dots = {};
        const summaries = {};
        const fingerprints = {};
        for (const k of Object.keys(demoJson.contextHealth.dots)) {
          dots[k] = demoJson.contextHealth.dots[k];
          summaries[k] = demoJson.contextHealth.summaries?.[k] || '';
          try { fingerprints[k] = getCardFingerprint(k, ctx); } catch (_) {}
        }
        localStorage.setItem(cacheKey, JSON.stringify({ dots, summaries, fingerprints }));
      } catch (_) { /* prefill is best-effort */ }
    }
    importDataJSON(new File([blob], file, { type: 'application/json' }));
  } catch (err) {
    delete window._demoLoadingProfileId;
    showNotification('Could not load demo data: ' + err.message, 'error');
  }
}

Object.assign(window, { openReportBuilder, closeReportBuilder, exportPDFReport, exportDataJSON, exportClientJSON, exportAllDataJSON, buildAllDataBundle, importDataJSON, clearAllData, loadDemoData });
