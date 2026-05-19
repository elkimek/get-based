// lens-pages.js — dedicated lens page renderers extracted from views.js

import { state } from './state.js';
import { escapeHTML } from './utils.js';
import { getActiveData, renderDateRangeFilter } from './data.js';
import { ensureSNPTable } from './dna.js';
import { renderSupplementsSection } from './supplements.js';
import { renderMenstrualCycleSection } from './cycle.js';
import { renderProfileContextCards, loadContextHealthDots } from './context-cards.js';

function markerHasData(marker) {
  return marker.values?.some(v => v !== null) ?? false;
}

function hasAnyLabData(data) {
  if (!data) return false;
  if (data.dates?.length) return true;
  return Object.values(data.categories || {}).some(cat =>
    cat.singleDate || Object.values(cat.markers || {}).some(markerHasData)
  );
}

function renderGenomeImportDetailsWidget() {
  const genetics = state.importedData?.genetics;
  const snps = genetics?.snps || {};
  const snpCount = Object.keys(snps).length;
  const hasMtdna = !!genetics?.mtdna;
  if (!genetics || (!snpCount && !hasMtdna)) return '';

  const coverage = genetics.coverage && Number.isFinite(Number(genetics.coverage.found)) && Number.isFinite(Number(genetics.coverage.total))
    ? `${Number(genetics.coverage.found).toLocaleString()} / ${Number(genetics.coverage.total).toLocaleString()} catalog SNPs matched`
    : '';
  const cards = [
    {
      label: 'Autosomal SNPs',
      value: snpCount ? snpCount.toLocaleString() : '0',
      sub: genetics.source || 'No raw autosomal import',
    },
    genetics.importDate ? {
      label: 'Imported',
      value: genetics.importDate,
      sub: coverage || 'Raw file processed locally',
    } : null,
    genetics.apoe ? {
      label: 'APOE',
      value: genetics.apoe,
      sub: 'Haplotype context',
    } : null,
    hasMtdna ? {
      label: 'mtDNA',
      value: genetics.mtdna.haplogroup,
      sub: genetics.mtdna.coupling?.shortLabel || genetics.mtdna.source || 'Maternal lineage',
    } : null,
  ].filter(Boolean);

  const mtdnaDetail = hasMtdna ? `<div class="db-genome-import-note">
    <strong>mtDNA ${escapeHTML(genetics.mtdna.haplogroup)}</strong>
    <span>${escapeHTML(genetics.mtdna.coupling?.label || 'Haplogroup stored')}${genetics.mtdna.importDate ? ` · ${escapeHTML(genetics.mtdna.importDate)}` : ''}</span>
  </div>` : '';

  return `<div class="genome-import-details">
    <div class="genetics-overview-grid">
      ${cards.map(card => `<div class="genetics-overview-card">
        <span class="genetics-overview-label">${escapeHTML(card.label)}</span>
        <strong>${escapeHTML(card.value)}</strong>
        <small>${escapeHTML(card.sub)}</small>
      </div>`).join('')}
    </div>
    ${mtdnaDetail}
    <div class="dashboard-widget-inline-controls">
      <button type="button" class="dashboard-action-btn" onclick="window.reimportDNA ? window.reimportDNA() : (window.triggerDNAFilePicker && window.triggerDNAFilePicker())">Re-import</button>
      <button type="button" class="dashboard-action-btn" onclick="window.confirmDeleteDNA && window.confirmDeleteDNA()">Delete genome data</button>
    </div>
  </div>`;
}

function renderBodySourcesWidget() {
  const connections = state.importedData?.wearableConnections || {};
  const summary = state.importedData?.wearableSummary || null;
  const ids = Object.keys(connections);
  if (!ids.length && !summary?.sources) {
    return `<button type="button" class="db-correlation-empty" onclick="window.openSettingsModal && window.openSettingsModal('wearables')">
      <strong>Connect body data</strong>
      <span>Oura, Withings, Fitbit, Polar, Apple Health, or manual logging can feed HRV, sleep, recovery, blood pressure, and body composition.</span>
    </button>`;
  }
  const sourceIds = Array.from(new Set([...ids, ...Object.keys(summary?.sources || {})]));
  const cards = sourceIds.map(id => {
    const source = connections[id] || summary?.sources?.[id] || {};
    const lastSync = source.lastSyncAt ? new Date(source.lastSyncAt).toLocaleDateString() : 'not synced';
    const coverage = source.coverageDays ? `${source.coverageDays}d coverage` : 'coverage pending';
    return `<button type="button" class="dashboard-widget-picker-card" onclick="window.openSettingsModal && window.openSettingsModal('wearables')">
      <span class="dashboard-widget-picker-title">${escapeHTML(id === 'manual' ? 'Manual logs' : id)}</span>
      <span class="dashboard-widget-picker-sub">${escapeHTML(lastSync)} · ${escapeHTML(coverage)}</span>
      <span class="dashboard-widget-picker-action">Manage source</span>
    </button>`;
  }).join('');
  return `<div class="dashboard-widget-picker-grid">${cards}</div>`;
}

export function createLensPageHandlers(deps) {
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
    inlineHandlerCall,
    renderLensHeader,
    renderLensPageWidgets,
    renderLensWidget,
  } = deps;

  function showLabs(preData) {
    const rawData = preData || getActiveData();
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const actions = renderDateRangeFilter();
    let html = renderLensHeader('Labs', 'Dedicated biomarker workspace: categories, marker changes, and lab-level patterns.', actions);

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

  function showGenomeLens() {
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const importDetails = renderGenomeImportDetailsWidget();
    let html = renderLensHeader('Genome', 'Dedicated DNA workspace: actionable genetic modifiers, import status, mtDNA, and lab-linked context.',
      `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary" onclick="window.triggerDNAFilePicker && window.triggerDNAFilePicker()">Import DNA</button>`);
    html += renderLensPageWidgets('genome', [
      { id: 'genome', title: 'Actionable Genetic Modifiers', description: 'Priority SNP context relevant to labs and goals', body: renderDashboardGenomeWidget(), size: 'full', opts: { source: 'Genome' } },
      importDetails ? { id: 'genome-import', title: 'Import Details', description: 'Source, counts, mtDNA, and file management', body: importDetails, size: 'full', opts: { source: 'Genome', dashboardId: '' } } : null,
    ]);
    main.innerHTML = html;
  }

  function showBodyLens() {
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    let html = renderLensHeader('Body', 'Dedicated biometrics workspace: wearable signals, manual body metrics, sync state, and metric history.',
      `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary" onclick="window.openSettingsModal && window.openSettingsModal('wearables')">Connect source</button>
       <button type="button" class="dashboard-action-btn" onclick="window.openDashboardBiometricPicker && window.openDashboardBiometricPicker()">Choose metrics</button>`);
    html += renderLensPageWidgets('body', [
      { id: 'wearables', title: 'Biometrics Overview', description: 'User-selected body signal tiles', body: renderDashboardWearableTilesWidget(), size: 'full', opts: { source: 'Body' } },
      { id: 'body-sources', title: 'Connected Sources', description: 'Wearable and manual sources feeding body context', body: renderBodySourcesWidget(), size: 'full', opts: { source: 'Body', dashboardId: '' } },
      { id: 'supplements', title: 'Supplements & Meds', description: 'Tracked supplements and medications that feed lab and AI context', body: renderSupplementsSection(), size: 'full', opts: { source: 'Body' } },
      state.profileSex === 'female' ? { id: 'cycle', title: 'Cycle', description: 'Menstrual cycle context for hormone, iron, and inflammation interpretation', body: renderMenstrualCycleSection(getActiveData()), size: 'full', opts: { source: 'Body' } } : null,
    ]);
    main.innerHTML = html;
  }

  function showInsightLens(preData) {
    const rawData = preData || getActiveData();
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const ctx = buildDashboardWidgetContext(rawData);
    let html = renderLensHeader('Insight', 'Dedicated synthesis workspace: AI focus, trend interpretation, context, and next-step surfaces.',
      `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary" onclick="window.openChatPanel && window.openChatPanel()">Open AI chat</button>
       <button type="button" class="dashboard-action-btn" onclick="window.navigate && window.navigate('recommendations')">Recommendations</button>`);
    html += renderLensPageWidgets('insight', [
      { id: 'focus', title: 'Current Focus', description: 'One synthesized read on the latest data', body: renderFocusCard(), size: 'full', opts: { source: 'Insight' } },
      { id: 'recommendations', title: 'Recommended Next Steps', description: 'Top data-linked actions across lenses', body: renderDashboardRecommendationsWidget(ctx), size: 'half', opts: { source: 'Insight' } },
      { id: 'insights', title: 'AI Insights', description: 'Top trend and range reads', body: renderDashboardInsightsListWidget(ctx), size: 'half', opts: { source: 'Insight' } },
      { id: 'profile-context', title: 'Profile Context', description: 'Goals, history, lifestyle, and context cards', body: renderProfileContextCards(), size: 'full', opts: { source: 'Insight' } },
    ]);
    main.innerHTML = html;
    loadFocusCard();
    loadContextHealthDots();
  }

  function renderRecommendationsPageGroups(ctx, catalog) {
    const active = getGlobalRecommendationCandidates(ctx, catalog);
    const allWithDismissed = getGlobalRecommendationCandidates(ctx, catalog, { includeDismissed: true });
    const saved = allWithDismissed.filter(c => c.saved);
    const dismissed = allWithDismissed.filter(c => c.dismissed);
    if (!active.length && !saved.length && !dismissed.length) {
      return renderRecommendationsEmpty();
    }
    const top = active.slice(0, 4);
    const bySource = new Map();
    for (const candidate of active) {
      if (!bySource.has(candidate.source)) bySource.set(candidate.source, []);
      bySource.get(candidate.source).push(candidate);
    }
    const widgets = [];
    if (top.length) {
      widgets.push({ id: 'recommendations-top', title: 'Top Recommendations', description: 'Highest-priority data-linked next steps', body: `<div class="rec-next-list">${top.map(c => renderRecommendationCard(c)).join('')}</div>`, size: 'full', opts: { source: 'Insight', dashboardId: 'recommendations' } });
    }
    for (const source of ['Labs', 'Body', 'Light', 'Genome', 'Insight']) {
      const rows = (bySource.get(source) || []).filter(c => !top.includes(c));
      if (!rows.length) continue;
      widgets.push({ id: `recommendations-${source.toLowerCase()}`, title: `${source}-Driven`, description: `Recommendations originating from ${source}`, body: `<div class="rec-next-list">${rows.map(c => renderRecommendationCard(c)).join('')}</div>`, size: 'full', opts: { source: 'Recommendations', dashboardId: '' } });
    }
    if (saved.length) {
      widgets.push({ id: 'recommendations-saved', title: 'Saved', description: 'Recommendations saved for later', body: `<div class="rec-next-list">${saved.map(c => renderRecommendationCard(c)).join('')}</div>`, size: 'full', opts: { source: 'Recommendations', dashboardId: '' } });
    }
    if (dismissed.length) {
      widgets.push({ id: 'recommendations-dismissed', title: 'Dismissed', description: 'Currently dismissed recommendations from active data', body: `<div class="rec-next-list">${dismissed.map(c => renderRecommendationCard(c)).join('')}</div>`, size: 'full', opts: { source: 'Recommendations', dashboardId: '' } });
    }
    return renderLensPageWidgets('recommendations', widgets);
  }

  function showRecommendations(preData) {
    const rawData = preData || getActiveData();
    const ctx = buildDashboardWidgetContext(rawData);
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const prefs = getDashboardWidgetPrefs();
    const recommendationsVisible = !prefs.hidden.includes('recommendations');
    const dashboardAction = recommendationsVisible ? 'removeDashboardWidgetFromLens' : 'addDashboardWidgetFromLens';
    const dashboardLabel = recommendationsVisible ? 'Remove from Dashboard' : 'Add to Dashboard';
    const actions = `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary" onclick="${inlineHandlerCall(dashboardAction, 'recommendations')}">${dashboardLabel}</button>
      <button type="button" class="dashboard-action-btn" onclick="window.openSettingsModal && window.openSettingsModal('privacy')">Disclosure & settings</button>`;
    let html = `<div id="recommendations-page">`;
    html += renderLensHeader('Recommendations', 'A global action plan built from Labs, Body, Light, Genome, and Insight signals. Product links stay behind the existing disclosure.', actions);
    if (!window.isProductRecsEnabled?.()) {
      html += renderLensWidget('recommendations-disabled', 'Recommendations are off', 'Enable Tips & Recommendations to build this action surface', `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary" onclick="window.openSettingsModal && window.openSettingsModal('privacy')">Open settings</button>`, 'full', { source: 'Recommendations', dashboardId: '' });
      html += `</div>`;
      main.innerHTML = html;
      return;
    }
    const catalog = getCachedRecommendationsCatalog();
    if (!catalog) {
      refreshRecommendationsWhenCatalogReady();
      html += `<div class="dashboard-widget-empty">Loading recommendation catalog...</div></div>`;
      main.innerHTML = html;
      return;
    }
    if (state.importedData?.genetics?.snps && !window._snpTableCache) {
      ensureSNPTable().then(() => { if (state.currentView === 'recommendations') showRecommendations(getActiveData()); }).catch(() => {});
    }
    html += `${renderRecommendationsPageGroups(ctx, catalog)}</div>`;
    main.innerHTML = html;
  }

  return { showLabs, showGenomeLens, showBodyLens, showInsightLens, showRecommendations };
}
