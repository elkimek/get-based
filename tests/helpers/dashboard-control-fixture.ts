import type { Page } from '@playwright/test';
export async function seedDashboardControlProfile(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('labcharts-ai-paused', 'true'); localStorage.setItem('labcharts-analytics-disabled', 'true'); for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async () => {
    const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic dashboard control', { sex: 'female', dob: '1990-01-01', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed'); for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1'); await profile.switchProfile(id);
    const { state } = await import('/js/state.js'); state.importedData.contextNotes = 'PRIVATE_RETAINED_CONTEXT'; state.importedData.entries = [{ date: '2026-10-01', markers: { 'biochemistry.glucose': 5, 'biochemistry.urea': 4 } }]; if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic dashboard seed failed'); await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(id);
    const manual = await import('/js/wearables-manual.js'); await manual.logManualMetric(id, 'weight', { date: '2026-10-01', value: 72, unit: 'kg', note: 'PRIVATE_READING_NOTE' }); await manual.refreshManualSummary(id);
  });
  await page.reload(); await page.locator('html[data-app-ready]').waitFor();
}
export const dashboardHealth = (page: Page) => page.evaluate(async () => { const { state } = await import('/js/state.js'); return (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')); });
export const dashboardPreferences = (page: Page) => page.evaluate(async () => (await import('/js/dashboard-preference-store.js')).readDashboardPreferenceFootprint());
