import { expect, test } from './coverage-fixture.js';

test('lab display: native category rename keeps definitions and refuses a changed profile', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('labcharts-ai-paused', 'true'); for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); }); await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  const before = await page.evaluate(async () => { const { state } = await import('/js/state.js'); state.importedData.entries = [{ date: '2026-10-20', markers: { 'biochemistry.glucose': 5 } }]; state.importedData.customMarkers['syntheticTests.fixture'] = { name: 'Fixture', unit: '', categoryLabel: 'Synthetic Tests' }; await (await import('/js/data.js')).saveImportedData(); return JSON.stringify(state.importedData.customMarkers); });
  await page.evaluate(async () => { void (await import('/js/category-customization.js')).renameCategory('syntheticTests'); }); await expect(page.locator('#prompt-dialog-input')).toHaveValue('Synthetic Tests'); await page.locator('#prompt-dialog-input').fill('Renamed native tests'); await page.locator('#prompt-ok').click();
  await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.importedData.categoryLabels?.syntheticTests)).toBe('Renamed native tests'); expect(await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData.customMarkers))).toBe(before);
  await expect(page.getByRole('heading', { name: /Renamed native tests/ })).toBeVisible();
  await page.evaluate(async () => { void (await import('/js/category-customization.js')).renameCategory('syntheticTests'); }); await expect(page.locator('#prompt-dialog-input')).toHaveValue('Renamed native tests');
  await page.evaluate(async () => { const { state } = await import('/js/state.js'); state.currentProfile = 'synthetic-other'; state.importedData = (await import('/js/profile.js')).createDefaultProfileData(); }); await page.locator('#prompt-dialog-input').fill('Wrong profile name'); await page.locator('#prompt-ok').click();
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.categoryLabels)).toBeUndefined();
});
