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

test('static device logging and authored history persist offline through closed-client launches and backup', async ({ page, context }) => {
  test.setTimeout(120000);
  await installOfflineStartupDiagnostics(context); await installDiscussionFixture(context);
  await context.addInitScript(() => { if (['http:', 'https:'].includes(location.protocol)) localStorage.setItem('labcharts-ai-paused', 'true'); });
  await context.addInitScript(seedLightPageFixture, { defaults: createDefaultProfileData(), devices: [{
    id: 'acceptance-panel', brand: 'Offline <Panel>', model: 'Red & NIR', type: 'combined',
    recommendedDistanceCm: 15, mwPerCm2At15cm: 10, irradianceBasis: 'measured',
    peakWavelengths: [660, 850], peakShares: [0.5, 0.5], peakShareBasis: 'measured',
    channelGroups: [{ id: 'red', label: 'Red', peaks: [660] }, { id: 'nir', label: 'NIR', peaks: [850] }],
    modes: [{ id: 'red', label: 'Red only', groups: ['red'], default: true }, { id: 'nir', label: 'NIR only', groups: ['nir'] }],
  }] });
  const errors: string[] = [], csp: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message)); observe(page); context.on('page', observe);
  await context.exposeBinding('lightSessionCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { lightSessionCsp(value: string): Promise<void> }).lightSessionCsp(event.violatedDirective); }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading = [{ phase: 'initial-online', readyMs: await ready(page, server.origin) }];
    const before = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    server.state.offline = true; await openLight(page);
    await page.locator('[data-light-devices-action="log-device-session"][data-light-device-id="acceptance-panel"]').click();
    const dialog = page.getByRole('dialog', { name: 'Log device session', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#dev-session-eyes')).toBeChecked();
    await dialog.getByRole('radio', { name: 'Red only', exact: true }).focus(); await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('radio', { name: 'NIR only', exact: true })).toHaveAttribute('aria-checked', 'true');
    await dialog.locator('#dev-session-duration').fill('7'); await dialog.locator('#dev-session-distance').fill('25');
    // The real silhouette binder supplies the default upper-chest region.
    await expect(dialog.locator('#dev-session-area-hint')).toContainText('Upper chest');
    await dialog.screenshot({ path: test.info().outputPath('actual-device-session-offline.png') });
    await dialog.getByRole('button', { name: 'Save session', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    let snapshot = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    expect(snapshot.deviceSessions).toHaveLength(1);
    const session = snapshot.deviceSessions![0]!;
    expect(session).toMatchObject({ id: expect.stringMatching(/^devsess_/), deviceId: 'acceptance-panel', durationMin: 7, distanceCm: 25, bodyArea: 'torso', bodyAreas: ['breast-chest'], eyesProtected: true, fitzpatrick: 'II', mode: 'nir', notes: '', deviceSnapshot: { id: 'acceptance-panel', brand: 'Offline <Panel>', model: 'Red & NIR' }, safety: { hasUV: false, unsafeEyeExposure: false } });
    expect(session.endedAt! - session.startedAt).toBe(420000);
    const nirDose = Number(session.doses?.pbm_nir), redDose = Number(session.doses?.pbm_red);
    expect(Number.isFinite(nirDose)).toBe(true); expect(nirDose).toBeGreaterThan(0);
    expect(Number.isFinite(redDose)).toBe(true); expect(redDose).toBeGreaterThanOrEqual(0);
    // The existing Gaussian LED spectrum has a negligible red-band tail at 850 nm.
    // Selecting NIR must exclude the red channel, rather than require rounded zero.
    expect(redDose).toBeLessThan(nirDose * 1e-20);
    const device = snapshot.lightDevices![0]!;
    expect(device).toEqual({ ...before.lightDevices![0], lastSession: { durationMin: 7, distanceCm: 25, bodyArea: 'torso', bodyAreas: ['breast-chest'], eyesProtected: true, mode: 'nir' }, updatedAt: expect.any(Number) });
    expect(snapshot).toEqual({ ...before, deviceSessions: [session], lightDevices: [device] });
    const row = page.locator('[data-light-history-row][data-id="'+session.id+'"]');
    await expect(row).toContainText('NIR only'); await row.focus(); await page.keyboard.press('Enter');
    const detail = page.getByRole('dialog', { name: 'Device session details', exact: true }); await expect(detail).toBeVisible();
    await expect(detail).toContainText('NIR only');
    await detail.getByText('Modeled light signals', { exact: true }).click();
    await expect(detail.locator('.sun-detail-channel-row[data-channel="pbm_nir"]')).toBeVisible();
    await detail.screenshot({ path: test.info().outputPath('actual-device-detail-offline.png') });
    await detail.getByRole('button', { name: 'Edit mode', exact: true }).click();
    const modeEditor = page.getByRole('dialog', { name: 'Edit session mode', exact: true });
    await expect(modeEditor.locator('#dev-edit-mode')).toHaveValue('nir');
    await modeEditor.locator('#dev-edit-mode').selectOption('red');
    await modeEditor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modeEditor).not.toBeVisible();
    await expect.poll(async () => ((await page.evaluate(readComparisonAcceptanceProfile)) as ProfileData).deviceSessions?.[0]?.mode).toBe('red');
    snapshot = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    const revised = snapshot.deviceSessions![0]!;
    expect(revised).toMatchObject({ id: session.id, startedAt: session.startedAt, endedAt: session.endedAt, durationMin: 7, distanceCm: 25, bodyAreas: ['breast-chest'], eyesProtected: true, mode: 'red' });
    expect(Number(revised.doses?.pbm_red)).toBeGreaterThan(0);
    expect(Number(revised.doses?.pbm_nir)).toBeLessThan(Number(revised.doses?.pbm_red) * 1e-6);
    expect(snapshot).toEqual({ ...before, deviceSessions: [revised], lightDevices: [device] });
    await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); loading.push({ phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin) }); await openLight(cold);
      await expect(cold.locator('[data-light-history-row][data-id="'+session.id+'"]')).toContainText('Red only');
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(snapshot);
      if (launch === 1) {
        await cold.locator('[data-shell-action="open-settings"]').click(); await cold.locator('#settings-nav-data').click();
        const downloading = cold.waitForEvent('download'); await cold.locator('#backup-section').getByRole('button', { name: 'Download Backup', exact: true }).click();
        const backup = JSON.parse(await fs.readFile((await (await downloading).path())!, 'utf8')) as BackupSnapshot;
        expect(backup).toMatchObject({ format: 'labcharts-backup', encrypted: false }); expect(JSON.parse(backup.profiles.find(profile => profile.keys.imported)!.keys.imported!)).toEqual(snapshot);
      }
      await cold.close();
    }
    await test.info().attach('light-session-loading-observations', { body: JSON.stringify(loading, null, 2), contentType: 'application/json' });
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
