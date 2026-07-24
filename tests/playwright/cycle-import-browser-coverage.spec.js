import { expect, test } from './coverage-fixture.js';

const DRIP_CSV = [
  'date,temperature.value,temperature.exclude,bleeding.value,bleeding.exclude,note.value,pain.cramps,mood.fatigue',
  '2026-04-01,36.55,false,1,false,start,true,true',
  '2026-04-02,36.62,false,3,false,heavy,false,false',
  '2026-04-03,36.68,false,2,true,excluded,false,false',
  '2026-05-01,36.48,false,2,false,next,false,false',
].join('\n');

const NATURAL_CYCLES_CSV = [
  'Date;Temperature;Fertility Status;Period;Period Flow;Spotting;LH test;Cervical Mucus;Symptoms;Notes;Cramps',
  '2026-05-01;36,40;Red;true;light;false;negative;dry;Fatigue;start;true',
  '2026-05-02;36,44;Red;true;heavy;false;;;Headache;heavy day;false',
  '2026-05-10;36,70;Red;false;;true;positive;egg white;;spotting;false',
  '2026-05-14;36,78;Green;false;;false;positive;sticky;;ovulation;false',
  '2026-06-01;36,42;Red;true;medium;false;;;;next period;false',
].join('\n');

const CLUE_JSON = JSON.stringify({
  data: [
    { day: '2026-07-01T00:00:00.000Z', period: 'light', pain: ['cramps'], temperature: 36.41 },
    { day: '2026-07-02T00:00:00.000Z', period: 'heavy', pain: ['headache'], energy: ['exhausted'] },
    { day: '2026-07-11T00:00:00.000Z', period: 'spotting' },
    { day: '2026-07-14T00:00:00.000Z', cervical_fluid: 'egg_white', ovulation_test: 'positive' },
    { day: '2026-08-01T00:00:00.000Z', period: 'medium' },
  ],
});

const APPLE_HEALTH_CYCLE_XML = `<HealthData>
  <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" unit="ms" sourceName="Watch" startDate="2026-03-01 01:00:00 +0000" value="47" />
  <Record type="HKQuantityTypeIdentifierRestingHeartRate" unit="count/min" sourceName="Watch" startDate="2026-03-01 07:00:00 +0000" value="58" />
  <Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" sourceName="Scale" startDate="2026-03-01 08:00:00 +0000" value="68.5" />
  <Record type="HKCategoryTypeIdentifierMenstrualFlow" value="HKCategoryValueMenstrualFlowLight" startDate="2026-03-01 08:00:00 +0000" />
  <Record type="HKCategoryTypeIdentifierMenstrualFlow" value="HKCategoryValueMenstrualFlowHeavy" startDate="2026-03-02 08:00:00 +0000" />
</HealthData>`;

async function initializeCycleProfile(page, prefix) {
  return page.evaluate(async (profilePrefix) => {
    const [{ state }, { createDefaultProfileData }, { deleteCycleDB }] = await Promise.all([
      import('/js/state.js'),
      import('/js/profile.js'),
      import('/js/cycle-store.js'),
    ]);
    const id = `${profilePrefix}_${Date.now()}`;
    await deleteCycleDB(id).catch(() => {});
    state.currentProfile = id;
    state.importedData = createDefaultProfileData();
    state.profileSex = null;
    state.profiles = [{ id, name: 'Cycle Import Browser', sex: null }];
    localStorage.setItem('labcharts-active-profile', id);
    localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));
    localStorage.removeItem('labcharts-encryption-enabled');
    return id;
  }, prefix);
}

test('Drip CSV import previews, commits, and opens cycle history', async ({ page }, testInfo) => {
  await page.goto('/app', { waitUntil: 'load' });

  const profileId = await initializeCycleProfile(page, 'cycle_import_browser');
  await expect(page.locator('link[data-import-stylesheet]')).toHaveCount(0);
  await page.evaluate(async () => (await import('/js/views.js')).navigate('labs'));
  await expect(page.locator('#drop-zone')).toBeVisible();
  await expect(page.locator('#drop-zone')).toHaveCSS('border-top-style', 'dashed');

  await page.locator('#pdf-input').setInputFiles({
    name: 'drip-export.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(DRIP_CSV),
  });

  const preview = page.locator('#import-modal-overlay');
  await expect(preview).toHaveClass(/show/);
  await expect(page.locator('link[data-import-stylesheet]')).toHaveCount(1);
  await expect(page.locator('link[data-cycle-stylesheet]')).toHaveCount(1);
  await expect(page.locator('#import-modal .import-review-summary')).toHaveCSS('display', 'grid');
  await expect(page.locator('#import-modal .cycle-import-table-heading')).toHaveCSS('display', 'flex');
  await expect(page.locator('#import-modal .gb-modal-title')).toHaveText('Review cycle import');
  await expect(page.locator('#import-modal .gb-modal-kicker')).toContainText('Drip');
  await expect(page.locator('#import-modal')).toContainText('4 daily observations');
  await expect(page.locator('#import-modal')).toContainText('2 periods found');
  await expect(page.locator('#import-modal')).toContainText('Daily details stay on this device');
  await expect(page.locator('#import-modal')).not.toContainText('No overlapping period entries found');
  await expect(page.locator('#import-modal .import-review-warning')).toHaveCount(0);
  await expect(page.locator('#import-modal .cycle-import-conflicts')).toHaveCount(0);
  await expect(page.locator('#import-modal .cycle-import-row-status-ready')).toHaveCount(2);
  await expect(page.locator('[data-cycle-import-action="confirm"]')).toHaveText('Import 2 periods');
  await expect(page.locator('#import-modal tbody tr')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('cycle-import-preview-desktop.png') });

  await page.locator('[data-cycle-import-action="confirm"]').click();
  await expect(preview).not.toHaveClass(/show/);
  await expect(page.locator('.notification-toast')).toContainText('Cycle import complete');
  await expect(page.locator('#modal-overlay.show #detail-modal')).toContainText('Import Coverage');
  await expect(page.locator('#detail-modal')).toContainText('Drip');
  await expect(page.locator('#detail-modal')).toContainText('2 periods / 4 local observations');
  await expect(page.locator('.nav-item[data-category="body"]')).toHaveClass(/active/);
  await expect(page.locator('.dashboard-widget[data-widget-id="cycle"] .cycle-section')).toBeAttached();
  await expect(page.locator('#tour-overlay')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('cycle-import-editor-desktop.png') });

  const stored = await page.evaluate(async (id) => {
    const [{ state }, cycleStore] = await Promise.all([
      import('/js/state.js'),
      import('/js/cycle-store.js'),
    ]);
    const rows = await cycleStore.getCycleObservationRange(id, 'drip', '2026-04-01', '2026-05-31');
    const result = {
      profileSex: state.profileSex,
      periods: state.importedData.menstrualCycle?.periods?.map(period => ({
        startDate: period.startDate,
        endDate: period.endDate,
        flow: period.flow,
      })),
      coverage: state.importedData.menstrualCycle?.coverage,
      rows,
    };
    await cycleStore.deleteCycleDB(id).catch(() => {});
    return result;
  }, profileId);

  expect(stored.profileSex).toBe('female');
  expect(stored.periods).toEqual([
    { startDate: '2026-04-01', endDate: '2026-04-02', flow: 'heavy' },
    { startDate: '2026-05-01', endDate: '2026-05-01', flow: 'moderate' },
  ]);
  expect(stored.coverage).toMatchObject({
    firstDate: '2026-04-01',
    lastDate: '2026-05-01',
    periodCount: 2,
    observationCount: 4,
  });
  expect(stored.rows).toHaveLength(4);
  expect(stored.rows[0].symptoms).toEqual(['Cramps', 'Fatigue']);
  expect(stored.rows[2].bleeding.excluded).toBe(true);
});

test('Natural Cycles ZIP import reaches the cycle preview through the file input', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const profileId = await initializeCycleProfile(page, 'natural_cycles_browser');
  await page.addScriptTag({ url: '/vendor/jszip.min.js' });
  const zipBase64 = await page.evaluate(async (csv) => {
    const zip = new window.JSZip();
    zip.file('profile.csv', 'setting,value\nlocale,en');
    zip.file('exports/tracking_data.csv', csv);
    return zip.generateAsync({ type: 'base64' });
  }, NATURAL_CYCLES_CSV);

  await page.locator('#pdf-input').setInputFiles({
    name: 'natural-cycles-export.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipBase64, 'base64'),
  });

  const preview = page.locator('#import-modal-overlay');
  await expect(preview).toHaveClass(/show/);
  await expect(page.locator('#import-modal')).toContainText('Natural Cycles');
  await expect(page.locator('#import-modal')).toContainText('5 daily observations');
  await expect(page.locator('#import-modal')).toContainText('2 periods found');
  await expect(page.locator('#import-modal .import-review-warning')).toHaveCount(0);
  await page.locator('#import-modal .modal-close').click();
  await expect(preview).not.toHaveClass(/show/);
  await page.evaluate(async id => (await import('/js/cycle-store.js')).deleteCycleDB(id), profileId);
});

test('Clue JSON import is classified as cycle data and reaches the preview', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const profileId = await initializeCycleProfile(page, 'clue_browser');

  await page.locator('#pdf-input').setInputFiles({
    name: 'ClueBackup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(CLUE_JSON),
  });

  const preview = page.locator('#import-modal-overlay');
  await expect(preview).toHaveClass(/show/);
  await expect(page.locator('#import-modal')).toContainText('Clue');
  await expect(page.locator('#import-modal')).toContainText('5 daily observations');
  await expect(page.locator('#import-modal')).toContainText('2 periods found');
  await expect(page.locator('#import-modal')).not.toContainText('synthetic fixtures');
  await expect(page.locator('#import-modal .import-review-warning')).toHaveCount(0);
  await page.locator('#import-modal .modal-close').click();
  await expect(preview).not.toHaveClass(/show/);
  await page.evaluate(async id => (await import('/js/cycle-store.js')).deleteCycleDB(id), profileId);
});

test('cycle import confirms before changing an explicitly male profile', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const profileId = await initializeCycleProfile(page, 'cycle_profile_sex_confirmation');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.profileSex = 'male';
    state.profiles[0].sex = 'male';
    localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));
  });
  await page.locator('#pdf-input').setInputFiles({
    name: 'ClueBackup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(CLUE_JSON),
  });
  const preview = page.locator('#import-modal-overlay');
  await expect(preview).toHaveClass(/show/);
  await page.locator('[data-cycle-import-action="confirm"]').click();
  await expect(page.locator('#confirm-dialog-overlay')).toHaveClass(/show/);
  await expect(page.locator('#confirm-dialog-overlay')).toContainText('Change the profile to Female');
  await page.locator('#confirm-cancel').click();
  await expect(preview).toHaveClass(/show/);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.profileSex)).toBe('male');

  await page.locator('[data-cycle-import-action="confirm"]').click();
  await page.locator('#confirm-ok').click();
  await expect(preview).not.toHaveClass(/show/);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.profileSex)).toBe('female');
  await page.evaluate(async id => (await import('/js/cycle-store.js')).deleteCycleDB(id), profileId);
});

test('Apple Health Settings import closes Settings before showing cycle review', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const profileId = await initializeCycleProfile(page, 'apple_health_settings_cycle');
  await page.evaluate(async () => (await import('/js/settings.js')).openSettingsModal('wearables'));
  const settings = page.locator('#settings-modal-overlay');
  await expect(settings).toHaveClass(/show/);
  await page.locator('#apple-health-file-input').setInputFiles({
    name: 'export.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from(APPLE_HEALTH_CYCLE_XML),
  });

  const preview = page.locator('#import-modal-overlay');
  await expect(preview).toHaveClass(/show/);
  await expect(settings).not.toHaveClass(/show/);
  await expect(page.locator('#import-modal')).toContainText('Apple Health');
  const topOverlay = await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('.modal-overlay')?.id);
  expect(topOverlay).toBe('import-modal-overlay');
  await page.locator('#import-modal .modal-close').click();
  await expect(preview).not.toHaveClass(/show/);
  await page.evaluate(async id => {
    await (await import('/js/cycle-store.js')).deleteCycleDB(id).catch(() => {});
    await (await import('/js/wearables-store.js')).deleteWearablesDB(id).catch(() => {});
  }, profileId);
});

test('shared Apple Health ZIP import saves wearable metrics before cycle review', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const profileId = await initializeCycleProfile(page, 'apple_health_shared_import');
  await page.addScriptTag({ url: '/vendor/jszip.min.js' });
  const zipBase64 = await page.evaluate(async xml => {
    const zip = new window.JSZip();
    zip.file('apple_health_export/export.xml', xml);
    return zip.generateAsync({ type: 'base64' });
  }, APPLE_HEALTH_CYCLE_XML);

  await page.locator('#pdf-input').setInputFiles({
    name: 'export.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipBase64, 'base64'),
  });

  const preview = page.locator('#import-modal-overlay');
  await expect(preview).toHaveClass(/show/);
  await expect(page.locator('#import-modal')).toContainText('Apple Health');

  const wearableImport = await page.evaluate(async id => {
    const [{ state }, store] = await Promise.all([
      import('/js/state.js'),
      import('/js/wearables-store.js'),
    ]);
    const row = await store.getDaily(id, 'apple_health', '2026-03-01');
    return {
      row,
      connection: state.importedData.wearableConnections?.apple_health,
    };
  }, profileId);
  expect(wearableImport.row).toMatchObject({
    hrv_sdnn: 47,
    rhr: 58,
    weight: 68.5,
  });
  expect(wearableImport.connection).toMatchObject({
    source: 'file-import',
    fileName: 'export.zip',
    coverageDays: 1,
  });

  await page.locator('[data-cycle-import-action="confirm"]').click();
  await expect(preview).not.toHaveClass(/show/);
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return state.importedData.menstrualCycle?.periods?.length || 0;
  })).toBe(1);

  const periods = await page.evaluate(async id => {
    const { state } = await import('/js/state.js');
    const result = state.importedData.menstrualCycle.periods.map(period => ({
      startDate: period.startDate,
      endDate: period.endDate,
      source: period.source,
    }));
    return Promise.all([
      import('/js/cycle-store.js').then(store => store.deleteCycleDB(id).catch(() => {})),
      import('/js/wearables-store.js').then(store => store.deleteWearablesDB(id).catch(() => {})),
    ]).then(() => result);
  }, profileId);
  expect(periods).toEqual([{
    startDate: '2026-03-01',
    endDate: '2026-03-02',
    source: 'apple_health',
  }]);
});

test('Body cycle action opens the contextual cycle picker', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app', { waitUntil: 'load' });
  const profileId = await page.evaluate(async () => {
    const [{ state }, { createDefaultProfileData }, { deleteCycleDB }, { endTour }] = await Promise.all([
      import('/js/state.js'),
      import('/js/profile.js'),
      import('/js/cycle-store.js'),
      import('/js/tour.js'),
    ]);
    const id = `cycle_contextual_browser_${Date.now()}`;
    await deleteCycleDB(id).catch(() => {});
    state.currentProfile = id;
    state.importedData = createDefaultProfileData();
    state.profileSex = 'female';
    state.profiles = [{ id, name: 'Contextual Cycle Import', sex: 'female' }];
    localStorage.setItem('labcharts-active-profile', id);
    localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));
    localStorage.setItem(`labcharts-${id}-emptyTour`, '1');
    localStorage.setItem(`labcharts-${id}-tour`, '1');
    localStorage.setItem(`labcharts-${id}-cycleTour`, '1');
    endTour({ openEmptyChat: false });
    (await import('/js/views.js')).navigate('body');
    await new Promise(resolve => setTimeout(resolve, 150));
    endTour({ openEmptyChat: false });
    (await import('/js/nav.js')).closeMobileSidebar();
    return id;
  });

  const action = page.locator('.lens-page-widgets[data-lens-route="body"] [data-cycle-import-action="pick-file"]');
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute('aria-label', 'Import cycle data');
  await action.scrollIntoViewIfNeeded();
  const layout = await action.evaluate(element => {
    const actionRect = element.getBoundingClientRect();
    const header = element.closest('.cycle-widget-head');
    return {
      pageFits: document.documentElement.scrollWidth <= window.innerWidth,
      headerFits: !!header && header.scrollWidth <= header.clientWidth,
      actionFits: actionRect.left >= 0 && actionRect.right <= window.innerWidth,
    };
  });
  expect(layout).toEqual({ pageFits: true, headerFits: true, actionFits: true });
  await page.screenshot({ path: testInfo.outputPath('body-cycle-import-mobile.png') });
  const fileChooserPromise = page.waitForEvent('filechooser');
  await action.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'ClueBackup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(CLUE_JSON),
  });

  const preview = page.locator('#import-modal-overlay');
  await expect(preview).toHaveClass(/show/);
  await expect(page.locator('#import-modal')).toContainText('Clue');
  await expect(page.locator('#import-modal')).toContainText('5 daily observations');
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  await page.locator('#import-modal .modal-close').click();
  await page.evaluate(async id => (await import('/js/cycle-store.js')).deleteCycleDB(id), profileId);
});

test('cycle import preview stays within a mobile viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate((csv) => {
    import('/js/cycle-import.js').then(cycleImport => {
      const parsed = cycleImport.parseDripCycleCsv(csv, 'drip-mobile.csv');
      void cycleImport.showCycleImportPreview(parsed);
    });
  }, DRIP_CSV);

  const overlay = page.locator('#import-modal-overlay');
  await expect(overlay).toHaveClass(/show/);
  await expect(page.locator('#import-modal')).toContainText('4 daily observations');
  await expect(page.locator('[data-cycle-import-action="confirm"]')).toBeVisible();

  const layout = await page.evaluate(() => {
    const modal = document.getElementById('import-modal');
    const confirm = document.querySelector('[data-cycle-import-action="confirm"]');
    const modalRect = modal?.getBoundingClientRect();
    const confirmRect = confirm?.getBoundingClientRect();
    return {
      pageFits: document.documentElement.scrollWidth <= window.innerWidth,
      modalFits: !!modalRect && modalRect.left >= 0 && modalRect.right <= window.innerWidth,
      contentFits: !!modal && modal.scrollWidth <= modal.clientWidth,
      confirmFits: !!confirmRect && confirmRect.left >= 0 && confirmRect.right <= window.innerWidth
        && confirmRect.top >= 0 && confirmRect.bottom <= window.innerHeight,
    };
  });
  expect(layout).toEqual({ pageFits: true, modalFits: true, contentFits: true, confirmFits: true });

  await page.screenshot({ path: testInfo.outputPath('cycle-import-preview-mobile.png') });
  await page.locator('#import-modal .modal-close').click();
  await expect(overlay).not.toHaveClass(/show/);
});

test('cycle import only shows conflict controls and row warnings for real overlaps', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const profileId = await initializeCycleProfile(page, 'cycle_import_conflicts');

  await page.evaluate(async (csv) => {
    const [{ state }, cycleImport] = await Promise.all([
      import('/js/state.js'),
      import('/js/cycle-import.js'),
    ]);
    state.importedData.menstrualCycle = {
      periods: [{
        startDate: '2026-04-01',
        endDate: '2026-04-04',
        flow: 'moderate',
        source: 'manual',
      }],
    };
    const parsed = cycleImport.parseDripCycleCsv(csv, 'drip-conflicts.csv');
    void cycleImport.showCycleImportPreview(parsed);
  }, DRIP_CSV);

  const modal = page.locator('#import-modal');
  await expect(page.locator('#import-modal-overlay')).toHaveClass(/show/);
  await expect(modal.locator('.import-review-warning')).toContainText('1 imported period overlaps existing entries');
  await expect(modal.locator('.cycle-import-conflicts')).toBeVisible();
  await expect(modal.locator('.cycle-import-row-status-conflict')).toHaveText('Overlap · skip');
  await expect(modal.locator('.cycle-import-row-status-ready')).toHaveCount(1);
  await expect(modal.locator('[data-cycle-import-action="confirm"]')).toHaveText('Import 1 period');

  await modal.locator('input[value="replace-overlapping"]').check();
  await expect(modal.locator('.cycle-import-row-status-conflict')).toHaveText('Overlap · replace');
  await expect(modal.locator('[data-cycle-import-action="confirm"]')).toHaveText('Import 2 periods');

  await modal.locator('.modal-close').click();
  await page.evaluate(async id => (await import('/js/cycle-store.js')).deleteCycleDB(id), profileId);
});
