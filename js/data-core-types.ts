import type { ProfileData as ImportedDataRecord } from '../types/app-state.js';
import type { ActiveData } from './data-view-types.js';
export type ProfileConversion = ReturnType<typeof import('./unit-profiles.js').resolveMarkerUnitProfile>['conversion'];
export interface DataContextDependencies { invalidateLabContextCache: (() => void) | null | undefined }
export interface ProfileSaveOptions {
  baseData?: Partial<ImportedDataRecord> | undefined;
  expectedData?: string | null | undefined;
  activeSave?: boolean;
  forceProfileScope?: boolean;
  skipSync?: boolean;
  immediate?: unknown;
  reason?: string;
}
export interface ProfileSaveSnapshot {
  baseline: Partial<ImportedDataRecord> | undefined;
  base: Partial<ImportedDataRecord> | null;
  intent: ImportedDataRecord;
  committed: boolean;
  profileId: string;
}
export interface CycleMetadata {
  periods?: Array<{startDate: string}>;
  cycleLength?: number;
  periodLength?: number;
  contraceptive?: string;
  cycleStatus?: string;
  regularity?: string;
}
export interface DrawPhase { cycleDay: number | null; phase: string; phaseName: string; phaseDetailName?: string; source: string }
export type Guidance = {min?: number | null | undefined; max?: number | null | undefined; label: string} | null;

export interface DataCorePorts {
  readonly queueProfileDataWrite: typeof import('./profile-data-writes.js').queueProfileDataWrite;
  readonly profileDataBaseline: typeof import('./profile-data-writes.js').profileDataBaseline;
  readonly rememberProfileData: typeof import('./profile-data-writes.js').rememberProfileData;
  readonly mergeProfileMutation: typeof import('./profile-data-writes.js').mergeProfileMutation;
  readonly adoptProfileData: typeof import('./profile-data-writes.js').adoptProfileData;
  readonly rebaseLiveProfileData: typeof import('./profile-data-writes.js').rebaseLiveProfileData;
  readonly ProfileWriteConflict: typeof import('./profile-data-writes.js').ProfileWriteConflict;
  readonly mergeBiologyScoreAIRecords: (...records: unknown[]) => unknown;
  readonly isProfileReadBlocked: typeof import('./profile-load-safety.js').isProfileReadBlocked;
  readonly state: typeof import('./state.js').state;
  readonly mergeCustomMarkerDefinitions: typeof import('./data-custom-markers.js').mergeCustomMarkerDefinitions;
  readonly populateCalculatedMarkers: typeof import('./data-calculated-markers.js').populateCalculatedMarkers;
  readonly CONTEXT_OPTIMAL_RANGES: typeof import('./schema.js').CONTEXT_OPTIMAL_RANGES;
  readonly CONTEXT_REFERENCE_RANGES: typeof import('./schema.js').CONTEXT_REFERENCE_RANGES;
  readonly MARKER_SCHEMA: typeof import('./schema.js').MARKER_SCHEMA;
  readonly OPTIMAL_RANGES: typeof import('./schema.js').OPTIMAL_RANGES;
  readonly PHASE_RANGES: typeof import('./schema.js').PHASE_RANGES;
  readonly captureCanonicalScoring: typeof import('./unit-profiles.js').captureCanonicalScoring;
  readonly convertCanonicalToDisplay: typeof import('./unit-profiles.js').convertCanonicalToDisplay;
  readonly convertDisplayToCanonical: typeof import('./unit-profiles.js').convertDisplayToCanonical;
  readonly normalizeUnitProfile: typeof import('./unit-profiles.js').normalizeUnitProfile;
  readonly resolveMarkerUnitProfile: typeof import('./unit-profiles.js').resolveMarkerUnitProfile;
  readonly hashString: typeof import('./utils.js').hashString;
  readonly isDebugMode: typeof import('./utils.js').isDebugMode;
  readonly showNotification: typeof import('./utils.js').showNotification;
  readonly profileStorageKey: typeof import('./profile-storage-key.js').profileStorageKey;
  readonly touchProfileTimestamp: (profileId: string) => Promise<boolean>;
  readonly migrateProfileData: (data: ImportedDataRecord) => import('../types/app-state.js').NormalizedProfileData;
  readonly encryptedGetItem: typeof import('./crypto.js').encryptedGetItem;
  readonly encryptedSetItem: typeof import('./crypto.js').encryptedSetItem;
  readonly broadcastDataChanged: typeof import('./crypto.js').broadcastDataChanged;
  readonly scheduleAutoBackup: typeof import('./crypto.js').scheduleAutoBackup;
  readonly onDataSaved: ReturnType<typeof import('./sync-save-hooks-core.js').createSyncSaveHooks>['onDataSaved'];
  readonly onProfileSaved: ReturnType<typeof import('./sync-save-hooks-core.js').createSyncSaveHooks>['onProfileSaved'];
  readonly recalculateLabEntryHOMAIR: typeof import('./lab-entry.js').recalculateLabEntryHOMAIR;
  readonly getLabDateRangeBounds: typeof import('./lab-date-range.js').getLabDateRangeBounds;
  readonly getAllFlaggedMarkersForData: typeof import('./marker-analysis.js').getAllFlaggedMarkers;
  readonly configureDataViewCoreDependencies: (deps: {getActiveData: () => ActiveData; invalidateActiveDataCache: () => void}) => unknown;
  readonly applyMarkerPlacements: typeof import('./marker-placement.js').applyMarkerPlacements;
  readonly cortisolReferenceForSampleTime: typeof import('./marker-context-ranges.js').cortisolReferenceForSampleTime;
  readonly parseSampleHour: typeof import('./marker-context-ranges.js').parseSampleHour;
  readonly resolveAgeSexRange: typeof import('./marker-context-ranges.js').resolveAgeSexRange;
  readonly wholeAgeAtDate: typeof import('./marker-context-ranges.js').wholeAgeAtDate;
}

export interface MarkerRangeOverride {
  refMin?: number | null | undefined;
  refMax?: number | null | undefined;
  optimalMin?: number | null | undefined;
  optimalMax?: number | null | undefined;
  refSource?: unknown;
  optimalSource?: unknown;
}
