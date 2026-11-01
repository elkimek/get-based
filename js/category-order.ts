// category-order.js — Shared ordering for lab-category navigation and controls.
import { projectNativeLabOrder } from './lab-ordering-core.js';
import { labGroupOrderId } from './lab-ordering-view.js';

export function getLabCategoryEntriesInSidebarOrder<T extends { group?: unknown; label?: string }>(categories: Record<string, T> | null | undefined, ordering?: unknown): Array<[string, T]> {
  const regular: Array<[string, T]> = [];
  const specialtyGroups = new Map<unknown, Array<[string, T]>>();
  for (const entry of Object.entries(categories || {})) {
    const group = entry[1]?.group;
    if (!group) {
      regular.push(entry);
      continue;
    }
    if (!specialtyGroups.has(group)) specialtyGroups.set(group, []);
    specialtyGroups.get(group)!.push(entry);
  }
  const blocks = [...regular.map(entry => ({ id: `category.${entry[0]}`, entries: [entry] })), ...Array.from(specialtyGroups, ([group, entries]) => ({ id: labGroupOrderId(String(group)), entries: projectNativeLabOrder(entries, ([key]) => key, ordering, `categories.${labGroupOrderId(String(group))}`) }))];
  return projectNativeLabOrder(blocks, block => block.id, ordering, 'sidebar').flatMap(block => block.entries);
}
