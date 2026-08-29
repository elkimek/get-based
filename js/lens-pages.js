// @ts-check
// lens-pages.js — dedicated lens page renderers extracted from views.js

import { state } from './state.js';
import { escapeHTML } from './utils.js';
import { getActiveData, filterDatesByRange, renderDateRangeFilter } from './data.js';
import {
  ensureSNPTable,
  loadContextHealthDots,
  renderMenstrualCycleSection,
  renderProfileContextCards,
  renderSupplementsSection,
  renderFuelWidget,
  renderNutritionWidget,
} from './health-data-loader.js';
import { computeBiologyScores, getBiologyScoreLensWidgets, renderBiologicalCoherenceLensHero, renderBiologyScoreCoveragePlanner, renderBiologyScoresActionSummary, scheduleBiologyScoreAIReconcile } from './biology-scores.js';
import { getBiologyProfileContext } from './profile-context.js';
import { renderBiologyScoreContextAI, hasCurrentBiologyScoreContextReview, hasBiologyScoreContextReview } from './biology-score-context-ai.js';
import { getRecommendationsSnpTable, isRecommendationsProductRecsEnabled } from './recommendations-runtime.js';

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

function renderGenomeImportDetailsWidget(lensPageActionAttrs) {
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
  ].filter(card => card !== null);

  const mtdnaMeta = hasMtdna
    ? [genetics.mtdna.origin, genetics.mtdna.source, genetics.mtdna.importDate].filter(Boolean).map(value => escapeHTML(value)).join(' · ')
    : '';
  const mtdnaDetail = hasMtdna ? `<div class="db-genome-import-note">
    <strong>mtDNA ${escapeHTML(genetics.mtdna.haplogroup)}</strong>
    <span>${escapeHTML(genetics.mtdna.coupling?.label || 'Haplogroup stored')}</span>
    ${mtdnaMeta ? `<span>${mtdnaMeta}</span>` : ''}
    ${genetics.mtdna.details ? `<span>${escapeHTML(genetics.mtdna.details)}</span>` : ''}
    ${genetics.mtdna.coupling?.description ? `<span>${escapeHTML(genetics.mtdna.coupling.description)}</span>` : ''}
    ${genetics.mtdna.coupling?.implications ? `<span>${escapeHTML(genetics.mtdna.coupling.implications)}</span>` : ''}
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
      <button type="button" class="dashboard-action-btn" ${lensPageActionAttrs('reimport-dna')}>Re-import</button>
      <button type="button" class="dashboard-action-btn" ${lensPageActionAttrs('delete-dna')}>Delete genome data</button>
    </div>
  </div>`;
}

function renderBodySourcesWidget(lensPageActionAttrs) {
  const connections = state.importedData?.wearableConnections || {};
  const summary = state.importedData?.wearableSummary || null;
  const ids = Object.keys(connections);
  if (!ids.length && !summary?.sources) {
    return `<button type="button" class="db-correlation-empty" ${lensPageActionAttrs('open-wearables-settings')}>
      <strong>Connect body data</strong>
      <span>Oura, Withings, Fitbit, Polar, Apple Health, or manual logging can feed HRV, sleep, recovery, blood pressure, and body composition.</span>
    </button>`;
  }
  const sourceIds = Array.from(new Set([...ids, ...Object.keys(summary?.sources || {})]));
  const cards = sourceIds.map(id => {
    const source = connections[id] || summary?.sources?.[id] || {};
    const lastSync = source.lastSyncAt ? new Date(source.lastSyncAt).toLocaleDateString() : 'not synced';
    const coverage = source.coverageDays ? `${source.coverageDays}d coverage` : 'coverage pending';
    return `<button type="button" class="dashboard-widget-picker-card" ${lensPageActionAttrs('open-wearables-settings')}>
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
    lensPageActionAttrs,
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

  function renderBiologyScoreContextBanner() {
    const pc = getBiologyProfileContext();
    const labels = [[pc.lowMuscleMass, 'Low muscle / creatinine unreliable'], [pc.hormoneTherapy, 'Hormone therapy context'], [pc.cycleStatus && pc.cycleStatus !== 'regular', `Cycle: ${pc.cycleStatus}`], [pc.recentHardTraining, 'Recent hard training'], [pc.acuteInflammationContext, 'Acute illness/injury'], [Number.isFinite(pc.ageYears), `Age: ${pc.ageYears}y`]].filter(x => x[0]).map(x => `<span>${escapeHTML(String(x[1]))}</span>`).join('');
    return labels ? `<div class="biology-score-context-banner biology-score-context-page"><strong>Active context modifiers</strong>${labels}</div>` : '';
  }

  function renderBiologyScoreContextStatus(scoreData) {
    const review = state.importedData?.biologyScoreContextAI;
    const suggestions = Array.isArray(review?.suggestions) ? review.suggestions.length : 0;
    const status = hasCurrentBiologyScoreContextReview(scoreData) ? 'Context checked' : 'Context changed · refresh recommended';
    const contextMeta = suggestions
      ? `${suggestions} suggested context ${suggestions === 1 ? 'flag' : 'flags'}`
      : 'No suggested context flags';
    return `<section class="biology-context-status-strip">
      <div class="biology-context-status-copy"><span>${escapeHTML(status)}</span><small>${escapeHTML(contextMeta)}</small></div>
      <details class="biology-context-review-details"><summary class="biology-context-review-cta"><span class="biology-context-review-open">Details</span><span class="biology-context-review-close">Hide details</span></summary>${renderBiologyScoreContextAI(scoreData)}</details>
    </section>`;
  }

  function showBiologyScores(preData) {
    const rawData = preData || getActiveData();
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const ctx = buildDashboardWidgetContext(rawData);
    const scoreData = filterDatesByRange(rawData, { fallbackToAll: false });
    const contextReady = hasBiologyScoreContextReview(scoreData);
    const actions = `<div class="biology-score-header-actions">${contextReady ? '<button type="button" class="dashboard-action-btn dashboard-action-btn-primary" data-biology-score-action="interpret-lens">Explain my Biology Scores</button>' : ''}
      ${renderDateRangeFilter()}</div>`;
    let html = renderLensHeader('Biology Scores', 'A quick overview of how major body systems look from your labs. Start with the score and pattern; open details when you want the marker-level explanation.', actions, { className: 'biology-scores-lens-header' });
    html += renderBiologyScoreContextBanner();
    if (!contextReady) {
      html += renderBiologyScoreContextAI(scoreData);
      html += `<section class="biology-score-context-gate biology-score-context-gate-lens"><div class="biology-scores-eyebrow">Waiting for context check</div><h3>Scores unlock after one context check</h3><p>Use the unlock button above. After the review finishes, scores render for this timeframe and any suggested context flags remain under your control.</p></section>`;
      main.innerHTML = html;
      setupDropZone();
      return;
    }
    const biologyScores = computeBiologyScores(scoreData);
    const biologyDetailScores = biologyScores.filter((score) => score.id !== 'biologicalCoherence');
    const liveBiologyScores = biologyDetailScores.filter((score) => Number.isFinite(score.score)).sort((a, b) => b.score - a.score);
    const waitingBiologyScores = biologyDetailScores.filter((score) => !Number.isFinite(score.score));
    html += renderBiologyScoreContextStatus(scoreData);
    const biologicalCoherence = biologyScores.find((score) => score.id === 'biologicalCoherence');
    html += renderBiologicalCoherenceLensHero(ctx);
    html += renderBiologyScoresActionSummary(liveBiologyScores, waitingBiologyScores, biologicalCoherence);
    html += renderBiologyScoreCoveragePlanner(biologyDetailScores, biologicalCoherence);
    html += renderLensPageWidgets('biology-scores', getBiologyScoreLensWidgets(ctx));
    main.innerHTML = html;
    setupDropZone();
    scheduleBiologyScoreAIReconcile();
  }

  function showGenomeLens() {
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const importDetails = renderGenomeImportDetailsWidget(lensPageActionAttrs);
    const genetics = state.importedData?.genetics || {};
    const hasSnps = Object.keys(genetics.snps || {}).length > 0;
    const affiliate = hasSnps ? '' : `<span class="lens-header-affiliate">No raw file? We recommend a <a href="https://www.dpbolvw.net/q2101xdmjdl0212824AA4024989447" target="_blank" rel="noopener sponsored">LivingDNA kit</a>.</span>`;
    const genomeActions = `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary" ${lensPageActionAttrs('import-dna')}>Import raw DNA</button>
      <button type="button" class="dashboard-action-btn" ${lensPageActionAttrs('import-snp-report')}>Import report</button>
      <button type="button" class="dashboard-action-btn" ${lensPageActionAttrs('add-manual-snp')}>Add SNP manually</button>${affiliate}`;
    let html = renderLensHeader('Genome', 'Dedicated DNA workspace: curated findings and traits, mtDNA context and evidence, import status, and lab-linked signals.', genomeActions, { className: 'genome-lens-header' });
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
    let html = renderLensHeader('Body', 'Biometrics, recovery, supplements, and optional meal tracking in one local-first workspace.',
      `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary" ${lensPageActionAttrs('open-wearables-settings')}>Connect source</button>
       <button type="button" class="dashboard-action-btn" ${lensPageActionAttrs('open-biometric-picker')}>Choose metrics</button>`);
    html += renderLensPageWidgets('body', [
      { id: 'wearables', title: 'Biometrics Overview', description: 'User-selected body signal tiles', body: renderDashboardWearableTilesWidget(), size: 'full', opts: { source: 'Body' } },
      { id: 'body-sources', title: 'Connected Sources', description: 'Wearable and manual sources feeding body context', body: renderBodySourcesWidget(lensPageActionAttrs), size: 'full', opts: { source: 'Body', dashboardId: '' } },
      { id: 'nutrition', title: 'Meals & Nutrition', description: 'Optional photo-assisted meal log with rolling nutrition context', body: renderNutritionWidget(), size: 'full', opts: { source: 'Body', dashboardId: 'nutrition' } },
      { id: 'nutrition-fuel-mix', title: 'Fuel Mix Context', description: 'Seven-day carbohydrate and fat mix', body: renderFuelWidget(), size: 'full', opts: { source: 'Body', dashboardId: 'nutrition-fuel-mix' } },
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
      `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary" ${lensPageActionAttrs('open-ai-chat')}>Open AI chat</button>
       <button type="button" class="dashboard-action-btn" ${lensPageActionAttrs('open-emf-assessment')}>EMF assessment</button>
       <button type="button" class="dashboard-action-btn" ${lensPageActionAttrs('open-recommendations')}>Tips</button>`);
    html += renderLensPageWidgets('insight', [
      { id: 'focus', title: 'Current Focus', description: 'One synthesized read on the latest data', body: renderFocusCard(), size: 'full', opts: { source: 'Insight' } },
      { id: 'recommendations', title: 'Tips to Explore', description: 'General-information ideas connected to your data', body: renderDashboardRecommendationsWidget(ctx), size: 'half', opts: { source: 'Insight' } },
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

  function showRecommendations(preData) {
    const rawData = preData || getActiveData();
    const ctx = buildDashboardWidgetContext(rawData);
    const main = document.getElementById("main-content");
    if (!main) return;
    document.body.classList.remove('mobile-dashboard-active');
    const prefs = getDashboardWidgetPrefs();
    const recommendationsVisible = !prefs.hidden.includes('recommendations');
    const dashboardAction = recommendationsVisible ? 'remove-dashboard-widget' : 'add-dashboard-widget';
    const dashboardLabel = recommendationsVisible ? 'Remove from Dashboard' : 'Add to Dashboard';
    const actions = `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary" ${lensPageActionAttrs(dashboardAction, { id: 'recommendations' })}>${dashboardLabel}</button>
      <button type="button" class="dashboard-action-btn" ${lensPageActionAttrs('open-privacy-settings')}>Disclosure & settings</button>`;
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
