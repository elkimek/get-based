// @ts-check
// health-data-loader.js - cached first-use boundaries for Health & Data features.

import { HAPLOGROUP_LIST } from './constants.js';
import { state } from './state.js';
import { configureDashboardNoteActions } from './dashboard-widget-runtime.js';
import {
  configureContextCardsRuntimeCallbacks,
  recordContextCardChange,
} from './context-cards-runtime.js';
import { configureDnaModuleBridge } from './dna-runtime-bridge.js';
import { configureRecommendationModuleBridge } from './recommendations-runtime.js';

/**
 * @template T
 * @param {() => Promise<T>} initialLoad
 * @param {() => Promise<T>} retryLoad
 */
function createLazyModule(initialLoad, retryLoad) {
  /** @type {Promise<T> | null} */
  let promise = null;
  /** @type {T | null} */
  let module = null;
  let useRetryUrl = false;

  return {
    get() {
      return module;
    },
    isLoaded() {
      return module !== null;
    },
    load() {
      if (!promise) {
        const moduleLoad = useRetryUrl ? retryLoad() : initialLoad();
        promise = moduleLoad
          .then(loadedModule => {
            module = loadedModule;
            return loadedModule;
          })
          .catch(err => {
            promise = null;
            module = null;
            useRetryUrl = true;
            throw err;
          });
      }
      return promise;
    },
  };
}

function retryChartsModule() {
  // @ts-expect-error Browsers accept fixed query-string module URLs.
  return import('./charts.js?lazy-retry=1');
}

function retryNotesModule() {
  // @ts-expect-error Browsers accept fixed query-string module URLs.
  return import('./notes.js?lazy-retry=1');
}

function retrySupplementsModule() {
  // @ts-expect-error Browsers accept fixed query-string module URLs.
  return import('./supplements.js?lazy-retry=1');
}

function retryRecommendationsModule() {
  // @ts-expect-error Browsers accept fixed query-string module URLs.
  return import('./recommendations.js?lazy-retry=1');
}

function retryCycleModule() {
  // @ts-expect-error Browsers accept fixed query-string module URLs.
  return import('./cycle.js?lazy-retry=1');
}

function retryContextCardsModule() {
  // @ts-expect-error Browsers accept fixed query-string module URLs.
  return import('./context-cards.js?lazy-retry=1');
}

function retryDnaModule() {
  // @ts-expect-error Browsers accept fixed query-string module URLs.
  return import('./dna.js?lazy-retry=1');
}

const charts = createLazyModule(
  () => import('./charts.js'),
  retryChartsModule,
);
const notes = createLazyModule(
  () => import('./notes.js'),
  retryNotesModule,
);
const supplements = createLazyModule(
  () => import('./supplements.js'),
  retrySupplementsModule,
);
const recommendations = createLazyModule(
  () => import('./recommendations.js'),
  retryRecommendationsModule,
);
const cycle = createLazyModule(
  () => import('./cycle.js'),
  retryCycleModule,
);
const contextCards = createLazyModule(
  () => import('./context-cards.js'),
  retryContextCardsModule,
);
const dna = createLazyModule(
  () => import('./dna.js'),
  retryDnaModule,
);
const nutrition = createLazyModule(
  () => import('./nutrition-context.js'),
  () => import('./nutrition-context.js'),
);

async function loadNutritionFeature() {
  return (await nutrition.load()).loadNutritionFeature();
}

function isNutritionFeatureReady() {
  return !!nutrition.get()?.isNutritionFeatureReady?.();
}

function renderNutritionWidgetRuntime() {
  return nutrition.get()?.renderNutritionWidget?.() || '';
}

function renderFuelWidgetRuntime() {
  return nutrition.get()?.renderFuelWidget?.() || '';
}

export const loadChartsModule = charts.load;
export const loadNotesModule = notes.load;
export const loadSupplementsModule = supplements.load;
export const loadRecommendationsModule = recommendations.load;
export const loadCycleModule = cycle.load;
export const loadContextCardsModule = contextCards.load;
export const loadDnaModule = dna.load;

export const isChartsModuleLoaded = charts.isLoaded;
export const isNotesModuleLoaded = notes.isLoaded;
export const isSupplementsModuleLoaded = supplements.isLoaded;
export const isRecommendationsModuleLoaded = recommendations.isLoaded;
export const isCycleModuleLoaded = cycle.isLoaded;
export const isContextCardsModuleLoaded = contextCards.isLoaded;
export const isDnaModuleLoaded = dna.isLoaded;

export function getLoadedChartsModule() { return charts.get(); }
export function getLoadedNotesModule() { return notes.get(); }
export function getLoadedSupplementsModule() { return supplements.get(); }
export function getLoadedRecommendationsModule() { return recommendations.get(); }
export function getLoadedCycleModule() { return cycle.get(); }
export function getLoadedContextCardsModule() { return contextCards.get(); }
export function getLoadedDnaModule() { return dna.get(); }

export function loadAllHealthDataModules() {
  return Promise.all([
    loadChartsModule(),
    loadNotesModule(),
    loadSupplementsModule(),
    loadRecommendationsModule(),
    loadCycleModule(),
    loadContextCardsModule(),
    loadDnaModule(),
  ]);
}

function hasDashboardData(data) {
  if (!data) return false;
  const wearableMetrics = state.importedData?.wearableSummary?.metrics || {};
  const hasWearableData = Object.values(wearableMetrics).some(metric => metric?.latest != null);
  return Boolean(
    data.dates?.length
    || hasWearableData
    || Number(state.nutritionSummary?.totalMeals || 0) > 0
    || Object.values(data.categories || {}).some(category => category?.singlePoint && category?.singleDate),
  );
}

function productRecommendationsEnabled() {
  try {
    return localStorage.getItem('labcharts-show-product-recs') !== 'false';
  } catch {
    return true;
  }
}

/**
 * @param {any} data
 * @param {{ visibleWidgetIds?: Iterable<string> }} [options]
 */
function getDashboardHealthRequirements(data, options = {}) {
  if (!hasDashboardData(data)) return [];
  const visibleWidgetIds = new Set(options.visibleWidgetIds || []);
  const requirements = [
    { load: loadContextCardsModule, ready: isContextCardsModuleLoaded },
  ];
  if (productRecommendationsEnabled()) {
    requirements.push({ load: loadRecommendationsModule, ready: isRecommendationsModuleLoaded });
  }
  if (
    state.profileSex === 'female'
    && (visibleWidgetIds.has('cycle') || state.importedData?.menstrualCycle)
  ) {
    requirements.push({ load: loadCycleModule, ready: isCycleModuleLoaded });
  }
  if (visibleWidgetIds.has('supplements')) {
    requirements.push({ load: loadSupplementsModule, ready: isSupplementsModuleLoaded });
  }
  if (visibleWidgetIds.has('nutrition') || visibleWidgetIds.has('nutrition-fuel-mix')) {
    requirements.push({ load: loadNutritionFeature, ready: isNutritionFeatureReady });
  }
  if (visibleWidgetIds.has('genome') || state.importedData?.genetics) {
    requirements.push({ load: loadDnaModule, ready: isDnaModuleLoaded });
  }
  return requirements;
}

/**
 * @param {any} data
 * @param {{ visibleWidgetIds?: Iterable<string> }} [options]
 */
export function isDashboardHealthDataReady(data, options = {}) {
  return getDashboardHealthRequirements(data, options).every(requirement => requirement.ready());
}

/**
 * @param {any} data
 * @param {{ visibleWidgetIds?: Iterable<string> }} [options]
 */
export function loadDashboardHealthDataModules(data, options = {}) {
  return Promise.all(getDashboardHealthRequirements(data, options).map(requirement => requirement.load()));
}

export function loadBodyHealthDataModules() {
  const loads = [loadSupplementsModule(), loadNutritionFeature()];
  if (state.profileSex === 'female') loads.push(loadCycleModule());
  return Promise.all(loads);
}

export function isBodyHealthDataReady() {
  return isSupplementsModuleLoaded()
    && isNutritionFeatureReady()
    && (state.profileSex !== 'female' || isCycleModuleLoaded());
}

export function renderNutritionWidget() {
  return renderNutritionWidgetRuntime();
}

export function renderFuelWidget() {
  return renderFuelWidgetRuntime();
}

export function loadInsightHealthDataModules() {
  const loads = [loadContextCardsModule()];
  if (productRecommendationsEnabled()) loads.push(loadRecommendationsModule());
  if (state.importedData?.genetics) loads.push(loadDnaModule());
  return Promise.all(loads);
}

export function isInsightHealthDataReady() {
  return isContextCardsModuleLoaded()
    && (!productRecommendationsEnabled() || isRecommendationsModuleLoaded())
    && (!state.importedData?.genetics || isDnaModuleLoaded());
}

export function loadRecommendationsHealthDataModules() {
  const loads = [];
  if (productRecommendationsEnabled()) loads.push(loadRecommendationsModule());
  if (state.importedData?.genetics) loads.push(loadDnaModule());
  return Promise.all(loads);
}

export function isRecommendationsHealthDataReady() {
  return (!productRecommendationsEnabled() || isRecommendationsModuleLoaded())
    && (!state.importedData?.genetics || isDnaModuleLoaded());
}

export function loadHealthDataContextForPersistedState() {
  const loads = [];
  if (productRecommendationsEnabled()) loads.push(loadRecommendationsModule());
  if (state.importedData?.menstrualCycle) loads.push(loadCycleModule());
  if (state.importedData?.genetics) loads.push(loadDnaModule());
  return Promise.all(loads);
}

// ── Chart facade ────────────────────────────────────────────────────────────

export function ensureChartJs(...args) {
  return loadChartsModule().then(module => module.ensureChartJs(...args));
}

export function isChartDateAdapterReady(...args) {
  return charts.get()?.isChartDateAdapterReady?.(...args) || false;
}

export function formatChartTickValue(value) {
  const loaded = charts.get();
  if (loaded) return loaded.formatChartTickValue(value);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? '');
  const magnitude = Math.abs(numeric);
  const maxFractionDigits = magnitude >= 10 ? 1 : magnitude >= 1 ? 2 : 3;
  const rounded = Number(numeric.toFixed(maxFractionDigits));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function createLineChart(...args) {
  const loaded = charts.get();
  if (loaded) return loaded.createLineChart(...args);
  return loadChartsModule().then(module => module.createLineChart(...args));
}

export function getNotesForChart(...args) {
  return charts.get()?.getNotesForChart?.(...args) || [];
}

export function getSupplementsForChart(...args) {
  return charts.get()?.getSupplementsForChart?.(...args) || [];
}

function createChartPluginProxy(exportName, id) {
  return new Proxy({ id }, {
    get(target, property, receiver) {
      const plugin = charts.get()?.[exportName];
      if (plugin && property in plugin) {
        const value = plugin[property];
        return typeof value === 'function' ? value.bind(plugin) : value;
      }
      return Reflect.get(target, property, receiver);
    },
    has(target, property) {
      const plugin = charts.get()?.[exportName];
      return Boolean(plugin && property in plugin) || Reflect.has(target, property);
    },
  });
}

export const refBandPlugin = createChartPluginProxy('refBandPlugin', 'refBand');
export const noteAnnotationPlugin = createChartPluginProxy('noteAnnotationPlugin', 'noteAnnotations');
export const supplementBarPlugin = createChartPluginProxy('supplementBarPlugin', 'supplementBars');

// ── Notes, supplements, Cycle, and context-card facades ─────────────────────

export function openNoteEditor(...args) {
  return loadNotesModule().then(module => module.openNoteEditor(...args));
}

export function deleteNote(...args) {
  return loadNotesModule().then(module => module.deleteNote(...args));
}

export function renderSupplementsSection(...args) {
  return supplements.get()?.renderSupplementsSection?.(...args) || '';
}

export function openSupplementsEditor(...args) {
  return loadSupplementsModule().then(module => module.openSupplementsEditor(...args));
}

export function renderMenstrualCycleSection(...args) {
  return cycle.get()?.renderMenstrualCycleSection?.(...args) || '';
}

export function openMenstrualCycleEditor(...args) {
  return loadCycleModule().then(module => module.openMenstrualCycleEditor(...args));
}

export function getBloodDrawPhases(...args) {
  return cycle.get()?.getBloodDrawPhases?.(...args) || {};
}

export function getNextBestDrawDate(...args) {
  return cycle.get()?.getNextBestDrawDate?.(...args) || null;
}

export function detectPerimenopausePattern(...args) {
  return cycle.get()?.detectPerimenopausePattern?.(...args) || null;
}

export function detectCycleIronAlerts(...args) {
  return cycle.get()?.detectCycleIronAlerts?.(...args) || [];
}

export function renderProfileContextCards(...args) {
  return contextCards.get()?.renderProfileContextCards?.(...args) || '';
}

export function loadContextHealthDots(...args) {
  return loadContextCardsModule().then(module => module.loadContextHealthDots(...args));
}

export function loadContextCardTips(...args) {
  return loadContextCardsModule().then(module => module.loadContextCardTips(...args));
}

export function closeSuggestionsOnClickOutside(...args) {
  return contextCards.get()?.closeSuggestionsOnClickOutside?.(...args);
}

export function recordChange(field) {
  return recordContextCardChange(field);
}

// ── Recommendation facade and cold-safe runtime bridge ──────────────────────

export function isProductRecsEnabled(...args) {
  return recommendations.get()?.isProductRecsEnabled?.(...args) ?? productRecommendationsEnabled();
}

export function loadCatalog(...args) {
  if (!productRecommendationsEnabled()) return Promise.resolve(null);
  return loadRecommendationsModule().then(module => module.loadCatalog(...args));
}

export function loadEMFCatalog(...args) {
  if (!productRecommendationsEnabled()) return Promise.resolve(null);
  return loadRecommendationsModule().then(module => module.loadEMFCatalog(...args));
}

export function renderEMFMeterRecs(...args) {
  return recommendations.get()?.renderEMFMeterRecs?.(...args) || '';
}

export function renderEMFMitigationRecs(...args) {
  return recommendations.get()?.renderEMFMitigationRecs?.(...args) || '';
}

export function detectMitigationsInText(...args) {
  return recommendations.get()?.detectMitigationsInText?.(...args) || [];
}

export function detectWearableTrendSlots(...args) {
  return recommendations.get()?.detectWearableTrendSlots?.(...args) || [];
}

function callLoadedRecommendation(name, args, fallback) {
  const callback = recommendations.get()?.[name];
  return typeof callback === 'function'
    ? Reflect.apply(callback, recommendations.get(), args)
    : fallback;
}

configureRecommendationModuleBridge({
  isProductRecsEnabled,
  loadCatalog,
  renderRecommendationSection: (...args) => loadRecommendationsModule()
    .then(module => module.renderRecommendationSection(...args)),
  renderRecommendationSectionSync: (...args) => callLoadedRecommendation(
    'renderRecommendationSectionSync',
    args,
    '',
  ),
  detectSupplementSlots: (...args) => callLoadedRecommendation('detectSupplementSlots', args, []),
  buildDNAHints: (...args) => callLoadedRecommendation('buildDNAHints', args, []),
  getCardSlotKeys: (...args) => callLoadedRecommendation('getCardSlotKeys', args, []),
  renderCardTipsModal: (...args) => callLoadedRecommendation('renderCardTipsModal', args, ''),
  detectEMFRelevance: (...args) => callLoadedRecommendation('detectEMFRelevance', args, false),
  renderLightDeviceAffiliateRow: (...args) => callLoadedRecommendation(
    'renderLightDeviceAffiliateRow',
    args,
    '',
  ),
});

// ── DNA facade and cold-safe runtime bridge ─────────────────────────────────

export function ensureSNPTable(...args) {
  if (!state.importedData?.genetics) return Promise.resolve(null);
  return loadDnaModule().then(module => module.ensureSNPTable(...args));
}

export function ensureHaplogroupTable(...args) {
  if (!state.importedData?.genetics?.mtdna) return Promise.resolve(null);
  return loadDnaModule().then(module => module.ensureHaplogroupTable(...args));
}

export function findGenotypeInfo(...args) {
  return dna.get()?.findGenotypeInfo?.(...args) || null;
}

export function getSnpCategoryLabel(category) {
  return dna.get()?.getSnpCategoryLabel?.(category) || String(category || 'Other');
}

export function detectMtDNAMismatch(genetics) {
  return dna.get()?.detectMtDNAMismatch?.(genetics) || null;
}

export function ensureDnaTablesForPersistedState() {
  if (!state.importedData?.genetics) return Promise.resolve(null);
  return loadDnaModule().then(module => Promise.all([
    module.ensureSNPTable(),
    module.ensureHaplogroupTable(),
  ]));
}

function callDnaModule(name, args) {
  return loadDnaModule().then(module => {
    const callback = module[name];
    if (typeof callback !== 'function') {
      throw new Error(`DNA action ${String(name)} is unavailable`);
    }
    return Reflect.apply(callback, module, args);
  });
}

function callLoadedDnaModule(name, args, fallback) {
  const callback = dna.get()?.[name];
  return typeof callback === 'function'
    ? Reflect.apply(callback, dna.get(), args)
    : fallback;
}

const lazyDnaActions = {};
for (const name of [
  'handleDNAFile',
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
]) {
  lazyDnaActions[name] = (...args) => callDnaModule(name, args);
}

configureDnaModuleBridge({
  ...lazyDnaActions,
  buildGeneticsContext: (...args) => callLoadedDnaModule('buildGeneticsContext', args, ''),
  buildSnpAIInterpretationPrompt: (...args) => callLoadedDnaModule('buildSnpAIInterpretationPrompt', args, ''),
  getRelevantSNPs: (...args) => callLoadedDnaModule('getRelevantSNPs', args, []),
  parseClinicalSnpReportText: (...args) => callLoadedDnaModule(
    'parseClinicalSnpReportText',
    args,
    null,
  ),
  parseManualSnpRows: (...args) => callLoadedDnaModule('parseManualSnpRows', args, []),
  upsertGeneticsSnp: (...args) => callLoadedDnaModule('upsertGeneticsSnp', args, null),
  getSnpCategoryLabel,
  HAPLOGROUP_LIST,
});

/** Load only lightweight classifiers before the import UI classifies files. */
export function prepareDnaFileImport() {
  return import('./dna-file-detection.js').then(module => {
    configureDnaModuleBridge({
      detectDNAFile: module.detectDNAFile,
      isDNAFile: module.isDNAFile,
      isDNAFileByContent: module.isDNAFileByContent,
    });
    return module;
  });
}

// Keep actions available before the feature UI has ever been rendered.
configureDashboardNoteActions({ openNoteEditor, deleteNote });
configureContextCardsRuntimeCallbacks({
  openContextModal: (...args) => loadContextCardsModule()
    .then(module => module.openContextModal(...args)),
  openInterpretiveLensEditor: (...args) => loadContextCardsModule()
    .then(module => module.openInterpretiveLensEditor(...args)),
  triggerDNAFilePicker: (...args) => loadContextCardsModule()
    .then(module => module.triggerDNAFilePicker(...args)),
});
