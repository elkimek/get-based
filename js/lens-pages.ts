// lens-pages.js — dedicated lens page renderers extracted from views.js

import { state } from './state.js';
import {renderHTML as renderLensDataPage} from './components/LensDataPage.svelte.html.js';
import type {LensDataWidgetContent} from './lens-data-page-presentation.js';
import {renderHTML as renderRecommendationPage} from './components/RecommendationPage.svelte.html.js';
import {projectLensHeader} from './lens-shell-presentation.js';
import {projectRecommendationList, type RecommendationCardView} from './recommendation-presentation.js';
import type {RecommendationPageContent} from './recommendation-page-presentation.js';
import type {LensContentWidget} from './lens-page-shell-core.js';
import {projectGenomeImportDetails, projectBodySources, projectLensActions} from './lens-content-presentation.js';
import { getActiveData, filterDatesByRange, projectDateRangeFilter } from './data.js';
import {
  ensureSNPTable,
  loadContextHealthDots,
  loadContextCardTips,
  projectMenstrualCycleSection,
  projectProfileContextCards,
  projectSupplementsSection,
  projectFuelWidget,
  projectNutritionWidget,
} from './health-data-loader.js';
import { getLoadedBiologyPage, loadBiologyPage } from './biology-page-loader.js';
import { routeRevision } from './route-lifecycle.js';
import { getRecommendationsSnpTable, isRecommendationsProductRecsEnabled } from './recommendations-runtime.js';

// Configured values are opaque. These private views describe only the unchecked
// calls and property operations used below; they do not validate callback output.
type Shell = typeof import('./lens-page-shell-core.js');
type DashboardProjectors = ReturnType<typeof import('./dashboard-widget-renderers.js').createDashboardWidgetRenderers>;
type LabContext = import('../types/dashboard-lab-widget-renderers.js').LabContext;
type CandidateOperations = { source?: unknown; saved?: unknown; dismissed?: unknown };
type LensDependencyOperations = {
  setupDropZone: () => unknown;
  buildDashboardWidgetContext: (data: unknown) => unknown;
  projectLabsPriorityBanner: DashboardProjectors['projectLabsPriorityBanner'];
  projectDashboardQuickMarkersWidget: DashboardProjectors['projectDashboardQuickMarkersWidget'];
  projectDashboardKeyTrendsWidget: DashboardProjectors['projectDashboardKeyTrendsWidget'];
  projectDashboardGenomeWidget: DashboardProjectors['projectDashboardGenomeWidget'];
  projectDashboardWearableTilesWidget: DashboardProjectors['projectDashboardWearableTilesWidget'];
  projectDashboardInsightsListWidget: DashboardProjectors['projectDashboardInsightsListWidget'];
  projectDashboardRecommendationsWidget: DashboardProjectors['projectDashboardRecommendationsWidget'];
  projectFocusCard: typeof import('./focus-card.js').projectFocusCard;
  loadFocusCard: () => unknown;
  getDashboardWidgetPrefs: () => {hidden: {includes(id: string): unknown}};
  getCachedRecommendationsCatalog: () => unknown;
  refreshRecommendationsWhenCatalogReady: () => unknown;
  getGlobalRecommendationCandidates: (ctx: unknown, catalog: unknown, options?: {includeDismissed: boolean}) => CandidateOperations[];
  getLensContentGrid: Shell['getLensContentGrid'];
  getLensWidgetChrome: Shell['getLensWidgetChrome'];
};
type LabMarkerOperations = { values?: {some(predicate: (value: unknown) => boolean): boolean} | null };
type LabDataOperations = { dates?: {length?: unknown}; categories?: Record<string, {singleDate?: unknown; markers?: Record<string, LabMarkerOperations>}> };
type RawFilter = (data: unknown, options: Parameters<typeof filterDatesByRange>[1]) => unknown;

function markerHasData(marker: LabMarkerOperations) {
  return marker.values?.some(v => v !== null) ?? false;
}

function hasAnyLabData(data: unknown) {
  if (!data) return false;
  if ((data as LabDataOperations).dates?.length) return true;
  return Object.values((data as LabDataOperations).categories || {}).some(cat =>
    cat.singleDate || Object.values(cat.markers || {}).some(markerHasData)
  );
}

export function createLensPageHandlers(deps: unknown) {
  const {
    setupDropZone,
    buildDashboardWidgetContext,
    projectLabsPriorityBanner,
    projectDashboardQuickMarkersWidget,
    projectDashboardKeyTrendsWidget,
    projectDashboardGenomeWidget,
    projectDashboardWearableTilesWidget,
    projectDashboardInsightsListWidget,
    projectDashboardRecommendationsWidget,
    projectFocusCard,
    loadFocusCard,
    getDashboardWidgetPrefs,
    getCachedRecommendationsCatalog,
    refreshRecommendationsWhenCatalogReady,
    getGlobalRecommendationCandidates,
    getLensContentGrid,
    getLensWidgetChrome,
  } = deps as LensDependencyOperations;

  function showLabs(preData: unknown) {
    const rawData = preData || getActiveData();
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const range = projectDateRangeFilter();
    const header = projectLensHeader('Labs', '');
    if (!hasAnyLabData(rawData)) {
      main.innerHTML = renderLensDataPage({view: {kind: 'labs-empty', header, range}});
      setupDropZone();
      return;
    }
    const ctx = buildDashboardWidgetContext(rawData) as LabContext;
    const priority = projectLabsPriorityBanner(ctx);
    const grid = getLensContentGrid<LensDataWidgetContent>('labs', [
      {id: 'quick-markers', title: 'Quick Markers', description: 'Pinned and priority-ranked marker tiles', content: {kind: 'quick-markers', view: projectDashboardQuickMarkersWidget(ctx)}, size: 'full', opts: {source: 'Labs'}},
      {id: 'key-trends', title: 'Key Trends', description: 'Auto-selected markers from your current range', content: {kind: 'key-trends', view: projectDashboardKeyTrendsWidget(ctx)}, size: 'full', opts: {source: 'Labs'}},
    ]);
    main.innerHTML = renderLensDataPage({view: {kind: 'labs', header, range, priority, grid}});
    setupDropZone();
  }

  let biologyPageRequest = 0;
  function showBiologyScores(preData: unknown) {
    const request = ++biologyPageRequest;
    const profileId = state.currentProfile;
    const importedData = state.importedData;
    const revision = routeRevision();
    const main = document.getElementById('main-content');
    if (!main) return;
    const render = ({ renderBiologyPage, scheduleBiologyScoreAIReconcile }: NonNullable<ReturnType<typeof getLoadedBiologyPage>>) => {
      const rawData = preData || getActiveData();
      document.body.classList.remove('mobile-dashboard-active');
      const ctx = buildDashboardWidgetContext(rawData);
      // Preserve the captured collection range for the context review snapshot.
      const scoreData = (filterDatesByRange as RawFilter)(rawData, { fallbackToAll: false }) as Parameters<typeof renderBiologyPage>[1];
      main.innerHTML = renderBiologyPage(ctx,scoreData);
      setupDropZone();
      scheduleBiologyScoreAIReconcile();
    };
    const loaded = getLoadedBiologyPage();
    // The hot path retains the original synchronous facade and delegated controls.
    if (loaded) return render(loaded);
    return loadBiologyPage().then(module => {
      if (request !== biologyPageRequest || state.currentProfile !== profileId
        || state.importedData !== importedData || state.currentView !== 'biology-scores' || routeRevision() !== revision
        || document.getElementById('main-content') !== main || !main.isConnected) return false;
      render(module);
      return true;
    });
  }

  function showGenomeLens() {
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const importDetails = projectGenomeImportDetails(state.importedData?.genetics);
    const genetics = state.importedData?.genetics || {};
    const hasSnps = Object.keys(genetics.snps || {}).length > 0;
    const actions = projectLensActions('genome', {hasSnps});
    const header = projectLensHeader('Genome', 'DNA findings and traits linked to your labs.', '', {className: 'genome-lens-header'});
    const widgets: LensContentWidget<LensDataWidgetContent>[] = [
      {id: 'genome', title: 'Genetic Findings & Traits', description: 'Curated SNP context, evidence, and lab-linked modifiers', content: {kind: 'genome', view: projectDashboardGenomeWidget()}, size: 'full', opts: {source: 'Genome'}},
    ];
    if (importDetails) widgets.push({id: 'genome-import', title: 'Import Details', description: 'Source, counts, mtDNA, and file management', content: {kind: 'genome-import', view: importDetails}, size: 'full', opts: {source: 'Genome', dashboardId: ''}});
    const grid = getLensContentGrid('genome', widgets);
    main.innerHTML = renderLensDataPage({view: {kind: 'genome', header, actions, grid}});
  }

  function showHealthLens(route: 'body' | 'nutrition' | 'supplements') {
    const main = document.getElementById('main-content');
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const title = route === 'nutrition' ? 'Nutrition' : route === 'supplements' ? 'Supplements & Medication' : 'Biometrics';
    const header = projectLensHeader(title, '');
    const actions = route === 'body' ? projectLensActions('body') : {buttons: [], affiliate: false};
    const widgets: LensContentWidget<LensDataWidgetContent>[] = route === 'nutrition' ? [
      {id: 'nutrition', title: 'Meals & Nutrition', description: 'Optional photo-assisted meal log with rolling nutrition context', content: {kind: 'nutrition', view: projectNutritionWidget()}, size: 'full', opts: {source: 'Nutrition', dashboardId: 'nutrition'}},
      {id: 'nutrition-fuel-mix', title: 'Fuel Mix Context', description: 'Seven-day carbohydrate and fat mix', content: {kind: 'fuel', view: projectFuelWidget()}, size: 'full', opts: {source: 'Nutrition', dashboardId: 'nutrition-fuel-mix'}},
    ] : route === 'supplements' ? [
      {id: 'supplements', title: 'Supplements & Medication', description: 'Tracked supplements and medications that feed lab and AI context', content: {kind: 'supplements', view: projectSupplementsSection()}, size: 'full', opts: {source: 'Supplements & Medication'}},
    ] : [
      {id: 'wearables', title: 'Biometrics Overview', description: 'User-selected body signal tiles', content: {kind: 'wearables', view: projectDashboardWearableTilesWidget()}, size: 'full', opts: {source: 'Body'}},
      {id: 'body-sources', title: 'Connected Sources', description: 'Wearable and manual sources feeding body context', content: {kind: 'body-sources', view: projectBodySources(state.importedData?.wearableConnections, state.importedData?.wearableSummary)}, size: 'full', opts: {source: 'Body', dashboardId: ''}},
    ];
    if (route === 'body' && state.profileSex === 'female') widgets.push({id: 'cycle', title: 'Cycle', description: 'Menstrual cycle context for hormone, iron, and inflammation interpretation', content: {kind: 'cycle', view: projectMenstrualCycleSection(getActiveData())}, size: 'full', opts: {source: 'Body'}});
    const grid = getLensContentGrid(route, widgets);
    main.innerHTML = renderLensDataPage({view: {kind: route, header, actions, grid}});
    return true;
  }

  function showBodyLens() { return showHealthLens('body'); }
  function showNutritionLens() { return showHealthLens('nutrition'); }
  function showSupplementsLens() { return showHealthLens('supplements'); }

  function showInsightLens(preData: unknown) {
    const rawData = preData || getActiveData();
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const ctx = buildDashboardWidgetContext(rawData);
    const header = projectLensHeader('Insight', '');
    const actions = projectLensActions('insight');
    const grid = getLensContentGrid<LensDataWidgetContent>('insight', [
      {id: 'focus', title: 'Current Focus', description: 'One synthesized read on the latest data', content: {kind: 'focus', view: projectFocusCard()}, size: 'full', opts: {source: 'Insight'}},
      {id: 'recommendations', title: 'Tips to Explore', description: 'General-information ideas connected to your data', content: {kind: 'recommendations', view: projectDashboardRecommendationsWidget(ctx)}, size: 'half', opts: {source: 'Insight'}},
      {id: 'insights', title: 'AI Insights', description: 'Top trend and range reads', content: {kind: 'insights', view: projectDashboardInsightsListWidget(ctx)}, size: 'half', opts: {source: 'Insight'}},
      {id: 'profile-context', title: 'Profile Context', description: 'Goals, history, lifestyle, and context cards', content: {kind: 'profile-context', view: projectProfileContextCards({embedded: true})}, size: 'full', opts: {source: 'Insight'}},
    ]);
    main.innerHTML = renderLensDataPage({view: {kind: 'insight', header, actions, grid}});
    loadFocusCard();
    loadContextHealthDots();
    void loadContextCardTips();
  }

  function getRecommendationsPageGroups(ctx: unknown, catalog: unknown): RecommendationPageContent {
    const active = getGlobalRecommendationCandidates(ctx, catalog);
    const allWithDismissed = getGlobalRecommendationCandidates(ctx, catalog, { includeDismissed: true });
    const saved = allWithDismissed.filter(c => c.saved);
    const dismissed = allWithDismissed.filter(c => c.dismissed);
    if (!active.length && !saved.length && !dismissed.length) {
      return {kind: 'empty'};
    }
    const top = active.slice(0, 4);
    const bySource = new Map<unknown, CandidateOperations[]>();
    for (const candidate of active) {
      if (!bySource.has(candidate.source)) bySource.set(candidate.source, []);
      bySource.get(candidate.source)!.push(candidate);
    }
    const widgets: LensContentWidget<RecommendationCardView[]>[] = [];
    if (top.length) {
      widgets.push({ id: 'recommendations-top', title: 'Tips to Explore', description: 'Ideas selected from the context currently available', content: projectRecommendationList(top), size: 'full', opts: { source: 'Insight', dashboardId: 'recommendations' } });
    }
    for (const source of ['Labs', 'Body', 'Light', 'Genome', 'Insight']) {
      const rows = (bySource.get(source) || []).filter(c => !top.includes(c));
      if (!rows.length) continue;
      widgets.push({ id: `recommendations-${source.toLowerCase()}`, title: `${source} Context`, description: `General-information tips surfaced from ${source}`, content: projectRecommendationList(rows), size: 'full', opts: { source: 'Tips', dashboardId: '' } });
    }
    if (saved.length) {
      widgets.push({ id: 'recommendations-bookmarks', title: 'Bookmarks', description: 'Tips bookmarked for later review', content: projectRecommendationList(saved), size: 'full', opts: { source: 'Tips', dashboardId: '' } });
    }
    if (dismissed.length) {
      widgets.push({ id: 'recommendations-dismissed', title: 'Hidden', description: 'Tips you have hidden from the active view', content: projectRecommendationList(dismissed), size: 'full', opts: { source: 'Tips', dashboardId: '' } });
    }
    return {kind: 'groups', grid: getLensContentGrid('recommendations', widgets)};
  }

  function showRecommendations(preData: unknown) {
    const rawData = preData || getActiveData();
    const ctx = buildDashboardWidgetContext(rawData);
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const prefs = getDashboardWidgetPrefs();
    const recommendationsVisible = !prefs.hidden.includes('recommendations');
    const actions = projectLensActions('tips', {recommendationsVisible});
    const header = projectLensHeader('Tips', 'Optional general-information ideas connected to the signals you choose to track. These are not instructions, a care plan, or medical advice. Product links stay behind the disclosure.');
    const render = (content: RecommendationPageContent) => renderRecommendationPage({view: {header, actions, content}});
    if (!isRecommendationsProductRecsEnabled()) {
      main.innerHTML = render({kind: 'disabled', widget: getLensWidgetChrome('recommendations-disabled', 'Tips are off', 'Enable Tips to show optional general-information ideas', 'full', {dashboardId: ''})});
      return;
    }
    const catalog = getCachedRecommendationsCatalog();
    if (!catalog) {
      refreshRecommendationsWhenCatalogReady();
      main.innerHTML = render({kind: 'loading'});
      return;
    }
    if (state.importedData?.genetics?.snps && !getRecommendationsSnpTable()) {
      ensureSNPTable().then(() => { if (state.currentView === 'recommendations') showRecommendations(getActiveData()); }).catch(() => {});
    }
    main.innerHTML = render(getRecommendationsPageGroups(ctx, catalog));
  }

  return { showLabs, showBiologyScores, showGenomeLens, showBodyLens, showNutritionLens, showSupplementsLens, showInsightLens, showRecommendations };
}
