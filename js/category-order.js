// @ts-check
// category-order.js — Shared ordering for lab-category navigation and controls.

/**
 * Keep regular lab categories first, followed by specialty groups in their
 * schema order. This mirrors the sidebar without depending on rendered DOM.
 *
 * @param {Record<string, any>} categories
 * @returns {Array<[string, any]>}
 */
export function getLabCategoryEntriesInSidebarOrder(categories) {
  const regular = [];
  const specialtyGroups = new Map();
  for (const entry of Object.entries(categories || {})) {
    const group = entry[1]?.group;
    if (!group) {
      regular.push(entry);
      continue;
    }
    if (!specialtyGroups.has(group)) specialtyGroups.set(group, []);
    specialtyGroups.get(group).push(entry);
  }
  return regular.concat(...specialtyGroups.values());
}
