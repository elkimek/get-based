// lens-pages.js — dedicated lens page renderers extracted from views.js

import { state } from './state.js';
import {renderHTML as renderLensContent} from './components/LensPageContent.svelte.html.js';
import {projectGenomeImportDetails, projectBodySources, projectLensActions} from './lens-content-presentation.js';
import { getActiveData, filterDatesByRange, renderDateRangeFilter } from './data.js';
import {
  ensureSNPTable,
  loadContextHealthDots,
  loadContextCardTips,
  renderMenstrualCycleSection,
  renderProfileContextCards,
  renderSupplementsSection,
  renderFuelWidget,
  renderNutritionWidget,
} from './health-data-loader.js';
import {scheduleBiologyScoreAIReconcile} from './biology-scores.js';
import {renderBiologyPage} from './biology-page-view.js';
import { getRecommendationsSnpTable, isRecommendationsProductRecsEnabled } from './recommendations-runtime.js';

// Configured values are opaque. These private views describe only the unchecked
// calls and property operations used below; they do not validate callback output.
type Shell = typeof import('./lens-page-shell.js');
type LensWidgetInput = Omit<import('./lens-page-shell.js').LensPageWidget, 'opts'> & { opts?: import('./lens-page-shell.js').LensWidgetOptions & {source?: unknown} };
type CandidateOperations = { source?: unknown; saved?: unknown; dismissed?: unknown };
type LensDependencyOperations = {
  setupDropZone: () => unknown;
  buildDashboardWidgetContext: (data: unknown) => unknown;
  renderLabsPriorityBanner: (ctx: unknown) => unknown;
  renderDashboardQuickMarkersWidget: (ctx: unknown) => unknown;
  renderDashboardKeyTrendsWidget: (ctx: unknown) => unknown;
  renderDashboardGenomeWidget: () => unknown;
  renderDashboardWearableTilesWidget: () => unknown;
  renderDashboardInsightsListWidget: (ctx: unknown) => unknown;
  renderDashboardRecommendationsWidget: (ctx: unknown) => unknown;
  renderFocusCard: () => unknown;
  loadFocusCard: () => unknown;
  getDashboardWidgetPrefs: () => {hidden: {includes(id: string): unknown}};
  getCachedRecommendationsCatalog: () => unknown;
  refreshRecommendationsWhenCatalogReady: () => unknown;
  getGlobalRecommendationCandidates: (ctx: unknown, catalog: unknown, options?: {includeDismissed: boolean}) => CandidateOperations[];
  renderRecommendationCard: (candidate: CandidateOperations) => unknown;
  renderRecommendationsEmpty: () => unknown;
  lensPageActionAttrs: (...args: Parameters<Shell['lensPageActionAttrs']>) => unknown;
  renderLensHeader: (...args: Parameters<Shell['renderLensHeader']>) => unknown;
  renderLensPageWidgets: (route: string, widgets: Array<LensWidgetInput | null | undefined | false>, options?: {group: string}) => unknown;
  renderLensWidget: (id: string, title: unknown, description: string | undefined, body: unknown, size?: string, opts?: import('./lens-page-shell.js').LensWidgetOptions & {source?: unknown}) => unknown;
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

function renderGenomeImportDetailsWidget() {
  const view = projectGenomeImportDetails(state.importedData?.genetics);
  return view ? renderLensContent({kind: 'genome-import', view}) : '';
}

function renderBodySourcesWidget() {
  return renderLensContent({kind: 'body-sources', view: projectBodySources(state.importedData?.wearableConnections, state.importedData?.wearableSummary)});
}

export function createLensPageHandlers(deps: unknown) {
  const {
    setupDropZone,
    buildDashboardWidgetContext,
    renderLabsPriorityBanner,
    renderDashboardQuickMarkersWidget,
    renderDashboardKeyTrendsWidget,
    renderDashboardGenomeWidget,
    renderDashboardWearableTilesWidget,
    renderDashboardInsightsListWidget,
    renderDashboardRecommendationsWidget,
    renderFocusCard,
    loadFocusCard,
    getDashboardWidgetPrefs,
    getCachedRecommendationsCatalog,
    refreshRecommendationsWhenCatalogReady,
    getGlobalRecommendationCandidates,
    renderRecommendationCard,
    renderRecommendationsEmpty,
    lensPageActionAttrs,
    renderLensHeader,
    renderLensPageWidgets,
    renderLensWidget,
  } = deps as LensDependencyOperations;

  function showLabs(preData: unknown) {
    const rawData = preData || getActiveData();
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const actions = renderDateRangeFilter();
    let html = renderLensHeader('Labs', '', actions) as string;

    if (!hasAnyLabData(rawData)) {
      html += `<div class="drop-zone" id="drop-zone">
        <div class="drop-zone-icon">\uD83D\uDCC4</div>
        <div class="drop-zone-text">Drop a lab PDF, image, JSON export, or click to browse</div>
        <div class="drop-zone-hint">Your lab markers become searchable categories, charts, and dashboard summaries.</div>
      </div>`;
      main.innerHTML = html;
      setupDropZone();
      return;
    }

    const ctx = buildDashboardWidgetContext(rawData);
    html += renderLabsPriorityBanner(ctx);
    html += renderLensPageWidgets('labs', [
      { id: 'quick-markers', title: 'Quick Markers', description: 'Pinned and priority-ranked marker tiles', body: renderDashboardQuickMarkersWidget(ctx), size: 'full', opts: { source: 'Labs' } },
      { id: 'key-trends', title: 'Key Trends', description: 'Auto-selected markers from your current range', body: renderDashboardKeyTrendsWidget(ctx), size: 'full', opts: { source: 'Labs' } },
    ]);
    main.innerHTML = html;
    setupDropZone();
  }

  function showBiologyScores(preData: unknown) {
    const rawData = preData || getActiveData();
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const ctx = buildDashboardWidgetContext(rawData);
    // Preserve the captured collection range for the context review snapshot.
    const scoreData = (filterDatesByRange as RawFilter)(rawData, { fallbackToAll: false }) as Parameters<typeof renderBiologyPage>[1];
    main.innerHTML = renderBiologyPage(ctx,scoreData);
    setupDropZone();
    scheduleBiologyScoreAIReconcile();
  }

  function showGenomeLens() {
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const importDetails = renderGenomeImportDetailsWidget();
    const genetics = state.importedData?.genetics || {};
    const hasSnps = Object.keys(genetics.snps || {}).length > 0;
    const genomeActions = renderLensContent({kind: 'actions', view: projectLensActions('genome', {hasSnps})});
    let html = renderLensHeader('Genome', 'DNA findings and traits linked to your labs.', genomeActions, { className: 'genome-lens-header' }) as string;
    html += renderLensPageWidgets('genome', [
      { id: 'genome', title: 'Genetic Findings & Traits', description: 'Curated SNP context, evidence, and lab-linked modifiers', body: renderDashboardGenomeWidget(), size: 'full', opts: { source: 'Genome' } },
      importDetails ? { id: 'genome-import', title: 'Import Details', description: 'Source, counts, mtDNA, and file management', body: importDetails, size: 'full', opts: { source: 'Genome', dashboardId: '' } } : null,
    ]);
    main.innerHTML = html;
  }

  function showBodyLens() {
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    let html = renderLensHeader('Body', '', renderLensContent({kind: 'actions', view: projectLensActions('body')})) as string;
    html += renderLensPageWidgets('body', [
      { id: 'wearables', title: 'Biometrics Overview', description: 'User-selected body signal tiles', body: renderDashboardWearableTilesWidget(), size: 'full', opts: { source: 'Body' } },
      { id: 'body-sources', title: 'Connected Sources', description: 'Wearable and manual sources feeding body context', body: renderBodySourcesWidget(), size: 'full', opts: { source: 'Body', dashboardId: '' } },
      { id: 'nutrition', title: 'Meals & Nutrition', description: 'Optional photo-assisted meal log with rolling nutrition context', body: renderNutritionWidget(), size: 'full', opts: { source: 'Body', dashboardId: 'nutrition' } },
      { id: 'nutrition-fuel-mix', title: 'Fuel Mix Context', description: 'Seven-day carbohydrate and fat mix', body: renderFuelWidget(), size: 'full', opts: { source: 'Body', dashboardId: 'nutrition-fuel-mix' } },
      { id: 'supplements', title: 'Supplements & Meds', description: 'Tracked supplements and medications that feed lab and AI context', body: renderSupplementsSection(), size: 'full', opts: { source: 'Body' } },
      state.profileSex === 'female' ? { id: 'cycle', title: 'Cycle', description: 'Menstrual cycle context for hormone, iron, and inflammation interpretation', body: renderMenstrualCycleSection(getActiveData()), size: 'full', opts: { source: 'Body' } } : null,
    ]);
    main.innerHTML = html;
  }

  function showInsightLens(preData: unknown) {
    const rawData = preData || getActiveData();
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const ctx = buildDashboardWidgetContext(rawData);
    let html = renderLensHeader('Insight', '', renderLensContent({kind: 'actions', view: projectLensActions('insight')})) as string;
    html += renderLensPageWidgets('insight', [
      { id: 'focus', title: 'Current Focus', description: 'One synthesized read on the latest data', body: renderFocusCard(), size: 'full', opts: { source: 'Insight' } },
      { id: 'recommendations', title: 'Tips to Explore', description: 'General-information ideas connected to your data', body: renderDashboardRecommendationsWidget(ctx), size: 'half', opts: { source: 'Insight' } },
      { id: 'insights', title: 'AI Insights', description: 'Top trend and range reads', body: renderDashboardInsightsListWidget(ctx), size: 'half', opts: { source: 'Insight' } },
      { id: 'profile-context', title: 'Profile Context', description: 'Goals, history, lifestyle, and context cards', body: renderProfileContextCards({ embedded: true }), size: 'full', opts: { source: 'Insight' } },
    ]);
    main.innerHTML = html;
    loadFocusCard();
    loadContextHealthDots();
    void loadContextCardTips();
  }

  function renderRecommendationsPageGroups(ctx: unknown, catalog: unknown) {
    const active = getGlobalRecommendationCandidates(ctx, catalog);
    const allWithDismissed = getGlobalRecommendationCandidates(ctx, catalog, { includeDismissed: true });
    const saved = allWithDismissed.filter(c => c.saved);
    const dismissed = allWithDismissed.filter(c => c.dismissed);
    if (!active.length && !saved.length && !dismissed.length) {
      return renderRecommendationsEmpty();
    }
    const top = active.slice(0, 4);
    const bySource = new Map<unknown, CandidateOperations[]>();
    for (const candidate of active) {
      if (!bySource.has(candidate.source)) bySource.set(candidate.source, []);
      bySource.get(candidate.source)!.push(candidate);
    }
    const widgets: LensWidgetInput[] = [];
    if (top.length) {
      widgets.push({ id: 'recommendations-top', title: 'Tips to Explore', description: 'Ideas selected from the context currently available', body: `<div class="rec-next-list">${top.map(c => renderRecommendationCard(c)).join('')}</div>`, size: 'full', opts: { source: 'Insight', dashboardId: 'recommendations' } });
    }
    for (const source of ['Labs', 'Body', 'Light', 'Genome', 'Insight']) {
      const rows = (bySource.get(source) || []).filter(c => !top.includes(c));
      if (!rows.length) continue;
      widgets.push({ id: `recommendations-${source.toLowerCase()}`, title: `${source} Context`, description: `General-information tips surfaced from ${source}`, body: `<div class="rec-next-list">${rows.map(c => renderRecommendationCard(c)).join('')}</div>`, size: 'full', opts: { source: 'Tips', dashboardId: '' } });
    }
    if (saved.length) {
      widgets.push({ id: 'recommendations-bookmarks', title: 'Bookmarks', description: 'Tips bookmarked for later review', body: `<div class="rec-next-list">${saved.map(c => renderRecommendationCard(c)).join('')}</div>`, size: 'full', opts: { source: 'Tips', dashboardId: '' } });
    }
    if (dismissed.length) {
      widgets.push({ id: 'recommendations-dismissed', title: 'Hidden', description: 'Tips you have hidden from the active view', body: `<div class="rec-next-list">${dismissed.map(c => renderRecommendationCard(c)).join('')}</div>`, size: 'full', opts: { source: 'Tips', dashboardId: '' } });
    }
    return renderLensPageWidgets('recommendations', widgets);
  }

  function showRecommendations(preData: unknown) {
    const rawData = preData || getActiveData();
    const ctx = buildDashboardWidgetContext(rawData);
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const prefs = getDashboardWidgetPrefs();
    const recommendationsVisible = !prefs.hidden.includes('recommendations');
    const actions = renderLensContent({kind: 'actions', view: projectLensActions('tips', {recommendationsVisible})});
    let html = `<div id="recommendations-page">`;
    html += renderLensHeader('Tips', 'Optional general-information ideas connected to the signals you choose to track. These are not instructions, a care plan, or medical advice. Product links stay behind the disclosure.', actions);
    if (!isRecommendationsProductRecsEnabled()) {
      html += renderLensWidget('recommendations-disabled', 'Tips are off', 'Enable Tips to show optional general-information ideas', `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary" ${lensPageActionAttrs('open-privacy-settings')}>Open settings</button>`, 'full', { source: 'Tips', dashboardId: '' });
      html += `</div>`;
      main.innerHTML = html;
      return;
    }
    const catalog = getCachedRecommendationsCatalog();
    if (!catalog) {
      refreshRecommendationsWhenCatalogReady();
      html += `<div class="dashboard-widget-empty">Loading tips...</div></div>`;
      main.innerHTML = html;
      return;
    }
    if (state.importedData?.genetics?.snps && !getRecommendationsSnpTable()) {
      ensureSNPTable().then(() => { if (state.currentView === 'recommendations') showRecommendations(getActiveData()); }).catch(() => {});
    }
    html += `${renderRecommendationsPageGroups(ctx, catalog)}</div>`;
    main.innerHTML = html;
  }

  return { showLabs, showBiologyScores, showGenomeLens, showBodyLens, showInsightLens, showRecommendations };
}
