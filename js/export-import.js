// @ts-check
// export-import.js — JSON import/restore helpers for the export facade.

import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { showNotification, isDebugMode } from './utils.js';
import { saveImportedData } from './data.js';
import { getProfiles, profileStorageKey, createProfile, updateProfileMeta, loadProfile, migrateProfileData } from './profile.js';
import { encryptedGetItem, encryptedSetItem, getEncryptionEnabled } from './crypto.js';
import {
  appendImportedArrayItem,
  clearTombstone,
  ensureImportedArray,
  replaceImportedArrayItem,
  sortImportedArray,
  trimImportedArray,
} from './data-merge.js';
import { findOrCreateLabEntry } from './lab-entry-mutations.js';
import { setLabEntryMarker } from './lab-entry.js';
import {
  clearDemoLoadingProfile,
  isDemoLoadingProfile,
  refreshImportRuntimeShell,
} from './export-runtime.js';
import { setSelectedNodeUrl } from './nostr-discovery.js';
import {
  normalizeChatBackup,
  normalizeChatThreads,
} from './chat-storage-safety.js';
import {
  saveCustomPersonalitiesToStorage,
  saveCustomPersonalityTombstones,
} from './chat-personality-storage.js';

async function _importChatData(profileId, chat) {
  const importedChat = normalizeChatBackup(chat);
  if (importedChat.threads.length > 0) {
    // Read existing threads to merge
    let existingRaw;
    if (getEncryptionEnabled()) {
      try { existingRaw = await encryptedGetItem(`labcharts-${profileId}-chat-threads`); } catch { existingRaw = null; }
    } else {
      existingRaw = localStorage.getItem(`labcharts-${profileId}-chat-threads`);
    }
    let existing;
    try { existing = existingRaw ? JSON.parse(existingRaw) : []; } catch { existing = []; }
    existing = normalizeChatThreads(existing);
    const existingIds = new Set(existing.map(t => t.id));
    for (const t of importedChat.threads) {
      if (existingIds.has(t.id)) continue;
      if (existing.length >= 50) break;
      existing.push(t);
      existingIds.add(t.id);
      await encryptedSetItem(
        `labcharts-${profileId}-chat-t_${t.id}`,
        JSON.stringify(importedChat.messages[t.id] || []),
      );
    }
    await encryptedSetItem(`labcharts-${profileId}-chat-threads`, JSON.stringify(existing));
  }
  // Restore personality + custom personas (only if not already set)
  if (importedChat.personality && !localStorage.getItem(`labcharts-${profileId}-chatPersonality`)) {
    localStorage.setItem(`labcharts-${profileId}-chatPersonality`, importedChat.personality);
  }
  if (importedChat.customPersonalities.length > 0 && !localStorage.getItem(`labcharts-${profileId}-chatPersonalityCustom`)) {
    await saveCustomPersonalitiesToStorage(importedChat.customPersonalities, profileId);
  }
  if (Object.keys(importedChat.customPersonalityDeleted).length > 0
    && !localStorage.getItem(`labcharts-${profileId}-chatPersonalityDeleted`)) {
    await saveCustomPersonalityTombstones(importedChat.customPersonalityDeleted, profileId);
  }
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
    reader.onload = async () => {
      try {
        const json = JSON.parse(/** @type {string} */ (reader.result));
        // Guard: demo data should never be silently imported into a non-demo profile
        if (json._source === 'demo') {
          const profiles = getProfiles();
          const current = profiles.find(p => p.id === state.currentProfile);
          if (!current?.tags?.includes('demo')) {
            showNotification('Demo data detected. Use the dashboard "Load demo" button to create a demo profile, or switch to a demo profile before importing.', 'error');
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
          const profileId = await createProfile(p.name, {
            sex: p.sex || null, dob: p.dob || null, location: p.location || null, tags: p.tags || [],
            avatar: p.avatar || null,
            height: p.height || null, heightUnit: p.heightUnit || 'cm',
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
        if (count === 0 && (!json.notes || json.notes.length === 0) && !json.chat) {
          showNotification('No valid entries found in JSON', 'error');
          return;
        }
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
              sleepRest: { duration: null, quality: null, schedule: null, issues: [], note: val.trim() },
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
        if (json.contextSourceSettings && typeof json.contextSourceSettings === 'object') {
          state.importedData.contextSourceSettings = json.contextSourceSettings;
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
        // Import import snapshots (issue #39)
        if (Array.isArray(json.importSnapshots)) {
          if (!state.importedData.importSnapshots) state.importedData.importSnapshots = [];
          for (const snap of json.importSnapshots) {
            if (snap && snap.id) {
              clearTombstone(state.importedData, 'importSnapshots', snap.id);
              const idx = state.importedData.importSnapshots.findIndex(s => s.id === snap.id);
              if (idx >= 0) {
                const existingAt = Number(state.importedData.importSnapshots[idx]?.importedAt) || 0;
                const incomingAt = Number(snap.importedAt) || 0;
                if (incomingAt >= existingAt) state.importedData.importSnapshots[idx] = snap;
              } else {
                state.importedData.importSnapshots.push(snap);
              }
            }
          }
          // Sort by importedAt descending (newest first)
          state.importedData.importSnapshots.sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0));
        }

        migrateProfileData(state.importedData);
        saveImportedData(isDemoLoadingProfile(state.currentProfile)
          ? { skipSync: true, reason: 'demo-import' }
          : {});
        if (json.chat) {
          await _importChatData(state.currentProfile, json.chat);
        }
        // Demo-load completion: clear the loading sentinel (dashboard
        // empty-state renderer keys off this flag while data is en route).
        clearDemoLoadingProfile(state.currentProfile);
        await refreshImportRuntimeShell({ chat: !!json.chat });
        const profileMsg = json.profile?.name ? ` into "${json.profile.name}"` : '';
        showNotification(`Imported ${count} date entr${count === 1 ? 'y' : 'ies'}${profileMsg}`, 'success');
      } catch (err) {
        clearDemoLoadingProfile();
        showNotification('Error parsing JSON: ' + getErrorMessage(err), 'error');
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
      if (Object.keys(meta).length) await updateProfileMeta(existing.id, meta);
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
      if (importData.contextSourceSettings && typeof importData.contextSourceSettings === 'object' && !Array.isArray(importData.contextSourceSettings)) {
        current.contextSourceSettings = importData.contextSourceSettings;
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
      // Import snapshots: merge by stable snapshot id
      if (Array.isArray(importData.importSnapshots)) {
        const importSnapshots = ensureImportedArray(current, 'importSnapshots');
        for (const snap of importData.importSnapshots) {
          if (snap?.id) {
            clearTombstone(current, 'importSnapshots', snap.id);
            const idx = importSnapshots.findIndex(s => s.id === snap.id);
            if (idx >= 0) {
              const existingAt = Number(importSnapshots[idx]?.importedAt) || 0;
              const incomingAt = Number(snap.importedAt) || 0;
              if (incomingAt >= existingAt) replaceImportedArrayItem(current, 'importSnapshots', idx, snap);
            } else {
              appendImportedArrayItem(current, 'importSnapshots', snap);
            }
          }
        }
        sortImportedArray(current, 'importSnapshots', (a, b) => (b.importedAt || 0) - (a.importedAt || 0));
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
      const id = await createProfile(bp.name || 'Imported', {
        sex: bp.sex || null, dob: bp.dob || null,
        location: bp.location || { country: '', zip: '' },
        tags: bp.tags || [], notes: bp.notes || '',
        status: bp.status || 'active', avatar: bp.avatar || null,
        height: bp.height || null, heightUnit: bp.heightUnit || 'cm',
      });
      if (!firstImportedId) firstImportedId = id;
      if (bp.pinned) await updateProfileMeta(id, { pinned: true });
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
  // Legacy bundles may include wallet identity fields. Deliberately restore
  // only the Routstr node: a seed or mint without proofs/counters/recovery
  // state is not a safe wallet backup.
  if (json.wallet) {
    try {
      if (json.wallet.nodeUrl) setSelectedNodeUrl(json.wallet.nodeUrl);
    } catch (e) {
      if (isDebugMode()) console.log('[import] Wallet restore failed:', getErrorMessage(e));
    }
  }
  const total = created + merged;
  showNotification(`Imported ${total} profile${total !== 1 ? 's' : ''} (${created} new, ${merged} merged)`, 'success');
}
