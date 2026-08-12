// @ts-check
// marker-analysis.js — read-only marker range, status, and trend helpers

import { state } from './state.js';
import { getStatus, formatValue, linearRegression } from './utils.js';
import { resolveActiveMarkerPath } from './marker-placement.js';

// Tunables — calibrated against dashboard "needs attention" callouts.
const TREND_SUDDEN_JUMP_FRAC = 0.25;   // jump > 25% of ref range → sudden change
const TREND_MIN_NORM_SLOPE = 0.02;     // |normalized slope| floor — below = noise
const TREND_MIN_R2 = 0.5;              // 4+-point regressions must clear this fit
const TREND_APPROACH_BAND = 0.15;      // within 15% of an edge → "approaching"
const KEY_TRENDS_MAX = 8;              // dashboard "Key Trends" cap

export function getEffectiveRange(marker, rangeMode = state.rangeMode) {
  if (rangeMode === 'optimal' || rangeMode === 'both') {
    if (marker.optimalMin != null || marker.optimalMax != null) {
      return { min: marker.optimalMin ?? null, max: marker.optimalMax ?? null };
    }
  }
  return { min: marker.refMin, max: marker.refMax };
}

export function getEffectiveRangeForDate(marker, dateIndex, rangeMode = state.rangeMode) {
  if (marker.phaseRefRanges && marker.phaseRefRanges[dateIndex]) {
    return marker.phaseRefRanges[dateIndex];
  }
  if ((rangeMode === 'optimal' || rangeMode === 'both') && marker.contextOptimalRanges?.[dateIndex]) {
    return marker.contextOptimalRanges[dateIndex];
  }
  const hasOptimalRange = marker.optimalMin != null || marker.optimalMax != null;
  if ((rangeMode === 'optimal' || rangeMode === 'both') && hasOptimalRange) {
    return getEffectiveRange(marker, rangeMode);
  }
  if (marker.contextRefRanges && marker.contextRefRanges[dateIndex]) {
    return marker.contextRefRanges[dateIndex];
  }
  return getEffectiveRange(marker, rangeMode);
}

export function getEffectiveRangeLabelForDate(marker, dateIndex, rangeMode = state.rangeMode) {
  if (marker.phaseRefRanges && marker.phaseRefRanges[dateIndex]) {
    if (marker.phaseRefRanges[dateIndex].label) return marker.phaseRefRanges[dateIndex].label;
    const phaseLabel = marker.phaseLabels?.[dateIndex];
    if (!phaseLabel) return 'Phase range';
    const readable = String(phaseLabel).replace(/[_-]+/g, ' ');
    return `${readable.charAt(0).toUpperCase()}${readable.slice(1)} range`;
  }
  if ((rangeMode === 'optimal' || rangeMode === 'both') && marker.contextOptimalRanges?.[dateIndex]) {
    return marker.contextOptimalRangeLabels?.[dateIndex] || 'Optimal guidance';
  }
  const hasOptimalRange = marker.optimalMin != null || marker.optimalMax != null;
  if ((rangeMode === 'optimal' || rangeMode === 'both') && hasOptimalRange) return 'Optimal';
  if (marker.contextRefRanges && marker.contextRefRanges[dateIndex]) {
    return marker.contextRangeLabels?.[dateIndex] || (marker.rangePolicy === 'target' ? 'Target' : 'Reference');
  }
  if (marker.referenceRangeSource === 'import') return 'Lab reference';
  if (marker.referenceRangeSource) return 'Custom range';
  return marker.rangePolicy === 'target' ? 'Target' : 'Reference';
}

export function getPhaseRefEnvelope(marker) {
  if (!marker.phaseRefRanges) return null;
  let min = Infinity, max = -Infinity;
  for (const r of marker.phaseRefRanges) {
    if (!r) continue;
    if (r.min < min) min = r.min;
    if (r.max > max) max = r.max;
  }
  return min === Infinity ? null : { min, max };
}

export function getContextRefEnvelope(marker) {
  if (!marker.contextRefRanges) return null;
  let min = Infinity, max = -Infinity;
  for (const r of marker.contextRefRanges) {
    if (!r) continue;
    if (r.min != null && r.min < min) min = r.min;
    if (r.max != null && r.max > max) max = r.max;
  }
  return min === Infinity || max === -Infinity ? null : { min, max };
}

export function getContextOptimalEnvelope(marker) {
  if (!marker.contextOptimalRanges) return null;
  let min = Infinity, max = -Infinity;
  for (const r of marker.contextOptimalRanges) {
    if (!r) continue;
    if (r.min != null && r.min < min) min = r.min;
    if (r.max != null && r.max > max) max = r.max;
  }
  return min === Infinity || max === -Infinity ? null : { min, max };
}

export function getLatestValueIndex(values) {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] !== null && values[i] !== undefined) return i;
  return -1;
}

export function countFlagged(markers) {
  let c = 0;
  for (const m of markers) {
    const i = getLatestValueIndex(m.values);
    if (i !== -1) {
      const r = getEffectiveRangeForDate(m, i);
      if (getStatus(m.values[i], r.min, r.max) !== 'normal') c++;
    }
  }
  return c;
}

export function getAllFlaggedMarkers(data) {
  if (!data?.categories) return [];
  const flags = [];
  for (const [ck, cat] of Object.entries(data.categories)) {
    for (const [k, m] of Object.entries(cat.markers)) {
      const i = getLatestValueIndex(m.values);
      if (i !== -1) {
        const v = m.values[i];
        const r = getEffectiveRangeForDate(m, i);
        const s = getStatus(v, r.min, r.max);
        if (s === 'high' || s === 'low') {
          flags.push({
            categoryKey: ck,
            markerKey: k,
            id: ck + '_' + k,
            name: m.name,
            value: formatValue(v),
            rawValue: v,
            unit: m.unit,
            refMin: m.refMin,
            refMax: m.refMax,
            optimalMin: m.optimalMin,
            optimalMax: m.optimalMax,
            effectiveMin: r.min,
            effectiveMax: r.max,
            status: s,
          });
        }
      }
    }
  }
  return flags;
}

export function statusIcon(s) {
  if (s === 'normal') return '\u2713';
  if (s === 'high') return '\u25B2';
  if (s === 'low') return '\u25BC';
  return '';
}

export function detectTrendAlerts(data) {
  const alerts = [];
  for (const [catKey, cat] of Object.entries(data.categories)) {
    if (cat.singlePoint) continue;
    for (const [mKey, marker] of Object.entries(cat.markers)) {
      if (marker.singlePoint) continue;
      const nonNull = marker.values.map((v, i) => ({ v, i })).filter(x => x.v !== null);
      if (nonNull.length < 2) continue;
      const r = getEffectiveRange(marker); // aggregate range for normalization width
      if (r.min == null || r.max == null) continue;
      const range = r.max - r.min;
      if (range <= 0) continue;
      const id = catKey + '_' + mKey;
      const latestEntry = nonNull[nonNull.length - 1];
      const latestVal = latestEntry.v;
      const lr = getEffectiveRangeForDate(marker, latestEntry.i); // phase-aware range for latest
      const prevVal = nonNull[nonNull.length - 2].v;
      const sparkVals = nonNull.slice(-Math.min(5, nonNull.length));

      // Sudden change detection (2+ values)
      const jump = Math.abs(latestVal - prevVal);
      if (jump > range * TREND_SUDDEN_JUMP_FRAC) {
        if (latestVal > lr.max) {
          alerts.push({ id, name: marker.name, category: cat.label, concern: 'sudden_high',
            spark: sparkVals.map(x => formatValue(x.v)), direction: 'rising' });
          continue;
        }
        if (latestVal < lr.min) {
          alerts.push({ id, name: marker.name, category: cat.label, concern: 'sudden_low',
            spark: sparkVals.map(x => formatValue(x.v)), direction: 'falling' });
          continue;
        }
      }

      // Linear regression (3+ values)
      if (nonNull.length < 3) continue;
      const vals = nonNull.map(x => x.v);
      const reg = linearRegression(vals);
      const normSlope = reg.slope / range;
      if (Math.abs(normSlope) < TREND_MIN_NORM_SLOPE) continue;
      // R-squared filter only for 4+ points (2-3 points inherently have high R²)
      if (nonNull.length >= 4 && reg.r2 < TREND_MIN_R2) continue;
      const rising = normSlope > 0;
      let concern = null;
      if (rising && latestVal > lr.max) concern = 'past_high';
      else if (!rising && latestVal < lr.min) concern = 'past_low';
      else if (rising && latestVal >= lr.max - range * TREND_APPROACH_BAND) concern = 'approaching_high';
      else if (!rising && latestVal <= lr.min + range * TREND_APPROACH_BAND) concern = 'approaching_low';
      if (!concern) continue;
      alerts.push({ id, name: marker.name, category: cat.label, concern,
        spark: sparkVals.map(x => formatValue(x.v)), direction: rising ? 'rising' : 'falling' });
    }
  }
  // Sort: sudden first, then past, then approaching
  alerts.sort((a, b) => {
    const priority = c => c.startsWith('sudden_') ? 0 : c.startsWith('past_') ? 1 : 2;
    return priority(a.concern) - priority(b.concern);
  });
  return alerts;
}

export function getKeyTrendMarkers(filteredData, profileSex = state.profileSex) {
  const selected = [];
  const seen = new Set();
  const MAX = KEY_TRENDS_MAX;

  function add(cat, key) {
    if (selected.length >= MAX) return;
    const resolved = resolveActiveMarkerPath(filteredData.categories, cat, key);
    if (!resolved || resolved.category.singlePoint) return;
    const { categoryKey, marker } = resolved;
    if (!marker.values?.some(v => v !== null)) return;
    const id = categoryKey + '_' + key;
    if (seen.has(id)) return;
    seen.add(id);
    selected.push({ cat: categoryKey, key });
  }

  // Tier 1: Trend alerts (sudden > past > approaching — already sorted)
  const alerts = detectTrendAlerts(filteredData);
  for (const a of alerts) {
    const dot = a.id.indexOf('_');
    add(a.id.substring(0, dot), a.id.substring(dot + 1));
  }

  // Tier 2: Flagged (out-of-range) markers
  const flags = getAllFlaggedMarkers(filteredData);
  for (const f of flags) {
    add(f.categoryKey, f.markerKey);
  }

  // Tier 3: Sex-aware defaults
  const defaults = profileSex === 'female'
    ? [['diabetes','hba1c'],['diabetes','homaIR'],['lipids','ldl'],['vitamins','vitaminD'],
       ['thyroid','tsh'],['iron','ferritin'],['hormones','estradiol'],['proteins','hsCRP']]
    : profileSex === 'male'
    ? [['diabetes','hba1c'],['diabetes','homaIR'],['lipids','ldl'],['vitamins','vitaminD'],
       ['thyroid','tsh'],['hormones','testosterone'],['proteins','hsCRP'],['biochemistry','ggt']]
    : [['diabetes','hba1c'],['diabetes','homaIR'],['lipids','ldl'],['vitamins','vitaminD'],
       ['thyroid','tsh'],['proteins','hsCRP'],['biochemistry','ggt'],['hematology','hemoglobin']];
  for (const [cat, key] of defaults) add(cat, key);

  return selected;
}
