// @ts-check
// Browser-side bindings for the narrow, versioned agent tool contract.

import { state } from './state.js';
import { getActiveData, navigateDataViewRuntime, showDataMarkerDetailRuntime } from './data.js';
import { getMarkerRangesForChat } from './marker-analysis.js';
import {
  CONTEXT_SOURCE_IDS,
  isContextSourceEnabled,
} from './context-source-registry.js';
import { isGroupInAIContext } from './lab-context-settings.js';
import { computeNutritionHistory, computeNutritionSummary } from './nutrition-summary.js';
import { buildWearableSeriesSection } from './lab-context-wearables.js';
import { queryLens } from './lens.js';

function unavailable(reason) {
  return { available: false, reason };
}

function groupIsEnabled(category) {
  const group = String(category?.group || category?.label || '').trim();
  return !group || isGroupInAIContext(group);
}

/**
 * @returns {Array<{key: string, name: string, category: string, marker: any, data: any}>}
 */
export function getAgentVisibleMarkers() {
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS)) return [];
  const data = getActiveData();
  const rows = [];
  for (const [categoryKey, category] of Object.entries(data.categories || {})) {
    if (!groupIsEnabled(category)) continue;
    for (const [markerKey, marker] of Object.entries(category.markers || {})) {
      if (!Array.isArray(marker.values) || !marker.values.some(value => value != null)) continue;
      rows.push({
        key: `${categoryKey}.${markerKey}`,
        name: String(marker.name || markerKey),
        category: String(category.label || categoryKey),
        marker,
        data,
      });
    }
  }
  return rows;
}

function markerDate(row, index) {
  return row.marker.singlePoint ? row.marker.singleDate : row.data.dates[index];
}

function latestMarkerPoint(row) {
  for (let index = row.marker.values.length - 1; index >= 0; index -= 1) {
    const value = row.marker.values[index];
    if (value != null) return { value, date: markerDate(row, index) || null };
  }
  return { value: null, date: null };
}

function publicMarker(row) {
  const latest = latestMarkerPoint(row);
  return {
    key: row.key,
    name: row.name,
    category: row.category,
    unit: String(row.marker.unit || ''),
    latestValue: latest.value,
    latestDate: latest.date,
    recordedValues: row.marker.values.filter(value => value != null).length,
  };
}

/** @param {string} query */
export function resolveAgentMarker(query) {
  const normalized = String(query || '').trim().toLocaleLowerCase();
  const rows = getAgentVisibleMarkers();
  const exact = rows.filter(row => row.key.toLocaleLowerCase() === normalized
    || row.name.toLocaleLowerCase() === normalized);
  if (exact.length === 1) return { row: exact[0], matches: exact };
  const matches = exact.length > 1 ? exact : rows.filter(row => [row.key, row.name, row.category]
    .some(value => value.toLocaleLowerCase().includes(normalized)));
  return { row: matches.length === 1 ? matches[0] : null, matches };
}

/** @param {{query: string, limit: number}} options */
export function searchAgentMarkers({ query, limit }) {
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS)) {
    return unavailable('Lab marker context is disabled for the active profile.');
  }
  const normalized = query.toLocaleLowerCase();
  const matches = getAgentVisibleMarkers().filter(row => [row.key, row.name, row.category]
    .some(value => value.toLocaleLowerCase().includes(normalized)));
  return { available: true, matches: matches.slice(0, limit).map(publicMarker), totalMatches: matches.length };
}

function publicRange(range) {
  return {
    kind: range.kind,
    label: range.label,
    min: range.min ?? null,
    max: range.max ?? null,
    source: range.source,
    usedForStatus: !!range.usedForStatus,
  };
}

/** @param {{marker: string, from: string, to: string, limit: number}} options */
export function readAgentMarkerHistory({ marker, from, to, limit }) {
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS)) {
    return unavailable('Lab marker context is disabled for the active profile.');
  }
  const resolved = resolveAgentMarker(marker);
  if (!resolved.row) {
    return {
      available: false,
      reason: resolved.matches.length ? 'Marker name is ambiguous.' : 'Marker was not found.',
      matches: resolved.matches.slice(0, 10).map(publicMarker),
    };
  }
  const row = resolved.row;
  const values = row.marker.values.flatMap((value, index) => {
    const date = markerDate(row, index);
    if (value == null || !date || (from && date < from) || (to && date > to)) return [];
    return [{
      date,
      value,
      unit: String(row.marker.unit || ''),
      ranges: getMarkerRangesForChat(row.marker, index).map(publicRange),
    }];
  });
  return {
    available: true,
    marker: publicMarker(row),
    values: values.slice(-limit),
    returnedValues: Math.min(values.length, limit),
    totalValuesInRange: values.length,
  };
}

function aggregateNutritionWindow(range) {
  const meals = Array.isArray(state.importedData?.nutritionMeals) ? state.importedData.nutritionMeals : [];
  if (range === '7d') {
    const window = computeNutritionSummary(meals).windows.d7;
    return { rangeKey: '7d', rangeLabel: '7D', period: window };
  }
  const history = computeNutritionHistory(meals, { rangeKey: range });
  // Do not expose the individual meal records returned by the history helper.
  return {
    rangeKey: history.rangeKey,
    rangeLabel: history.rangeLabel,
    rangeDescription: history.rangeDescription,
    startDate: history.startKey,
    endDate: history.endKey,
    period: history.period,
    coverageBuckets: history.coverageBuckets,
  };
}

/** @param {{range: string}} options */
export function readAgentNutritionSummary({ range }) {
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.NUTRITION)) {
    return unavailable('Meals and nutrition context is disabled for the active profile.');
  }
  return { available: true, ...aggregateNutritionWindow(range) };
}

/** @param {{days: number}} options */
export async function readAgentWearableSeries({ days }) {
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.WEARABLES)) {
    return unavailable('Wearable context is disabled for the active profile.');
  }
  const section = await buildWearableSeriesSection(days);
  return section ? { available: true, days, series: section } : unavailable('No wearable series is available for this period.');
}

/** @param {{query: string, limit: number}} options */
export async function searchAgentKnowledge({ query, limit }) {
  const result = await queryLens(query, { topK: limit });
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  if (!chunks.length) return unavailable('No enabled Knowledge Base returned a matching passage.');
  return {
    available: true,
    chunks: chunks.slice(0, limit).map(chunk => ({
      source: String(chunk?.source || 'Knowledge Base').slice(0, 240),
      text: String(chunk?.text || '').slice(0, 4000),
    })),
  };
}

/** @param {{view: string, marker: string}} options */
export async function navigateFromAgent({ view, marker }) {
  if (marker) {
    const resolved = resolveAgentMarker(marker);
    if (!resolved.row) {
      return {
        changed: false,
        reason: resolved.matches.length ? 'Marker name is ambiguous.' : 'Marker was not found.',
        matches: resolved.matches.slice(0, 10).map(publicMarker),
      };
    }
    if (!navigateDataViewRuntime('labs', getActiveData()) || !showDataMarkerDetailRuntime(resolved.row.key)) {
      return { changed: false, reason: 'Marker details are not available yet.' };
    }
    return { changed: true, opened: 'marker', marker: publicMarker(resolved.row) };
  }
  if (!navigateDataViewRuntime(view, getActiveData())) return { changed: false, reason: 'Navigation is not available yet.' };
  return { changed: true, opened: view };
}

/**
 * Keep every typed tool attached to the profile that started the turn. The
 * active-profile stores are intentionally global, so a profile switch during
 * a long response must fail closed instead of reading the newly selected
 * profile.
 * @param {Record<string, Function>} dependencies
 * @param {string} profileId
 * @param {() => string} [readActiveProfile]
 */
export function bindAgentToolDependenciesToProfile(dependencies, profileId, readActiveProfile = () => state.currentProfile || '') {
  const changed = () => Boolean(profileId) && readActiveProfile() !== profileId;
  const reason = 'The active profile changed while the agent was responding. Retry the request in the intended profile.';
  const bind = (handler, navigation = false) => async options => {
    if (changed()) return navigation ? { changed: false, reason } : unavailable(reason);
    const result = await handler(options);
    if (changed()) return navigation ? { changed: false, reason } : unavailable(reason);
    return result;
  };
  return {
    searchMarkers: bind(dependencies.searchMarkers),
    readMarkerHistory: bind(dependencies.readMarkerHistory),
    readNutritionSummary: bind(dependencies.readNutritionSummary),
    readWearableSeries: bind(dependencies.readWearableSeries),
    searchKnowledge: bind(dependencies.searchKnowledge),
    navigate: bind(dependencies.navigate, true),
  };
}

/** @param {string} [profileId] */
export function createBrowserAgentToolDependencies(profileId = state.currentProfile || '') {
  return bindAgentToolDependenciesToProfile({
    searchMarkers: searchAgentMarkers,
    readMarkerHistory: readAgentMarkerHistory,
    readNutritionSummary: readAgentNutritionSummary,
    readWearableSeries: readAgentWearableSeries,
    searchKnowledge: searchAgentKnowledge,
    navigate: navigateFromAgent,
  }, profileId);
}
