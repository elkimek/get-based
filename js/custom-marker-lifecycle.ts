// Identity-scoped removal intent prevents stale peers from resurrecting markers.
import { MARKER_SCHEMA, isCustomMarkerId } from './marker-schema.js';
import { deriveLegacyCustomMarkerId } from './custom-marker-identity.js';
import { deleteLabEntryMarker } from './lab-entry.js';
import type { LabEntryDraft } from './lab-entry.js';
export interface CustomMarkerLife { markerKey: string; deletedAt: number; restoredAt: number }
export type CustomMarkerLifecycle = Record<string, CustomMarkerLife>;
export interface CustomMarkerLifeData { customMarkers?: unknown; customMarkerLifecycle?: unknown; entries?: LabEntryDraft[] | null | undefined; [key: string]: unknown }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function validCustomMarkerKey(key: unknown): key is string {
  return typeof key === 'string' && key.length <= 148 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key) && !key.split('.').some(part => ['__proto__', 'constructor', 'prototype'].includes(part));
}
export function isBuiltinMarkerKey(key: string) {
  const [category, marker] = key.split('.') as [string, string];
  return Object.hasOwn(MARKER_SCHEMA, category) && Object.hasOwn(MARKER_SCHEMA[category]!.markers, marker);
}
const clock = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
export function normalizeCustomMarkerLifecycle(raw: unknown): CustomMarkerLifecycle {
  if (raw == null) return {};
  if (!object(raw) || Object.keys(raw).length > 10000) throw new Error('Review the custom marker removal history before continuing.');
  const out: CustomMarkerLifecycle = {}, keys = new Set<string>();
  for (const [id, value] of Object.entries(raw)) {
    if (!isCustomMarkerId(id) || !object(value) || !validCustomMarkerKey(value.markerKey) || isBuiltinMarkerKey(value.markerKey)
      || !clock(value.deletedAt) || !clock(value.restoredAt) || Object.keys(value).some(key => !['markerKey', 'deletedAt', 'restoredAt'].includes(key))) throw new Error('Review the custom marker removal history before continuing.');
    if (keys.has(value.markerKey)) throw new Error('Conflicting custom marker storage identities require review.');
    keys.add(value.markerKey); out[id] = { markerKey: value.markerKey, deletedAt: value.deletedAt, restoredAt: value.restoredAt };
  }
  return out;
}
export function mergeCustomMarkerLifecycle(left: unknown, right: unknown): CustomMarkerLifecycle {
  const a = normalizeCustomMarkerLifecycle(left), b = normalizeCustomMarkerLifecycle(right), out = { ...a };
  for (const [id, value] of Object.entries(b)) {
    const previous = out[id]; if (previous && previous.markerKey !== value.markerKey) throw new Error('Conflicting custom marker identities require review.');
    out[id] = { markerKey: value.markerKey, deletedAt: Math.max(previous?.deletedAt || 0, value.deletedAt), restoredAt: Math.max(previous?.restoredAt || 0, value.restoredAt) };
  }
  return normalizeCustomMarkerLifecycle(out);
}
export function retireCustomMarker(data: CustomMarkerLifeData, markerKey: string, id: string, at = Date.now()) {
  if (!validCustomMarkerKey(markerKey) || isBuiltinMarkerKey(markerKey) || !isCustomMarkerId(id) || !clock(at)) throw new Error('Choose an exact custom marker.');
  const life = normalizeCustomMarkerLifecycle(data.customMarkerLifecycle), before = life[id];
  if (before && before.markerKey !== markerKey) throw new Error('This marker identity changed.');
  if (Object.entries(life).some(([other, value]) => other !== id && value.markerKey === markerKey)) throw new Error('This marker key has a different retained identity.');
  const deletedAt = Math.max(at, before?.deletedAt || 0, (before?.restoredAt || 0) + 1);
  if (!clock(deletedAt)) throw new Error('The custom marker removal clock cannot be advanced safely.');
  life[id] = { markerKey, deletedAt, restoredAt: before?.restoredAt || 0 };
  data.customMarkerLifecycle = life;
  return deletedAt;
}
function checkIdentities(data: CustomMarkerLifeData, life: CustomMarkerLifecycle) {
  const definitions = object(data.customMarkers) ? data.customMarkers : {};
  for (const [id, state] of Object.entries(life)) {
    const definition = definitions[state.markerKey];
    if (object(definition) && (definition.markerId || deriveLegacyCustomMarkerId(state.markerKey)) !== id) throw new Error('Conflicting custom marker storage identities require review.');
  }
}
export function reconcileCustomMarkerLifecycle<Data extends CustomMarkerLifeData>(data: Data): Data {
  const life = normalizeCustomMarkerLifecycle(data.customMarkerLifecycle), definitions = object(data.customMarkers) ? data.customMarkers : {};
  // Validate every identity before touching any record, including during native recovery loads.
  checkIdentities(data, life);
  for (const [id, state] of Object.entries(life)) {
    if (!state.deletedAt || state.restoredAt > state.deletedAt) continue;
    delete definitions[state.markerKey];
    for (const field of ['refOverrides', 'markerNotes', 'markerLabels']) if (object(data[field])) delete data[field][state.markerKey];
    if (object(data.markerPlacements)) delete data.markerPlacements[id];
    for (const field of ['manualValues', 'markerValueNotes']) if (object(data[field])) for (const key of Object.keys(data[field])) if (key.startsWith(state.markerKey + ':')) data[field][key] = null;
    for (const entry of data.entries || []) {
      const previous = entry.markerSources?.[state.markerKey]?.at, at = Math.max(state.deletedAt, typeof previous === 'number' && Number.isSafeInteger(previous) ? previous + 1 : 0);
      deleteLabEntryMarker(entry, state.markerKey, { now: at, stamp: false });
    }
  }
  return data;
}
export function mergeCustomMarkerRemovalState<Data extends CustomMarkerLifeData>(left: CustomMarkerLifeData, right: CustomMarkerLifeData, result: Data): Data {
  const life = mergeCustomMarkerLifecycle(left.customMarkerLifecycle, right.customMarkerLifecycle);
  if (!Object.keys(life).length && !left.customMarkerLifecycle && !right.customMarkerLifecycle) return result;
  // The generic merge can retain input record references. Reconciliation owns only its new maps.
  const owned: CustomMarkerLifeData = { ...result, customMarkerLifecycle: life };
  for (const field of ['customMarkers', 'refOverrides', 'markerNotes', 'markerLabels', 'markerPlacements', 'manualValues', 'markerValueNotes']) if (object(owned[field])) owned[field] = { ...owned[field] };
  const retired = new Set(Object.values(life).filter(row => row.deletedAt && row.deletedAt >= row.restoredAt).map(row => row.markerKey));
  if (owned.entries) owned.entries = owned.entries.map(entry => [...retired].some(key => [entry.markers, entry.markerSources, entry.manualOriginals].some(map => object(map) && Object.hasOwn(map, key)))
    ? { ...entry, ...(entry.markers ? { markers: { ...entry.markers } } : {}), ...(entry.markerSources ? { markerSources: { ...entry.markerSources } } : {}), ...(entry.manualOriginals ? { manualOriginals: { ...entry.manualOriginals } } : {}), ...(entry.deletedMarkers ? { deletedMarkers: { ...entry.deletedMarkers } } : {}) } : entry);
  return reconcileCustomMarkerLifecycle(owned) as Data;
}
export function customMarkerRemovalNeedsRebroadcast(left: CustomMarkerLifeData, right: CustomMarkerLifeData) {
  const a = normalizeCustomMarkerLifecycle(left.customMarkerLifecycle), b = normalizeCustomMarkerLifecycle(right.customMarkerLifecycle);
  return Object.entries(a).some(([id, value]) => !b[id] || b[id]!.markerKey !== value.markerKey || value.deletedAt > b[id]!.deletedAt || value.restoredAt > b[id]!.restoredAt);
}
/** Explicit native import, unlike peer sync, may revive definitions included in the backup. */
export function planCustomMarkerRestore(local: CustomMarkerLifeData, incoming: CustomMarkerLifeData, now = Date.now()) {
  const lifecycle = mergeCustomMarkerLifecycle(local.customMarkerLifecycle, incoming.customMarkerLifecycle);
  const importedLife = normalizeCustomMarkerLifecycle(incoming.customMarkerLifecycle), active: Array<[string, string]> = [];
  checkIdentities(local, normalizeCustomMarkerLifecycle(local.customMarkerLifecycle)); checkIdentities(incoming, importedLife);
  if (incoming.customMarkers != null && !object(incoming.customMarkers)) throw new Error('Invalid imported marker definitions.');
  for (const [key, definition] of Object.entries(incoming.customMarkers || {})) {
    if (isBuiltinMarkerKey(key)) continue; // Built-in assay metadata is not a removable custom marker.
    // Keep opaque legacy/foreign metadata in native backups without treating it as a marker identity.
    if (!validCustomMarkerKey(key) || !object(definition)) continue;
    const id = definition.markerId ?? deriveLegacyCustomMarkerId(key);
    if (typeof id !== 'string' || !isCustomMarkerId(id)) throw new Error('Invalid imported custom marker identity.');
    const saved = object(local.customMarkers) ? local.customMarkers[key] : null;
    if (object(saved) && (saved.markerId ?? deriveLegacyCustomMarkerId(key)) !== id) throw new Error('This marker key belongs to a different identity. Import stopped without combining its results.');
    const history = lifecycle[id];
    if (Object.entries(lifecycle).some(([other, value]) => other !== id && value.markerKey === key)) throw new Error('This marker key has a different retained identity. Import stopped without combining its results.');
    if (history && history.markerKey !== key) throw new Error('Conflicting imported marker identities require review.');
    const source = importedLife[id];
    if (!source?.deletedAt || source.restoredAt > source.deletedAt) active.push([key, id]);
  }
  let at = now;
  for (const value of Object.values(lifecycle)) at = Math.max(at, value.deletedAt + 1, value.restoredAt + 1);
  for (const data of [local, incoming]) for (const entry of data.entries || []) for (const [key] of active) {
    for (const value of [entry.deletedMarkers?.[key], entry.markerSources?.[key]?.at]) if (typeof value === 'number' && Number.isFinite(value)) at = Math.max(at, value + 1);
  }
  if (!clock(at)) throw new Error('The imported marker removal clock cannot be advanced safely.');
  for (const [markerKey, id] of active) if (lifecycle[id]) lifecycle[id] = { markerKey, deletedAt: lifecycle[id]!.deletedAt, restoredAt: at };
  return { lifecycle, at };
}
