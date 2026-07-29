// @ts-check
// AI context-source preferences, cache fingerprinting, and invalidation.

import { state } from './state.js';
import { hashString } from './utils.js';
import {
  CONTEXT_SOURCE_IDS,
  getLabGroupContextSourceSlug,
  isContextSourceEnabled,
  setContextSourceEnabled,
} from './context-source-registry.js';
import {
  isWearableContextEnabled,
  setWearableContextEnabledState,
} from './lab-context-wearables.js';

/** @type {{ fingerprint: string | null, context: string | null }} */
let labContextCache = { fingerprint: null, context: null };

function getActiveContextProfileId() {
  try { return localStorage.getItem('labcharts-active-profile') || state.currentProfile || 'default'; }
  catch { return state.currentProfile || 'default'; }
}

function getStoredContextPreferencePart(profileId) {
  const stored = [];
  try {
    const scopedPrefix = `labcharts-${profileId}-ai-ctx-`;
    const legacyPrefix = 'labcharts-ai-ctx-';
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || (!key.startsWith(scopedPrefix) && !key.startsWith(legacyPrefix))) continue;
      stored.push(`${key}=${localStorage.getItem(key) || ''}`);
    }
  } catch {}
  return stored.sort().join(',');
}

function getContextPreferencePart() {
  const profileId = getActiveContextProfileId();
  return [
    `activeProfile:${profileId}`,
    `stateProfile:${state.currentProfile || ''}`,
    `sources:${[
      `${CONTEXT_SOURCE_IDS.INSIGHT_CARDS}:${isInsightContextCardsEnabled() ? 'on' : 'off'}`,
      `${CONTEXT_SOURCE_IDS.SUPPLEMENTS_MEDS}:${isSupplementsMedsContextEnabled() ? 'on' : 'off'}`,
      `${CONTEXT_SOURCE_IDS.LAB_MARKERS}:${isLabMarkersContextEnabled() ? 'on' : 'off'}`,
      `${CONTEXT_SOURCE_IDS.GENOME_SUMMARY}:${isGeneticsSummaryInAIContext() ? 'on' : 'off'}`,
      `${CONTEXT_SOURCE_IDS.GENOME_PRIORITY}:${isGeneticsPriorityInAIContext() ? 'on' : 'off'}`,
      `${CONTEXT_SOURCE_IDS.GENOME_INVENTORY}:${isGeneticsInventoryInAIContext() ? 'on' : 'off'}`,
      `${CONTEXT_SOURCE_IDS.LIGHT_SUN}:${isLightSunContextEnabled() ? 'on' : 'off'}`,
      `${CONTEXT_SOURCE_IDS.WEARABLES}:${isWearableContextEnabled() ? 'on' : 'off'}`,
    ].join(',')}`,
    `stored:${getStoredContextPreferencePart(profileId)}`,
  ].join('|');
}

export function getLabContextFingerprint() {
  const data = state.importedData;
  const entryPart = (data.entries || []).map(entry =>
    entry.date + ':' + Object.keys(entry.markers || {}).length).join(',');
  const cardPart = ['healthGoals', 'diagnoses', 'supplements', 'biometrics', 'genetics',
    'menstrualCycle', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress',
    'loveLife', 'environment', 'emfAssessment', 'changeHistory', 'wearableSummary'
  ].map(key => hashString(JSON.stringify(data[key] || ''))).join(',');
  return hashString([
    entryPart, cardPart,
    state.profileSex || '', state.profileDob || '',
    state.unitSystem || '', state.rangeMode || '',
    data.interpretiveLens || '', data.contextNotes || '',
    JSON.stringify(data.notes || []), JSON.stringify(data.markerNotes || {}),
    JSON.stringify(data.contextSourceSettings || {}),
    JSON.stringify(data.biologyScoreContextSettings || {}),
    JSON.stringify(data.refOverrides || {}), JSON.stringify(data.categoryLabels || {}),
    JSON.stringify(data.markerLabels || {}),
    getContextPreferencePart(),
  ].join('|'));
}

export function getCachedLabContext(fingerprint) {
  return labContextCache.fingerprint === fingerprint && labContextCache.context
    ? labContextCache.context
    : null;
}

export function setCachedLabContext(fingerprint, context) {
  labContextCache = { fingerprint, context };
}

export function invalidateLabContextCache() {
  labContextCache = { fingerprint: null, context: null };
}

function groupContextLegacyKey(groupName) {
  const group = String(groupName || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return group ? `labcharts-ai-ctx-${group}` : null;
}

export function isGroupInAIContext(groupName) {
  const slug = getLabGroupContextSourceSlug(groupName);
  if (!slug) return true;
  return isContextSourceEnabled(slug, {
    defaultValue: true,
    legacyKey: groupContextLegacyKey(groupName),
  });
}

export function setGroupInAIContext(groupName, val) {
  const slug = getLabGroupContextSourceSlug(groupName);
  if (!slug) return;
  setContextSourceEnabled(slug, !!val, { legacyKey: groupContextLegacyKey(groupName) });
  invalidateLabContextCache();
}

export function isGeneticsInventoryInAIContext() {
  return isContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_INVENTORY);
}

export function setGeneticsInventoryInAIContext(on) {
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_INVENTORY, on);
  invalidateLabContextCache();
}

function biologyScoreContextSettings() {
  const imported = /** @type {any} */ (state.importedData || {});
  if (!imported.biologyScoreContextSettings || typeof imported.biologyScoreContextSettings !== 'object') {
    imported.biologyScoreContextSettings = {};
  }
  return imported.biologyScoreContextSettings;
}

function setProfileContextEnabled(slug, on, legacyKey = null) {
  setContextSourceEnabled(slug, on, { legacyKey });
  invalidateLabContextCache();
}

export function isInsightContextCardsEnabled() {
  return isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS);
}

export function setInsightContextCardsEnabled(on) {
  setProfileContextEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, on);
}

export function isSupplementsMedsContextEnabled() {
  return isContextSourceEnabled(CONTEXT_SOURCE_IDS.SUPPLEMENTS_MEDS);
}

export function setSupplementsMedsContextEnabled(on) {
  setProfileContextEnabled(CONTEXT_SOURCE_IDS.SUPPLEMENTS_MEDS, on);
}

export function isLabMarkersContextEnabled() {
  return isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS);
}

export function setLabMarkersContextEnabled(on) {
  setProfileContextEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, on);
}

export function isGeneticsSummaryInAIContext() {
  return isContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_SUMMARY);
}

export function setGeneticsSummaryInAIContext(on) {
  setProfileContextEnabled(CONTEXT_SOURCE_IDS.GENOME_SUMMARY, on);
}

export function isGeneticsPriorityInAIContext() {
  return isContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_PRIORITY);
}

export function setGeneticsPriorityInAIContext(on) {
  setProfileContextEnabled(CONTEXT_SOURCE_IDS.GENOME_PRIORITY, on);
}

export function isLightSunContextEnabled() {
  return isContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, {
    defaultValue: state.importedData?.biologyScoreContextSettings?.includeLightContext !== false,
  });
}

export function setLightSunContextEnabled(on) {
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, on);
  biologyScoreContextSettings().includeLightContext = !!on;
  invalidateLabContextCache();
}

export function setWearableContextEnabled(on) {
  setWearableContextEnabledState(on);
  invalidateLabContextCache();
}
