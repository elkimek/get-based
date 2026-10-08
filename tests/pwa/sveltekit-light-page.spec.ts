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

test('static Light route retains offline first use, past-session persistence, disclosures, cold launches and backup', async ({ page, context }) => {
  test.setTimeout(120000);
  await installOfflineStartupDiagnostics(context);
  await installDiscussionFixture(context);
  // Exercise the real offline controls without automatic provider requests
  // changing analysis caches; AI integration has separate acceptance.
  await context.addInitScript(() => {
    if (['http:', 'https:'].includes(location.protocol)) localStorage.setItem('labcharts-ai-paused', 'true');
  });
  await context.addInitScript(seedLightPageFixture, { defaults: createDefaultProfileData() });
  const errors: string[] = [], csp: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.exposeBinding('lightCsp', (_, value: string) => { csp.push(value); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as { lightCsp(value: string): Promise<void> }).lightCsp(event.violatedDirective);
  }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading = [{ phase: 'initial-online', readyMs: await ready(page, server.origin) }];
    const before = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    server.state.offline = true;
    expect(await page.evaluate(async () => Promise.all(['/er.svg', '/er-mask.png'].map(async url => !!await caches.match(url))))).toEqual([true, true]);
    await openLight(page);
    await page.locator('.lens-page-header').scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('light-route-offline.png') });
    const methods = page.locator('.light-explainer');
    await expect(methods).not.toHaveAttribute('open');
    await methods.locator('summary').focus(); await page.keyboard.press('Enter');
    await expect(methods).toHaveAttribute('open', '');
    await expect(methods).toContainText('never stay longer just to raise an estimate');
    await expect(methods.locator('a[target="_blank"]')).toHaveCount(6);
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
    await page.getByRole('button', { name: 'Log past session', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Past session log', exact: true });
    await expect(dialog).toBeVisible();
    // Decode the actual local artwork offline; a rendered SVG wrapper alone
    // can conceal a missing illustration or mask in some engines.
    expect(await page.evaluate(async () => Promise.all(['/er.svg', '/er-mask.png'].map(async url => {
      const image = new Image(); image.src = url; await image.decode();
      return image.naturalWidth > 0 && image.naturalHeight > 0;
    })))).toEqual([true, true]);
    await dialog.locator('#det-spf').fill('12');
    await dialog.locator('label.toggle-switch').click();
    await expect(dialog.locator('#det-glass')).toBeChecked();
    await dialog.locator('#det-notes').fill('Offline session <literal> & retained.');
    await dialog.screenshot({ path: test.info().outputPath('actual-past-session-offline.png') });
    await dialog.getByRole('button', { name: 'Save session', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const snapshot = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    expect(snapshot.sunSessions).toHaveLength(1);
    const session = snapshot.sunSessions![0]!;
    expect(session).toMatchObject({
      id: expect.stringMatching(/^sun_/), location: null, calculationStatus: 'needs-location', durationMin: 15,
      bodyExposure: { preset: 'covered', fraction: 0, regions: [], sunscreenSPF: 12, glassBetween: true },
      eyeExposure: { mode: 'glass-window', lensTint: 'clear', durationSec: 900 },
      posture: 'standing', surfaceAlbedo: 'grass', notes: 'Offline session <literal> & retained.',
      atmosphere: null, doses: null, safety: null, exposureSegments: [], accumulatedPausedMs: 0,
    });
    expect(session.endedAt! - session.startedAt).toBe(900000);
    expect(snapshot).toEqual({ ...before, sunSessions: [session] });
    await expect(page.locator('.light-summary-tally')).not.toBeAttached();
    const savedRow = page.locator('[data-light-history-row][data-sun-session-id="'+session.id+'"]');
    await savedRow.focus(); await page.keyboard.press('Enter');
    const detail = page.getByRole('dialog', { name: 'Sun session details', exact: true });
    await expect(detail).toBeVisible(); await expect(detail.locator('[data-sun-session-action="retry-calculation"]')).toBeVisible();
    await expect(detail).toContainText('Offline session <literal> & retained.');
    await detail.getByText('Conditions and model inputs', { exact: true }).click();
    await expect(detail).toContainText('Location not recorded');
    await detail.screenshot({ path: test.info().outputPath('actual-sun-detail-offline.png') });
    await detail.getByRole('button', { name: 'Close', exact: true }).click();
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(snapshot);
    await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage();
      loading.push({ phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin) });
      await openLight(cold);
      await expect(cold.locator('[data-light-page-action="open-detailed-session"]')).toBeVisible();
      await expect(cold.locator('.light-summary-tally')).not.toBeAttached();
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(snapshot);
      if (launch === 1) {
        await cold.locator('[data-shell-action="open-settings"]').click(); await cold.locator('#settings-nav-data').click();
        const downloading = cold.waitForEvent('download');
        await cold.locator('#backup-section').getByRole('button', { name: 'Download Backup', exact: true }).click();
        const backup = JSON.parse(await fs.readFile((await (await downloading).path())!, 'utf8')) as BackupSnapshot;
        expect(backup).toMatchObject({ format: 'labcharts-backup', encrypted: false });
        expect(JSON.parse(backup.profiles.find(profile => profile.keys.imported)!.keys.imported!)).toEqual(snapshot);
      }
      await cold.close();
    }
    await test.info().attach('light-loading-observations', { body: JSON.stringify(loading, null, 2), contentType: 'application/json' });
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
