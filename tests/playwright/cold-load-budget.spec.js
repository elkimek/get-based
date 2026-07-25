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
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/css/data-protection.css'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/css/context-editor.css'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/css/import.css'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/css/client-list.css'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/client-list-impl.js'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/wearables.js'
  ))).toBe(false);
  const deferredWearableConnectionModules = new Set([
    '/js/wearables-connect.js',
    '/js/wearables-oura.js',
    '/js/wearables-oura-auth.js',
    '/js/wearables-whoop.js',
    '/js/wearables-whoop-auth.js',
    '/js/wearables-fitbit.js',
    '/js/wearables-fitbit-auth.js',
    '/js/wearables-withings.js',
    '/js/wearables-withings-auth.js',
    '/js/wearables-ultrahuman.js',
    '/js/wearables-ultrahuman-auth.js',
    '/js/wearables-polar.js',
    '/js/wearables-polar-auth.js',
  ]);
  expect(entries.some(entry => (
    deferredWearableConnectionModules.has(new URL(entry.name).pathname)
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/light-tool-camera-modals.js'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/export-import.js'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/export-report-builder.js'
  ))).toBe(false);
  const deferredExportFacadeModules = new Set([
    '/js/export.js',
    '/js/export-report.js',
    '/js/export-report-html.js',
  ]);
  expect(entries.some(entry => (
    deferredExportFacadeModules.has(new URL(entry.name).pathname)
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/context-card-lifestyle-editors-impl.js'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/context-card-medical-history-editor-impl.js'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/context-card-dashboard-ai-impl.js'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/changelog-impl.js'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/settings-sync-panel-impl.js'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/cashu-wallet.js'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/cashu-wallet-store.js'
  ))).toBe(false);
  const deferredKnowledgeBaseUiModules = new Set([
    '/js/lens-actions.js',
    '/js/lens-knowledge-base-ui.js',
    '/js/lens-library.js',
  ]);
  expect(entries.some(entry => (
    deferredKnowledgeBaseUiModules.has(new URL(entry.name).pathname)
  ))).toBe(false);
  const deferredCycleImportModules = new Set([
    '/js/cycle-import.js',
    '/js/cycle-import-adapters.js',
    '/js/cycle-import-file.js',
  ]);
  expect(entries.some(entry => (
    deferredCycleImportModules.has(new URL(entry.name).pathname)
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/pdf-import-marker-mapping.js'
  ))).toBe(false);
  const deferredLightEnvironmentUiModules = new Set([
    '/js/light-env.js',
    '/js/light-env-actions.js',
    '/js/light-env-audits.js',
    '/js/light-env-screen-ui.js',
  ]);
  expect(entries.some(entry => (
    deferredLightEnvironmentUiModules.has(new URL(entry.name).pathname)
  ))).toBe(false);
  const deferredLightDeviceModalModules = new Set([
    '/js/light-device-setup-modal.js',
    '/js/light-device-session-modal.js',
  ]);
  expect(entries.some(entry => (
    deferredLightDeviceModalModules.has(new URL(entry.name).pathname)
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/sun-defaults.js'
  ))).toBe(false);
  const deferredPrivacyModules = new Set([
    '/js/settings-runtime.js',
    '/js/settings-privacy.js',
    '/js/pii.js',
  ]);
  expect(entries.some(entry => (
    deferredPrivacyModules.has(new URL(entry.name).pathname)
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/css/marker-detail-modal.css'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/css/emf.css'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/css/genetics.css'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/css/category-views.css'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/css/wearables.css'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/css/cycle.css'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/themes-extra.css'
  ))).toBe(false);
  const deferredChatStylesheets = new Set([
    '/css/chat-panel-open.css',
    '/css/chat-personality.css',
    '/css/chat-messages.css',
    '/css/chat-composer.css',
    '/css/chat-onboarding.css',
    '/css/chat-responsive.css',
    '/css/chat-actions.css',
    '/css/chat-mobile.css',
    '/css/chat-redesign-open.css',
  ]);
  expect(entries.some(entry => (
    deferredChatStylesheets.has(new URL(entry.name).pathname)
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
