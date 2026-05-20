// views.js — Navigate, dashboard, category views, and shared view composition

import { state } from './state.js';
import { trackUsage } from './schema.js';
import { escapeHTML, escapeAttr, getStatus, getRangePosition, formatValue, getTrend, showNotification, hasCardContent, formatDate, safeMarkerId } from './utils.js';
import { getChartColors } from './theme.js';
import { getActiveData, filterDatesByRange, destroyAllCharts, getEffectiveRange, getEffectiveRangeForDate, getLatestValueIndex, getAllFlaggedMarkers, countFlagged, statusIcon, getFocusCardFingerprint, saveImportedData, updateHeaderDates, renderDateRangeFilter, renderChartLayersDropdown } from './data.js';
import { profileStorageKey } from './profile.js';
import { createLineChart, ensureChartJs } from './charts.js';
import { canonicalMetric } from './wearable-adapters.js';
import { loadContextHealthDots } from './context-cards.js';
import { callClaudeAPI, hasAIProvider, isAIPaused, getAIProvider, getActiveModelId } from './api.js';
import { injectLensChunks } from './lab-context.js';
import { hasLens, queryLens } from './lens.js';
import { applyInlineMarkdown } from './markdown.js';
import { loadPdfImport } from './import-loader.js';
import { createNavigate, getInitialView as getRouterInitialView } from './views-router.js';
import { createLensPageHandlers } from './lens-pages.js';
import { createDashboardWidgetRegistry } from './dashboard-widgets.js';
import { createDashboardWidgetControls } from './dashboard-widget-controls.js';
import { createDashboardWidgetRenderers } from './dashboard-widget-renderers.js';
import { renderLightConditionsWidgetBody, renderConditionsNow, _refreshConditionsNow, _inspectConditionsNow, _setManualUvi, _clearManualUvi, _formatElapsedShort } from './light-conditions-now.js';
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
  const combinedTotals7d = mergeTotalsLocal(totals7d, devTotals7d);
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

function mergeTotals(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = (out[k] || 0) + v;
  return out;
}
function mergeTotalsLocal(a, b) { return mergeTotals(a, b); }

// Mini 7-day sparkline rendered as inline SVG. Bars are heightless when a
// day's combined dose is sub-meaningful (~5% of daily target) — a faint
// stub so the day position stays readable without inflating an empty
// week. Replaces the prior ●○○○ dots metaphor which (a) implied a
// "fillable container" mental model that contradicts the daily-beats-
// banking framing and (b) had ~4 bits of resolution loss vs the
// continuous channel-au value.
//
// Width: 7 bars × 5px + 6 gaps × 2px = 47px in viewBox. Renders crisply
// at any pill height because we use viewBox + width 100%.
function _channelSparkline(channelKey, totals = null) {
  if (!window.dailyChannelBreakdown) return '';
  const days = window.dailyChannelBreakdown(channelKey, 7);
  const meta = (window.CHANNEL_DISPLAY || {})[channelKey] || {};
  const dailyTarget = meta.dailyTarget || 0;
  const observedMax = Math.max(0, ...days.map(d => d.sun + d.device));
  const max = Math.max(observedMax, dailyTarget * 1.05, 0.001);
  const W = 47, H = 14, barW = 5, gap = 2;
  const colorFor = (total) => {
    if (dailyTarget <= 0 || total < dailyTarget * 0.05) return null; // faint stub
    if (total >= dailyTarget) return 'var(--green)';
    if (total >= dailyTarget * 0.30) return 'var(--channel-accent, var(--accent))';
    return 'var(--channel-accent, var(--accent))';
  };
  const opacityFor = (total) => {
    if (dailyTarget <= 0 || total < dailyTarget * 0.05) return 0.35;
    if (total >= dailyTarget) return 1.0;
    if (total >= dailyTarget * 0.30) return 0.85;
    return 0.55;
  };
  const bars = days.map((d, i) => {
    const x = i * (barW + gap);
    const total = d.sun + d.device;
    const isStub = !colorFor(total);
    const barH = isStub ? 1.5 : Math.max(1.5, (total / max) * H);
    const y = H - barH;
    const fill = colorFor(total) || 'var(--text-muted)';
    return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${fill}" opacity="${opacityFor(total)}" rx="0.6"/>`;
  }).join('');
  return `<svg class="light-pill-sparkline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${bars}</svg>`;
}

// "X days" label for the pill — count of days that hit the channel's
// meaningful-dose threshold. Returns "—" when no day qualified.
function _channelDayCount(channelKey) {
  if (!window.dailyChannelBreakdown) return { txt: '—', n: 0 };
  const days = window.dailyChannelBreakdown(channelKey, 7);
  const meta = (window.CHANNEL_DISPLAY || {})[channelKey] || {};
  const target = meta.dailyTarget || 0;
  const threshold = (typeof _CHANNEL_DAY_THRESHOLD !== 'undefined' && _CHANNEL_DAY_THRESHOLD[channelKey]) || 0.30;
  const floor = target * threshold;
  let n = 0;
  for (const d of days) if ((d.sun + d.device) >= floor) n++;
  // "4/7" reads as a fraction at a glance — much clearer than "4d",
  // which users were parsing as "4 days ago" instead of "4 of 7 days
  // this week hit target". Tooltip + sr-only label still say it the
  // long way for accessibility. Zero-hit channels show "0/7" too so
  // the format stays consistent across pills instead of an em-dash
  // (which read as "no data" instead of "zero days hit").
  return { txt: `${n}/7`, n };
}

// Unified channel pill row — same vocabulary as the dashboard strip,
// reused on the Light page where each pill is a click-to-expand entry into
// a per-channel drill-down panel (full science, 7d/30d tier comparison,
// suggestion). Empty state renders the same row with all-empty
// sparklines; bars fill in as data accumulates. One renderer for both
// states.
function renderChannelPills(totals7d, totals30d) {
  const ch = window.CHANNEL_DISPLAY || {};
  // Tier classifiers: weekly for v7 (the canonical "this week" headline),
  // and a 30-day equivalent for v30 by scaling the threshold band to the
  // longer window. Mixing daily-target classification on a multi-day total
  // double-counts and wrecks the trend arrow (t30 ALWAYS scored higher
  // than t7 because totals scale with window even when the daily rate is
  // identical, so the trend read "down" on every flat pattern).
  const tlabel = window.tierLabel || (() => 'none');
  const tier7 = window.weeklyChannelTier || ((v, k) => 0);
  const tier30 = (v, k) => {
    const target = ((ch[k] && ch[k].dailyTarget) || 1000) * 30;
    if (!Number.isFinite(v) || v <= 0) return 0;
    const r = v / target;
    if (r < 0.20) return 1;
    if (r < 0.55) return 2;
    if (r < 1.00) return 3;
    return 4;
  };
  const order = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  let html = `<div class="light-pills-row light-pills-interactive">`;
  for (const k of order) {
    const meta = ch[k] || {};
    const v7 = totals7d[k] || 0;
    const v30 = totals30d[k] || 0;
    const t7 = tier7(v7, k);
    const t30 = tier30(v30, k);
    const trendDir = t7 > t30 ? 'up' : t7 < t30 ? 'down' : 'flat';
    const dc = _channelDayCount(k);
    const tip = `${meta.what || ''} — ${dc.n} of 7 days hit target this week.`;
    const detailId = `light-pill-detail-${k}`;
    html += `<button type="button" class="light-pill light-pill-tier-${t7} light-pill-interactive" data-channel="${escapeAttr(k)}" data-trend="${trendDir}" aria-expanded="false" aria-controls="${detailId}" title="${escapeHTML(tip)}" onclick="window._toggleChannelDetail && window._toggleChannelDetail('${escapeAttr(k)}')">
      <span class="light-pill-icon" aria-hidden="true">${meta.icon || '·'}</span>
      <span class="light-pill-label">${escapeHTML(meta.label || k)}</span>
      ${_channelSparkline(k)}
      <span class="light-pill-daycount">${escapeHTML(dc.txt)}</span>
      <span class="sr-only">${tlabel(t7)}, ${dc.n} of 7 days hit target this week, trending ${trendDir} vs last 30 days</span>
    </button>`;
  }
  html += `</div>`;
  // The drill-down slot lives below the row. Only one channel is expanded
  // at a time — toggling collapses any other open detail.
  html += `<div class="light-channel-detail-slot" data-channel-detail-slot></div>`;
  return html;
}

// Per-channel scientific citations + action spectrum. Surfaced inside the
// drill-down panel so biohackers can audit which biology each pill encodes.
// Per-channel citations curated for fit + accessibility. Each entry is
// { cite, href, why }: the citation string, an open-access landing page
// (PubMed PMID or DOI), and a one-line "why this paper matters" tag so
// users can self-select what to read instead of staring at a list of
// titles. Selection priority: directly on-channel > foundational
// mechanism > population/RCT confirmation. Avoid tangential papers
// (e.g. measurement-methodology unless the engine uses that standard).
const CHANNEL_CITATIONS = {
  vitamin_d: {
    spectrum: 'Pre-vitamin-D action spectrum (CIE 174:2006), peak ~298 nm UVB',
    refs: [
      { cite: 'Webb AR & Engelsen O (2006). "Calculated ultraviolet exposure levels for a healthy vitamin D status." Photochem Photobiol 82:1697',
        href: 'https://pubmed.ncbi.nlm.nih.gov/16958558/',
        why: 'Dose-response calculations that justify the UVI ≥ 2-3 threshold the engine uses' },
      { cite: 'Holick MF (2007). "Vitamin D Deficiency." NEJM 357:266',
        href: 'https://www.nejm.org/doi/full/10.1056/NEJMra070553',
        why: 'Most-cited modern clinical review of the vitamin D pathway, including the per-session photoisomerization plateau (skin converts excess previtamin-D to inert tachysterol/lumisterol at high doses)' },
      { cite: 'Bogh MK & Wulf HC (2010). "Vitamin D production after UVB exposure depends on baseline 25(OH)D and total cholesterol." J Invest Dermatol 130:546',
        href: 'https://pubmed.ncbi.nlm.nih.gov/19812604/',
        why: 'Per-session IU yield variability — why the model bands at ±20-45% per zenith and biological response adds another 2-3×' },
    ],
  },
  circadian: {
    spectrum: 'Melanopic action spectrum (CIE S 026/E:2018), peak ~490 nm',
    refs: [
      { cite: 'Brown TM et al. (2022). "Recommendations for daytime, evening, and nighttime indoor light exposure." PLOS Biol 20:e3001571',
        href: 'https://doi.org/10.1371/journal.pbio.3001571',
        why: 'Current expert-consensus recommendations: ≥250 melanopic lux daytime, <10 evening, <1 night' },
      { cite: 'Lucas RJ et al. (2014). "Measuring and using light in the melanopsin age." Trends Neurosci 37:1',
        href: 'https://pubmed.ncbi.nlm.nih.gov/24287308/',
        why: 'Foundational paper that informed the M-EDI / α-opic lux framework later codified in CIE S 026' },
      { cite: 'Hattar S et al. (2002). "Melanopsin-containing retinal ganglion cells: architecture, projections, and intrinsic photosensitivity." Science 295:1065',
        href: 'https://pubmed.ncbi.nlm.nih.gov/11834834/',
        why: 'Discovery of melanopsin and the ipRGC photoreceptor — the why-this-channel-exists paper' },
    ],
  },
  nir_solar: {
    spectrum: 'Cytochrome-c-oxidase absorption (660-850 nm windows). Solar NIR and narrowband PBM share the same chromophore — sunlight just delivers a broadband version of what panels do.',
    refs: [
      { cite: 'Hamblin MR (2018). "Mechanisms and Mitochondrial Redox Signaling in Photobiomodulation." Photochem Photobiol 94:199',
        href: 'https://pubmed.ncbi.nlm.nih.gov/29164625/',
        why: 'Comprehensive review of how 600–1000 nm light reaches mitochondrial cytochrome c oxidase and triggers redox signaling — the same pathway whether the photons come from sunlight or a panel' },
      { cite: 'Hamblin MR (2017). "Mechanisms and applications of the anti-inflammatory effects of photobiomodulation." AIMS Biophys 4:337',
        href: 'https://pubmed.ncbi.nlm.nih.gov/28748217/',
        why: 'Mechanism review focused on the anti-inflammatory effects — applies equally to narrowband panels and the NIR component of broadband solar' },
      { cite: 'Karu TI (2010). "Multiple roles of cytochrome c oxidase in mammalian cells under action of red and IR-A radiation." IUBMB Life 62:607',
        href: 'https://pubmed.ncbi.nlm.nih.gov/20681024/',
        why: 'Cytochrome c oxidase as the primary photoacceptor — the molecular target underlying every NIR effect' },
    ],
  },
  no_cv: {
    spectrum: 'UVA + violet (320-440 nm) on bare skin → photo-released NO',
    refs: [
      { cite: 'Liu D et al. (2014). "UVA irradiation of human skin vasodilates arterial vasculature and lowers blood pressure independently of nitric oxide synthase." J Invest Dermatol 134:1839',
        href: 'https://pubmed.ncbi.nlm.nih.gov/24445737/',
        why: 'Controlled mechanistic crossover trial showing UVA on skin lowers BP via photo-released NO from skin stores (NOT via vit-D)' },
      { cite: 'Lindqvist PG et al. (2016). "Avoidance of sun exposure as a risk factor for major causes of death." J Intern Med 280:375',
        href: 'https://pubmed.ncbi.nlm.nih.gov/26992108/',
        why: '20-year Swedish cohort: sun-avoidance carries all-cause mortality risk comparable to smoking' },
      { cite: 'Feelisch M et al. (2010). "Is sunlight good for our heart?" Eur Heart J 31:1041',
        href: 'https://pubmed.ncbi.nlm.nih.gov/20215123/',
        why: 'Foundational hypothesis paper laying out the UVA→NO→cardiovascular mechanism' },
    ],
  },
  pomc: {
    spectrum: 'UVA + UVB on skin keratinocytes → POMC → α-MSH/β-endorphin',
    refs: [
      { cite: 'Fell GL et al. (2014). "Skin β-endorphin mediates addiction to UV light." Cell 157:1527',
        href: 'https://pubmed.ncbi.nlm.nih.gov/24949966/',
        why: 'Landmark Cell paper showing UV → keratinocyte β-endorphin → opioid-receptor-mediated mood/addictive response' },
      { cite: 'Slominski A et al. (2012). "Sensing the environment: regulation of local and global homeostasis by the skin\'s neuroendocrine system." Adv Anat Embryol Cell Biol 212:1',
        href: 'https://pubmed.ncbi.nlm.nih.gov/22894052/',
        why: 'Comprehensive review of skin as a neuroendocrine organ — POMC, α-MSH, ACTH, cortisol all expressed in skin' },
      { cite: 'Cui R et al. (2007). "Central role of p53 in the suntan response and pathologic hyperpigmentation." Cell 128:853',
        href: 'https://pubmed.ncbi.nlm.nih.gov/17350573/',
        why: 'p53 → POMC → α-MSH → melanin pathway: the molecular mechanism behind the tan signal' },
    ],
  },
  violet_eye: {
    spectrum: 'Violet 360-400 nm at the eye → OPN5/neuropsin + retinal dopamine release (cone-mediated). Distinct from the ipRGC/melanopic 490-nm circadian pathway.',
    refs: [
      { cite: 'Torii H et al. (2017). "Violet light exposure can be a preventive strategy against myopia progression." EBioMedicine 15:210',
        href: 'https://pubmed.ncbi.nlm.nih.gov/28063778/',
        why: 'Foundational paper linking 360-400 nm violet light at the eye to slowed myopia progression in children' },
      { cite: 'Rose KA et al. (2008). "Outdoor activity reduces the prevalence of myopia in children." Ophthalmology 115:1279',
        href: 'https://pubmed.ncbi.nlm.nih.gov/18294691/',
        why: 'Cohort of >4000 kids (1,765 six-year-olds + 2,367 twelve-year-olds): time outdoors (not near-work) is the protective factor against myopia' },
      { cite: 'He M et al. (2015). "Effect of Time Spent Outdoors at School on the Development of Myopia Among Children in China: A Randomized Clinical Trial." JAMA 314:1142',
        href: 'https://pubmed.ncbi.nlm.nih.gov/26372583/',
        why: 'JAMA RCT in ~1,900 first-graders: 40 extra outdoor min/day cut new-myopia incidence by 9 percentage points (39.5% → 30.4%, ~23% relative reduction)' },
    ],
  },
};

function _renderChannelCitations(channelKey) {
  const cit = CHANNEL_CITATIONS[channelKey];
  if (!cit) return '';
  const meta = (window.CHANNEL_DISPLAY || {})[channelKey] || {};
  const channelName = meta.label || channelKey;
  const refs = cit.refs.map(({ cite, href, why }) => `<li>
    <a href="${escapeAttr(href)}" target="_blank" rel="noopener">${escapeHTML(cite)}</a>
    ${why ? `<div class="light-channel-cit-why">${escapeHTML(why)}</div>` : ''}
  </li>`).join('');
  // "Suggest a better study" — same pattern as recommendations.js. Pre-
  // fills a GitHub issue with the channel name + current reference list
  // so the maintainer has context when triaging the suggestion. Open in
  // a new tab so reading the panel isn't interrupted.
  const issueTitle = encodeURIComponent(`[Light & Sun] ${channelName}: better study / correction`);
  const currentList = cit.refs.map(r => `- ${r.cite}\n  ${r.href}`).join('\n');
  const issueBody = encodeURIComponent(
    `**Channel:** ${channelName} (\`${channelKey}\`)\n` +
    `**Action spectrum:** ${cit.spectrum}\n\n` +
    `**Current references:**\n${currentList}\n\n` +
    `**What's wrong / what's better:**\n\n` +
    `**Suggested study (with link):**\n\n` +
    `**Why this is a better fit (one line):**\n`
  );
  const suggestLink = `<div class="light-channel-cit-suggest"><a href="https://github.com/elkimek/get-based/issues/new?title=${issueTitle}&body=${issueBody}&labels=light-channel-citations" target="_blank" rel="noopener">Suggest a better study →</a></div>`;
  return `<details class="light-channel-cit">
    <summary>Action spectrum &amp; citations</summary>
    <p class="light-channel-cit-spec"><strong>Spectrum:</strong> ${escapeHTML(cit.spectrum)}</p>
    <ul class="light-channel-cit-refs">${refs}</ul>
    ${suggestLink}
  </details>`;
}

// 7-day stacked bar chart: per-day sun + device totals for one channel.
// Always renders (even all-zero days) so the user has a baseline visual
// reference. Includes a dashed target line at (dailyTarget / 7) so the
// per-day chart shows what "hitting your weekly target evenly" looks
// like. Numeric labels above each bar surface the actual numbers when
// non-zero.
function _renderChannelWeekChart(channelKey) {
  if (!window.dailyChannelBreakdown) return '';
  const days = window.dailyChannelBreakdown(channelKey, 7);
  // For vit-D, pull a per-day IU breakdown that uses the same per-session
  // math as rollingVitaminDIU (real Fitz/UVI/rotation/genetics/body-frac
  // cap). Bar height + tier color still use channel-au from `days` for
  // continuity with the sparkline; only the numeric label switches to
  // per-session-accurate IU so it agrees with the session-row IU readout.
  const iuDays = (channelKey === 'vitamin_d' && window.dailyVitaminDIUBreakdown)
    ? window.dailyVitaminDIUBreakdown(7)
    : null;
  const ch = window.CHANNEL_DISPLAY || {};
  const meta = ch[channelKey] || {};
  const dailyTarget = meta.dailyTarget || 0;
  const dailyTargetSlice = dailyTarget; // chart is per-day, so target IS the daily target
  const observedMax = Math.max(0, ...days.map(d => d.sun + d.device));
  // Anchor the chart to whichever is bigger — the highest day or the
  // target-per-day line. Without this, very-low-dose weeks compress
  // the target off the top of the chart and lose context.
  const max = Math.max(observedMax, dailyTargetSlice * 1.2, 0.001);

  const W = 280, H = 96, padX = 18, padTop = 14, padBottom = 16;
  const innerH = H - padTop - padBottom;
  const barW = (W - 2 * padX) / 7;
  const barInner = Math.max(10, barW * 0.7);
  const dayLetter = (date) => 'SMTWTFS'[date.getDay()];
  const today = new Date(); today.setHours(0,0,0,0);

  // Per-day number formatter — converts channel-au into the channel's
  // natural unit so the chart labels match the hero's unit. Channel-au
  // by itself is dimensionless ("576K of what?"); always show something
  // human-readable.
  //
  // Returns "" for zero/sub-meaningful values so the chart doesn't get
  // peppered with "0%" labels on empty days.
  const fmt = (n, dayIdx) => {
    if (!Number.isFinite(n) || n < 0.5) return '';
    if (channelKey === 'vitamin_d') {
      // Use the per-session IU breakdown (same math as the session row
      // and the rollingVitaminDIU hero) rather than the old Fitz-III /
      // uvi-7 / no-genetics approximation that diverged 20-50% from the
      // session-row IU on real sessions.
      const iu = iuDays && dayIdx != null
        ? (iuDays[dayIdx]?.sun || 0) + (iuDays[dayIdx]?.device || 0)
        : 0;
      if (iu < 1) return '';
      if (iu >= 1000) return (iu / 1000).toFixed(1) + 'k';
      if (iu >= 100) return String(Math.round(iu / 10) * 10);
      return String(Math.round(iu));
    }
    if (channelKey === 'nir_solar' && window.pbmJoulesPerCm2) {
      const j = window.pbmJoulesPerCm2(n);
      if (j < 0.05) return '';
      if (j >= 10) return String(Math.round(j));
      if (j >= 1) return j.toFixed(1);
      return j.toFixed(2);
    }
    // Unitless channels — show percent-of-daily-target so the day-vs-day
    // comparison reads as % of typical day, not raw channel-au.
    if (dailyTarget > 0) {
      const pct = Math.round(100 * n / dailyTarget);
      if (pct === 0) return '';
      return `${pct}%`;
    }
    return '';
  };

  // Empty-day placeholder bar so the chart never reads as a giant blank.
  const placeholderH = 3;

  // Color bar by how the day's dose stacks up against the daily target.
  // Visual at-a-glance: green = hit/exceeded daily, accent = meaningful,
  // muted = marginal. Encourages reading the chart as "did I check this
  // box today?" instead of "what big number did I rack up?".
  const dayThreshold = _CHANNEL_DAY_THRESHOLD[channelKey] ?? 0.30;
  const colorForDay = (total) => {
    if (dailyTarget <= 0 || total < dailyTarget * 0.05) return { fill: 'var(--text-muted)', op: 0.40 };
    if (total >= dailyTarget) return { fill: 'var(--green)', op: 1.0 };
    if (total >= dailyTarget * dayThreshold) return { fill: 'var(--channel-accent, var(--accent))', op: 0.85 };
    return { fill: 'var(--channel-accent, var(--accent))', op: 0.45 };
  };

  const bars = days.map((d, i) => {
    const x = padX + i * barW + (barW - barInner) / 2;
    const total = d.sun + d.device;
    const h = total > 0 ? (total / max) * innerH : placeholderH;
    const sunH = total > 0 ? (d.sun / max) * innerH : 0;
    const devH = total > 0 ? (d.device / max) * innerH : 0;
    const y = padTop + innerH - h;
    const isToday = d.date.getTime() === today.getTime();
    const labelTxt = total > 0 ? fmt(total, i) : '';
    const { fill: barFill, op: barOp } = colorForDay(total);
    // Hit-target check mark — greener visual cue when the day cleared the
    // daily target line. Reduces the urge to chase higher percentages
    // ("more is better") past the saturation point.
    const checkMark = (dailyTarget > 0 && total >= dailyTarget) ? `<text x="${x + barInner / 2}" y="${y - 12}" text-anchor="middle" font-size="11" fill="var(--green)" font-weight="700">✓</text>` : '';
    return `<g>
      ${total > 0 ? '' : `<rect x="${x}" y="${padTop + innerH - placeholderH}" width="${barInner}" height="${placeholderH}" fill="var(--text-muted)" opacity="0.20" rx="1"/>`}
      ${devH > 0 ? `<rect x="${x}" y="${y}" width="${barInner}" height="${devH}" fill="${barFill}" opacity="${barOp * 0.55}" rx="1"/>` : ''}
      ${sunH > 0 ? `<rect x="${x}" y="${y + devH}" width="${barInner}" height="${sunH}" fill="${barFill}" opacity="${barOp}" rx="1"/>` : ''}
      ${checkMark}
      ${labelTxt && !checkMark ? `<text x="${x + barInner / 2}" y="${y - 2}" text-anchor="middle" font-size="9" fill="var(--text-secondary)">${labelTxt}</text>` : ''}
      <text x="${x + barInner / 2}" y="${H - 3}" text-anchor="middle" font-size="10" fill="${isToday ? 'var(--text-primary)' : 'var(--text-muted)'}" font-weight="${isToday ? '700' : '400'}">${dayLetter(d.date)}</text>
    </g>`;
  }).join('');

  // Target line — dashed accent, drawn under the bars so the bar fills sit
  // on top of it visually. Surfaces the "what hitting the weekly target
  // evenly looks like" reference. Only meaningful when target > 0.
  const targetLine = dailyTargetSlice > 0
    ? `<line x1="${padX}" x2="${W - padX}" y1="${padTop + innerH - (dailyTargetSlice / max) * innerH}" y2="${padTop + innerH - (dailyTargetSlice / max) * innerH}" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>
       <text x="${W - padX + 2}" y="${padTop + innerH - (dailyTargetSlice / max) * innerH + 3}" font-size="9" fill="var(--text-muted)" text-anchor="start">target</text>`
    : '';

  // SR readable summary
  const dayName = (date) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()];
  const srRows = days.map(d => {
    const total = d.sun + d.device;
    if (total < 0.0001) return `${dayName(d.date)}: no exposure`;
    if (d.device > 0 && d.sun > 0) return `${dayName(d.date)}: sun ${fmt(d.sun)}, device ${fmt(d.device)}`;
    if (d.sun > 0) return `${dayName(d.date)}: sun ${fmt(d.sun)}`;
    return `${dayName(d.date)}: device ${fmt(d.device)}`;
  }).join('. ');

  return `<div class="light-channel-weekchart" title="Last 7 days · solid = sun, faded = device · dashed line = even-pace daily target">
    <div class="light-channel-weekchart-label">7-day rhythm <span class="light-channel-weekchart-legend"><span class="lc-leg-sun"></span> sun · <span class="lc-leg-dev"></span> device · <span class="lc-leg-tgt"></span> target</span></div>
    <svg viewBox="0 0 ${W + 32} ${H}" width="100%" height="${H}" aria-label="7-day per-day exposure: ${escapeAttr(srRows)}" role="img">
      <desc>${escapeHTML(srRows)}</desc>
      ${targetLine}
      ${bars}
    </svg>
  </div>`;
}

// Threshold (fraction of daily target) above which a day counts as
// "meaningful exposure" toward this channel. Stricter for the eye-bound
// circadian/violet channels because the biological response requires
// real entrainment-strength dose, not a brief glance.
const _CHANNEL_DAY_THRESHOLD = {
  vitamin_d:  0.30,
  nir_solar:  0.30,
  no_cv:      0.30,
  pomc:       0.30,
  circadian:  0.50,
  violet_eye: 0.50,
};

// Count days in the breakdown where the day's combined dose hit at least
// `threshold × dailyTarget`. Sub-meaningful days don't count — partial
// glance light isn't biologically equivalent to a real dose.
function _meaningfulDayCount(days, dailyTarget, threshold) {
  if (!Array.isArray(days) || dailyTarget <= 0) return 0;
  const floor = threshold * dailyTarget;
  let n = 0;
  for (const d of days) {
    if ((d.sun + d.device) >= floor) n++;
  }
  return n;
}

// Hero stat for a channel — leads with DAILY CONSISTENCY ("3 of 7
// days") instead of weekly cumulative. Health-wise, daily exposure
// matters more than banking one big day for every channel here:
// circadian needs daily entrainment, vit-D plateaus per session
// around 20k IU, NO release dissipates, NIR benefit is dose-per-
// exposure not banked. The "X of 7 days" framing matches the biology;
// the cumulative real-unit (IU / J/cm²) when defensible is shown as
// a sub-line for completeness.
function _channelHero(channelKey, totalCurrent, totalPrev, days7, daysPrev7, weeklyTier = 0) {
  const meta = (window.CHANNEL_DISPLAY || {})[channelKey] || {};
  const target = meta.dailyTarget || 0;
  const threshold = _CHANNEL_DAY_THRESHOLD[channelKey] ?? 0.30;
  const tierLabelFor = window.tierLabel || (() => 'none');
  const tierColors = ['muted', 'tier1', 'tier2', 'tier3', 'tier4'];
  const tierPill = `<span class="light-channel-detail-tierpill ${tierColors[weeklyTier] || 'muted'}">${escapeHTML(tierLabelFor(weeklyTier))} this week</span>`;
  const fmtIntK = (n) => {
    if (n < 10) return n.toFixed(1);
    if (n < 1000) return String(Math.round(n));
    if (n < 10000) return (n / 1000).toFixed(1) + 'k';
    return (n / 1000).toFixed(0) + 'k';
  };

  const dayCountCur  = _meaningfulDayCount(days7,     target, threshold);
  const dayCountPrev = _meaningfulDayCount(daysPrev7, target, threshold);

  // Cumulative real-unit summary (always computed; only shown if defensible).
  let cumulative = '';
  if (channelKey === 'vitamin_d' && window.rollingVitaminDIU) {
    const iu = window.rollingVitaminDIU(7);
    if (iu >= 30) cumulative = `· ~${fmtIntK(iu)} IU total`;
  } else if (channelKey === 'nir_solar' && window.pbmJoulesPerCm2) {
    const j = window.pbmJoulesPerCm2(totalCurrent);
    if (j >= 0.1) cumulative = `· ${j >= 10 ? Math.round(j) : j.toFixed(1)} J/cm² total`;
  }

  let primary = '';
  let primarySub = '';
  if (totalCurrent < 0.5 && dayCountCur === 0) {
    primary = '—';
    primarySub = 'no exposure logged this week';
  } else {
    primary = `${dayCountCur} of 7 days`;
    // Channel-aware sub-label — what counts as "meaningful exposure"
    // varies per channel, but the framing stays consistent.
    const SUB_LABELS = {
      vitamin_d:  'with meaningful UVB synthesis',
      nir_solar:  'with meaningful NIR exposure',
      circadian:  'with strong morning/midday daylight in your eyes',
      no_cv:      'with meaningful UVA on bare skin',
      pomc:       'with meaningful sun on bare skin',
      violet_eye: 'with strong outdoor light reaching your eyes',
    };
    const subBase = SUB_LABELS[channelKey] || 'with meaningful exposure';
    primarySub = `${subBase} ${cumulative}`.trim();
  }

  // Trend = day-count delta vs last week. Same unit (days) so comparison
  // reads naturally without conversion gymnastics.
  let trend = '';
  if (dayCountCur > 0 || dayCountPrev > 0) {
    const delta = dayCountCur - dayCountPrev;
    if (delta >= 1) {
      trend = `<span class="light-channel-hero-trend up">↑ ${delta} more day${delta === 1 ? '' : 's'} than last week</span>`;
    } else if (delta <= -1) {
      trend = `<span class="light-channel-hero-trend down">↓ ${-delta} fewer day${delta === -1 ? '' : 's'} than last week</span>`;
    } else if (dayCountCur > 0) {
      trend = `<span class="light-channel-hero-trend flat">~ same day count as last week</span>`;
    } else {
      trend = `<span class="light-channel-hero-trend down">↓ no qualifying days this week (had ${dayCountPrev} last week)</span>`;
    }
  }

  return `<div class="light-channel-hero">
    <div class="light-channel-hero-top">
      <div class="light-channel-hero-primary">${escapeHTML(primary)}</div>
      ${tierPill}
    </div>
    <div class="light-channel-hero-sub">${escapeHTML(primarySub)}</div>
    ${trend}
  </div>`;
}

// Caption explaining why daily exposure beats banking one big day.
// Channel-specific so the reason is biologically grounded, not generic.
function _renderDailyBeatsBankingNote(channelKey) {
  const NOTES = {
    vitamin_d:  'Skin photoisomerizes excess back to inactive isomers around 20k IU per session — daily 10-min sessions outperform one big day (Holick 2007, Webb 2018).',
    nir_solar:  'Mitochondrial benefit is dose-dependent per exposure, not banked — daily 20-min walks deliver more cumulative cellular signal than one long session.',
    circadian:  'Body clock entrainment depends on daily timing of morning light — one banked day doesn\'t prevent the next day\'s drift toward later sleep onset.',
    no_cv:      'UVA-driven nitric oxide release happens during exposure and dissipates over hours — daily refreshes the vasodilatory + BP-lowering signal.',
    pomc:       'POMC pathway tone resets between sessions — daily sun maintains α-MSH (tan signal) and β-endorphin (mood) baseline rather than spiking and crashing.',
    violet_eye: 'Violet-eye dopamine release is per-exposure — daily outdoor minutes accumulate the myopia-protective + alertness signal that one long day can\'t bank.',
  };
  const txt = NOTES[channelKey];
  if (!txt) return '';
  return `<p class="light-channel-banking-note"><strong>Daily beats banking.</strong> ${escapeHTML(txt)}</p>`;
}

// Source-mix mini bar — what fraction of the week's dose came from sun
// vs from devices. Surfaces hidden context (e.g. "your circadian channel
// is 90% from your dawn simulator, 10% from outdoor sun").
function _renderChannelSourceMix(sun, dev) {
  const total = sun + dev;
  if (total < 0.5) return '';
  const sunPct = Math.round(100 * sun / total);
  const devPct = 100 - sunPct;
  // Hide when one source is essentially zero — no useful "mix" to show.
  if (sunPct >= 99 || sunPct <= 1) return '';
  return `<div class="light-channel-mix" aria-label="This week's source mix: ${sunPct}% sun, ${devPct}% device">
    <div class="light-channel-mix-bar">
      <div class="light-channel-mix-sun" style="flex: ${sunPct}"></div>
      <div class="light-channel-mix-dev" style="flex: ${devPct}"></div>
    </div>
    <div class="light-channel-mix-legend">
      <span><span class="lc-leg-sun"></span> Sun ${sunPct}%</span>
      <span><span class="lc-leg-dev"></span> Device ${devPct}%</span>
    </div>
  </div>`;
}

// Channel-specific "next move" — a concrete recipe the user can act on
// right now. Picks the best CTA based on channel + tier + available
// devices + current sun conditions.
function _channelNextMove(channelKey, t7, totalCurrent, devices, atm) {
  const matchingDevice = (devices || []).find(d => Array.isArray(d.channels) && d.channels.includes(channelKey));
  const dev = matchingDevice ? `${matchingDevice.brand} ${matchingDevice.model}` : '';
  const uvi = atm?.uvIndex ?? null;
  const peakTime = atm?.daily?.peakAt || null;
  const peakUVI = atm?.daily?.uvIndexMax ?? null;
  const peakHHMM = peakTime ? new Date(peakTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null;

  // Per-channel recipes — each returns a concrete, time-aware suggestion.
  const recipes = {
    vitamin_d: {
      empty: `UVB on bare skin makes vitamin D — needs UVI ≥ 3 and no glass. ${peakHHMM && peakUVI >= 3 ? `Today's UV peaks at <strong>${peakHHMM}</strong> (UVI ${peakUVI.toFixed(1)}). 15-20 min in shorts at peak ≈ 1,000-2,000 IU.` : 'Glass blocks UVB; window-side sun yields zero.'}${matchingDevice ? ` Or a session on your ${dev}.` : ''}`,
      low:   `${peakHHMM && peakUVI >= 3 ? `UV peaks at <strong>${peakHHMM}</strong> (UVI ${peakUVI.toFixed(1)}). One more 15-20 min midday session this week tips you to good range.` : 'A midday session on a clear day would tip you up.'}${matchingDevice ? ` Or a longer session on your ${dev}.` : ''}`,
      mod:   `Solid weekly base. ${peakHHMM ? `Today's peak: ${peakHHMM} (UVI ${peakUVI?.toFixed(1) || '?'}).` : 'Keep your current rhythm.'} One more session this week reaches strong.`,
      good:  `Strong week. Consistency matters more than intensity from here — same rhythm next week maintains 25(OH)D.`,
      strong:`Above typical-week target. Pull back if you're seeing pinkness; otherwise this is a solid trajectory for serum 25(OH)D.`,
    },
    circadian: {
      empty: `Get morning daylight in your eyes — ideally outdoors before work, no sunglasses, no glass. 10-30 min in the first 2 hours after sunrise = strongest entrainment.${matchingDevice ? ` Or 30 min on your ${dev} on overcast days.` : ''}`,
      low:   `Add a 15-20 min outdoor walk in your morning routine. Even cloudy mornings deliver 10-50× more melanopic light than indoor lighting.${matchingDevice ? ` Or a session on your ${dev}.` : ''}`,
      mod:   `Healthy entrainment dose. Mornings have the biggest effect on sleep onset that night — keep prioritizing AM over midday.`,
      good:  `Strong circadian signal. Consistent daily timing matters more than total dose at this point.`,
      strong:`Strong consistent entrainment. Watch for evening light contamination (cool LEDs after sunset) which can blunt melatonin even with strong AM exposure.`,
    },
    nir_solar: {
      empty: `Solar NIR is half of sunlight (600-1400 nm). 30-60 min outdoors at any time of day delivers a meaningful dose; window glass blocks ~70% of long NIR.${matchingDevice ? ` Or a 10-20 min session on your ${dev}.` : ''}`,
      low:   `Add an outdoor walk this week — sunrise/sunset light is NIR-rich and won't push burn dose.${matchingDevice ? ` Or 15 min on your ${dev}.` : ''}`,
      mod:   `Solid base. NIR doesn't need to be midday — golden-hour light delivers comparable dose without UVB burn risk.`,
      good:  `Strong weekly NIR. Mitochondrial repair signal is well-saturated for this week.`,
      strong:`Above typical-week NIR. No upper safety concern from broadband NIR — this is a maintenance pattern.`,
    },
    no_cv: {
      empty: `UVA on bare skin (320-400 nm) photo-releases nitric oxide from skin stores. ${peakHHMM && peakUVI >= 3 ? `15-30 min outdoors anytime UV is up — today peaks at <strong>${peakHHMM}</strong> (UVI ${peakUVI.toFixed(1)}).` : 'Open-sky exposure during daylight hours.'} Sunscreen partially blocks UVA — bare-skin sessions count more.`,
      low:   `Add a 20-30 min outdoor session this week with face + arms uncovered. UVA accumulates throughout the day, not just at solar noon.`,
      mod:   `Healthy weekly UVA dose — sustained NO release supports BP + arterial function (Liu 2014).`,
      good:  `Strong NO/cardiovascular signal. Good aggregate UVA exposure for vasodilatory benefit.`,
      strong:`Above typical-week UVA. Be mindful of cumulative photoaging if this is a daily pattern; UVA is the long-wavelength culprit.`,
    },
    pomc: {
      empty: `UVA + UVB on skin keratinocytes triggers POMC → α-MSH (tan signal) + β-endorphin (the "feels good in the sun" effect). Same recipe as cardiovascular — open-sky daylight on bare skin.`,
      low:   `Same path as vit-D and NO/CV: midday outdoor sessions on bare skin. One more session this week tips you up.`,
      mod:   `Healthy weekly POMC pathway activation.`,
      good:  `Solid mood-hormone weekly signal.`,
      strong:`Above typical-week POMC stimulus.`,
    },
    violet_eye: {
      empty: `Outdoor violet 360-440 nm hits ipRGC sensors in the eye — different from "bright window light," which window glass attenuates. 15-30 min outdoors with eyes uncovered (no sunglasses, no glass) builds the dopamine signal linked to myopia control + alertness.`,
      low:   `Add an outdoor walk with eyes uncovered (no sunglasses) this week. Even 10 min counts — this channel saturates quickly.`,
      mod:   `Healthy weekly outdoor-violet dose.`,
      good:  `Solid violet-eye signal — keep eyes uncovered during morning outdoor time for the strongest effect.`,
      strong:`Above typical-week. Sunglasses are still appropriate at high UVI for eye safety; the violet signal banks well below sunburn risk levels.`,
    },
  };
  const r = recipes[channelKey] || {};
  let txt = '';
  if (t7 === 0) txt = r.empty || '';
  else if (t7 === 1) txt = r.low || '';
  else if (t7 === 2) txt = r.mod || '';
  else if (t7 === 3) txt = r.good || '';
  else txt = r.strong || '';
  if (!txt) return '';
  // Action button — channel-keyed; sun channels lead with "Log a sun
  // session", device-only channels lead with the device dialog. Mixed
  // channels surface both.
  const showSun = true; // every channel can be filled with sun
  const showDev = !!matchingDevice;
  const buttons = `
    ${showSun ? `<button type="button" class="import-btn import-btn-primary light-channel-cta-btn" onclick="window.quickLogSunSession && window.quickLogSunSession()">☀ Log a sun session</button>` : ''}
    ${showDev ? `<button type="button" class="import-btn import-btn-secondary light-channel-cta-btn" onclick="window.quickLogDeviceSession && window.quickLogDeviceSession()">🔴 Log device session</button>` : ''}`;
  return `<section class="light-channel-nextmove">
    <div class="light-channel-nextmove-label">Next move</div>
    <p class="light-channel-nextmove-text">${txt}</p>
    <div class="light-channel-nextmove-actions">${buttons}</div>
  </section>`;
}

// Build the drill-down panel HTML for a single channel. Renders into the
// `[data-channel-detail-slot]` container when the user taps a pill.
//
// Layout (top → bottom):
//   1. Header: icon + title + tier pill + close
//   2. Hero stat: real-unit aggregate this week (or empty-state)
//   3. What it does: one-sentence description
//   4. Source mix bar: sun vs device split (when both contribute)
//   5. 7-day chart with target line + numeric labels
//   6. Next move: channel-specific concrete recipe + action button
//   7. Action spectrum + paper citations (expandable)
function _renderChannelDetailPanel(channelKey) {
  const ch = window.CHANNEL_DISPLAY || {};
  const meta = ch[channelKey] || {};
  // Drill-down hero stat is a 7-day total — classify against the weekly
  // target so the badge agrees with the pill (and the AI rollup).
  const tier = window.weeklyChannelTier || (() => 0);
  const tlabel = window.tierLabel || (() => 'none');
  const sunTot7 = (window.rollingChannelTotals && window.rollingChannelTotals(7)) || {};
  const devTot7 = (window.rollingDeviceTotals && window.rollingDeviceTotals(7)) || {};
  const sun7 = sunTot7[channelKey] || 0;
  const dev7 = devTot7[channelKey] || 0;
  const totalCurrent = sun7 + dev7;
  const t7 = tier(totalCurrent, channelKey);

  // Previous-week total via 14-day breakdown (first 7 days = the
  // preceding week, last 7 days = current week). Lets the hero show
  // a real "vs last week" delta instead of a vague tier-vs-tier arrow.
  let totalPrev = 0;
  let days7 = [];
  let daysPrev7 = [];
  try {
    if (window.dailyChannelBreakdown) {
      const days14 = window.dailyChannelBreakdown(channelKey, 14);
      daysPrev7 = days14.slice(0, 7);
      days7 = days14.slice(7);
      totalPrev = daysPrev7.reduce((s, d) => s + d.sun + d.device, 0);
    }
  } catch (e) {}

  const devices = (window.getDevices && window.getDevices()) || [];

  // Pull the Conditions Now atm if in cache so the next-move can quote
  // today's UV-peak time — way more actionable than "spend time outdoors."
  const atm = _conditionsCache?.atm || null;

  return `<div class="light-channel-detail" data-channel="${escapeAttr(channelKey)}" id="light-pill-detail-${escapeAttr(channelKey)}" role="region" aria-label="${escapeHTML(meta.label || channelKey)} detail">
    <header class="light-channel-detail-head">
      <span class="light-channel-detail-icon" aria-hidden="true">${meta.icon || '·'}</span>
      <h4 class="light-channel-detail-title">${escapeHTML(meta.label || channelKey)}</h4>
      <button type="button" class="light-channel-detail-close" aria-label="Close ${escapeAttr(meta.label || channelKey)} detail" onclick="window._toggleChannelDetail && window._toggleChannelDetail('${escapeAttr(channelKey)}')">×</button>
    </header>

    ${_channelHero(channelKey, totalCurrent, totalPrev, days7, daysPrev7, t7)}

    <p class="light-channel-detail-body">${escapeHTML(meta.what || '')}</p>

    ${_renderChannelSourceMix(sun7, dev7)}

    ${_renderChannelWeekChart(channelKey)}

    ${_renderDailyBeatsBankingNote(channelKey)}

    ${_channelNextMove(channelKey, t7, totalCurrent, devices, atm)}

    ${_renderChannelCitations(channelKey)}
  </div>`;
}

// Navigate to the Light & Sun page and auto-expand the channel's
// drill-down panel. Used when the user taps a dashboard pill — gives
// them one-click access to the science / 30d trend / suggestion
// instead of forcing them to find the same pill on the Light page
// after navigation. Already on Light? Just toggle in place.
function _openChannelOnLightPage(channelKey) {
  // Helper: scroll the expanded panel into view + briefly flash so the
  // user notices when they're already on the Light page (no navigation
  // landing-on-target cue) and the panel may be far below the fold.
  const flashPanel = () => {
    const panel = document.getElementById(`light-pill-detail-${channelKey}`);
    if (!panel) return;
    if (panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    panel.classList.add('light-channel-detail-flash');
    setTimeout(() => panel.classList.remove('light-channel-detail-flash'), 1500);
  };
  if (state.currentView === 'light') {
    _toggleChannelDetail(channelKey);
    // Scroll + flash on the next frame after the panel renders.
    requestAnimationFrame(() => requestAnimationFrame(flashPanel));
    return;
  }
  if (window.navigate) window.navigate('light');
  // Light page renders synchronously; the pill row is in the DOM by
  // the next animation frame. Defer the toggle so the section exists.
  // Two rAFs to make sure the async devices/env/tools slot doesn't
  // race the toggle.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    _toggleChannelDetail(channelKey);
    flashPanel();
  }));
}

// Toggle a per-channel detail panel below the pill row. One channel
// expanded at a time — opening another collapses the previous one.
// Re-clicking the same pill collapses it.
function _toggleChannelDetail(channelKey) {
  const slot = document.querySelector('[data-channel-detail-slot]');
  if (!slot) return;
  const row = slot.previousElementSibling; // the pill row
  const pills = row ? row.querySelectorAll('.light-pill') : [];
  const currentlyOpen = slot.dataset.openChannel || '';
  // Reset every pill's aria-expanded
  for (const p of pills) p.setAttribute('aria-expanded', 'false');
  if (currentlyOpen === channelKey) {
    // Re-tap → collapse
    slot.innerHTML = '';
    slot.dataset.openChannel = '';
    return;
  }
  slot.innerHTML = _renderChannelDetailPanel(channelKey);
  slot.dataset.openChannel = channelKey;
  // Mark the matching pill expanded; move focus into the panel for SR users
  for (const p of pills) {
    if (p.dataset.channel === channelKey) {
      p.setAttribute('aria-expanded', 'true');
      const panel = slot.firstElementChild;
      if (panel) panel.setAttribute('tabindex', '-1');
      requestAnimationFrame(() => panel && panel.focus({ preventScroll: false }));
      break;
    }
  }
}

// Unified sessions list — sun + device sessions merged into a single
// chronological feed. Sun rows reuse renderSunSessionRow from sun.js
// so the rich treatment (channel chips, burn-risk meta, click-to-open
// detail modal) is consistent whether the user has only sun, only
// device, or both kinds of sessions. Device rows render inline since
// they have a simpler shape (no per-channel chips on the device-side
// — those would be the SAME chips on every row, not informative).
// Inline cap on the historical sessions list. 3 is enough for
// at-a-glance context ("what did I do recently"); the full history
// opens in a modal so the rest of the Light & Sun page (Devices,
// Light Environment, Tools) sits within one scroll-page below.
// Each row is ~160 px tall (date + duration + channel chips + burn-
// risk meta + AI verdict chip), so 3 rows ≈ 480 px is a tight default.
const SESSIONS_DEFAULT_CAP = 3;

// Build the unified, sorted (newest-first) row list of all completed
// sun + device sessions. Shared between the inline render (cap-bounded)
// and the modal that shows the full history.
function _collectUnifiedSessionRows() {
  // Active sun session is pinned at the top of the page (showLight
  // renders it before the quicklog row), so filter it out of the
  // historical-sessions list to avoid the same row appearing twice.
  const sunSessions = ((window.getSessions && window.getSessions()) || []).filter(s => !!s.endedAt);
  // Active device sessions are pinned above (renderActiveDeviceSessionCard);
  // filter them out here so the same row doesn't render twice.
  const devSessions = ((window.getDeviceSessions && window.getDeviceSessions()) || []).filter(s => !!s.endedAt);
  const rows = [];
  for (const s of sunSessions) rows.push({ kind: 'sun', startedAt: s.startedAt || 0, sess: s });
  for (const s of devSessions) rows.push({ kind: 'device', startedAt: s.startedAt || 0, sess: s });
  rows.sort((a, b) => b.startedAt - a.startedAt);
  return { rows, hasDeviceRows: devSessions.length > 0 };
}

// Render N session rows from the unified list as the body of a
// .sun-sessions-list block. Shared by the inline render + modal so
// the per-row look stays identical.
function _renderLightSessionChannelChips(doses, durationMin = 0) {
  if (!doses) return '';
  const ch = window.CHANNEL_DISPLAY || {};
  const tier = window.channelTier || (() => 0);
  const formatUnit = window.formatChannelUnit || (() => '');
  const order = ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'nir_solar', 'pbm_red', 'pbm_nir'];
  const ranked = order
    .map(key => ({ key, v: doses[key] || 0, tier: tier(doses[key] || 0, key) }))
    .filter(r => r.v > 0 && r.tier > 0)
    .sort((a, b) => b.tier - a.tier || b.v - a.v)
    .slice(0, 3);
  if (!ranked.length) return '';
  const chips = ranked.map(r => {
    const meta = ch[r.key] || {};
    const label = meta.label || r.key.replace('_', ' ');
    const value = formatUnit(r.key, r.v, durationMin, 'III', null, null, false, null);
    const tip = value ? `${meta.what || ''} — this session: ${value}` : `${meta.what || ''}`;
    return `<span class="sun-chip sun-chip-tier-${r.tier}" data-channel="${escapeAttr(r.key)}" title="${escapeAttr(tip)}">
      <span class="sun-chip-icon">${meta.icon || '·'}</span>
      <span class="sun-chip-label">${escapeHTML(label)}</span>
      ${value ? `<span class="sun-chip-value">${escapeHTML(value)}</span>` : ''}
    </span>`;
  }).join('');
  return `<div class="sun-channel-chips light-session-device-channels">${chips}</div>`;
}

function _renderSessionRowsHTML(rows) {
  const devices = (window.getDevices && window.getDevices()) || [];
  const deviceById = Object.fromEntries(devices.map(d => [d.id, d]));
  const renderSunRow = window.renderSunSessionRow;
  let html = '';
  for (const row of rows) {
    if (row.kind === 'sun' && renderSunRow) {
      html += renderSunRow(row.sess);
    } else if (row.kind === 'device') {
      const sess = row.sess;
      const dev = deviceById[sess.deviceId];
      const devName = dev ? `${dev.brand} ${dev.model}` : 'Removed device';
      const date = formatDate(new Date(row.startedAt).toISOString().slice(0, 10));
      const dur = sess.durationMin ? `${Math.round(sess.durationMin)} min` : '—';
      const meta = `${dur} @ ${sess.distanceCm}cm · ${sess.bodyArea || ''}${sess.eyesProtected ? ' · eyes protected' : ''}`;
      // Mode badge — only on rows for devices that declare modes. The
      // resolved mode answers "which LED groups fired" at a glance, key
      // for hybrid panels (Maxi UVB, Trinity) where the same device can
      // produce wildly different channel doses depending on the touchscreen
      // preset chosen. Non-moded devices keep the legacy row layout.
      let modeBadge = '';
      let modeAria = '';
      if (dev && Array.isArray(dev.modes) && dev.modes.length > 0) {
        const resolvedMode = dev.modes.find(m => m.id === sess.mode)
          || dev.modes.find(m => m.default)
          || dev.modes[0];
        if (resolvedMode) {
          const label = resolvedMode.label || resolvedMode.id;
          const isDefault = !!resolvedMode.default || dev.modes[0]?.id === resolvedMode.id;
          // Default-mode rows use a quieter chip; off-default modes get
          // an accent variant so the user can scan history for "when did
          // I last run UV?" — the visually-louder rows are the answer.
          modeBadge = `<span class="light-session-mode-chip${isDefault ? '' : ' light-session-mode-chip-accent'}" title="LED-group mode that fired during this session">${escapeHTML(label)}</span>`;
          modeAria = ` mode ${label}`;
        }
      }
      const devAriaLabel = `Open ${date} device session details — ${devName}${modeAria}`;
      html += `<div class="sun-session light-session-row light-session-device" data-id="${escapeAttr(sess.id)}" role="button" tabindex="0" aria-label="${escapeAttr(devAriaLabel)}" onclick="window.openDeviceSessionDetail && window.openDeviceSessionDetail('${escapeAttr(sess.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openDeviceSessionDetail && window.openDeviceSessionDetail('${escapeAttr(sess.id)}')}">
        <div class="sun-session-head">
          <span class="light-session-icon" aria-hidden="true">🔴</span>
          <span class="sun-session-date">${escapeHTML(date)}</span>
          <span class="sun-session-duration">${escapeHTML(dur)}</span>
          <span class="light-session-kind">${escapeHTML(devName)}</span>
          ${modeBadge}
          <button class="sun-session-delete" onclick="event.stopPropagation();window.deleteDeviceSession && window.deleteDeviceSession('${escapeAttr(sess.id)}')" title="Delete session" aria-label="Delete session">×</button>
        </div>
        <div class="sun-session-meta">${escapeHTML(meta)}</div>
        ${_renderLightSessionChannelChips(sess.doses, sess.durationMin || 0)}
        ${window.renderDeviceSessionAIInline ? window.renderDeviceSessionAIInline(sess) : ''}
      </div>`;
    }
  }
  return html;
}

// Inline render — caps at SESSIONS_DEFAULT_CAP and exposes the rest
// via "View all" modal instead of expanding inline (which used to
// bloat the page 1600+ px below the visible session list).
function renderUnifiedSessionsList() {
  const { rows, hasDeviceRows } = _collectUnifiedSessionRows();
  if (rows.length === 0) return '';
  const totalCount = rows.length;
  const visibleRows = rows.slice(0, SESSIONS_DEFAULT_CAP);
  const hiddenCount = totalCount - visibleRows.length;
  let html = `<div class="sun-sessions-list${hasDeviceRows ? ' light-sessions-list-unified' : ''}">`;
  html += _renderSessionRowsHTML(visibleRows);
  html += `</div>`;
  if (hiddenCount > 0) {
    html += `<button class="light-sessions-show-more" onclick="window._openAllSessionsModal()">View all ${totalCount} sessions</button>`;
  }
  return html;
}

// Modal listing every session — opened from the "View all" button so
// the Light & Sun page itself stays compact. Reuses the same per-row
// renderer as the inline list. Click any row to drill into its detail
// modal (the existing per-row onclicks pass through fine; they fire
// their own modal which replaces this one's overlay).
function _openAllSessionsModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-sessions-modal-overlay';
  let _detach = () => {};
  const _removeOverlay = overlay.remove.bind(overlay);
  overlay.remove = () => {
    _detach();
    _removeOverlay();
  };
  const renderInto = () => {
    const { rows, hasDeviceRows } = _collectUnifiedSessionRows();
    const sunCount = rows.filter(row => row.kind === 'sun').length;
    const deviceCount = rows.filter(row => row.kind === 'device').length;
    const lastLabel = rows[0]?.startedAt
      ? formatDate(new Date(rows[0].startedAt).toISOString().slice(0, 10))
      : '—';
    const title = `All sessions (${rows.length})`;
    overlay.innerHTML = `<div class="modal light-sessions-modal" role="dialog" aria-modal="true" aria-labelledby="light-all-sessions-title">
      <header class="light-sessions-modal-head">
        <div>
          <h3 id="light-all-sessions-title">${escapeHTML(title)}</h3>
          <p>Outdoor sun and therapy device history</p>
        </div>
        <button class="modal-close" aria-label="Close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </header>
      <div class="light-sessions-modal-summary" aria-label="Session summary">
        <div><span>Total</span><strong>${rows.length}</strong></div>
        <div><span>Sun</span><strong>${sunCount}</strong></div>
        <div><span>Device</span><strong>${deviceCount}</strong></div>
        <div><span>Latest</span><strong>${escapeHTML(lastLabel)}</strong></div>
      </div>
      <div class="light-sessions-modal-body">
        ${rows.length
          ? `<div class="sun-sessions-list${hasDeviceRows ? ' light-sessions-list-unified' : ''}">${_renderSessionRowsHTML(rows)}</div>`
          : '<div class="sun-empty"><p>No completed sessions yet.</p></div>'}
      </div>
    </div>`;
  };
  renderInto();
  // Re-render on sync pull / AI verdict completion so the modal stays
  // fresh when a paired device adds/edits/deletes sessions while it's
  // open. Listeners self-remove on modal close (overlay.remove()).
  // Greptile PR #178 P2 comment.
  const onSync = () => {
    if (!document.body.contains(overlay)) { _detach(); return; }
    renderInto();
  };
  _detach = () => {
    window.removeEventListener('labcharts-ai-verdict-updated', onSync);
    window.removeEventListener('labcharts-sync-applied', onSync);
  };
  window.addEventListener('labcharts-ai-verdict-updated', onSync);
  window.addEventListener('labcharts-sync-applied', onSync);
  const eventElement = (target) => {
    if (!target) return null;
    if (target.closest) return target;
    const parent = target.parentElement || target.parentNode;
    return parent?.closest ? parent : null;
  };
  overlay.addEventListener('click', (event) => {
    const target = eventElement(event.target);
    const row = target?.closest?.('.sun-session[role="button"]');
    if (!row || !overlay.contains(row)) return;
    if (target?.closest?.('button, a, input, select, textarea, [role="menuitem"]')) return;
    setTimeout(() => overlay.remove(), 0);
  });
  overlay.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = eventElement(event.target);
    const row = target?.closest?.('.sun-session[role="button"]');
    if (!row || !overlay.contains(row)) return;
    setTimeout(() => overlay.remove(), 0);
  });
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}
}

// Exposed for the inline "View all" button onclick.
if (typeof window !== 'undefined') {
  window._openAllSessionsModal = _openAllSessionsModal;
}

// One-line action suggestion based on the lowest-tier channel.
function renderSuggestion(totals7d) {
  // Suggestion picks the lowest-tier channel from a 7-day total, so use
  // the weekly classifier — otherwise it nudges every channel as "low"
  // because each one is being compared to a daily target.
  const tier = window.weeklyChannelTier || (() => 0);
  const order = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  const SUGGESTIONS = {
    vitamin_d:  'Get 10–15 minutes of midday sun on bare skin if your latitude allows — UVB drops sharply after 2 pm.',
    circadian:  '10 minutes of outdoor light before 9 am tends to be the highest-leverage move for your sleep.',
    nir_solar:  'Solar near-infrared is highest mid-morning to late afternoon. A walk outside catches the half of sunlight that windows block.',
    no_cv:      'Afternoon UVA-rich daylight on uncovered skin supports blood-vessel health and circulation.',
    pomc:       'A few minutes more uncovered daylight on skin engages the mood-hormone cascade.',
    violet_eye: 'Outdoor 360–400 nm light reaches your eyes only outside — even a few extra minutes helps.',
  };
  let worstKey = null, worstTier = 5;
  for (const k of order) {
    const t = tier(totals7d[k] || 0, k);
    if (t < worstTier) { worstTier = t; worstKey = k; }
  }
  if (!worstKey || worstTier >= 3) return '';  // hide once everything is at least 'good'
  return `<div class="light-suggestion">${escapeHTML(SUGGESTIONS[worstKey] || '')}</div>`;
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

function inlineJsString(value) {
  return JSON.stringify(String(value ?? '')).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function inlineHandlerCall(fnName, ...args) {
  return escapeAttr(`window.${fnName}(${args.map(inlineJsString).join(', ')})`);
}
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

function renderLensHeader(title, subtitle, actions = '') {
  return `<div class="category-header lens-page-header">
    <h2>${escapeHTML(title)}</h2>
    <p>${escapeHTML(subtitle)}</p>
    ${actions ? `<div class="dashboard-widget-inline-controls">${actions}</div>` : ''}
  </div>`;
}

const LENS_PAGE_ORDER_VERSION = 1;

function lensPageOrderStorageKey(route) {
  return profileStorageKey(state.currentProfile || 'default', `lensPageOrder-${route}-v${LENS_PAGE_ORDER_VERSION}`);
}

function getLensPageWidgetOrder(route, defaultIds) {
  try {
    const raw = JSON.parse(localStorage.getItem(lensPageOrderStorageKey(route)) || '[]');
    if (!Array.isArray(raw)) return defaultIds;
    const known = new Set(defaultIds);
    const ordered = raw.filter(id => known.has(id));
    for (const id of defaultIds) if (!ordered.includes(id)) ordered.push(id);
    return ordered;
  } catch {
    return defaultIds;
  }
}

function orderLensPageWidgets(route, widgets) {
  const ids = widgets.map(w => w.id);
  const order = getLensPageWidgetOrder(route, ids);
  const byId = new Map(widgets.map(w => [w.id, w]));
  return order.map(id => byId.get(id)).filter(Boolean);
}

function renderLensPageMoveControls(route, id, index, count) {
  if (!route || count < 2) return '';
  return `<button type="button" class="dashboard-widget-tool" ${index <= 0 ? 'disabled' : ''} onclick="${inlineHandlerCall('moveLensPageWidget', route, id, '-1')}" aria-label="Move page section up">↑</button>
    <button type="button" class="dashboard-widget-tool" ${index >= count - 1 ? 'disabled' : ''} onclick="${inlineHandlerCall('moveLensPageWidget', route, id, '1')}" aria-label="Move page section down">↓</button>`;
}

function renderLensPageWidgets(route, widgets) {
  const ordered = orderLensPageWidgets(route, widgets.filter(Boolean));
  return `<div class="dashboard-widgets lens-page-widgets" data-lens-route="${escapeAttr(route)}">
    ${ordered.map((widget, index) => renderLensWidget(
      widget.id,
      widget.title,
      widget.description,
      widget.body,
      widget.size || 'full',
      { ...(widget.opts || {}), pageRoute: route, pageIndex: index, pageCount: ordered.length }
    )).join('')}
  </div>`;
}

export function moveLensPageWidget(route, id, direction) {
  route = String(route || state.currentView || '');
  id = String(id || '');
  const dir = Number(direction);
  if (!route || !id || !Number.isFinite(dir) || dir === 0) return;
  const container = [...document.querySelectorAll('.lens-page-widgets[data-lens-route]')]
    .find(el => el.dataset.lensRoute === route);
  const ids = container
    ? [...container.querySelectorAll('.dashboard-widget[data-widget-id]')].map(el => el.dataset.widgetId).filter(Boolean)
    : getLensPageWidgetOrder(route, []);
  const index = ids.indexOf(id);
  const target = index + (dir < 0 ? -1 : 1);
  if (index < 0 || target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  localStorage.setItem(lensPageOrderStorageKey(route), JSON.stringify(ids));
  if (state.currentView === route) window.navigate?.(route);
}

function renderLensDashboardToggle(dashboardId) {
  if (!dashboardId || !getAvailableDashboardFixedWidgetIds().includes(dashboardId)) return '';
  const prefs = getDashboardWidgetPrefs();
  const isVisible = !prefs.hidden.includes(dashboardId);
  const label = isVisible ? 'Remove from Dashboard' : 'Add to Dashboard';
  const action = isVisible ? 'removeDashboardWidgetFromLens' : 'addDashboardWidgetFromLens';
  return `<button type="button" class="dashboard-widget-tool lens-widget-dashboard-toggle" onclick="${inlineHandlerCall(action, dashboardId)}">${label}</button>`;
}

function renderLensWidget(id, title, description, body, size = 'full', opts = {}) {
  const dashboardId = Object.prototype.hasOwnProperty.call(opts, 'dashboardId') ? opts.dashboardId : id;
  const dashboardToggle = renderLensDashboardToggle(dashboardId);
  const pageControls = renderLensPageMoveControls(opts.pageRoute || '', id, opts.pageIndex || 0, opts.pageCount || 0);
  const tools = [pageControls, dashboardToggle].filter(Boolean).join('');
  return `<section class="dashboard-widget dashboard-widget-${escapeAttr(size)}${body ? '' : ' is-empty'}" data-widget-id="${escapeAttr(id)}">
    <div class="dashboard-widget-chrome">
      <div class="dashboard-widget-heading">
        ${opts.source ? `<div class="dashboard-widget-source">${escapeHTML(opts.source)}</div>` : ''}
        <div class="dashboard-widget-title">${escapeHTML(title)}</div>
        <div class="dashboard-widget-description">${escapeHTML(description || '')}</div>
      </div>
      ${tools ? `<div class="dashboard-widget-tools">${tools}</div>` : ''}
    </div>
    <div class="dashboard-widget-body">${body || '<div class="dashboard-widget-empty">No data available yet.</div>'}</div>
  </section>`;
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

// ── Commit Hash ──

let _cachedCommitHash = null;

function loadCommitHash() {
  const vEl = document.getElementById('app-version-text');
  if (vEl && !vEl.textContent) vEl.textContent = window.APP_VERSION || '';
  const el = document.getElementById('app-commit-hash');
  if (!el) return;
  if (_cachedCommitHash) { el.innerHTML = `<a href="https://github.com/elkimek/get-based/commit/${_cachedCommitHash}" target="_blank" rel="noopener">${_cachedCommitHash}</a>`; return; }
  fetch('https://api.github.com/repos/elkimek/get-based/commits/main', { headers: { Accept: 'application/vnd.github.sha' } })
    .then(r => r.ok ? r.text() : Promise.reject())
    .then(sha => { _cachedCommitHash = sha.slice(0, 7); const e = document.getElementById('app-commit-hash'); if (e) e.innerHTML = `<a href="https://github.com/elkimek/get-based/commit/${_cachedCommitHash}" target="_blank" rel="noopener">${_cachedCommitHash}</a>`; })
    .catch(() => {});
}

// ── Focus Card ──

export function renderFocusCard() {
  const cacheKey = profileStorageKey(state.currentProfile, 'focusCard');
  const cached = (() => { try { return JSON.parse(localStorage.getItem(cacheKey)); } catch(e) { return null; } })();
  const fp = getFocusCardFingerprint();
  const text = (cached && cached.fingerprint === fp) ? cached.text : null;
  return `<div class="focus-card" id="focus-card">
    <div class="focus-card-icon">\uD83D\uDD2C</div>
    <div class="focus-card-body" id="focus-card-body">${text
      ? `<span class="focus-card-text">${applyInlineMarkdown(text)}</span>`
      : `<span class="focus-card-shimmer"></span>`}</div>
    <button class="focus-card-refresh" onclick="refreshFocusCard()" aria-label="Regenerate insight" title="Regenerate insight">\u21BB</button>
  </div>`;
}

export function buildFocusContext() {
  const data = getActiveData();
  if (!data.dates.length && !Object.values(data.categories).some(c => c.singleDate)) {
    return null;
  }
  const sexLabel = state.profileSex === 'female' ? 'female' : state.profileSex === 'male' ? 'male' : 'not specified';
  const age = state.profileDob ? Math.floor((new Date() - new Date(state.profileDob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = data.dates[data.dates.length - 1];
  let ctx = `Profile: ${sexLabel}${age !== null ? ', age ' + age : ''}, today ${today}, last labs ${lastDate}\n`;

  // Health goals (all priorities)
  const healthGoals = state.importedData.healthGoals || [];
  if (healthGoals.length > 0) {
    const byPriority = { major: [], mild: [], minor: [] };
    for (const g of healthGoals) (byPriority[g.severity] || byPriority.minor).push(g.text);
    const parts = [];
    for (const [sev, items] of Object.entries(byPriority)) {
      if (items.length > 0) parts.push(`${sev}: ${items.join('; ')}`);
    }
    ctx += `Goals: ${parts.join(' | ')}\n`;
  }

  // Interpretive lens
  const interpretiveLens = state.importedData.interpretiveLens || '';
  if (interpretiveLens.trim()) {
    ctx += `Lens: ${interpretiveLens.trim()}\n`;
  }

  // Medical history (own diagnoses + family history)
  const diag = state.importedData.diagnoses;
  if (hasCardContent(diag)) {
    const conditions = (diag.conditions || []).map(c => `${c.name} (${c.severity})`);
    if (conditions.length > 0) ctx += `Conditions: ${conditions.join(', ')}\n`;
    if (diag.note) ctx += `Medical notes: ${diag.note}\n`;
  }

  // Additional context notes
  const contextNotes = state.importedData.contextNotes || '';
  if (contextNotes.trim()) {
    ctx += `Notes for AI: ${contextNotes.trim()}\n`;
  }

  // Flagged/non-normal markers (latest values only), respecting AI context toggles
  const _isAICtx = (catKey) => { const g = data.categories[catKey]?.group; return !g || (window.isGroupInAIContext ? window.isGroupInAIContext(g) : true); };
  const flags = getAllFlaggedMarkers(data).filter(f => _isAICtx(f.categoryKey));
  if (flags.length > 0) {
    ctx += `Flagged (${flags.length} total${flags.length > 15 ? ', showing top 15' : ''}):\n`;
    for (const f of flags.slice(0, 15)) {
      ctx += `- ${f.name}: ${f.value} ${f.unit} (${f.status}, ref ${f.effectiveMin}\u2013${f.effectiveMax})\n`;
    }
  }

  // Supplements with temporal context (cap at 8 for focus card)
  const supps = (state.importedData.supplements || []).slice(0, 8);
  if (supps.length > 0) {
    ctx += `Supplements:\n`;
    for (const s of supps) {
      const pds = (s.periods && s.periods.length > 0) ? [...s.periods].sort((a, b) => a.start.localeCompare(b.start)) : [{ start: s.startDate, end: s.endDate }];
      const dateRange = pds.length === 1
        ? `${pds[0].start} \u2192 ${pds[0].end || 'ongoing'}`
        : pds.map(p => `${p.start}\u2192${p.end || 'now'}`).join(', ');
      let timing = '';
      const firstStart = pds[0].start;
      if (lastDate && firstStart > lastDate) timing = ' (started AFTER last labs — cannot have affected these results)';
      else if (lastDate && data.dates.length >= 2 && firstStart > data.dates[data.dates.length - 2]) timing = ' (started between last two labs)';
      // Top impact summary for AI context
      let impactNote = '';
      if (!timing && data.dates.length >= 2) {
        const impacts = window.computeAllImpacts?.(s, data);
        if (impacts && impacts.length > 0) {
          const top = impacts.slice(0, 2).filter(im => im.confidence !== 'low');
          if (top.length > 0) {
            impactNote = ' — impacts: ' + top.map(im => `${im.markerName} ${im.pctChange > 0 ? '+' : ''}${im.pctChange.toFixed(1)}%`).join(', ');
          }
        }
      }
      ctx += `- ${s.name}${s.dosage ? ' (' + s.dosage + ')' : ''} [${s.type}]: ${dateRange}${timing}${impactNote}\n`;
    }
  }

  // Also include any markers that changed significantly (latest vs previous)
  const changes = [];
  for (const [catKey, cat] of Object.entries(data.categories)) {
    if (!_isAICtx(catKey)) continue;
    for (const [key, m] of Object.entries(cat.markers)) {
      const nonNull = m.values.filter(v => v !== null);
      if (nonNull.length < 2) continue;
      const prev = nonNull[nonNull.length - 2];
      const last = nonNull[nonNull.length - 1];
      if (prev === 0) continue;
      const pct = Math.abs((last - prev) / prev * 100);
      if (pct > 20) {
        const dir = last > prev ? 'up' : 'down';
        const ref = m.refMin != null && m.refMax != null ? `, ref ${m.refMin}–${m.refMax}` : '';
        const status = getStatus(last, m.refMin, m.refMax);
        changes.push(`${m.name}: ${prev} → ${last} ${m.unit || ''} (${dir} ${pct.toFixed(0)}%${ref}, ${status})`);
      }
    }
  }
  if (changes.length > 0) {
    ctx += `Notable changes:\n${changes.slice(0, 5).map(c => '- ' + c).join('\n')}\n`;
  }

  return ctx;
}

export async function loadFocusCard(opts = {}) {
  const el = document.getElementById('focus-card-body');
  if (!el) return;
  const refreshStale = opts.refreshStale !== false;
  const cacheKey = profileStorageKey(state.currentProfile, 'focusCard');
  const cached = (() => { try { return JSON.parse(localStorage.getItem(cacheKey)); } catch(e) { return null; } })();
  const fp = getFocusCardFingerprint();
  if (cached && cached.text) {
    el.innerHTML = `<span class="focus-card-text">${applyInlineMarkdown(cached.text)}</span>`;
    // Hand-authored prefill (demo profiles only) ships without a
    // fingerprint — never auto-refresh. The manual ↻ button still
    // works because refreshFocusCard clears the cache entirely.
    // Real users always have a fingerprint set by loadFocusCard's
    // own write path below, so this branch never matches them.
    if (!cached.fingerprint) return;
    if (cached.fingerprint === fp || !hasAIProvider()) return;
    if (!refreshStale) return;
  }
  if (!hasAIProvider()) {
    if (!cached?.text) el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">Enable AI to generate insights</span>`;
    return;
  }
  el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">🔍 Looking into your results\u2026</span>`;
  try {
    let ctx = buildFocusContext();
    if (!ctx) {
      el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">No insight available</span>`;
      return;
    }
    if (hasLens()) {
      const data = getActiveData();
      const goals = (state.importedData.healthGoals || []).map(g => g.text).slice(0, 3).join('; ');
      const flags = getAllFlaggedMarkers(data).slice(0, 5).map(f => f.name).join(', ');
      const hint = [goals && 'Goals: ' + goals, flags && 'Flagged: ' + flags].filter(Boolean).join(' | ') || 'prioritize and summarize lab findings';
      const lensResult = await queryLens(hint);
      if (lensResult) ctx = injectLensChunks(ctx, lensResult);
    }
    const focusSystem = `You summarize blood work for a health dashboard card. Write 3-5 sentences, no more. Rules:
- Start with the single most critical finding and why it matters for this person's goals/conditions
- Then mention 1-2 secondary findings worth watching
- End with one concrete next step (retest, lifestyle change, discuss with provider)
- Connect findings to each other when relevant (e.g. liver markers + hormones)
- Only flag values genuinely outside reference range
- Never recommend specific supplements or products
- Only reference data provided below — never infer or assume
- Never attribute changes to supplements started after the last lab date
- CRITICAL: Output ONLY the insight text. No thinking, no reasoning, no "Let me analyze", no numbered analysis steps, no preamble. Start directly with your finding.`;

    // Typewriter: trickle streamed text for smooth appearance
    const textEl = document.createElement('span');
    textEl.className = 'focus-card-text';
    let target = '', displayed = 0, timer = null;
    function tick() {
      if (displayed >= target.length) { timer = null; return; }
      const batch = Math.max(1, Math.ceil((target.length - displayed) * 0.3));
      displayed = Math.min(displayed + batch, target.length);
      textEl.textContent = target.slice(0, displayed);
      timer = setTimeout(tick, 16);
    }

    const { text: fullText, usage } = await callClaudeAPI({
      system: focusSystem,
      messages: [{ role: 'user', content: ctx }],
      maxTokens: 500,
      onStream(text) {
        if (text.length < target.length) displayed = 0; // reset typewriter if stream cleared reasoning
        target = text;
        if (!textEl.parentNode) { el.innerHTML = ''; el.appendChild(textEl); }
        if (!timer) tick();
      }
    });
    if (timer) { clearTimeout(timer); timer = null; }

    if (usage) {
      trackUsage(getAIProvider(), getActiveModelId(), usage.inputTokens || 0, usage.outputTokens || 0);
    }
    let trimmed = (fullText || '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .trim();
    // Strip thinking-out-loud preamble — remove lines starting with reasoning patterns
    const lines = trimmed.split('\n');
    const thinkingPattern = /^(Let me |I need to |I should |I'll |Key findings|The user |Looking at the|Now |First,|So |OK |Alright|\d+\.\s+\w+:)/i;
    let startIdx = 0;
    while (startIdx < lines.length && (thinkingPattern.test(lines[startIdx].trim()) || lines[startIdx].trim() === '')) startIdx++;
    if (startIdx > 0 && startIdx < lines.length) trimmed = lines.slice(startIdx).join('\n').trim();
    // Safety cap — truncate at last sentence boundary within 1500 chars
    if (trimmed.length > 1500) { const cut = trimmed.slice(0, 1500).lastIndexOf('.'); if (cut > 100) trimmed = trimmed.slice(0, cut + 1); }
    if (trimmed) {
      localStorage.setItem(cacheKey, JSON.stringify({ fingerprint: fp, text: trimmed }));
      el.innerHTML = `<span class="focus-card-text">${applyInlineMarkdown(trimmed)}</span>`;
    } else {
      el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">No insight available</span>`;
    }
  } catch(e) {
    el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">Could not load insight</span>`;
  }
}

export function refreshFocusCard() {
  const cacheKey = profileStorageKey(state.currentProfile, 'focusCard');
  localStorage.removeItem(cacheKey);
  loadFocusCard();
}

// ── Chart Card Recommendation Links ──
async function loadChartCardRecs() {
  if (!window.isProductRecsEnabled || !window.isProductRecsEnabled()) return;
  if (!window.loadCatalog) return;
  const catalog = await window.loadCatalog();
  if (!catalog || !catalog.slots) return;

  const els = document.querySelectorAll('[id^="chart-rec-"]');
  for (const el of els) {
    if (el.children.length > 0) continue;
    const id = el.id.replace('chart-rec-', '');
    const slotKey = id.replace('_', '.');
    const slot = catalog.slots[slotKey];
    if (!slot) continue;
    const badge = document.createElement('span');
    badge.className = 'ctx-tips-badge';
    badge.textContent = 'Tips';
    badge.title = 'What can help';
    badge.onclick = e => {
      e.stopPropagation();
      showDetailModal(id, { scrollToRec: true });
    };
    el.appendChild(badge);
  }
  // Reorder chart cards: those with tips badges first (within each grid)
  for (const grid of document.querySelectorAll('.charts-grid')) {
    const cards = Array.from(grid.querySelectorAll('.chart-card'));
    const withRec = cards.filter(c => c.querySelector('.ctx-tips-badge'));
    const without = cards.filter(c => !c.querySelector('.ctx-tips-badge'));
    for (const c of [...withRec, ...without]) grid.appendChild(c);
  }
  // One-time nudge (must query after badges are added)
  const recLinks = document.querySelectorAll('[id^="chart-rec-"] .ctx-tips-badge');
  const modalOpen = !!document.querySelector('.modal-overlay.show');
  if (recLinks.length > 0 && !modalOpen && !localStorage.getItem('labcharts-rec-nudge-seen')) {
    localStorage.setItem('labcharts-rec-nudge-seen', '1');
    showNotification(`${recLinks.length} marker${recLinks.length > 1 ? 's have' : ' has'} actionable tips \u2014 look for the Tips badge on your chart cards`, 'info');
  }
}

// ── Onboarding ──

export function renderOnboardingBanner() {
  const onboarded = localStorage.getItem(profileStorageKey(state.currentProfile, 'onboarded'));
  if (onboarded) return '';
  if (state.profileSex && state.profileDob) {
    localStorage.setItem(profileStorageKey(state.currentProfile, 'onboarded'), 'profile-set');
    return '';
  }
  return `<div class="onboarding-banner" id="onboarding-banner">
    <div class="onboarding-steps">
      <span class="onboarding-step completed">\u2713</span>
      <span class="onboarding-step-line"></span>
      <span class="onboarding-step active">2</span>
      <span class="onboarding-step-line"></span>
      <span class="onboarding-step">3</span>
    </div>
    <div class="onboarding-step-labels">
      <span class="onboarding-step-label">Import</span>
      <span class="onboarding-step-label active">Profile</span>
      <span class="onboarding-step-label">Ready</span>
    </div>
    <h3 class="onboarding-title">Set up your profile</h3>
    <p class="onboarding-subtitle">Sex and date of birth pick the right reference ranges for your results.</p>
    <div class="onboarding-form">
      <div class="onboarding-field">
        <label class="onboarding-label">Sex</label>
        <div class="onboarding-sex-toggle">
          <button class="onboarding-sex-btn${state.profileSex === 'male' ? ' active' : ''}" onclick="completeOnboardingSex('male')">Male</button>
          <button class="onboarding-sex-btn${state.profileSex === 'female' ? ' active' : ''}" onclick="completeOnboardingSex('female')">Female</button>
        </div>
      </div>
      <div class="onboarding-field">
        <label class="onboarding-label">Date of Birth</label>
        <input type="date" class="onboarding-dob-input" id="onboarding-dob" value="${state.profileDob || ''}" />
      </div>
      <div class="onboarding-actions">
        <button class="onboarding-save-btn" onclick="completeOnboardingProfile()">Save & Continue</button>
        <button class="onboarding-skip-btn" onclick="dismissOnboarding()">Skip for now</button>
      </div>
    </div>
  </div>`;
}

export function completeOnboardingSex(sex) {
  document.querySelectorAll('.onboarding-sex-btn').forEach(b => b.classList.remove('active'));
  const btns = document.querySelectorAll('.onboarding-sex-btn');
  if (sex === 'male' && btns[0]) btns[0].classList.add('active');
  if (sex === 'female' && btns[1]) btns[1].classList.add('active');
}

export function completeOnboardingProfile() {
  const activeSexBtn = document.querySelector('.onboarding-sex-btn.active');
  const sex = activeSexBtn ? (activeSexBtn.textContent.trim().toLowerCase()) : null;
  const dobInput = document.getElementById('onboarding-dob');
  const dob = dobInput ? dobInput.value : null;
  localStorage.setItem(profileStorageKey(state.currentProfile, 'onboarded'), 'profile-set');
  if (sex) { state.profileSex = sex; setProfileSex(state.currentProfile, sex); }
  if (dob) { state.profileDob = dob; setProfileDob(state.currentProfile, dob); }
  const data = getActiveData();
  window.buildSidebar(data);
  updateHeaderDates(data);
  navigate('dashboard', data);
  showNotification("Profile set up — you're all set!", 'success');
}

export function dismissOnboarding() {
  localStorage.setItem(profileStorageKey(state.currentProfile, 'onboarded'), 'dismissed');
  const banner = document.getElementById('onboarding-banner');
  if (banner) {
    banner.style.transition = 'opacity 0.3s, transform 0.3s';
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(-10px)';
    setTimeout(() => banner.remove(), 300);
  }
  showNotification('You can set sex and DOB anytime in Settings.', 'info');
}

// Lightweight reminder shown to users who skipped the AI provider setup
// during onboarding. Without it, "Skip for now" leads to a chat panel
// with a disabled input and no obvious way back into setup. Renders
// only when: provider was explicitly skipped, no AI is currently
// configured, and the user hasn't dismissed this banner. Dismissal is
// per-profile (so a fresh profile still sees it).
export function renderAIConnectionReminder() {
  if (hasAIProvider()) return '';
  const skipKey = `labcharts-onboard-provider-skipped-${state.currentProfile}`;
  const skipped = localStorage.getItem(skipKey);
  if (!skipped) return '';
  const dismissKey = profileStorageKey(state.currentProfile, 'ai-reminder-dismissed');
  if (localStorage.getItem(dismissKey)) return '';
  return `<div class="ai-reminder-banner" id="ai-reminder-banner" role="region" aria-label="Connect AI to unlock lab analysis">
    <span class="ai-reminder-icon" aria-hidden="true">&#129504;</span>
    <span class="ai-reminder-body">
      <strong>Connect AI to unlock lab analysis</strong>
      <span>PDF import, trend insights, and chat all need an AI provider. About 30 seconds.</span>
    </span>
    <button type="button" class="ai-reminder-cta" onclick="window.openChatProviderQuiz()">Connect now</button>
    <button type="button" class="ai-reminder-dismiss" onclick="window.dismissAIReminder()" aria-label="Dismiss">&times;</button>
  </div>`;
}

export function dismissAIReminder() {
  const dismissKey = profileStorageKey(state.currentProfile, 'ai-reminder-dismissed');
  localStorage.setItem(dismissKey, '1');
  const banner = document.getElementById('ai-reminder-banner');
  if (banner) {
    banner.style.transition = 'opacity 0.3s, transform 0.3s';
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(-10px)';
    setTimeout(() => banner.remove(), 300);
  }
}

// Focus mode for onboarding — dims everything on the empty dashboard
// except the section the user is meant to interact with, while keeping
// the chat panel open as a guide. Mode is 'cards' (highlight lifestyle
// cards) or 'import' (highlight PDF drop zone), or null to clear.
//
// Force chat out of fullscreen so the highlighted section is visible
// alongside the chat panel. Scroll the target into view so the user
// doesn't have to hunt for it.
export function setOnboardingFocus(mode) {
  const body = document.body;
  body.classList.remove('cards-focus', 'import-focus');
  if (!mode) return;
  if (mode === 'cards') {
    body.classList.add('cards-focus');
  } else if (mode === 'import') {
    body.classList.add('import-focus');
  }
  if (body.classList.contains('chat-fullscreen')) {
    body.classList.remove('chat-fullscreen');
    localStorage.setItem('labcharts-chat-fullscreen', 'false');
  }
  if (mode === 'cards') {
    const cards = document.querySelector('.profile-context-cards');
    if (cards) {
      setTimeout(() => cards.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } else if (window.openChatPanel) {
      body.classList.remove('cards-focus');
      const prefill = hasAIProvider()
        ? 'Help me collect the health context you need before I import labs. Ask me one question at a time.'
        : undefined;
      window.openChatPanel(prefill);
    }
  } else if (mode === 'import') {
    setTimeout(() => document.querySelector('.welcome-direct-import-btn, .welcome-primary-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }
}

// Open the chat provider quiz when the user explicitly asks for AI setup.
// Clear the skipped flag so the chat renders that setup branch, then open
// the chat panel. Also clear any
// sub-branch the user landed on before skipping — a user clicking
// "Connect now" wants to re-evaluate the four options, not get
// dropped back into the specific provider they previously bounced
// off of (mirrors what skipProviderSetup does on entry).
export function openChatProviderQuiz() {
  const skipKey = `labcharts-onboard-provider-skipped-${state.currentProfile}`;
  localStorage.removeItem(skipKey);
  sessionStorage.setItem(`chat-onboard-provider-requested-${state.currentProfile}`, '1');
  sessionStorage.removeItem(`chat-onboard-provider-branch-${state.currentProfile}`);
  if (window.openChatPanel) window.openChatPanel();
  else if (window.toggleChatPanel) window.toggleChatPanel();
  if (window.renderChatMessages) window.renderChatMessages();
}

// ═══════════════════════════════════════════════
// CATEGORY VIEWS
// ═══════════════════════════════════════════════

const CATEGORY_GLYPH_CODES = Object.freeze({
  biochemistry: 'BC',
  hormones: 'HR',
  electrolytes: 'EM',
  lipids: 'LP',
  iron: 'FE',
  proteins: 'IN',
  thyroid: 'TH',
  vitamins: 'VT',
  diabetes: 'GL',
  tumorMarkers: 'TM',
  coagulation: 'CG',
  hematology: 'CB',
  wbcDifferential: 'WB',
  bone: 'BN',
  urinalysis: 'UR',
  bodyComposition: 'BD',
  boneDensity: 'DX',
  calculatedRatios: 'RT',
});

function _categoryGlyphCode(categoryKey, label = '') {
  if (CATEGORY_GLYPH_CODES[categoryKey]) return CATEGORY_GLYPH_CODES[categoryKey];
  const words = String(label || categoryKey || '')
    .replace(/&/g, ' ')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const compact = String(label || categoryKey || 'M').replace(/[^A-Za-z0-9]+/g, '');
  return (compact.slice(0, 2) || 'M').toUpperCase();
}

function renderCategoryGlyph(categoryKey, label, { large = false } = {}) {
  const code = _categoryGlyphCode(categoryKey, label);
  return `<span class="category-glyph${large ? ' category-glyph-large' : ''}" aria-hidden="true">${escapeHTML(code)}</span>`;
}

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
    // Sort: markers with catalog slots first, then by status (out-of-range before normal)
    const catalog = window._cachedCatalog;
    const hasSlot = (k) => catalog?.slots?.[categoryKey + '.' + k] ? 0 : 1;
    const statusOrder = { high: 0, low: 0, normal: 1, missing: 2 };
    withData.sort(([ka, a], [kb, b]) => {
      const slotDiff = hasSlot(ka) - hasSlot(kb);
      if (slotDiff !== 0) return slotDiff;
      const ai = getLatestValueIndex(a.values), bi = getLatestValueIndex(b.values);
      const ar = ai !== -1 ? getEffectiveRangeForDate(a, ai) : { min: null, max: null };
      const br = bi !== -1 ? getEffectiveRangeForDate(b, bi) : { min: null, max: null };
      const as = ai !== -1 ? getStatus(a.values[ai], ar.min, ar.max) : 'missing';
      const bs = bi !== -1 ? getStatus(b.values[bi], br.min, br.max) : 'missing';
      return (statusOrder[as] ?? 2) - (statusOrder[bs] ?? 2);
    });
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

export async function renameCategory(categoryKey) {
  const data = getActiveData();
  const cat = data.categories[categoryKey];
  if (!cat) return;
  const currentLabel = cat.label;
  const newLabel = await window.showPromptDialog('Rename category:', {
    defaultValue: currentLabel,
    okLabel: 'Rename',
  });
  if (!newLabel || newLabel === currentLabel) return;
  const trimmed = newLabel.trim();
  // Store label override
  if (!state.importedData.categoryLabels) state.importedData.categoryLabels = {};
  state.importedData.categoryLabels[categoryKey] = trimmed;
  // Also update custom marker defs so sidebar picks it up
  const cms = state.importedData.customMarkers || {};
  for (const [k, def] of Object.entries(cms)) {
    if (k.startsWith(categoryKey + '.')) def.categoryLabel = trimmed;
  }
  saveImportedData();
  window.buildSidebar();
  navigate(categoryKey);
  showNotification(`Category renamed to "${trimmed}"`, 'info');
}

export async function renameMarker(id) {
  const data = getActiveData();
  const idx = id.indexOf('_');
  const catKey = id.slice(0, idx), mKey = id.slice(idx + 1);
  const marker = data.categories[catKey]?.markers[mKey];
  if (!marker) return;
  const newName = await window.showPromptDialog('Rename marker:', {
    defaultValue: marker.name,
    okLabel: 'Rename',
  });
  if (!newName || newName === marker.name) return;
  const trimmed = newName.trim();
  const dotKey = catKey + '.' + mKey;
  if (!state.importedData.markerLabels) state.importedData.markerLabels = {};
  state.importedData.markerLabels[dotKey] = trimmed;
  saveImportedData();
  showDetailModal(id);
  showNotification(`Marker renamed to "${trimmed}"`, 'info');
}

export function revertMarkerName(id) {
  const idx = id.indexOf('_');
  const dotKey = id.slice(0, idx) + '.' + id.slice(idx + 1);
  if (!state.importedData.markerLabels?.[dotKey]) return;
  delete state.importedData.markerLabels[dotKey];
  if (Object.keys(state.importedData.markerLabels).length === 0) delete state.importedData.markerLabels;
  saveImportedData();
  showDetailModal(id);
  showNotification('Marker name reverted', 'info');
}

const EMOJI_CATEGORIES = [
  { id: 'science', icon: '\uD83E\uDDEA', label: 'Science & Medical', emojis: ['\uD83E\uDDEA','\uD83E\uDDEC','\uD83E\uDD2C','\uD83D\uDD2C','\u2697\uFE0F','\uD83D\uDC89','\uD83D\uDC8A','\u2695\uFE0F','\uD83E\uDE7A','\uD83E\uDDB7','\uD83E\uDDB4','\uD83E\uDDE0','\uD83E\uDEC0','\uD83E\uDEC1','\uD83D\uDD2D','\uD83E\uDDA0','\uD83E\uDE78','\uD83E\uDDEB'] },
  { id: 'body', icon: '\uD83D\uDCAA', label: 'Body & Lifestyle', emojis: ['\uD83D\uDCAA','\uD83D\uDC41\uFE0F','\uD83D\uDC42','\uD83D\uDC45','\u2764\uFE0F','\uD83E\uDDE1','\uD83E\uDD71','\uD83D\uDE34','\uD83C\uDFC3','\uD83E\uDDD8','\uD83C\uDFCB\uFE0F','\uD83D\uDEB4','\uD83C\uDFCA','\uD83D\uDE4F','\uD83E\uDDCD','\uD83E\uDEC2'] },
  { id: 'food', icon: '\uD83C\uDF4E', label: 'Food & Nutrition', emojis: ['\uD83C\uDF4E','\uD83C\uDF4A','\uD83C\uDF4B','\uD83C\uDF47','\uD83E\uDD51','\uD83E\uDD66','\uD83C\uDF45','\uD83E\uDD55','\uD83E\uDD6C','\uD83C\uDF57','\uD83E\uDD5A','\uD83D\uDC1F','\uD83E\uDD5B','\uD83E\uDD57','\u2615','\uD83C\uDF75','\uD83E\uDD64','\uD83D\uDCA7'] },
  { id: 'nature', icon: '\uD83C\uDF3F', label: 'Nature & Environment', emojis: ['\uD83C\uDF3F','\uD83C\uDF31','\uD83C\uDF3B','\uD83C\uDF3E','\uD83C\uDF43','\uD83C\uDF40','\u2600\uFE0F','\uD83C\uDF19','\u2B50','\uD83D\uDD25','\uD83C\uDF0A','\u26A1','\uD83C\uDF08','\u2744\uFE0F','\uD83C\uDF0D','\uD83D\uDCA8','\uD83C\uDF32','\uD83E\uDEB5'] },
  { id: 'symbols', icon: '\uD83D\uDD36', label: 'Symbols & Colors', emojis: ['\uD83D\uDD36','\uD83D\uDD35','\uD83D\uDFE2','\uD83D\uDFE1','\uD83D\uDFE3','\uD83D\uDD34','\u26AA','\u26AB','\uD83D\uDFE0','\uD83D\uDFE4','\u2728','\uD83D\uDCAB','\u267B\uFE0F','\u269B\uFE0F','\u2699\uFE0F','\u267E\uFE0F','\u2B55','\uD83D\uDD16'] },
];

function showEmojiPicker(anchorEl, callback, opts = {}) {
  // Remove existing picker
  document.querySelector('.emoji-picker')?.remove();
  const picker = document.createElement('div');
  picker.className = 'emoji-picker';

  // Position near anchor
  const rect = anchorEl.getBoundingClientRect();
  picker.style.left = Math.min(rect.left, window.innerWidth - 340) + 'px';
  picker.style.top = Math.min(rect.bottom + 4, window.innerHeight - 420) + 'px';

  let activeCat = null;
  let searchTerm = '';

  function render() {
    let html = `<div class="emoji-picker-search"><input type="text" placeholder="Search emoji..." value="${escapeHTML(searchTerm)}"></div>`;
    html += `<div class="emoji-picker-cats">`;
    if (opts.showReset) {
      html += `<button data-cat="__reset" title="Reset to default" style="font-size:12px;font-family:inherit">\u00d7</button>`;
    }
    for (const cat of EMOJI_CATEGORIES) {
      html += `<button data-cat="${cat.id}" title="${cat.label}" class="${activeCat === cat.id ? 'active' : ''}">${cat.icon}</button>`;
    }
    html += `</div><div class="emoji-picker-grid">`;

    const items = [];
    for (const cat of EMOJI_CATEGORIES) {
      if (activeCat && activeCat !== cat.id) continue;
      if (searchTerm && !cat.label.toLowerCase().includes(searchTerm.toLowerCase())) continue;
      items.push(`<div class="emoji-picker-label">${cat.label}</div>`);
      for (const e of cat.emojis) {
        items.push(`<span data-emoji="${e}">${e}</span>`);
      }
    }
    if (items.length === 0) items.push(`<div class="emoji-picker-label">No results</div>`);
    html += items.join('') + `</div>`;
    picker.innerHTML = html;

    // Bind events
    const input = picker.querySelector('input');
    input.addEventListener('input', e => { searchTerm = e.target.value; activeCat = null; render(); const el = picker.querySelector('input'); el.focus(); el.setSelectionRange(searchTerm.length, searchTerm.length); });
    picker.querySelectorAll('.emoji-picker-cats button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.cat === '__reset') { callback(null); picker.remove(); cleanup(); return; }
        activeCat = activeCat === btn.dataset.cat ? null : btn.dataset.cat; searchTerm = ''; render();
      });
    });
    picker.querySelectorAll('.emoji-picker-grid span[data-emoji]').forEach(span => {
      span.addEventListener('click', () => { callback(span.dataset.emoji); picker.remove(); cleanup(); });
    });
  }

  render();
  document.body.appendChild(picker);
  setTimeout(() => picker.querySelector('input')?.focus(), 50);

  // Close on outside click
  function onClickOutside(e) { if (!picker.contains(e.target) && e.target !== anchorEl) { picker.remove(); cleanup(); } }
  function onEsc(e) { if (e.key === 'Escape') { picker.remove(); cleanup(); } }
  function cleanup() { document.removeEventListener('mousedown', onClickOutside); document.removeEventListener('keydown', onEsc); }
  setTimeout(() => { document.addEventListener('mousedown', onClickOutside); document.addEventListener('keydown', onEsc); }, 10);
}

export function changeCategoryIcon(categoryKey) {
  const data = getActiveData();
  const cat = data.categories[categoryKey];
  if (!cat) return;
  const anchor = event?.target || document.querySelector('.category-header h2 span');
  const hasOverride = categoryKey in (state.importedData?.categoryIcons || {});
  showEmojiPicker(anchor, (emoji) => {
    if (emoji === null) {
      // Reset to default
      if (state.importedData.categoryIcons) delete state.importedData.categoryIcons[categoryKey];
    } else {
      if (!state.importedData.categoryIcons) state.importedData.categoryIcons = {};
      state.importedData.categoryIcons[categoryKey] = emoji;
    }
    const cms = state.importedData.customMarkers || {};
    for (const [k, def] of Object.entries(cms)) {
      if (k.startsWith(categoryKey + '.')) {
        if (emoji === null) delete def.icon;
        else def.icon = emoji;
      }
    }
    saveImportedData();
    window.buildSidebar();
    navigate(categoryKey);
    showNotification(emoji === null ? 'Icon reset to default' : 'Icon updated', 'info');
  }, { showReset: !!hasOverride });
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

export function renderChartCard(id, marker, dateLabels) {
  // id is interpolated into onclick handlers and DOM ids below. Single
  // chokepoint guard for every caller (dashboard, showCategory, switchView).
  if (!safeMarkerId(id)) return '';
  state.markerRegistry[id] = marker;
  const latestIdx = getLatestValueIndex(marker.values);
  const latestVal = latestIdx !== -1 ? marker.values[latestIdx] : null;
  const lr = getEffectiveRangeForDate(marker, latestIdx);
  const status = latestVal !== null ? getStatus(latestVal, lr.min, lr.max) : "missing";
  const statusLabel = status === "normal" ? "Normal" : status === "high" ? "High" : status === "low" ? "Low" : "N/A";
  const sIcon = statusIcon(status);

  const trend = getTrend(marker.values, lr.min, lr.max);
  const trendBadge = trend.cls !== 'trend-stable' || trend.arrow !== '\u2014' ? `<span class="chart-card-trend ${trend.cls}">${trend.arrow}</span>` : '';
  const markerName = marker.name || '';
  const labels = marker.singlePoint ? [marker.singleDateLabel || "N/A"] : dateLabels;
  const fmtRange = (min, max) => `${min != null ? formatValue(min) : '–'} \u2013 ${max != null ? formatValue(max) : '–'}`;
  const effectiveRange = getEffectiveRange(marker);
  const rangeLabel = state.rangeMode === 'optimal' && (marker.optimalMin != null || marker.optimalMax != null) ? 'Optimal' : 'Reference';
  const rangeSummary = effectiveRange.min != null || effectiveRange.max != null
    ? `${rangeLabel}: ${fmtRange(effectiveRange.min, effectiveRange.max)}`
    : 'No range set';
  const latestDateLabel = latestIdx !== -1 ? (labels[latestIdx] || 'Latest') : 'No value';
  const latestDisplay = latestVal !== null ? formatValue(latestVal) : '\u2014';
  const latestUnit = marker.unit || '';
  const latestMeta = latestVal !== null
    ? `${latestDateLabel}${latestUnit ? ' · ' + latestUnit : ''}`
    : 'Add a value to start the trend';

  let html = `<div class="chart-card chart-card-${status}" role="button" tabindex="0" aria-label="${escapeAttr(markerName + ' - ' + statusLabel)}" onclick="showDetailModal('${id}')">
    <div class="chart-card-header">
      <div class="chart-card-title-block">
        <div class="chart-card-title" title="${escapeAttr(markerName)}">
          <span class="chart-card-title-text">${escapeHTML(markerName)}</span>
          <span class="chart-card-tips-host" id="chart-rec-${id}"></span>
        </div>
        <div class="chart-card-meta">
          <span class="chart-card-unit">${escapeHTML(latestUnit || 'unitless')}</span>
          <span class="chart-card-range">${escapeHTML(rangeSummary)}${latestUnit ? ` ${escapeHTML(latestUnit)}` : ''}</span>
        </div>
      </div>
      <div class="chart-card-state"><span class="chart-card-status status-${status}">${sIcon ? sIcon + ' ' : ''}${statusLabel}</span>${trendBadge}</div>
    </div>
    <div class="chart-card-snapshot">
      <div>
        <span class="chart-card-snapshot-label">Latest</span>
        <strong class="chart-card-latest-value val-${status}">${escapeHTML(latestDisplay)}</strong>
        <span class="chart-card-snapshot-meta">${escapeHTML(latestMeta)}</span>
      </div>
      <div class="chart-card-snapshot-side">
        <span>${escapeHTML(rangeLabel)}</span>
        <strong>${escapeHTML(fmtRange(effectiveRange.min, effectiveRange.max))}</strong>
      </div>
    </div>
    <div class="chart-container"><canvas id="chart-${id}"></canvas></div>
    <div class="chart-values">`;
  // Trim leading/trailing nulls to match chart trimming, then show the most
  // recent points only so category cards stay scannable.
  let valStart = 0, valEnd = marker.values.length - 1;
  if (!marker.singlePoint && marker.values.length > 1) {
    valStart = marker.values.findIndex(v => v !== null);
    if (valStart < 0) valStart = 0;
    while (valEnd > valStart && marker.values[valEnd] === null) valEnd--;
  }
  const visibleValueIndexes = [];
  for (let i = valStart; i <= valEnd; i++) visibleValueIndexes.push(i);
  const compactValueIndexes = visibleValueIndexes.length > 4 ? visibleValueIndexes.slice(-4) : visibleValueIndexes;
  for (const i of compactValueIndexes) {
    const v = marker.values[i];
    const ri = getEffectiveRangeForDate(marker, i);
    const s = v !== null ? getStatus(v, ri.min, ri.max) : "missing";
    html += `<div class="chart-value-item"><div class="chart-value-date">${labels[i] || ''}</div>
      <div class="chart-value-num val-${s}">${v !== null ? formatValue(v) : "\u2014"}</div></div>`;
  }
  let rangeHtml = '';
  if (state.rangeMode === 'both' && (marker.optimalMin != null || marker.optimalMax != null) && (marker.refMin != null || marker.refMax != null)) {
    rangeHtml = `<div class="chart-ref-range">Ref: ${fmtRange(marker.refMin, marker.refMax)} · <span style="color:var(--green)">Optimal: ${fmtRange(marker.optimalMin, marker.optimalMax)}</span> ${escapeHTML(marker.unit)}</div>`;
  } else {
    const r = getEffectiveRange(marker);
    const rangeLabel = state.rangeMode === 'optimal' && (marker.optimalMin != null || marker.optimalMax != null) ? 'Optimal' : 'Reference';
    rangeHtml = r.min != null || r.max != null ? `<div class="chart-ref-range">${rangeLabel}: ${fmtRange(r.min, r.max)} ${escapeHTML(marker.unit)}</div>` : '';
  }
  html += `</div>${rangeHtml}</div>`;
  return html;
}

function renderTableColgroup(cols) {
  return `<colgroup>${cols.map(cls => `<col class="${escapeAttr(cls)}">`).join('')}</colgroup>`;
}

function renderScrollableTableShell(kind, wrapperClass, tableClass, colgroup, headHtml, bodyHtml, minWidth) {
  const shellClass = `gb-table-shell gb-table-shell-${kind}`;
  const syncScroll = "this.parentElement&&this.parentElement.style.setProperty('--gb-table-scroll-x',this.scrollLeft+'px')";
  return `<div class="${shellClass}" style="--gb-table-min-width:${Math.max(660, Math.round(minWidth))}px">
    <div class="gb-table-sticky-head" aria-hidden="true">
      <div class="gb-table-sticky-head-scroll">
        <table class="${tableClass}">${colgroup}<thead>${headHtml}</thead></table>
      </div>
    </div>
    <div class="${wrapperClass}" onscroll="${syncScroll}">
      <table class="${tableClass}">${colgroup}<thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>
    </div>
  </div>`;
}

configureCompareCorrelationViews({
  renderTableColgroup,
  renderScrollableTableShell,
  renderCategoryGlyph,
});

export function renderTableView(cat, dateLabels, categoryKey, dates) {
  const labels = cat.singleDate ? [cat.singleDateLabel || "N/A"] : dateLabels;
  // Hide markers with no values at all — sidebar still lists them with 0 count.
  const markerEntries = Object.entries(cat.markers).filter(([, m]) =>
    m.values && m.values.some(v => v !== null)
  );
  if (markerEntries.length === 0) {
    return `<div class="data-table-wrapper"><div style="padding:32px;text-align:center;color:var(--text-muted)">No data yet for this category. Use the sidebar to add a value or import a PDF.</div></div>`;
  }
  const colgroup = renderTableColgroup([
    'gb-col-marker',
    'gb-col-unit',
    'gb-col-reference',
    ...labels.map(() => 'gb-col-date'),
    'gb-col-trend',
    'gb-col-range',
  ]);
  let headHtml = `<tr><th>Biomarker</th><th>Unit</th><th>Reference</th>`;
  // Column headers — labels are already HTML-escaped by the showCategory
  // call site (renderTableView's contract: dateLabels passed in are safe).
  // Pre-escape lives at the boundary so CodeQL's taint analysis sees the
  // sanitizer at the call site (it doesn't trace across function calls).
  for (const d of labels) headHtml += `<th>${d}</th>`;
  headHtml += `<th>Trend</th><th>Range</th></tr>`;
  let bodyHtml = '';
  for (const [key, marker] of markerEntries) {
    const id = categoryKey ? categoryKey + '_' + key : '';
    const r = getEffectiveRange(marker);
    let refCell = r.min != null && r.max != null ? `${formatValue(r.min)} \u2013 ${formatValue(r.max)}` : '\u2014';
    if (state.rangeMode === 'both') {
      if (marker.optimalMin != null || marker.optimalMax != null) refCell = `${formatValue(marker.refMin)} \u2013 ${formatValue(marker.refMax)}<br><span style="color:var(--green);font-size:11px">opt: ${formatValue(marker.optimalMin)} \u2013 ${formatValue(marker.optimalMax)}</span>`;
    }
    const rowClick = id ? ` onclick="showDetailModal('${id}')" style="cursor:pointer"` : '';
    bodyHtml += `<tr${rowClick}><td class="marker-name">${escapeHTML(marker.name)}</td>
      <td class="unit-col">${escapeHTML(marker.unit)}</td>
      <td class="ref-col">${refCell}</td>`;
    for (let i = 0; i < marker.values.length; i++) {
      const v = marker.values[i];
      const ri = getEffectiveRangeForDate(marker, i);
      const s = v !== null ? getStatus(v, ri.min, ri.max) : "missing";
      // Empty cells: click \u2192 add a value for THIS column's date (not today).
      // Skip for singleDate categories where the "date" is a synthetic label.
      const colDate = (dates && !cat.singleDate) ? dates[i] : null;
      // JSON.stringify + escapeHTML so the interpolated values survive
      // the HTML-attribute → JS-string-literal round-trip even if they
      // ever contain quotes or HTML meta-chars (CodeQL js/xss-through-dom).
      // Same trick as filterConditionSuggestions for apostrophe-bearing
      // condition names — defense in depth on top of the marker-key /
      // ISO-date validators upstream.
      const emptyClick = (v === null && id && colDate)
        ? ` onclick="event.stopPropagation();openManualEntryForm(${escapeHTML(JSON.stringify(id))},${escapeHTML(JSON.stringify(colDate))})" style="cursor:cell" title="Add value for ${dateLabels[i] || escapeHTML(colDate)}"`
        : '';
      bodyHtml += `<td class="value-cell val-${s}"${emptyClick}>${v !== null ? formatValue(v) : "\u2014"}</td>`;
    }
    const li = getLatestValueIndex(marker.values);
    const trendRange = li !== -1 ? getEffectiveRangeForDate(marker, li) : r;
    const trend = getTrend(marker.values, trendRange.min, trendRange.max);
    bodyHtml += `<td><span class="trend-arrow ${trend.cls}">${trend.arrow}</span></td>`;
    if (li !== -1 && r.min != null && r.max != null) {
      const lr = getEffectiveRangeForDate(marker, li);
      const pos = Math.max(0, Math.min(100, getRangePosition(marker.values[li], lr.min, lr.max)));
      const s = getStatus(marker.values[li], lr.min, lr.max);
      bodyHtml += `<td><div class="range-bar"><div class="range-bar-fill" style="left:0;width:100%"></div>
        <div class="range-bar-marker marker-${s}" style="left:${pos}%"></div></div></td>`;
    } else bodyHtml += `<td>\u2014</td>`;
    bodyHtml += `</tr>`;
  }
  const minWidth = 180 + 86 + 128 + labels.length * 104 + 78 + 112;
  return renderScrollableTableShell('data', 'data-table-wrapper', 'data-table', colgroup, headHtml, bodyHtml, minWidth);
}

export function renderHeatmapView(cat, dateLabels, dates, categoryKey) {
  const labels = cat.singleDate ? [cat.singleDateLabel || "N/A"] : dateLabels;
  const markerEntries = Object.entries(cat.markers).filter(([, m]) =>
    m.values && m.values.some(v => v !== null)
  );
  if (markerEntries.length === 0) {
    return `<div class="heatmap-wrapper"><div style="padding:32px;text-align:center;color:var(--text-muted)">No data yet for this category. Use the sidebar to add a value or import a PDF.</div></div>`;
  }
  const colgroup = renderTableColgroup([
    'gb-col-marker',
    ...labels.map(() => 'gb-col-date'),
  ]);
  let headHtml = `<tr><th>Biomarker</th>`;
  // Labels pre-escaped at the showCategory call boundary — see renderTableView.
  for (const d of labels) headHtml += `<th>${d}</th>`;
  headHtml += `</tr>`;
  let bodyHtml = '';
  for (const [key, marker] of markerEntries) {
    const id = categoryKey + "_" + key;
    state.markerRegistry[id] = marker;
    bodyHtml += `<tr><td role="button" tabindex="0" aria-label="${escapeHTML(marker.name)}" style="cursor:pointer" onclick="showDetailModal('${id}')">${escapeHTML(marker.name)}</td>`;
    for (let i = 0; i < marker.values.length; i++) {
      const v = marker.values[i];
      const ri = getEffectiveRangeForDate(marker, i);
      const s = v !== null ? getStatus(v, ri.min, ri.max) : "missing";
      const cellLabel = `${escapeHTML(marker.name)} ${labels[i] || ''}: ${v !== null ? formatValue(v) : 'no value'}`;
      bodyHtml += `<td class="heatmap-${s}" role="button" tabindex="0" aria-label="${cellLabel}" onclick="showDetailModal('${id}')">${v !== null ? formatValue(v) : "\u2014"}</td>`;
    }
    bodyHtml += `</tr>`;
  }
  const minWidth = 180 + labels.length * 104;
  return renderScrollableTableShell('heatmap', 'heatmap-wrapper', 'heatmap-table', colgroup, headHtml, bodyHtml, minWidth);
}

export function renderFattyAcidsView(cat, categoryKey) {
  // categoryKey + per-marker key flow into inline-onclick handlers below.
  if (!safeMarkerId(categoryKey)) return '';
  let html = `<div style="background:var(--bg-card);border-radius:var(--radius);padding:20px;margin-bottom:20px;border:1px solid var(--border)">
    <h3 style="margin-bottom:16px;font-size:16px">Fatty Acid Profile${cat.singleDate ? ' \u2014 ' + new Date(cat.singleDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}</h3>
    <div class="fa-bar-chart-container"><canvas id="chart-fa-bar"></canvas></div></div>`;
  html += `<div class="fatty-acids-grid">`;
  for (const [key, marker] of Object.entries(cat.markers)) {
    if (!safeMarkerId(key)) continue;
    const r = getEffectiveRange(marker);
    const v = marker.values[0], s = getStatus(v, r.min, r.max);
    const pos = Math.max(0, Math.min(100, getRangePosition(v, r.min, r.max)));
    let faRangeText;
    if (state.rangeMode === 'both' && (marker.optimalMin != null || marker.optimalMax != null) && (marker.refMin != null || marker.refMax != null)) {
      faRangeText = `Ref: ${formatValue(marker.refMin)} \u2013 ${formatValue(marker.refMax)} · <span style="color:var(--green)">Opt: ${formatValue(marker.optimalMin)} \u2013 ${formatValue(marker.optimalMax)}</span>`;
    } else {
      const rangeLabel = state.rangeMode === 'optimal' && (marker.optimalMin != null || marker.optimalMax != null) ? 'Optimal' : 'Ref';
      faRangeText = `${rangeLabel}: ${formatValue(r.min)} \u2013 ${formatValue(r.max)}`;
    }
    html += `<div class="fa-card" role="button" tabindex="0" aria-label="${escapeHTML(marker.name)} ${formatValue(v)}${marker.unit ? ' ' + escapeHTML(marker.unit) : ''}" onclick="showDetailModal('${categoryKey}_${key}')" style="cursor:pointer"><div class="fa-card-name">${escapeHTML(marker.name)}</div>
      <div class="fa-card-value val-${s}">${formatValue(v)}${marker.unit ? " " + escapeHTML(marker.unit) : ""}</div>
      <div class="fa-card-ref">${faRangeText}</div>
      <div class="range-bar" style="margin-top:8px;width:100%"><div class="range-bar-fill" style="left:0;width:100%"></div>
      <div class="range-bar-marker marker-${s}" style="left:${pos}%"></div></div></div>`;
  }
  html += `</div>`;
  return html;
}

export function renderFattyAcidsCharts(cat) {
  if (!window.Chart) {
    ensureChartJs().then(() => {
      if (document.getElementById("chart-fa-bar")) renderFattyAcidsCharts(cat);
    }).catch(() => {});
    return;
  }
  const tc = getChartColors();
  const names=[], vals=[], mins=[], maxs=[], bgC=[], brC=[];
  for (const m of Object.values(cat.markers)) {
    const r = getEffectiveRange(m);
    names.push(m.name.replace(/\(.+\)/,"").trim());
    vals.push(m.values[0]); mins.push(r.min); maxs.push(r.max);
    const s = getStatus(m.values[0], r.min, r.max);
    bgC.push(s==="normal"?tc.green+"99":s==="high"?tc.red+"99":tc.yellow+"99");
    brC.push(s==="normal"?tc.green:s==="high"?tc.red:tc.yellow);
  }
  const ctx = document.getElementById("chart-fa-bar");
  if (!ctx) return;
  state.chartInstances["fa-bar"] = new window.Chart(ctx, {
    type: "bar",
    data: { labels: names, datasets: [
      { label:"Value", data:vals, backgroundColor:bgC, borderColor:brC, borderWidth:1, borderRadius:4 },
      { label:"Ref Min", data:mins, type:"line", borderColor:tc.lineColor+"80", borderDash:[4,4], pointRadius:0, fill:false, borderWidth:1.5 },
      { label:"Ref Max", data:maxs, type:"line", borderColor:tc.lineColor+"80", borderDash:[4,4], pointRadius:0, fill:false, borderWidth:1.5 }
    ]},
    options: { responsive:true, maintainAspectRatio:false,
      plugins: { legend:{display:false}, tooltip:{ backgroundColor:tc.tooltipBg, titleColor:tc.tooltipTitle, bodyColor:tc.tooltipBody, borderColor:tc.tooltipBorder, borderWidth:1 }},
      scales: { x:{ticks:{color:tc.tickColor,font:{size:10},maxRotation:45},grid:{display:false}}, y:{ticks:{color:tc.tickColor},grid:{color:tc.gridColor}} }
    }
  });
}

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
