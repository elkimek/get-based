// @ts-check
// dashboard-recommendation-widget.js - recommendation candidate and widget rendering

import { state } from './state.js';
import { getActiveData } from './data.js';
import { getEffectiveRangeForDate, getLatestValueIndex } from './marker-analysis.js';
import { computeBiologyScores } from './biology-scores.js';
import { profileStorageKey } from './profile.js';
import { escapeAttr, escapeHTML, formatValue, getStatus } from './utils.js';
import {
  getRecommendationModuleFunction,
  getRecommendationsCatalogCache,
  getRecommendationsSnpTable,
  setRecommendationsCatalogCache,
} from './recommendations-runtime.js';
import { getLoadedRollingChannelTotals } from './light-sun-loader.js';
import { getMarkerStorageDotKey } from './marker-placement.js';

let dashboardRecommendationDelegatesInstalled = false;

/** @type {Record<string, ((...args: any[]) => any) | null>} */
const dashboardRecommendationRuntimeDeps = {
  detectWearableTrendSlots: null,
  dismissRecommendation: null,
  discussRecommendation: null,
  navigate: null,
  openRecommendationDetail: null,
  openSettingsModal: null,
  saveRecommendation: null,
  showDetailModal: null,
};

export function configureDashboardRecommendationRuntimeDeps(deps = {}) {
  const previous = { ...dashboardRecommendationRuntimeDeps };
  for (const name of Object.keys(dashboardRecommendationRuntimeDeps)) {
    if (Object.hasOwn(deps, name)) {
      dashboardRecommendationRuntimeDeps[name] = typeof deps[name] === 'function'
        ? deps[name]
        : null;
    }
  }
  return previous;
}

function callDashboardRecommendationRuntime(name, ...args) {
  return dashboardRecommendationRuntimeDeps[name]?.(...args);
}

export function dashboardRecommendationActionAttrs(action, attrs = {}) {
  return [
    `data-dashboard-rec-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([name, value]) => `data-dashboard-rec-${escapeAttr(name)}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

function handleDashboardRecommendationClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = /** @type {HTMLElement | null} */ (target.closest('[data-dashboard-rec-action]'));
  if (!actionEl || !actionEl.closest('.rec-next-widget, .rec-next-card, .db-correlation-empty')) return;
  const action = actionEl.dataset.dashboardRecAction || '';
  event.preventDefault();

  if (action === 'view-marker') {
    const markerId = actionEl.dataset.dashboardRecMarkerId || '';
    if (markerId) callDashboardRecommendationRuntime('showDetailModal', markerId, { scrollToRec: true });
  } else if (action === 'open-detail') {
    callDashboardRecommendationRuntime(
      'openRecommendationDetail',
      actionEl.dataset.dashboardRecSlotKey || '',
      actionEl.dataset.dashboardRecLabel || 'Tip',
      actionEl.dataset.dashboardRecMarkerStatus || '',
    );
  } else if (action === 'discuss') {
    callDashboardRecommendationRuntime('discussRecommendation', actionEl.dataset.dashboardRecId || '');
  } else if (action === 'save') {
    callDashboardRecommendationRuntime('saveRecommendation', actionEl.dataset.dashboardRecId || '', actionEl.dataset.dashboardRecOn === 'true');
  } else if (action === 'dismiss') {
    callDashboardRecommendationRuntime('dismissRecommendation', actionEl.dataset.dashboardRecId || '', actionEl.dataset.dashboardRecOn === 'true');
  } else if (action === 'navigate') {
    callDashboardRecommendationRuntime('navigate', actionEl.dataset.dashboardRecRoute || '');
  } else if (action === 'open-privacy-settings') {
    callDashboardRecommendationRuntime('openSettingsModal', 'privacy');
  }
}

export function initDashboardRecommendationDelegates() {
  if (dashboardRecommendationDelegatesInstalled) return;
  document.addEventListener('click', handleDashboardRecommendationClick);
  dashboardRecommendationDelegatesInstalled = true;
}

export function createDashboardRecommendationWidget({
  markerHasData,
  buildDashboardWidgetContext,
  showRecommendations,
}) {
  let _recommendationsLoadPromise = null;

  function recommendationStateStorageKey(kind) {
    return profileStorageKey(state.currentProfile || 'default', `recommendations-${kind}-v1`);
  }

  function getRecommendationStateSet(kind) {
    try {
      const raw = JSON.parse(localStorage.getItem(recommendationStateStorageKey(kind)) || '[]');
      return new Set(Array.isArray(raw) ? raw.filter(v => typeof v === 'string') : []);
    } catch {
      return new Set();
    }
  }

  function saveRecommendationStateSet(kind, set) {
    localStorage.setItem(recommendationStateStorageKey(kind), JSON.stringify([...set]));
  }

  function setRecommendationState(kind, id, on) {
    if (!id) return;
    const set = getRecommendationStateSet(kind);
    if (on) set.add(id);
    else set.delete(id);
    saveRecommendationStateSet(kind, set);
    refreshRecommendationSurfaces();
  }

  function getCachedRecommendationsCatalog() {
    const catalog = getRecommendationsCatalogCache();
    return catalog?.slots ? catalog : null;
  }

  function refreshRecommendationsWhenCatalogReady() {
    const loadCatalog = getRecommendationModuleFunction('loadCatalog');
    if (_recommendationsLoadPromise || typeof loadCatalog !== 'function') return;
    _recommendationsLoadPromise = loadCatalog()
      .then(catalog => {
        setRecommendationsCatalogCache(catalog);
        refreshRecommendationSurfaces();
      })
      .finally(() => { _recommendationsLoadPromise = null; });
  }

  function refreshRecommendationSurfaces() {
    const ctx = buildDashboardWidgetContext(getActiveData());
    const dashboardBody = document.querySelector?.('.dashboard-widget[data-widget-id="recommendations"] .dashboard-widget-body');
    if (dashboardBody) dashboardBody.innerHTML = renderDashboardRecommendationsWidget(ctx);
    const page = document.getElementById('recommendations-page');
    if (page && state.currentView === 'recommendations') showRecommendations?.(getActiveData());
  }

  function getRecommendationSlotLabel(catalog, slotKey) {
    return catalog?.slots?.[slotKey]?.label || slotKey.split('.').pop().replace(/([A-Z])/g, ' $1');
  }

  function getRecommendationPrimaryAction(catalog, slotKey) {
    const slot = catalog?.slots?.[slotKey];
    return slot?.freeActions?.[0] || slot?.foodForms?.[0] || slot?.productForms?.[0] || slot?.forms?.[0] || '';
  }

  function getRecommendationStatusReason(name, status, alert) {
    const readable = String(status || '').replace(/_/g, ' ');
    if (alert?.code) {
      const code = String(alert.code).replace(/_/g, ' ');
      return `${name} is ${readable}; current trend signal is ${code}.`;
    }
    return `${name} is ${readable} versus the active reference range.`;
  }

  function getGlobalRecommendationCandidates(ctx, catalog, { includeDismissed = false } = {}) {
    if (!getRecommendationModuleFunction('isProductRecsEnabled')?.() || !catalog?.slots) return [];
    const dismissed = getRecommendationStateSet('dismissed');
    const saved = getRecommendationStateSet('saved');
    const trendById = new Map((ctx.trendAlerts || []).map(alert => [alert.id, alert]));
    const criticalIds = new Set((ctx.criticalFlags || []).map(f => f.id));
    const out = [];
    const add = candidate => {
      if (!candidate?.slotKey || !catalog.slots[candidate.slotKey]) return;
      const id = candidate.id || `${candidate.source}:${candidate.slotKey}:${candidate.markerId || ''}`;
      if (!includeDismissed && dismissed.has(id)) return;
      out.push({
        ...candidate,
        id,
        label: candidate.label || getRecommendationSlotLabel(catalog, candidate.slotKey),
        primaryAction: candidate.primaryAction || getRecommendationPrimaryAction(catalog, candidate.slotKey),
        saved: saved.has(id),
        dismissed: dismissed.has(id),
      });
    };

    for (const [catKey, category] of Object.entries(ctx.data.categories || {})) {
      for (const [markerKey, marker] of Object.entries(category.markers || {})) {
        if (!marker || marker.hidden || !markerHasData(marker)) continue;
        const markerId = `${catKey}_${markerKey}`;
        const slotKey = getMarkerStorageDotKey(marker, markerId);
        if (!slotKey) continue;
        if (!catalog.slots[slotKey]) continue;
        const latestIdx = getLatestValueIndex(marker.values || []);
        if (latestIdx < 0) continue;
        const range = getEffectiveRangeForDate(marker, latestIdx);
        const value = marker.values[latestIdx];
        const status = getStatus(value, range.min, range.max);
        const alert = trendById.get(markerId);
        if (status === 'normal' && !alert && !criticalIds.has(markerId)) continue;
        state.markerRegistry[markerId] = marker;
        add({
          id: `labs:${slotKey}:${markerId}`,
          source: 'Labs',
          slotKey,
          markerId,
          markerStatus: status,
          score: (criticalIds.has(markerId) ? 110 : status === 'high' || status === 'low' ? 80 : 45) + (alert ? 25 : 0),
          label: getRecommendationSlotLabel(catalog, slotKey),
          reason: getRecommendationStatusReason(marker.name || markerKey, status, alert),
          meta: `${category.label || catKey} · ${formatValue(value)}${marker.unit ? ` ${marker.unit}` : ''}`,
        });
      }
    }

    const biologyScores = computeBiologyScores(ctx.filteredData || ctx.data || {}).filter(score => score.id !== 'biologicalCoherence');
    const seenBiologySlots = new Set();
    for (const score of biologyScores) {
      const coreGap = (score.missing || []).find(item => item.core && item.path && catalog.slots[item.path]);
      if (!coreGap || seenBiologySlots.has(coreGap.path)) continue;
      seenBiologySlots.add(coreGap.path);
      add({
        id: `biology:${score.id}:${coreGap.path}`,
        source: 'Biology Scores',
        slotKey: coreGap.path,
        score: 86 + Math.round((score.coherenceWeight || 1) * 4),
        reason: `Shown because ${coreGap.label} is missing from the inputs used for ${score.title} context and Biological Coherence coverage.`,
        meta: `${Math.round((score.coverage || 0) * 100)}% ${score.title} coverage`,
      });
    }
    const weakestBiology = biologyScores.filter(score => Number.isFinite(score.score)).sort((a, b) => a.score - b.score)[0];
    const weakestDrag = weakestBiology?.available?.filter(item => !item.profileContextOnly && Number.isFinite(item.partial) && item.path && catalog.slots[item.path]).sort((a, b) => (a.partial || 100) - (b.partial || 100))[0];
    if (weakestBiology && weakestDrag?.path && !seenBiologySlots.has(weakestDrag.path)) {
      add({
        id: `biology:${weakestBiology.id}:${weakestDrag.path}:drag`,
        source: 'Biology Scores',
        slotKey: weakestDrag.path,
        score: 74,
        reason: `Shown because ${weakestDrag.label} is among the lower-scoring available inputs in ${weakestBiology.title}.`,
        meta: `${weakestBiology.score}/100 · ${Math.round(weakestDrag.partial)}/100 marker fit`,
      });
    }

    const sessions = (Array.isArray(state.importedData?.sunSessions)
      ? state.importedData.sunSessions
      : []).filter(s => s?.startedAt || s?.endedAt);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const hasRecentLightSession = sessions.some(s => Number(s.endedAt || s.startedAt || 0) >= sevenDaysAgo);
    const totals7d = getLoadedRollingChannelTotals(7);
    const hasLoadedCircadianGap = totals7d && Number(totals7d.circadian || 0) <= 0;
    if (catalog.slots['light.morningLight'] && (!hasRecentLightSession || hasLoadedCircadianGap)) {
      add({
        id: 'light:light.morningLight:recent',
        source: 'Light',
        slotKey: 'light.morningLight',
        score: hasRecentLightSession ? 62 : 70,
        reason: hasRecentLightSession
          ? 'Recent light logs show little circadian-channel exposure over the last 7 days.'
          : 'Shown because no recent sun or device sessions are logged and the catalog contains morning-light context.',
        meta: 'Light & Sun',
      });
    }

    const wearableTrendSlots = callDashboardRecommendationRuntime('detectWearableTrendSlots', state.importedData?.wearableSummary);
    if (wearableTrendSlots && typeof wearableTrendSlots[Symbol.iterator] === 'function') {
      for (const hit of wearableTrendSlots) {
        add({
          id: `body:${hit.slotKey}:wearable`,
          source: 'Body',
          slotKey: hit.slotKey,
          score: 78,
          reason: hit.reason,
          meta: 'Wearable trend',
        });
      }
    }

    const buildDNAHints = getRecommendationModuleFunction('buildDNAHints');
    if (buildDNAHints && getRecommendationsSnpTable()) {
      for (const slotKey of Object.keys(catalog.slots)) {
        const hints = buildDNAHints(slotKey);
        if (!hints?.length) continue;
        add({
          id: `genome:${slotKey}:dna`,
          source: 'Genome',
          slotKey,
          score: 72,
          reason: hints[0].text,
          meta: hints.slice(0, 3).map(h => h.gene).filter(Boolean).join(', ') || 'Imported DNA',
        });
      }
    }

    return out.sort((a, b) => (b.saved - a.saved) || (b.score - a.score) || String(a.label).localeCompare(String(b.label)));
  }

  function renderRecommendationCard(candidate, { compact = false } = {}) {
    const savedClass = candidate.saved ? ' is-saved' : '';
    const primaryAction = candidate.primaryAction ? `<div class="rec-next-primary"><span class="rec-next-primary-label">Example to explore</span>${escapeHTML(candidate.primaryAction)}</div>` : '';
    const markerBtn = candidate.markerId
      ? `<button type="button" class="dashboard-action-btn" ${dashboardRecommendationActionAttrs('view-marker', { 'marker-id': candidate.markerId })}>View marker</button>`
      : '';
    const saveLabel = candidate.saved ? 'Bookmarked' : 'Bookmark';
    const dismissLabel = candidate.dismissed ? 'Show' : 'Hide';
    return `<article class="rec-next-card${compact ? ' rec-next-card-compact' : ''}${savedClass}" data-rec-id="${escapeAttr(candidate.id)}">
      <div class="rec-next-head">
        <span class="rec-next-source">${escapeHTML(candidate.source)}</span>
        <strong>${escapeHTML(candidate.label)}</strong>
      </div>
      <div class="rec-next-reason">${escapeHTML(candidate.reason || '')}</div>
      ${candidate.meta ? `<div class="rec-next-meta">${escapeHTML(candidate.meta)}</div>` : ''}
      ${compact ? '' : primaryAction}
      <div class="rec-next-actions">
        <button type="button" class="dashboard-action-btn dashboard-action-btn-primary" ${dashboardRecommendationActionAttrs('open-detail', { 'slot-key': candidate.slotKey, label: candidate.label, 'marker-status': candidate.markerStatus || '' })}>View options</button>
        ${markerBtn}
        <button type="button" class="dashboard-action-btn" ${dashboardRecommendationActionAttrs('discuss', { id: candidate.id })}>Discuss</button>
        <button type="button" class="dashboard-action-btn" ${dashboardRecommendationActionAttrs('save', { id: candidate.id, on: candidate.saved ? 'false' : 'true' })}>${saveLabel}</button>
        ${compact ? '' : `<button type="button" class="dashboard-action-btn" ${dashboardRecommendationActionAttrs('dismiss', { id: candidate.id, on: candidate.dismissed ? 'false' : 'true' })}>${dismissLabel}</button>`}
      </div>
    </article>`;
  }

  function renderRecommendationsEmpty(message = 'No data-linked tips yet.') {
    return `<button type="button" class="db-correlation-empty" ${dashboardRecommendationActionAttrs('navigate', { route: 'labs' })}>
      <strong>${escapeHTML(message)}</strong>
      <span>Import labs, connect body data, log light exposure, or add DNA to surface optional general-information tips.</span>
    </button>`;
  }

  function renderDashboardRecommendationsWidget(ctx) {
    if (!getRecommendationModuleFunction('isProductRecsEnabled')?.()) {
      return `<button type="button" class="db-correlation-empty" ${dashboardRecommendationActionAttrs('open-privacy-settings')}>
        <strong>Tips are off</strong>
        <span>Enable Tips in settings to show optional general-information ideas linked to your data.</span>
      </button>`;
    }
    const catalog = getCachedRecommendationsCatalog();
    if (!catalog) {
      refreshRecommendationsWhenCatalogReady();
      return `<div class="dashboard-widget-empty">Loading tips...</div>`;
    }
    const candidates = getGlobalRecommendationCandidates(ctx, catalog).slice(0, 3);
    if (!candidates.length) return renderRecommendationsEmpty();
    return `<div class="rec-next-widget">
      ${candidates.map(c => renderRecommendationCard(c, { compact: true })).join('')}
      <button type="button" class="dashboard-action-btn dashboard-action-btn-primary" ${dashboardRecommendationActionAttrs('navigate', { route: 'recommendations' })}>View all tips</button>
    </div>`;
  }

  return {
    getCachedRecommendationsCatalog,
    refreshRecommendationsWhenCatalogReady,
    getGlobalRecommendationCandidates,
    renderRecommendationCard,
    renderRecommendationsEmpty,
    renderDashboardRecommendationsWidget,
    setRecommendationState,
  };
}

initDashboardRecommendationDelegates();
