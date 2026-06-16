// @ts-check
// biology-score-engine.js — shared primitives for the Biology Scores composite engine.

import { getEffectiveRangeForDate, getLatestValueIndex } from './marker-analysis.js';
import { getBiologyProfileContext } from './profile-context.js';
import { getInputProfileModifier, getScoreProfileFlags } from './biology-score-profile-modifiers.js';
import { UNIT_CONVERSIONS } from './schema.js';
import { formatValue } from './utils.js';

export const TONE_LABELS = { excellent: 'Strong', good: 'Good', strained: 'Watch', poor: 'Low score' };
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
  return 'poor';
}

export function resolveCoverageLabel(coverage) {
  if (coverage >= 0.8) return 'high';
  if (coverage >= 0.45) return 'partial';
  return 'low';
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

export function getMarkerHit(data, paths) {
  const candidates = Array.isArray(paths) ? paths : [paths];
  for (const path of candidates) {
    const [catKey, markerKey] = parsePath(path);
    if (!catKey || !markerKey) continue;
    const category = data?.categories?.[catKey];
    const marker = category?.markers?.[markerKey];
    if (!marker) continue;
    const latestIdx = getLatestValueIndex(marker.values || []);
    if (latestIdx < 0) continue;
    const value = Number(marker.values[latestIdx]);
    if (!Number.isFinite(value)) continue;
    const range = getEffectiveRangeForDate(marker, latestIdx);
    const date = marker.singleDate || category.singleDate || data?.dates?.[latestIdx] || '';
    return {
      id: `${catKey}_${markerKey}`,
      dotKey: `${catKey}.${markerKey}`,
      label: marker.name || markerKey,
      value,
      canonicalValue: canonicalMarkerValue(`${catKey}.${markerKey}`, marker, value),
      displayValue: formatValue(value),
      unit: marker.unit || '',
      date,
      ageDays: getAgeDays(date),
      range,
    };
  }
  return null;
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

export function scoreTargetRange(value, min, max, lowFloor = 0, highCeil = null) {
  return scoreAgainstRange(value, { min, max: highCeil == null ? max : max });
}

export function finalizeCustomScore(def, parts, missing, flags = []) {
  const available = parts.filter(Boolean);
  const totalWeight = available.reduce((sum, p) => sum + p.weight, 0) + missing.reduce((sum, p) => sum + p.weight, 0);
  const availableWeight = available.reduce((sum, p) => sum + p.weight, 0);
  const scoreSum = available.reduce((sum, p) => sum + p.partial * p.weight, 0);
  const score = availableWeight > 0 ? Math.round(scoreSum / availableWeight) : null;
  const coverage = totalWeight > 0 ? availableWeight / totalWeight : 0;
  return applyScoreRecency({
    ...def,
    score,
    tone: score == null ? null : resolveScoreTone(score),
    coverage,
    coverageLabel: resolveCoverageLabel(coverage),
    available,
    missing,
    flags,
  });
}

export function computeWeightedComposite(data, def) {
  const profileContext = getBiologyProfileContext();
  const available = [], missing = [], flags = getScoreProfileFlags(def.id, profileContext);
  let availableWeight = 0, totalWeight = 0, scoreSum = 0;
  for (const input of def.inputs) {
    const hit = getMarkerHit(data, input.paths);
    const modifier = getInputProfileModifier(hit || {}, input, profileContext);
    const effectiveWeight = input.weight * (modifier.weightScale ?? 1);
    const partial = hit ? scoreAgainstRange(hit.value, hit.range) : null;
    if (partial == null) { totalWeight += effectiveWeight; missing.push({ key: input.key, label: input.label, weight: effectiveWeight }); continue; }
    if (modifier.flag && !flags.includes(modifier.flag)) flags.push(modifier.flag);
    if (modifier.score === false) {
      available.push({ ...hit, key: input.key, label: input.label, partial: null, weight: 0, profileContextOnly: true, recencyRequired: false });
      continue;
    }
    totalWeight += effectiveWeight;
    available.push({ ...hit, key: input.key, label: input.label, partial, weight: effectiveWeight, recencyRequired: input.recencyRequired !== false });
    availableWeight += effectiveWeight;
    scoreSum += partial * effectiveWeight;
  }

  const score = availableWeight > 0 ? Math.round(scoreSum / availableWeight) : null;
  const coverage = totalWeight > 0 ? availableWeight / totalWeight : 0;
  return applyScoreRecency({
    ...def,
    score,
    tone: score == null ? null : resolveScoreTone(score),
    coverage,
    coverageLabel: resolveCoverageLabel(coverage),
    available,
    missing,
    flags,
  });
}
