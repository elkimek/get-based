import { captureChatControlAuthorization } from './chat-control-settings.js';
import { chatDataPatchAllowed } from '../shared/chat-control-policy.js';
import { isLabDisplayResource } from './lab-display-core.js';
import { canDiscloseLabDisplayReview } from './lab-display-records.js';
import { canDiscloseCustomMarkerReview } from './custom-marker-records.js';
import { canDiscloseLabReportReview } from './lab-report-proposals.js';
import { validateAppNavigation } from '../shared/app-navigation-contract.js';
import { ownsReadonlyHistorySurface } from './readonly-history-surfaces.js';
import { routeRevision } from './route-lifecycle.js';
import { getLabDateRangeBounds } from './lab-date-range.js';
import { createAgentDataTools, isAgentDataEnabled } from './agent-data-bindings.js';
import { parseAgentDataPatch, normalizeAgentDataProposal } from '../shared/agent-data-contract.js';
// Browser-side bindings for the narrow, versioned agent tool contract.

import { isGeneticsResource, canDiscloseGeneticsReview } from './genetics-proposals.js';
import { state } from './state.js';
import { getActiveData, navigateDataViewRuntime, showDataMarkerDetailRuntime } from './data.js';
import { getMarkerRangesForChat } from './marker-analysis.js';
import {
  CONTEXT_SOURCE_IDS,
  isContextSourceEnabled,
} from './context-source-registry.js';
import { createLabContextDisclosure } from './lab-context-disclosure.js';
import { isGroupInAIContext } from './lab-context-settings.js';
import { computeNutritionHistory, computeNutritionSummary } from './nutrition-summary.js';
import { buildWearableSeriesSection } from './lab-context-wearables.js';
import { queryLensMulti } from './lens.js';
import { LENS_CONFIG_STORAGE_KEY } from './lens-config-store.js';
import { AGENT_CONTEXT_CARDS, normalizeAgentContextProposal } from '../shared/agent-tool-contract.js';
import { agentContextCardModel, contextFieldValue, projectContextChanges, applyAgentContextChanges, environmentEMFMode } from './agent-context-fields.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import type { AgentContextCard } from '../shared/agent-tool-contract.js';
import type { AgentToolReadOptions } from './agent-tool-runtime.js';
import { canDiscloseLabSampleReview } from './lab-sample-records.js';
import { canDiscloseLabResultReview } from './lab-result-records.js';
import { canDiscloseMarkerNote } from './marker-note-records.js';
import { canDiscloseMarkerRange } from './marker-range-records.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { labToolRegistry, labToolMarker, labToolMarkerGroup } from './lab-tool-markers.js';
import { getMarkerInputUnits } from './unit-profiles.js';

import type { ActiveData, ActiveMarker } from './data-view-types.js';
interface VisibleMarker { key: string; name: string; category: string; marker: ActiveMarker; data: ActiveData }
interface MarkerQuery { query: string; limit?: number }
interface MarkerSearchQuery extends MarkerQuery { includeUnrecorded?: boolean }
interface MarkerHistoryQuery { marker: string; from?: string; to?: string; limit?: number }
type BrowserToolOptions = {
  readData: AgentToolReadOptions['readData']; prepareDataChange: AgentToolReadOptions['prepareDataChange'];
  prepareLegacyDraft: AgentToolReadOptions['prepareLegacyDraft'];
  searchMarkers: MarkerSearchQuery; readMarkerHistory: MarkerHistoryQuery; readNutritionSummary: { range: string };
  readWearableSeries: { days: number }; searchKnowledge: AgentToolReadOptions['searchKnowledge']; searchConversations: AgentToolReadOptions['searchConversations']; navigate: AgentToolReadOptions['navigate'];
  readKnowledge: AgentToolReadOptions['readKnowledge'];
  readContextCard: AgentToolReadOptions['readContextCard']; prepareContextChange: AgentToolReadOptions['prepareContextChange'];
};
type BrowserToolDependencies = Partial<{ [Key in keyof BrowserToolOptions]: (options: BrowserToolOptions[Key]) => unknown }>;

function unavailable(reason: string) {
  return { available: false as const, reason };
}

export function getAgentVisibleMarkers() {
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS)) return [];
  const data = createLabContextDisclosure().project(getActiveData());
  const rows: VisibleMarker[] = [];
  for (const [categoryKey, category] of Object.entries(data.categories || {})) {
    for (const [markerKey, marker] of Object.entries(category.markers || {})) {
      if (!Array.isArray(marker.values) || !marker.values.some(value => value != null) && !marker.contextSampleCount) continue;
      rows.push({
        key: marker.storageDotKey || `${categoryKey}.${markerKey}`,
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
    recordedValues: row.marker.values.filter(value => value != null).length + (row.marker.contextSampleCount || 0),
    ...(row.marker.contextSampleCount ? { separateSamples: true, sampleResource: 'labResults' } : {}),
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

async function searchMarkerDefinitions(query: string, limit: number) {
  const profileId = state.currentProfile, data = await readAgentProfileRecords(profileId);
  if (state.currentProfile !== profileId || !isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS)) return unavailable('This profile or lab marker source is no longer available.');
  const categories = labToolRegistry(data), matches: Array<{ key: string; name: string; category: string; unit: string; inputUnits: string[] }> = [];
  for (const [categoryKey, category] of Object.entries(categories)) {
    if (!isGroupInAIContext(labToolMarkerGroup(categoryKey, category))) continue;
    for (const key of Object.keys(category.markers)) {
      const markerKey = `${categoryKey}.${key}`, marker = labToolMarker(data, markerKey, categories), unit = String(marker.value.unit || ''), label = String(category.label || categoryKey);
      if (![markerKey, marker.name, label].some(value => value.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) continue;
      const units = marker.usesStandardUnit ? getMarkerInputUnits(markerKey, 'EU', unit) : [unit];
      matches.push({ key: markerKey, name: marker.name, category: label, unit, inputUnits: units.length ? units : [unit] });
    }
  }
  return { available: true as const, catalogOnly: true, matches: matches.slice(0, limit), totalMatches: matches.length };
}
type RecordedMarkerSearch = ReturnType<typeof unavailable> | { available: true; matches: ReturnType<typeof publicMarker>[]; totalMatches: number };
export function searchAgentMarkers(input: MarkerQuery & { includeUnrecorded?: false }): RecordedMarkerSearch;
export function searchAgentMarkers(input: MarkerSearchQuery): RecordedMarkerSearch | ReturnType<typeof searchMarkerDefinitions>;
export function searchAgentMarkers({ query, limit = 10, includeUnrecorded = false }: MarkerSearchQuery): RecordedMarkerSearch | ReturnType<typeof searchMarkerDefinitions> {
  if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS)) {
    return unavailable('Lab marker context is disabled for the active profile.');
  }
  if (includeUnrecorded) return searchMarkerDefinitions(query, limit);
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
  const visibleBounds = !from && !to && state.dateRangeFilter !== 'all' ? getLabDateRangeBounds(row.data.dates, state.dateRangeFilter, new Date(), { fallbackToAll: false }) : null;
  const since = from || visibleBounds?.min, until = to || visibleBounds?.max;
  const values = row.marker.values.flatMap((value, index) => {
    const date = markerDate(row, index);
    if (value == null || !date || (since && date < since) || (until && date > until)) return [];
    return [{
      date,
      value,
      unit: String(row.marker.unit || ''),
      ranges: getMarkerRangesForChat(row.marker, index).map(publicRange),
    }];
  });
  return {
    available: true as const,
    marker: from || to || visibleBounds ? { ...publicMarker(row), latestValue: values.at(-1)?.value ?? null, latestDate: values.at(-1)?.date ?? null, recordedValues: values.length } : publicMarker(row),
    historyScope: from || to ? 'explicit dates' : state.dateRangeFilter,
    bounds: { from: since || null, to: until || null },
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

export interface BrowserKnowledgeSearchOptions {
  signal?: AbortSignal | undefined;
  isCurrent?: (() => boolean) | undefined;
  onKnowledgeResult?: ((result: NonNullable<Awaited<ReturnType<typeof queryLensMulti>>>) => void) | undefined;
}
export async function searchAgentKnowledge({ query, limit }: AgentToolReadOptions['searchKnowledge'], options: BrowserKnowledgeSearchOptions = {}) {
  const profile = state.currentProfile, root = state.importedData, config = localStorage.getItem(LENS_CONFIG_STORAGE_KEY);
  const result = await queryLensMulti(query, { signal: options.signal, ...(limit === undefined ? {} : { topK: limit }) });
  if (state.currentProfile !== profile || state.importedData !== root || localStorage.getItem(LENS_CONFIG_STORAGE_KEY) !== config) return unavailable('The profile or Knowledge Base source changed during the search.');
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  if (!chunks.length) return unavailable('No enabled Knowledge Base returned a matching passage.');
  options.onKnowledgeResult?.(result!);
  return {
    available: true as const,
    chunks: chunks.slice(0, limit).map(chunk => ({
      source: String(chunk?.source || 'Knowledge Base').slice(0, 240),
      text: String(chunk?.text || '').slice(0, 4000),
    })),
  };
}

export async function navigateFromAgent(request: BrowserToolOptions['navigate'], isTurnCurrent: () => boolean = () => true) {
  validateAppNavigation(request);
  const { view, marker } = request;
  if (['chatPersona', 'personaEditor', 'personaDelete'].includes(view) || request.personaDraft !== undefined) return { changed: false as const, settingsSaved: false, dataSaved: false as const, reason: 'Persona management is available only in the manual persona picker and editor.' };
  const owner = { profile: state.currentProfile, thread: state.currentThreadId, root: state.importedData, history: state.chatHistory };
  const current = () => isTurnCurrent() && state.currentProfile === owner.profile && state.currentThreadId === owner.thread && state.importedData === owner.root && state.chatHistory === owner.history;
  if (!current()) return { changed: false as const, reason: 'The originating navigation request ended or changed.' };
  const editorOpen = () => {
    if (typeof document === 'undefined') return false;
    if (document.querySelector('.confirm-overlay.show,[data-chat-message-editor-host] textarea')) return true;
    const overlay = document.getElementById('modal-overlay'), readonly = ownsReadonlyHistorySurface(view);
    return [...document.querySelectorAll('.modal-overlay.show,[data-modal-focus-trap]')].some(element => !(readonly && (element === overlay || element.hasAttribute('data-modal-focus-trap') && overlay?.contains(element))));
  };
  if (editorOpen()) return { changed: false as const, reason: 'Close the current dialog or editor before opening another view. No data or settings were changed.' };
  if (request.snapshotId || request.range || request.layout || view.endsWith('Settings') || ['correlations', 'category', 'contextEditor', 'nutritionHistory', 'nutritionEditor', 'nutritionTargets', 'fluidLog', 'lightDevices', 'lightDevice', 'sunSession', 'deviceSession', 'lightAssessment', 'emfAssessment', 'knowledgeBase', 'healthImport', 'reportBuilder', 'profileShare', 'lightTools'].includes(view)) {
    if (typeof document === 'undefined') return { changed: false as const, reason: 'Native views require the browser interface.' };
    const revision = routeRevision(), main = document.getElementById('main-content')?.firstElementChild, detail = document.getElementById('detail-modal')?.firstElementChild;
    const overlay = document.getElementById('modal-overlay'), shown = overlay?.classList.contains('show');
    const sameOwner = () => current() && !editorOpen() && revision === routeRevision() && document.getElementById('main-content')?.firstElementChild === main;
    const ready = () => sameOwner() && document.getElementById('detail-modal')?.firstElementChild === detail && document.getElementById('modal-overlay') === overlay && overlay?.classList.contains('show') === shown;
    const { openNativeAppDestination } = await import('./app-navigation-runtime.js');
    // This command deliberately opens its own Settings dialog after the guarded save.
    const completedOwner = request.snapshotId && ['aiSettings', 'wearablesSettings'].includes(view) ? current : request.snapshotId || ['correlations', 'nutritionHistory', 'lightTools'].includes(view) ? () => current() && !editorOpen() : sameOwner;
    const result = await openNativeAppDestination(request, ready, completedOwner);
    return current() ? result : result.settingsSaved ? { changed: true as const, settingsSaved: true, dataSaved: false as const, reason: 'Presentation preferences were saved for the originating profile before the request ended or changed. Check the native view; no health records were saved.' }
      : result.persistenceUncertain ? { changed: false as const, persistenceUncertain: true, dataSaved: false as const, reason: 'The originating presentation preference outcome is unconfirmed. Check native settings before trying again.' }
      : { changed: false as const, reason: 'The profile or conversation changed before navigation completed.' };
  }
  if (marker) {
    const resolved = resolveAgentMarker(marker);
    if (!resolved.row) {
      return {
        changed: false as const,
        reason: resolved.matches.length ? 'Marker name is ambiguous.' : 'Marker was not found.',
        matches: resolved.matches.slice(0, 10).map(publicMarker),
      };
    }
    if (!navigateDataViewRuntime('labs', getActiveData()) || !showDataMarkerDetailRuntime(resolved.row.key.replace('.', '_'))) {
      return { changed: false as const, reason: 'Marker details are not available yet.' };
    }
    return { changed: true as const, opened: 'marker', marker: publicMarker(resolved.row) };
  }
  if (!navigateDataViewRuntime(view, getActiveData())) return { changed: false as const, reason: 'Navigation is not available yet.' };
  return { changed: true as const, opened: view };
}

function createContextCardTools() {
  const snapshots = new Map<string, { card: AgentContextCard; baseline: string }>();
  const profileId = state.currentProfile, root = state.importedData, localDate = new Date().toLocaleDateString('en-CA');
  const enabled = () => state.currentProfile === profileId && state.importedData === root && isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS);
  return {
    async readContextCard({ card }: BrowserToolOptions['readContextCard']) {
      if (!enabled()) return unavailable('Insight Context Cards are disabled for the active profile.');
      if (!card) return { available: true as const, cards: AGENT_CONTEXT_CARDS.map(card => ({ card, title: agentContextCardModel(card).title })) };
      const data = await readAgentProfileRecords(profileId), current = data[card] ?? null;
      if (!enabled()) return unavailable('Insight Context Cards are disabled for the active profile.');
      const model = agentContextCardModel(card, data);
      const baseline = JSON.stringify(current);
      if (baseline.length > 20000) return unavailable('This card is too large for a context proposal. Use its editor.');
      const snapshotId = globalThis.crypto.randomUUID();
      if (snapshots.size >= 20) snapshots.delete(snapshots.keys().next().value!);
      snapshots.set(snapshotId, { card, baseline });
      return { available: true as const, card, title: model.title, snapshotId,
        localDate,
        ...(card === 'environment' ? { emf: { mode: environmentEMFMode(data), resources: ['emfAssessments', 'emfRooms', 'emfMeasurements'], instructions: 'Quick answers are self-reported context, not measurements. When assessments exist, use their exact room records. Existing hidden quick answers remain stored. Ask for missing assessment dates, room use and reading units rather than inventing them.' } } : {}),
        fields: model.fields.map(field => ({ ...field, value: contextFieldValue(card, current, field.key), maxLength: field.kind === 'text' ? 2000 : 160 })) };
    },
    async prepareContextChange(input: BrowserToolOptions['prepareContextChange']) {
      if (!enabled()) return unavailable('Insight Context Cards are disabled for the active profile.');
      const snapshot = snapshots.get(input.snapshotId);
      if (!snapshot || snapshot.card !== input.card) return unavailable('Read the context card first to obtain a current snapshotId.');
      const current = await readAgentProfileRecords(profileId);
      if (!enabled()) return unavailable('Insight Context Cards are disabled for the active profile.');
      if (!profileDataValuesEqual(JSON.parse(snapshot.baseline), current[input.card] ?? null)) {
        return unavailable('This context card changed. Read it again before proposing an update.');
      }
      const payload = normalizeAgentContextProposal({ ...input, baseline: snapshot.baseline });
      if (!payload) return unavailable('The context proposal is invalid.');
      try {
        const rows = projectContextChanges(payload.card, JSON.parse(payload.baseline), payload.changes);
        applyAgentContextChanges(structuredClone(current), payload);
        if (rows.every(row => profileDataValuesEqual(row.before, row.after))) return unavailable('These answers are already recorded.');
        return { available: true as const, payload, summary: `Update ${agentContextCardModel(payload.card).title}: ${rows.map(row => row.label).join(', ')}` };
      } catch (error) {
        return unavailable(error instanceof Error ? error.message : 'The context proposal is invalid.');
      }
    },
  };
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
    if (changed()) {
      if (navigation && result && typeof result === 'object' && 'settingsSaved' in result && result.settingsSaved === true) return { changed: true as const, settingsSaved: true, dataSaved: false as const, reason: 'Presentation preferences were saved for the originating profile before it changed. Check the native view; no health records were saved.' };
      if (navigation && result && typeof result === 'object' && 'persistenceUncertain' in result && result.persistenceUncertain === true) return { changed: false as const, persistenceUncertain: true, dataSaved: false as const, reason: 'The originating preference outcome is unconfirmed. Check native settings before trying again.' };
      return navigation ? { changed: false as const, reason } : unavailable(reason);
    }
    return result;
  };
  return {
    readData: bind(dependencies.readData), prepareDataChange: bind(dependencies.prepareDataChange),
    prepareLegacyDraft: bind(dependencies.prepareLegacyDraft),
    searchMarkers: bind(dependencies.searchMarkers),
    readMarkerHistory: bind(dependencies.readMarkerHistory),
    readNutritionSummary: bind(dependencies.readNutritionSummary),
    readWearableSeries: bind(dependencies.readWearableSeries),
    searchKnowledge: bind(dependencies.searchKnowledge),
    searchConversations: bind(dependencies.searchConversations),
    readKnowledge: bind(dependencies.readKnowledge),
    navigate: bind(dependencies.navigate, true),
    readContextCard: bind(dependencies.readContextCard),
    prepareContextChange: bind(dependencies.prepareContextChange),
  };
}

export function createBrowserAgentToolDependencies(profileId = state.currentProfile || '', options: BrowserKnowledgeSearchOptions = {}) {
  const authorization = captureChatControlAuthorization();
  const guarded = { ...options, isCurrent: () => authorization.current() && options.isCurrent?.() !== false };
  return { canUseTools: authorization.current, createId: authorization.createId, ...bindAgentToolDependenciesToProfile({
    ...createContextCardTools(), ...createAgentDataTools(),
    searchMarkers: searchAgentMarkers,
    readMarkerHistory: readAgentMarkerHistory,
    readNutritionSummary: readAgentNutritionSummary,
    readWearableSeries: readAgentWearableSeries,
    searchKnowledge: query => searchAgentKnowledge(query, guarded),
    searchConversations: async query => {
      const owner = await import('./conversation-search.js');
      if (options.signal?.aborted || !guarded.isCurrent()) return unavailable('The originating chat changed.');
      return owner.searchPriorConversations(profileId, query, () => !options.signal?.aborted && guarded.isCurrent());
    },
    readKnowledge: async options => {
      const profile = state.currentProfile, root = state.importedData, config = localStorage.getItem(LENS_CONFIG_STORAGE_KEY);
      const module = await import('./knowledge-inventory.js');
      if (state.currentProfile !== profile || state.importedData !== root || localStorage.getItem(LENS_CONFIG_STORAGE_KEY) !== config) return unavailable('The profile or Knowledge Base source changed before its inventory could be read.');
      const result = await module.readKnowledgeInventory(options);
      if (state.currentProfile !== profile || state.importedData !== root || localStorage.getItem(LENS_CONFIG_STORAGE_KEY) !== config) return unavailable('The profile or Knowledge Base source changed during its inventory read.');
      return result;
    },
    navigate: request => navigateFromAgent(request, () => !options.signal?.aborted && guarded.isCurrent()),
  }, profileId), canDiscloseDraftReview: (draft: import('./agent-tool-runtime.js').AgentDraft) => state.currentProfile === profileId && canDiscloseAgentDraftReview({ ...draft, profileId }) };
}

/** Review receipts obey the same disclosure toggles as fresh domain reads. */
export function canDiscloseAgentDraftReview(draft: Record<string, unknown>): boolean {
  if (draft.profileId && draft.profileId !== state.currentProfile) return false;
  if (draft.kind === 'data') { const proposal = normalizeAgentDataProposal(draft.payload); return !!proposal && chatDataPatchAllowed(proposal.resource, proposal.operation, parseAgentDataPatch(proposal.patch)) && isAgentDataEnabled(proposal.resource)
    && (!isGeneticsResource(proposal.resource) || canDiscloseGeneticsReview(proposal))
    && (proposal.resource !== 'labReports' || canDiscloseLabReportReview(state.importedData, proposal))
    && (proposal.resource !== 'labSamples' || canDiscloseLabSampleReview(state.importedData, proposal))
    && (proposal.resource !== 'labResults' || canDiscloseLabResultReview(state.importedData, proposal))
    && (!isLabDisplayResource(proposal.resource) || canDiscloseLabDisplayReview(state.importedData, proposal))
    && (proposal.resource !== 'customMarkers' || canDiscloseCustomMarkerReview(state.importedData, proposal))
    && (proposal.resource !== 'markerRanges' || canDiscloseMarkerRange(state.importedData, proposal.recordId))
    && (!(proposal.resource === 'markerNotes' || proposal.resource === 'markerValueNotes') || canDiscloseMarkerNote(state.importedData, proposal.resource, proposal.recordId)); }
  if (draft.kind === 'note' && (draft.payload as { scope?: unknown } | undefined)?.scope === 'marker') {
    const query = (draft.payload as { marker?: unknown }).marker;
    const key = typeof query === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(query) ? query : resolveAgentMarker(query).row?.key;
    return !!key && isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS) && canDiscloseMarkerNote(state.importedData, 'markerNotes', key);
  }
  const source = draft.kind === 'meal' ? CONTEXT_SOURCE_IDS.NUTRITION
    : draft.kind === 'supplement' ? CONTEXT_SOURCE_IDS.SUPPLEMENTS_MEDS
      : draft.kind === 'biometric' ? CONTEXT_SOURCE_IDS.WEARABLES
        : draft.kind === 'note' && (draft.payload as { scope?: unknown } | undefined)?.scope === 'marker' ? CONTEXT_SOURCE_IDS.LAB_MARKERS
          : CONTEXT_SOURCE_IDS.INSIGHT_CARDS;
  return isContextSourceEnabled(source);
}
