import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?reportExportCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('report builder modal delegates presets categories AI state and preview export', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ builderUrl }) => {
    const builder = await import(builderUrl);
    const state = window._labState;
    const outcomes = {};
    if (typeof window.getProfiles !== 'function' || typeof window.saveProfiles !== 'function') {
      throw new Error('Profile helpers are required for report export coverage setup.');
    }
    const originalProfiles = window.getProfiles();
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

    try {
      state.currentProfile = 'report-export-coverage';
      state.profileSex = 'male';
      state.profileDob = '1980-01-02';
      state.dateRangeFilter = 'all';
      state.importedData = {
        entries: [
          {
            date: '2026-01-01',
            markers: {
              'biochemistry.glucose': 5.0,
              'hematology.hemoglobin': 145,
            },
          },
          {
            date: '2026-05-01',
            markers: {
              'biochemistry.glucose': 6.8,
              'hematology.hemoglobin': 142,
            },
          },
        ],
        notes: [{ date: '2026-05-02', text: 'Report export browser note' }],
        supplements: [{
          name: 'Magnesium',
          dosage: '200 mg',
          type: 'supplement',
          startDate: '2026-01-10',
        }],
        biometrics: {
          weight: [{ date: '2026-05-01', value: 82, unit: 'kg' }],
          bp: [{ date: '2026-05-01', sys: 118, dia: 76 }],
          pulse: [{ date: '2026-05-01', value: 61 }],
        },
        diagnoses: {
          conditions: [{ name: 'Insulin resistance', severity: 'watch' }],
          familyHistory: [{ relative: 'father', condition: 'Psoriasis', onsetAge: 18 }],
        },
        customMarkers: {},
      };
      window.invalidateActiveDataCache?.();
      await window.saveProfiles([{
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
        && overlay.querySelectorAll('.report-preset-btn').length === 3
        && overlay.querySelectorAll('input[data-report-section]').length >= 6
        && overlay.querySelectorAll('input[data-report-category]').length >= 2
        && checkedCategories(overlay).includes('biochemistry');

      click('[data-report-action="set-preset"][data-report-preset="full"]');
      await wait();
      overlay = getOverlay();
      outcomes.presetClickRerendersFull = overlay?.dataset.reportPreset === 'full'
        && overlay.querySelector('.report-preset-btn.active')?.textContent.includes('Full lab report') === true
        && overlay.querySelector('#report-date-range')?.value === 'all';

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

      click('[data-report-action="clear-categories"]');
      await wait();
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
    } finally {
      builder.closeReportBuilder();
      state.importedData = original.importedData;
      state.currentProfile = original.currentProfile;
      state.profileSex = original.profileSex;
      state.profileDob = original.profileDob;
      state.dateRangeFilter = original.dateRangeFilter;
      window.invalidateActiveDataCache?.();
      await window.saveProfiles(original.profiles);
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

test('report export helpers cover option normalization AI markup and popup blocking', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ reportUrl, htmlUrl }) => {
    const report = await import(reportUrl);
    const html = await import(htmlUrl);
    const state = window._labState;
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
      window.invalidateActiveDataCache?.();

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
        && normalized.aiSummary.text.includes('Stable <script>alert(1)</script>');

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
      window.invalidateActiveDataCache?.();
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
