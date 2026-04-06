// export.js — PDF report, JSON export/import, clear all data

import { state } from './state.js';
import { getStatus, formatValue, showNotification, showConfirmDialog, getTrend } from './utils.js';
import { getActiveData, filterDatesByRange, getEffectiveRange, getAllFlaggedMarkers, getLatestValueIndex, saveImportedData } from './data.js';
import { getProfiles, profileStorageKey, createProfile, updateProfileMeta, loadProfile, saveProfiles, migrateProfileData } from './profile.js';
import { getBloodDrawPhases } from './cycle.js';
import { encryptedGetItem, encryptedSetItem, getEncryptionEnabled } from './crypto.js';

// ═══════════════════════════════════════════════
// PDF REPORT EXPORT
// ═══════════════════════════════════════════════
export function exportPDFReport() {
  const rawData = getActiveData();
  const data = filterDatesByRange(rawData);
  const profiles = getProfiles();
  const profileName = (profiles.find(p => p.id === state.currentProfile) || { name: 'Profile' }).name;
  const sexLabel = state.profileSex === 'female' ? 'Female' : state.profileSex === 'male' ? 'Male' : 'Not specified';
  const flags = getAllFlaggedMarkers(data);
  const notes = (state.importedData.notes || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const supps = state.importedData.supplements || [];
  const contextSections = [];
  const fmtCtx = obj => {
    if (typeof obj === 'string') return obj;
    const parts = [];
    for (const [k, v] of Object.entries(obj)) {
      if (v == null || k === 'note') continue;
      if (Array.isArray(v)) { if (v.length) parts.push(`${k}: ${v.map(i => typeof i === 'object' ? (i.name || JSON.stringify(i)) : i).join(', ')}`); }
      else if (typeof v === 'object') parts.push(`${k}: ${JSON.stringify(v)}`);
      else parts.push(`${k}: ${v}`);
    }
    if (obj.note) parts.push(`Note: ${obj.note}`);
    return parts.join('. ');
  };
  if (state.importedData.diagnoses) contextSections.push({ title: 'Medical Conditions', text: fmtCtx(state.importedData.diagnoses) });
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
  if (pBio || pHeight?.height) {
    let bioText = '';
    if (pHeight?.height) bioText += `Height: ${pHeight.height} cm\n`;
    if (pBio?.weight?.length) {
      const latest = [...pBio.weight].sort((a, b) => b.date.localeCompare(a.date))[0];
      bioText += `Latest weight: ${latest.value} ${latest.unit} (${latest.date})\n`;
    }
    if (pBio?.bp?.length) {
      const latest = [...pBio.bp].sort((a, b) => b.date.localeCompare(a.date))[0];
      bioText += `Latest BP: ${latest.sys}/${latest.dia} mmHg (${latest.date})\n`;
    }
    if (pBio?.pulse?.length) {
      const latest = [...pBio.pulse].sort((a, b) => b.date.localeCompare(a.date))[0];
      bioText += `Latest pulse: ${latest.value} bpm (${latest.date})\n`;
    }
    if (bioText) contextSections.push({ title: 'Biometrics', text: bioText.trim() });
  }

  const html = buildReportHTML(profileName, sexLabel, data, flags, notes, supps, contextSections);
  const win = window.open('', '_blank');
  if (!win) { showNotification('Pop-up blocked — please allow pop-ups for this site', 'error'); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 600);
}

export function buildReportHTML(profileName, sexLabel, data, flags, notes, supps, contextSections) {
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const unitLabel = state.unitSystem === 'US' ? 'US (conventional)' : 'EU (SI)';
  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fullDateLabels = data.dates.map(d => fmtDate(d));
  const dateRange = fullDateLabels.length > 0
    ? `${fullDateLabels[0]} \u2013 ${fullDateLabels[fullDateLabels.length - 1]}`
    : 'No dates';

  let body = '';

  // Header
  body += `<div class="report-header">
    <h1>getbased Report</h1>
    <div class="report-meta">
      <span><strong>Profile:</strong> ${esc(profileName)}</span>
      <span><strong>Sex:</strong> ${sexLabel}</span>
      <span><strong>Units:</strong> ${unitLabel}</span>
      <span><strong>Date range:</strong> ${esc(dateRange)}</span>
      <span><strong>Generated:</strong> ${now}</span>
    </div>
  </div>`;

  // Flagged Results
  if (flags.length > 0) {
    body += `<h2>Flagged Results</h2><table><thead><tr><th>Biomarker</th><th>Value</th><th>Range</th><th>Status</th></tr></thead><tbody>`;
    for (const f of flags) {
      const cls = f.status === 'high' ? 'val-high' : 'val-low';
      const label = f.status === 'high' ? 'HIGH' : 'LOW';
      body += `<tr><td>${esc(f.name)}</td><td class="${cls}">${f.value} ${esc(f.unit)}</td>
        <td>${formatValue(f.effectiveMin)} \u2013 ${formatValue(f.effectiveMax)}</td><td class="${cls}">${label}</td></tr>`;
    }
    body += `</tbody></table>`;
  }

  // Category tables
  for (const [catKey, cat] of Object.entries(data.categories)) {
    const markersWithData = Object.entries(cat.markers).filter(([_, m]) => m.values && m.values.some(v => v !== null));
    if (markersWithData.length === 0) continue;
    const labels = cat.singleDate ? [cat.singleDateLabel || 'N/A'] : fullDateLabels;
    body += `<h2>${cat.icon} ${esc(cat.label)}</h2><table><thead><tr><th>Biomarker</th><th>Unit</th><th>Reference</th>`;
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

  // Supplements
  if (supps.length > 0) {
    body += `<h2>Supplements & Medications</h2><table><thead><tr><th>Name</th><th>Dosage</th><th>Type</th><th>Period</th><th>Note</th></tr></thead><tbody>`;
    for (const s of supps) {
      body += `<tr><td>${esc(s.name)}</td><td>${esc(s.dosage || '\u2014')}</td><td>${s.type}</td>
        <td>${fmtDate(s.startDate)} \u2192 ${s.endDate ? fmtDate(s.endDate) : 'ongoing'}</td><td style="font-size:11px">${esc(s.note || '\u2014')}</td></tr>`;
    }
    body += `</tbody></table>`;
  }

  // Notes
  if (notes.length > 0) {
    body += `<h2>Notes</h2>`;
    for (const n of notes) {
      body += `<div class="note-item"><strong>${fmtDate(n.date)}</strong>: ${esc(n.text)}</div>`;
    }
  }

  // Genetics
  const genetics = state.importedData.genetics;
  const snpTable = window._snpTableCache;
  if (genetics && genetics.snps && snpTable) {
    const snpCount = Object.keys(genetics.snps).length;
    body += `<h2>Genetics</h2>`;
    body += `<p style="font-size:13px;color:#555;margin-bottom:12px"><strong>Source:</strong> ${esc(genetics.source)} &middot; <strong>SNPs:</strong> ${snpCount} &middot; <strong>Imported:</strong> ${genetics.importDate}${genetics.apoe ? ' &middot; <strong>APOE:</strong> ' + esc(genetics.apoe) : ''}</p>`;
    const apoeRsids = new Set(['rs429358', 'rs7412']);
    const byCat = {};
    const catLabels = { methylation: 'Methylation', iron: 'Iron', lipids: 'Lipids', vitaminD: 'Vitamin D', vitaminB12: 'Vitamin B12', bilirubin: 'Bilirubin', thyroid: 'Thyroid', fattyAcids: 'Fatty Acids', bloodSugar: 'Blood Sugar', sexHormones: 'Sex Hormones' };
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
  if (genetics?.mtdna) {
    const mt = genetics.mtdna;
    if (!genetics.snps || !snpTable) body += `<h2>Genetics</h2>`;
    body += `<div style="margin:12px 0;font-size:13px"><strong>mtDNA Haplogroup:</strong> ${esc(mt.haplogroup)}`;
    if (mt.coupling) body += ` \u2014 ${esc(mt.coupling.label)} (${esc(mt.coupling.climate)})`;
    if (mt.source) body += ` &middot; Source: ${esc(mt.source)}`;
    body += `</div>`;
  }

  // Context sections
  if (contextSections.length > 0) {
    body += `<h2>Profile Context</h2>`;
    for (const s of contextSections) {
      body += `<div class="context-item"><strong>${esc(s.title)}:</strong> ${esc(s.text)}</div>`;
    }
  }

  // Summary for Healthcare Provider
  body += `<h2>Summary for Healthcare Provider</h2>`;
  body += `<p style="font-size:13px;color:#555;margin-bottom:12px">Generated from <strong>${data.dates.length}</strong> collection date${data.dates.length !== 1 ? 's' : ''}${fullDateLabels.length >= 2 ? ` spanning ${fullDateLabels[0]} \u2013 ${fullDateLabels[fullDateLabels.length - 1]}` : ''}.</p>`;

  if (flags.length > 0) {
    body += `<p style="font-size:14px;font-weight:700;margin:12px 0 6px">Out of Range (${flags.length}):</p><ul style="font-size:13px;margin:0 0 12px 20px">`;
    for (const f of flags) {
      const boundary = f.status === 'high' ? f.effectiveMax : f.effectiveMin;
      const diff = f.status === 'high' ? f.rawValue - boundary : boundary - f.rawValue;
      const pctBeyond = boundary !== 0 ? ((diff / boundary) * 100).toFixed(0) : '?';
      body += `<li><strong>${esc(f.name)}</strong>: ${f.value} ${esc(f.unit)} \u2014 <span class="val-${f.status}">${f.status.toUpperCase()}</span> (${pctBeyond}% beyond ${f.status === 'high' ? 'upper' : 'lower'} limit; ref: ${formatValue(f.refMin)}\u2013${formatValue(f.refMax)}${f.optimalMin != null ? ', optimal: ' + formatValue(f.optimalMin) + '\u2013' + formatValue(f.optimalMax) : ''})</li>`;
    }
    body += `</ul>`;
  } else {
    body += `<p style="font-size:13px;color:#059669;margin-bottom:12px"><strong>No out-of-range results.</strong></p>`;
  }

  // Notable trends (>10% change between first and last value)
  const trendItems = [];
  for (const [catKey, cat] of Object.entries(data.categories)) {
    for (const [mKey, marker] of Object.entries(cat.markers)) {
      const nonNull = marker.values.map((v,i) => ({v,i})).filter(x => x.v !== null);
      if (nonNull.length < 2) continue;
      const first = nonNull[0], last = nonNull[nonNull.length - 1];
      if (first.v === 0) continue;
      const pctChange = ((last.v - first.v) / first.v) * 100;
      if (Math.abs(pctChange) > 10) {
        const dir = pctChange > 0 ? 'increased' : 'decreased';
        const firstDate = fullDateLabels[first.i] || '';
        const lastDate = fullDateLabels[last.i] || '';
        trendItems.push(`<li><strong>${esc(marker.name)}</strong> ${dir} ${Math.abs(pctChange).toFixed(0)}% (${formatValue(first.v)} \u2192 ${formatValue(last.v)} ${esc(marker.unit)}, ${firstDate} to ${lastDate})</li>`);
      }
    }
  }
  if (trendItems.length > 0) {
    body += `<p style="font-size:14px;font-weight:700;margin:12px 0 6px">Notable Trends (&gt;10% change):</p><ul style="font-size:13px;margin:0 0 12px 20px">${trendItems.join('')}</ul>`;
  }

  // Summary counts
  let totalWithData = 0, totalInRange = 0;
  for (const cat of Object.values(data.categories)) {
    for (const m of Object.values(cat.markers)) {
      const li = getLatestValueIndex(m.values);
      if (li !== -1) {
        totalWithData++;
        const r = getEffectiveRange(m);
        if (getStatus(m.values[li], r.min, r.max) === 'normal') totalInRange++;
      }
    }
  }
  body += `<p style="font-size:13px;margin-bottom:8px"><strong>Within ${state.rangeMode === 'reference' ? 'Reference' : 'Optimal'} Range:</strong> ${totalInRange} of ${totalWithData} markers with data</p>`;

  if (supps.length > 0) {
    const suppList = supps.map(s => `${esc(s.name)}${s.dosage ? ' (' + esc(s.dosage) + ')' : ''}`).join(', ');
    body += `<p style="font-size:13px;margin-bottom:8px"><strong>Supplements/Medications:</strong> ${suppList}</p>`;
  }

  if (genetics && genetics.apoe) {
    body += `<p style="font-size:13px;margin-bottom:8px"><strong>APOE:</strong> ${esc(genetics.apoe)}</p>`;
  }

  body += `<p style="font-size:11px;color:#888;font-style:italic;margin-top:12px">This summary was auto-generated by getbased. Values should be interpreted in clinical context.</p>`;

  // Footer
  body += `<div class="report-footer">
    <p>Generated by getbased &middot; ${now}</p>
    <p class="disclaimer">This report is for informational purposes only and does not constitute medical advice. Always consult a qualified healthcare professional for interpretation of lab results.</p>
  </div>`;

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>getbased Report - ${esc(profileName)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.5; padding: 32px; max-width: 1000px; margin: 0 auto; }
  .report-header { border-bottom: 2px solid #333; padding-bottom: 16px; margin-bottom: 24px; }
  .report-header h1 { font-size: 28px; font-weight: 700; }
  .report-meta { display: flex; gap: 20px; flex-wrap: wrap; font-size: 13px; color: #555; margin-top: 8px; }
  h2 { font-size: 18px; font-weight: 700; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #ddd; page-break-after: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
  th { background: #f5f5f5; padding: 8px 10px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #ddd; }
  td { padding: 6px 10px; border-bottom: 1px solid #eee; font-variant-numeric: tabular-nums; }
  .val-normal { color: #059669; font-weight: 600; }
  .val-high { color: #dc2626; font-weight: 600; }
  .val-low { color: #d97706; font-weight: 600; }
  .val-missing { color: #999; }
  .muted { color: #777; font-size: 11px; }
  .optimal { color: #059669; font-size: 10px; }
  .note-item { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
  .context-item { padding: 6px 0; font-size: 13px; white-space: pre-line; }
  .report-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 11px; color: #888; }
  .disclaimer { margin-top: 8px; font-style: italic; }
  @media print {
    body { padding: 16px; }
    h2 { page-break-after: avoid; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    .report-footer { position: fixed; bottom: 0; width: 100%; }
  }
</style></head><body>${body}</body></html>`;
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
    manualValues: data.manualValues || {},
    changeHistory: data.changeHistory || [],
    chatSummaries: data.chatSummaries || []
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
  const reader = new FileReader();
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
      for (const entry of json.entries) {
        if (!entry.date || !entry.markers) continue;
        if (!state.importedData.entries) state.importedData.entries = [];
        state.importedData.entries = state.importedData.entries.filter(ex => ex.date !== entry.date);
        state.importedData.entries.push(entry);
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
        if (!state.importedData.healthGoals) state.importedData.healthGoals = [];
        for (const g of json.healthGoals) {
          if (!g.text || !g.severity) continue;
          const exists = state.importedData.healthGoals.some(x => x.text === g.text);
          if (!exists) state.importedData.healthGoals.push({ text: g.text, severity: g.severity });
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
      // Import manual value flags
      if (json.manualValues && typeof json.manualValues === 'object') {
        if (!state.importedData.manualValues) state.importedData.manualValues = {};
        Object.assign(state.importedData.manualValues, json.manualValues);
      }
      // Import change history (merge by field+date, imported snapshot wins on conflict)
      if (Array.isArray(json.changeHistory)) {
        if (!state.importedData.changeHistory) state.importedData.changeHistory = [];
        for (const entry of json.changeHistory) {
          if (!entry.field || !entry.date) continue;
          const idx = state.importedData.changeHistory.findIndex(e => e.field === entry.field && e.date === entry.date);
          if (idx >= 0) { state.importedData.changeHistory[idx] = entry; }
          else { state.importedData.changeHistory.push(entry); }
        }
        state.importedData.changeHistory.sort((a, b) => a.date.localeCompare(b.date));
        while (state.importedData.changeHistory.length > 200) state.importedData.changeHistory.shift();
      }
      // Import chat summaries (merge by threadId)
      if (Array.isArray(json.chatSummaries)) {
        if (!state.importedData.chatSummaries) state.importedData.chatSummaries = [];
        for (const s of json.chatSummaries) {
          if (!s.threadId) continue;
          const idx = state.importedData.chatSummaries.findIndex(e => e.threadId === s.threadId);
          if (idx >= 0) { state.importedData.chatSummaries[idx] = s; }
          else { state.importedData.chatSummaries.push(s); }
        }
      }
      // Import supplements
      if (json.supplements && Array.isArray(json.supplements)) {
        if (!state.importedData.supplements) state.importedData.supplements = [];
        for (const s of json.supplements) {
          if (!s.name || !s.startDate) continue;
          const exists = state.importedData.supplements.some(x => x.name === s.name && x.startDate === s.startDate);
          if (!exists) state.importedData.supplements.push({ name: s.name, dosage: s.dosage || '', startDate: s.startDate, endDate: s.endDate || null, type: s.type || 'supplement', note: s.note || '' });
        }
      }
      // Import notes
      if (json.notes && Array.isArray(json.notes)) {
        if (!state.importedData.notes) state.importedData.notes = [];
        for (const note of json.notes) {
          if (!note.date || !note.text) continue;
          // Avoid duplicates (same date + same text)
          const exists = state.importedData.notes.some(n => n.date === note.date && n.text === note.text);
          if (!exists) state.importedData.notes.push({ date: note.date, text: note.text });
        }
      }
      migrateProfileData(state.importedData);
      saveImportedData();
      if (json.chat) {
        await _importChatData(state.currentProfile, json.chat);
        if (window.loadChatThreads) window.loadChatThreads();
      }
      window.buildSidebar();
      window.updateHeaderDates();
      window.navigate('dashboard');
      const profileMsg = json.profile?.name ? ` into "${json.profile.name}"` : '';
      showNotification(`Imported ${count} date entr${count === 1 ? 'y' : 'ies'}${profileMsg}`, 'success');
    } catch (err) {
      showNotification('Error parsing JSON: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
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
      if (!current.entries) current.entries = [];
      // Entries: date-keyed upsert
      if (Array.isArray(importData.entries)) {
        for (const entry of importData.entries) {
          if (!entry.date || !entry.markers) continue;
          current.entries = current.entries.filter(ex => ex.date !== entry.date);
          current.entries.push(entry);
        }
      }
      // Notes: deduplicate by date+text
      if (Array.isArray(importData.notes)) {
        if (!current.notes) current.notes = [];
        for (const n of importData.notes) {
          if (!n.date || !n.text) continue;
          if (!current.notes.some(x => x.date === n.date && x.text === n.text)) current.notes.push(n);
        }
      }
      // Supplements: deduplicate by name+startDate
      if (Array.isArray(importData.supplements)) {
        if (!current.supplements) current.supplements = [];
        for (const s of importData.supplements) {
          if (!s.name || !s.startDate) continue;
          if (!current.supplements.some(x => x.name === s.name && x.startDate === s.startDate)) current.supplements.push(s);
        }
      }
      // Health goals: deduplicate by text
      if (Array.isArray(importData.healthGoals)) {
        if (!current.healthGoals) current.healthGoals = [];
        for (const g of importData.healthGoals) {
          if (!g.text) continue;
          if (!current.healthGoals.some(x => x.text === g.text)) current.healthGoals.push(g);
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
        if (!current.changeHistory) current.changeHistory = [];
        for (const entry of importData.changeHistory) {
          if (!entry.field || !entry.date) continue;
          const idx = current.changeHistory.findIndex(e => e.field === entry.field && e.date === entry.date);
          if (idx >= 0) { current.changeHistory[idx] = entry; }
          else { current.changeHistory.push(entry); }
        }
        current.changeHistory.sort((a, b) => a.date.localeCompare(b.date));
        while (current.changeHistory.length > 200) current.changeHistory.shift();
      }
      // Chat summaries: merge by threadId
      if (Array.isArray(importData.chatSummaries)) {
        if (!current.chatSummaries) current.chatSummaries = [];
        for (const s of importData.chatSummaries) {
          if (!s.threadId) continue;
          const idx = current.chatSummaries.findIndex(e => e.threadId === s.threadId);
          if (idx >= 0) { current.chatSummaries[idx] = s; }
          else { current.chatSummaries.push(s); }
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

export function clearAllData() {
  const profiles = getProfiles();
  const msg = profiles.length > 1
    ? `Clear ALL data across ${profiles.length} profiles? This cannot be undone.`
    : 'Are you sure you want to clear all imported data? This cannot be undone.';
  showConfirmDialog(msg, async () => {
    // Wipe storage for every profile
    for (const p of profiles) {
      const id = p.id;
      localStorage.removeItem(profileStorageKey(id, 'imported'));
      localStorage.removeItem(profileStorageKey(id, 'units'));
      localStorage.removeItem(profileStorageKey(id, 'suppOverlay'));
      localStorage.removeItem(profileStorageKey(id, 'noteOverlay'));
      localStorage.removeItem(profileStorageKey(id, 'rangeMode'));
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
  });
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
      const defaultData = JSON.parse(localStorage.getItem('labcharts-default-imported') || '{}');
      if (!defaultData.entries || defaultData.entries.length === 0) {
        await saveProfileList(allProfiles.filter(p => p.id !== 'default'));
        localStorage.removeItem('labcharts-default-imported');
      }
    }
    switchProfile(profileId);
    localStorage.setItem(profileStorageKey(profileId, 'onboarded'), 'profile-set');
    importDataJSON(new File([blob], file, { type: 'application/json' }));
  } catch (err) {
    showNotification('Could not load demo data: ' + err.message, 'error');
  }
}

Object.assign(window, { exportPDFReport, exportDataJSON, exportClientJSON, exportAllDataJSON, buildAllDataBundle, importDataJSON, clearAllData, loadDemoData });
