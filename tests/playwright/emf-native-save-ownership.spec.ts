import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
async function seed(page: Page) {
  await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor(); await page.evaluate(async () => {
    const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic native EMF saves', { skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed'); localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profile.switchProfile(id);
    localStorage.setItem('labcharts-show-product-recs', 'false'); const { state } = await import('/js/state.js'); (await import('/js/api.js')).setAIPaused(true);
    state.importedData.emfAssessment = { assessments: [{ id: 'native-assessment', date: '2026-10-20', label: 'Original', consultant: '', note: '', rooms: [{ id: 'native-bedroom', name: 'Bedroom', location: 'Pillow', sleeping: true, measurements: { acElectric: { value: 8, unit: 'V/m', meter: 'Meter', source: '/private/native-source' } }, sources: ['WiFi router'], mitigations: ['custom mitigation'] }] }] };
    state.importedData.nutritionMeals = []; state.importedData.contextNotes = 'Protected unrelated context'; if (!await (await import('/js/data.js')).saveImportedDataForProfile(id, state.importedData, { forceProfileScope: true })) throw new Error('Synthetic native seed failed');
    await (await import('/js/emf-runtime.js')).openEMFAssessmentEditor(); await (await import('/js/emf.js')).toggleEMFAssessment('native-assessment');
  });
}
async function stored(page: Page) { return page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!); }); }
test('native field changes preserve focus, source evidence and data after reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await seed(page); const before = await stored(page);
  await page.locator('[data-emf-field="label"]').fill('Corrected report'); await page.locator('[data-emf-room-field="location"]').click(); await expect.poll(async () => (await stored(page)).emfAssessment.assessments[0].label).toBe('Corrected report'); await expect(page.locator('[data-emf-room-field="location"]')).toBeFocused();
  await page.locator('[data-emf-room-field="location"]').fill('Window'); await page.locator('[data-emf-measurement-type="acElectric"]').click(); await expect.poll(async () => (await stored(page)).emfAssessment.assessments[0].rooms[0].location).toBe('Window'); await expect(page.locator('[data-emf-measurement-type="acElectric"]')).toBeFocused();
  await page.locator('[data-emf-measurement-type="acElectric"]').fill('2'); await page.locator('[data-emf-meter-type="acElectric"]').click(); await expect.poll(async () => (await stored(page)).emfAssessment.assessments[0].rooms[0].measurements.acElectric.value).toBe(2); await expect(page.locator('[data-emf-meter-type="acElectric"]')).toBeFocused();
  await page.locator('[data-emf-meter-type="acElectric"]').fill('New instrument'); await page.locator('[data-emf-action="save"]').click(); await expect.poll(async () => (await stored(page)).emfAssessment.assessments[0].rooms[0].measurements.acElectric.meter).toBe('New instrument');
  const saved = await stored(page); expect(saved.emfAssessment.assessments[0].editHistory[0].snapshot).toEqual(before.emfAssessment.assessments[0]); expect(saved.emfAssessment.assessments[0].rooms[0].measurements.acElectric.source).toBe('/private/native-source');
  const protectedFields = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'emfAssessment')); expect(protectedFields(saved)).toEqual(protectedFields(before));
  await page.reload(); await page.locator('html[data-app-ready]').waitFor(); expect(await stored(page)).toEqual(saved);
  await page.evaluate(async () => { await (await import('/js/emf-runtime.js')).openEMFAssessmentEditor(); await (await import('/js/emf.js')).toggleEMFAssessment('native-assessment'); });
  await expect(page.locator('[data-emf-field="label"]')).toHaveValue('Corrected report'); await expect(page.locator('[data-emf-measurement-type="acElectric"]')).toHaveValue('2'); expect(errors).toEqual([]);
});
test('a failed Close retains typed fields and saved data, then Save retries the same draft', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await routeJavaScript(page, '**/js/crypto.js', `export * from '/js/crypto.js?native-save-original'; import {encryptedSetItem as write} from '/js/crypto.js?native-save-original'; export async function encryptedSetItem(...args){if(globalThis.__emfFailWrites&&String(args[0]).endsWith('-imported'))throw new Error('Synthetic native storage failure');return write(...args);}`);
  await seed(page); const before = await stored(page); await page.evaluate(() => { (window as unknown as { __emfFailWrites: boolean }).__emfFailWrites = true; });
  await page.locator('[data-emf-field="note"]').fill('Retained native draft'); await page.locator('[data-emf-action="close-editor"]').click();
  await expect(page.locator('.notification-toast').filter({ hasText: 'Could not save this EMF change' }).first()).toBeVisible(); await expect(page.locator('#modal-overlay')).toBeVisible(); await expect(page.locator('[data-emf-field="note"]')).toHaveValue('Retained native draft'); expect(await stored(page)).toEqual(before);
  await page.evaluate(() => { (window as unknown as { __emfFailWrites: boolean }).__emfFailWrites = false; }); await page.locator('[data-emf-action="save"]').click(); await expect.poll(async () => (await stored(page)).emfAssessment.assessments[0].note).toBe('Retained native draft');
  await page.locator('[data-emf-action="close-editor"]').click(); await expect(page.locator('#modal-overlay')).not.toBeVisible(); expect(errors).toEqual([]);
});
