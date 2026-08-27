// @ts-check
// context-source-registry.js — shared Context source metadata and profile-scoped toggles

import { state } from './state.js';

export const CONTEXT_SOURCE_IDS = Object.freeze({
  INSIGHT_CARDS: 'insight-cards',
  SUPPLEMENTS_MEDS: 'supplements-meds',
  LAB_MARKERS: 'lab-markers',
  GENOME_SUMMARY: 'genetics-summary',
  GENOME_PRIORITY: 'genetics-priority',
  GENOME_INVENTORY: 'genetics-inventory',
  LIGHT_SUN: 'light-sun',
  WEARABLES: 'wearables',
  NUTRITION: 'meals-nutrition',
});

export const CONTEXT_SOURCE_SETTINGS_FIELD = 'contextSourceSettings';
export const LAB_GROUP_CONTEXT_SOURCE_PREFIX = 'lab-group-';

export const CONTEXT_SOURCE_DEFINITIONS = Object.freeze({
  [CONTEXT_SOURCE_IDS.INSIGHT_CARDS]: Object.freeze({
    id: CONTEXT_SOURCE_IDS.INSIGHT_CARDS,
    slug: 'insight-cards',
    label: 'Insight Context Cards',
    group: 'Profile',
    defaultEnabled: true,
    affects: Object.freeze(['Chat', 'Scores', 'Warnings']),
  }),
  [CONTEXT_SOURCE_IDS.SUPPLEMENTS_MEDS]: Object.freeze({
    id: CONTEXT_SOURCE_IDS.SUPPLEMENTS_MEDS,
    slug: 'supplements-meds',
    label: 'Supplements & Medications',
    group: 'Profile',
    defaultEnabled: true,
    affects: Object.freeze(['Chat', 'Scores', 'Warnings']),
  }),
  [CONTEXT_SOURCE_IDS.LAB_MARKERS]: Object.freeze({
    id: CONTEXT_SOURCE_IDS.LAB_MARKERS,
    slug: 'lab-markers',
    label: 'Blood marker results',
    group: 'Labs',
    defaultEnabled: true,
    affects: Object.freeze(['Chat', 'Scores', 'Warnings']),
  }),
  [CONTEXT_SOURCE_IDS.GENOME_SUMMARY]: Object.freeze({
    id: CONTEXT_SOURCE_IDS.GENOME_SUMMARY,
    slug: 'genetics-summary',
    label: 'APOE & mtDNA summary',
    group: 'Genome',
    defaultEnabled: true,
    affects: Object.freeze(['Chat', 'Scores']),
  }),
  [CONTEXT_SOURCE_IDS.GENOME_PRIORITY]: Object.freeze({
    id: CONTEXT_SOURCE_IDS.GENOME_PRIORITY,
    slug: 'genetics-priority',
    label: 'Priority SNP findings',
    group: 'Genome',
    defaultEnabled: true,
    affects: Object.freeze(['Chat', 'Scores']),
  }),
  [CONTEXT_SOURCE_IDS.GENOME_INVENTORY]: Object.freeze({
    id: CONTEXT_SOURCE_IDS.GENOME_INVENTORY,
    slug: 'genetics-inventory',
    label: 'Other SNP lookup inventory',
    group: 'Genome',
    defaultEnabled: false,
    legacyKey: 'labcharts-ai-ctx-genetics-inventory',
    affects: Object.freeze(['Chat lookup']),
  }),
  [CONTEXT_SOURCE_IDS.LIGHT_SUN]: Object.freeze({
    id: CONTEXT_SOURCE_IDS.LIGHT_SUN,
    slug: 'light-sun',
    label: 'Light & Sun context',
    group: 'Light & Sun',
    defaultEnabled: true,
    affects: Object.freeze(['Chat', 'Scores', 'Warnings']),
  }),
  [CONTEXT_SOURCE_IDS.WEARABLES]: Object.freeze({
    id: CONTEXT_SOURCE_IDS.WEARABLES,
    slug: 'wearables',
    label: 'Wearable recovery context',
    group: 'Body',
    defaultEnabled: true,
    legacyKey: 'labcharts-ai-ctx-wearables',
    affects: Object.freeze(['Chat', 'Scores']),
  }),
  [CONTEXT_SOURCE_IDS.NUTRITION]: Object.freeze({
    id: CONTEXT_SOURCE_IDS.NUTRITION,
    slug: 'meals-nutrition',
    label: 'Meals & Nutrition',
    group: 'Body',
    defaultEnabled: true,
    affects: Object.freeze(['Chat']),
  }),
});

export const INSIGHT_CONTEXT_CARD_FIELDS = Object.freeze([
  'healthGoals',
  'diagnoses',
  'biometrics',
  'menstrualCycle',
  'diet',
  'exercise',
  'sleepRest',
  'stress',
  'loveLife',
  'environment',
  'emfAssessment',
  'notes',
  'contextNotes',
  'changeHistory',
]);

export const INSIGHT_CONTEXT_CHANGE_FIELDS = Object.freeze([
  'diet',
  'exercise',
  'sleepRest',
  'stress',
  'loveLife',
  'environment',
  'diagnoses',
  'healthGoals',
  'contextNotes',
  'menstrualCycle',
]);

function getStorage() {
  try { return globalThis.localStorage || null; }
  catch { return null; }
}

function getActiveProfileId() {
  const storage = getStorage();
  try { return storage?.getItem('labcharts-active-profile') || 'default'; }
  catch { return 'default'; }
}

function getDefinition(idOrSlug) {
  return CONTEXT_SOURCE_DEFINITIONS[idOrSlug] || Object.values(CONTEXT_SOURCE_DEFINITIONS).find(def => def.slug === idOrSlug) || null;
}

export function getContextSourceDefinition(idOrSlug) {
  return getDefinition(idOrSlug);
}

export function getContextSourceSlug(idOrSlug) {
  const def = getDefinition(idOrSlug);
  return def?.slug || String(idOrSlug || '');
}

export function getContextSourceStorageKey(idOrSlug) {
  return `labcharts-${getActiveProfileId()}-ai-ctx-${getContextSourceSlug(idOrSlug)}`;
}

function hasUnsafeContextSourceSlugChars(slug) {
  return /[\u0000-\u001F\u007F]/.test(slug);
}

export function getLabGroupContextSourceSlug(groupName) {
  const group = String(groupName || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return group ? `${LAB_GROUP_CONTEXT_SOURCE_PREFIX}${group}` : '';
}

export function isLabGroupContextSourceSlug(slug) {
  return typeof slug === 'string'
    && slug.startsWith(LAB_GROUP_CONTEXT_SOURCE_PREFIX)
    && slug.length > LAB_GROUP_CONTEXT_SOURCE_PREFIX.length
    && slug.length <= 180
    && !hasUnsafeContextSourceSlugChars(slug);
}

/** @returns {string[]} */
function allowedContextSourceSlugs() {
  return Object.values(CONTEXT_SOURCE_DEFINITIONS).map(def => def.slug);
}

function isAllowedContextSourceSlug(slug) {
  return allowedContextSourceSlugs().includes(slug) || isLabGroupContextSourceSlug(slug);
}

/**
 * @param {unknown} settings
 * @returns {Record<string, boolean>}
 */
export function normalizeContextSourceSettings(settings) {
  /** @type {Record<string, boolean>} */
  const out = {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return out;
  for (const [slug, value] of Object.entries(settings)) {
    if (!isAllowedContextSourceSlug(slug)) continue;
    if (value === true || value === false) out[slug] = value;
  }
  return out;
}

function getProfileContextSourceSettings(data = state.importedData) {
  const settings = data?.[CONTEXT_SOURCE_SETTINGS_FIELD];
  return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : null;
}

export function ensureContextSourceSettings(data = state.importedData) {
  if (!data || typeof data !== 'object') return null;
  const normalized = normalizeContextSourceSettings(data[CONTEXT_SOURCE_SETTINGS_FIELD]);
  data[CONTEXT_SOURCE_SETTINGS_FIELD] = normalized;
  return normalized;
}

function getProfileContextSourceValue(idOrSlug) {
  const settings = getProfileContextSourceSettings();
  if (!settings) return null;
  const slug = getContextSourceSlug(idOrSlug);
  if (!Object.prototype.hasOwnProperty.call(settings, slug)) return null;
  const value = settings[slug];
  return value === true || value === false ? value : null;
}

/**
 * @param {string} idOrSlug
 * @param {string | null} [legacyKey]
 */
function getStoredContextSourceValue(idOrSlug, legacyKey = null) {
  const storage = getStorage();
  if (!storage) return null;
  const local = storage.getItem(getContextSourceStorageKey(idOrSlug));
  if (local === 'off') return false;
  if (local === 'on') return true;
  if (legacyKey) {
    const legacy = storage.getItem(legacyKey);
    if (legacy === 'off') return false;
    if (legacy === 'on') return true;
  }
  return null;
}

function migrateStoredLabGroupSettings(settings) {
  const storage = getStorage();
  if (!storage) return false;
  const profilePrefix = `labcharts-${getActiveProfileId()}-ai-ctx-`;
  const scopedGroupPrefix = `${profilePrefix}${LAB_GROUP_CONTEXT_SOURCE_PREFIX}`;
  const legacyPrefix = 'labcharts-ai-ctx-';
  const fixedLegacyKeys = new Set(
    Object.values(CONTEXT_SOURCE_DEFINITIONS)
      .map(def => /** @type {{legacyKey?: string}} */ (def).legacyKey)
      .filter(Boolean)
  );
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }
  let changed = false;
  for (const key of keys) {
    let slug = '';
    if (key.startsWith(scopedGroupPrefix)) {
      slug = key.slice(profilePrefix.length);
    } else if (key.startsWith(legacyPrefix) && !fixedLegacyKeys.has(key)) {
      const groupName = key.slice(legacyPrefix.length);
      slug = groupName.startsWith(LAB_GROUP_CONTEXT_SOURCE_PREFIX)
        ? groupName
        : getLabGroupContextSourceSlug(groupName);
    }
    if (!isLabGroupContextSourceSlug(slug)) continue;
    if (Object.prototype.hasOwnProperty.call(settings, slug)) continue;
    const value = storage.getItem(key);
    if (value === 'on' || value === 'off') {
      settings[slug] = value === 'on';
      changed = true;
    }
  }
  return changed;
}

export function migrateStoredContextSourceSettingsToProfile(data = state.importedData) {
  const settings = ensureContextSourceSettings(data);
  if (!settings) return false;
  let changed = false;
  for (const def of Object.values(CONTEXT_SOURCE_DEFINITIONS)) {
    if (Object.prototype.hasOwnProperty.call(settings, def.slug)) continue;
    const stored = getStoredContextSourceValue(def.id, /** @type {{legacyKey?: string}} */ (def).legacyKey || null);
    if (stored === true || stored === false) {
      settings[def.slug] = stored;
      changed = true;
    }
  }
  if (migrateStoredLabGroupSettings(settings)) changed = true;
  return changed;
}

export function isContextSourceEnabled(idOrSlug, options = {}) {
  const def = getDefinition(idOrSlug);
  const defaultValue = options.defaultValue ?? def?.defaultEnabled ?? true;
  const legacyKey = options.legacyKey ?? def?.legacyKey ?? null;
  const profileValue = getProfileContextSourceValue(idOrSlug);
  if (profileValue === true || profileValue === false) return profileValue;
  const storedValue = getStoredContextSourceValue(idOrSlug, legacyKey);
  if (storedValue === true || storedValue === false) return storedValue;
  return defaultValue !== false;
}

export function setContextSourceEnabled(idOrSlug, on, options = {}) {
  const def = getDefinition(idOrSlug);
  const settings = ensureContextSourceSettings();
  if (settings) settings[getContextSourceSlug(idOrSlug)] = !!on;
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(getContextSourceStorageKey(idOrSlug), on ? 'on' : 'off');
  const legacyKey = options.legacyKey ?? def?.legacyKey ?? null;
  if (legacyKey) storage.removeItem(legacyKey);
}
