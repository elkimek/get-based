// Native definition planning and scoped mutation; no presentation or AI policy.
import type { ProfileData } from '../types/app-state.js';
import { MARKER_SCHEMA, isCustomMarkerId } from './marker-schema.js';
import { mergeCustomMarkerDefinitions } from './data-custom-markers.js';
import { deriveLegacyCustomMarkerId } from './custom-marker-identity.js';
import { normalizeCustomMarkerLifecycle, validCustomMarkerKey, isBuiltinMarkerKey, retireCustomMarker } from './custom-marker-lifecycle.js';
import { validateMarkerRange } from './marker-range-core.js';
import { deleteLabEntryMarkerValues, deleteEmptyLabEntries } from './lab-entry-mutations.js';

export interface CustomMarkerInput {
  name: string; unit: string; category?: string | undefined; newCategory?: string | undefined;
  refMin?: number | null | undefined; refMax?: number | null | undefined; optimalMin?: number | null | undefined; optimalMax?: number | null | undefined;
}
export interface CustomMarkerCategory { key: string; label: string; group: string }
export interface CustomMarkerPlan {
  markerKey: string; markerId: string; category: CustomMarkerCategory; name: string; unit: string;
  definition: Record<string, unknown>; optimal: { optimalMin: number | null; optimalMax: number | null; optimalSource: 'manual' } | null;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function customMarkerMap(data: Partial<ProfileData>, key: string): Record<string, unknown> {
  const value: unknown = data[key];
  if (value != null && !object(value)) throw new Error('Review the saved marker registry in its native editor.');
  return value || {};
}
const label = (value: unknown, maximum: number, empty = false) => {
  if (typeof value !== 'string' || !empty && !value.trim() || value.trim().length > maximum || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Supply a bounded marker name, category and explicit unit.');
  return value.trim();
};
export function nativeMarkerSlug(value: string) {
  return value.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).map((word, i) => i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');
}
export function customMarkerDefinitionId(data: Partial<ProfileData>, key: string) {
  const definition = customMarkerMap(data, 'customMarkers')[key];
  if (!object(definition)) return null;
  if (definition.markerId != null && !isCustomMarkerId(definition.markerId)) throw new Error('Review this custom marker identity in its native editor.');
  return typeof definition.markerId === 'string' ? definition.markerId : deriveLegacyCustomMarkerId(key);
}
export function customMarkerCatalog(data: Partial<ProfileData>) {
  const definitions = { ...customMarkerMap(data, 'customMarkers') }, life = normalizeCustomMarkerLifecycle(data.customMarkerLifecycle);
  for (const [id, state] of Object.entries(life)) if (state.deletedAt && state.deletedAt >= state.restoredAt && customMarkerDefinitionId(data, state.markerKey) === id) delete definitions[state.markerKey];
  const view = { categories: structuredClone(MARKER_SCHEMA) };
  mergeCustomMarkerDefinitions(view, definitions as ProfileData['customMarkers']);
  for (const [key, category] of Object.entries(view.categories)) {
    if (typeof data.categoryLabels?.[key] === 'string') category.label = data.categoryLabels[key]!;
    for (const [marker, value] of Object.entries(category.markers)) if (typeof data.markerLabels?.[`${key}.${marker}`] === 'string') value.name = data.markerLabels[`${key}.${marker}`]!;
  }
  return view.categories;
}
export function customMarkerCategoryState(data: Partial<ProfileData>, category: string) {
  return { label: data.categoryLabels?.[category] ?? null,
    categoryNames: Object.entries(customMarkerCatalog(data)).map(([key, value]) => [key, value.label]),
    markerLabels: Object.fromEntries(Object.entries(customMarkerMap(data, 'markerLabels')).filter(([key]) => key.startsWith(category + '.'))),
    definitions: Object.fromEntries(Object.entries(customMarkerMap(data, 'customMarkers')).filter(([key]) => key.startsWith(category + '.')).map(([key, value]) => {
    if (!object(value)) throw new Error('Review this category in its native editor.');
    return [key, { ...value, markerId: customMarkerDefinitionId(data, key) }];
  })) };
}
export function customMarkerState(data: Partial<ProfileData>, key: string) {
  if (!validCustomMarkerKey(key)) throw new Error('Choose an exact custom marker key.');
  const id = customMarkerDefinitionId(data, key), category = key.split('.')[0]!;
  const selected = (field: string, dates = false) => Object.fromEntries(Object.entries(customMarkerMap(data, field)).filter(([entry]) => dates ? entry.startsWith(key + ':') : entry === key || field === 'markerPlacements' && entry === id));
  const life = normalizeCustomMarkerLifecycle(data.customMarkerLifecycle);
  const definition = customMarkerMap(data, 'customMarkers')[key];
  return { definition: object(definition) ? { ...definition, markerId: id } : null, category: customMarkerCategoryState(data, category),
    entries: (data.entries || []).filter(entry => [entry.markers, entry.markerSources, entry.manualOriginals, entry.deletedMarkers].some(map => object(map) && Object.hasOwn(map, key))),
    ranges: selected('refOverrides'), notes: selected('markerNotes'), labels: selected('markerLabels'), placements: selected('markerPlacements'),
    manual: selected('manualValues', true), datedNotes: selected('markerValueNotes', true), lifecycle: Object.fromEntries(Object.entries(life).filter(([, value]) => value.markerKey === key)) };
}
export function planCustomMarkerCreation(data: Partial<ProfileData>, input: CustomMarkerInput, id: string): CustomMarkerPlan {
  if (!isCustomMarkerId(id)) throw new Error('Read a fresh marker creation snapshot.');
  const name = label(input.name, 160), unit = label(input.unit, 80, true), categories = customMarkerCatalog(data);
  if (!!input.category === !!input.newCategory) throw new Error('Choose one existing category or one new category name.');
  let categoryKey: string, categoryLabel: string, group: string;
  if (input.newCategory) {
    categoryLabel = label(input.newCategory, 120); categoryKey = nativeMarkerSlug(categoryLabel);
    if (!categoryKey || /^\d/.test(categoryKey)) categoryKey = 'custom' + categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
    if (Object.hasOwn(categories, categoryKey) || Object.values(categories).some(row => row.label.toLocaleLowerCase() === categoryLabel.toLocaleLowerCase())) throw new Error('That category already exists. Choose its exact existing category key.');
    group = categoryLabel;
  } else {
    categoryKey = String(input.category); const category = Object.hasOwn(categories, categoryKey) ? categories[categoryKey] : null;
    if (!category) throw new Error('Choose an exact existing category.'); categoryLabel = String(category.label); group = String(category.contextGroup || category.group || category.label);
    if (Object.values(category.markers).some(marker => marker.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('A marker with this name already exists in that category.');
  }
  const slug = nativeMarkerSlug(name), suffix = id.slice('custom:'.length).replace(/[^a-zA-Z0-9]/g, '').slice(-16);
  if (!slug || !suffix || categoryKey.length > 108) throw new Error('Choose a marker name and category that can form a valid native identity.');
  const markerKey = `${categoryKey}.${slug.slice(0, Math.max(1, 128 - categoryKey.length - suffix.length - 2))}_${suffix}`;
  if (!validCustomMarkerKey(markerKey) || isBuiltinMarkerKey(markerKey)) throw new Error('Choose a valid custom marker identity.');
  const existing = customMarkerState(data, markerKey);
  if (existing.definition || existing.entries.length || [existing.ranges, existing.manual, existing.notes, existing.labels, existing.placements, existing.datedNotes, existing.lifecycle].some(map => Object.keys(map).length)) throw new Error('This identity has retained data. Read a new creation snapshot.');
  if (Object.values(customMarkerMap(data, 'customMarkers')).some(value => object(value) && value.markerId === id)) throw new Error('Read a new creation snapshot; this marker identity already exists.');
  if (Object.hasOwn(normalizeCustomMarkerLifecycle(data.customMarkerLifecycle), id)) throw new Error('Read a new creation snapshot; this marker identity has removal history.');
  validateMarkerRange(input.refMin ?? null, input.refMax ?? null); validateMarkerRange(input.optimalMin ?? null, input.optimalMax ?? null);
  const baseLabel = input.newCategory ? categoryLabel : customMarkerCatalog({ ...data, categoryLabels: {}, markerLabels: {} })[categoryKey]!.label;
  const definition = { markerId: id, name, unit, refMin: input.refMin ?? null, refMax: input.refMax ?? null, categoryLabel: baseLabel, contextGroup: group,
    ...(input.newCategory ? {} : categories[categoryKey]?.group ? { group: categories[categoryKey]!.group } : {}) };
  const optimal = Object.hasOwn(input, 'optimalMin') || Object.hasOwn(input, 'optimalMax') ? { optimalMin: input.optimalMin ?? null, optimalMax: input.optimalMax ?? null, optimalSource: 'manual' as const } : null;
  return { markerKey, markerId: id, category: { key: categoryKey, label: categoryLabel, group }, name, unit, definition, optimal };
}
export function applyCustomMarkerCreation(data: ProfileData, plan: CustomMarkerPlan, icon?: string) {
  data.customMarkers ||= {}; data.customMarkers[plan.markerKey] = { ...plan.definition, ...(icon ? { icon } : {}) };
  if (plan.optimal) { data.refOverrides ||= {}; data.refOverrides[plan.markerKey] = { ...plan.optimal }; }
}
export function removeCustomMarkerData(data: ProfileData, key: string, at = Date.now()) {
  const id = customMarkerDefinitionId(data, key);
  if (!id || !validCustomMarkerKey(key) || isBuiltinMarkerKey(key)) throw new Error('Only an exact custom marker can be removed.');
  const removedAt = retireCustomMarker(data, key, id, at); deleteLabEntryMarkerValues(data, key, { now: removedAt, deleteEmptyEntries: false });
  for (const entry of data.entries || []) if (entry.manualOriginals) delete entry.manualOriginals[key];
  for (const field of ['refOverrides', 'markerNotes', 'markerLabels']) delete customMarkerMap(data, field)[key];
  delete customMarkerMap(data, 'markerPlacements')[id]; delete data.customMarkers[key]; deleteEmptyLabEntries(data);
}
export function customMarkerRemovalEffects(data: ProfileData, key: string) {
  const before = customMarkerState(data, key), after = structuredClone(data); removeCustomMarkerData(after, key, 1);
  return { results: (data.entries || []).filter(entry => Object.hasOwn(entry.markers || {}, key)).length,
    samples: before.entries.length, emptiedSamples: (data.entries || []).length - after.entries.length,
    datedNotes: Object.values(before.datedNotes).filter(value => value != null && value !== '').length,
    manualEdits: Object.values(before.manual).filter(value => value != null).length, markerNote: Object.keys(before.notes).length,
    ranges: Object.keys(before.ranges).length, labels: Object.keys(before.labels).length, placements: Object.keys(before.placements).length,
    originalReportsKept: true, otherMarkersKept: true };
}
