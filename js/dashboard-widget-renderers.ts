import type {createDashboardQuickMarkerCore} from './dashboard-quick-marker-core.js';
import type {DashboardLightWidgetView} from './dashboard-light-widget-presentation.js';
import { renderDashboardLoadingState } from './dashboard-loading-state-presentation.js';
import {renderDashboardBiometricPresentation} from './dashboard-biometric-presentation.js';
import {projectDashboardBiometricTile} from './dashboard-biometric-projection.js';
import type {DashboardBiometricSyncView,DashboardBiometricsOverviewView,DashboardBiometricsSnapshot} from '../types/dashboard-biometric-views.js';
import {renderDashboardGenomeWidgetView, type DashboardGenomeWidgetView, type DashboardGenomeView, type GenomeEvidenceView, type GenomeRowView, type GenomeGroupView} from './dashboard-genome-rows-presentation.js';
// dashboard-widget-renderers.js - dashboard widget body renderers

import { renderHTML as renderLightReview } from './components/LightReviewAI.svelte.html.js';
import {projectDashboardMtdnaPanel} from './dashboard-mtdna-panel-presentation.js';
import { state } from './state.js';
import { DEFAULT_METRIC_ORDER, canonicalMetric, metricsForSources } from './wearable-adapters.js';
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
import { safeMarkerId } from './utils.js';
import { renderBiologyScoresWidget, renderDashboardBiologyScoreWidget, renderDashboardBiologicalCoherenceWidget } from './biology-score-dashboard.js';
import { wearableDisplayUnit } from './wearables-formatters.js';

import type {WidgetRendererDependencies, BiometricTile, GenomeStored, GenomeProfile, GenomeEvidence, GenomeFinding, GenomeGroup, GenomeGenetics, GenomeHaplogroupTable, MtdnaReader, WearableConnectionReader} from '../types/dashboard-widget-renderers.js';
import {prepareDashboardInsights, projectDashboardInsights} from './dashboard-insights-projection.js';

/** Same scalar coercion as the original escaper; Svelte now owns escaping. */
const genomeLiteralText = (value: unknown): string => value == null ? '' : String(value);

const DASHBOARD_BIOMETRIC_STALE_MS = 12 * 60 * 60 * 1000;

export function createDashboardWidgetRenderers(deps: unknown, quickMarkers: ReturnType<typeof createDashboardQuickMarkerCore> | undefined = undefined) {
  let _dashboardGenomeDataLoadPromise: Promise<void> | null = null;
  let _dashboardGenomeEvidence: GenomeEvidence | null = null;
  let _lightSunModulesLoadPromise: unknown = null;

  const {
    markerHasData,
    getLightTodayHeroView,
    getLightConditionsWidgetView,
    getLightLiveSessionView,
    getLightSessionLogActionsView,
    getDashboardLightChannelsWidgetView,
    renderDashboardLightChannelsWidget: renderDashboardLightChannelsWidgetBody,
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
  } = deps as WidgetRendererDependencies;

  function projectLightSunLoadingState():DashboardLightWidgetView {
    if (!_lightSunModulesLoadPromise) {
      _lightSunModulesLoadPromise = loadLightSunUI()
        .then(() => rerenderDashboardFromWidgetChange())
        .catch(err => console.error('Failed to load Light & Sun dashboard modules', err))
        .finally(() => { _lightSunModulesLoadPromise = null; });
    }
    return {kind:'loading'};
  }

  function renderLightSunLoadingState() {
    projectLightSunLoadingState();
    return renderDashboardLoadingState({kind:'light-sun-loading'});
  }

  function lightSunModulesReady() {
    return isLightSunUILoaded() || false;
  }

  const labRenderers = createDashboardLabWidgetRenderers({
    markerHasData,
    rerenderDashboardFromWidgetChange,
  }, quickMarkers);
  const {
    buildDashboardWidgetContext,
    getDashboardMarkerById,
    renderDashboardBioAgeWidget,
    projectDashboardBioAgeWidget,
    renderDashboardQuickMarkersWidget,
    projectDashboardQuickMarkersWidget,
    projectDashboardNotesWidget,
    projectDashboardSingleMarkerWidget,
    projectDashboardSpotlightWidget,
    renderDashboardSingleMarkerWidget,
    renderDashboardSpotlightWidget,
    renderLabsPriorityBanner,
    projectLabsPriorityBanner,
    renderDashboardCorrelationWidget,
    projectDashboardCorrelationWidget,
    renderDashboardKeyTrendsWidget,
    projectDashboardKeyTrendsWidget,
    renderDashboardAlertsWidget,
    projectDashboardAlertsWidget,
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
    renderRecommendationList,
    renderRecommendationsEmpty,
    renderDashboardRecommendationsWidget,
    projectDashboardRecommendationsWidget,
    setRecommendationState,
  } = recommendationWidget;

  // Ordinary first-party dashboard composition receives genuine feature views.
  // Existing render methods remain separately callable for legacy HTML injection.
  function projectDashboardLightTodayWidget():DashboardLightWidgetView {
    if (!lightSunModulesReady()) return projectLightSunLoadingState();
    return {kind:'today',view:getLightTodayHeroView?.() || null};
  }
  function projectDashboardLightConditionsWidget():DashboardLightWidgetView {
    if (!lightSunModulesReady()) return projectLightSunLoadingState();
    return {kind:'conditions',view:getLightConditionsWidgetView?.({variant:'full',slotId:'cond-now-dashboard-widget'}) || null};
  }
  function projectDashboardLightSessionLogWidget():DashboardLightWidgetView {
    if (!lightSunModulesReady()) return projectLightSunLoadingState();
    return {kind:'page',view:getLightSessionLogActionsView?.() || null};
  }
  function projectDashboardLightLiveSessionWidget():DashboardLightWidgetView {
    if (!lightSunModulesReady()) return projectLightSunLoadingState();
    return {kind:'page',view:getLightLiveSessionView?.({includeEmptyState:true}) || null};
  }
  function projectDashboardLightChannelsWidget():DashboardLightWidgetView {
    if (!lightSunModulesReady()) return projectLightSunLoadingState();
    const sessions=getDashboardLightSessions();
    const deviceSessionsAll=getDashboardDeviceSessions();
    const totalSessions=sessions.length+deviceSessionsAll.length;
    return {kind:'page',view:getDashboardLightChannelsWidgetView?.(totalSessions) || null};
  }

  function renderDashboardLightTodayWidget() {
    if (!lightSunModulesReady()) return renderLightSunLoadingState();
    const hero = renderLightTodayHero();
    const heroHtml = hero || renderLightReview({ view: { kind: 'dashboard-fallback' } });
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
    return renderDashboardLightChannelsWidgetBody(totalSessions);
  }

  function prepareDashboardInsightsListWidget(ctx: unknown) {
    const markers = getMobileDashboardMarkers(ctx);
    const insights = getMobileDashboardInsights(ctx, markers);
    return prepareDashboardInsights(insights);
  }
  function projectDashboardInsightsListWidget(ctx: unknown) {
    const markers = getMobileDashboardMarkers(ctx);
    return projectDashboardInsights(getMobileDashboardInsights(ctx, markers));
  }
  function renderDashboardInsightsListWidget(ctx: unknown) {
    return prepareDashboardInsightsListWidget(ctx).body;
  }

  function isDashboardManualBiometricMetric(metricId: unknown) {
    return (DASHBOARD_MANUAL_BIOMETRIC_METRICS as readonly unknown[]).includes(metricId);
  }

  function getDashboardBiometricMetricOrder() {
    const summary = state.importedData?.wearableSummary as import("../types/mobile-dashboard.js").MobileWearableReader | null | undefined;
    const sourceIds = Object.keys(summary?.sources || {});
    const registryOrder = metricsForSources(sourceIds);
    const ordered = [
      ...getMobileWearablePriority(),
      ...registryOrder,
      ...DEFAULT_METRIC_ORDER,
      ...Object.keys(summary?.metrics || {}),
      ...DASHBOARD_MANUAL_BIOMETRIC_METRICS,
    ];
    const seen = new Set<unknown>();
    return ordered.filter(metricId => {
      if (!safeMarkerId(metricId) || seen.has(metricId)) return false;
      seen.add(metricId);
      return !!(canonicalMetric as (id:unknown)=>ReturnType<typeof canonicalMetric>)(metricId);
    });
  }

  function getDashboardDefaultBiometricSelection() {
    const defaults = getMobileWearableTiles().map(tile => tile.id);
    if (defaults.length) return defaults;
    return DASHBOARD_MANUAL_BIOMETRIC_METRICS.filter(metricId => !!(canonicalMetric as (id:unknown)=>ReturnType<typeof canonicalMetric>)(metricId));
  }

  function normalizeDashboardBiometricSelection(ids: unknown) {
    const out: string[] = [];
    const seen = new Set<unknown>();
    for (const metricId of Array.isArray(ids) ? ids as unknown[] : []) {
      if (!safeMarkerId(metricId) || seen.has(metricId) || !(canonicalMetric as (id:unknown)=>ReturnType<typeof canonicalMetric>)(metricId)) continue;
      if (metricId === 'bp_diastolic' && seen.has('bp_systolic')) continue;
      out.push(metricId as string);
      seen.add(metricId);
    }
    return out;
  }

  function getDashboardBiometricSelection() {
    try {
      const raw = localStorage.getItem(dashboardBiometricSelectionKey());
      if (raw != null) return normalizeDashboardBiometricSelection(JSON.parse(raw) as unknown);
    } catch {}
    return normalizeDashboardBiometricSelection(getDashboardDefaultBiometricSelection());
  }

  function saveDashboardBiometricSelection(ids: unknown) {
    localStorage.setItem(dashboardBiometricSelectionKey(), JSON.stringify(normalizeDashboardBiometricSelection(ids)));
  }

  function formatDashboardRelativeTime(ts: unknown) {
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
    const connections = (state.importedData?.wearableConnections || {}) as Record<string,WearableConnectionReader>;
    const sources = Object.values(connections).filter(conn => conn?.connectedAt && conn?.accessToken && !conn.needsReauth);
    if (!sources.length) return { showSync: false, lastSyncAt: 0 };
    const now = Date.now();
    const lastSyncAt = Math.max(0, ...sources.map(conn => Number(conn.lastSyncAt) || 0));
    const staleCount = sources.filter(conn => now - (Number(conn.lastSyncAt) || 0) >= DASHBOARD_BIOMETRIC_STALE_MS).length;
    return { showSync: staleCount > 0, staleCount, lastSyncAt };
  }

  function projectDashboardBiometricSyncStatus():DashboardBiometricSyncView|null {
    const syncState = getDashboardBiometricSyncState();
    if (!syncState.lastSyncAt && !syncState.showSync) return null;
    const label = syncState.lastSyncAt ? `Updated ${formatDashboardRelativeTime(syncState.lastSyncAt)}` : 'Not synced yet';
    return {stale:syncState.showSync,label};
  }

  function getDashboardBiometricTile(metricId: unknown, { allowEmptyManual = false }: {allowEmptyManual?:unknown} = {}): BiometricTile | null {
    const summary = state.importedData?.wearableSummary as import("../types/mobile-dashboard.js").MobileWearableReader | null | undefined;
    const metric = summary?.metrics?.[metricId as string];
    const canon = (canonicalMetric as (id:unknown)=>ReturnType<typeof canonicalMetric>)(metricId);
    if (!canon) return null;
    if (!summary || !metric || metric.latest == null) {
      if (!allowEmptyManual || !isDashboardManualBiometricMetric(metricId)) return null;
      return {
        id: metricId,
        label: metricId === 'bp_systolic' ? 'Blood pressure' : canon.label,
        value: '\u2014',
        unit: metricId === 'bp_systolic'
          ? 'mmHg'
          : ((wearableDisplayUnit as (id:unknown,unit:unknown,system:unknown)=>unknown)(metricId, canon.unit || '', state.unitSystem) || canon.sub || ''),
        change: '+ Log',
        empty: true,
      };
    }
    return {
      id: metricId,
      label: metricId === 'bp_systolic' && summary?.metrics?.bp_diastolic ? 'Blood pressure' : canon.label,
      value: formatMobileWearableValue(metricId, metric, summary),
      unit: metricId === 'bp_systolic'
        ? 'mmHg'
        : ((wearableDisplayUnit as (id:unknown,unit:unknown,system:unknown)=>unknown)(metricId, canon.unit || '', state.unitSystem) || canon.sub || ''),
      change: formatMobileWearableDelta(metricId, metric, canon) || 'latest',
      empty: false,
    };
  }

  function projectDashboardWearableTilesWidget():DashboardBiometricsOverviewView {
    const selected = getDashboardBiometricSelection();
    const tiles = selected
      .map(metricId => getDashboardBiometricTile(metricId, { allowEmptyManual: true }))
      .filter(Boolean) as BiometricTile[];
    const sync = projectDashboardBiometricSyncStatus();
    const count=String(tiles.length),pluralSuffix=tiles.length===1?'':'s';
    const rows=!tiles.length?[]:tiles.map(projectDashboardBiometricTile);
    const view:DashboardBiometricsOverviewView={kind:'wearables',count,pluralSuffix,sync,rows};
    return view;
  }

  function prepareDashboardWearableTilesWidget(): DashboardBiometricsSnapshot {
    const view = projectDashboardWearableTilesWidget();
    return {body: renderDashboardBiometricPresentation(view), view};
  }

  function renderDashboardWearableTilesWidget():string {return prepareDashboardWearableTilesWidget().body;}

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
    return Object.values(helpers).every(helper => typeof helper === 'function') ? helpers as unknown as GenomeEvidence : null;
  }

  function getDashboardGenomeImpact(stored: GenomeStored, entry: GenomeStored | null | undefined) {
    const evidence = _dashboardGenomeEvidence;
    if (!evidence) return { label: 'pending', tone: 'pending', rank: 999, note: stored?.note || '', evidenceProfile: null };
    const info = entry ? (findGenotypeInfo as (entry:unknown,genotype:unknown)=>GenomeStored|null)(entry, stored?.genotype) : null;
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

  const DASHBOARD_VISIBLE_SNP_TONES = new Set<unknown>(['risk', 'protective', 'trait']);

  function dashboardSnpAssessmentText(profile: GenomeProfile) {
    const evidence = profile.evidenceShortLabel === 'Not graded'
      ? 'Evidence not graded'
      : `${profile.evidenceShortLabel} evidence`;
    return `${evidence} · ${profile.relevanceShortLabel}`;
  }

  function projectDashboardSnpEvidence(f: GenomeFinding):GenomeEvidenceView|null {
    const evidence = _dashboardGenomeEvidence;
    if (!evidence) return null;
    const references = Array.isArray(f.references)
      ? (f.references as unknown[]).filter(reference => /^https?:\/\//i.test(String(reference || '')))
      : [];
    const issueUrl = evidence.snpEvidenceIssueUrl(f.rsid, f.catalogEntry || {});
    const profile = f.evidenceProfile || evidence.resolveSnpEvidenceProfile(f.catalogEntry || {}, f);
    const rsid=genomeLiteralText(f.rsid);
    const assessment=genomeLiteralText(dashboardSnpAssessmentText(profile));
    let interpretation:GenomeEvidenceView['interpretation']=null;
    if(profile.scope||profile.context)interpretation={
      scope:profile.scope?genomeLiteralText(profile.scope):null,
      context:profile.context?genomeLiteralText(profile.context):null,
    };
    const sources=references.map(reference=>({href:genomeLiteralText(String(reference)),
      label:genomeLiteralText(evidence.dnaStudyReferenceLabel(String(reference)).replace(/^PubMed(?: Central)? · /,''))}));
    const actionRsid=f.rsid;
    const askRsid=actionRsid === undefined || actionRsid === null || actionRsid === '' ? null : String(actionRsid);
    const issueHref=genomeLiteralText(issueUrl);
    return {rsid,assessment,interpretation,references:sources,askRsid,issueHref};
  }

  function projectDashboardGenomeRow(f: GenomeFinding, { showCategoryLabel = true }: {showCategoryLabel?:unknown} = {}):GenomeRowView {
    const subline = [f.variant || f.rsid,showCategoryLabel ? f.categoryLabel : ''].filter(Boolean).join(' · ');
    const classes=`db-snp-row db-snp-${genomeLiteralText(f.impactTone || 'pending')}`;
    const gene=genomeLiteralText(f.gene || f.rsid);
    const text=genomeLiteralText(subline);
    const impact=genomeLiteralText(f.impactLabel || 'pending');
    const genotype=genomeLiteralText(f.genotype || '—');
    const note=f.note?genomeLiteralText(f.note):null;
    const evidence=projectDashboardSnpEvidence(f);
    return {classes,gene,subline:text,impact,genotype,note,evidence};
  }

  function projectGenomeMtdnaPanel(mtdna: MtdnaReader, haplogroupTable: GenomeHaplogroupTable | null | undefined, genetics: GenomeGenetics) {
    return projectDashboardMtdnaPanel(mtdna, haplogroupTable,
      () => (detectMtDNAMismatch as (genetics:unknown)=>ReturnType<typeof detectMtDNAMismatch>)(genetics), _dashboardGenomeEvidence);
  }

  function projectDashboardGenomeContribution():string|null {
    const evidence = _dashboardGenomeEvidence;
    if (!evidence) return null;
    return genomeLiteralText(evidence.newSnpSuggestionIssueUrl());
  }

  function groupDashboardGenomeFindings(findings: GenomeFinding[]) {
    const groups = new Map<unknown,GenomeGroup>();
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
      const group = groups.get(category)!;
      group.findings.push(f);
      if (((f.impactRank ?? 99) as number) < (group.rank as number)) {
        group.rank = f.impactRank ?? 99;
        group.tone = f.impactTone || 'pending';
        group.impactLabel = f.impactLabel || 'pending';
      }
    }
    return Array.from(groups.values())
      .map(group => ({
        ...group,
        findings: group.findings.slice().sort((a, b) => ((a.impactRank as number) - (b.impactRank as number)) || String(a.gene || a.rsid).localeCompare(String(b.gene || b.rsid)) || String(a.variant || '').localeCompare(String(b.variant || ''))),
      }))
      .sort((a, b) => ((a.rank as number) - (b.rank as number)) || String(a.categoryLabel).localeCompare(String(b.categoryLabel)));
  }

  function projectDashboardGenomeGroup(group: GenomeGroup, { secondary = false }: {secondary?:unknown} = {}):GenomeGroupView {
    const count = group.findings.length;
    const classes=`db-genome-category db-genome-category-${genomeLiteralText(group.tone || 'pending')}${secondary ? ' db-genome-category-secondary' : ''}`;
    const label=genomeLiteralText(group.categoryLabel || 'Other');
    const countLabel=`${count} finding${count === 1 ? '' : 's'}`;
    const impact=genomeLiteralText(group.impactLabel || 'pending');
    const rows=group.findings.map(f=>projectDashboardGenomeRow(f,{showCategoryLabel:false}));
    return {classes,label,count:countLabel,impact,rows};
  }

  function refreshDashboardGenomeWidgetWhenDataReady({ needsSnps = false, needsMtdna = false, needsEvidence = false }: {needsSnps?:unknown;needsMtdna?:unknown;needsEvidence?:unknown} = {}) {
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

  function projectDashboardGenomeWidget(): DashboardGenomeWidgetView {
    const genetics = state.importedData?.genetics as GenomeGenetics | null | undefined;
    const snps = genetics?.snps || {};
    const apoe = genetics?.apoe;
    const snpTable = getDashboardSnpTableCache() as Record<string,GenomeStored> | null;
    const haplogroupTable = getDashboardHaplogroupTableCache() as GenomeHaplogroupTable | null;
    const snpCount = Object.keys(snps).length;
    _dashboardGenomeEvidence ||= getDashboardGenomeEvidence();
    const needsSnps = !!snpCount && !snpTable;
    const needsMtdna = !!genetics?.mtdna && !haplogroupTable;
    const needsEvidence = !_dashboardGenomeEvidence;
    if (needsMtdna) refreshDashboardGenomeWidgetWhenDataReady({ needsSnps, needsMtdna, needsEvidence });
    if (needsSnps || needsEvidence) {
      refreshDashboardGenomeWidgetWhenDataReady({ needsSnps, needsMtdna, needsEvidence });
      return {kind: 'loading', count: `${snpCount}`, plural: snpCount === 1 ? '' : 's'};
    }
    const apoeProfile = _dashboardGenomeEvidence!.resolveSnpEvidenceProfile((snpTable)?.rs429358 || (snpTable)?.rs7412 || {});
    const findings: GenomeFinding[] = Object.entries(snps)
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
      .sort((a, b) => ((a.impactRank as number) - (b.impactRank as number)) || String(a.gene || a.rsid).localeCompare(String(b.gene || b.rsid)) || String(a.variant || '').localeCompare(String(b.variant || '')));
    if (!findings.length && !apoe && !genetics?.mtdna) {
      return {kind:'empty',contributionHref:projectDashboardGenomeContribution()};
    }
    const visibleFindings = findings.filter(f => DASHBOARD_VISIBLE_SNP_TONES.has(f.impactTone));
    const secondaryFindings = findings.filter(f => !DASHBOARD_VISIBLE_SNP_TONES.has(f.impactTone));
    const groups = groupDashboardGenomeFindings(visibleFindings);
    const secondaryGroups = groupDashboardGenomeFindings(secondaryFindings);
    const rows = groups.map(group => projectDashboardGenomeGroup(group));
    const secondary:Extract<DashboardGenomeView,{kind:'populated'}>['secondary'] = secondaryFindings.length
      ? {count:`${secondaryFindings.length}`,groups:secondaryGroups.map(group=>projectDashboardGenomeGroup(group,{secondary:true}))}:null;
    const noPriority=!!(snpCount && !visibleFindings.length);
    const legend=!!visibleFindings.length;
    const meta = [
      snpCount ? `${snpCount} imported SNP${snpCount === 1 ? '' : 's'}` : '',
      genetics?.source || '',
      genetics?.importDate || '',
    ].filter(Boolean).join(' · ');
    const summary=meta?genomeLiteralText(meta):null;
    const apoeView=apoe?{assessment:genomeLiteralText(dashboardSnpAssessmentText(apoeProfile)),value:genomeLiteralText(apoe)}:null;
    const mtdna=genetics?.mtdna?projectGenomeMtdnaPanel(genetics.mtdna,haplogroupTable,genetics):null;
    const contributionHref=projectDashboardGenomeContribution();
    return {kind:'populated',meta:summary,legend,apoe:apoeView,
      mtdna,noPriority,groups:rows,secondary,contributionHref};
  }

  function renderDashboardGenomeWidget(): string {
    return renderDashboardGenomeWidgetView(projectDashboardGenomeWidget());
  }

  return {
    buildDashboardWidgetContext,
    getCachedRecommendationsCatalog,
    refreshRecommendationsWhenCatalogReady,
    getGlobalRecommendationCandidates,
    renderRecommendationCard,
    renderRecommendationList,
    renderRecommendationsEmpty,
    renderDashboardRecommendationsWidget,
    getDashboardMarkerById,
    renderDashboardBioAgeWidget,
    projectDashboardBioAgeWidget,
    renderBiologyScoresWidget,
    renderDashboardBiologyScoreWidget,
    renderDashboardBiologicalCoherenceWidget,
    renderDashboardQuickMarkersWidget,
    projectDashboardQuickMarkersWidget,
    projectDashboardNotesWidget,
    projectDashboardSingleMarkerWidget,
    projectDashboardSpotlightWidget,
    renderDashboardSingleMarkerWidget,
    renderDashboardSpotlightWidget,
    renderLabsPriorityBanner,
    renderDashboardInsightsListWidget,
    prepareDashboardInsightsListWidget,
    getDashboardBiometricSelection,
    saveDashboardBiometricSelection,
    getDashboardBiometricMetricOrder,
    getDashboardBiometricTile,
    renderDashboardWearableTilesWidget,
    prepareDashboardWearableTilesWidget,
    renderDashboardGenomeWidget,
    projectDashboardGenomeWidget,
    renderDashboardCorrelationWidget,
    projectDashboardCorrelationWidget,
    projectDashboardLightTodayWidget,
    projectDashboardLightConditionsWidget,
    projectDashboardLightLiveSessionWidget,
    projectDashboardLightSessionLogWidget,
    projectDashboardLightChannelsWidget,
    renderDashboardLightTodayWidget,
    renderDashboardLightConditionsWidget,
    renderDashboardLightLiveSessionWidget,
    renderDashboardLightSessionLogWidget,
    renderDashboardLightChannelsWidget,
    renderDashboardKeyTrendsWidget,
    projectDashboardKeyTrendsWidget,
    projectLabsPriorityBanner,
    projectDashboardWearableTilesWidget,
    projectDashboardInsightsListWidget,
    projectDashboardRecommendationsWidget,
    renderDashboardAlertsWidget,
    projectDashboardAlertsWidget,
    renderDashboardNotesWidget,
    setRecommendationState,
    isDashboardQuickMarkerPinned,
    toggleDashboardQuickMarkerPin,
  };
}
