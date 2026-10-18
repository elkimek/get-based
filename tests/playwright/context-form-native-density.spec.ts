import fs from 'node:fs';
import { expect, test } from './coverage-fixture.js';

const demo = fs.readFileSync(new URL('../../data/demo-male.json', import.meta.url), 'utf8');
const editors = ['openHealthGoalsEditor', 'openDiagnosesEditor', 'openDietEditor', 'openExerciseEditor', 'openSleepRestEditor', 'openLightCircadianEditor', 'openStressEditor', 'openLoveLifeEditor', 'openEnvironmentEditor'];
async function ready(page: import('@playwright/test').Page) {
  await page.addInitScript(demo => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    localStorage.setItem('labcharts-theme', 'dark');
    localStorage.setItem('labcharts-ai-paused', 'true');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'default', name: 'Alex', sex: 'male', dob: '1987-11-22', createdAt: 1 }]));
    localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-default-imported', JSON.stringify({ ...JSON.parse(demo), profile: { firstName: 'Alex', age: 38 }, sunDefaults: { fitzpatrick: 'II', completedAt: 1 } }));
  }, demo);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname) ? route.abort() : route.continue();
  });
  await page.goto('/app');
  await page.locator('#sidebar-nav [data-nav-route="insight"]').evaluate(element => (element as HTMLElement).click());
}
async function open(page: import('@playwright/test').Page, editor: string) {
  await page.locator(`[data-context-card-editor="${editor}"]`).evaluate(element => (element as HTMLElement).click());
  await expect(page.locator('#modal-overlay.show [data-context-form-view]')).toBeVisible();
}
async function metrics(locator: import('@playwright/test').Locator) {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    return { height: element.getBoundingClientRect().height, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, padding: style.padding, borderWidth: style.borderWidth };
  });
}

test('Context editors preserve native desktop role density through all nine forms', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await ready(page);
  for (const editor of editors) {
    await open(page, editor);
    const form = page.locator('#modal-overlay [data-context-form-view]');
    const close = form.locator('button[aria-label^="Close "]').first();
    expect(await metrics(close)).toMatchObject({ height: 34, fontSize: '22px', borderWidth: '1px' });
    const footer = form.locator('footer,div').filter({ has: page.locator(':scope > button') }).last();
    // Every editor exposes its ordinary save/done action by role and label.
    const save = form.getByRole('button', { name: editor === 'openHealthGoalsEditor' ? 'Done' : 'Save', exact: true });
    expect(await metrics(save)).toMatchObject({ height: 35, fontSize: '14px', fontWeight: '600', padding: '8px 18px' });
    const choices = form.locator('button[aria-pressed]');
    for (const choice of await choices.all()) expect(await metrics(choice)).toMatchObject({ fontSize: '12px', padding: '6px 14px', lineHeight: 'normal' });
    if (editor === 'openHealthGoalsEditor') {
      expect((await metrics(form.locator('#goal-text-input'))).height).toBe(40);
      for (const remove of await form.locator('button[aria-label^="Remove goal:"]').all()) expect((await metrics(remove)).height).toBe(16);
    }
    if (editor === 'openDiagnosesEditor') {
      expect((await metrics(form.locator('#condition-input'))).height).toBe(40);
      for (const action of await form.locator('button[aria-label="Edit condition"],button[aria-label="Remove condition"]').all()) expect((await metrics(action)).height).toBe(24);
      await form.locator('summary').filter({ hasText: 'Major procedures' }).click();
      expect(await metrics(form.locator('#diagnosis-procedures-input'))).toMatchObject({ height: 40.84375, padding: '10px 14px', lineHeight: '18.85px' });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await close.click();
    await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    expect(await footer.count()).toBe(0);
  }
  await page.locator('#sidebar-nav [data-nav-action="open-context"]').evaluate(element => (element as HTMLElement).click());
  await page.locator('#context-hub-overlay [data-pick="lens"]').click();
  expect((await metrics(page.locator('#interpretive-lens-textarea'))).height).toBe(120);
});

test('compact health goals retain real add/remove persistence and priority actions', async ({ page }) => {
  await ready(page);
  await open(page, 'openHealthGoalsEditor');
  const form = page.locator('[data-context-goals-view]');
  await form.locator('#goal-text-input').fill('Synthetic compact audit goal');
  await form.locator('[data-context-value="major"]').click();
  await expect(form.locator('[data-context-value="major"]')).toHaveAttribute('aria-pressed', 'true');
  await form.getByRole('button', { name: 'Add goal', exact: true }).click();
  const remove = form.getByRole('button', { name: 'Remove goal: Synthetic compact audit goal', exact: true });
  await expect(remove).toBeVisible();
  expect((await metrics(remove)).height).toBe(16);
  await remove.click();
  await expect(remove).toHaveCount(0);
  await form.getByRole('button', { name: 'Done', exact: true }).click();
  await open(page, 'openHealthGoalsEditor');
  await expect(page.getByRole('button', { name: 'Remove goal: Synthetic compact audit goal', exact: true })).toHaveCount(0);
});

test.describe('Context touch density', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 900 } });
  test('keeps reachable coarse targets and modal content within narrow viewport', async ({ page }) => {
    await ready(page);
    for (const editor of editors) {
      await open(page, editor);
      const form = page.locator('#modal-overlay [data-context-form-view]');
      for (const button of await form.locator('button').all()) if (await button.isVisible()) expect((await metrics(button)).height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await form.locator('button[aria-label^="Close "]').first().click();
      await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    }
  });
});
