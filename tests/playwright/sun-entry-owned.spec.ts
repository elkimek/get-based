import { expect, test } from './coverage-fixture.js';
import { createDefaultProfileData } from '../../js/profile.js';
import { seedLightPageFixture } from '../helpers/light-page-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';

test.beforeEach(async ({ page, context }) => {
  await installDiscussionFixture(context);
  await context.addInitScript(seedLightPageFixture, { defaults: createDefaultProfileData() });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/app');
  await page.evaluate(async () => (await import('/js/light-sun-loader.js')).loadLightSunUI());
});

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

  test('authored Sun entry forms retain actual body picker, warning tiers, themes and accessible narrow controls', async ({ page }, info) => {
    test.setTimeout(120000);
    const before = await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData));
    for (const mode of ['start','coverage'] as const) {
      await page.evaluate(async mode => {
        const [{ renderHTML }, model, body, sun, format] = await Promise.all([import('/js/components/LightSessionPresentation.svelte.html.js'), import('/js/light-session-presentation.js'), import('/js/sun-body-silhouette.js'), import('/js/sun.js'), import('/js/sun-active-session-format.js')]);
        document.getElementById('sun-entry-acceptance')?.remove();
        const host = document.createElement('div'); host.id = 'sun-entry-acceptance'; host.className = 'modal-overlay show';
        host.style.cssText = 'position:fixed;inset:0;z-index:10000;overflow:auto;background:var(--bg-primary);padding:16px;box-sizing:border-box;display:block';
        const silhouetteView = body.projectBodySilhouette(new Set(['breast-chest']));
        host.innerHTML = mode === 'coverage' ? renderHTML({ kind: 'coverage', silhouetteView }) : renderHTML({ kind: 'start', silhouetteView, view: model.projectStartSunSessionForm({ lastUsed: { bodyExposure: { glassBetween: true } }, eyeModes: sun.EYE_MODES.map(item => ({ ...item, pickerLabel: item.key === 'direct' ? 'Ambient <light> & literal' : item.pickerLabel })), lensTints: sun.LENS_TINTS, postureOptions: sun.POSTURE_OPTIONS, surfaceOptions: sun.SURFACE_OPTIONS }) });
        const details = host.querySelector('details'); if (details) details.open = true;
        const hint = host.querySelector('#sun-start-hint');
        if (hint) { hint.classList.add('sun-silhouette-hint-error'); hint.textContent = 'Tap at least one region before starting — what part of you is uncovered?'; }
        const banner = host.querySelector<HTMLElement>('#sun-start-uvi-banner');
        if (banner) { banner.hidden = false; banner.innerHTML = [format._renderUVIPreflightBanner(5,'I','none',false,()=>1), format._renderUVIPreflightBanner(8,'III','moderate',false,()=>1), format._renderUVIPreflightBanner(12,'I','severe',true,()=>1)].join(''); }
        document.body.append(host);
      }, mode);
      const root = page.locator('#sun-entry-acceptance');
      await expect(root.locator('svg.sun-silhouette')).toHaveCount(1);
      if (mode === 'start') { await expect(root.locator('#start-eye-mode')).toContainText('Ambient <light> & literal'); await expect(root.locator('.sun-uvi-warn,.sun-uvi-veryhigh,.sun-uvi-extreme')).toHaveCount(3); }
      for (const width of [320,1100]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']) {
          expect(await page.evaluate(async theme => { const api = await import('/js/theme.js'); return await api.setTheme(theme) && api.getTheme() === theme; }, theme)).toBe(true);
          await expect.poll(() => root.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition && animation.playState === 'running').length)).toBe(0);
          expect(await root.evaluate(element => element.scrollWidth - element.clientWidth), `${mode}/${width}/${theme} overflow`).toBeLessThanOrEqual(1);
          expect(await root.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${mode}/${width}/${theme} accessibility`).toEqual([]);
          for (const control of await root.locator('button:visible,select:visible,summary:visible,.toggle-switch:visible').all()) { const box = await control.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44); }
        }
        await root.locator('.modal-body').evaluate(element => { element.scrollTop = 0; });
        await root.locator('[role="dialog"]').screenshot({ path: info.outputPath(`${mode}-${width}.png`) });
        if (mode === 'start') {
          await root.locator('details').evaluate(element => element.scrollIntoView({ block: 'start' }));
          await root.locator('[role="dialog"]').screenshot({ path: info.outputPath(`start-options-${width}.png`) });
        }
      }
      await expect(root.locator('script,[onerror],light')).toHaveCount(0);
    }
    expect(await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData))).toBe(before);
  });
});

test('Sun entry prerequisites, clear validation, literal defaults and native keyboard actions retain controller ownership', async ({ page }) => {
  const before = await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData));
  const blocked = await page.evaluate(async () => {
    const [active, sun, { state }] = await Promise.all([import('/js/sun-active-session.js'), import('/js/sun.js'), import('/js/state.js')]);
    const calls = { setup: 0, starts: [] as unknown[] }; Object.assign(window, { sunEntryCalls: calls });
    const last = { id: 'previous', startedAt: 1, endedAt: 2, bodyExposure: { regions: ['breast-chest'], glassBetween: true }, eyeExposure: { mode: 'sunglasses', lensTint: 'amber' }, posture: 'lying-supine', surfaceAlbedo: 'sand' };
    active.configureSunActiveSession({ getSessions: () => [last], getActiveSession: () => null, getSunCoords: () => ({ lat: 50, lon: 14, source: 'profile-precise' }), fetchAtmosphere: async () => ({ uvIndex: 12 }), applyAtmOverrides: (atm: unknown) => atm, photosensitiveMedScale: () => 1,
      openLightSetup: () => calls.setup++, startSession: async (payload: unknown) => { calls.starts.push(payload); return 'accepted'; }, refreshSurfaces: () => {}, eyeModes: sun.EYE_MODES, lensTints: sun.LENS_TINTS, postureOptions: sun.POSTURE_OPTIONS, surfaceOptions: sun.SURFACE_OPTIONS });
    const defaults = state.importedData!.sunDefaults!;
    const withoutSkin = { ...defaults }; delete withoutSkin.fitzpatrick;
    state.importedData!.sunDefaults = withoutSkin; const noSkin = await active.openStartSunSessionDialog(); state.importedData!.sunDefaults = defaults;
    active.configureSunActiveSession({ getSunCoords: () => ({ lat: 50, lon: 14, source: 'country-band' }) }); const broadLocation = await active.openStartSunSessionDialog();
    active.configureSunActiveSession({ getSunCoords: () => ({ lat: 50, lon: 14, source: 'profile-precise' }) });
    return { noSkin, broadLocation, setup: calls.setup, starts: calls.starts.length };
  });
  expect(blocked).toEqual({ noSkin: false, broadLocation: false, setup: 2, starts: 0 });
  await expect(page.getByRole('dialog', { name: 'Start sun session', exact: true })).toHaveCount(0);
  await page.evaluate(async () => (await import('/js/sun-active-session.js')).openStartSunSessionDialog());
  const dialog = page.getByRole('dialog', { name: 'Start sun session', exact: true });
  await expect(dialog.locator('#start-eye-mode')).toHaveValue('sunglasses'); await expect(dialog.locator('#start-lens-tint')).toHaveValue('amber');
  await expect(dialog.locator('#start-posture')).toHaveValue('lying-supine'); await expect(dialog.locator('#start-surface')).toHaveValue('sand'); await expect(dialog.locator('#start-glass')).toBeChecked();
  await expect(dialog.locator('.sun-uvi-extreme')).toContainText('not a safe exposure time');
  await dialog.locator('#sun-start-clear').focus(); await page.keyboard.press('Space');
  await dialog.locator('#start-confirm').focus(); await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible(); await expect(dialog.locator('#sun-start-hint')).toContainText('Tap at least one region');
  expect(await page.evaluate(() => (window as unknown as { sunEntryCalls: { starts: unknown[] } }).sunEntryCalls.starts)).toEqual([]);
  await dialog.locator('[data-region="breast-chest"]').first().focus(); await page.keyboard.press('Enter');
  await expect(dialog.locator('#sun-start-hint')).toContainText('Upper chest');
  await dialog.locator('summary').focus(); await page.keyboard.press('Enter'); await expect(dialog.locator('details')).toHaveAttribute('open','');
  await dialog.locator('#start-eye-mode').selectOption('direct'); await dialog.locator('#start-posture').selectOption('lying-prone'); await dialog.locator('#start-surface').selectOption('snow');
  await dialog.locator('#start-confirm').focus(); await page.keyboard.press('Space'); await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { sunEntryCalls: { starts: unknown[] } }).sunEntryCalls.starts)).toEqual([{ regions: ['breast-chest'], eyeMode: 'glass-window', lensTint: 'amber', glassBetween: true, posture: 'lying-prone', surfaceAlbedo: 'snow', rotatedSides: false, location: { lat: 50, lon: 14, source: 'profile-precise' } }]);
  await page.evaluate(async () => (await import('/js/sun-active-session.js')).openStartSunSessionDialog());
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).focus(); await page.keyboard.press('Space'); await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData))).toBe(before);
});
