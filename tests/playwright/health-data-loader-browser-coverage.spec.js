import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?healthDataLoaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="main-content"></main></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('Health and Data modules stay cold and single-flight their first load', async ({ page }) => {
  const moduleNames = [
    'charts',
    'notes',
    'supplements',
    'recommendations',
    'cycle',
    'context-cards',
    'dna',
  ];
  const moduleExports = {
    charts: `
      export function ensureChartJs() { return 'chart-ready'; }
      export function isChartDateAdapterReady() { return true; }
      export function formatChartTickValue(value) { return 'tick:' + value; }
      export function createLineChart() { return 'line-chart'; }
      export function getNotesForChart() { return ['chart-note']; }
      export function getSupplementsForChart() { return ['chart-supplement']; }
      export const refBandPlugin = { id: 'refBand', draw() { return 'ref-draw'; } };
      export const noteAnnotationPlugin = { id: 'noteAnnotations' };
      export const supplementBarPlugin = { id: 'supplementBars' };
    `,
    notes: `
      export function openNoteEditor() { return 'note-opened'; }
      export function deleteNote() { return 'note-deleted'; }
    `,
    supplements: `
      export function renderSupplementsSection() { return 'supplements-rendered'; }
      export function openSupplementsEditor() { return 'supplements-opened'; }
    `,
    recommendations: `
      export function isProductRecsEnabled() { return true; }
      export async function loadCatalog() { return { slots: {} }; }
      export async function loadEMFCatalog() { return { emf: true }; }
      export function renderEMFMeterRecs() { return 'meter-recs'; }
      export function renderEMFMitigationRecs() { return 'mitigation-recs'; }
      export function detectMitigationsInText() { return ['mitigation']; }
      export function detectWearableTrendSlots() { return ['trend-slot']; }
      export async function renderRecommendationSection() { return 'recommendation-section'; }
      export function renderRecommendationSectionSync() { return 'recommendation-sync'; }
      export function detectSupplementSlots() { return ['supplement-slot']; }
      export function buildDNAHints() { return ['dna-hint']; }
      export function getCardSlotKeys() { return ['card-slot']; }
      export function renderCardTipsModal() { return 'card-tips'; }
      export function detectEMFRelevance() { return true; }
      export function renderLightDeviceAffiliateRow() { return 'affiliate-row'; }
    `,
    cycle: `
      export function renderMenstrualCycleSection() { return 'cycle-rendered'; }
      export function openMenstrualCycleEditor() { return 'cycle-opened'; }
      export function getBloodDrawPhases() { return { draw: 'follicular' }; }
      export function getNextBestDrawDate() { return { date: '2026-08-01' }; }
      export function detectPerimenopausePattern() { return { detected: true }; }
      export function detectCycleIronAlerts() { return ['iron-alert']; }
    `,
    'context-cards': `
      export function renderProfileContextCards() { return 'context-rendered'; }
      export function loadContextHealthDots() { return 'health-dots'; }
      export function loadContextCardTips() { return 'context-tips'; }
      export function closeSuggestionsOnClickOutside() { return 'suggestions-closed'; }
      export function openContextModal() { return 'context-opened'; }
      export function openInterpretiveLensEditor() { return 'lens-opened'; }
      export function triggerDNAFilePicker() { return 'dna-picker-opened'; }
    `,
    dna: `
      export function ensureSNPTable() { return 'snp-table'; }
      export function ensureHaplogroupTable() { return 'haplogroup-table'; }
      export function findGenotypeInfo() { return { gene: 'MTHFR' }; }
      export function getSnpCategoryLabel(category) { return 'category:' + category; }
      export function buildGeneticsContext() { return 'genetics-context'; }
      export function getRelevantSNPs() { return ['relevant-snp']; }
      export function handleDNAFile() { return 'dna-file-handled'; }
      export function handleSnpReportFile() { return 'snp-report-handled'; }
      export function importSnpReport() { return 'snp-report-imported'; }
      export function openManualSnpModal() { return 'manual-snp-opened'; }
      export function saveManualSnpFromModal() { return 'manual-snp-saved'; }
      export function closeDNAImportPreview() { return 'dna-preview-closed'; }
      export function confirmDNAImport() { return 'dna-import-confirmed'; }
      export function confirmDeleteDNA() { return 'dna-delete-confirmed'; }
      export function deleteGeneticsData() { return 'genetics-deleted'; }
      export function toggleGeneticsCollapse() { return 'genetics-collapsed'; }
      export function toggleGeneticsExpand() { return 'genetics-expanded'; }
      export function reimportDNA() { return 'dna-reimported'; }
      export function handleMtDNAFile() { return 'mtdna-file-handled'; }
      export function closeMtDNAPreview() { return 'mtdna-preview-closed'; }
      export function confirmMtDNAImport() { return 'mtdna-import-confirmed'; }
      export function deleteMtDNAData() { return 'mtdna-deleted'; }
      export function setManualHaplogroup() { return 'haplogroup-set'; }
      export function parseClinicalSnpReportText() { return { parsed: true }; }
      export function parseManualSnpRows() { return [{ parsed: true }]; }
      export function upsertGeneticsSnp() { return { saved: true }; }
    `,
  };
  const requestCounts = Object.fromEntries(moduleNames.map(name => [name, 0]));
  for (const name of moduleNames) {
    await page.route(`**/js/${name}.js`, route => {
      requestCounts[name] += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          globalThis.__healthDataEvals = globalThis.__healthDataEvals || {};
          globalThis.__healthDataEvals['${name}'] = (globalThis.__healthDataEvals['${name}'] || 0) + 1;
          export const marker = '${name}';
          ${moduleExports[name]}
        `,
      });
    });
  }
  await openBlankPage(page, '/health-data-loader-cache-coverage');

  const results = await page.evaluate(async ({ loaderUrl, moduleNames }) => {
    const loader = await import(loaderUrl);
    const startsCold = moduleNames.every(name => {
      const exportName = `is${name
        .split('-')
        .map(part => part[0].toUpperCase() + part.slice(1))
        .join('')}ModuleLoaded`;
      return loader[exportName]() === false;
    });
    const [first, second] = await Promise.all([
      loader.loadAllHealthDataModules(),
      loader.loadAllHealthDataModules(),
    ]);
    const third = await loader.loadAllHealthDataModules();
    const [{ state }, contextRuntime, dnaBridge, recommendationRuntime] = await Promise.all([
      import('/js/state.js'),
      import('/js/context-cards-runtime.js'),
      import('/js/dna-runtime-bridge.js'),
      import('/js/recommendations-runtime.js'),
    ]);
    state.profileSex = 'female';
    state.importedData = {
      entries: [{ date: '2026-07-01', markers: { 'coverage.marker': 1 } }],
      genetics: { snps: { rs1801133: { genotype: 'GA' } }, mtdna: { haplogroup: 'H1' } },
      menstrualCycle: { periods: [{ startDate: '2026-07-01' }] },
      wearableSummary: { metrics: { rhr: { latest: 60 } } },
    };
    const dashboardData = {
      dates: ['2026-07-01'],
      categories: {
        coverage: {
          markers: {
            marker: { values: [1] },
          },
        },
      },
    };
    const dashboardOptions = { visibleWidgetIds: ['cycle', 'supplements', 'genome'] };
    const facadeResults = await Promise.all([
      loader.ensureChartJs(),
      loader.createLineChart(),
      loader.openNoteEditor(),
      loader.deleteNote(),
      loader.openSupplementsEditor(),
      loader.openMenstrualCycleEditor(),
      loader.loadContextHealthDots(),
      loader.loadContextCardTips(),
      loader.loadCatalog(),
      loader.loadEMFCatalog(),
      loader.ensureSNPTable(),
      loader.ensureHaplogroupTable(),
      loader.ensureDnaTablesForPersistedState(),
      loader.loadDashboardHealthDataModules(dashboardData, dashboardOptions),
      loader.loadBodyHealthDataModules(),
      loader.loadInsightHealthDataModules(),
      loader.loadRecommendationsHealthDataModules(),
      loader.loadHealthDataContextForPersistedState(),
      recommendationRuntime.getRecommendationModuleFunction('renderRecommendationSection')?.('slot'),
      dnaBridge.getDnaModuleFunction('handleDNAFile')?.({ name: 'dna.txt' }),
      ...[
        'handleSnpReportFile',
        'importSnpReport',
        'openManualSnpModal',
        'saveManualSnpFromModal',
        'closeDNAImportPreview',
        'confirmDNAImport',
        'confirmDeleteDNA',
        'deleteGeneticsData',
        'toggleGeneticsCollapse',
        'toggleGeneticsExpand',
        'reimportDNA',
        'handleMtDNAFile',
        'closeMtDNAPreview',
        'confirmMtDNAImport',
        'deleteMtDNAData',
        'setManualHaplogroup',
      ].map(name => dnaBridge.getDnaModuleFunction(name)?.()),
    ]);
    loader.recordChange('genetics');
    const synchronousFacadeResults = [
      loader.isChartDateAdapterReady(),
      loader.formatChartTickValue(12),
      loader.getNotesForChart(),
      loader.getSupplementsForChart(),
      loader.refBandPlugin.draw(),
      'draw' in loader.refBandPlugin,
      loader.renderSupplementsSection(),
      loader.renderMenstrualCycleSection(),
      loader.getBloodDrawPhases(),
      loader.getNextBestDrawDate(),
      loader.detectPerimenopausePattern(),
      loader.detectCycleIronAlerts(),
      loader.renderProfileContextCards(),
      loader.closeSuggestionsOnClickOutside(),
      loader.isProductRecsEnabled(),
      loader.renderEMFMeterRecs(),
      loader.renderEMFMitigationRecs(),
      loader.detectMitigationsInText(),
      loader.detectWearableTrendSlots(),
      loader.findGenotypeInfo(),
      loader.getSnpCategoryLabel('methylation'),
      loader.isDashboardHealthDataReady(dashboardData, dashboardOptions),
      loader.isBodyHealthDataReady(),
      loader.isInsightHealthDataReady(),
      loader.isRecommendationsHealthDataReady(),
      moduleNames.map((_name, index) => [
        loader.getLoadedChartsModule,
        loader.getLoadedNotesModule,
        loader.getLoadedSupplementsModule,
        loader.getLoadedRecommendationsModule,
        loader.getLoadedCycleModule,
        loader.getLoadedContextCardsModule,
        loader.getLoadedDnaModule,
      ][index]()),
      dnaBridge.getDnaModuleFunction('buildGeneticsContext')?.({}),
      dnaBridge.getDnaModuleFunction('getRelevantSNPs')?.({}),
      dnaBridge.getDnaModuleFunction('parseClinicalSnpReportText')?.('report'),
      dnaBridge.getDnaModuleFunction('parseManualSnpRows')?.([]),
      dnaBridge.getDnaModuleFunction('upsertGeneticsSnp')?.({}),
      contextRuntime.openContextModalRuntime(),
      contextRuntime.openInterpretiveLensEditorRuntime(),
      contextRuntime.triggerContextCardDNAFilePickerRuntime(),
      recommendationRuntime.getRecommendationModuleFunction('renderRecommendationSectionSync')?.('slot'),
      recommendationRuntime.getRecommendationModuleFunction('detectSupplementSlots')?.({}),
      recommendationRuntime.getRecommendationModuleFunction('buildDNAHints')?.('slot'),
      recommendationRuntime.getRecommendationModuleFunction('getCardSlotKeys')?.({}),
      recommendationRuntime.getRecommendationModuleFunction('renderCardTipsModal')?.({}),
      recommendationRuntime.getRecommendationModuleFunction('detectEMFRelevance')?.({}),
      recommendationRuntime.getRecommendationModuleFunction('renderLightDeviceAffiliateRow')?.({}),
    ];
    return {
      startsCold,
      concurrentLoadsShareNamespaces: first.every((module, index) => module === second[index]),
      laterLoadsReuseNamespaces: first.every((module, index) => module === third[index]),
      loadedStateFlipsForEveryModule: [
        loader.isChartsModuleLoaded(),
        loader.isNotesModuleLoaded(),
        loader.isSupplementsModuleLoaded(),
        loader.isRecommendationsModuleLoaded(),
        loader.isCycleModuleLoaded(),
        loader.isContextCardsModuleLoaded(),
        loader.isDnaModuleLoaded(),
      ].every(Boolean),
      eachModuleEvaluatesOnce: moduleNames.every(name => globalThis.__healthDataEvals?.[name] === 1),
      facadesDelegateAfterLoading:
        facadeResults.every(result => result !== undefined)
        && synchronousFacadeResults.every(result => result !== undefined),
    };
  }, {
    loaderUrl: moduleUrl('/js/health-data-loader.js'),
    moduleNames,
  });
  results.eachModuleRequestedOnce = Object.values(requestCounts).every(count => count === 1);

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Health and Data modules clear failed loads and use fixed retry URLs', async ({ page }) => {
  const modules = [
    ['charts', 'Charts'],
    ['notes', 'Notes'],
    ['supplements', 'Supplements'],
    ['recommendations', 'Recommendations'],
    ['cycle', 'Cycle'],
    ['context-cards', 'ContextCards'],
    ['dna', 'Dna'],
  ];
  const requestUrls = Object.fromEntries(modules.map(([name]) => [name, []]));
  for (const [name] of modules) {
    await page.route(`**/js/${name}.js*`, route => {
      const url = route.request().url();
      requestUrls[name].push(url);
      if (!url.includes('lazy-retry=1')) return route.abort('failed');
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          globalThis.__healthDataRetryEvals = globalThis.__healthDataRetryEvals || {};
          globalThis.__healthDataRetryEvals['${name}'] = (globalThis.__healthDataRetryEvals['${name}'] || 0) + 1;
          export const marker = '${name}-retried';
        `,
      });
    });
  }
  await openBlankPage(page, '/health-data-loader-retry-coverage');

  const results = await page.evaluate(async ({ loaderUrl, modules }) => {
    const loader = await import(loaderUrl);
    const outcomes = [];
    for (const [name, exportStem] of modules) {
      const load = loader[`load${exportStem}Module`];
      const isLoaded = loader[`is${exportStem}ModuleLoaded`];
      let firstRejected = false;
      try {
        await load();
      } catch {
        firstRejected = true;
      }
      const unloadedAfterFailure = isLoaded() === false;
      const retried = await load();
      outcomes.push(
        firstRejected
        && unloadedAfterFailure
        && retried.marker === `${name}-retried`
        && isLoaded() === true
        && globalThis.__healthDataRetryEvals?.[name] === 1
      );
    }
    return {
      everyModuleClearsFailureAndRetries: outcomes.every(Boolean),
    };
  }, {
    loaderUrl: moduleUrl('/js/health-data-loader.js'),
    modules,
  });
  results.initialAndRetryRequested = Object.values(requestUrls).every(urls =>
    urls.length === 2
    && new URL(urls[0]).search === ''
    && new URL(urls[1]).searchParams.get('lazy-retry') === '1'
  );

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
