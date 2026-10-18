import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, expect, test } from '@playwright/test';

import {
  enforceColdLoadBudget,
} from '../../scripts/cold-load-budget.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const budget = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'scripts', 'cold-load-budget.json'), 'utf8'),
) as unknown as NonNullable<Parameters<typeof enforceColdLoadBudget>[1]> & {route?: unknown};
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

test('first data-backed Dashboard loads Health and Data once without duplicate mobile tabs', async ({ page }) => {
  const requestedPaths: unknown[] = [];
  page.on('request', (request) => {
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

  await page.goto(budget.route as string, { waitUntil: 'networkidle', timeout: 30_000 });
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
  const requestedPaths: unknown[] = [];
  page.on('request', (request) => {
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

  await page.goto(budget.route as string, { waitUntil: 'networkidle', timeout: 30_000 });
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
  const requestedPaths: unknown[] = [];
  page.on('request', (request) => {
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

  await page.goto(budget.route as string, { waitUntil: 'networkidle', timeout: 30_000 });
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
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/data/light-device-presets.json') {
      presetRequests += 1;
    }
  });
  await page.reload({ waitUntil: 'networkidle' });

  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const device: {modes?: unknown; channelGroups?: unknown; coupling?: {length?: unknown}} | undefined = (state.importedData.lightDevices! as Array<{id?: unknown; modes?: unknown; channelGroups?: unknown; coupling?: {length?: unknown}}>)
      .find(candidate => candidate.id === 'legacy-maxi-uvb');
    return {
      modes: (device?.modes as Array<{id?: unknown}> | null | undefined)?.map(mode => mode.id) || [],
      channelGroups: (device?.channelGroups as Array<{id?: unknown}> | null | undefined)?.map(group => group.id) || [],
      coupling: device?.coupling?.length || 0,
    };
  })).toEqual({
    modes: ['red-nir-only', 'all-on', 'uva-blue-red-nir', 'uvb-red-nir', 'uva-blue-only', 'uvb-only'],
    channelGroups: ['uvb', 'uva-blue', 'red-nir'],
    coupling: 0,
  });
  expect(presetRequests).toBe(1);
});
