import { expect, test } from './coverage-fixture.js';
import { createDefaultProfileData } from '../../js/profile.js';
import { seedLightPageFixture } from '../helpers/light-page-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
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

  test('authored Light surfaces preserve actions and read-only data across themes, narrow widths and keyboard use', async ({ page, context }, info) => {
    test.setTimeout(120000);
    await installDiscussionFixture(context);
    await context.addInitScript(seedLightPageFixture, { defaults: createDefaultProfileData() });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/app');
    await page.evaluate(async () => {
      await (await import('/js/light-sun-loader.js')).loadLightSunUI();
      const [{ renderHTML }, models, today, { configureLightPageView }] = await Promise.all([
        import('/js/components/LightPagePresentation.svelte.html.js'), import('/js/light-page-presentation.js'),
        import('/js/light-today-presentation.js'), import('/js/light-page-view.js'),
      ]);
      const calls: string[] = []; Object.assign(window, { lightOwnedCalls: calls });
      configureLightPageView({ quickLogSunSession: () => calls.push('sun'), openLightEnvironmentAssessment: () => calls.push('environment'), requestPreciseLocation: () => calls.push('location'), navigate: () => calls.push('navigate') });
      const strip = today.projectLightToday({ sessions: [], deviceSessions: [], active: null, devices: [], solarWindow: true, windowLabel: 'Morning sun window', hasSetup: false, hasRooms: false, medToday: 0.72, weeklyIU: 1800, budget: { supplementIU: 5000, sunIU: 1200, exceedsSupplementUL: true }, coords: { altitudeM: 1700 }, now: Date.now(), elapsed: '' });
      // Theme changes legitimately refresh Dashboard content. Keep this isolated
      // component host outside the app-owned route outlet; delegates use document.
      const host = document.createElement('div');
      host.id = 'light-owned-acceptance';
      // Keep fixed app navigation from obscuring this isolated visual fixture.
      host.style.cssText = 'position:fixed;inset:0;z-index:10000;overflow:auto;background:var(--bg-primary);padding:16px;box-sizing:border-box';
      document.body.append(host);
      document.getElementById('light-owned-acceptance')!.innerHTML = [
        renderHTML({ kind: 'location', country: false }),
        renderHTML({ kind: 'actions', view: models.projectLightSessionActions({ sunActive: false, deviceActive: false, hasDevices: false, totalSessions: 0 }) }),
        renderHTML({ kind: 'prompt', view: { status: 'No rooms mapped', label: 'Open assessment', action: 'open-light-environment', hint: 'Literal <img src=x> & retained.', extraClass: '' } }),
        renderHTML({ kind: 'safety', view: models.projectLightUVSafety(0.72, 0.8) }),
        renderHTML({ kind: 'methods', skinBasis: 'The current model uses Fitzpatrick II as a rough base-MED reference, not a personal safe exposure time.', dataSource: null }),
        renderHTML({ kind: 'today', view: strip, dashboard: null, conditions: { kind: 'message', message: '' }, pills: [{ key: 'circadian', name: 'Circadian', icon: '☀', title: 'Not logged', label: 'Circadian, Not logged, tap to open detail', active: false, days: 'Not logged', chart: null }] }),
      ].join('');
    });
    const root = page.locator('#light-owned-acceptance');
    const before = await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData));
    await expect(root.locator('img,script')).toHaveCount(0);
    await root.getByRole('button', { name: 'Open assessment', exact: true }).focus(); await page.keyboard.press('Enter');
    await root.getByRole('button', { name: 'Start sun session', exact: true }).click();
    await root.getByRole('button', { name: 'Open Light & Sun →', exact: true }).click();
    await root.getByRole('button', { name: 'use your current location today', exact: true }).focus(); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => (window as unknown as { lightOwnedCalls: string[] }).lightOwnedCalls)).toEqual(['environment', 'sun', 'navigate', 'location']);
    const methods = root.locator('.light-explainer'); await methods.locator('summary').focus(); await page.keyboard.press('Enter');
    await expect(methods).toHaveAttribute('open', '');
    for (const width of [320, 1100]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
        expect(await page.evaluate(async theme => { const module = await import('/js/theme.js'); return await module.setTheme(theme) && module.getTheme() === theme; }, theme)).toBe(true);
        await expect.poll(() => root.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition && animation.playState === 'running').length)).toBe(0);
        expect(await root.evaluate(element => element.scrollWidth - element.clientWidth), `${width}/${theme} overflow`).toBeLessThanOrEqual(1);
        const violations = await root.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id, details: item.nodes.map(node => node.failureSummary) })));
        expect(violations, `${width}/${theme} accessibility`).toEqual([]);
        for (const control of await root.locator('button,summary').all()) {
          const box = await control.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
        }
      }
      await root.locator('.light-today-strip').screenshot({ path: info.outputPath(`light-today-${width}.png`) });
    }
    expect(await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData))).toBe(before);
    expect(errors).toEqual([]);
  });
});
