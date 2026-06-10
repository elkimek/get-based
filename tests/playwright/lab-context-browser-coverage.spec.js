import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?labContextCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isoDaysAgo(daysAgo) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

test('lab context browser coverage exercises toggles lens chunks and wearable context helpers', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-input');

  const results = await page.evaluate(async ({ labContextUrl, recentDates }) => {
    const [labContext, stateModule, dataModule, storeModule] = await Promise.all([
      import(labContextUrl),
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/wearables-store.js'),
    ]);
    const { state } = stateModule;
    const outcomes = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, key ? localStorage.getItem(key) : null];
    }));
    const original = {
      currentProfile: state.currentProfile,
      importedData: state.importedData,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      unitSystem: state.unitSystem,
      rangeMode: state.rangeMode,
    };
    const originalBuildSunContext = window.buildSunContext;

    try {
      localStorage.clear();
      localStorage.setItem('labcharts-active-profile', 'lab-context-browser-coverage');
      state.currentProfile = 'lab-context-browser-coverage';
      state.profileSex = 'female';
      state.profileDob = '1992-02-03';
      state.unitSystem = 'EU';
      state.rangeMode = 'reference';
      state.importedData = {
        entries: [
          {
            date: recentDates.old,
            markers: {
              'coverage.ferritin': 18,
              'coverage.crp': 0.7,
            },
          },
          {
            date: recentDates.current,
            markers: {
              'coverage.ferritin': 44,
              'coverage.crp': 8.2,
            },
          },
        ],
        customMarkers: {
          'coverage.ferritin': {
            categoryLabel: 'Coverage Labs',
            group: 'specialty-coverage',
            name: 'Ferritin Coverage',
            unit: 'ng/mL',
            refMin: 30,
            refMax: 150,
          },
          'coverage.crp': {
            categoryLabel: 'Coverage Labs',
            group: 'specialty-coverage',
            name: 'CRP Coverage',
            unit: 'mg/L',
            refMin: 0,
            refMax: 3,
          },
        },
        healthGoals: [
          { severity: 'major', text: 'Improve inflammatory resilience' },
          { severity: 'minor', text: 'Keep training output stable' },
        ],
        diagnoses: {
          conditions: [{ name: 'Iron deficiency', severity: 'mild', since: '2024' }],
          familyHistory: [{ relative: 'maternal_grandmother', condition: 'Hypothyroidism', onsetAge: 62, note: 'treated' }],
          note: 'Coverage note',
        },
        diet: { type: 'Mediterranean', pattern: 'early dinner', restrictions: ['gluten free'] },
        exercise: { frequency: '4x/week', types: ['strength'], intensity: 'moderate' },
        sleepRest: { duration: '7h', quality: 'variable' },
        lightCircadian: { amLight: 'daily', evening: ['dim lights'], screenTime: '2h' },
        stress: { level: 'moderate', sources: ['work'] },
        loveLife: { status: 'partnered', satisfaction: 'good' },
        environment: { setting: 'urban', water: 'filtered' },
        supplements: [{ name: 'Magnesium', dosage: '200mg', type: 'supplement', startDate: recentDates.old }],
        menstrualCycle: { cycleLength: 29, periodLength: 5, regularity: 'regular', periods: [{ startDate: recentDates.old, endDate: recentDates.old, flow: 'medium' }] },
        notes: [{ date: recentDates.current, text: 'Felt better after sleep extension.' }],
        markerNotes: { 'coverage.ferritin': 'Interpret alongside CRP.' },
        markerValueNotes: { [`coverage.crp:${recentDates.current}`]: 'Had a hard training block.' },
        interpretiveLens: 'Prefer mechanistic interpretations.',
        contextNotes: 'Browser coverage context note.',
        changeHistory: [
          { date: recentDates.old, field: 'contextNotes', snapshot: null },
          { date: recentDates.current, field: 'contextNotes', snapshot: 'New note for coverage.' },
          { date: recentDates.old, field: 'diet', snapshot: { type: 'Standard', restrictions: [] } },
          { date: recentDates.current, field: 'diet', snapshot: { type: 'Mediterranean', restrictions: ['gluten free'], note: 'skip' } },
          { date: recentDates.old, field: 'interpretiveLens', snapshot: 'Old lens framing.' },
          { date: recentDates.current, field: 'interpretiveLens', snapshot: 'Updated lens framing.' },
          { date: recentDates.old, field: 'healthGoals', snapshot: [{ text: 'Base goal' }] },
          { date: recentDates.current, field: 'healthGoals', snapshot: [{ text: 'Base goal' }, { text: 'Added goal' }] },
          { type: 'wearable', ts: `${recentDates.current}T12:00:00Z`, message: 'HRV rebound after rest day.' },
        ],
        wearableSummary: {
          sources: {
            oura: { coverageDays: 30 },
            manual: { coverageDays: 3 },
          },
          metrics: {
            hrv_rmssd: { latest: 51, baseline: 45, trend30d: 'up', weekly: [42, 44, 45, 47, 49, 51], primarySource: 'oura' },
            rhr: { latest: 58, baseline: 62, trend30d: 'down', weekly: [63, 62, 61, 60, 59, 58], primarySource: 'oura' },
            body_fat_pct: { latest: 17.4, baseline: 18.1, trend30d: 'flat', primarySource: 'manual' },
            muscle_mass_kg: { latest: 61.2, baseline: 60.4, trend30d: 'up', primarySource: 'manual' },
            sleep_total_min: { latest: 428, baseline: 405, trend30d: 'up', primarySource: 'oura' },
            sleep_hr_avg: { latest: 55, baseline: 57, trend30d: 'down', primarySource: 'oura' },
            unknown_metric: { latest: 9, baseline: 6, trend30d: 'up', primarySource: 'manual' },
          },
        },
      };
      window.buildSunContext = () => '[section:sun]\nSun context\n[/section:sun]\n\n';
      dataModule.invalidateActiveDataCache();
      labContext.invalidateLabContextCache();

      labContext.setGroupInAIContext('specialty-coverage', true);
      const groupEnabled = labContext.isGroupInAIContext('specialty-coverage') === true;
      labContext.setWearableContextEnabled(false);
      const wearableOff = labContext.isWearableContextEnabled() === false
        && await labContext.buildWearableSeriesSection(7) === '';
      labContext.setWearableContextEnabled(true);
      const wearableOn = labContext.isWearableContextEnabled() === true;

      const withLensBlock = labContext.injectLensChunks(
        '[section:interpretiveLens]\n## Interpretive Lens\nExisting lens\n[/section:interpretiveLens]\n\nBody',
        {
          sourceName: 'Coverage Lens',
          chunks: [
            { text: 'First retrieved chunk', source: 'alpha.md' },
            { text: ' '.repeat(5) + 'x'.repeat(2500), source: 'long.md' },
            { text: '', source: 'empty.md' },
          ],
        }
      );
      const withoutLensBlock = labContext.injectLensChunks('Body only', {
        chunks: [{ text: 'Standalone retrieved chunk' }],
      });
      const lensPassthrough = labContext.injectLensChunks('Base context', { chunks: [] });
      outcomes.lensInjectionCoversInlinePrependAndTrimming =
        withLensBlock.includes('Coverage Lens')
        && withLensBlock.includes('alpha.md')
        && withLensBlock.includes('[trimmed]')
        && withoutLensBlock.startsWith('[section:interpretiveLens]')
        && lensPassthrough === 'Base context';

      const wearableContext = labContext.buildWearableContext(state.importedData);
      outcomes.wearableContextCoversLabelsRollupsWeeklyAndAnomalies =
        wearableContext.includes('Wearables (oura + manual, 30d coverage)')
        && wearableContext.includes('HRV')
        && wearableContext.includes('Resting')
        && wearableContext.includes('Body comp:')
        && wearableContext.includes('Sleep arch:')
        && wearableContext.includes('unknown_metric')
        && wearableContext.includes('Weekly trend')
        && wearableContext.includes('Recent anomalies')
        && wearableContext.includes('HRV rebound');

      labContext.setAgentWearableSeriesDays('bad-value');
      const invalidSeriesSetting = localStorage.getItem('labcharts-lab-context-browser-coverage-agent-wearable-series') === null;
      labContext.setAgentWearableSeriesEnabled(true);
      const enabledDays = labContext.isAgentWearableSeriesEnabled() === true
        && labContext.getAgentWearableSeriesDays() === 30;
      labContext.setAgentWearableSeriesDays(7);
      const sevenDaySetting = labContext.getAgentWearableSeriesDays() === 7;
      labContext.setAgentWearableSeriesEnabled(false);
      const disabledDays = labContext.isAgentWearableSeriesEnabled() === false
        && labContext.getAgentWearableSeriesDays() === 0;
      localStorage.setItem('labcharts-lab-context-browser-coverage-agent-wearable-series', 'on');
      const legacyOnMigrates = labContext.getAgentWearableSeriesDays() === 30;
      outcomes.agentSeriesPreferenceCoversValidInvalidAndLegacy =
        invalidSeriesSetting && enabledDays && sevenDaySetting && disabledDays && legacyOnMigrates;

      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      await storeModule.upsertDailyBatch('lab-context-browser-coverage', [
        { source: 'oura', date: yesterdayStr, hrv_rmssd: 48, rhr: 60, sleep_total_min: 410, sleep_hr_avg: 56 },
        { source: 'oura', date: today, hrv_rmssd: 52, rhr: 58, sleep_total_min: 432, sleep_hr_avg: 55 },
        { source: 'manual', date: today, body_fat_pct: 17.4, muscle_mass_kg: 61.2, tags: ['morning'], note: 'same scale' },
      ]);
      const seriesBlock = await labContext.buildWearableSeriesSection(7);
      outcomes.seriesSectionCoversIdbMatrixAndManualContext =
        seriesBlock.includes('[section:wearables-series-7d]')
        && seriesBlock.includes('HRV')
        && seriesBlock.includes('Resting')
        && seriesBlock.includes('Manual-entry context')
        && seriesBlock.includes('same scale');

      labContext.setWearableContextEnabled(true);
      const context = labContext.buildLabContext({ skipGroupFilter: false });
      const summary = labContext.getContextSummary();
      outcomes.groupAndWearableTogglesAreApplied = groupEnabled && wearableOff && wearableOn;
      outcomes.buildLabContextIncludesSpecialtyLabsAndDiffs =
        context.includes('Coverage Labs')
        && context.includes('Context Change Timeline')
        && context.includes('changed')
        && context.includes('added: Added goal');
      outcomes.buildLabContextIncludesWearablesAndSunHook =
        context.includes('[section:wearables]')
        && context.includes('[section:sun]');
      outcomes.contextSummaryCoversLabMedicalAndNotes =
        summary.some(area => area.label === 'Lab values' && area.detail.includes('2 markers'))
        && summary.some(area => area.label === 'Medical History' && area.detail.includes('condition'))
        && summary.some(area => area.label === 'Context Notes');
    } finally {
      state.currentProfile = original.currentProfile;
      state.importedData = original.importedData;
      state.profileSex = original.profileSex;
      state.profileDob = original.profileDob;
      state.unitSystem = original.unitSystem;
      state.rangeMode = original.rangeMode;
      window.buildSunContext = originalBuildSunContext;
      dataModule.invalidateActiveDataCache();
      labContext.invalidateLabContextCache();
      await storeModule.deleteWearablesDB('lab-context-browser-coverage').catch(() => {});
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    labContextUrl: moduleUrl('/js/lab-context.js'),
    recentDates: {
      old: isoDaysAgo(35),
      current: isoDaysAgo(2),
    },
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
