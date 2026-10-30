// One source policy for broad context, exact lookups and derived-value inputs.
import { state } from './state.js';
import { labToolRegistry, labToolMarkerGroup, validLabToolMarkerKey } from './lab-tool-markers.js';
import { isGroupInAIContext, isLabMarkersContextEnabled } from './lab-context-settings.js';
import { isContextSourceEnabled } from './context-source-registry.js';
import { getMarkerStorageDotKey } from './marker-placement.js';
import { filterRemovedLabDates, filterRemovedLabPanels } from './lab-panel-deletions.js';
import { identifyLabPanels } from './lab-panel-identity.js';
import { getLabEntryMarkerTombstoneAt, getLabEntryMarkerValueTimestamp } from './lab-entry.js';
import { convertCanonicalToDisplay } from './unit-profiles.js';
import type { ActiveData, ActiveMarker } from './data-view-types.js';
import type { LabEntry } from '../types/lab-data.js';
import type { LabContextOptions } from './lab-context-runtime.js';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const cycleFields = ['cycleDay', 'cyclePhase', 'cyclePhaseDetail', 'cyclePhaseSource'];
const dateFields = ['phaseRefRanges', 'phaseLabels', 'phaseDisplayLabels', 'phaseCycleDays', 'phaseSources', 'contextRefRanges', 'contextRangeLabels', 'contextOptimalRanges', 'contextOptimalRangeLabels'] as const;

export function createLabContextDisclosure(options: Pick<LabContextOptions, 'skipGroupFilter' | 'ignoreContextToggles'> = {}) {
  const imported = state.importedData, includeLabs = options.ignoreContextToggles || isLabMarkersContextEnabled();
  const bypassGroups = options.ignoreContextToggles || options.skipGroupFilter;
  let registry: ReturnType<typeof labToolRegistry> = {};
  try { registry = labToolRegistry(imported); } catch { /* Malformed definitions cannot grant disclosure. */ }
  const sourceEnabled = (source: string) => options.ignoreContextToggles || isContextSourceEnabled(source);
  const knownCache = new Map<string, boolean>();
  const known = (key: string) => {
    if (knownCache.has(key)) return knownCache.get(key)!;
    if (!includeLabs || !validLabToolMarkerKey(key)) return false;
    const [categoryKey, markerKey] = key.split('.') as [string, string], category = registry[categoryKey];
    const enabled = !!category?.markers[markerKey] && (bypassGroups || isGroupInAIContext(labToolMarkerGroup(categoryKey, category)));
    knownCache.set(key, !!enabled); return !!enabled;
  };
  const activeEntries = (rows: readonly LabEntry[]) => filterRemovedLabDates(filterRemovedLabPanels(identifyLabPanels(rows), imported.labPanelTombstones), imported).map(entry => ({ ...entry,
    markers: Object.fromEntries(Object.entries(entry.markers || {}).filter(([key]) => !getLabEntryMarkerTombstoneAt(entry, key) || getLabEntryMarkerValueTimestamp(entry, key) > getLabEntryMarkerTombstoneAt(entry, key))),
  })) as LabEntry[];
  const sourceEntries = activeEntries(imported.entries || []);
  const rawCounts = new Map<string, number>(), activeResults = new Map<string, LabEntry[]>();
  for (const entry of identifyLabPanels(imported.entries || [])) for (const key of Object.keys(entry.markers || {})) {
    const address = `${key}:${entry.date}`; rawCounts.set(address, (rawCounts.get(address) || 0) + 1);
  }
  for (const entry of sourceEntries) for (const [key, value] of Object.entries(entry.markers || {})) if (finite(value)) {
    const address = `${key}:${entry.date}`; if (!activeResults.has(address)) activeResults.set(address, []); activeResults.get(address)!.push(entry);
  }
  const byDate = new Map<string, LabEntry[]>();
  for (const entry of sourceEntries) { if (!byDate.has(entry.date)) byDate.set(entry.date, []); byDate.get(entry.date)!.push(entry); }
  const projections = new Map<string, ActiveMarker>();
  function allows(key: string, date?: string, visited = new Set<string>()): boolean {
    if (key.startsWith('@')) return !!sourceEnabled(key.slice(1));
    if (!known(key) || visited.has(key)) return false;
    if (!date) return true;
    if (rawCounts.has(`${key}:${date}`) && !activeResults.has(`${key}:${date}`)) return false;
    const next = new Set(visited).add(key);
    const marker = projections.get(key), index = marker?.singlePoint ? 0 : dateIndices.get(date) ?? -1;
    const dependencies = [...(marker?.contextDependencies?.[index] || [])];
    for (const entry of byDate.get(date) || []) {
      if (!finite(entry.markers?.[key])) continue;
      const source = entry.markerSources?.[key];
      if (source?.reported !== true && Array.isArray(source?.derivedFrom)) dependencies.push(...source.derivedFrom);
      // Unmarked historical HOMA has uncertain reported/calculated ownership.
      // Do not disclose it as a way around a hidden input. A reported flag is
      // established by the explicit result owner, not guessed by this view.
      if (key === 'diabetes.homaIR' && source?.reported !== true) dependencies.push('biochemistry.glucose', 'diabetes.insulin');
    }
    return dependencies.every(input => typeof input === 'string' && allows(input, date, next));
  }
  let dates: string[] = [];
  const dateIndices = new Map<string, number>();
  function entries(rows: readonly LabEntry[]) {
    return activeEntries(rows).flatMap(entry => {
      const markers = Object.fromEntries(Object.entries(entry.markers || {}).filter(([key, value]) => finite(value) && allows(key, entry.date)));
      if (!Object.keys(markers).length) return [];
      const context = { ...entry.context };
      if (!sourceEnabled('insight-cards')) for (const key of cycleFields) delete context[key];
      return [{ ...entry, markers, context }];
    });
  }
  function project(data: ActiveData): ActiveData {
    dates = data.dates;
    dates.forEach((date, index) => dateIndices.set(date, index));
    for (const [categoryKey, category] of Object.entries(data.categories)) for (const [markerKey, marker] of Object.entries(category.markers)) {
      const key = getMarkerStorageDotKey(marker, `${categoryKey}_${markerKey}`);
      if (key) projections.set(key, marker);
    }
    const visibleEntries = entries(sourceEntries), contexts = new Map<string, LabEntry[]>();
    for (const entry of visibleEntries) { if (!contexts.has(entry.date)) contexts.set(entry.date, []); contexts.get(entry.date)!.push(entry); }
    const multiple = new Set([...contexts].filter(([, rows]) => rows.length > 1).map(([date]) => date));
    const counts = new Map<string, number>();
    for (const entry of visibleEntries) for (const key of Object.keys(entry.markers || {})) {
      const address = `${key}:${entry.date}`; counts.set(address, (counts.get(address) || 0) + 1);
    }
    const categories: ActiveData['categories'] = {};
    for (const [categoryKey, category] of Object.entries(data.categories)) {
      const markers: typeof category.markers = {};
      for (const [markerKey, marker] of Object.entries(category.markers)) {
        const key = getMarkerStorageDotKey(marker, `${categoryKey}_${markerKey}`);
        if (!key || !allows(key)) continue;
        const valueDates = marker.singlePoint || category.singlePoint ? [marker.singleDate || category.singleDate || ''] : dates;
        const values = marker.values.map((value, i) => {
          const address = `${key}:${valueDates[i]}`, active = activeResults.get(address);
          if (!allows(key, valueDates[i]) || (counts.get(address) || 0) > 1) return null;
          // A stale removed sibling may still own the cached date-wide value.
          // Select the sole surviving sample's canonical value in that case.
          if (active?.length === 1 && (rawCounts.get(address) || 0) > 1) return convertCanonicalToDisplay(key, active[0]!.markers![key]!, state.unitSystem, imported.customMarkers?.[key]?.unit || null);
          return value;
        });
        const next = { ...marker, values, contextSampleCount: visibleEntries.filter(entry => finite(entry.markers?.[key]) && (counts.get(`${key}:${entry.date}`) || 0) > 1).length };
        for (const field of dateFields) if (Array.isArray(marker[field])) {
          // Do not attach one draw's phase or contextual range to another draw.
          Object.assign(next, { [field]: marker[field]!.map((value, i) => multiple.has(valueDates[i] || '') || field.startsWith('phase') && !sourceEnabled('insight-cards') || values[i] == null ? null : value) });
        }
        markers[markerKey] = next;
      }
      categories[categoryKey] = { ...category, markers };
    }
    const visibleDates = new Set(visibleEntries.map(entry => entry.date));
    const indices = dates.flatMap((date, i) => visibleDates.has(date) || Object.values(categories).some(category => Object.values(category.markers).some(marker => !marker.singlePoint && marker.values[i] != null)) ? [i] : []);
    for (const category of Object.values(categories)) for (const marker of Object.values(category.markers)) if (!marker.singlePoint && !category.singlePoint) {
      marker.values = indices.map(i => marker.values[i]!);
      for (const field of [...dateFields, 'contextDependencies'] as const) if (Array.isArray(marker[field])) Object.assign(marker, { [field]: indices.map(i => marker[field]![i]) });
    }
    const contextExcludedMarkers = Object.entries(registry).flatMap(([category, row]) => Object.keys(row.markers).map(key => `${category}.${key}`)).filter(key => !allows(key));
    const result: ActiveData = { ...data, categories, contextExcludedMarkers, dates: indices.map(i => dates[i]!), dateLabels: indices.map(i => data.dateLabels?.[i] || dates[i]!),
      entryContextByDate: Object.fromEntries([...contexts].filter(([date, rows]) => rows.length === 1 && !multiple.has(date)).map(([date, rows]) => [date, rows[0]!.context || {}])) };
    delete result.phaseLabels; delete result.phaseDisplayLabels; delete result.phaseCycleDays; delete result.phaseSources;
    return result;
  }
  return { allows, entries, project };
}
