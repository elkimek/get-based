// @ts-check
// profile-marker-migrations.js - Marker alias, unit-suffix, and specialty import repairs.

import {
  BUILTIN_MARKER_DOT_KEY_ALIASES,
  MARKER_SCHEMA,
  normalizeToSI,
} from './schema.js';
import { SPECIALTY_MARKER_DEFS } from './adapters.js';
import { renameLabEntryMarker } from './lab-entry.js';
import {
  ensureProductFattyAcidCustomMarker,
  repairSnapshotBackedProductFattyAcidMetadata,
} from './profile-fatty-acid-migrations.js';

/**
 * @typedef {Record<string, any>} ProfileData
 */

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
function _normalizeProfileMarkerLabel(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00b5\u03bc]/g, 'u')
    .replace(/\s*[\(\[]\s*[^)\]]*(?:u?kat|mmol|umol|nmol|pmol|mol|mg|ug|ng|pg|g\s*\/\s*l|m\s*u|iu\s*\/\s*l|u\s*\/\s*l|10\s*\^?\s*\d+|arb\.?\s*j\.?|fl|%)[^)\]]*[\)\]]\s*/gi, ' ')
    .replace(/\s+(?:u?kat|mmol|umol|nmol|pmol|mol|mg|ug|ng|pg|g|m\s*u|iu|u|10\s*\^?\s*\d+|arb\.?\s*j\.?|fl|%)\s*(?:\/\s*[a-z0-9^]+)?\s*$/i, ' ')
    .replace(/[^a-zA-Z0-9#]+/g, '')
    .toLowerCase();
}

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
function _stripProfileMarkerUnitSuffix(value) {
  return String(value || '').replace(/(?:u?katl|mmoll|umoll|nmoll|pmoll|mgl|ugl|ngl|gl|iul|ul|percent)$/i, '');
}

/**
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
function _hasProfileMarkerUnitDecoration(value) {
  const raw = String(value || '');
  if (!raw) return false;
  if (_stripProfileMarkerUnitSuffix(raw) !== raw) return true;
  return /\s*[\(\[]\s*[^)\]]*(?:u?kat|mmol|umol|nmol|pmol|mol|mg|ug|ng|pg|g\s*\/\s*l|m\s*u|iu\s*\/\s*l|u\s*\/\s*l|10\s*\^?\s*\d+|arb\.?\s*j\.?|fl|%)[^)\]]*[\)\]]\s*/i.test(raw.replace(/[\u00b5\u03bc]/g, 'u'));
}

/**
 * @returns {Map<string, string>}
 */
function _buildProfileStandardMarkerLookup() {
  const lookup = new Map();
  /**
   * @param {string} label
   * @param {string} key
   */
  const add = (label, key) => {
    const normalized = _normalizeProfileMarkerLabel(label);
    if (normalized && !lookup.has(normalized)) lookup.set(normalized, key);
    const suffixStripped = _normalizeProfileMarkerLabel(_stripProfileMarkerUnitSuffix(label));
    if (suffixStripped && !lookup.has(suffixStripped)) lookup.set(suffixStripped, key);
  };
  for (const [catKey, cat] of Object.entries(MARKER_SCHEMA)) {
    if (cat.calculated) continue;
    for (const [markerKey, marker] of Object.entries(cat.markers || {})) {
      const fullKey = `${catKey}.${markerKey}`;
      add(markerKey, fullKey);
      add(marker.name, fullKey);
    }
  }
  return lookup;
}

/**
 * @param {ProfileData} data
 * @returns {void}
 */
function _repairCanonicalMarkerAliases(data) {
  if (!data.entries?.length) return;
  const remapByPrefix = (obj, oldKey, nextKey) => {
    if (!obj) return;
    const prefix = oldKey + ':';
    for (const key of Object.keys(obj)) {
      if (!key.startsWith(prefix)) continue;
      const remapped = nextKey + key.slice(oldKey.length);
      if (obj[remapped] === undefined) obj[remapped] = obj[key];
      delete obj[key];
    }
  };
  for (const [oldKey, nextKey] of Object.entries(BUILTIN_MARKER_DOT_KEY_ALIASES)) {
    for (const entry of data.entries) renameLabEntryMarker(entry, oldKey, nextKey, { stamp: false });
    remapByPrefix(data.manualValues, oldKey, nextKey);
    remapByPrefix(data.markerValueNotes, oldKey, nextKey);
    if (data.refOverrides?.[oldKey]) {
      if (!data.refOverrides[nextKey]) data.refOverrides[nextKey] = data.refOverrides[oldKey];
      delete data.refOverrides[oldKey];
    }
    if (data.markerNotes?.[oldKey] && !data.markerNotes[nextKey]) data.markerNotes[nextKey] = data.markerNotes[oldKey];
    if (data.markerNotes) delete data.markerNotes[oldKey];
    if (data.markerLabels?.[oldKey] && !data.markerLabels[nextKey]) data.markerLabels[nextKey] = data.markerLabels[oldKey];
    if (data.markerLabels) delete data.markerLabels[oldKey];
    if (data.customMarkers) delete data.customMarkers[oldKey];
  }
}

/**
 * @param {ProfileData} data
 * @returns {void}
 */
function _repairNamedStandardMarkerAliases(data) {
  if (!data.entries?.length) return;
  const labelAliases = new Map([
    ['lpa', 'lipids.lpA'],
    ['lipoproteina', 'lipids.lpA'],
    ['lipoproteinapolipoproteina', 'lipids.lpA'],
    ['totalcholesterol', 'lipids.cholesterol'],
    ['cholesteroltotal', 'lipids.cholesterol'],
    ['hdlcholesterol', 'lipids.hdl'],
    ['cholhdlratio', 'calculatedRatios.cholHdlRatio'],
    ['totalcholesterolhdlratio', 'calculatedRatios.cholHdlRatio'],
  ]);
  const remapByPrefix = (obj, oldKey, nextKey) => {
    if (!obj) return;
    const prefix = oldKey + ':';
    for (const key of Object.keys(obj)) {
      if (!key.startsWith(prefix)) continue;
      const remapped = nextKey + key.slice(oldKey.length);
      if (obj[remapped] === undefined) obj[remapped] = obj[key];
      delete obj[key];
    }
  };
  const candidates = new Set(Object.keys(data.customMarkers || {}));
  for (const entry of data.entries) for (const key of Object.keys(entry.markers || {})) candidates.add(key);
  for (const fullKey of candidates) {
    const [catKey, markerKey] = fullKey.split('.');
    if (!markerKey || SPECIALTY_MARKER_DEFS[fullKey]) continue;
    if (MARKER_SCHEMA[catKey]?.markers?.[markerKey]) continue;
    const def = data.customMarkers?.[fullKey] || {};
    const target = labelAliases.get(_normalizeProfileMarkerLabel(def?.name))
      || labelAliases.get(_normalizeProfileMarkerLabel(markerKey));
    if (!target || target === fullKey) continue;
    for (const entry of data.entries) renameLabEntryMarker(entry, fullKey, target, { stamp: false });
    remapByPrefix(data.manualValues, fullKey, target);
    remapByPrefix(data.markerValueNotes, fullKey, target);
    if (data.refOverrides?.[fullKey]) {
      if (!data.refOverrides[target]) data.refOverrides[target] = data.refOverrides[fullKey];
      delete data.refOverrides[fullKey];
    }
    if (data.markerNotes?.[fullKey] && !data.markerNotes[target]) data.markerNotes[target] = data.markerNotes[fullKey];
    if (data.markerNotes) delete data.markerNotes[fullKey];
    if (data.markerLabels?.[fullKey] && !data.markerLabels[target]) data.markerLabels[target] = data.markerLabels[fullKey];
    if (data.markerLabels) delete data.markerLabels[fullKey];
    if (data.customMarkers) delete data.customMarkers[fullKey];
  }
}

/**
 * @param {ProfileData} data
 * @returns {void}
 */
function _repairUnitSuffixedStandardMarkers(data) {
  if (!data.entries?.length) return;
  const lookup = _buildProfileStandardMarkerLookup();
  const candidates = new Set(Object.keys(data.customMarkers || {}));
  for (const entry of data.entries) {
    for (const key of Object.keys(entry.markers || {})) candidates.add(key);
  }
  const toDelete = [];
  for (const fullKey of candidates) {
    const def = data.customMarkers?.[fullKey] || {};
    const [catKey, markerKey] = fullKey.split('.');
    if (!markerKey || SPECIALTY_MARKER_DEFS[fullKey]) continue;
    if (MARKER_SCHEMA[catKey]?.markers?.[markerKey]) continue;
    const looksUnitSuffixed = _hasProfileMarkerUnitDecoration(def?.name) || _hasProfileMarkerUnitDecoration(markerKey);
    if (!looksUnitSuffixed) continue;
    const target = lookup.get(_normalizeProfileMarkerLabel(def?.name))
      || lookup.get(_normalizeProfileMarkerLabel(markerKey))
      || lookup.get(_normalizeProfileMarkerLabel(_stripProfileMarkerUnitSuffix(markerKey)));
    if (!target || target === fullKey) continue;
    const targetCatKey = target.split('.')[0];
    if (catKey === 'urinalysis' && targetCatKey !== 'urinalysis') continue;
    for (const entry of data.entries) {
      renameLabEntryMarker(entry, fullKey, target, { stamp: false });
    }
    const remapByPrefix = (obj) => {
      if (!obj) return;
      const prefix = fullKey + ':';
      for (const key of Object.keys(obj)) {
        if (!key.startsWith(prefix)) continue;
        const nextKey = target + key.slice(fullKey.length);
        if (obj[nextKey] === undefined) obj[nextKey] = obj[key];
        delete obj[key];
      }
    };
    remapByPrefix(data.manualValues);
    remapByPrefix(data.markerValueNotes);
    if (data.refOverrides?.[fullKey]) {
      if (!data.refOverrides[target]) data.refOverrides[target] = data.refOverrides[fullKey];
      delete data.refOverrides[fullKey];
    }
    if (data.markerNotes?.[fullKey] && !data.markerNotes[target]) data.markerNotes[target] = data.markerNotes[fullKey];
    if (data.markerNotes) delete data.markerNotes[fullKey];
    if (data.markerLabels?.[fullKey] && !data.markerLabels[target]) data.markerLabels[target] = data.markerLabels[fullKey];
    if (data.markerLabels) delete data.markerLabels[fullKey];
    if (data.customMarkers?.[fullKey]) toDelete.push(fullKey);
  }
  for (const key of toDelete) delete data.customMarkers[key];
}

/**
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
function _hasPositiveSpadiaLabel(value) {
  const compact = _normalizeProfileMarkerLabel(value);
  if (!compact.includes('spadia')) return false;
  const text = String(value || '').toLowerCase();
  if (/\b(?:non|not|no|without)[\s_-]*spadia\b/.test(text)) return false;
  return !/(?:non|not|no|without)spadia/.test(compact);
}

const FRACTION_STORED_PERCENT_MARKERS = new Set([
  'differential.neutrophilsPct',
  'differential.lymphocytesPct',
  'differential.monocytesPct',
  'differential.eosinophilsPct',
  'differential.basophilsPct',
]);

/**
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
function _isProfilePercentUnit(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/\s/g, '')
    .replace(/[\u00b5\u03bc]/g, 'u');
  return normalized === '%' || normalized === 'pct' || normalized === 'percent' || normalized === 'percentage';
}

/**
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
function _isSpadiaFattyAcidSource(value) {
  const compact = _normalizeProfileMarkerLabel(value);
  return _hasPositiveSpadiaLabel(value) && (compact.includes('fattyacid') || compact.includes('mastnekyseliny'));
}

/**
 * @param {any} marker
 * @returns {boolean}
 */
function _isSpadiaFattyAcidMarkerMetadata(marker) {
  const key = marker?.mappedKey || marker?.suggestedKey || '';
  if (key.startsWith('spadiaFA.')) return true;
  const group = _normalizeProfileMarkerLabel(marker?.suggestedGroup || '');
  return _hasPositiveSpadiaLabel(marker?.suggestedCategoryLabel || '') && (!group || group.includes('fattyacid') || group.includes('mastnekyseliny'));
}

/**
 * @param {any} snap
 * @returns {boolean}
 */
function _hasFattyAcidSnapshotMarker(snap) {
  return Array.isArray(snap?.markers) && snap.markers.some(marker => {
    const key = marker?.mappedKey || marker?.suggestedKey || '';
    if (_fattyAcidMarkerPart(key) || key.startsWith('spadiaFA.')) return true;
    const group = _normalizeProfileMarkerLabel(marker?.suggestedGroup || '');
    return group.includes('fattyacid') || group.includes('mastnekyseliny');
  });
}

/**
 * @param {any} snap
 * @returns {string}
 */
function _snapshotSourceText(snap) {
  const parts = [];
  if (snap?.fileName) parts.push(snap.fileName);
  if (snap?.sourceFile) parts.push(snap.sourceFile);
  if (Array.isArray(snap?.sourceFiles)) parts.push(...snap.sourceFiles);
  if (snap?.sourceType) parts.push(snap.sourceType);
  if (snap?.sourceName) parts.push(snap.sourceName);
  if (snap?.sourceLabel) parts.push(snap.sourceLabel);
  if (snap?.source) parts.push(snap.source);
  if (snap?.importer) parts.push(snap.importer);
  if (snap?.importerName) parts.push(snap.importerName);
  return parts.join(' ');
}

/**
 * @param {any} snap
 * @returns {boolean}
 */
function _isSpadiaFattyAcidSnapshot(snap) {
  const fileText = `${snap?.fileName || ''} ${snap?.sourceFile || ''} ${Array.isArray(snap?.sourceFiles) ? snap.sourceFiles.join(' ') : ''}`;
  if (_isSpadiaFattyAcidSource(fileText)) return true;
  const productText = `${snap?.labName || ''} ${snap?.productLabel || ''}`;
  if (_isSpadiaFattyAcidSource(productText)) return true;
  const sourceText = _snapshotSourceText(snap);
  if (_isSpadiaFattyAcidSource(sourceText)) return true;
  if (_hasPositiveSpadiaLabel(`${fileText} ${productText} ${sourceText}`) && _hasFattyAcidSnapshotMarker(snap)) return true;
  return Array.isArray(snap?.markers) && snap.markers.some(_isSpadiaFattyAcidMarkerMetadata);
}

/**
 * @param {any} entry
 * @returns {string}
 */
function _entrySourceText(entry) {
  const parts = [];
  if (entry?.sourceFile) parts.push(entry.sourceFile);
  if (Array.isArray(entry?.sourceFiles)) parts.push(...entry.sourceFiles);
  if (entry?.markerSources && typeof entry.markerSources === 'object') {
    for (const source of Object.values(entry.markerSources)) {
      if (source?.file) parts.push(source.file);
    }
  }
  return parts.join(' ');
}

/**
 * @param {ProfileData} data
 * @param {string} oldKey
 * @param {string} nextKey
 * @param {string | null} [date]
 * @returns {void}
 */
function _copyDateScopedProfileMarkerData(data, oldKey, nextKey, date = null) {
  const copyExact = (obj, scopedDate) => {
    if (!obj) return;
    const from = `${oldKey}:${scopedDate}`;
    const to = `${nextKey}:${scopedDate}`;
    if (obj[from] !== undefined && obj[to] === undefined) obj[to] = obj[from];
  };
  const copyAll = (obj) => {
    if (!obj) return;
    const prefix = `${oldKey}:`;
    for (const key of Object.keys(obj)) {
      if (!key.startsWith(prefix)) continue;
      const to = `${nextKey}:${key.slice(prefix.length)}`;
      if (obj[to] === undefined) obj[to] = obj[key];
    }
  };
  if (date) {
    copyExact(data.manualValues, date);
    copyExact(data.markerValueNotes, date);
    copyExact(data.markerLabels, date);
    copyExact(data.refOverrides, date);
  } else {
    copyAll(data.manualValues);
    copyAll(data.markerValueNotes);
    copyAll(data.markerLabels);
    copyAll(data.refOverrides);
  }
}

/**
 * @param {ProfileData} data
 * @param {string} oldKey
 * @param {string | null} [date]
 * @returns {void}
 */
function _deleteDateScopedProfileMarkerData(data, oldKey, date = null) {
  const deleteExact = (obj, scopedDate) => {
    if (!obj) return;
    delete obj[`${oldKey}:${scopedDate}`];
  };
  const deleteAll = (obj) => {
    if (!obj) return;
    const prefix = `${oldKey}:`;
    for (const key of Object.keys(obj)) {
      if (key.startsWith(prefix)) delete obj[key];
    }
  };
  if (date) {
    deleteExact(data.manualValues, date);
    deleteExact(data.markerValueNotes, date);
    deleteExact(data.markerLabels, date);
    deleteExact(data.refOverrides, date);
  } else {
    deleteAll(data.manualValues);
    deleteAll(data.markerValueNotes);
    deleteAll(data.markerLabels);
    deleteAll(data.refOverrides);
  }
}

/**
 * @param {ProfileData} data
 * @param {string} oldKey
 * @param {string} nextKey
 * @returns {void}
 */
function _copyGlobalProfileMarkerData(data, oldKey, nextKey) {
  if (data.refOverrides?.[oldKey] && !data.refOverrides[nextKey]) data.refOverrides[nextKey] = data.refOverrides[oldKey];
  if (data.markerNotes?.[oldKey] && !data.markerNotes[nextKey]) data.markerNotes[nextKey] = data.markerNotes[oldKey];
  if (data.markerLabels?.[oldKey] && !data.markerLabels[nextKey]) data.markerLabels[nextKey] = data.markerLabels[oldKey];
}

/**
 * @param {ProfileData} data
 * @param {string} oldKey
 * @returns {void}
 */
function _deleteGlobalProfileMarkerData(data, oldKey) {
  if (data.refOverrides) delete data.refOverrides[oldKey];
  if (data.markerNotes) delete data.markerNotes[oldKey];
  if (data.markerLabels) delete data.markerLabels[oldKey];
}

/**
 * @param {ProfileData} data
 * @param {string} key
 * @returns {boolean}
 */
function _profileHasStructuralMarkerKey(data, key) {
  if (data.entries?.some(entry => entry.markers && Object.prototype.hasOwnProperty.call(entry.markers, key))) return true;
  if (data.importSnapshots?.some(snap => Array.isArray(snap.markers) && snap.markers.some(m => m?.mappedKey === key || m?.suggestedKey === key))) return true;
  return false;
}

/**
 * @param {ProfileData} data
 * @param {string} key
 * @param {string | null | undefined} date
 * @returns {boolean}
 */
function _profileHasStructuralMarkerKeyOnDate(data, key, date) {
  if (!date) return _profileHasStructuralMarkerKey(data, key);
  if (data.entries?.some(entry => entry.date === date && entry.markers && Object.prototype.hasOwnProperty.call(entry.markers, key))) return true;
  if (data.importSnapshots?.some(snap => (!snap?.date || snap.date === date) && Array.isArray(snap.markers) && snap.markers.some(m => m?.mappedKey === key || m?.suggestedKey === key))) return true;
  return false;
}

/**
 * @param {string | null | undefined} key
 * @returns {string | null}
 */
function _fattyAcidMarkerPart(key) {
  const prefix = 'fattyAcids.';
  if (!key?.startsWith(prefix)) return null;
  const markerPart = key.slice(prefix.length);
  return markerPart && !markerPart.includes('.') ? markerPart : null;
}

/**
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function _profileMarkerValuesMatch(a, b) {
  if (a === b) return true;
  const aNum = Number(a);
  const bNum = Number(b);
  return Number.isFinite(aNum) && Number.isFinite(bNum) && Math.abs(aNum - bNum) < 1e-9;
}

/**
 * @param {any} marker
 * @returns {{ key: string, canonicalValue: number, dividedValue: number | null, wholePercentValue: number | null } | null}
 */
function _fractionStoredPercentSnapshotMarker(marker) {
  const key = marker?.mappedKey || marker?.suggestedKey || '';
  if (!FRACTION_STORED_PERCENT_MARKERS.has(key)) return null;
  if (!_isProfilePercentUnit(marker?.unit)) return null;
  const value = Number(marker?.value);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  const [catKey, markerKey] = key.split('.');
  const schemaRefMax = Number(MARKER_SCHEMA[catKey]?.markers?.[markerKey]?.refMax);
  const markerRefMax = Number(marker?.refMax);
  const snapshotRangeUsesWholePercent = Number.isFinite(markerRefMax) && markerRefMax > 1;
  const valueLooksCanonical = Number.isFinite(schemaRefMax) && value <= schemaRefMax;
  const valueUsesWholePercent = value > 1 || (snapshotRangeUsesWholePercent && !valueLooksCanonical);
  const canonicalValue = valueUsesWholePercent ? parseFloat((value / 100).toPrecision(6)) : value;
  return {
    key,
    canonicalValue,
    dividedValue: valueUsesWholePercent ? null : parseFloat((value / 100).toPrecision(6)),
    wholePercentValue: valueUsesWholePercent ? value : null,
  };
}

/**
 * @param {ProfileData} data
 * @param {string} key
 * @param {any} marker
 * @returns {void}
 */
function _repairFractionStoredPercentRefOverride(data, key, marker) {
  const override = data.refOverrides?.[key];
  if (!override || !_isProfilePercentUnit(marker?.unit)) return;
  const pairs = [
    ['refMin', 'refMin'],
    ['refMax', 'refMax'],
    ['labRefMin', 'refMin'],
    ['labRefMax', 'refMax'],
  ];
  const markerRefMax = Number(marker?.refMax);
  const snapshotRangeUsesWholePercent = Number.isFinite(markerRefMax) && markerRefMax > 1;
  const [catKey, markerKey] = key.split('.');
  const schemaRefMax = Number(MARKER_SCHEMA[catKey]?.markers?.[markerKey]?.refMax);
  for (const [overrideField, markerField] of pairs) {
    const raw = Number(marker?.[markerField]);
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) continue;
    const rawLooksCanonical = Number.isFinite(schemaRefMax) && raw <= schemaRefMax;
    const rawUsesWholePercent = raw > 1 || (snapshotRangeUsesWholePercent && !rawLooksCanonical);
    const canonical = rawUsesWholePercent ? parseFloat((raw / 100).toPrecision(6)) : raw;
    const divided = rawUsesWholePercent ? null : parseFloat((raw / 100).toPrecision(6));
    if (divided != null && _profileMarkerValuesMatch(override[overrideField], divided)) {
      override[overrideField] = raw;
    } else if (raw > 1 && _profileMarkerValuesMatch(override[overrideField], raw)) {
      override[overrideField] = canonical;
    }
  }
}

/**
 * @param {ProfileData} data
 * @returns {void}
 */
function _repairFractionStoredPercentImports(data) {
  if (!Array.isArray(data.importSnapshots) || !Array.isArray(data.entries)) return;
  for (const snap of data.importSnapshots) {
    if (!Array.isArray(snap?.markers)) continue;
    for (const marker of snap.markers) {
      const percentMarker = _fractionStoredPercentSnapshotMarker(marker);
      if (!percentMarker) continue;
      const { key, canonicalValue, dividedValue, wholePercentValue } = percentMarker;
      if (!marker.mappedKey && marker.suggestedKey === key) {
        marker.mappedKey = key;
        marker.suggestedKey = null;
        marker.matched = true;
      }
      for (const entry of data.entries) {
        if (!entry?.markers || !Object.prototype.hasOwnProperty.call(entry.markers, key)) continue;
        const source = entry.markerSources?.[key];
        const sourceMatches = (snap?.id && source?.snapshotId === snap.id)
          || (snap?.date && entry.date === snap.date && (
            (dividedValue != null && _profileMarkerValuesMatch(entry.markers[key], dividedValue))
            || (wholePercentValue != null && _profileMarkerValuesMatch(entry.markers[key], wholePercentValue))
          ));
        if (!sourceMatches) continue;
        if (dividedValue != null && _profileMarkerValuesMatch(entry.markers[key], dividedValue)) entry.markers[key] = canonicalValue;
        if (wholePercentValue != null && _profileMarkerValuesMatch(entry.markers[key], wholePercentValue)) entry.markers[key] = canonicalValue;
      }
      _repairFractionStoredPercentRefOverride(data, key, marker);
      if (data.customMarkers?.[key] && MARKER_SCHEMA[key.split('.')[0]]?.markers?.[key.split('.')[1]]) {
        delete data.customMarkers[key];
      }
    }
  }
}

/**
 * Repair values imported while a marker key was still custom, before that same
 * key became part of the standard schema. Import snapshots retain the original
 * value and unit, so only exact raw-value matches are safe to canonicalize.
 *
 * @param {ProfileData} data
 * @returns {void}
 */
function _repairNewlyStandardizedImports(data) {
  if (!Array.isArray(data.importSnapshots) || !Array.isArray(data.entries)) return;
  const legacyCustomKeys = new Set(Object.keys(data.customMarkers || {}).filter(key => {
    const [catKey, markerKey] = key.split('.');
    return !!MARKER_SCHEMA[catKey]?.markers?.[markerKey];
  }));
  if (legacyCustomKeys.size === 0) return;
  const snapshotBackedKeys = new Set();

  for (const snap of data.importSnapshots) {
    if (!Array.isArray(snap?.markers)) continue;
    for (const marker of snap.markers) {
      const key = marker?.mappedKey || marker?.suggestedKey || '';
      if (!legacyCustomKeys.has(key) || FRACTION_STORED_PERCENT_MARKERS.has(key)) continue;
      const rawValue = Number(marker?.value);
      if (!Number.isFinite(rawValue)) continue;
      const canonicalValue = normalizeToSI(key, rawValue, marker?.unit, marker);
      if (!Number.isFinite(canonicalValue)) continue;
      snapshotBackedKeys.add(key);

      if (!marker.mappedKey && marker.suggestedKey === key) {
        marker.mappedKey = key;
        marker.suggestedKey = null;
        marker.matched = true;
      }

      for (const entry of data.entries) {
        if (!entry?.markers || !Object.prototype.hasOwnProperty.call(entry.markers, key)) continue;
        const storedValue = entry.markers[key];
        if (!_profileMarkerValuesMatch(storedValue, rawValue)) continue;
        const source = entry.markerSources?.[key];
        const sourceMatches = (snap?.id && source?.snapshotId === snap.id)
          || (snap?.date && entry.date === snap.date);
        if (sourceMatches) entry.markers[key] = canonicalValue;
      }

      const override = data.refOverrides?.[key];
      if (override) {
        const rangeFields = [
          ['refMin', 'refMin'],
          ['refMax', 'refMax'],
          ['labRefMin', 'refMin'],
          ['labRefMax', 'refMax'],
        ];
        for (const [overrideField, markerField] of rangeFields) {
          const rawRange = Number(marker?.[markerField]);
          if (!Number.isFinite(rawRange) || !_profileMarkerValuesMatch(override[overrideField], rawRange)) continue;
          const canonicalRange = normalizeToSI(key, rawRange, marker?.unit, marker);
          if (Number.isFinite(canonicalRange)) override[overrideField] = canonicalRange;
        }
      }
    }
  }

  for (const key of snapshotBackedKeys) delete data.customMarkers[key];
}

/**
 * @param {any} entry
 * @param {any} snap
 * @param {string} oldKey
 * @param {any} marker
 * @returns {boolean}
 */
function _entryMatchesSpadiaSnapshotMarker(entry, snap, oldKey, marker) {
  if (!entry?.markers || !Object.prototype.hasOwnProperty.call(entry.markers, oldKey)) return false;
  if (snap?.id && entry.markerSources?.[oldKey]?.snapshotId === snap.id) return true;
  if (_isSpadiaFattyAcidSource(_entrySourceText(entry))) return true;
  if (!_profileMarkerValuesMatch(entry.markers[oldKey], marker?.value)) return false;
  if (snap?.date && entry.date) return entry.date === snap.date;
  if (!entry.date && _entrySourceText(entry)) return false;
  return !entry.date;
}

/**
 * @param {ProfileData} data
 * @param {any} entry
 * @param {string} oldKey
 * @param {string} nextKey
 * @returns {boolean}
 */
function _remapSpadiaFattyAcidEntry(data, entry, oldKey, nextKey) {
  if (!renameLabEntryMarker(entry, oldKey, nextKey, { stamp: false })) return false;
  ensureProductFattyAcidCustomMarker(data, oldKey, nextKey);
  if (entry.date) {
    _copyDateScopedProfileMarkerData(data, oldKey, nextKey, entry.date);
  }
  if (entry.date && !_profileHasStructuralMarkerKeyOnDate(data, oldKey, entry.date)) {
    _deleteDateScopedProfileMarkerData(data, oldKey, entry.date);
  }
  return true;
}

/**
 * @param {ProfileData} data
 * @returns {void}
 */
function _repairSpadiaFattyAcidKeys(data) {
  const renamedKeys = new Map();
  const remapKey = (oldKey) => {
    const markerPart = _fattyAcidMarkerPart(oldKey);
    return markerPart ? `spadiaFA.${markerPart}` : null;
  };
  for (const entry of data.entries || []) {
    if (!_isSpadiaFattyAcidSource(_entrySourceText(entry))) continue;
    for (const oldKey of Object.keys(entry.markers || {})) {
      const nextKey = remapKey(oldKey);
      if (!nextKey) continue;
      if (_remapSpadiaFattyAcidEntry(data, entry, oldKey, nextKey)) {
        renamedKeys.set(oldKey, nextKey);
      }
    }
  }
  for (const snap of data.importSnapshots || []) {
    if (!_isSpadiaFattyAcidSnapshot(snap)) continue;
    if (!Array.isArray(snap.markers)) continue;
    for (const marker of snap.markers) {
      const oldKey = marker?.mappedKey?.startsWith('fattyAcids.') ? marker.mappedKey
        : marker?.suggestedKey?.startsWith('fattyAcids.') ? marker.suggestedKey
          : null;
      const productKey = marker?.mappedKey?.startsWith('spadiaFA.') ? marker.mappedKey
        : marker?.suggestedKey?.startsWith('spadiaFA.') ? marker.suggestedKey
          : null;
      const nextKey = oldKey ? remapKey(oldKey) : productKey;
      if (!nextKey) continue;
      const markerPart = nextKey.slice('spadiaFA.'.length);
      const genericKey = oldKey || `fattyAcids.${markerPart}`;
      const def = SPECIALTY_MARKER_DEFS[genericKey] || {};
      marker.mappedKey = nextKey;
      marker.suggestedKey = null;
      marker.suggestedName = marker.suggestedName || def.name || marker.rawName;
      marker.suggestedCategoryLabel = 'Spadia';
      marker.suggestedGroup = 'Fatty Acids';
      marker.matched = true;
      ensureProductFattyAcidCustomMarker(data, genericKey, nextKey, marker);
      if (!oldKey) continue;
      renamedKeys.set(oldKey, nextKey);
      if (snap?.date) {
        _copyDateScopedProfileMarkerData(data, oldKey, nextKey, snap.date);
      }
      for (const entry of data.entries || []) {
        if (_entryMatchesSpadiaSnapshotMarker(entry, snap, oldKey, marker)
          && _remapSpadiaFattyAcidEntry(data, entry, oldKey, nextKey)) {
          renamedKeys.set(oldKey, nextKey);
        }
      }
    }
  }
  for (const [oldKey, nextKey] of renamedKeys) {
    _copyGlobalProfileMarkerData(data, oldKey, nextKey);
    if (_profileHasStructuralMarkerKey(data, oldKey)) continue;
    _copyDateScopedProfileMarkerData(data, oldKey, nextKey);
    _deleteDateScopedProfileMarkerData(data, oldKey);
    _deleteGlobalProfileMarkerData(data, oldKey);
    if (data.customMarkers) delete data.customMarkers[oldKey];
  }
}

/**
 * @param {ProfileData} data
 * @returns {void}
 */
export function repairProfileMarkerData(data) {
  _repairCanonicalMarkerAliases(data);
  _repairNamedStandardMarkerAliases(data);
  _repairUnitSuffixedStandardMarkers(data);
  _repairNewlyStandardizedImports(data);
  _repairFractionStoredPercentImports(data);
  repairSnapshotBackedProductFattyAcidMetadata(data);
  _repairSpadiaFattyAcidKeys(data);
}
