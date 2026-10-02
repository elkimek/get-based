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

import type { ActiveCategory, ActiveData, ActiveMarker } from './data-view-types.js';
interface VisibleMarker { key: string; name: string; category: string; marker: ActiveMarker; data: ActiveData }
interface MarkerQuery { query: string; limit?: number }
interface MarkerHistoryQuery { marker: string; from?: string; to?: string; limit?: number }
type BrowserToolOptions = {
  searchMarkers: MarkerQuery; readMarkerHistory: MarkerHistoryQuery; readNutritionSummary: { range: string };
  readWearableSeries: { days: number }; searchKnowledge: MarkerQuery; navigate: { view: string; marker: string };
};
type BrowserToolDependencies = Partial<{ [Key in keyof BrowserToolOptions]: (options: BrowserToolOptions[Key]) => unknown }>;

function unavailable(reason: string) {
  return { available: false as const, reason };
}

function groupIsEnabled(category: Pick<ActiveCategory, 'group' | 'label'> | null | undefined) {
  const group = String(category?.group || category?.label || '').trim();
  return !group || isGroupInAIContext(group);
}

export function getAgentVisibleMarkers() {
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS)) return [];
  const data = getActiveData();
  const rows: VisibleMarker[] = [];
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

function markerDate(row: VisibleMarker, index: number) {
  return row.marker.singlePoint ? row.marker.singleDate : row.data.dates[index];
}

function latestMarkerPoint(row: VisibleMarker) {
  for (let index = row.marker.values.length - 1; index >= 0; index -= 1) {
    const value = row.marker.values[index];
    if (value != null) return { value, date: markerDate(row, index) || null };
  }
  return { value: null, date: null };
}

function publicMarker(row: VisibleMarker) {
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

export function resolveAgentMarker(query: unknown) {
  const normalized = String(query || '').trim().toLocaleLowerCase();
  const rows = getAgentVisibleMarkers();
  const exact = rows.filter(row => row.key.toLocaleLowerCase() === normalized
    || row.name.toLocaleLowerCase() === normalized);
  if (exact.length === 1) return { row: exact[0]!, matches: exact };
  const matches = exact.length > 1 ? exact : rows.filter(row => [row.key, row.name, row.category]
    .some(value => value.toLocaleLowerCase().includes(normalized)));
  return { row: matches.length === 1 ? matches[0]! : null, matches };
}

export function searchAgentMarkers({ query, limit }: MarkerQuery) {
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS)) {
    return unavailable('Lab marker context is disabled for the active profile.');
  }
  const normalized = query.toLocaleLowerCase();
  const matches = getAgentVisibleMarkers().filter(row => [row.key, row.name, row.category]
    .some(value => value.toLocaleLowerCase().includes(normalized)));
  return { available: true as const, matches: matches.slice(0, limit).map(publicMarker), totalMatches: matches.length };
}

function publicRange(range: ReturnType<typeof getMarkerRangesForChat>[number]) {
  return {
    kind: range.kind,
    label: range.label,
    min: range.min ?? null,
    max: range.max ?? null,
    source: range.source,
    usedForStatus: !!range.usedForStatus,
  };
}

export function readAgentMarkerHistory({ marker, from, to, limit }: MarkerHistoryQuery) {
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS)) {
    return unavailable('Lab marker context is disabled for the active profile.');
  }
  const resolved = resolveAgentMarker(marker);
  if (!resolved.row) {
    return {
      available: false as const,
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
    available: true as const,
    marker: publicMarker(row),
    values: values.slice(-limit!),
    returnedValues: Math.min(values.length, limit!),
    totalValuesInRange: values.length,
  };
}

function aggregateNutritionWindow(range: string) {
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

export function readAgentNutritionSummary({ range }: BrowserToolOptions['readNutritionSummary']) {
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.NUTRITION)) {
    return unavailable('Meals and nutrition context is disabled for the active profile.');
  }
  return { available: true as const, ...aggregateNutritionWindow(range) };
}

export async function readAgentWearableSeries({ days }: BrowserToolOptions['readWearableSeries']) {
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.WEARABLES)) {
    return unavailable('Wearable context is disabled for the active profile.');
  }
  const section = await buildWearableSeriesSection(days);
  return section ? { available: true as const, days, series: section } : unavailable('No wearable series is available for this period.');
}

export async function searchAgentKnowledge({ query, limit }: MarkerQuery) {
  const result = await queryLens(query, { topK: limit });
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  if (!chunks.length) return unavailable('No enabled Knowledge Base returned a matching passage.');
  return {
    available: true as const,
    chunks: chunks.slice(0, limit).map(chunk => ({
      source: String(chunk?.source || 'Knowledge Base').slice(0, 240),
      text: String(chunk?.text || '').slice(0, 4000),
    })),
  };
}

export async function navigateFromAgent({ view, marker }: BrowserToolOptions['navigate']) {
  if (marker) {
    const resolved = resolveAgentMarker(marker);
    if (!resolved.row) {
      return {
        changed: false as const,
        reason: resolved.matches.length ? 'Marker name is ambiguous.' : 'Marker was not found.',
        matches: resolved.matches.slice(0, 10).map(publicMarker),
      };
    }
    if (!navigateDataViewRuntime('labs', getActiveData()) || !showDataMarkerDetailRuntime(resolved.row.key)) {
      return { changed: false as const, reason: 'Marker details are not available yet.' };
    }
    return { changed: true as const, opened: 'marker', marker: publicMarker(resolved.row) };
  }
  if (!navigateDataViewRuntime(view, getActiveData())) return { changed: false as const, reason: 'Navigation is not available yet.' };
  return { changed: true as const, opened: view };
}

/**
 * Keep every typed tool attached to the profile that started the turn. The
 * active-profile stores are intentionally global, so a profile switch during
 * a long response must fail closed instead of reading the newly selected
 * profile.
 */
export function bindAgentToolDependenciesToProfile(dependencies: BrowserToolDependencies, profileId: string, readActiveProfile = () => state.currentProfile || '') {
  const changed = () => Boolean(profileId) && readActiveProfile() !== profileId;
  const reason = 'The active profile changed while the agent was responding. Retry the request in the intended profile.';
  const bind = <Options>(handler: ((options: Options) => unknown) | undefined, navigation = false) => async (options: Options) => {
    if (changed()) return navigation ? { changed: false as const, reason } : unavailable(reason);
    const result = await handler!(options);
    if (changed()) return navigation ? { changed: false as const, reason } : unavailable(reason);
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
