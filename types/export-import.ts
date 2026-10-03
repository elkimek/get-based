// Private consumed restore operations; these views do not validate JSON or widen canonical models.
export interface ImportRowOperations extends Record<string, unknown> {
  date?: unknown; id?: unknown; name?: unknown; startDate?: unknown; text?: unknown;
  field?: unknown; severity?: unknown; threadId?: unknown; importedAt?: unknown;
  markers?: Record<string, unknown> | null;
}
interface MenstrualOperations extends Record<string, unknown> { periods?: ImportRowOperations[] }
interface LightEnvironmentOperations extends Record<string, unknown> { rooms?: ImportRowOperations[]; screens?: ImportRowOperations[] }
interface SleepOperations extends Record<string, unknown> { issues?: unknown[] }
export interface ImportedDataOperations extends Record<string, unknown> {
  entries?: ImportRowOperations[]; supplements?: ImportRowOperations[];
  notes?: ImportRowOperations[]; healthGoals?: ImportRowOperations[];
  customMarkers?: Record<string, unknown>; markerPlacements?: Record<string, unknown>; refOverrides?: Record<string, unknown>;
  categoryLabels?: Record<string, unknown>; categoryIcons?: Record<string, unknown>; markerLabels?: Record<string, unknown>;
  menstrualCycle?: MenstrualOperations; emfAssessment?: { assessments?: ImportRowOperations[] } | null;
  genetics?: { snps?: unknown; mtdna?: unknown } | null; biometrics?: { weight?: ImportRowOperations[]; pulse?: ImportRowOperations[]; bp?: ImportRowOperations[] };
  markerNotes?: Record<string, unknown>; markerValueNotes?: Record<string, unknown>; manualValues?: Record<string, unknown>;
  manualMetricTombstones?: Record<string, unknown>;
  sunSessions?: ImportRowOperations[]; deviceSessions?: ImportRowOperations[]; lightDevices?: ImportRowOperations[];
  lightAudits?: ImportRowOperations[]; lightMeasurements?: ImportRowOperations[];
  lightEnvironment?: LightEnvironmentOperations; lightDailyVerdicts?: Record<string, unknown>;
  biologyScoreAI?: Record<string, unknown>; changeHistory?: ImportRowOperations[]; chatSummaries?: ImportRowOperations[];
  wearableConnections?: Record<string, unknown>; wearableSummary?: { sources?: Record<string, unknown> };
  importSnapshots?: ImportRowOperations[];
}
export interface ImportProfileOperations extends Record<string, unknown> { data?: unknown; chat?: unknown; nutrition?: unknown; tags?: unknown[] }
export interface ImportBodyOperations extends Partial<ImportedDataOperations> {
  profile?: ImportProfileOperations; profiles?: ImportProfileOperations[];
  nutrition?: {version?: unknown; meals?: unknown}; chat?: unknown;
  sleepCircadian?: SleepOperations | string;
  wallet?: {nodeUrl?: unknown};
}

// Only the raw restored arguments are projected; native result/option contracts stay derived.
export type RawReplace = (data: unknown, path: string, index: number, item: unknown) => ReturnType<typeof import('../js/data-merge.js').replaceImportedArrayItem>;
export type RawClear = (data: unknown, path: string, id: unknown) => ReturnType<typeof import('../js/data-merge.js').clearTombstone>;
export type RawTrim = (data: unknown, path: string, cap: number) => ReturnType<typeof import('../js/data-merge.js').trimImportedArray>;
export type RawFindLab = (data: unknown, date: unknown, options: Parameters<typeof import('../js/lab-entry-mutations.js').findOrCreateLabEntry>[2]) => ReturnType<typeof import('../js/lab-entry-mutations.js').findOrCreateLabEntry>;
export type RawRestoreLab = (existing: unknown, incoming: unknown, now?: number) => ReturnType<typeof import('../js/lab-entry-restore.js').mergeRestoredLabEntry>;
export type RawCreateProfile = (name: unknown, options: Readonly<Record<string, unknown>>) => ReturnType<typeof import('../js/profile.js').createProfile>;
export type RawSaveProfile = (id: Parameters<typeof import('../js/data.js').saveImportedDataForProfile>[0], data: unknown, options: Parameters<typeof import('../js/data.js').saveImportedDataForProfile>[2]) => ReturnType<typeof import('../js/data.js').saveImportedDataForProfile>;
export type RawMigrateProfile = (data: unknown) => ReturnType<typeof import('../js/profile.js').migrateProfileData>;
