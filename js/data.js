// @ts-check
// data.js — Data pipeline, unit conversion, date range, trend detection

import { state } from './state.js';
import { populateCalculatedMarkers } from './data-calculated-markers.js';
import {
  CONTEXT_OPTIMAL_RANGES,
  CONTEXT_REFERENCE_RANGES,
  MARKER_SCHEMA,
  UNIT_CONVERSIONS,
  OPTIMAL_RANGES,
  PHASE_RANGES,
} from './schema.js';
import { hashString, isDebugMode, showNotification } from './utils.js';
import { profileStorageKey, touchProfileTimestamp, migrateProfileData } from './profile.js';
import {
  encryptedGetItem, encryptedSetItem, broadcastDataChanged, scheduleAutoBackup,
} from './crypto.js';
import { onDataSaved } from './sync.js';
import { onProfileSaved } from './sync-save-hooks.js';
import { recalculateLabEntryHOMAIR } from './lab-entry.js';
import { getLabDateRangeBounds } from './lab-date-range.js';
import {
  getAllFlaggedMarkers as getAllFlaggedMarkersForData,
} from './marker-analysis.js';
import { configureDataViewCoreDependencies } from './data-view-controls.js';
import { applyMarkerPlacements } from './marker-placement.js';
import {
  cortisolReferenceForSampleTime,
  parseSampleHour,
  resolveAgeSexRange,
  wholeAgeAtDate,
} from './marker-context-ranges.js';

export {
  countFlagged,
  getContextOptimalEnvelope,
  detectTrendAlerts,
  getContextRefEnvelope,
  getEffectiveRange,
  getEffectiveRangeForDate,
  getEffectiveRangeLabelForDate,
  getKeyTrendMarkers,
  getLatestValueIndex,
  getPhaseRefEnvelope,
  statusIcon,
} from './marker-analysis.js';
export {
  configureDataRuntimeDeps,
  dataActionAttrs,
  dataChangeAttrs,
  destroyAllCharts,
  installDataActionDelegates,
  renderChartLayersDropdown,
  renderDateRangeFilter,
  setDateRange,
  setNoteOverlay,
  setPhaseOverlay,
  setSuppOverlay,
  switchRangeMode,
  switchUnitSystem,
  toggleAltUnits,
  toggleChartLayersDropdown,
  updateHeaderDates,
  updateHeaderRangeToggle,
} from './data-view-controls.js';

/**
 * @typedef {import('../types/app-state.js').ProfileData} ImportedDataRecord
 */

/** @type {{ invalidateLabContextCache: (() => void) | null }} */
const dataContextDeps = {
  invalidateLabContextCache: null,
};

export function configureDataContextDependencies(deps = {}) {
  const previous = { ...dataContextDeps };
  if (Object.prototype.hasOwnProperty.call(deps, 'invalidateLabContextCache')) {
    dataContextDeps.invalidateLabContextCache = deps.invalidateLabContextCache;
  }
  return previous;
}


// ═══════════════════════════════════════════════
// PRIVATE CYCLE PHASE HELPER (avoids circular dep with cycle.js)
// ═══════════════════════════════════════════════
function _getCyclePhase(dateStr, mc) {
  if (!mc || !mc.periods || mc.periods.length === 0) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const sorted = mc.periods.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  let periodStart = null;
  for (const p of sorted) {
    if (new Date(p.startDate + 'T00:00:00') <= target) { periodStart = p.startDate; break; }
  }
  if (!periodStart) return null;
  const startDate = new Date(periodStart + 'T00:00:00');
  const cycleDay = Math.floor((target.getTime() - startDate.getTime()) / 86400000) + 1;
  const cycleLen = mc.cycleLength || 28;
  if (cycleDay > cycleLen + 7) return null;
  const periodLen = mc.periodLength || 5;
  const ovulationDay = cycleLen - 14;
  let phase, phaseName;
  if (cycleDay <= periodLen) { phase = 'menstrual'; phaseName = 'Menstrual'; }
  else if (cycleDay < ovulationDay - 1) { phase = 'follicular'; phaseName = 'Follicular'; }
  else if (cycleDay <= ovulationDay + 1) { phase = 'ovulatory'; phaseName = 'Ovulatory'; }
  else { phase = 'luteal'; phaseName = 'Luteal'; }
  return { cycleDay, phase, phaseName, source: 'predicted' };
}

const CYCLE_PHASE_NAMES = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  ovulatory: 'Ovulatory',
  luteal: 'Luteal',
};

function _normalizeCyclePhase(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return null;
  if (normalized.includes('menstrual') || normalized === 'menses') return 'menstrual';
  if (normalized.includes('follicular')) return 'follicular';
  if (normalized.includes('ovulat')) return 'ovulatory';
  if (normalized.includes('luteal')) return 'luteal';
  return null;
}

function _phaseDetailName(value, fallback) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return fallback;
  const labels = {
    early_follicular: 'Early follicular',
    late_follicular: 'Late follicular',
    periovulatory: 'Periovulatory',
    early_luteal: 'Early luteal',
    mid_luteal: 'Mid-luteal',
    late_luteal: 'Late luteal',
  };
  return labels[normalized] || fallback;
}

function _getRecordedDrawCyclePhase(context) {
  const phase = _normalizeCyclePhase(context?.cyclePhase);
  if (!phase) return null;
  const cycleDayNumber = Number(context?.cycleDay);
  const cycleDay = Number.isInteger(cycleDayNumber) && cycleDayNumber > 0 ? cycleDayNumber : null;
  const phaseName = CYCLE_PHASE_NAMES[phase];
  return {
    cycleDay,
    phase,
    phaseName,
    phaseDetailName: _phaseDetailName(context?.cyclePhaseDetail, phaseName),
    source: String(context?.cyclePhaseSource || '').toLowerCase() === 'predicted' ? 'predicted' : 'recorded',
  };
}

// ═══════════════════════════════════════════════
// REFRESH CALLBACK
// ═══════════════════════════════════════════════
let _refreshCallback = null;
export function registerRefreshCallback(fn) { _refreshCallback = fn; }
export function _runRegisteredRefreshCallback() {
  if (typeof _refreshCallback === 'function') _refreshCallback();
}

let _activeDataCache = null;
let _activeDataCacheMeta = null;

export function invalidateActiveDataCache() {
  _activeDataCache = null;
  _activeDataCacheMeta = null;
}

function _activeDataCacheMatches(meta) {
  const prev = _activeDataCacheMeta;
  return !!(_activeDataCache && prev
    && prev.importedData === meta.importedData
    && prev.entries === meta.entries
    && prev.entriesLength === meta.entriesLength
    && prev.customMarkers === meta.customMarkers
    && prev.markerPlacements === meta.markerPlacements
    && prev.refOverrides === meta.refOverrides
    && prev.categoryLabels === meta.categoryLabels
    && prev.categoryIcons === meta.categoryIcons
    && prev.markerLabels === meta.markerLabels
    && prev.menstrualCycle === meta.menstrualCycle
    && prev.biometrics === meta.biometrics
    && prev.wearableSummary === meta.wearableSummary
    && prev.wearableWeightLatest === meta.wearableWeightLatest
    && prev.legacyWeightStamp === meta.legacyWeightStamp
    && prev.profileContextKey === meta.profileContextKey
    && prev.unitSystem === meta.unitSystem
    && prev.profileSex === meta.profileSex
    && prev.profileDob === meta.profileDob);
}

function _makeActiveDataCacheMeta() {
  const importedData = /** @type {ImportedDataRecord} */ (state.importedData || {});
  const entries = importedData.entries || null;
  const biometrics = importedData.biometrics || null;
  const wearableSummary = importedData.wearableSummary || null;
  const weightRows = Array.isArray(biometrics?.weight) ? biometrics.weight : [];
  const lastWeight = weightRows.length ? weightRows[weightRows.length - 1] : null;
  const wearableWeightLatest = wearableSummary?.metrics?.weight?.latest ?? null;
  const legacyWeightStamp = lastWeight
    ? `${weightRows.length}:${lastWeight.date || ''}:${lastWeight.value ?? ''}:${lastWeight.unit || ''}`
    : '';
  return {
    importedData,
    entries,
    entriesLength: Array.isArray(entries) ? entries.length : 0,
    customMarkers: importedData.customMarkers || null,
    markerPlacements: importedData.markerPlacements || null,
    refOverrides: importedData.refOverrides || null,
    categoryLabels: importedData.categoryLabels || null,
    categoryIcons: importedData.categoryIcons || null,
    markerLabels: importedData.markerLabels || null,
    menstrualCycle: importedData.menstrualCycle || null,
    biometrics,
    wearableSummary,
    wearableWeightLatest,
    legacyWeightStamp,
    profileContextKey: hashString(JSON.stringify({
      diagnoses: importedData.diagnoses || null,
      contextNotes: importedData.contextNotes || '',
      interpretiveLens: importedData.interpretiveLens || '',
      exercise: importedData.exercise || null,
      supplements: importedData.supplements || [],
      menstrualCycle: importedData.menstrualCycle || null,
    })),
    unitSystem: state.unitSystem,
    profileSex: state.profileSex,
    profileDob: state.profileDob,
  };
}

// ═══════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════
export async function saveImportedData(options = {}) {
  invalidateActiveDataCache();
  try {
    // Persist the canonical schema shape, not just the current in-memory shape.
    // Otherwise a legacy key can be migrated for display but saved/synced again
    // in its old form, creating repeated cross-device "updated" loops.
    if (state.importedData && typeof state.importedData === 'object') migrateProfileData(state.importedData);
    const key = profileStorageKey(state.currentProfile, 'imported');
    const value = JSON.stringify(state.importedData);
    // Equivalent maintenance/render saves are no-ops, avoiding storage writes
    // and preventing their timestamps from creating full CRDT messages.
    const changed = (await encryptedGetItem(key)) !== value;
    if (!changed) return true;
    // Always route through encryptedSetItem — it skips encryption when
    // disabled (just a localStorage.setItem) but also routes big-blob
    // keys to IndexedDB. Going through localStorage.setItem directly
    // would bypass that routing and re-introduce the 5 MB quota wall.
    await encryptedSetItem(key, value);
  } catch (e) {
    showNotification('Storage limit reached — clear old data or profiles to free space.', 'error');
    return false;
  }
  try {
    broadcastDataChanged(state.currentProfile);
    scheduleAutoBackup();
    await touchProfileTimestamp(state.currentProfile);
    dataContextDeps.invalidateLabContextCache?.();
    onDataSaved(options);
  } catch (e) {
    if (isDebugMode()) console.warn('Post-save hook failed after data was persisted:', e);
  }
  return true;
}

// Persist a specific profile snapshot without consulting or replacing the
// active global profile. Long-running operations can finish after the user
// switches profiles; routing through saveImportedData() at that point would
// write profile A's change into profile B. Active-profile calls retain the
// usual save hooks unless the caller explicitly requires profile scoping.
export async function saveImportedDataForProfile(profileId, importedData, options = {}) {
  if (!profileId || !importedData || typeof importedData !== 'object') return false;
  if (!options?.forceProfileScope && profileId === state.currentProfile && importedData === state.importedData) {
    return saveImportedData(options);
  }
  try {
    migrateProfileData(importedData);
    const key = profileStorageKey(profileId, 'imported');
    const value = JSON.stringify(importedData);
    if ((await encryptedGetItem(key)) === value) return true;
    await encryptedSetItem(key, value);
  } catch (e) {
    showNotification('Storage limit reached — clear old data or profiles to free space.', 'error');
    return false;
  }
  try {
    broadcastDataChanged(profileId);
    scheduleAutoBackup();
    await touchProfileTimestamp(profileId);
    if (!options?.skipSync) onProfileSaved(profileId, importedData);
  } catch (e) {
    if (isDebugMode()) console.warn('Post-save hook failed after profile data was persisted:', e);
  }
  return true;
}

export function getFocusCardFingerprint() {
  const parts = [
    (state.importedData.entries || []).map(e => e.date + ':' + Object.keys(e.markers || {}).length).join(','),
    state.profileSex || '',
    state.profileDob || '',
    JSON.stringify(state.importedData.diagnoses || null),
    (state.importedData.healthGoals || []).map(g => g.severity + ':' + g.text).join(','),
    state.importedData.interpretiveLens || '',
    state.importedData.contextNotes || '',
    (state.importedData.supplements || []).map(s => s.name + s.startDate + (s.endDate || '')).join(','),
    JSON.stringify(state.importedData.markerNotes || {})
  ];
  return hashString(parts.join('|'));
}

// ═══════════════════════════════════════════════
// DATA PIPELINE
// ═══════════════════════════════════════════════
export function getActiveData() {
  const cacheMeta = _makeActiveDataCacheMeta();
  if (_activeDataCacheMatches(cacheMeta)) return _activeDataCache;
  const data = {
    dates: /** @type {string[]} */ ([]),
    dateLabels: /** @type {string[]} */ ([]),
    categories: JSON.parse(JSON.stringify(MARKER_SCHEMA))
  };

  // Merge custom markers into categories
  const custom = (state.importedData && state.importedData.customMarkers) ? state.importedData.customMarkers : {};
  for (const [fullKey, def] of Object.entries(custom)) {
    const [catKey, markerKey] = fullKey.split('.');
    if (!markerKey) continue;
    if (!data.categories[catKey]) {
      // Create new category — infer icon from label/key
      const _label = (def.categoryLabel || catKey).toLowerCase();
      const _inferIcon = (l) => {
        if (/urine|urinal/.test(l)) return '\uD83E\uDDEA';
        if (/environ|toxic|heavy.?metal|pollut/.test(l)) return '\uD83C\uDF0D';
        if (/amino/.test(l)) return '\uD83E\uDDEC';
        if (/antioxid/.test(l)) return '\uD83D\uDEE1\uFE0F';
        if (/fatty.?acid|omega|lipid/.test(l)) return '\uD83D\uDC1F';
        if (/vitamin/.test(l)) return '\u2600\uFE0F';
        if (/mineral|element/.test(l)) return '\u2696\uFE0F';
        if (/hormone|endocrin/.test(l)) return '\uD83E\uDDEC';
        if (/liver|hepat/.test(l)) return '\uD83E\uDDEA';
        if (/kidney|renal/.test(l)) return '\uD83E\uDDEB';
        if (/thyroid/.test(l)) return '\uD83E\uDD8B';
        if (/bone|osteo/.test(l)) return '\uD83E\uDDB4';
        if (/immune|inflam/.test(l)) return '\uD83D\uDEE1\uFE0F';
        if (/cardio|heart/.test(l)) return '\uD83E\uDEC0';
        if (/neuro|brain/.test(l)) return '\uD83E\uDDE0';
        if (/digest|gut|gi|gastro|microb/.test(l)) return '\uD83E\uDDA0';
        if (/blood|hemat/.test(l)) return '\uD83E\uDE78';
        if (/metabol|energy|mitochond/.test(l)) return '\u26A1';
        if (/oxalate|organic.?acid/.test(l)) return '\u2697\uFE0F';
        if (/nutri|diet/.test(l)) return '\uD83C\uDF4E';
        return null;
      };
      data.categories[catKey] = {
        label: def.categoryLabel || catKey.charAt(0).toUpperCase() + catKey.slice(1),
        icon: def.icon || _inferIcon(_label) || '\uD83D\uDD16',
        singlePoint: !!def.singlePoint,
        group: def.group || null,
        markers: {}
      };
    }
    // Add marker if not already in schema
    if (!data.categories[catKey].markers[markerKey]) {
      data.categories[catKey].markers[markerKey] = {
        name: def.name,
        unit: def.unit || '',
        refMin: def.refMin,
        refMax: def.refMax,
        custom: true
      };
    }
  }

  // Apply sex-specific reference ranges
  if (state.profileSex === 'female') {
    for (const cat of Object.values(data.categories)) {
      for (const marker of Object.values(cat.markers)) {
        if (marker.refMin_f !== undefined) marker.refMin = marker.refMin_f;
        if (marker.refMax_f !== undefined) marker.refMax = marker.refMax_f;
      }
    }
  }

  // Merge optimal ranges into markers
  for (const [fullKey, opt] of Object.entries(OPTIMAL_RANGES)) {
    const [catKey, markerKey] = fullKey.split('.');
    const cat = data.categories[catKey];
    if (cat && cat.markers[markerKey]) {
      const marker = cat.markers[markerKey];
      marker.optimalMin = state.profileSex === 'female' && opt.optimalMin_f !== undefined
        ? opt.optimalMin_f : opt.optimalMin;
      marker.optimalMax = state.profileSex === 'female' && opt.optimalMax_f !== undefined
        ? opt.optimalMax_f : opt.optimalMax;
    }
  }

  // Apply user range overrides (ref + optimal, after schema defaults are set)
  const refOverrides = state.importedData?.refOverrides || {};
  for (const [fullKey, ovr] of Object.entries(refOverrides)) {
    const [catKey, markerKey] = fullKey.split('.');
    const cat = data.categories[catKey];
    if (cat && cat.markers[markerKey]) {
      const m = cat.markers[markerKey];
      if ('refMin' in ovr) m.refMin = ovr.refMin;
      if ('refMax' in ovr) m.refMax = ovr.refMax;
      if ('refMin' in ovr || 'refMax' in ovr) m.referenceRangeSource = ovr.refSource || 'custom';
      if ('optimalMin' in ovr) m.optimalMin = ovr.optimalMin;
      if ('optimalMax' in ovr) m.optimalMax = ovr.optimalMax;
    }
  }

  // Apply user category label + icon overrides
  const catLabels = state.importedData?.categoryLabels || {};
  for (const [catKey, label] of Object.entries(catLabels)) {
    if (data.categories[catKey]) data.categories[catKey].label = label;
  }
  const catIcons = state.importedData?.categoryIcons || {};
  for (const [catKey, icon] of Object.entries(catIcons)) {
    if (data.categories[catKey]) data.categories[catKey].icon = icon;
  }
  // Apply user marker label overrides (category.markerKey → display name)
  const markerLabels = state.importedData?.markerLabels || {};
  for (const [dotKey, label] of Object.entries(markerLabels)) {
    const [catKey, mKey] = dotKey.split('.');
    if (data.categories[catKey]?.markers[mKey]) data.categories[catKey].markers[mKey].name = label;
  }

  const entries = (state.importedData && state.importedData.entries) ? state.importedData.entries : [];
  const hasEntries = entries.length > 0;

  // Build entry lookup: date → merged markers + per-draw context.
  // Hormone scoring needs draw-level context because cycle day / sample time can
  // differ between lab entries for the same profile.
  const entryLookup = {};
  const entryContextByDate = {};
  const ENTRY_CONTEXT_KEYS = ['sampleTime', 'fasting', 'cycleDay', 'cyclePhase', 'cyclePhaseDetail', 'cyclePhaseSource', 'cycleStatus', 'menopauseStatus', 'contraception', 'hormoneTherapy', 'recentHardTraining', 'acuteIllness'];
  for (const entry of entries) {
    if (!entryLookup[entry.date]) entryLookup[entry.date] = {};
    Object.assign(entryLookup[entry.date], entry.markers);
    const context = { ...(entry.context || {}) };
    for (const key of ENTRY_CONTEXT_KEYS) {
      if (entry[key] !== undefined && context[key] === undefined) context[key] = entry[key];
    }
    if (Object.keys(context).length) entryContextByDate[entry.date] = { ...(entryContextByDate[entry.date] || {}), ...context };
  }

  // Identify singlePoint categories
  const singlePointCats = new Set();
  for (const [catKey, cat] of Object.entries(data.categories)) {
    if (cat.singlePoint) singlePointCats.add(catKey);
  }

  // Collect dates from entries that have non-singlePoint markers
  const regularDates = new Set();
  if (hasEntries) {
    for (const entry of entries) {
      for (const key of Object.keys(entry.markers || {})) {
        if (!singlePointCats.has(key.split('.')[0])) {
          regularDates.add(entry.date);
          break;
        }
      }
    }
  }

  const sortedDates = [...regularDates].sort();
  data.dates = sortedDates;
  data.entryContextByDate = entryContextByDate;
  data.dateLabels = sortedDates.map(d => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });

  // Cycle phase gating — shared by phase labels (charts) and phase-specific ref ranges
  const isFemale = state.profileSex === 'female';
  const mc = state.importedData && state.importedData.menstrualCycle;
  const _hormonalContraceptives = ['ocp', 'pill', 'patch', 'ring', 'implant', 'mirena', 'hormonal iud', 'depo', 'injection'];
  const _isHormonalBC = mc?.contraceptive && _hormonalContraceptives.some(h => mc.contraceptive.toLowerCase().includes(h));
  const _hasActiveNaturalCycle = isFemale && !_isHormonalBC && (!mc?.cycleStatus || mc.cycleStatus === 'regular');
  const _hasPredictableCycle = _hasActiveNaturalCycle && mc?.periods?.length > 0
    && (!mc?.regularity || mc.regularity === 'regular');
  const drawPhases = sortedDates.map(d => {
    const recorded = _getRecordedDrawCyclePhase(entryContextByDate[d]);
    if (recorded && _hasActiveNaturalCycle) return recorded;
    return _hasPredictableCycle ? _getCyclePhase(d, mc) : null;
  });
  const _hasCyclePhases = drawPhases.some(Boolean);

  // Compute top-level draw-phase metadata for charts. A phase recorded with
  // the lab entry wins over calendar inference from period history.
  if (_hasCyclePhases) {
    data.phaseLabels = drawPhases.map(p => p?.phase || null);
    data.phaseDisplayLabels = drawPhases.map(p => p?.phaseDetailName || p?.phaseName || null);
    data.phaseCycleDays = drawPhases.map(p => p?.cycleDay || null);
    data.phaseSources = drawPhases.map(p => p?.source || null);
  }

  // Populate values for each category
  for (const [catKey, cat] of Object.entries(data.categories)) {
    if (cat.singlePoint) {
      // Find the latest entry that has any marker in this category
      let singleDate = null;
      for (let ei = entries.length - 1; ei >= 0; ei--) {
        for (const key of Object.keys(entries[ei].markers || {})) {
          if (key.startsWith(catKey + '.')) { singleDate = entries[ei].date; break; }
        }
        if (singleDate) break;
      }
      cat.singleDate = singleDate;
      const singleDateLabel = singleDate
        ? new Date(singleDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : null;
      cat.singleDateLabel = singleDateLabel;
      for (const [markerKey, marker] of Object.entries(cat.markers)) {
        marker.singlePoint = true;
        marker.singleDate = singleDate;
        marker.singleDateLabel = singleDateLabel;
        const fullKey = `${catKey}.${markerKey}`;
        if (singleDate && entryLookup[singleDate] && entryLookup[singleDate][fullKey] !== undefined) {
          marker.values = [entryLookup[singleDate][fullKey]];
        } else {
          marker.values = [];
        }
      }
    } else {
      for (const [markerKey, marker] of Object.entries(cat.markers)) {
        const fullKey = `${catKey}.${markerKey}`;
        marker.values = sortedDates.map(date => {
          if (entryLookup[date] && entryLookup[date][fullKey] !== undefined) {
            return entryLookup[date][fullKey];
          }
          return null;
        });
      }
    }
  }

  // Compute phase-specific reference ranges for cycle-dependent markers
  if (_hasCyclePhases) {
    for (const [fullKey, phaseMap] of Object.entries(PHASE_RANGES)) {
      const [catKey, markerKey] = fullKey.split('.');
      const marker = data.categories[catKey] && data.categories[catKey].markers[markerKey];
      if (!marker) continue;
      marker.phaseRefRanges = drawPhases.map(p => {
        const range = p ? (phaseMap[p.phase] || null) : null;
        if (!range) return null;
        return {
          ...range,
          label: p.source === 'recorded' ? `${p.phaseName} range` : range.label,
          phaseSource: p.source,
          cycleDay: p.cycleDay,
        };
      });
      marker.phaseLabels = drawPhases.map(p => p?.phaseName || null);
      marker.phaseDisplayLabels = drawPhases.map(p => p?.phaseDetailName || p?.phaseName || null);
      marker.phaseCycleDays = drawPhases.map(p => p?.cycleDay || null);
      marker.phaseSources = drawPhases.map(p => p?.source || null);
    }
  }

  // Apply per-draw age, sex, assay, collection-time, and fasting guidance.
  // Imported/manual lab ranges remain authoritative: their corresponding
  // contextual defaults are not attached at all.
  const hasRangeOverride = (dotKey, kind) => {
    const override = refOverrides[dotKey];
    if (!override) return false;
    return kind === 'optimal'
      ? Object.prototype.hasOwnProperty.call(override, 'optimalMin') || Object.prototype.hasOwnProperty.call(override, 'optimalMax')
      : Object.prototype.hasOwnProperty.call(override, 'refMin') || Object.prototype.hasOwnProperty.call(override, 'refMax');
  };
  const setContextRanges = (dotKey, kind, resolveGuidance) => {
    if (hasRangeOverride(dotKey, kind)) return;
    const [catKey, markerKey] = dotKey.split('.');
    const marker = data.categories[catKey]?.markers?.[markerKey];
    if (!marker) return;
    const guidance = sortedDates.map((dateStr, i) => resolveGuidance(dateStr, i, marker));
    if (!guidance.some(Boolean)) return;
    if (kind === 'optimal') {
      marker.contextOptimalRanges = guidance.map(item => item ? { min: item.min ?? null, max: item.max ?? null } : null);
      marker.contextOptimalRangeLabels = guidance.map(item => item?.label || null);
    } else {
      marker.contextRefRanges = guidance.map(item => item ? { min: item.min ?? null, max: item.max ?? null } : null);
      marker.contextRangeLabels = guidance.map(item => item?.label || null);
    }
  };

  for (const dotKey of Object.keys(CONTEXT_REFERENCE_RANGES)) {
    setContextRanges(dotKey, 'reference', (dateStr) => resolveAgeSexRange(
      CONTEXT_REFERENCE_RANGES,
      dotKey,
      wholeAgeAtDate(state.profileDob, dateStr),
      state.profileSex,
    ));
  }
  for (const dotKey of Object.keys(CONTEXT_OPTIMAL_RANGES)) {
    setContextRanges(dotKey, 'optimal', (dateStr) => resolveAgeSexRange(
      CONTEXT_OPTIMAL_RANGES,
      dotKey,
      wholeAgeAtDate(state.profileDob, dateStr),
      state.profileSex,
    ));
  }

  setContextRanges('hormones.cortisol', 'reference', (dateStr, _i, marker) => {
    const guidance = cortisolReferenceForSampleTime(entryContextByDate[dateStr]?.sampleTime, marker.unit);
    return guidance ? { ...guidance.range, label: guidance.label } : null;
  });

  // WHO/IZiNCG lower serum-zinc cutoffs are population adequacy guidance and
  // only become meaningful when time of day and fasting status are known.
  setContextRanges('electrolytes.zinc', 'optimal', (dateStr, _i, marker) => {
    const context = entryContextByDate[dateStr] || {};
    const hour = parseSampleHour(context.sampleTime);
    if (hour == null || typeof context.fasting !== 'boolean') return null;
    const female = state.profileSex === 'female';
    if (hour < 12 && context.fasting) {
      return { min: female ? 10.7 : 11.3, max: marker.refMax, label: 'Morning fasting adequacy guide' };
    }
    if (hour < 12 && !context.fasting) {
      return { min: female ? 10.1 : 10.7, max: marker.refMax, label: 'Morning non-fasting adequacy guide' };
    }
    if (hour >= 12 && hour < 18 && !context.fasting) {
      return { min: female ? 8.6 : 9.3, max: marker.refMax, label: 'Afternoon non-fasting adequacy guide' };
    }
    return null;
  });

  // TyG is defined from fasting triglycerides and glucose. An explicitly
  // non-fasting draw suppresses both the reference and optional lower-risk
  // band rather than presenting a falsely actionable status.
  setContextRanges('calculatedRatios.tygIndex', 'optimal', (dateStr) => {
    if (entryContextByDate[dateStr]?.fasting !== false) return null;
    return { min: null, max: null, label: 'Requires fasting sample' };
  });

  populateCalculatedMarkers({
    data,
    sortedDates,
    entryContextByDate,
    refOverrides,
  });
  if (state.unitSystem === 'US') applyUnitConversion(data);
  // Values, calculations, and unit conversions always run against immutable
  // storage dotkeys. Category placement is a final view projection only.
  applyMarkerPlacements(data.categories, state.importedData || {});
  _activeDataCache = data;
  _activeDataCacheMeta = cacheMeta;
  return data;
}

export function convertDisplayToSI(dotKey, value) {
  if (state.unitSystem !== 'US') return value;
  const conv = UNIT_CONVERSIONS[dotKey];
  if (!conv) return value;
  if (conv.type === 'multiply') return parseFloat((value / conv.factor).toPrecision(6));
  if (conv.type === 'hba1c') return parseFloat(((value - 2.15) * 10.929).toFixed(1));
  return value;
}

export function applyUnitConversion(data) {
  for (const [catKey, cat] of Object.entries(data.categories)) {
    for (const [markerKey, marker] of Object.entries(cat.markers)) {
      const conv = UNIT_CONVERSIONS[`${catKey}.${markerKey}`];
      if (!conv) continue;
      if (conv.type === 'multiply') {
        marker.values = marker.values.map(v => v !== null ? parseFloat((v * conv.factor).toPrecision(4)) : null);
        if (marker.refMin != null) marker.refMin = parseFloat((marker.refMin * conv.factor).toPrecision(4));
        if (marker.refMax != null) marker.refMax = parseFloat((marker.refMax * conv.factor).toPrecision(4));
        if (marker.optimalMin != null) marker.optimalMin = parseFloat((marker.optimalMin * conv.factor).toPrecision(4));
        if (marker.optimalMax != null) marker.optimalMax = parseFloat((marker.optimalMax * conv.factor).toPrecision(4));
        if (marker.phaseRefRanges) {
          marker.phaseRefRanges = marker.phaseRefRanges.map(r =>
            r ? { ...r,
                  min: parseFloat((r.min * conv.factor).toPrecision(4)),
                  max: parseFloat((r.max * conv.factor).toPrecision(4)) } : null
          );
        }
        if (marker.contextRefRanges) {
          marker.contextRefRanges = marker.contextRefRanges.map(r =>
            r ? {
              min: r.min == null ? null : parseFloat((r.min * conv.factor).toPrecision(4)),
              max: r.max == null ? null : parseFloat((r.max * conv.factor).toPrecision(4))
            } : null
          );
        }
        if (marker.contextOptimalRanges) {
          marker.contextOptimalRanges = marker.contextOptimalRanges.map(r =>
            r ? {
              min: r.min == null ? null : parseFloat((r.min * conv.factor).toPrecision(4)),
              max: r.max == null ? null : parseFloat((r.max * conv.factor).toPrecision(4))
            } : null
          );
        }
        marker.unit = conv.usUnit;
      } else if (conv.type === 'hba1c') {
        marker.values = marker.values.map(v => v !== null ? parseFloat(((v / 10.929) + 2.15).toFixed(1)) : null);
        if (marker.refMin != null) marker.refMin = parseFloat(((marker.refMin / 10.929) + 2.15).toFixed(1));
        if (marker.refMax != null) marker.refMax = parseFloat(((marker.refMax / 10.929) + 2.15).toFixed(1));
        if (marker.optimalMin != null) marker.optimalMin = parseFloat(((marker.optimalMin / 10.929) + 2.15).toFixed(1));
        if (marker.optimalMax != null) marker.optimalMax = parseFloat(((marker.optimalMax / 10.929) + 2.15).toFixed(1));
        marker.unit = '%';
      }
    }
  }
}

// ═══════════════════════════════════════════════
// DATE RANGE FILTER
// ═══════════════════════════════════════════════
export function filterDatesByRange(data, options = {}) {
  if (state.dateRangeFilter === 'all') return data;
  // A selected timeframe must stay truthful. Callers may explicitly request
  // the legacy all-history fallback, but UI surfaces default to an honest
  // empty range and can offer "Show all results" themselves.
  const fallbackToAll = options.fallbackToAll === true;
  const bounds = getLabDateRangeBounds(data.dates, state.dateRangeFilter, new Date(), { fallbackToAll: false });
  if (!bounds) return data;
  const indices = [];
  for (let i = 0; i < data.dates.length; i++) {
    if (data.dates[i] >= bounds.min && data.dates[i] <= bounds.max) indices.push(i);
  }
  if (indices.length === 0 && fallbackToAll) return data;
  const filteredDates = new Set(indices.map(i => data.dates[i]));
  const filtered = {
    dates: indices.map(i => data.dates[i]),
    dateLabels: indices.map(i => data.dateLabels?.[i] || data.dates?.[i] || ''),
    ...(data.phaseLabels && { phaseLabels: indices.map(i => data.phaseLabels[i]) }),
    ...(data.phaseDisplayLabels && { phaseDisplayLabels: indices.map(i => data.phaseDisplayLabels[i]) }),
    ...(data.phaseCycleDays && { phaseCycleDays: indices.map(i => data.phaseCycleDays[i]) }),
    ...(data.phaseSources && { phaseSources: indices.map(i => data.phaseSources[i]) }),
    ...(data.entryContextByDate && {
      entryContextByDate: Object.fromEntries(
        Object.entries(data.entryContextByDate).filter(([date]) => filteredDates.has(date))
      ),
    }),
    categories: {}
  };
  for (const [catKey, cat] of Object.entries(data.categories)) {
    const filteredCat = { ...cat, markers: {} };
    for (const [mKey, marker] of Object.entries(cat.markers)) {
      if (marker.singlePoint || cat.singlePoint) {
        // Hide single-point markers whose date is outside the filtered range
        const spDate = marker.singleDate || cat.singleDate;
        if (spDate && (spDate < bounds.min || spDate > bounds.max)) {
          filteredCat.markers[mKey] = { ...marker, values: [null], singleDate: null };
        } else {
          filteredCat.markers[mKey] = marker;
        }
      } else {
        filteredCat.markers[mKey] = {
          ...marker,
          values: indices.map(i => marker.values[i]),
          ...(marker.phaseRefRanges && { phaseRefRanges: indices.map(i => marker.phaseRefRanges[i]) }),
          ...(marker.phaseLabels && { phaseLabels: indices.map(i => marker.phaseLabels[i]) }),
          ...(marker.phaseDisplayLabels && { phaseDisplayLabels: indices.map(i => marker.phaseDisplayLabels[i]) }),
          ...(marker.phaseCycleDays && { phaseCycleDays: indices.map(i => marker.phaseCycleDays[i]) }),
          ...(marker.phaseSources && { phaseSources: indices.map(i => marker.phaseSources[i]) }),
          ...(marker.contextRefRanges && { contextRefRanges: indices.map(i => marker.contextRefRanges[i]) }),
          ...(marker.contextRangeLabels && { contextRangeLabels: indices.map(i => marker.contextRangeLabels[i]) }),
          ...(marker.contextOptimalRanges && { contextOptimalRanges: indices.map(i => marker.contextOptimalRanges[i]) }),
          ...(marker.contextOptimalRangeLabels && { contextOptimalRangeLabels: indices.map(i => marker.contextOptimalRangeLabels[i]) }),
        };
      }
    }
    filtered.categories[catKey] = filteredCat;
  }
  return filtered;
}

export function recalculateHOMAIR(entry) {
  recalculateLabEntryHOMAIR(entry);
}

export function getAllFlaggedMarkers(data) {
  return getAllFlaggedMarkersForData(data || getActiveData());
}

configureDataViewCoreDependencies({ getActiveData, invalidateActiveDataCache });
