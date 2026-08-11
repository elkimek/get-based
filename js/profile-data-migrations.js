// @ts-check
// profile-data-migrations.js — Deterministic imported profile-data upgrades.

import { SPECIALTY_MARKER_DEFS } from './adapters.js';
import { normalizeContextSourceSettings } from './context-source-registry.js';
import { migrateCustomMarkerIdentities } from './custom-marker-identity.js';
import { migrateMarkerPlacements } from './marker-placement.js';
import { normalizeLightEnvironmentEveningFields } from './light-env-evening.js';
import {
  deleteLabEntryMarker,
  renameLabEntryMarker,
  setLabEntryMarker,
  syncLabEntryInsulinMirror,
} from './lab-entry.js';
import { repairProfileMarkerData } from './profile-marker-migrations.js';
import { MARKER_SCHEMA } from './schema.js';
import { migrateSupplementMedicationRecords } from './supplement-medication-domain.js';

/** @typedef {import('../types/app-state.js').ProfileData} ProfileData */

/**
 * @param {ProfileData} data
 * @returns {ProfileData}
 */
export function migrateProfileData(data) {
  // Migrate sleepCircadian → sleepRest (sleep fields go to sleepRest, circadian items to lightCircadian)
  if (data.sleepCircadian && !data.sleepRest) {
    const sc = data.sleepCircadian;
    if (typeof sc === 'string') {
      data.sleepRest = sc.trim() ? { duration: null, quality: null, schedule: null, issues: [], note: sc.trim() } : null;
    } else if (typeof sc === 'object') {
      const sleepIssues = (sc.issues || []).filter(i => !['blue light blockers', 'morning sunlight'].includes(i));
      const circadianPractices = (sc.issues || []).filter(i => ['blue light blockers', 'morning sunlight'].includes(i));
      data.sleepRest = { duration: sc.duration || null, quality: sc.quality || null, schedule: sc.schedule || null, issues: sleepIssues, note: sc.note || '' };
      if (circadianPractices.length && !data.lightCircadian) {
        data.lightCircadian = { practices: circadianPractices, timing: null, mealTiming: [], note: '' };
      }
    }
  }
  delete data.sleepCircadian;
  // Merge old circadian + sleep strings → sleepRest (very old legacy)
  if (!data.sleepRest) {
    const parts = [data.circadian, data.sleep].filter(s => s && s.trim());
    if (parts.length) data.sleepRest = { duration: null, quality: null, schedule: null, issues: [], note: parts.join('\n\n') };
  }
  delete data.circadian;
  delete data.sleep;
  // Merge fieldExperts + fieldLens → interpretiveLens
  if (!data.interpretiveLens) {
    const parts = [data.fieldExperts, data.fieldLens].filter(s => s && s.trim());
    if (parts.length) data.interpretiveLens = parts.join('\n\n');
  }
  delete data.fieldExperts;
  delete data.fieldLens;
  // Migrate string fields → structured objects
  if (typeof data.diagnoses === 'string') {
    data.diagnoses = data.diagnoses.trim() ? { conditions: [], note: data.diagnoses.trim(), familyHistory: [] } : null;
  }
  // Backfill familyHistory on existing diagnoses objects from before v1.7.
  if (data.diagnoses && typeof data.diagnoses === 'object' && !Array.isArray(data.diagnoses.familyHistory)) {
    data.diagnoses.familyHistory = [];
  }
  if (typeof data.diet === 'string') {
    data.diet = data.diet.trim() ? { type: null, restrictions: [], pattern: null, note: data.diet.trim() } : null;
  }
  if (typeof data.exercise === 'string') {
    data.exercise = data.exercise.trim() ? { frequency: null, types: [], intensity: null, dailyMovement: null, note: data.exercise.trim() } : null;
  }
  if (typeof data.sleepRest === 'string') {
    data.sleepRest = data.sleepRest.trim() ? { duration: null, quality: null, schedule: null, issues: [], note: data.sleepRest.trim() } : null;
  }
  // Migrate old lightCircadian practices/timing format.
  if (data.lightCircadian && data.lightCircadian.timing && !data.lightCircadian.amLight) {
    const old = data.lightCircadian;
    /** @type {{
     *   amLight: string | null,
     *   daytime: string | null,
     *   uvExposure: string | null,
     *   evening: string[],
     *   cold: string | null,
     *   grounding: string | null,
     *   latitude: number | null,
     *   mealTiming: string[],
     *   note: string
     * }} */
    const newLc = { amLight: null, daytime: null, uvExposure: null, evening: [], cold: null, grounding: null, latitude: null, mealTiming: old.mealTiming || [], note: old.note || '' };
    if (old.practices && old.practices.length) {
      for (const p of old.practices) {
        if (p === 'morning sunlight') newLc.amLight = 'morning outdoor (after sunrise)';
        else if (p === 'blue light blockers') newLc.evening.push('blue blockers after sunset');
        else if (p === 'no screens before bed') newLc.evening.push('no screens 1-2h before bed');
        else if (p === 'red light therapy') { if (!newLc.note) newLc.note = p; else newLc.note += ', ' + p; }
        else if (p === 'UVB exposure') newLc.uvExposure = 'UVB lamp';
        else if (p === 'light therapy lamp') { if (!newLc.amLight) newLc.amLight = 'light therapy lamp'; }
        else if (p === 'blackout curtains') { /* moved to sleep environment */ }
      }
    }
    data.lightCircadian = newLc;
  }
  // Remove singlePoint from fatty acid custom markers (FA now supports trends)
  if (data.customMarkers) {
    for (const def of Object.values(data.customMarkers)) {
      if (def.singlePoint && def.group === 'Fatty Acids') delete def.singlePoint;
    }
  }
  // Migrate hardcoded specialty markers to customMarkers
  if (data.entries?.length) {
    const usedSpecialtyKeys = new Set();
    for (const entry of data.entries) {
      for (const key of Object.keys(entry.markers || {})) {
        if (SPECIALTY_MARKER_DEFS[key]) usedSpecialtyKeys.add(key);
      }
    }
    if (!data.customMarkers) data.customMarkers = {};
    for (const key of usedSpecialtyKeys) {
      if (!data.customMarkers[key]) {
        const def = SPECIALTY_MARKER_DEFS[key];
        data.customMarkers[key] = {
          name: def.name, unit: def.unit,
          refMin: def.refMin, refMax: def.refMax,
          categoryLabel: def.categoryLabel, icon: def.icon,
          group: def.group || null
        };
      }
    }
  }
  // Backfill group for existing customMarkers missing it
  if (data.customMarkers) {
    for (const [key, customMarker] of Object.entries(data.customMarkers)) {
      if (customMarker.group === undefined && SPECIALTY_MARKER_DEFS[key]) {
        customMarker.group = SPECIALTY_MARKER_DEFS[key].group || null;
      }
    }
  }
  repairProfileMarkerData(data);
  // Fix corrupted FA-prefixed standard markers.
  if (data.customMarkers && data.entries?.length) {
    const standardLookup = {};
    for (const [categoryKey, category] of Object.entries(MARKER_SCHEMA)) {
      for (const markerKey of Object.keys(category.markers)) {
        standardLookup[markerKey] = `${categoryKey}.${markerKey}`;
      }
    }
    const toDelete = [];
    for (const fullKey of Object.keys(data.customMarkers)) {
      const [categoryKey, markerKey] = fullKey.split('.');
      if (!markerKey || MARKER_SCHEMA[categoryKey]) continue;
      if (SPECIALTY_MARKER_DEFS[fullKey]) continue;
      const standardKey = standardLookup[markerKey];
      if (!standardKey) continue;
      for (const entry of data.entries) {
        renameLabEntryMarker(entry, fullKey, standardKey, { stamp: false });
      }
      toDelete.push(fullKey);
    }
    for (const key of toDelete) delete data.customMarkers[key];

    const standardCategories = new Set(Object.keys(MARKER_SCHEMA));
    for (const entry of data.entries) {
      if (!entry.markers) continue;
      const keys = Object.keys(entry.markers);
      const hasStandard = keys.some(key => standardCategories.has(key.split('.')[0]));
      if (!hasStandard) continue;
      for (const key of keys) {
        const categoryKey = key.split('.')[0];
        if (!standardCategories.has(categoryKey)
            && !SPECIALTY_MARKER_DEFS[key]
            && (categoryKey.endsWith('FA') || categoryKey === 'fattyAcidsTest')) {
          if (data.customMarkers?.[key]) continue;
          deleteLabEntryMarker(entry, key, { recordTombstone: false, stamp: false });
        }
      }
    }
    // Remove orphaned FA custom markers after entry repair.
    for (const fullKey of Object.keys(data.customMarkers)) {
      const categoryKey = fullKey.split('.')[0];
      if (MARKER_SCHEMA[categoryKey] || SPECIALTY_MARKER_DEFS[fullKey]) continue;
      if (!(categoryKey.endsWith('FA') || categoryKey === 'fattyAcidsTest')) continue;
      const hasValues = data.entries.some(entry => entry.markers?.[fullKey] !== undefined);
      if (!hasValues) delete data.customMarkers[fullKey];
    }
  }
  // Backfill insulin mirror: sync hormones.insulin ↔ diabetes.insulin_d.
  if (data.entries) {
    for (const entry of data.entries) {
      syncLabEntryInsulinMirror(entry, { stamp: false });
    }
  }
  // Migrate trombocrit/plateletcrit custom markers → hematology.pct.
  if (data.entries && data.customMarkers) {
    const pctAliases = Object.keys(data.customMarkers).filter(key =>
      /tromb|plateletcrit|thrombocrit/i.test(key) && key !== 'hematology.pct'
    );
    for (const oldKey of pctAliases) {
      for (const entry of data.entries) {
        renameLabEntryMarker(entry, oldKey, 'hematology.pct', { stamp: false });
      }
      delete data.customMarkers[oldKey];
    }
  }
  // Migrate hematocrit from fraction (0.45) to percentage (45%).
  if (data.entries) {
    for (const entry of data.entries) {
      const hematocrit = entry.markers?.['hematology.hematocrit'];
      if (hematocrit != null && hematocrit < 1) {
        setLabEntryMarker(
          entry,
          'hematology.hematocrit',
          parseFloat((hematocrit * 100).toFixed(1)),
          { stamp: false },
        );
      }
    }
  }
  if (data.refOverrides?.['hematology.hematocrit']) {
    const override = data.refOverrides['hematology.hematocrit'];
    if (override.refMin != null && override.refMin < 1) override.refMin = parseFloat((override.refMin * 100).toFixed(1));
    if (override.refMax != null && override.refMax < 1) override.refMax = parseFloat((override.refMax * 100).toFixed(1));
    if (override.optimalMin != null && override.optimalMin < 1) override.optimalMin = parseFloat((override.optimalMin * 100).toFixed(1));
    if (override.optimalMax != null && override.optimalMax < 1) override.optimalMax = parseFloat((override.optimalMax * 100).toFixed(1));
  }
  // Initialize fields added after the original profile schema.
  if (data.healthGoals === undefined) data.healthGoals = [];
  if (data.sleepRest === undefined) data.sleepRest = null;
  if (data.lightCircadian === undefined) data.lightCircadian = null;
  if (data.stress === undefined) data.stress = null;
  if (data.loveLife === undefined) data.loveLife = null;
  if (data.environment === undefined) data.environment = null;
  if (data.interpretiveLens === undefined) data.interpretiveLens = '';
  if (data.contextNotes === undefined) data.contextNotes = '';
  if (data.customMarkers === undefined) data.customMarkers = {};
  if (data.menstrualCycle === undefined) data.menstrualCycle = null;
  if (data.emfAssessment === undefined) data.emfAssessment = null;
  if (data.emfAssessment && !Array.isArray(data.emfAssessment.assessments)) data.emfAssessment = null;
  if (data.genetics === undefined) data.genetics = null;
  if (data.markerNotes === undefined) data.markerNotes = {};
  if (data.markerValueNotes === undefined) data.markerValueNotes = {};
  if (data.biologyScoreAI === undefined) data.biologyScoreAI = {};
  data.contextSourceSettings = normalizeContextSourceSettings(data.contextSourceSettings);
  if (data.changeHistory === undefined) data.changeHistory = [];
  if (data.importSnapshots === undefined) data.importSnapshots = [];
  if (data.biometrics === undefined) data.biometrics = null;
  if (data.sunSessions === undefined) data.sunSessions = [];
  if (data.deviceSessions === undefined) data.deviceSessions = [];
  if (data.lightDevices === undefined) data.lightDevices = [];
  if (data.lightEnvironment === undefined) data.lightEnvironment = null;
  normalizeLightEnvironmentEveningFields(data.lightEnvironment);
  if (data.lightMeasurements === undefined) data.lightMeasurements = [];
  if (data.lightAudits === undefined) data.lightAudits = [];
  if (data.sunCorrelations === undefined) data.sunCorrelations = null;
  if (data.lifelightProfile === undefined) data.lifelightProfile = null;
  if (data.sunDefaults === undefined) data.sunDefaults = null;
  // Migration — sunDefaults.location → sunDefaults.coords.
  if (data.sunDefaults && data.sunDefaults.location && !data.sunDefaults.coords) {
    const { lat, lon, label } = data.sunDefaults.location;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      data.sunDefaults.coords = {
        lat,
        lon,
        source: 'profile-precise',
        ...(label ? { label } : {}),
      };
    }
    delete data.sunDefaults.location;
  }
  migrateSupplementMedicationRecords(data);
  migrateCustomMarkerIdentities(data.customMarkers);
  migrateMarkerPlacements(data);
  return data;
}
