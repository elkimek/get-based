import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
async function open(page: Page, kind: 'targets' | 'fluid') {
  expect(await page.evaluate(async selected => {
    const module = await import('/js/nutrition.js');
    return selected === 'targets' ? module.openNutritionTargets() : module.openFluidLog();
  }, kind)).toBe(true);
  await expect(page.locator(`[data-nutrition-entry-view="${kind}"]`)).toBeVisible();
}
test.beforeEach(async ({ page, context }) => {
  await installDiscussionFixture(context);
  await context.addInitScript(() => localStorage.setItem('labcharts-ai-paused', 'true'));
  await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
});
test('owned nutrition forms support keyboard saves and keep beverage categories distinct', async ({ page }) => {
  await open(page, 'targets');
  await page.locator('#nutrition-target-energy').fill('100'); await page.locator('#nutrition-target-energy').press('Enter');
  await expect(page.locator('#nutrition-target-status')).toContainText('Review Energy');
  await page.locator('#nutrition-target-energy').fill('2350'); await page.locator('#nutrition-target-energy').press('Enter');
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  await open(page, 'fluid'); await page.locator('input[value="tea-coffee"]').check();
  await page.locator('#nutrition-fluid-amount').fill('275.5');
  await expect(page.locator('#nutrition-fluid-preview')).toContainText('275.5 mL tea or coffee');
  await page.locator('#nutrition-fluid-label').fill('Keyboard tea'); await page.locator('#nutrition-fluid-label').press('Enter');
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  await page.reload(); await open(page, 'targets'); await expect(page.locator('#nutrition-target-energy')).toHaveValue('2350');
  expect(await page.evaluate(async () => (await import('/js/nutrition-store.js')).listActiveProfileMeals())).toEqual([
    expect.objectContaining({ name: 'Keyboard tea', mealType: 'drink', nutrients: { fluidMl: 275.5 }, source: expect.objectContaining({ kind: 'manual-beverage' }) }),
  ]);
});
for (const kind of ['targets', 'fluid'] as const) {
  test(`owned nutrition forms do not steal focus during immediate ${kind} editing`, async ({ page }) => {
    await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
    await open(page, kind);
    const field = page.locator(kind === 'targets' ? '#nutrition-target-energy' : '#nutrition-fluid-label');
    await field.focus(); await page.clock.fastForward(100); await expect(field).toBeFocused();
    await field.fill(kind === 'targets' ? '2400' : 'Uninterrupted drink');
    if (kind === 'targets') await page.locator('#nutrition-target-protein-basis').selectOption('active');
    await expect(field).toHaveValue(kind === 'targets' ? '2400' : 'Uninterrupted drink');
  });
}
// Dense fine-pointer controls retain their native sizing; touch targets use the coarse-pointer styles.
test.describe('coarse-pointer touch targets', () => {
  test.use({ hasTouch: true });
  test.beforeEach(async ({ page }) => {
    expect(await page.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      fine: matchMedia('(pointer: fine)').matches,
      touch: navigator.maxTouchPoints > 0,
    }))).toEqual({ coarse: true, fine: false, touch: true });
  });

  test('owned nutrition forms stay accessible and contained across six themes and narrow layouts', async ({ page }) => {
    test.setTimeout(120000);
    await page.evaluate(async () => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/themes-extra.css';
      const loaded = new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('Themes unavailable')); }); document.head.append(link); await loaded;
    });
    for (const kind of ['targets', 'fluid'] as const) {
      await open(page, kind); const modal = page.locator('#detail-modal');
      for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) for (const width of [320, 1100]) {
        await page.setViewportSize({ width, height: 900 }); await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        await modal.evaluate(async root => {
          const animations = [...root.getAnimations({ subtree: true })];
          for (let element: Element | null = root; element; element = element.parentElement) { getComputedStyle(element).backgroundColor; animations.push(...element.getAnimations()); }
          await Promise.all(animations.filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined)));
        });
        const geometry = await modal.evaluate(root => {
          const bounds = root.getBoundingClientRect();
          return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, bounds: bounds.toJSON(),
            overflow: Array.from(root.querySelectorAll<HTMLElement>('*')).flatMap(element => {
              const rect = element.getBoundingClientRect();
              return rect.width && (rect.right > bounds.right || element.scrollWidth > element.clientWidth + 1 || element.tagName === 'SELECT')
                ? [{ tag: element.tagName, id: element.id, class: element.className, text: element.textContent?.slice(0, 80), rect: rect.toJSON(), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, width: getComputedStyle(element).width, minWidth: getComputedStyle(element).minWidth }] : [];
            }),
          };
        });
        if (geometry.scrollWidth > geometry.clientWidth + 1) await test.info().attach('nutrition-form-overflow', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
        expect(geometry.scrollWidth <= geometry.clientWidth + 1, `${kind}/${theme}/${width} overflow`).toBe(true);
        for (const action of await modal.locator('button, summary, .nutrition-widget-metric-option, .nutrition-fluid-kind').all()) {
          const box = await action.boundingBox(); if (!box) continue;
          const label = (await action.innerText()).slice(0, 60);
          expect(box.height, `${kind}/${theme}/${width}/${label} target height`).toBeGreaterThanOrEqual(44);
          expect(box.width, `${kind}/${theme}/${width}/${label} target width`).toBeGreaterThanOrEqual(44);
        }
        expect(await modal.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${kind}/${theme}/${width} accessibility`).toEqual([]);
      }
      await modal.locator('.modal-close').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    }
  });
});
for (const kind of ['targets', 'fluid'] as const) {
  test(`late ${kind} loading cannot replace another surface`, async ({ page }) => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/css/nutrition.css', async route => { await gate; await route.continue(); });
    await page.evaluate(selected => { void import('/js/nutrition.js').then(module => selected === 'targets' ? module.openNutritionTargets() : module.openFluidLog()); }, kind);
    await expect(page.locator('link[data-nutrition-stylesheet]')).toBeAttached();
    await page.evaluate(() => document.getElementById('detail-modal')!.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'Replacement surface' })));
    release(); await expect.poll(() => page.locator('link[data-nutrition-stylesheet]').evaluate((link: HTMLLinkElement) => !!link.sheet)).toBe(true);
    await expect(page.locator('#detail-modal')).toHaveText('Replacement surface'); await expect(page.locator('[data-nutrition-entry-view]')).toHaveCount(0);
  });
  test(`${kind} controls retire on profile switch without saving the new profile`, async ({ page }) => {
    await open(page, kind);
    if (kind === 'targets') await page.locator('#nutrition-target-energy').fill('2900');
    else await page.locator('#nutrition-fluid-label').fill('Retired drink');
    await page.evaluate(async () => {
      const [{ state }, profile] = await Promise.all([import('/js/state.js'), import('/js/profile.js')]);
      state.currentProfile = 'nutrition-entry-retired'; state.importedData = profile.createDefaultProfileData();
      state.importedData.contextNotes = 'Other profile'; window.dispatchEvent(new CustomEvent('labcharts-profile-switched'));
    });
    await expect(page.locator('[data-nutrition-entry-view]')).toHaveCount(0); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    expect(await page.evaluate(async () => {
      const { state } = await import('/js/state.js'); return { notes: state.importedData.contextNotes, meals: state.importedData.nutritionMeals || [], energy: state.importedData.nutritionTargets?.energyKcal };
    })).toEqual({ notes: 'Other profile', meals: [], energy: undefined });
  });
}
