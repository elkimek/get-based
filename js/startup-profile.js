// @ts-check
// startup-profile.js - profile migration, active-profile load, and UI state

import { state } from './state.js';
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
      const parsed = JSON.parse(oldImported);
      migrateProfileData(parsed);
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
  if (!savedImported) return;

  try {
    state.importedData = JSON.parse(savedImported);
    ensureImportedArray(state.importedData, 'notes');
    migrateProfileData(state.importedData);
  } catch (e) {}
}

export function applyProfileDisplayState() {
  const savedUnits = localStorage.getItem(profileStorageKey(state.currentProfile, 'units'));
  state.unitSystem = normalizeUnitProfile(savedUnits);

  const savedRange = localStorage.getItem(profileStorageKey(state.currentProfile, 'rangeMode'));
  state.rangeMode = savedRange === 'reference' ? 'reference' : savedRange === 'both' ? 'both' : 'optimal';
  state.profileSex = getProfileSex(state.currentProfile);
  state.profileDob = getProfileDob(state.currentProfile);

  document.querySelectorAll('.unit-toggle-btn').forEach(btn => {
    const toggle = /** @type {HTMLElement} */ (btn);
    toggle.classList.toggle('active', toggle.dataset.unit === state.unitSystem);
  });
  document.querySelectorAll('.sex-toggle-btn').forEach(btn => {
    const toggle = /** @type {HTMLElement} */ (btn);
    toggle.classList.toggle('active', toggle.dataset.sex === state.profileSex);
  });
  document.querySelectorAll('.range-toggle-btn').forEach(btn => {
    const toggle = /** @type {HTMLElement} */ (btn);
    toggle.classList.toggle('active', toggle.dataset.range === state.rangeMode);
  });

  const dobInputInit = /** @type {HTMLInputElement | null} */ (document.getElementById('dob-input'));
  if (dobInputInit) dobInputInit.value = state.profileDob || '';
}
