import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { Page } from '@playwright/test';
async function seed(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('labcharts-ai-paused', 'true'); localStorage.setItem('labcharts-analytics-disabled', 'true'); for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  return page.evaluate(async () => {
    const { state } = await import('/js/state.js'), profile = await import('/js/profile.js'), data = await import('/js/data.js');
    const id = await profile.createProfile('Synthetic native ordering', { sex: 'female', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
    for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1'); await profile.switchProfile(id);
    state.importedData.entries = [{ date: '2026-10-20', markers: { 'biochemistry.glucose': 5, 'biochemistry.urea': 5, 'lipids.totalCholesterol': 4.5, 'syntheticA.fixture': 2, 'syntheticB.fixture': 3 }, sourceFile: 'PRIVATE_REPORT.pdf' }];
    state.importedData.contextNotes = 'PRIVATE_CONTEXT';
    state.importedData.customMarkers = { 'syntheticA.fixture': { name: 'Synthetic A', unit: 'widgets', categoryLabel: 'Synthetic A category', group: 'Synthetic Specialty', refMin: 1, refMax: 9 }, 'syntheticB.fixture': { name: 'Synthetic B', unit: 'widgets', categoryLabel: 'Synthetic B category', group: 'Synthetic Specialty', refMin: 1, refMax: 9 } };
    if (!await data.saveImportedData()) throw new Error('Synthetic ordering seed failed'); await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(id);
    await (await import('/js/lab-view-controls.js')).openLabView({ view: 'category', category: 'biochemistry', marker: '' }, () => true);
    const key = profile.profileStorageKey(id, 'imported'); return { profile: id, key, raw: (await (await import('/js/crypto.js')).encryptedGetItem(key))! };
  });
}
test('native ordering persists across charts, table, heatmap and reload without changing result/source records', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); const before = await seed(page);
  const chartOrder = () => page.locator('.chart-card').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.markerDetailId));
  const expectedOrder = (await chartOrder()).filter(id => id !== 'biochemistry_urea'); expectedOrder.splice(expectedOrder.indexOf('biochemistry_glucose'), 0, 'biochemistry_urea');
  await page.evaluate(async id => {
    const store = await import('/js/lab-ordering-store.js'), expected = await store.readNativeLabOrder(id, 'markers.biochemistry');
    await store.commitNativeLabOrder(id, expected, { move: { item: 'biochemistry.urea', before: 'biochemistry.glucose' } });
    await (await import('/js/lab-view-controls.js')).openLabView({ view: 'category', category: 'biochemistry', marker: '' }, () => true);
  }, before.profile);
  expect(await chartOrder()).toEqual(expectedOrder);
  for (const name of ['Table', 'Heatmap']) {
    await page.getByRole('tab', { name }).click();
    const ids = await page.locator('#view-content tbody tr').evaluateAll(rows => rows.map(row => ((row as HTMLElement).dataset.markerDetailId || row.querySelector<HTMLElement>('[data-marker-detail-id]')?.dataset.markerDetailId)).filter(Boolean));
    expect(ids.indexOf('biochemistry_urea')).toBeLessThan(ids.indexOf('biochemistry_glucose')); expect(ids).toContain('biochemistry_glucose');
  }
  const saved = await page.evaluate(async key => (await import('/js/crypto.js')).encryptedGetItem(key), before.key), parsed = JSON.parse(saved!);
  const { labOrdering: _ordering, ...clinical } = parsed; expect(clinical).toEqual(JSON.parse(before.raw));
  await page.reload(); await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async () => { await (await import('/js/lab-view-controls.js')).openLabView({ view: 'category', category: 'biochemistry', marker: '' }, () => true); });
  await page.getByRole('tab', { name: 'Charts' }).click(); expect(await chartOrder()).toEqual(expectedOrder);
  expect(await page.evaluate(async key => (await import('/js/crypto.js')).encryptedGetItem(key), before.key)).toBe(saved); expect(errors).toEqual([]);
});
test('native sidebar ordering moves a whole specialty group and its categories while retaining collapse controls', async ({ page }) => {
  const before = await seed(page);
  await page.evaluate(async id => {
    const store = await import('/js/lab-ordering-store.js'), group = (await import('/js/lab-ordering-view.js')).labGroupOrderId('Synthetic Specialty');
    await store.commitNativeLabOrder(id, await store.readNativeLabOrder(id, `categories.${group}`), { move: { item: 'syntheticB', before: 'syntheticA' } });
    await store.commitNativeLabOrder(id, await store.readNativeLabOrder(id, 'sidebar'), { move: { item: group, before: 'category.biochemistry' } });
    (await import('/js/nav.js')).buildSidebar((await import('/js/data.js')).getActiveData());
  }, before.profile);
  const group = page.locator('.sidebar-group-items[data-group-items="Synthetic Specialty"]'); expect(await group.locator('[data-category]').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.category))).toEqual(['syntheticB', 'syntheticA']);
  const top = await page.locator('#sidebar-nav').evaluate(node => [...node.children].map(child => child.getAttribute('data-group-name') || child.getAttribute('data-category')).filter(Boolean));
  expect(top.indexOf('Synthetic Specialty')).toBeLessThan(top.indexOf('biochemistry'));
  const toggle = page.getByRole('button', { name: 'Synthetic Specialty group' }); await toggle.click(); await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await expect(group).toBeHidden(); await toggle.click(); await expect(group).toBeVisible();
  const saved = JSON.parse((await page.evaluate(async key => (await import('/js/crypto.js')).encryptedGetItem(key), before.key))!); const { labOrdering: _ordering, ...clinical } = saved; expect(clinical).toEqual(JSON.parse(before.raw));
  await page.reload(); await page.locator('html[data-app-ready]').waitFor(); expect(await group.locator('[data-category]').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.category))).toEqual(['syntheticB', 'syntheticA']);
});
for (const kind of ['category', 'marker'] as const) test(`native ${kind} rename retains a failed candidate, then saves only after another human confirmation`, async ({ page }) => {
  await routeJavaScript(page, '**/js/crypto.js', `export * from '/js/crypto.js?ordering-retry-original'; import * as native from '/js/crypto.js?ordering-retry-original'; export async function encryptedSetItem(key,...args){if(globalThis.__failOrderingRename && key.endsWith('-imported')){globalThis.__failOrderingRename=false;throw new Error('Synthetic rename unavailable');}return native.encryptedSetItem(key,...args);}`);
  const before = await seed(page);
  await page.evaluate(async kind => {
    (globalThis as typeof globalThis & { __failOrderingRename?: boolean }).__failOrderingRename = true;
    const native = await import('/js/category-customization.js'); void (kind === 'category' ? native.renameCategory('biochemistry') : native.renameMarker('biochemistry_glucose'));
  }, kind);
  const input = page.locator('#prompt-dialog-input'); await input.fill('Retained synthetic name'); await page.locator('#prompt-ok').click();
  await expect(page.locator('#prompt-dialog-overlay')).toBeVisible(); await expect(input).toHaveValue('Retained synthetic name');
  expect(await page.evaluate(async key => (await import('/js/crypto.js')).encryptedGetItem(key), before.key)).toBe(before.raw);
  await page.locator('#prompt-ok').click();
  await expect.poll(() => page.evaluate(async ({ kind, key }) => { const data = JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem(key))!); return kind === 'category' ? data.categoryLabels?.biochemistry : data.markerLabels?.['biochemistry.glucose']; }, { kind, key: before.key })).toBe('Retained synthetic name');
  const saved = JSON.parse((await page.evaluate(async key => (await import('/js/crypto.js')).encryptedGetItem(key), before.key))!), original = JSON.parse(before.raw); expect(saved.entries).toEqual(original.entries); expect(saved.customMarkers).toEqual(original.customMarkers);
});
