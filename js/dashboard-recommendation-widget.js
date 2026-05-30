// dashboard-recommendation-widget.js - recommendation candidate and widget rendering

import { state } from './state.js';
import { getActiveData, getEffectiveRangeForDate, getLatestValueIndex } from './data.js';
import { profileStorageKey } from './profile.js';
import { escapeAttr, escapeHTML, formatValue, getStatus } from './utils.js';

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
    return window._cachedCatalog?.slots ? window._cachedCatalog : null;
  }

  function refreshRecommendationsWhenCatalogReady() {
    if (_recommendationsLoadPromise || !window.loadCatalog) return;
    _recommendationsLoadPromise = window.loadCatalog()
      .then(catalog => {
        if (catalog) window._cachedCatalog = catalog;
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
      return `${name} is ${readable}; trend signal: ${code}.`;
    }
    return `${name} is ${readable} versus its active reference range.`;
  }

  function inlineJsString(value) {
    return JSON.stringify(String(value ?? '')).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  }

  function inlineHandlerCall(fnName, ...args) {
    return escapeAttr(`window.${fnName}(${args.map(inlineJsString).join(', ')})`);
  }

  function getGlobalRecommendationCandidates(ctx, catalog, { includeDismissed = false } = {}) {
    if (!window.isProductRecsEnabled?.() || !catalog?.slots) return [];
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
        const slotKey = `${catKey}.${markerKey}`;
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
          meta: `${category.label || catKey} \u00b7 ${formatValue(value)}${marker.unit ? ` ${marker.unit}` : ''}`,
        });
      }
    }

    const sessions = (window.getSessions?.() || []).filter(s => s?.startedAt || s?.endedAt);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const hasRecentLightSession = sessions.some(s => Number(s.endedAt || s.startedAt || 0) >= sevenDaysAgo);
    const totals7d = window.rollingChannelTotals?.(7) || {};
    if (catalog.slots['light.morningLight'] && (!hasRecentLightSession || Number(totals7d.circadian || 0) <= 0)) {
      add({
        id: 'light:light.morningLight:recent',
        source: 'Light',
        slotKey: 'light.morningLight',
        score: hasRecentLightSession ? 62 : 70,
        reason: hasRecentLightSession
          ? 'Recent light logs show little circadian-channel exposure over the last 7 days.'
          : 'No recent sun or device sessions are logged, so morning light is the cleanest Light-lens next step.',
        meta: 'Light & Sun',
      });
    }

    if (typeof window.detectWearableTrendSlots === 'function') {
      for (const hit of window.detectWearableTrendSlots(state.importedData?.wearableSummary)) {
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

    if (typeof window.buildDNAHints === 'function' && window._snpTableCache) {
      for (const slotKey of Object.keys(catalog.slots)) {
        const hints = window.buildDNAHints(slotKey);
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
    const primaryAction = candidate.primaryAction ? `<div class="rec-next-primary">${escapeHTML(candidate.primaryAction)}</div>` : '';
    const markerCall = candidate.markerId
      ? escapeAttr(`window.showDetailModal(${inlineJsString(candidate.markerId)}, { scrollToRec: true })`)
      : '';
    const detailCall = inlineHandlerCall('openRecommendationDetail', candidate.slotKey, candidate.label, candidate.markerStatus || '');
    const discussCall = inlineHandlerCall('discussRecommendation', candidate.id);
    const saveCall = escapeAttr(`window.saveRecommendation(${inlineJsString(candidate.id)}, ${candidate.saved ? 'false' : 'true'})`);
    const dismissCall = escapeAttr(`window.dismissRecommendation(${inlineJsString(candidate.id)}, ${candidate.dismissed ? 'false' : 'true'})`);
    const markerBtn = candidate.markerId
      ? `<button type="button" class="dashboard-action-btn" onclick="${markerCall}">View marker</button>`
      : '';
    const saveLabel = candidate.saved ? 'Bookmarked' : 'Bookmark';
    const dismissLabel = candidate.dismissed ? 'Restore' : 'Dismiss';
    return `<article class="rec-next-card${compact ? ' rec-next-card-compact' : ''}${savedClass}" data-rec-id="${escapeAttr(candidate.id)}">
      <div class="rec-next-head">
        <span class="rec-next-source">${escapeHTML(candidate.source)}</span>
        <strong>${escapeHTML(candidate.label)}</strong>
      </div>
      <div class="rec-next-reason">${escapeHTML(candidate.reason || '')}</div>
      ${candidate.meta ? `<div class="rec-next-meta">${escapeHTML(candidate.meta)}</div>` : ''}
      ${compact ? '' : primaryAction}
      <div class="rec-next-actions">
        <button type="button" class="dashboard-action-btn dashboard-action-btn-primary" onclick="${detailCall}">View options</button>
        ${markerBtn}
        <button type="button" class="dashboard-action-btn" onclick="${discussCall}">Discuss</button>
        <button type="button" class="dashboard-action-btn" onclick="${saveCall}">${saveLabel}</button>
        ${compact ? '' : `<button type="button" class="dashboard-action-btn" onclick="${dismissCall}">${dismissLabel}</button>`}
      </div>
    </article>`;
  }

  function renderRecommendationsEmpty(message = 'No data-linked recommendations yet.') {
    return `<button type="button" class="db-correlation-empty" onclick="window.navigate('labs')">
      <strong>${escapeHTML(message)}</strong>
      <span>Import labs, connect body data, log light exposure, or add DNA to generate recommendation candidates.</span>
    </button>`;
  }

  function renderDashboardRecommendationsWidget(ctx) {
    if (!window.isProductRecsEnabled?.()) {
      return `<button type="button" class="db-correlation-empty" onclick="window.openSettingsModal && window.openSettingsModal('privacy')">
        <strong>Recommendations are off</strong>
        <span>Enable Tips & Recommendations in settings to show data-linked next steps.</span>
      </button>`;
    }
    const catalog = getCachedRecommendationsCatalog();
    if (!catalog) {
      refreshRecommendationsWhenCatalogReady();
      return `<div class="dashboard-widget-empty">Loading recommendations...</div>`;
    }
    const candidates = getGlobalRecommendationCandidates(ctx, catalog).slice(0, 3);
    if (!candidates.length) return renderRecommendationsEmpty();
    return `<div class="rec-next-widget">
      ${candidates.map(c => renderRecommendationCard(c, { compact: true })).join('')}
      <button type="button" class="dashboard-action-btn dashboard-action-btn-primary" onclick="window.navigate('recommendations')">View all recommendations</button>
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
