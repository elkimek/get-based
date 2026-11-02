// Pure settings projection: disabled content and data availability are never read.
import { CONTEXT_PREFERENCE_SOURCES, contextPreferencesEqual } from '../shared/context-preference-contract.js';
import type { ContextPreferenceSource, ContextPreferencePatch } from '../shared/context-preference-contract.js';
import { isContextSourceEnabled, getLabGroupContextSourceSlug, normalizeContextSourceSettings } from './context-source-registry.js';
import { labToolRegistry, labToolMarkerGroup } from './lab-tool-markers.js';
import { normalizeNutritionContextDays } from './lab-context-settings.js';
import { readAgentWearableSeriesDays } from './lab-context-wearables.js';
import type { ProfileData } from '../types/app-state.js';
export function readContextPreferenceState(data: ProfileData, profileId: string) {
  // The native profile migration normalizes these fields. Refuse an unsupported
  // future shape before preparing/saving instead of silently dropping its data.
  if (!contextPreferencesEqual(data.contextSourceSettings ?? {}, normalizeContextSourceSettings(data.contextSourceSettings))
    || data.nutritionContextDays != null && ![7, 30, 90].includes(data.nutritionContextDays)
    || data.agentAccessWearableSeriesDays != null && ![0, 7, 30, 90].includes(data.agentAccessWearableSeriesDays)) {
    throw new Error('This profile has unsupported context-source metadata. Keep it unchanged and use a compatible app version before changing disclosure.');
  }
  const scores = data.biologyScoreContextSettings || {};
  const sources = Object.fromEntries(Object.keys(CONTEXT_PREFERENCE_SOURCES).map(id => [id, isContextSourceEnabled(id, { data, profileId,
    ...(id === 'light-sun' ? { defaultValue: scores.includeLightContext !== false } : id === 'wearables' ? { defaultValue: scores.includeBodyContext !== false } : {}) })])) as Record<ContextPreferenceSource, boolean>;
  const groups = [...new Set(Object.entries(labToolRegistry(data)).map(([key, category]) => labToolMarkerGroup(key, category)).filter(Boolean))].sort().map(label => ({
    id: getLabGroupContextSourceSlug(label), label, enabled: isContextSourceEnabled(getLabGroupContextSourceSlug(label), { data, profileId, defaultValue: true, legacyKey: `labcharts-ai-ctx-${label}` }),
  }));
  return { sources, groups, nutritionDays: normalizeNutritionContextDays(data.nutritionContextDays), wearableSeriesDays: readAgentWearableSeriesDays(data, profileId) };
}
export const contextPreferenceRevision = (data: ProfileData, profileId: string) => JSON.stringify(readContextPreferenceState(data, profileId));
export function contextPreferenceBaseline(state: ReturnType<typeof readContextPreferenceState>, patch: ContextPreferencePatch): ContextPreferencePatch {
  const baseline: ContextPreferencePatch = {};
  if (patch.sources) baseline.sources = Object.fromEntries(Object.keys(patch.sources).map(id => [id, state.sources[id as ContextPreferenceSource]]));
  if (patch.groups) baseline.groups = Object.fromEntries(Object.keys(patch.groups).map(id => {
    const group = state.groups.find(row => row.id === id); if (!group) throw new Error('Choose an exact registered lab group from context.preferences.'); return [id, group.enabled];
  }));
  if (patch.nutritionDays !== undefined) baseline.nutritionDays = state.nutritionDays;
  if (patch.wearableSeriesDays !== undefined) baseline.wearableSeriesDays = state.wearableSeriesDays;
  return baseline;
}
export function applyContextPreferencePatch(data: ProfileData, patch: ContextPreferencePatch) {
  data.contextSourceSettings = { ...data.contextSourceSettings, ...patch.sources, ...patch.groups };
  if (patch.sources && (Object.hasOwn(patch.sources, 'light-sun') || Object.hasOwn(patch.sources, 'wearables'))) data.biologyScoreContextSettings = {
    ...data.biologyScoreContextSettings, ...(patch.sources['light-sun'] === undefined ? {} : { includeLightContext: patch.sources['light-sun'] }),
    ...(patch.sources.wearables === undefined ? {} : { includeBodyContext: patch.sources.wearables }),
  };
  if (patch.nutritionDays !== undefined) data.nutritionContextDays = patch.nutritionDays;
  if (patch.wearableSeriesDays !== undefined) data.agentAccessWearableSeriesDays = patch.wearableSeriesDays;
}
