// @ts-check
// lab-context.js — Lab context assembly for AI (buildLabContext + helpers)

import { state } from './state.js';
import { SBM_2015_THRESHOLDS, getEMFSeverity } from './schema.js';
import { getStatus, hasCardContent, isDebugMode } from './utils.js';
import { formatTime } from './theme.js';
import { getActiveData } from './data.js';
import { getDnaModuleFunction } from './dna-runtime-bridge.js';
import { getAllFlaggedMarkers, getEffectiveRangeForDate, getEffectiveRangeLabelForDate, getLatestValueIndex } from './marker-analysis.js';
import { getProfileHeight, getProfileLocation, getLatitudeFromLocation } from './profile.js';
import {
  detectCycleIronAlertsRuntime as detectCycleIronAlerts,
  detectCyclePerimenopausePatternRuntime as detectPerimenopausePattern,
  getCycleBloodDrawPhasesRuntime as getBloodDrawPhases,
  getCycleNextBestDrawDateRuntime as getNextBestDrawDate,
} from './cycle-runtime.js';
import { isHormonalContraception, recentCyclePeriods, upgradeMenstrualCycleProfile } from './cycle-summary.js';
import { buildMitochondrialEvidenceContext } from './supplement-warnings.js';
import { scanDietForContaminants } from './food-contaminants.js';
import { buildSupplementAIContext, resolveSupplementContextMode } from './supplement-context.js';
import { getCurrentSupplements, getSupplementsOverlappingRange } from './supplement-medication-domain.js';
import {
  buildWearableContext,
  getSleepContextMismatch,
  isWearableContextEnabled,
} from './lab-context-wearables.js';
import {
  getCachedLabContext,
  getLabContextFingerprint,
  isGeneticsInventoryInAIContext,
  isGeneticsPriorityInAIContext,
  isGeneticsSummaryInAIContext,
  isGroupInAIContext,
  isInsightContextCardsEnabled,
  isLabMarkersContextEnabled,
  isLightSunContextEnabled,
  isSupplementsMedsContextEnabled,
  setCachedLabContext,
} from './lab-context-settings.js';
import { buildContextChangeTimeline } from './lab-context-change-timeline.js';
import { resolveActiveMarkerPath } from './marker-placement.js';
import { buildLabCollectionContextSection } from './lab-context-collection.js';
import { labContextDeps } from './lab-context-runtime.js';
export { configureLabContext } from './lab-context-runtime.js';

/**
 * @typedef {{ skipGroupFilter?: boolean, ignoreContextToggles?: boolean, queryText?: string, supplementContextMode?: 'compact'|'detail' }} LabContextOptions
 */


function markerNameForStorageDotKey(data, dotKey) {
  const [categoryKey, markerKey] = String(dotKey || '').split('.');
  return resolveActiveMarkerPath(data.categories, categoryKey, markerKey)?.marker?.name || dotKey;
}


export {
  buildWearableContext, buildWearableSeriesSection, getAgentWearableSeriesDays,
  getSleepContextMismatch, isAgentWearableSeriesEnabled, isWearableContextEnabled, setAgentWearableSeriesDays,
  setAgentWearableSeriesEnabled,
} from './lab-context-wearables.js';
export {
  invalidateLabContextCache, isGeneticsInventoryInAIContext, isGeneticsPriorityInAIContext,
  isGeneticsSummaryInAIContext, isGroupInAIContext, isInsightContextCardsEnabled,
  isLabMarkersContextEnabled, isLightSunContextEnabled, isSupplementsMedsContextEnabled,
  setGeneticsInventoryInAIContext, setGeneticsPriorityInAIContext,
  setGeneticsSummaryInAIContext, setGroupInAIContext, setInsightContextCardsEnabled,
  setLabMarkersContextEnabled, setLightSunContextEnabled, setSupplementsMedsContextEnabled,
  setWearableContextEnabled,
} from './lab-context-settings.js';
export { getContextSummary, injectLensChunks } from './lab-context-output.js';

// ═══════════════════════════════════════════════
// LAB CONTEXT
// ═══════════════════════════════════════════════
// Sun context follows the same rule as other context sources: include the
// standard section whenever data exists, without brittle keyword detection.

export function buildLabContext(/** @type {LabContextOptions} */ { skipGroupFilter, ignoreContextToggles, queryText } = {}) {
  // skipGroupFilter: true → include all specialty groups regardless of AI toggle
  // ignoreContextToggles: true → Agent Access permission already granted; assemble full context
  const supplementContextMode = resolveSupplementContextMode(queryText, state.importedData.supplements || []);
  const fp = getLabContextFingerprint() + (skipGroupFilter ? ':all' : '') + (ignoreContextToggles ? ':ignore-context-toggles' : '') + `:supplements-${supplementContextMode}`;
  const cached = getCachedLabContext(fp);
  if (cached) {
    if (isDebugMode()) console.log('[AI] Lab context cache hit');
    return cached;
  }
  if (isDebugMode()) console.log('[AI] Lab context cache miss — rebuilding');
  const ctx = _buildLabContextInner({ skipGroupFilter, ignoreContextToggles, supplementContextMode });
  setCachedLabContext(fp, ctx);
  return ctx;
}

function _buildLabContextInner(/** @type {LabContextOptions} */ { skipGroupFilter, ignoreContextToggles, supplementContextMode = 'compact' } = {}) {
  const data = getActiveData();
  const includeLabMarkers = ignoreContextToggles || isLabMarkersContextEnabled();
  const hasImportedLabData = data.dates.length > 0 || Object.values(data.categories).some(c => c.singleDate);
  const hasLabData = includeLabMarkers && hasImportedLabData;
  const includeInsightCards = ignoreContextToggles || isInsightContextCardsEnabled();
  const includeSupplementsMeds = ignoreContextToggles || isSupplementsMedsContextEnabled();
  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const sexLabel = state.profileSex === 'female' ? 'female' : state.profileSex === 'male' ? 'male' : 'not specified';
  const age = state.profileDob ? Math.floor((Date.now() - new Date(state.profileDob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
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
    ctx = `Profile context (sex: ${sexLabel}${age !== null ? ', age: ' + age : ''}, today: ${today}):\n\n`;
    if (hasImportedLabData && !includeLabMarkers) {
      ctx += `Lab marker context is turned off by the user. Do not infer from imported blood-marker values unless the user explicitly provides them in the conversation.\n\n`;
    } else {
      const insightHint = includeInsightCards
        ? ' The more Insight Context Cards the user fills out, the more targeted your recommendations become — encourage filling them when relevant.'
        : ' Insight Context Cards are turned off by the user; do not infer from profile/lifestyle cards unless the user explicitly provides that context in the conversation.';
      ctx += `No lab data has been imported yet.\nNOTE: The user has not imported any lab results. Use the enabled context below to recommend which blood panels and specific tests would be most valuable for them, and explain why each is relevant to their situation.${insightHint}${demoWarning}\n\n`;
    }
  }

  // ── Staleness signal ──
  if (hasLabData && data.dates.length > 0) {
    const lastDate = data.dates[data.dates.length - 1];
    const daysSince = Math.round((Date.now() - new Date(lastDate + 'T00:00:00').getTime()) / (24 * 3600 * 1000));
    if (daysSince > 90) {
      const monthsAgo = Math.round(daysSince / 30.44);
      ctx += `NOTE: Most recent lab results are from ${fmtDate(lastDate)} (approximately ${monthsAgo} months ago). Values may have changed.\n\n`;
    }
  }

  // ── 1. Health Goals (top priority — "what are you trying to solve?") ──
  const healthGoals = state.importedData.healthGoals || [];
  if (includeInsightCards && healthGoals.length > 0) {
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

  if (hasLabData) {
    ctx += buildLabCollectionContextSection(state.importedData.entries || []);
  }

  // ── 3. Lab values by category ("what do the numbers say?") ──
  if (hasLabData) {
    // Build index of active lab categories
    const _activeCatKeys = [];
    for (const [_ck, _ct] of Object.entries(data.categories)) {
      if (!skipGroupFilter && !ignoreContextToggles && _ct.group && !isGroupInAIContext(_ct.group)) continue;
      if (Object.entries(_ct.markers).some(([_, m]) => m.values.some(v => v !== null))) _activeCatKeys.push(_ck);
    }
    if (_activeCatKeys.length > 0) {
      ctx += `[index]\nAvailable sections: ${_activeCatKeys.join(', ')}\n[/index]\n\n`;
    }

    const rangeLabel = state.rangeMode === 'optimal' ? 'optimal' : 'reference';
    ctx += `Note: status labels below use ${rangeLabel} ranges.\n\n`;
    ctx += labContextDeps.buildBiologyScoresAIContext?.(data, { limit: 7, ignoreContextToggles }) || '';
    for (const [catKey, cat] of Object.entries(data.categories)) {
      if (!skipGroupFilter && !ignoreContextToggles && cat.group && !isGroupInAIContext(cat.group)) continue;
      const markersWithData = Object.entries(cat.markers).filter(([_, m]) => m.values.some(v => v !== null));
      if (markersWithData.length === 0) continue;
      const _catDate = cat.singleDate || (() => { for (let i = data.dates.length - 1; i >= 0; i--) { if (markersWithData.some(([_, m]) => m.values[i] !== null)) return data.dates[i]; } return null; })();
      ctx += `[section:${catKey}${_catDate ? ' updated:' + _catDate : ''}]\n## ${cat.label}\n`;
      for (const [, m] of markersWithData) {
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
              const msSpan = new Date(last.d + 'T00:00:00').getTime() - new Date(first.d + 'T00:00:00').getTime();
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
        } else if (m.contextRefRanges || m.contextOptimalRanges) {
          const parts = m.values.map((v, i) => {
            if (v === null) return null;
            const mr = getEffectiveRangeForDate(m, i);
            const label = getEffectiveRangeLabelForDate(m, i);
            const s = mr.min != null || mr.max != null ? getStatus(v, mr.min, mr.max) : 'unrated';
            const rangeStr = mr.min != null || mr.max != null
              ? `${mr.min ?? '–'}\u2013${mr.max ?? '–'}`
              : 'not set';
            return `${data.dates[i]}: ${v} [${label} ${rangeStr}, ${s}]`;
          }).filter(Boolean).join(', ');
          ctx += `- ${m.name}: ${parts} ${m.unit}${trajectory}\n`;
        } else {
          const vals = m.singlePoint
            ? m.values.filter(v => v !== null).map(v => `${v}`).join('')
            : m.values.map((v, i) => v !== null ? `${data.dates[i]}: ${v}` : null).filter(Boolean).join(', ');
          const mr = getEffectiveRangeForDate(m, latestIdx);
          const rangeLabel = getEffectiveRangeLabelForDate(m, latestIdx).toLowerCase();
          const status = latestIdx !== -1
            ? (mr.min != null || mr.max != null ? getStatus(m.values[latestIdx], mr.min, mr.max) : 'unrated')
            : 'no data';
          const refStr = mr.min != null || mr.max != null ? `${rangeLabel}: ${mr.min ?? '–'}\u2013${mr.max ?? '–'}, ` : '';
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
        const catDaysSince = Math.round((Date.now() - new Date(catLatestDate + 'T00:00:00').getTime()) / (24 * 3600 * 1000));
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
      return !cat?.group || skipGroupFilter || ignoreContextToggles || isGroupInAIContext(cat.group);
    });
    if (flags.length > 0) {
      ctx += `[critical]\nFlagged markers (details in sections above): ${flags.map(f => `${f.categoryKey}.${f.markerKey}`).join(', ')}\n`;
      ctx += `[/critical]\n\n`;
    }
  }

  // ── 5. User Notes ──
  const notes = (state.importedData.notes || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (includeInsightCards && notes.length > 0) {
    ctx += `[section:userNotes]\n## User Notes\n`;
    for (const n of notes) {
      ctx += `- ${fmtDate(n.date)}: ${n.text}\n`;
    }
    ctx += `[/section:userNotes]\n\n`;
  }

  // ── 5b. Marker Notes ──
  const markerNotes = state.importedData.markerNotes || {};
  const mnKeys = Object.keys(markerNotes);
  if (includeLabMarkers && mnKeys.length > 0) {
    ctx += `[section:markerNotes]\n## Marker Notes\n`;
    for (const key of mnKeys) {
      const mName = markerNameForStorageDotKey(data, key);
      ctx += `- ${mName}: ${markerNotes[key]}\n`;
    }
    ctx += `[/section:markerNotes]\n\n`;
  }

  // ── 5c. Per-Value Notes ──
  // Context attached to a single (marker, date) reading — e.g. "fasted 14h",
  // "retake of low value", "different lab". Distinct from markerNotes (which
  // are overall per-marker thoughts) — these reframe a specific data point.
  const mvNotes = state.importedData.markerValueNotes || {};
  const mvKeys = Object.keys(mvNotes);
  if (includeLabMarkers && mvKeys.length > 0) {
    // Group by marker so an AI scanning a single biomarker's history sees its
    // value-level annotations contiguously. Sort dates ascending within each
    // marker for chronological reading.
    const byMarker = new Map();
    for (const key of mvKeys) {
      const colonIdx = key.lastIndexOf(':');
      if (colonIdx === -1) continue;
      const dotKey = key.slice(0, colonIdx);
      const date = key.slice(colonIdx + 1);
      if (!byMarker.has(dotKey)) byMarker.set(dotKey, []);
      byMarker.get(dotKey).push({ date, note: mvNotes[key] });
    }
    ctx += `[section:markerValueNotes]\n## Per-Value Notes (context tied to specific readings)\n`;
    for (const [dotKey, entries] of byMarker) {
      const mName = markerNameForStorageDotKey(data, dotKey);
      entries.sort((a, b) => a.date.localeCompare(b.date));
      for (const e of entries) {
        ctx += `- ${mName} on ${e.date}: ${e.note}\n`;
      }
    }
    ctx += `[/section:markerValueNotes]\n\n`;
  }

  // ── 6. Medical History ("what medical context applies?") ──
  const diag = state.importedData.diagnoses;
  if (includeInsightCards && hasCardContent(diag)) {
    ctx += `[section:diagnoses]\n## Medical History / Diagnoses\n`;
    if (diag.conditions && diag.conditions.length) {
      for (const c of diag.conditions) {
        const qualifiers = [c.severity, c.status, c.since ? `since ${c.since}` : ''].filter(Boolean);
        ctx += `- ${c.name}${qualifiers.length ? ` (${qualifiers.join(', ')})` : ''}\n`;
      }
    }
    if (Array.isArray(diag.familyHistory) && diag.familyHistory.length) {
      ctx += `### Family history (heritable/environmental risk signal)\n`;
      for (const e of diag.familyHistory) {
        const rel = (e.relative || '').replace(/_/g, ' ');
        const age = (e.onsetAge != null && e.onsetAge !== '') ? `, onset age ${e.onsetAge}` : '';
        const note = e.note ? ` — ${e.note}` : '';
        ctx += `- ${rel}: ${e.condition || ''}${age}${note}\n`;
      }
    }
    if (diag.proceduresNote) ctx += `Major procedures / organ changes: ${diag.proceduresNote}\n`;
    const interpretationFlagLabels = {
      lowMuscleMass: 'Low muscle mass / creatinine may be unreliable',
      hormoneTherapy: 'Hormone therapy / TRT / hormonal contraception',
      postmenopause: 'Postmenopause / no active cycle',
      intenseTrainingRecent: 'Recent intense training near blood draw',
      acuteIllnessNearDraw: 'Acute illness / infection / injury near blood draw',
    };
    const activeInterpretationFlags = Object.entries(diag.flags || {})
      .filter(([, active]) => active)
      .map(([key]) => interpretationFlagLabels[key] || key);
    if (activeInterpretationFlags.length) ctx += `Interpretation flags: ${activeInterpretationFlags.join('; ')}\n`;
    if (diag.note) ctx += `Notes: ${diag.note}\n`;
    ctx += `[/section:diagnoses]\n\n`;
  }

  // ── 7. Supplements & Medications ──
  const allSupps = state.importedData.supplements || [];
  const relevantSupps = data?.dates?.length
    ? getSupplementsOverlappingRange(allSupps, data.dates[0], data.dates[data.dates.length - 1])
    : getCurrentSupplements(allSupps);
  // A supplement-specific question may need a paused/ended course. Detail mode
  // remains bounded, but draws from the complete stored history.
  const supps = supplementContextMode === 'detail' ? allSupps : relevantSupps;
  if (includeSupplementsMeds && allSupps.length > 0) {
    ctx += `[section:supplements]\n## Supplements & Medications\n`;
    ctx += buildSupplementAIContext(supps, {
      mode: supplementContextMode,
      inventorySupplements: allSupps,
    });
    const mitochondrialEvidence = buildMitochondrialEvidenceContext(supps);
    if (mitochondrialEvidence) ctx += `\n${mitochondrialEvidence}`;
    ctx += `[/section:supplements]\n\n`;
  }

  // ── 7b. Biometrics ──
  const bio = state.importedData.biometrics;
  const _profileHeight = getProfileHeight(state.currentProfile);
  const profileHeightCm = Number(_profileHeight.height) || 0;
  if (includeInsightCards && (profileHeightCm || (bio && (bio.weight?.length || bio.bp?.length || bio.pulse?.length)))) {
    ctx += `[section:biometrics]\n## Biometrics\n`;
    if (profileHeightCm) {
      const htCm = profileHeightCm;
      const htLabel = state.unitSystem === 'US'
        ? `${Math.floor(htCm / 2.54 / 12)}' ${Math.round(htCm / 2.54 % 12)}"`
        : `${htCm} cm`;
      ctx += `Height: ${htLabel}\n`;
    }
    if (bio?.weight?.length) {
      const sorted = [...bio.weight].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const latest = sorted[0];
      const latestKg = latest.unit === 'lbs' ? latest.value / 2.205 : latest.value;
      ctx += `Weight (latest ${latest.date}): ${latest.value} ${latest.unit}`;
      if (sorted.length > 1) {
        const recent = sorted.slice(0, 6);
        const avgKg = recent.reduce((s, e) => s + (e.unit === 'lbs' ? e.value / 2.205 : e.value), 0) / recent.length;
        ctx += ` (avg last ${recent.length}: ${avgKg.toFixed(1)} kg)`;
      }
      ctx += '\n';
      if (profileHeightCm) {
        const htM = profileHeightCm / 100;
        const bmi = (latestKg / (htM * htM)).toFixed(1);
        ctx += `BMI: ${bmi}\n`;
      }
    }
    if (bio?.bp?.length) {
      const sorted = [...bio.bp].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
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
      const sorted = [...bio.pulse].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
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
  const snpCount = Object.keys(genetics?.snps || {}).length;
  const hasGeneticsData = !!(genetics && (snpCount > 0 || genetics.mtdna || genetics.apoe));
  const includeGeneticsSummary = ignoreContextToggles || isGeneticsSummaryInAIContext();
  const includeGeneticsPriority = ignoreContextToggles || isGeneticsPriorityInAIContext();
  const includeSnpInventory = ignoreContextToggles || isGeneticsInventoryInAIContext();
  if (hasGeneticsData && (includeGeneticsSummary || includeGeneticsPriority || includeSnpInventory)) {
    // Collect active marker keys to filter relevant SNPs
    const activeMarkerKeys = hasLabData ? Object.entries(data.categories).flatMap(([catKey, cat]) =>
      Object.entries(cat.markers).filter(([_, m]) => m.values.some(v => v !== null)).map(([key]) => `${catKey}.${key}`)
    ) : [];
    const buildGeneticsContext = getDnaModuleFunction('buildGeneticsContext');
    const geneticsCtx = buildGeneticsContext
      ? buildGeneticsContext(genetics, activeMarkerKeys, {
        includeGenomeSummary: includeGeneticsSummary,
        includePriorityFindings: includeGeneticsPriority,
        includeSnpInventory,
      })
      : '';
    if (geneticsCtx) {
      ctx += `[section:genetics]\n${geneticsCtx}\n[/section:genetics]\n\n`;
    }
  }

  // ── 8b. Wearables ──
  if (ignoreContextToggles || isWearableContextEnabled()) {
    const wearableCtx = buildWearableContext(state.importedData);
    if (wearableCtx) ctx += `[section:wearables]\n${wearableCtx}\n[/section:wearables]\n\n`;
  }

  // ── 9. Menstrual Cycle (female only) ──
  const mc = state.importedData.menstrualCycle ? upgradeMenstrualCycleProfile(state.importedData.menstrualCycle) : null;
  if (includeInsightCards && mc && state.profileSex === 'female') {
    const regLabel = mc.regularity === 'very_irregular' ? 'very irregular' : mc.regularity || 'regular';
    ctx += `[section:menstrualCycle]\n## Menstrual Cycle\n`;
    const statusCtx = { perimenopause: 'Status: Perimenopause (irregular/transitional).', postmenopause: 'Status: Postmenopause (no active cycle).', pregnant: 'Status: Currently pregnant.', breastfeeding: 'Status: Currently breastfeeding (postpartum).', absent: 'Status: No active menstrual cycle.' };
    if (mc.cycleStatus && statusCtx[mc.cycleStatus]) {
      ctx += statusCtx[mc.cycleStatus];
    } else {
      ctx += `Profile: ${mc.cycleLength || 28}-day cycle (${mc.periodLength || 5}-day period), ${regLabel}, ${mc.flow || 'moderate'} flow.`;
    }
    if (mc.contraceptive) {
      const isHormonal = isHormonalContraception(mc.contraceptive);
      ctx += ` Contraceptive: ${mc.contraceptive}${isHormonal ? ' (HORMONAL — suppresses natural cycle phases; phase-specific hormone ranges do NOT apply)' : ''}.`;
    }
    if (mc.conditions) ctx += ` Conditions: ${mc.conditions}.`;
    ctx += '\n';
    const coverage = mc.coverage || {};
    if (coverage.periodCount || coverage.firstDate || coverage.lastDate) {
      const sourceNames = Object.keys(coverage.sources || {});
      const sourceText = sourceNames.length ? `, sources: ${sourceNames.join(', ')}` : '';
      ctx += `Coverage: ${coverage.periodCount || 0} observed periods`;
      if (coverage.observationCount) ctx += `, ${coverage.observationCount} local daily observations`;
      if (coverage.firstDate || coverage.lastDate) ctx += `, ${coverage.firstDate || '?'} to ${coverage.lastDate || '?'}`;
      ctx += `${sourceText}.\n`;
    }
    const summary = mc.historySummary || {};
    if (summary.recent12?.avgCycle || summary.recent12?.range || summary.recent12?.heavyRate != null) {
      const parts = [];
      if (summary.recent12.avgCycle) parts.push(`avg ${summary.recent12.avgCycle}d`);
      if (summary.recent12.range) parts.push(`range ${summary.recent12.range[0]}-${summary.recent12.range[1]}d`);
      if (summary.recent12.variability) parts.push(`${summary.recent12.variability} variability`);
      if (summary.recent12.heavyRate != null) parts.push(`heavy flow ${Math.round(summary.recent12.heavyRate * 100)}%`);
      ctx += `Recent 12 cycles: ${parts.join(', ')}.\n`;
    }
    if (summary.last12Months?.avgCycle || summary.last12Months?.variability || summary.allTime?.periodCount) {
      const parts = [];
      if (summary.last12Months?.avgCycle) parts.push(`last 12 months avg ${summary.last12Months.avgCycle}d`);
      if (summary.last12Months?.variability) parts.push(`${summary.last12Months.variability} variability`);
      if (summary.allTime?.avgCycle) parts.push(`all-time avg ${summary.allTime.avgCycle}d across ${summary.allTime.periodCount || 0} periods`);
      ctx += `Longitudinal cycle summary: ${parts.join('; ')}.\n`;
    }
    if (Array.isArray(summary.flags) && summary.flags.length) {
      ctx += `Cycle pattern flags: ${summary.flags.join('; ')}.\n`;
    }
    const periods = recentCyclePeriods(mc, 12);
    if (periods.length > 0) {
      const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      ctx += `Recent periods: ${periods.map(p => {
        let desc = `${fmtD(p.startDate)}-${fmtD(p.endDate)} (${p.flow})`;
        if (p.symptoms?.length) desc += ` [${p.symptoms.join(', ')}]`;
        if (p.source && p.source !== 'manual') desc += ` source:${p.source}`;
        return desc;
      }).join(', ')}\n`;
    }
    const _isActiveCycleCtx = !mc.cycleStatus || mc.cycleStatus === 'regular' || mc.cycleStatus === 'perimenopause';
    const _isHormonalBCCtx = isHormonalContraception(mc.contraceptive);
    if (_isActiveCycleCtx && !_isHormonalBCCtx) {
      if (data.dates.length > 0) {
        const phases = getBloodDrawPhases(mc, data.dates, data.entryContextByDate);
        const phaseDates = Object.entries(phases);
        if (phaseDates.length > 0) {
          ctx += `\nBlood draw cycle context:\n`;
          for (const [date, p] of phaseDates) {
            const basis = p.basedOnStartDate ? `, based on period ${p.basedOnStartDate}` : '';
            const confidence = p.source === 'recorded'
              ? ', recorded with the blood draw'
              : p.confidence ? `, predicted with ${p.confidence} confidence` : ', predicted';
            const day = p.cycleDay ? `day ${p.cycleDay}, ` : '';
            ctx += `- ${fmtDate(date)}: ${day}${(p.phaseDetailName || p.phaseName).toLowerCase()} phase${confidence}${basis}\n`;
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
  if (includeInsightCards && hasCardContent(diet)) {
    ctx += `[section:diet]\n## Diet & Digestion\n`;
    const parts = [];
    if (diet.type) parts.push(`Type: ${diet.type}`);
    if (diet.pattern) parts.push(`Pattern: ${diet.pattern}`);
    if (diet.proteinIntake) parts.push(`Protein intake: ${diet.proteinIntake}`);
    if (diet.hydration) parts.push(`Daily fluid intake: ${diet.hydration}`);
    if (diet.restrictions && diet.restrictions.length) parts.push(`Restrictions: ${diet.restrictions.join(', ')}`);
    if (diet.alcohol) parts.push(`Alcohol: ${diet.alcohol}`);
    if (diet.caffeine) parts.push(`Caffeine: ${diet.caffeine}`);
    if (diet.caffeineTiming) parts.push(`Latest caffeine: ${diet.caffeineTiming}`);
    if (diet.recentChanges && diet.recentChanges.length) parts.push(`Recent changes: ${diet.recentChanges.join(', ')}`);
    if (parts.length) ctx += parts.join('. ') + '\n';
    if (diet.breakfast) ctx += `Breakfast${diet.breakfastTime ? ' (' + formatTime(diet.breakfastTime) + ')' : ''}: ${diet.breakfast}\n`;
    if (diet.lunch) ctx += `Lunch${diet.lunchTime ? ' (' + formatTime(diet.lunchTime) + ')' : ''}: ${diet.lunch}\n`;
    if (diet.dinner) ctx += `Dinner${diet.dinnerTime ? ' (' + formatTime(diet.dinnerTime) + ')' : ''}: ${diet.dinner}\n`;
    if (diet.snacks) ctx += `Snacks${diet.snacksTime ? ' (' + formatTime(diet.snacksTime) + ')' : ''}: ${diet.snacks}\n`;
    const dParts = [];
    if (diet.bowelFrequency) dParts.push(`Bowel frequency: ${diet.bowelFrequency}`);
    if (diet.stoolConsistency) dParts.push(`Stool consistency: ${diet.stoolConsistency}`);
    // Preserve explicit negatives: `null` is unanswered; `none` / `normal` means ruled out.
    if (diet.bloating) dParts.push(`Bloating: ${diet.bloating}`);
    if (diet.gas) dParts.push(`Gas: ${diet.gas}`);
    if (diet.acidReflux) dParts.push(`Acid reflux: ${diet.acidReflux}`);
    if (diet.burping) dParts.push(`Burping: ${diet.burping}`);
    if (diet.nausea) dParts.push(`Nausea: ${diet.nausea}`);
    if (diet.appetite) dParts.push(`Appetite: ${diet.appetite}`);
    if (diet.abdominalPain) dParts.push(`Abdominal pain: ${diet.abdominalPain}`);
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
  if (includeInsightCards && hasCardContent(ex)) {
    ctx += `[section:exercise]\n## Exercise & Movement\n`;
    const parts = [];
    if (ex.frequency) parts.push(`Frequency: ${ex.frequency}`);
    if (ex.types && ex.types.length) parts.push(`Types: ${ex.types.join(', ')}`);
    if (ex.intensity) parts.push(`Intensity: ${ex.intensity}`);
    if (ex.duration) parts.push(`Typical session: ${ex.duration}`);
    if (ex.dailyMovement) parts.push(`Daily movement: ${ex.dailyMovement}`);
    if (ex.muscleContext) parts.push(`Muscle context: ${ex.muscleContext}`);
    if (ex.limitations && ex.limitations.length) parts.push(`Limitations / recovery: ${ex.limitations.join(', ')}`);
    ctx += parts.join('. ') + '\n';
    if (ex.note) ctx += `Notes: ${ex.note}\n`;
    ctx += `[/section:exercise]\n\n`;
  }

  // ── 11. Sleep & Rest ──
  const sl = state.importedData.sleepRest;
  if (includeInsightCards && hasCardContent(sl)) {
    ctx += `[section:sleepRest]\n## Sleep & Rest\n`;
    const parts = [];
    if (sl.duration) parts.push(`Duration: ${sl.duration}`);
    if (sl.quality) parts.push(`Quality: ${sl.quality}`);
    if (sl.daytimeSleepiness) parts.push(`Daytime sleepiness: ${sl.daytimeSleepiness}`);
    if (sl.apneaStatus) parts.push(`Sleep apnea: ${sl.apneaStatus}`);
    if (sl.papUse) parts.push(`PAP / CPAP: ${sl.papUse}`);
    if (sl.naps) parts.push(`Naps: ${sl.naps}`);
    if (sl.schedule) parts.push(`Schedule: ${sl.schedule}`);
    if (sl.roomTemp) parts.push(`Room temp: ${sl.roomTemp}`);
    if (sl.issues && sl.issues.length) parts.push(`Issues: ${sl.issues.join(', ')}`);
    if (sl.environment && sl.environment.length) parts.push(`Environment: ${sl.environment.join(', ')}`);
    if (sl.practices && sl.practices.length) parts.push(`Practices: ${sl.practices.join(', ')}`);
    ctx += parts.join('. ') + '\n';
    if (sl.note) ctx += `Notes: ${sl.note}\n`;
    const sleepMismatch = (ignoreContextToggles || isWearableContextEnabled())
      ? getSleepContextMismatch(sl, state.importedData.wearableSummary)
      : null;
    if (sleepMismatch) ctx += `Data mismatch: ${sleepMismatch.summary}\n`;
    ctx += `[/section:sleepRest]\n\n`;
  }

  // ── 12. Light & Circadian ──
  const lc = state.importedData.lightCircadian;
  const autoLat = getLatitudeFromLocation();
  if ((ignoreContextToggles || isLightSunContextEnabled()) && (lc || autoLat)) {
    ctx += `[section:lightCircadian]\n## Light & Circadian\n`;
    const parts = [];
    if (lc) {
      if (lc.amLight) parts.push(`Morning light: ${lc.amLight}`);
      if (lc.daytime) parts.push(`Daytime outdoor: ${lc.daytime}`);
      if (lc.uvExposure) parts.push(`UV exposure: ${lc.uvExposure}`);
      if (lc.skinType) parts.push(`Skin type: ${lc.skinType}`);
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
  if (includeInsightCards && hasCardContent(st)) {
    ctx += `[section:stress]\n## Stress\n`;
    const parts = [];
    if (st.level) parts.push(`Level: ${st.level}`);
    if (st.duration) parts.push(`Duration: ${st.duration}`);
    if (st.trend) parts.push(`Trend: ${st.trend}`);
    if (st.sources && st.sources.length) parts.push(`Sources: ${st.sources.join(', ')}`);
    if (st.management && st.management.length) parts.push(`Management: ${st.management.join(', ')}`);
    ctx += parts.join('. ') + '\n';
    if (st.note) ctx += `Notes: ${st.note}\n`;
    ctx += `[/section:stress]\n\n`;
  }

  // ── 14. Love Life & Sexual Health ──
  const ll = state.importedData.loveLife;
  if (includeInsightCards && hasCardContent(ll)) {
    ctx += `[section:loveLife]\n## Love Life & Sexual Health\n`;
    const parts = [];
    if (ll.status) parts.push(`Status: ${ll.status}`);
    if (ll.relationship) parts.push(`Relationship quality: ${ll.relationship}`);
    if (ll.satisfaction) parts.push(`Satisfaction: ${ll.satisfaction}`);
    if (ll.libido) parts.push(`Libido: ${ll.libido}`);
    if (ll.libidoChange) parts.push(`Libido change: ${ll.libidoChange}`);
    if (ll.frequency) parts.push(`Sexual frequency: ${ll.frequency}`);
    if (ll.orgasm) parts.push(`Orgasm: ${ll.orgasm}`);
    if (ll.concerns && ll.concerns.length) parts.push(`Concerns: ${ll.concerns.join(', ')}`);
    if (ll.reproductiveGoals && ll.reproductiveGoals.length) parts.push(`Reproductive goals: ${ll.reproductiveGoals.join(', ')}`);
    ctx += parts.join('. ') + '\n';
    if (ll.note) ctx += `Notes: ${ll.note}\n`;
    ctx += `[/section:loveLife]\n\n`;
  }

  // ── 15. Environment ──
  const env = state.importedData.environment;
  if (includeInsightCards && hasCardContent(env)) {
    ctx += `[section:environment]\n## Environment\n`;
    const parts = [];
    if (env.setting) parts.push(`Setting: ${env.setting}`);
    if (env.climate) parts.push(`Climate: ${env.climate}`);
    if (env.altitude) parts.push(`Altitude exposure: ${env.altitude}`);
    if (env.inhaledExposures && env.inhaledExposures.length) parts.push(`Smoking / inhaled exposure: ${env.inhaledExposures.join(', ')}`);
    if (env.occupationalExposures && env.occupationalExposures.length) parts.push(`Work / hobby exposures: ${env.occupationalExposures.join(', ')}`);
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
  if (includeInsightCards && emf && emf.assessments && emf.assessments.length > 0) {
    ctx += `### EMF Assessment (Baubiologie SBM-2015)\n`;
    const sorted = [...emf.assessments].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
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
  ctx += buildContextChangeTimeline(changeHistory, {
    includeInsightCards,
    includeLightContext: ignoreContextToggles || isLightSunContextEnabled(),
    fmtDate,
  });

  // ── 18. Additional Context Notes ──
  const ctxNotes = state.importedData.contextNotes || '';
  if (includeInsightCards && ctxNotes.trim()) {
    ctx += `[section:contextNotes]\n## Additional Context Notes\n${ctxNotes.trim()}\n[/section:contextNotes]\n\n`;
  }

  // ── 19. Light & Sun lens — full standard tier when user has data ──
  // buildSunContext returns '' when there's nothing to show, so a
  // user without sessions pays zero tokens. Users with sessions get
  // the 30-day session table + biomarker correlations on every turn,
  // matching the pattern the rest of this file uses for every other
  // section (include if-data-exists, no keyword gating).
  if ((ignoreContextToggles || isLightSunContextEnabled()) && typeof labContextDeps.buildSunContext === 'function') {
    try {
      ctx += labContextDeps.buildSunContext({ tier: 'standard', ignoreContextToggles });
    } catch (e) { /* sun context is best-effort */ }
  }

  return ctx;
}
