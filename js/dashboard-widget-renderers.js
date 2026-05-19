// dashboard-widget-renderers.js - dashboard widget body renderers and recommendation helpers

import { state } from './state.js';
import { DEFAULT_METRIC_ORDER, canonicalMetric, metricsForSources } from './wearable-adapters.js';
import { dashboardBiometricSelectionKey, DASHBOARD_MANUAL_BIOMETRIC_METRICS } from './dashboard-widgets.js';
import { ensureSNPTable, findGenotypeInfo, getSnpCategoryLabel } from './dna.js';
import { profileStorageKey } from './profile.js';
import { escapeAttr, escapeHTML, formatValue, getStatus, getTrend, safeMarkerId, showNotification } from './utils.js';
import { detectTrendAlerts, filterDatesByRange, getActiveData, getAllFlaggedMarkers, getEffectiveRange, getEffectiveRangeForDate, getKeyTrendMarkers, getLatestValueIndex, renderDateRangeFilter } from './data.js';

const DASHBOARD_BIOMETRIC_STALE_MS = 12 * 60 * 60 * 1000;

export function createDashboardWidgetRenderers(deps) {
  let _dashboardGenomeSnpLoadPromise = null;

  const {
    markerHasData,
    renderDashboardLightChannelPills,
    renderLightConditionsWidgetBody,
    renderLightSessionLogActions,
    getMobileDashboardMarkers,
    getMobileDashboardInsights,
    getMobileWearableTiles,
    formatMobileWearableValue,
    formatMobileWearableDelta,
    getMobileWearablePriority = () => [],
    rerenderDashboardFromWidgetChange,
    showRecommendations,
  } = deps;

  function buildDashboardWidgetContext(data) {
    const filteredData = filterDatesByRange(data);
    const keyMarkers = getKeyTrendMarkers(filteredData);
    const trendAlerts = detectTrendAlerts(filteredData);
    const trendMarkerIds = new Set(trendAlerts.map(a => a.id));
    const allFlags = getAllFlaggedMarkers(data);
    const criticalFlags = allFlags.filter(f => {
      if (trendMarkerIds.has(f.id)) return false;
      const refRange = f.refMax - f.refMin;
      if (refRange <= 0 || f.refMin == null || f.refMax == null) return false;
      const distance = f.status === 'high' ? (f.rawValue - f.refMax) : (f.refMin - f.rawValue);
      return distance > refRange * 0.5;
    });
    return { data, filteredData, keyMarkers, trendAlerts, criticalFlags };
  }

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
    if (page && state.currentView === 'recommendations') showRecommendations(getActiveData());
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
          meta: `${category.label || catKey} · ${formatValue(value)}${marker.unit ? ` ${marker.unit}` : ''}`,
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
    const dismissCall = inlineHandlerCall('dismissRecommendation', candidate.id);
    const markerBtn = candidate.markerId
      ? `<button type="button" class="dashboard-action-btn" onclick="${markerCall}">View marker</button>`
      : '';
    const saveLabel = candidate.saved ? 'Bookmarked' : 'Bookmark';
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
        ${compact ? '' : `<button type="button" class="dashboard-action-btn" onclick="${dismissCall}">Dismiss</button>`}
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

  function renderDashboardLightTodayWidget() {
    const hero = (typeof window !== 'undefined' && typeof window.renderLightTodayHero === 'function')
      ? window.renderLightTodayHero()
      : '';
    const heroHtml = hero || `<div class="light-today-hero light-today-hero-dashboard-fallback">
      <div class="light-today-hero-head"><span class="light-today-hero-label">Today's light</span></div>
      <div class="sun-detail-ai sun-detail-ai-idle">
        <span class="sun-session-ai-dot sun-session-ai-dot-gray" aria-hidden="true"></span>
        <span>Open Light &amp; Sun to review today's sun, devices, environment, and channel rhythm.</span>
        <button class="sun-session-ai-refresh" onclick="window.navigate && window.navigate('light')">Open Light &amp; Sun</button>
      </div>
    </div>`;
    return `${heroHtml}${renderLightConditionsWidgetBody({ variant: 'full', slotId: 'cond-now-dashboard-light-today-widget' })}`;
  }

  function renderDashboardLightConditionsWidget() {
    return renderLightConditionsWidgetBody({ variant: 'full', slotId: 'cond-now-dashboard-widget' });
  }

  function renderDashboardLightSessionLogWidget() {
    return renderLightSessionLogActions();
  }

  function renderDashboardLightChannelsWidget() {
    const sessions = (window.getSessions && window.getSessions()) || [];
    const deviceSessionsAll = (window.getDeviceSessions && window.getDeviceSessions()) || [];
    const totalSessions = sessions.length + deviceSessionsAll.length;
    const lead = totalSessions === 0
      ? 'No light sessions yet. Start logging sun or device exposure to fill your channel rhythm.'
      : 'Seven-day channel rhythm from outdoor sun and therapy devices.';
    return `<div class="light-channels-section light-channels-section-dashboard">
      <p class="light-section-hint">${lead}</p>
      ${renderDashboardLightChannelPills()}
      <button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-dashboard-open-btn" onclick="window.navigate && window.navigate('light')">Open Light &amp; Sun</button>
    </div>`;
  }

  function getDashboardMarkerByPath(data, catKey, markerKey) {
    const id = `${catKey}_${markerKey}`;
    if (!safeMarkerId(id)) return null;
    const category = data.categories?.[catKey];
    const marker = category?.markers?.[markerKey];
    if (!category || !marker || !markerHasData(marker)) return null;
    const latestIdx = getLatestValueIndex(marker.values || []);
    if (latestIdx < 0) return null;
    const range = getEffectiveRangeForDate(marker, latestIdx);
    const value = marker.values[latestIdx];
    const status = getStatus(value, range.min, range.max);
    const trend = getTrend(marker.values || [], range.min, range.max);
    state.markerRegistry[id] = marker;
    return { id, category, marker, latestIdx, range, value, status, trend };
  }

  function getDashboardMarkerById(data, id) {
    if (!safeMarkerId(id)) return null;
    const idx = id.indexOf('_');
    if (idx <= 0) return null;
    return getDashboardMarkerByPath(data, id.slice(0, idx), id.slice(idx + 1));
  }

  function getDashboardAge() {
    if (!state.profileDob) return null;
    const dob = new Date(state.profileDob);
    if (Number.isNaN(dob.getTime())) return null;
    return Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  }

  function getDashboardBioAgeMarker(ctx) {
    const paths = [
      ['calculatedRatios', 'biologicalAge'],
      ['specialty', 'glycanAge'],
      ['calculatedRatios', 'phenoAge'],
      ['calculatedRatios', 'bortzAge'],
      ['ratios', 'bioAge'],
      ['ratios', 'phenoAge'],
      ['ratios', 'bortzAge'],
    ];
    for (const [cat, key] of paths) {
      const hit = getDashboardMarkerByPath(ctx.data, cat, key);
      if (hit) return hit;
    }
    return null;
  }

  function renderDashboardBioAgeWidget(ctx) {
    const hit = getDashboardBioAgeMarker(ctx);
    const age = getDashboardAge();
    const value = hit ? Number(hit.value) : null;
    const display = Number.isFinite(value) ? value.toFixed(1) : (age != null ? String(age) : '—');
    const delta = Number.isFinite(value) && age != null ? value - age : null;
    const deltaText = delta == null ? 'Chronological comparison unavailable'
      : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} yr vs chronological`;
    const pheno = getDashboardMarkerByPath(ctx.data, 'calculatedRatios', 'phenoAge')
      || getDashboardMarkerByPath(ctx.data, 'ratios', 'phenoAge');
    const bortz = getDashboardMarkerByPath(ctx.data, 'calculatedRatios', 'bortzAge')
      || getDashboardMarkerByPath(ctx.data, 'ratios', 'bortzAge');
    const pct = Number.isFinite(value) ? Math.max(4, Math.min(100, (value / 70) * 100)) : 35;
    const tag = hit ? 'button' : 'div';
    const open = hit ? ` type="button" onclick="window.showDetailModal('${hit.id}')" aria-label="${escapeAttr((hit.marker?.name || 'Biological Age') + ': ' + display)}"` : '';
    return `<${tag} class="db-hero-bio"${open}>
      <div class="db-hero-bio-left">
        <div class="db-hero-bio-num">${escapeHTML(display)}</div>
        <div class="db-hero-bio-label">
          <span class="top">${escapeHTML(hit?.marker?.name || 'Biological Age')}</span>
          <span class="actual">Chronological: ${age != null ? `${age} yr` : 'not set'}</span>
          <span class="delta">${escapeHTML(deltaText)}</span>
        </div>
      </div>
      <div class="db-hero-bio-right">
        <div class="db-hero-row"><span>PhenoAge</span><strong>${pheno ? formatValue(pheno.value) : '—'}</strong></div>
        <div class="db-hero-row"><span>Bortz Age</span><strong>${bortz ? formatValue(bortz.value) : '—'}</strong></div>
        <div class="db-hero-bio-bar"><div style="width:${pct.toFixed(0)}%"></div></div>
        <div class="db-hero-scale"><span>0</span><span>35</span><span>70 yr</span></div>
      </div>
    </${tag}>`;
  }

  function renderDashboardMiniSparkline(values, status, width = 120, height = 30) {
    const points = (values || []).filter(v => v !== null && Number.isFinite(Number(v))).slice(-10).map(Number);
    if (points.length < 2) return `<span class="db-spark db-spark-empty" aria-hidden="true"></span>`;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const coords = points.map((value, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = height - 2 - ((value - min) / span) * (height - 5);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg class="db-spark db-spark-${escapeAttr(status)}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${escapeAttr(coords)}"></polyline>
      <circle cx="${escapeAttr(coords.split(' ').at(-1)?.split(',')[0] || String(width))}" cy="${escapeAttr(coords.split(' ').at(-1)?.split(',')[1] || '0')}" r="2.5"></circle>
    </svg>`;
  }

  const DASHBOARD_QUICK_MARKERS_MAX = 4;
  const DASHBOARD_QUICK_MARKER_GOAL_SCORE = { major: 22, mild: 14, minor: 8 };
  const DASHBOARD_QUICK_MARKER_CORE_PATHS = {
    female: [
      ['diabetes', 'hba1c'],
      ['diabetes', 'homaIR'],
      ['lipids', 'apoB'],
      ['lipids', 'ldl'],
      ['vitamins', 'vitaminD'],
      ['thyroid', 'tsh'],
      ['iron', 'ferritin'],
      ['hormones', 'estradiol'],
      ['proteins', 'hsCRP'],
    ],
    male: [
      ['diabetes', 'hba1c'],
      ['diabetes', 'homaIR'],
      ['lipids', 'apoB'],
      ['lipids', 'ldl'],
      ['vitamins', 'vitaminD'],
      ['thyroid', 'tsh'],
      ['hormones', 'testosterone'],
      ['proteins', 'hsCRP'],
      ['biochemistry', 'ggt'],
    ],
    default: [
      ['diabetes', 'hba1c'],
      ['diabetes', 'homaIR'],
      ['lipids', 'apoB'],
      ['lipids', 'ldl'],
      ['vitamins', 'vitaminD'],
      ['thyroid', 'tsh'],
      ['proteins', 'hsCRP'],
      ['biochemistry', 'ggt'],
      ['hematology', 'hemoglobin'],
    ],
  };
  const DASHBOARD_QUICK_MARKER_GOAL_RULES = [
    { pattern: /\b(insulin|glucose|blood sugar|a1c|hba1c|homa|metabolic|diabetes|prediabetes|body comp|body composition|weight|fat loss)\b/i, ids: ['diabetes_hba1c', 'diabetes_homaIR', 'diabetes_glucose', 'diabetes_insulin'] },
    { pattern: /\b(cholesterol|lipid|apob|apo b|ldl|cardio|heart|artery|atherosclerosis|vascular)\b/i, ids: ['lipids_apoB', 'lipids_ldl', 'lipids_hdl', 'lipids_triglycerides'] },
    { pattern: /\b(vitamin d|vitamin-d|immune|immunity|skin|bone|dandruff)\b/i, ids: ['vitamins_vitaminD', 'proteins_hsCRP'] },
    { pattern: /\b(thyroid|tsh|fatigue|cold intolerance|metabolism)\b/i, ids: ['thyroid_tsh', 'thyroid_freeT3', 'thyroid_freeT4'] },
    { pattern: /\b(testosterone|hormone|libido|fertility|erectile|muscle|sarcopenia)\b/i, ids: ['hormones_testosterone', 'hormones_freeTestosterone', 'vitamins_vitaminD'] },
    { pattern: /\b(estrogen|estradiol|progesterone|cycle|menstrual|menopause|fertility)\b/i, ids: ['hormones_estradiol', 'hormones_progesterone', 'hormones_lh', 'hormones_fsh'] },
    { pattern: /\b(iron|ferritin|anemia|anaemia|hair loss|oxygen|endurance)\b/i, ids: ['iron_ferritin', 'iron_iron', 'iron_transferrinSaturation', 'hematology_hemoglobin'] },
    { pattern: /\b(inflammation|crp|hs-crp|recovery|pain|autoimmune)\b/i, ids: ['proteins_hsCRP', 'proteins_crp', 'hematology_wbc'] },
    { pattern: /\b(liver|detox|alcohol|ggt|alt|ast)\b/i, ids: ['biochemistry_ggt', 'biochemistry_alt', 'biochemistry_ast'] },
    { pattern: /\b(kidney|renal|creatinine|egfr)\b/i, ids: ['biochemistry_creatinine', 'biochemistry_eGFR'] },
  ];

  function dashboardQuickMarkerPinsKey() {
    return profileStorageKey(state.currentProfile || 'default', 'dashboardQuickMarkerPinsV1');
  }

  function normalizeDashboardQuickMarkerPins(ids) {
    const seen = new Set();
    const normalized = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      if (!safeMarkerId(id) || seen.has(id)) continue;
      seen.add(id);
      normalized.push(id);
      if (normalized.length >= DASHBOARD_QUICK_MARKERS_MAX) break;
    }
    return normalized;
  }

  function getDashboardQuickMarkerPins() {
    try {
      return normalizeDashboardQuickMarkerPins(JSON.parse(localStorage.getItem(dashboardQuickMarkerPinsKey())));
    } catch (e) {
      return [];
    }
  }

  function saveDashboardQuickMarkerPins(ids) {
    localStorage.setItem(dashboardQuickMarkerPinsKey(), JSON.stringify(normalizeDashboardQuickMarkerPins(ids)));
  }

  function isDashboardQuickMarkerPinned(id) {
    return getDashboardQuickMarkerPins().includes(id);
  }

  function toggleDashboardQuickMarkerPin(id) {
    if (!safeMarkerId(id)) return;
    const pins = getDashboardQuickMarkerPins();
    const existing = pins.indexOf(id);
    let pinned = false;
    if (existing >= 0) {
      pins.splice(existing, 1);
    } else {
      pins.unshift(id);
      pinned = true;
    }
    saveDashboardQuickMarkerPins(pins);
    showNotification(pinned ? 'Pinned to Quick Markers' : 'Removed from Quick Markers', pinned ? 'success' : 'info');
    if (state.currentView === 'dashboard') rerenderDashboardFromWidgetChange();
    if (state._activeDetailMarkerId === id) window.showDetailModal?.(id);
  }

  function getDashboardQuickMarkerCoreRanks() {
    const sex = state.profileSex === 'female' ? 'female' : state.profileSex === 'male' ? 'male' : 'default';
    const ranks = new Map();
    (DASHBOARD_QUICK_MARKER_CORE_PATHS[sex] || DASHBOARD_QUICK_MARKER_CORE_PATHS.default).forEach(([cat, key], index) => {
      const id = `${cat}_${key}`;
      if (!ranks.has(id)) ranks.set(id, index);
    });
    return ranks;
  }

  function getDashboardQuickMarkerGoalMatches() {
    const matches = new Map();
    for (const goal of state.importedData?.healthGoals || []) {
      const text = String(goal?.text || '').trim();
      if (!text) continue;
      const goalScore = DASHBOARD_QUICK_MARKER_GOAL_SCORE[goal.severity] || DASHBOARD_QUICK_MARKER_GOAL_SCORE.minor;
      for (const rule of DASHBOARD_QUICK_MARKER_GOAL_RULES) {
        if (!rule.pattern.test(text)) continue;
        for (const id of rule.ids) {
          const current = matches.get(id);
          if (!current || goalScore > current.score) {
            matches.set(id, {
              score: goalScore,
              reason: goal.severity ? `${goal.severity} goal match` : 'goal match',
            });
          }
        }
      }
    }
    return matches;
  }

  function buildDashboardQuickMarkerPriorityContext(ctx) {
    const priority = buildDashboardSpotlightPriorityContext(ctx);
    priority.coreRanks = getDashboardQuickMarkerCoreRanks();
    priority.goalMatches = getDashboardQuickMarkerGoalMatches();
    priority.pins = getDashboardQuickMarkerPins();
    priority.pinnedIds = new Set(priority.pins);
    return priority;
  }

  function scoreDashboardQuickMarkerHit(hit, priority) {
    const base = scoreDashboardSpotlightHit(hit, priority);
    let score = base.priorityScore;
    let reason = base.priorityReason;

    const goalMatch = priority.goalMatches.get(hit.id);
    if (goalMatch) {
      score += goalMatch.score;
      if (base.priorityScore < 25 || reason === 'core dashboard marker' || reason === 'latest tracked marker') {
        reason = goalMatch.reason;
      }
    }

    const coreRank = priority.coreRanks.get(hit.id);
    if (coreRank != null) {
      score += Math.max(4, 18 - coreRank * 2);
      if (reason === 'latest tracked marker') reason = 'core quick marker';
    }

    const pinned = priority.pinnedIds.has(hit.id);
    if (pinned) {
      score += 140;
      reason = 'manual pick';
    }

    return {
      ...base,
      priorityScore: Math.max(0, Math.round(score)),
      priorityReason: reason,
      quickMarkerPinned: pinned,
      quickMarkerCoreRank: coreRank ?? 999,
    };
  }

  function getDashboardPriorityLabel(hit, { pinned = false } = {}) {
    if (pinned) return 'Pinned';
    const score = Number(hit?.priorityScore) || 0;
    if (score >= 120) return 'Needs attention';
    if (score >= 70) return 'Watch closely';
    if (score >= 25) return 'Keep an eye on';
    return 'Core marker';
  }

  function getDashboardQuickMarkerCandidates(ctx, priority) {
    const candidates = new Map();
    const addHit = hit => {
      if (!hit || hit.marker?.hidden || candidates.has(hit.id)) return;
      candidates.set(hit.id, hit);
    };
    const addId = id => addHit(getDashboardMarkerById(ctx.data, id) || getDashboardMarkerById(ctx.filteredData, id));

    for (const hit of getDashboardSpotlightCandidates(ctx)) addHit(hit);
    for (const id of priority.pins) addId(id);
    for (const id of priority.coreRanks.keys()) addId(id);
    for (const id of priority.goalMatches.keys()) addId(id);
    return [...candidates.values()];
  }

  function getDashboardQuickMarkers(ctx) {
    const priority = buildDashboardQuickMarkerPriorityContext(ctx);
    const spotlightId = getDashboardSpotlight(ctx)?.id || '';
    const scored = getDashboardQuickMarkerCandidates(ctx, priority)
      .map(hit => scoreDashboardQuickMarkerHit(hit, priority))
      .filter(hit => hit.quickMarkerPinned
        || hit.id !== spotlightId)
      .filter(hit => hit.quickMarkerPinned
        || hit.priorityScore > 0
        || priority.keyRanks.has(hit.id)
        || priority.coreRanks.has(hit.id)
        || priority.goalMatches.has(hit.id));

    const byId = new Map(scored.map(hit => [hit.id, hit]));
    const pinned = priority.pins.map(id => byId.get(id)).filter(Boolean);
    const pinnedIds = new Set(pinned.map(hit => hit.id));
    const dynamic = scored
      .filter(hit => !pinnedIds.has(hit.id))
      .sort((a, b) => (b.priorityScore - a.priorityScore)
        || (a.quickMarkerCoreRank - b.quickMarkerCoreRank)
        || (a.priorityKeyRank - b.priorityKeyRank)
        || String(a.marker?.name || a.id).localeCompare(String(b.marker?.name || b.id)));
    return [...pinned, ...dynamic].slice(0, DASHBOARD_QUICK_MARKERS_MAX);
  }

  function renderDashboardQuickMarkerTile(hit) {
    const scoreLabel = getDashboardPriorityLabel(hit, { pinned: hit.quickMarkerPinned });
    const reason = `${scoreLabel} · ${hit.priorityReason || 'latest tracked marker'}`;
    return `<button type="button" class="db-stat-widget db-quick-marker-tile db-status-${escapeAttr(hit.status)}" onclick="window.showDetailModal('${hit.id}')" aria-label="${escapeAttr(hit.marker.name + ': ' + formatValue(hit.value) + ' ' + (hit.marker.unit || ''))}">
      <div class="db-stat-head">
        <span class="db-status-dot db-status-${escapeAttr(hit.status)}" aria-hidden="true"></span>
        <span>${escapeHTML(hit.marker.name)}</span>
      </div>
      <div class="db-stat-value">${escapeHTML(formatValue(hit.value))}${hit.marker.unit ? `<small>${escapeHTML(hit.marker.unit)}</small>` : ''}</div>
      <div class="db-stat-delta">${escapeHTML(hit.trend.arrow || '→')} vs prev</div>
      ${renderDashboardMiniSparkline(hit.marker.values, hit.status, 120, 34)}
      <div class="db-stat-reason">${escapeHTML(reason)}</div>
    </button>`;
  }

  function renderDashboardQuickMarkersWidget(ctx) {
    const hits = getDashboardQuickMarkers(ctx);
    if (!hits.length) return '';
    return `<div class="db-quick-marker-grid">${hits.map(renderDashboardQuickMarkerTile).join('')}</div>`;
  }

  function renderDashboardSingleMarkerWidget(ctx, markerId) {
    const hit = getDashboardMarkerById(ctx.data, markerId) || getDashboardMarkerById(ctx.filteredData, markerId);
    if (!hit) return '';
    const range = getEffectiveRange(hit.marker);
    const rangeText = range.min != null || range.max != null
      ? `Range ${range.min != null ? formatValue(range.min) : '—'}–${range.max != null ? formatValue(range.max) : '—'} ${hit.marker.unit || ''}`
      : 'Custom marker widget';
    return `<button type="button" class="db-stat-widget db-single-marker-widget db-status-${escapeAttr(hit.status)}" onclick="window.showDetailModal('${hit.id}')" aria-label="${escapeAttr(hit.marker.name + ': ' + formatValue(hit.value) + ' ' + (hit.marker.unit || ''))}">
      <div class="db-stat-head">
        <span class="db-status-dot db-status-${escapeAttr(hit.status)}" aria-hidden="true"></span>
        <span>${escapeHTML(hit.marker.name)}</span>
      </div>
      <div class="db-stat-value">${escapeHTML(formatValue(hit.value))}${hit.marker.unit ? `<small>${escapeHTML(hit.marker.unit)}</small>` : ''}</div>
      <div class="db-stat-delta">${escapeHTML(hit.trend.arrow || '→')} vs prev</div>
      ${renderDashboardMiniSparkline(hit.marker.values, hit.status, 120, 34)}
      <div class="db-stat-reason">${escapeHTML(rangeText)}</div>
    </button>`;
  }

  const DASHBOARD_SPOTLIGHT_ALERT_SCORE = {
    sudden_high: 90,
    sudden_low: 90,
    past_high: 65,
    past_low: 65,
    approaching_high: 32,
    approaching_low: 32,
  };

  function dashboardSpotlightConcernLabel(concern) {
    const labels = {
      sudden_high: 'sudden high trend',
      sudden_low: 'sudden low trend',
      past_high: 'rising above range',
      past_low: 'falling below range',
      approaching_high: 'approaching upper range',
      approaching_low: 'approaching lower range',
    };
    return labels[concern] || String(concern || '').replace(/_/g, ' ');
  }

  function getDashboardSpotlightRangeSignal(hit) {
    const value = Number(hit?.value);
    const min = hit?.range?.min;
    const max = hit?.range?.max;
    if (!Number.isFinite(value)) return { outside: 0, edge: 0, reason: '' };

    if (min != null && value < min) {
      const width = max != null && max > min ? max - min : Math.max(Math.abs(min), 1);
      const outside = width > 0 ? (min - value) / width : 0;
      return { outside, edge: 0, reason: `${outside.toFixed(1)}x range below low` };
    }
    if (max != null && value > max) {
      const width = min != null && max > min ? max - min : Math.max(Math.abs(max), 1);
      const outside = width > 0 ? (value - max) / width : 0;
      return { outside, edge: 0, reason: `${outside.toFixed(1)}x range above high` };
    }
    if (min != null && max != null && max > min) {
      const position = (value - min) / (max - min);
      const edgeDistance = Math.min(position, 1 - position);
      const edge = Math.max(0, (0.15 - edgeDistance) / 0.15);
      if (edge > 0) {
        return {
          outside: 0,
          edge,
          reason: position >= 0.5 ? 'near upper range edge' : 'near lower range edge',
        };
      }
    }
    return { outside: 0, edge: 0, reason: '' };
  }

  function buildDashboardSpotlightPriorityContext(ctx) {
    const alerts = new Map();
    for (const alert of ctx.trendAlerts || []) {
      if (alert?.id && !alerts.has(alert.id)) alerts.set(alert.id, alert);
    }
    const keyRanks = new Map();
    (ctx.keyMarkers || []).forEach((km, index) => {
      const id = `${km.cat}_${km.key}`;
      if (!keyRanks.has(id)) keyRanks.set(id, index);
    });
    const criticalFlags = new Set((ctx.criticalFlags || []).map(f => f.id));
    return { alerts, keyRanks, criticalFlags };
  }

  function scoreDashboardSpotlightHit(hit, priority) {
    let score = 0;
    const reasons = [];
    const alert = priority.alerts.get(hit.id);
    if (alert) {
      score += DASHBOARD_SPOTLIGHT_ALERT_SCORE[alert.concern] || 24;
      reasons.push(dashboardSpotlightConcernLabel(alert.concern));
    }

    const rangeSignal = getDashboardSpotlightRangeSignal(hit);
    if (hit.status === 'high' || hit.status === 'low') {
      score += 40 + Math.min(80, rangeSignal.outside * 55);
      reasons.push(rangeSignal.reason || (hit.status === 'high' ? 'above range' : 'below range'));
    } else if (rangeSignal.edge > 0) {
      score += rangeSignal.edge * 14;
      reasons.push(rangeSignal.reason);
    }

    if (priority.criticalFlags.has(hit.id)) {
      score += 30;
      reasons.push('critical range distance');
    }

    if (hit.trend?.cls?.includes('trend-bad')) {
      score += 16;
      reasons.push('moving the wrong way');
    } else if (hit.trend?.cls?.includes('trend-good')) {
      score -= 6;
    }

    const keyRank = priority.keyRanks.get(hit.id);
    if (keyRank != null) {
      score += Math.max(2, 16 - keyRank * 2);
      if (!reasons.length) reasons.push('core dashboard marker');
    }

    return {
      ...hit,
      priorityScore: Math.max(0, Math.round(score)),
      priorityReason: reasons[0] || 'latest tracked marker',
      priorityKeyRank: keyRank ?? 999,
    };
  }

  function getDashboardSpotlightCandidates(ctx) {
    const candidates = [];
    const seen = new Set();
    const add = (data, catKey, markerKey) => {
      const id = `${catKey}_${markerKey}`;
      if (seen.has(id)) return;
      const hit = getDashboardMarkerByPath(data, catKey, markerKey);
      if (!hit || hit.marker?.hidden) return;
      seen.add(id);
      candidates.push(hit);
    };

    for (const [catKey, category] of Object.entries(ctx.filteredData?.categories || {})) {
      for (const markerKey of Object.keys(category.markers || {})) add(ctx.filteredData, catKey, markerKey);
    }
    for (const alert of ctx.trendAlerts || []) {
      const idx = alert.id?.indexOf('_') ?? -1;
      if (idx > 0) add(ctx.data, alert.id.slice(0, idx), alert.id.slice(idx + 1));
    }
    for (const km of ctx.keyMarkers || []) add(ctx.data, km.cat, km.key);
    return candidates;
  }

  function getDashboardSpotlight(ctx) {
    const priority = buildDashboardSpotlightPriorityContext(ctx);
    const scored = getDashboardSpotlightCandidates(ctx)
      .map(hit => scoreDashboardSpotlightHit(hit, priority))
      .filter(hit => hit.priorityScore > 0 || priority.keyRanks.has(hit.id))
      .sort((a, b) => (b.priorityScore - a.priorityScore)
        || (a.priorityKeyRank - b.priorityKeyRank)
        || String(a.marker?.name || a.id).localeCompare(String(b.marker?.name || b.id)));
    return scored[0] || null;
  }

  function renderDashboardSpotlightWidget(ctx) {
    const hit = getDashboardSpotlight(ctx);
    if (!hit) return '';
    const range = getEffectiveRange(hit.marker);
    const rangeText = range.min != null || range.max != null
      ? `Range ${range.min != null ? formatValue(range.min) : '—'}–${range.max != null ? formatValue(range.max) : '—'} ${hit.marker.unit || ''}`
      : 'No active range';
    const priorityText = `${getDashboardPriorityLabel(hit)} · ${hit.priorityReason || 'latest tracked marker'}`;
    return `<button type="button" class="db-spotlight" onclick="window.showDetailModal('${hit.id}')" aria-label="${escapeAttr(hit.marker.name + ': ' + formatValue(hit.value) + ' ' + (hit.marker.unit || ''))}">
      <div class="db-spotlight-head">
        <div>
          <div class="db-spotlight-name">${escapeHTML(hit.marker.name)}</div>
          <div class="db-spotlight-meta">${escapeHTML(rangeText)}</div>
          <div class="db-spotlight-priority">${escapeHTML(priorityText)}</div>
        </div>
        <div class="db-spotlight-value">${escapeHTML(formatValue(hit.value))}<small>${escapeHTML(hit.marker.unit || '')}</small></div>
      </div>
      ${renderDashboardMiniSparkline(hit.marker.values, hit.status, 420, 150)}
    </button>`;
  }

  function renderLabsPriorityBanner(ctx) {
    const hit = getDashboardSpotlight(ctx);
    if (!hit) return '';
    const priorityText = `${getDashboardPriorityLabel(hit)} · ${hit.priorityReason || 'latest tracked marker'}`;
    return `<button type="button" class="labs-priority-banner db-status-${escapeAttr(hit.status)}" onclick="window.showDetailModal('${hit.id}')" aria-label="${escapeAttr(hit.marker.name + ': ' + formatValue(hit.value) + ' ' + (hit.marker.unit || ''))}">
      <span class="db-status-dot db-status-${escapeAttr(hit.status)}" aria-hidden="true"></span>
      <span class="labs-priority-copy">
        <span class="labs-priority-kicker">Current Priority</span>
        <strong>${escapeHTML(hit.marker.name)}</strong>
        <small>${escapeHTML(priorityText)}</small>
      </span>
      <span class="labs-priority-spark">${renderDashboardMiniSparkline(hit.marker.values, hit.status, 120, 28)}</span>
      <span class="labs-priority-value">${escapeHTML(formatValue(hit.value))}<small>${escapeHTML(hit.marker.unit || '')}</small></span>
    </button>`;
  }

  function renderDashboardInsightsListWidget(ctx) {
    const markers = getMobileDashboardMarkers(ctx);
    const insights = getMobileDashboardInsights(ctx, markers);
    if (!insights.length) return '';
    return `<div class="db-insights-list">${insights.map(insight => {
      const open = insight.id && safeMarkerId(insight.id) ? ` onclick="window.showDetailModal('${insight.id}')"` : '';
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
      ${syncState.showSync ? `<button type="button" class="dashboard-action-btn db-biometric-sync-btn" onclick="event.stopPropagation();window.syncWearableNow?.(this)">Sync stale data</button>` : ''}`;
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
    const remove = `<button type="button" class="db-biometric-remove" onclick="event.stopPropagation();window.removeDashboardBiometricMetric('${escapeAttr(tile.id)}')" aria-label="Remove ${escapeAttr(tile.label)} from Biometrics Overview" title="Remove metric">&times;</button>`;
    if (tile.empty) {
      return `<div class="db-biometric-tile-wrap">
        <div class="wearable-card wearable-card-empty db-biometric-manual-empty" data-empty-metric="${escapeAttr(tile.id)}" onclick="window.openManualLogForm?.('${escapeAttr(tile.id)}',event)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openManualLogForm?.('${escapeAttr(tile.id)}',event)}" role="button" tabindex="0" aria-label="Log ${escapeAttr(tile.label.toLowerCase())} manually">
          <div class="wearable-card-top"><span class="wearable-metric-name">${escapeHTML(tile.label)}</span></div>
          <div class="wearable-value-row wearable-value-row-empty"><span class="wearable-value wearable-value-dash">-</span></div>
          <div class="wearable-card-bottom"><div class="wearable-empty-cta">+ Log</div></div>
        </div>
        ${remove}
      </div>`;
    }
    return `<div class="db-biometric-tile-wrap">
      <button type="button" class="db-wearable-tile db-biometric-widget" onclick="window.openWearableDetail ? window.openWearableDetail('${escapeAttr(tile.id)}') : window.openSettingsModal?.('wearables')" aria-label="${escapeAttr(tile.label + ': ' + tile.value + ' ' + tile.unit)}">
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
        <button type="button" class="dashboard-action-btn" onclick="window.openDashboardBiometricPicker()">Add metrics</button>
      </div>
    </div>`;
    if (!tiles.length) {
      return `${toolbar}<div class="dashboard-widget-empty">No biometrics selected.</div>`;
    }
    return `${toolbar}<div class="db-wearable-grid db-biometric-overview-grid">${tiles.map(renderDashboardBiometricTile).join('')}</div>`;
  }

  function getDashboardGenomeImpact(stored, entry) {
    const info = entry ? findGenotypeInfo(entry, stored?.genotype) : null;
    const effect = info?.effect || stored?.effect || '';
    const valence = info?.valence || stored?.valence || 'risk';
    const note = info?.note || stored?.note || '';
    if (valence === 'protective') return { label: 'beneficial', tone: 'beneficial', rank: 3, note };
    if (valence === 'neutral') return { label: 'neutral', tone: 'informational', rank: 4, note };
    if (effect === 'significant') return { label: 'significant', tone: 'significant', rank: 0, note };
    if (effect === 'moderate') return { label: 'moderate', tone: 'moderate', rank: 1, note };
    if (effect === 'mild') return { label: 'mild', tone: 'mild', rank: 2, note };
    if (effect === 'none') return { label: 'normal', tone: 'normal', rank: 5, note };
    return { label: entry ? 'unclassified' : 'pending', tone: 'pending', rank: 6, note };
  }

  const DASHBOARD_VISIBLE_SNP_TONES = new Set(['significant', 'moderate', 'mild', 'beneficial']);

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

  function refreshDashboardGenomeWidgetWhenSNPTableReady() {
    if (_dashboardGenomeSnpLoadPromise) return;
    _dashboardGenomeSnpLoadPromise = ensureSNPTable()
      .then(() => {
        _dashboardGenomeSnpLoadPromise = null;
        const body = document.querySelector?.('.dashboard-widget[data-widget-id="genome"] .dashboard-widget-body');
        if (body) body.innerHTML = renderDashboardGenomeWidget();
      })
      .catch(() => { _dashboardGenomeSnpLoadPromise = null; });
  }

  function renderDashboardGenomeWidget() {
    const genetics = state.importedData?.genetics;
    const snps = genetics?.snps || {};
    const apoe = genetics?.apoe;
    const snpTable = typeof window !== 'undefined' ? window._snpTableCache : null;
    const snpCount = Object.keys(snps).length;
    if (snpCount && !snpTable) {
      refreshDashboardGenomeWidgetWhenSNPTableReady();
      return `<div class="db-genome-list">
        <div class="db-genome-summary">${snpCount} imported SNP${snpCount === 1 ? '' : 's'}</div>
        <div class="db-genome-empty db-genome-loading" aria-live="polite">
          <strong>Loading SNP interpretations</strong>
          <span>Matching your variants to the SNP catalog so effect, category, and notes render correctly.</span>
        </div>
      </div>`;
    }
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
        };
      })
      .filter(f => f.gene || f.variant || f.genotype)
      .sort((a, b) => (a.impactRank - b.impactRank) || String(a.gene || a.rsid).localeCompare(String(b.gene || b.rsid)) || String(a.variant || '').localeCompare(String(b.variant || '')));
    if (!findings.length && !apoe && !genetics?.mtdna) {
      return `<button type="button" class="db-genome-empty" onclick="window.triggerDNAFilePicker && window.triggerDNAFilePicker()">
        <strong>Add DNA data</strong>
        <span>Top variants will appear here alongside labs and body signals.</span>
      </button>`;
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
      <strong>No significant, moderate, mild, or beneficial SNP calls</strong>
      <span>Normal, neutral, and unclassified imported calls are collapsed below.</span>
    </div>` : '';
    const legend = visibleFindings.length ? `<div class="db-genome-legend" aria-label="Genome significance legend">
      <span class="db-genome-legend-item db-genome-legend-significant"><span>🔴</span> significant</span>
      <span class="db-genome-legend-item db-genome-legend-moderate"><span>🟠</span> moderate</span>
      <span class="db-genome-legend-item db-genome-legend-mild"><span>🟡</span> mild</span>
      <span class="db-genome-legend-item db-genome-legend-beneficial"><span>🟢</span> beneficial</span>
      <span class="db-genome-legend-item db-genome-legend-informational"><span>⚪</span> neutral</span>
    </div>` : '';
    const meta = [
      snpCount ? `${snpCount} imported SNP${snpCount === 1 ? '' : 's'}` : '',
      genetics?.source || '',
      genetics?.importDate || '',
    ].filter(Boolean).join(' · ');
    return `<div class="db-genome-list">
      ${meta ? `<div class="db-genome-summary">${escapeHTML(meta)}</div>` : ''}
      ${legend}
      ${apoe ? `<div class="db-snp-row db-snp-row-apoe"><span class="db-snp-main"><strong>APOE</strong><small>Haplotype</small></span><span class="db-snp-impact">context</span><span class="db-snp-geno">${escapeHTML(apoe)}</span></div>` : ''}
      ${genetics?.mtdna ? `<div class="db-snp-row"><span class="db-snp-main"><strong>mtDNA</strong><small>${escapeHTML(genetics.mtdna.coupling?.shortLabel || 'Haplogroup')}</small></span><span class="db-snp-impact">lineage</span><span class="db-snp-geno">${escapeHTML(genetics.mtdna.haplogroup)}</span></div>` : ''}
      ${noVisibleRows}
      ${rows}
      ${secondaryRows}
    </div>`;
  }

  function dashboardPearson(aValues, bValues) {
    const xs = [];
    const ys = [];
    const n = Math.min(aValues?.length || 0, bValues?.length || 0);
    for (let i = 0; i < n; i++) {
      const x = Number(aValues[i]);
      const y = Number(bValues[i]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        xs.push(x);
        ys.push(y);
      }
    }
    if (xs.length < 3) return null;
    const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    let num = 0;
    let denX = 0;
    let denY = 0;
    for (let i = 0; i < xs.length; i++) {
      const dx = xs[i] - meanX;
      const dy = ys[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    const den = Math.sqrt(denX * denY);
    return den ? num / den : null;
  }

  function getDashboardCorrelationPairs(ctx) {
    const target = getDashboardMarkerByPath(ctx.data, 'lipids', 'apoB')
      || getDashboardMarkerByPath(ctx.data, 'lipids', 'ldl')
      || getDashboardMarkerByPath(ctx.data, 'diabetes', 'hba1c')
      || getDashboardSpotlight(ctx);
    if (!target?.marker?.values) return null;
    const pairs = [];
    for (const [catKey, category] of Object.entries(ctx.data.categories || {})) {
      for (const [markerKey, marker] of Object.entries(category.markers || {})) {
        const id = `${catKey}_${markerKey}`;
        if (id === target.id || !safeMarkerId(id) || !markerHasData(marker)) continue;
        const r = dashboardPearson(target.marker.values || [], marker.values || []);
        if (r == null || !Number.isFinite(r)) continue;
        const latestIdx = getLatestValueIndex(marker.values || []);
        state.markerRegistry[id] = marker;
        pairs.push({
          id,
          name: marker.name || markerKey,
          category: category.label || catKey,
          value: latestIdx >= 0 ? formatValue(marker.values[latestIdx]) : '—',
          unit: marker.unit || '',
          r,
        });
      }
    }
    pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    return { target, pairs: pairs.slice(0, 12) };
  }

  function renderDashboardCorrelationWidget(ctx) {
    const result = getDashboardCorrelationPairs(ctx);
    if (!result?.pairs?.length) {
      return `<button type="button" class="db-correlation-empty" onclick="window.navigate('correlations')">
        <strong>Pick markers to compare</strong>
        <span>Correlations need at least three shared dated values.</span>
      </button>`;
    }
    return `<div class="db-correlation-widget">
      <div class="db-correlation-head">
        <span>vs <strong>${escapeHTML(result.target.marker.name || 'target marker')}</strong></span>
        <button type="button" onclick="window.navigate('correlations')">Open</button>
      </div>
      <div class="db-correlation-grid">
        ${result.pairs.map(pair => {
          const directionClass = pair.r >= 0 ? 'db-correlation-cell-pos' : 'db-correlation-cell-neg';
          return `<button type="button" class="db-correlation-cell ${directionClass}" onclick="window.showDetailModal('${pair.id}')">
            <span>${escapeHTML(pair.name)}</span>
            <strong>${pair.r.toFixed(2)}</strong>
            <small>${escapeHTML(pair.value)}${pair.unit ? ` ${escapeHTML(pair.unit)}` : ''}</small>
          </button>`;
        }).join('')}
      </div>
    </div>`;
  }

  function getDashboardKeyTrendReason(ctx, id, hit) {
    const alert = (ctx.trendAlerts || []).find(a => a.id === id);
    if (alert) return dashboardSpotlightConcernLabel(alert.concern);
    if (hit.status === 'high') return 'above range';
    if (hit.status === 'low') return 'below range';
    if (hit.trend?.cls?.includes('trend-good')) return 'moving in range';
    if (hit.trend?.cls?.includes('trend-bad')) return 'moving away from range';
    if (hit.trend?.cls && !hit.trend.cls.includes('trend-stable')) return 'recent change';
    return 'watchlist marker';
  }

  function renderDashboardKeyTrendRow(ctx, km) {
    const hit = getDashboardMarkerByPath(ctx.filteredData, km.cat, km.key)
      || getDashboardMarkerByPath(ctx.data, km.cat, km.key);
    if (!hit) return '';
    const reason = getDashboardKeyTrendReason(ctx, hit.id, hit);
    return `<button type="button" class="db-key-trend-row db-status-${escapeAttr(hit.status)}" onclick="window.showDetailModal('${hit.id}')" aria-label="${escapeAttr(hit.marker.name + ': ' + formatValue(hit.value) + ' ' + (hit.marker.unit || ''))}">
      <span class="db-status-dot db-status-${escapeAttr(hit.status)}" aria-hidden="true"></span>
      <span class="db-key-trend-name-wrap">
        <span class="db-key-trend-name">${escapeHTML(hit.marker.name)}</span>
        <span class="db-key-trend-cat">${escapeHTML(hit.category?.label || km.cat)}</span>
      </span>
      <span class="db-key-trend-spark">${renderDashboardMiniSparkline(hit.marker.values, hit.status, 132, 28)}</span>
      <span class="db-key-trend-latest"><strong>${escapeHTML(formatValue(hit.value))}</strong><small>${escapeHTML(hit.marker.unit || '')}</small></span>
      <span class="db-key-trend-signal"><strong>${escapeHTML(hit.trend?.arrow || '\u2192')}</strong><small>${escapeHTML(reason)}</small></span>
    </button>`;
  }

  function renderDashboardKeyTrendsWidget(ctx) {
    const rows = (ctx.keyMarkers || []).map(km => renderDashboardKeyTrendRow(ctx, km)).filter(Boolean);
    let html = `<div class="dashboard-widget-inline-controls">${renderDateRangeFilter()}</div>`;
    if (rows.length > 0) {
      html += `<div class="db-key-trend-list">${rows.join('')}</div>`;
    } else {
      html += `<div class="dashboard-widget-empty">No trend markers available in this date range.</div>`;
    }
    return html;
  }

  function renderDashboardAlertsWidget(ctx) {
    const { trendAlerts, criticalFlags } = ctx;
    const totalAttention = trendAlerts.length + criticalFlags.length;
    if (totalAttention === 0) return '';
    let html = `<div class="alerts-section dashboard-alerts-widget"><div class="alerts-title">Needs Attention (${totalAttention})</div>`;
    for (const alert of trendAlerts) {
      const isSudden = alert.concern.startsWith('sudden_');
      const isPast = alert.concern.startsWith('past_');
      const cls = isSudden ? 'trend-alert-sudden' : isPast ? 'trend-alert-danger' : 'trend-alert-warning';
      const arrow = isSudden ? '\u26A1' : alert.direction === 'rising' ? '\u2197' : '\u2198';
      const label = alert.concern === 'sudden_high' ? 'Sudden jump above range'
        : alert.concern === 'sudden_low' ? 'Sudden drop below range'
        : alert.concern === 'past_high' ? 'Above range & rising'
        : alert.concern === 'past_low' ? 'Below range & falling'
        : alert.concern === 'approaching_high' ? 'Approaching upper limit'
        : 'Approaching lower limit';
      html += `<div class="trend-alert-card ${cls}" role="button" tabindex="0" aria-label="${escapeHTML(alert.name)} \u2014 ${label}" onclick="window.showDetailModal && window.showDetailModal('${alert.id}')">
        <span class="trend-alert-arrow">${arrow}</span>
        <div class="trend-alert-info">
          <div class="trend-alert-name">${escapeHTML(alert.name)} <span class="trend-alert-cat">${escapeHTML(alert.category)}</span></div>
          <div class="trend-alert-label">${label}</div>
        </div>
        <div class="trend-alert-spark">${alert.spark.join(' \u2192 ')}</div>
      </div>`;
    }
    for (const f of criticalFlags) {
      const cls = f.status === "high" ? "alert-high" : "alert-low";
      const label = f.status === "high" ? "\u25B2 CRITICAL HIGH" : "\u25BC CRITICAL LOW";
      html += `<div class="alert-card ${cls}" role="button" tabindex="0" aria-label="${label}: ${escapeHTML(f.name)} ${escapeHTML(String(f.value))} ${escapeHTML(f.unit)}" onclick="window.navigate && window.navigate('${f.categoryKey}')">
        <span class="alert-indicator">${label}</span>
        <span class="alert-name">${escapeHTML(f.name)}</span>
        <span class="alert-value">${escapeHTML(String(f.value))} ${escapeHTML(f.unit)}</span>
        <span class="alert-ref">${formatValue(f.effectiveMin)} \u2013 ${formatValue(f.effectiveMax)}</span></div>`;
    }
    html += `</div>`;
    return html;
  }

  function renderDashboardNotesWidget() {
    const hasNotes = state.importedData.notes && state.importedData.notes.length > 0;
    let html = `<div class="notes-section dashboard-notes-widget">`;
    html += `<button class="add-note-btn" onclick="openNoteEditor()">+ Add Note</button>`;
    if (hasNotes) {
      const notes = state.importedData.notes
        .map((note, i) => ({ note, idx: i }))
        .sort((a, b) => a.note.date.localeCompare(b.note.date));
      for (const { note, idx } of notes) {
        const d = new Date(note.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const preview = escapeHTML(note.text.length > 200 ? note.text.slice(0, 200) + '...' : note.text);
        html += `<div class="note-card" role="button" tabindex="0" aria-label="Note from ${d}" onclick="openNoteEditor(null, ${idx})">
          <div class="note-card-date">${d}</div>
          <div class="note-card-text">${preview}</div>
          <div class="note-card-actions">
            <button class="note-card-action" onclick="event.stopPropagation();openNoteEditor(null, ${idx})">Edit</button>
            <button class="note-card-action note-card-action-delete" onclick="event.stopPropagation();deleteNote(${idx})">Delete</button>
          </div>
        </div>`;
      }
    } else {
      html += `<div class="dashboard-widget-empty">No notes yet. Add notes to track context around your lab results.</div>`;
    }
    html += `</div>`;
    return html;
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
