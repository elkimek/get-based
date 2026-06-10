import { expect, test } from './coverage-fixture.js';

test('wearables detail modal covers delegated manual add save and cancel flows', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const failures = await page.evaluate(async () => {
    const [{ state }, manual, store, { profileStorageKey }, blobStorage] = await Promise.all([
      import('/js/state.js'),
      import('/js/wearables-manual.js'),
      import('/js/wearables-store.js'),
      import('/js/profile.js'),
      import('/js/blob-storage.js'),
    ]);
    // Ensure delegated detail-modal handlers are installed.
    await import('/js/wearables.js');
    const failures = [];
    const check = (name, condition, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const profileId = `wearables-detail-manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const importedStorageKey = profileStorageKey(profileId, 'imported');
    const originalActiveProfile = localStorage.getItem('labcharts-active-profile');
    const originalCurrentProfile = state.currentProfile;
    const originalImported = state.importedData;
    const originalNavigate = window.navigate;
    const originalImportedLocalValue = localStorage.getItem(importedStorageKey);
    const originalImportedBlobValue = await blobStorage.getBlob(importedStorageKey);
    const originalRange = localStorage.getItem('wearable-detail-range');
    const calls = [];
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, attempts = 300) => {
      for (let i = 0; i < attempts; i += 1) {
        if (await predicate()) return true;
        await delay(10);
      }
      return false;
    };
    const openAddForm = async metric => {
      await window.openWearableDetail(metric);
      const triggerSelector = `#detail-modal [data-wearable-action="open-detail-manual-add"][data-wearable-metric="${metric}"]`;
      const triggerReady = await waitFor(() => document.getElementById('modal-overlay')?.classList.contains('show')
        && !!document.querySelector(triggerSelector));
      if (!triggerReady) throw new Error(`manual add trigger not ready for ${metric}`);
      document.querySelector(triggerSelector)?.click();
      const formReady = await waitFor(() => !!document.querySelector('#detail-modal .wearable-manual-add-form'));
      if (!formReady) throw new Error(`manual add form not ready for ${metric}`);
      return document.querySelector('#detail-modal .wearable-manual-add-form');
    };

    try {
      await store.deleteWearablesDB(profileId).catch(() => {});
      localStorage.setItem('labcharts-active-profile', profileId);
      localStorage.setItem('wearable-detail-range', 'all');
      state.currentProfile = profileId;
      state.importedData = {
        entries: [],
        wearableConnections: {},
        wearableSummary: null,
        changeHistory: [],
      };
      window.navigate = route => calls.push(['navigate', route]);

      await manual.logManualMetric(profileId, 'weight', { date: '2026-06-01', value: 80 });
      await manual.logManualMetric(profileId, 'rhr', { date: '2026-06-01', value: 62, tags: ['resting'] });
      await manual.logManualBP(profileId, { date: '2026-06-01', systolic: 118, diastolic: 74, pulse: 61 });
      await manual.refreshManualSummary(profileId);

      let form = await openAddForm('weight');
      check('weight detail add renders delegated form attributes',
        form?.dataset.wearableForm === 'detail-manual-add'
        && form?.dataset.wearableMetric === 'weight'
        && form?.dataset.wearableKind === 'weight'
        && !!form.querySelector('#wlad-val')
        && !!form.querySelector('#wlad-note'));
      form.querySelector('#wlad-val').value = '501';
      form.querySelector('#wlad-date').value = '2026-06-02';
      form.querySelector('.wearable-log-save')?.click();
      await delay(40);
      const overweightRow = await store.getDaily(profileId, 'manual', '2026-06-02');
      check('weight validation blocks unlikely values', !overweightRow?.weight);
      form = await openAddForm('weight');
      form.querySelector('#wlad-val').value = '82.4';
      form.querySelector('#wlad-date').value = '2026-06-02';
      form.querySelector('#wlad-note').value = 'evening detail add';
      form.querySelector('.wearable-log-save')?.click();
      const weightSaved = await waitFor(async () => (await store.getDaily(profileId, 'manual', '2026-06-02'))?.weight === 82.4);
      const weightRow = await store.getDaily(profileId, 'manual', '2026-06-02');
      check('weight detail submit saves row note and navigates',
        weightSaved
        && weightRow?.note === 'evening detail add'
        && calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard'));

      form = await openAddForm('rhr');
      form.querySelector('[data-wearable-action="close-detail-manual-add"]')?.click();
      await delay(20);
      check('detail manual add cancel clears inline slot',
        !document.querySelector('#detail-modal .wearable-manual-add-form'));
      form = await openAddForm('rhr');
      check('rhr detail add renders context chips',
        !!form?.querySelector('.wearable-log-chip[data-tag="resting"]')
        && !!form.querySelector('.wearable-log-chip[data-tag="post-workout"]'));
      form.querySelector('.wearable-log-chip[data-tag="resting"]')?.click();
      form.querySelector('#wlad-val').value = '251';
      form.querySelector('#wlad-date').value = '2026-06-03';
      form.querySelector('.wearable-log-save')?.click();
      await delay(40);
      const invalidRhrRow = await store.getDaily(profileId, 'manual', '2026-06-03');
      check('rhr validation blocks implausible rhr value', !invalidRhrRow?.rhr);
      form = await openAddForm('rhr');
      form.querySelector('.wearable-log-chip[data-tag="resting"]')?.click();
      form.querySelector('#wlad-val').value = '58';
      form.querySelector('#wlad-date').value = '2026-06-03';
      form.querySelector('#wlad-note').value = 'morning rested';
      form.querySelector('.wearable-log-save')?.click();
      const rhrSaved = await waitFor(async () => (await store.getDaily(profileId, 'manual', '2026-06-03'))?.rhr === 58);
      const rhrRow = await store.getDaily(profileId, 'manual', '2026-06-03');
      check('rhr detail submit saves tags and note',
        rhrSaved
        && rhrRow?.note === 'morning rested'
        && Array.isArray(rhrRow?.tags)
        && rhrRow.tags.includes('resting'));

      form = await openAddForm('bp_systolic');
      check('bp detail add renders pair pulse tags and note controls',
        form?.dataset.wearableKind === 'bp'
        && !!form.querySelector('#wlad-sys')
        && !!form.querySelector('#wlad-dia')
        && !!form.querySelector('#wlad-pulse')
        && !!form.querySelector('.wearable-log-chip[data-tag="stress"]'));
      form.querySelector('.wearable-log-chip[data-tag="stress"]')?.click();
      form.querySelector('#wlad-sys').value = '118';
      form.querySelector('#wlad-dia').value = '120';
      form.querySelector('#wlad-date').value = '2026-06-04';
      form.querySelector('.wearable-log-save')?.click();
      await delay(40);
      const invalidBpRow = await store.getDaily(profileId, 'manual', '2026-06-04');
      check('bp validation blocks diastolic above systolic',
        !invalidBpRow?.bp_systolic && !invalidBpRow?.bp_diastolic);
      form = await openAddForm('bp_systolic');
      form.querySelector('.wearable-log-chip[data-tag="stress"]')?.click();
      form.querySelector('#wlad-sys').value = '122';
      form.querySelector('#wlad-dia').value = '78';
      form.querySelector('#wlad-pulse').value = '64';
      form.querySelector('#wlad-date').value = '2026-06-04';
      form.querySelector('#wlad-note').value = 'after stairs';
      form.querySelector('.wearable-log-save')?.click();
      const bpSaved = await waitFor(async () => {
        const row = await store.getDaily(profileId, 'manual', '2026-06-04');
        return row?.bp_systolic === 122 && row?.bp_diastolic === 78 && row?.rhr === 64;
      });
      const bpRow = await store.getDaily(profileId, 'manual', '2026-06-04');
      check('bp detail submit saves pair pulse tags and note',
        bpSaved
        && bpRow?.note === 'after stairs'
        && Array.isArray(bpRow?.tags)
        && bpRow.tags.includes('stress'));

      await window.openWearableDetail('bp_systolic');
      await waitFor(() => !!document.querySelector('#detail-modal .wearable-manual-entry[data-entry-date="2026-06-04"]'));
      check('saved bp reading appears in detail manual entries list',
        !!document.querySelector('#detail-modal .wearable-manual-entry[data-entry-date="2026-06-04"] .wearable-manual-entry-note'));
    } finally {
      try { window.closeModal?.(); } catch (_) {}
      await store.deleteWearablesDB(profileId).catch(() => {});
      if (originalImportedBlobValue == null) await blobStorage.deleteBlob(importedStorageKey);
      else await blobStorage.setBlob(importedStorageKey, originalImportedBlobValue);
      if (originalImportedLocalValue == null) localStorage.removeItem(importedStorageKey);
      else localStorage.setItem(importedStorageKey, originalImportedLocalValue);
      if (originalActiveProfile) localStorage.setItem('labcharts-active-profile', originalActiveProfile);
      else localStorage.removeItem('labcharts-active-profile');
      if (originalRange) localStorage.setItem('wearable-detail-range', originalRange);
      else localStorage.removeItem('wearable-detail-range');
      state.currentProfile = originalCurrentProfile;
      state.importedData = originalImported;
      if (originalNavigate) window.navigate = originalNavigate;
      else delete window.navigate;
      document.querySelectorAll('.modal-overlay,.confirm-overlay,.notification-container').forEach(el => el.remove());
    }

    return failures;
  });

  expect(failures).toEqual([]);
});
