import { expect, test } from '../playwright/coverage-fixture.js';

test.use({ serviceWorkers: 'allow' });

async function openApp(page, path = '/app') {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
  });
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForFunction(async () => {
    const { state } = await import('/js/state.js');
    return !!state && !!document.getElementById('main-content');
  });
  await page.evaluate(async () => {
    localStorage.setItem('labcharts-changelog-seen', window.APP_VERSION || 'test');
    window.endTour?.();
    (await import('/js/chat-panel.js')).closeChatPanel();
    document.getElementById('tour-overlay')?.remove();
    document.getElementById('tour-spotlight')?.remove();
    document.getElementById('tour-tooltip')?.remove();
    (await import('/js/changelog.js')).closeChangelog();
  });
  return pageErrors;
}

test('loads demo data and supports core navigation and settings', async ({ browserName, page }) => {
  expect(browserName).toBe('firefox');
  const pageErrors = await openApp(page);

  await page.evaluate(async () => {
    await (await import('/js/export.js')).loadDemoData('female');
  });
  await page.waitForFunction(async () => {
    const [{ state }, { getProfiles }] = await Promise.all([
      import('/js/state.js'),
      import('/js/profile.js'),
    ]);
    const profile = getProfiles().find(item => item.id === state.currentProfile);
    return profile?.name === 'Demo Sarah' && state.importedData?.entries?.length > 0;
  }, null, { timeout: 30_000 });

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const profileId = state.currentProfile;
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
    window.endTour?.();
    document.getElementById('tour-overlay')?.remove();
    document.getElementById('tour-spotlight')?.remove();
    document.getElementById('tour-tooltip')?.remove();
  });

  await page.locator('#sidebar-nav .nav-item[data-category="labs"]').click();
  await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.currentView)).toBe('labs');
  await expect(page.locator('.lens-page-widgets[data-lens-route="labs"]')).toBeVisible();

  // A returning user with no chat history gets the onboarding panel after a
  // short startup delay. Wait for that task before closing so it cannot race
  // the Settings assertions below.
  const chatPanel = page.locator('#chat-panel');
  await expect(chatPanel).toHaveClass(/\bopen\b/);
  await page.evaluate(async () => (await import('/js/chat-panel.js')).closeChatPanel());
  await expect(chatPanel).not.toHaveClass(/\bopen\b/);
  await page.locator('.settings-btn').click();
  await expect(page.locator('#settings-modal-overlay')).toHaveClass(/\bshow\b/);
  await page.locator('[data-settings-tab="privacy"]').click();
  await expect(page.locator('[data-tab-panel="privacy"]')).toHaveClass(/\bactive\b/);
  expect(pageErrors).toEqual([]);
});

test('round-trips a profile through browser JSON APIs', async ({ browserName, page }) => {
  expect(browserName).toBe('firefox');
  const pageErrors = await openApp(page);

  const result = await page.evaluate(async () => {
    const [{ state }, dataModule, exportModule, profileModule] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/export.js'),
      import('/js/profile.js'),
    ]);
    const demo = await fetch('/data/demo-male.json', { cache: 'no-store' }).then(response => response.json());
    state.importedData = demo;
    state.profileSex = 'male';
    state.profileDob = '1987-11-22';
    await dataModule.saveImportedData();

    const exported = await exportModule.buildClientExportObject(state.currentProfile, false);
    exported.profile.name = 'Firefox Round Trip';
    const sampleEntry = exported.entries.find(entry => entry?.date && Object.keys(entry.markers || {}).length > 0);
    const sampleKey = Object.keys(sampleEntry?.markers || {})[0] || '';
    const sampleValue = sampleEntry?.markers?.[sampleKey];

    const file = new File([JSON.stringify(exported)], 'firefox-smoke.json', {
      type: 'application/json',
    });
    await exportModule.importDataJSON(file);

    const importedEntry = state.importedData.entries.find(entry => entry.date === sampleEntry?.date);
    const activeProfile = profileModule.getProfiles().find(profile => profile.id === state.currentProfile);
    return {
      exportVersion: exported.version,
      exportedEntries: exported.entries.length,
      importedEntries: state.importedData.entries.length,
      importedProfileName: activeProfile?.name || '',
      sampleValue,
      importedSampleValue: importedEntry?.markers?.[sampleKey],
      fileReaderAvailable: typeof FileReader === 'function',
    };
  });

  expect(result).toMatchObject({
    exportVersion: 2,
    importedProfileName: 'Firefox Round Trip',
    fileReaderAvailable: true,
  });
  expect(result.exportedEntries).toBeGreaterThan(0);
  expect(result.importedEntries).toBeGreaterThan(0);
  expect(result.importedSampleValue).toEqual(result.sampleValue);
  expect(pageErrors).toEqual([]);
});

test('installs a readable app shell for offline use', async ({ browserName, context, page }) => {
  expect(browserName).toBe('firefox');
  const pageErrors = await openApp(page, '/app?dev-sw=1');

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await Promise.race([
      new Promise(resolve => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('service worker did not claim the app')), 20_000);
      }),
    ]);
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  const cached = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const appCacheName = cacheNames.find(name => name.startsWith('labcharts-v')) || '';
    const appCache = await caches.open(appCacheName);
    const requiredPaths = [
      '/index.html',
      '/styles.css',
      '/js/main.js',
      '/js/legal-consent.js',
      '/vendor/fonts/inter-400-7.woff2',
    ];
    const entries = await Promise.all(requiredPaths.map(async path => {
      const response = await appCache.match(path);
      return { path, available: !!response && response.ok };
    }));
    return {
      appCacheName,
      entries,
      offline: navigator.onLine === false,
    };
  });

  expect(cached.appCacheName).toContain('labcharts-v');
  expect(cached.entries).toEqual([
    { path: '/index.html', available: true },
    { path: '/styles.css', available: true },
    { path: '/js/main.js', available: true },
    { path: '/js/legal-consent.js', available: true },
    { path: '/vendor/fonts/inter-400-7.woff2', available: true },
  ]);
  expect(cached.offline).toBe(true);
  expect(pageErrors).toEqual([]);
});
