import { rememberProfileData } from './profile-data-writes.js';
import { readProfileForLoad } from './profile-load-safety.js';
import { state, resetCorrelationSelection } from './state.js';
import { restoreCorrelationWorkspace } from './correlation-workspace-store.js';
import { COUNTRY_LATITUDES, LATITUDE_BANDS } from './constants.js';
import { isDebugMode, showConfirmDialog, showNotification } from './utils.js';
import { encryptedSetItem, encryptedGetItem, getEncryptionEnabled, isUnlocked } from './crypto.js';
import { migrateProfileData } from './profile-data-migrations.js';
import { profileStorageKey } from './profile-storage-key.js';
import { clearProfileStorage } from './profile-storage-cleanup.js';
import { createUniqueId } from './unique-id.js';
import { getProxyApiUrl } from './proxy-runtime.js';
import { isOfficialGetbasedHost } from './url-safety.js';
import { normalizeUnitProfile } from './unit-profiles.js';
import {
  configureProfileListStoreDeps,
  getProfiles as getStoredProfiles,
  initProfilesCache as initStoredProfilesCache,
  mutateProfiles,
  saveProfiles as saveStoredProfiles,
} from './profile-list-store.js';
import {
  clearLocalProfileDeleteIntent, isDemoProfileId, markLocalProfileDeleteIntent,
  queueEligibleProfileSync,
} from './profile-sync-policy.js';
export { migrateProfileData, profileStorageKey };
import type { Biometrics } from '../types/profile-context-data.js';
import type { ProfileData, NormalizedProfileData } from '../types/app-state.js';
import type { StoredProfileRecord, ProfileListStoreDeps } from './profile-list-store.js';

interface ProfileDeps {
  deleteProfileFromRelay: (profileId: string) => unknown;
  fetchImpl: typeof fetch;
  isDebugMode: typeof isDebugMode;
  onProfileSaved: (profileId: string, importedData: unknown) => unknown;
  pushContextToGateway: () => unknown;
  showConfirmDialog: typeof showConfirmDialog;
  showNotification: typeof showNotification;
}
interface ProfileRuntimeDeps {
  dispatchProfileSwitched: null | ((profileId: string) => void);
  invalidateProfileContextCache: null | (() => Promise<void> | void);
  refreshProfileButton: null | (() => Promise<void> | void);
  reloadProfileRuntimeShell: null | ((profileId: string) => Promise<void> | void);
  refreshProfileWearables: null | ((profileId: string, biometrics: Biometrics | null | undefined) => Promise<void> | void);
}
interface ProfileLocation { country: string; zip: string }
export interface ProfileRecord extends StoredProfileRecord {
  name: string; sex: string | null; dob: string | null; location: ProfileLocation;
  tags: string[]; notes: string; status: string; avatar: string | null;
  height: number | string | null; heightUnit: string; createdAt: number; lastUpdated: number; pinned: boolean;
}
interface ProfileMetaUpdates {
  name?: string; sex?: string | null; dob?: string | null; location?: ProfileLocation;
  tags?: string[]; notes?: string; status?: string; avatar?: string | null;
  height?: number | string | null; heightUnit?: string; pinned?: boolean;
}
interface CreateProfileOptions extends Omit<ProfileMetaUpdates, 'name' | 'pinned'> { skipInitialSync?: boolean }
export interface LocationCacheEntry {
  lat?: unknown; latitude?: unknown; lon?: unknown; longitude?: unknown;
  accuracyKm?: unknown; timezone?: unknown; label?: unknown; resolvedAt?: unknown;
  [key: string]: unknown;
}

const profileDeps: ProfileDeps = {
  deleteProfileFromRelay: async () => {},
  fetchImpl: (input, init) => fetch(input, init),
  isDebugMode,
  onProfileSaved: async () => {},
  pushContextToGateway: async () => {},
  showConfirmDialog,
  showNotification,
};
export function configureProfileDeps(deps: Partial<ProfileDeps & ProfileListStoreDeps> = {}) {
  const previous = { ...profileDeps };
  const previousStoreDeps = configureProfileListStoreDeps(deps);
  if (typeof deps.deleteProfileFromRelay === 'function') profileDeps.deleteProfileFromRelay = deps.deleteProfileFromRelay;
  if (typeof deps.fetchImpl === 'function') profileDeps.fetchImpl = deps.fetchImpl;
  if (typeof deps.isDebugMode === 'function') profileDeps.isDebugMode = deps.isDebugMode;
  if (typeof deps.onProfileSaved === 'function') profileDeps.onProfileSaved = deps.onProfileSaved;
  if (typeof deps.pushContextToGateway === 'function') profileDeps.pushContextToGateway = deps.pushContextToGateway;
  if (typeof deps.showConfirmDialog === 'function') profileDeps.showConfirmDialog = deps.showConfirmDialog;
  if (typeof deps.showNotification === 'function') profileDeps.showNotification = deps.showNotification;
  return { ...previous, ...previousStoreDeps };
}

const profileRuntimeDeps: ProfileRuntimeDeps = {
  dispatchProfileSwitched: null,
  invalidateProfileContextCache: null,
  refreshProfileButton: null,
  reloadProfileRuntimeShell: null,
  refreshProfileWearables: null,
};

export function configureProfileRuntimeDeps(deps: Partial<ProfileRuntimeDeps> = {}) {
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

function dispatchProfileSwitched(profileId: string) {
  profileRuntimeDeps.dispatchProfileSwitched?.(profileId);
}

async function invalidateProfileContextCache() {
  await profileRuntimeDeps.invalidateProfileContextCache?.();
}

async function refreshProfileButton() {
  await profileRuntimeDeps.refreshProfileButton?.();
}

async function reloadProfileRuntimeShell(profileId: string) {
  await profileRuntimeDeps.reloadProfileRuntimeShell?.(profileId);
}

const pendingProfileWearableRefreshes = new Map<string, Promise<void>>();

function refreshProfileWearables(profileId: string, biometrics: Biometrics | null | undefined) {
    let pending: Promise<void>;
  try {
    pending = Promise.resolve(
      profileRuntimeDeps.refreshProfileWearables?.(profileId, biometrics),
    ).then(() => undefined, () => undefined);
  } catch {
    pending = Promise.resolve();
  }
  pendingProfileWearableRefreshes.set(profileId, pending);
  void pending.finally(() => {
    if (pendingProfileWearableRefreshes.get(profileId) === pending) {
      pendingProfileWearableRefreshes.delete(profileId);
    }
  });
}

async function waitForProfileWearables(profileId: string) {
  await pendingProfileWearableRefreshes.get(profileId);
}

export function getProfiles(): ProfileRecord[] {
  return getStoredProfiles() as ProfileRecord[];
}

export async function initProfilesCache() {
  await initStoredProfilesCache();
}

export async function saveProfiles(profiles: ProfileRecord[]) {
  await saveStoredProfiles(profiles);
}

export function getActiveProfileId(): string {
  return _normalizeProfileId(localStorage.getItem('labcharts-active-profile')) || 'default';
}

export function setActiveProfileId(id: string) {
  localStorage.setItem('labcharts-active-profile', _normalizeProfileId(id) || 'default');
}

function _normalizeProfileId(id: unknown): string {
  return String(id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 128);
}

export function createDefaultProfileData(): NormalizedProfileData {
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
    markerPlacements: {},
    markerNotes: {},
    markerValueNotes: {},
    biologyScoreAI: {},
    contextSourceSettings: {},
    nutritionContextDays: 30,
    nutritionTargets: null,
    nutritionMeals: [],
    changeHistory: [],
    importSnapshots: [],
    biometrics: null,
    manualValues: {},
    manualMetricTombstones: {},
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

function queueProfileSync(profileId: string, importedData: ProfileData | null = null) {
  queueEligibleProfileSync(profileId, getProfiles(), importedData, profileDeps);
}

export async function loadProfile(profileId: string) {
  const savedImported = await readProfileForLoad(profileId, () => encryptedGetItem(profileStorageKey(profileId, 'imported')), profileDeps.showNotification);
  state.currentProfile = profileId;
  setActiveProfileId(profileId);
  await invalidateProfileContextCache();
  const defaultData = createDefaultProfileData();
  state.importedData = defaultData;
  rememberProfileData(defaultData);
  if (savedImported) {
    try {
      const d = JSON.parse(savedImported);
      if (!d.notes) d.notes = [];
      if (!d.supplements) d.supplements = [];
      state.importedData = migrateProfileData(d);
      rememberProfileData(state.importedData);
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
  state.unitSystem = normalizeUnitProfile(savedUnits);
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
  resetCorrelationSelection();
  await restoreCorrelationWorkspace(profileId);
  state.chatHistory = [];
  state.chatThreads = [];
  state.currentThreadId = null;
  state.markerRegistry = {};
  await reloadProfileRuntimeShell(profileId);
  refreshProfileWearables(profileId, state.importedData?.biometrics);
}

export async function createProfile(name: string, opts: CreateProfileOptions = {}) {
  const id = await mutateProfiles(profiles => {
    let candidate: string;
    do candidate = createUniqueId('p_');
    while (profiles.some(profile => profile.id === candidate));
    const now = Date.now();
    profiles.push({
      id: candidate, name,
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
    return { changed: true, value: candidate };
  });
  if (!opts.skipInitialSync) queueProfileSync(id, createDefaultProfileData());
  return id;
}

/** Apply an edit inside the serialized store; stamp only an existing record. */
function profileEdit(profileId: string, edit: (profile: StoredProfileRecord) => void) {
  return (profiles: StoredProfileRecord[]) => {
    const profile = profiles.find(candidate => candidate.id === profileId);
    if (!profile) return { changed: false, value: false };
    edit(profile);
    profile.lastUpdated = Date.now();
    return { changed: true, value: true };
  };
}

export async function renameProfile(profileId: string, newName: string) {
  const changed = await mutateProfiles(profileEdit(profileId, profile => {
    profile.name = newName;
  }));
  if (changed) queueProfileSync(profileId);
  return changed;
}

export async function updateProfileMeta(profileId: string, updates: ProfileMetaUpdates) {
  const changed = await mutateProfiles(profileEdit(profileId, profile => {
    for (const [key, val] of Object.entries(updates)) {
      if (key === 'id' || key === 'createdAt') continue;
      profile[key] = val;
    }
  }));
  if (changed) queueProfileSync(profileId);
  return changed;
}

export function getAllTags() {
  const tags = new Set<string>();
  for (const p of getProfiles()) {
    if (Array.isArray(p.tags)) p.tags.forEach(t => tags.add(t));
  }
  return [...tags].sort();
}

export function touchProfileTimestamp(profileId: string) {
  return mutateProfiles(profiles => {
    const profile = profiles.find(candidate => candidate.id === profileId);
    if (!profile) return { changed: false, value: false };
    profile.lastUpdated = Date.now();
    return { changed: true, value: true };
  });
}

export async function deleteProfile(profileId: string, onComplete?: () => void) {
  const profiles = getProfiles();
  if (profiles.length <= 1) { profileDeps.showNotification("Cannot delete the last profile", "error"); return; }
  if (await profileDeps.showConfirmDialog('Delete this profile and all its data? This cannot be undone.')) {
    const updated = profiles.filter(p => p.id !== profileId);
    // Persist the user's decision before any async cleanup. If the relay is
    // unavailable, the next pull will retry the tombstone instead of accepting
    // an old live row and recreating the deleted profile.
    markLocalProfileDeleteIntent(profileId, isDemoProfileId(profileId, profiles) ? 'local-demo' : 'local');
    try {
      await clearProfileStorage(profileId);
    } catch (error) {
      clearLocalProfileDeleteIntent(profileId);
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
    await Promise.resolve(profileDeps.deleteProfileFromRelay(profileId)).catch(() => {});
    if (state.currentProfile === profileId) {
      await loadProfile(updated[0]!.id);
    } else {
      await refreshProfileButton();
    }
    profileDeps.showNotification('Profile deleted', 'info');
    if (onComplete) onComplete();
  }
}

export async function switchProfile(profileId: string) {
  if (profileId === state.currentProfile) return;
  // loadProfile is async (encryptedGetItem awaits IDB / OPFS). Earlier
  // draft fired-and-forgot it, leaving switchProfile resolving before
  // state.importedData was actually populated — callers like loadDemoData
  // could then race the import against the still-running profile load
  // and end up with the demo data saved to the WRONG profile id, or
  // overwritten when the (delayed) loadProfile finally read the empty
  // localStorage row for the new profile.
  await loadProfile(profileId);
  // loadProfile keeps the ordinary app-shell refresh non-blocking, but a
  // caller explicitly awaiting a profile switch needs a stable imported-data
  // snapshot. Otherwise the old background wearable refresh can finish after
  // an immediate import and replace its wearable summary.
  await waitForProfileWearables(profileId);
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  profileDeps.showNotification(`Switched to ${p ? p.name : 'profile'}`, 'info');
  // Modules with per-profile module-singleton state (sun.js region map cache,
  // overlay cache, tick counters, in-flight rehydrate flag) listen for this
  // event so their caches don't bleed across profiles after a switch.
  dispatchProfileSwitched(profileId);
  // Push updated context to messenger gateway so bots see the new profile
  Promise.resolve(profileDeps.pushContextToGateway()).catch(() => {});
}

export function getProfileSex(profileId: string) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  return (p && p.sex) || null;
}

export async function setProfileSex(profileId: string, sex: string | null) {
  const changed = await mutateProfiles(profileEdit(profileId, profile => {
    profile.sex = sex;
  }));
  if (changed) queueProfileSync(profileId);
  return changed;
}

export function getProfileDob(profileId: string) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  return (p && p.dob) || null;
}

export async function setProfileDob(profileId: string, dob: string | null | undefined) {
  const changed = await mutateProfiles(profileEdit(profileId, profile => {
    profile.dob = dob || null;
  }));
  if (changed) queueProfileSync(profileId);
  return changed;
}

export function getProfileLocation(profileId?: string): ProfileLocation {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === (profileId || state.currentProfile));
  return (p && p.location) || { country: '', zip: '' };
}

export async function setProfileLocation(profileId: string, country: string, zip: string) {
  const resolvedProfileId = profileId || state.currentProfile;
  const changed = await mutateProfiles(profileEdit(resolvedProfileId, profile => {
    profile.location = { country: (country || '').trim(), zip: (zip || '').trim() };
  }));
  if (changed) queueProfileSync(resolvedProfileId);
  return changed;
}

export function getProfileHeight(profileId?: string) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === (profileId || state.currentProfile));
  return { height: (p && p.height) || null, unit: (p && p.heightUnit) || 'cm' };
}

export async function setProfileHeight(profileId: string, height: number | string | null, unit?: string) {
  const resolvedProfileId = profileId || state.currentProfile;
  const changed = await mutateProfiles(profileEdit(resolvedProfileId, profile => {
    profile.height = height;
    profile.heightUnit = unit || 'cm';
  }));
  if (changed) queueProfileSync(resolvedProfileId);
  return changed;
}

// Privacy-rounded home-area resolution; the legacy export name is retained.
export function getLocationCache(): Record<string, LocationCacheEntry | number> { try { return JSON.parse(localStorage.getItem('labcharts-location-cache') || '{}'); } catch(e) { return {}; } }
export function setLocationCache(key: string, value: LocationCacheEntry | number) { var c = getLocationCache(); c[key] = value; try { localStorage.setItem('labcharts-location-cache', JSON.stringify(c)); } catch(e) {} }

function cachedLatitude(value: unknown) {
  if (Number.isFinite(value)) return Number(value);
  const latitude = Number((value as LocationCacheEntry | undefined)?.lat ?? (value as LocationCacheEntry | undefined)?.latitude);
  return Number.isFinite(latitude) ? latitude : null;
}

export function getResolvedProfileCoords(optCountry?: string, optZip?: string) {
  const loc = getProfileLocation();
  const country = (optCountry !== undefined ? optCountry : loc.country || '').trim();
  const zip = (optZip !== undefined ? optZip : loc.zip || '').trim();
  if (!country || !zip) return null;
  const cached = getLocationCache()[`${country}|${zip}`.toLowerCase()] as LocationCacheEntry | undefined;
  const lat = cachedLatitude(cached);
  const lon = Number(cached?.lon ?? cached?.longitude);
  if (lat == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    accuracyKm: Number.isFinite(Number(cached?.accuracyKm)) ? Number(cached!.accuracyKm) : null,
    timezone: typeof cached?.timezone === 'string' ? cached.timezone : null,
    label: typeof cached?.label === 'string' ? cached.label : '',
    resolvedAt: Number.isFinite(Number(cached?.resolvedAt)) ? Number(cached!.resolvedAt) : null,
    source: 'home-postal',
  };
}
export function latitudeToBand(lat: number) { var a = Math.abs(lat); if (a < 25) return 0; if (a < 40) return 1; if (a < 50) return 2; if (a < 60) return 3; return 4; }

export async function detectLatitudeWithAI(country: string, zip: string) {
  var cacheKey = (country + '|' + zip).toLowerCase();
  const cached = getLocationCache()[cacheKey] as LocationCacheEntry | undefined;
  if (cached && typeof cached === 'object'
      && Number.isFinite(Number(cached.lat ?? cached.latitude))
      && Number.isFinite(Number(cached.lon ?? cached.longitude))) return;
  if (!String(country || '').trim() || !String(zip || '').trim()) return;
  if (isOfficialGetbasedHost()) return;
  try {
    const response = await profileDeps.fetchImpl(getProxyApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meteo: 'postal_geocode',
        country: String(country).trim(),
        postalCode: String(zip).trim(),
      }),
    });
    if (!response.ok) return;
    const resolved = await response.json();
    const lat = Number(resolved?.latitude);
    const lon = Number(resolved?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      setLocationCache(cacheKey, {
        lat,
        lon,
        accuracyKm: Number.isFinite(Number(resolved?.accuracyKm)) ? Number(resolved.accuracyKm) : 11,
        timezone: typeof resolved?.timezone === 'string' ? resolved.timezone : null,
        label: typeof resolved?.label === 'string' ? resolved.label : '',
        source: 'postal-area',
        resolvedAt: Number.isFinite(Number(resolved?.resolvedAt)) ? Number(resolved.resolvedAt) : Date.now(),
      });
      var el = document.getElementById('loc-lat-display');
      if (el) {
        var band = latitudeToBand(lat);
        el.style.color = 'var(--green)';
        el.textContent = '\u2713 ' + Math.abs(Math.round(lat)) + '\u00b0' + (lat >= 0 ? 'N' : 'S') + ' \u2014 ' + LATITUDE_BANDS[band]!;
      }
    }
  } catch(e) {
    if (profileDeps.isDebugMode()) console.warn('[Location] postal-area resolution failed:', e);
  }
}

export function getLatitudeFromLocation(optCountry?: string, optZip?: string): string | null {
  const loc = getProfileLocation();
  const country = optCountry !== undefined ? optCountry : loc.country;
  if (!country) return null;
  const c = country.toLowerCase().trim();
  const zip = (optZip !== undefined ? optZip : loc.zip || '').trim();

  var cacheKey = (c + '|' + zip).toLowerCase();
  var aiCached = cachedLatitude(getLocationCache()[cacheKey]);
  if (aiCached !== null) return LATITUDE_BANDS[latitudeToBand(aiCached)]!;

  var zn = zip.replace(/\s/g, '');
  if (zn && (c === 'usa' || c === 'us' || c === 'united states' || c === 'america')) {
    var p3 = zn.substring(0, 3);
    if (p3 >= '006' && p3 <= '009') return LATITUDE_BANDS[0]!; // PR/VI → tropical
    if (p3 >= '967' && p3 <= '968') return LATITUDE_BANDS[0]!; // Hawaii → tropical
    if (p3 >= '995') return LATITUDE_BANDS[4]!; // Alaska → subarctic
    var d = zn.charAt(0);
    var usb: Record<string, number> = { '0':2, '1':2, '2':2, '3':1, '4':2, '5':2, '6':2, '7':1, '8':2, '9':2 };
    if (usb[d] !== undefined) return LATITUDE_BANDS[usb[d]!]!;
  }

  if (zn && (c === 'canada' || c === 'ca')) {
    var letter = zn.charAt(0).toUpperCase();
    var cab: Record<string, number> = { 'A':3,'B':2,'C':2,'E':2, 'G':2,'H':2,'J':2,'K':2,'L':2,'M':2,'N':2, 'P':3,'R':3,'S':3,'T':3, 'V':2, 'X':4,'Y':4 };
    if (cab[letter] !== undefined) return LATITUDE_BANDS[cab[letter]!]!;
  }

  var zd = zn.charAt(0);
  if (zn && (c === 'norway' || c === 'norge')) {
    if (zd >= '0' && zd <= '5') return LATITUDE_BANDS[3]!;
    return LATITUDE_BANDS[4]!;
  }
  if (zn && (c === 'sweden' || c === 'sverige')) {
    if (zd >= '1' && zd <= '6') return LATITUDE_BANDS[3]!;
    if (zd >= '7') return LATITUDE_BANDS[4]!;
  }
  if (zn && (c === 'finland' || c === 'suomi')) {
    var f2 = parseInt(zn.substring(0, 2));
    if (!isNaN(f2)) return LATITUDE_BANDS[f2 < 40 ? 3 : 4]!;
  }
  if (zn && (c === 'germany' || c === 'deutschland')) {
    if (zd >= '7') return LATITUDE_BANDS[2]!;
    return LATITUDE_BANDS[3]!;
  }
  if (zn && (c === 'italy' || c === 'italia')) {
    var i2 = parseInt(zn.substring(0, 2));
    if (!isNaN(i2)) return LATITUDE_BANDS[i2 >= 80 ? 1 : 2]!;
  }
  if (zn && (c === 'spain' || c === 'españa' || c === 'espana')) {
    var s2 = parseInt(zn.substring(0, 2));
    if (!isNaN(s2) && (s2 >= 15 && s2 <= 16 || s2 >= 20 && s2 <= 24 || s2 >= 26 && s2 <= 28 || s2 >= 31 && s2 <= 34 || s2 >= 39 && s2 <= 50)) return LATITUDE_BANDS[2]!;
    return LATITUDE_BANDS[1]!;
  }
  if (zn && (c === 'france')) {
    var fr2 = parseInt(zn.substring(0, 2));
    if (!isNaN(fr2) && (fr2 >= 59 && fr2 <= 62 || fr2 === 80 || fr2 === 2)) return LATITUDE_BANDS[3]!;
    return LATITUDE_BANDS[2]!;
  }
  if (zn && (c === 'russia' || c === 'россия' || c === 'rossiya')) {
    var r3 = parseInt(zn.substring(0, 3));
    if (!isNaN(r3)) {
      if (r3 >= 350 && r3 <= 385) return LATITUDE_BANDS[2]!;
      if (r3 >= 163 && r3 <= 164 || r3 >= 183 && r3 <= 184) return LATITUDE_BANDS[4]!;
    }
    return LATITUDE_BANDS[3]!;
  }
  const band = COUNTRY_LATITUDES[c];
  if (band !== undefined) return LATITUDE_BANDS[band]!;
  for (const [key, val] of Object.entries(COUNTRY_LATITUDES)) {
    if (c.includes(key) || key.includes(c)) return LATITUDE_BANDS[val]!;
  }
  return null;
}
