// Native ordering scopes are derived from the same definition/placement registry as the UI.
import type { ProfileData } from '../types/app-state.js';
import { customMarkerCatalog } from './custom-marker-core.js';
import { applyMarkerPlacements, getMarkerStorageDotKey } from './marker-placement.js';
import { labCategoryDisplay } from './lab-display-core.js';
import { labGroupOrderId } from './lab-ordering-view.js';
import { labOrderingMap, parseLabOrderRecord, parseLabOrderMove, projectLabOrder, appendLabOrderMove, cancelLabOrderMove, replaceLabOrder, writeLabOrder, validLabOrderId } from './lab-ordering-core.js';
import type { LabOrderMove } from './lab-ordering-core.js';
export interface NativeLabOrderItem { id: string; label: string; sourceKeys: string[] }
export interface NativeLabOrderScope { id: string; label: string; kind: 'sidebar' | 'categories' | 'markers'; items: NativeLabOrderItem[] }
export type NativeLabOrderCommand = { move: LabOrderMove } | { reset: true } | { restore: unknown } | { cancelMove: string };
export function nativeLabOrderScopes(data: Partial<ProfileData>): NativeLabOrderScope[] {
  const catalog = customMarkerCatalog({ ...data, categoryLabels: {}, markerLabels: {} });
  const labels = new Map(Object.keys(catalog).map(key => [key, labCategoryDisplay(data, key, catalog)]));
  const placed = Object.fromEntries(Object.entries(catalog).map(([key, category]) => [key, { ...category, markers: Object.fromEntries(Object.entries(category.markers).map(([markerKey, marker]) => [markerKey, { ...marker }])) }]));
  applyMarkerPlacements(placed, data);
  const sidebar: NativeLabOrderScope = { id: 'sidebar', kind: 'sidebar', label: 'Lab category shortcuts', items: [] }, groups = new Map<string, NativeLabOrderScope>(), markers: NativeLabOrderScope[] = [];
  for (const [key, category] of Object.entries(placed)) {
    const label = labels.get(key)!.label, entries = Object.entries(category.markers).map(([markerKey, marker]) => {
      const id = getMarkerStorageDotKey(marker, `${key}_${markerKey}`);
      if (!id) throw new Error('Review the saved marker identity before ordering it.');
      const name: unknown = data.markerLabels?.[id] ?? marker.name;
      if (typeof name !== 'string' || !name.trim() || name.length > 4000) throw new Error('Review the saved marker name before ordering it.');
      return { id, label: name, sourceKeys: [id] };
    });
    markers.push({ id: `markers.${key}`, kind: 'markers', label: `${label} markers`, items: entries });
    const item: NativeLabOrderItem = { id: key, label, sourceKeys: entries.flatMap(row => row.sourceKeys) };
    if (!category.group) sidebar.items.push({ ...item, id: `category.${key}` });
    else {
      const groupId = labGroupOrderId(String(category.group));
      if (!validLabOrderId(groupId)) throw new Error('This specialty group name needs native review before ordering.');
      if (!groups.has(groupId)) groups.set(groupId, { id: `categories.${groupId}`, kind: 'categories', label: `${category.group} categories`, items: [] });
      groups.get(groupId)!.items.push(item);
    }
  }
  for (const [id, group] of groups) sidebar.items.push({ id, label: group.label.slice(0, -11), sourceKeys: group.items.flatMap(item => item.sourceKeys) });
  return [sidebar, ...groups.values(), ...markers];
}
export function nativeLabOrderScope(data: Partial<ProfileData>, id: string) {
  const scope = nativeLabOrderScopes(data).find(row => row.id === id);
  if (!validLabOrderId(id) || !scope) throw new Error('Choose an exact existing lab order scope from a fresh read.');
  return scope;
}
export function nativeLabOrderRecord(data: Partial<ProfileData>, id: string) {
  const scope = nativeLabOrderScope(data, id), rules = parseLabOrderRecord(labOrderingMap(data.labOrdering)[id]);
  return { ...scope, items: projectLabOrder(scope.items, row => row.id, rules), hasMoves: rules.commands.some(row => !rules.cancelled?.includes(row.id)), hasHistory: rules.commands.length > 0 || !!rules.cancelled?.length };
}
export function nativeLabOrderState(data: Partial<ProfileData>, id: string) {
  return { record: nativeLabOrderRecord(data, id), saved: labOrderingMap(data.labOrdering)[id] ?? null,
    customMarkers: data.customMarkers ?? null, markerPlacements: data.markerPlacements ?? null, categoryLabels: data.categoryLabels ?? null, markerLabels: data.markerLabels ?? null };
}
export function applyNativeLabOrder(data: ProfileData, scopeId: string, command: NativeLabOrderCommand, id = crypto.randomUUID(), now = Date.now()) {
  if (!command || typeof command !== 'object' || Array.isArray(command) || Object.keys(command).length !== 1
    || !('move' in command) && !('restore' in command) && !('cancelMove' in command) && !('reset' in command && command.reset === true)) throw new Error('Choose one explicit native ordering operation.');
  const scope = nativeLabOrderScope(data, scopeId), before = labOrderingMap(data.labOrdering)[scopeId] ?? null;
  let next;
  if ('move' in command) {
    const move = parseLabOrderMove(command.move), anchor = move.before ?? move.after;
    if (!scope.items.some(row => row.id === move.item) || !scope.items.some(row => row.id === anchor)) throw new Error('The selected ordering item or anchor moved or no longer exists. Read a fresh review.');
    next = appendLabOrderMove(before, move, id, now);
  } else if ('cancelMove' in command) next = cancelLabOrderMove(before, command.cancelMove);
  else next = replaceLabOrder(before, 'restore' in command ? command.restore : null, id, now);
  writeLabOrder(data, scopeId, next);
  return { before, after: next, record: nativeLabOrderRecord(data, scopeId) };
}
