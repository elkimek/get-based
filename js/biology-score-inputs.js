// @ts-check
// Marker selection and unit normalization for Biology Scores.
import { getEffectiveRangeForDate, getEffectiveRangeLabelForDate } from './marker-analysis.js';
import { MARKER_SCHEMA, OPTIMAL_RANGES } from './schema.js';
import { convertUnitInputToCanonical, convertCanonicalToInputUnit } from './unit-profiles.js';
import { state } from './state.js';
import { getMarkerStorageDotKey, resolveActiveMarkerPath } from './marker-placement.js';
import { formatValue } from './utils.js';
import { getAgeDays } from './biology-score-dates.js';

export function parsePath(path) {
  if (Array.isArray(path)) return path;
  const idx = String(path).indexOf('.');
  return idx > 0 ? [String(path).slice(0, idx), String(path).slice(idx + 1)] : ['', ''];
}

export function canonicalMarkerValue(dotKey, marker, value) {
  return Number.isFinite(value) ? convertUnitInputToCanonical(dotKey, value, marker.unit || '', 'EU') : value;
}

export function canonicalRange(hit, range) {
  return { min: Number.isFinite(range?.min) ? canonicalMarkerValue(hit.dotKey, hit, range.min) : null,
    max: Number.isFinite(range?.max) ? canonicalMarkerValue(hit.dotKey, hit, range.max) : null };
}

function markerWithSchemaOptimalFallback(dotKey, marker) {
  if (!marker || (state.rangeMode !== 'optimal' && state.rangeMode !== 'both')) return marker;
  if (marker.optimalMin != null || marker.optimalMax != null) return marker;
  const opt = OPTIMAL_RANGES[dotKey];
  if (!opt) return marker;
  const rawMin = state.profileSex === 'female' && opt.optimalMin_f !== undefined ? opt.optimalMin_f : opt.optimalMin;
  const rawMax = state.profileSex === 'female' && opt.optimalMax_f !== undefined ? opt.optimalMax_f : opt.optimalMax;
  const convert = value => value == null ? value : convertCanonicalToInputUnit(dotKey, Number(value), marker.unit || '', 'EU');
  return { ...marker, optimalMin: convert(rawMin), optimalMax: convert(rawMax) };
}

function getEffectiveRangeLabel(marker, dateIndex) {
  return `${getEffectiveRangeLabelForDate(marker, dateIndex).toLowerCase()} range`.replace('range range', 'range');
}

export function getMarkerHit(data, paths, options = {}) {
  const candidates = Array.isArray(paths) ? paths : [paths];
  const hits = [];
  for (const path of candidates) {
    const [catKey, markerKey] = parsePath(path);
    if (!catKey || !markerKey) continue;
    const resolved = resolveActiveMarkerPath(data?.categories, catKey, markerKey);
    if (!resolved) continue;
    const { categoryKey: displayCategoryKey, category, marker } = resolved;
    for (let i = 0; i < (marker.values || []).length; i++) {
      const raw = marker.values[i];
      if (raw == null || raw === '' || !Number.isFinite(Number(raw))) continue;
      const date = marker.singleDate || category.singleDate || ((marker.singlePoint || category.singlePoint) ? '' : data?.dates?.[i] || '');
      if (options.date && date !== options.date) continue;
      const dotKey = getMarkerStorageDotKey(marker, `${catKey}_${markerKey}`);
      if (!dotKey) continue;
      const effectiveMarker = markerWithSchemaOptimalFallback(dotKey, marker);
      const value = Number(raw);
      const canonical = marker.canonicalScoring;
      const canonicalIndex = canonical?.dateIndices?.[date] ?? i;
      const canonicalMarker = canonical ? markerWithSchemaOptimalFallback(dotKey, canonical) : null;
      const entryContext = data?.entryContextByDate?.[date] || {};
      hits.push({ id: `${displayCategoryKey}_${markerKey}`, dotKey, path: dotKey, label: marker.name || markerKey,
        value, canonicalValue: canonical?.values?.[canonicalIndex] ?? canonicalMarkerValue(dotKey, marker, value),
        canonicalScoringRange: canonicalMarker ? getEffectiveRangeForDate(canonicalMarker, canonicalIndex) : null,
        canonicalReferenceRange: canonical ? getEffectiveRangeForDate(canonical, canonicalIndex, 'reference') : null, displayValue: formatValue(value),
        unit: marker.unit || '', date, dateIndex: i, ageDays: getAgeDays(date), entryContext,
        range: getEffectiveRangeForDate(effectiveMarker, i), referenceRange: getEffectiveRangeForDate(marker, i, 'reference'),
        rangeLabel: getEffectiveRangeLabel(effectiveMarker, i), phaseLabel: marker.phaseLabels?.[i] || null,
        phaseRange: marker.phaseRefRanges?.[i] || null, specimen: marker.specimen || category.specimen || entryContext.specimen || '',
        referenceRangeSource: marker.referenceRangeSource || '', optimalRangeSource: marker.optimalRangeSource || '',
        referenceSampleTime: marker.referenceSampleTime || '',
        method: marker.method || category.method || entryContext.method || '', source: marker.source || category.source || '',
      });
    }
  }
  // Unknown dates remain visible but never outrank a dated measurement.
  hits.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const derived = getDerivedMarkerHit(data, candidates, options);
  return derived && !derived.derivedContextOnly && (!hits[0] || derived.date > hits[0].date) ? derived : hits[0] || derived;
}

function pairedHits(data, leftPaths, rightPaths, options) {
  const left = getMarkerHit(data, leftPaths, options);
  const right = getMarkerHit(data, rightPaths, options);
  const dates = [...new Set([left?.date, right?.date, ...(data?.dates || [])])].filter(Boolean).sort().reverse();
  for (const date of dates) {
    if (options.date && options.date !== date) continue;
    const a = getMarkerHit(data, leftPaths, { date });
    const b = getMarkerHit(data, rightPaths, { date });
    if (a && b) return [a, b];
  }
  return null;
}

function getDerivedMarkerHit(data, candidates, options = {}) {
  const definitions = {
    'lipids.nonHdl': { left: ['lipids.cholesterol', 'lipids.totalCholesterol'], right: 'lipids.hdl', subtract: true, max: 3.8 },
    'calculatedRatios.cholHdlRatio': { left: ['lipids.cholesterol', 'lipids.totalCholesterol'], right: 'lipids.hdl', max: 3.5 },
    'calculatedRatios.tgHdlRatio': { left: 'lipids.triglycerides', right: 'lipids.hdl', max: 1.75 },
    'calculatedRatios.apoBapoAIRatio': { left: 'lipids.apoB', right: ['lipids.apoAI', 'lipids.apoA1'], max: 0.9 },
    'diabetes.homaIR': { left: 'biochemistry.glucose', right: 'diabetes.insulin', max: 2.5, multiply: true },
  };
  for (const path of candidates) {
    const [catKey, key] = parsePath(path);
    const recipe = definitions[path];
    const fatty = ['aaEpaRatio', 'omega3Index'].includes(key);
    if (!recipe && !fatty) continue;
    const pair = recipe ? pairedHits(data, recipe.left, recipe.right, options)
      : pairedHits(data, `${catKey}.${key === 'aaEpaRatio' ? 'arachidonicC20_4' : 'dhaC22_6'}`, `${catKey}.epaC20_5`, options)
        || (key === 'omega3Index' ? pairedHits(data, `${catKey}.dha`, `${catKey}.epa`, options) : null);
    if (!pair) continue;
    const [a, b] = pair;
    if (fatty && (a.unit !== b.unit || a.specimen !== b.specimen || a.method !== b.method)) continue;
    if (fatty && !/^(%|%.*fatty.*)$/i.test(a.unit)) continue;
    if (b.canonicalValue <= 0 && key !== 'omega3Index' && !recipe?.subtract) continue;
    const value = key === 'omega3Index' ? a.value + b.value
      : recipe?.subtract ? a.canonicalValue - b.canonicalValue : recipe?.multiply ? a.canonicalValue * b.canonicalValue / 22.5 : a.canonicalValue / b.canonicalValue;
    if (value < 0) continue;
    const reported = resolveActiveMarkerPath(data?.categories, catKey, key)?.marker;
    const base = reported || MARKER_SCHEMA[catKey]?.markers?.[key] || { refMin: 0, refMax: recipe?.max };
    let range = recipe ? getEffectiveRangeForDate(markerWithSchemaOptimalFallback(path, base), a.dateIndex) : reported ? getEffectiveRangeForDate(reported, a.dateIndex) : null;
    let referenceRange = recipe ? getEffectiveRangeForDate(base, a.dateIndex, 'reference') : null;
    if (recipe?.subtract && reported) {
      const hit = { ...reported, dotKey: path };
      range = canonicalRange(hit, range); referenceRange = canonicalRange(hit, referenceRange);
    }
    return { ...a, id: `${catKey}_${key}`, dotKey: path, path, label: key === 'omega3Index' ? 'EPA + DHA sum' : key,
      value: recipe?.subtract ? convertCanonicalToInputUnit(path, value, a.unit, 'EU') : value, canonicalValue: value, canonicalScoringRange: range, canonicalReferenceRange: referenceRange, displayValue: formatValue(recipe?.subtract ? convertCanonicalToInputUnit(path, value, a.unit, 'EU') : value), unit: recipe?.subtract ? a.unit : key === 'omega3Index' ? '%' : '', range: recipe?.subtract ? { min: range?.min == null ? null : convertCanonicalToInputUnit(path, range.min, a.unit, 'EU'), max: range?.max == null ? null : convertCanonicalToInputUnit(path, range.max, a.unit, 'EU') } : range,
      referenceRange: recipe?.subtract ? { min: referenceRange?.min == null ? null : convertCanonicalToInputUnit(path, referenceRange.min, a.unit, 'EU'), max: referenceRange?.max == null ? null : convertCanonicalToInputUnit(path, referenceRange.max, a.unit, 'EU') } : referenceRange, rangeLabel: 'derived range', derivedFrom: [a.dotKey, b.dotKey],
      dependencyDates: [a.date, b.date],
      contextReason: fatty ? 'Derived fatty-acid value; an assay-specific reported index or ratio is needed for scoring.' : '',
      derivedContextOnly: fatty,
    };
  }
  return null;
}
