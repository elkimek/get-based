// Final presentation-only ordering; canonical observations and calculations stay untouched.
import { getMarkerStorageDotKey } from './marker-placement.js';
import { projectNativeLabOrder } from './lab-ordering-core.js';
export function labGroupOrderId(group: string) {
  return 'group.' + Array.from(new TextEncoder().encode(group), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function orderedMarkerEntries<T>(entries: readonly [string, T][], categoryKey: string, ordering: unknown): Array<[string, T]> {
  return projectNativeLabOrder(entries, ([key, marker]) => getMarkerStorageDotKey({ storageDotKey: marker && typeof marker === 'object' && 'storageDotKey' in marker ? marker.storageDotKey : undefined }, `${categoryKey}_${key}`) || `${categoryKey}.${key}`, ordering, `markers.${categoryKey}`);
}
export function applyLabOrderingToView<T extends { markers: Record<string, { storageDotKey?: unknown }> }>(categories: Record<string, T>, ordering: unknown) {
  for (const [key, category] of Object.entries(categories)) category.markers = Object.fromEntries(orderedMarkerEntries(Object.entries(category.markers), key, ordering));
}
export function orderedLabSidebarSections<C extends { category: string }, G extends { name: string }>(categories: readonly C[], groups: readonly G[], ordering: unknown) {
  type Section = { kind: 'category'; id: string; view: C } | { kind: 'group'; id: string; view: G };
  const sections: Section[] = [...categories.map(view => ({ kind: 'category' as const, id: `category.${view.category}`, view })), ...groups.map(view => ({ kind: 'group' as const, id: labGroupOrderId(view.name), view }))];
  return projectNativeLabOrder(sections, section => section.id, ordering, 'sidebar');
}
