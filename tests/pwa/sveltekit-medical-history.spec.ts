import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { captureOfflineLaunchDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  try { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 }); }
  catch (error) { await captureOfflineLaunchDiagnostics(page, test.info()); throw error; }
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function insight(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await menu.click();
  await page.locator('.nav-item[data-category="insight"]').click(); await expect(page.locator('#main-content [data-context-cards-view]')).toBeVisible();
}
async function open(page: Page) {
  const button = page.locator('#main-content [data-context-card-key="diagnoses"] [data-context-card-action="open-editor"]'); await button.focus(); await page.keyboard.press('Enter'); await expect(page.locator('[data-context-medical-view]')).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('labcharts-blobs', 1), db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const tx = db.transaction('kv', 'readonly'), read = tx.objectStore('kv').get('labcharts-default-imported');
      const value = await new Promise<string>((resolve, reject) => { tx.oncomplete = () => typeof read.result === 'string' ? resolve(read.result) : reject(new Error('Missing committed profile')); tx.onabort = () => reject(tx.error || new Error('Read aborted')); tx.onerror = () => reject(tx.error || read.error || new Error('Read failed')); }); return JSON.parse(value);
    } finally { db.close(); }
  });
}
test('static authored Medical History loads on first offline use and preserves all fields through two cold launches', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context);
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return; localStorage.setItem('labcharts-ai-paused', 'true');
    if (!localStorage.getItem('medical-history-seeded')) {
      localStorage.setItem('medical-history-seeded', '1');
      localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], notes: [], nutritionMeals: [], diagnoses: { conditions: [{ name: 'Hypertension', severity: 'mild', source: 'legacy' }], familyHistory: [], flags: { futureFlag: true }, note: 'Original', extension: { keep: true } } }));
    }
  });
  const errors: string[] = [], csp: string[] = []; page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('medicalHistoryCsp', (_, directive: string) => { csp.push(directive); }); await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { medicalHistoryCsp(value: string): Promise<void> }).medicalHistoryCsp(event.violatedDirective); }));
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await insight(page); await expect(page.locator('link[data-context-editor-stylesheet]')).toHaveCount(0); server.state.offline = true;
    await open(page); const modal = page.locator('#detail-modal'); await modal.locator('.ctx-condition-item').getByRole('button', { name: 'Edit condition', exact: true }).click(); await modal.locator('#condition-severity').getByRole('button', { name: 'High', exact: true }).click(); await modal.locator('#condition-status').getByRole('button', { name: 'controlled', exact: true }).click(); await modal.locator('#condition-since').fill('2020'); await modal.getByRole('button', { name: 'Update condition', exact: true }).click();
    await modal.locator('#condition-input').fill('Alzheimer'); await modal.locator('#condition-input').press('ArrowDown'); await modal.locator('#condition-input').press('Enter'); await modal.locator('#condition-input').press('Enter');
    await modal.locator('#ctx-family-section > summary').click(); await modal.locator('#fh-relative').selectOption('maternal_grandmother'); await modal.locator('#fh-condition').fill('Breast Cancer'); await modal.locator('#fh-age').fill('61'); await modal.locator('#fh-note').fill('Family <note>'); await modal.getByRole('button', { name: 'Add family entry', exact: true }).click();
    await modal.locator('summary').filter({ hasText: /^Major procedures/ }).click(); await modal.locator('#diagnosis-procedures-input').fill('Procedure <literal>'); await modal.locator('summary').filter({ hasText: /^Interpretation flags/ }).click(); await modal.locator('#diagnosis-flag-lowMuscleMass').check(); await modal.locator('#ctx-note-input').fill('Offline <notes> & text'); await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    const saved = await stored(page); expect(saved.diagnoses).toEqual({ conditions: [{ name: 'Hypertension', severity: 'major', status: 'controlled', since: '2020', source: 'legacy' }, { name: "Alzheimer's Disease", severity: 'mild' }], familyHistory: [{ relative: 'maternal_grandmother', condition: 'Breast Cancer', onsetAge: 61, note: 'Family <note>' }], flags: { futureFlag: true, lowMuscleMass: true }, note: 'Offline <notes> & text', proceduresNote: 'Procedure <literal>', extension: { keep: true } }); expect(saved.changeHistory.filter((entry: { field: string }) => entry.field === 'diagnoses')).toEqual([expect.objectContaining({ snapshot: saved.diagnoses })]); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await insight(cold); await open(cold); const form = cold.locator('#detail-modal'); await expect(form.locator('.ctx-condition-item')).toHaveCount(2); await expect(form.locator('#ctx-note-input')).toHaveValue(saved.diagnoses.note);
      await form.locator('#ctx-family-section > summary').click(); await expect(form.locator('.ctx-family-item')).toContainText('Maternal grandmother'); await expect(form.locator('.ctx-family-item')).toContainText('Breast Cancer'); await form.locator('summary').filter({ hasText: /^Major procedures/ }).click(); await expect(form.locator('#diagnosis-procedures-input')).toHaveValue(saved.diagnoses.proceduresNote); await form.locator('summary').filter({ hasText: /^Interpretation flags/ }).click(); await expect(form.locator('#diagnosis-flag-lowMuscleMass')).toBeChecked(); expect(await stored(cold)).toEqual(saved);
      await form.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(cold.locator('#modal-overlay')).not.toHaveClass(/show/); expect(await stored(cold)).toEqual(saved); await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
