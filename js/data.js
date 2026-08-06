// @ts-check
// data.js — Data pipeline, unit conversion, date range, trend detection

import { state } from './state.js';
import { getBiologyProfileContext } from './profile-context.js';
import { MARKER_SCHEMA, UNIT_CONVERSIONS, OPTIMAL_RANGES, PHASE_RANGES } from './schema.js';
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

export {
  countFlagged,
  detectTrendAlerts,
  getEffectiveRange,
  getEffectiveRangeForDate,
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
 * @typedef {() => Array<number | null | undefined> | undefined} MarkerValueGetter
 * @typedef {[MarkerValueGetter | 'age' | 'crp', number, number, boolean, number | null, 'ceil' | 'floor' | null, (number | undefined)?]} BortzFeature
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
  return { cycleDay, phase, phaseName };
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
    // A surprising number of maintenance/render paths call the saver after
    // computing an equivalent object. Treat those as no-ops. Besides avoiding
    // needless IndexedDB writes, this is important for sync: the post-save
    // hook advances profile.lastUpdated, so an equivalent save used to create
    // a distinct full-profile CRDT message on every refresh.
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
// active global profile. Long-running privacy operations (for example,
// wearable disconnect) can finish after the user switches profiles; routing
// through saveImportedData() at that point would write profile A's deletion
// into profile B. Active-profile calls retain the usual save hooks.
export async function saveImportedDataForProfile(profileId, importedData, options = {}) {
  if (!profileId || !importedData || typeof importedData !== 'object') return false;
  if (profileId === state.currentProfile && importedData === state.importedData) {
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
        if (marker.refMin_f !== undefined) { marker.refMin = marker.refMin_f; marker.refMax = marker.refMax_f; }
      }
    }
  }

  // Merge optimal ranges into markers
  for (const [fullKey, opt] of Object.entries(OPTIMAL_RANGES)) {
    const [catKey, markerKey] = fullKey.split('.');
    const cat = data.categories[catKey];
    if (cat && cat.markers[markerKey]) {
      const marker = cat.markers[markerKey];
      if (state.profileSex === 'female' && opt.optimalMin_f !== undefined) {
        marker.optimalMin = opt.optimalMin_f;
        marker.optimalMax = opt.optimalMax_f;
      } else {
        marker.optimalMin = opt.optimalMin;
        marker.optimalMax = opt.optimalMax;
      }
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
  const ENTRY_CONTEXT_KEYS = ['sampleTime', 'fasting', 'cycleDay', 'cyclePhase', 'cycleStatus', 'menopauseStatus', 'contraception', 'hormoneTherapy', 'recentHardTraining', 'acuteIllness'];
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
  const _isActiveCycle = !mc?.cycleStatus || mc.cycleStatus === 'regular' || mc.cycleStatus === 'perimenopause';
  const _hasCyclePhases = isFemale && mc && mc.periods && mc.periods.length > 0 && !_isHormonalBC && _isActiveCycle;

  // Compute top-level phase labels for charts (female + active cycle, no hormonal BC)
  if (_hasCyclePhases) {
    data.phaseLabels = sortedDates.map(d => {
      const p = _getCyclePhase(d, mc);
      return p ? p.phase : null;
    });
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
      marker.phaseRefRanges = sortedDates.map(d => {
        const p = _getCyclePhase(d, mc);
        return p ? (phaseMap[p.phase] || null) : null;
      });
      marker.phaseLabels = sortedDates.map(d => {
        const p = _getCyclePhase(d, mc);
        return p ? p.phaseName : null;
      });
    }
  }

  // Calculate ratios from component markers
  const ratios = data.categories.calculatedRatios;
  if (ratios) {
    const getVals = (catKey, markerKey) => {
      const cat = data.categories[catKey];
      return cat && cat.markers[markerKey] ? cat.markers[markerKey].values : null;
    };
    const divide = (numVals, denVals) => {
      if (!numVals || !denVals) return sortedDates.map(() => null);
      return sortedDates.map((_, i) => {
        const n = numVals[i], d = denVals[i];
        return (n != null && d != null && d !== 0) ? Math.round((n / d) * 1000) / 1000 : null;
      });
    };
    const directCholHdlVals = getVals('calculatedRatios', 'cholHdlRatio');
    ratios.markers.tgHdlRatio.values = divide(getVals('lipids', 'triglycerides'), getVals('lipids', 'hdl'));
    ratios.markers.ldlHdlRatio.values = divide(getVals('lipids', 'ldl'), getVals('lipids', 'hdl'));
    const computedCholHdlVals = divide(getVals('lipids', 'cholesterol'), getVals('lipids', 'hdl'));
    ratios.markers.cholHdlRatio.values = computedCholHdlVals.map((value, i) => value != null ? value : (directCholHdlVals?.[i] ?? null));
    ratios.markers.apoBapoAIRatio.values = divide(getVals('lipids', 'apoB'), getVals('lipids', 'apoAI'));
    ratios.markers.nlr.values = divide(getVals('differential', 'neutrophils'), getVals('differential', 'lymphocytes'));
    ratios.markers.plr.values = divide(getVals('hematology', 'platelets'), getVals('differential', 'lymphocytes'));
    ratios.markers.deRitisRatio.values = divide(getVals('biochemistry', 'ast'), getVals('biochemistry', 'alt'));
    ratios.markers.copperZincRatio.values = divide(getVals('electrolytes', 'copper'), getVals('electrolytes', 'zinc'));
    ratios.markers.ft3ft4Ratio.values = divide(getVals('thyroid', 'ft3'), getVals('thyroid', 'ft4'));

    // BUN/Creatinine Ratio — computed in US units: (urea×2.801) / (creatinine×0.01131)
    const ureaVals = getVals('biochemistry', 'urea');
    const creatVals = getVals('biochemistry', 'creatinine');
    ratios.markers.bunCreatRatio.values = sortedDates.map((_, i) => {
      const u = ureaVals?.[i], c = creatVals?.[i];
      if (u == null || c == null || c === 0) return null;
      return Math.round((u * 2.801) / (c * 0.01131) * 10) / 10;
    });

    // Free Water Deficit — TBW × (Na/140 − 1), uses latest weight or 70kg fallback.
    // Weight now lives in the wearables summary (single source of truth after
    // the Health Metrics unification; manual entries write kg-canonicalized).
    // Legacy importedData.biometrics.weight is kept as a backstop for old
    // profiles that somehow haven't seen the migration run yet.
    const sodiumVals = getVals('electrolytes', 'sodium');
    const summaryWeight = state.importedData?.wearableSummary?.metrics?.weight?.latest;
    const legacyWeightArr = state.importedData?.biometrics?.weight;
    const legacyWeight = Array.isArray(legacyWeightArr) && legacyWeightArr.length > 0 ? legacyWeightArr[legacyWeightArr.length - 1].value : null;
    const latestWeight = (typeof summaryWeight === 'number' && isFinite(summaryWeight)) ? summaryWeight : legacyWeight;
    ratios.markers.freeWaterDeficit.values = sortedDates.map((_, i) => {
      const na = sodiumVals ? sodiumVals[i] : null;
      if (na == null || na <= 0) return null;
      const tbwFactor = state.profileSex === 'female' ? 0.5 : 0.6;
      const tbw = (latestWeight || 70) * tbwFactor;
      const fwd = tbw * (na / 140 - 1);
      return Math.round(fwd * 100) / 100;
    });

    // hs-CRP/HDL Ratio — inflammation-lipid composite (hs-CRP only, no standard CRP fallback)
    ratios.markers.crpHdlRatio.values = sortedDates.map((_, i) => {
      const crp = getVals('proteins', 'hsCRP')?.[i] ?? null; // mg/L — requires hs-CRP
      const hdl = getVals('lipids', 'hdl')?.[i]; // mmol/L
      if (crp == null || hdl == null || hdl <= 0) return null;
      // CRP mg/L ÷ HDL mg/dL — matches NHANES convention used in published cutoffs
      return Math.round((crp / (hdl * 38.67)) * 10000) / 10000;
    });

    // Helper: chronological age at blood draw date
    const _ageAt = (dateStr) => {
      if (!state.profileDob) return null;
      const dob = new Date(state.profileDob + 'T00:00:00');
      const draw = new Date(dateStr + 'T00:00:00');
      const age = (draw.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return age > 0 ? age : null;
    };

    // hs-CRP only — standard CRP is a different assay (different sample,
    // different detection range, ~10× higher quantification floor) and
    // substituting silently would corrupt biological-age estimates the user
    // can't see is contaminated. The detail modal already explains the
    // hs-CRP requirement. Returns null when hs-CRP is missing → row drops.
    const _getCRP = (i) => getVals('proteins', 'hsCRP')?.[i] ?? null;
    const profileContext = getBiologyProfileContext();
    const creatinineContaminated = !!profileContext.lowMuscleMass;

    // PhenoAge (Levine 2018) — biological age from 9 biomarkers + chronological age
    ratios.markers.phenoAge.values = sortedDates.map((dateStr, i) => {
      if (creatinineContaminated) return null;
      const age = _ageAt(dateStr);
      if (age == null) return null;
      const albumin_si   = getVals('proteins', 'albumin')?.[i];        // g/L
      const creatinine_si = getVals('biochemistry', 'creatinine')?.[i]; // µmol/L
      const glucose_si   = getVals('biochemistry', 'glucose')?.[i];    // mmol/L
      const crp          = _getCRP(i);                                  // mg/L
      const lymphPct_si  = getVals('differential', 'lymphocytesPct')?.[i]; // fraction 0–1
      const mcv          = getVals('hematology', 'mcv')?.[i];          // fL
      const rdw          = getVals('hematology', 'rdwcv')?.[i];        // %
      const alp_si       = getVals('biochemistry', 'alp')?.[i];        // µkat/L
      const wbc          = getVals('hematology', 'wbc')?.[i];          // 10^9/L
      if ([albumin_si, creatinine_si, glucose_si, crp, lymphPct_si, mcv, rdw, alp_si, wbc].some(v => v == null)) return null;
      if (crp <= 0) return null; // ln(CRP) undefined for non-positive

      // Levine 2018 coefficients — calibrated for SI units as stored in the schema
      const xb = -19.907
        - 0.0336  * albumin_si
        + 0.0095  * creatinine_si
        + 0.1953  * glucose_si
        + 0.0954  * Math.log(crp)
        - 0.0120  * lymphPct_si
        + 0.0268  * mcv
        + 0.3306  * rdw
        + 0.00188 * alp_si
        + 0.0554  * wbc
        + 0.0804  * age;

      const mortalityScore = 1 - Math.exp(-Math.exp(xb) * (Math.exp(120 * 0.0076927) - 1) / 0.0076927);
      if (mortalityScore <= 0 || mortalityScore >= 1) return null;
      const phenoAge = 141.50225 + Math.log(-0.00553 * Math.log(1 - mortalityScore)) / 0.090165;
      return Math.round(phenoAge * 10) / 10;
    });

    // Bortz Age (Bortz et al. 2023, Nature Communications)
    // BAA = 10 × sum((centered - mean) × coeff), biological age = chronological age + BAA
    // Coefficients and means from longevityworldcup.com (inspired by their open implementation)
    // Units: all SI as stored in schema, except ALP/GGT/ALT which need µkat/L→U/L (×60)
    // and lymphocytesPct which needs fraction→% (×100)
    const _bortzFeatures = /** @type {BortzFeature[]} */ ([
      // [getValue fn,                                    mean,     coeff,   log, capVal, capMode]
      ['age',                                             56.049,  -0.026,  false, null,  null],
      [() => getVals('proteins', 'albumin'),              45.124,  -0.011,  false, 54,    'ceil'],
      [() => getVals('biochemistry', 'alp'),              82.685,   0.0016, false, null,  null,  60],  // µkat/L→U/L
      [() => getVals('biochemistry', 'urea'),              5.355,  -0.030,  false, 9.3,   'ceil'],
      [() => getVals('lipids', 'cholesterol'),              5.618, -0.0806, false, 7.58,  'ceil'],
      [() => getVals('biochemistry', 'creatinine'),        71.566, -0.0110, false, null,  null],
      [() => getVals('biochemistry', 'cystatinC'),          0.901,  1.860,  false, 0.38,  'floor'],
      [() => getVals('diabetes', 'hba1c'),                 35.479,  0.0181, false, 26,    'floor'],
      ['crp',                                               0.300,  0.0791, true,  null,  null],       // log-transformed
      [() => getVals('biochemistry', 'ggt'),                3.380,  0.2656, true,  null,  null,  60],  // µkat/L→U/L, log
      [() => getVals('hematology', 'rbc'),                  4.499, -0.2044, false, 5.77,  'ceil'],
      [() => getVals('hematology', 'mcv'),                 91.925,  0.0172, false, null,  null],
      [() => getVals('hematology', 'rdwcv'),               13.434,  0.2020, false, 11.4,  'floor'],
      [() => getVals('differential', 'monocytes'),          0.475,  0.369,  false, 0.3,   'floor'],
      [() => getVals('differential', 'neutrophils'),        4.185,  0.0668, false, 2,     'floor'],
      [() => getVals('differential', 'lymphocytesPct'),    28.582, -0.0108, false, 60,    'ceil', 100], // fraction→%
      [() => getVals('biochemistry', 'alt'),                3.078, -0.312,  true,  29,    'ceil', 60],  // µkat/L→U/L, log
      [() => getVals('hormones', 'shbg'),                   3.820,  0.292,  true,  null,  null],        // log
      [() => getVals('vitamins', 'vitaminD'),               3.605, -0.265,  true,  112.6, 'ceil', 0.4006], // nmol/L→ng/mL, log
      [() => getVals('biochemistry', 'glucose'),            4.956,  0.0322, false, 4.44,  'floor'],
      [() => getVals('hematology', 'mch'),                 31.840,  0.0275, false, 25.7,  'floor'],
      [() => getVals('lipids', 'apoAI'),                    1.524, -0.185,  false, 1.82,  'ceil'],
    ]);

    ratios.markers.bortzAge.values = sortedDates.map((dateStr, i) => {
      if (creatinineContaminated) return null;
      const age = _ageAt(dateStr);
      if (age == null) return null;
      const crp = _getCRP(i);

      let baa = 0;
      for (const feat of _bortzFeatures) {
        const [src, mean, coeff, useLog, capVal, capMode, scaleFactor] = feat;
        let val;
        if (src === 'age') val = age;
        else if (src === 'crp') val = crp;
        else val = src()?.[i] ?? null;
        if (val == null) return null; // all inputs required
        if (scaleFactor) val *= scaleFactor; // unit conversion (µkat/L→U/L, fraction→%)
        if (capVal != null) {
          if (capMode === 'ceil') val = Math.min(val, capVal);
          else if (capMode === 'floor') val = Math.max(val, capVal);
        }
        if (useLog) {
          if (val <= 0) return null;
          val = Math.log(val);
        }
        baa += (val - mean) * coeff;
      }
      const bortzAge = age + 10 * baa;
      return Math.round(bortzAge * 10) / 10;
    });

    // Biological Age — combined estimate from PhenoAge and Bortz Age
    ratios.markers.biologicalAge.values = sortedDates.map((_, i) => {
      const pheno = ratios.markers.phenoAge.values[i];
      const bortz = ratios.markers.bortzAge.values[i];
      if (pheno != null && bortz != null) return Math.round(((pheno + bortz) / 2) * 10) / 10;
      if (pheno != null) return pheno;
      if (bortz != null) return bortz;
      return null;
    });
  }

  if (state.unitSystem === 'US') applyUnitConversion(data);
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
            r ? { min: parseFloat((r.min * conv.factor).toPrecision(4)),
                  max: parseFloat((r.max * conv.factor).toPrecision(4)) } : null
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
