import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { createRequire } from 'node:module';
const axeScriptPath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    localStorage.setItem('labcharts-ai-paused', 'true');
  });
});
async function seed(page: Page, populated = true) {
  await page.evaluate(async withSetup => {
    const [{ state }, profile, data, editors] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/context-card-lifestyle-editors.js')]);
    state.importedData = profile.createDefaultProfileData();
    if (withSetup) {
      state.importedData.sunDefaults = { fitzpatrick: 'III', homeLight: 'led-warm', eyewear: 'sunglasses', ottScore: 4 };
      state.importedData.lightCircadian = { skinType: 'Legacy <skin> & type', note: 'Saved habits' };
    }
    if (!await data.saveImportedData()) throw new Error('Could not seed Light');
    await editors.openLightCircadianEditor();
  }, populated);
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]);
    return JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')))!);
  });
}
test('authored Light setup mirror preserves literal skin metadata and readable themed layouts', async ({ page }) => {
  test.setTimeout(90000); await page.addInitScript({ path: axeScriptPath }); await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const themes = document.createElement('link'); themes.rel = 'stylesheet'; themes.href = '/themes-extra.css'; document.head.append(themes);
    await new Promise<void>((resolve, reject) => { themes.onload = () => resolve(); themes.onerror = () => reject(new Error('Themes unavailable')); });
  });
  const modal = page.locator('#detail-modal');
  for (const populated of [false, true]) {
    await seed(page, populated); const mirror = modal.locator('[data-context-light-setup]');
    await expect(mirror).toContainText(populated ? 'Legacy <skin> & type' : 'Not set yet');
    await expect(mirror).toHaveCSS('border-top-width', '0px'); await expect(mirror).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    if (populated) { await expect(mirror).toContainText('Mostly LED — warm white'); await expect(mirror).toContainText('Sunglasses outdoors'); await expect(mirror.locator('[data-light-burden-tier="2"]')).toHaveText('several patterns to explore'); }
    expect(await mirror.locator('skin, img, script').count()).toBe(0);
    for (const disclosure of await modal.locator('details summary').all()) await disclosure.click();
    await modal.locator('#light-am button').first().click();
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const width of [320, 1100]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await modal.evaluate(root => root.scrollWidth <= root.clientWidth + 1), `${theme}/${width}/${populated} overflow`).toBe(true);
        expect(await modal.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${theme}/${width}/${populated} accessibility`).toEqual([]);
      }
    }
    await modal.getByLabel('Notes', { exact: true }).fill('Updated habits');
    await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    const saved = await stored(page);
    expect(saved.lightCircadian).toMatchObject({ skinType: populated ? 'Legacy <skin> & type' : null, note: 'Updated habits' });
    expect(saved.changeHistory.find((item: { field: string }) => item.field === 'lightCircadian').snapshot).toEqual(saved.lightCircadian);
    if (populated) {
      await page.evaluate(async () => { await (await import('/js/context-card-lifestyle-editors.js')).openLightCircadianEditor(); });
      await modal.getByRole('button', { name: 'Clear', exact: true }).click(); await page.locator('#confirm-ok').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
      const cleared = await stored(page); expect(cleared.lightCircadian).toBeNull(); expect(cleared.sunDefaults).toEqual(saved.sunDefaults);
    }
  }
});
test('authored Light setup button opens the actual Light tool and retires unsaved controls', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const latitude = await page.evaluate(async () => {
    const [{ state }, profile] = await Promise.all([import('/js/state.js'), import('/js/profile.js')]);
    await profile.setProfileLocation(state.currentProfile, 'Czechia', '');
    return profile.getLatitudeFromLocation();
  });
  expect(latitude).toBeTruthy(); await seed(page);
  await expect(page.locator('#detail-modal')).toContainText(`Latitude: ${latitude}`);
  await page.locator('#detail-modal').getByLabel('Notes', { exact: true }).fill('Unsaved habits');
  await page.evaluate(() => { Reflect.set(window, 'retiredLightSave', Array.from(document.querySelectorAll<HTMLButtonElement>('[data-context-form-view] button')).find(button => button.textContent === 'Save')!); });
  await page.getByRole('button', { name: 'Edit Light lens setup', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.light-setup-focus-modal').getByRole('heading', { name: 'Personalize Light', exact: true })).toBeVisible();
  await expect(page.locator('.nav-item.active')).toHaveAttribute('data-category', 'light');
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); await expect(page.locator('[data-context-form-view]')).toHaveCount(0);
  await page.evaluate(async () => { (Reflect.get(window, 'retiredLightSave') as HTMLButtonElement).click(); await (await import('/js/context-card-lifestyle-editors.js')).saveLightCircadian(); });
  expect((await stored(page)).lightCircadian.note).toBe('Saved habits');
  await page.getByRole('button', { name: 'Close light setup', exact: true }).click(); await expect(page.locator('.light-setup-focus-modal')).toHaveCount(0);
});
for (const retirement of ['profile switch', 'new form', 'another dialog']) test(`authored Light setup defers safely after ${retirement}`, async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page);
  await page.evaluate(() => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 200 && typeof handler === 'function') { Reflect.set(window, 'heldLightSetup', handler); return 0; }
      return original(handler, delay, ...args);
    }) as typeof window.setTimeout;
  });
  await page.getByRole('button', { name: 'Edit Light lens setup', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, 'heldLightSetup'))).toBe('function');
  await page.evaluate(async reason => {
    if (reason === 'profile switch') {
      const { state } = await import('/js/state.js'); state.currentProfile = 'other-light-profile'; state.importedData = (await import('/js/profile.js')).createDefaultProfileData(); window.dispatchEvent(new CustomEvent('labcharts-profile-switched'));
    } else if (reason === 'another dialog') await (await import('/js/context-card-lifestyle-editors.js')).openHealthGoalsEditor();
    else await (await import('/js/context-card-lifestyle-editors.js')).openStressEditor();
    (Reflect.get(window, 'heldLightSetup') as () => void)();
  }, retirement);
  await expect(page.locator('.light-setup-focus-modal')).toHaveCount(0);
  if (retirement === 'another dialog') await expect(page.locator('#detail-modal').getByRole('heading', { name: 'Health Goals', exact: true })).toBeVisible();
  if (retirement === 'new form') await expect(page.locator('[data-context-form-view]')).toHaveAttribute('data-context-form-view', 'stress');
});
