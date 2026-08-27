// @ts-check
// export.js — JSON export/import, report facade, clear all data

import { getErrorMessage } from './caught-error.js';
import { migrateCustomMarkerIdentities } from './custom-marker-identity.js';
import { migrateMarkerPlacements } from './marker-placement.js';
import { state } from './state.js';
import { showNotification, showConfirmDialog } from './utils.js';
import {
  filterDatesByRange,
  getActiveData,
  invalidateActiveDataCache,
  saveImportedData,
  updateHeaderDates,
} from './data.js';
import {
  createDefaultProfileData,
  createProfile,
  getProfiles,
  migrateProfileData,
  profileStorageKey,
  saveProfiles,
  switchProfile,
} from './profile.js';
import { encryptedGetItem, encryptedRemoveItem } from './crypto.js';
import { clearProfileStorage, listStoredProfileIds } from './profile-storage-cleanup.js';
import { findOrCreateLabEntry } from './lab-entry-mutations.js';
import { setLabEntryMarker } from './lab-entry.js';
import { getSelectedNodeUrl } from './nostr-discovery.js';
import { addDemoNutrition } from './demo-nutrition.js';
import {
  generateReportAISummary as generateReportAISummaryImpl,
} from './export-report.js';
import {
  buildReportHTML as buildReportHTMLImpl,
  exportPDFReport as exportPDFReportImpl,
} from './export-report-html.js';
import {
  clearDemoLoadingProfile,
  destroyWalletRuntimeDB,
  markDemoLoadingProfile,
  refreshImportRuntimeShell,
} from './export-runtime.js';

/** @typedef {typeof import('./export-import.js')} ExportImportModule */
/** @type {Promise<ExportImportModule> | null} */
let exportImportModulePromise = null;
/** @type {ExportImportModule | null} */
let exportImportModule = null;
let useExportImportRetryUrl = false;
/** @typedef {typeof import('./export-report-builder.js')} ReportBuilderModule */
/** @type {Promise<ReportBuilderModule> | null} */
let reportBuilderModulePromise = null;
/** @type {ReportBuilderModule | null} */
let reportBuilderModule = null;
let useReportBuilderRetryUrl = false;

async function buildProfileNutritionArchive(profileId) {
  const { buildNutritionArchive } = await import('./nutrition-store.js');
  return buildNutritionArchive(profileId);
}

export function isExportImportModuleLoaded() {
  return exportImportModule !== null;
}

/** @returns {Promise<ExportImportModule>} */
function loadExportImportRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./export-import.js?lazy-retry=1');
}

/** @returns {Promise<ExportImportModule>} */
export function loadExportImportModule() {
  if (!exportImportModulePromise) {
    // Failed module-map fetches are cached; retry once with a second fixed URL.
    const load = useExportImportRetryUrl
      ? loadExportImportRetryModule()
      : import('./export-import.js');
    exportImportModulePromise = load
      .then(module => (exportImportModule = module))
      .catch(err => {
        exportImportModulePromise = null;
        exportImportModule = null;
        useExportImportRetryUrl = true;
        throw err;
      });
  }
  return exportImportModulePromise;
}

/** @param {File} file */
export async function importDataJSON(file) {
  try {
    const module = exportImportModule || await loadExportImportModule();
    return await module.importDataJSON(file);
  } catch (err) {
    console.error('[export] Could not load the JSON import flow:', err);
    showNotification('JSON import could not be loaded. Try again.', 'error');
    return undefined;
  }
}

export function isReportBuilderModuleLoaded() {
  return reportBuilderModule !== null;
}

/** @returns {Promise<ReportBuilderModule>} */
function loadReportBuilderRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./export-report-builder.js?lazy-retry=1');
}

/** @returns {Promise<ReportBuilderModule>} */
export function loadReportBuilderModule() {
  if (!reportBuilderModulePromise) {
    const load = useReportBuilderRetryUrl
      ? loadReportBuilderRetryModule()
      : import('./export-report-builder.js');
    reportBuilderModulePromise = load
      .then(module => (reportBuilderModule = module))
      .catch(err => {
        reportBuilderModulePromise = null;
        reportBuilderModule = null;
        useReportBuilderRetryUrl = true;
        throw err;
      });
  }
  return reportBuilderModulePromise;
}

/** @param {unknown} err */
function reportReportBuilderLoadError(err) {
  console.error('[export] Could not load the report builder:', err);
  showNotification('Report builder could not be loaded. Try again.', 'error');
  return false;
}

/** @type {{
 *   buildSidebar: null | (() => void),
 *   navigate: null | ((route?: string) => void),
 * }} */
const exportRuntimeDeps = {
  buildSidebar: null,
  navigate: null,
};

/** @param {Partial<typeof exportRuntimeDeps>} [deps] */
export function configureExportRuntimeDeps(deps = {}) {
  const previous = { ...exportRuntimeDeps };
  if (Object.hasOwn(deps, 'buildSidebar') && (deps.buildSidebar === null || typeof deps.buildSidebar === 'function')) {
    exportRuntimeDeps.buildSidebar = deps.buildSidebar;
  }
  if (Object.hasOwn(deps, 'navigate') && (deps.navigate === null || typeof deps.navigate === 'function')) {
    exportRuntimeDeps.navigate = deps.navigate;
  }
  return previous;
}

// ═══════════════════════════════════════════════
// PDF REPORT EXPORT FACADE
// ═══════════════════════════════════════════════
export async function generateReportAISummary(options = {}) {
  return generateReportAISummaryImpl(options);
}

export function exportPDFReport(options = {}) {
  return exportPDFReportImpl(options);
}

export function buildReportHTML(profileName, sexLabel, data, flags, notes, supps, contextSections, options = {}) {
  return buildReportHTMLImpl(profileName, sexLabel, data, flags, notes, supps, contextSections, options);
}

export function openReportBuilder(presetId) {
  try {
    if (reportBuilderModule) return reportBuilderModule.openReportBuilder(presetId);
    return loadReportBuilderModule()
      .then(module => module.openReportBuilder(presetId))
      .catch(reportReportBuilderLoadError);
  } catch (err) {
    return reportReportBuilderLoadError(err);
  }
}

export function closeReportBuilder() {
  if (!reportBuilderModule) return undefined;
  try {
    return reportBuilderModule.closeReportBuilder();
  } catch (err) {
    console.error('[export] Could not close the report builder:', err);
    return undefined;
  }
}

// ═══════════════════════════════════════════════
// JSON EXPORT / IMPORT
// ═══════════════════════════════════════════════
// CHAT EXPORT/IMPORT HELPERS
// ═══════════════════════════════════════════════
async function _exportChatData(profileId) {
  const threadsRaw = await encryptedGetItem(`labcharts-${profileId}-chat-threads`);
  let threads;
  try { threads = threadsRaw ? JSON.parse(threadsRaw) : []; } catch { threads = []; }
  const messages = {};
  for (const t of threads) {
    const raw = await encryptedGetItem(`labcharts-${profileId}-chat-t_${t.id}`);
    try { messages[t.id] = raw ? JSON.parse(raw) : []; } catch { messages[t.id] = []; }
  }
  const personality = localStorage.getItem(`labcharts-${profileId}-chatPersonality`) || null;
  const customRaw = await encryptedGetItem(`labcharts-${profileId}-chatPersonalityCustom`);
  const customDeletedRaw = await encryptedGetItem(`labcharts-${profileId}-chatPersonalityDeleted`);
  let customPersonalities;
  let customPersonalityDeleted;
  try { customPersonalities = customRaw ? JSON.parse(customRaw) : null; } catch { customPersonalities = null; }
  try { customPersonalityDeleted = customDeletedRaw ? JSON.parse(customDeletedRaw) : null; } catch { customPersonalityDeleted = null; }
  if (!threads.length && !customPersonalities?.length && !Object.keys(customPersonalityDeleted || {}).length) return null;
  return { threads, messages, personality, customPersonalities, customPersonalityDeleted };
}

// ═══════════════════════════════════════════════
// Legacy alias — calls exportClientJSON for the active profile
/**
 * @typedef {Object} ClientExportProfile
 * @property {string} name
 * @property {string | null} sex
 * @property {string | null} dob
 * @property {unknown} location
 * @property {string[]} tags
 * @property {string} notes
 * @property {string} status
 * @property {string | null} avatar
 * @property {boolean} pinned
 * @property {number | string | null} height
 * @property {string} heightUnit
 */

/**
 * @typedef {Object} ClientExportObject
 * @property {number} version
 * @property {string} exportedAt
 * @property {ClientExportProfile} profile
 * @property {Array<Object.<string, unknown>>} entries
 * @property {Array<Object.<string, unknown>>} notes
 * @property {Array<Object.<string, unknown>>} supplements
 * @property {unknown} diagnoses
 * @property {unknown} diet
 * @property {unknown} exercise
 * @property {unknown} sleepRest
 * @property {unknown} lightCircadian
 * @property {unknown} stress
 * @property {unknown} loveLife
 * @property {unknown} environment
 * @property {string} interpretiveLens
 * @property {string} contextNotes
 * @property {Array<unknown>} healthGoals
 * @property {Object.<string, unknown>} customMarkers
 * @property {Object.<string, unknown>} markerPlacements
 * @property {Object.<string, unknown>} refOverrides
 * @property {unknown} categoryLabels
 * @property {unknown} categoryIcons
 * @property {unknown} markerLabels
 * @property {unknown} menstrualCycle
 * @property {unknown} emfAssessment
 * @property {unknown} genetics
 * @property {unknown} biometrics
 * @property {Object.<string, unknown>} markerNotes
 * @property {Object.<string, unknown>} markerValueNotes
 * @property {Object.<string, unknown>} manualValues
 * @property {Object.<string, number>} manualMetricTombstones
 * @property {Array<unknown>} changeHistory
 * @property {Array<unknown>} chatSummaries
 * @property {unknown} wearableSummary
 * @property {unknown} wearableCardOrder
 * @property {unknown} wearablePrimaryOverride
 * @property {Array<unknown>} sunSessions
 * @property {Array<unknown>} deviceSessions
 * @property {Array<unknown>} lightDevices
 * @property {Array<unknown>} lightAudits
 * @property {Array<unknown>} lightMeasurements
 * @property {unknown} lightEnvironment
 * @property {unknown} sunDefaults
 * @property {unknown} sunCorrelations
 * @property {unknown} lifelightProfile
 * @property {unknown} lightDailyVerdicts
 * @property {unknown} channelMixAI
 * @property {unknown} biologyScoreContextAI
 * @property {Object.<string, boolean>} contextSourceSettings
 * @property {7|30|90} nutritionContextDays
 * @property {unknown} nutritionTargets
 * @property {Array<unknown>} importSnapshots
 * @property {unknown} [chat]
 * @property {unknown} [nutrition]
 */

/** @returns {void} */
export function exportDataJSON() {
  exportClientJSON(state.currentProfile);
}

/**
 * Builds the JSON-safe client export object used by downloads and encrypted
 * downloads and, with nutrition disabled, encrypted profile shares.
 * Token-bearing wearable connection records are deliberately excluded.
 *
 * @param {string} profileId
 * @param {boolean} [includeChat]
 * @param {boolean} [includeNutrition]
 * @returns {Promise<ClientExportObject>}
 */
export async function buildClientExportObject(profileId, includeChat = false, includeNutrition = true) {
  const profiles = getProfiles();
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) throw new Error('Profile not found');
  const raw = await encryptedGetItem(profileStorageKey(profileId, 'imported'));
  const nutrition = includeNutrition ? await buildProfileNutritionArchive(profileId) : null;
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!data || typeof data !== 'object') data = {};
  migrateCustomMarkerIdentities(data?.customMarkers);
  if (data) migrateMarkerPlacements(data);
  if ((!data || !data.entries || data.entries.length === 0) && !nutrition?.meals?.length) throw new Error('No data to export for this client');
  /** @type {ClientExportObject} */
  const exportObj = {
    version: 2, exportedAt: new Date().toISOString(),
    profile: { name: profile.name, sex: profile.sex || null, dob: profile.dob || null, location: profile.location || null, tags: profile.tags || [], notes: profile.notes || '', status: profile.status || 'active', avatar: profile.avatar || null, pinned: profile.pinned || false, height: profile.height || null, heightUnit: profile.heightUnit || 'cm' },
    entries: data.entries || [], notes: data.notes || [], supplements: data.supplements || [],
    diagnoses: data.diagnoses || null, diet: data.diet || null, exercise: data.exercise || null,
    sleepRest: data.sleepRest || null, lightCircadian: data.lightCircadian || null,
    stress: data.stress || null, loveLife: data.loveLife || null, environment: data.environment || null,
    interpretiveLens: data.interpretiveLens || '', contextNotes: data.contextNotes || '',
    healthGoals: data.healthGoals || [], customMarkers: data.customMarkers || {},
    markerPlacements: data.markerPlacements || {},
    refOverrides: data.refOverrides || {},
    categoryLabels: data.categoryLabels || null,
    categoryIcons: data.categoryIcons || null,
    markerLabels: data.markerLabels || null,
    menstrualCycle: data.menstrualCycle || null,
    emfAssessment: data.emfAssessment || null,
    genetics: data.genetics || null,
    biometrics: data.biometrics || null,
    markerNotes: data.markerNotes || {},
    markerValueNotes: data.markerValueNotes || {},
    manualValues: data.manualValues || {},
    manualMetricTombstones: data.manualMetricTombstones || {},
    changeHistory: data.changeHistory || [],
    chatSummaries: data.chatSummaries || [],
    // Wearable layer (added v1.27.1). Only the synced surfaces — L2 summary
    // + user preferences. Raw L1 IDB rows are deliberately excluded; they
    // stay per-device. OAuth tokens are stripped via the same path the
    // Evolu sync uses (wearableConnections wholesale exclude).
    wearableSummary: data.wearableSummary || null,
    wearableCardOrder: data.wearableCardOrder || null,
    wearablePrimaryOverride: data.wearablePrimaryOverride || null,
    // Light & Sun stack — earlier export schema predated this lens and
    // silently dropped everything on export. importDataJSON learned to
    // restore these fields (v1.6.x); the export side has to ship them
    // for the round-trip to actually work.
    sunSessions: data.sunSessions || [],
    deviceSessions: data.deviceSessions || [],
    lightDevices: data.lightDevices || [],
    lightAudits: data.lightAudits || [],
    lightMeasurements: data.lightMeasurements || [],
    lightEnvironment: data.lightEnvironment || null,
    sunDefaults: data.sunDefaults || null,
    sunCorrelations: data.sunCorrelations || null,
    lifelightProfile: data.lifelightProfile || null,
    lightDailyVerdicts: data.lightDailyVerdicts || null,
    channelMixAI: data.channelMixAI || null,
    biologyScoreContextAI: data.biologyScoreContextAI || null,
    contextSourceSettings: data.contextSourceSettings || {},
    nutritionContextDays: [7, 30, 90].includes(Number(data.nutritionContextDays)) ? /** @type {7|30|90} */ (Number(data.nutritionContextDays)) : 30,
    nutritionTargets: data.nutritionTargets && typeof data.nutritionTargets === 'object' && !Array.isArray(data.nutritionTargets)
      ? data.nutritionTargets
      : null,
    importSnapshots: data.importSnapshots || [],
    ...(nutrition ? { nutrition } : {}),
  };
  if (includeChat) {
    const chat = await _exportChatData(profileId);
    if (chat) exportObj.chat = chat;
  }
  return exportObj;
}

/**
 * Downloads a single-profile JSON backup.
 *
 * @param {string} profileId
 * @param {boolean} [includeChat]
 * @returns {Promise<void>}
 */
export async function exportClientJSON(profileId, includeChat = false) {
  let exportObj;
  try {
    exportObj = await buildClientExportObject(profileId, includeChat);
  } catch (err) {
    showNotification(getErrorMessage(err, 'Could not export this client'), 'error');
    return;
  }
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const profileName = exportObj.profile?.name || 'client';
  const safeName = profileName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  a.download = `getbased-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showNotification(`Exported "${profileName}"`, 'success');
}

/** @returns {Promise<string | null>} */
export async function buildAllDataBundle() {
  const profiles = getProfiles();
  if (profiles.length === 0) return null;
  const bundle = {
    version: 2,
    type: 'database',
    exportedAt: new Date().toISOString(),
    profiles: /** @type {Array<Record<string, any>>} */ ([]),
  };
  for (const p of profiles) {
    const raw = await encryptedGetItem(profileStorageKey(p.id, 'imported'));
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
    migrateCustomMarkerIdentities(data?.customMarkers);
    migrateMarkerPlacements(data);
    const chat = await _exportChatData(p.id);
    const nutrition = await buildProfileNutritionArchive(p.id);
    const entry = {
      id: p.id, name: p.name, sex: p.sex || null, dob: p.dob || null,
      location: p.location || null, tags: p.tags || [], notes: p.notes || '',
      status: p.status || 'active', avatar: p.avatar || null, pinned: p.pinned || false,
      height: p.height || null, heightUnit: p.heightUnit || 'cm',
      data: data,
      nutrition,
    };
    if (chat) entry.chat = chat;
    bundle.profiles.push(entry);
  }
  // Wallet identity and proofs are deliberately excluded: exporting only a
  // seed or mint would create an incomplete and unsafe wallet backup.
  const walletNodeUrl = getSelectedNodeUrl();
  if (walletNodeUrl) {
    bundle.wallet = { nodeUrl: walletNodeUrl };
  }
  return JSON.stringify(bundle, null, 2);
}

/** @returns {Promise<void>} */
export async function exportAllDataJSON() {
  const json = await buildAllDataBundle();
  if (!json) { showNotification('No profiles to export', 'error'); return; }
  const bundle = JSON.parse(json);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `getbased-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showNotification(`Exported ${bundle.profiles.length} client${bundle.profiles.length !== 1 ? 's' : ''}`, 'success');
}

export async function clearAllData() {
  const profiles = getProfiles();
  const msg = profiles.length > 1
    ? `Clear ALL data across ${profiles.length} profiles, including the Cashu wallet balance and seed? This cannot be undone.`
    : 'Clear all imported data, including the Cashu wallet balance and seed? This cannot be undone.';
  if (await showConfirmDialog(msg)) {
    try {
      // Delete the wallet first. If it is blocked by another tab, preserve the
      // profile records and report the failure instead of claiming success.
      await destroyWalletRuntimeDB();
      const profileIds = await listStoredProfileIds(profiles.map(profile => profile.id));
      for (const id of profileIds) {
        await clearProfileStorage(id);
      }
    } catch (error) {
      console.warn('[export] Clear-all storage cleanup failed:', error);
      showNotification('Data clearing was incomplete. Close other Get Based tabs and try again.', 'error', 8000);
      return;
    }
    // Reset to single default profile
    const defaultId = profiles[0]?.id || 'default';
    const defaultName = profiles[0]?.name || 'Profile 1';
    await saveProfiles([{ id: defaultId, name: defaultName, sex: null, dob: null, location: { country: '', zip: '' }, tags: [], notes: '', status: 'active', avatar: null, height: null, heightUnit: 'cm', createdAt: Date.now(), lastUpdated: Date.now(), pinned: false }]);
    state.importedData = createDefaultProfileData();
    state.currentProfile = defaultId;
    localStorage.setItem('labcharts-active-profile', defaultId);
    localStorage.removeItem('labcharts-cashu-wallet-mint');
    localStorage.removeItem('labcharts-cashu-wallet-mnemonic');
    localStorage.removeItem('labcharts-routstr-node');
    localStorage.removeItem('labcharts-routstr-key');
    localStorage.removeItem('labcharts-routstr-model');
    localStorage.removeItem('labcharts-routstr-models');
    await refreshImportRuntimeShell({ chat: true, profileButton: true });
    showNotification('All data cleared', 'info');
  }
}

export async function loadDemoData(sex = 'male') {
  try {
    const file = sex === 'female' ? 'data/demo-female.json' : 'data/demo-male.json';
    const resp = await fetch(file);
    if (!resp.ok) throw new Error('Failed to load');
    const blob = await resp.blob();
    const name = sex === 'female' ? 'Demo Sarah' : 'Demo Alex';
    const dob = sex === 'female' ? '1991-08-15' : '1987-11-22';
    const location = sex === 'female'
      ? { country: 'Czech Republic', zip: '11000' }
      : { country: 'United States', zip: '80301' };
    const avatar = sex === 'female'
      ? 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MCcgaGVpZ2h0PSc4MCcgdmlld0JveD0nMCAwIDgwIDgwJz4KPGNpcmNsZSBjeD0nNDAnIGN5PSc0MCcgcj0nNDAnIGZpbGw9JyNmMGM4YTAnLz4KPGVsbGlwc2UgY3g9JzQwJyBjeT0nMjgnIHJ4PScyMicgcnk9JzIwJyBmaWxsPScjNmIzYTJhJy8+CjxlbGxpcHNlIGN4PSc0MCcgY3k9JzQ4JyByeD0nMTYnIHJ5PScxOCcgZmlsbD0nI2Y1ZDViOCcvPgo8Y2lyY2xlIGN4PSczMycgY3k9JzQ0JyByPScyJyBmaWxsPScjNGEzNzI4Jy8+CjxjaXJjbGUgY3g9JzQ3JyBjeT0nNDQnIHI9JzInIGZpbGw9JyM0YTM3MjgnLz4KPHBhdGggZD0nTTM2IDUyIFE0MCA1NiA0NCA1Micgc3Ryb2tlPScjYzQ3YTZhJyBzdHJva2Utd2lkdGg9JzEuNScgZmlsbD0nbm9uZScgc3Ryb2tlLWxpbmVjYXA9J3JvdW5kJy8+CjxwYXRoIGQ9J00xOCAzMCBRMjAgMTIgNDAgMTAgUTYwIDEyIDYyIDMwIFE1OCAyMiA0MCAyMCBRMjIgMjIgMTggMzBaJyBmaWxsPScjNmIzYTJhJy8+CjxwYXRoIGQ9J00xNiAzNSBRMTQgMjAgMjUgMTUnIHN0cm9rZT0nIzZiM2EyYScgc3Ryb2tlLXdpZHRoPSc2JyBmaWxsPSdub25lJyBzdHJva2UtbGluZWNhcD0ncm91bmQnLz4KPHBhdGggZD0nTTY0IDM1IFE2NiAyMCA1NSAxNScgc3Ryb2tlPScjNmIzYTJhJyBzdHJva2Utd2lkdGg9JzYnIGZpbGw9J25vbmUnIHN0cm9rZS1saW5lY2FwPSdyb3VuZCcvPgo8L3N2Zz4='
      : 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MCcgaGVpZ2h0PSc4MCcgdmlld0JveD0nMCAwIDgwIDgwJz4KPGNpcmNsZSBjeD0nNDAnIGN5PSc0MCcgcj0nNDAnIGZpbGw9JyNkNGE4N2MnLz4KPGVsbGlwc2UgY3g9JzQwJyBjeT0nNDgnIHJ4PScxNycgcnk9JzE4JyBmaWxsPScjZThjNGEwJy8+CjxyZWN0IHg9JzIwJyB5PScxNCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzIyJyByeD0nOCcgZmlsbD0nIzNhMmExYScvPgo8Y2lyY2xlIGN4PSczMycgY3k9JzQ0JyByPScyJyBmaWxsPScjM2EyYTFhJy8+CjxjaXJjbGUgY3g9JzQ3JyBjeT0nNDQnIHI9JzInIGZpbGw9JyMzYTJhMWEnLz4KPHBhdGggZD0nTTM2IDUzIFE0MCA1NiA0NCA1Mycgc3Ryb2tlPScjYjA3MDYwJyBzdHJva2Utd2lkdGg9JzEuNScgZmlsbD0nbm9uZScgc3Ryb2tlLWxpbmVjYXA9J3JvdW5kJy8+CjxyZWN0IHg9JzMwJyBjeT0nNTgnIHk9JzU5JyB3aWR0aD0nMjAnIGhlaWdodD0nMycgcng9JzEnIGZpbGw9JyM4YjZiNTAnIG9wYWNpdHk9JzAuNCcvPgo8L3N2Zz4=';
    const height = sex === 'female' ? 168 : 182;
    const profileId = await createProfile(name, { sex, dob, location, avatar, tags: ['demo'], height, heightUnit: 'cm', skipInitialSync: true });
    // Remove empty Default profile when loading demo data
    const allProfiles = getProfiles();
    const emptyDefault = allProfiles.find(p => p.id === 'default');
    if (emptyDefault) {
      // `labcharts-default-imported` matches the `*-imported` suffix and now
      // lives in IndexedDB. encryptedGetItem migrates from localStorage on
      // first read, so this works whether the value is in either place.
      const defaultRaw = await encryptedGetItem('labcharts-default-imported');
      const defaultData = defaultRaw ? JSON.parse(defaultRaw) : {};
      if (!defaultData.entries || defaultData.entries.length === 0) {
        await saveProfiles(allProfiles.filter(p => p.id !== 'default'));
        await encryptedRemoveItem('labcharts-default-imported');
      }
    }
    // Mark the loading window so the dashboard renderer shows a
    // "Loading demo data…" placeholder instead of the empty Welcome
    // hero during the 2-3s gap between switchProfile and
    // importDataJSON-finish. Cleared by the import completion path.
    markDemoLoadingProfile(profileId);
    // Await switchProfile fully — it's now async, and racing it against
    // importDataJSON used to leave state.currentProfile pointing at the
    // OLD profile when FileReader fired, causing the demo to land in
    // the wrong profile and the dashboard to render stale until the
    // user manually refreshed.
    await switchProfile(profileId);
    localStorage.setItem(profileStorageKey(profileId, 'onboarded'), 'profile-set');
    // Prefill caches BEFORE the import runs. importDataJSON's onload
    // ends with `navigate('dashboard')`, which immediately fires
    // loadFocusCard + loadContextHealthDots. If we wrote these caches
    // AFTER the import, those renders would beat us to the punch and
    // fire 9+1 AI calls before our prefill landed. Both writes are
    // demo-only by code path (regular importDataJSON does not touch
    // either localStorage cache).
    let demoJson = null;
    let demoImportFile = new File([blob], file, { type: 'application/json' });
    try {
      demoJson = JSON.parse(await blob.text());
      addDemoNutrition(demoJson, sex);
      demoImportFile = new File([JSON.stringify(demoJson)], file, { type: 'application/json' });
    } catch (_) {}
    if (demoJson?.focusCard?.text) {
      // Focus card cache ships without a fingerprint — loadFocusCard
      // treats that as a hand-authored prefill and never auto-refreshes
      // against a live provider. Manual ↻ clears the cache.
      localStorage.setItem(profileStorageKey(profileId, 'focusCard'),
        JSON.stringify({ text: demoJson.focusCard.text }));
    }
    if (demoJson?.contextHealth?.dots || demoJson?.entries?.length) {
      try {
        const { getCardFingerprint } = await import('./context-cards.js');
        // Compute fingerprints against the demo JSON directly — passing
        // an explicit ctx so getCardFingerprint doesn't read the live
        // state (which won't be populated until importDataJSON's onload
        // runs). The fingerprint values match what loadContextHealthDots
        // will compute post-import (same data, same sex/dob), so the
        // standard fp-match path renders cached without firing AI.
        //
        // CRITICAL: importDataJSON applies two transforms before the
        // dashboard renders, both of which influence the labPart hash:
        //   (1) merge same-date entries (commit 42415b1 — demos ship two
        //       entries per draw day for comprehensive + specialty
        //       add-on panels)
        //   (2) migrateProfileData (e.g. hematocrit fraction → percent
        //       per v1.6.1 migration)
        // Apply both to a deep-cloned demoJson here, otherwise every
        // fingerprint mismatches and all 9 dots fall through to stale
        // AI-fire on first dashboard render. Deep clone via
        // structuredClone keeps the original demoJson reference clean
        // for any downstream usage (currently none, but defensive).
        const _ctxData = structuredClone(demoJson);
        const _ctxSourceEntries = Array.isArray(_ctxData.entries) ? _ctxData.entries : [];
        const _ctxImportTs = Date.now();
        _ctxData.entries = [];
        for (const entry of _ctxSourceEntries) {
          if (!entry.date || !entry.markers) continue;
          const existing = findOrCreateLabEntry(_ctxData, entry.date, { now: _ctxImportTs });
          for (const [key, value] of Object.entries(entry.markers)) {
            setLabEntryMarker(existing, key, value, { now: _ctxImportTs });
          }
        }
        try { migrateProfileData(_ctxData); } catch (_) {}
        if (demoJson?.contextHealth?.dots) {
          const ctx = {
            importedData: _ctxData,
            profileSex: sex,
            profileDob: dob,
          };
          const cacheKey = profileStorageKey(profileId, 'contextHealth');
          const dots = {};
          const summaries = {};
          const cardSummaries = {};
          const fingerprints = {};
          const sources = {};
          for (const k of Object.keys(demoJson.contextHealth.dots)) {
            dots[k] = demoJson.contextHealth.dots[k];
            summaries[k] = demoJson.contextHealth.summaries?.[k] || '';
            cardSummaries[k] = demoJson.contextHealth.cardSummaries?.[k] || '';
            sources[k] = 'demo';
            try { fingerprints[k] = getCardFingerprint(k, ctx); } catch (_) {}
          }
          localStorage.setItem(cacheKey, JSON.stringify({ dots, summaries, cardSummaries, fingerprints, sources, fixedDemo: true }));
        }

        // Biology Scores use a manual AI context gate in normal profiles. For
        // demos, generate the same fingerprint shape locally against the exact
        // post-import data shape so Alex/Sarah land directly on unlocked scores
        // without calling the user's provider.
        try {
          const previousImportedData = state.importedData;
          const previousSex = state.profileSex;
          const previousDob = state.profileDob;
          const { buildBiologyScoreContextFingerprint, buildBiologyScoreContextFingerprintsByRange } = await import('./biology-score-context-ai.js');
          try {
            state.importedData = structuredClone(_ctxData);
            state.profileSex = sex;
            state.profileDob = dob;
            invalidateActiveDataCache?.();
            const activeData = getActiveData();
            demoJson.biologyScoreContextAI = {
              summary: 'Demo context checked locally. Biology Scores are unlocked for this sample profile without using an AI provider.',
              suggestions: [],
              fingerprint: buildBiologyScoreContextFingerprint(activeData, 'all'),
              fingerprintsByRange: buildBiologyScoreContextFingerprintsByRange(activeData),
              unlockedRanges: ['all', '1y', '6m', '3m'],
              range: 'all',
              updatedAt: _ctxImportTs,
            };
          } finally {
            state.importedData = previousImportedData;
            state.profileSex = previousSex;
            state.profileDob = previousDob;
            invalidateActiveDataCache?.();
          }
          demoImportFile = new File([JSON.stringify(demoJson)], file, { type: 'application/json' });
        } catch (_) {
          // Best-effort: if Biology Scores modules fail to load, the demo still
          // imports normally and the standard locked state remains honest.
        }
      } catch (_) { /* prefill is best-effort */ }
    }
    await importDataJSON(demoImportFile);

    // Post-import safety net: the seeded Biology Scores review must match the
    // exact state that survived importDataJSON + migrateProfileData + storage
    // persistence. If any future import transform changes the fingerprint
    // basis, recompute locally here instead of letting the demo briefly unlock
    // and then fall back to the normal AI gate.
    try {
      const { buildBiologyScoreContextFingerprint, buildBiologyScoreContextFingerprintsByRange, hasCurrentBiologyScoreContextReview } = await import('./biology-score-context-ai.js');
      invalidateActiveDataCache?.();
      const activeData = getActiveData();
      const scoreData = filterDatesByRange(activeData, { fallbackToAll: false });
      if (!hasCurrentBiologyScoreContextReview(scoreData)) {
        state.importedData.biologyScoreContextAI = {
          summary: 'Demo context checked locally. Biology Scores are unlocked for this sample profile without using an AI provider.',
          suggestions: [],
          fingerprint: buildBiologyScoreContextFingerprint(activeData, 'all'),
          fingerprintsByRange: buildBiologyScoreContextFingerprintsByRange(activeData),
          unlockedRanges: ['all', '1y', '6m', '3m'],
          range: 'all',
          updatedAt: Date.now(),
        };
        await saveImportedData({ skipSync: true, reason: 'demo-biology-score-context' });
        exportRuntimeDeps.buildSidebar?.();
        updateHeaderDates();
        if (state.currentView === 'biology-scores') exportRuntimeDeps.navigate?.('biology-scores');
      }
    } catch (_) { /* demo Biology Scores post-import unlock is best-effort */ }
  } catch (err) {
    clearDemoLoadingProfile();
    showNotification('Could not load demo data: ' + getErrorMessage(err), 'error');
  }
}
