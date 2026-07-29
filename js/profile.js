// @ts-check
// profile.js — Profile CRUD, sex/DOB, location, and storage facade.

import { state } from './state.js';
import { COUNTRY_LATITUDES, LATITUDE_BANDS } from './constants.js';
import { callClaudeAPI } from './api.js';
import { isDebugMode, showConfirmDialog, showNotification } from './utils.js';
import { encryptedSetItem, encryptedGetItem, getEncryptionEnabled, isUnlocked } from './crypto.js';
import { migrateProfileData } from './profile-data-migrations.js';
import { profileStorageKey } from './profile-storage-key.js';
import { clearProfileStorage } from './profile-storage-cleanup.js';

export { migrateProfileData, profileStorageKey };

const profileDeps = {
  callClaudeAPI,
  isDebugMode,
  showConfirmDialog,
  showNotification,
};

export function configureProfileDeps(deps = {}) {
  const previous = { ...profileDeps };
  if (typeof deps.callClaudeAPI === 'function') profileDeps.callClaudeAPI = deps.callClaudeAPI;
  if (typeof deps.isDebugMode === 'function') profileDeps.isDebugMode = deps.isDebugMode;
  if (typeof deps.showConfirmDialog === 'function') profileDeps.showConfirmDialog = deps.showConfirmDialog;
  if (typeof deps.showNotification === 'function') profileDeps.showNotification = deps.showNotification;
  return previous;
}

/**
 * @typedef {{
 *   dispatchProfileSwitched: null | ((profileId: string) => void),
 *   invalidateProfileContextCache: null | (() => Promise<void> | void),
 *   refreshProfileButton: null | (() => Promise<void> | void),
 *   reloadProfileRuntimeShell: null | ((profileId: string) => Promise<void> | void),
 *   refreshProfileWearables: null | ((profileId: string, biometrics: any) => Promise<void> | void),
 * }} ProfileRuntimeDeps
 */

/** @type {ProfileRuntimeDeps} */
const profileRuntimeDeps = {
  dispatchProfileSwitched: null,
  invalidateProfileContextCache: null,
  refreshProfileButton: null,
  reloadProfileRuntimeShell: null,
  refreshProfileWearables: null,
};

/** @param {Partial<ProfileRuntimeDeps>} [deps] */
export function configureProfileRuntimeDeps(deps = {}) {
  const previous = { ...profileRuntimeDeps };
  if (Object.hasOwn(deps, 'dispatchProfileSwitched')) {
    profileRuntimeDeps.dispatchProfileSwitched = typeof deps.dispatchProfileSwitched === 'function'
      ? deps.dispatchProfileSwitched
      : null;
  }
  if (Object.hasOwn(deps, 'invalidateProfileContextCache')) {
    profileRuntimeDeps.invalidateProfileContextCache = typeof deps.invalidateProfileContextCache === 'function'
      ? deps.invalidateProfileContextCache
      : null;
  }
  if (Object.hasOwn(deps, 'refreshProfileButton')) {
    profileRuntimeDeps.refreshProfileButton = typeof deps.refreshProfileButton === 'function'
      ? deps.refreshProfileButton
      : null;
  }
  if (Object.hasOwn(deps, 'reloadProfileRuntimeShell')) {
    profileRuntimeDeps.reloadProfileRuntimeShell = typeof deps.reloadProfileRuntimeShell === 'function'
      ? deps.reloadProfileRuntimeShell
      : null;
  }
  if (Object.hasOwn(deps, 'refreshProfileWearables')) {
    profileRuntimeDeps.refreshProfileWearables = typeof deps.refreshProfileWearables === 'function'
      ? deps.refreshProfileWearables
      : null;
  }
  return previous;
}

function dispatchProfileSwitched(profileId) {
  profileRuntimeDeps.dispatchProfileSwitched?.(profileId);
}

async function invalidateProfileContextCache() {
  await profileRuntimeDeps.invalidateProfileContextCache?.();
}

async function refreshProfileButton() {
  await profileRuntimeDeps.refreshProfileButton?.();
}

async function reloadProfileRuntimeShell(profileId) {
  await profileRuntimeDeps.reloadProfileRuntimeShell?.(profileId);
}

function refreshProfileWearables(profileId, biometrics) {
  try {
    const pending = profileRuntimeDeps.refreshProfileWearables?.(profileId, biometrics);
    Promise.resolve(pending).catch(() => {});
  } catch {}
}

/**
 * @typedef {{ country: string, zip: string }} ProfileLocation
 * @typedef {{
 *   id: string,
 *   name: string,
 *   sex: string | null,
 *   dob: string | null,
 *   location: ProfileLocation,
 *   tags: string[],
 *   notes: string,
 *   status: string,
 *   avatar: string | null,
 *   height: number | string | null,
 *   heightUnit: string,
 *   createdAt: number,
 *   lastUpdated: number,
 *   pinned: boolean,
 *   [key: string]: unknown
 * }} ProfileRecord
 * @typedef {{
 *   sex?: string | null,
 *   dob?: string | null,
 *   location?: ProfileLocation,
 *   tags?: string[],
 *   notes?: string,
 *   status?: string,
 *   avatar?: string | null,
 *   height?: number | string | null,
 *   heightUnit?: string,
 *   skipInitialSync?: boolean
 * }} CreateProfileOptions
 * @typedef {{
 *   name?: string,
 *   sex?: string | null,
 *   dob?: string | null,
 *   location?: ProfileLocation,
 *   tags?: string[],
 *   notes?: string,
 *   status?: string,
 *   avatar?: string | null,
 *   height?: number | string | null,
 *   heightUnit?: string,
 *   pinned?: boolean
 * }} ProfileMetaUpdates
 * @typedef {import('../types/app-state.js').ProfileData} ProfileData
 */

// ═══════════════════════════════════════════════
// PROFILE MANAGEMENT
// ═══════════════════════════════════════════════
/**
 * @returns {ProfileRecord[]}
 */
export function getProfiles() {
  // Read from in-memory cache (populated at init via initProfilesCache)
  if (Array.isArray(state.profiles)) return state.profiles;
  try {
    const raw = localStorage.getItem('labcharts-profiles');
    const profiles = raw ? JSON.parse(raw) : [];
    return Array.isArray(profiles) ? profiles : [];
  }
  catch(e) { return []; }
}

/**
 * @returns {Promise<void>}
 */
export async function initProfilesCache() {
  const raw = await encryptedGetItem('labcharts-profiles');
  /** @type {ProfileRecord[]} */
  let profiles = [];
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) profiles = parsed;
  } catch(e) {}
  state.profiles = profiles;
  migrateProfiles(profiles);
}

// Backfill new profile-level fields (tags, notes, status, timestamps, pinned)
/**
 * @param {ProfileRecord[]} profiles
 */
function migrateProfiles(profiles) {
  let changed = false;
  const now = Date.now();
  for (const p of profiles) {
    if (!Array.isArray(p.tags)) { p.tags = []; changed = true; }
    if (typeof p.notes !== 'string') { p.notes = ''; changed = true; }
    if (!p.status) { p.status = 'active'; changed = true; }
    if (!p.createdAt) { p.createdAt = now; changed = true; }
    if (!p.lastUpdated) { p.lastUpdated = now; changed = true; }
    if (typeof p.pinned !== 'boolean') { p.pinned = false; changed = true; }
    if (p.height === undefined) { p.height = null; changed = true; }
    if (p.heightUnit === undefined) { p.heightUnit = 'cm'; changed = true; }
  }
  if (changed) saveProfiles(profiles);
}

/**
 * @param {ProfileRecord[]} profiles
 * @returns {Promise<void>}
 */
export async function saveProfiles(profiles) {
  state.profiles = profiles;
  try {
    const value = JSON.stringify(profiles);
    await encryptedSetItem('labcharts-profiles', value);
  } catch (e) {
    profileDeps.showNotification('Storage limit reached — could not save profile changes.', 'error');
    throw e;
  }
}

/**
 * @returns {string}
 */
export function getActiveProfileId() {
  return _normalizeProfileId(localStorage.getItem('labcharts-active-profile')) || 'default';
}

/**
 * @param {string} id
 */
export function setActiveProfileId(id) {
  localStorage.setItem('labcharts-active-profile', _normalizeProfileId(id) || 'default');
}

/**
 * @param {unknown} id
 * @returns {string}
 */
function _normalizeProfileId(id) {
  return String(id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 128);
}

/**
 * @returns {ProfileData}
 */
export function createDefaultProfileData() {
  return {
    entries: [],
    notes: [],
    supplements: [],
    healthGoals: [],
    diagnoses: null,
    diet: null,
    exercise: null,
    sleepRest: null,
    lightCircadian: null,
    stress: null,
    loveLife: null,
    environment: null,
    interpretiveLens: '',
    contextNotes: '',
    menstrualCycle: null,
    emfAssessment: null,
    genetics: null,
    customMarkers: {},
    markerNotes: {},
    markerValueNotes: {},
    biologyScoreAI: {},
    contextSourceSettings: {},
    changeHistory: [],
    importSnapshots: [],
    biometrics: null,
    manualValues: {},
    sunSessions: [],
    deviceSessions: [],
    lightDevices: [],
    lightEnvironment: null,
    lightMeasurements: [],
    lightAudits: [],
    sunCorrelations: null,
    lifelightProfile: null,
    sunDefaults: null
  };
}

/**
 * @param {string} profileId
 * @param {ProfileData | null} [importedData]
 * @returns {void}
 */
function queueProfileSync(profileId, importedData = null) {
  if (!profileId) return;
  try {
    if (localStorage.getItem('labcharts-sync-enabled') !== 'true') return;
  } catch {
    return;
  }
  import('./sync.js').then(m => m.onProfileSaved?.(profileId, importedData)).catch(() => {});
}


/**
 * @param {string} profileId
 * @returns {Promise<void>}
 */
export async function loadProfile(profileId) {
  state.currentProfile = profileId;
  setActiveProfileId(profileId);
  await invalidateProfileContextCache();
  const savedImported = await encryptedGetItem(profileStorageKey(profileId, 'imported'));
  const defaultData = createDefaultProfileData();
  state.importedData = defaultData;
  if (savedImported) {
    try {
      const d = JSON.parse(savedImported);
      if (!d.notes) d.notes = [];
      if (!d.supplements) d.supplements = [];
      state.importedData = migrateProfileData(d);
    } catch (e) {
      // Don't silently substitute defaults — preserve the corrupted bytes so
      // the user can recover (or we can debug). Same key suffix every time
      // so a second corruption doesn't shadow the first recoverable copy.
      // The recovery key is sensitive and blob-backed, so encryptedSetItem
      // preserves the at-rest guarantee and removes any legacy localStorage
      // duplicate only after IndexedDB has the canonical copy.
      let recoverySaved = false;
      try {
        const corruptKey = profileStorageKey(profileId, 'imported-corrupt');
        const existingRecovery = await encryptedGetItem(corruptKey);
        if (existingRecovery === null) {
          if (getEncryptionEnabled() && !isUnlocked()) {
            throw new Error('Encryption key is locked; refusing a plaintext recovery write.');
          }
          await encryptedSetItem(corruptKey, savedImported);
        }
        recoverySaved = true;
      } catch (recoveryError) {
        console.warn('[profile] Could not preserve corrupt profile bytes:', recoveryError);
      }
      profileDeps.showNotification(
        recoverySaved
          ? 'Profile data was corrupted and could not be loaded. The original bytes were saved as a recovery copy. Contact support before making more changes.'
          : 'Profile data was corrupted and could not be loaded, and the recovery copy could not be saved. Contact support before making more changes.',
        'error',
        12000,
      );
    }
  }
  const savedUnits = localStorage.getItem(profileStorageKey(profileId, 'units'));
  state.unitSystem = savedUnits === 'US' ? 'US' : 'EU';
  const savedRange = localStorage.getItem(profileStorageKey(profileId, 'rangeMode'));
  state.rangeMode = savedRange === 'reference' ? 'reference' : savedRange === 'both' ? 'both' : 'optimal';
  state.showAltUnits = localStorage.getItem(profileStorageKey(profileId, 'showAltUnits')) === 'on';
  const savedSuppOverlay = localStorage.getItem(profileStorageKey(profileId, 'suppOverlay'));
  state.suppOverlayMode = savedSuppOverlay === 'on' ? 'on' : 'off';
  const savedNoteOverlay = localStorage.getItem(profileStorageKey(profileId, 'noteOverlay'));
  state.noteOverlayMode = savedNoteOverlay === 'on' ? 'on' : 'off';
  const savedPhaseOverlay = localStorage.getItem(profileStorageKey(profileId, 'phaseOverlay'));
  state.phaseOverlayMode = savedPhaseOverlay === 'on' ? 'on' : 'off';
  state.profileSex = getProfileSex(profileId);
  state.profileDob = getProfileDob(profileId);
  state.selectedCorrelationMarkers = [];
  state.chatHistory = [];
  state.chatThreads = [];
  state.currentThreadId = null;
  state.markerRegistry = {};
  await reloadProfileRuntimeShell(profileId);
  refreshProfileWearables(profileId, state.importedData?.biometrics);
}

/**
 * @param {string} name
 * @param {CreateProfileOptions} [opts]
 * @returns {string}
 */
export function createProfile(name, opts = {}) {
  const profiles = getProfiles();
  const id = Date.now().toString(36);
  const now = Date.now();
  profiles.push({
    id, name,
    sex: opts.sex || null,
    dob: opts.dob || null,
    location: opts.location || { country: '', zip: '' },
    tags: opts.tags || [],
    notes: opts.notes || '',
    status: opts.status || 'active',
    avatar: opts.avatar || null,
    height: opts.height || null,
    heightUnit: opts.heightUnit || 'cm',
    createdAt: now,
    lastUpdated: now,
    pinned: false
  });
  saveProfiles(profiles);
  if (!opts.skipInitialSync) queueProfileSync(id, createDefaultProfileData());
  return id;
}

/**
 * @param {string} profileId
 * @param {string} newName
 * @returns {void}
 */
export function renameProfile(profileId, newName) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  if (p) { p.name = newName; p.lastUpdated = Date.now(); saveProfiles(profiles); queueProfileSync(profileId); }
}

/**
 * @param {string} profileId
 * @param {ProfileMetaUpdates} updates
 * @returns {void}
 */
export function updateProfileMeta(profileId, updates) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  if (!p) return;
  for (const [key, val] of Object.entries(updates)) {
    if (key === 'id' || key === 'createdAt') continue;
    p[key] = val;
  }
  p.lastUpdated = Date.now();
  saveProfiles(profiles);
  queueProfileSync(profileId);
}

/**
 * @returns {string[]}
 */
export function getAllTags() {
  const tags = new Set();
  for (const p of getProfiles()) {
    if (Array.isArray(p.tags)) p.tags.forEach(t => tags.add(t));
  }
  return [...tags].sort();
}

/**
 * @param {string} profileId
 * @returns {void}
 */
export function touchProfileTimestamp(profileId) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  if (p) { p.lastUpdated = Date.now(); saveProfiles(profiles); }
}

/**
 * @param {string} profileId
 * @param {() => void} [onComplete]
 * @returns {Promise<void>}
 */
export async function deleteProfile(profileId, onComplete) {
  const profiles = getProfiles();
  if (profiles.length <= 1) { profileDeps.showNotification("Cannot delete the last profile", "error"); return; }
  if (await profileDeps.showConfirmDialog('Delete this profile and all its data? This cannot be undone.')) {
    const updated = profiles.filter(p => p.id !== profileId);
    try {
      await clearProfileStorage(profileId);
    } catch (error) {
      console.warn('[profile] Profile cleanup failed:', error);
      profileDeps.showNotification('Could not delete all profile data. Close other Get Based tabs and try again.', 'error', 8000);
      return;
    }
    await saveProfiles(updated);
    // Propagate the delete to the relay so other devices stop seeing this
    // profile. Without this, a paired device pulling later would resurrect
    // the profile (the Evolu row's dataJson outlives our local wipe).
    // Soft-delete via Evolu's isDeleted column — the query filter drops
    // tombstoned rows; CRDT LWW handles cross-device conflict resolution.
    import('./sync.js').then(m => m.deleteProfileFromRelay(profileId)).catch(() => {});
    if (state.currentProfile === profileId) {
      await loadProfile(updated[0].id);
    } else {
      await refreshProfileButton();
    }
    profileDeps.showNotification('Profile deleted', 'info');
    if (onComplete) onComplete();
  }
}

/**
 * @param {string} profileId
 * @returns {Promise<void>}
 */
export async function switchProfile(profileId) {
  if (profileId === state.currentProfile) return;
  // loadProfile is async (encryptedGetItem awaits IDB / OPFS). Earlier
  // draft fired-and-forgot it, leaving switchProfile resolving before
  // state.importedData was actually populated — callers like loadDemoData
  // could then race the import against the still-running profile load
  // and end up with the demo data saved to the WRONG profile id, or
  // overwritten when the (delayed) loadProfile finally read the empty
  // localStorage row for the new profile.
  await loadProfile(profileId);
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  profileDeps.showNotification(`Switched to ${p ? p.name : 'profile'}`, 'info');
  // Modules with per-profile module-singleton state (sun.js region map cache,
  // overlay cache, tick counters, in-flight rehydrate flag) listen for this
  // event so their caches don't bleed across profiles after a switch.
  dispatchProfileSwitched(profileId);
  // Push updated context to messenger gateway so bots see the new profile
  import('./sync.js').then(m => m.pushContextToGateway()).catch(() => {});
}

/**
 * @param {string} profileId
 * @returns {string | null}
 */
export function getProfileSex(profileId) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  return (p && p.sex) || null;
}

/**
 * @param {string} profileId
 * @param {string | null} sex
 * @returns {void}
 */
export function setProfileSex(profileId, sex) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  if (p) { p.sex = sex; saveProfiles(profiles); queueProfileSync(profileId); }
}

/**
 * @param {string} profileId
 * @returns {string | null}
 */
export function getProfileDob(profileId) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  return (p && p.dob) || null;
}

/**
 * @param {string} profileId
 * @param {string | null | undefined} dob
 * @returns {void}
 */
export function setProfileDob(profileId, dob) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  if (p) { p.dob = dob || null; saveProfiles(profiles); queueProfileSync(profileId); }
}

/**
 * @param {string} [profileId]
 * @returns {ProfileLocation}
 */
export function getProfileLocation(profileId) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === (profileId || state.currentProfile));
  return (p && p.location) || { country: '', zip: '' };
}

/**
 * @param {string} profileId
 * @param {string} country
 * @param {string} zip
 * @returns {void}
 */
export function setProfileLocation(profileId, country, zip) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === (profileId || state.currentProfile));
  if (p) {
    p.location = { country: (country || '').trim(), zip: (zip || '').trim() };
    saveProfiles(profiles);
    queueProfileSync(p.id);
  }
}

/**
 * @param {string} [profileId]
 * @returns {{ height: number | string | null, unit: string }}
 */
export function getProfileHeight(profileId) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === (profileId || state.currentProfile));
  return { height: (p && p.height) || null, unit: (p && p.heightUnit) || 'cm' };
}

/**
 * @param {string} profileId
 * @param {number | string | null} height
 * @param {string} [unit]
 * @returns {void}
 */
export function setProfileHeight(profileId, height, unit) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === (profileId || state.currentProfile));
  if (p) {
    p.height = height;
    p.heightUnit = unit || 'cm';
    p.lastUpdated = Date.now();
    saveProfiles(profiles);
    queueProfileSync(p.id);
  }
}

// AI-powered latitude detection with hardcoded fallback
/**
 * @returns {Record<string, number>}
 */
export function getLocationCache() { try { return JSON.parse(localStorage.getItem('labcharts-location-cache') || '{}'); } catch(e) { return {}; } }
/**
 * @param {string} key
 * @param {number} lat
 * @returns {void}
 */
export function setLocationCache(key, lat) { var c = getLocationCache(); c[key] = lat; try { localStorage.setItem('labcharts-location-cache', JSON.stringify(c)); } catch(e) {} }
/**
 * @param {number} lat
 * @returns {number}
 */
export function latitudeToBand(lat) { var a = Math.abs(lat); if (a < 25) return 0; if (a < 40) return 1; if (a < 50) return 2; if (a < 60) return 3; return 4; }

/**
 * @param {string} country
 * @param {string} zip
 * @returns {Promise<void>}
 */
export async function detectLatitudeWithAI(country, zip) {
  var cacheKey = (country + '|' + zip).toLowerCase();
  if (getLocationCache()[cacheKey] !== undefined) return;
  try {
    var locationStr = zip ? country + ' ' + zip : country;
    var { text: response } = await profileDeps.callClaudeAPI({
      system: 'You are a geography assistant. Reply with ONLY a number \u2014 the approximate latitude in decimal degrees (positive for North, negative for South). No text, no degree symbol, just the number.',
      messages: [{ role: 'user', content: 'Latitude of: ' + locationStr }],
      maxTokens: 10
    });
    var lat = parseFloat((response || '').trim());
    if (!isNaN(lat) && lat >= -90 && lat <= 90) {
      setLocationCache(cacheKey, lat);
      var el = document.getElementById('loc-lat-display');
      if (el) {
        var band = latitudeToBand(lat);
        el.style.color = 'var(--green)';
        el.textContent = '\u2713 ' + Math.abs(Math.round(lat)) + '\u00b0' + (lat >= 0 ? 'N' : 'S') + ' \u2014 ' + LATITUDE_BANDS[band];
      }
    }
  } catch(e) {
    if (profileDeps.isDebugMode()) console.warn('[Location] AI detection failed:', e);
  }
}

/**
 * @param {string} [optCountry]
 * @param {string} [optZip]
 * @returns {string | null}
 */
export function getLatitudeFromLocation(optCountry, optZip) {
  const loc = getProfileLocation();
  const country = optCountry !== undefined ? optCountry : loc.country;
  if (!country) return null;
  const c = country.toLowerCase().trim();
  const zip = (optZip !== undefined ? optZip : loc.zip || '').trim();

  // AI cache (most accurate — covers any country/ZIP worldwide)
  var cacheKey = (c + '|' + zip).toLowerCase();
  var aiCached = getLocationCache()[cacheKey];
  if (aiCached !== undefined) return LATITUDE_BANDS[latitudeToBand(aiCached)];

  var zn = zip.replace(/\s/g, '');
  // ZIP refinement for USA (first digit = region, special prefixes for HI/AK/PR)
  if (zn && (c === 'usa' || c === 'us' || c === 'united states' || c === 'america')) {
    var p3 = zn.substring(0, 3);
    if (p3 >= '006' && p3 <= '009') return LATITUDE_BANDS[0]; // PR/VI → tropical
    if (p3 >= '967' && p3 <= '968') return LATITUDE_BANDS[0]; // Hawaii → tropical
    if (p3 >= '995') return LATITUDE_BANDS[4]; // Alaska → subarctic
    var d = zn.charAt(0);
    var usb = { '0':2, '1':2, '2':2, '3':1, '4':2, '5':2, '6':2, '7':1, '8':2, '9':2 };
    if (usb[d] !== undefined) return LATITUDE_BANDS[usb[d]];
  }

  // ZIP refinement for Canada (first letter = province/territory)
  if (zn && (c === 'canada' || c === 'ca')) {
    var letter = zn.charAt(0).toUpperCase();
    var cab = { 'A':3,'B':2,'C':2,'E':2, 'G':2,'H':2,'J':2,'K':2,'L':2,'M':2,'N':2, 'P':3,'R':3,'S':3,'T':3, 'V':2, 'X':4,'Y':4 };
    if (cab[letter] !== undefined) return LATITUDE_BANDS[cab[letter]];
  }

  // ZIP refinement for European countries
  var zd = zn.charAt(0);
  // Norway (4-digit): 0-5 southern ~58-60°N → northern, 6-9 central/north ~62-71°N → subarctic
  if (zn && (c === 'norway' || c === 'norge')) {
    if (zd >= '0' && zd <= '5') return LATITUDE_BANDS[3];
    return LATITUDE_BANDS[4];
  }
  // Sweden (5-digit): 1-6 southern/central ~55-60°N → northern, 7-9 north ~62-69°N → subarctic
  if (zn && (c === 'sweden' || c === 'sverige')) {
    if (zd >= '1' && zd <= '6') return LATITUDE_BANDS[3];
    if (zd >= '7') return LATITUDE_BANDS[4];
  }
  // Finland (5-digit): 00-39 southern ~60°N → northern, 40-99 central/north ~62-70°N → subarctic
  if (zn && (c === 'finland' || c === 'suomi')) {
    var f2 = parseInt(zn.substring(0, 2));
    if (!isNaN(f2)) return LATITUDE_BANDS[f2 < 40 ? 3 : 4];
  }
  // Germany (5-digit): 0-6 northern/central ~50-54°N → northern, 7-9 southern ~48-50°N → temperate
  if (zn && (c === 'germany' || c === 'deutschland')) {
    if (zd >= '7') return LATITUDE_BANDS[2];
    return LATITUDE_BANDS[3];
  }
  // Italy (5-digit): 00-79 central/north ~41-47°N → temperate, 80-98 south/islands ~36-41°N → subtropical
  if (zn && (c === 'italy' || c === 'italia')) {
    var i2 = parseInt(zn.substring(0, 2));
    if (!isNaN(i2)) return LATITUDE_BANDS[i2 >= 80 ? 1 : 2];
  }
  // Spain (5-digit): northern provinces ~43°N → temperate, rest → subtropical
  if (zn && (c === 'spain' || c === 'españa' || c === 'espana')) {
    var s2 = parseInt(zn.substring(0, 2));
    if (!isNaN(s2) && (s2 >= 15 && s2 <= 16 || s2 >= 20 && s2 <= 24 || s2 >= 26 && s2 <= 28 || s2 >= 31 && s2 <= 34 || s2 >= 39 && s2 <= 50)) return LATITUDE_BANDS[2];
    return LATITUDE_BANDS[1];
  }
  // France (5-digit): mostly temperate, northern departments ~50°N → borderline northern
  if (zn && (c === 'france')) {
    var fr2 = parseInt(zn.substring(0, 2));
    if (!isNaN(fr2) && (fr2 >= 59 && fr2 <= 62 || fr2 === 80 || fr2 === 2)) return LATITUDE_BANDS[3];
    return LATITUDE_BANDS[2];
  }
  // Russia (6-digit): default northern, 350-385 south → temperate, 163/183-184 Murmansk → subarctic
  if (zn && (c === 'russia' || c === 'россия' || c === 'rossiya')) {
    var r3 = parseInt(zn.substring(0, 3));
    if (!isNaN(r3)) {
      if (r3 >= 350 && r3 <= 385) return LATITUDE_BANDS[2];
      if (r3 >= 163 && r3 <= 164 || r3 >= 183 && r3 <= 184) return LATITUDE_BANDS[4];
    }
    return LATITUDE_BANDS[3];
  }

  // Country-level lookup
  const band = COUNTRY_LATITUDES[c];
  if (band !== undefined) return LATITUDE_BANDS[band];
  for (const [key, val] of Object.entries(COUNTRY_LATITUDES)) {
    if (c.includes(key) || key.includes(c)) return LATITUDE_BANDS[val];
  }
  return null;
}
