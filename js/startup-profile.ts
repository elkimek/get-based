import { configureRuntimeFunctions } from './runtime-callbacks.js';
// startup-profile.js - profile migration, active-profile load, and UI state

import { state } from './state.js';
import { restoreCorrelationWorkspace } from './correlation-workspace-store.js';
import { rememberProfileData } from './profile-data-writes.js';
import {
  saveProfiles,
  getActiveProfileId,
  setActiveProfileId,
  getProfileSex,
  getProfileDob,
  profileStorageKey,
  migrateProfileData,
  initProfilesCache,
} from './profile.js';
import { configureCryptoProfileDeps, encryptedGetItem, encryptedSetItem } from './crypto.js';
import { ensureImportedArray } from './data-merge.js';
import { normalizeUnitProfile } from './unit-profiles.js';

export interface StartupProfileDependencies {
  hydrateNutritionSummary: (profileId: typeof state.currentProfile) => unknown;
}
export type StartupProfileDependencyRegistry = { [Key in keyof StartupProfileDependencies]: unknown };
export type StartupProfileDependencyUpdates = Partial<StartupProfileDependencyRegistry>;
type StartupProfileConfigurer = (
  current: StartupProfileDependencyRegistry, updates: StartupProfileDependencyUpdates,
  fields: ReadonlyArray<keyof StartupProfileDependencies>,
) => StartupProfileDependencyRegistry;

// JSON and injected return values retain their original unvalidated boundaries.
type ImportedProfileState = { importedData: unknown };
type ProfileMigrationReader = (data: unknown) => unknown;

const startupProfileDeps: StartupProfileDependencyRegistry = {
  hydrateNutritionSummary: (async () => {}),
};

export function configureStartupProfileDeps(deps: StartupProfileDependencyUpdates = {}) {
  return (configureRuntimeFunctions as StartupProfileConfigurer)(startupProfileDeps, deps, ["hydrateNutritionSummary"]);
}

configureCryptoProfileDeps({ migrateProfileData });

async function migrateLegacyProfileStorage() {
  if (localStorage.getItem('labcharts-profiles')) return;

  const now = Date.now();
  const profiles = [{
    id: 'default',
    name: 'Default',
    sex: null,
    dob: null,
    location: { country: '', zip: '' },
    tags: [],
    notes: '',
    status: 'active',
    avatar: null,
    height: null,
    heightUnit: 'cm',
    createdAt: now,
    lastUpdated: now,
    pinned: false,
  }];
  await saveProfiles(profiles);
  setActiveProfileId('default');

  const oldImported = localStorage.getItem('labcharts-imported');
  if (oldImported) {
    // Route through encryptedSetItem so the destination key
    // (`labcharts-default-imported`) lands in IndexedDB rather than
    // localStorage. Otherwise this v1->v2 migration could fail when
    // the legacy blob is large enough to exceed the localStorage cap.
    let migratedImported = oldImported;
    try {
      const parsed: unknown = JSON.parse(oldImported);
      (migrateProfileData as ProfileMigrationReader)(parsed);
      migratedImported = JSON.stringify(parsed);
    } catch {
      // Keep original bytes if legacy data is malformed; loadProfile will
      // preserve a recoverable corrupt copy rather than destructively fixing.
    }
    await encryptedSetItem(profileStorageKey('default', 'imported'), migratedImported);
    localStorage.removeItem('labcharts-imported');
  }

  const oldUnits = localStorage.getItem('labcharts-units');
  if (oldUnits) {
    localStorage.setItem(profileStorageKey('default', 'units'), oldUnits);
    localStorage.removeItem('labcharts-units');
  }
}

export async function initializeProfileData() {
  await migrateLegacyProfileStorage();

  // Populate profiles cache from (possibly encrypted) storage.
  await initProfilesCache();

  // Load active profile BEFORE any OAuth callback handling. Wearable OAuth
  // callbacks persist into state.importedData via saveImportedData, whose
  // storage key depends on state.currentProfile.
  state.currentProfile = getActiveProfileId();
  const savedImported = await encryptedGetItem(profileStorageKey(state.currentProfile, 'imported'));
  if (savedImported) {
    try {
      (state as ImportedProfileState).importedData = JSON.parse(savedImported) as unknown;
      ensureImportedArray((state as ImportedProfileState).importedData, 'notes');
      (migrateProfileData as ProfileMigrationReader)((state as ImportedProfileState).importedData);
    } catch (e) {}
  }
  // Empty profiles also need a baseline before the first unsaved edit.
  rememberProfileData((state as ImportedProfileState).importedData);
  // Initial boot uses this path rather than loadProfile; restore before routing.
  await restoreCorrelationWorkspace(state.currentProfile);
  // Profile switches already hydrate this local-only aggregate. Initial boot
  // must do the same before Dashboard/Body render or a hard refresh makes
  // saved meals appear to have vanished until the nutrition editor is opened.
  try { await (startupProfileDeps.hydrateNutritionSummary as StartupProfileDependencies['hydrateNutritionSummary'])(state.currentProfile); } catch {
    state.nutritionSummary = null;
  }
}

export function applyProfileDisplayState() {
  const savedUnits = localStorage.getItem(profileStorageKey(state.currentProfile, 'units'));
  state.unitSystem = normalizeUnitProfile(savedUnits);

  const savedRange = localStorage.getItem(profileStorageKey(state.currentProfile, 'rangeMode'));
  state.rangeMode = savedRange === 'reference' ? 'reference' : savedRange === 'both' ? 'both' : 'optimal';
  state.profileSex = getProfileSex(state.currentProfile);
  state.profileDob = getProfileDob(state.currentProfile);

  document.querySelectorAll('.unit-toggle-btn').forEach(btn => {
    const toggle = (btn as HTMLElement);
    toggle.classList.toggle('active', toggle.dataset.unit === state.unitSystem);
  });
  document.querySelectorAll('.sex-toggle-btn').forEach(btn => {
    const toggle = (btn as HTMLElement);
    toggle.classList.toggle('active', toggle.dataset.sex === state.profileSex);
  });
  document.querySelectorAll('.range-toggle-btn').forEach(btn => {
    const toggle = (btn as HTMLElement);
    toggle.classList.toggle('active', toggle.dataset.range === state.rangeMode);
  });

  const dobInputInit = (document.getElementById('dob-input') as HTMLInputElement | null);
  if (dobInputInit) dobInputInit.value = state.profileDob || '';
}
