import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
const keys = ['sleepRest', 'exercise', 'stress', 'loveLife', 'diet', 'environment', 'lightCircadian'] as const;
async function persisted(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('labcharts-blobs', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('kv', 'readonly');
      const read = tx.objectStore('kv').get('labcharts-default-imported');
      const value = await new Promise<string>((resolve, reject) => {
        tx.oncomplete = () => typeof read.result === 'string' ? resolve(read.result) : reject(new Error('Committed profile is missing'));
        tx.onabort = () => reject(tx.error || new Error('Profile read aborted'));
        tx.onerror = () => reject(tx.error || read.error || new Error('Profile read failed'));
      });
      return JSON.parse(value) as Record<'sleepRest' | 'exercise' | 'stress' | 'loveLife' | 'diet' | 'environment' | 'lightCircadian', { note: string }> & { emfAssessment?: { assessments: unknown[] }; changeHistory: Array<{ field: string; snapshot: unknown }> };
    } finally { db.close(); }
  });
}
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function insight(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await menu.click();
  await page.locator('.nav-item[data-category="insight"]').click();
  await expect(page.locator('#main-content [data-context-cards-view]')).toBeVisible();
}
async function open(page: Page, key: string) {
  const button = page.locator(`#main-content [data-context-card-key="${key}"] [data-context-card-action="open-editor"]`);
  await button.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[data-context-form-view]')).toHaveAttribute('data-context-form-view', key);
}
test('static lifestyle editors work on offline first use and preserve committed fields through two cold launches', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context, {paused: true});
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    if (!localStorage.getItem('context-forms-seeded')) {
      localStorage.setItem('context-forms-seeded', '1');
      // Start with the canonical empty meal list, avoiding unrelated legacy null-to-list normalization on reload.
      localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], notes: [], nutritionMeals: [], lightCircadian: { skinType: 'III' }, sunDefaults: { fitzpatrick: 'III', homeLight: 'led-warm', eyewear: 'sunglasses', ottScore: 4 }, environment: { emf: ['WiFi router nearby'], emfMitigation: ['WiFi off at night'] } }));
    }
  });
  const errors: string[] = [], csp: string[] = [];
  context.on('page', target => target.on('pageerror', error => errors.push(error.message))); page.on('pageerror', error => errors.push(error.message));
  await context.exposeBinding('contextFormCsp', (_, directive: string) => { csp.push(directive); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { contextFormCsp(value: string): Promise<void> }).contextFormCsp(event.violatedDirective); }));
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await insight(page);
    await expect(page.locator('link[data-context-editor-stylesheet]')).toHaveCount(0);
    server.state.offline = true;
    for (const key of keys) {
      await open(page, key); const modal = page.locator('#detail-modal');
      await expect(modal.getByLabel('Notes', { exact: true })).toHaveCSS('font-size', /^(13|16)px$/);
      if (key === 'lightCircadian') await expect(modal.locator('[data-context-light-setup]')).toContainText('Mostly LED — warm white');
      if (key === 'diet') {
        await modal.locator('summary').filter({ hasText: 'Typical meals' }).click();
        for (const meal of ['breakfast', 'lunch', 'dinner', 'snacks']) { await modal.locator(`#diet-${meal}`).fill(`Offline ${meal} <example>`); await modal.locator(`#diet-${meal}-time`).fill('8:30 PM'); }
      }
      await modal.getByLabel('Notes', { exact: true }).fill(`Offline <${key}> & saved`);
      await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    }
    await open(page, 'lightCircadian');
    await page.getByRole('button', { name: 'Edit Light lens setup', exact: true }).click();
    await expect(page.locator('.light-setup-focus-modal').getByRole('heading', { name: 'Personalize Light', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close light setup', exact: true }).click();
    await expect(page.locator('.light-setup-focus-modal')).toHaveCount(0); await insight(page);
    await open(page, 'environment');
    await page.locator('#detail-modal summary').filter({ hasText: /^EMF/ }).click();
    await page.locator('[data-context-emf-launcher]').focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#detail-modal').getByRole('heading', { name: 'Baubiologie EMF Assessment', exact: true })).toBeVisible();
    await page.locator('#detail-modal [data-emf-action="add-assessment"]').click();
    await page.locator('#detail-modal [data-emf-action="return-to-origin"]').click();
    await expect(page.locator('[data-context-form-view]')).toHaveAttribute('data-context-form-view', 'environment');
    await expect(page.locator('#env-emf')).toHaveCount(0);
    await expect(page.locator('#detail-modal').getByLabel('Notes', { exact: true })).toHaveValue('Offline <environment> & saved');
    await page.locator('#detail-modal').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect.poll(async () => (await persisted(page)).emfAssessment?.assessments.length).toBe(1);
    const saved = await persisted(page);
    expect(saved.lightCircadian).toMatchObject({ skinType: 'III' });
    expect(saved.environment).toMatchObject({ emf: ['WiFi router nearby'], emfMitigation: ['WiFi off at night'] });
    for (const key of keys) { expect(saved[key].note).toBe(`Offline <${key}> & saved`); expect(saved.changeHistory.find(item => item.field === key)?.snapshot).toEqual(saved[key]); }
    await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await insight(cold);
      for (const key of keys) {
        await open(cold, key); const modal = cold.locator('#detail-modal');
        await expect(modal.getByLabel('Notes', { exact: true })).toHaveValue(`Offline <${key}> & saved`);
        if (key === 'lightCircadian') await expect(modal.locator('[data-context-light-setup]')).toContainText('Mostly LED — warm white');
        if (key === 'diet') {
          await modal.locator('summary').filter({ hasText: 'Typical meals' }).click();
          for (const meal of ['breakfast', 'lunch', 'dinner', 'snacks']) { await expect(modal.locator(`#diet-${meal}`)).toHaveValue(`Offline ${meal} <example>`); await expect(modal.locator(`#diet-${meal}-time`)).toHaveValue('20:30'); }
        }
        if (key === 'environment') {
          await modal.locator('summary').filter({ hasText: /^EMF/ }).click();
          await expect(modal.locator('[data-context-emf-launcher]')).toContainText('1 saved'); await expect(modal.locator('#env-emf')).toHaveCount(0);
        }
        await expect(modal.getByRole('button', { name: 'Clear', exact: true })).toBeVisible();
        await modal.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(cold.locator('#modal-overlay')).not.toHaveClass(/show/);
      }
      expect(await persisted(cold)).toEqual(saved);
      await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
