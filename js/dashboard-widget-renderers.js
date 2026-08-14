// @ts-check
// dashboard-widget-renderers.js - dashboard widget body renderers

import { state } from './state.js';
import { DEFAULT_METRIC_ORDER, canonicalMetric, metricsForSources } from './wearable-adapters.js';
import { dashboardWidgetActionAttrs } from './dashboard-widget-controls.js';
import {
  getDashboardDeviceSessions,
  getDashboardHaplogroupTableCache,
  getDashboardLightSessions,
  getDashboardSnpTableCache,
} from './dashboard-widget-runtime.js';
import { dashboardBiometricSelectionKey, DASHBOARD_MANUAL_BIOMETRIC_METRICS } from './dashboard-widgets.js';
import { createDashboardLabWidgetRenderers } from './dashboard-lab-widget-renderers.js';
import { createDashboardRecommendationWidget } from './dashboard-recommendation-widget.js';
import { detectMtDNAMismatch, ensureHaplogroupTable, ensureSNPTable, findGenotypeInfo, getSnpCategoryLabel, loadDnaModule } from './health-data-loader.js';
import { getDnaModuleFunction } from './dna-runtime-bridge.js';
import { escapeAttr, escapeHTML, safeMarkerId } from './utils.js';
import { renderBiologyScoresWidget, renderDashboardBiologyScoreWidget, renderDashboardBiologicalCoherenceWidget } from './biology-scores.js';

const DASHBOARD_BIOMETRIC_STALE_MS = 12 * 60 * 60 * 1000;

function dashboardNavigateAttrs(route) {
  return dashboardWidgetActionAttrs('navigate', { route });
}

function dashboardMarkerDetailAttrs(id) {
  return dashboardWidgetActionAttrs('open-marker-detail', { id });
}

export function createDashboardWidgetRenderers(deps) {
  let _dashboardGenomeDataLoadPromise = null;
  let _dashboardGenomeEvidence = null;
  let _lightSunModulesLoadPromise = null;

  const {
    markerHasData,
    renderDashboardLightChannelPills,
    renderLightConditionsWidgetBody,
    renderLightLiveSession = () => '',
    renderLightSessionLogActions,
    getMobileDashboardMarkers,
    getMobileDashboardInsights,
    getMobileWearableTiles,
    formatMobileWearableValue,
    formatMobileWearableDelta,
    getMobileWearablePriority = () => [],
    isLightSunUILoaded = () => true,
    loadLightSunUI = async () => {},
    rerenderDashboardFromWidgetChange,
    renderLightTodayHero = () => '',
    showRecommendations,
  } = deps;

  function renderLightSunLoadingState() {
    if (!_lightSunModulesLoadPromise) {
      _lightSunModulesLoadPromise = loadLightSunUI()
        .then(() => rerenderDashboardFromWidgetChange())
        .catch(err => console.error('Failed to load Light & Sun dashboard modules', err))
        .finally(() => { _lightSunModulesLoadPromise = null; });
    }
    return `<div class="dashboard-widget-empty" aria-busy="true" aria-live="polite">
      Loading Light &amp; Sun…
    </div>`;
  }

  function lightSunModulesReady() {
    return isLightSunUILoaded() || false;
  }

  const labRenderers = createDashboardLabWidgetRenderers({
    markerHasData,
    rerenderDashboardFromWidgetChange,
  });
  const {
    buildDashboardWidgetContext,
    getDashboardMarkerById,
    renderDashboardBioAgeWidget,
    renderDashboardQuickMarkersWidget,
    renderDashboardSingleMarkerWidget,
    renderDashboardSpotlightWidget,
    renderLabsPriorityBanner,
    renderDashboardCorrelationWidget,
    renderDashboardKeyTrendsWidget,
    renderDashboardAlertsWidget,
    renderDashboardNotesWidget,
    isDashboardQuickMarkerPinned,
    toggleDashboardQuickMarkerPin,
  } = labRenderers;

  const recommendationWidget = createDashboardRecommendationWidget({
    markerHasData,
    buildDashboardWidgetContext,
    showRecommendations,
  });
  const {
    getCachedRecommendationsCatalog,
    refreshRecommendationsWhenCatalogReady,
    getGlobalRecommendationCandidates,
    renderRecommendationCard,
    renderRecommendationsEmpty,
    renderDashboardRecommendationsWidget,
    setRecommendationState,
  } = recommendationWidget;

  function renderDashboardLightTodayWidget() {
    if (!lightSunModulesReady()) return renderLightSunLoadingState();
    const hero = renderLightTodayHero();
    const heroHtml = hero || `<div class="light-today-hero light-today-hero-dashboard-fallback">
      <div class="light-today-hero-head"><span class="light-today-hero-label">Today's light</span></div>
      <div class="sun-detail-ai sun-detail-ai-idle">
        <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
        <span>Open Light &amp; Sun to review today's sun, devices, environment, and channel rhythm.</span>
        <button type="button" class="sun-session-ai-refresh" ${dashboardNavigateAttrs('light')}>Open Light &amp; Sun</button>
      </div>
    </div>`;
    return heroHtml;
  }

  function renderDashboardLightConditionsWidget() {
    if (!lightSunModulesReady()) return renderLightSunLoadingState();
    return renderLightConditionsWidgetBody({ variant: 'full', slotId: 'cond-now-dashboard-widget' });
  }

  function renderDashboardLightSessionLogWidget() {
    if (!lightSunModulesReady()) return renderLightSunLoadingState();
    return renderLightSessionLogActions();
  }

  function renderDashboardLightLiveSessionWidget() {
    if (!lightSunModulesReady()) return renderLightSunLoadingState();
    return renderLightLiveSession({ includeEmptyState: true });
  }

  function renderDashboardLightChannelsWidget() {
    if (!lightSunModulesReady()) return renderLightSunLoadingState();
    const sessions = getDashboardLightSessions();
    const deviceSessionsAll = getDashboardDeviceSessions();
    const totalSessions = sessions.length + deviceSessionsAll.length;
    const lead = totalSessions === 0
      ? 'No light sessions yet. Log sunlight or a device session to see which pathways may have received a signal.'
      : 'Seven-day light rhythm, with sunlight and device signals kept separate.';
    return `<div class="light-channels-section light-channels-section-dashboard">
      <p class="light-section-hint">${lead}</p>
      ${renderDashboardLightChannelPills()}
      <button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-dashboard-open-btn" ${dashboardNavigateAttrs('light')}>Open Light &amp; Sun</button>
    </div>`;
  }

  function renderDashboardInsightsListWidget(ctx) {
    const markers = getMobileDashboardMarkers(ctx);
    const insights = getMobileDashboardInsights(ctx, markers);
    if (!insights.length) return '';
    return `<div class="db-insights-list">${insights.map(insight => {
      const open = insight.id && safeMarkerId(insight.id) ? ` ${dashboardMarkerDetailAttrs(insight.id)}` : '';
      return `<button type="button" class="db-insight db-insight-${escapeAttr(insight.tone)}"${open}>
        <span class="db-insight-tag">${escapeHTML(insight.eyebrow)}</span>
        <strong>${escapeHTML(insight.title)}</strong>
        <span>${escapeHTML(insight.body)}</span>
      </button>`;
    }).join('')}</div>`;
  }

  function isDashboardManualBiometricMetric(metricId) {
    return DASHBOARD_MANUAL_BIOMETRIC_METRICS.includes(metricId);
  }

  function getDashboardBiometricMetricOrder() {
    const summary = state.importedData?.wearableSummary;
    const sourceIds = Object.keys(summary?.sources || {});
    const registryOrder = metricsForSources(sourceIds);
    const ordered = [
      ...getMobileWearablePriority(),
      ...registryOrder,
      ...DEFAULT_METRIC_ORDER,
      ...Object.keys(summary?.metrics || {}),
      ...DASHBOARD_MANUAL_BIOMETRIC_METRICS,
    ];
    const seen = new Set();
    return ordered.filter(metricId => {
      if (!safeMarkerId(metricId) || seen.has(metricId)) return false;
      seen.add(metricId);
      return !!canonicalMetric(metricId);
    });
  }

  function getDashboardDefaultBiometricSelection() {
    const defaults = getMobileWearableTiles().map(tile => tile.id);
    if (defaults.length) return defaults;
    return DASHBOARD_MANUAL_BIOMETRIC_METRICS.filter(metricId => !!canonicalMetric(metricId));
  }

  function normalizeDashboardBiometricSelection(ids) {
    const out = [];
    const seen = new Set();
    for (const metricId of Array.isArray(ids) ? ids : []) {
      if (!safeMarkerId(metricId) || seen.has(metricId) || !canonicalMetric(metricId)) continue;
      if (metricId === 'bp_diastolic' && seen.has('bp_systolic')) continue;
      out.push(metricId);
      seen.add(metricId);
    }
    return out;
  }

  function getDashboardBiometricSelection() {
    try {
      const raw = localStorage.getItem(dashboardBiometricSelectionKey());
      if (raw != null) return normalizeDashboardBiometricSelection(JSON.parse(raw));
    } catch {}
    return normalizeDashboardBiometricSelection(getDashboardDefaultBiometricSelection());
  }

  function saveDashboardBiometricSelection(ids) {
    localStorage.setItem(dashboardBiometricSelectionKey(), JSON.stringify(normalizeDashboardBiometricSelection(ids)));
  }

  function formatDashboardRelativeTime(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return 'never';
    const diff = Math.max(0, Date.now() - n);
    const min = Math.round(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 48) return `${hr}h ago`;
    const days = Math.round(hr / 24);
    return `${days}d ago`;
  }

  function getDashboardBiometricSyncState() {
    const connections = state.importedData?.wearableConnections || {};
    const sources = Object.values(connections).filter(conn => conn?.connectedAt && conn?.accessToken && !conn.needsReauth);
    if (!sources.length) return { showSync: false, lastSyncAt: 0 };
    const now = Date.now();
    const lastSyncAt = Math.max(0, ...sources.map(conn => Number(conn.lastSyncAt) || 0));
    const staleCount = sources.filter(conn => now - (Number(conn.lastSyncAt) || 0) >= DASHBOARD_BIOMETRIC_STALE_MS).length;
    return { showSync: staleCount > 0, staleCount, lastSyncAt };
  }

  function renderDashboardBiometricSyncStatus() {
    const syncState = getDashboardBiometricSyncState();
    if (!syncState.lastSyncAt && !syncState.showSync) return '';
    const label = syncState.lastSyncAt ? `Updated ${formatDashboardRelativeTime(syncState.lastSyncAt)}` : 'Not synced yet';
    return `<span class="db-biometric-sync-status${syncState.showSync ? ' is-stale' : ''}">${escapeHTML(label)}</span>
      ${syncState.showSync ? `<button type="button" class="dashboard-action-btn db-biometric-sync-btn" ${dashboardWidgetActionAttrs('sync-biometric-now')}>Sync stale data</button>` : ''}`;
  }

  function getDashboardBiometricTile(metricId, { allowEmptyManual = false } = {}) {
    const summary = state.importedData?.wearableSummary;
    const metric = summary?.metrics?.[metricId];
    const canon = canonicalMetric(metricId);
    if (!canon) return null;
    if (!summary || !metric || metric.latest == null) {
      if (!allowEmptyManual || !isDashboardManualBiometricMetric(metricId)) return null;
      return {
        id: metricId,
        label: metricId === 'bp_systolic' ? 'Blood pressure' : canon.label,
        value: '\u2014',
        unit: metricId === 'bp_systolic' ? 'mmHg' : (canon.unit || canon.sub || ''),
        change: '+ Log',
        empty: true,
      };
    }
    return {
      id: metricId,
      label: metricId === 'bp_systolic' && summary?.metrics?.bp_diastolic ? 'Blood pressure' : canon.label,
      value: formatMobileWearableValue(metricId, metric, summary),
      unit: metricId === 'bp_systolic' ? 'mmHg' : (canon.unit || canon.sub || ''),
      change: formatMobileWearableDelta(metricId, metric, canon) || 'latest',
      empty: false,
    };
  }

  function renderDashboardBiometricTile(tile) {
    const remove = `<button type="button" class="db-biometric-remove" ${dashboardWidgetActionAttrs('remove-biometric-metric', { id: tile.id })} aria-label="Remove ${escapeAttr(tile.label)} from Biometrics Overview" title="Remove metric">&times;</button>`;
    if (tile.empty) {
      return `<div class="db-biometric-tile-wrap">
        <div class="wearable-card wearable-card-empty db-biometric-manual-empty" data-empty-metric="${escapeAttr(tile.id)}" ${dashboardWidgetActionAttrs('open-biometric-manual-log', { id: tile.id })} role="button" tabindex="0" aria-label="Log ${escapeAttr(tile.label.toLowerCase())} manually">
          <div class="wearable-card-top"><span class="wearable-metric-name">${escapeHTML(tile.label)}</span></div>
          <div class="wearable-value-row wearable-value-row-empty"><span class="wearable-value wearable-value-dash">-</span></div>
          <div class="wearable-card-bottom"><div class="wearable-empty-cta">+ Log</div></div>
        </div>
        ${remove}
      </div>`;
    }
    return `<div class="db-biometric-tile-wrap">
      <button type="button" class="db-wearable-tile db-biometric-widget" ${dashboardWidgetActionAttrs('open-biometric-detail', { id: tile.id })} aria-label="${escapeAttr(tile.label + ': ' + tile.value + ' ' + tile.unit)}">
        <span class="db-wearable-label">${escapeHTML(tile.label)}</span>
        <strong>${escapeHTML(tile.value)}</strong>
        <span class="db-wearable-foot"><small>${escapeHTML(tile.unit || '')}</small><em>${escapeHTML(tile.change || 'latest')}</em></span>
      </button>
      ${remove}
    </div>`;
  }

  function renderDashboardWearableTilesWidget() {
    const selected = getDashboardBiometricSelection();
    const tiles = selected
      .map(metricId => getDashboardBiometricTile(metricId, { allowEmptyManual: true }))
      .filter(Boolean);
    const syncStatus = renderDashboardBiometricSyncStatus();
    const toolbar = `<div class="db-biometric-overview-bar">
      <span>${escapeHTML(String(tiles.length))} metric${tiles.length === 1 ? '' : 's'} selected</span>
      <div class="db-biometric-overview-actions">
        ${syncStatus}
        <button type="button" class="dashboard-action-btn" ${dashboardWidgetActionAttrs('open-biometric-picker')}>Add metrics</button>
      </div>
    </div>`;
    if (!tiles.length) {
      return `${toolbar}<div class="dashboard-widget-empty">No biometrics selected.</div>`;
    }
    return `${toolbar}<div class="db-wearable-grid db-biometric-overview-grid">${tiles.map(renderDashboardBiometricTile).join('')}</div>`;
  }

  function getDashboardGenomeEvidence() {
    const helpers = {
      dnaStudyReferenceLabel: getDnaModuleFunction('dnaStudyReferenceLabel'),
      mtdnaEvidenceIssueUrl: getDnaModuleFunction('mtdnaEvidenceIssueUrl'),
      newSnpSuggestionIssueUrl: getDnaModuleFunction('newSnpSuggestionIssueUrl'),
      resolveSnpEvidenceProfile: getDnaModuleFunction('resolveSnpEvidenceProfile'),
      snpEvidenceIssueUrl: getDnaModuleFunction('snpEvidenceIssueUrl'),
      snpFindingPresentation: getDnaModuleFunction('snpFindingPresentation'),
      snpFindingRank: getDnaModuleFunction('snpFindingRank'),
    };
    return Object.values(helpers).every(helper => typeof helper === 'function') ? helpers : null;
  }

  function getDashboardGenomeImpact(stored, entry) {
    const evidence = _dashboardGenomeEvidence;
    if (!evidence) return { label: 'pending', tone: 'pending', rank: 999, note: stored?.note || '', evidenceProfile: null };
    const info = entry ? findGenotypeInfo(entry, stored?.genotype) : null;
    const effect = info?.effect || stored?.effect || '';
    const valence = info?.valence || stored?.valence || 'risk';
    const note = info?.note || stored?.note || '';
    const presentation = evidence.snpFindingPresentation(effect, valence);
    const evidenceProfile = evidence.resolveSnpEvidenceProfile(entry || stored, info || stored);
    return {
      label: presentation.shortLabel,
      tone: presentation.tone,
      rank: evidence.snpFindingRank(evidenceProfile, presentation),
      note,
      presentation,
      evidenceProfile,
    };
  }

  const DASHBOARD_VISIBLE_SNP_TONES = new Set(['risk', 'protective', 'trait']);

  function dashboardSnpAssessmentText(profile) {
    const evidence = profile.evidenceShortLabel === 'Not graded'
      ? 'Evidence not graded'
      : `${profile.evidenceShortLabel} evidence`;
    return `${evidence} · ${profile.relevanceShortLabel}`;
  }

  function renderDashboardSnpEvidence(f) {
    const evidence = _dashboardGenomeEvidence;
    if (!evidence) return '';
    const references = Array.isArray(f.references)
      ? f.references.filter(reference => /^https?:\/\//i.test(String(reference || '')))
      : [];
    const issueUrl = evidence.snpEvidenceIssueUrl(f.rsid, f.catalogEntry || {});
    const profile = f.evidenceProfile || evidence.resolveSnpEvidenceProfile(f.catalogEntry || {}, f);
    return `<details class="db-snp-evidence" data-snp-evidence="${escapeAttr(f.rsid)}">
      <summary>Evidence &amp; interpretation <small>${escapeHTML(dashboardSnpAssessmentText(profile))}</small></summary>
      <div class="db-snp-evidence-body">
        ${profile.scope || profile.context ? `<div class="db-snp-interpretation">
          ${profile.scope ? `<p><strong>What it supports.</strong> ${escapeHTML(profile.scope)}</p>` : ''}
          ${profile.context ? `<p><strong>Use in context.</strong> ${escapeHTML(profile.context)}</p>` : ''}
        </div>` : ''}
        <div class="db-snp-evidence-footer">
          ${references.length
            ? `<span class="db-snp-evidence-source-label">Sources:</span>${references.map(reference => `<a href="${escapeAttr(String(reference))}" target="_blank" rel="noopener" class="db-snp-evidence-source">${escapeHTML(evidence.dnaStudyReferenceLabel(String(reference)).replace(/^PubMed(?: Central)? · /, ''))}</a>`).join('<span aria-hidden="true">·</span>')}`
            : '<span>No catalog source linked yet</span>'}
          <span aria-hidden="true">·</span>
          <button type="button" class="db-snp-text-action db-snp-ai-action" ${dashboardWidgetActionAttrs('ask-genome-snp', { rsid: f.rsid })}>Ask AI</button>
          <span aria-hidden="true">·</span>
          <a href="${escapeAttr(issueUrl)}" target="_blank" rel="noopener" class="db-snp-text-action db-snp-correction-action">Suggest correction</a>
        </div>
      </div>
    </details>`;
  }

  function renderDashboardGenomeRow(f, { showCategoryLabel = true } = {}) {
    const subline = [
      f.variant || f.rsid,
      showCategoryLabel ? f.categoryLabel : '',
    ].filter(Boolean).join(' · ');
    return `<div class="db-snp-row db-snp-${escapeAttr(f.impactTone || 'pending')}">
      <span class="db-snp-main">
        <strong>${escapeHTML(f.gene || f.rsid)}</strong>
        <small>${escapeHTML(subline)}</small>
      </span>
      <span class="db-snp-impact">${escapeHTML(f.impactLabel || 'pending')}</span>
      <span class="db-snp-geno">${escapeHTML(f.genotype || '—')}</span>
      ${f.note ? `<span class="db-snp-note">${escapeHTML(f.note)}</span>` : ''}
      ${renderDashboardSnpEvidence(f)}
    </div>`;
  }

  function renderDashboardMtdnaEvidenceStudy(study) {
    const pmid = String(study?.pmid || '').replace(/\D/g, '');
    const direction = String(study?.direction || 'context').toLowerCase();
    return `<article class="db-mtdna-study db-mtdna-study-${escapeAttr(direction)}">
      <div class="db-mtdna-study-head">
        <span>${escapeHTML(study?.studyLabel || 'Study')}</span>
        <em>${escapeHTML(study?.direction || 'context')}</em>
      </div>
      <strong>${escapeHTML(study?.title || 'Mitochondrial evidence')}</strong>
      ${study?.scopeLabel ? `<small>${escapeHTML(study.scopeLabel)}</small>` : ''}
      ${study?.summary ? `<p>${escapeHTML(study.summary)}</p>` : ''}
      ${study?.model ? `<dl><dt>Model</dt><dd>${escapeHTML(study.model)}</dd></dl>` : ''}
      ${study?.limitations ? `<dl><dt>Limits</dt><dd>${escapeHTML(study.limitations)}</dd></dl>` : ''}
      ${pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${escapeAttr(pmid)}/" target="_blank" rel="noopener">PubMed · PMID ${escapeHTML(pmid)}</a>` : ''}
    </article>`;
  }

  function renderDashboardMtdnaPanel(mtdna, haplogroupTable, genetics) {
    const evidence = _dashboardGenomeEvidence;
    const mismatch = detectMtDNAMismatch(genetics);
    const studies = Array.isArray(haplogroupTable?._meta?.references) ? haplogroupTable._meta.references : [];
    const facts = [
      mtdna.origin ? `<span><small>Origin</small><strong>${escapeHTML(mtdna.origin)}</strong></span>` : '',
      mtdna.source ? `<span><small>Source</small><strong>${escapeHTML(mtdna.source)}</strong></span>` : '',
      Number.isFinite(Number(mtdna.matchedMutations)) && Number.isFinite(Number(mtdna.totalDiagnostic))
        ? `<span><small>Marker match</small><strong>${Number(mtdna.matchedMutations)} / ${Number(mtdna.totalDiagnostic)}</strong></span>`
        : '',
    ].filter(Boolean);
    const couplingDetails = [mtdna.details, mtdna.coupling?.description, mtdna.coupling?.implications]
      .filter(Boolean)
      .map(detail => `<p>${escapeHTML(detail)}</p>`)
      .join('');
    return `<section class="db-mtdna-panel" data-mtdna-haplogroup="${escapeAttr(mtdna.haplogroup || '')}">
      <div class="db-mtdna-head">
        <span><small>Maternal lineage</small><strong>mtDNA ${escapeHTML(mtdna.haplogroup || 'Unresolved')}</strong></span>
        <em>${escapeHTML(mtdna.coupling?.shortLabel || 'Wallace lens')}</em>
      </div>
      ${mtdna.coupling ? `<div class="db-mtdna-coupling"><strong>${escapeHTML(mtdna.coupling.label || 'Coupling context')}</strong><span>${escapeHTML(mtdna.coupling.climate || '')}</span></div>` : ''}
      ${facts.length ? `<div class="db-mtdna-facts">${facts.join('')}</div>` : ''}
      ${couplingDetails ? `<div class="db-mtdna-copy">${couplingDetails}</div>` : ''}
      ${mismatch?.message ? `<div class="db-mtdna-environment${mismatch.mismatch ? ' is-mismatch' : ' is-match'}">${escapeHTML(mismatch.message)}</div>` : ''}
      ${studies.length ? `<details class="db-mtdna-evidence" data-mtdna-evidence>
        <summary>Wallace framework &amp; evidence <span>${studies.length} sources</span></summary>
        <div class="db-mtdna-evidence-body">
          ${haplogroupTable?._meta?.caveat ? `<p class="db-mtdna-caveat">${escapeHTML(haplogroupTable._meta.caveat)}</p>` : ''}
          <div class="db-mtdna-study-grid">${studies.map(renderDashboardMtdnaEvidenceStudy).join('')}</div>
          ${evidence ? `<a href="${escapeAttr(evidence.mtdnaEvidenceIssueUrl())}" target="_blank" rel="noopener" class="db-genome-contribute-link">Suggest an mtDNA study or correction</a>` : ''}
        </div>
      </details>` : ''}
    </section>`;
  }

  function renderDashboardGenomeContribution() {
    const evidence = _dashboardGenomeEvidence;
    if (!evidence) return '';
    return `<div class="db-genome-contribute">
      <span><strong>Improve the public catalog</strong> Suggest a well-supported SNP or correct an annotation. The link does not include your genotype or imported data.</span>
      <a href="${escapeAttr(evidence.newSnpSuggestionIssueUrl())}" target="_blank" rel="noopener" class="db-genome-contribute-link">Suggest a SNP</a>
    </div>`;
  }

  function groupDashboardGenomeFindings(findings) {
    const groups = new Map();
    for (const f of findings) {
      const category = f.category || 'other';
      if (!groups.has(category)) {
        groups.set(category, {
          category,
          categoryLabel: f.categoryLabel || getSnpCategoryLabel(category),
          findings: [],
          rank: Number.POSITIVE_INFINITY,
          tone: 'pending',
          impactLabel: 'pending',
        });
      }
      const group = groups.get(category);
      group.findings.push(f);
      if ((f.impactRank ?? 99) < group.rank) {
        group.rank = f.impactRank ?? 99;
        group.tone = f.impactTone || 'pending';
        group.impactLabel = f.impactLabel || 'pending';
      }
    }
    return Array.from(groups.values())
      .map(group => ({
        ...group,
        findings: group.findings.slice().sort((a, b) => (a.impactRank - b.impactRank) || String(a.gene || a.rsid).localeCompare(String(b.gene || b.rsid)) || String(a.variant || '').localeCompare(String(b.variant || ''))),
      }))
      .sort((a, b) => (a.rank - b.rank) || String(a.categoryLabel).localeCompare(String(b.categoryLabel)));
  }

  function renderDashboardGenomeGroup(group, { secondary = false } = {}) {
    const count = group.findings.length;
    return `<div class="db-genome-category db-genome-category-${escapeAttr(group.tone || 'pending')}${secondary ? ' db-genome-category-secondary' : ''}">
      <div class="db-genome-category-head">
        <strong>${escapeHTML(group.categoryLabel || 'Other')}</strong>
        <span>${count} finding${count === 1 ? '' : 's'}</span>
        <em>${escapeHTML(group.impactLabel || 'pending')}</em>
      </div>
      <div class="db-genome-category-rows">${group.findings.map(f => renderDashboardGenomeRow(f, { showCategoryLabel: false })).join('')}</div>
    </div>`;
  }

  function refreshDashboardGenomeWidgetWhenDataReady({ needsSnps = false, needsMtdna = false, needsEvidence = false } = {}) {
    if (_dashboardGenomeDataLoadPromise) return;
    _dashboardGenomeDataLoadPromise = Promise.all([
      needsSnps ? ensureSNPTable() : Promise.resolve(null),
      needsMtdna ? ensureHaplogroupTable() : Promise.resolve(null),
      needsEvidence ? loadDnaModule() : Promise.resolve(null),
    ])
      .then(() => {
        _dashboardGenomeDataLoadPromise = null;
        _dashboardGenomeEvidence = getDashboardGenomeEvidence();
        const body = document.querySelector?.('.dashboard-widget[data-widget-id="genome"] .dashboard-widget-body');
        if (body) body.innerHTML = renderDashboardGenomeWidget();
      })
      .catch(() => { _dashboardGenomeDataLoadPromise = null; });
  }

  function renderDashboardGenomeWidget() {
    const genetics = state.importedData?.genetics;
    const snps = genetics?.snps || {};
    const apoe = genetics?.apoe;
    const snpTable = getDashboardSnpTableCache();
    const haplogroupTable = getDashboardHaplogroupTableCache();
    const snpCount = Object.keys(snps).length;
    _dashboardGenomeEvidence ||= getDashboardGenomeEvidence();
    const needsSnps = !!snpCount && !snpTable;
    const needsMtdna = !!genetics?.mtdna && !haplogroupTable;
    const needsEvidence = !_dashboardGenomeEvidence;
    if (needsMtdna) refreshDashboardGenomeWidgetWhenDataReady({ needsSnps, needsMtdna, needsEvidence });
    if (needsSnps || needsEvidence) {
      refreshDashboardGenomeWidgetWhenDataReady({ needsSnps, needsMtdna, needsEvidence });
      return `<div class="db-genome-list">
        <div class="db-genome-summary">${snpCount} imported SNP${snpCount === 1 ? '' : 's'}</div>
        <div class="db-genome-empty db-genome-loading" aria-live="polite">
          <strong>Loading SNP interpretations</strong>
          <span>Matching your variants to the SNP catalog so effect, category, and notes render correctly.</span>
        </div>
      </div>`;
    }
    const apoeProfile = _dashboardGenomeEvidence.resolveSnpEvidenceProfile(snpTable?.rs429358 || snpTable?.rs7412 || {});
    const findings = Object.entries(snps)
      .map(([rsid, stored]) => {
        const entry = snpTable?.[rsid];
        const impact = getDashboardGenomeImpact(stored, entry);
        const category = entry?.category || stored.category || 'other';
        return {
          rsid,
          ...stored,
          category,
          categoryLabel: category ? getSnpCategoryLabel(category) : '',
          impactLabel: impact.label,
          impactTone: impact.tone,
          impactRank: impact.rank,
          note: impact.note || stored.note || '',
          evidenceProfile: impact.evidenceProfile,
          references: entry?.references || [],
          catalogEntry: entry || {},
        };
      })
      .filter(f => f.gene || f.variant || f.genotype)
      .sort((a, b) => (a.impactRank - b.impactRank) || String(a.gene || a.rsid).localeCompare(String(b.gene || b.rsid)) || String(a.variant || '').localeCompare(String(b.variant || '')));
    if (!findings.length && !apoe && !genetics?.mtdna) {
      return `<div class="db-genome-list">
        <div class="db-genome-empty">
          <strong>No DNA data imported yet</strong>
          <span>Import a raw DNA file above to see curated findings and traits alongside your labs and body signals.</span>
        </div>
        ${renderDashboardGenomeContribution()}
      </div>`;
    }
    const visibleFindings = findings.filter(f => DASHBOARD_VISIBLE_SNP_TONES.has(f.impactTone));
    const secondaryFindings = findings.filter(f => !DASHBOARD_VISIBLE_SNP_TONES.has(f.impactTone));
    const groups = groupDashboardGenomeFindings(visibleFindings);
    const secondaryGroups = groupDashboardGenomeFindings(secondaryFindings);
    const rows = groups.map(group => renderDashboardGenomeGroup(group)).join('');
    const secondaryRows = secondaryFindings.length ? `<details class="db-genome-secondary">
      <summary>Other imported SNPs (${secondaryFindings.length})</summary>
      <div class="db-genome-secondary-list">${secondaryGroups.map(group => renderDashboardGenomeGroup(group, { secondary: true })).join('')}</div>
    </details>` : '';
    const noVisibleRows = snpCount && !visibleFindings.length ? `<div class="db-genome-empty db-genome-no-priority">
      <strong>No priority or informational trait calls</strong>
      <span>Normal, neutral, and unclassified imported calls are collapsed below.</span>
    </div>` : '';
    const legend = visibleFindings.length ? `<div class="db-genome-legend" aria-label="Genome interpretation legend">
      <span class="db-genome-legend-item db-genome-legend-risk"><span>🔴</span> risk association</span>
      <span class="db-genome-legend-item db-genome-legend-protective"><span>🟢</span> protective association</span>
      <span class="db-genome-legend-item db-genome-legend-trait"><span>🔵</span> trait</span>
      <span class="db-genome-legend-item db-genome-legend-informational"><span>⚪</span> neutral</span>
      <span class="db-genome-legend-help">Direction, evidence, and relevance are separate. Strong evidence is not a diagnosis or a proven intervention.</span>
    </div>` : '';
    const meta = [
      snpCount ? `${snpCount} imported SNP${snpCount === 1 ? '' : 's'}` : '',
      genetics?.source || '',
      genetics?.importDate || '',
    ].filter(Boolean).join(' · ');
    return `<div class="db-genome-list">
      ${meta ? `<div class="db-genome-summary">${escapeHTML(meta)}</div>` : ''}
      ${legend}
      ${apoe ? `<div class="db-snp-row db-snp-row-apoe"><span class="db-snp-main"><strong>APOE</strong><small>Haplotype · ${escapeHTML(dashboardSnpAssessmentText(apoeProfile))}</small></span><span class="db-snp-impact">context</span><span class="db-snp-geno">${escapeHTML(apoe)}</span></div>` : ''}
      ${genetics?.mtdna ? renderDashboardMtdnaPanel(genetics.mtdna, haplogroupTable, genetics) : ''}
      ${noVisibleRows}
      ${rows}
      ${secondaryRows}
      ${renderDashboardGenomeContribution()}
    </div>`;
  }

  return {
    buildDashboardWidgetContext,
    getCachedRecommendationsCatalog,
    refreshRecommendationsWhenCatalogReady,
    getGlobalRecommendationCandidates,
    renderRecommendationCard,
    renderRecommendationsEmpty,
    renderDashboardRecommendationsWidget,
    getDashboardMarkerById,
    renderDashboardBioAgeWidget,
    renderBiologyScoresWidget,
    renderDashboardBiologyScoreWidget,
    renderDashboardBiologicalCoherenceWidget,
    renderDashboardQuickMarkersWidget,
    renderDashboardSingleMarkerWidget,
    renderDashboardSpotlightWidget,
    renderLabsPriorityBanner,
    renderDashboardInsightsListWidget,
    getDashboardBiometricSelection,
    saveDashboardBiometricSelection,
    getDashboardBiometricMetricOrder,
    getDashboardBiometricTile,
    renderDashboardWearableTilesWidget,
    renderDashboardGenomeWidget,
    renderDashboardCorrelationWidget,
    renderDashboardLightTodayWidget,
    renderDashboardLightConditionsWidget,
    renderDashboardLightLiveSessionWidget,
    renderDashboardLightSessionLogWidget,
    renderDashboardLightChannelsWidget,
    renderDashboardKeyTrendsWidget,
    renderDashboardAlertsWidget,
    renderDashboardNotesWidget,
    setRecommendationState,
    isDashboardQuickMarkerPinned,
    toggleDashboardQuickMarkerPin,
  };
}
