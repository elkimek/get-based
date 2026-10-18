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

  test('owned session detail layouts retain themes, disclosures, literal fields and accessible controls', async ({ page }, info) => {
    test.setTimeout(120000);
    const before = await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData));
    await page.evaluate(async () => {
      const [{ renderHTML }, { detailField, detailChannel, sessionCalculationNotice }] = await Promise.all([import('/js/components/LightSessionPresentation.svelte.html.js'), import('/js/light-session-detail-presentation.js')]);
      const host = document.createElement('div'); host.id = 'light-details-acceptance'; host.className = 'modal-overlay show';
      host.style.cssText = 'position:fixed;inset:0;z-index:10000;overflow:auto;background:var(--bg-primary);padding:16px;box-sizing:border-box;display:block';
      host.innerHTML = (['sun','device'] as const).map(kind => renderHTML({ kind: 'detail', ai: null, view: {
        kind, id: '<ID>', title: kind === 'sun' ? 'Sun session · Wednesday, June 10, 2026' : 'Device session — 10 Jun 2026',
        summary: [detailField('When', '09:30–09:45 · 15 min'), detailField('Source', '<Brand> Panel & One')],
        setup: [detailField('Skin · 18%', 'Upper chest <literal>'), detailField('Eyes', 'UV-rated eye protection logged')],
        notices: [{ title: 'UV dose model', danger: kind === 'device', text: 'Local erythemal dose: 0.12 SED. Closed eyelids are not UV protection.' }],
        calculation: kind === 'sun' ? sessionCalculationNotice('calculation-error') : null,
        channels: [detailChannel('vitamin_d', { label: 'Vitamin D', icon: '☀' }, 2, '100 IU-equivalent', kind), detailChannel('violet_eye', { label: 'Outdoor eye light & response', icon: '◉' }, 0, '', kind)],
        channelsEmpty: '', signalsDescription: 'Estimated stimulation, with model uncertainty.', lightMetric: null,
        inputTitle: 'Conditions and model inputs', inputDescription: 'Technical inputs retained for review.',
        inputs: [detailField('Ozone', '— (default 300)'), detailField('UV split', 'UVB 3.0% (1.0 W/m²) · UVA 97.0% (30.7 W/m²)', '', true), detailField('Source', 'Saved <source>', '', true)], inputsEmpty: '',
        location: detailField('Approx. model location', '50.08°, 14.43° · GPS'), sourceUrl: '', notes: 'Saved <notes> & same data.', canEditDuration: true, canEditMode: kind === 'device',
      } })).join('') + renderHTML({ kind: 'mode-editor', name: '<Panel> & One', modes: [{ key: 'red', label: 'Red only', selected: true }, { key: 'nir', label: 'NIR only', selected: false }] });
      host.querySelectorAll('details').forEach(element => element.open = true); document.body.append(host);
    });
    const root = page.locator('#light-details-acceptance');
    for (const width of [320,1100]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']) {
        expect(await page.evaluate(async theme => { const api = await import('/js/theme.js'); return await api.setTheme(theme) && api.getTheme() === theme; }, theme)).toBe(true);
        await expect.poll(() => root.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition && animation.playState === 'running').length)).toBe(0);
        expect(await root.evaluate(element => element.scrollWidth - element.clientWidth), `${width}/${theme} overflow`).toBeLessThanOrEqual(1);
        expect(await root.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${width}/${theme} accessibility`).toEqual([]);
        for (const control of await root.locator('button,select,summary').all()) {
          const box = await control.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
        }
      }
      await root.locator('[data-session-kind="sun"]').screenshot({ path: info.outputPath(`sun-detail-${width}.png`) });
      await root.locator('[data-session-kind="device"]').screenshot({ path: info.outputPath(`device-detail-${width}.png`) });
    }
    await expect(root.locator('img,script,[onerror]')).toHaveCount(0);
    expect(await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData))).toBe(before);
  });
});

test('session detail native channel buttons activate once on Enter and Space', async ({ page }) => {
  await page.evaluate(async () => {
    const [sun, runtime, { state }] = await Promise.all([import('/js/sun-session-ui.js'), import('/js/light-devices-runtime.js'), import('/js/state.js')]);
    Object.assign(window, { detailCalls: [] as string[] });
    const record = (value: unknown) => (window as unknown as { detailCalls: string[] }).detailCalls.push(String(value));
    sun.configureSunSessionUI({ getSessions: () => [{ id: 'sun-native', startedAt: 1, endedAt: 900001, durationMin: 15, doses: { vitamin_d: 2 } }], openChannelOnLightPage: record });
    state.importedData!.deviceSessions = [{ id: 'dev-native', startedAt: 1, endedAt: 900001, durationMin: 15, doses: { pbm_red: 3 } }];
    runtime.configureLightDevicesRuntimeDeps({ openChannelOnLightPage: record });
  });
  let calls = 0;
  for (const kind of ['sun','device']) for (const key of ['Enter','Space']) {
    await page.evaluate(async kind => { if (kind === 'sun') (await import('/js/sun-session-ui.js')).openSunSessionDetail('sun-native'); else (await import('/js/light-devices.js')).openDeviceSessionDetail('dev-native'); }, kind);
    const dialog = page.getByRole('dialog', { name: kind === 'sun' ? 'Sun session details' : 'Device session details', exact: true });
    await dialog.getByText('Modeled light signals', { exact: true }).click();
    const channel = dialog.locator('.sun-detail-channel-row').first();
    expect(await channel.evaluate(element => element.tagName)).toBe('BUTTON');
    await channel.focus(); await page.keyboard.press(key); await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { detailCalls: string[] }).detailCalls)).toHaveLength(++calls);
  }
});
