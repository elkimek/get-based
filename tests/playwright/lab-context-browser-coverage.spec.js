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
    const biologyContextCalls = [];
    const legacyWindowGlobals = [
      'buildLabContext', 'invalidateLabContextCache', 'getContextSummary',
      'isGroupInAIContext', 'setGroupInAIContext',
      'isInsightContextCardsEnabled', 'setInsightContextCardsEnabled',
      'isSupplementsMedsContextEnabled', 'setSupplementsMedsContextEnabled',
      'isLabMarkersContextEnabled', 'setLabMarkersContextEnabled',
      'isGeneticsSummaryInAIContext', 'setGeneticsSummaryInAIContext',
      'isGeneticsPriorityInAIContext', 'setGeneticsPriorityInAIContext',
      'isGeneticsInventoryInAIContext', 'setGeneticsInventoryInAIContext',
      'isLightSunContextEnabled', 'setLightSunContextEnabled',
      'isWearableContextEnabled', 'setWearableContextEnabled',
      'isAgentWearableSeriesEnabled', 'setAgentWearableSeriesEnabled',
      'getAgentWearableSeriesDays', 'setAgentWearableSeriesDays',
      'buildWearableContext', 'buildWearableSeriesSection', 'injectLensChunks',
    ];
    outcomes.legacyWindowFacadeStaysAbsent = legacyWindowGlobals.every(name => !(name in window));
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
    const originalLabContextDeps = labContext.configureLabContext({
      buildBiologyScoresAIContext: (_data, options = {}) => {
        biologyContextCalls.push({ ignoreContextToggles: options.ignoreContextToggles === true });
        return '[section:biologyScores]\nInjected Biology Scores context\n[/section:biologyScores]\n\n';
      },
      buildSunContext: () => '[section:sun]\nSun context\n[/section:sun]\n\n',
    });

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
            context: {
              sampleTime: '08:35',
              fasting: true,
              cycleDay: 27,
              cyclePhase: 'luteal',
              cyclePhaseDetail: 'late_luteal',
              cyclePhaseSource: 'recorded',
            },
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
          conditions: [{ name: 'Iron deficiency', severity: 'mild', status: 'controlled', since: '2024' }],
          familyHistory: [{ relative: 'maternal_grandmother', condition: 'Hypothyroidism', onsetAge: 62, note: 'treated' }],
          proceduresNote: 'Bariatric surgery in 2020',
          flags: { lowMuscleMass: true },
          note: 'Coverage note',
        },
        diet: { type: 'Mediterranean', pattern: 'early dinner', proteinIntake: '1.2–1.6 g/kg/day', hydration: '2–3 L/day', alcohol: 'occasional', recentChanges: ['significant weight loss'], restrictions: ['gluten free'] },
        exercise: { frequency: '4x/week', types: ['strength', 'physiotherapy / rehab'], intensity: 'moderate', duration: '60-90 min', muscleContext: 'muscular', limitations: ['poor recovery'] },
        sleepRest: { duration: '7-8h', quality: 'excellent', daytimeSleepiness: 'often', apneaStatus: 'diagnosed', papUse: 'use consistently' },
        lightCircadian: { amLight: 'daily', evening: ['dim lights'], screenTime: '2h' },
        stress: { level: 'moderate', duration: '6-12 months', trend: 'improving', sources: ['work'] },
        loveLife: { status: 'partnered', satisfaction: 'good', libidoChange: 'decreased', reproductiveGoals: ['trying to conceive'] },
        environment: { setting: 'urban', altitude: 'moderate altitude (1,500-2,500 m)', inhaledExposures: ['secondhand smoke'], occupationalExposures: ['solvents'], water: 'glacier water', air: ['agricultural area / crop spraying nearby'] },
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
            sleep_total_min: { latest: 310, baseline: 405, rolling: { d7: 315 }, trend30d: 'down', primarySource: 'oura' },
            sleep_score: { latest: 61, baseline: 82, rolling: { d7: 61 }, trend30d: 'down', primarySource: 'oura' },
            sleep_hr_avg: { latest: 55, baseline: 57, trend30d: 'down', primarySource: 'oura' },
            unknown_metric: { latest: 9, baseline: 6, trend30d: 'up', primarySource: 'manual' },
          },
        },
        genetics: {
          source: 'Coverage SNPs',
          apoe: 'ε3/ε4',
          snps: {
            rs1801133: {
              genotype: 'GA',
              gene: 'MTHFR',
              variant: 'C677T',
              category: 'methylation',
              effect: 'moderate',
              valence: 'risk',
              note: 'Reduced folate-cycle enzyme activity',
              markers: ['coverage.ferritin'],
            },
            rs1800562: {
              genotype: 'GG',
              gene: 'HFE',
              variant: 'C282Y',
              category: 'iron',
              effect: 'none',
              valence: 'neutral',
              note: 'No hemochromatosis risk from C282Y',
              markers: ['iron.transferrinSat'],
            },
          },
        },
      };
      const healthData = await import('/js/health-data-loader.js');
      await Promise.all([
        healthData.loadCycleModule(),
        healthData.loadDnaModule(),
      ]);
      dataModule.invalidateActiveDataCache();
      labContext.invalidateLabContextCache();

      labContext.setGroupInAIContext('specialty-coverage', false);
      const groupDisabled = labContext.isGroupInAIContext('specialty-coverage') === false;
      const groupSettingSyncedOff = state.importedData.contextSourceSettings?.['lab-group-specialty-coverage'] === false;
      const groupProfile = localStorage.getItem('labcharts-active-profile');
      const groupSettingsForProfile = state.importedData.contextSourceSettings;
      state.importedData.contextSourceSettings = {};
      localStorage.setItem('labcharts-active-profile', 'lab-context-other-profile');
      const groupDefaultsOnInOtherProfile = labContext.isGroupInAIContext('specialty-coverage') === true;
      localStorage.setItem('labcharts-active-profile', groupProfile || 'lab-context-browser-coverage');
      state.importedData.contextSourceSettings = groupSettingsForProfile;
      const groupScopedToProfile = labContext.isGroupInAIContext('specialty-coverage') === false;
      localStorage.removeItem(`labcharts-${groupProfile || 'lab-context-browser-coverage'}-ai-ctx-lab-group-specialty-coverage`);
      const groupProfileSettingControls = labContext.isGroupInAIContext('specialty-coverage') === false;
      labContext.setGroupInAIContext('specialty-coverage', true);
      const groupEnabled = labContext.isGroupInAIContext('specialty-coverage') === true
        && state.importedData.contextSourceSettings?.['lab-group-specialty-coverage'] === true;
      labContext.setLabMarkersContextEnabled(false);
      const labsOffContext = labContext.buildLabContext({ skipGroupFilter: false });
      const labMarkersOff = labContext.isLabMarkersContextEnabled() === false
        && labsOffContext.includes('Lab marker context is turned off')
        && !labsOffContext.includes('Coverage Labs')
        && !labsOffContext.includes('Flagged markers');
      labContext.setLabMarkersContextEnabled(true);
      const labMarkersOn = labContext.isLabMarkersContextEnabled() === true;
      labContext.invalidateLabContextCache();
      const directPreferenceBefore = labContext.buildLabContext({ skipGroupFilter: false });
      state.importedData.contextSourceSettings = { ...(state.importedData.contextSourceSettings || {}), 'lab-markers': false };
      const directPreferenceAfter = labContext.buildLabContext({ skipGroupFilter: false });
      outcomes.directContextPreferenceChangesBreakLabContextCache =
        directPreferenceBefore.includes('Coverage Labs')
        && directPreferenceAfter.includes('Lab marker context is turned off')
        && !directPreferenceAfter.includes('Coverage Labs');
      labContext.setLabMarkersContextEnabled(true);
      labContext.invalidateLabContextCache();
      const directGroupPreferenceBefore = labContext.buildLabContext({ skipGroupFilter: false });
      state.importedData.contextSourceSettings = { ...(state.importedData.contextSourceSettings || {}), 'lab-group-specialty-coverage': false };
      const directGroupPreferenceAfter = labContext.buildLabContext({ skipGroupFilter: false });
      outcomes.directGroupContextPreferenceChangesBreakLabContextCache =
        directGroupPreferenceBefore.includes('Coverage Labs')
        && !directGroupPreferenceAfter.includes('Coverage Labs');
      labContext.setGroupInAIContext('specialty-coverage', true);
      labContext.setWearableContextEnabled(false);
      const wearableOff = labContext.isWearableContextEnabled() === false
        && await labContext.buildWearableSeriesSection(7) === '';
      labContext.setWearableContextEnabled(true);
      const wearableOn = labContext.isWearableContextEnabled() === true;
      outcomes.nullWearableMetricsDoNotCreateFalseSleepMismatch = labContext.getSleepContextMismatch(
        { duration: '7-8h', quality: 'excellent' },
        {
          metrics: {
            sleep_total_min: { latest: null, rolling: { d7: null } },
            sleep_score: { latest: null, rolling: { d7: null } },
          },
        },
      ) === null;
      const bodyContextSynced = state.importedData.biologyScoreContextSettings?.includeBodyContext === true;
      labContext.setInsightContextCardsEnabled(false);
      labContext.setSupplementsMedsContextEnabled(true);
      const insightOffSupplementsOnContext = labContext.buildLabContext({ skipGroupFilter: false });
      const supplementsIndependentFromInsightCards =
        labContext.isInsightContextCardsEnabled() === false
        && labContext.isSupplementsMedsContextEnabled() === true
        && insightOffSupplementsOnContext.includes('Magnesium')
        && !insightOffSupplementsOnContext.includes('Medical History / Diagnoses');
      labContext.setSupplementsMedsContextEnabled(false);
      const supplementsOffContext = labContext.buildLabContext({ skipGroupFilter: false });
      const supplementsMedsToggleOff =
        labContext.isSupplementsMedsContextEnabled() === false
        && !supplementsOffContext.includes('Magnesium');
      labContext.setInsightContextCardsEnabled(true);
      labContext.setSupplementsMedsContextEnabled(true);
      labContext.setLightSunContextEnabled(false);
      const lightContextOff = labContext.isLightSunContextEnabled() === false
        && state.importedData.biologyScoreContextSettings?.includeLightContext === false
        && !labContext.buildLabContext({ skipGroupFilter: false }).includes('[section:sun]');
      labContext.setLightSunContextEnabled(true);
      const lightContextOn = labContext.isLightSunContextEnabled() === true
        && state.importedData.biologyScoreContextSettings?.includeLightContext === true;
      labContext.invalidateLabContextCache();
      const enrichedProfileContext = labContext.buildLabContext({ skipGroupFilter: false });
      outcomes.enrichedProfileFieldsReachInterpretationContext =
        enrichedProfileContext.includes('controlled')
        && enrichedProfileContext.includes('Bariatric surgery in 2020')
        && enrichedProfileContext.includes('Low muscle mass / creatinine may be unreliable')
        && enrichedProfileContext.includes('Protein intake: 1.2–1.6 g/kg/day')
        && enrichedProfileContext.includes('Daily fluid intake: 2–3 L/day')
        && enrichedProfileContext.includes('Typical session: 60-90 min')
        && enrichedProfileContext.includes('physiotherapy / rehab')
        && enrichedProfileContext.includes('Sleep apnea: diagnosed')
        && enrichedProfileContext.includes('profile-versus-tracked-data mismatch')
        && enrichedProfileContext.includes('Duration: 6-12 months')
        && enrichedProfileContext.includes('Libido change: decreased')
        && enrichedProfileContext.includes('Altitude exposure: moderate altitude')
        && enrichedProfileContext.includes('Work / hobby exposures: solvents')
        && enrichedProfileContext.includes('Water: glacier water')
        && enrichedProfileContext.includes('agricultural area / crop spraying nearby');
      labContext.setGeneticsInventoryInAIContext(false);
      const geneticsInventoryOff = labContext.isGeneticsInventoryInAIContext() === false;
      labContext.setGroupInAIContext('specialty-coverage', false);
      labContext.setLabMarkersContextEnabled(false);
      labContext.setInsightContextCardsEnabled(false);
      labContext.setSupplementsMedsContextEnabled(false);
      labContext.setLightSunContextEnabled(false);
      labContext.setWearableContextEnabled(false);
      labContext.setGeneticsSummaryInAIContext(false);
      labContext.setGeneticsPriorityInAIContext(false);
      labContext.setGeneticsInventoryInAIContext(false);
      const agentAccessContext = labContext.buildLabContext({ skipGroupFilter: true, ignoreContextToggles: true });
      const agentAccessHasHfeInventory = ['neutral finding', 'reference finding'].some(label =>
        agentAccessContext.includes(`HFE C282Y rs1800562: GG (${label}; evidence: Not graded; relevance: Relevance not graded; Iron)`));
      outcomes.agentAccessIncludesLabsWhenContextTogglesAreIgnored = agentAccessContext.includes('Coverage Labs');
      outcomes.agentAccessIncludesMedicalHistoryWhenContextTogglesAreIgnored = agentAccessContext.includes('Medical History / Diagnoses');
      outcomes.agentAccessIncludesSupplementsWhenContextTogglesAreIgnored = agentAccessContext.includes('Magnesium');
      outcomes.agentAccessIncludesGeneticsSummaryWhenContextTogglesAreIgnored = agentAccessContext.includes('APOE:');
      outcomes.agentAccessIncludesGeneticsInventoryWhenContextTogglesAreIgnored =
        agentAccessContext.includes('Imported SNP inventory for lookup') && agentAccessHasHfeInventory;
      outcomes.agentAccessIncludesWearablesWhenContextTogglesAreIgnored = agentAccessContext.includes('[section:wearables]');
      outcomes.agentAccessIncludesSunWhenContextTogglesAreIgnored = agentAccessContext.includes('[section:sun]');
      labContext.setGroupInAIContext('specialty-coverage', true);
      labContext.setLabMarkersContextEnabled(true);
      labContext.setInsightContextCardsEnabled(true);
      labContext.setSupplementsMedsContextEnabled(true);
      labContext.setLightSunContextEnabled(true);
      labContext.setWearableContextEnabled(true);
      labContext.setGeneticsSummaryInAIContext(true);
      labContext.setGeneticsPriorityInAIContext(true);
      labContext.setGeneticsInventoryInAIContext(false);

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
        wearableContext.includes('Wearables (')
        && wearableContext.includes('oura')
        && wearableContext.includes('manual')
        && wearableContext.includes('30d coverage')
        && wearableContext.includes('HRV')
        && wearableContext.includes('Resting')
        && wearableContext.includes('Body comp:')
        && wearableContext.includes('Sleep arch:')
        && wearableContext.includes('unknown_metric')
        && wearableContext.includes('Weekly trend')
        && wearableContext.includes('Recent anomalies')
        && wearableContext.includes('HRV rebound');

      labContext.setAgentWearableSeriesDays('bad-value');
      // localStorage.clear() above guarantees this starts absent; invalid values must not create it.
      const invalidSeriesSetting = localStorage.getItem('labcharts-lab-context-browser-coverage-agent-wearable-series') === null;
      labContext.setAgentWearableSeriesEnabled(true);
      const enabledDays = labContext.isAgentWearableSeriesEnabled() === true
        && labContext.getAgentWearableSeriesDays() === 30;
      labContext.setAgentWearableSeriesDays(7);
      const sevenDaySetting = labContext.getAgentWearableSeriesDays() === 7;
      labContext.setAgentWearableSeriesEnabled(false);
      const disabledDays = labContext.isAgentWearableSeriesEnabled() === false
        && labContext.getAgentWearableSeriesDays() === 0;
      delete state.importedData.agentAccessWearableSeriesDays;
      if (state.importedData.agentAccess) delete state.importedData.agentAccess.wearableSeriesDays;
      localStorage.setItem('labcharts-lab-context-browser-coverage-agent-wearable-series', 'on');
      const legacyOnMigrates = labContext.getAgentWearableSeriesDays() === 30;
      state.importedData.agentAccessWearableSeriesDays = 90;
      const syncedPreferenceWins = labContext.getAgentWearableSeriesDays() === 90;
      outcomes.agentSeriesPreferenceCoversValidInvalidAndLegacy =
        invalidSeriesSetting && enabledDays && sevenDaySetting && disabledDays && legacyOnMigrates && syncedPreferenceWins;

      await storeModule.upsertDailyBatch('lab-context-browser-coverage', [
        { source: 'oura', date: recentDates.seriesPrevious, hrv_rmssd: 48, rhr: 60, sleep_total_min: 410, sleep_hr_avg: 56 },
        { source: 'oura', date: recentDates.seriesCurrent, hrv_rmssd: 52, rhr: 58, sleep_total_min: 432, sleep_hr_avg: 55 },
        { source: 'manual', date: recentDates.seriesCurrent, body_fat_pct: 17.4, muscle_mass_kg: 61.2, tags: ['morning'], note: 'same scale' },
      ]);
      const seriesBlock = await labContext.buildWearableSeriesSection(7);
      outcomes.seriesSectionCoversIdbMatrixAndManualContext =
        seriesBlock.includes('[section:wearables-series-7d]')
        && seriesBlock.includes('HRV')
        && seriesBlock.includes('Resting')
        && seriesBlock.includes('Manual-entry context')
        && seriesBlock.includes('same scale');

      labContext.setWearableContextEnabled(true);
      const contextWithoutGeneticsInventory = labContext.buildLabContext({ skipGroupFilter: false });
      labContext.setGeneticsSummaryInAIContext(false);
      const geneticsSummaryOffContext = labContext.buildLabContext({ skipGroupFilter: false });
      const geneticsSummaryOff = labContext.isGeneticsSummaryInAIContext() === false
        && !geneticsSummaryOffContext.includes('APOE:')
        && geneticsSummaryOffContext.includes('MTHFR C677T');
      labContext.setGeneticsSummaryInAIContext(true);
      labContext.setGeneticsPriorityInAIContext(false);
      const geneticsPriorityOffContext = labContext.buildLabContext({ skipGroupFilter: false });
      const geneticsPriorityOff = labContext.isGeneticsPriorityInAIContext() === false
        && geneticsPriorityOffContext.includes('APOE:')
        && !geneticsPriorityOffContext.includes('MTHFR C677T');
      labContext.setGeneticsPriorityInAIContext(true);
      labContext.setGeneticsInventoryInAIContext(true);
      const geneticsInventoryOn = labContext.isGeneticsInventoryInAIContext() === true;
      const context = labContext.buildLabContext({ skipGroupFilter: false });
      const collectionContextBlock = context.match(/\[section:labCollectionContext\]([\s\S]*?)\[\/section:labCollectionContext\]/)?.[1] || '';
      state.importedData.entries[1].context.fasting = false;
      const contextAfterFastingEdit = labContext.buildLabContext({ skipGroupFilter: false });
      const editedCollectionContextBlock = contextAfterFastingEdit.match(/\[section:labCollectionContext\]([\s\S]*?)\[\/section:labCollectionContext\]/)?.[1] || '';
      const contextHasHfeInventory = ['neutral finding', 'reference finding'].some(label =>
        context.includes(`HFE C282Y rs1800562: GG (${label}; evidence: Not graded; relevance: Relevance not graded; Iron)`));
      const summary = labContext.getContextSummary();
      outcomes.groupWearableAndGeneticsTogglesAreApplied = groupDisabled && groupSettingSyncedOff && groupEnabled && groupDefaultsOnInOtherProfile && groupScopedToProfile && groupProfileSettingControls && labMarkersOff && labMarkersOn && wearableOff && wearableOn && bodyContextSynced && supplementsIndependentFromInsightCards && supplementsMedsToggleOff && lightContextOff && lightContextOn && geneticsInventoryOff && geneticsSummaryOff && geneticsPriorityOff && geneticsInventoryOn;
      outcomes.geneticsInventoryToggleControlsNormalSnpContext =
        !contextWithoutGeneticsInventory.includes('Imported SNP inventory for lookup')
        && !contextWithoutGeneticsInventory.includes('HFE C282Y')
        && context.includes('Imported SNP inventory for lookup')
        && contextHasHfeInventory;
      outcomes.buildLabContextIncludesSpecialtyLabs = context.includes('Coverage Labs');
      outcomes.buildLabContextIncludesChangeTimeline = context.includes('Context Change Timeline');
      outcomes.buildLabContextIncludesDietDiff = context.includes('type: Standard') && context.includes('Mediterranean');
      outcomes.buildLabContextIncludesAddedGoalDiff = context.includes('added: Added goal');
      outcomes.buildLabContextIncludesExplicitPerDrawCollectionMetadata =
        collectionContextBlock.includes(`${recentDates.current}: collection time 08:35; fasting`)
        && collectionContextBlock.includes('cycle day 27; late luteal phase (recorded)')
        && !collectionContextBlock.includes(recentDates.old)
        && collectionContextBlock.includes('Omitted fields were not reported; do not infer them');
      outcomes.collectionContextEditsBreakLabContextCache =
        editedCollectionContextBlock.includes(`${recentDates.current}: collection time 08:35; not fasting`)
        && editedCollectionContextBlock !== collectionContextBlock;
      outcomes.buildLabContextIncludesWearablesAndSunHook =
        context.includes('[section:wearables]')
        && context.includes('[section:sun]');
      outcomes.buildLabContextUsesInjectedBiologyScoreBuilder =
        context.includes('Injected Biology Scores context')
        && biologyContextCalls.some(call => call.ignoreContextToggles === false)
        && biologyContextCalls.some(call => call.ignoreContextToggles === true);
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
      labContext.configureLabContext(originalLabContextDeps);
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
      seriesPrevious: isoDaysAgo(1),
      seriesCurrent: isoDaysAgo(0),
    },
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
