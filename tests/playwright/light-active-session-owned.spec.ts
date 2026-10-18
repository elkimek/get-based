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

  test('authored active session layouts retain themes, safety readability, labels and accessible controls', async ({ page }, info) => {
    test.setTimeout(120000);
    const before = await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData));
    await page.evaluate(async () => {
      const [{ renderHTML }, model] = await Promise.all([import('/js/components/LightSessionPresentation.svelte.html.js'), import('/js/light-active-session-presentation.js')]);
      const chips = ['vitamin_d','pomc','no_cv','violet_eye','circadian','nir_solar'].map(key => model.sessionChannelChip(key, { label: `Signal <${key}>`, icon: '☀' }, key === 'vitamin_d' ? '~1400 IU-eq' : ''));
      const initialSun = model.activeSunSessionView({ id: 'layout-sun', startedAt: 1, paused: true, bodyExposure: { rotatedSides: true, glassBetween: true, sunscreenSPF: 12 }, eyeExposure: { mode: 'direct' } }, 'Wednesday, June 10, 2026', '39:00', 'Upper chest <literal> & arms', 'Eyes open', chips, 13 * 3600000);
      const sun = { ...initialSun, readouts: model.liveSessionReadouts({ doses: { vitamin_d: 2 }, sed: 4, medFraction: 1.1, retinalUV: 35, fitzpatrick: 'II', fitzpatrickAssumed: true, psmTier: 'severe', atm: { temperatureC: 34 } }, { iu: 1400, ratePerMin: 35 }, 39) };
      const device = { ...sun, kind: 'device' as const, id: 'layout-device', date: 'Active · <Brand> Panel & One', body: '25 cm · Upper chest · ~6% skin · eye shielding logged', chips: null, readouts: [], forgotHours: null };
      const host = document.createElement('div'); host.id = 'light-active-acceptance';
      host.style.cssText = 'position:fixed;inset:0;z-index:10000;overflow:auto;background:var(--bg-primary);padding:16px;box-sizing:border-box;display:grid;align-content:start;gap:24px';
      host.innerHTML = `<div class="light-active-session-pinned">${renderHTML({ kind: 'active', view: sun })}</div>` + renderHTML({ kind: 'active', view: { ...sun, id: 'layout-running', paused: false, rotated: false, forgotHours: null, readouts: model.initialSessionReadouts({ safety: { medFraction: 0.3 } }) } }) + renderHTML({ kind: 'active', view: device });
      document.body.append(host);
    });
    const root = page.locator('#light-active-acceptance');
    await expect(root.locator('.sun-chip-extra:visible')).toHaveCount(0);
    for (const toggle of await root.locator('.sun-chip-more').all()) await toggle.click();
    await expect(root.locator('.sun-chip-extra:visible')).toHaveCount(6);
    for (const width of [320,1100]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']) {
        expect(await page.evaluate(async theme => { const api = await import('/js/theme.js'); return await api.setTheme(theme) && api.getTheme() === theme; }, theme)).toBe(true);
        await expect.poll(() => root.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition && animation.playState === 'running').length)).toBe(0);
        expect(await root.evaluate(element => element.scrollWidth - element.clientWidth), `${width}/${theme} overflow`).toBeLessThanOrEqual(1);
        expect(await root.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${width}/${theme} accessibility`).toEqual([]);
        for (const control of await root.locator('button:visible').all()) { const box = await control.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44); }
        for (const label of await root.locator('.sun-session-ctl-label').all()) await expect(label).toBeVisible();
      }
      await root.locator('[data-id="layout-sun"]').screenshot({ path: info.outputPath(`sun-active-${width}.png`) });
      await root.locator('[data-id="layout-device"]').screenshot({ path: info.outputPath(`device-active-${width}.png`) });
    }
    await expect(root.locator('img,script,[onerror]')).toHaveCount(0);
    expect(await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData))).toBe(before);
  });
});

test('active ticker preserves controls, chip expansion and keyboard focus with single native actions', async ({ page }) => {
  await page.evaluate(async () => {
    const [sun, active, { state }, deviceActions, devices] = await Promise.all([import('/js/sun-session-ui.js'), import('/js/sun-active-session.js'), import('/js/state.js'), import('/js/light-devices-actions.js'), import('/js/light-devices.js')]);
    Object.assign(window, { activeCalls: [] as string[] });
    const record = (value: string) => (window as unknown as { activeCalls: string[] }).activeCalls.push(value);
    const session = { id: 'owned-active', startedAt: Date.now() - 45 * 60000, endedAt: null, paused: true, pausedAt: Date.now() - 5 * 60000, accumulatedPausedMs: 60000, bodyExposure: { fraction: 0.18, regions: ['breast-chest'], rotatedSides: false }, eyeExposure: { mode: 'direct' }, safety: { fitzpatrick: 'II' }, doses: {} };
    const doses = Object.fromEntries(['vitamin_d','pomc','no_cv','violet_eye','circadian','nir_solar'].map(key => [key,2]));
    sun.configureSunSessionUI({ getSessions: () => [session], summarizeBodyExposure: () => 'Upper chest', eyeModes: [{ key: 'direct', label: 'Eyes open' }], quickLogSunSession: () => record('sun-stop'), resumeSunSession: (id: unknown) => record('resume:'+id), openChannelOnLightPage: (key: string) => record('channel:'+key) });
    active.configureSunActiveSession({ getSessions: () => [session], getActiveSession: () => session, vitaminDIUPerSession: () => 1400, renderLightChannelsLive: () => {} });
    active.setSunLiveState(session.id, { committedDoses: doses, committedSED: 3, committedRetinalUV: 35, fractionOfMEDFn: () => 1.1, fitzpatrick: 'II', fitzpatrickAssumed: true, psmTier: 'severe', atm: { temperatureC: 34 }, pending: false });
    const host = document.createElement('div'); host.id = 'active-ticker-acceptance'; host.innerHTML = sun.renderSunSessionRow(session); document.body.append(host);
    state.currentView = 'light'; active.ensureActiveTicker();
    Object.assign(window, { originalActiveControl: host.querySelector('[data-sun-session-action="resume-session"]'), originalReadout: host.querySelector('.sun-session-live-readouts') });
    state.importedData!.deviceSessions = [{ id: 'owned-device', startedAt: Date.now() - 60000, endedAt: null }];
    host.insertAdjacentHTML('beforeend', devices.renderActiveDeviceSessionCard());
    deviceActions.configureLightDevicesActions({ stopDeviceSessionAndNotify: (id: string) => record('device-stop:'+id) });
  });
  const card = page.locator('#active-ticker-acceptance [data-id="owned-active"]');
  await expect(card).toContainText('110% base burn dose'); await expect(card).toContainText('35 J/m² ocular actinic UV'); await expect(card).toContainText('cool down');
  await expect(card.locator('.sun-chip-extra:visible')).toHaveCount(0);
  const toggle = card.locator('.sun-chip-more'); await toggle.focus(); await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded','true'); await expect(card.locator('.sun-chip-extra:visible')).toHaveCount(3);
  const readout = card.locator('.sun-session-live-readouts');
  await expect.poll(() => readout.evaluate(element => element === (window as unknown as { originalReadout: Element }).originalReadout)).toBe(true);
  // Cross a real 1Hz tick. It must replace chip values without dropping keyboard focus or collapsing the list.
  await page.waitForTimeout(1200);
  await expect(toggle).toBeFocused(); await expect(toggle).toHaveAttribute('aria-expanded','true'); await expect(card.locator('.sun-chip-extra:visible')).toHaveCount(3);
  const channel = card.locator('.sun-chip[data-channel="vitamin_d"]'); await channel.focus();
  await page.waitForTimeout(1200); await expect(channel).toBeFocused(); await page.keyboard.press('Enter');
  expect(await card.locator('[data-sun-session-action="resume-session"]').evaluate(element => element === (window as unknown as { originalActiveControl: Element }).originalActiveControl)).toBe(true);
  await card.locator('[data-sun-session-action="resume-session"]').focus(); await page.keyboard.press('Enter');
  await card.locator('[data-sun-session-action="quick-log-sun"]').focus(); await page.keyboard.press('Space');
  await card.locator('.sun-session-head').focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Sun session details', exact: true })).toHaveCount(1);
  await page.getByRole('dialog', { name: 'Sun session details', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  const stopDevice = page.locator('#active-ticker-acceptance [data-light-devices-action="stop-device-session"]'); await stopDevice.focus(); await page.keyboard.press('Space');
  expect(await page.evaluate(() => (window as unknown as { activeCalls: string[] }).activeCalls)).toEqual(['channel:vitamin_d','resume:owned-active','sun-stop','device-stop:owned-device']);
  await page.evaluate(async () => (await import('/js/sun-active-session.js')).resetSunActiveSessionState());
});
