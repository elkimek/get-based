import { expect, test } from './coverage-fixture.js';
import { createDefaultProfileData } from '../../js/profile.js';
import { seedLightPageFixture } from '../helpers/light-page-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';

test.beforeEach(async ({ context, page }) => {
  await installDiscussionFixture(context);
  await context.addInitScript(seedLightPageFixture, { defaults: createDefaultProfileData() });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app');
  await page.evaluate(async () => { await (await import('/js/light-sun-loader.js')).loadLightSunUI(); });
});

// Size bounds below verify the application's coarse-pointer touch targets.
test.describe('coarse-pointer touch targets', () => {
  test.use({ hasTouch: true });
  test.beforeEach(async ({ page }) => {
    expect(await page.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      fine: matchMedia('(pointer: fine)').matches,
      touch: navigator.maxTouchPoints > 0,
    }))).toEqual({ coarse: true, fine: false, touch: true });
  });

  test('authored session forms and history retain themes, narrow layout, literal fields and accessible controls', async ({ page }, info) => {
    test.setTimeout(120000);
    const before = await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData));
    await page.evaluate(async () => {
      const [{ renderHTML }, model] = await Promise.all([import('/js/components/LightSessionPresentation.svelte.html.js'), import('/js/light-session-presentation.js')]);
      const host = document.createElement('div'); host.id = 'light-session-acceptance'; host.className = 'modal-overlay show';
      host.style.cssText = 'position:fixed;inset:0;z-index:10000;overflow:auto;background:var(--bg-primary);padding:16px;box-sizing:border-box;display:block';
      const past = model.projectPastSessionForm({ lastUsed: { posture: 'standing', surfaceAlbedo: 'grass' }, lastRegions: new Set(), eyeMode: 'open', lensTint: 'clear', localStartDefault: '2026-06-10T09:30', localNow: '2026-06-10T09:45', eyeModes: [{ key: 'open', pickerLabel: 'Ambient <light>' }], lensTints: [{ key: 'clear', label: 'Clear' }], postureOptions: [{ key: 'standing', label: 'Standing' }], surfaceOptions: [{ key: 'grass', label: 'Grass' }] });
      const device = model.projectDeviceSessionForm({ device: { id: 'dev', brand: '<Brand>', model: 'Panel & One' }, validModes: [{ id: 'red', label: 'Red' }, { id: 'uv', label: 'UV' }], defaultMode: 'red', defaultDuration: 10, defaultDistanceCm: 15, useUS: false, isUVDevice: false, isEyeLightDevice: false, defaultEyeControlChecked: true });
      const row = model.projectCompletedDeviceSession({ id: 'literal-id', startedAt: 1, durationMin: 12, mode: 'uv', safety: { hasUV: true, uvDoseStatus: 'unavailable', erythemalSED: null, conservativeBaseMedFraction: null, ocularActinicUV: null, ocularUvaJPerM2: null, unsafeEyeExposure: true } }, { id: 'dev', brand: '<Brand>', model: 'Panel & One', modes: [{ id: 'red', label: 'Red' }, { id: 'uv', label: 'UV' }] }, { date: '10 Jun 2026', time: '09:30' });
      host.innerHTML = renderHTML({ kind: 'past', view: past, silhouetteView: (await import('/js/sun-body-silhouette.js')).projectBodySilhouette(new Set(['face'])) }) + renderHTML({ kind: 'device', view: device, silhouetteView: (await import('/js/sun-body-silhouette.js')).projectBodySilhouette(new Set(['breast-chest'])) }) + renderHTML({ kind: 'history', rows: [{ kind: 'row', view: row }], total: 4, sunCount: 3, deviceCount: 1, modal: true, showMore: false });
      document.body.append(host);
    });
    const root = page.locator('#light-session-acceptance');
    for (const width of [320, 1100]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
        expect(await page.evaluate(async theme => { const api = await import('/js/theme.js'); return await api.setTheme(theme) && api.getTheme() === theme; }, theme)).toBe(true);
        await expect.poll(() => root.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition && animation.playState === 'running').length)).toBe(0);
        expect(await root.evaluate(element => element.scrollWidth - element.clientWidth), `${width}/${theme} overflow`).toBeLessThanOrEqual(1);
        const violations = await root.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
        expect(violations, `${width}/${theme} accessibility`).toEqual([]);
        for (const control of await root.locator('button:not([tabindex="-1"]),input:not([type="hidden"]):not([type="checkbox"]),select,textarea').all()) {
          const label = await control.evaluate(element => element.id || element.textContent);
          const box = await control.boundingBox(); expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44); expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
        }
      }
      await root.locator('.sun-detailed-modal').screenshot({ path: info.outputPath(`past-session-${width}.png`) });
      await root.locator('.dev-session-modal').screenshot({ path: info.outputPath(`device-session-${width}.png`) });
      await root.locator('.light-sessions-modal').screenshot({ path: info.outputPath(`session-history-${width}.png`) });
    }
    expect(await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData))).toBe(before);
    await expect(root.locator('img,script,[onerror]')).toHaveCount(0);
  });
});

test('history native buttons open once on Enter and Space and dismiss only the history owner', async ({ page }) => {
  await page.evaluate(async () => {
    const api = await import('/js/light-sessions-view.js');
    Object.assign(window, { historyCalls: [] as string[] });
    api.configureLightSessionsView({ getSessions: () => [], getDevices: () => [{ id: 'panel', brand: 'Panel', model: 'One' }], getDeviceSessions: () => [{ id: 'completed', deviceId: 'panel', startedAt: 1, endedAt: 60001, durationMin: 1 }], openDeviceSessionDetail: id => (window as unknown as { historyCalls: string[] }).historyCalls.push(id) });
  });
  for (const key of ['Enter', 'Space']) {
    await page.evaluate(async () => (await import('/js/light-sessions-view.js'))._openAllSessionsModal());
    const dialog = page.getByRole('dialog', { name: 'All sessions (1)' });
    await expect(dialog).toBeVisible();
    const row = dialog.getByRole('button', { name: /device session details/ });
    expect(await row.evaluate(element => element.tagName)).toBe('BUTTON');
    await row.focus(); await page.keyboard.press(key);
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { historyCalls: string[] }).historyCalls)).toHaveLength(key === 'Enter' ? 1 : 2);
  }
});

test('device form keyboard modes preserve fresh UV confirmation and distance conversion', async ({ page }) => {
  await page.evaluate(async () => {
    const [{ openDeviceSessionDialog }, { state }] = await Promise.all([import('/js/light-device-session-modal.js'), import('/js/state.js')]);
    state.importedData!.sunDefaults = { fitzpatrick: 'II', completedAt: 1 };
    Object.assign(window, { deviceSaved: [] as unknown[] });
    await openDeviceSessionDialog('panel', {
      getDevices: () => [{ id: 'panel', brand: 'Panel', model: 'One', type: 'combined', peakWavelengths: [660, 311], recommendedDistanceCm: 15, channelGroups: [{ id: 'red', peaks: [660] }, { id: 'uv', peaks: [311] }], modes: [{ id: 'red', label: 'Red', groups: ['red'], default: true }, { id: 'uv', label: 'UV', groups: ['uv'] }] }],
      validateModeCoupling: () => ({ ok: true }), projectBodySilhouette: (await import('/js/sun-body-silhouette.js')).projectBodySilhouette, bindBodySilhouette: () => {},
      getActiveDeviceSession: () => null, logDeviceSession: async payload => { (window as unknown as { deviceSaved: unknown[] }).deviceSaved.push(payload); return { id: 'saved', startedAt: 1 }; }, navigate: () => {},
    });
  });
  const dialog = page.getByRole('dialog', { name: 'Log device session' });
  await expect(dialog.locator('#dev-session-eyes')).toBeChecked();
  await dialog.getByRole('radio', { name: 'Red', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('radio', { name: 'UV', exact: true })).toBeFocused();
  await expect(dialog.getByRole('radio', { name: 'UV', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.locator('#dev-session-eyes')).not.toBeChecked();
  await expect(dialog.locator('#dev-session-duration')).toHaveValue('0.5');
  await dialog.getByRole('radio', { name: 'UV', exact: true }).press('Home');
  await expect(dialog.getByRole('radio', { name: 'Red', exact: true })).toBeFocused();
  await dialog.locator('#dev-session-distance').fill('30'); await dialog.getByRole('button', { name: 'in', exact: true }).click();
  await expect(dialog.locator('#dev-session-distance')).toHaveValue('11.8');
  await expect(dialog.getByRole('button', { name: 'in', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'cm', exact: true }).click();
  await expect(dialog.locator('#dev-session-distance')).toHaveValue('30');
  await dialog.locator('#dev-session-duration').fill('7');
  await dialog.getByRole('button', { name: 'Save session', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { deviceSaved: unknown[] }).deviceSaved)).toEqual([{ deviceId: 'panel', durationMin: 7, distanceCm: 30, bodyArea: 'torso', bodyAreas: ['breast-chest'], eyesProtected: false, mode: 'red' }]);
});
