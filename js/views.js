// views.js — Navigate, dashboard, category views, and shared view composition

import { state } from './state.js';
import { escapeHTML, escapeAttr, getStatus, formatDate, safeMarkerId } from './utils.js';
import { getActiveData, filterDatesByRange, destroyAllCharts, getEffectiveRangeForDate, getLatestValueIndex, countFlagged, renderDateRangeFilter, renderChartLayersDropdown } from './data.js';
import { profileStorageKey } from './profile.js';
import { createLineChart } from './charts.js';
import { canonicalMetric } from './wearable-adapters.js';
import { loadContextHealthDots } from './context-cards.js';
import { hasAIProvider, isAIPaused } from './api.js';
import { loadPdfImport } from './import-loader.js';
import { createNavigate, getInitialView as getRouterInitialView } from './views-router.js';
import { createLensPageHandlers } from './lens-pages.js';
import { configureLensPageShell, inlineHandlerCall, renderLensHeader, renderLensPageWidgets, renderLensWidget, moveLensPageWidget } from './lens-page-shell.js';
import { createDashboardWidgetRegistry } from './dashboard-widgets.js';
import { createDashboardWidgetControls } from './dashboard-widget-controls.js';
import { createDashboardWidgetRenderers } from './dashboard-widget-renderers.js';
import { renderFocusCard, buildFocusContext, loadFocusCard, refreshFocusCard } from './focus-card.js';
import { configureOnboardingView, renderOnboardingBanner, renderAIConnectionReminder, dismissAIReminder, openChatProviderQuiz, setOnboardingFocus, completeOnboardingSex, completeOnboardingProfile, dismissOnboarding } from './onboarding-view.js';
import { loadChartCardRecs } from './chart-card-recs.js';
import { renderCategoryGlyph } from './category-glyphs.js';
import { renderChartCard, renderTableColgroup, renderScrollableTableShell, renderTableView, renderHeatmapView, renderFattyAcidsView, renderFattyAcidsCharts } from './category-view-renderers.js';
import { configureCategoryCustomization, renameCategory, renameMarker, revertMarkerName, showEmojiPicker, changeCategoryIcon } from './category-customization.js';
import { loadCommitHash } from './commit-hash.js';
import { renderLightConditionsWidgetBody, renderConditionsNow, _refreshConditionsNow, _inspectConditionsNow, _setManualUvi, _clearManualUvi, _formatElapsedShort } from './light-conditions-now.js';
import { renderUnifiedSessionsList, _openAllSessionsModal } from './light-sessions-view.js';
import {
  mergeTotals,
  _channelSparkline,
  _channelDayCount,
  renderChannelPills,
  _toggleChannelDetail,
  _openChannelOnLightPage,
  renderSuggestion,
} from './light-channel-view.js';
import {
  configureMobileDashboardView,
  isMobileDashboardViewport,
  syncMobileBottomNav,
  refreshMobileDashboardActiveTab,
  getMobileDashboardProfile,
  getMobileGreetingName,
  getMobileDashboardCounts,
  getMobileDashboardMarkers,
  getMobileDashboardInsights,
  getMobileWearableTiles,
  formatMobileWearableValue,
  formatMobileWearableDelta,
  getMobileWearablePriority,
  mobileDashboardSetTab,
  openMobileDashboardSearch,
  mobileDashboardJump,
  renderMobileDashboard,
} from './mobile-dashboard.js';
import {
  configureCompareCorrelationViews,
  showCompare,
  setCompareDate1,
  setCompareDate2,
  updateCompare,
  swapCompareDates,
  renderCompareTable,
  showCorrelations,
  populateCorrelationOptions,
  showCorrelationDropdown,
  filterCorrelationOptions,
  toggleCorrelationMarker,
  applyCorrelationPreset,
  renderCorrelationChips,
  renderCorrelationChart,
} from './compare-correlations.js';
import {
  configureMarkerDetailModal,
  fetchCustomMarkerDescription,
  showDetailModal,
  editRefRange,
  saveRefRange,
  revertRefRange,
  openManualEntryForm,
  saveManualEntry,
  saveAndAddAnotherManualEntry,
  openCreateMarkerModal,
  pickNewCatIcon,
  saveCustomMarker,
  deleteMarkerValue,
  deleteCustomMarker,
  editMarkerValue,
  revertMarkerValue,
  editValueNote,
  deleteValueNote,
  toggleMarkerNoteEditor,
  saveMarkerNote,
  deleteMarkerNote,
  closeModal,
  rememberModalTrigger,
} from './marker-detail-modal.js';
export {
  refreshMobileDashboardActiveTab,
  mobileDashboardSetTab,
  openMobileDashboardSearch,
  mobileDashboardJump,
  renderFocusCard,
  buildFocusContext,
  loadFocusCard,
  refreshFocusCard,
  renderOnboardingBanner,
  renderAIConnectionReminder,
  dismissAIReminder,
  openChatProviderQuiz,
  setOnboardingFocus,
  completeOnboardingSex,
  completeOnboardingProfile,
  dismissOnboarding,
  showCompare,
  setCompareDate1,
  setCompareDate2,
  updateCompare,
  swapCompareDates,
  renderCompareTable,
  showCorrelations,
  populateCorrelationOptions,
  showCorrelationDropdown,
  filterCorrelationOptions,
  toggleCorrelationMarker,
  applyCorrelationPreset,
  renderCorrelationChips,
  renderCorrelationChart,
  renderChartCard,
  renderTableView,
  renderHeatmapView,
  renderFattyAcidsView,
  renderFattyAcidsCharts,
  moveLensPageWidget,
  fetchCustomMarkerDescription,
  showDetailModal,
  editRefRange,
  saveRefRange,
  revertRefRange,
  openManualEntryForm,
  saveManualEntry,
  saveAndAddAnotherManualEntry,
  openCreateMarkerModal,
  pickNewCatIcon,
  saveCustomMarker,
  deleteMarkerValue,
  deleteCustomMarker,
  editMarkerValue,
  revertMarkerValue,
  editValueNote,
  deleteValueNote,
  toggleMarkerNoteEditor,
  saveMarkerNote,
  deleteMarkerNote,
  closeModal,
  rememberModalTrigger,
};

function setupDropZone() {
  const dropZone = document.getElementById("drop-zone");
  if (!dropZone || dropZone.dataset.lazyDropZoneBound === 'true') return;
  dropZone.dataset.lazyDropZoneBound = 'true';
  dropZone.addEventListener("click", () => {
    if (window.isImportRunning && window.isImportRunning()) return;
    document.getElementById('pdf-input')?.click();
  });
  dropZone.addEventListener("dragover", e => {
    e.preventDefault();
    if (!(window.isImportRunning && window.isImportRunning())) dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", e => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
  });
  dropZone.addEventListener("drop", async e => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    if (window.isImportRunning && window.isImportRunning()) {
      window.showNotification?.("Import already in progress", "info");
      return;
    }
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;
    let importMod;
    try {
      importMod = await loadPdfImport();
    } catch (err) {
      window.showNotification?.('Could not load import module - check your connection and try again.', 'error');
      return;
    }
    const { jsonFiles, pdfFiles, imageFiles, dnaFiles, textFiles, unsupportedCount } = await importMod.classifyImportFiles(files);
    if (unsupportedCount > 0 && jsonFiles.length === 0 && pdfFiles.length === 0 && imageFiles.length === 0 && dnaFiles.length === 0 && textFiles.length === 0) {
      window.showNotification?.("Unsupported file type. Use PDF, text, image, JSON, or DNA raw data (.txt/.csv).", "error");
      return;
    }
    for (const f of jsonFiles) window.importDataJSON(f);
    if (dnaFiles.length > 0) {
      for (const f of dnaFiles) {
        const header = await f.slice(0, 1500).text();
        const fmt = window.detectDNAFile ? window.detectDNAFile(header) : null;
        if ((fmt === 'mtdna' || fmt === '23andme-mito') && window.handleMtDNAFile) await window.handleMtDNAFile(f);
        else if (fmt === '23andme-y') { window.showNotification?.('Y-chromosome DNA files are not supported', 'info'); }
        else await window.handleDNAFile(f);
      }
    }
    else if (textFiles.length > 0) { for (const f of textFiles) await importMod.handleTextFile(f); }
    else if (imageFiles.length > 0) { for (const f of imageFiles) await importMod.handleImageFile(f); }
    else {
      if (pdfFiles.length === 1) await importMod.handlePDFFile(pdfFiles[0]);
      else if (pdfFiles.length > 1) await importMod.handleBatchPDFs(pdfFiles);
    }
  });
}

function markerHasData(m) { return m.values?.some(v => v !== null) ?? false; }
function sortCategoryChartEntries(entries, categoryKey) {
  const preserved = state._preserveCategoryCardOrder;
  if (preserved?.categoryKey === categoryKey && Array.isArray(preserved.markerKeys)) {
    const order = new Map(preserved.markerKeys.map((key, index) => [key, index]));
    entries.sort(([ka], [kb]) => (order.get(ka) ?? Number.MAX_SAFE_INTEGER) - (order.get(kb) ?? Number.MAX_SAFE_INTEGER));
    delete state._preserveCategoryCardOrder;
    return;
  }
  delete state._preserveCategoryCardOrder;

  // Default category landing sort: markers with catalog slots first, then
  // by status (out-of-range before normal).
  const catalog = window._cachedCatalog;
  const hasSlot = (k) => catalog?.slots?.[categoryKey + '.' + k] ? 0 : 1;
  const statusOrder = { high: 0, low: 0, normal: 1, missing: 2 };
  entries.sort(([ka, a], [kb, b]) => {
    const slotDiff = hasSlot(ka) - hasSlot(kb);
    if (slotDiff !== 0) return slotDiff;
    const ai = getLatestValueIndex(a.values), bi = getLatestValueIndex(b.values);
    const ar = ai !== -1 ? getEffectiveRangeForDate(a, ai) : { min: null, max: null };
    const br = bi !== -1 ? getEffectiveRangeForDate(b, bi) : { min: null, max: null };
    const as = ai !== -1 ? getStatus(a.values[ai], ar.min, ar.max) : 'missing';
    const bs = bi !== -1 ? getStatus(b.values[bi], br.min, br.max) : 'missing';
    return (statusOrder[as] ?? 2) - (statusOrder[bs] ?? 2);
  });
}
function setDetailModalShell(...classes) {
  const modal = document.getElementById('detail-modal');
  if (!modal) return null;
  modal.className = ['modal', ...classes.filter(Boolean)].join(' ');
  return modal;
}

// ═══════════════════════════════════════════════
// NAVIGATE (router)
// ═══════════════════════════════════════════════

export function getInitialView() {
  return getRouterInitialView();
}

export function showLabs(preData) { return lensPageHandlers.showLabs(preData); }
export function showGenomeLens() { return lensPageHandlers.showGenomeLens(); }
export function showBodyLens() { return lensPageHandlers.showBodyLens(); }
export function showInsightLens(preData) { return lensPageHandlers.showInsightLens(preData); }
export function showRecommendations(preData) { return lensPageHandlers.showRecommendations(preData); }

const _navigate = createNavigate({
  routeHandlers: {
    dashboard: showDashboard,
    labs: showLabs,
    genome: showGenomeLens,
    body: showBodyLens,
    insight: showInsightLens,
    recommendations: showRecommendations,
    correlations: showCorrelations,
    compare: showCompare,
    light: showLight,
    category: showCategory,
  },
  syncMobileBottomNav,
  destroyAllCharts,
});

export function navigate(category, data) {
  return _navigate(category, data);
}

configureOnboardingView({ navigate });
configureCategoryCustomization({ navigate });

// ═══════════════════════════════════════════════
// LIGHT TODAY STRIP — legacy compact surface used by welcome/embedded views
// ═══════════════════════════════════════════════

function renderDashboardLightChannelPills() {
  const ch = window.CHANNEL_DISPLAY || {};
  // Dashboard pills represent a 7-day rolling total; classify with the
  // weekly tier so optional Light widgets agree with the Light page pills.
  const tier = window.weeklyChannelTier || (() => 0);
  const order = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  const totals7d = (window.rollingChannelTotals && window.rollingChannelTotals(7)) || {};
  const devTotals7d = (window.rollingDeviceTotals && window.rollingDeviceTotals(7)) || {};
  const combinedTotals7d = mergeTotals(totals7d, devTotals7d);
  return `<div class="light-pills-row">
    ${order.map(k => {
      const meta = ch[k] || {};
      const t = tier(combinedTotals7d[k] || 0, k);
      const dc = _channelDayCount(k);
      const tip = `${meta.what || ''} — ${dc.n} of 7 days hit target this week. Tap for details.`;
      return `<button type="button" class="light-pill light-pill-tier-${t} light-pill-dashboard" data-channel="${escapeAttr(k)}" title="${escapeHTML(tip)}" onclick="window._openChannelOnLightPage && window._openChannelOnLightPage('${escapeAttr(k)}')" aria-label="${escapeHTML((meta.label || k) + ', ' + dc.n + ' of 7 days hit target, tap to open detail')}">
        <span class="light-pill-icon" aria-hidden="true">${meta.icon || '·'}</span>
        <span class="light-pill-label">${escapeHTML(meta.label || k)}</span>
        ${_channelSparkline(k)}
        <span class="light-pill-daycount">${escapeHTML(dc.txt)}</span>
      </button>`;
    }).join('')}
  </div>`;
}

function renderLightSessionLogActions() {
  const sessions = (window.getSessions && window.getSessions()) || [];
  const devices = (window.getDevices && window.getDevices()) || [];
  const deviceSessionsAll = (window.getDeviceSessions && window.getDeviceSessions()) || [];
  const hasDevices = devices.length > 0;
  const totalSessions = sessions.length + deviceSessionsAll.length;
  const sunCount = sessions.length;
  const devCount = deviceSessionsAll.length;
  const tallyDetail = (sunCount > 0 || devCount > 0)
    ? `${sunCount} sun + ${devCount} device`
    : '';
  const sunActive = !!(window.getActiveSession && window.getActiveSession());
  let ctaButtons = '';
  if (sunActive) {
    // Stop controls live in the pinned active-session card; this widget keeps
    // the remaining logging actions available without duplicating Stop.
    if (hasDevices) {
      ctaButtons = `<button class="dashboard-action-btn dashboard-action-btn-primary light-log-action" onclick="window.quickLogDeviceSession && window.quickLogDeviceSession()">Start device session</button>`;
    } else {
      ctaButtons = `<button class="dashboard-action-btn light-log-action" onclick="window.openAddDeviceDialog && window.openAddDeviceDialog()">Add light device</button>`;
    }
  } else if (hasDevices) {
    ctaButtons = `<button class="dashboard-action-btn dashboard-action-btn-primary light-log-action" onclick="window.quickLogSunSession()">Start sun session</button>
      <button class="dashboard-action-btn dashboard-action-btn-primary light-log-action" onclick="window.quickLogDeviceSession && window.quickLogDeviceSession()">Start device session</button>`;
  } else {
    ctaButtons = `<button class="dashboard-action-btn dashboard-action-btn-primary light-log-action" onclick="window.quickLogSunSession()">Start sun session</button>
      <button class="dashboard-action-btn light-log-action" onclick="window.openAddDeviceDialog && window.openAddDeviceDialog()">Add light device</button>`;
  }
  return `<div class="light-session-log-actions">
    <div class="light-quicklog-row">
      ${ctaButtons}
      <button class="dashboard-action-btn light-log-action" onclick="window.openDetailedSessionDialog && window.openDetailedSessionDialog()">Log past session</button>
      ${totalSessions === 0 ? `<span class="light-summary-tally"${tallyDetail ? ` title="${tallyDetail}"` : ''}>No sessions yet</span>` : ''}
    </div>
  </div>`;
}

function renderLightWidgetPrompt(status, ctaLabel, ctaJs, hint, extraClass = '') {
  return `<div class="light-widget-prompt ${extraClass}">
    <div class="light-widget-prompt-copy">
      <strong>${escapeHTML(status)}</strong>
      <p>${escapeHTML(hint)}</p>
    </div>
    <button class="dashboard-action-btn dashboard-action-btn-primary light-widget-prompt-cta" onclick="${escapeAttr(ctaJs)}">${escapeHTML(ctaLabel)}</button>
  </div>`;
}

function renderLightMethodsWidgetBody() {
  let html = `<details class="light-explainer">
    <summary>How we estimate vitamin D, burn risk &amp; channels</summary>
    <div class="light-explainer-body">
      <p><strong>Burn dose (% MED).</strong> 1 MED = "minimal erythemal dose," the smallest UV dose that turns your skin slightly pink. Set per Fitzpatrick skin type (Type I = 200 J/m² CIE-erythemal, Type VI = 1000 J/m²). 100% means a sunburn is starting; 70% means stop or cover up soon. Yesterday's dose carries forward — when yesterday + today exceeds 100% the banner flags a back-to-back risk, even if today alone is under threshold.</p>
      <p><strong>Vitamin D in IU.</strong> Bogh &amp; Wulf 2010 + Holick 2007. Roughly 60 IU per unit of vit-D-action-spectrum-weighted UVB at sea-level zenith (calibrated against dminder + NIWA at UVI 5-7), scaled by your Fitzpatrick type (melanin lowers it). Saturates at the tens-of-thousands-of-IU level per session — at high doses the skin photoisomerizes excess previtamin D back to inert tachysterol/lumisterol. <strong>Below UVI 2 there's no meaningful synthesis</strong> (Webb 2018, ramps in linearly between UVI 2 and 3) — winter mornings, low sun, behind glass all yield zero.</p>
      <p><strong>The ±50% range.</strong> Estimate is "central x 0.6 to x 1.5" because the spectral reconstruction model, skin response, and exposed area all vary. Treat the band as honest — the central number alone is false precision.</p>
      <p><strong>Channels.</strong> Sun does six things you can see on this page, each with its own action spectrum: vitamin D synthesis, circadian/melanopic light, cardiovascular nitric-oxide release, mood/alpha-MSH on skin, violet-eye dopamine, and near-infrared cellular repair. Sun and therapy panels both feed these channels by wavelength.</p>
      <p><strong>Atmosphere data.</strong> CAMS by default — real ozone column and aerosols from the hosted getbased-uvdata relay, merged with Open-Meteo clouds, temperature, air quality, and hourly UV baseline. All math runs on-device — your location is rounded before network calls unless you change the privacy slider.</p>
      <p><strong>Want the math?</strong> See <a href="https://github.com/elkimek/get-based/blob/main/dev-docs/sun-spectrum-model.md" target="_blank" rel="noopener">the contributor doc</a> for the Bird-Riordan reconstruction, action-spectrum table, and per-channel citations.</p>
    </div>
  </details>`;
  if (typeof window !== 'undefined' && typeof window.renderSunDataSourceSettings === 'function') {
    html += `<details class="light-data-source-details">
      <summary>Sun data source</summary>
      <div class="light-data-source-body">${window.renderSunDataSourceSettings()}</div>
    </details>`;
  }
  return `<div class="light-methods-stack">${html}</div>`;
}

// Render only when the user has logged sessions OR we're in a solar window
// (sunrise/midday/sunset ±2h) and the user has labs — encourages discovery.
export function renderLightTodayStrip() {
  const sessions = (window.getSessions && window.getSessions()) || [];
  const hasData = sessions.length > 0;
  const inSolarWindow = isSolarWindow();
  // Always render — even a fresh user outside a solar window needs to see
  // that the Light lens exists. The CTA copy adapts to the situation.

  const active = (window.getActiveSession && window.getActiveSession()) || null;
  const medToday = (window.cumulativeMEDToday && window.cumulativeMEDToday()) || 0;

  // CTA — adaptive to whether the user has therapy devices set up. A
  // winter user with a Joovv but no recent sun should see the device
  // option as a peer, not buried under sun-only copy. Solar windows
  // still privilege outdoor sun (it's a transient cue you'd miss).
  // CTAs are wrapped in .light-today-cta-group so margin-left:auto
  // applies once to the GROUP — without the wrapper each individual
  // CTA's margin-left:auto pushed every button to the right edge,
  // spreading them apart instead of clustering them.
  const devicesArr = (window.getDevices && window.getDevices()) || [];
  const hasDevices = devicesArr.length > 0;
  // Device button copy adapts to how many devices the user owns. With
  // 1 device, name it inline so the click goes straight to that
  // device's session log. With 2+, show a generic "Device ▼" — taps
  // open the picker (quickLogDeviceSession already handles this case).
  let deviceBtn = '';
  if (hasDevices) {
    if (devicesArr.length === 1) {
      const d = devicesArr[0];
      const label = `🔴 ${d.brand || ''} ${d.model || ''}`.trim();
      deviceBtn = `<button class="light-today-cta light-today-cta-secondary" onclick="window.quickLogDeviceSession && window.quickLogDeviceSession()" title="Log a session on your ${escapeHTML(d.brand || '')} ${escapeHTML(d.model || '')}">${escapeHTML(label)}</button>`;
    } else {
      deviceBtn = `<button class="light-today-cta light-today-cta-secondary" onclick="window.quickLogDeviceSession && window.quickLogDeviceSession()" title="Pick from your ${devicesArr.length} devices">🔴 Device <span aria-hidden="true">▼</span></button>`;
    }
  }
  // Onboarding CTA — graduated by what's already filled in:
  //   1. No Light setup yet (no skin type / location / Ott)  → "Set up Light & Sun"
  //      The Light setup card is the FIRST thing on the Light page; without it
  //      no other tracking math works correctly.
  //   2. Setup done, no rooms                                → "Map a room"
  //      Most users spend 8-14 h/day indoors — once setup is in, surface the
  //      indoor environment as the natural next layer.
  //   3. Both done                                            → no CTA
  // Earlier draft only had the room CTA, which oversold the link target —
  // clicking "Map a room" actually drops users at a page where Light setup
  // is the dominant card. Naming it for what it actually leads to is more
  // honest + improves the empty-state conversion path.
  const sd = state.importedData?.sunDefaults;
  const hasSetup = !!(sd && sd.completedAt && sd.fitzpatrick);
  const lightEnv = state.importedData?.lightEnvironment;
  const hasRooms = lightEnv && Array.isArray(lightEnv.rooms) && lightEnv.rooms.length > 0;
  let setupBtn = '';
  if (!hasSetup) {
    setupBtn = `<button class="light-today-cta light-today-cta-secondary" onclick="window.navigate && window.navigate('light')" title="Skin type, location, indoor light, photosensitive meds — 30 seconds. Drives every Light & Sun calculation.">🌞 Set up Light & Sun</button>`;
  } else if (!hasRooms) {
    setupBtn = `<button class="light-today-cta light-today-cta-secondary" onclick="window.navigate && window.navigate('light')" title="Map your rooms — most of your day is under indoor lights">🛋 Map a room</button>`;
  }
  // Keep the legacy roomBtn name so the template strings below don't change.
  const roomBtn = setupBtn;

  let cta;
  if (active) {
    // mm:ss live counter; the active-session ticker updates this same
    // element every second via the [data-live-elapsed-for] selector.
    const elapsedMs = Date.now() - active.startedAt;
    const elapsed = _formatElapsedShort(elapsedMs);
    cta = `<div class="light-today-cta-group"><button class="light-today-cta light-today-cta-active" onclick="window.quickLogSunSession()" aria-label="Stop active sun session"><span aria-hidden="true">⏹ Stop session — </span><span data-live-elapsed-for="${active.id}" aria-live="off">${elapsed}</span></button></div>`;
  } else if (inSolarWindow) {
    const wlabel = solarWindowLabel();
    cta = `<div class="light-today-cta-group"><button class="light-today-cta" onclick="window.quickLogSunSession()"><span aria-hidden="true">☀</span> ${wlabel} — log a session</button>${deviceBtn}${roomBtn}</div>`;
  } else if (hasDevices) {
    cta = `<div class="light-today-cta-group"><button class="light-today-cta" onclick="window.quickLogSunSession()"><span aria-hidden="true">☀</span> Log sun</button>${deviceBtn}${roomBtn}</div>`;
  } else {
    cta = `<div class="light-today-cta-group"><button class="light-today-cta" onclick="window.quickLogSunSession()">☀ Log a sun session</button>${roomBtn}</div>`;
  }

  // Burn-risk gauge — qualitative, plain English, no acronyms
  const medPct = Math.round(medToday * 100);
  let medCls = 'ok', medMsg = 'safe — well under your burn threshold';
  if (medToday >= 1) { medCls = 'over'; medMsg = 'burn threshold reached — sunburn risk, no more sun today'; }
  else if (medToday >= 0.7) { medCls = 'warn'; medMsg = 'approaching burn threshold'; }
  else if (medToday >= 0.3) { medCls = 'ok'; medMsg = 'moderate sun exposure today'; }

  // Surface the burn-risk gauge only when it actually carries information.
  // Below 30% MED it's noise on a normal day — the user has the full
  // banner one click away on the Light & Sun page if they need it.
  const showBurnRisk = medToday >= 0.3;
  // Combined session count for the past 7 days — sun + device. Replaces
  // the previous sun-only "X sessions this week" copy which lied about
  // its window (it was actually counting all-time sun sessions).
  const weekCutoff = Date.now() - 7 * 86400 * 1000;
  const sunWeek = sessions.filter(s => (s.startedAt || 0) >= weekCutoff).length;
  const devSessionsAll = (window.getDeviceSessions && window.getDeviceSessions()) || [];
  const devWeek = devSessionsAll.filter(s => (s.startedAt || 0) >= weekCutoff).length;
  const weekTotal = sunWeek + devWeek;
  // Rolling 7-day vitamin D total in IU — sums per-session yields with
  // each session's 20k saturation cap, so a week of three good sessions
  // doesn't get clipped to one session's maximum. Hidden when the total
  // is essentially zero (cloudy week / no UVB exposure / device-only).
  const weeklyIU = (window.rollingVitaminDIU && window.rollingVitaminDIU(7)) || 0;
  let weeklyIUStr = '';
  if (weeklyIU >= 100) {
    // Surface the same uncertainty band as session detail. The weekly
    // total inherits each session's per-session uncertainty; using the
    // central estimate ± 25% — aggregating across many sessions averages
    // out per-session model error somewhat, so the band tightens vs the
    // single-session model band (which is ±20-45% per zenith).
    const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
      : n >= 1000 ? Math.round(n / 100) * 100
      : Math.round(n / 10) * 10;
    weeklyIUStr = `<span class="light-today-vitd" title="Approximate vitamin D₃ synthesized from sun over the last 7 days, summed per session and Fitzpatrick-scaled. Model accuracy ±25% across a week (Bird-Riordan + Bass-Paur, aggregated). Your blood 25(OH)D response to the same UV dose can vary 2-3× across individuals — calibrate against your own labs over time. Central estimate sits between Bogh 2010 lab values and Holick 2008 natural-sun extrapolations.">☀ ~${fmt(weeklyIU)} IU vitamin D this week</span>`;
  }

  // Vit-D budget cross-check — shows today's combined sun-derived +
  // supplement IU. Warn chip when supplements alone exceed the IOM 4000
  // IU/d Tolerable Upper Intake Level. Sun-derived doesn't count toward
  // UL (skin photoisomerization plateaus naturally) but is shown for
  // context — clinicians treating high serum 25(OH)D look at total daily
  // input.
  let vitDBudgetChip = '';
  if (typeof window.vitaminDBudgetStatus === 'function') {
    const b = window.vitaminDBudgetStatus();
    const fmtIU = (n) => n >= 1000 ? `${(n/1000).toFixed(1).replace(/\.0$/, '')}k` : `${Math.round(n)}`;
    if (b.exceedsSupplementUL) {
      vitDBudgetChip = `<span class="light-today-vitd-warn" title="IOM 2010 Tolerable Upper Intake Level for vitamin D from supplements alone is 4000 IU/d. Today: ${fmtIU(b.supplementIU)} IU supplement + ~${fmtIU(b.sunIU)} IU sun = ~${fmtIU(b.total)} IU total. Supplement above UL — flag this with your clinician.">⚠ Vit D today: ${fmtIU(b.supplementIU)} IU supplement above 4000 IU UL (+${fmtIU(b.sunIU)} sun)</span>`;
    } else if (b.supplementIU > 0 && b.total > 8000) {
      vitDBudgetChip = `<span class="light-today-vitd-info" title="High combined dose today — sun usually self-regulates via photoisomerization plateau but supplements stack additively. Worth tracking serum 25(OH)D over time.">Vit D today: ~${fmtIU(b.total)} IU (${fmtIU(b.supplementIU)} supplement + ~${fmtIU(b.sunIU)} sun)</span>`;
    }
  }

  // High-altitude UV chip — UV irradiance climbs ~10% per 1000m above sea
  // level (WHO/INTERSUN). At >1500m it's a meaningful safety modifier the
  // user should see before going outside.
  const altCoords = (window.getSunCoords && window.getSunCoords()) || null;
  const altM = altCoords?.altitudeM || 0;
  const altChip = altM > 1500
    ? `<span class="light-today-altitude" title="UV irradiance climbs ~10% per 1000m above sea level. At ${Math.round(altM)}m, expect ~${Math.round((altM / 1000) * 10)}% more UV than sea-level estimates.">⛰ +${Math.round((altM / 1000) * 10)}% UV (altitude ${Math.round(altM)}m)</span>`
    : '';
  return `<section class="light-today-strip">
    <div class="light-today-head">
      <span class="light-today-icon">☀</span>
      <span class="light-today-title">Light Today</span>
      <span class="light-today-sub" title="${sunWeek} sun + ${devWeek} device · last 7 days">${weekTotal} light session${weekTotal !== 1 ? 's' : ''} this week</span>
      ${altChip}
      <a href="#" class="light-today-link" onclick="event.preventDefault();window.navigate('light')">Open Light &amp; Sun →</a>
    </div>
    ${typeof window !== 'undefined' && window.renderLightTodayDashboardChip ? window.renderLightTodayDashboardChip() : ''}
    ${renderConditionsNow({ variant: 'compact' })}
    ${renderDashboardLightChannelPills()}
    ${weeklyIUStr || vitDBudgetChip ? `<div class="light-today-vitd-row">${weeklyIUStr}${vitDBudgetChip ? ' ' + vitDBudgetChip : ''}</div>` : ''}
    <div class="light-today-foot">
      ${showBurnRisk ? `<span class="light-today-med light-today-med-${medCls}" title="How close today's sun exposure is to your burn threshold (Fitzpatrick-based). 100% = burn threshold reached.">
        ☀ Sun exposure today: <strong>${medMsg}</strong>${medPct > 0 ? ` (${medPct}%)` : ''}
      </span>` : ''}
      ${cta}
    </div>
  </section>`;
}

// In-place re-render of the Light & Sun page channel pill row only.
// Called by the active-session ticker every 5s so live partial doses
// propagate to the pills without doing a full navigate(). Preserves any
// open drill-down panel by re-rendering it after the pills swap.
// No-op when not on the Light page.
export function renderLightChannelsLive() {
  const section = document.querySelector('.light-channels-section');
  if (!section) return;
  const totals7d = (window.rollingChannelTotals && window.rollingChannelTotals(7)) || {};
  const totals30d = (window.rollingChannelTotals && window.rollingChannelTotals(30)) || {};
  const devTotals7d = (window.rollingDeviceTotals && window.rollingDeviceTotals(7)) || {};
  const devTotals30d = (window.rollingDeviceTotals && window.rollingDeviceTotals(30)) || {};
  const combined7d = mergeTotals(totals7d, devTotals7d);
  const combined30d = mergeTotals(totals30d, devTotals30d);
  const row = section.querySelector('.light-pills-row');
  const slot = section.querySelector('[data-channel-detail-slot]');
  const openChannel = slot?.dataset.openChannel || '';
  if (row) {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderChannelPills(combined7d, combined30d);
    const newRow = wrap.querySelector('.light-pills-row');
    if (newRow) row.replaceWith(newRow);
    // Replace the slot with the freshly-built one too, then re-render the
    // open panel if there was one. This keeps tier/dot updates live in
    // both the pill row AND the visible drill-down stats.
    const newSlot = wrap.querySelector('[data-channel-detail-slot]');
    if (slot && newSlot) slot.replaceWith(newSlot);
    if (openChannel) _toggleChannelDetail(openChannel);
  }
}

function isSolarWindow() {
  const h = new Date().getHours();
  return (h >= 5 && h < 9) || (h >= 11 && h < 14) || (h >= 16 && h < 20);
}

function solarWindowLabel() {
  const h = new Date().getHours();
  if (h >= 5 && h < 9) return 'Morning sun window';
  if (h >= 11 && h < 14) return 'Midday window';
  if (h >= 16 && h < 20) return 'Evening sun window';
  return 'Sun window';
}

// ═══════════════════════════════════════════════
// LIGHT & SUN — dedicated view
// ═══════════════════════════════════════════════

export function showLight(_data) {
  // Resume the live-session ticker if a session was started before this
  // page loaded — without this, hard-reload while outside leaves the card
  // static until you explicitly tap something else.
  if (window._resumeActiveTickerIfNeeded) try { window._resumeActiveTickerIfNeeded(); } catch (e) {}
  if (window.ensureActiveDeviceTicker) try { window.ensureActiveDeviceTicker(); } catch (e) {}
  const main = document.getElementById("main-content");
  const sessions = (window.getSessions && window.getSessions()) || [];
  const totals7d = (window.rollingChannelTotals && window.rollingChannelTotals(7)) || {};
  const totals30d = (window.rollingChannelTotals && window.rollingChannelTotals(30)) || {};
  const medToday = (window.cumulativeMEDToday && window.cumulativeMEDToday()) || 0;
  const deviceSessionsAll = (window.getDeviceSessions && window.getDeviceSessions()) || [];
  const totalSessions = sessions.length + deviceSessionsAll.length;
  const sunCount = sessions.length;
  const widgets = [];

  let html = `<div class="light-page">
    ${renderLensHeader('Light & Sun', 'Track your light exposure. See how it shapes your sleep, hormones, and lab results.')}`;

  // AI hero verdict — synthesizes today's full picture (sun + devices +
  // environment + trends) into one read. Sits above active-session and
  // conditions so the user gets the "how am I doing?" answer before the
  // raw inputs.
  if (typeof window !== 'undefined' && window.renderLightTodayHero) {
    try {
      const todayBody = window.renderLightTodayHero() || '';
      if (todayBody) {
        widgets.push({
          id: 'light-today',
          title: 'Today',
          description: 'Current light synthesis across sun, devices, and environment',
          body: todayBody,
          size: 'full',
          opts: { source: 'Light', dashboardId: 'light-today' },
        });
      }
    } catch (_) {}
  }

  // Active sun session card — pinned at the very top of the page so the
  // live timer + channel chips + Pause/Flip/Sunscreen controls are the
  // first thing the user sees when a session is running. Renders above
  // Conditions / Setup / Stop CTA. Filtered out of the historical
  // sessions list further down so the same row doesn't render twice.
  const _activeSunSess = (window.getActiveSession && window.getActiveSession()) || null;
  let activeSessionBody = '';
  if (_activeSunSess && typeof window.renderSunSessionRow === 'function') {
    activeSessionBody += `<div class="light-active-session-pinned" aria-label="Active sun session">${window.renderSunSessionRow(_activeSunSess)}</div>`;
  }
  // Same pattern for active device-therapy sessions (PBM panels, SAD
  // lamps, dawn simulators). Pinned above the conditions panel so the
  // stop button is always one tap away.
  if (typeof window.renderActiveDeviceSessionCard === 'function') {
    const _activeDevHtml = window.renderActiveDeviceSessionCard();
    if (_activeDevHtml) {
      activeSessionBody += `<div class="light-active-session-pinned" aria-label="Active device session">${_activeDevHtml}</div>`;
    }
  }
  if (activeSessionBody) {
    widgets.push({
      id: 'light-live-session',
      title: 'Live Session',
      description: 'Running sun or therapy sessions with stop controls',
      body: activeSessionBody,
      size: 'full',
      opts: { source: 'Light', dashboardId: '' },
    });
  }

  // Always-visible "Conditions now" panel — UVI / ozone / AQI / sun angle.
  // Tells the user whether right now is a good time to go out, even before
  // they have any session history.
  // Setup card / saved summary. renderSunSetupCard() returns the editor
  // when onboarding is incomplete or the user has reopened to edit, and a
  // compact "Light setup saved" summary with an Edit button otherwise.
  let setupHtml = '';
  if (typeof window.renderSunSetupCard === 'function') {
    try { setupHtml = window.renderSunSetupCard() || ''; } catch (_) {}
  }
  const conditionsBody = renderLightConditionsWidgetBody({ variant: 'full' });
  widgets.push({
    id: 'light-conditions-now',
    title: 'Conditions Now',
    description: 'Current outdoor UVI, atmosphere, air quality, and sun timing',
    body: conditionsBody,
    size: 'two-third',
    opts: { source: 'Light', dashboardId: 'light-conditions-now' },
  });
  const logBody = renderLightSessionLogActions();
  widgets.push({
    id: 'light-session-log',
    title: 'Log Sessions',
    description: 'Start sun or therapy sessions and backfill past exposure',
    body: logBody,
    size: 'third',
    opts: { source: 'Light', dashboardId: 'light-session-log' },
  });
  widgets.push({
    id: 'light-setup',
    title: 'Light Setup',
    description: 'Skin type, indoor light context, and personal light assumptions',
    body: setupHtml,
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });

  // Slot id for the async-populated channel-deficit device recommendation
  // panel. Declared at top scope so the post-render population block can
  // reference it even when the page rendered without the parent
  // sessions-list section (e.g. all sessions deleted, but device sessions
  // push totalSessions ≥ 7 anyway). Stays null when the assignment branch
  // didn't run; the population block guards on truthiness.
  let deficitRecSlotId = null;

  // Combine sun + device totals so channels reflect every light source
  const devTotals7d = (window.rollingDeviceTotals && window.rollingDeviceTotals(7)) || {};
  const devTotals30d = (window.rollingDeviceTotals && window.rollingDeviceTotals(30)) || {};
  const combined7d = mergeTotals(totals7d, devTotals7d);
  const combined30d = mergeTotals(totals30d, devTotals30d);

  // Unified channel pill row — same vocabulary as the dashboard strip.
  // Empty state shows all ○○○○; populated state lights up dots as data
  // accumulates. Tapping a pill expands a drill-down panel with the full
  // science copy + tier comparison + suggestion. Empty defined as "no
  // light data of any kind" — devices count too.
  const isEmpty = totalSessions === 0;
  // Lead copy adapts to the actual state of the data, not just session
  // count. Three regimes:
  //   • No sessions ever            → explain the model
  //   • Sessions exist but every channel is at tier 0 (low-dose / sub-
  //     threshold) → don't oversell "30-day comparison"; describe what's
  //     actually there
  //   • At least one channel has a meaningful tier → invite drill-down
  //     with realistic copy
  const channelKeysOrdered = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  const _wkTier = window.weeklyChannelTier || window.channelTier || (() => 0);
  const litChannels = channelKeysOrdered.filter(k => _wkTier(combined7d[k] || 0, k) > 0).length;
  let lead;
  if (isEmpty) {
    lead = "Sun isn't just vitamin D. Each pill is a different biological effect of light — they fill as you log sessions outdoors or with a therapy device. Tap any pill to see how to fill it.";
  } else if (litChannels === 0) {
    lead = `${totalSessions} session${totalSessions === 1 ? '' : 's'} logged but no channel has crossed the meaningful-dose threshold yet (sub-tier exposure). Tap any pill for what it tracks and a concrete next step.`;
  } else {
    lead = `${litChannels} of 6 channels lit by your recent sessions. Tap any pill for what you've logged, the 7-day rhythm, and what would tip it up.`;
  }
  const channelsBody = `<div class="light-channels-section">
    <p class="light-section-hint">${lead}</p>
    ${renderChannelPills(combined7d, combined30d)}
    ${isEmpty ? getSunCoordsHint() : ''}
  </div>`;
  widgets.push({
    id: 'light-channels',
    title: 'Your Light, By What It Does',
    description: 'Channel doses from outdoor sun and therapy devices',
    body: channelsBody,
    size: 'full',
    opts: { source: 'Light', dashboardId: 'light-channels' },
  });

  if (!isEmpty) {
    let guidanceBody = '';
    // Today's burn-risk card — sun-specific, gated on having sun sessions.
    // A winter user with only device sessions doesn't need a "Sun exposure
    // today: safe (0%)" panel taking up space. Surfaces once outdoor sun
    // is part of the routine.
    if (sunCount > 0) {
      const medPct = Math.round(medToday * 100);
      const medY = (window.cumulativeMEDYesterday && window.cumulativeMEDYesterday()) || 0;
      const combinedMED = medToday + medY;
      let medCls = 'ok', medTitle = 'Sun exposure today: safe', medMsg = 'You\'re well under your burn threshold.';
      if (medToday >= 1) { medCls = 'over'; medTitle = 'Burn threshold reached'; medMsg = 'You\'ve crossed your burn threshold for the day. Avoid more direct sun until tomorrow.'; }
      else if (medToday >= 0.7) { medCls = 'warn'; medTitle = 'Approaching burn threshold'; medMsg = 'You\'re getting close to your daily limit. Move to shade or cover up if you go back out.'; }
      else if (medToday >= 0.3) { medCls = 'ok'; medTitle = 'Moderate sun exposure today'; medMsg = 'A meaningful dose — well under your skin\'s threshold.'; }
      // Carry-over chip — fires when today + yesterday combined exceeds
      // 100%, even if today alone is under threshold. Skin doesn't reset
      // overnight; back-to-back high-dose days are how vacation burns happen.
      const carryChip = (combinedMED > 1.0 && medToday < 1.0)
        ? `<div class="light-med-carryover" title="Yesterday ${Math.round(medY * 100)}% MED + today ${medPct}% MED. Skin partially carries dose between days — back-to-back exposure compounds burn risk.">⚠ Cumulative dose with yesterday: ${Math.round(combinedMED * 100)}% — go easy today.</div>`
        : '';
      guidanceBody += `<div class="light-med-banner light-med-${medCls}">
        <div class="light-med-icon">${medToday >= 1 ? '⚠' : medToday >= 0.7 ? '!' : '✓'}</div>
        <div class="light-med-body">
          <div class="light-med-title">${medTitle}${medPct > 0 ? ` <span class="light-med-pct">(${medPct}% of your burn threshold)</span>` : ''}</div>
          <div class="light-med-sub">${medMsg}</div>
          ${carryChip}
        </div>
      </div>`;
    }

    // Suggestion (channel-agnostic, reads merged totals).
    // Wrapped by the channel-mix AI verdict — when AI is available the
    // AI verdict replaces the hardcoded per-channel string with a
    // multi-channel synthesis. Static suggestion stays as the fallback
    // so users without AI still see something useful, and as the
    // baseline content under the "Get AI synthesis" CTA before the
    // user has clicked it.
    const _staticSuggestion = renderSuggestion(combined7d);
    guidanceBody += (typeof window !== 'undefined' && window.renderChannelMixVerdict)
      ? window.renderChannelMixVerdict(_staticSuggestion)
      : _staticSuggestion;

    // Channel-deficit device recommendations — async slot. Surfaces a
    // CTA card with matching catalog devices when (a) the user has a
    // real baseline (≥7 logs) and (b) a device-fillable channel is
    // empty over 30 days. PBM red/NIR are the cleanest cases — solar
    // exposure can't realistically fill those, so a panel is the
    // right answer. Catalog + presets are async-loaded; the slot
    // stays empty if recs are off, region filters everything out, or
    // the catalog isn't reachable.
    deficitRecSlotId = `light-deficit-rec-slot-${Date.now()}`;
    guidanceBody += `<div id="${escapeAttr(deficitRecSlotId)}"></div>`;
    widgets.push({
      id: 'light-guidance',
      title: 'Guidance',
      description: 'Burn risk, channel synthesis, and device-fillable gaps',
      body: guidanceBody,
      size: 'full',
      opts: { source: 'Light', dashboardId: '' },
    });

    // Unified sessions list — sun + device merged chronologically.
    // Active sun session is pinned at top of page; this list shows
    // historical (ended) ones. Skip the section header when empty so
    // a freshly-started session doesn't render an orphan "Sessions"
    // heading with no rows under it.
    const _unifiedHtml = renderUnifiedSessionsList();
    if (_unifiedHtml) {
      // Header carries the count so the user gets a quick "do I have a
      // history yet?" answer alongside the section name. Replaces the
      // earlier orphan tally that sat above the CTAs.
      const _countLabel = totalSessions === 0 ? '' : ` (${totalSessions})`;
      widgets.push({
        id: 'light-sessions',
        title: `Recent Sessions${_countLabel}`,
        description: 'Chronological outdoor sun and therapy device history',
        body: _unifiedHtml,
        size: 'full',
        opts: { source: 'Light', dashboardId: '' },
      });
    }
  }

  // Page-only Light workbench surfaces stay separate widgets so each one can
  // be reordered, scanned, and visually handled like the rest of the redesign.
  const devicesSlotId = `light-devices-slot-${Date.now()}`;
  const environmentSlotId = `light-environment-slot-${Date.now()}`;
  const toolsSlotId = `light-tools-slot-${Date.now()}`;
  widgets.push({
    id: 'light-devices',
    title: 'Light Devices',
    description: 'Therapy panels, SAD lamps, dawn simulators, and device logging',
    body: `<div id="${escapeAttr(devicesSlotId)}" class="light-widget-loading">Loading devices...</div>`,
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });
  widgets.push({
    id: 'light-environment',
    title: 'Light Environment',
    description: 'Indoor rooms, screens, and evening light context',
    body: `<div id="${escapeAttr(environmentSlotId)}" class="light-widget-loading">Loading environment...</div>`,
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });
  widgets.push({
    id: 'light-tools',
    title: 'Measurement Tools',
    description: 'On-device light checks and room measurement workflows',
    body: `<div id="${escapeAttr(toolsSlotId)}" class="light-widget-loading">Loading tools...</div>`,
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });
  widgets.push({
    id: 'light-methods',
    title: 'Methods & Sources',
    description: 'Estimation model, uncertainty, and sun data source controls',
    body: renderLightMethodsWidgetBody(),
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });

  html += `${renderLensPageWidgets('light', widgets)}</div>`;

  main.innerHTML = html;
  main.querySelector('.light-page')?.classList.add('is-ready');

  // Populate the channel-deficit device-rec slot. Same baseline gate as
  // sun-context.js: ≥7 logged events of any kind. Device-fillable
  // channels only — sun-derived deficits (vit_d, circadian, etc.) get
  // suggested actions via renderSuggestion above; we don't try to sell
  // a panel as a sun substitute.
  if (deficitRecSlotId && totalSessions >= 7 && typeof window.renderChannelDeficitDeviceRecs === 'function'
      && typeof window.loadCatalog === 'function'
      && typeof window.loadLightDevicePresets === 'function') {
    const slot = document.getElementById(deficitRecSlotId);
    if (slot) {
      const DEVICE_CHANNELS = [
        { key: 'pbm_red', label: 'red 660 nm (PBM)' },
        { key: 'pbm_nir', label: 'near-IR 810/850 nm (PBM)' },
      ];
      const empty = DEVICE_CHANNELS.filter(c => (combined30d[c.key] || 0) === 0);
      if (empty.length) {
        Promise.all([window.loadCatalog(), window.loadLightDevicePresets()])
          .then(([catalog, presetData]) => {
            if (!catalog || !presetData?.presets) return;
            const blocks = empty
              .map(c => window.renderChannelDeficitDeviceRecs(catalog, c.key, presetData.presets, { label: escapeHTML(c.label) }))
              .filter(Boolean);
            if (blocks.length && slot.isConnected) slot.innerHTML = blocks.join('');
          })
          .catch(() => { /* recs are best-effort */ });
      }
    }
  }

  if (typeof window.renderDevicesSection === 'function') {
    Promise.resolve(window.renderDevicesSection()).then((devHtml) => {
      const slot = document.getElementById(devicesSlotId);
      if (!slot) return;
      const devices = (window.getDevices && window.getDevices()) || [];
      slot.outerHTML = devices.length > 0
        ? devHtml
        : renderLightWidgetPrompt('No devices added', 'Add device', "window.openAddDeviceDialog && window.openAddDeviceDialog()", 'Therapy panels, SAD lamps, and dawn simulators feed the same Light channels as outdoor sun.');
    }).catch(() => {});
  } else {
    const slot = document.getElementById(devicesSlotId);
    if (slot) {
      slot.outerHTML = renderLightWidgetPrompt('No devices added', 'Add device', "window.openAddDeviceDialog && window.openAddDeviceDialog()", 'Therapy panels, SAD lamps, and dawn simulators feed the same Light channels as outdoor sun.');
    }
  }
  const envSlot = document.getElementById(environmentSlotId);
  if (envSlot) {
    const env = (window.getLightEnvironment && window.getLightEnvironment()) || null;
    const hasLightEnvironment = !!(env?.rooms?.length || env?.screens?.length);
    envSlot.outerHTML = hasLightEnvironment && window.renderEnvironmentSection
      ? (window.renderEnvironmentSection() || '')
      : renderLightWidgetPrompt('No rooms mapped', 'Map a room', "window.addLightEnvRoom && window.addLightEnvRoom()", 'Map bedroom, office, screens, and evening light so Light can interpret your indoor day.', 'light-environment-prompt');
  }
  const toolsSlot = document.getElementById(toolsSlotId);
  if (toolsSlot) {
    toolsSlot.outerHTML = window.renderLightTools
      ? (window.renderLightTools() || '')
      : renderLightWidgetPrompt('No measurements yet', 'Open light tools', 'window._expandLightToolsSection && window._expandLightToolsSection()', 'Run lux, flicker, color temperature, glass, and sleep-darkness checks on this device. Camera frames stay local.', 'light-tools-section-collapsed');
  }
}

// Expand the collapsed Light tools placeholder into the full 8-card grid.
// Named function so the inline onclick can stay short and quote-safe.
function _expandLightToolsSection() {
  const collapsed = document.querySelector('.light-tools-section-collapsed');
  if (!collapsed || typeof window.renderLightTools !== 'function') return;
  const wrap = document.createElement('div');
  wrap.innerHTML = window.renderLightTools() || '';
  if (wrap.firstElementChild) collapsed.replaceWith(wrap.firstElementChild);
}

function getSunCoordsHint() {
  if (typeof window === 'undefined' || !window.getSunCoords) return '';
  const c = window.getSunCoords();
  if (!c) {
    return `<p class="light-intro-hint">Tip: set your country in the profile editor for accurate sun calculations, or <a href="#" onclick="event.preventDefault();window.requestPreciseLocation && window.requestPreciseLocation()">share your precise location</a> once.</p>`;
  }
  if (c.source === 'country-band') {
    return `<p class="light-intro-hint">Calculations use your country (~${c.lat}° lat). <a href="#" onclick="event.preventDefault();window.requestPreciseLocation && window.requestPreciseLocation()">Use precise location</a> for sharper results.</p>`;
  }
  return '';
}

// ═══════════════════════════════════════════════
// DASHBOARD WIDGETS
// ═══════════════════════════════════════════════

let dashboardWidgetControls;

const dashboardWidgetRenderers = createDashboardWidgetRenderers({
  markerHasData,
  renderDashboardLightChannelPills,
  renderLightConditionsWidgetBody,
  renderLightSessionLogActions,
  getMobileDashboardMarkers,
  getMobileDashboardInsights,
  getMobileWearableTiles,
  formatMobileWearableValue,
  formatMobileWearableDelta,
  getMobileWearablePriority,
  rerenderDashboardFromWidgetChange,
  showRecommendations,
});

const {
  buildDashboardWidgetContext,
  getCachedRecommendationsCatalog,
  refreshRecommendationsWhenCatalogReady,
  getGlobalRecommendationCandidates,
  renderRecommendationCard,
  renderRecommendationsEmpty,
  renderDashboardBioAgeWidget,
  renderDashboardRecommendationsWidget,
  renderDashboardSpotlightWidget,
  renderDashboardWearableTilesWidget,
  renderDashboardQuickMarkersWidget,
  renderDashboardInsightsListWidget,
  renderDashboardGenomeWidget,
  renderDashboardAlertsWidget,
  renderDashboardCorrelationWidget,
  renderDashboardLightTodayWidget,
  renderDashboardLightConditionsWidget,
  renderDashboardLightSessionLogWidget,
  renderDashboardLightChannelsWidget,
  renderDashboardKeyTrendsWidget,
  renderDashboardNotesWidget,
  renderLabsPriorityBanner,
  getDashboardMarkerById,
  getDashboardBiometricSelection,
  saveDashboardBiometricSelection,
  getDashboardBiometricMetricOrder,
  getDashboardBiometricTile,
  renderDashboardSingleMarkerWidget,
  isDashboardQuickMarkerPinned,
  toggleDashboardQuickMarkerPin,
} = dashboardWidgetRenderers;

configureMarkerDetailModal({ navigate, isDashboardQuickMarkerPinned, showEmojiPicker });

const dashboardWidgetRegistry = createDashboardWidgetRegistry({
  renderDashboardBioAgeWidget,
  renderFocusCard,
  renderDashboardRecommendationsWidget,
  renderDashboardSpotlightWidget,
  renderDashboardWearableTilesWidget,
  renderDashboardQuickMarkersWidget,
  renderDashboardInsightsListWidget,
  renderDashboardGenomeWidget,
  renderDashboardAlertsWidget,
  renderDashboardCorrelationWidget,
  renderDashboardLightTodayWidget,
  renderDashboardLightConditionsWidget,
  renderDashboardLightSessionLogWidget,
  renderDashboardLightChannelsWidget,
  renderDashboardKeyTrendsWidget,
  renderDashboardNotesWidget,
}, {
  getDashboardMarkerWidgetDefinition,
  isOrganizeMode: () => dashboardWidgetControls?.isOrganizeMode() || false,
});

const {
  getAvailableDashboardFixedWidgets,
  getAvailableDashboardFixedWidgetIds,
  dashboardMarkerWidgetId,
  dashboardMarkerIdFromWidgetId,
  isDashboardMarkerWidgetId,
  getDashboardWidgetPrefs,
  saveDashboardWidgetPrefs,
  resetDashboardWidgetPrefs,
  getVisibleDashboardWidgetEntries,
} = dashboardWidgetRegistry;

dashboardWidgetControls = createDashboardWidgetControls({
  state,
  getActiveData,
  getAvailableDashboardFixedWidgets,
  getAvailableDashboardFixedWidgetIds,
  getDashboardWidgetPrefs,
  saveDashboardWidgetPrefs,
  resetDashboardWidgetPrefs,
  dashboardMarkerWidgetId,
  dashboardMarkerIdFromWidgetId,
  isDashboardMarkerWidgetId,
  getDashboardMarkerById,
  markerHasData,
  getLatestValueIndex,
  getEffectiveRangeForDate,
  canonicalMetric,
  getDashboardBiometricSelection,
  saveDashboardBiometricSelection,
  getDashboardBiometricMetricOrder,
  getDashboardBiometricTile,
  rerenderDashboardFromWidgetChange,
});

const {
  renderDashboardControlButtons,
  renderDashboardStickyControls,
  renderDashboardWidget,
} = dashboardWidgetControls;

configureLensPageShell({
  getAvailableDashboardFixedWidgetIds,
  getDashboardWidgetPrefs,
});

configureMobileDashboardView({
  buildDashboardWidgetContext,
  getDashboardWidgetPrefs,
  getVisibleDashboardWidgetEntries,
  renderDashboardControlButtons,
  isDashboardOrganizeMode: () => dashboardWidgetControls.isOrganizeMode(),
  renderDashboardWidget,
  setupDropZone,
  loadCommitHash,
});

export const toggleDashboardOrganizeMode = (...args) => dashboardWidgetControls.toggleDashboardOrganizeMode(...args);
export const moveDashboardWidget = (...args) => dashboardWidgetControls.moveDashboardWidget(...args);
export const hideDashboardWidget = (...args) => dashboardWidgetControls.hideDashboardWidget(...args);
export const showDashboardWidget = (...args) => dashboardWidgetControls.showDashboardWidget(...args);
export const addDashboardWidgetFromLens = (...args) => dashboardWidgetControls.addDashboardWidgetFromLens(...args);
export const removeDashboardWidgetFromLens = (...args) => dashboardWidgetControls.removeDashboardWidgetFromLens(...args);
export const addDashboardMarkerWidget = (...args) => dashboardWidgetControls.addDashboardMarkerWidget(...args);
export const addDashboardBiometricMetric = (...args) => dashboardWidgetControls.addDashboardBiometricMetric(...args);
export const addDashboardBiometricWidget = (...args) => dashboardWidgetControls.addDashboardBiometricWidget(...args);
export const removeDashboardBiometricMetric = (...args) => dashboardWidgetControls.removeDashboardBiometricMetric(...args);
export const filterDashboardMarkerWidgetPicker = (...args) => dashboardWidgetControls.filterDashboardMarkerWidgetPicker(...args);
export const filterDashboardBiometricWidgetPicker = (...args) => dashboardWidgetControls.filterDashboardBiometricWidgetPicker(...args);
export const resetDashboardWidgets = (...args) => dashboardWidgetControls.resetDashboardWidgets(...args);
export const clearDashboardWidgets = (...args) => dashboardWidgetControls.clearDashboardWidgets(...args);
export const openDashboardWidgetPicker = (...args) => dashboardWidgetControls.openDashboardWidgetPicker(...args);
export const openDashboardBiometricPicker = (...args) => dashboardWidgetControls.openDashboardBiometricPicker(...args);
export const closeDashboardWidgetPicker = (...args) => dashboardWidgetControls.closeDashboardWidgetPicker(...args);
export const startDashboardWidgetDrag = (...args) => dashboardWidgetControls.startDashboardWidgetDrag(...args);
export const allowDashboardWidgetDrop = (...args) => dashboardWidgetControls.allowDashboardWidgetDrop(...args);
export const dropDashboardWidget = (...args) => dashboardWidgetControls.dropDashboardWidget(...args);

function getDashboardMarkerWidgetDefinition(widgetId, ctx = null) {
  const markerId = dashboardMarkerIdFromWidgetId(widgetId);
  if (!markerId) return null;
  const hit = ctx ? (getDashboardMarkerById(ctx.data, markerId) || getDashboardMarkerById(ctx.filteredData, markerId)) : getDashboardMarkerById(getActiveData(), markerId);
  const title = hit?.marker?.name || markerId.replace(/_/g, ' ');
  const category = hit?.category?.label || 'Single marker';
  return {
    id: widgetId,
    title,
    source: 'Labs',
    description: `${category} marker widget`,
    size: 'quarter',
    customMarkerWidget: true,
    render: (renderCtx) => renderDashboardSingleMarkerWidget(renderCtx, markerId),
  };
}

function getDashboardProfileName() {
  const profile = getMobileDashboardProfile();
  const name = getMobileGreetingName(profile);
  return name === 'there' ? 'Dashboard' : name;
}

function getDashboardPanelCount(data) {
  return Object.values(data.categories || {}).filter(cat => {
    if (cat.singlePoint && cat.singleDate) return true;
    return Object.values(cat.markers || {}).some(markerHasData);
  }).length;
}

function getDashboardMonthSpan(data) {
  const dates = (data.dates || []).filter(Boolean);
  if (dates.length < 2) return '';
  const first = new Date(dates[0] + 'T00:00:00');
  const last = new Date(dates[dates.length - 1] + 'T00:00:00');
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return '';
  const months = Math.max(1, Math.round((last - first) / (1000 * 60 * 60 * 24 * 30.4375)));
  return `${months} month${months === 1 ? '' : 's'}`;
}

function renderDashboardGreeting(ctx, title, visibleCount) {
  const counts = getMobileDashboardCounts(ctx.data);
  const panelCount = getDashboardPanelCount(ctx.data);
  const span = getDashboardMonthSpan(ctx.data);
  const parts = [
    `${counts.inRange} of ${counts.markerCount || 0} markers in range`,
    counts.latestDate ? `last draw ${formatDate(counts.latestDate, 'short')}` : '',
    `${panelCount} panel${panelCount === 1 ? '' : 's'}${span ? ` across ${span}` : ''}`,
    `${visibleCount} widget${visibleCount === 1 ? '' : 's'} active`,
  ].filter(Boolean);
  return `<div class="category-header dashboard-greeting">
    <div>
      <div class="dashboard-greeting-kicker">${escapeHTML(title)}</div>
      <h1>Hey ${escapeHTML(getDashboardProfileName())}.</h1>
      <div class="dashboard-greeting-sub">${parts.map(escapeHTML).join(' · ')}</div>
    </div>
  </div>`;
}

function renderDashboardWidgets(ctx, title) {
  const prefs = getDashboardWidgetPrefs();
  const visibleEntries = getVisibleDashboardWidgetEntries(ctx, prefs);
  let html = renderDashboardGreeting(ctx, title, visibleEntries.length);
  html += `<div class="drop-zone drop-zone-hidden" id="drop-zone"></div>`;
  html += renderOnboardingBanner();
  html += renderAIConnectionReminder();
  html += renderDashboardStickyControls();
  html += `<div class="dashboard-widgets${dashboardWidgetControls.isOrganizeMode() ? ' is-organizing' : ''}">`;
  visibleEntries.forEach((entry, index) => { html += renderDashboardWidget(entry, prefs, index, visibleEntries); });
  if (visibleEntries.length === 0) {
    html += `<div class="dashboard-widget dashboard-widget-full is-empty">
      <div class="dashboard-widget-empty">No widgets are visible.</div>
    </div>`;
  }
  html += `</div>`;
  if (dashboardWidgetControls.isOrganizeMode()) {
    html += `<div class="dashboard-organize-footer">
      ${renderDashboardControlButtons({ includeReset: true })}
    </div>`;
  }
  return html;
}

const lensPageHandlers = createLensPageHandlers({
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
});

export function openRecommendationDetail(slotKey, label = 'Recommendation', markerStatus = '') {
  const modal = setDetailModalShell('recommendation-detail-modal');
  const overlay = document.getElementById("modal-overlay");
  if (!modal || !overlay) return;
  modal.innerHTML = `<button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
    <h3>${escapeHTML(label || 'Recommendation')}</h3>
    <div class="dashboard-widget-empty">Loading options...</div>`;
  overlay.classList.add("show");
  window.renderRecommendationSection?.(slotKey, { label: 'Options', maxProducts: 4, markerStatus })
    .then(html => {
      modal.innerHTML = `<button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
        <h3>${escapeHTML(label || 'Recommendation')}</h3>
        ${html || '<div class="dashboard-widget-empty">No recommendation details available for this slot.</div>'}`;
    })
    .catch(() => {
      modal.innerHTML = `<button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
        <h3>${escapeHTML(label || 'Recommendation')}</h3>
        <div class="dashboard-widget-empty">Could not load recommendation details.</div>`;
    });
}

export function discussRecommendation(id) {
  const catalog = getCachedRecommendationsCatalog();
  const ctx = buildDashboardWidgetContext(getActiveData());
  const candidate = getGlobalRecommendationCandidates(ctx, catalog, { includeDismissed: true }).find(c => c.id === id);
  const prompt = candidate
    ? `Help me evaluate this recommendation from getbased.\nSource: ${candidate.source}\nRecommendation: ${candidate.label}\nReason: ${candidate.reason}\nSuggested first action: ${candidate.primaryAction || 'none listed'}\nWhat are the pros, cons, and safer non-product alternatives?`
    : 'Help me evaluate my current getbased recommendations. Which should I prioritize and why?';
  window.openChatPanel?.(prompt);
}

export function saveRecommendation(id, on = true) {
  dashboardWidgetRenderers.setRecommendationState('saved', id, !!on);
}

export function dismissRecommendation(id) {
  dashboardWidgetRenderers.setRecommendationState('dismissed', id, true);
}

function rerenderDashboardFromWidgetChange() {
  if (state.currentView === 'dashboard') window.navigate?.('dashboard');
}

Object.assign(window, {
  toggleDashboardOrganizeMode,
  moveDashboardWidget,
  moveLensPageWidget,
  hideDashboardWidget,
  showDashboardWidget,
  addDashboardWidgetFromLens,
  removeDashboardWidgetFromLens,
  addDashboardMarkerWidget,
  addDashboardBiometricMetric,
  addDashboardBiometricWidget,
  removeDashboardBiometricMetric,
  filterDashboardMarkerWidgetPicker,
  filterDashboardBiometricWidgetPicker,
  resetDashboardWidgets,
  clearDashboardWidgets,
  toggleDashboardQuickMarkerPin,
  openDashboardWidgetPicker,
  openDashboardBiometricPicker,
  closeDashboardWidgetPicker,
  startDashboardWidgetDrag,
  allowDashboardWidgetDrop,
  dropDashboardWidget,
});

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════

export function showDashboard(data) {
  // Resume the live-session ticker if a session was started before this
  // page loaded — keeps the dashboard Light Today surface ticking after a
  // hard reload mid-session.
  if (window._resumeActiveTickerIfNeeded) try { window._resumeActiveTickerIfNeeded(); } catch (e) {}
  if (window.ensureActiveDeviceTicker) try { window.ensureActiveDeviceTicker(); } catch (e) {}
  if (!data) data = getActiveData();
  const main = document.getElementById("main-content");
  const wasMobileDashboardActive = document.body.classList.contains('mobile-dashboard-active');
  document.body.classList.remove('mobile-dashboard-active');
  const wearableMetrics = state.importedData?.wearableSummary?.metrics || {};
  const hasWearableData = Object.values(wearableMetrics).some(metric => metric?.latest != null);
  const hasData = data.dates.length > 0 || hasWearableData || Object.values(data.categories).some(c => c.singlePoint && c.singleDate);

  // Show/hide import FAB based on whether dashboard has data
  const importFab = document.getElementById('import-fab');
  if (importFab) importFab.classList.toggle('hidden', !hasData);

  // Clear any onboarding focus mode once the user has data — the
  // welcome-hero / context-details targets no longer exist in the
  // data view, so the dimmed-peer rules would be no-ops anyway,
  // but stripping the classes keeps body state clean.
  if (hasData) document.body.classList.remove('cards-focus', 'import-focus', 'chat-autostart-reserved', 'empty-dashboard-active');

  // ── Demo-load in flight: short-lived placeholder while
  //    importDataJSON parses the demo blob (typically 2–3s). Without
  //    this the empty Welcome hero flashes for the duration. The flag
  //    is set in loadDemoData() and cleared on import success/failure.
  if (!hasData && window._demoLoadingProfileId === state.currentProfile) {
    document.body.classList.add('empty-dashboard-active');
    main.innerHTML = `<div class="welcome-hero" aria-busy="true" role="status" aria-live="polite">
      <h2>Loading demo data…</h2>
      <p class="welcome-hero-subtitle">Setting up the demo profile — this takes a few seconds the first time.</p>
    </div>`;
    return;
  }

  // ── Empty state: chat-first welcome hero ──
  if (!hasData) {
    document.body.classList.add('empty-dashboard-active');
    document.body.classList.remove('chat-autostart-reserved');
    const aiReady = hasAIProvider();
    const aiPaused = isAIPaused();
    const importReady = aiReady && !aiPaused;
    const heroClass = importReady ? 'welcome-hero welcome-hero-ready' : 'welcome-hero welcome-hero-noai';
    const chatAction = "window.openChatPanel && window.openChatPanel()";
    const primaryTitle = aiPaused ? 'Resume guided chat' : 'Start with guided chat';
    const primaryCopy = aiPaused
      ? 'Chat will walk you through re-enabling AI before you add files, connect sources, or ask for recommendations.'
      : (aiReady
        ? 'Chat will ask for context only when it helps, then route you to labs, DNA, wearables, light, or first-test planning.'
        : 'Chat starts with the basics, then guides AI setup only when it is needed for import or recommendations.');
    const secondaryAction = aiPaused
      ? `<button type="button" class="welcome-action-btn" onclick="closeChatPanel();window.openSettingsModal('ai')">Re-enable AI</button>`
      : (importReady
        ? `<button type="button" class="welcome-action-btn welcome-direct-import-btn" onclick="document.getElementById('pdf-input')?.click()">Import directly</button>`
        : '');
    const primaryPanel = `<div class="welcome-primary-panel welcome-chat-panel">
        <span class="welcome-primary-kicker">Start here</span>
        <strong>${escapeHTML(primaryTitle)}</strong>
        <p>${escapeHTML(primaryCopy)}</p>
        <div class="welcome-primary-actions">
          <button type="button" class="welcome-action-btn welcome-action-primary" onclick="${chatAction}">Start guided chat</button>
          ${secondaryAction}
        </div>
      </div>
      <div class="drop-zone drop-zone-hidden" id="drop-zone"></div>`;
    let html = `${renderAIConnectionReminder()}<div class="${escapeHTML(heroClass)}">
      <h2>Welcome to getbased</h2>
      <p class="welcome-hero-subtitle">Health intelligence that's actually yours — five lenses on your biology, one private dashboard.</p>
      ${primaryPanel}
      <div class="welcome-demo-section">
        <span class="welcome-section-label">Preview with demo data</span>
        <div class="demo-cards">
          <button class="demo-card" onclick="loadDemoData('female')">
            <span class="demo-card-avatar">\uD83D\uDC69</span>
            <span class="demo-card-name">Sarah, 34</span>
            <span class="demo-card-desc">Iron + Oura: overtraining clues</span>
          </button>
          <button class="demo-card" onclick="loadDemoData('male')">
            <span class="demo-card-avatar">\uD83D\uDC68</span>
            <span class="demo-card-name">Alex, 38</span>
            <span class="demo-card-desc">Metabolic + Withings body comp</span>
          </button>
        </div>
      </div>
    </div>`;
    main.innerHTML = html;
    setupDropZone();
    // First visit starts the empty-state tour from the welcome screen.
    // Delay one tick so header/profile controls are rendered before targets
    // are filtered. If the user already completed it, fall through to chat onboarding.
    const shouldAutoStartEmptyTour = !!window.startEmptyTour && !localStorage.getItem(profileStorageKey(state.currentProfile, 'emptyTour'));
    if (shouldAutoStartEmptyTour) setTimeout(() => window.startEmptyTour?.(true), 100);
    // Returning desktop visitors get the guided chat setup beside the
    // welcome hero. Mobile keeps the welcome/import controls unobscured.
    const isDesktopChatOnboardingViewport = typeof window !== 'undefined' && window.innerWidth > 768;
    if (!shouldAutoStartEmptyTour && state.chatHistory.length === 0) {
      if (isDesktopChatOnboardingViewport && !document.getElementById('chat-panel')?.classList.contains('open')) {
        document.body.classList.add('chat-autostart-reserved');
      }
      setTimeout(() => {
        if (!isDesktopChatOnboardingViewport || window.innerWidth <= 768) return;
        const panel = document.getElementById('chat-panel');
        if (state.chatHistory.length > 0 || panel?.classList.contains('open')) {
          document.body.classList.remove('chat-autostart-reserved');
          return;
        }
        if (window.openChatPanel) window.openChatPanel();
        else document.body.classList.remove('chat-autostart-reserved');
      }, 800);
    }
    return;
  }

  if (isMobileDashboardViewport()) {
    renderMobileDashboard(data, { resetScroll: !wasMobileDashboardActive });
    return;
  }

  // ── Has data: full dashboard, rendered through modular widgets ──
  const dashboardCtx = buildDashboardWidgetContext(data);
  const dashboardTitle = 'Dashboard Overview';
  let html = renderDashboardWidgets(dashboardCtx, dashboardTitle);

  main.innerHTML = html;

  setupDropZone();

  // Non-blocking: hydrate cached focus text for LCP, but don't replace stale
  // cached text with a fresh AI response during startup.
  if (hasData) loadFocusCard({ refreshStale: false });
  loadContextHealthDots();
  if (window.loadContextCardTips) window.loadContextCardTips();
  loadCommitHash();
  // Preload catalog so rec sections and sorting use it immediately
  if (window.loadCatalog) window.loadCatalog().then(c => { window._cachedCatalog = c; });

  // Auto-trigger guided tour on first populated dashboard visit as a fallback
  // for users who imported before seeing the empty-state tour.
  const _p = window.getProfiles?.()?.find(p => p.id === state.currentProfile);
  const _hasProfile = _p?.name && _p.name !== 'Default' && state.profileSex;
  if (_hasProfile && hasData) {
    if (window.startTour) window.startTour(true);
  }
}

// ═══════════════════════════════════════════════
// CATEGORY VIEWS
// ═══════════════════════════════════════════════

export function showCategory(categoryKey, preData) {
  // categoryKey is interpolated into inline-onclick handlers below (rename,
  // switchView, showDetailModal). Reject anything that doesn't
  // match the strict allowlist so a poisoned customMarker key can't break
  // out of the JS string context.
  if (!safeMarkerId(categoryKey)) return;
  // Ensure catalog is preloaded for sorting and rec links
  if (window.loadCatalog && !window._cachedCatalog) window.loadCatalog().then(c => { window._cachedCatalog = c; });
  const rawData = preData || getActiveData();
  const data = filterDatesByRange(rawData);
  const cat = data.categories[categoryKey];
  const main = document.getElementById("main-content");
  const allEntries = Object.entries(cat.markers).filter(([, m]) => !m.hidden);
  const withData = allEntries.filter(([, m]) => markerHasData(m));
  const countLabel = withData.length < allEntries.length ? `${withData.length} of ${allEntries.length} biomarkers with data` : `${allEntries.length} biomarkers tracked`;
  const renameBtn = ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Rename category" title="Rename category" onclick="event.stopPropagation();renameCategory('${categoryKey}')" style="cursor:pointer;font-size:12px">rename</span>`;
  let html = `<div class="category-header"><h2>${renderCategoryGlyph(categoryKey, cat.label)}<span class="category-title-text">${escapeHTML(cat.label)}</span>${renameBtn}</h2>
    <p>${countLabel}</p></div>`;

  html += `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px">`;
  html += `<div class="view-toggle" role="tablist" aria-label="View mode" style="margin-bottom:0">
    <button class="view-btn active" role="tab" aria-selected="true" tabindex="0" onclick="switchView('charts','${categoryKey}',this)">Charts</button>
    <button class="view-btn" role="tab" aria-selected="false" tabindex="-1" onclick="switchView('table','${categoryKey}',this)">Table</button>
    <button class="view-btn" role="tab" aria-selected="false" tabindex="-1" onclick="switchView('heatmap','${categoryKey}',this)">Heatmap</button></div>`;
  html += renderDateRangeFilter();
  html += renderChartLayersDropdown();
  html += `</div>`;

  html += `<div id="view-content">`;
  if (withData.length === 0) {
    html += `<div class="empty-state"><div class="empty-state-icon empty-state-icon-category">${renderCategoryGlyph(categoryKey, cat.label, { large: true })}</div>
      <h3>No Data Available</h3><p>Import lab results containing ${escapeHTML(cat.label.toLowerCase())} markers to see data here.</p></div>`;
  } else if (cat.singleDate) {
    html += renderFattyAcidsView(cat, categoryKey);
  } else {
    sortCategoryChartEntries(withData, categoryKey);
    html += `<div class="charts-grid">`;
    for (const [key, marker] of withData) {
      // Skip legacy customMarkers with unsafe keys — they can't be safely
      // embedded in inline-onclick handlers.
      if (!safeMarkerId(key)) continue;
      html += renderChartCard(categoryKey + "_" + key, marker, data.dateLabels);
    }
    html += `</div>`;
    // Show empty markers (no data yet) as clickable cards
    const noData = allEntries.filter(([, m]) => !markerHasData(m));
    if (noData.length > 0) {
      html += `<div style="margin-top:16px"><p style="color:var(--text-secondary);font-size:13px;margin-bottom:8px">No data yet</p><div style="display:flex;flex-wrap:wrap;gap:8px">`;
      for (const [key, marker] of noData) {
        if (!safeMarkerId(key)) continue;
        const id = categoryKey + '_' + key;
        html += `<div class="chart-card" role="button" tabindex="0" aria-label="Add value for ${escapeHTML(marker.name)}" onclick="showDetailModal('${id}')" style="cursor:pointer;padding:12px 16px;min-height:auto;flex:0 0 auto">
          <span style="color:var(--text-secondary)">${escapeHTML(marker.name)}</span>
          <span style="color:var(--text-muted);font-size:11px;margin-left:6px">+ add value</span></div>`;
      }
      html += `</div></div>`;
    }
  }
  html += `</div>`;
  main.innerHTML = html;

  const savedView = state.categoryView;
  if (savedView === 'table' || savedView === 'heatmap') {
    const buttons = main.querySelectorAll('.view-toggle .view-btn');
    const idx = savedView === 'table' ? 1 : 2;
    if (buttons[idx]) { switchView(savedView, categoryKey, buttons[idx]); return; }
  }

  if (withData.length === 0) { /* no charts to render */ }
  else if (cat.singleDate) { renderFattyAcidsCharts(cat); }
  else {
    for (const [key, marker] of withData) {
      createLineChart(categoryKey + "_" + key, marker, data.dateLabels, data.dates, data.phaseLabels);
    }
  }
  loadChartCardRecs();
}

export function switchView(view, categoryKey, btn) {
  // categoryKey reaches inline-onclick handlers via renderChartCard /
  // renderFattyAcidsView / renderTableView / renderHeatmapView. Same
  // allowlist guard as showCategory.
  if (!safeMarkerId(categoryKey)) return;
  state.categoryView = view;
  document.querySelectorAll(".view-btn").forEach(b => {
    b.classList.remove("active");
    b.setAttribute('aria-selected', 'false');
    b.setAttribute('tabindex', '-1');
  });
  btn.classList.add("active");
  btn.setAttribute('aria-selected', 'true');
  btn.setAttribute('tabindex', '0');
  destroyAllCharts();
  const rawData = getActiveData();
  const data = filterDatesByRange(rawData);
  const cat = data.categories[categoryKey];
  const container = document.getElementById("view-content");
  // Pre-sanitize date labels at the call boundary — CodeQL's taint analysis
  // (js/xss-through-dom) doesn't trace sanitizers across function calls, so
  // even though renderTableView/renderHeatmapView re-escape internally,
  // escaping here closes the call-site taint flow. Date arrays stay raw
  // because they're consumed by JSON.stringify in inline-onclick attrs
  // (escapeHTML would double-escape the JSON literal).
  const safeLabels = Array.isArray(data.dateLabels) ? data.dateLabels.map(escapeHTML) : data.dateLabels;
  if (view === "table") {
    container.innerHTML = renderTableView(cat, safeLabels, categoryKey, data.dates);
  } else if (view === "heatmap") {
    container.innerHTML = renderHeatmapView(cat, safeLabels, data.dates, categoryKey);
  } else {
    if (cat.singleDate) {
      container.innerHTML = renderFattyAcidsView(cat, categoryKey);
      renderFattyAcidsCharts(cat);
    } else {
      // Per-key safety check skips legacy customMarkers with unsafe keys so
      // they never reach inline-onclick handlers in renderChartCard.
      const withData = Object.entries(cat.markers).filter(([key, m]) => markerHasData(m) && safeMarkerId(key));
      let html = `<div class="charts-grid">`;
      for (const [key, marker] of withData) {
        html += renderChartCard(categoryKey + "_" + key, marker, data.dateLabels);
      }
      html += `</div>`;
      container.innerHTML = html;
      for (const [key, marker] of withData) {
        createLineChart(categoryKey + "_" + key, marker, data.dateLabels, data.dates, data.phaseLabels);
      }
    }
  }
}

configureCompareCorrelationViews({
  renderTableColgroup,
  renderScrollableTableShell,
  renderCategoryGlyph,
});

// ═══════════════════════════════════════════════
// WELCOME INTRO (profile setup on first visit)
// ═══════════════════════════════════════════════


// ═══════════════════════════════════════════════
// WINDOW EXPORTS
// ═══════════════════════════════════════════════

Object.assign(window, {
  navigate,
  getInitialView,
  showDashboard,
  showLabs,
  showGenomeLens,
  showBodyLens,
  showInsightLens,
  showRecommendations,
  openRecommendationDetail,
  discussRecommendation,
  saveRecommendation,
  dismissRecommendation,
  showLight,
  _expandLightToolsSection,
  _toggleChannelDetail,
  _openChannelOnLightPage,
  _openAllSessionsModal,
  renderLightTodayStrip,
  renderLightChannelsLive,
  renderConditionsNow,
  _refreshConditionsNow,
  _inspectConditionsNow,
  _setManualUvi,
  _clearManualUvi,
  renderFocusCard,
  buildFocusContext,
  loadFocusCard,
  refreshFocusCard,
  renderOnboardingBanner,
  renderAIConnectionReminder,
  dismissAIReminder,
  openChatProviderQuiz,
  setOnboardingFocus,
  completeOnboardingSex,
  completeOnboardingProfile,
  dismissOnboarding,
  showCategory,
  renameCategory,
  renameMarker,
  revertMarkerName,
  changeCategoryIcon,
  switchView,
  renderChartCard,
  renderTableView,
  renderHeatmapView,
  renderFattyAcidsView,
  renderFattyAcidsCharts,
  fetchCustomMarkerDescription,
  showDetailModal,
  editRefRange,
  saveRefRange,
  revertRefRange,
  openManualEntryForm,
  saveManualEntry,
  saveAndAddAnotherManualEntry,
  openCreateMarkerModal,
  pickNewCatIcon,
  saveCustomMarker,
  deleteMarkerValue,
  deleteCustomMarker,
  editMarkerValue,
  revertMarkerValue,
  editValueNote,
  deleteValueNote,
  toggleMarkerNoteEditor,
  saveMarkerNote,
  deleteMarkerNote,
  closeModal,
  rememberModalTrigger,
  showCompare,
  setCompareDate1,
  setCompareDate2,
  updateCompare,
  swapCompareDates,
  renderCompareTable,
  showCorrelations,
  populateCorrelationOptions,
  showCorrelationDropdown,
  filterCorrelationOptions,
  toggleCorrelationMarker,
  applyCorrelationPreset,
  renderCorrelationChips,
  renderCorrelationChart,
});
