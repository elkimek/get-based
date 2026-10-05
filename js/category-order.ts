// category-order.js — Shared ordering for lab-category navigation and controls.

export function getLabCategoryEntriesInSidebarOrder<T extends { group?: unknown; label?: string }>(categories: Record<string, T> | null | undefined): Array<[string, T]> {
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
  return regular.concat(...specialtyGroups.values());
}
