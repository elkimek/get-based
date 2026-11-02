// Native display metadata: canonical marker addresses and observations never move.
import type { ProfileData } from '../types/app-state.js';
import { customMarkerCatalog, customMarkerMap, customMarkerDefinitionId } from './custom-marker-core.js';
import { validCustomMarkerKey } from './custom-marker-lifecycle.js';
import { resolveMarkerIdentity, getMarkerPlacementPlan, setMarkerPlacement, clearMarkerPlacement, migrateMarkerPlacements } from './marker-placement.js';

export type LabDisplayResource = 'markerDisplay' | 'labCategories';
export interface LabCategoryDisplay { key: string; label: string; group: string }
export interface LabCategoryRecord extends LabCategoryDisplay { id: string; baseLabel: string; hasOverride: boolean }
export interface LabMarkerDisplayRecord {
  id: string; markerId: string; name: string; baseName: string; nativeCategory: LabCategoryDisplay; category: LabCategoryDisplay;
  hasNameOverride: boolean; hasPlacementOverride: boolean; placementReason: string;
}
export type LabDisplayRecord = LabCategoryRecord | LabMarkerDisplayRecord;
export interface LabDisplaySnapshot { version: 1; resource: LabDisplayResource; record: LabDisplayRecord; choices: LabCategoryDisplay[]; revision: string }
export interface LabDisplayCommand { name?: string; category?: string; label?: string; restore?: Array<'name' | 'category' | 'label'> }
export const isLabDisplayResource = (resource: string): resource is LabDisplayResource => resource === 'markerDisplay' || resource === 'labCategories';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, maximum = 4000): string => { if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error('Review this saved lab label in its native editor.'); return value; };
export function labDisplayLabel(value: unknown, maximum: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`Supply a nonempty display label with at most ${maximum} characters.`);
  return value.trim();
}
function categories(data: Partial<ProfileData>) {
  return customMarkerCatalog({ ...data, categoryLabels: {}, markerLabels: {} });
}
export function labCategoryDisplay(data: Partial<ProfileData>, key: string, catalog = categories(data)): LabCategoryRecord {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key) || !Object.hasOwn(catalog, key)) throw new Error('Choose an exact existing lab category key.');
  const category = catalog[key]!, labels = customMarkerMap(data, 'categoryLabels'), baseLabel = text(category.label), override = labels[key];
  if (override != null && typeof override !== 'string') throw new Error('Review this category label in its native editor.');
  return { id: key, key, label: override == null ? baseLabel : text(override), baseLabel, group: text(category.contextGroup || category.group || baseLabel), hasOverride: Object.hasOwn(labels, key) };
}
const categoryInfo = ({ key, label, group }: LabCategoryRecord): LabCategoryDisplay => ({ key, label, group });
export function labMarkerDisplay(data: Partial<ProfileData>, key: string, catalog = categories(data), plan = getMarkerPlacementPlan(data)): LabMarkerDisplayRecord {
  if (!validCustomMarkerKey(key)) throw new Error('Choose an exact canonical marker key.');
  const [categoryKey, markerKey] = key.split('.') as [string, string], category = labCategoryDisplay(data, categoryKey, catalog), marker = catalog[categoryKey]!.markers[markerKey];
  if (!Object.hasOwn(catalog[categoryKey]!.markers, markerKey) || !marker) throw new Error('This marker no longer exists.');
  const identity = resolveMarkerIdentity(data, key); if (!identity) throw new Error('This marker has no unambiguous native identity.');
  if (identity.custom && Object.keys(customMarkerMap(data, 'customMarkers')).filter(other => customMarkerDefinitionId(data, other) === identity.markerId).length !== 1) throw new Error('This custom marker identity needs review in its native editor.');
  const placement = plan[identity.markerId]; if (!placement) throw new Error('Review this marker placement in its native editor.');
  const labels = customMarkerMap(data, 'markerLabels'), name = labels[key] ?? marker.name, baseName = text(marker.name);
  const placements = customMarkerMap(data, 'markerPlacements'), saved = placements[identity.markerId];
  if (saved != null && typeof saved !== 'string' && !object(saved)) throw new Error('Review the saved placement in its native editor.');
  return { id: key, markerId: identity.markerId, name: text(name), baseName, nativeCategory: categoryInfo(category), category: categoryInfo(labCategoryDisplay(data, placement.effectiveCategoryKey, catalog)),
    hasNameOverride: Object.hasOwn(labels, key), hasPlacementOverride: typeof saved === 'string' || object(saved) && typeof saved.categoryKey === 'string', placementReason: placement.reason };
}
export function nativeLabDisplayRecords(data: Partial<ProfileData>, resource: LabDisplayResource): LabDisplayRecord[] {
  const catalog = categories(data), plan = resource === 'markerDisplay' ? getMarkerPlacementPlan(data) : {};
  return Object.entries(catalog).flatMap<LabDisplayRecord>(([categoryKey, value]) => resource === 'labCategories' ? [labCategoryDisplay(data, categoryKey, catalog)] : Object.keys(value.markers).map(key => labMarkerDisplay(data, `${categoryKey}.${key}`, catalog, plan)));
}
export function labDisplayRecord(data: Partial<ProfileData>, resource: LabDisplayResource, id: string): LabDisplayRecord {
  return resource === 'markerDisplay' ? labMarkerDisplay(data, id) : labCategoryDisplay(data, id);
}
export function nativeLabDisplayChoices(data: Partial<ProfileData>, resource: LabDisplayResource, id: string): LabCategoryDisplay[] {
  if (resource !== 'markerDisplay') return [];
  const record = labMarkerDisplay(data, id), catalog = categories(data), choices: LabCategoryDisplay[] = [];
  for (const key of Object.keys(catalog)) {
    const candidate = { ...data, markerPlacements: { ...customMarkerMap(data, 'markerPlacements') } };
    if (setMarkerPlacement(candidate, record.id, key).ok) choices.push(categoryInfo(labCategoryDisplay(data, key, catalog)));
  }
  return choices;
}
export function labDisplayState(data: Partial<ProfileData>, resource: LabDisplayResource, id: string) {
  const record = labDisplayRecord(data, resource, id);
  const definitions = Object.fromEntries(Object.entries(customMarkerMap(data, 'customMarkers')).map(([key, value]) => [key, object(value) ? { ...value, markerId: customMarkerDefinitionId(data, key) } : value]));
  const placements = { markerPlacements: structuredClone(data.markerPlacements || {}) }; migrateMarkerPlacements(placements);
  // Placement feasibility depends on the complete definition/placement registry.
  // These raw fields never leave the native owner; public snapshots carry a hash.
  return { record, definitions, categoryLabels: data.categoryLabels ?? null,
    ...(resource === 'markerDisplay' ? { markerLabel: customMarkerMap(data, 'markerLabels')[id] ?? null, placements: placements.markerPlacements } : {}) };
}
export function applyNativeLabDisplay(data: ProfileData, resource: LabDisplayResource, id: string, command: LabDisplayCommand) {
  const before = labDisplayRecord(data, resource, id);
  if (resource === 'labCategories') {
    data.categoryLabels ||= {};
    if (command.restore?.includes('label')) delete data.categoryLabels[id];
    else data.categoryLabels[id] = labDisplayLabel(command.label, 120);
    // Definitions retain their saved category label and disclosure identity.
  } else {
    if (Object.hasOwn(command, 'name') || command.restore?.includes('name')) {
      data.markerLabels ||= {};
      if (command.restore?.includes('name')) delete data.markerLabels[id]; else data.markerLabels[id] = labDisplayLabel(command.name, 160);
    }
    if (Object.hasOwn(command, 'category') || command.restore?.includes('category')) {
      customMarkerMap(data, 'markerPlacements');
      const result = command.restore?.includes('category') ? clearMarkerPlacement(data, id) : setMarkerPlacement(data, id, String(command.category));
      if (!result.ok) throw new Error('This destination cannot preserve the marker’s native identity and category semantics.');
    }
  }
  return { before, after: labDisplayRecord(data, resource, id) };
}
