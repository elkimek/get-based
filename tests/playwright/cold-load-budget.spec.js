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

test('cold mobile app load stays within committed resource budgets', async ({ page }, testInfo) => {
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
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      policyScope: 'self-hosted-notice',
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
  const deferredChatCompositionModules = new Set([
    '/js/app-ai-interaction-modules.js',
    '/js/app-chat-hooks.js',
    '/js/chat.js',
    '/js/chat-panel.js',
    '/js/chat-send.js',
    '/js/chat-threads.js',
  ]);
  expect(entries.some(entry => (
    deferredChatCompositionModules.has(new URL(entry.name).pathname)
  ))).toBe(false);
  const deferredAIProviderModules = new Set([
    '/js/api-local.js',
    '/js/api-venice.js',
    '/js/api-openrouter.js',
    '/js/api-routstr.js',
    '/js/api-ppq.js',
    '/js/api-custom.js',
    '/js/api-openai-compatible.js',
  ]);
  expect(entries.some(entry => (
    deferredAIProviderModules.has(new URL(entry.name).pathname)
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
    '/js/wearables-google-health.js',
    '/js/wearables-google-health-auth.js',
    '/js/wearables-credential-vault.js',
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
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/light-today-ai.js'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/js/backup-cycle.js'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/data/mito-compounds.json'
  ))).toBe(false);
  expect(entries.some(entry => (
    new URL(entry.name).pathname === '/data/light-device-presets.json'
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
  const deferredLightSetupModules = new Set([
    '/js/sun-defaults.js',
    '/js/sun-defaults-model.js',
    '/js/sun-defaults-setup-renderer.js',
    '/js/sun-defaults-setup-ui.js',
  ]);
  expect(entries.some(entry => (
    deferredLightSetupModules.has(new URL(entry.name).pathname)
  ))).toBe(false);
  const deferredPrivacyModules = new Set([
    '/js/settings-runtime.js',
    '/js/settings-privacy.js',
    '/js/pii-review.js',
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
  const deferredLightCoreModules = new Set([
    '/js/app-light-sun-modules.js',
    '/js/light-channel-view.js',
    '/js/light-conditions-interpretation.js',
    '/js/light-conditions-now.js',
    '/js/light-conditions-renderer.js',
    '/js/light-devices.js',
    '/js/light-page-view.js',
    '/js/light-tools.js',
    '/js/sun-context.js',
    '/js/sun-session-ui.js',
    '/js/sun-spectrum-actions.js',
    '/js/sun-spectrum-device.js',
    '/js/sun-spectrum.js',
    '/js/sun.js',
  ]);
  const eagerlyLoadedLightCoreModules = entries
    .map(entry => new URL(entry.name).pathname)
    .filter(pathname => deferredLightCoreModules.has(pathname));
  expect(eagerlyLoadedLightCoreModules).toEqual([]);
  const deferredHealthDataModules = new Set([
    '/js/app-health-data-modules.js',
    '/js/charts.js',
    '/js/notes.js',
    '/js/supplements.js',
    '/js/recommendations.js',
    '/js/cycle.js',
    '/js/context-cards.js',
    '/js/dna.js',
  ]);
  const eagerlyLoadedHealthDataModules = entries
    .map(entry => new URL(entry.name).pathname)
    .filter(pathname => deferredHealthDataModules.has(pathname));
  expect(eagerlyLoadedHealthDataModules).toEqual([]);
  const metrics = summarizeColdLoad(entries, appOrigin);
  await testInfo.attach('cold-load-resources', { body: JSON.stringify(entries, null, 2), contentType: 'application/json' });

  console.log(`Cold-load budget: ${formatColdLoadSummary(metrics)}`);
  console.log(`Cold-load metrics: ${JSON.stringify(metrics)}`);
  expect(() => enforceColdLoadBudget(metrics, budget)).not.toThrow();
});

test('first data-backed Dashboard loads Health and Data once without duplicate mobile tabs', async ({ page }) => {
  const requestedPaths = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === appOrigin) requestedPaths.push(url.pathname);
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === appOrigin) {
      await route.continue();
      return;
    }
    await route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      policyScope: 'self-hosted-notice',
      acceptedAt: '2026-07-23T00:00:00.000Z',
      appVersion: 'health-data-lazy-load',
      location: 'health-data-lazy-load',
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
  for (const pathname of [
    '/js/context-cards.js',
    '/js/recommendations.js',
    '/js/dna.js',
  ]) {
    expect(requestedPaths).not.toContain(pathname);
  }

  await page.evaluate(async () => {
    const [{ state }, data, views] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/views.js'),
    ]);
    state.importedData = await (await fetch('/data/demo-male.json')).json();
    state.profileSex = 'male';
    data.invalidateActiveDataCache();
    await views.navigate('dashboard');
  });

  await expect(page.locator('.m-shell')).toBeVisible();
  await expect(page.locator('.m-tab')).toHaveCount(5);
  await expect(page.locator('#mobile-bottom-tabs')).toHaveCount(0);
  for (const pathname of [
    '/js/context-cards.js',
    '/js/recommendations.js',
    '/js/dna.js',
  ]) {
    expect(requestedPaths.filter(requested => requested === pathname)).toHaveLength(1);
  }

  await page.evaluate(async () => {
    const views = await import('/js/views.js');
    await views.navigate('labs');
    await views.navigate('dashboard');
  });
  await expect(page.locator('.m-shell')).toBeVisible();
  await expect(page.locator('.m-tab')).toHaveCount(5);
  await expect(page.locator('#mobile-bottom-tabs')).toHaveCount(0);
  for (const pathname of [
    '/js/context-cards.js',
    '/js/recommendations.js',
    '/js/dna.js',
  ]) {
    expect(requestedPaths.filter(requested => requested === pathname)).toHaveLength(1);
  }
});

test('first Chat action loads the composition once and opens the panel', async ({ page }) => {
  const requestedPaths = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === appOrigin) requestedPaths.push(url.pathname);
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === appOrigin) {
      await route.continue();
      return;
    }
    await route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      policyScope: 'self-hosted-notice',
      acceptedAt: '2026-07-23T00:00:00.000Z',
      appVersion: 'chat-lazy-load',
      location: 'chat-lazy-load',
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
  expect(requestedPaths).not.toContain('/js/app-ai-interaction-modules.js');

  await page.getByRole('button', { name: 'Start guided chat' }).click();
  await expect(page.locator('#chat-panel')).toHaveClass(/\bopen\b/);
  await expect.poll(() => page.evaluate(async () => (
    await import('/js/chat-loader.js')
  ).isChatModuleLoaded())).toBe(true);
  await expect.poll(() => requestedPaths.filter(
    pathname => pathname === '/js/app-ai-interaction-modules.js',
  ).length).toBe(1);
  await expect(page.locator('link[data-chat-presentation-stylesheet="composer"]')).toHaveCount(1);

  await page.evaluate(async () => {
    const chat = await import('/js/chat-loader.js');
    chat.closeChatPanel();
    await chat.openChatPanel();
  });
  await expect(page.locator('#chat-panel')).toHaveClass(/\bopen\b/);
  expect(requestedPaths.filter(
    pathname => pathname === '/js/app-ai-interaction-modules.js',
  )).toHaveLength(1);
});

test('first Light route loads the feature once and renders end to end', async ({ page }) => {
  const requestedPaths = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === appOrigin) requestedPaths.push(url.pathname);
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === appOrigin) {
      await route.continue();
      return;
    }
    await route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      policyScope: 'self-hosted-notice',
      acceptedAt: '2026-07-23T00:00:00.000Z',
      appVersion: 'light-lazy-load',
      location: 'light-lazy-load',
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
  expect(requestedPaths).not.toContain('/js/app-light-sun-modules.js');

  await page.evaluate(async () => {
    const views = await import('/js/views.js');
    await views.navigate('light');
  });
  await expect(page.locator('.light-page')).toHaveClass(/\bis-ready\b/);
  await expect(page.getByRole('heading', { name: 'Light & Sun' })).toBeVisible();
  expect(requestedPaths.filter(
    pathname => pathname === '/js/app-light-sun-modules.js',
  )).toHaveLength(1);
  await expect(page.locator('link[data-light-sun-stylesheet]')).toHaveCount(7);

  await page.evaluate(async () => {
    const views = await import('/js/views.js');
    await views.navigate('dashboard');
    await views.navigate('light');
  });
  await expect(page.locator('.light-page')).toHaveClass(/\bis-ready\b/);
  expect(requestedPaths.filter(
    pathname => pathname === '/js/app-light-sun-modules.js',
  )).toHaveLength(1);
  await expect(page.locator('link[data-light-sun-stylesheet]')).toHaveCount(7);
});

test('startup loads Light presets only when persisted devices need hydration', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      policyScope: 'self-hosted-notice',
      acceptedAt: '2026-07-23T00:00:00.000Z',
      appVersion: 'light-device-hydration',
      location: 'light-device-hydration',
    }));
    localStorage.setItem('labcharts-default-onboarded', 'profile-set');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-default-ai-reminder-dismissed', '1');
    localStorage.setItem('labcharts-onboard-extras-done-default', '1');
    localStorage.setItem('labcharts-onboard-provider-skipped-default', '1');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
  });

  await page.goto('/app', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const [{ state }, { saveImportedData }] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
    ]);
    state.importedData.lightDevices = [{
      id: 'legacy-maxi-uvb',
      presetId: 'mitochondriak-maxi-uvb',
      brand: 'Mitochondriak',
      model: 'Maxi UVB',
      type: 'uvb',
      peakWavelengths: [295, 380, 480, 630, 670, 760, 810, 830, 850],
      channels: ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'pbm_red', 'pbm_nir'],
    }];
    await saveImportedData({ immediate: true });
  });

  let presetRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/data/light-device-presets.json') {
      presetRequests += 1;
    }
  });
  await page.reload({ waitUntil: 'networkidle' });

  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const device = state.importedData.lightDevices
      .find(candidate => candidate.id === 'legacy-maxi-uvb');
    return {
      modes: device?.modes?.map(mode => mode.id) || [],
      channelGroups: device?.channelGroups?.map(group => group.id) || [],
      coupling: device?.coupling?.length || 0,
    };
  })).toEqual({
    modes: ['red-nir-only', 'all-on', 'uva-blue-red-nir', 'uvb-red-nir', 'uva-blue-only', 'uvb-only'],
    channelGroups: ['uvb', 'uva-blue', 'red-nir'],
    coupling: 0,
  });
  expect(presetRequests).toBe(1);
});
