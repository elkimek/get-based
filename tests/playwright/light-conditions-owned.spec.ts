import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';

test.beforeEach(async ({ context }) => { await installDiscussionFixture(context); });
// Floating fixtures need an opaque page canvas: translucent glass cards must not
// composite unrelated Dashboard text underneath their own reading surfaces.
test('authored conditions retain themed responsive reading, keyboard tooltips, touch targets and reduced motion', async ({ page }, info) => {
  test.setTimeout(120000); await page.goto('/app');
  await page.evaluate(async () => {
    await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const el = document.createElement('div'); el.id = 'owned-conditions';
    el.style.cssText = 'position:fixed;top:20px;left:16px;right:16px;bottom:70px;overflow:auto;z-index:500;background:var(--bg-primary);padding:12px'; document.body.append(el);
  });
  const host = page.locator('#owned-conditions');
  for (const width of [320, 1100]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
      await page.evaluate(async value => (await import('/js/theme.js')).setTheme(value), theme);
      for (const variant of ['full', 'compact']) {
        await host.evaluate(async (element, variant) => {
          const [{ projectConditions }, { renderHTML }] = await Promise.all([import('/js/light-conditions-presentation.js'), import('/js/components/LightConditionsPresentation.svelte.html.js')]);
          const now = Date.now(), day = new Date().toISOString().slice(0, 10);
          const view = projectConditions({ uvIndex: 2, uvClearSky: 3, cloudCover: 35, source: 'open_meteo', validAt: now, fetchedAt: now, daily: { sunrise: day + 'T06:00', sunset: day + 'T18:00', peakAt: day + 'T12:00', uvIndexMax: 5 }, airQuality: { european_aqi: 30, surfaceOzoneUgM3: 35, european_aqi_ozone: 30 } }, null, variant);
          element.innerHTML = renderHTML({ kind: 'widget', hasLocation: true, slot: { id: 'conditions-owned-slot', variant, view } });
        }, variant);
        expect(await host.evaluate(el => el.scrollWidth - el.clientWidth), `${width}/${theme}/${variant} overflow`).toBeLessThanOrEqual(1);
        const violations = await host.evaluate(async el => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(el, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })));
        expect(violations, `${width}/${theme}/${variant}`).toEqual([]);
        const target = host.locator('[data-conditions-tooltip][tabindex="0"]').first(); await target.focus(); await expect(target).toBeFocused();
        await expect(page.locator('#app-tooltip')).toBeVisible(); await expect(target).toHaveCSS('outline-width', '2px');
        if (await page.evaluate(() => matchMedia('(pointer:coarse)').matches)) for (const button of await host.locator('button').all()) {
          const box = await button.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
        }
      }
    }
    await host.screenshot({ path: info.outputPath(`conditions-${width}.png`) });
  }
  await host.locator('.conditions-now-source-compact').evaluate(el => el.classList.add('just-refreshed'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(host.locator('.conditions-now')).toHaveCSS('transition-duration', '0s');
});

test('severity readings and warnings retain AA contrast in every theme', async ({ page }) => {
  await page.goto('/app'); await page.setViewportSize({ width: 320, height: 1000 });
  await page.evaluate(async () => {
    await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const el = document.createElement('div'); el.id = 'conditions-severity';
    el.style.cssText = 'position:fixed;inset:16px;overflow:auto;z-index:500;background:var(--bg-primary);padding:12px'; document.body.append(el);
  });
  const host = page.locator('#conditions-severity');
  for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
    await page.evaluate(async value => (await import('/js/theme.js')).setTheme(value), theme);
    for (const [uvIndex, european_aqi] of [[2, 10], [4, 30], [7, 60], [9, 80], [12, 110], [17, 120]]) {
      await host.evaluate(async (element, data) => {
        const [{ projectConditions }, { renderHTML }] = await Promise.all([import('/js/light-conditions-presentation.js'), import('/js/components/LightConditionsPresentation.svelte.html.js')]);
        const view = projectConditions({ uvIndex: data.uvIndex, source: 'open_meteo', validAt: Date.now(), fetchedAt: Date.now(), airQuality: { european_aqi: data.european_aqi } }, null, 'full');
        element.innerHTML = renderHTML({ kind: 'conditions', view });
      }, { uvIndex, european_aqi });
      const violations = await host.evaluate(async el => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(el, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })));
      expect(violations, `${theme}/UVI ${uvIndex}/AQ ${european_aqi}`).toEqual([]);
    }
  }
});

test('actual conditions refresh and inspection retain cache bypass, keyboard scrolling, escape and source trust', async ({ page }) => {
  await page.goto('/app');
  await page.evaluate(async () => {
    await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const conditions = await import('/js/light-conditions-now.js');
    let release!: () => void; let gated = false; const gate = new Promise<void>(resolve => { release = resolve; });
    const requests: { noCache?: boolean }[] = [];
    const day = new Date().toISOString().slice(0, 10);
    conditions.configureLightConditionsNow({ getSunCoords: () => ({ lat: 50, lon: 14, source: 'profile-precise' }), solarZenithAngle: () => 40,
      computeUVConfidence: () => 0.73, purgeMeteoCache: () => {}, fetchAtmosphere: async (request: { noCache?: boolean }) => {
        requests.push(request); if (gated) await gate;
        return { uvIndex: gated ? 8 : 6, source: 'open_meteo', validAt: Date.now(), fetchedAt: Date.now(), cloudCover: 35,
          daily: { sunrise: day + 'T06:00', sunset: day + 'T18:00', peakAt: day + 'T12:00', uvIndexMax: 8 }, debugPayload: 'x'.repeat(5000) };
      } });
    Object.assign(window, { conditionsOwned: { requests, release, enableGate: () => { gated = true; } } });
    const el = document.createElement('div'); el.id = 'conditions-owned-flow'; el.style.cssText = 'position:fixed;inset:20px;z-index:500;overflow:auto;background:var(--bg-primary);padding:12px';
    el.innerHTML = conditions.renderLightConditionsWidgetBody({ slotId: 'conditions-owned-flow-slot' }); document.body.append(el);
  });
  const host = page.locator('#conditions-owned-flow'), slot = host.locator('.conditions-now');
  await expect(slot).toHaveAttribute('aria-busy', 'false'); await expect(host.locator('.conditions-now-value-hero')).toHaveText('6');
  await page.evaluate(() => (window as unknown as { conditionsOwned: { enableGate(): void } }).conditionsOwned.enableGate());
  const refresh = host.getByRole('button', { name: 'Refresh conditions data — bypasses cache', exact: true }); await refresh.focus(); await refresh.press('Enter');
  await expect(slot).toHaveClass(/is-refreshing/); await expect(host.locator('.conditions-now-trust')).toHaveCSS('opacity', '0.55');
  await expect.poll(() => page.evaluate(() => (window as unknown as { conditionsOwned: { requests: { noCache?: boolean }[] } }).conditionsOwned.requests.at(-1)?.noCache)).toBe(true);
  await page.evaluate(() => (window as unknown as { conditionsOwned: { release(): void } }).conditionsOwned.release());
  await expect(host.locator('.conditions-now-value-hero')).toHaveText('8'); await expect(slot).not.toHaveClass(/is-refreshing/);
  const details = host.getByRole('button', { name: 'Show raw conditions response, source, cache, and sanity check', exact: true }); await details.click();
  const dialog = page.getByRole('dialog', { name: 'Inspect conditions data', exact: true }); await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('73%'); await expect(dialog).toContainText('Valid at'); await expect(dialog).toContainText('Retrieved at');
  const raw = dialog.getByRole('region', { name: 'Raw conditions payload', exact: true }); await raw.focus(); await raw.press('PageDown');
  await expect.poll(() => raw.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
    await page.evaluate(async value => (await import('/js/theme.js')).setTheme(value), theme);
    const violations = await dialog.evaluate(async el => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(el, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
    expect(violations, `inspection/${theme}`).toEqual([]);
  }
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(details).toBeFocused();
});
