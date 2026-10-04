// export-import.js — JSON import/restore helpers for the export facade.

import type { ImportBodyOperations, ImportedDataOperations, ImportProfileOperations, ImportRowOperations, RawReplace, RawClear, RawTrim, RawFindLab, RawRestoreLab, RawCreateProfile, RawSaveProfile, RawMigrateProfile } from '../types/export-import.js';
import { mergeBiologyScoreAIRecords } from './biology-score-persistence.js';
import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { onProfileSaved } from './sync-save-hooks.js';
import { adoptProfileData } from './profile-data-writes.js';
import { showNotification, showConfirmDialog, isDebugMode } from './utils.js';
import { saveImportedData, saveImportedDataForProfile, invalidateActiveDataCache } from './data.js';
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
import { mergeRestoredLabEntry } from './lab-entry-restore.js';
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

const MAX_PORTABLE_JSON_BYTES = 512 * 1024 * 1024;

async function confirmRegimenImport(target: ImportedDataOperations, records: unknown) {
  const conflicts = (Array.isArray(records) ? records : []).filter(s => s?.id && target.supplements?.some(x => x.id === s.id && JSON.stringify(x) !== JSON.stringify(s)));
  return !conflicts.length || showConfirmDialog(`Replace saved regimens (${conflicts.map(s => s.name).join(', ')})? Imported versions replace dose history and remove omitted fields. Other data imports either way.`, {
    confirmLabel: 'Use imported', cancelLabel: 'Keep saved', ariaLabel: 'Conflicting regimens',
  });
}

function importSupplements(target: ImportedDataOperations, records: unknown, replace: unknown) {
  if (!Array.isArray(records)) return;
  const supplements = ensureImportedArray(target, 'supplements');
  for (const s of records) {
    if (!s?.name || !s.startDate) continue;
    const index = s.id ? supplements.findIndex(x => x.id === s.id) : -1;
    if (index < 0 && supplements.some(x => x.name === s.name && x.startDate === s.startDate)) continue;
    if (index >= 0 && !replace) continue;
    const entry = { dosage: '', endDate: null, type: 'supplement', note: '', ...s };
    const sourceUrl = entry.sourceUrl;
    delete entry.sourceUrl;
    try {
      const url = new URL(sourceUrl);
      if (url.protocol === 'http:' || url.protocol === 'https:') entry.sourceUrl = url.toString();
    } catch {}
    if (index >= 0) (replaceImportedArrayItem as RawReplace)(target, 'supplements', index, entry);
    else appendImportedArrayItem(target, 'supplements', entry);
  }
}

async function _importNutritionData(profileId: string, nutrition: unknown) {
  if (!nutrition) return 0;
  const { restoreNutritionArchive } = await import('./nutrition-store.js');
  return restoreNutritionArchive(profileId, nutrition);
}

function _reviveImportedProfileSyncIdentity(profileId: string) {
  try {
    localStorage.removeItem(`labcharts-profile-delete-intent-${profileId}`);
    localStorage.removeItem(`labcharts-tombstone-pending-${profileId}`);
  } catch {}
}

async function _importChatData(profileId: string, chat: unknown) {
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

export function importDataJSON(file: File) {
  if (Number(file?.size || 0) > MAX_PORTABLE_JSON_BYTES) {
    showNotification('This backup is too large to import safely in the browser.', 'error');
    return Promise.resolve();
  }
  // Returns a Promise that resolves when the FileReader pipeline finishes
  // (success OR error). Existing fire-and-forget callers (`importDataJSON(file)`)
  // ignore the return value and behave identically; the demo loader awaits
  // it to compute fingerprints against the imported state.
  return new Promise<void>((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve();
    reader.onload = async () => {
      let rollback: string | null | undefined = null, rollbackProfile: string | null = null, rollbackData: unknown = null;
      try {
        const json = JSON.parse((reader.result as string)) as ImportBodyOperations;
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
        const hasNutrition = json.nutrition?.version === 1 && Array.isArray(json.nutrition?.meals);
        if ((!json.entries || !Array.isArray(json.entries)) && !hasNutrition) {
          showNotification('Invalid JSON format: missing entries array', 'error');
          return;
        }
        // v2 client export with profile metadata — create a new profile
        if (json.profile?.name) {
          const p = json.profile;
          const profileId = await (createProfile as RawCreateProfile)(p.name, {
            sex: p.sex || null, dob: p.dob || null, location: p.location || null, tags: p.tags || [],
            avatar: p.avatar || null,
            height: p.height || null, heightUnit: p.heightUnit || 'cm',
          });
          await loadProfile(profileId);
        }
        rollback = JSON.stringify((state.importedData as ImportedDataOperations));
        rollbackProfile = state.currentProfile;
        rollbackData = (state.importedData as ImportedDataOperations);
        const replaceRegimens = await confirmRegimenImport(rollbackData as ImportedDataOperations, json.supplements);
        if (state.currentProfile !== rollbackProfile || JSON.stringify((state.importedData as ImportedDataOperations)) !== rollback) {
          showNotification('Profile changed. Retry import.', 'info'); return;
        }
        let count = 0;
        const importTs = Date.now();
        for (const entry of json.entries || []) {
          if (!entry.date || !entry.markers) continue;
          // Earlier draft did `filter(ex => ex.date !== entry.date)` — same-
          // date entries clobbered each other. The demos legitimately ship
          // two entries per date (comprehensive panel + specialty add-on
          // like an OmegaQuant fatty-acid run on the same draw day) and the
          // second entry was silently dropped, losing every fatty-acid /
          // specialty marker on import. Merge markers + markerSources
          // instead so all data lands; later entries win on key conflicts.
          const existing = ((findOrCreateLabEntry as RawFindLab)((state.importedData as ImportedDataOperations), entry.date, { now: importTs }));
          const restored = (mergeRestoredLabEntry as RawRestoreLab)(existing, entry, importTs);
          (replaceImportedArrayItem as RawReplace)((state.importedData as ImportedDataOperations), 'entries', (state.importedData as ImportedDataOperations).entries!.indexOf(existing as ImportRowOperations), restored);
          count++;
        }
        if (count === 0 && (!json.notes || json.notes.length === 0) && !json.chat && !hasNutrition) {
          showNotification('No valid entries found in JSON', 'error');
          return;
        }
        // Import context fields — handle both old string format (v1) and new object format (v2)
        function importContextField(field: 'diagnoses' | 'diet' | 'exercise' | 'sleepRest') {
          const val = json[field];
          if (!val) return;
          if (typeof val === 'object' && val !== null) {
            // v2 structured format — use directly
            (state.importedData as ImportedDataOperations)[field] = val;
          } else if (typeof val === 'string' && val.trim()) {
            // v1 legacy string — migrate to structured with note
            const migrations = {
              diagnoses: { conditions: [], note: val.trim() },
              diet: { type: null, restrictions: [], pattern: null, note: val.trim() },
              exercise: { frequency: null, types: [], intensity: null, dailyMovement: null, note: val.trim() },
              sleepRest: { duration: null, quality: null, schedule: null, issues: [], note: val.trim() },
            };
            if (migrations[field]) (state.importedData as ImportedDataOperations)[field] = migrations[field];
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
            const sleepIssues = (sc.issues || []).filter(i => !['blue light blockers', 'morning sunlight'].includes(i as string));
            const circPractices = (sc.issues || []).filter(i => ['blue light blockers', 'morning sunlight'].includes(i as string));
            (state.importedData as ImportedDataOperations).sleepRest = { duration: sc.duration || null, quality: sc.quality || null, schedule: sc.schedule || null, issues: sleepIssues, note: sc.note || '' };
            if (circPractices.length && !(state.importedData as ImportedDataOperations).lightCircadian) {
              (state.importedData as ImportedDataOperations).lightCircadian = { practices: circPractices, timing: null, mealTiming: [], note: '' };
            }
          } else if (typeof sc === 'string' && sc.trim()) {
            (state.importedData as ImportedDataOperations).sleepRest = { duration: null, quality: null, schedule: null, issues: [], note: sc.trim() };
          }
        } else {
          const parts = [json.circadian, json.sleep].filter(s => typeof s === 'string' && s.trim());
          if (parts.length) (state.importedData as ImportedDataOperations).sleepRest = { duration: null, quality: null, schedule: null, issues: [], note: parts.map(s => (s as string).trim()).join('\n\n') };
        }
        if (json.lightCircadian && typeof json.lightCircadian === 'object') (state.importedData as ImportedDataOperations).lightCircadian = json.lightCircadian;
        // Import new context fields (v2 only)
        if (json.stress && typeof json.stress === 'object') (state.importedData as ImportedDataOperations).stress = json.stress;
        if (json.loveLife && typeof json.loveLife === 'object') (state.importedData as ImportedDataOperations).loveLife = json.loveLife;
        if (json.environment && typeof json.environment === 'object') (state.importedData as ImportedDataOperations).environment = json.environment;
        if (json.contextNotes && typeof json.contextNotes === 'string') (state.importedData as ImportedDataOperations).contextNotes = json.contextNotes;
        // Import interpretive lens (new merged field, or migrate old separate fields)
        if (json.interpretiveLens && typeof json.interpretiveLens === 'string' && json.interpretiveLens.trim()) {
          (state.importedData as ImportedDataOperations).interpretiveLens = json.interpretiveLens.trim();
        } else {
          const parts = [json.fieldExperts, json.fieldLens].filter(s => typeof s === 'string' && s.trim());
          if (parts.length) (state.importedData as ImportedDataOperations).interpretiveLens = parts.map(s => (s as string).trim()).join('\n\n');
        }
        // Import health goals (merge, deduplicate by text)
        if (json.healthGoals && Array.isArray(json.healthGoals)) {
          const healthGoals = ensureImportedArray((state.importedData as ImportedDataOperations), 'healthGoals');
          for (const g of json.healthGoals) {
            if (!g.text || !g.severity) continue;
            const exists = healthGoals.some(x => x.text === g.text);
            if (!exists) appendImportedArrayItem((state.importedData as ImportedDataOperations), 'healthGoals', { text: g.text, severity: g.severity });
          }
        }
        // Import custom markers (merge, don't overwrite existing definitions)
        if (json.customMarkers && typeof json.customMarkers === 'object') {
          if (!(state.importedData as ImportedDataOperations).customMarkers) (state.importedData as ImportedDataOperations).customMarkers = {};
          for (const [key, def] of Object.entries(json.customMarkers)) {
            if (!(state.importedData as ImportedDataOperations).customMarkers![key]) {
              (state.importedData as ImportedDataOperations).customMarkers![key] = def;
            }
          }
        }
        // Placement metadata is keyed by stable marker ID, so it composes
        // without changing any dotkey-indexed values or definitions.
        if (json.markerPlacements && typeof json.markerPlacements === 'object') {
          if (!(state.importedData as ImportedDataOperations).markerPlacements) (state.importedData as ImportedDataOperations).markerPlacements = {};
          for (const [key, placement] of Object.entries(json.markerPlacements)) {
            if (!(state.importedData as ImportedDataOperations).markerPlacements![key]) {
              (state.importedData as ImportedDataOperations).markerPlacements![key] = placement;
            }
          }
        }
        // Import reference range overrides (merge, don't overwrite)
        if (json.refOverrides && typeof json.refOverrides === 'object') {
          if (!(state.importedData as ImportedDataOperations).refOverrides) (state.importedData as ImportedDataOperations).refOverrides = {};
          for (const [key, ovr] of Object.entries(json.refOverrides)) {
            if (!(state.importedData as ImportedDataOperations).refOverrides![key]) (state.importedData as ImportedDataOperations).refOverrides![key] = ovr;
          }
        }
        // Import category label/icon overrides
        if (json.categoryLabels && typeof json.categoryLabels === 'object') {
          if (!(state.importedData as ImportedDataOperations).categoryLabels) (state.importedData as ImportedDataOperations).categoryLabels = {};
          Object.assign((state.importedData as ImportedDataOperations).categoryLabels!, json.categoryLabels);
        }
        if (json.categoryIcons && typeof json.categoryIcons === 'object') {
          if (!(state.importedData as ImportedDataOperations).categoryIcons) (state.importedData as ImportedDataOperations).categoryIcons = {};
          Object.assign((state.importedData as ImportedDataOperations).categoryIcons!, json.categoryIcons);
        }
        if (json.markerLabels && typeof json.markerLabels === 'object') {
          if (!(state.importedData as ImportedDataOperations).markerLabels) (state.importedData as ImportedDataOperations).markerLabels = {};
          Object.assign((state.importedData as ImportedDataOperations).markerLabels!, json.markerLabels);
        }
        // Import menstrual cycle
        if (json.menstrualCycle && typeof json.menstrualCycle === 'object') {
          if (!(state.importedData as ImportedDataOperations).menstrualCycle) {
            (state.importedData as ImportedDataOperations).menstrualCycle = json.menstrualCycle;
          } else {
            // Merge: overwrite profile fields, merge periods by startDate
            const mc = (state.importedData as ImportedDataOperations).menstrualCycle!;
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
          if (!(state.importedData as ImportedDataOperations).emfAssessment) {
            (state.importedData as ImportedDataOperations).emfAssessment = json.emfAssessment;
          } else {
            const existing = (state.importedData as ImportedDataOperations).emfAssessment!.assessments!;
            for (const a of json.emfAssessment.assessments) {
              if (!existing.some(x => x.id === a.id)) existing.push(a);
            }
          }
        }
        // Import genetics
        if (json.genetics && (json.genetics.snps || json.genetics.mtdna)) {
          (state.importedData as ImportedDataOperations).genetics = json.genetics;
        }
        // Import biometrics
        if (json.biometrics && typeof json.biometrics === 'object') {
          if (!(state.importedData as ImportedDataOperations).biometrics) {
            (state.importedData as ImportedDataOperations).biometrics = json.biometrics;
          } else {
            for (const metric of (['weight', 'pulse'] as const)) {
              if (Array.isArray(json.biometrics[metric])) {
                if (!(state.importedData as ImportedDataOperations).biometrics![metric]) (state.importedData as ImportedDataOperations).biometrics![metric] = [];
                for (const e of json.biometrics[metric]!) {
                  if (!e.date) continue;
                  if (!(state.importedData as ImportedDataOperations).biometrics![metric]!.some(x => x.date === e.date)) {
                    (state.importedData as ImportedDataOperations).biometrics![metric]!.push(e);
                  }
                }
                (state.importedData as ImportedDataOperations).biometrics![metric]!.sort((a, b) => (a.date as { localeCompare(other: unknown): number }).localeCompare(b.date));
              }
            }
            if (Array.isArray(json.biometrics.bp)) {
              if (!(state.importedData as ImportedDataOperations).biometrics!.bp) (state.importedData as ImportedDataOperations).biometrics!.bp = [];
              for (const e of json.biometrics.bp) {
                if (!e.date) continue;
                if (!(state.importedData as ImportedDataOperations).biometrics!.bp!.some(x => x.date === e.date)) {
                  (state.importedData as ImportedDataOperations).biometrics!.bp!.push(e);
                }
              }
              (state.importedData as ImportedDataOperations).biometrics!.bp!.sort((a, b) => (a.date as { localeCompare(other: unknown): number }).localeCompare(b.date));
            }
          }
        }
        // Import marker notes
        if (json.markerNotes && typeof json.markerNotes === 'object') {
          if (!(state.importedData as ImportedDataOperations).markerNotes) (state.importedData as ImportedDataOperations).markerNotes = {};
          Object.assign((state.importedData as ImportedDataOperations).markerNotes!, json.markerNotes);
        }
        // Import per-value notes (keyed "category.markerKey:date")
        if (json.markerValueNotes && typeof json.markerValueNotes === 'object') {
          if (!(state.importedData as ImportedDataOperations).markerValueNotes) (state.importedData as ImportedDataOperations).markerValueNotes = {};
          Object.assign((state.importedData as ImportedDataOperations).markerValueNotes!, json.markerValueNotes);
        }
        // Import manual value flags
        if (json.manualValues && typeof json.manualValues === 'object') {
          if (!(state.importedData as ImportedDataOperations).manualValues) (state.importedData as ImportedDataOperations).manualValues = {};
          Object.assign((state.importedData as ImportedDataOperations).manualValues!, json.manualValues);
        }
        // Manual wearable deletions are privacy state. Merge by the newest
        // deletion clock so importing an older backup cannot resurrect a
        // reading that was deleted later on this or another device.
        if (json.manualMetricTombstones && typeof json.manualMetricTombstones === 'object'
            && !Array.isArray(json.manualMetricTombstones)) {
          if (!(state.importedData as ImportedDataOperations).manualMetricTombstones) (state.importedData as ImportedDataOperations).manualMetricTombstones = {};
          for (const [key, deletedAt] of Object.entries(json.manualMetricTombstones)) {
            const incoming = Number(deletedAt) || 0;
            const current = Number((state.importedData as ImportedDataOperations).manualMetricTombstones![key]) || 0;
            if (incoming > current) (state.importedData as ImportedDataOperations).manualMetricTombstones![key] = incoming;
          }
        }
        // Import Light & Sun stack (added v1.6.x; was missing from importDataJSON
        // entirely so demo + JSON imports silently dropped sun sessions, devices,
        // rooms, audits, measurements, sunDefaults, lightDailyVerdicts). Merge
        // semantics chosen to match other arrays here: id-keyed dedup for arrays,
        // first-write-wins for singletons so an in-progress profile keeps its
        // own setup over a re-import that lacks it.
        function _mergeArrayById(field: 'sunSessions' | 'deviceSessions' | 'lightDevices' | 'lightAudits' | 'lightMeasurements') {
          if (!Array.isArray(json[field])) return;
          if (!Array.isArray((state.importedData as ImportedDataOperations)[field])) (state.importedData as ImportedDataOperations)[field] = [];
          const known = new Set((state.importedData as ImportedDataOperations)[field]!.map(x => x?.id).filter(Boolean));
          for (const item of json[field]) {
            if (!item || typeof item !== 'object') continue;
            if (item.id && known.has(item.id)) continue;
            (state.importedData as ImportedDataOperations)[field]!.push(item);
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
          if (!(state.importedData as ImportedDataOperations).lightEnvironment) (state.importedData as ImportedDataOperations).lightEnvironment = { rooms: [], screens: [] };
          for (const sub of ['rooms', 'screens'] as const) {
            if (!Array.isArray(json.lightEnvironment[sub])) continue;
            if (!Array.isArray((state.importedData as ImportedDataOperations).lightEnvironment![sub])) (state.importedData as ImportedDataOperations).lightEnvironment![sub] = [];
            const known = new Set((state.importedData as ImportedDataOperations).lightEnvironment![sub]!.map(x => x?.id).filter(Boolean));
            for (const item of json.lightEnvironment[sub]!) {
              if (!item || typeof item !== 'object') continue;
              if (item.id && known.has(item.id)) continue;
              (state.importedData as ImportedDataOperations).lightEnvironment![sub]!.push(item);
              if (item.id) known.add(item.id);
            }
          }
          if (json.lightEnvironment.burdenAI) (state.importedData as ImportedDataOperations).lightEnvironment!.burdenAI = json.lightEnvironment.burdenAI;
        }
        // Singletons — first-write-wins; re-importing a demo over an in-progress
        // profile keeps the user's own Light setup answers + correlations.
        for (const sk of ['sunDefaults', 'sunCorrelations', 'lifelightProfile']) {
          if (json[sk] && typeof json[sk] === 'object' && !(state.importedData as ImportedDataOperations)[sk]) {
            (state.importedData as ImportedDataOperations)[sk] = json[sk];
          }
        }
        // lightDailyVerdicts is a map keyed by ISO date — merge per-key.
        if (json.lightDailyVerdicts && typeof json.lightDailyVerdicts === 'object') {
          if (!(state.importedData as ImportedDataOperations).lightDailyVerdicts) (state.importedData as ImportedDataOperations).lightDailyVerdicts = {};
          for (const [date, verdict] of Object.entries(json.lightDailyVerdicts)) {
            if (!(state.importedData as ImportedDataOperations).lightDailyVerdicts![date]) {
              (state.importedData as ImportedDataOperations).lightDailyVerdicts![date] = verdict;
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
          (state.importedData as ImportedDataOperations).channelMixAI = json.channelMixAI;
        }
        // Preserve an optional saved context review; deterministic scores do
        // not need an AI review or a synthetic demo "unlock" record.
        if (json.biologyScoreContextAI && typeof json.biologyScoreContextAI === 'object') {
          (state.importedData as ImportedDataOperations).biologyScoreContextAI = json.biologyScoreContextAI;
        }
        // Merge saved range/window variants, retaining the latest matching evidence.
        if (json.biologyScoreAI && typeof json.biologyScoreAI === 'object' && !Array.isArray(json.biologyScoreAI)) {
          (state.importedData as ImportedDataOperations).biologyScoreAI ||= {};
          for (const [id, answer] of Object.entries(json.biologyScoreAI)) {
            if (['__proto__', 'constructor', 'prototype'].includes(id) || !answer || typeof (answer as {text?: unknown}).text !== 'string') continue;
            const existing = (state.importedData as ImportedDataOperations).biologyScoreAI![id];
            (state.importedData as ImportedDataOperations).biologyScoreAI![id] = mergeBiologyScoreAIRecords(existing, answer);
          }
        }
        if (json.contextSourceSettings && typeof json.contextSourceSettings === 'object') {
          (state.importedData as ImportedDataOperations).contextSourceSettings = json.contextSourceSettings;
        }
        if ([7, 30, 90].includes(Number(json.nutritionContextDays))) {
          (state.importedData as ImportedDataOperations).nutritionContextDays = (Number(json.nutritionContextDays) as 7 | 30 | 90);
        }
        if (json.nutritionTargets && typeof json.nutritionTargets === 'object' && !Array.isArray(json.nutritionTargets)) {
          (state.importedData as ImportedDataOperations).nutritionTargets = json.nutritionTargets;
        }
        // Import change history (merge by field+date, imported snapshot wins on conflict)
        if (Array.isArray(json.changeHistory)) {
          const changeHistory = ensureImportedArray((state.importedData as ImportedDataOperations), 'changeHistory');
          for (const entry of json.changeHistory) {
            if (!entry.field || !entry.date) continue;
            const idx = changeHistory.findIndex(e => e.field === entry.field && e.date === entry.date);
            if (idx >= 0) { (replaceImportedArrayItem as RawReplace)((state.importedData as ImportedDataOperations), 'changeHistory', idx, entry); }
            else { appendImportedArrayItem((state.importedData as ImportedDataOperations), 'changeHistory', entry); }
          }
          sortImportedArray((state.importedData as ImportedDataOperations), 'changeHistory', (a, b) => (a.date as { localeCompare(other: unknown): number }).localeCompare(b.date));
          (trimImportedArray as RawTrim)((state.importedData as ImportedDataOperations), 'changeHistory', 200);
        }
        // Import wearable layer (added v1.27.1). The summary, card order, and
        // per-metric override flow in; raw L1 IDB rows do not (they're never
        // exported). On the destination device the strip will render with the
        // imported summary numbers, but the detail-modal chart will be empty
        // until the user re-OAuths each vendor — same shape as Evolu sync.
        if (json.wearableSummary && typeof json.wearableSummary === 'object') {
          (state.importedData as ImportedDataOperations).wearableSummary = json.wearableSummary;
        }
        if (Array.isArray(json.wearableCardOrder)) {
          (state.importedData as ImportedDataOperations).wearableCardOrder = json.wearableCardOrder;
        }
        if (json.wearablePrimaryOverride && typeof json.wearablePrimaryOverride === 'object') {
          // Prune entries pointing at sources that don't exist on this device
          // (no IDB rows yet, no connection record). The L2 picker would fall
          // through to auto anyway, but a stale override produces a misleading
          // ✓ in the source picker until the user re-OAuths the missing vendor.
          const liveSources = new Set([
            ...Object.keys((state.importedData as ImportedDataOperations)?.wearableConnections || {}),
            ...Object.keys(json.wearableSummary?.sources || {}),
          ]);
          const pruned: Record<string, unknown> = {};
          for (const [metricId, sourceId] of Object.entries(json.wearablePrimaryOverride)) {
            if (liveSources.has(sourceId as string)) pruned[metricId] = sourceId;
          }
          (state.importedData as ImportedDataOperations).wearablePrimaryOverride = pruned;
        }
        // Import chat summaries (merge by threadId)
        if (Array.isArray(json.chatSummaries)) {
          const chatSummaries = ensureImportedArray((state.importedData as ImportedDataOperations), 'chatSummaries');
          for (const s of json.chatSummaries) {
            if (!s.threadId) continue;
            const idx = chatSummaries.findIndex(e => e.threadId === s.threadId);
            if (idx >= 0) { (replaceImportedArrayItem as RawReplace)((state.importedData as ImportedDataOperations), 'chatSummaries', idx, s); }
            else { appendImportedArrayItem((state.importedData as ImportedDataOperations), 'chatSummaries', s); }
          }
        }
        importSupplements((state.importedData as ImportedDataOperations), json.supplements, replaceRegimens);
        // Import notes
        if (json.notes && Array.isArray(json.notes)) {
          const notes = ensureImportedArray((state.importedData as ImportedDataOperations), 'notes');
          for (const note of json.notes) {
            if (!note.date || !note.text) continue;
            // Avoid duplicates (same date + same text)
            const exists = notes.some(n => n.date === note.date && n.text === note.text);
            if (!exists) appendImportedArrayItem((state.importedData as ImportedDataOperations), 'notes', { date: note.date, text: note.text });
          }
        }
        // Import import snapshots (issue #39)
        if (Array.isArray(json.importSnapshots)) {
          if (!(state.importedData as ImportedDataOperations).importSnapshots) (state.importedData as ImportedDataOperations).importSnapshots = [];
          for (const snap of json.importSnapshots) {
            if (snap && snap.id) {
              (clearTombstone as RawClear)((state.importedData as ImportedDataOperations), 'importSnapshots', snap.id);
              const idx = (state.importedData as ImportedDataOperations).importSnapshots!.findIndex(s => s.id === snap.id);
              if (idx >= 0) {
                const existingAt = Number((state.importedData as ImportedDataOperations).importSnapshots![idx]?.importedAt) || 0;
                const incomingAt = Number(snap.importedAt) || 0;
                if (incomingAt >= existingAt) (state.importedData as ImportedDataOperations).importSnapshots![idx] = snap;
              } else {
                (state.importedData as ImportedDataOperations).importSnapshots!.push(snap);
              }
            }
          }
          // Sort by importedAt descending (newest first)
          (state.importedData as ImportedDataOperations).importSnapshots!.sort((a, b) => ((b.importedAt || 0) as number) - ((a.importedAt || 0) as number));
        }

        (migrateProfileData as RawMigrateProfile)((state.importedData as ImportedDataOperations));
        const saved = await saveImportedData(isDemoLoadingProfile(state.currentProfile)
          ? { skipSync: true, reason: 'demo-import' }
          : {});
        if (!saved) throw new Error('The imported data could not be saved. Please retry.');
        rollback = null;
        if (json.chat) {
          await _importChatData(rollbackProfile, json.chat);
        }
        const mealCount = await _importNutritionData(rollbackProfile, json.nutrition);
        if (state.currentProfile !== rollbackProfile || (state.importedData as ImportedDataOperations) !== rollbackData) return;
        // Demo-load completion: clear the loading sentinel (dashboard
        // empty-state renderer keys off this flag while data is en route).
        clearDemoLoadingProfile(state.currentProfile);
        await refreshImportRuntimeShell({ chat: !!json.chat });
        const profileMsg = json.profile?.name ? ` into "${json.profile.name}"` : '';
        const mealMsg = mealCount ? ` and ${mealCount} meal${mealCount === 1 ? '' : 's'}` : '';
        showNotification(`Imported ${count} date entr${count === 1 ? 'y' : 'ies'}${mealMsg}${profileMsg}`, 'success');
      } catch (err) {
        if (rollback && state.currentProfile === rollbackProfile && (state.importedData as ImportedDataOperations) === rollbackData) { adoptProfileData((state.importedData as ImportedDataOperations), JSON.parse(rollback)); invalidateActiveDataCache(); }
        clearDemoLoadingProfile();
        showNotification('Could not import JSON: ' + getErrorMessage(err), 'error');
      } finally {
        resolve();
      }
    };
    reader.readAsText(file);
  });
}

async function _importDatabaseBundle(json: ImportBodyOperations) {
  const profiles = getProfiles();
  let created = 0, merged = 0, firstImportedId: string | null = null;
  const plans: Array<{bp: ImportProfileOperations; existing: ReturnType<typeof getProfiles>[number] | undefined; importData: ImportedDataOperations; key: string; raw: string | null; current: ImportedDataOperations; replaceRegimens: boolean}> = [];
  for (const bp of json.profiles!) {
    if (!bp.name && !bp.id) continue;
    // Match by id first, then by name
    let existing = profiles.find(p => p.id === bp.id);
    if (!existing && bp.name) existing = profiles.find(p => p.name === bp.name);
    const importData = (bp.data || {}) as ImportedDataOperations;
    if (existing && plans.some(p => p.existing?.id === existing.id)) throw new Error('Duplicate profile in bundle.');
    const key = existing ? profileStorageKey(existing.id, 'imported') : '';
    const raw = key ? await encryptedGetItem(key, { throwOnDecryptError: true }) : null;
    let current: ImportedDataOperations;
    try { current = raw ? JSON.parse(raw) : {}; } catch { current = {}; }
    const replaceRegimens = await confirmRegimenImport(current, importData.supplements);
    plans.push({ bp, existing, importData, key, raw, current, replaceRegimens });
  }
  // Resolve every conflict, then validate every snapshot before the first write.
  for (const p of plans) if (p.key && await encryptedGetItem(p.key, { throwOnDecryptError: true }) !== p.raw) throw new Error('Profile changed. Retry import.');
  try {
    for (const { bp, existing, importData, raw, current, replaceRegimens } of plans) {
      if (existing) {
        // Entries: date-keyed upsert
        if (Array.isArray(importData.entries)) {
          const entries = ensureImportedArray(current, 'entries');
          for (const entry of importData.entries) {
            if (!entry.date || !entry.markers) continue;
            const idx = entries.findIndex(ex => ex.date === entry.date);
            if (idx >= 0) { (replaceImportedArrayItem as RawReplace)(current, 'entries', idx, (mergeRestoredLabEntry as RawRestoreLab)(entries[idx], entry)); }
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
        importSupplements(current, importData.supplements, replaceRegimens);
        // Health goals: deduplicate by text
        if (Array.isArray(importData.healthGoals)) {
          const healthGoals = ensureImportedArray(current, 'healthGoals');
          for (const g of importData.healthGoals) {
            if (!g.text) continue;
            if (!healthGoals.some(x => x.text === g.text)) appendImportedArrayItem(current, 'healthGoals', g);
          }
        }
        // Context fields: replace if present in bundle
        for (const field of ['diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress', 'loveLife', 'environment', 'menstrualCycle', 'emfAssessment', 'genetics', 'biometrics']) {
          if (importData[field] != null) current[field] = importData[field];
        }
        if (importData.contextSourceSettings && typeof importData.contextSourceSettings === 'object' && !Array.isArray(importData.contextSourceSettings)) {
          current.contextSourceSettings = importData.contextSourceSettings;
        }
        if ([7, 30, 90].includes(Number(importData.nutritionContextDays))) {
          current.nutritionContextDays = (Number(importData.nutritionContextDays) as 7 | 30 | 90);
        }
        if (importData.nutritionTargets && typeof importData.nutritionTargets === 'object' && !Array.isArray(importData.nutritionTargets)) {
          current.nutritionTargets = importData.nutritionTargets;
        }
        if (importData.interpretiveLens) current.interpretiveLens = importData.interpretiveLens;
        if (importData.contextNotes) current.contextNotes = importData.contextNotes;
        // Change history: merge by field+date, imported snapshot wins on conflict
        if (Array.isArray(importData.changeHistory)) {
          const changeHistory = ensureImportedArray(current, 'changeHistory');
          for (const entry of importData.changeHistory) {
            if (!entry.field || !entry.date) continue;
            const idx = changeHistory.findIndex(e => e.field === entry.field && e.date === entry.date);
            if (idx >= 0) { (replaceImportedArrayItem as RawReplace)(current, 'changeHistory', idx, entry); }
            else { appendImportedArrayItem(current, 'changeHistory', entry); }
          }
          sortImportedArray(current, 'changeHistory', (a, b) => (a.date as { localeCompare(other: unknown): number }).localeCompare(b.date));
          (trimImportedArray as RawTrim)(current, 'changeHistory', 200);
        }
        // Chat summaries: merge by threadId
        if (Array.isArray(importData.chatSummaries)) {
          const chatSummaries = ensureImportedArray(current, 'chatSummaries');
          for (const s of importData.chatSummaries) {
            if (!s.threadId) continue;
            const idx = chatSummaries.findIndex(e => e.threadId === s.threadId);
            if (idx >= 0) { (replaceImportedArrayItem as RawReplace)(current, 'chatSummaries', idx, s); }
            else { appendImportedArrayItem(current, 'chatSummaries', s); }
          }
        }
        // Import snapshots: merge by stable snapshot id
        if (Array.isArray(importData.importSnapshots)) {
          const importSnapshots = ensureImportedArray(current, 'importSnapshots');
          for (const snap of importData.importSnapshots) {
            if (snap?.id) {
              (clearTombstone as RawClear)(current, 'importSnapshots', snap.id);
              const idx = importSnapshots.findIndex(s => s.id === snap.id);
              if (idx >= 0) {
                const existingAt = Number(importSnapshots[idx]?.importedAt) || 0;
                const incomingAt = Number(snap.importedAt) || 0;
                if (incomingAt >= existingAt) (replaceImportedArrayItem as RawReplace)(current, 'importSnapshots', idx, snap);
              } else {
                appendImportedArrayItem(current, 'importSnapshots', snap);
              }
            }
          }
          sortImportedArray(current, 'importSnapshots', (a, b) => ((b.importedAt || 0) as number) - ((a.importedAt || 0) as number));
        }
        // Marker definitions and display overrides: preserve existing values.
        for (const field of ['customMarkers', 'refOverrides', 'categoryLabels', 'categoryIcons', 'markerLabels', 'markerPlacements', 'manualValues']) {
          if (importData[field] && typeof importData[field] === 'object') {
            if (!current[field]) current[field] = {};
            for (const [k, v] of Object.entries(importData[field] as Record<string, unknown>)) {
              if (!(current[field] as Record<string, unknown>)[k]) (current[field] as Record<string, unknown>)[k] = v;
            }
          }
        }
        if (importData.manualMetricTombstones && typeof importData.manualMetricTombstones === 'object'
            && !Array.isArray(importData.manualMetricTombstones)) {
          if (!current.manualMetricTombstones) current.manualMetricTombstones = {};
          for (const [key, deletedAt] of Object.entries(importData.manualMetricTombstones)) {
            const incoming = Number(deletedAt) || 0;
            const existing = Number(current.manualMetricTombstones[key]) || 0;
            if (incoming > existing) current.manualMetricTombstones[key] = incoming;
          }
        }
        // Save
        const persisted = await (saveImportedDataForProfile as RawSaveProfile)(existing.id, current, {
          forceProfileScope: true, expectedData: raw, skipSync: true,
        });
        if (!persisted) throw new Error('Could not save.');
        merged++;
        // Clear delete intents before metadata queues sync for this restored profile.
        _reviveImportedProfileSyncIdentity(existing.id);
        if (!firstImportedId) firstImportedId = existing.id;
        const meta: Record<string, unknown> = {};
        for (const field of ['name', 'sex', 'dob', 'location', 'notes', 'avatar', 'pinned']) if (bp[field]) meta[field] = bp[field];
        if (Array.isArray(bp.tags) && bp.tags.length) meta.tags = bp.tags;
        if (bp.status && bp.status !== 'active') meta.status = bp.status;
        if (bp.height) { meta.height = bp.height; meta.heightUnit = bp.heightUnit || 'cm'; }
        try { if (!await updateProfileMeta(existing.id, meta)) throw new Error('Metadata save failed.'); }
        finally { onProfileSaved(existing.id, current); }
        if (bp.chat) await _importChatData(existing.id, bp.chat);
        await _importNutritionData(existing.id, bp.nutrition);
      } else {
        const id = await (createProfile as RawCreateProfile)(bp.name || 'Imported', {
          sex: bp.sex || null, dob: bp.dob || null,
          location: bp.location || { country: '', zip: '' },
          tags: bp.tags || [], notes: bp.notes || '',
          status: bp.status || 'active', avatar: bp.avatar || null,
          height: bp.height || null, heightUnit: bp.heightUnit || 'cm',
        });
        if (!firstImportedId) firstImportedId = id;
        if (bp.pinned) await updateProfileMeta(id, { pinned: true });
        const persisted = await (saveImportedDataForProfile as RawSaveProfile)(id, importData, {
          forceProfileScope: true,
        });
        if (!persisted) throw new Error('Could not save.');
        created++;
        if (bp.chat) await _importChatData(id, bp.chat);
        await _importNutritionData(id, bp.nutrition);
      }
    }
  } catch (error) { throw new Error(`Saved profiles: ${created + merged}. Import stopped: ${getErrorMessage(error)}`); }
  // Switch to the first imported profile (so user lands on real data, not empty default)
  const targetId = firstImportedId || state.currentProfile;
  await loadProfile(targetId);
  // Legacy bundles may include wallet identity fields. Deliberately restore
  // only the Routstr node: a seed or mint without proofs/counters/recovery
  // state is not a safe wallet backup.
  if (json.wallet) {
    try {
      if (json.wallet.nodeUrl) (setSelectedNodeUrl as (url: unknown) => ReturnType<typeof setSelectedNodeUrl>)(json.wallet.nodeUrl);
    } catch (e) {
      if (isDebugMode()) console.log('[import] Wallet restore failed:', getErrorMessage(e));
    }
  }
  const total = created + merged;
  showNotification(`Imported ${total} profile${total !== 1 ? 's' : ''} (${created} new, ${merged} merged)`, 'success');
}
