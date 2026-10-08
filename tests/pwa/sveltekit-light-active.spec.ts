import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { ProfileData } from '../../types/app-state.js';
import type { BackupSnapshot } from '../../js/backup.js';
import { createDefaultProfileData } from '../../js/profile.js';
import { startKitServer } from './kit-server.js';
import { seedLightPageFixture } from '../helpers/light-page-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';

test('static active Sun and device timers retain pause, resume, stop and canonical data offline', async ({ page, context }) => {
  test.setTimeout(120000);
  await installOfflineStartupDiagnostics(context); await installDiscussionFixture(context);
  await context.addInitScript(() => { if (['http:', 'https:'].includes(location.protocol)) localStorage.setItem('labcharts-ai-paused','true'); });
  // This returning profile has previously saved coordinates. No geolocation prompt or external provider is used.
  await context.addInitScript(seedLightPageFixture, { defaults: createDefaultProfileData(), sunDefaults: { coords: { lat: 50.1, lon: 14.4 } }, devices: [{ id: 'active-panel', brand: 'Offline <Panel>', model: 'Red & One', type: 'pbm-red', recommendedDistanceCm: 15, mwPerCm2At15cm: 10, irradianceBasis: 'measured', peakWavelengths: [660], channels: ['pbm_red'] }] });
  await context.route('https://**', route => route.abort());
  const errors: string[] = [], csp: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message)); observe(page); context.on('page', observe);
  await context.exposeBinding('activeLightCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { activeLightCsp(value: string): Promise<void> }).activeLightCsp(event.violatedDirective); }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading = [{ phase: 'initial-online', readyMs: await ready(page, server.origin) }];
    const before = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    server.state.offline = true; await openLight(page);
    await page.locator('[data-light-devices-action="log-device-session"][data-light-device-id="active-panel"]').click();
    const deviceForm = page.getByRole('dialog', { name: 'Log device session', exact: true });
    await deviceForm.getByRole('button', { name: 'Start timer', exact: true }).click(); await expect(deviceForm).not.toBeVisible();
    const deviceCard = page.locator('.light-active-session-pinned .light-session-device[data-light-active-presentation]');
    await expect(deviceCard).toContainText('Offline <Panel> Red & One');
    const timer = deviceCard.locator('[data-live-elapsed-for]'), initialTimer = await timer.textContent();
    await expect.poll(() => timer.textContent()).not.toBe(initialTimer);
    await deviceCard.screenshot({ path: test.info().outputPath('actual-device-active-offline.png') });
    let snapshot = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    expect(snapshot.deviceSessions).toHaveLength(1); const activeDevice = snapshot.deviceSessions![0]!;
    expect(activeDevice).toMatchObject({ deviceId: 'active-panel', endedAt: null, durationMin: 0, distanceCm: 15, bodyAreas: ['breast-chest'], eyesProtected: true, doses: {} });
    expect(activeDevice.doses).toEqual({});
    expect(snapshot).toEqual({ ...before, deviceSessions: [activeDevice] });
    await page.getByRole('button', { name: 'Start sun session', exact: true }).click();
    const sunForm = page.getByRole('dialog', { name: 'Start sun session', exact: true });
    await sunForm.locator('[data-region="breast-chest"]').first().click();
    await sunForm.locator('summary').click(); await sunForm.locator('#start-eye-mode').selectOption('sunglasses');
    await sunForm.locator('#start-confirm').click(); await expect(sunForm).not.toBeVisible();
    const sunCard = page.locator('.light-active-session-pinned .light-session-sun[data-light-active-presentation]');
    await expect(sunCard).toBeVisible(); await expect(sunCard.locator('.sun-session-live-readouts')).toBeVisible();
    await expect(sunCard.locator('.sun-session-vitd')).not.toContainText('Calculating…');
    const firstElapsed = await sunCard.locator('.sun-session-duration').textContent();
    await expect.poll(() => sunCard.locator('.sun-session-duration').textContent()).not.toBe(firstElapsed);
    await sunCard.getByRole('button', { name: 'Pause session', exact: true }).click();
    await expect(sunCard.getByRole('button', { name: 'Resume session', exact: true })).toBeVisible();
    const pausedElapsed = await sunCard.locator('.sun-session-duration').textContent();
    await page.waitForTimeout(1200); await expect(sunCard.locator('.sun-session-duration')).toHaveText(pausedElapsed!);
    snapshot = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    expect(snapshot.sunSessions).toHaveLength(1); const activeSun = snapshot.sunSessions![0]!;
    expect(activeSun).toMatchObject({ endedAt: null, paused: true, location: { lat: 50.1, lon: 14.4, source: 'profile-precise' }, bodyExposure: { regions: ['breast-chest'], fraction: 0.06 }, eyeExposure: { mode: 'sunglasses' } });
    expect(snapshot).toEqual({ ...before, sunSessions: [activeSun], deviceSessions: [activeDevice] });
    await sunCard.screenshot({ path: test.info().outputPath('actual-sun-active-paused-offline.png') });
    await page.close();
    const cold = await context.newPage(); loading.push({ phase: 'offline-active-cold', readyMs: await ready(cold, server.origin) }); await openLight(cold);
    const coldSun = cold.locator('.light-active-session-pinned .light-session-sun[data-id="'+activeSun.id+'"]');
    const coldDevice = cold.locator('.light-active-session-pinned .light-session-device[data-id="'+activeDevice.id+'"]');
    await expect(coldSun.getByRole('button', { name: 'Resume session', exact: true })).toBeVisible(); await expect(coldDevice).toBeVisible();
    expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(snapshot);
    await coldSun.getByRole('button', { name: 'Resume session', exact: true }).focus(); await cold.keyboard.press('Enter');
    await expect(coldSun.getByRole('button', { name: 'Pause session', exact: true })).toBeVisible();
    const resumedSun = ((await cold.evaluate(readComparisonAcceptanceProfile)) as ProfileData).sunSessions![0]!;
    expect(resumedSun.paused).toBe(false); expect(resumedSun.pausedAt).toBeUndefined();
    const resumedAt = activeSun.pausedAt! + resumedSun.accumulatedPausedMs! - activeSun.accumulatedPausedMs!;
    expect(resumedSun.resumedAt).toBe(resumedAt);
    // Exercise the fresh post-cold-launch slice before stopping. A quick stop
    // can miss the ticker boundary and conceal replay of the paused interval.
    const resumedElapsed = await coldSun.locator('.sun-session-duration').textContent();
    await expect.poll(() => coldSun.locator('.sun-session-duration').textContent()).not.toBe(resumedElapsed);
    await expect(coldSun.locator('.sun-session-vitd')).not.toContainText('Calculating…');
    await coldSun.getByRole('button', { name: 'Stop & save', exact: true }).focus(); await cold.keyboard.press('Space'); await expect(coldSun).not.toBeVisible();
    await coldDevice.getByRole('button', { name: 'Stop & save', exact: true }).focus(); await cold.keyboard.press('Space'); await expect(coldDevice).not.toBeVisible();
    snapshot = await cold.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    const savedSun = snapshot.sunSessions![0]!, savedDevice = snapshot.deviceSessions![0]!, savedPanel = snapshot.lightDevices![0]!;
    expect(savedSun).toMatchObject({ id: activeSun.id, startedAt: activeSun.startedAt, paused: false, bodyExposure: activeSun.bodyExposure, eyeExposure: { mode: 'sunglasses' } });
    expect(savedSun.accumulatedPausedMs).toBeGreaterThan(0);
    const activeMs = savedSun.endedAt! - savedSun.startedAt - savedSun.accumulatedPausedMs!;
    expect(activeMs).toBeGreaterThan(0);
    // stopSession records the complete unpaused clock in eye duration. Hydration
    // retains the established calculation contract: sum only modeled slices.
    expect(savedSun.eyeExposure!.durationSec).toBe(Math.round(activeMs / 1000));
    const segments = (savedSun.exposureSegments || []) as { startedAt: number; endedAt: number; durationMin: number }[];
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments.some(segment => segment.startedAt >= resumedAt)).toBe(true);
    const modeledMs = segments.reduce((sum, segment) => sum + Number(segment.durationMin) * 60000, 0);
    expect(savedSun.durationMin! * 60000).toBeCloseTo(modeledMs, 5);
    expect(modeledMs).toBeGreaterThan(0); expect(modeledMs).toBeLessThanOrEqual(activeMs);
    for (const segment of segments) {
      expect(segment.startedAt).toBeGreaterThanOrEqual(savedSun.startedAt);
      expect(segment.endedAt).toBeLessThanOrEqual(savedSun.endedAt!);
      expect(segment.endedAt <= activeSun.pausedAt! || segment.startedAt >= resumedAt).toBe(true);
      expect(Number(segment.durationMin) * 60000).toBeCloseTo(Number(segment.endedAt) - Number(segment.startedAt), 5);
    }
    expect(savedDevice).toMatchObject({ id: activeDevice.id, startedAt: activeDevice.startedAt, distanceCm: 15, bodyAreas: ['breast-chest'], eyesProtected: true });
    expect(savedDevice.durationMin! * 60000).toBeCloseTo(savedDevice.endedAt! - savedDevice.startedAt, 5);
    expect(Number(savedDevice.doses?.pbm_red)).toBeGreaterThan(0);
    expect(snapshot).toEqual({ ...before, sunSessions: [savedSun], deviceSessions: [savedDevice], lightDevices: [savedPanel] });
    expect(savedPanel).toEqual({ ...before.lightDevices![0], lastSession: { durationMin: savedDevice.durationMin, distanceCm: 15, bodyArea: 'torso', bodyAreas: ['breast-chest'], eyesProtected: true, mode: null }, updatedAt: expect.any(Number) });
    await cold.close();
    for (let launch = 0; launch < 2; launch++) {
      const final = await context.newPage(); loading.push({ phase: `offline-saved-cold-${launch + 1}`, readyMs: await ready(final, server.origin) }); await openLight(final);
      await expect(final.locator('[data-light-history-row]')).toHaveCount(2); await expect(final.locator('.light-active-session-pinned')).toHaveCount(0);
      expect(await final.evaluate(readComparisonAcceptanceProfile)).toEqual(snapshot);
      if (launch === 1) {
        await final.locator('[data-shell-action="open-settings"]').click(); await final.locator('#settings-nav-data').click();
        const downloading = final.waitForEvent('download'); await final.locator('#backup-section').getByRole('button', { name: 'Download Backup', exact: true }).click();
        const backup = JSON.parse(await fs.readFile((await (await downloading).path())!, 'utf8')) as BackupSnapshot;
        expect(backup).toMatchObject({ format: 'labcharts-backup', encrypted: false }); expect(JSON.parse(backup.profiles.find(profile => profile.keys.imported)!.keys.imported!)).toEqual(snapshot);
      }
      await final.close();
    }
    await test.info().attach('active-light-loading-observations', { body: JSON.stringify(loading,null,2), contentType: 'application/json' });
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
