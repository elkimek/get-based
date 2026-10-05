import type { ChartsModule, NotesModule, SupplementsModule, RecommendationsModule, CycleModule, ContextCardsModule, DnaModule, HealthModule, HealthRequirement, DashboardHealthDataReader, DashboardHealthOptions, ChartPluginName } from '../types/health-data-loader.js';
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

function createLazyModule<Module>(initialLoad: () => Promise<Module>, retryLoad: () => Promise<Module>) {
  let promise: Promise<Module> | null = null;
  let module: Module | null = null;
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

function retryChartsModule(): Promise<typeof import('./charts.js')> {
  return import('./charts.js?lazy-retry=1' as './charts.js');
}

function retryNotesModule(): Promise<typeof import('./notes.js')> {
  return import('./notes.js?lazy-retry=1' as './notes.js');
}

function retrySupplementsModule(): Promise<typeof import('./supplements.js')> {
  return import('./supplements.js?lazy-retry=1' as './supplements.js');
}

function retryRecommendationsModule(): Promise<typeof import('./recommendations.js')> {
  return import('./recommendations.js?lazy-retry=1' as './recommendations.js');
}

function retryCycleModule(): Promise<typeof import('./cycle.js')> {
  return import('./cycle.js?lazy-retry=1' as './cycle.js');
}

function retryContextCardsModule(): Promise<typeof import('./context-cards.js')> {
  return import('./context-cards.js?lazy-retry=1' as './context-cards.js');
}

function retryDnaModule(): Promise<typeof import('./dna.js')> {
  return import('./dna.js?lazy-retry=1' as './dna.js');
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

function hasDashboardData(data: unknown) {
  if (!data) return false;
  const wearableMetrics = (state.importedData?.wearableSummary?.metrics || {}) as Record<string, { latest?: unknown } | null | undefined>;
  const hasWearableData = Object.values(wearableMetrics).some(metric => metric?.latest != null);
  return Boolean(
    (data as DashboardHealthDataReader).dates?.length
    || hasWearableData
    || Number(state.nutritionSummary?.totalMeals || 0) > 0
    || Object.values((data as DashboardHealthDataReader).categories || {}).some(category => category?.singlePoint && category?.singleDate),
  );
}

function productRecommendationsEnabled() {
  try {
    return localStorage.getItem('labcharts-show-product-recs') !== 'false';
  } catch {
    return true;
  }
}

function getDashboardHealthRequirements(data: unknown, options: DashboardHealthOptions = {}) {
  if (!hasDashboardData(data)) return [];
  const visibleWidgetIds = new Set(options.visibleWidgetIds || []);
  const requirements: HealthRequirement[] = [
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

export function isDashboardHealthDataReady(data: unknown, options: DashboardHealthOptions = {}) {
  return getDashboardHealthRequirements(data, options).every(requirement => requirement.ready());
}

export function loadDashboardHealthDataModules(data: unknown, options: DashboardHealthOptions = {}) {
  return Promise.all(getDashboardHealthRequirements(data, options).map(requirement => requirement.load()));
}

export function loadBodyHealthDataModules() {
  const loads: Promise<HealthModule>[] = [loadSupplementsModule(), loadNutritionFeature()];
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
  const loads: Promise<HealthModule>[] = [loadContextCardsModule()];
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
  const loads: Promise<HealthModule>[] = [];
  if (productRecommendationsEnabled()) loads.push(loadRecommendationsModule());
  if (state.importedData?.genetics) loads.push(loadDnaModule());
  return Promise.all(loads);
}

export function isRecommendationsHealthDataReady() {
  return (!productRecommendationsEnabled() || isRecommendationsModuleLoaded())
    && (!state.importedData?.genetics || isDnaModuleLoaded());
}

export function loadHealthDataContextForPersistedState() {
  const loads: Promise<HealthModule>[] = [];
  if (productRecommendationsEnabled()) loads.push(loadRecommendationsModule());
  if (state.importedData?.menstrualCycle) loads.push(loadCycleModule());
  if (state.importedData?.genetics) loads.push(loadDnaModule());
  return Promise.all(loads);
}

// ── Chart facade ────────────────────────────────────────────────────────────

export function ensureChartJs(...args: Parameters<ChartsModule['ensureChartJs']>) {
  return loadChartsModule().then(module => module.ensureChartJs(...args));
}

export function isChartDateAdapterReady(...args: Parameters<ChartsModule['isChartDateAdapterReady']>) {
  return charts.get()?.isChartDateAdapterReady?.(...args) || false;
}

export function formatChartTickValue(value: Parameters<ChartsModule['formatChartTickValue']>[0]) {
  const loaded = charts.get();
  if (loaded) return loaded.formatChartTickValue(value);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? '');
  const magnitude = Math.abs(numeric);
  const maxFractionDigits = magnitude >= 10 ? 1 : magnitude >= 1 ? 2 : 3;
  const rounded = Number(numeric.toFixed(maxFractionDigits));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function createLineChart(...args: Parameters<ChartsModule['createLineChart']>) {
  const loaded = charts.get();
  if (loaded) return loaded.createLineChart(...args);
  return loadChartsModule().then(module => module.createLineChart(...args));
}

export function getNotesForChart(...args: Parameters<ChartsModule['getNotesForChart']>) {
  return charts.get()?.getNotesForChart?.(...args) || [];
}

export function getSupplementsForChart(...args: Parameters<ChartsModule['getSupplementsForChart']>) {
  return charts.get()?.getSupplementsForChart?.(...args) || [];
}

function createChartPluginProxy<Name extends ChartPluginName>(exportName: Name, id: string) {
  return new Proxy({ id }, {
    get(target, property, receiver) {
      const plugin = charts.get()?.[exportName];
      if (plugin && property in plugin) {
        const value = (plugin as unknown as Record<PropertyKey, unknown>)[property];
        return typeof value === 'function' ? value.bind(plugin) : value;
      }
      return Reflect.get(target, property, receiver);
    },
    has(target, property) {
      const plugin = charts.get()?.[exportName];
      return Boolean(plugin && property in plugin) || Reflect.has(target, property);
    },
  }) as { id: string } & Partial<ChartsModule[Name]>;
}

export const refBandPlugin = createChartPluginProxy('refBandPlugin', 'refBand');
export const noteAnnotationPlugin = createChartPluginProxy('noteAnnotationPlugin', 'noteAnnotations');
export const supplementBarPlugin = createChartPluginProxy('supplementBarPlugin', 'supplementBars');

// ── Notes, supplements, Cycle, and context-card facades ─────────────────────

export function openNoteEditor(...args: Parameters<NotesModule['openNoteEditor']>) {
  return loadNotesModule().then(module => module.openNoteEditor(...args));
}

export function deleteNote(...args: Parameters<NotesModule['deleteNote']>) {
  return loadNotesModule().then(module => module.deleteNote(...args));
}

export function renderSupplementsSection(...args: Parameters<SupplementsModule['renderSupplementsSection']>) {
  return supplements.get()?.renderSupplementsSection?.(...args) || '';
}

export function openSupplementsEditor(...args: Parameters<SupplementsModule['openSupplementsEditor']>) {
  return loadSupplementsModule().then(module => module.openSupplementsEditor(...args));
}

export function renderMenstrualCycleSection(...args: Parameters<CycleModule['renderMenstrualCycleSection']>) {
  return cycle.get()?.renderMenstrualCycleSection?.(...args) || '';
}

export function openMenstrualCycleEditor(...args: Parameters<CycleModule['openMenstrualCycleEditor']>) {
  return loadCycleModule().then(module => module.openMenstrualCycleEditor(...args));
}

export function getBloodDrawPhases(...args: Parameters<CycleModule['getBloodDrawPhases']>) {
  return cycle.get()?.getBloodDrawPhases?.(...args) || {};
}

export function getNextBestDrawDate(...args: Parameters<CycleModule['getNextBestDrawDate']>) {
  return cycle.get()?.getNextBestDrawDate?.(...args) || null;
}

export function detectPerimenopausePattern(...args: Parameters<CycleModule['detectPerimenopausePattern']>) {
  return cycle.get()?.detectPerimenopausePattern?.(...args) || null;
}

export function detectCycleIronAlerts(...args: Parameters<CycleModule['detectCycleIronAlerts']>) {
  return cycle.get()?.detectCycleIronAlerts?.(...args) || [];
}

export function renderProfileContextCards(...args: Parameters<ContextCardsModule['renderProfileContextCards']>) {
  return contextCards.get()?.renderProfileContextCards?.(...args) || '';
}

export function loadContextHealthDots(...args: Parameters<ContextCardsModule['loadContextHealthDots']>) {
  return loadContextCardsModule().then(module => module.loadContextHealthDots(...args));
}

export function loadContextCardTips(...args: Parameters<ContextCardsModule['loadContextCardTips']>) {
  return loadContextCardsModule().then(module => module.loadContextCardTips(...args));
}

export function closeSuggestionsOnClickOutside(...args: Parameters<ContextCardsModule['closeSuggestionsOnClickOutside']>) {
  return contextCards.get()?.closeSuggestionsOnClickOutside?.(...args);
}

export function recordChange(field: Parameters<typeof recordContextCardChange>[0]) {
  return recordContextCardChange(field);
}

// ── Recommendation facade and cold-safe runtime bridge ──────────────────────

export function isProductRecsEnabled(...args: Parameters<RecommendationsModule['isProductRecsEnabled']>) {
  return recommendations.get()?.isProductRecsEnabled?.(...args) ?? productRecommendationsEnabled();
}

export function loadCatalog(...args: Parameters<RecommendationsModule['loadCatalog']>) {
  if (!productRecommendationsEnabled()) return Promise.resolve(null);
  return loadRecommendationsModule().then(module => module.loadCatalog(...args));
}

export function loadEMFCatalog(...args: Parameters<RecommendationsModule['loadEMFCatalog']>) {
  if (!productRecommendationsEnabled()) return Promise.resolve(null);
  return loadRecommendationsModule().then(module => module.loadEMFCatalog(...args));
}

export function renderEMFMeterRecs(...args: Parameters<RecommendationsModule['renderEMFMeterRecs']>) {
  return recommendations.get()?.renderEMFMeterRecs?.(...args) || '';
}

export function renderEMFMitigationRecs(...args: Parameters<RecommendationsModule['renderEMFMitigationRecs']>) {
  return recommendations.get()?.renderEMFMitigationRecs?.(...args) || '';
}

export function detectMitigationsInText(...args: Parameters<RecommendationsModule['detectMitigationsInText']>) {
  return recommendations.get()?.detectMitigationsInText?.(...args) || [];
}

export function detectWearableTrendSlots(...args: Parameters<RecommendationsModule['detectWearableTrendSlots']>) {
  return recommendations.get()?.detectWearableTrendSlots?.(...args) || [];
}

function callLoadedRecommendation(name: keyof RecommendationsModule, args: unknown[], fallback: unknown) {
  const callback = recommendations.get()?.[name];
  return typeof callback === 'function'
    ? Reflect.apply(callback, recommendations.get(), args) as unknown
    : fallback;
}

configureRecommendationModuleBridge({
  isProductRecsEnabled,
  loadCatalog,
  renderRecommendationSection: (...args: Parameters<RecommendationsModule['renderRecommendationSection']>) => loadRecommendationsModule()
    .then(module => module.renderRecommendationSection(...args)),
  renderRecommendationSectionSync: (...args: unknown[]) => callLoadedRecommendation(
    'renderRecommendationSectionSync',
    args,
    '',
  ),
  detectSupplementSlots: (...args: unknown[]) => callLoadedRecommendation('detectSupplementSlots', args, []),
  buildDNAHints: (...args: unknown[]) => callLoadedRecommendation('buildDNAHints', args, []),
  getCardSlotKeys: (...args: unknown[]) => callLoadedRecommendation('getCardSlotKeys', args, []),
  renderCardTipsModal: (...args: unknown[]) => callLoadedRecommendation('renderCardTipsModal', args, ''),
  detectEMFRelevance: (...args: unknown[]) => callLoadedRecommendation('detectEMFRelevance', args, false),
  renderLightDeviceAffiliateRow: (...args: unknown[]) => callLoadedRecommendation(
    'renderLightDeviceAffiliateRow',
    args,
    '',
  ),
});

// ── DNA facade and cold-safe runtime bridge ─────────────────────────────────

export function ensureSNPTable(...args: Parameters<DnaModule['ensureSNPTable']>) {
  if (!state.importedData?.genetics) return Promise.resolve(null);
  return loadDnaModule().then(module => module.ensureSNPTable(...args));
}

export function ensureHaplogroupTable(...args: Parameters<DnaModule['ensureHaplogroupTable']>) {
  if (!state.importedData?.genetics?.mtdna) return Promise.resolve(null);
  return loadDnaModule().then(module => module.ensureHaplogroupTable(...args));
}

export function findGenotypeInfo(...args: Parameters<DnaModule['findGenotypeInfo']>) {
  return dna.get()?.findGenotypeInfo?.(...args) || null;
}

export function getSnpCategoryLabel(category: Parameters<DnaModule['getSnpCategoryLabel']>[0]) {
  return dna.get()?.getSnpCategoryLabel?.(category) || String(category || 'Other');
}

export function detectMtDNAMismatch(genetics: Parameters<DnaModule['detectMtDNAMismatch']>[0]) {
  return dna.get()?.detectMtDNAMismatch?.(genetics) || null;
}

export function ensureDnaTablesForPersistedState() {
  if (!state.importedData?.genetics) return Promise.resolve(null);
  return loadDnaModule().then(module => Promise.all([
    module.ensureSNPTable(),
    module.ensureHaplogroupTable(),
  ]));
}

function callDnaModule(name: keyof DnaModule, args: unknown[]) {
  return loadDnaModule().then(module => {
    const callback = module[name];
    if (typeof callback !== 'function') {
      throw new Error(`DNA action ${String(name)} is unavailable`);
    }
    return Reflect.apply(callback, module, args) as unknown;
  });
}

function callLoadedDnaModule(name: string, args: unknown[], fallback: unknown) {
  const callback = (dna.get() as Record<string, unknown> | null)?.[name];
  return typeof callback === 'function'
    ? Reflect.apply(callback, dna.get(), args) as unknown
    : fallback;
}

const lazyDnaActions: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
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
  lazyDnaActions[name] = (...args) => callDnaModule(name as keyof DnaModule, args);
}

configureDnaModuleBridge({
  ...lazyDnaActions,
  buildGeneticsContext: (...args: unknown[]) => callLoadedDnaModule('buildGeneticsContext', args, ''),
  buildSnpAIInterpretationPrompt: (...args: unknown[]) => callLoadedDnaModule('buildSnpAIInterpretationPrompt', args, ''),
  getRelevantSNPs: (...args: unknown[]) => callLoadedDnaModule('getRelevantSNPs', args, []),
  parseClinicalSnpReportText: (...args: unknown[]) => callLoadedDnaModule(
    'parseClinicalSnpReportText',
    args,
    null,
  ),
  parseManualSnpRows: (...args: unknown[]) => callLoadedDnaModule('parseManualSnpRows', args, []),
  upsertGeneticsSnp: (...args: unknown[]) => callLoadedDnaModule('upsertGeneticsSnp', args, null),
  getSnpCategoryLabel,
  HAPLOGROUP_LIST,
});

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
  openContextModal: (...args: Parameters<ContextCardsModule['openContextModal']>) => loadContextCardsModule()
    .then(module => module.openContextModal(...args)),
  openInterpretiveLensEditor: (...args: Parameters<ContextCardsModule['openInterpretiveLensEditor']>) => loadContextCardsModule()
    .then(module => module.openInterpretiveLensEditor(...args)),
  triggerDNAFilePicker: (...args: Parameters<ContextCardsModule['triggerDNAFilePicker']>) => loadContextCardsModule()
    .then(module => module.triggerDNAFilePicker(...args)),
});
