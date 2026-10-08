import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createDefaultProfileData } from '../../js/profile.js';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';
import type { ProfileData } from '../../types/app-state.js';

function seed({ defaults, now }: { defaults: ProfileData; now: number }) {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  localStorage.setItem('labcharts-ai-paused', 'true');
  if (localStorage.getItem('environment-ai-seeded')) return;
  localStorage.setItem('environment-ai-seeded', '1');
  localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'default', name: 'Ada', sex: 'male', dob: '1990-01-01', createdAt: 1 }]));
  localStorage.setItem('labcharts-active-profile', 'default');
  for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
  const verdict = (name: string) => ({ status: 'ok', dot: 'green', tip: `${name} <literal>`, detail: `${name} detail & retained.` });
  const room = { id: 'cached-room', name: 'Bedroom', primarySource: 'led-warm', hoursOccupiedPerDay: 8, daylightLevel: 'moderate', aiAnalysis: verdict('Room') };
  const screen = { id: 'cached-screen', roomId: room.id, device: 'phone', hoursPerDay: 2, eveningUseAfterSunset: 1, blueBlockerEnabled: true, aiAnalysis: verdict('Screen') };
  const measurement = { id: 'cached-measurement', roomId: room.id, tool: 'lux', value: 250, capturedAt: now, source: 'manual', confidence: 1, aiAnalysis: verdict('Measurement') };
  const audit = { id: 'cached-audit', date: new Date(now).toISOString().slice(0, 10), label: 'Saved snapshot', rooms: [room], screens: [screen], measurements: [measurement], createdAt: now, aiAnalysis: verdict('Audit') };
  localStorage.setItem('labcharts-default-imported', JSON.stringify({
    ...defaults, contextNotes: 'Keep unrelated environment context',
    sunDefaults: { fitzpatrick: 'II', completedAt: 1 },
    lightEnvironment: { rooms: [room], screens: [screen] }, lightMeasurements: [measurement], lightAudits: [audit],
  }));
}
async function inspect(page: Page) {
  await openLight(page);
  await page.locator('[data-light-env-action="open-assessment"]').click();
  const dialog = page.getByRole('dialog', { name: 'Indoor Light Assessment', exact: true });
  const room = dialog.locator('.light-env-room-disclosure[data-id="cached-room"]');
  const roomToggle = room.locator('[data-light-env-action="toggle-room-expanded"]');
  if (await roomToggle.getAttribute('aria-expanded') !== 'true') await roomToggle.click();
  await expect(roomToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(room.locator('.light-env-room-ai[data-light-environment-ai] .light-env-room-ai-tip')).toHaveText('✓ Room <literal>');
  await expect(room.locator('.light-env-reading-ai[data-light-environment-ai] .sun-session-ai-tip')).toHaveText('✓ Measurement <literal>');
  const screen = room.locator('.light-env-screen-card[data-id="cached-screen"]');
  const screenToggle = screen.locator('[data-light-env-action="toggle-screen-expanded"]');
  if (await screenToggle.getAttribute('aria-expanded') !== 'true') await screenToggle.click();
  await expect(screenToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(screen.locator('.light-env-screen-ai[data-light-environment-ai] .sun-detail-ai-tip')).toHaveText('✓ Screen <literal>');
  await expect(screen.locator('.light-env-screen-ai .sun-detail-ai-body')).toHaveText('Screen detail & retained.');
  const audits = dialog.locator('[data-light-env-action="set-audits-block-open"]');
  if (await audits.getAttribute('open') === null) await audits.locator(':scope > summary').click();
  await expect(audits).toHaveAttribute('open', '');
  const audit = dialog.locator('.light-audit-card[data-id="cached-audit"]');
  const auditToggle = audit.locator('[data-light-env-action="toggle-audit"]');
  if (await auditToggle.getAttribute('aria-expanded') !== 'true') await auditToggle.click();
  await expect(auditToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(audit.locator('.light-audit-ai[data-light-environment-ai] .sun-detail-ai-tip')).toHaveText('✓ Audit <literal>');
  await expect(audit.locator('.light-audit-ai .sun-detail-ai-body')).toHaveText('Audit detail & retained.');
  await expect(dialog.locator('[data-light-environment-ai] img, [data-light-environment-ai] script')).toHaveCount(0);
  for (const button of await dialog.locator('[data-light-environment-ai] button').all()) {
    await expect(button).toHaveAttribute('data-ai-owner', /^verdict-\d+:control$/);
  }
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
test('static cached environment verdicts open first offline and preserve the full profile over two cold launches', async ({ page, context }) => {
  test.setTimeout(120000);
  await installDiscussionFixture(context); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(seed, { defaults: createDefaultProfileData(), now: Date.now() });
  const errors: string[] = [], csp: string[] = [];
  const observe = (p: Page) => p.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.exposeBinding('environmentAICsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as { environmentAICsp(value: string): Promise<void> }).environmentAICsp(event.violatedDirective);
  }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading = [{ phase: 'initial-online', readyMs: await ready(page, server.origin) }];
    const before = await page.evaluate(readComparisonAcceptanceProfile); server.state.offline = true;
    await inspect(page); expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage();
      loading.push({ phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin) });
      await inspect(cold); expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before); await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
    await fs.writeFile(test.info().outputPath('environment-ai-loading.json'), JSON.stringify(loading, null, 2));
  } finally { await server.close(); }
});
