// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { appendLabOrderMove } from '../js/lab-ordering-core.js';
import { orderedMarkerEntries, applyLabOrderingToView, labGroupOrderId, orderedLabSidebarSections } from '../js/lab-ordering-view.js';
import { orderSidebarLabNodes } from '../js/lab-ordering-sidebar.js';
import { getLabCategoryEntriesInSidebarOrder } from '../js/category-order.js';
it('applies canonical marker moves after each view’s own defaults and retains the other relative positions', () => {
  const entries: Array<[string, { storageDotKey: string; value: number }]> = [['urea', { storageDotKey: 'biochemistry.urea', value: 4 }], ['cholesterol', { storageDotKey: 'lipids.cholesterol', value: 5 }], ['glucose', { storageDotKey: 'biochemistry.glucose', value: 6 }]];
  const data = { lipids: { markers: Object.fromEntries(entries) } }, before = structuredClone(data), raw = { 'markers.lipids': appendLabOrderMove(null, { item: 'biochemistry.glucose', before: 'biochemistry.urea' }, 'move', 1) };
  expect(orderedMarkerEntries(entries, 'lipids', raw).map(([id]) => id)).toEqual(['glucose', 'urea', 'cholesterol']);
  applyLabOrderingToView(data, raw); expect(Object.keys(data.lipids.markers)).toEqual(['glucose', 'urea', 'cholesterol']); expect(data.lipids.markers.glucose).toEqual(before.lipids.markers.glucose);
  expect(entries.map(([id]) => id)).toEqual(['urea', 'cholesterol', 'glucose']);
});
it('orders specialty categories within their existing group and moves whole groups among sidebar shortcuts', () => {
  const categories = { basic: { label: 'Basic' }, a: { label: 'A', group: 'DEXA' }, other: { label: 'Other' }, b: { label: 'B', group: 'DEXA' }, gut: { label: 'Gut', group: 'OAT' } }, dexa = labGroupOrderId('DEXA');
  const ordering = { sidebar: appendLabOrderMove(null, { item: dexa, before: 'category.basic' }, 'group', 1), [`categories.${dexa}`]: appendLabOrderMove(null, { item: 'b', before: 'a' }, 'category', 1) };
  expect(getLabCategoryEntriesInSidebarOrder(categories, ordering).map(([key]) => key)).toEqual(['b', 'a', 'basic', 'other', 'gut']);
  expect(orderedLabSidebarSections([{ category: 'basic' }, { category: 'other' }], [{ name: 'DEXA' }, { name: 'OAT' }], ordering).map(row => row.id)).toEqual([dexa, 'category.basic', 'category.other', labGroupOrderId('OAT')]);
});
it('moves existing whole native group nodes together without changing their content, collapse state or handlers', () => {
  document.body.innerHTML = '<aside><div class="nav-section sidebar-title">Labs</div><div class="nav-item" data-category="basic">Basic</div><div class="nav-item" data-category="other">Other</div><div class="sidebar-group-header collapsed" data-group-name="DEXA"><button aria-expanded="false">DEXA</button></div><div class="sidebar-group-items" data-group-items="DEXA" hidden>Native items</div></aside>';
  const host = document.querySelector('aside')!, children = [...host.children], header = host.querySelector('.sidebar-group-header')!, items = host.querySelector('.sidebar-group-items')!, before = [header.outerHTML, items.outerHTML]; let clicks = 0;
  header.addEventListener('click', () => clicks++);
  orderSidebarLabNodes(host, [{ category: 'basic' }, { category: 'other' }], [{ name: 'DEXA' }], { sidebar: appendLabOrderMove(null, { item: labGroupOrderId('DEXA'), before: 'category.basic' }, 'move', 1) });
  expect([...host.children]).toEqual([children[0], children[3], children[4], children[1], children[2]]); expect([header.outerHTML, items.outerHTML]).toEqual(before); header.dispatchEvent(new Event('click')); expect(clicks).toBe(1);
});
it('never partly reorders a replaced native sidebar tree and does not touch an unchanged tree', () => {
  document.body.innerHTML = '<aside><div class="nav-section sidebar-title">Labs</div><!--native--><div class="nav-item" data-category="basic">Basic</div><div class="sidebar-group-header" data-group-name="DEXA">DEXA</div></aside>';
  const host = document.querySelector('aside')!, before = host.innerHTML, observer = new MutationObserver(() => {}); observer.observe(host, { childList: true });
  orderSidebarLabNodes(host, [{ category: 'basic' }], [{ name: 'DEXA' }], undefined); expect(observer.takeRecords()).toHaveLength(0);
  orderSidebarLabNodes(host, [{ category: 'basic' }], [{ name: 'DEXA' }], { sidebar: appendLabOrderMove(null, { item: labGroupOrderId('DEXA'), before: 'category.basic' }, 'move', 1) }); expect(host.innerHTML).toBe(before); observer.disconnect();
});
it('uses collision-free stable specialty group identities across labels, punctuation and Unicode', () => {
  expect(new Set(['DEXA', 'Dexa', 'D.EXA', 'D EXA', '🧬', 'Žluč'].map(labGroupOrderId)).size).toBe(6); expect(labGroupOrderId('DEXA')).toBe(labGroupOrderId('DEXA'));
});
