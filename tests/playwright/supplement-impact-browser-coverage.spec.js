import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?supplementImpactCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expectAll(outcomes) {
  for (const [name, passed] of Object.entries(outcomes)) {
    expect.soft(passed, name).toBe(true);
  }
}

test('supplement impact browser coverage exercises render cache AI and refresh paths', async ({ page }) => {
  test.setTimeout(30_000);
  const aiRequests = [];
  await page.route('**/v1/chat/completions', async route => {
    const request = route.request();
    const body = request.postDataJSON();
    aiRequests.push(body);
    const isRefresh = aiRequests.length > 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              Creatine: {
                dot: isRefresh ? 'red' : 'green',
                summary: isRefresh ? 'Creatinine rise needs review.' : 'Creatinine rose with stable glucose.',
              },
            }),
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 21, completion_tokens: 9 },
      }),
    });
  });

  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ impactUrl }) => {
    const [
      impact,
      { state },
      data,
      { profileStorageKey },
      supplements,
      { getSupplementRecordId },
    ] = await Promise.all([
      import(impactUrl),
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/profile.js'),
      import('/js/supplements.js'),
      import('/js/supplement-medication-domain.js'),
    ]);

    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const saved = {
      currentProfile: state.currentProfile,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      importedData: clone(state.importedData),
      getOllamaConfig: window.getOllamaConfig,
    };
    const outcomes = {};
    const host = document.createElement('div');
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 100; i += 1) {
        if (predicate()) return;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const supp = {
      name: 'Creatine',
      dosage: '5g',
      type: 'daily',
      startDate: '2024-06-01',
      endDate: null,
      timesPerDay: 2,
      ingredients: [{ name: 'Creatine monohydrate', amount: '890mg' }],
    };
    const overlappingSupp = {
      name: 'Zinc',
      dosage: '15mg',
      type: 'daily',
      startDate: '2024-05-15',
      endDate: null,
      ingredients: [{ name: 'Zinc', amount: '15mg', timesPerDay: 1 }],
    };
    const markerDefs = {
      'coverage.creatinine': { name: 'Creatinine', unit: 'umol/L', refMin: 62, refMax: 106, categoryLabel: 'Coverage' },
      'coverage.glucose': { name: 'Glucose', unit: 'mmol/L', refMin: 3.9, refMax: 5.8, categoryLabel: 'Coverage' },
    };
    const impactEntries = [
      ['2024-03-15', 80, 5.0],
      ['2024-04-15', 84, 5.1],
      ['2024-05-15', 82, 5.2],
      ['2024-07-15', 93, 5.0],
      ['2024-08-15', 95, 5.1],
      ['2024-09-15', 94, 5.0],
    ].map(([date, creatinine, glucose]) => ({
      date,
      markers: {
        'coverage.creatinine': creatinine,
        'coverage.glucose': glucose,
      },
    }));
    const setImportedData = importedData => {
      state.importedData = {
        entries: [],
        supplements: [],
        customMarkers: markerDefs,
        ...importedData,
      };
      data.invalidateActiveDataCache();
    };
    const renderIntoHost = (supplement = supp, editIdx = 0) => {
      host.innerHTML = impact.renderSupplementImpact(supplement, editIdx);
      return host.textContent || '';
    };
    const cacheKey = () => profileStorageKey(state.currentProfile, 'suppImpact');

    try {
      document.body.append(host);
      state.currentProfile = 'supp-impact-coverage';
      state.profileSex = 'male';
      state.profileDob = '1988-01-01';
      window.getOllamaConfig = () => ({ url: 'http://127.0.0.1:11434', apiKey: '' });
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ollama-model', 'supp-impact-coverage-model');

      outcomes.periodFallbackUsesStartEnd = impact.getSupplementPeriods({ startDate: '2024-01-01', endDate: '2024-02-01' })[0].end === '2024-02-01';
      outcomes.periodsOverrideFallback = impact.getSupplementPeriods({ periods: [{ start: '2024-03-01', end: '' }] })[0].start === '2024-03-01';
      outcomes.parseAmountHandlesCommaDecimal = impact.parseAmount('5,4 mg')?.value === 5.4;
      outcomes.parseAmountRejectsText = impact.parseAmount('as needed') === null;
      outcomes.effectiveTimesUsesRowOverride = impact.effectiveTimesPerDay({ timesPerDay: 3 }, { timesPerDay: 2 }) === 3;
      outcomes.effectiveTimesUsesSupplementDefault = impact.effectiveTimesPerDay({}, { timesPerDay: 2 }) === 2;
      outcomes.dailyTotalFormatsInheritedDose = impact.formatSupplementTotal(impact.ingredientDailyTotal({ amount: '890mg' }, { timesPerDay: 2 })) === '1780 mg/day';
      outcomes.dailyTotalRejectsTextDose = impact.ingredientDailyTotal({ amount: 'as needed', timesPerDay: 2 }) === null;
      outcomes.computeRejectsMismatchedInputs = impact.computeSupplementImpact(supp, 'coverage.bad', 'Bad', 'u', [1], ['2024-01-01', '2024-02-01'], 0, 2) === null;
      outcomes.computeStableDirection = impact.computeSupplementImpact(supp, 'coverage.stable', 'Stable', 'u', [10, 10.05], ['2024-05-01', '2024-07-01'], 0, 20)?.direction === 'stable';
      outcomes.computeAllImpactsSortsLargestFirst = impact.computeAllImpacts(supp, {
        dates: impactEntries.map(entry => entry.date),
        categories: {
          coverage: {
            markers: {
              creatinine: { name: 'Creatinine', unit: 'umol/L', values: [80, 84, 82, 93, 95, 94], refMin: 62, refMax: 106 },
              glucose: { name: 'Glucose', unit: 'mmol/L', values: [5.0, 5.1, 5.2, 5.0, 5.1, 5.0], refMin: 3.9, refMax: 5.8 },
            },
          },
        },
      })[0]?.marker === 'coverage.creatinine';

      setImportedData({ entries: [impactEntries[0]], supplements: [supp] });
      outcomes.needsTwoDatesMessage = renderIntoHost().includes('Needs at least 2 lab dates');

      setImportedData({ entries: impactEntries.slice(3), supplements: [supp] });
      outcomes.noBeforeMessage = renderIntoHost().includes('No lab results from before this supplement was started');

      setImportedData({ entries: impactEntries.slice(0, 3), supplements: [supp] });
      outcomes.noAfterMessage = renderIntoHost().includes('No lab results since starting this supplement');

      const stableEntries = impactEntries.map(entry => ({
        date: entry.date,
        markers: {
          'coverage.creatinine': 90,
          'coverage.glucose': 5,
        },
      }));
      setImportedData({ entries: stableEntries, supplements: [supp] });
      outcomes.noSignificantMessage = renderIntoHost().includes('No significant marker changes detected yet');

      localStorage.setItem('labcharts-ai-paused', 'true');
      setImportedData({ entries: impactEntries, supplements: [supp] });
      const noAiText = renderIntoHost();
      outcomes.noAiFallbackSummary = noAiText.includes('Set up an AI provider for impact insights');
      outcomes.noAiDotIsGray = !!host.querySelector('.ctx-health-dot-gray');

      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem(cacheKey(), JSON.stringify({ OldShape: { dot: 'green', summary: 'legacy cache' } }));
      setImportedData({ entries: impactEntries, supplements: [supp, overlappingSupp] });
      const loadingText = renderIntoHost();
      outcomes.aiRenderShowsShimmer = !loadingText.includes('Set up an AI provider') && !!host.querySelector('.ctx-health-dot-shimmer');
      await waitUntil(() => document.getElementById('supp-impact-summary-0')?.textContent?.includes('Creatinine rose'), 'AI impact summary');
      outcomes.aiSummaryAppliedToDom = document.getElementById('supp-impact-summary-0')?.textContent === 'Creatinine rose with stable glucose.';
      outcomes.aiDotAppliedToDom = document.getElementById('supp-impact-dot-0')?.classList.contains('ctx-health-dot-green') === true;
      const supplementCacheKey = getSupplementRecordId(supp) || supp.name;
      await waitUntil(() => {
        const cached = JSON.parse(localStorage.getItem(cacheKey()) || '{}');
        return cached[supplementCacheKey]?.summary === 'Creatinine rose with stable glucose.';
      }, 'AI impact cache');
      const cacheAfterAi = JSON.parse(localStorage.getItem(cacheKey()) || '{}');
      outcomes.aiCacheWritten = cacheAfterAi[supplementCacheKey]?.dot === 'green'
        && cacheAfterAi[supplementCacheKey]?.summary === 'Creatinine rose with stable glucose.';
      outcomes.legacyCacheShapePruned = !('OldShape' in cacheAfterAi);

      const cachedText = renderIntoHost();
      outcomes.cachedRenderShowsSummary = cachedText.includes('Creatinine rose with stable glucose.');
      outcomes.cachedRenderShowsRefresh = !!host.querySelector('.supp-impact-refresh');

      host.querySelector('.supp-impact-refresh')?.click();
      outcomes.refreshUsesModuleHandler = typeof supplements.refreshSupplementImpact === 'function'
        && !('refreshSupplementImpact' in window);
      outcomes.refreshClearsSummaryImmediately = document.getElementById('supp-impact-summary-0')?.textContent === '';
      outcomes.refreshShowsShimmerImmediately = document.getElementById('supp-impact-dot-0')?.classList.contains('ctx-health-dot-shimmer') === true;
      await waitUntil(() => document.getElementById('supp-impact-summary-0')?.textContent?.includes('needs review'), 'refreshed impact summary');
      outcomes.refreshAppliesNewDot = document.getElementById('supp-impact-dot-0')?.classList.contains('ctx-health-dot-red') === true;
      outcomes.refreshAppliesNewSummary = document.getElementById('supp-impact-summary-0')?.textContent === 'Creatinine rise needs review.';
    } finally {
      await wait(100);
      state.currentProfile = saved.currentProfile;
      state.profileSex = saved.profileSex;
      state.profileDob = saved.profileDob;
      state.importedData = saved.importedData;
      data.invalidateActiveDataCache();
      window.getOllamaConfig = saved.getOllamaConfig;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      host.remove();
    }

    return outcomes;
  }, { impactUrl: moduleUrl('/js/supplement-impact.js') });

  expectAll(results);
  expect(aiRequests, 'AI analysis requests').toHaveLength(2);
  for (const request of aiRequests) {
    const messages = request.messages.map(message => message.content).join('\n');
    expect(messages).toContain('Creatine monohydrate 890mg');
    expect(messages).toContain('1780 mg/day');
    expect(messages).toContain('also taking: Zinc');
    expect(request.model).toBe('supp-impact-coverage-model');
  }
});
