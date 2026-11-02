// Sidebar HTML is static; move its existing whole native nodes, keeping group pairs together.
import { orderedLabSidebarSections } from './lab-ordering-view.js';
export function orderSidebarLabNodes<C extends { category: string }, G extends { name: string }>(container: HTMLElement, categories: readonly C[], groups: readonly G[], ordering: unknown) {
  const original = [...categories.map(view => `category.${view.category}`), ...groups.map(view => view.name)];
  const sections = orderedLabSidebarSections(categories, groups, ordering);
  if (sections.every((section, index) => (section.kind === 'category' ? `category.${section.view.category}` : section.view.name) === original[index])) return;
  let anchor = container.querySelector<HTMLElement>('.nav-section.sidebar-title');
  if (!anchor || anchor.parentElement !== container) return;
  const children = [...container.children];
  const nodes = sections.map(section => section.kind === 'category'
    ? children.filter(node => node instanceof HTMLElement && node.dataset.category === section.view.category && node.classList.contains('nav-item'))
    : [children.find(node => node instanceof HTMLElement && node.classList.contains('sidebar-group-header') && node.dataset.groupName === section.view.name), children.find(node => node instanceof HTMLElement && node.classList.contains('sidebar-group-items') && node.dataset.groupItems === section.view.name)]);
  // An incomplete or replaced tree never gets partly reordered.
  if (nodes.some((row, index) => row.length !== (sections[index]!.kind === 'category' ? 1 : 2) || row.some(node => !node))) return;
  for (const row of nodes) for (const node of row) { anchor.after(node!); anchor = node as HTMLElement; }
}
