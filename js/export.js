// @ts-check
// export.js — JSON export/import, report facade, clear all data

import { state } from './state.js';
import { showNotification, showConfirmDialog, isDebugMode } from './utils.js';
import { saveImportedData } from './data.js';
import { getProfiles, profileStorageKey, createProfile, updateProfileMeta, loadProfile, saveProfiles, migrateProfileData } from './profile.js';
import { encryptedGetItem, encryptedSetItem, getEncryptionEnabled, encryptedRemoveItem } from './crypto.js';
import {
  appendImportedArrayItem,
  ensureImportedArray,
  replaceImportedArrayItem,
  sortImportedArray,
  trimImportedArray,
} from './data-merge.js';
import { findOrCreateLabEntry } from './lab-entry-mutations.js';
import { setLabEntryMarker } from './lab-entry.js';
import {
  generateReportAISummary as generateReportAISummaryImpl,
} from './export-report.js';
import {
  buildReportHTML as buildReportHTMLImpl,
  exportPDFReport as exportPDFReportImpl,
} from './export-report-html.js';
import {
  closeReportBuilder as closeReportBuilderImpl,
  openReportBuilder as openReportBuilderImpl,
} from './export-report-builder.js';

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
  return openReportBuilderImpl(presetId);
}

export function closeReportBuilder() {
  return closeReportBuilderImpl();
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
  if (!threads.length) return null;
  const messages = {};
  for (const t of threads) {
    const raw = await encryptedGetItem(`labcharts-${profileId}-chat-t_${t.id}`);
    try { messages[t.id] = raw ? JSON.parse(raw) : []; } catch { messages[t.id] = []; }
  }
  const personality = localStorage.getItem(`labcharts-${profileId}-chatPersonality`) || null;
  const customRaw = localStorage.getItem(`labcharts-${profileId}-chatPersonalityCustom`) || null;
  let customPersonalities;
  try { customPersonalities = customRaw ? JSON.parse(customRaw) : null; } catch { customPersonalities = null; }
  return { threads, messages, personality, customPersonalities };
}

async function _importChatData(profileId, chat) {
  if (!chat || !Array.isArray(chat.threads)) return;
  // Read existing threads to merge
  let existingRaw;
  if (getEncryptionEnabled()) {
    try { existingRaw = await encryptedGetItem(`labcharts-${profileId}-chat-threads`); } catch { existingRaw = null; }
  } else {
    existingRaw = localStorage.getItem(`labcharts-${profileId}-chat-threads`);
  }
  let existing;
  try { existing = existingRaw ? JSON.parse(existingRaw) : []; } catch { existing = []; }
  const existingIds = new Set(existing.map(t => t.id));
  for (const t of chat.threads) {
    if (existingIds.has(t.id)) continue;
    existing.push(t);
    // Write thread messages
    const msgs = (chat.messages && chat.messages[t.id]) || [];
    const value = JSON.stringify(msgs);
    if (getEncryptionEnabled()) { await encryptedSetItem(`labcharts-${profileId}-chat-t_${t.id}`, value); }
    else { localStorage.setItem(`labcharts-${profileId}-chat-t_${t.id}`, value); }
  }
  const threadsJson = JSON.stringify(existing);
  if (getEncryptionEnabled()) { await encryptedSetItem(`labcharts-${profileId}-chat-threads`, threadsJson); }
  else { localStorage.setItem(`labcharts-${profileId}-chat-threads`, threadsJson); }
  // Restore personality + custom personas (only if not already set)
  if (chat.personality && !localStorage.getItem(`labcharts-${profileId}-chatPersonality`)) {
    localStorage.setItem(`labcharts-${profileId}-chatPersonality`, chat.personality);
  }
  if (chat.customPersonalities && !localStorage.getItem(`labcharts-${profileId}-chatPersonalityCustom`)) {
    localStorage.setItem(`labcharts-${profileId}-chatPersonalityCustom`, JSON.stringify(chat.customPersonalities));
  }
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
 * @property {unknown} [chat]
 */

/** @returns {void} */
export function exportDataJSON() {
  exportClientJSON(state.currentProfile);
}

/**
 * Builds the JSON-safe client export object used by downloads and encrypted
 * profile shares. Token-bearing wearable connection records are deliberately
 * excluded from this shape.
 *
 * @param {string} profileId
 * @param {boolean} [includeChat]
 * @returns {Promise<ClientExportObject>}
 */
export async function buildClientExportObject(profileId, includeChat = false) {
  const profiles = getProfiles();
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) throw new Error('Profile not found');
  const raw = await encryptedGetItem(profileStorageKey(profileId, 'imported'));
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!data || !data.entries || data.entries.length === 0) throw new Error('No data to export for this client');
  const exportObj = {
    version: 2, exportedAt: new Date().toISOString(),
    profile: { name: profile.name, sex: profile.sex || null, dob: profile.dob || null, location: profile.location || null, tags: profile.tags || [], notes: profile.notes || '', status: profile.status || 'active', avatar: profile.avatar || null, pinned: profile.pinned || false, height: profile.height || null, heightUnit: profile.heightUnit || 'cm' },
    entries: data.entries || [], notes: data.notes || [], supplements: data.supplements || [],
    diagnoses: data.diagnoses || null, diet: data.diet || null, exercise: data.exercise || null,
    sleepRest: data.sleepRest || null, lightCircadian: data.lightCircadian || null,
    stress: data.stress || null, loveLife: data.loveLife || null, environment: data.environment || null,
    interpretiveLens: data.interpretiveLens || '', contextNotes: data.contextNotes || '',
    healthGoals: data.healthGoals || [], customMarkers: data.customMarkers || {},
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
    biologyScoreContextAI: data.biologyScoreContextAI || null
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
    showNotification(err?.message || 'Could not export this client', 'error');
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
  const bundle = { version: 2, type: 'database', exportedAt: new Date().toISOString(), profiles: [] };
  for (const p of profiles) {
    const raw = await encryptedGetItem(profileStorageKey(p.id, 'imported'));
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
    const chat = await _exportChatData(p.id);
    const entry = {
      id: p.id, name: p.name, sex: p.sex || null, dob: p.dob || null,
      location: p.location || null, tags: p.tags || [], notes: p.notes || '',
      status: p.status || 'active', avatar: p.avatar || null, pinned: p.pinned || false,
      height: p.height || null, heightUnit: p.heightUnit || 'cm',
      data: data
    };
    if (chat) entry.chat = chat;
    bundle.profiles.push(entry);
  }
  // Include Cashu wallet settings (mnemonic excluded for security — restore via seed phrase)
  const walletMintUrl = typeof window.cashuGetMintUrl === 'function' ? await window.cashuGetMintUrl() : null;
  const walletNodeUrl = typeof window.nostrGetSelectedNode === 'function' ? window.nostrGetSelectedNode() : null;
  if (walletMintUrl || walletNodeUrl) {
    bundle.wallet = { mintUrl: walletMintUrl, nodeUrl: walletNodeUrl };
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

/**
 * Imports a JSON file produced by the single-client or all-data export paths.
 *
 * @param {File} file
 * @returns {Promise<void>}
 */
export function importDataJSON(file) {
  // Returns a Promise that resolves when the FileReader pipeline finishes
  // (success OR error). Existing fire-and-forget callers (`importDataJSON(file)`)
  // ignore the return value and behave identically; the demo loader awaits
  // it to compute fingerprints against the imported state.
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(/** @type {string} */ (reader.result));
      // Guard: demo data should never be silently imported into a non-demo profile
      if (json._source === 'demo') {
        const profiles = getProfiles();
        const current = profiles.find(p => p.id === state.currentProfile);
        if (!current?.tags?.includes('demo')) {
          showNotification('Demo data detected. Use the dashboard "Load demo" button to create a demo profile, or switch to a demo profile before importing.', 'error');
          resolve();
          return;
        }
      }
      // Database bundle — multi-profile import
      if (json.type === 'database' && Array.isArray(json.profiles)) {
        await _importDatabaseBundle(json);
        return;
      }
      if (!json.entries || !Array.isArray(json.entries)) {
        showNotification('Invalid JSON format: missing entries array', 'error');
        return;
      }
      // v2 client export with profile metadata — create a new profile
      if (json.profile?.name) {
        const p = json.profile;
        const profileId = createProfile(p.name, {
          sex: p.sex || null, dob: p.dob || null,
          location: p.location || null, tags: p.tags || [],
          avatar: p.avatar || null,
          height: p.height || null, heightUnit: p.heightUnit || 'cm'
        });
        await loadProfile(profileId);
      }
      let count = 0;
      const importTs = Date.now();
      for (const entry of json.entries) {
        if (!entry.date || !entry.markers) continue;
        // Earlier draft did `filter(ex => ex.date !== entry.date)` — same-
        // date entries clobbered each other. The demos legitimately ship
        // two entries per date (comprehensive panel + specialty add-on
        // like an OmegaQuant fatty-acid run on the same draw day) and the
        // second entry was silently dropped, losing every fatty-acid /
        // specialty marker on import. Merge markers + markerSources
        // instead so all data lands; later entries win on key conflicts.
        const existing = findOrCreateLabEntry(state.importedData, entry.date, { now: importTs });
        for (const [key, value] of Object.entries(entry.markers)) {
          const source = entry.markerSources?.[key]
            ? { ...entry.markerSources[key] }
            : null;
          setLabEntryMarker(existing, key, value, {
            now: importTs,
            mirrorInsulin: true,
            ...(source ? { source } : {}),
          });
        }
        if (entry.file && !existing.file) existing.file = entry.file;
        if (entry.sourceFile && !existing.sourceFile) existing.sourceFile = entry.sourceFile;
        if (Array.isArray(entry.sourceFiles)) {
          existing.sourceFiles = Array.from(new Set([...(existing.sourceFiles || []), ...entry.sourceFiles]));
        }
        if (entry.importedWith && !existing.importedWith) existing.importedWith = entry.importedWith;
        if (entry.importHash && !existing.importHash) existing.importHash = entry.importHash;
        count++;
      }
      if (count === 0 && (!json.notes || json.notes.length === 0)) { showNotification('No valid entries found in JSON', 'error'); return; }
      // Import context fields — handle both old string format (v1) and new object format (v2)
      function importContextField(field) {
        const val = json[field];
        if (!val) return;
        if (typeof val === 'object' && val !== null) {
          // v2 structured format — use directly
          state.importedData[field] = val;
        } else if (typeof val === 'string' && val.trim()) {
          // v1 legacy string — migrate to structured with note
          const migrations = {
            diagnoses: { conditions: [], note: val.trim() },
            diet: { type: null, restrictions: [], pattern: null, note: val.trim() },
            exercise: { frequency: null, types: [], intensity: null, dailyMovement: null, note: val.trim() },
            sleepRest: { duration: null, quality: null, schedule: null, issues: [], note: val.trim() }
          };
          if (migrations[field]) state.importedData[field] = migrations[field];
        }
      }
      importContextField('diagnoses');
      importContextField('diet');
      importContextField('exercise');
      // Import sleep & light/circadian (handle old sleepCircadian, old separate fields, or new split fields)
      if (json.sleepRest) {
        importContextField('sleepRest');
      } else if (json.sleepCircadian) {
        // Migrate old sleepCircadian → sleepRest
        const sc = json.sleepCircadian;
        if (typeof sc === 'object' && sc !== null) {
          const sleepIssues = (sc.issues || []).filter(i => !['blue light blockers', 'morning sunlight'].includes(i));
          const circPractices = (sc.issues || []).filter(i => ['blue light blockers', 'morning sunlight'].includes(i));
          state.importedData.sleepRest = { duration: sc.duration || null, quality: sc.quality || null, schedule: sc.schedule || null, issues: sleepIssues, note: sc.note || '' };
          if (circPractices.length && !state.importedData.lightCircadian) {
            state.importedData.lightCircadian = { practices: circPractices, timing: null, mealTiming: [], note: '' };
          }
        } else if (typeof sc === 'string' && sc.trim()) {
          state.importedData.sleepRest = { duration: null, quality: null, schedule: null, issues: [], note: sc.trim() };
        }
      } else {
        const parts = [json.circadian, json.sleep].filter(s => typeof s === 'string' && s.trim());
        if (parts.length) state.importedData.sleepRest = { duration: null, quality: null, schedule: null, issues: [], note: parts.map(s => s.trim()).join('\n\n') };
      }
      if (json.lightCircadian && typeof json.lightCircadian === 'object') state.importedData.lightCircadian = json.lightCircadian;
      // Import new context fields (v2 only)
      if (json.stress && typeof json.stress === 'object') state.importedData.stress = json.stress;
      if (json.loveLife && typeof json.loveLife === 'object') state.importedData.loveLife = json.loveLife;
      if (json.environment && typeof json.environment === 'object') state.importedData.environment = json.environment;
      if (json.contextNotes && typeof json.contextNotes === 'string') state.importedData.contextNotes = json.contextNotes;
      // Import interpretive lens (new merged field, or migrate old separate fields)
      if (json.interpretiveLens && typeof json.interpretiveLens === 'string' && json.interpretiveLens.trim()) {
        state.importedData.interpretiveLens = json.interpretiveLens.trim();
      } else {
        const parts = [json.fieldExperts, json.fieldLens].filter(s => typeof s === 'string' && s.trim());
        if (parts.length) state.importedData.interpretiveLens = parts.map(s => s.trim()).join('\n\n');
      }
      // Import health goals (merge, deduplicate by text)
      if (json.healthGoals && Array.isArray(json.healthGoals)) {
        const healthGoals = ensureImportedArray(state.importedData, 'healthGoals');
        for (const g of json.healthGoals) {
          if (!g.text || !g.severity) continue;
          const exists = healthGoals.some(x => x.text === g.text);
          if (!exists) appendImportedArrayItem(state.importedData, 'healthGoals', { text: g.text, severity: g.severity });
        }
      }
      // Import custom markers (merge, don't overwrite existing definitions)
      if (json.customMarkers && typeof json.customMarkers === 'object') {
        if (!state.importedData.customMarkers) state.importedData.customMarkers = {};
        for (const [key, def] of Object.entries(json.customMarkers)) {
          if (!state.importedData.customMarkers[key]) {
            state.importedData.customMarkers[key] = def;
          }
        }
      }
      // Import reference range overrides (merge, don't overwrite)
      if (json.refOverrides && typeof json.refOverrides === 'object') {
        if (!state.importedData.refOverrides) state.importedData.refOverrides = {};
        for (const [key, ovr] of Object.entries(json.refOverrides)) {
          if (!state.importedData.refOverrides[key]) state.importedData.refOverrides[key] = ovr;
        }
      }
      // Import category label/icon overrides
      if (json.categoryLabels && typeof json.categoryLabels === 'object') {
        if (!state.importedData.categoryLabels) state.importedData.categoryLabels = {};
        Object.assign(state.importedData.categoryLabels, json.categoryLabels);
      }
      if (json.categoryIcons && typeof json.categoryIcons === 'object') {
        if (!state.importedData.categoryIcons) state.importedData.categoryIcons = {};
        Object.assign(state.importedData.categoryIcons, json.categoryIcons);
      }
      if (json.markerLabels && typeof json.markerLabels === 'object') {
        if (!state.importedData.markerLabels) state.importedData.markerLabels = {};
        Object.assign(state.importedData.markerLabels, json.markerLabels);
      }
      // Import menstrual cycle
      if (json.menstrualCycle && typeof json.menstrualCycle === 'object') {
        if (!state.importedData.menstrualCycle) {
          state.importedData.menstrualCycle = json.menstrualCycle;
        } else {
          // Merge: overwrite profile fields, merge periods by startDate
          const mc = state.importedData.menstrualCycle;
          mc.cycleLength = json.menstrualCycle.cycleLength || mc.cycleLength;
          mc.periodLength = json.menstrualCycle.periodLength || mc.periodLength;
          mc.regularity = json.menstrualCycle.regularity || mc.regularity;
          mc.flow = json.menstrualCycle.flow || mc.flow;
          if (json.menstrualCycle.contraceptive) mc.contraceptive = json.menstrualCycle.contraceptive;
          if (json.menstrualCycle.conditions) mc.conditions = json.menstrualCycle.conditions;
          if (json.menstrualCycle.periods && Array.isArray(json.menstrualCycle.periods)) {
            if (!mc.periods) mc.periods = [];
            for (const p of json.menstrualCycle.periods) {
              if (!p.startDate) continue;
              const exists = mc.periods.some(x => x.startDate === p.startDate);
              if (!exists) mc.periods.push(p);
            }
          }
        }
      }
      // Import EMF assessment
      if (json.emfAssessment && json.emfAssessment.assessments) {
        if (!state.importedData.emfAssessment) {
          state.importedData.emfAssessment = json.emfAssessment;
        } else {
          const existing = state.importedData.emfAssessment.assessments;
          for (const a of json.emfAssessment.assessments) {
            if (!existing.some(x => x.id === a.id)) existing.push(a);
          }
        }
      }
      // Import genetics
      if (json.genetics && (json.genetics.snps || json.genetics.mtdna)) {
        state.importedData.genetics = json.genetics;
      }
      // Import biometrics
      if (json.biometrics && typeof json.biometrics === 'object') {
        if (!state.importedData.biometrics) {
          state.importedData.biometrics = json.biometrics;
        } else {
          for (const metric of ['weight', 'pulse']) {
            if (Array.isArray(json.biometrics[metric])) {
              if (!state.importedData.biometrics[metric]) state.importedData.biometrics[metric] = [];
              for (const e of json.biometrics[metric]) {
                if (!e.date) continue;
                if (!state.importedData.biometrics[metric].some(x => x.date === e.date)) {
                  state.importedData.biometrics[metric].push(e);
                }
              }
              state.importedData.biometrics[metric].sort((a, b) => a.date.localeCompare(b.date));
            }
          }
          if (Array.isArray(json.biometrics.bp)) {
            if (!state.importedData.biometrics.bp) state.importedData.biometrics.bp = [];
            for (const e of json.biometrics.bp) {
              if (!e.date) continue;
              if (!state.importedData.biometrics.bp.some(x => x.date === e.date)) {
                state.importedData.biometrics.bp.push(e);
              }
            }
            state.importedData.biometrics.bp.sort((a, b) => a.date.localeCompare(b.date));
          }
        }
      }
      // Import marker notes
      if (json.markerNotes && typeof json.markerNotes === 'object') {
        if (!state.importedData.markerNotes) state.importedData.markerNotes = {};
        Object.assign(state.importedData.markerNotes, json.markerNotes);
      }
      // Import per-value notes (keyed "category.markerKey:date")
      if (json.markerValueNotes && typeof json.markerValueNotes === 'object') {
        if (!state.importedData.markerValueNotes) state.importedData.markerValueNotes = {};
        Object.assign(state.importedData.markerValueNotes, json.markerValueNotes);
      }
      // Import manual value flags
      if (json.manualValues && typeof json.manualValues === 'object') {
        if (!state.importedData.manualValues) state.importedData.manualValues = {};
        Object.assign(state.importedData.manualValues, json.manualValues);
      }
      // Import Light & Sun stack (added v1.6.x; was missing from importDataJSON
      // entirely so demo + JSON imports silently dropped sun sessions, devices,
      // rooms, audits, measurements, sunDefaults, lightDailyVerdicts). Merge
      // semantics chosen to match other arrays here: id-keyed dedup for arrays,
      // first-write-wins for singletons so an in-progress profile keeps its
      // own setup over a re-import that lacks it.
      function _mergeArrayById(field) {
        if (!Array.isArray(json[field])) return;
        if (!Array.isArray(state.importedData[field])) state.importedData[field] = [];
        const known = new Set(state.importedData[field].map(x => x?.id).filter(Boolean));
        for (const item of json[field]) {
          if (!item || typeof item !== 'object') continue;
          if (item.id && known.has(item.id)) continue;
          state.importedData[field].push(item);
          if (item.id) known.add(item.id);
        }
      }
      _mergeArrayById('sunSessions');
      _mergeArrayById('deviceSessions');
      _mergeArrayById('lightDevices');
      _mergeArrayById('lightAudits');
      _mergeArrayById('lightMeasurements');
      // lightEnvironment is an object with `rooms` + `screens` + `burdenAI`.
      // Merge rooms/screens by id like the arrays above; burdenAI is a
      // singleton AI verdict — replace.
      if (json.lightEnvironment && typeof json.lightEnvironment === 'object') {
        if (!state.importedData.lightEnvironment) state.importedData.lightEnvironment = { rooms: [], screens: [] };
        for (const sub of ['rooms', 'screens']) {
          if (!Array.isArray(json.lightEnvironment[sub])) continue;
          if (!Array.isArray(state.importedData.lightEnvironment[sub])) state.importedData.lightEnvironment[sub] = [];
          const known = new Set(state.importedData.lightEnvironment[sub].map(x => x?.id).filter(Boolean));
          for (const item of json.lightEnvironment[sub]) {
            if (!item || typeof item !== 'object') continue;
            if (item.id && known.has(item.id)) continue;
            state.importedData.lightEnvironment[sub].push(item);
            if (item.id) known.add(item.id);
          }
        }
        if (json.lightEnvironment.burdenAI) state.importedData.lightEnvironment.burdenAI = json.lightEnvironment.burdenAI;
      }
      // Singletons — first-write-wins; re-importing a demo over an in-progress
      // profile keeps the user's own Light setup answers + correlations.
      for (const sk of ['sunDefaults', 'sunCorrelations', 'lifelightProfile']) {
        if (json[sk] && typeof json[sk] === 'object' && !state.importedData[sk]) {
          state.importedData[sk] = json[sk];
        }
      }
      // lightDailyVerdicts is a map keyed by ISO date — merge per-key.
      if (json.lightDailyVerdicts && typeof json.lightDailyVerdicts === 'object') {
        if (!state.importedData.lightDailyVerdicts) state.importedData.lightDailyVerdicts = {};
        for (const [date, verdict] of Object.entries(json.lightDailyVerdicts)) {
          if (!state.importedData.lightDailyVerdicts[date]) {
            state.importedData.lightDailyVerdicts[date] = verdict;
          }
        }
      }
      // channelMixAI is the singleton AI verdict for "Your light, by what
      // it does". Replace-on-import (matches lightEnvironment.burdenAI).
      // Without this branch, a demo / round-trip import silently dropped
      // the prefilled verdict — the channel-mix render then saw idle
      // status and auto-fired a real provider call against a freshly
      // loaded demo, defeating the no-API-on-demo guarantee.
      if (json.channelMixAI && typeof json.channelMixAI === 'object') {
        state.importedData.channelMixAI = json.channelMixAI;
      }
      // Biology Scores are gated behind a context review because the review can
      // send profile/lab context to the configured AI provider. Demo profiles
      // ship a locally-generated review from loadDemoData() so the feature is
      // visible immediately without spending a real LLM call.
      if (json.biologyScoreContextAI && typeof json.biologyScoreContextAI === 'object') {
        state.importedData.biologyScoreContextAI = json.biologyScoreContextAI;
      }
      // Import change history (merge by field+date, imported snapshot wins on conflict)
      if (Array.isArray(json.changeHistory)) {
        const changeHistory = ensureImportedArray(state.importedData, 'changeHistory');
        for (const entry of json.changeHistory) {
          if (!entry.field || !entry.date) continue;
          const idx = changeHistory.findIndex(e => e.field === entry.field && e.date === entry.date);
          if (idx >= 0) { replaceImportedArrayItem(state.importedData, 'changeHistory', idx, entry); }
          else { appendImportedArrayItem(state.importedData, 'changeHistory', entry); }
        }
        sortImportedArray(state.importedData, 'changeHistory', (a, b) => a.date.localeCompare(b.date));
        trimImportedArray(state.importedData, 'changeHistory', 200);
      }
      // Import wearable layer (added v1.27.1). The summary, card order, and
      // per-metric override flow in; raw L1 IDB rows do not (they're never
      // exported). On the destination device the strip will render with the
      // imported summary numbers, but the detail-modal chart will be empty
      // until the user re-OAuths each vendor — same shape as Evolu sync.
      if (json.wearableSummary && typeof json.wearableSummary === 'object') {
        state.importedData.wearableSummary = json.wearableSummary;
      }
      if (Array.isArray(json.wearableCardOrder)) {
        state.importedData.wearableCardOrder = json.wearableCardOrder;
      }
      if (json.wearablePrimaryOverride && typeof json.wearablePrimaryOverride === 'object') {
        // Prune entries pointing at sources that don't exist on this device
        // (no IDB rows yet, no connection record). The L2 picker would fall
        // through to auto anyway, but a stale override produces a misleading
        // ✓ in the source picker until the user re-OAuths the missing vendor.
        const liveSources = new Set([
          ...Object.keys(state.importedData?.wearableConnections || {}),
          ...Object.keys(json.wearableSummary?.sources || {}),
        ]);
        const pruned = {};
        for (const [metricId, sourceId] of Object.entries(json.wearablePrimaryOverride)) {
          if (liveSources.has(sourceId)) pruned[metricId] = sourceId;
        }
        state.importedData.wearablePrimaryOverride = pruned;
      }
      // Import chat summaries (merge by threadId)
      if (Array.isArray(json.chatSummaries)) {
        const chatSummaries = ensureImportedArray(state.importedData, 'chatSummaries');
        for (const s of json.chatSummaries) {
          if (!s.threadId) continue;
          const idx = chatSummaries.findIndex(e => e.threadId === s.threadId);
          if (idx >= 0) { replaceImportedArrayItem(state.importedData, 'chatSummaries', idx, s); }
          else { appendImportedArrayItem(state.importedData, 'chatSummaries', s); }
        }
      }
      // Import supplements
      if (json.supplements && Array.isArray(json.supplements)) {
        const supplements = ensureImportedArray(state.importedData, 'supplements');
        for (const s of json.supplements) {
          if (!s.name || !s.startDate) continue;
          const exists = supplements.some(x => x.name === s.name && x.startDate === s.startDate);
          if (!exists) {
            const entry = { name: s.name, dosage: s.dosage || '', startDate: s.startDate, endDate: s.endDate || null, type: s.type || 'supplement', note: s.note || '' };
            if (s.ingredients) entry.ingredients = s.ingredients;
            if (s.periods && s.periods.length > 1) entry.periods = s.periods;
            if (s.sourceUrl) {
              try {
                const sourceUrl = new URL(s.sourceUrl);
                if (sourceUrl.protocol === 'http:' || sourceUrl.protocol === 'https:') entry.sourceUrl = sourceUrl.toString();
              } catch {}
            }
            appendImportedArrayItem(state.importedData, 'supplements', entry);
          }
        }
      }
      // Import notes
      if (json.notes && Array.isArray(json.notes)) {
        const notes = ensureImportedArray(state.importedData, 'notes');
        for (const note of json.notes) {
          if (!note.date || !note.text) continue;
          // Avoid duplicates (same date + same text)
          const exists = notes.some(n => n.date === note.date && n.text === note.text);
          if (!exists) appendImportedArrayItem(state.importedData, 'notes', { date: note.date, text: note.text });
        }
      }
      migrateProfileData(state.importedData);
      saveImportedData((/** @type {any} */ (globalThis))._demoLoadingProfileId === state.currentProfile
        ? { skipSync: true, reason: 'demo-import' }
        : {});
      if (json.chat) {
        await _importChatData(state.currentProfile, json.chat);
        if (window.loadChatThreads) window.loadChatThreads();
      }
      // Demo-load completion: clear the loading sentinel (dashboard
      // empty-state renderer keys off this flag while data is en route).
      if (window._demoLoadingProfileId === state.currentProfile) {
        delete window._demoLoadingProfileId;
      }
      if (window.buildSidebar) window.buildSidebar();
      if (window.updateHeaderDates) window.updateHeaderDates();
      if (window.navigate) window.navigate('dashboard');
      const profileMsg = json.profile?.name ? ` into "${json.profile.name}"` : '';
      showNotification(`Imported ${count} date entr${count === 1 ? 'y' : 'ies'}${profileMsg}`, 'success');
    } catch (err) {
      delete window._demoLoadingProfileId;
      showNotification('Error parsing JSON: ' + err.message, 'error');
    } finally {
      resolve();
    }
  };
  reader.readAsText(file);
  });
}

async function _importDatabaseBundle(json) {
  const profiles = getProfiles();
  let created = 0, merged = 0, firstImportedId = null;
  for (const bp of json.profiles) {
    if (!bp.name && !bp.id) continue;
    // Match by id first, then by name
    let existing = profiles.find(p => p.id === bp.id);
    if (!existing && bp.name) existing = profiles.find(p => p.name === bp.name);
    const importData = bp.data || {};
    if (existing) {
      // Merge into existing profile — update metadata from bundle
      if (!firstImportedId) firstImportedId = existing.id;
      const meta = {};
      if (bp.name) meta.name = bp.name;
      if (bp.sex) meta.sex = bp.sex;
      if (bp.dob) meta.dob = bp.dob;
      if (bp.location) meta.location = bp.location;
      if (Array.isArray(bp.tags) && bp.tags.length) meta.tags = bp.tags;
      if (bp.notes) meta.notes = bp.notes;
      if (bp.status && bp.status !== 'active') meta.status = bp.status;
      if (bp.avatar) meta.avatar = bp.avatar;
      if (bp.pinned) meta.pinned = bp.pinned;
      if (bp.height) { meta.height = bp.height; meta.heightUnit = bp.heightUnit || 'cm'; }
      if (Object.keys(meta).length) updateProfileMeta(existing.id, meta);
      const storageKey = profileStorageKey(existing.id, 'imported');
      const raw = await encryptedGetItem(storageKey);
      let current;
      try { current = raw ? JSON.parse(raw) : {}; } catch { current = {}; }
      // Entries: date-keyed upsert
      if (Array.isArray(importData.entries)) {
        const entries = ensureImportedArray(current, 'entries');
        for (const entry of importData.entries) {
          if (!entry.date || !entry.markers) continue;
          const idx = entries.findIndex(ex => ex.date === entry.date);
          if (idx >= 0) { replaceImportedArrayItem(current, 'entries', idx, entry); }
          else { appendImportedArrayItem(current, 'entries', entry); }
        }
      }
      // Notes: deduplicate by date+text
      if (Array.isArray(importData.notes)) {
        const notes = ensureImportedArray(current, 'notes');
        for (const n of importData.notes) {
          if (!n.date || !n.text) continue;
          if (!notes.some(x => x.date === n.date && x.text === n.text)) appendImportedArrayItem(current, 'notes', n);
        }
      }
      // Supplements: deduplicate by name+startDate
      if (Array.isArray(importData.supplements)) {
        const supplements = ensureImportedArray(current, 'supplements');
        for (const s of importData.supplements) {
          if (!s.name || !s.startDate) continue;
          if (!supplements.some(x => x.name === s.name && x.startDate === s.startDate)) appendImportedArrayItem(current, 'supplements', s);
        }
      }
      // Health goals: deduplicate by text
      if (Array.isArray(importData.healthGoals)) {
        const healthGoals = ensureImportedArray(current, 'healthGoals');
        for (const g of importData.healthGoals) {
          if (!g.text) continue;
          if (!healthGoals.some(x => x.text === g.text)) appendImportedArrayItem(current, 'healthGoals', g);
        }
      }
      // Custom markers: merge (don't overwrite existing)
      if (importData.customMarkers && typeof importData.customMarkers === 'object') {
        if (!current.customMarkers) current.customMarkers = {};
        for (const [key, def] of Object.entries(importData.customMarkers)) {
          if (!current.customMarkers[key]) current.customMarkers[key] = def;
        }
      }
      // Ref overrides: merge (don't overwrite existing)
      if (importData.refOverrides && typeof importData.refOverrides === 'object') {
        if (!current.refOverrides) current.refOverrides = {};
        for (const [key, ovr] of Object.entries(importData.refOverrides)) {
          if (!current.refOverrides[key]) current.refOverrides[key] = ovr;
        }
      }
      // Context fields: replace if present in bundle
      for (const field of ['diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress', 'loveLife', 'environment', 'menstrualCycle', 'emfAssessment', 'genetics', 'biometrics']) {
        if (importData[field] != null) current[field] = importData[field];
      }
      if (importData.interpretiveLens) current.interpretiveLens = importData.interpretiveLens;
      if (importData.contextNotes) current.contextNotes = importData.contextNotes;
      // Change history: merge by field+date, imported snapshot wins on conflict
      if (Array.isArray(importData.changeHistory)) {
        const changeHistory = ensureImportedArray(current, 'changeHistory');
        for (const entry of importData.changeHistory) {
          if (!entry.field || !entry.date) continue;
          const idx = changeHistory.findIndex(e => e.field === entry.field && e.date === entry.date);
          if (idx >= 0) { replaceImportedArrayItem(current, 'changeHistory', idx, entry); }
          else { appendImportedArrayItem(current, 'changeHistory', entry); }
        }
        sortImportedArray(current, 'changeHistory', (a, b) => a.date.localeCompare(b.date));
        trimImportedArray(current, 'changeHistory', 200);
      }
      // Chat summaries: merge by threadId
      if (Array.isArray(importData.chatSummaries)) {
        const chatSummaries = ensureImportedArray(current, 'chatSummaries');
        for (const s of importData.chatSummaries) {
          if (!s.threadId) continue;
          const idx = chatSummaries.findIndex(e => e.threadId === s.threadId);
          if (idx >= 0) { replaceImportedArrayItem(current, 'chatSummaries', idx, s); }
          else { appendImportedArrayItem(current, 'chatSummaries', s); }
        }
      }
      // Display overrides: merge labels/icons/manualValues (don't overwrite existing)
      for (const field of ['categoryLabels', 'categoryIcons', 'markerLabels', 'manualValues']) {
        if (importData[field] && typeof importData[field] === 'object') {
          if (!current[field]) current[field] = {};
          for (const [k, v] of Object.entries(importData[field])) {
            if (!current[field][k]) current[field][k] = v;
          }
        }
      }
      // Save
      migrateProfileData(current);
      const value = JSON.stringify(current);
      await encryptedSetItem(storageKey, value);
      if (bp.chat) await _importChatData(existing.id, bp.chat);
      merged++;
    } else {
      // Create new profile
      const id = createProfile(bp.name || 'Imported', {
        sex: bp.sex || null, dob: bp.dob || null,
        location: bp.location || { country: '', zip: '' },
        tags: bp.tags || [], notes: bp.notes || '',
        status: bp.status || 'active', avatar: bp.avatar || null,
        height: bp.height || null, heightUnit: bp.heightUnit || 'cm'
      });
      if (!firstImportedId) firstImportedId = id;
      if (bp.pinned) updateProfileMeta(id, { pinned: true });
      // Write data
      const storageKey = profileStorageKey(id, 'imported');
      migrateProfileData(importData);
      const value = JSON.stringify(importData);
      await encryptedSetItem(storageKey, value);
      if (bp.chat) await _importChatData(id, bp.chat);
      created++;
    }
  }
  // Switch to the first imported profile (so user lands on real data, not empty default)
  const targetId = firstImportedId || state.currentProfile;
  await loadProfile(targetId);
  // Restore Cashu wallet settings if present (mnemonic not included — user restores via seed phrase)
  if (json.wallet) {
    try {
      if (json.wallet.mnemonic && typeof window.cashuRestoreWalletFromSeed === 'function') {
        await window.cashuRestoreWalletFromSeed(json.wallet.mnemonic); // legacy bundles that included mnemonic
      }
      if (json.wallet.mintUrl && typeof window.cashuSetMintUrl === 'function') await window.cashuSetMintUrl(json.wallet.mintUrl);
      if (json.wallet.nodeUrl && typeof window.nostrSetSelectedNode === 'function') window.nostrSetSelectedNode(json.wallet.nodeUrl);
    } catch (e) {
      if (isDebugMode()) console.log('[import] Wallet restore failed:', e.message);
    }
  }
  const total = created + merged;
  showNotification(`Imported ${total} profile${total !== 1 ? 's' : ''} (${created} new, ${merged} merged)`, 'success');
}

export async function clearAllData() {
  const profiles = getProfiles();
  const msg = profiles.length > 1
    ? `Clear ALL data across ${profiles.length} profiles? This cannot be undone.`
    : 'Are you sure you want to clear all imported data? This cannot be undone.';
  if (await showConfirmDialog(msg)) {
    // Wipe storage for every profile
    for (const p of profiles) {
      const id = p.id;
      // The `-imported` blob lives in IndexedDB now → encryptedRemoveItem
      // hits both backends so the IDB residue is also wiped.
      await encryptedRemoveItem(profileStorageKey(id, 'imported'));
      localStorage.removeItem(profileStorageKey(id, 'units'));
      localStorage.removeItem(profileStorageKey(id, 'suppOverlay'));
      localStorage.removeItem(profileStorageKey(id, 'noteOverlay'));
      localStorage.removeItem(profileStorageKey(id, 'rangeMode'));
      localStorage.removeItem(profileStorageKey(id, 'suppImpact'));
      localStorage.removeItem(`labcharts-${id}-chat`);
      let threadIndexRaw;
      if (getEncryptionEnabled()) {
        try { threadIndexRaw = await encryptedGetItem(`labcharts-${id}-chat-threads`); } catch { threadIndexRaw = null; }
      } else {
        threadIndexRaw = localStorage.getItem(`labcharts-${id}-chat-threads`);
      }
      if (threadIndexRaw) {
        try { for (const t of JSON.parse(threadIndexRaw)) localStorage.removeItem(`labcharts-${id}-chat-t_${t.id}`); } catch {}
        localStorage.removeItem(`labcharts-${id}-chat-threads`);
      }
      localStorage.removeItem(`labcharts-${id}-chatRailOpen`);
      localStorage.removeItem(`labcharts-${id}-chatPersonality`);
      localStorage.removeItem(`labcharts-${id}-chatPersonalityCustom`);
      localStorage.removeItem(`labcharts-${id}-focusCard`);
      localStorage.removeItem(`labcharts-${id}-contextHealth`);
      localStorage.removeItem(`labcharts-${id}-onboarded`);
      localStorage.removeItem(`labcharts-${id}-emptyTour`);
      localStorage.removeItem(`labcharts-${id}-tour`);
      localStorage.removeItem(`labcharts-${id}-cycleTour`);
      localStorage.removeItem(`labcharts-${id}-phaseOverlay`);
      localStorage.removeItem(`labcharts-${id}-sync-ts`);
    }
    // Reset to single default profile
    const defaultId = profiles[0]?.id || 'default';
    const defaultName = profiles[0]?.name || 'Profile 1';
    saveProfiles([{ id: defaultId, name: defaultName, sex: null, dob: null, location: { country: '', zip: '' }, tags: [], notes: '', status: 'active', avatar: null, height: null, heightUnit: 'cm', createdAt: Date.now(), lastUpdated: Date.now(), pinned: false }]);
    state.importedData = { entries: [], notes: [], supplements: [], healthGoals: [], diagnoses: null, diet: null, exercise: null, sleepRest: null, lightCircadian: null, stress: null, loveLife: null, environment: null, interpretiveLens: '', contextNotes: '', customMarkers: {}, refOverrides: {}, menstrualCycle: null, emfAssessment: null, genetics: null, biometrics: null, markerNotes: {}, markerValueNotes: {}, biologyScoreAI: {}, changeHistory: [] };
    state.currentProfile = defaultId;
    localStorage.setItem('labcharts-active-profile', defaultId);
    // Clear Cashu wallet database
    if (typeof window.cashuDestroyWalletDB === 'function') {
      try { await window.cashuDestroyWalletDB(); } catch {}
    }
    localStorage.removeItem('labcharts-cashu-wallet-mint');
    localStorage.removeItem('labcharts-cashu-wallet-mnemonic');
    localStorage.removeItem('labcharts-routstr-node');
    localStorage.removeItem('labcharts-routstr-key');
    localStorage.removeItem('labcharts-routstr-model');
    localStorage.removeItem('labcharts-routstr-models');
    if (window.buildSidebar) window.buildSidebar();
    if (window.updateHeaderDates) window.updateHeaderDates();
    if (window.renderProfileButton) window.renderProfileButton();
    if (window.navigate) window.navigate('dashboard');
    showNotification('All data cleared', 'info');
  }
}

export async function loadDemoData(sex = 'male') {
  try {
    const file = sex === 'female' ? 'data/demo-female.json' : 'data/demo-male.json';
    const resp = await fetch(file);
    if (!resp.ok) throw new Error('Failed to load');
    const blob = await resp.blob();
    const { createProfile, switchProfile, setProfileSex, setProfileDob } = await import('./profile.js');
    const name = sex === 'female' ? 'Demo Sarah' : 'Demo Alex';
    const dob = sex === 'female' ? '1991-08-15' : '1987-11-22';
    const location = sex === 'female'
      ? { country: 'Czech Republic', zip: '11000' }
      : { country: 'United States', zip: '80301' };
    const avatar = sex === 'female'
      ? 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MCcgaGVpZ2h0PSc4MCcgdmlld0JveD0nMCAwIDgwIDgwJz4KPGNpcmNsZSBjeD0nNDAnIGN5PSc0MCcgcj0nNDAnIGZpbGw9JyNmMGM4YTAnLz4KPGVsbGlwc2UgY3g9JzQwJyBjeT0nMjgnIHJ4PScyMicgcnk9JzIwJyBmaWxsPScjNmIzYTJhJy8+CjxlbGxpcHNlIGN4PSc0MCcgY3k9JzQ4JyByeD0nMTYnIHJ5PScxOCcgZmlsbD0nI2Y1ZDViOCcvPgo8Y2lyY2xlIGN4PSczMycgY3k9JzQ0JyByPScyJyBmaWxsPScjNGEzNzI4Jy8+CjxjaXJjbGUgY3g9JzQ3JyBjeT0nNDQnIHI9JzInIGZpbGw9JyM0YTM3MjgnLz4KPHBhdGggZD0nTTM2IDUyIFE0MCA1NiA0NCA1Micgc3Ryb2tlPScjYzQ3YTZhJyBzdHJva2Utd2lkdGg9JzEuNScgZmlsbD0nbm9uZScgc3Ryb2tlLWxpbmVjYXA9J3JvdW5kJy8+CjxwYXRoIGQ9J00xOCAzMCBRMjAgMTIgNDAgMTAgUTYwIDEyIDYyIDMwIFE1OCAyMiA0MCAyMCBRMjIgMjIgMTggMzBaJyBmaWxsPScjNmIzYTJhJy8+CjxwYXRoIGQ9J00xNiAzNSBRMTQgMjAgMjUgMTUnIHN0cm9rZT0nIzZiM2EyYScgc3Ryb2tlLXdpZHRoPSc2JyBmaWxsPSdub25lJyBzdHJva2UtbGluZWNhcD0ncm91bmQnLz4KPHBhdGggZD0nTTY0IDM1IFE2NiAyMCA1NSAxNScgc3Ryb2tlPScjNmIzYTJhJyBzdHJva2Utd2lkdGg9JzYnIGZpbGw9J25vbmUnIHN0cm9rZS1saW5lY2FwPSdyb3VuZCcvPgo8L3N2Zz4='
      : 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MCcgaGVpZ2h0PSc4MCcgdmlld0JveD0nMCAwIDgwIDgwJz4KPGNpcmNsZSBjeD0nNDAnIGN5PSc0MCcgcj0nNDAnIGZpbGw9JyNkNGE4N2MnLz4KPGVsbGlwc2UgY3g9JzQwJyBjeT0nNDgnIHJ4PScxNycgcnk9JzE4JyBmaWxsPScjZThjNGEwJy8+CjxyZWN0IHg9JzIwJyB5PScxNCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzIyJyByeD0nOCcgZmlsbD0nIzNhMmExYScvPgo8Y2lyY2xlIGN4PSczMycgY3k9JzQ0JyByPScyJyBmaWxsPScjM2EyYTFhJy8+CjxjaXJjbGUgY3g9JzQ3JyBjeT0nNDQnIHI9JzInIGZpbGw9JyMzYTJhMWEnLz4KPHBhdGggZD0nTTM2IDUzIFE0MCA1NiA0NCA1Mycgc3Ryb2tlPScjYjA3MDYwJyBzdHJva2Utd2lkdGg9JzEuNScgZmlsbD0nbm9uZScgc3Ryb2tlLWxpbmVjYXA9J3JvdW5kJy8+CjxyZWN0IHg9JzMwJyBjeT0nNTgnIHk9JzU5JyB3aWR0aD0nMjAnIGhlaWdodD0nMycgcng9JzEnIGZpbGw9JyM4YjZiNTAnIG9wYWNpdHk9JzAuNCcvPgo8L3N2Zz4=';
    const height = sex === 'female' ? 168 : 182;
    const profileId = createProfile(name, { sex, dob, location, avatar, tags: ['demo'], height, heightUnit: 'cm', skipInitialSync: true });
    // Remove empty Default profile when loading demo data
    const { getProfiles, saveProfiles: saveProfileList } = await import('./profile.js');
    const allProfiles = getProfiles();
    const emptyDefault = allProfiles.find(p => p.id === 'default');
    if (emptyDefault) {
      // `labcharts-default-imported` matches the `*-imported` suffix and now
      // lives in IndexedDB. encryptedGetItem migrates from localStorage on
      // first read, so this works whether the value is in either place.
      const defaultRaw = await encryptedGetItem('labcharts-default-imported');
      const defaultData = defaultRaw ? JSON.parse(defaultRaw) : {};
      if (!defaultData.entries || defaultData.entries.length === 0) {
        await saveProfileList(allProfiles.filter(p => p.id !== 'default'));
        await encryptedRemoveItem('labcharts-default-imported');
      }
    }
    // Mark the loading window so the dashboard renderer shows a
    // "Loading demo data…" placeholder instead of the empty Welcome
    // hero during the 2-3s gap between switchProfile and
    // importDataJSON-finish. Cleared by the import completion path.
    window._demoLoadingProfileId = profileId;
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
    try { demoJson = JSON.parse(await blob.text()); } catch (_) {}
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
            setLabEntryMarker(existing, key, value, { now: _ctxImportTs, mirrorInsulin: true });
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
          const fingerprints = {};
          for (const k of Object.keys(demoJson.contextHealth.dots)) {
            dots[k] = demoJson.contextHealth.dots[k];
            summaries[k] = demoJson.contextHealth.summaries?.[k] || '';
            try { fingerprints[k] = getCardFingerprint(k, ctx); } catch (_) {}
          }
          localStorage.setItem(cacheKey, JSON.stringify({ dots, summaries, fingerprints }));
        }

        // Biology Scores use a manual AI context gate in normal profiles. For
        // demos, generate the same fingerprint shape locally against the exact
        // post-import data shape so Alex/Sarah land directly on unlocked scores
        // without calling the user's provider.
        try {
          const previousImportedData = state.importedData;
          const previousSex = state.profileSex;
          const previousDob = state.profileDob;
          const { getActiveData, invalidateActiveDataCache } = await import('./data.js');
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
      const { getActiveData, invalidateActiveDataCache, filterDatesByRange } = await import('./data.js');
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
        const w = /** @type {any} */ (window);
        if (w.buildSidebar) w.buildSidebar();
        if (w.updateHeaderDates) w.updateHeaderDates();
        if (w.navigate && state.currentView === 'biology-scores') w.navigate('biology-scores');
      }
    } catch (_) { /* demo Biology Scores post-import unlock is best-effort */ }
  } catch (err) {
    delete window._demoLoadingProfileId;
    showNotification('Could not load demo data: ' + err.message, 'error');
  }
}

Object.assign(window, { openReportBuilder, closeReportBuilder, generateReportAISummary, exportPDFReport, exportDataJSON, exportClientJSON, exportAllDataJSON, buildAllDataBundle, importDataJSON, clearAllData, loadDemoData });
