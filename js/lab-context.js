// lab-context.js — Lab context assembly for AI (buildLabContext + helpers)

import { state } from './state.js';
import { SBM_2015_THRESHOLDS, getEMFSeverity } from './schema.js';
import { getStatus, hasCardContent, hashString, isDebugMode } from './utils.js';
import { formatTime } from './theme.js';
import { getActiveData, getEffectiveRangeForDate, getLatestValueIndex, getAllFlaggedMarkers } from './data.js';
import { getProfileLocation, getLatitudeFromLocation } from './profile.js';
import { getBloodDrawPhases, getNextBestDrawDate, detectPerimenopausePattern, detectCycleIronAlerts } from './cycle.js';
import { scanSupplementsForWarnings, humanizeEffect } from './supplement-warnings.js';
import { scanDietForContaminants } from './food-contaminants.js';

// ═══════════════════════════════════════════════
// LAB CONTEXT MEMOIZATION
// ═══════════════════════════════════════════════
let _labContextCache = { fingerprint: null, context: null };

function _getLabContextFingerprint() {
  const d = state.importedData;
  // Lightweight fingerprint: entry dates + marker counts, profile fields, card JSON
  const entryPart = (d.entries || []).map(e => e.date + ':' + Object.keys(e.markers || {}).length).join(',');
  const cardPart = ['healthGoals', 'diagnoses', 'supplements', 'biometrics', 'genetics',
    'menstrualCycle', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress',
    'loveLife', 'environment', 'emfAssessment', 'changeHistory'
  ].map(k => hashString(JSON.stringify(d[k] || ''))).join(',');
  return hashString([
    entryPart, cardPart,
    state.profileSex || '', state.profileDob || '',
    state.unitSystem || '', state.rangeMode || '',
    d.interpretiveLens || '', d.contextNotes || '',
    JSON.stringify(d.notes || []), JSON.stringify(d.markerNotes || {}),
    JSON.stringify(d.refOverrides || {}), JSON.stringify(d.categoryLabels || {}),
    JSON.stringify(d.markerLabels || {})
  ].join('|'));
}

export function invalidateLabContextCache() { _labContextCache = { fingerprint: null, context: null }; }

// ═══════════════════════════════════════════════
// SPECIALTY LABS IN AI CONTEXT (per-group)
// ═══════════════════════════════════════════════
export function isGroupInAIContext(groupName) {
  return localStorage.getItem(`labcharts-ai-ctx-${groupName}`) === 'on';
}

export function setGroupInAIContext(groupName, val) {
  localStorage.setItem(`labcharts-ai-ctx-${groupName}`, val ? 'on' : 'off');
}

// ═══════════════════════════════════════════════
// CHANGE SUMMARY HELPER
// ═══════════════════════════════════════════════
function summarizeChange(field, prev, curr) {
  if (prev == null && curr == null) return null;
  if (prev == null) return 'added';
  if (curr == null) return 'cleared';
  // String fields (interpretiveLens, contextNotes)
  if (typeof curr === 'string' || typeof prev === 'string') {
    const p = (prev || '').toString().slice(0, 60);
    const c = (curr || '').toString().slice(0, 60);
    if (p === c) return null;
    return `changed${p ? ' (was: "' + p + (prev.length > 60 ? '…' : '') + '")' : ''}`;
  }
  // Arrays (healthGoals)
  if (Array.isArray(curr)) {
    const pLen = Array.isArray(prev) ? prev.length : 0;
    if (curr.length > pLen) {
      const added = curr.slice(pLen).map(g => g.text || JSON.stringify(g)).join(', ');
      return `added: ${added}`;
    }
    if (curr.length < pLen) return `removed ${pLen - curr.length} item${pLen - curr.length > 1 ? 's' : ''}`;
    return 'updated';
  }
  // Objects (context cards, diagnoses, menstrualCycle)
  const changes = [];
  const allKeys = new Set([...Object.keys(prev || {}), ...Object.keys(curr || {})]);
  for (const k of allKeys) {
    if (k === 'note') continue; // skip free-text notes for brevity
    const pv = prev?.[k], cv = curr?.[k];
    const pvStr = JSON.stringify(pv), cvStr = JSON.stringify(cv);
    if (pvStr === cvStr) continue;
    if (pv == null || (Array.isArray(pv) && pv.length === 0)) {
      const val = Array.isArray(cv) ? cv.join(', ') : cv;
      changes.push(`${k}: ${val}`);
    } else if (cv == null || (Array.isArray(cv) && cv.length === 0)) {
      changes.push(`${k}: removed`);
    } else {
      const val = Array.isArray(cv) ? cv.join(', ') : cv;
      const old = Array.isArray(pv) ? pv.join(', ') : pv;
      changes.push(`${k}: ${old} → ${val}`);
    }
  }
  return changes.length > 0 ? changes.slice(0, 5).join('; ') + (changes.length > 5 ? '; …' : '') : null;
}

// ═══════════════════════════════════════════════
// LAB CONTEXT
// ═══════════════════════════════════════════════
export function buildLabContext({ skipGroupFilter } = {}) {
  // skipGroupFilter: true → include all specialty groups regardless of AI toggle
  // Used by sync/push so the relay always receives complete data
  const fp = _getLabContextFingerprint() + (skipGroupFilter ? ':all' : '');
  if (_labContextCache.fingerprint === fp && _labContextCache.context) {
    if (isDebugMode()) console.log('[AI] Lab context cache hit');
    return _labContextCache.context;
  }
  if (isDebugMode()) console.log('[AI] Lab context cache miss — rebuilding');
  const ctx = _buildLabContextInner({ skipGroupFilter });
  _labContextCache = { fingerprint: fp, context: ctx };
  return ctx;
}

function _buildLabContextInner({ skipGroupFilter } = {}) {
  const data = getActiveData();
  const hasLabData = data.dates.length > 0 || Object.values(data.categories).some(c => c.singleDate);
  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const sexLabel = state.profileSex === 'female' ? 'female' : state.profileSex === 'male' ? 'male' : 'not specified';
  const age = state.profileDob ? Math.floor((new Date() - new Date(state.profileDob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const today = new Date().toISOString().slice(0, 10);
  const unitLabel = state.unitSystem === 'US' ? 'US conventional' : 'SI';

  let ctx;
  if (hasLabData) {
    ctx = `Lab data for current profile (sex: ${sexLabel}${age !== null ? ', age: ' + age : ''}, unit system: ${unitLabel}, today: ${today}, dates: ${data.dates.join(', ')}):\n\n`;
  } else {
    const missingDemo = [];
    if (sexLabel === 'not specified') missingDemo.push('sex');
    if (age === null) missingDemo.push('date of birth');
    const demoWarning = missingDemo.length > 0
      ? ` IMPORTANT: ${missingDemo.join(' and ')} not set — urge the user to set ${missingDemo.length > 1 ? 'these' : 'this'} in Settings first, as it directly affects which tests to recommend and how to interpret results.`
      : '';
    ctx = `Profile context (sex: ${sexLabel}${age !== null ? ', age: ' + age : ''}, today: ${today}):\n\nNo lab data has been imported yet.\nNOTE: The user has not imported any lab results. Use their profile context below to recommend which blood panels and specific tests would be most valuable for them, and explain why each is relevant to their situation. The more cards the user fills out (there are 9 total), the more targeted your recommendations become — encourage filling all of them.${demoWarning}\n\n`;
  }

  // ── Staleness signal ──
  if (hasLabData && data.dates.length > 0) {
    const lastDate = data.dates[data.dates.length - 1];
    const daysSince = Math.round((new Date() - new Date(lastDate + 'T00:00:00')) / (24 * 3600 * 1000));
    if (daysSince > 90) {
      const monthsAgo = Math.round(daysSince / 30.44);
      ctx += `NOTE: Most recent lab results are from ${fmtDate(lastDate)} (approximately ${monthsAgo} months ago). Values may have changed.\n\n`;
    }
  }

  // ── 1. Health Goals (top priority — "what are you trying to solve?") ──
  const healthGoals = state.importedData.healthGoals || [];
  if (healthGoals.length > 0) {
    ctx += `[section:healthGoals]\n## Health Goals (Things to Solve)\n`;
    const byPriority = { major: [], mild: [], minor: [] };
    for (const g of healthGoals) (byPriority[g.severity] || byPriority.minor).push(g.text);
    for (const [sev, items] of Object.entries(byPriority)) {
      if (items.length > 0) {
        ctx += `### ${sev.charAt(0).toUpperCase() + sev.slice(1)} Priority\n`;
        for (const t of items) ctx += `- ${t}\n`;
      }
    }
    ctx += `[/section:healthGoals]\n\n`;
  }

  // ── 2. Interpretive Lens ──
  const interpretiveLens = state.importedData.interpretiveLens || '';
  if (interpretiveLens.trim()) {
    ctx += `[section:interpretiveLens]\n## Interpretive Lens\n${interpretiveLens.trim()}\n[/section:interpretiveLens]\n\n`;
  }

  // ── 3. Lab values by category ("what do the numbers say?") ──
  if (hasLabData) {
    // Build index of active lab categories
    const _activeCatKeys = [];
    for (const [_ck, _ct] of Object.entries(data.categories)) {
      if (!skipGroupFilter && _ct.group && !isGroupInAIContext(_ct.group)) continue;
      if (Object.entries(_ct.markers).some(([_, m]) => m.values.some(v => v !== null))) _activeCatKeys.push(_ck);
    }
    if (_activeCatKeys.length > 0) {
      ctx += `[index]\nAvailable sections: ${_activeCatKeys.join(', ')}\n[/index]\n\n`;
    }

    const rangeLabel = state.rangeMode === 'optimal' ? 'optimal' : 'reference';
    ctx += `Note: status labels below use ${rangeLabel} ranges.\n\n`;
    for (const [catKey, cat] of Object.entries(data.categories)) {
      if (!skipGroupFilter && cat.group && !isGroupInAIContext(cat.group)) continue;
      const markersWithData = Object.entries(cat.markers).filter(([_, m]) => m.values.some(v => v !== null));
      if (markersWithData.length === 0) continue;
      const _catDate = cat.singleDate || (() => { for (let i = data.dates.length - 1; i >= 0; i--) { if (markersWithData.some(([_, m]) => m.values[i] !== null)) return data.dates[i]; } return null; })();
      ctx += `[section:${catKey}${_catDate ? ' updated:' + _catDate : ''}]\n## ${cat.label}\n`;
      for (const [key, m] of markersWithData) {
        const latestIdx = getLatestValueIndex(m.values);
        // Trajectory narrative: only for flagged markers or those with >25% change
        let trajectory = '';
        try {
          if (!m.singlePoint && data.dates.length >= 2) {
            const points = [];
            for (let ti = 0; ti < m.values.length; ti++) {
              if (m.values[ti] !== null && data.dates[ti]) points.push({ v: m.values[ti], d: data.dates[ti] });
            }
            if (points.length >= 2) {
              const first = points[0], last = points[points.length - 1];
              const mr = getEffectiveRangeForDate(m, latestIdx);
              const range = (mr.min != null && mr.max != null) ? mr.max - mr.min : 0;
              const diff = last.v - first.v;
              const changePct = range > 0 ? Math.abs(diff) / range : 0;
              const latestStatus = latestIdx !== -1 ? getStatus(m.values[latestIdx], mr.min, mr.max) : 'normal';
              const isFlagged = latestStatus === 'high' || latestStatus === 'low';
              const msSpan = new Date(last.d + 'T00:00:00') - new Date(first.d + 'T00:00:00');
              const days = Math.round(msSpan / (24 * 3600 * 1000));
              let durStr;
              if (days < 30) durStr = `${days} day${days !== 1 ? 's' : ''}`;
              else if (days < 90) { const w = Math.round(days / 7); durStr = `${w} week${w !== 1 ? 's' : ''}`; }
              else if (days < 730) { const mo = Math.round(days / 30.44); durStr = `${mo} month${mo !== 1 ? 's' : ''}`; }
              else { const yr = Math.round(days / 365.25 * 10) / 10; durStr = `${yr} year${yr !== 1 ? 's' : ''}`; }
              // Verbose trajectory for flagged markers or >25% change; simple delta for the rest
              if (isFlagged || changePct > 0.25) {
                const dir = diff > 0 ? '\u2191 rising' : '\u2193 declining';
                trajectory = ` \u2014 ${dir} over ${durStr} (${points.length} readings)`;
              } else {
                const prev = points[points.length - 2];
                const prevDiff = last.v - prev.v;
                const delta = prevDiff > 0 ? '\u2191' : prevDiff < 0 ? '\u2193' : '\u2192';
                trajectory = ` ${delta} vs ${prev.v} on ${prev.d}`;
              }
            }
          }
        } catch (_) { /* skip trajectory on error */ }
        if (m.phaseRefRanges && m.phaseLabels) {
          const parts = m.values.map((v, i) => {
            if (v === null) return null;
            const phase = m.phaseLabels[i];
            const pr = m.phaseRefRanges[i];
            const dateLabel = m.singlePoint ? '' : data.dates[i];
            const s = pr ? getStatus(v, pr.min, pr.max) : getStatus(v, m.refMin, m.refMax);
            const rangeStr = pr ? `${pr.min}\u2013${pr.max}` : `${m.refMin}\u2013${m.refMax}`;
            return `${dateLabel}: ${v} [${phase || '?'}, ref ${rangeStr}, ${s}]`;
          }).filter(Boolean).join(', ');
          ctx += `- ${m.name}: ${parts} ${m.unit}${trajectory}\n`;
        } else {
          const vals = m.singlePoint
            ? m.values.filter(v => v !== null).map(v => `${v}`).join('')
            : m.values.map((v, i) => v !== null ? `${data.dates[i]}: ${v}` : null).filter(Boolean).join(', ');
          const mr = getEffectiveRangeForDate(m, latestIdx);
          const status = latestIdx !== -1 ? getStatus(m.values[latestIdx], mr.min, mr.max) : 'no data';
          const refStr = mr.min != null && mr.max != null ? `ref: ${mr.min}\u2013${mr.max}, ` : '';
          ctx += `- ${m.name}: ${vals} ${m.unit} (${refStr}status: ${status})${trajectory}\n`;
        }
      }
      // Per-category staleness: flag if this category's latest data is >90 days old
      const catLatestDate = cat.singleDate || (() => {
        for (let i = data.dates.length - 1; i >= 0; i--) {
          if (markersWithData.some(([_, m]) => m.values[i] !== null)) return data.dates[i];
        }
        return null;
      })();
      if (catLatestDate) {
        const catDaysSince = Math.round((new Date() - new Date(catLatestDate + 'T00:00:00')) / (24 * 3600 * 1000));
        if (catDaysSince > 90) {
          const catMonthsAgo = Math.round(catDaysSince / 30.44);
          ctx += `⚠ Last tested ~${catMonthsAgo} months ago — values may no longer reflect current status.\n`;
        }
      }
      ctx += `[/section:${catKey}]\n\n`;
    }

    // ── 4. Flagged Results (quick-scan summary) ──
    const allFlags = getAllFlaggedMarkers(data);
    const flags = allFlags.filter(f => {
      const cat = data.categories[f.categoryKey];
      return !cat?.group || skipGroupFilter || isGroupInAIContext(cat.group);
    });
    if (flags.length > 0) {
      ctx += `[critical]\nFlagged markers (details in sections above): ${flags.map(f => `${f.categoryKey}.${f.markerKey}`).join(', ')}\n`;
      ctx += `[/critical]\n\n`;
    }
  }

  // ── 5. User Notes ──
  const notes = (state.importedData.notes || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (notes.length > 0) {
    ctx += `[section:userNotes]\n## User Notes\n`;
    for (const n of notes) {
      ctx += `- ${fmtDate(n.date)}: ${n.text}\n`;
    }
    ctx += `[/section:userNotes]\n\n`;
  }

  // ── 5b. Marker Notes ──
  const markerNotes = state.importedData.markerNotes || {};
  const mnKeys = Object.keys(markerNotes);
  if (mnKeys.length > 0) {
    ctx += `[section:markerNotes]\n## Marker Notes\n`;
    for (const key of mnKeys) {
      const [catKey, mKey] = key.split('.');
      const mName = data.categories[catKey]?.markers[mKey]?.name || key;
      ctx += `- ${mName}: ${markerNotes[key]}\n`;
    }
    ctx += `[/section:markerNotes]\n\n`;
  }

  // ── 6. Medical Conditions ("what medical context applies?") ──
  const diag = state.importedData.diagnoses;
  if (hasCardContent(diag)) {
    ctx += `[section:diagnoses]\n## Medical Conditions / Diagnoses\n`;
    if (diag.conditions && diag.conditions.length) {
      for (const c of diag.conditions) {
        ctx += `- ${c.name} (${c.severity}${c.since ? ', since ' + c.since : ''})\n`;
      }
    }
    if (diag.note) ctx += `Notes: ${diag.note}\n`;
    ctx += `[/section:diagnoses]\n\n`;
  }

  // ── 7. Supplements & Medications ──
  const supps = state.importedData.supplements || [];
  if (supps.length > 0) {
    ctx += `[section:supplements]\n## Supplements & Medications\n`;
    for (const s of supps) {
      const pds = (s.periods && s.periods.length > 0) ? s.periods : [{ start: s.startDate, end: s.endDate }];
      const dateRange = pds.length === 1
        ? `${fmtDate(pds[0].start)} \u2192 ${pds[0].end ? fmtDate(pds[0].end) : 'ongoing'}`
        : `CYCLING: ${pds.map(p => fmtDate(p.start) + '\u2192' + (p.end ? fmtDate(p.end) : 'ongoing')).join(', ')}`;
      ctx += `- ${s.name}${s.dosage ? ' (' + s.dosage + ')' : ''} [${s.type}]: ${dateRange}${s.note ? ' — ' + s.note : ''}`;
      if (s.ingredients?.length) ctx += ` | ingredients: ${s.ingredients.map(ing => `${ing.name}${ing.amount ? ' ' + ing.amount : ''}`).join(', ')}`;
      ctx += `\n`;
    }
    // Mitochondrial harm warnings (from curated PubMed-cited database)
    const mitoWarnings = scanSupplementsForWarnings(supps);
    if (mitoWarnings.length > 0) {
      ctx += `\nMitochondrial effects detected:\n`;
      for (const w of mitoWarnings) {
        const effects = w.effects.slice(0, 3).map(e => humanizeEffect(e, { showContext: true })).join('; ');
        ctx += `- ${w.match}: ${effects} (PMID: ${w.pmid})\n`;
      }
    }
    ctx += `[/section:supplements]\n\n`;
  }

  // ── 7b. Biometrics ──
  const bio = state.importedData.biometrics;
  const _profileHeight = window.getProfileHeight ? window.getProfileHeight(state.currentProfile) : { height: null, unit: 'cm' };
  if (_profileHeight.height || (bio && (bio.weight?.length || bio.bp?.length || bio.pulse?.length))) {
    ctx += `[section:biometrics]\n## Biometrics\n`;
    if (_profileHeight.height) {
      const htCm = _profileHeight.height;
      const htLabel = state.unitSystem === 'US'
        ? `${Math.floor(htCm / 2.54 / 12)}' ${Math.round(htCm / 2.54 % 12)}"`
        : `${htCm} cm`;
      ctx += `Height: ${htLabel}\n`;
    }
    if (bio?.weight?.length) {
      const sorted = [...bio.weight].sort((a, b) => b.date.localeCompare(a.date));
      const latest = sorted[0];
      const latestKg = latest.unit === 'lbs' ? latest.value / 2.205 : latest.value;
      ctx += `Weight (latest ${latest.date}): ${latest.value} ${latest.unit}`;
      if (sorted.length > 1) {
        const recent = sorted.slice(0, 6);
        const avgKg = recent.reduce((s, e) => s + (e.unit === 'lbs' ? e.value / 2.205 : e.value), 0) / recent.length;
        ctx += ` (avg last ${recent.length}: ${avgKg.toFixed(1)} kg)`;
      }
      ctx += '\n';
      if (_profileHeight.height) {
        const htM = _profileHeight.height / 100;
        const bmi = (latestKg / (htM * htM)).toFixed(1);
        ctx += `BMI: ${bmi}\n`;
      }
    }
    if (bio?.bp?.length) {
      const sorted = [...bio.bp].sort((a, b) => b.date.localeCompare(a.date));
      const latest = sorted[0];
      ctx += `Blood Pressure (latest ${latest.date}): ${latest.sys}/${latest.dia} mmHg`;
      if (sorted.length > 1) {
        const recent = sorted.slice(0, 6);
        const avgSys = Math.round(recent.reduce((s, e) => s + e.sys, 0) / recent.length);
        const avgDia = Math.round(recent.reduce((s, e) => s + e.dia, 0) / recent.length);
        ctx += ` (avg last ${recent.length}: ${avgSys}/${avgDia})`;
      }
      ctx += '\n';
    }
    if (bio?.pulse?.length) {
      const sorted = [...bio.pulse].sort((a, b) => b.date.localeCompare(a.date));
      const latest = sorted[0];
      ctx += `Resting Pulse (latest ${latest.date}): ${latest.value} bpm`;
      if (sorted.length > 1) {
        const recent = sorted.slice(0, 6);
        const avg = Math.round(recent.reduce((s, e) => s + e.value, 0) / recent.length);
        ctx += ` (avg last ${recent.length}: ${avg} bpm)`;
      }
      ctx += '\n';
    }
    ctx += `[/section:biometrics]\n\n`;
  }

  // ── 8. Genetics ──
  const genetics = state.importedData.genetics;
  if (genetics && genetics.snps && Object.keys(genetics.snps).length > 0) {
    // Collect active marker keys to filter relevant SNPs
    const activeMarkerKeys = hasLabData ? Object.entries(data.categories).flatMap(([catKey, cat]) =>
      Object.entries(cat.markers).filter(([_, m]) => m.values.some(v => v !== null)).map(([key]) => `${catKey}.${key}`)
    ) : [];
    const geneticsCtx = window._buildGeneticsContext ? window._buildGeneticsContext(genetics, activeMarkerKeys) : '';
    if (geneticsCtx) {
      ctx += `[section:genetics]\n${geneticsCtx}\n[/section:genetics]\n\n`;
    }
  }

  // ── 9. Menstrual Cycle (female only) ──
  const mc = state.importedData.menstrualCycle;
  if (mc && state.profileSex === 'female') {
    const regLabel = mc.regularity === 'very_irregular' ? 'very irregular' : mc.regularity || 'regular';
    ctx += `[section:menstrualCycle]\n## Menstrual Cycle\n`;
    const statusCtx = { perimenopause: 'Status: Perimenopause (irregular/transitional).', postmenopause: 'Status: Postmenopause (no active cycle).', pregnant: 'Status: Currently pregnant.', breastfeeding: 'Status: Currently breastfeeding (postpartum).', absent: 'Status: No active menstrual cycle.' };
    if (mc.cycleStatus && statusCtx[mc.cycleStatus]) {
      ctx += statusCtx[mc.cycleStatus];
    } else {
      ctx += `Profile: ${mc.cycleLength || 28}-day cycle (${mc.periodLength || 5}-day period), ${regLabel}, ${mc.flow || 'moderate'} flow.`;
    }
    if (mc.contraceptive) {
      const _hormonalBC = ['ocp', 'pill', 'patch', 'ring', 'implant', 'mirena', 'hormonal iud', 'depo', 'injection'];
      const isHormonal = _hormonalBC.some(h => mc.contraceptive.toLowerCase().includes(h));
      ctx += ` Contraceptive: ${mc.contraceptive}${isHormonal ? ' (HORMONAL — suppresses natural cycle phases; phase-specific hormone ranges do NOT apply)' : ''}.`;
    }
    if (mc.conditions) ctx += ` Conditions: ${mc.conditions}.`;
    ctx += '\n';
    const periods = (mc.periods || []).slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
    if (periods.length > 0) {
      const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      ctx += `Recent periods: ${periods.slice(0, 6).map(p => {
        let desc = `${fmtD(p.startDate)}-${fmtD(p.endDate)} (${p.flow})`;
        if (p.symptoms?.length) desc += ` [${p.symptoms.join(', ')}]`;
        return desc;
      }).join(', ')}\n`;
    }
    const _isActiveCycleCtx = !mc.cycleStatus || mc.cycleStatus === 'regular' || mc.cycleStatus === 'perimenopause';
    const _hormonalBCCtx = ['ocp', 'pill', 'patch', 'ring', 'implant', 'mirena', 'hormonal iud', 'depo', 'injection'];
    const _isHormonalBCCtx = mc.contraceptive && _hormonalBCCtx.some(h => mc.contraceptive.toLowerCase().includes(h));
    if (_isActiveCycleCtx && !_isHormonalBCCtx) {
      if (data.dates.length > 0) {
        const phases = getBloodDrawPhases(mc, data.dates);
        const phaseDates = Object.entries(phases);
        if (phaseDates.length > 0) {
          ctx += `\nBlood draw cycle context:\n`;
          for (const [date, p] of phaseDates) {
            ctx += `- ${fmtDate(date)}: Day ${p.cycleDay} (${p.phaseName} phase)\n`;
          }
        }
      }
      const drawRec = getNextBestDrawDate(mc);
      if (drawRec) {
        ctx += `\nNext optimal blood draw window: ${drawRec.description}\n`;
      }
    }
    const perimenopause = detectPerimenopausePattern(mc, state.profileDob);
    if (perimenopause) {
      ctx += `\nPERIMENOPAUSE ALERT: ${perimenopause.message}\n`;
    }
    const ironAlerts = detectCycleIronAlerts(mc, data);
    if (ironAlerts.length) {
      ctx += `\nIRON/FLOW ALERTS:\n`;
      for (const a of ironAlerts) ctx += `- ${a.message}\n`;
    }
    ctx += `[/section:menstrualCycle]\n\n`;
  }

  // ── 9. Diet & Digestion ("what lifestyle context?") ──
  const diet = state.importedData.diet;
  if (hasCardContent(diet)) {
    ctx += `[section:diet]\n## Diet & Digestion\n`;
    const parts = [];
    if (diet.type) parts.push(`Type: ${diet.type}`);
    if (diet.pattern) parts.push(`Pattern: ${diet.pattern}`);
    if (diet.restrictions && diet.restrictions.length) parts.push(`Restrictions: ${diet.restrictions.join(', ')}`);
    if (parts.length) ctx += parts.join('. ') + '\n';
    if (diet.breakfast) ctx += `Breakfast${diet.breakfastTime ? ' (' + formatTime(diet.breakfastTime) + ')' : ''}: ${diet.breakfast}\n`;
    if (diet.lunch) ctx += `Lunch${diet.lunchTime ? ' (' + formatTime(diet.lunchTime) + ')' : ''}: ${diet.lunch}\n`;
    if (diet.dinner) ctx += `Dinner${diet.dinnerTime ? ' (' + formatTime(diet.dinnerTime) + ')' : ''}: ${diet.dinner}\n`;
    if (diet.snacks) ctx += `Snacks${diet.snacksTime ? ' (' + formatTime(diet.snacksTime) + ')' : ''}: ${diet.snacks}\n`;
    const dParts = [];
    if (diet.bowelFrequency) dParts.push(`Bowel frequency: ${diet.bowelFrequency}`);
    if (diet.stoolConsistency) dParts.push(`Stool consistency: ${diet.stoolConsistency}`);
    if (diet.bloating && diet.bloating !== 'none') dParts.push(`Bloating: ${diet.bloating}`);
    if (diet.gas && diet.gas !== 'none') dParts.push(`Gas: ${diet.gas}`);
    if (diet.acidReflux && diet.acidReflux !== 'none') dParts.push(`Acid reflux: ${diet.acidReflux}`);
    if (diet.burping && diet.burping !== 'none') dParts.push(`Burping: ${diet.burping}`);
    if (diet.nausea && diet.nausea !== 'none') dParts.push(`Nausea: ${diet.nausea}`);
    if (diet.appetite && diet.appetite !== 'normal') dParts.push(`Appetite: ${diet.appetite}`);
    if (diet.abdominalPain && diet.abdominalPain !== 'none') dParts.push(`Abdominal pain: ${diet.abdominalPain}`);
    if (diet.foodSensitivities && diet.foodSensitivities.length) dParts.push(`Food sensitivities: ${diet.foodSensitivities.join(', ')}`);
    if (dParts.length) ctx += dParts.join('. ') + '\n';
    if (diet.note) ctx += `Notes: ${diet.note}\n`;
    // Food contaminant scan (EWG + PlasticList)
    const foodWarnings = scanDietForContaminants(diet);
    const flagged = foodWarnings.filter(w => w.type !== 'clean');
    if (flagged.length > 0) {
      ctx += `\nFood contaminant signals:\n`;
      for (const w of flagged) ctx += `- ${w.warning} (${w.source})\n`;
    }
    ctx += `[/section:diet]\n\n`;
  }

  // ── 10. Exercise ──
  const ex = state.importedData.exercise;
  if (hasCardContent(ex)) {
    ctx += `[section:exercise]\n## Exercise & Movement\n`;
    const parts = [];
    if (ex.frequency) parts.push(`Frequency: ${ex.frequency}`);
    if (ex.types && ex.types.length) parts.push(`Types: ${ex.types.join(', ')}`);
    if (ex.intensity) parts.push(`Intensity: ${ex.intensity}`);
    if (ex.dailyMovement) parts.push(`Daily movement: ${ex.dailyMovement}`);
    ctx += parts.join('. ') + '\n';
    if (ex.note) ctx += `Notes: ${ex.note}\n`;
    ctx += `[/section:exercise]\n\n`;
  }

  // ── 11. Sleep & Rest ──
  const sl = state.importedData.sleepRest;
  if (hasCardContent(sl)) {
    ctx += `[section:sleepRest]\n## Sleep & Rest\n`;
    const parts = [];
    if (sl.duration) parts.push(`Duration: ${sl.duration}`);
    if (sl.quality) parts.push(`Quality: ${sl.quality}`);
    if (sl.schedule) parts.push(`Schedule: ${sl.schedule}`);
    if (sl.roomTemp) parts.push(`Room temp: ${sl.roomTemp}`);
    if (sl.issues && sl.issues.length) parts.push(`Issues: ${sl.issues.join(', ')}`);
    if (sl.environment && sl.environment.length) parts.push(`Environment: ${sl.environment.join(', ')}`);
    if (sl.practices && sl.practices.length) parts.push(`Practices: ${sl.practices.join(', ')}`);
    ctx += parts.join('. ') + '\n';
    if (sl.note) ctx += `Notes: ${sl.note}\n`;
    ctx += `[/section:sleepRest]\n\n`;
  }

  // ── 12. Light & Circadian ──
  const lc = state.importedData.lightCircadian;
  const autoLat = getLatitudeFromLocation();
  if (lc || autoLat) {
    ctx += `[section:lightCircadian]\n## Light & Circadian\n`;
    const parts = [];
    if (lc) {
      if (lc.amLight) parts.push(`Morning light: ${lc.amLight}`);
      if (lc.daytime) parts.push(`Daytime outdoor: ${lc.daytime}`);
      if (lc.uvExposure) parts.push(`UV exposure: ${lc.uvExposure}`);
      if (lc.evening && lc.evening.length) parts.push(`Evening light: ${lc.evening.join(', ')}`);
      if (lc.screenTime) parts.push(`Daily screen time: ${lc.screenTime}`);
      if (lc.techEnv && lc.techEnv.length) parts.push(`Tech environment: ${lc.techEnv.join(', ')}`);
      if (lc.cold) parts.push(`Cold exposure: ${lc.cold}`);
      if (lc.grounding) parts.push(`Grounding: ${lc.grounding}`);
      if (lc.mealTiming && lc.mealTiming.length) parts.push(`Meal timing: ${lc.mealTiming.join(', ')}`);
    }
    if (autoLat) parts.push(`Latitude: ${autoLat}`);
    const loc = getProfileLocation();
    if (loc.country) parts.push(`Location: ${loc.country}${loc.zip ? ' ' + loc.zip : ''}`);
    ctx += parts.join('. ') + '\n';
    if (lc && lc.note) ctx += `Notes: ${lc.note}\n`;
    ctx += `[/section:lightCircadian]\n\n`;
  }

  // ── 13. Stress ──
  const st = state.importedData.stress;
  if (hasCardContent(st)) {
    ctx += `[section:stress]\n## Stress\n`;
    const parts = [];
    if (st.level) parts.push(`Level: ${st.level}`);
    if (st.sources && st.sources.length) parts.push(`Sources: ${st.sources.join(', ')}`);
    if (st.management && st.management.length) parts.push(`Management: ${st.management.join(', ')}`);
    ctx += parts.join('. ') + '\n';
    if (st.note) ctx += `Notes: ${st.note}\n`;
    ctx += `[/section:stress]\n\n`;
  }

  // ── 14. Love Life & Sexual Health ──
  const ll = state.importedData.loveLife;
  if (hasCardContent(ll)) {
    ctx += `[section:loveLife]\n## Love Life & Sexual Health\n`;
    const parts = [];
    if (ll.status) parts.push(`Status: ${ll.status}`);
    if (ll.relationship) parts.push(`Relationship quality: ${ll.relationship}`);
    if (ll.satisfaction) parts.push(`Satisfaction: ${ll.satisfaction}`);
    if (ll.libido) parts.push(`Libido: ${ll.libido}`);
    if (ll.frequency) parts.push(`Sexual frequency: ${ll.frequency}`);
    if (ll.orgasm) parts.push(`Orgasm: ${ll.orgasm}`);
    if (ll.concerns && ll.concerns.length) parts.push(`Concerns: ${ll.concerns.join(', ')}`);
    ctx += parts.join('. ') + '\n';
    if (ll.note) ctx += `Notes: ${ll.note}\n`;
    ctx += `[/section:loveLife]\n\n`;
  }

  // ── 15. Environment ──
  const env = state.importedData.environment;
  if (hasCardContent(env)) {
    ctx += `[section:environment]\n## Environment\n`;
    const parts = [];
    if (env.setting) parts.push(`Setting: ${env.setting}`);
    if (env.climate) parts.push(`Climate: ${env.climate}`);
    if (env.water) parts.push(`Water: ${env.water}`);
    if (env.waterConcerns && env.waterConcerns.length) parts.push(`Water concerns: ${env.waterConcerns.join(', ')}`);
    if (env.emf && env.emf.length) parts.push(`EMF exposure: ${env.emf.join(', ')}`);
    if (env.emfMitigation && env.emfMitigation.length) parts.push(`EMF mitigation: ${env.emfMitigation.join(', ')}`);
    if (env.homeLight) parts.push(`Home lighting: ${env.homeLight}`);
    if (env.air && env.air.length) parts.push(`Air quality: ${env.air.join(', ')}`);
    if (env.toxins && env.toxins.length) parts.push(`Toxin exposure: ${env.toxins.join(', ')}`);
    if (env.building) parts.push(`Building: ${env.building}`);
    ctx += parts.join('. ') + '\n';
    if (env.note) ctx += `Notes: ${env.note}\n`;
    ctx += `[/section:environment]\n\n`;
  }

  // ── 16. EMF Assessment (sub-section of Environment) ──
  const emf = state.importedData.emfAssessment;
  if (emf && emf.assessments && emf.assessments.length > 0) {
    ctx += `### EMF Assessment (Baubiologie SBM-2015)\n`;
    const sorted = [...emf.assessments].sort((a, b) => b.date.localeCompare(a.date));
    const latest = sorted[0];
    ctx += `Assessment: ${fmtDate(latest.date)}${latest.label ? ' (' + latest.label + ')' : ''}${latest.consultant ? ' by ' + latest.consultant : ''}\n`;
    for (const room of latest.rooms) {
      const sleeping = room.sleeping !== false;
      ctx += `  ${room.name}${room.location ? ' (' + room.location + ')' : ''}${sleeping ? ' [sleeping area]' : ''}:\n`;
      for (const [type, m] of Object.entries(room.measurements || {})) {
        if (m && m.value != null) {
          const sev = getEMFSeverity(type, m.value, sleeping);
          const def = SBM_2015_THRESHOLDS[type];
          ctx += `    ${def.name}: ${m.value} ${m.unit}${sev ? ' — ' + sev.label : ''}\n`;
        }
      }
      if (room.sources && room.sources.length) ctx += `    Sources: ${room.sources.join(', ')}\n`;
      if (room.mitigations && room.mitigations.length) ctx += `    Mitigations: ${room.mitigations.join(', ')}\n`;
    }
    if (sorted.length > 1) ctx += `(${sorted.length - 1} earlier assessment${sorted.length > 2 ? 's' : ''} also on file)\n`;
    if (latest.interpretation && latest.interpretation.text) {
      ctx += `\nAI Interpretation (${latest.interpretation.date ? new Date(latest.interpretation.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'recent'}):\n${latest.interpretation.text}\n`;
    }
    ctx += '\n';
  }

  // ── 17. Context Change Timeline ──
  const changeHistory = state.importedData.changeHistory || [];
  if (changeHistory.length > 0) {
    const fieldLabels = { diet: 'Diet & Digestion', exercise: 'Exercise', sleepRest: 'Sleep & Rest', lightCircadian: 'Light & Circadian', stress: 'Stress', loveLife: 'Love Life', environment: 'Environment', diagnoses: 'Medical Conditions', healthGoals: 'Health Goals', interpretiveLens: 'Interpretive Lens', contextNotes: 'Context Notes', menstrualCycle: 'Menstrual Cycle' };
    // Group by field, sorted by date
    const sorted = [...changeHistory].sort((a, b) => a.date.localeCompare(b.date));
    // Build timeline with diffs between consecutive snapshots per field
    const lines = [];
    const byField = {};
    for (const entry of sorted) {
      if (!byField[entry.field]) byField[entry.field] = [];
      byField[entry.field].push(entry);
    }
    for (const entry of sorted) {
      const label = fieldLabels[entry.field] || entry.field;
      const fieldEntries = byField[entry.field];
      const idx = fieldEntries.indexOf(entry);
      const prev = idx > 0 ? fieldEntries[idx - 1].snapshot : null;
      const diff = summarizeChange(entry.field, prev, entry.snapshot);
      if (diff) lines.push(`- ${fmtDate(entry.date)}: ${label} — ${diff}`);
    }
    if (lines.length > 0) {
      ctx += `[section:changeTimeline]\n## Context Change Timeline\n`;
      ctx += lines.join('\n') + '\n[/section:changeTimeline]\n\n';
    }
  }

  // ── 18. Additional Context Notes ──
  const ctxNotes = state.importedData.contextNotes || '';
  if (ctxNotes.trim()) {
    ctx += `[section:contextNotes]\n## Additional Context Notes\n${ctxNotes.trim()}\n[/section:contextNotes]\n\n`;
  }

  return ctx;
}

// ═══════════════════════════════════════════════
// CONTEXT SUMMARY (snapshot what data areas were sent)
// ═══════════════════════════════════════════════
export function getContextSummary() {
  const areas = [];
  const data = getActiveData();
  // Lab values
  const markerCount = Object.values(data.categories).reduce((sum, cat) =>
    sum + Object.values(cat.markers).filter(m => m.values.some(v => v !== null)).length, 0);
  if (markerCount > 0) areas.push({ label: 'Lab values', detail: `${markerCount} markers` });
  // Context cards
  const diag = state.importedData.diagnoses;
  if (diag && ((diag.conditions && diag.conditions.length) || diag.note)) areas.push({ label: 'Medical Conditions', detail: diag.conditions ? `${diag.conditions.length} condition${diag.conditions.length !== 1 ? 's' : ''}` : 'notes' });
  if (state.importedData.diet) areas.push({ label: 'Diet & Digestion', detail: state.importedData.diet.type || 'filled' });
  if (state.importedData.exercise) areas.push({ label: 'Exercise', detail: state.importedData.exercise.frequency || 'filled' });
  if (state.importedData.sleepRest) areas.push({ label: 'Sleep & Rest', detail: state.importedData.sleepRest.duration || 'filled' });
  const lc = state.importedData.lightCircadian;
  const autoLat = getLatitudeFromLocation();
  if (lc || autoLat) areas.push({ label: 'Light & Circadian', detail: autoLat ? `lat ${autoLat}` : 'filled' });
  if (state.importedData.stress) areas.push({ label: 'Stress', detail: state.importedData.stress.level || 'filled' });
  if (state.importedData.loveLife) areas.push({ label: 'Love Life', detail: 'filled' });
  if (state.importedData.environment) areas.push({ label: 'Environment', detail: state.importedData.environment.setting || 'filled' });
  const emfData = state.importedData.emfAssessment;
  if (emfData && emfData.assessments && emfData.assessments.length > 0) areas.push({ label: 'EMF Assessment', detail: `${emfData.assessments.length} assessment${emfData.assessments.length !== 1 ? 's' : ''}` });
  // Goals, lens, notes
  const goals = state.importedData.healthGoals || [];
  if (goals.length > 0) areas.push({ label: 'Health Goals', detail: `${goals.length} goal${goals.length !== 1 ? 's' : ''}` });
  const lens = state.importedData.interpretiveLens || '';
  if (lens.trim()) areas.push({ label: 'Interpretive Lens', detail: 'set' });
  const ctxNotes = state.importedData.contextNotes || '';
  if (ctxNotes.trim()) areas.push({ label: 'Context Notes', detail: 'set' });
  // Cycle
  const mc = state.importedData.menstrualCycle;
  if (mc && state.profileSex === 'female') areas.push({ label: 'Menstrual Cycle', detail: `${mc.cycleLength || 28}-day` });
  // Supplements
  const supps = state.importedData.supplements || [];
  if (supps.length > 0) areas.push({ label: 'Supplements', detail: `${supps.length} item${supps.length !== 1 ? 's' : ''}` });
  // Notes
  const notes = state.importedData.notes || [];
  if (notes.length > 0) areas.push({ label: 'User Notes', detail: `${notes.length} note${notes.length !== 1 ? 's' : ''}` });
  // Flagged
  const flags = getAllFlaggedMarkers(data);
  if (flags.length > 0) areas.push({ label: 'Flagged Results', detail: `${flags.length} flagged` });
  return areas;
}

Object.assign(window, {
  buildLabContext,
  invalidateLabContextCache,
  getContextSummary,
  isGroupInAIContext,
  setGroupInAIContext,
});
