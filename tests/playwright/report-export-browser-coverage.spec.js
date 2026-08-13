import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?reportExportCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('report builder modal delegates presets categories AI state and preview export', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ builderUrl }) => {
    const builder = await import(builderUrl);
    const dataModule = await import('/js/data.js');
    const profile = await import('/js/profile.js');
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const originalProfiles = profile.getProfiles();
    if (!Array.isArray(originalProfiles)) {
      throw new Error('Expected getProfiles to return the current profile list.');
    }
    const original = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      currentProfile: state.currentProfile,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      dateRangeFilter: state.dateRangeFilter,
      profiles: JSON.parse(JSON.stringify(originalProfiles)),
      open: window.open,
      aiProvider: localStorage.getItem('labcharts-ai-provider'),
      aiPaused: localStorage.getItem('labcharts-ai-paused'),
      openrouterKey: localStorage.getItem('labcharts-openrouter-key'),
    };
    let capturedReport = '';
    let printHandlerInstalled = false;
    const wait = () => new Promise(resolve => setTimeout(resolve, 30));
    const getOverlay = () => document.getElementById('report-builder-overlay');
    const checkedCategories = overlay => Array.from(overlay.querySelectorAll('input[data-report-category]:checked'))
      .map(input => input.dataset.reportCategory);
    const click = selector => getOverlay()?.querySelector(selector)?.click();
    const toDateString = date => date.toISOString().slice(0, 10);
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 14);
    const olderDate = new Date();
    olderDate.setDate(olderDate.getDate() - 75);
    const recentLabDate = toDateString(recentDate);
    const olderLabDate = toDateString(olderDate);

    try {
      state.currentProfile = 'report-export-coverage';
      state.profileSex = 'male';
      state.profileDob = '1980-01-02';
      state.dateRangeFilter = 'all';
      state.importedData = {
        entries: [
          {
            date: olderLabDate,
            markers: {
              'biochemistry.glucose': 5.0,
              'hematology.hemoglobin': 145,
            },
          },
          {
            date: recentLabDate,
            markers: {
              'biochemistry.glucose': 6.8,
              'hematology.hemoglobin': 142,
            },
          },
        ],
        notes: [{ date: recentLabDate, text: 'Report export browser note' }],
        supplements: [{
          name: 'Magnesium',
          dosage: '200 mg',
          type: 'supplement',
          startDate: olderLabDate,
        }],
        biometrics: {
          weight: [{ date: recentLabDate, value: 82, unit: 'kg' }],
          bp: [{ date: recentLabDate, sys: 118, dia: 76 }],
          pulse: [{ date: recentLabDate, value: 61 }],
        },
        diagnoses: {
          conditions: [{ name: 'Insulin resistance', severity: 'watch' }],
          familyHistory: [{ relative: 'father', condition: 'Psoriasis', onsetAge: 18 }],
        },
        customMarkers: {},
      };
      dataModule.invalidateActiveDataCache?.();
      await profile.saveProfiles([{
        id: 'report-export-coverage',
        name: 'Report Coverage',
        sex: 'male',
        dob: '1980-01-02',
        location: { country: 'CZ', zip: '11000' },
        height: 180,
        heightUnit: 'cm',
      }]);
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.setItem('labcharts-ai-paused', 'true');
      localStorage.removeItem('labcharts-openrouter-key');

      window.open = () => ({
        document: {
          write(markup) { capturedReport += markup; },
          close() {},
          querySelector(selector) {
            if (selector !== '.report-print-btn') {
              throw new Error(`Unexpected popup querySelector: ${selector}`);
            }
            return {
              addEventListener(type) {
                if (type === 'click') printHandlerInstalled = true;
              },
            };
          },
        },
        print() {},
      });

      builder.openReportBuilder('clinician');
      await wait();
      let overlay = getOverlay();
      outcomes.opensClinicianBuilder = !!overlay
        && overlay.dataset.reportPreset === 'clinician'
        && overlay.querySelector('#report-builder-title')?.textContent === 'Create a report'
        && overlay.querySelector('.report-builder-local-badge')?.textContent === 'Local preview'
        && overlay.querySelectorAll('.report-preset-btn').length === 3
        && overlay.querySelectorAll('input[data-report-section]').length >= 6
        && overlay.querySelectorAll('input[data-report-category]').length >= 2
        && checkedCategories(overlay).includes('biochemistry')
        && overlay.querySelector('[data-report-section-count]')?.textContent === '6 of 8 sections'
        && overlay.querySelector('[data-report-category-count]')?.textContent === '1 of 2 categories';

      const presetOverlay = overlay;
      click('[data-report-action="set-preset"][data-report-preset="full"]');
      await wait();
      overlay = getOverlay();
      outcomes.presetClickUpdatesInPlace = overlay === presetOverlay
        && overlay?.dataset.reportPreset === 'full'
        && overlay.querySelector('.report-preset-btn.active')?.textContent.includes('Full lab report') === true
        && overlay.querySelector('#report-date-range')?.value === 'all'
        && overlay.querySelector('[data-report-section-count]')?.textContent === '8 of 8 sections'
        && overlay.querySelector('[data-report-category-count]')?.textContent === '2 of 2 categories';

      const textEl = overlay.querySelector('#report-ai-summary-text');
      const statusEl = overlay.querySelector('[data-report-ai-status]');
      textEl.hidden = false;
      textEl.value = 'Existing generated summary';
      statusEl.textContent = 'Generated with Test model. Editable before preview.';
      overlay.querySelector('#report-date-range').value = '6m';
      overlay.querySelector('#report-date-range').dispatchEvent(new Event('change', { bubbles: true }));
      outcomes.optionChangeClearsAISummary = textEl.hidden === true
        && textEl.value === ''
        && statusEl.textContent.includes('Report options changed');

      click('[data-report-action="generate-ai-summary"]');
      await wait();
      outcomes.generateWithoutProviderNotifies = Array.from(document.querySelectorAll('.notification-toast.error'))
        .some(toast => toast.textContent.includes('Connect an AI provider'))
        && statusEl.textContent === 'Not generated.';

      textEl.hidden = false;
      textEl.value = 'Generated text to clear';
      statusEl.textContent = 'Generated with Test model. Editable before preview.';
      const clearAiBtn = overlay.querySelector('[data-report-action="clear-ai-summary"]');
      clearAiBtn.hidden = false;
      clearAiBtn.click();
      await wait();
      outcomes.clearAISummaryResetsEditor = textEl.hidden === true
        && textEl.value === ''
        && statusEl.textContent === 'Not generated.'
        && clearAiBtn.hidden === true;

      const sectionBoxes = Array.from(overlay.querySelectorAll('input[data-report-section]'));
      sectionBoxes.forEach(box => { box.checked = false; });
      click('[data-report-action="generate-ai-summary"]');
      await wait();
      outcomes.generateRequiresSectionSelection = statusEl.textContent === 'Choose at least one report section.';
      click('[data-report-action="export"]');
      await wait();
      outcomes.exportRequiresSectionSelection = !!getOverlay()
        && Array.from(document.querySelectorAll('.notification-toast.error'))
          .some(toast => toast.textContent.includes('Choose at least one report section'));
      sectionBoxes.forEach(box => { box.checked = true; });

      click('[data-report-action="clear-categories"]');
      await wait();
      outcomes.categoryCountUpdatesAfterClear = overlay.querySelector('[data-report-category-count]')?.textContent === '0 of 2 categories'
        && overlay.querySelector('[data-report-selection-summary]')?.textContent.includes('0 lab categories');
      click('[data-report-action="export"]');
      await wait();
      outcomes.exportRequiresCategoryForLabSections = !!getOverlay()
        && Array.from(document.querySelectorAll('.notification-toast.error'))
          .some(toast => toast.textContent.includes('Choose at least one lab category'));

      click('[data-report-action="select-priority-categories"]');
      await wait();
      overlay = getOverlay();
      outcomes.prioritySelectsFlaggedCategories = checkedCategories(overlay).length === 1
        && checkedCategories(overlay)[0] === 'biochemistry';

      click('[data-report-action="select-all-categories"]');
      await wait();
      overlay = getOverlay();
      outcomes.selectAllRestoresCategories = checkedCategories(overlay).includes('biochemistry')
        && checkedCategories(overlay).includes('hematology');

      overlay.querySelector('#report-date-range').value = 'all';
      overlay.querySelector('#report-date-range').dispatchEvent(new Event('change', { bubbles: true }));
      await wait();
      overlay = getOverlay();
      outcomes.exportRestoresAllDateRange = overlay?.querySelector('#report-date-range')?.value === 'all';

      capturedReport = '';
      printHandlerInstalled = false;
      click('[data-report-action="export"]');
      await wait();
      outcomes.successfulExportWritesPreviewAndCloses = !getOverlay()
        && capturedReport.includes('Report Coverage lab report')
        && capturedReport.includes('Report export browser note')
        && capturedReport.includes('Print / Save PDF')
        && printHandlerInstalled === true
        && Array.from(document.querySelectorAll('.notification-toast.info'))
          .some(toast => toast.textContent.includes('PDF preview opened'));

      builder.openReportBuilder('not-a-real-preset');
      await wait();
      overlay = getOverlay();
      outcomes.invalidPresetFallsBackToClinician = overlay?.dataset.reportPreset === 'clinician';
    } finally {
      builder.closeReportBuilder();
      state.importedData = original.importedData;
      state.currentProfile = original.currentProfile;
      state.profileSex = original.profileSex;
      state.profileDob = original.profileDob;
      state.dateRangeFilter = original.dateRangeFilter;
      dataModule.invalidateActiveDataCache?.();
      await profile.saveProfiles(original.profiles);
      window.open = original.open;
      if (original.aiProvider == null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', original.aiProvider);
      if (original.aiPaused == null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', original.aiPaused);
      if (original.openrouterKey == null) localStorage.removeItem('labcharts-openrouter-key');
      else localStorage.setItem('labcharts-openrouter-key', original.openrouterKey);
    }

    return outcomes;
  }, {
    builderUrl: moduleUrl('/js/export-report-builder.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('report lab categories use the modal scroll surface for reliable wheel input', async ({ page }) => {
  await page.addInitScript(() => {
    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { endTour } = await import('/js/tour.js');
    endTour({ openEmptyChat: false });
    const [demo, dataModule, exportModule] = await Promise.all([
      fetch('/data/demo-male.json').then(response => response.json()),
      import('/js/data.js'),
      import('/js/export.js'),
    ]);
    const { state } = await import('/js/state.js');
    state.importedData = demo;
    state.profileSex = 'male';
    dataModule.invalidateActiveDataCache?.();
    await exportModule.openReportBuilder('full');
  });

  const overlay = page.locator('#report-builder-overlay');
  const modalScroll = overlay.locator('.report-builder-scroll');
  const categoryList = overlay.locator('.report-category-list');
  await expect(page.locator('#tour-overlay')).toHaveCount(0);
  await expect(overlay).toHaveClass(/show/);
  await expect.poll(() => categoryList.locator('.report-category-row').count()).toBeGreaterThan(4);
  await expect.poll(() => categoryList.evaluate(element => getComputedStyle(element).overflowY)).toBe('visible');

  const firstCategory = categoryList.locator('.report-category-row').first();
  await firstCategory.scrollIntoViewIfNeeded();
  await firstCategory.hover();
  const before = await modalScroll.evaluate(element => element.scrollTop);
  await page.mouse.wheel(0, 640);
  await expect.poll(() => modalScroll.evaluate(element => element.scrollTop)).toBeGreaterThan(before);
});

test('report payload and HTML cover filtered context genetics and supplement branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ reportUrl, htmlUrl }) => {
    const [report, html, profile, dataModule] = await Promise.all([
      import(reportUrl),
      import(htmlUrl),
      import('/js/profile.js'),
      import('/js/data.js'),
    ]);
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const originalProfiles = profile.getProfiles();
    const original = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      currentProfile: state.currentProfile,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      dateRangeFilter: state.dateRangeFilter,
      rangeMode: state.rangeMode,
      unitSystem: state.unitSystem,
      profiles: JSON.parse(JSON.stringify(originalProfiles)),
      snpTable: window._snpTableCache,
    };
    const toDateString = date => date.toISOString().slice(0, 10);
    const daysAgo = days => {
      const date = new Date();
      date.setDate(date.getDate() - days);
      return toDateString(date);
    };
    const recentDate = daysAgo(8);
    const midDate = daysAgo(45);
    const oldDate = daysAgo(170);

    try {
      state.currentProfile = 'report-payload-coverage';
      state.profileSex = 'female';
      state.profileDob = '1990-04-03';
      state.dateRangeFilter = '3m';
      state.rangeMode = 'both';
      state.unitSystem = 'US';
      state.importedData = {
        entries: [
          {
            date: oldDate,
            markers: {
              'biochemistry.glucose': 4.8,
              'vitamins.vitaminD': 34,
              'hematology.hemoglobin': 133,
            },
          },
          {
            date: midDate,
            markers: {
              'biochemistry.glucose': 5.2,
              'vitamins.vitaminD': 38,
              'hematology.hemoglobin': 129,
            },
          },
          {
            date: recentDate,
            markers: {
              'biochemistry.glucose': 8.4,
              'vitamins.vitaminD': 42,
              'hematology.hemoglobin': 118,
            },
          },
        ],
        notes: [
          { date: oldDate, text: 'Old note outside report window' },
          { date: recentDate, text: 'Recent report note <escaped>' },
        ],
        supplements: [{
          name: 'Magnesium Complex',
          dosage: '2 caps',
          type: 'supplement',
          startDate: oldDate,
          periods: [{ start: oldDate, end: '' }],
          timesPerDay: 2,
          ingredients: [{ name: 'Magnesium glycinate', amount: '100 mg' }],
          note: 'Take with dinner <not raw>',
        }],
        biometrics: {
          weight: [{ date: recentDate, value: 180, unit: 'lb' }],
          bp: [{ date: recentDate, sys: 116, dia: 74 }],
          pulse: [{ date: recentDate, value: 58 }],
        },
        wearableSummary: {
          metrics: {
            body_fat_pct: { latest: 18.5, latestDate: recentDate },
          },
        },
        diagnoses: {
          conditions: [{ name: 'Insulin resistance', severity: 'watch', since: '2025' }],
          familyHistory: [{ relative: 'father', condition: 'Psoriasis', onsetAge: 18, note: 'autoimmune history' }],
        },
        diet: { pattern: 'Mediterranean', allergies: ['milk', 'eggs'], note: 'avoid <wheat>' },
        exercise: { resistanceTraining: { frequency: '3x/week', note: 'progressive overload' } },
        sleepRest: 'Average sleep 7h with early wakeups',
        healthGoals: [{ severity: 'high', text: 'Improve glucose variability' }],
        menstrualCycle: {
          cycleLength: 28,
          periodLength: 5,
          regularity: 'very_irregular',
          flow: 'heavy',
          contraceptive: 'none',
          conditions: 'PCOS',
          periods: [{ startDate: daysAgo(12) }],
        },
        genetics: {
          source: 'Coverage DNA',
          importDate: '2026-01-15',
          apoe: 'E3/E4',
          snps: {
            rsCoverage: { genotype: 'AA', gene: 'TEST1', variant: 'Coverage Variant' },
          },
          mtdna: {
            haplogroup: 'H1',
            coupling: { label: 'Cold-adapted', climate: 'temperate' },
            source: 'mtDNA file',
          },
        },
        customMarkers: {},
      };
      window._snpTableCache = {
        rsCoverage: {
          category: 'methylation',
          genotypes: {
            AA: { effect: 'moderate', note: 'Coverage genotype note' },
          },
        },
      };
      dataModule.invalidateActiveDataCache?.();
      await profile.saveProfiles([{
        id: 'report-payload-coverage',
        name: 'Payload Coverage',
        sex: 'female',
        dob: '1990-04-03',
        status: 'active',
        tags: ['coverage', 'reports'],
        notes: 'Profile notes for report context',
        location: { city: 'Prague', country: 'CZ', zip: '11000' },
        height: 65,
        heightUnit: 'in',
      }]);

      const payload = report.buildPreparedReportPayload({
        preset: 'full',
        dateRange: '3m',
        sections: ['summary', 'flagged', 'categories', 'trends', 'supplements', 'notes', 'genetics', 'context'],
        categoryKeys: ['biochemistry', 'vitamins'],
      });
      outcomes.payloadFiltersDatesNotesAndCategories = payload.profileName === 'Payload Coverage'
        && payload.sexLabel === 'Female'
        && payload.data.dates.includes(recentDate)
        && payload.data.dates.includes(midDate)
        && !payload.data.dates.includes(oldDate)
        && Object.keys(payload.data.categories).join('|') === 'biochemistry|vitamins'
        && payload.notes.length === 1
        && payload.notes[0].text.includes('Recent report note')
        && payload.flags.some(flag => flag.name === 'Glucose');

      const contextByTitle = Object.fromEntries(payload.contextSections.map(section => [section.title, section.text]));
      outcomes.contextSectionsFormatStructuredProfileData = contextByTitle['Medical History']?.includes('Father: Psoriasis (onset 18, autoimmune history)') === true
        && contextByTitle['Diet & Digestion']?.includes('avoid <wheat>') === true
        && contextByTitle['Health Goals']?.includes('[high] Improve glucose variability') === true
        && contextByTitle['Menstrual Cycle']?.includes('very irregular') === true
        && contextByTitle.Biometrics?.includes('Latest weight: 180 lb') === true;

      const headerProfile = report.getReportHeaderProfile('Fallback Profile');
      const facts = report.buildReportHeaderFacts({
        profile: headerProfile,
        reportOptions: payload.reportOptions,
        dateRange: 'Recent window',
        sexLabel: payload.sexLabel,
        unitLabel: 'US (conventional)',
      });
      const factMap = Object.fromEntries(facts.map(fact => [fact.label, fact.value]));
      outcomes.headerFactsIncludeProfileAndBiometricDetails = factMap.Location === 'Prague, CZ, 11000'
        && factMap.Height === '5 ft 5 in'
        && factMap.Weight.includes('180 lb')
        && factMap.BMI
        && factMap['Blood pressure'].includes('116/74')
        && factMap['Resting pulse'].includes('58 bpm')
        && factMap['Body fat'].includes('18.5%');

      const reportHtml = html.buildReportHTML(
        payload.profileName,
        payload.sexLabel,
        payload.data,
        payload.flags,
        payload.notes,
        payload.supps,
        payload.contextSections,
        payload.reportOptions,
      );
      outcomes.htmlRendersSelectedReportSections = reportHtml.includes('Flagged Results')
        && reportHtml.includes('Notable Trends')
        && reportHtml.includes('Supplements & Medications')
        && reportHtml.includes('Notes')
        && reportHtml.includes('Genetics')
        && reportHtml.includes('Profile Context');
      outcomes.htmlEscapesAndFormatsSupplementContextAndGenetics = reportHtml.includes('Recent report note &lt;escaped&gt;')
        && reportHtml.includes('Take with dinner &lt;not raw&gt;')
        && reportHtml.includes('Magnesium glycinate 100 mg x 2/day -&gt; 200 mg/day')
        && reportHtml.includes('APOE:</strong> E3/E4')
        && reportHtml.includes('TEST1')
        && reportHtml.includes('Coverage genotype note')
        && reportHtml.includes('mtDNA Haplogroup:</strong> H1')
        && reportHtml.includes('avoid &lt;wheat&gt;')
        && !reportHtml.includes('Hemoglobin');
    } finally {
      state.importedData = original.importedData;
      state.currentProfile = original.currentProfile;
      state.profileSex = original.profileSex;
      state.profileDob = original.profileDob;
      state.dateRangeFilter = original.dateRangeFilter;
      state.rangeMode = original.rangeMode;
      state.unitSystem = original.unitSystem;
      window._snpTableCache = original.snpTable;
      dataModule.invalidateActiveDataCache?.();
      await profile.saveProfiles(original.profiles);
    }

    return outcomes;
  }, {
    reportUrl: moduleUrl('/js/export-report.js'),
    htmlUrl: moduleUrl('/js/export-report-html.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('report HTML renderer covers sparse single-date trend and print branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ htmlUrl }) => {
    const html = await import(htmlUrl);
    const dataModule = await import('/js/data.js');
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const original = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      profiles: JSON.parse(JSON.stringify(state.profiles || [])),
      currentProfile: state.currentProfile,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      rangeMode: state.rangeMode,
      unitSystem: state.unitSystem,
      open: window.open,
      snpTable: window._snpTableCache,
    };
    const trendMarkers = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [
      `trend${index}`,
      {
        name: `Trend Marker ${index + 1}`,
        unit: 'u',
        refMin: 0,
        refMax: 20,
        values: [5, 7 + index],
      },
    ]));
    const flags = [
      {
        name: 'Low Marker <Flag>',
        value: '0.50',
        rawValue: 0.5,
        unit: 'u',
        refMin: 1,
        refMax: 2,
        effectiveMin: 1,
        effectiveMax: 2,
        status: 'low',
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        name: `High Marker ${index + 1}`,
        value: String(31 + index),
        rawValue: 31 + index,
        unit: 'u',
        refMin: 0,
        refMax: 30,
        effectiveMin: 0,
        effectiveMax: 30,
        status: 'high',
      })),
    ];

    try {
      state.currentProfile = 'report-html-renderer-coverage';
      state.profiles = [{
        id: 'report-html-renderer-coverage',
        name: 'Renderer Coverage',
        sex: 'female',
        dob: '1990-01-02',
        location: { city: 'Prague', country: 'CZ' },
        height: 170,
        heightUnit: 'cm',
        tags: [],
        notes: '',
        status: 'active',
      }];
      state.profileSex = '';
      state.profileDob = '';
      state.rangeMode = 'reference';
      state.unitSystem = 'EU';
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        genetics: {
          mtdna: {
            haplogroup: 'J1c',
            source: 'mtDNA only <source>',
          },
        },
        customMarkers: {},
      };
      window._snpTableCache = null;
      dataModule.invalidateActiveDataCache?.();

      const emptyReport = html.buildReportHTML(
        'Sparse <Profile>',
        'Not specified',
        {
          dates: [],
          categories: {
            empty: {
              label: 'Empty Group',
              markers: {
                none: { name: 'No Value', unit: 'mg/L', refMin: 0, refMax: 10, values: [null, undefined] },
              },
            },
          },
        },
        [],
        [],
        [{
          name: 'No dosage supplement',
          type: '',
          startDate: '2026-01-01',
          endDate: '2026-02-01',
        }],
        [{ title: 'Plain Context', text: 'Single context line <safe>' }],
        {
          preset: 'personal',
          dateRange: '3m',
          sections: ['summary', 'categories', 'supplements', 'context', 'genetics'],
        },
      );
      outcomes.emptyReportDeckSupplementAndMtDna = emptyReport.includes('Sparse &lt;Profile&gt; lab report')
        && emptyReport.includes('No lab results are available for the selected report window')
        && emptyReport.includes('No lab dates in selected range')
        && emptyReport.includes('<strong>No out-of-range results.</strong>')
        && emptyReport.includes('Within Reference Range:</strong> 0 of 0 markers with data')
        && emptyReport.includes('No dosage supplement')
        && emptyReport.includes('<td>\u2014</td><td>\u2014</td>')
        && emptyReport.includes('Jan 1, 2026 \u2192 Feb 1, 2026')
        && emptyReport.includes('Single context line &lt;safe&gt;')
        && emptyReport.includes('mtDNA Haplogroup:</strong> J1c')
        && emptyReport.includes('Source: mtDNA only &lt;source&gt;')
        && !emptyReport.includes('<h2>Empty Group</h2>');

      const data = {
        dates: ['2026-01-01', '2026-02-01'],
        categories: {
          chemistry: {
            label: 'Chemistry <Set>',
            markers: {
              albumin: { name: 'Albumin', unit: 'g/L', refMin: 35, refMax: 50, values: [42, null] },
              ferritin: { name: 'Ferritin', unit: 'ug/L', refMin: 30, refMax: 150, values: [null, 180] },
              zero: { name: 'Zero Trend Marker', unit: 'u', refMin: 0, refMax: 10, values: [0, 8] },
              stable: { name: 'Stable Marker', unit: 'u', refMin: 0, refMax: 10, values: [5, 5.05] },
            },
          },
          trends: {
            label: 'Trend Group',
            markers: trendMarkers,
          },
          spot: {
            label: 'Single Point',
            singleDate: true,
            singleDateLabel: 'Spot check',
            markers: {
              spotLow: { name: 'Spot Marker', unit: 'u', refMin: 1, refMax: 2, values: [0.5] },
            },
          },
        },
      };
      const denseReport = html.buildReportHTML(
        'Dense Renderer',
        'Female',
        data,
        flags,
        [{ date: '2026-02-03', text: 'Dense note <escape>' }],
        [
          {
            name: 'Dose Stack',
            dose: '100 mg',
            amount: '1 cap',
            frequency: 'daily',
            type: 'medication',
            startDate: '2026-01-01',
            endDate: '2026-03-01',
            timesPerDay: 2,
            ingredients: [
              { name: '', amount: '' },
              { name: 'Zinc', amount: '15 mg' },
            ],
          },
        ],
        [{ title: 'Structured Context', text: 'Goal: cover report renderer\nUnkeyed context line <escaped>' }],
        {
          preset: 'full',
          dateRange: 'all',
          sections: ['summary', 'flagged', 'categories', 'trends', 'supplements', 'notes', 'genetics', 'context'],
        },
      );
      outcomes.denseReportCoversFlagsTrendsSparseCellsAndSupplements = denseReport.includes('2 lab dates covering 14 markers across 3 lab groups.')
        && denseReport.includes('11 latest markers are outside range.')
        && denseReport.includes('Out of Range Highlights (10 of 11)')
        && denseReport.includes('See Flagged Results for the full list of 11 out-of-range markers.')
        && denseReport.includes('Low Marker &lt;Flag&gt;')
        && denseReport.includes('LOW')
        && denseReport.includes('Trend Highlights (&gt;10% change)')
        && denseReport.includes('See Notable Trends for the full list of 9 changes.')
        && denseReport.includes('<h2>Chemistry &lt;Set&gt;</h2>')
        && denseReport.includes('<th>Jan 1, 2026</th>')
        && denseReport.includes('<th>Feb 1, 2026</th>')
        && denseReport.includes('class="val-missing">\u2014</td>')
        && denseReport.includes('<th>Spot check</th>')
        && denseReport.includes('Dose Stack')
        && denseReport.includes('100 mg<br>1 cap<br>daily<br>Zinc 15 mg x 2/day -&gt; 30 mg/day')
        && denseReport.includes('Jan 1, 2026 \u2192 Mar 1, 2026')
        && denseReport.includes('Dense note &lt;escape&gt;')
        && denseReport.includes('<dt>Goal</dt><dd>cover report renderer</dd>')
        && denseReport.includes('Unkeyed context line &lt;escaped&gt;')
        && denseReport.includes('Within Reference Range:</strong>');

      let capturedReport = '';
      let printHandler = null;
      window.open = () => ({
        document: {
          write(markup) { capturedReport += markup; },
          close() {},
          querySelector(selector) {
            if (selector !== '.report-print-btn') throw new Error(`Unexpected selector: ${selector}`);
            return {
              addEventListener(type, handler) {
                if (type === 'click') printHandler = handler;
              },
            };
          },
        },
        print() {},
      });
      state.importedData.entries = [{
        date: '2026-02-01',
        markers: { 'biochemistry.glucose': 5.6 },
      }];
      outcomes.successfulExportWritesPreviewAndInstallsPrint = html.exportPDFReport({
        preset: 'personal',
        dateRange: 'all',
        sections: ['summary', 'categories'],
        categoryKeys: ['biochemistry'],
      }) === true
        && capturedReport.includes('Renderer Coverage lab report')
        && capturedReport.includes('Glucose')
        && capturedReport.includes('Print / Save PDF')
        && typeof printHandler === 'function'
        && Array.from(document.querySelectorAll('.notification-toast.info'))
          .some(toast => toast.textContent.includes('PDF preview opened'));
    } finally {
      state.importedData = original.importedData;
      state.profiles = original.profiles;
      state.currentProfile = original.currentProfile;
      state.profileSex = original.profileSex;
      state.profileDob = original.profileDob;
      state.rangeMode = original.rangeMode;
      state.unitSystem = original.unitSystem;
      window.open = original.open;
      window._snpTableCache = original.snpTable;
      dataModule.invalidateActiveDataCache?.();
    }

    return outcomes;
  }, {
    htmlUrl: moduleUrl('/js/export-report-html.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('report AI summary generation covers unavailable success and empty-response paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ reportUrl }) => {
    const report = await import(reportUrl);
    const dataModule = await import('/js/data.js');
    const profile = await import('/js/profile.js');
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const originalProfiles = profile.getProfiles();
    const original = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      currentProfile: state.currentProfile,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      profiles: JSON.parse(JSON.stringify(originalProfiles)),
      fetch: window.fetch,
      aiProvider: localStorage.getItem('labcharts-ai-provider'),
      aiPaused: localStorage.getItem('labcharts-ai-paused'),
      ollamaModel: localStorage.getItem('labcharts-ollama-model'),
    };
    const aiText = `\`\`\`text
Patient picture:
Glucose is trending up while vitamin D is stable.

Key signals:
- Glucose needs review.
- Recent notes mention training load.

Discussion focus:
1. Confirm fasting status.
\`\`\``;
    const requests = [];
    let returnEmpty = false;

    try {
      state.currentProfile = 'report-ai-coverage';
      state.profileSex = 'male';
      state.profileDob = '1988-02-01';
      state.importedData = {
        entries: [
          { date: '2026-01-01', markers: { 'biochemistry.glucose': 5.0 } },
          { date: '2026-06-01', markers: { 'biochemistry.glucose': 7.2 } },
        ],
        notes: [{ date: '2026-06-02', text: 'Training load increased' }],
        supplements: [{ name: 'Vitamin D', dosage: '2000 IU', type: 'supplement' }],
        contextNotes: 'Prefers concise practitioner reports.',
        genetics: { apoe: 'ε3/ε4' },
        customMarkers: {},
      };
      dataModule.invalidateActiveDataCache?.();
      await profile.saveProfiles([{
        id: 'report-ai-coverage',
        name: 'Report AI Coverage',
        sex: 'male',
        dob: '1988-02-01',
        status: 'active',
        tags: ['ai-summary'],
        notes: 'AI summary test profile note',
      }]);

      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ollama-model', 'summary-test-model');
      localStorage.setItem('labcharts-ai-paused', 'true');
      const emptySelection = await report.generateReportAISummary({ dateRange: 'all', sections: [] });
      outcomes.emptySelectionDoesNotGenerate = emptySelection === null
        && Array.from(document.querySelectorAll('.notification-toast.error'))
          .some(toast => toast.textContent.includes('Choose at least one report section'));
      const unavailable = await report.generateReportAISummary({ dateRange: 'all' });
      outcomes.unavailableAIShowsErrorAndReturnsNull = unavailable === null
        && Array.from(document.querySelectorAll('.notification-toast.error'))
          .some(toast => toast.textContent.includes('Connect an AI provider'));

      window.fetch = async (url, init = {}) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init.body || '{}')),
        });
        return new Response(JSON.stringify({
          choices: [{
            message: { content: returnEmpty ? '' : aiText },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 321, completion_tokens: 45 },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      localStorage.setItem('labcharts-ai-paused', 'false');
      const summary = await report.generateReportAISummary({
        preset: 'clinician',
        dateRange: 'all',
        sections: ['summary', 'categories', 'trends', 'notes', 'supplements', 'context'],
        categoryKeys: ['biochemistry'],
      });
      const request = requests[0];
      const userContext = request.body.messages.find(message => message.role === 'user')?.content || '';
      outcomes.successfulSummaryUsesLocalAIAndCleanedText = summary.provider === 'ollama'
        && summary.modelId === 'summary-test-model'
        && summary.model === 'summary-test-model'
        && summary.text.startsWith('Patient picture:')
        && !summary.text.includes('```')
        && request.url.includes('/v1/chat/completions')
        && request.body.model === 'summary-test-model'
        && request.body.max_tokens === 900
        && request.body.messages.some(message => message.role === 'system' && message.content.includes('You write practitioner-facing patient overviews'))
        && userContext.includes('Profile: Report AI Coverage')
        && userContext.includes('Notable trends:')
        && userContext.includes('Recent report notes:')
        && userContext.includes('Vitamin D')
        && userContext.includes('Prefers concise practitioner reports.')
        && !userContext.includes('Genetics: APOE');

      await report.generateReportAISummary({
        preset: 'personal',
        dateRange: 'all',
        sections: ['notes'],
        categoryKeys: ['biochemistry'],
      });
      const notesOnlyContext = requests[1].body.messages.find(message => message.role === 'user')?.content || '';
      outcomes.summaryHonorsSelectedSections = notesOnlyContext.includes('Recent report notes:')
        && !notesOnlyContext.includes('Representative latest lab results:')
        && !notesOnlyContext.includes('Notable trends:')
        && !notesOnlyContext.includes('Supplements and medications:')
        && !notesOnlyContext.includes('Profile context:')
        && !notesOnlyContext.includes('Genetics: APOE');

      returnEmpty = true;
      let emptyResponseThrows = false;
      try {
        await report.generateReportAISummary({ dateRange: 'all' });
      } catch (err) {
        emptyResponseThrows = String(err?.message || err).includes('returned no response content');
      }
      outcomes.emptySummaryResponseThrows = emptyResponseThrows;
    } finally {
      state.importedData = original.importedData;
      state.currentProfile = original.currentProfile;
      state.profileSex = original.profileSex;
      state.profileDob = original.profileDob;
      dataModule.invalidateActiveDataCache?.();
      await profile.saveProfiles(original.profiles);
      window.fetch = original.fetch;
      if (original.aiProvider == null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', original.aiProvider);
      if (original.aiPaused == null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', original.aiPaused);
      if (original.ollamaModel == null) localStorage.removeItem('labcharts-ollama-model');
      else localStorage.setItem('labcharts-ollama-model', original.ollamaModel);
    }

    return outcomes;
  }, {
    reportUrl: moduleUrl('/js/export-report.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('report export helpers cover option normalization AI markup and popup blocking', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ reportUrl, htmlUrl }) => {
    const report = await import(reportUrl);
    const html = await import(htmlUrl);
    const dataModule = await import('/js/data.js');
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const original = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      currentProfile: state.currentProfile,
      profileSex: state.profileSex,
      open: window.open,
    };

    try {
      state.currentProfile = 'report-helper-coverage';
      state.profileSex = 'female';
      state.importedData = {
        entries: [{
          date: '2026-05-01',
          markers: { 'vitamins.vitaminD': 42 },
        }],
        notes: [],
        supplements: [],
        customMarkers: {},
      };
      dataModule.invalidateActiveDataCache?.();

      const normalized = report.normalizeReportOptions({
        preset: 'missing',
        dateRange: 'bad-range',
        sections: ['summary', 'unknown', 'notes'],
        categoryKeys: ['vitamins', '', null],
        aiSummary: 'Patient picture:\nStable <script>alert(1)</script>\n\nDiscussion focus:\n- Review vitamin D trend',
      });
      outcomes.normalizesExplicitOptions = normalized.preset === 'clinician'
        && normalized.dateRange === 'current'
        && normalized.sections.join('|') === 'summary|notes'
        && normalized.categoryKeys.join('|') === 'vitamins'
        && normalized.aiSummary.text.includes('Stable <script>alert(1)</script>')
        && report.normalizeReportOptions({ sections: [] }).sections.length === 0;

      const aiMarkup = report.renderReportAISummarySection(normalized.aiSummary);
      outcomes.aiSummaryMarkupEscapesAndStructures = aiMarkup.includes('<h2>Practitioner Overview</h2>')
        && aiMarkup.includes('<p class="report-ai-subhead">Patient picture</p>')
        && aiMarkup.includes('<p class="report-ai-subhead">Discussion focus</p>')
        && aiMarkup.includes('Stable &lt;script&gt;alert(1)&lt;/script&gt;')
        && !aiMarkup.includes('Stable <script>alert(1)</script>');

      window.open = () => null;
      outcomes.popupBlockedReturnsFalseAndNotifies = html.exportPDFReport({
        preset: 'personal',
        dateRange: 'all',
        sections: ['categories'],
        categoryKeys: ['vitamins'],
      }) === false
        && Array.from(document.querySelectorAll('.notification-toast.error'))
          .some(toast => toast.textContent.includes('Pop-up blocked'));
    } finally {
      state.importedData = original.importedData;
      state.currentProfile = original.currentProfile;
      state.profileSex = original.profileSex;
      dataModule.invalidateActiveDataCache?.();
      window.open = original.open;
    }

    return outcomes;
  }, {
    reportUrl: moduleUrl('/js/export-report.js'),
    htmlUrl: moduleUrl('/js/export-report-html.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('export facade covers JSON downloads imports chat bundle and clear cancel', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ exportUrl, profileUrl, cryptoUrl }) => {
    const [exportFacade, profileStore, cryptoStore, dataModule, viewsModule] = await Promise.all([
      import(exportUrl),
      import(profileUrl),
      import(cryptoUrl),
      import('/js/data.js'),
      import('/js/views.js'),
    ]);
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const profileId = 'export-facade-coverage';
    const originalProfiles = profileStore.getProfiles();
    const original = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      currentProfile: state.currentProfile,
      profiles: JSON.parse(JSON.stringify(originalProfiles)),
      activeProfile: localStorage.getItem('labcharts-active-profile'),
      encryptionEnabled: localStorage.getItem('labcharts-encryption-enabled'),
      aiProvider: localStorage.getItem('labcharts-ai-provider'),
      aiPaused: localStorage.getItem('labcharts-ai-paused'),
      openrouterKey: localStorage.getItem('labcharts-openrouter-key'),
      routstrNode: localStorage.getItem('labcharts-routstr-node'),
      routstrSessionUpdatedAt: localStorage.getItem('labcharts-routstr-session-updated-at'),
      fileReader: window.FileReader,
      createObjectURL: URL.createObjectURL,
      revokeObjectURL: URL.revokeObjectURL,
      anchorClick: HTMLAnchorElement.prototype.click,
      cashuGetMintUrl: window.cashuGetMintUrl,
      cashuSetMintUrl: window.cashuSetMintUrl,
    };
    const waitFor = async (predicate, label) => {
      for (let i = 0; i < 80; i += 1) {
        const value = predicate();
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const setOrRemove = (key, value) => {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    };
    const profileData = {
      entries: [{
        date: '2026-06-03',
        markers: { 'biochemistry.glucose': 5.8 },
      }],
      notes: [{ date: '2026-06-03', text: 'Export facade note' }],
      supplements: [{ name: 'Zinc', dosage: '15 mg', type: 'supplement', startDate: '2026-06-01' }],
      customMarkers: {},
      refOverrides: {},
      healthGoals: [],
      markerNotes: {},
      markerValueNotes: {},
      changeHistory: [],
      chatSummaries: [],
      sunSessions: [{ id: 'sun-export', date: '2026-06-03' }],
      lightDevices: [{ id: 'light-export', name: 'Desk lamp' }],
      channelMixAI: { summary: 'balanced' },
      contextSourceSettings: {
        'lab-group-Fatty Acids': false,
        'lab-group-Specialty Panel': true,
      },
    };
    const downloadRecords = [];
    const blobTexts = new Map();
    const revokedUrls = [];

    try {
      localStorage.setItem('labcharts-encryption-enabled', 'false');
      state.currentProfile = profileId;
      state.importedData = JSON.parse(JSON.stringify(profileData));
      localStorage.setItem('labcharts-active-profile', profileId);
      await profileStore.saveProfiles([{
        id: profileId,
        name: 'Export Facade',
        sex: 'female',
        dob: '1985-04-05',
        location: { country: 'CZ', zip: '11000' },
        tags: ['coverage'],
        notes: 'Export facade profile note',
        status: 'active',
        avatar: null,
        height: 171,
        heightUnit: 'cm',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        pinned: false,
      }]);
      await cryptoStore.encryptedSetItem(
        profileStore.profileStorageKey(profileId, 'imported'),
        JSON.stringify(profileData),
      );
      localStorage.setItem(`labcharts-${profileId}-chat-threads`, JSON.stringify([{
        id: 'thread-one',
        title: 'Export thread',
        createdAt: '2026-06-03T08:00:00.000Z',
        updatedAt: '2026-06-03T09:00:00.000Z',
      }]));
      localStorage.setItem(`labcharts-${profileId}-chat-t_thread-one`, JSON.stringify([
        { role: 'user', content: 'What changed?' },
        { role: 'assistant', content: 'Glucose improved.' },
      ]));
      localStorage.setItem(`labcharts-${profileId}-chatPersonality`, 'clinician');
      localStorage.setItem(`labcharts-${profileId}-chatPersonalityCustom`, JSON.stringify([{ id: 'direct', label: 'Direct' }]));
      localStorage.setItem(`labcharts-${profileId}-chatPersonalityDeleted`, JSON.stringify({
        custom_retired: 1786183200000,
      }));

      let objectUrlIndex = 0;
      URL.createObjectURL = blob => {
        objectUrlIndex += 1;
        const url = `blob:export-facade-${objectUrlIndex}`;
        blobTexts.set(url, blob.text());
        return url;
      };
      URL.revokeObjectURL = url => { revokedUrls.push(url); };
      HTMLAnchorElement.prototype.click = function click() {
        downloadRecords.push({
          download: this.download,
          href: this.getAttribute('href') || this.href,
        });
      };
      window.cashuGetMintUrl = async () => 'https://mint.example';
      localStorage.setItem('labcharts-routstr-node', 'https://node.export.test');

      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'true');
      const unavailable = await exportFacade.generateReportAISummary({ dateRange: 'all' });
      outcomes.facadeAISummaryReturnsNullWhenProviderUnavailable = unavailable === null
        && Array.from(document.querySelectorAll('.notification-toast.error'))
          .some(toast => toast.textContent.includes('Connect an AI provider'));

      exportFacade.exportDataJSON();
      await waitFor(() => downloadRecords.length >= 1, 'legacy client export download');
      await exportFacade.exportClientJSON(profileId, true);
      await exportFacade.exportAllDataJSON();
      await Promise.all(downloadRecords.map(async record => {
        record.text = await blobTexts.get(record.href);
      }));
      const activeClientExport = JSON.parse(downloadRecords[0].text);
      const chatClientExport = JSON.parse(downloadRecords[1].text);
      const allDataBundle = JSON.parse(downloadRecords[2].text);
      outcomes.downloadsIncludeActiveClientChatAndNonSecretWalletSettings = downloadRecords.length === 3
        && downloadRecords[0].download.includes('getbased-export-facade')
        && activeClientExport.profile.name === 'Export Facade'
        && activeClientExport.entries[0].markers['biochemistry.glucose'] === 5.8
        && activeClientExport.contextSourceSettings['lab-group-Fatty Acids'] === false
        && activeClientExport.contextSourceSettings['lab-group-Specialty Panel'] === true
        && chatClientExport.chat.threads[0].id === 'thread-one'
        && chatClientExport.chat.messages['thread-one'][1].content.includes('Glucose')
        && allDataBundle.type === 'database'
        && allDataBundle.profiles.length === 1
        && allDataBundle.profiles[0].chat.threads[0].id === 'thread-one'
        && allDataBundle.wallet.nodeUrl === 'https://node.export.test'
        && !Object.prototype.hasOwnProperty.call(allDataBundle.wallet, 'mintUrl')
        && revokedUrls.length === 3;

      const savedThreadIndex = localStorage.getItem(`labcharts-${profileId}-chat-threads`);
      localStorage.removeItem(`labcharts-${profileId}-chat-threads`);
      const personaOnlyExport = await exportFacade.buildClientExportObject(profileId, true);
      outcomes.portableExportIncludesPersonasWithoutConversationThreads =
        personaOnlyExport.chat?.threads?.length === 0
        && personaOnlyExport.chat?.personality === 'clinician'
        && personaOnlyExport.chat?.customPersonalities?.[0]?.id === 'direct'
        && personaOnlyExport.chat?.customPersonalityDeleted?.custom_retired === 1786183200000;
      if (savedThreadIndex != null) {
        localStorage.setItem(`labcharts-${profileId}-chat-threads`, savedThreadIndex);
      }

      class ErrorFileReader {
        readAsText() {
          setTimeout(() => this.onerror?.(new Event('error')), 0);
        }
      }
      window.FileReader = ErrorFileReader;
      let errorReaderResolved = false;
      await exportFacade.importDataJSON(new File(['{}'], 'reader-error.json', { type: 'application/json' }));
      errorReaderResolved = true;
      window.FileReader = original.fileReader;
      outcomes.readerOnerrorImportResolves = errorReaderResolved;

      const singleImport = {
        profile: {
          name: 'Imported Facade Client',
          sex: 'male',
          dob: '1980-01-02',
          tags: ['imported'],
          height: 182,
          heightUnit: 'cm',
        },
        entries: [{
          date: '2026-06-04',
          markers: { 'vitamins.vitaminD': 44 },
        }],
        notes: [{ date: '2026-06-04', text: 'Single import note' }],
        contextSourceSettings: {
          'lab-group-Fatty Acids': false,
          'lab-group-Specialty Panel': true,
        },
        chat: {
          threads: [{ id: 'single-thread', title: 'Imported chat' }],
          messages: { 'single-thread': [{ role: 'user', content: 'Imported message' }] },
          personality: 'coach',
          customPersonalities: [{ id: 'coach', label: 'Coach' }],
          customPersonalityDeleted: { custom_imported_retired: 1786186800000 },
        },
      };
      viewsModule.navigate('labs');
      await exportFacade.importDataJSON(new File([JSON.stringify(singleImport)], 'single-client.json', { type: 'application/json' }));
      const singleProfile = profileStore.getProfiles().find(profile => profile.name === 'Imported Facade Client');
      const singleThreads = singleProfile
        ? JSON.parse(localStorage.getItem(`labcharts-${singleProfile.id}-chat-threads`) || '[]')
        : [];
      outcomes.singleClientImportCreatesProfileDataAndChat = !!singleProfile
        && state.currentProfile === singleProfile.id
        && state.importedData.entries.some(entry => entry.markers?.['vitamins.vitaminD'] === 44)
        && state.importedData.contextSourceSettings?.['lab-group-Fatty Acids'] === false
        && state.importedData.contextSourceSettings?.['lab-group-Specialty Panel'] === true
        && singleThreads[0]?.id === 'single-thread'
        && localStorage.getItem(`labcharts-${singleProfile.id}-chatPersonality`) === 'coach'
        && JSON.parse(localStorage.getItem(`labcharts-${singleProfile.id}-chatPersonalityDeleted`) || '{}')
          .custom_imported_retired === 1786186800000;
      outcomes.singleClientImportRefreshesDashboardThroughInjectedShellDeps = state.currentView === 'dashboard';

      let restoredMintUrl = null;
      Object.defineProperty(window, 'cashuSetMintUrl', {
        configurable: true,
        writable: true,
        value: async url => { restoredMintUrl = url; },
      });
      const databaseBundle = {
        type: 'database',
        profiles: [
          {
            id: profileId,
            name: 'Export Facade Merged',
            sex: 'female',
            data: {
              entries: [{
                date: '2026-06-05',
                markers: { 'hematology.hemoglobin': 131 },
              }],
              notes: [{ date: '2026-06-05', text: 'Merged bundle note' }],
              supplements: [{ name: 'Creatine', startDate: '2026-06-05' }],
              healthGoals: [{ text: 'Keep glucose stable', severity: 'medium' }],
              customMarkers: { 'coverage.marker': { name: 'Coverage Marker' } },
              refOverrides: { 'biochemistry.glucose': { min: 4, max: 6 } },
              categoryLabels: { coverage: 'Coverage' },
              markerLabels: { 'coverage.marker': 'Coverage Marker' },
              manualValues: { 'coverage.marker': 9 },
              chatSummaries: [{ threadId: 'thread-one', text: 'Summary' }],
              changeHistory: [{ field: 'glucose', date: '2026-06-05', value: 5.8 }],
              contextSourceSettings: {
                'lab-group-Fatty Acids': true,
                'lab-group-Specialty Panel': false,
              },
            },
            chat: {
              threads: [{ id: 'bundle-thread', title: 'Bundle chat' }],
              messages: { 'bundle-thread': [{ role: 'assistant', content: 'Bundle message' }] },
              personality: 'bundle',
            },
          },
          {
            name: 'Bundle Facade New',
            data: {
              entries: [{
                date: '2026-06-06',
                markers: { 'proteins.crp': 1.2 },
              }],
            },
            chat: {
              threads: [{ id: 'new-bundle-thread', title: 'New bundle chat' }],
              messages: { 'new-bundle-thread': [{ role: 'user', content: 'New bundle message' }] },
            },
          },
        ],
        wallet: {
          mintUrl: 'https://mint.restore',
          nodeUrl: 'https://node.restore.test',
        },
      };
      await exportFacade.importDataJSON(new File([JSON.stringify(databaseBundle)], 'database-bundle.json', { type: 'application/json' }));
      const mergedRaw = await cryptoStore.encryptedGetItem(profileStore.profileStorageKey(profileId, 'imported'));
      const mergedData = JSON.parse(mergedRaw);
      const mergedThreads = JSON.parse(localStorage.getItem(`labcharts-${profileId}-chat-threads`) || '[]');
      const newBundleProfile = profileStore.getProfiles().find(profile => profile.name === 'Bundle Facade New');
      outcomes.databaseBundleMergesCreatesAndImportsChat = state.currentProfile === profileId
        && profileStore.getProfiles().some(profile => profile.id === profileId && profile.name === 'Export Facade Merged')
        && mergedData.entries.some(entry => entry.markers?.['hematology.hemoglobin'] === 131)
        && mergedData.notes.some(note => note.text === 'Merged bundle note')
        && mergedData.contextSourceSettings?.['lab-group-Fatty Acids'] === true
        && mergedData.contextSourceSettings?.['lab-group-Specialty Panel'] === false
        && mergedThreads.some(thread => thread.id === 'bundle-thread')
        && !!newBundleProfile
        && restoredMintUrl === null;
      outcomes.databaseBundleRestoresNodeThroughModuleRuntime = localStorage.getItem('labcharts-routstr-node') === 'https://node.restore.test';

      const clearPromise = exportFacade.clearAllData();
      const cancelButton = await waitFor(() => document.getElementById('confirm-cancel'), 'clear data cancel button');
      const clearPrompt = document.getElementById('confirm-dialog-overlay')?.textContent || '';
      cancelButton.click();
      await clearPromise;
      outcomes.clearAllDataCancelKeepsProfiles = clearPrompt.includes('Clear ALL data')
        && profileStore.getProfiles().length >= 2
        && profileStore.getProfiles().some(profile => profile.id === profileId);
    } finally {
      window.FileReader = original.fileReader;
      URL.createObjectURL = original.createObjectURL;
      URL.revokeObjectURL = original.revokeObjectURL;
      HTMLAnchorElement.prototype.click = original.anchorClick;
      if (original.cashuGetMintUrl === undefined) delete window.cashuGetMintUrl;
      else window.cashuGetMintUrl = original.cashuGetMintUrl;
      if (original.cashuSetMintUrl === undefined) delete window.cashuSetMintUrl;
      else window.cashuSetMintUrl = original.cashuSetMintUrl;

      const originalIds = new Set(original.profiles.map(profile => profile.id));
      const touchedIds = new Set([profileId]);
      for (const profile of profileStore.getProfiles()) {
        if (!originalIds.has(profile.id)) touchedIds.add(profile.id);
      }
      for (const id of touchedIds) {
        await cryptoStore.encryptedRemoveItem(profileStore.profileStorageKey(id, 'imported'));
        for (const key of Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean)) {
          if (key.startsWith(`labcharts-${id}-chat`)) localStorage.removeItem(key);
        }
      }
      state.importedData = original.importedData;
      state.currentProfile = original.currentProfile;
      await profileStore.saveProfiles(original.profiles);
      dataModule.invalidateActiveDataCache?.();
      setOrRemove('labcharts-active-profile', original.activeProfile);
      setOrRemove('labcharts-encryption-enabled', original.encryptionEnabled);
      setOrRemove('labcharts-ai-provider', original.aiProvider);
      setOrRemove('labcharts-ai-paused', original.aiPaused);
      setOrRemove('labcharts-openrouter-key', original.openrouterKey);
      setOrRemove('labcharts-routstr-node', original.routstrNode);
      setOrRemove('labcharts-routstr-session-updated-at', original.routstrSessionUpdatedAt);
      document.getElementById('confirm-dialog-overlay')?.classList.remove('show');
    }

    return outcomes;
  }, {
    exportUrl: moduleUrl('/js/export.js'),
    profileUrl: moduleUrl('/js/profile.js'),
    cryptoUrl: moduleUrl('/js/crypto.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
