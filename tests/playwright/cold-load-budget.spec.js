import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, expect, test } from '@playwright/test';

import {
  enforceColdLoadBudget,
  formatColdLoadSummary,
  summarizeColdLoad,
} from '../../scripts/cold-load-budget.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const budget = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'scripts', 'cold-load-budget.json'), 'utf8'),
);
const port = process.env.PORT || '8000';
const appOrigin = `http://127.0.0.1:${port}`;
const mobile = devices['Pixel 5'];

test.use({
  viewport: mobile.viewport,
  userAgent: mobile.userAgent,
  deviceScaleFactor: mobile.deviceScaleFactor,
  isMobile: mobile.isMobile,
  hasTouch: mobile.hasTouch,
  serviceWorkers: 'block',
});

test('cold mobile app load stays within committed resource budgets', async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === appOrigin) {
      await route.continue();
      return;
    }
    await route.abort();
  });

  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(2000);
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-06-22',
      privacyVersion: '2026-06-22',
      acceptedAt: '2026-07-23T00:00:00.000Z',
      appVersion: 'cold-load-budget',
      location: 'cold-load-budget',
    }));
    localStorage.setItem('labcharts-default-onboarded', 'profile-set');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-default-ai-reminder-dismissed', '1');
    localStorage.setItem('labcharts-onboard-extras-done-default', '1');
    localStorage.setItem('labcharts-onboard-provider-skipped-default', '1');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
  });

  await page.goto(budget.route, { waitUntil: 'networkidle', timeout: 30_000 });
  await expect(page.locator('#main-content')).toBeVisible();

  const entries = await page.evaluate(() => [
    ...performance.getEntriesByType('navigation'),
    ...performance.getEntriesByType('resource'),
  ].map(entry => ({
    name: entry.name,
    transferSize: entry.transferSize,
    decodedBodySize: entry.decodedBodySize,
  })));
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/css/settings.css'
  ))).toBe(false);
  const deferredLightStylesheets = new Set([
    '/css/light-sun.css',
    '/css/light-channels.css',
    '/css/light-devices.css',
    '/css/light-conditions-now.css',
    '/css/light-setup.css',
    '/css/light-tools.css',
    '/css/light-env.css',
  ]);
  expect(entries.some(entry => (
    deferredLightStylesheets.has(new URL(entry.name).pathname)
  ))).toBe(false);
  const metrics = summarizeColdLoad(entries, appOrigin);

  console.log(`Cold-load budget: ${formatColdLoadSummary(metrics)}`);
  console.log(`Cold-load metrics: ${JSON.stringify(metrics)}`);
  expect(() => enforceColdLoadBudget(metrics, budget)).not.toThrow();
});
