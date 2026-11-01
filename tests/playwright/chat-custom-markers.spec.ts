import { expect, test } from './coverage-fixture.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('labcharts-analytics-consent-seen', '1'));
});

test('custom markers: real native form durably creates without inventing a result', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('labcharts-ai-paused', 'true'); localStorage.setItem('labcharts-analytics-disabled', 'true'); for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async () => { const { state } = await import('/js/state.js'); state.importedData.entries = [{ date: '2026-10-20', markers: { 'biochemistry.glucose': 5 } }]; await (await import('/js/data.js')).saveImportedData(); await (await import('/js/marker-detail-modal.js')).openCreateMarkerModal(); });
  await page.locator('#cm-category').selectOption('biochemistry'); await page.locator('#cm-name').fill('Synthetic native marker'); await page.locator('#cm-unit').fill('widgets'); await page.locator('#cm-ref-min').fill('1'); await page.locator('#cm-ref-max').fill('9');
  await page.locator('[data-marker-detail-action="save-custom-marker"]').click();
  await expect.poll(async () => page.evaluate(async () => { const { state } = await import('/js/state.js'), profile = await import('/js/profile.js'), raw = await (await import('/js/crypto.js')).encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')); return Object.values(JSON.parse(raw!).customMarkers).some((row: unknown) => (row as {name:string}).name === 'Synthetic native marker'); })).toBe(true);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.entries[0]!.markers)).toEqual({ 'biochemistry.glucose': 5 });
  await expect(page.locator('#me-value')).toBeVisible(); await expect(page.locator('#detail-modal')).toContainText('Synthetic native marker'); await expect(page.locator('#detail-modal')).toContainText('widgets');
  await page.evaluate(async () => { const { state } = await import('/js/state.js'), placement = await import('/js/marker-placement.js'), key = Object.keys(state.importedData.customMarkers)[0]!, viewId = Object.entries(state.markerRegistry).find(([id, value]) => placement.getMarkerStorageDotKey(value, id) === key)?.[0]; if (!viewId) throw new Error('Native custom marker missing'); await (await import('/js/marker-detail-modal.js')).showDetailModal(viewId); });
  const remove = page.locator('[data-marker-detail-action="delete-custom-marker"]'); await expect(remove).toBeVisible(); await remove.click();
  await page.locator('.confirm-overlay.show').getByRole('button', { name: 'Keep marker', exact: true }).click(); await expect(remove).toBeVisible();
  await remove.click(); await page.locator('.confirm-overlay.show').getByRole('button', { name: 'Delete marker and results', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => Object.keys((await import('/js/state.js')).state.importedData.customMarkers).length)).toBe(0);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.entries[0]!.markers)).toEqual({ 'biochemistry.glucose': 5 });
});

test('custom markers: built-in assay metadata never exposes custom-marker deletion', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('labcharts-ai-paused', 'true'); for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async () => { const { state } = await import('/js/state.js'); state.importedData.entries = [{ date: '2026-10-20', markers: { 'biochemistry.glucose': 5 } }]; state.importedData.customMarkers['biochemistry.glucose'] = { name: 'Glucose', unit: 'mmol/l', refMin: 4, refMax: 6 }; await (await import('/js/data.js')).saveImportedData(); await (await import('/js/marker-detail-modal.js')).showDetailModal('biochemistry_glucose'); });
  await expect(page.locator('#detail-modal')).toBeVisible(); await expect(page.locator('[data-marker-detail-action="delete-custom-marker"]')).toHaveCount(0);
});
