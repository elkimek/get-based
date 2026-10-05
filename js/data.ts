// data.js — Data pipeline, unit conversion, date range, trend detection

import { queueProfileDataWrite, profileDataBaseline, rememberProfileData, mergeProfileMutation, adoptProfileData, rebaseLiveProfileData, ProfileWriteConflict } from './profile-data-writes.js';
import { mergeBiologyScoreAIRecords } from './biology-score-persistence.js';
import { isProfileReadBlocked } from './profile-load-safety.js';
import { state } from './state.js';
import { mergeCustomMarkerDefinitions } from './data-custom-markers.js';
import { populateCalculatedMarkers } from './data-calculated-markers.js';
import {
  CONTEXT_OPTIMAL_RANGES,
  CONTEXT_REFERENCE_RANGES,
  MARKER_SCHEMA,
  OPTIMAL_RANGES,
  PHASE_RANGES,
} from './schema.js';
import {
  captureCanonicalScoring,
  convertCanonicalToDisplay,
  convertDisplayToCanonical,
  normalizeUnitProfile,
  resolveMarkerUnitProfile,
} from './unit-profiles.js';
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
  navigateDataViewRuntime,
  renderChartLayersDropdown,
  renderDateRangeFilter,
  setDateRange,
  setNoteOverlay,
  setPhaseOverlay,
  setSuppOverlay,
  switchRangeMode,
  switchUnitSystem,
  showDataMarkerDetailRuntime,
  toggleAltUnits,
  toggleChartLayersDropdown,
  updateHeaderDates,
  updateHeaderRangeToggle,
} from './data-view-controls.js';

import { createDataCore } from './data-core.js';

// Preserve browser-service initialization order while the full implementation is native.
// Getters keep ESM bindings live across queued saves and service replacement.
export const {
  configureDataContextDependencies,
  registerRefreshCallback,
  _runRegisteredRefreshCallback,
  invalidateActiveDataCache,
  saveImportedData,
  saveImportedDataForProfile,
  getFocusCardFingerprint,
  getActiveData,
  convertDisplayToSI,
  applyUnitConversion,
  filterDatesByRange,
  recalculateHOMAIR,
  getAllFlaggedMarkers
} = createDataCore({
  get queueProfileDataWrite() { return queueProfileDataWrite; },
  get profileDataBaseline() { return profileDataBaseline; },
  get rememberProfileData() { return rememberProfileData; },
  get mergeProfileMutation() { return mergeProfileMutation; },
  get adoptProfileData() { return adoptProfileData; },
  get rebaseLiveProfileData() { return rebaseLiveProfileData; },
  get ProfileWriteConflict() { return ProfileWriteConflict; },
  get mergeBiologyScoreAIRecords() { return mergeBiologyScoreAIRecords; },
  get isProfileReadBlocked() { return isProfileReadBlocked; },
  get state() { return state; },
  get mergeCustomMarkerDefinitions() { return mergeCustomMarkerDefinitions; },
  get populateCalculatedMarkers() { return populateCalculatedMarkers; },
  get CONTEXT_OPTIMAL_RANGES() { return CONTEXT_OPTIMAL_RANGES; },
  get CONTEXT_REFERENCE_RANGES() { return CONTEXT_REFERENCE_RANGES; },
  get MARKER_SCHEMA() { return MARKER_SCHEMA; },
  get OPTIMAL_RANGES() { return OPTIMAL_RANGES; },
  get PHASE_RANGES() { return PHASE_RANGES; },
  get captureCanonicalScoring() { return captureCanonicalScoring; },
  get convertCanonicalToDisplay() { return convertCanonicalToDisplay; },
  get convertDisplayToCanonical() { return convertDisplayToCanonical; },
  get normalizeUnitProfile() { return normalizeUnitProfile; },
  get resolveMarkerUnitProfile() { return resolveMarkerUnitProfile; },
  get hashString() { return hashString; },
  get isDebugMode() { return isDebugMode; },
  get showNotification() { return showNotification; },
  get profileStorageKey() { return profileStorageKey; },
  get touchProfileTimestamp() { return touchProfileTimestamp; },
  get migrateProfileData() { return migrateProfileData; },
  get encryptedGetItem() { return encryptedGetItem; },
  get encryptedSetItem() { return encryptedSetItem; },
  get broadcastDataChanged() { return broadcastDataChanged; },
  get scheduleAutoBackup() { return scheduleAutoBackup; },
  get onDataSaved() { return onDataSaved; },
  get onProfileSaved() { return onProfileSaved; },
  get recalculateLabEntryHOMAIR() { return recalculateLabEntryHOMAIR; },
  get getLabDateRangeBounds() { return getLabDateRangeBounds; },
  get getAllFlaggedMarkersForData() { return getAllFlaggedMarkersForData; },
  get configureDataViewCoreDependencies() { return configureDataViewCoreDependencies; },
  get applyMarkerPlacements() { return applyMarkerPlacements; },
  get cortisolReferenceForSampleTime() { return cortisolReferenceForSampleTime; },
  get parseSampleHour() { return parseSampleHour; },
  get resolveAgeSexRange() { return resolveAgeSexRange; },
  get wholeAgeAtDate() { return wholeAgeAtDate; },
});
