// @ts-check
// biology-score-engine.js — shared primitives for the Biology Scores composite engine.

import { getEffectiveRangeForDate, getEffectiveRangeLabelForDate, getLatestValueIndex } from './marker-analysis.js';
import { getBiologyProfileContext } from './profile-context.js';
import { getInputProfileModifier, getScoreProfileFlags } from './biology-score-profile-modifiers.js';
import { UNIT_CONVERSIONS, OPTIMAL_RANGES } from './schema.js';
import { state } from './state.js';
import { getMarkerStorageDotKey, resolveActiveMarkerPath } from './marker-placement.js';
import { formatValue } from './utils.js';

export const TONE_LABELS = { excellent: 'Strong', good: 'Good', strained: 'Watch', poor: 'Low score', concerning: 'Concerning', significant: 'Significant', severe: 'Severe' };
export const SCORE_STALE_DAYS = 180;
export const SCORE_DATE_SPAN_DAYS = 90;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export function lerp(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return outMax;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function resolveScoreTone(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'strained';
  if (score >= 35) return 'poor';
  if (score >= 15) return 'concerning';
  return 'severe';
}

export function resolveScoreSeverity(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 50) return null;
  if (score >= 35) return 'mild';
  if (score >= 15) return 'moderate';
  return 'severe';
}

export function resolveCoverageLabel(coverage) {
  if (coverage >= 0.8) return 'high';
  if (coverage >= 0.45) return 'partial';
  return 'low';
}

export function contextOnlyNeedsMoreData(item) {
  if (!item?.profileContextOnly) return false;
  const reason = String(item.contextReason || '').toLowerCase();
  return /\bneeds?\b|missing|add .*context|before it can be scored|sample time|cycle day|cycle phase/.test(reason);
}

export function resolveScoreConfidence(result) {
  const coverage = Number(result?.coverage || 0);
  const coveredCoreGroups = new Set((result?.available || [])
    .filter(item => item.coreGroup && item.core !== false)
    .map(item => item.coreGroup));
  const missingCoreRaw = (result?.missing || [])
    .filter(item => item.core === true)
    .filter(item => !item.coreGroup || !coveredCoreGroups.has(item.coreGroup));
  const missingCore = [];
  const contextCore = (result?.available || []).filter(item => item.profileContextOnly && item.core === true && contextOnlyNeedsMoreData(item));
  const contextOnly = (result?.available || []).filter(item => item.profileContextOnly);
  const seenCoreGroups = new Set();
  for (const item of missingCoreRaw) {
    if (item.coreGroup) {
      if (seenCoreGroups.has(item.coreGroup)) continue;
      seenCoreGroups.add(item.coreGroup);
      missingCore.push({ ...item, label: item.coreGroupLabel || item.label });
      continue;
    }
    missingCore.push(item);
  }
  if (!Number.isFinite(result?.score)) {
    return { level: 'not-current', label: 'Not current', warning: result?.recencyMessage || 'This score is not currently computed.' };
  }
  if (missingCore.length) {
    return { level: 'low', label: 'Low confidence', warning: `Missing core marker${missingCore.length === 1 ? '' : 's'}: ${missingCore.slice(0, 3).map(i => i.label).join(', ')}${missingCore.length > 3 ? ', …' : ''}. Treat the number as provisional.` };
  }
  if (contextCore.length) {
    return { level: 'low', label: 'Needs context', warning: `Core marker${contextCore.length === 1 ? '' : 's'} need biological context before scoring: ${contextCore.slice(0, 3).map(i => i.label).join(', ')}${contextCore.length > 3 ? ', …' : ''}.` };
  }
  if (contextOnly.length) {
    return { level: 'medium', label: 'Context-limited', warning: `${contextOnly.length} marker${contextOnly.length === 1 ? '' : 's'} shown as context only because timing, cycle, therapy, or training context changes interpretation.` };
  }
  if (coverage < 0.45) return { level: 'low', label: 'Low confidence', warning: 'Thin marker coverage. Treat the number as a rough clue, not a reliable score.' };
  if (coverage < 0.8) return { level: 'medium', label: 'Medium confidence', warning: 'Partial panel. Useful for direction, but missing markers can change this score.' };
  return { level: 'high', label: 'High confidence', warning: '' };
}

export function applyScoreConfidence(result) {
  const confidence = resolveScoreConfidence(result);
  const flags = [...(result.flags || [])];
  if (confidence.warning && !flags.includes(confidence.warning)) flags.unshift(confidence.warning);
  if (Number.isFinite(result.score) && result.score >= 85 && confidence.level !== 'high') {
    const warning = 'High numeric score with incomplete evidence: do not treat this as “all clear” until the core/extended panel is filled.';
    if (!flags.includes(warning)) flags.unshift(warning);
  }
  return { ...result, scoreConfidence: confidence.level, scoreConfidenceLabel: confidence.label, scoreConfidenceWarning: confidence.warning, flags };
}

export function parsePath(path) {
  if (Array.isArray(path)) return path;
  const idx = String(path).indexOf('.');
  return idx > 0 ? [String(path).slice(0, idx), String(path).slice(idx + 1)] : ['', ''];
}

export function canonicalMarkerValue(dotKey, marker, value) {
  const conv = UNIT_CONVERSIONS[dotKey];
  if (!conv || !Number.isFinite(value)) return value;
  if (conv.type === 'multiply' && marker.unit === conv.usUnit) return parseFloat((value / conv.factor).toPrecision(6));
  if (conv.type === 'hba1c' && marker.unit === '%') return parseFloat(((value - 2.15) * 10.929).toFixed(1));
  return value;
}

function markerWithSchemaOptimalFallback(dotKey, marker) {
  if (!marker || (state.rangeMode !== 'optimal' && state.rangeMode !== 'both')) return marker;
  if (marker.optimalMin != null || marker.optimalMax != null) return marker;
  const opt = OPTIMAL_RANGES[dotKey];
  if (!opt) return marker;
  const rawMin = state.profileSex === 'female' && opt.optimalMin_f !== undefined ? opt.optimalMin_f : opt.optimalMin;
  const rawMax = state.profileSex === 'female' && opt.optimalMax_f !== undefined ? opt.optimalMax_f : opt.optimalMax;
  const conv = UNIT_CONVERSIONS[dotKey];
  const convert = (value) => {
    if (value == null) return value;
    if (conv?.type === 'multiply' && marker.unit === conv.usUnit) return parseFloat((Number(value) * conv.factor).toPrecision(4));
    if (conv?.type === 'hba1c' && marker.unit === '%') return parseFloat(((Number(value) / 10.929) + 2.15).toFixed(1));
    return value;
  };
  return { ...marker, optimalMin: convert(rawMin), optimalMax: convert(rawMax) };
}

function getEffectiveRangeLabel(marker, dateIndex) {
  return `${getEffectiveRangeLabelForDate(marker, dateIndex).toLowerCase()} range`.replace('range range', 'range');
}

export function getMarkerHit(data, paths) {
  const candidates = Array.isArray(paths) ? paths : [paths];
  for (const path of candidates) {
    const [catKey, markerKey] = parsePath(path);
    if (!catKey || !markerKey) continue;
    const resolved = resolveActiveMarkerPath(data?.categories, catKey, markerKey);
    if (!resolved) continue;
    const { categoryKey: displayCategoryKey, category, marker } = resolved;
    const latestIdx = getLatestValueIndex(marker.values || []);
    if (latestIdx < 0) continue;
    const value = Number(marker.values[latestIdx]);
    if (!Number.isFinite(value)) continue;
    const dotKey = getMarkerStorageDotKey(marker, `${catKey}_${markerKey}`);
    if (!dotKey) continue;
    const effectiveMarker = markerWithSchemaOptimalFallback(dotKey, marker);
    const range = getEffectiveRangeForDate(effectiveMarker, latestIdx);
    const date = marker.singleDate || category.singleDate || data?.dates?.[latestIdx] || '';
    const entryContext = date ? (data?.entryContextByDate?.[date] || {}) : {};
    return {
      id: `${displayCategoryKey}_${markerKey}`,
      dotKey,
      path: dotKey,
      label: marker.name || markerKey,
      value,
      canonicalValue: canonicalMarkerValue(dotKey, marker, value),
      displayValue: formatValue(value),
      unit: marker.unit || '',
      date,
      dateIndex: latestIdx,
      ageDays: getAgeDays(date),
      range,
      rangeLabel: getEffectiveRangeLabel(effectiveMarker, latestIdx),
      entryContext,
      phaseLabel: marker.phaseLabels?.[latestIdx] || null,
      phaseRange: marker.phaseRefRanges?.[latestIdx] || null,
    };
  }
  const derived = getDerivedMarkerHit(data, candidates);
  if (derived) return derived;
  return null;
}

function getDerivedMarkerHit(data, candidates) {
  for (const path of candidates) {
    const [catKey, markerKey] = parsePath(path);
    if (!catKey) continue;
    if (catKey === 'calculatedRatios' && markerKey === 'cholHdlRatio') {
      const derived = deriveTotalCholesterolHdlRatio(data);
      if (!derived) continue;
      const { value, date, ageDays } = derived;
      return {
        id: 'calculatedRatios_cholHdlRatio',
        dotKey: 'calculatedRatios.cholHdlRatio',
        path: 'calculatedRatios.cholHdlRatio',
        label: 'Total cholesterol/HDL ratio',
        value,
        canonicalValue: value,
        displayValue: formatValue(value),
        unit: '',
        date,
        ageDays,
        range: { min: 0, max: 3.5 },
        derivedFrom: ['lipids.cholesterol', 'lipids.hdl'],
      };
    }
    if (!['aaEpaRatio', 'omega3Index'].includes(markerKey)) continue;
    const derived = markerKey === 'aaEpaRatio'
      ? deriveRatioFromMarkers(data, catKey, 'arachidonicC20_4', 'epaC20_5', (aa, epa) => epa > 0 ? aa / epa : null)
      : (deriveRatioFromMarkers(data, catKey, 'epaC20_5', 'dhaC22_6', (epa, dha) => epa + dha)
        || deriveRatioFromMarkers(data, catKey, 'epa', 'dha', (epa, dha) => epa + dha, valuesLookLikeFattyAcidPercent));
    if (!derived) continue;
    const { value, date, ageDays } = derived;
    const label = markerKey === 'aaEpaRatio' ? 'AA/EPA ratio' : 'Omega-3 index';
    const range = markerKey === 'aaEpaRatio' ? { min: 10, max: 86 } : { min: 8, max: 12 };
    const derivedFrom = markerKey === 'aaEpaRatio'
      ? [`${catKey}.arachidonicC20_4`, `${catKey}.epaC20_5`]
      : [`${catKey}.epaC20_5`, `${catKey}.dhaC22_6`];
    return {
      id: `${catKey}_${markerKey}`,
      dotKey: `${catKey}.${markerKey}`,
      path: `${catKey}.${markerKey}`,
      label,
      value,
      canonicalValue: value,
      displayValue: formatValue(value),
      unit: '',
      date,
      ageDays,
      range,
      derivedFrom,
    };
  }
  return null;
}

function deriveTotalCholesterolHdlRatio(data) {
  const pickMarker = (keys) => keys.map(key => resolveActiveMarkerPath(data?.categories, 'lipids', key)).find(Boolean);
  const totalHit = pickMarker(['cholesterol', 'totalCholesterol', 'cholesterolTotal', 'total_cholesterol', 'totalChol']);
  const hdlHit = pickMarker(['hdl', 'hdlCholesterol', 'hdl_cholesterol']);
  if (!totalHit || !hdlHit) return null;
  const totalMarker = totalHit.marker;
  const hdlMarker = hdlHit.marker;
  const totalIdx = getLatestValueIndex(totalMarker.values || []);
  const hdlIdx = getLatestValueIndex(hdlMarker.values || []);
  if (totalIdx < 0 || hdlIdx < 0) return null;
  const totalRaw = Number(totalMarker.values[totalIdx]);
  const hdlRaw = Number(hdlMarker.values[hdlIdx]);
  if (!Number.isFinite(totalRaw) || !Number.isFinite(hdlRaw)) return null;
  const total = canonicalMarkerValue('lipids.cholesterol', totalMarker, totalRaw);
  const hdl = canonicalMarkerValue('lipids.hdl', hdlMarker, hdlRaw);
  if (!Number.isFinite(total) || !Number.isFinite(hdl) || hdl <= 0) return null;
  const totalDate = totalMarker.singleDate || totalHit.category.singleDate || data?.dates?.[totalIdx] || '';
  const hdlDate = hdlMarker.singleDate || hdlHit.category.singleDate || data?.dates?.[hdlIdx] || '';
  const date = hdlDate && totalDate && hdlDate !== totalDate ? hdlDate : (totalDate || hdlDate);
  return { value: parseFloat((total / hdl).toPrecision(6)), date, ageDays: getAgeDays(date) };
}

/**
 * @param {any} data
 * @param {string} categoryKey
 * @param {string} leftKey
 * @param {string} rightKey
 * @param {(left: number, right: number) => number | null} compute
 * @param {((left: number, right: number, leftMarker: any, rightMarker: any) => boolean) | null} [valuesOk]
 */
function deriveRatioFromMarkers(data, categoryKey, leftKey, rightKey, compute, valuesOk = null) {
  const leftHit = resolveActiveMarkerPath(data?.categories, categoryKey, leftKey);
  const rightHit = resolveActiveMarkerPath(data?.categories, categoryKey, rightKey);
  if (!leftHit || !rightHit) return null;
  const leftMarker = leftHit.marker;
  const rightMarker = rightHit.marker;
  const leftIdx = getLatestValueIndex(leftMarker.values || []);
  const rightIdx = getLatestValueIndex(rightMarker.values || []);
  if (leftIdx < 0 || rightIdx < 0) return null;
  const left = Number(leftMarker.values[leftIdx]);
  const right = Number(rightMarker.values[rightIdx]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  if (valuesOk && !valuesOk(left, right, leftMarker, rightMarker)) return null;
  const raw = compute(left, right);
  if (raw == null || !Number.isFinite(raw)) return null;
  const leftDate = leftMarker.singleDate || leftHit.category.singleDate || data?.dates?.[leftIdx] || '';
  const rightDate = rightMarker.singleDate || rightHit.category.singleDate || data?.dates?.[rightIdx] || '';
  const date = rightDate && leftDate && rightDate !== leftDate ? rightDate : (leftDate || rightDate);
  return { value: parseFloat(raw.toPrecision(6)), date, ageDays: getAgeDays(date) };
}

function valuesLookLikeFattyAcidPercent(left, right, leftMarker, rightMarker) {
  const units = `${leftMarker?.unit || ''} ${rightMarker?.unit || ''}`.toLowerCase();
  if (units.includes('µmol') || units.includes('umol') || units.includes('mg/') || units.includes('mmol')) return false;
  if (units.includes('%') || units.trim() === '') return left >= 0 && right >= 0 && left <= 20 && right <= 20 && left + right <= 25;
  return false;
}

export function scoreAgainstRange(value, range) {
  if (!Number.isFinite(value) || !range) return null;
  const min = Number.isFinite(range.min) ? Number(range.min) : null;
  const max = Number.isFinite(range.max) ? Number(range.max) : null;
  if (min == null && max == null) return null;

  if (min == null && max != null) {
    if (value <= max) return 100;
    const buffer = Math.max(Math.abs(max) * 0.5, 1);
    return Math.round(clamp(lerp(clamp(value, max, max + buffer), max, max + buffer, 99, 0), 0, 99));
  }

  if (max == null && min != null) {
    if (value >= min) return 100;
    const buffer = Math.max(Math.abs(min) * 0.5, 1);
    return Math.round(clamp(lerp(clamp(value, min - buffer, min), min - buffer, min, 0, 99), 0, 99));
  }

  if (min == null || max == null) return null;
  if (value >= min && value <= max) return 100;
  const span = Math.max(max - min, 1);
  const lowFloor = Math.max(0, min - span);
  const highCeil = max + span;
  if (value < min) return Math.round(clamp(lerp(clamp(value, lowFloor, min), lowFloor, min, 0, 99), 0, 99));
  return Math.round(clamp(lerp(clamp(value, max, highCeil), max, highCeil, 99, 0), 0, 99));
}

export function getAgeDays(dateStr) {
  if (!dateStr) return null;
  const ts = new Date(`${dateStr}T00:00:00`).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.floor((Date.now() - ts) / DAY_MS);
}

export function formatAge(ageDays) {
  if (!Number.isFinite(ageDays)) return '';
  if (ageDays < 45) return `${Math.max(0, ageDays)}d old`;
  if (ageDays < 730) return `${Math.round(ageDays / 30)}mo old`;
  return `${Math.round(ageDays / 365)}y old`;
}

export function assessScoreRecency(available) {
  const dated = available
    .filter(item => item.date)
    .map(item => ({ ...item, ts: new Date(`${item.date}T00:00:00`).getTime() }))
    .filter(item => Number.isFinite(item.ts));
  if (dated.length < 2) {
    const staleOnly = dated.find(item => Number.isFinite(item.ageDays) && item.ageDays > SCORE_STALE_DAYS);
    if (staleOnly) {
      return {
        status: 'stale',
        blocked: true,
        badge: 'Retest needed',
        message: `${staleOnly.label} is ${formatAge(staleOnly.ageDays)}; retest this score together before trusting it.`,
      };
    }
    return { status: 'fresh', blocked: false, badge: 'Dates aligned', message: '' };
  }
  dated.sort((a, b) => a.ts - b.ts);
  const oldest = dated[0];
  const newest = dated[dated.length - 1];
  const spanDays = Math.round((newest.ts - oldest.ts) / DAY_MS);
  const stale = dated.filter(item => Number.isFinite(item.ageDays) && item.ageDays > SCORE_STALE_DAYS)
    .sort((a, b) => (b.ageDays || 0) - (a.ageDays || 0));
  if (spanDays > SCORE_DATE_SPAN_DAYS) {
    return {
      status: 'mixed-dates',
      blocked: true,
      badge: 'Retest together',
      message: `Inputs span ${spanDays} days (${oldest.label} ${oldest.date}, ${newest.label} ${newest.date}). Retest this panel together before scoring.`,
    };
  }
  if (stale.length) {
    return {
      status: 'stale',
      blocked: true,
      badge: 'Retest needed',
      message: `${stale[0].label} is ${formatAge(stale[0].ageDays)}; retest this score together before trusting it.`,
    };
  }
  return { status: 'fresh', blocked: false, badge: 'Dates aligned', message: dated.length ? `Inputs span ${spanDays} days.` : '' };
}

export function applyScoreRecency(result) {
  const recencyInputs = (result.available || []).filter(item => item.recencyRequired !== false);
  const recency = assessScoreRecency(recencyInputs);
  const flags = [...(result.flags || [])];
  if (recency.blocked && recency.message) flags.unshift(recency.message);
  return {
    ...result,
    rawScore: result.score,
    score: recency.blocked ? null : result.score,
    tone: recency.blocked ? null : result.tone,
    recencyStatus: recency.status,
    recencyBadge: recency.badge,
    recencyMessage: recency.message,
    flags,
  };
}

export function scoreHighOnly(value, threshold, highCeil) {
  if (!Number.isFinite(value)) return null;
  if (value <= threshold) return 100;
  const ceil = Math.max(highCeil, threshold + 1);
  return Math.round(clamp(lerp(clamp(value, threshold, ceil), threshold, ceil, 99, 0), 0, 99));
}

export function scoreLowOnly(value, threshold, lowFloor = 0) {
  if (!Number.isFinite(value)) return null;
  if (value >= threshold) return 100;
  return Math.round(clamp(lerp(clamp(value, lowFloor, threshold), lowFloor, threshold, 0, 99), 0, 99));
}

export function finalizeCustomScore(def, parts, missing, flags = [], options = {}) {
  const profileContext = options.profileContext || getBiologyProfileContext(options);
  const profileFlags = getScoreProfileFlags(def.id, profileContext);
  const allFlags = [...profileFlags, ...flags.filter(flag => !profileFlags.includes(flag))];
  const available = parts.filter(Boolean);
  const totalWeight = available.reduce((sum, p) => sum + p.weight, 0) + missing.reduce((sum, p) => sum + p.weight, 0);
  const availableWeight = available.reduce((sum, p) => sum + p.weight, 0);
  const scoreSum = available.reduce((sum, p) => sum + p.partial * p.weight, 0);
  const score = availableWeight > 0 ? Math.round(scoreSum / availableWeight) : null;
  const coverage = totalWeight > 0 ? availableWeight / totalWeight : 0;
  return applyScoreConfidence(applyScoreRecency({
    ...def,
    score,
    tone: score == null ? null : resolveScoreTone(score),
    severity: resolveScoreSeverity(score),
    coverage,
    coverageLabel: resolveCoverageLabel(coverage),
    available,
    missing,
    flags: allFlags,
  }));
}


function clinicalGuardrailForHit(hit) {
  if (!hit || !Number.isFinite(hit.value)) return '';
  const dot = hit.dotKey;
  const max = Number.isFinite(hit.range?.max) ? Number(hit.range.max) : null;
  const min = Number.isFinite(hit.range?.min) ? Number(hit.range.min) : null;
  const high = max != null && hit.value > max;
  const low = min != null && hit.value < min;
  if (!high && !low) return '';
  if (['electrolytes.potassium', 'electrolytes.sodium'].includes(dot)) return `Clinical guardrail: ${hit.label} is outside range; electrolyte abnormalities are not wellness signals and deserve clinical context.`;
  if (['biochemistry.egfr', 'biochemistry.eGFR', 'biochemistry.gfrCystatin'].includes(dot)) return `Clinical guardrail: ${hit.label} is outside range; kidney-filtration flags should not be hidden inside a composite score.`;
  if (['hematology.platelets', 'hematology.wbc', 'hematology.hemoglobin'].includes(dot)) return `Clinical guardrail: ${hit.label} is outside range; review the raw CBC result, not only this score.`;
  return '';
}

export function computeWeightedComposite(data, def, options = {}) {
  const profileContext = options.profileContext || getBiologyProfileContext(options);
  const available = [], missing = [], flags = getScoreProfileFlags(def.id, profileContext);
  let availableWeight = 0, totalWeight = 0, scoreSum = 0;
  for (const input of def.inputs) {
    const hit = getMarkerHit(data, input.paths);
    const modifier = getInputProfileModifier(hit || {}, input, profileContext);
    const effectiveWeight = input.weight * (modifier.weightScale ?? 1);
    const coreApplies = input.core === true && (!Array.isArray(input.coreSex) || !profileContext?.sex || input.coreSex.includes(profileContext.sex));
    const effectiveRange = modifier.rangeOverride ?? hit?.range;
    const partial = hit ? scoreAgainstRange(hit.value, effectiveRange) : null;
    if (partial == null) { totalWeight += effectiveWeight; missing.push({ key: input.key, label: input.label, weight: effectiveWeight, core: coreApplies, coreGroup: input.coreGroup || '', coreGroupLabel: input.coreGroupLabel || '', path: Array.isArray(input.paths) ? input.paths[0] : input.paths }); continue; }
    if (modifier.flag && !flags.includes(modifier.flag)) flags.push(modifier.flag);
    const guardrail = clinicalGuardrailForHit(hit);
    if (guardrail && !flags.includes(guardrail)) flags.unshift(guardrail);
    if (modifier.score === false) {
      available.push({ ...hit, key: input.key, label: input.label, partial: null, weight: 0, profileContextOnly: true, contextReason: modifier.flag || '', recencyRequired: false, core: coreApplies, coreGroup: input.coreGroup || '' });
      continue;
    }
    totalWeight += effectiveWeight;
    available.push({ ...hit, key: input.key, label: input.label, partial, weight: effectiveWeight, recencyRequired: input.recencyRequired !== false, core: coreApplies, coreGroup: input.coreGroup || '' });
    availableWeight += effectiveWeight;
    scoreSum += partial * effectiveWeight;
  }

  const score = availableWeight > 0 ? Math.round(scoreSum / availableWeight) : null;
  const coverage = totalWeight > 0 ? availableWeight / totalWeight : 0;
  return applyScoreConfidence(applyScoreRecency({
    ...def,
    score,
    tone: score == null ? null : resolveScoreTone(score),
    severity: resolveScoreSeverity(score),
    coverage,
    coverageLabel: resolveCoverageLabel(coverage),
    available,
    missing,
    flags,
  }));
}
