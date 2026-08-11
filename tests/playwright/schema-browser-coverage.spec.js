import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?schemaBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/schema-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/schema-browser-coverage', { waitUntil: 'load' });
}

test('schema browser coverage exercises units pricing usage phase ranges and EMF tiers', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ schemaUrl }) => {
    const [schema, { state }] = await Promise.all([
      import(schemaUrl),
      import('/js/state.js'),
    ]);
    const outcomes = {};

    const approxEqual = (actual, expected, epsilon = 0.000001) =>
      Math.abs(actual - expected) <= epsilon;
    const resetStorage = () => {
      for (const key of [
        'labcharts-openrouter-pricing',
        'labcharts-ppq-pricing',
        'labcharts-routstr-pricing',
        'labcharts-venice-pricing',
        'labcharts-schema-profile-usage',
        'labcharts-default-usage',
        'labcharts-global-usage',
      ]) {
        localStorage.removeItem(key);
      }
    };

    const originalProfile = state.currentProfile;
    try {
      resetStorage();

      outcomes.schemaExportsCoreMarkerAndRangeTables =
        schema.MARKER_SCHEMA.biochemistry.markers.glucose.unit === 'mmol/l'
        && schema.MARKER_SCHEMA.vitamins.markers.vitaminD.name === 'Vitamin D Total'
        && schema.UNIT_CONVERSIONS['biochemistry.glucose'].usUnit === 'mg/dl'
        && schema.OPTIMAL_RANGES['calculatedRatios.crpHdlRatio'].optimalMax === 0.24;

      outcomes.schemaExportsStableMarkerIdentityContract =
        schema.BUILTIN_MARKER_IDENTITIES.length === 149
        && schema.getBuiltinMarkerId('biochemistry.glucose') === 'gb:marker:glucose'
        && schema.getBuiltinMarkerDotKey('gb:marker:glucose') === 'biochemistry.glucose'
        && schema.resolveBuiltinMarkerDotKey('lipids.cholHdlRatio') === 'calculatedRatios.cholHdlRatio'
        && schema.BUILTIN_MARKER_DOT_KEY_ALIASES['hormones.cPeptide'] === 'diabetes.cPeptide'
        && schema.CUSTOM_MARKER_ID_PREFIX === 'custom:'
        && schema.isCustomMarkerId('custom:browser_01') === true;

      const glucoseUs = schema.getAlternateUnit('biochemistry.glucose', 5, false);
      const glucoseSi = schema.getAlternateUnit('biochemistry.glucose', 90.09, true);
      const hba1cUs = schema.getAlternateUnit('diabetes.hba1c', 38.8, false);
      const hba1cSi = schema.getAlternateUnit('diabetes.hba1c', 5.7, true);
      outcomes.alternateUnitsHandleMultiplyAndHba1cConversions =
        glucoseUs.value === 90.09
        && glucoseUs.unit === 'mg/dl'
        && glucoseSi.value === 5
        && glucoseSi.unit === 'mmol/l'
        && hba1cUs.value === 5.7
        && hba1cUs.unit === '%'
        && hba1cSi.value === 38.8
        && hba1cSi.unit === 'mmol/mol';
      outcomes.alternateUnitsRejectMissingInvalidAndUnknownInputs =
        schema.getAlternateUnit('biochemistry.glucose', null, false) === null
        && schema.getAlternateUnit('biochemistry.glucose', Number.NaN, false) === null
        && schema.getAlternateUnit('missing.glucose', 5, false) === null
        && schema.getAlternateUnit('biochemistry', 5, false) === null;

      outcomes.userInputConversionYieldsCanonicalSiValues =
        schema.convertUserInputToSI('biochemistry.glucose', 90.09, 'mg/dl') === 5
        && schema.convertUserInputToSI('biochemistry.glucose', 5, 'mmol/l') === 5
        && schema.convertUserInputToSI('diabetes.hba1c', 5.7, '%') === 38.8
        && schema.convertUserInputToSI('missing.marker', 42, 'mg/dl') === 42
        && Number.isNaN(schema.convertUserInputToSI('lipids.cholesterol', Number.NaN, 'mg/dl'));

      localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify({
        'vendor/model': { input: 2, output: 4, source: 'cache' },
      }));
      const cachedPricing = schema.getModelPricing('openrouter', 'vendor/model');
      const datedVenicePricing = schema.getModelPricing('venice', 'claude-sonnet-4-6-20260101');
      const prefixedVenicePricing = schema.getModelPricing('venice', 'claude-sonnet-4-6-latest');
      const fallbackPricing = schema.getModelPricing('openrouter', 'uncached/model');
      const missingPricing = schema.getModelPricing('missing-provider', 'whatever');
      outcomes.modelPricingUsesDynamicCacheDateStrippingPrefixAndFallbacks =
        cachedPricing.input === 2
        && cachedPricing.output === 4
        && datedVenicePricing.input === 3.6
        && datedVenicePricing.output === 18
        && prefixedVenicePricing.input === 3.6
        && fallbackPricing.approx === true
        && fallbackPricing.input === 1
        && missingPricing.input === 0
        && missingPricing.output === 0;

      outcomes.costFormattingCoversCustomFreeTinyAndRoundedCosts =
        schema.calculateCost('custom', 'anything', 1, 1) === -1
        && approxEqual(schema.calculateCost('venice', 'deepseek-v3', 1000000, 1000000), 0.81)
        && schema.formatCost(-1) === 'N/A'
        && schema.formatCost(0) === 'Free'
        && schema.formatCost(0.00005) === '<$0.0001'
        && schema.formatCost(0.0042) === '$0.0042'
        && schema.formatCost(0.12) === '$0.120';

      state.currentProfile = 'schema-profile';
      schema.trackUsage('venice', 'deepseek-v3', 1000000, 500000);
      schema.trackUsage('venice', 'deepseek-v3', 0, 0);
      const profileUsage = schema.getProfileUsage('schema-profile');
      const globalUsage = schema.getGlobalUsage();
      schema.resetProfileUsage('schema-profile');
      const resetProfileUsage = schema.getProfileUsage('schema-profile');
      outcomes.usageTrackingPersistsProfileAndGlobalTotals =
        profileUsage.requestCount === 1
        && profileUsage.totalInputTokens === 1000000
        && profileUsage.totalOutputTokens === 500000
        && approxEqual(profileUsage.totalCost, 0.57)
        && globalUsage.requestCount === 1
        && globalUsage.totalInputTokens === 1000000
        && globalUsage.totalOutputTokens === 500000
        && approxEqual(globalUsage.totalCost, 0.57)
        && resetProfileUsage.requestCount === 0
        && resetProfileUsage.totalCost === 0;

      outcomes.phaseRangesExposeCycleSpecificHormoneBands =
        schema.PHASE_RANGES['hormones.estradiol'].ovulatory.max === 1470
        && schema.PHASE_RANGES['hormones.progesterone'].luteal.min === 5.7
        && schema.PHASE_RANGES['hormones.lh'].ovulatory.min === 14
        && schema.PHASE_RANGES['hormones.fsh'].luteal.max === 7.7;

      const sleepingNoConcern = schema.getEMFSeverity('rfMicrowave', 0.05, true);
      const sleepingBoundary = schema.getEMFSeverity('rfMicrowave', 0.1, true);
      const daytimeSlight = schema.getEMFSeverity('rfMicrowave', 40, false);
      const extremeMagnetic = schema.getEMFSeverity('acMagnetic', 999999, true);
      outcomes.emfSeverityUsesSleepingDaytimeThresholdsAndBoundaries =
        sleepingNoConcern.label === 'No concern'
        && sleepingNoConcern.color === 'green'
        && sleepingBoundary.label === 'Slight concern'
        && daytimeSlight.label === 'Slight concern'
        && extremeMagnetic.label === 'Extreme concern'
        && schema.getEMFSeverity('missing', 10) === null
        && schema.getEMFSeverity('rfMicrowave', null) === null;
    } finally {
      state.currentProfile = originalProfile;
      resetStorage();
    }

    return outcomes;
  }, {
    schemaUrl: moduleUrl('/js/schema.js'),
  });

  const expectedOutcomeKeys = [
    'schemaExportsCoreMarkerAndRangeTables',
    'schemaExportsStableMarkerIdentityContract',
    'alternateUnitsHandleMultiplyAndHba1cConversions',
    'alternateUnitsRejectMissingInvalidAndUnknownInputs',
    'userInputConversionYieldsCanonicalSiValues',
    'modelPricingUsesDynamicCacheDateStrippingPrefixAndFallbacks',
    'costFormattingCoversCustomFreeTinyAndRoundedCosts',
    'usageTrackingPersistsProfileAndGlobalTotals',
    'phaseRangesExposeCycleSpecificHormoneBands',
    'emfSeverityUsesSleepingDaytimeThresholdsAndBoundaries',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
