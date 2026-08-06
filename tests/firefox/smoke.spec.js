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

  // Exercise chat after demo loading and navigation have settled. Depending on
  // the delayed startup auto-open makes this assertion race with demo loading,
  // which can close the panel again before the check runs.
  const chatPanel = page.locator('#chat-panel');
  await page.evaluate(async () => (await import('/js/chat-panel.js')).openChatPanel());
  await expect(chatPanel).toHaveClass(/\bopen\b/);
  await page.evaluate(async () => (await import('/js/chat-panel.js')).closeChatPanel());
  await expect(chatPanel).not.toHaveClass(/\bopen\b/);
  // Firefox can race a delayed chat auto-open between the close assertion and
  // pointer hit testing. Dispatch the real delegated click without hit testing.
  await page.locator('[data-shell-action="open-settings"]').evaluate(button => button.click());
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
      '/css/import.css',
      '/css/settings.css',
      '/css/client-list.css',
      '/css/marker-detail-modal.css',
      '/css/light-sun.css',
      '/css/light-channels.css',
      '/css/light-devices.css',
      '/css/light-conditions-now.css',
      '/css/light-setup.css',
      '/css/light-tools.css',
      '/css/light-env.css',
      '/js/main.js',
      '/js/app-light-sun-modules.js',
      '/js/legal-consent-bootstrap.js',
      '/js/legal-consent.js',
      '/js/settings.js',
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
    { path: '/css/import.css', available: true },
    { path: '/css/settings.css', available: true },
    { path: '/css/client-list.css', available: true },
    { path: '/css/marker-detail-modal.css', available: true },
    { path: '/css/light-sun.css', available: true },
    { path: '/css/light-channels.css', available: true },
    { path: '/css/light-devices.css', available: true },
    { path: '/css/light-conditions-now.css', available: true },
    { path: '/css/light-setup.css', available: true },
    { path: '/css/light-tools.css', available: true },
    { path: '/css/light-env.css', available: true },
    { path: '/js/main.js', available: true },
    { path: '/js/app-light-sun-modules.js', available: true },
    { path: '/js/legal-consent-bootstrap.js', available: true },
    { path: '/js/legal-consent.js', available: true },
    { path: '/js/settings.js', available: true },
    { path: '/vendor/fonts/inter-400-7.woff2', available: true },
  ]);
  expect(cached.offline).toBe(true);
  // The delayed chat-onboarding panel can cover the header while the full app
  // shell finishes installing. Dispatch the same delegated shell action
  // directly so this check remains about offline first use, not panel timing.
  await page.locator('.settings-btn').evaluate(button => button.click());
  await expect(page.locator('#settings-modal-overlay')).toHaveClass(/\bshow\b/);
  await expect(page.locator('#settings-modal .settings-layout')).toHaveCSS('display', 'grid');
  await page.evaluate(async () => {
    (await import('/js/settings-loader.js')).closeSettingsModal();
    return (await import('/js/views.js')).navigate('light');
  });
  await expect(page.locator('.light-page')).toBeVisible();
  await expect(page.locator('.light-page')).toHaveCSS('display', 'grid');
  await expect(page.locator('link[data-light-sun-stylesheet]')).toHaveCount(7);
  await page.locator('#profile-selector .profile-compact-btn').click();
  await expect(page.locator('#client-list-overlay')).toHaveClass(/\bshow\b/);
  await expect(page.locator('#client-list-modal')).toHaveCSS('display', 'flex');
  await expect(page.locator('link[data-client-list-stylesheet]')).toHaveCount(1);
  await page.evaluate(async () => {
    (await import('/js/client-list.js')).closeClientList();
    void (await import('/js/cycle-import.js')).showCycleImportPreview({
      source: 'drip',
      sourceLabel: 'Drip',
      sourceFile: 'offline-cycle.csv',
      importId: 'offline-cycle',
      observations: [{
        date: '2026-07-01',
        bleeding: { value: 'light', excluded: false },
      }],
      periods: [{
        startDate: '2026-07-01',
        endDate: '2026-07-01',
        source: 'drip',
        importId: 'offline-cycle',
      }],
      warnings: [],
    });
  });
  await expect(page.locator('#import-modal-overlay')).toHaveClass(/\bshow\b/);
  await expect(page.locator('#import-modal .import-review-summary')).toHaveCSS('display', 'grid');
  await expect(page.locator('link[data-import-stylesheet]')).toHaveCount(1);
  await page.locator('.import-review-actions [data-cycle-import-action="close"]').click();
  await page.evaluate(async () => {
    const [{ state }, data, views] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/views.js'),
    ]);
    state.importedData = {
      ...state.importedData,
      entries: [{
        date: '2026-07-01',
        markers: { 'proteins.albumin': 42 },
      }],
    };
    data.invalidateActiveDataCache();
    await views.showDetailModal('proteins_albumin');
  });
  await expect(page.locator('#modal-overlay')).toHaveClass(/\bshow\b/);
  await expect(page.locator('#detail-modal')).toHaveClass(/\bmarker-detail-modal\b/);
  await expect(page.locator('#detail-modal')).toHaveCSS('padding-top', '0px');
  await expect(page.locator('link[data-marker-detail-stylesheet]')).toHaveCount(1);
  await page.evaluate(async () => (await import('/js/views.js')).closeModal());
  expect(pageErrors).toEqual([]);
});
