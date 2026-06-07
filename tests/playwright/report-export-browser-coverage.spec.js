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
      click('[data-report-action="export"]');
      await wait();
      outcomes.exportRequiresSectionSelection = !!getOverlay()
        && Array.from(document.querySelectorAll('.notification-toast.error'))
          .some(toast => toast.textContent.includes('Choose at least one report section'));
      sectionBoxes.forEach(box => { box.checked = true; });

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

test('report payload and HTML cover filtered context genetics and supplement branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ reportUrl, htmlUrl }) => {
    const [report, html] = await Promise.all([
      import(reportUrl),
      import(htmlUrl),
    ]);
    const state = window._labState;
    const outcomes = {};
    if (typeof window.getProfiles !== 'function' || typeof window.saveProfiles !== 'function') {
      throw new Error('Profile helpers are required for report export coverage setup.');
    }
    const originalProfiles = window.getProfiles();
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
      window.invalidateActiveDataCache?.();
      await window.saveProfiles([{
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
      window.invalidateActiveDataCache?.();
      await window.saveProfiles(original.profiles);
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

test('report AI summary generation covers unavailable success and empty-response paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ reportUrl }) => {
    const report = await import(reportUrl);
    const state = window._labState;
    const outcomes = {};
    const originalProfiles = window.getProfiles();
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
        customMarkers: {},
      };
      window.invalidateActiveDataCache?.();
      await window.saveProfiles([{
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
        && userContext.includes('Recent report notes:');

      returnEmpty = true;
      let emptyResponseThrows = false;
      try {
        await report.generateReportAISummary({ dateRange: 'all' });
      } catch (err) {
        emptyResponseThrows = String(err?.message || err).includes('AI returned an empty summary');
      }
      outcomes.emptySummaryResponseThrows = emptyResponseThrows;
    } finally {
      state.importedData = original.importedData;
      state.currentProfile = original.currentProfile;
      state.profileSex = original.profileSex;
      state.profileDob = original.profileDob;
      window.invalidateActiveDataCache?.();
      await window.saveProfiles(original.profiles);
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
