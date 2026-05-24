// profile.js — Profile CRUD, sex/DOB, location, data migration

import { state } from './state.js';
import { MARKER_SCHEMA, SPECIALTY_MARKER_DEFS } from './schema.js';
import { COUNTRY_LATITUDES, LATITUDE_BANDS } from './constants.js';
import { showNotification } from './utils.js';
import { encryptedSetItem, encryptedGetItem, getEncryptionEnabled, encryptedRemoveItem } from './crypto.js';

// ═══════════════════════════════════════════════
// PROFILE MANAGEMENT
// ═══════════════════════════════════════════════
export function getProfiles() {
  // Read from in-memory cache (populated at init via initProfilesCache)
  if (state.profiles) return state.profiles;
  try { return JSON.parse(localStorage.getItem('labcharts-profiles')) || []; }
  catch(e) { return []; }
}

export async function initProfilesCache() {
  const raw = await encryptedGetItem('labcharts-profiles');
  try { state.profiles = raw ? JSON.parse(raw) : []; }
  catch(e) { state.profiles = []; }
  migrateProfiles(state.profiles);
}

// Backfill new profile-level fields (tags, notes, status, timestamps, pinned)
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

export async function saveProfiles(profiles) {
  state.profiles = profiles;
  try {
    const value = JSON.stringify(profiles);
    if (getEncryptionEnabled()) {
      await encryptedSetItem('labcharts-profiles', value);
    } else {
      localStorage.setItem('labcharts-profiles', value);
    }
  } catch (e) {
    showNotification('Storage limit reached — could not save profile changes.', 'error');
  }
}

export function getActiveProfileId() {
  return localStorage.getItem('labcharts-active-profile') || 'default';
}

export function setActiveProfileId(id) {
  localStorage.setItem('labcharts-active-profile', id);
}

export function profileStorageKey(profileId, suffix) {
  return `labcharts-${profileId}-${suffix}`;
}

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
    customMarkers: {},
    changeHistory: [],
    genetics: null,
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

function queueProfileSync(profileId, importedData = null) {
  if (!profileId) return;
  try {
    if (localStorage.getItem('labcharts-sync-enabled') !== 'true') return;
  } catch {
    return;
  }
  import('./sync.js').then(m => m.onProfileSaved?.(profileId, importedData)).catch(() => {});
}

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
  // Every read site uses Array.isArray() defensively, so this is purely a
  // tidiness fix — but keeps `diag.familyHistory.length` valid without
  // optional chaining everywhere downstream.
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
  // Migrate old lightCircadian format (had practices/timing) → new format (amLight/daytime/uvExposure/evening/cold/grounding/latitude)
  if (data.lightCircadian && data.lightCircadian.timing && !data.lightCircadian.amLight) {
    const old = data.lightCircadian;
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
    for (const [key, def] of Object.entries(data.customMarkers)) {
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
    for (const [key, cm] of Object.entries(data.customMarkers)) {
      if (cm.group === undefined && SPECIALTY_MARKER_DEFS[key]) {
        cm.group = SPECIALTY_MARKER_DEFS[key].group || null;
      }
    }
  }
  // Fix corrupted FA-prefixed standard markers (bug: _normalizeFattyAcidMarkers rewrote blood work to FA categories)
  if (data.customMarkers && data.entries?.length) {
    // Phase 1: relocate markers whose key matches a standard schema marker
    const _stdLookup = {};
    for (const [catKey, cat] of Object.entries(MARKER_SCHEMA)) {
      for (const mk of Object.keys(cat.markers)) _stdLookup[mk] = `${catKey}.${mk}`;
    }
    const toDelete = [];
    for (const [fullKey, def] of Object.entries(data.customMarkers)) {
      const [catKey, markerKey] = fullKey.split('.');
      if (!markerKey || MARKER_SCHEMA[catKey]) continue;
      // Don't relocate legitimate specialty markers that happen to share a name with standard ones
      if (SPECIALTY_MARKER_DEFS[fullKey]) continue;
      const stdKey = _stdLookup[markerKey];
      if (!stdKey) continue;
      for (const entry of data.entries) {
        if (entry.markers?.[fullKey] !== undefined) {
          if (entry.markers[stdKey] === undefined) entry.markers[stdKey] = entry.markers[fullKey];
          delete entry.markers[fullKey];
        }
      }
      toDelete.push(fullKey);
    }
    for (const key of toDelete) delete data.customMarkers[key];
    // Phase 2: clean up remaining FA-prefixed markers from entries that also contain standard blood markers.
    // An entry with both standard markers and FA-prefixed markers = corrupted blood import,
    // UNLESS the FA marker has a valid customMarker definition (legitimate FA test on same date).
    const _stdCats = new Set(Object.keys(MARKER_SCHEMA));
    for (const entry of data.entries) {
      if (!entry.markers) continue;
      const keys = Object.keys(entry.markers);
      const hasStandard = keys.some(k => _stdCats.has(k.split('.')[0]));
      if (!hasStandard) continue;
      for (const key of keys) {
        const catKey = key.split('.')[0];
        if (!_stdCats.has(catKey) && !SPECIALTY_MARKER_DEFS[key] && (catKey.endsWith('FA') || catKey === 'fattyAcidsTest')) {
          // Keep markers that have a valid custom marker definition (legitimate FA import)
          if (data.customMarkers?.[key]) continue;
          delete entry.markers[key];
        }
      }
    }
    // Phase 3: remove orphaned customMarkers (no values left in any entry)
    for (const fullKey of Object.keys(data.customMarkers)) {
      const catKey = fullKey.split('.')[0];
      if (MARKER_SCHEMA[catKey] || SPECIALTY_MARKER_DEFS[fullKey]) continue;
      if (!(catKey.endsWith('FA') || catKey === 'fattyAcidsTest')) continue;
      const hasValues = data.entries.some(e => e.markers?.[fullKey] !== undefined);
      if (!hasValues) delete data.customMarkers[fullKey];
    }
  }
  // Backfill insulin mirror: sync hormones.insulin ↔ diabetes.insulin_d — v1.6.1
  if (data.entries) {
    for (const entry of data.entries) {
      if (!entry.markers) continue;
      if (entry.markers['hormones.insulin'] !== undefined && entry.markers['diabetes.insulin_d'] === undefined) {
        entry.markers['diabetes.insulin_d'] = entry.markers['hormones.insulin'];
      }
      if (entry.markers['diabetes.insulin_d'] !== undefined && entry.markers['hormones.insulin'] === undefined) {
        entry.markers['hormones.insulin'] = entry.markers['diabetes.insulin_d'];
      }
    }
  }
  // Migrate trombocrit/plateletcrit custom markers → hematology.pct — v1.6.1
  if (data.entries && data.customMarkers) {
    const pctAliases = Object.keys(data.customMarkers).filter(k =>
      /tromb|plateletcrit|thrombocrit/i.test(k) && k !== 'hematology.pct'
    );
    for (const oldKey of pctAliases) {
      for (const entry of data.entries) {
        if (entry.markers?.[oldKey] != null && entry.markers['hematology.pct'] == null) {
          entry.markers['hematology.pct'] = entry.markers[oldKey];
        }
        delete entry.markers?.[oldKey];
      }
      delete data.customMarkers[oldKey];
    }
  }
  // Migrate hematocrit from fraction (0.45) to percentage (45%) — v1.6.1
  if (data.entries) {
    for (const entry of data.entries) {
      const hct = entry.markers?.['hematology.hematocrit'];
      if (hct != null && hct < 1) {
        entry.markers['hematology.hematocrit'] = parseFloat((hct * 100).toFixed(1));
      }
    }
  }
  // Migrate hematocrit refOverrides from fraction to percentage
  if (data.refOverrides?.['hematology.hematocrit']) {
    const ovr = data.refOverrides['hematology.hematocrit'];
    if (ovr.refMin != null && ovr.refMin < 1) ovr.refMin = parseFloat((ovr.refMin * 100).toFixed(1));
    if (ovr.refMax != null && ovr.refMax < 1) ovr.refMax = parseFloat((ovr.refMax * 100).toFixed(1));
    if (ovr.optimalMin != null && ovr.optimalMin < 1) ovr.optimalMin = parseFloat((ovr.optimalMin * 100).toFixed(1));
    if (ovr.optimalMax != null && ovr.optimalMax < 1) ovr.optimalMax = parseFloat((ovr.optimalMax * 100).toFixed(1));
  }
  // Initialize new fields if missing
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
  if (data.changeHistory === undefined) data.changeHistory = [];
  if (data.biometrics === undefined) data.biometrics = null;
  // Light lens (v1.7+): sun sessions, light devices, light environment, on-device measurements
  if (data.sunSessions === undefined) data.sunSessions = [];
  if (data.deviceSessions === undefined) data.deviceSessions = [];
  if (data.lightDevices === undefined) data.lightDevices = [];
  if (data.lightEnvironment === undefined) data.lightEnvironment = null;
  if (data.lightMeasurements === undefined) data.lightMeasurements = [];
  if (data.lightAudits === undefined) data.lightAudits = [];
  if (data.sunCorrelations === undefined) data.sunCorrelations = null;
  if (data.lifelightProfile === undefined) data.lifelightProfile = null;
  if (data.sunDefaults === undefined) data.sunDefaults = null;
  // Migration — sunDefaults.location → sunDefaults.coords. Earlier demo
  // imports + a brief window of the v1.6.55 demo upgrade wrote the
  // location under `.location`, but getSunCoords() (sun.js:2329) reads
  // `.coords`. Self-heal so the conditions strip + session start dialog
  // see the location without a re-import.
  if (data.sunDefaults && data.sunDefaults.location && !data.sunDefaults.coords) {
    const { lat, lon, label } = data.sunDefaults.location;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      data.sunDefaults.coords = { lat, lon, source: 'profile-precise', ...(label ? { label } : {}) };
    }
    delete data.sunDefaults.location;
  }
  return data;
}

export async function loadProfile(profileId) {
  state.currentProfile = profileId;
  setActiveProfileId(profileId);
  const savedImported = await encryptedGetItem(profileStorageKey(profileId, 'imported'));
  const defaultData = createDefaultProfileData();
  state.importedData = savedImported ? (function() {
    try {
      const d = JSON.parse(savedImported);
      if (!d.notes) d.notes = [];
      if (!d.supplements) d.supplements = [];
      return migrateProfileData(d);
    } catch (e) {
      // Don't silently substitute defaults — preserve the corrupted bytes so
      // the user can recover (or we can debug). Same key suffix every time
      // so a second corruption doesn't shadow the first recoverable copy.
      // Route through IDB when the blob is large (the very condition that
      // commonly triggers the corruption); fall back to localStorage otherwise.
      // Fire-and-forget — the IIFE this catch lives in is sync, so we kick
      // the IDB write off via Promise chain rather than awaiting it here.
      try {
        const corruptKey = profileStorageKey(profileId, 'imported-corrupt');
        if (!localStorage.getItem(corruptKey)) {
          if (savedImported.length < 4_000_000) {
            try { localStorage.setItem(corruptKey, savedImported); }
            catch { /* fall through to IDB */ }
          }
          import('./blob-storage.js').then(async ({ setBlob, getBlob }) => {
            const existing = await getBlob(corruptKey).catch(() => null);
            if (!existing) await setBlob(corruptKey, savedImported);
          }).catch(() => {});
        }
      } catch {}
      // Surface to the user via the global notification system if available;
      // fall back to console so headless paths still log it.
      if (typeof window !== 'undefined' && window.showNotification) {
        window.showNotification('Profile data was corrupted and could not be loaded. The original bytes were saved as a backup — open Settings → Data to export them or contact support.', 'error', 12000);
      } else {
        console.error('[loadProfile] corrupted JSON for', profileId, '— saved to imported-corrupt');
      }
      return defaultData;
    }
  })() : defaultData;
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
  window.loadChatPersonality();
  window.loadChatThreads?.();
  if (state.chatThreads.length > 0) window.ensureActiveThread?.();
  await window.loadChatHistory?.();
  if (state.currentProfile !== profileId) return;
  window.renderThreadList?.();
  window.updateChatHeaderTitle?.();
  window.updatePersonalityBar?.();
  window.updateDiscussButton?.();
  window.destroyAllCharts();
  window.buildSidebar();
  window.navigate(window.getInitialView?.() || 'dashboard');
  window.updateHeaderDates();
  window.updateHeaderRangeToggle();
  window.renderProfileButton();
  // Refresh wearable summary for the freshly-loaded profile so the strip
  // reflects THIS profile's L1 IDB rather than carrying over stale state
  // from the boot profile. Both modules dynamic-imported to avoid circular
  // deps (profile.js → wearables-* → profile.js for getActiveProfileId).
  // Migration runs first (idempotent — it self-flag-gates after one run per
  // profile), then summary recomputes from this profile's IDB.
  Promise.all([
    import('./wearables-manual.js'),
    import('./wearables-summary.js'),
    import('./wearables-connect.js'),
  ]).then(async ([manualMod, summaryMod, connectMod]) => {
    try { await manualMod.migrateBiometricsToManual(profileId, state.importedData?.biometrics); } catch {}
    // Profile-switch race guard: the user can swap profile A→B during the
    // ~100ms cold-cache IDB read window. If that happens, abort BEFORE
    // syncWearableSummary persists A's metrics into B's wearableSummary
    // and saves them under B's localStorage key. Same shape as the
    // v1.24.1 OAuth-callback profile-swap guard.
    if (state.currentProfile !== profileId) return;
    try { await summaryMod.syncWearableSummary(profileId, connectMod.listConnectedSources()); } catch {}
    if (state.currentProfile !== profileId) return; // re-check post-await — sync also takes IDB time
  }).catch(() => {});
}

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
  queueProfileSync(id, createDefaultProfileData());
  return id;
}

export function renameProfile(profileId, newName) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  if (p) { p.name = newName; p.lastUpdated = Date.now(); saveProfiles(profiles); queueProfileSync(profileId); }
}

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

export function getAllTags() {
  const tags = new Set();
  for (const p of getProfiles()) {
    if (Array.isArray(p.tags)) p.tags.forEach(t => tags.add(t));
  }
  return [...tags].sort();
}

export function touchProfileTimestamp(profileId) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  if (p) { p.lastUpdated = Date.now(); saveProfiles(profiles); }
}

export async function deleteProfile(profileId, onComplete) {
  const profiles = getProfiles();
  if (profiles.length <= 1) { showNotification("Cannot delete the last profile", "error"); return; }
  if (await window.showConfirmDialog('Delete this profile and all its data? This cannot be undone.')) {
    const updated = profiles.filter(p => p.id !== profileId);
    saveProfiles(updated);
    // The `-imported` blob lives in IndexedDB now → encryptedRemoveItem
    // hits both backends so the IDB residue is also wiped.
    await encryptedRemoveItem(profileStorageKey(profileId, 'imported'));
    localStorage.removeItem(profileStorageKey(profileId, 'units'));
    localStorage.removeItem(profileStorageKey(profileId, 'suppOverlay'));
    localStorage.removeItem(profileStorageKey(profileId, 'noteOverlay'));
    localStorage.removeItem(profileStorageKey(profileId, 'rangeMode'));
    localStorage.removeItem(profileStorageKey(profileId, 'showAltUnits'));
    localStorage.removeItem(profileStorageKey(profileId, 'suppImpact'));
    localStorage.removeItem(`labcharts-${profileId}-chat`);
    // Remove thread index + all per-thread message keys
    const threadIndexRaw = localStorage.getItem(`labcharts-${profileId}-chat-threads`);
    if (threadIndexRaw) {
      try {
        const threads = JSON.parse(threadIndexRaw);
        for (const t of threads) {
          localStorage.removeItem(`labcharts-${profileId}-chat-t_${t.id}`);
        }
      } catch {}
      localStorage.removeItem(`labcharts-${profileId}-chat-threads`);
    }
    localStorage.removeItem(`labcharts-${profileId}-chatRailOpen`);
    localStorage.removeItem(`labcharts-${profileId}-chatPersonality`);
    localStorage.removeItem(`labcharts-${profileId}-chatPersonalityCustom`);
    localStorage.removeItem(`labcharts-${profileId}-focusCard`);
    localStorage.removeItem(`labcharts-${profileId}-contextHealth`);
    localStorage.removeItem(`labcharts-${profileId}-onboarded`);
    localStorage.removeItem(`labcharts-${profileId}-emptyTour`);
    localStorage.removeItem(`labcharts-${profileId}-tour`);
    localStorage.removeItem(`labcharts-${profileId}-cycleTour`);
    localStorage.removeItem(`labcharts-${profileId}-phaseOverlay`);
    // Wearable per-profile IDB (`labcharts-wearables-${profileId}`) lives
    // outside localStorage. Drop it too so deleted profiles don't leak 90d
    // of HRV/sleep/RHR + manual entries onto disk indefinitely.
    import('./wearables-store.js').then(m => m.deleteWearablesDB(profileId)).catch(() => {});
    // Propagate the delete to the relay so other devices stop seeing this
    // profile. Without this, a paired device pulling later would resurrect
    // the profile (the Evolu row's dataJson outlives our local wipe).
    // Soft-delete via Evolu's isDeleted column — the query filter drops
    // tombstoned rows; CRDT LWW handles cross-device conflict resolution.
    import('./sync.js').then(m => m.deleteProfileFromRelay(profileId)).catch(() => {});
    if (state.currentProfile === profileId) {
      loadProfile(updated[0].id);
    } else {
      window.renderProfileButton();
    }
    showNotification('Profile deleted', 'info');
    if (onComplete) onComplete();
  }
}

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
  showNotification(`Switched to ${p ? p.name : 'profile'}`, 'info');
  // Modules with per-profile module-singleton state (sun.js region map cache,
  // overlay cache, tick counters, in-flight rehydrate flag) listen for this
  // event so their caches don't bleed across profiles after a switch.
  if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
    try { window.dispatchEvent(new CustomEvent('labcharts-profile-switched', { detail: { profileId } })); } catch (_) {}
  }
  // Push updated context to messenger gateway so bots see the new profile
  import('./sync.js').then(m => m.pushContextToGateway()).catch(() => {});
}

export function getProfileSex(profileId) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  return (p && p.sex) || null;
}

export function setProfileSex(profileId, sex) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  if (p) { p.sex = sex; saveProfiles(profiles); queueProfileSync(profileId); }
}

export function getProfileDob(profileId) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  return (p && p.dob) || null;
}

export function setProfileDob(profileId, dob) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === profileId);
  if (p) { p.dob = dob || null; saveProfiles(profiles); queueProfileSync(profileId); }
}

export function getProfileLocation(profileId) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === (profileId || state.currentProfile));
  return (p && p.location) || { country: '', zip: '' };
}

export function setProfileLocation(profileId, country, zip) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === (profileId || state.currentProfile));
  if (p) {
    p.location = { country: (country || '').trim(), zip: (zip || '').trim() };
    saveProfiles(profiles);
    queueProfileSync(p.id);
  }
}

export function getProfileHeight(profileId) {
  const profiles = getProfiles();
  const p = profiles.find(p => p.id === (profileId || state.currentProfile));
  return { height: (p && p.height) || null, unit: (p && p.heightUnit) || 'cm' };
}

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
export function getLocationCache() { try { return JSON.parse(localStorage.getItem('labcharts-location-cache') || '{}'); } catch(e) { return {}; } }
export function setLocationCache(key, lat) { var c = getLocationCache(); c[key] = lat; try { localStorage.setItem('labcharts-location-cache', JSON.stringify(c)); } catch(e) {} }
export function latitudeToBand(lat) { var a = Math.abs(lat); if (a < 25) return 0; if (a < 40) return 1; if (a < 50) return 2; if (a < 60) return 3; return 4; }

export async function detectLatitudeWithAI(country, zip) {
  var cacheKey = (country + '|' + zip).toLowerCase();
  if (getLocationCache()[cacheKey] !== undefined) return;
  try {
    var locationStr = zip ? country + ' ' + zip : country;
    var { text: response } = await window.callClaudeAPI({
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
    if (window.isDebugMode()) console.warn('[Location] AI detection failed:', e);
  }
}

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

Object.assign(window, {
  profileStorageKey,
  getProfiles,
  saveProfiles,
  initProfilesCache,
  createDefaultProfileData,
  createProfile,
  deleteProfile,
  renameProfile,
  switchProfile,
  migrateProfileData,
  getProfileSex,
  setProfileSex,
  getProfileDob,
  setProfileDob,
  getProfileLocation,
  setProfileLocation,
  getProfileHeight,
  setProfileHeight,
  getLocationCache,
  latitudeToBand,
  getLatitudeFromLocation,
  updateProfileMeta,
  getAllTags,
  touchProfileTimestamp,
  loadProfile,
  getActiveProfileId,
  setActiveProfileId,
  detectLatitudeWithAI,
});
