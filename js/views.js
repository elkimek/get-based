// views.js — Navigate, dashboard, category views, detail modal, compare, correlations

import { state } from './state.js';
import { CORRELATION_PRESETS, CHIP_COLORS, trackUsage, UNIT_CONVERSIONS, getAlternateUnit, convertUserInputToSI } from './schema.js';
import { escapeHTML, escapeAttr, getStatus, getRangePosition, formatValue, getTrend, showNotification, showConfirmDialog, showPromptDialog, hasCardContent, formatDate, safeMarkerId } from './utils.js';
import { getChartColors } from './theme.js';
import { getActiveData, filterDatesByRange, destroyAllCharts, getEffectiveRange, getEffectiveRangeForDate, getLatestValueIndex, getAllFlaggedMarkers, countFlagged, statusIcon, detectTrendAlerts, getKeyTrendMarkers, getFocusCardFingerprint, saveImportedData, recalculateHOMAIR, updateHeaderDates, renderDateRangeFilter, renderChartLayersDropdown, convertDisplayToSI } from './data.js';
import { profileStorageKey, getProfiles } from './profile.js';
import { createLineChart, ensureChartJs, getMarkerDescription, getNotesForChart, getSupplementsForChart, refBandPlugin, noteAnnotationPlugin, supplementBarPlugin } from './charts.js';
import { renderSupplementsSection } from './supplements.js';
import { canonicalMetric, metricsForSources, DEFAULT_METRIC_ORDER } from './wearable-adapters.js';
import { ensureSNPTable, findGenotypeInfo, getSnpCategoryLabel, renderGeneticsSection } from './dna.js';
import { renderMenstrualCycleSection } from './cycle.js';
import { renderProfileContextCards, loadContextHealthDots, closeSuggestionsOnClickOutside } from './context-cards.js';
import { callClaudeAPI, hasAIProvider, isAIPaused, getAIProvider, getActiveModelId } from './api.js';
import { injectLensChunks } from './lab-context.js';
import { hasLens, queryLens } from './lens.js';
import { applyInlineMarkdown } from './markdown.js';
import { loadPdfImport } from './import-loader.js';
import { createNavigate, getInitialView as getRouterInitialView } from './views-router.js';
import { createLensPageHandlers } from './lens-pages.js';

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

function renderLightConditionsWidgetBody({ variant = 'full', slotId = '' } = {}) {
  const conditionsOpts = { variant };
  if (slotId) conditionsOpts.slotId = slotId;
  return `<div class="light-conditions-now-wrap">
      <div class="light-conditions-now-head">
        <span class="light-conditions-now-title">Conditions now</span>
        <span class="light-conditions-now-actions">
          <button type="button" class="conditions-now-refresh light-widget-mini-btn" aria-label="Refresh conditions data — bypasses cache" onclick="window._refreshConditionsNow && window._refreshConditionsNow()"${_conditionsTooltipAttr('Force a fresh fetch, bypassing the short cache')}>Refresh</button>
          <button type="button" class="conditions-now-inspect light-widget-mini-btn" aria-label="Show raw conditions response, source, cache, and sanity check" onclick="window._inspectConditionsNow && window._inspectConditionsNow()"${_conditionsTooltipAttr('See raw response, source, cache age, and sanity checks')}>Details</button>
        </span>
      </div>
      ${renderConditionsNow(conditionsOpts)}
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

// "Conditions now" strip — renders current UVI / ozone / AQI / sun-angle
// for the user's resolved coords. Lazy-fetches via window.fetchAtmosphere
// (which has its own 1hr cache layer). On fetch failure, falls back to
// cached or zenith-only estimate and shows a "stale" indicator. Designed
// to work fully offline once any earlier fetch has populated the cache.
//
// Renders as a placeholder div initially; the async fetch fills it in
// after first paint so dashboard render isn't blocked by network I/O.
//
// Cache is coords-keyed so a profile swap (different country → different
// coords) doesn't serve the previous profile's UVI/AQ/etc. Key is rounded
// to 0.5° (~55 km) — much coarser than the network privacy rounding so
// near-by points share a cache entry, but cross-country swaps don't.
let _conditionsCache = null; // { coordKey, atm, fetchedAt }
let _conditionsFetchInFlight = false;
// Per-slot 5min refresh intervals — keyed by deterministic slotId
// ('cond-now-compact' / 'cond-now-full'). Survives strip re-renders
// so a single interval handles auto-refresh for the slot's lifetime.
const _conditionsIntervals = new Map();

function _conditionsTooltipAttr(text, opts = {}) {
  if (!text) return '';
  return ` data-conditions-tooltip="${escapeAttr(text)}"${opts.focusable ? ' tabindex="0"' : ''}`;
}

function _coordKey(coords) {
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) return null;
  const f = 2; // 0.5° rounding → coarse enough to share within a metro, fine enough to distinguish countries
  const k = (n) => (Math.round(n * f) / f).toFixed(1);
  return `${k(coords.lat)}_${k(coords.lon)}`;
}

function _centerConditionsNowMarker(slotOrId) {
  if (typeof document === 'undefined') return;
  const slot = typeof slotOrId === 'string' ? document.getElementById(slotOrId) : slotOrId;
  const scroller = slot?.querySelector?.('.conditions-now-events');
  const nowMarker = slot?.querySelector?.('.conditions-now-event-now');
  if (!scroller || !nowMarker || scroller.scrollWidth <= scroller.clientWidth + 2) return;
  const center = () => {
    const nextLeft = nowMarker.offsetLeft + (nowMarker.offsetWidth / 2) - (scroller.clientWidth / 2);
    scroller.scrollLeft = Math.max(0, nextLeft);
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(center);
  else setTimeout(center, 0);
}

export function renderConditionsNow(opts = {}) {
  const variant = opts.variant || 'full'; // 'full' (Light page) | 'compact' (dashboard)
  // Deterministic slotId per variant — pre-2026-05-08 used Date.now()
  // which made the rendered HTML differ on every call, so any caller
  // doing a string-diff (Light Today strip 5s ticker) saw the strip
  // "always different" and re-swapped innerHTML, tearing this slot
  // down + restarting its loading spinner = visible blink.
  const slotId = opts.slotId || `cond-now-${variant}`;
  // Schedule the initial fetch + 5min auto-refresh interval only the
  // first time this slot is rendered — subsequent renders (e.g. from
  // _refreshLiveChannelSurfaces) just reuse the existing interval.
  if (!_conditionsIntervals.has(slotId)) {
    setTimeout(() => _refreshConditions(slotId, variant), 50);
    const handle = setInterval(() => {
      if (!document.getElementById(slotId)) {
        clearInterval(handle);
        _conditionsIntervals.delete(slotId);
        return;
      }
      _refreshConditions(slotId, variant);
    }, 5 * 60 * 1000);
    _conditionsIntervals.set(slotId, handle);
  }
  // Cache hit fast path — when the user navigates between dashboard
  // and Light & Sun within the 5min cache window, render the cached
  // conditions block directly instead of the loading placeholder.
  // Without this, every navigation away-and-back flashed the
  // "Loading current conditions…" spinner before the cache resolved
  // ~50ms later, which the user perceived as "conditions not persistent."
  try {
    const coords = (typeof window !== 'undefined' && window.getSunCoords && window.getSunCoords()) || null;
    if (coords && _conditionsCache && _conditionsCache.coordKey === _coordKey(coords)
        && (Date.now() - _conditionsCache.fetchedAt) < 5 * 60 * 1000) {
      setTimeout(() => _centerConditionsNowMarker(slotId), 0);
      return `<div class="conditions-now conditions-now-${variant}" id="${slotId}" data-variant="${variant}" aria-busy="false">${_renderConditionsHTML(_conditionsCache.atm, coords, variant)}</div>`;
    }
  } catch (_) {}
  // No aria-live on the wrapper — auto-refresh would re-announce the whole
  // strip every cycle. Only user-triggered refresh announces, via a separate
  // sr-only live region populated in _refreshConditions(opts.force).
  return `<div class="conditions-now conditions-now-${variant}" id="${slotId}" data-variant="${variant}" aria-busy="true">
    <div class="conditions-now-loading">
      <span class="conditions-now-icon">☼</span>
      <span class="conditions-now-text">Loading current conditions…</span>
    </div>
  </div>`;
}

async function _refreshConditions(slotId, variant, opts = {}) {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  // Clear aria-busy on every exit path — the slot was created with
  // aria-busy="true" so screen readers don't announce intermediate
  // values. Whatever path resolves first must clear it.
  const _resolveBusy = () => slot.setAttribute('aria-busy', 'false');
  const coords = (window.getSunCoords && window.getSunCoords()) || null;
  if (!coords) {
    _resolveBusy();
    slot.innerHTML = `<div class="conditions-now-msg">Set a country in your profile to see current sun conditions.</div>`;
    return;
  }
  // Throttle: serve in-memory cache if we fetched recently (5 min) AND the
  // coords match the cached entry (within 0.5° bucket). Different coords
  // (profile swap) bust the cache. Force=true bypasses the throttle.
  const now = Date.now();
  const key = _coordKey(coords);
  if (!opts.force && _conditionsCache && _conditionsCache.coordKey === key && (now - _conditionsCache.fetchedAt) < 5 * 60 * 1000) {
    _resolveBusy();
    slot.innerHTML = _renderConditionsHTML(_conditionsCache.atm, coords, variant);
    _centerConditionsNowMarker(slot);
    return;
  }
  if (_conditionsFetchInFlight) {
    setTimeout(() => _refreshConditions(slotId, variant, opts), 180);
    return;
  }
  _conditionsFetchInFlight = true;
  // For a user-triggered refresh, mark the slot busy + add a guaranteed
  // minimum visible-spinner duration. Otherwise a fast fetch (50ms) replaces
  // the DOM before the browser can render the loading state, and the click
  // looks like nothing happened.
  let minSpinUntil = 0;
  if (opts.force) {
    slot.classList.add('is-refreshing');
    minSpinUntil = Date.now() + 600;
    // Also visually mark the existing data as "refreshing" without nuking
    // the strip so the user keeps their UVI/clouds/etc visible during the
    // fetch — we only swap content once the new payload arrives.
    const trustFooter = slot.querySelector('.conditions-now-trust');
    if (trustFooter) trustFooter.classList.add('is-refreshing');
  }
  try {
    // For a forced refresh, wipe the localStorage cache for current coords
    // so the providers are actually re-hit (not served from the 1hr TTL).
    if (opts.force) _bustMeteoCacheForCoords(coords);
    let atm = null, online = true, fetchError = null;
    try {
      atm = await window.fetchAtmosphere({
        lat: coords.lat,
        lon: coords.lon,
        isoTime: new Date().toISOString(),
        noCache: !!opts.force, // user-triggered refresh skips both fresh + stale cache
      });
      if (atm?._stale) online = false;
      if (atm && window._applyAtmOverrides) atm = window._applyAtmOverrides(atm);
    } catch (e) {
      online = false;
      fetchError = String(e?.message || e);
      atm = (_conditionsCache && _conditionsCache.coordKey === key) ? _conditionsCache.atm : null;
    }
    // Honor the minimum spin duration so the user can actually see feedback
    if (minSpinUntil) {
      const remaining = minSpinUntil - Date.now();
      if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
    }
    if (!atm) {
      slot.classList.remove('is-refreshing');
      slot.setAttribute('aria-busy', 'false');
      slot.innerHTML = `<div class="conditions-now-msg">Conditions data unavailable offline. Reconnect once and we'll cache it.${fetchError ? ` <small>(${escapeHTML(fetchError)})</small>` : ''}</div>`;
      return;
    }
    _conditionsCache = { coordKey: key, atm, fetchedAt: now };
    slot.setAttribute('aria-busy', 'false');
    slot.innerHTML = _renderConditionsHTML(atm, coords, variant, !online);
    _centerConditionsNowMarker(slot);
    slot.classList.remove('is-refreshing');
    // Brief "✓ Updated" flash on user-triggered refresh — the new content
    // already shows "just now" but a green tick gives explicit confirmation.
    if (opts.force) {
      const src = slot.querySelector('.conditions-now-source, .conditions-now-source-compact');
      if (src) {
        src.classList.add('just-refreshed');
        setTimeout(() => src.classList.remove('just-refreshed'), 1500);
      }
      if (typeof window.showNotification === 'function') {
        window.showNotification(online ? '✓ Conditions refreshed' : '✓ Cached values reloaded (offline)');
      }
    }
  } finally {
    _conditionsFetchInFlight = false;
  }
}

// User-triggered: force a re-fetch of conditions, bypassing all caches.
// Re-renders every conditions-now slot on the page (dashboard + Light page
// can both have one mounted at the same time). Also wipes the localStorage
// meteo:v2:* cache so a device that latched onto a degraded provider
// (e.g. an Open-Meteo-only response cached while CAMS was unreachable
// during a relay-side outage) can recover without tab-killing — the
// next fetch hits the provider chain fresh.
function _refreshConditionsNow() {
  if (typeof window.purgeMeteoCache === 'function') {
    try { window.purgeMeteoCache(); } catch {}
  }
  document.querySelectorAll('.conditions-now').forEach(el => {
    const id = el.id;
    const variant = el.dataset.variant || 'full';
    if (id) _refreshConditions(id, variant, { force: true });
  });
}

async function _setManualUvi() {
  const input = document.getElementById('manual-uvi-input');
  if (!input) return;
  const v = parseFloat(input.value);
  if (!Number.isFinite(v) || v < 0 || v > 20) {
    if (window.showNotification) window.showNotification('UVI must be between 0 and 20', 'error');
    return;
  }
  const data = state.importedData;
  if (!data) return;
  if (!data.sunDefaults) data.sunDefaults = {};
  if (!data.sunDefaults.overrides) data.sunDefaults.overrides = {};
  data.sunDefaults.overrides.uvIndex = v;
  if (window.saveImportedData) await window.saveImportedData();
  // Bust the in-memory conditions cache so the next render re-renders with
  // the override applied. Fetch isn't re-issued — the override is applied
  // to whatever atm we have cached.
  _conditionsCache = null;
  if (window.showNotification) window.showNotification(`Manual UVI ${v.toFixed(1)} applied — used for burn-time + vit-D-threshold math until cleared. (Spectrum stays driven by ozone + zenith + cloud cover.)`, 'success', 5000);
  _refreshConditionsNow();
}

async function _clearManualUvi() {
  const data = state.importedData;
  if (!data?.sunDefaults?.overrides) return;
  delete data.sunDefaults.overrides.uvIndex;
  if (window.saveImportedData) await window.saveImportedData();
  _conditionsCache = null;
  if (window.showNotification) window.showNotification('Manual UVI cleared — back to live atmosphere data.');
  _refreshConditionsNow();
}

// User-triggered: open a modal showing the raw atmosphere response so the
// user can verify what the provider returned, what we parsed, and what the
// engine will use. Pure inspection — no side effects.
function _inspectConditionsNow() {
  const coords = (window.getSunCoords && window.getSunCoords()) || null;
  const key = _coordKey(coords);
  const atm = (_conditionsCache && _conditionsCache.coordKey === key) ? _conditionsCache.atm : null;
  const warnings = atm ? _sanityCheckAtmosphere(atm, coords) : [];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  const cacheKeys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('meteo:')) cacheKeys.push(k);
    }
  } catch (e) {}
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Inspect conditions data" style="max-width:640px">
    <div class="modal-header">
      <h3>Inspect conditions data</h3>
      <button class="modal-close" aria-label="Close" onclick="this.closest('.modal-overlay').remove()">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Last response from the conditions provider, exactly as parsed. Use this to verify the math is using the values you expect.</p>

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Source</div>
        <div class="sun-detail-section-value">${atm?.source ? escapeHTML(atm.source) : '—'}</div>
      </div>
      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Fetched at</div>
        <div class="sun-detail-section-value">${atm?.fetchedAt ? escapeHTML(new Date(atm.fetchedAt).toLocaleString()) : '—'}</div>
      </div>
      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Coords used</div>
        <div class="sun-detail-section-value">${coords ? `${coords.lat.toFixed(2)}°, ${coords.lon.toFixed(2)}° (${escapeHTML(coords.source || 'unknown')})` : '—'}</div>
      </div>
      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Confidence</div>
        <div class="sun-detail-section-value">${(() => {
          // Computed real-time confidence — weights snapshot age, cloud
          // cover, solar elevation, and UVI band so a low-sun heavy-cloud
          // CAMS reading isn't dishonestly reported as 95%.
          const computed = window.computeUVConfidence ? window.computeUVConfidence({
            source: atm?.source,
            snapshotAgeSec: atm?._camsMeta?.ageSec ?? null,
            cloudCover: atm?.cloudCover ?? null,
            zenithDeg: coords && atm?.fetchedAt && window.solarZenithAngle
              ? window.solarZenithAngle(new Date(atm.fetchedAt), coords.lat, coords.lon)
              : null,
            uvIndex: atm?.uvIndex ?? null,
            isStale: !!atm?._stale,
            manualOverridden: !!atm?._uvOverridden,
          }) : (atm?.confidence ?? null);
          if (computed == null) return '—';
          const pct = Math.round(computed * 100);
          // Tooltip lists the active discounts so the user can see WHY
          // confidence dropped — turns a single number into honest reasoning.
          const factors = [];
          if (atm?._uvOverridden) factors.push('manual UVI override');
          else {
            const age = atm?._camsMeta?.ageSec;
            if (Number.isFinite(age)) {
              if (age > 86400) factors.push(`stale grid (${Math.round(age/3600)}h old)`);
              else if (age > 43200) factors.push(`grid ${Math.round(age/3600)}h old`);
              else if (age > 21600) factors.push(`grid ${Math.round(age/3600)}h old`);
            }
            const cc = atm?.cloudCover;
            const ccNorm = cc != null && cc > 1 ? cc / 100 : cc;
            if (Number.isFinite(ccNorm)) {
              if (ccNorm > 0.8) factors.push(`heavy cloud (${Math.round(ccNorm*100)}%)`);
              else if (ccNorm > 0.5) factors.push(`moderate cloud (${Math.round(ccNorm*100)}%)`);
            }
            if (atm?._stale) factors.push('upstream marked stale');
            const u = atm?.uvIndex;
            if (Number.isFinite(u) && u < 2) factors.push(`low UVI (${u.toFixed(1)} — model band noisy below 2)`);
          }
          const tip = factors.length ? `Discounted by: ${factors.join('; ')}` : 'No active discounts; baseline source confidence.';
          return `<span title="${escapeAttr(tip)}">${pct}%</span>`;
        })()}</div>
      </div>
      ${warnings.length ? `<div class="sun-detail-section">
        <div class="sun-detail-section-label">Sanity warnings</div>
        <div class="sun-detail-section-value" style="color:var(--orange)">${warnings.map(w => '⚠ ' + escapeHTML(w)).join('<br>')}</div>
      </div>` : `<div class="sun-detail-section"><div class="sun-detail-section-label">Sanity check</div><div class="sun-detail-section-value" style="color:var(--green)">✓ All values plausible</div></div>`}

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Raw payload</div>
        <pre tabindex="0" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;font-size:11px;color:var(--text-primary);overflow:auto;max-height:200px;overscroll-behavior:contain;white-space:pre-wrap;word-break:break-word">${atm ? escapeHTML(JSON.stringify(atm, null, 2)) : 'No cached response.'}</pre>
      </div>

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">localStorage cache (${cacheKeys.length} entr${cacheKeys.length === 1 ? 'y' : 'ies'})</div>
        <div class="sun-detail-section-value" style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text-muted)">${cacheKeys.length ? cacheKeys.map(k => escapeHTML(k)).join('<br>') : '— (no cached entries)'}</div>
      </div>

      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
        <button class="import-btn import-btn-primary" onclick="this.closest('.modal-overlay').remove();window._refreshConditionsNow();">↻ Force refresh</button>
      </div>
    </div>
  </div>`;
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}
  // Manually drive scroll + halt propagation on the Raw payload <pre>.
  // CSS-only `overflow:auto`/`overscroll-behavior:contain` couldn't beat
  // the modal's own scroll container — wheel deltas were being claimed
  // by the modal before the pre saw them. Explicitly handling the
  // wheel event here forces the pre to scroll first and prevents the
  // event from bubbling to the modal regardless of the pre's scroll
  // boundary.
  const rawPre = overlay.querySelector('.sun-detail-section pre');
  if (rawPre) {
    rawPre.addEventListener('wheel', (e) => {
      const before = rawPre.scrollTop;
      rawPre.scrollTop = before + e.deltaY;
      // Stop the modal from also scrolling on the same wheel tick.
      e.stopPropagation();
      e.preventDefault();
    }, { passive: false });
  }
}

// Wipe localStorage `meteo:` keys so the next fetch hits the provider
// chain instead of being served from the 1hr cache. Called on user-
// triggered Refresh so the button has a real effect. Wipes ALL meteo
// keys (not coord-filtered) — the previous targeted approach used
// `lat.toFixed(2)` while sun-uvdata's makeCacheKey rounds via the
// `privacyRounding` config (default 0.1°), so the two never matched
// and Refresh was a no-op for almost any coord. Wiping all is fine:
// the cache is small (per-hour buckets), and force-Refresh is rare.
function _bustMeteoCacheForCoords(_coords) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('meteo:')) localStorage.removeItem(k);
    }
  } catch (e) {}
}

function _renderConditionsHTML(atm, coords, variant, offline = false) {
  const uvi = atm.uvIndex != null ? Math.round(atm.uvIndex * 10) / 10 : null;
  const uviClear = atm.uvClearSky != null ? Math.round(atm.uvClearSky * 10) / 10 : null;
  // Stratospheric ozone (DU) — only available with CAMS/selfhost. Free
  // Open-Meteo can't deliver it, so the cell typically falls back to the
  // surface-ozone AQ reading further down.
  const ozone = atm.ozoneDU != null ? Math.round(atm.ozoneDU) : null;
  const surfaceOzone = atm.airQuality?.surfaceOzoneUgM3 != null ? Math.round(atm.airQuality.surfaceOzoneUgM3) : null;
  const cloud = atm.cloudCover != null ? Math.round(atm.cloudCover) : null;
  const aqPm25 = atm.airQuality?.pm25 != null ? Math.round(atm.airQuality.pm25) : null;

  // Sanity-check the data — UVI shouldn't exist when sun is below horizon,
  // shouldn't exceed ~16 anywhere on Earth, etc. Flag suspicious responses
  // so the user knows when the upstream looks off.
  const sanityWarnings = _sanityCheckAtmosphere(atm, coords);
  const sourceLabel = _humanProviderLabel(atm.source);
  const fetchedAgoMin = atm.fetchedAt ? Math.max(0, Math.round((Date.now() - atm.fetchedAt) / 60000)) : null;
  const freshnessLabel = fetchedAgoMin == null ? 'unknown'
    : fetchedAgoMin < 1 ? 'just now'
    : fetchedAgoMin < 60 ? `${fetchedAgoMin} min ago`
    : `${Math.round(fetchedAgoMin / 60)}h ago`;
  // Solar zenith angle — degrees from vertical. 0 = sun directly overhead.
  let zenith = null;
  try {
    if (window.solarZenithAngle) zenith = window.solarZenithAngle(new Date(), coords.lat, coords.lon);
  } catch (e) {}
  const sunAngle = zenith != null ? Math.round(90 - zenith) : null; // elevation above horizon

  // UV index color ramp — UVI 0 green → UVI 11+ purple. WHO + Burn-Risk standard
  let uviCls = 'low';
  if (uvi != null) {
    if (uvi >= 11) uviCls = 'extreme';
    else if (uvi >= 8) uviCls = 'very-high';
    else if (uvi >= 6) uviCls = 'high';
    else if (uvi >= 3) uviCls = 'moderate';
  }

  // AQI bucket from PM2.5 (WHO 24h guideline)
  let aqCls = 'good', aqLabel = '—';
  if (aqPm25 != null) {
    if (aqPm25 < 12) { aqCls = 'good'; aqLabel = 'Good'; }
    else if (aqPm25 < 35) { aqCls = 'moderate'; aqLabel = 'Moderate'; }
    else if (aqPm25 < 55) { aqCls = 'unhealthy-sensitive'; aqLabel = 'Unhealthy for sensitive'; }
    else if (aqPm25 < 150) { aqCls = 'unhealthy'; aqLabel = 'Unhealthy'; }
    else { aqCls = 'hazardous'; aqLabel = 'Hazardous'; }
  }

  const fetchedAgo = Math.max(0, Math.round((Date.now() - (atm.fetchedAt || Date.now())) / 60000));
  const staleness = offline
    ? `<span class="conditions-now-stale"${_conditionsTooltipAttr('Network unavailable — using cached values', { focusable: true })}>⚠ offline · cached ${fetchedAgo} min ago</span>`
    : (fetchedAgo > 60
        ? `<span class="conditions-now-stale"${_conditionsTooltipAttr('Cached value — refresh to update', { focusable: true })}>cached ${fetchedAgo} min ago — tap ↻ to refresh</span>`
        : (fetchedAgo > 30
            ? `<span class="conditions-now-stale conditions-now-stale-mild"${_conditionsTooltipAttr('Conditions can drift with cloud cover; tap refresh for a fresh fetch', { focusable: true })}>data ${fetchedAgo} min old</span>`
            : ''));

  // Resolve user's Fitzpatrick (for time-to-MED). Track whether it's
  // user-set vs the default III fallback so we can qualify the readout.
  const userFp = state.importedData?.sunDefaults?.fitzpatrick ||
                 (state.importedData?.lightCircadian?.skinType?.match?.(/^(I{1,3}|IV|VI?)\b/) || [])[1];
  const fp = userFp || 'III';
  const fpIsDefault = !userFp;
  const medResult = uvi != null ? _timeToMed(uvi, fp, atm) : null;
  const vitDLabel = _vitDLabel(uvi);
  // Daily peak forecast — when does UVI hit its max today
  const peakAt = atm.daily?.peakAt;
  const peakUvi = atm.daily?.uvIndexMax;
  const peakIsNow = peakAt && uvi != null && peakUvi != null && uvi >= peakUvi - 0.3;
  const peakChip = peakAt && peakUvi != null && !peakIsNow
    ? `peak ${_fmtTime(peakAt)} · UVI ${peakUvi.toFixed(1)}`
    : (peakIsNow ? 'at today\'s peak' : '');
  // Plain-English cloud framing — "Overcast" / "Partly cloudy" / "Clear sky"
  const cloudWord = _cloudNarrative(cloud);
  // If clouds are actively suppressing UVI, surface the clear-sky alternate
  const cloudChip = cloudWord
    ? (uviClear != null && uvi != null && uviClear > uvi + 0.5
       ? `${cloudWord} · clear-sky max UVI ${uviClear.toFixed(1)}`
       : cloudWord)
    : '';
  // Surface-ozone WHO bucket
  const surfaceOzoneCls = _surfaceOzoneCls(surfaceOzone);
  // Shadow narrative
  const shadowText = _shadowNarrative(sunAngle);
  // Multi-pollutant aggregate AQ — "worst-of" so high NO₂ doesn't hide
  // behind low PM2.5. atm.airQuality.european_aqi (when present) is
  // already the official EAQI multi-pollutant aggregation.
  const eaqi = atm.airQuality?.european_aqi ?? null;
  const aqAgg = _aggregateAQ(atm.airQuality, eaqi);

  // Sun-events line — today's sun arc with sunrise / peak / sunset and a
  // "you are here" marker. Past events fade to 55% so the eye reads the
  // ordering as a timeline. The "now" marker shows time-to-next-event so
  // it's actionable instead of a duplicate clock.
  const sunrise = atm.daily?.sunrise;
  const sunset = atm.daily?.sunset;
  // Biological dawn / dusk — when UV-A first / last reaches the ground.
  // For QB users this is the most meaningful moment of the day (Hattar
  // ipRGC entrainment, eye-skin α-MSH cascade, retinal dopamine release).
  const { firstUVA, lastUVA } = _computeUvaWindow(coords, sunrise || new Date());
  const events = [];
  // Sun-arc icon language (deliberately distinct so no two events share
  // the same emoji meaning):
  //   🌅 = geometric sunrise   (universal "sun crossing horizon")
  //   ◐  = UV-A on (rising)    (half-sun rising — biological dawn)
  //   ☀  = peak UVI            (solar noon)
  //   ◑  = UV-A off (setting)  (half-sun setting — biological dusk)
  //   🌇 = geometric sunset    (universal "sun below horizon")
  //   ⏵  = now                 (current time pointer)
  if (sunrise) events.push({ icon: '🌅', label: _fmtTime(sunrise), ts: new Date(sunrise).getTime(), kind: 'sunrise', tooltip: 'Geometric sunrise — sun crosses horizon. UV-A still negligible, eye-light barely above twilight.' });
  // Local-time HH:MM formatter — matches the format Open-Meteo returns
  // (YYYY-MM-DDTHH:MM in the requested timezone) so all events on the
  // sun-arc row are in the same timezone.
  const localHHMM = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  if (firstUVA) {
    events.push({
      icon: '◐',
      label: `${localHHMM(firstUVA)} · UV-A on`,
      ts: firstUVA.getTime(),
      kind: 'first-uva',
      uvaEvent: true,
      tooltip: 'Sun reaches ~5° elevation — atmospheric path short enough for 320-400 nm UV-A to penetrate. Biological dawn: eye + skin start receiving the violet/UV-A signals that drive circadian entrainment, α-MSH / β-endorphin, and retinal dopamine.',
    });
  }
  if (peakAt)  events.push({ icon: '☀', label: `${_fmtTime(peakAt)}${peakUvi != null ? ` · UVI ${peakUvi.toFixed(1)}` : ''}`, ts: new Date(peakAt).getTime(), peak: true, kind: 'peak', tooltip: 'Solar noon — UVI at its daily maximum.' });
  if (lastUVA) {
    events.push({
      icon: '◑',
      label: `${localHHMM(lastUVA)} · UV-A off`,
      ts: lastUVA.getTime(),
      kind: 'last-uva',
      uvaEvent: true,
      tooltip: 'Sun drops below ~5° elevation — UV-A fades from the surface. Biological dusk window closes; melatonin synthesis ramps up.',
    });
  }
  if (sunset)  events.push({ icon: '🌇', label: _fmtTime(sunset), ts: new Date(sunset).getTime(), kind: 'sunset', tooltip: 'Geometric sunset — sun drops below horizon. UV-A already gone for ~30-60 min.' });
  const nowTs = Date.now();
  // Find next upcoming event for the "now" actionable readout
  const upcoming = events.filter(e => e.ts > nowTs).sort((a, b) => a.ts - b.ts);
  const nextEvent = upcoming[0];
  const nextEventLabel = nextEvent ? ({
    sunrise: 'sunrise',
    'first-uva': 'UV-A on',
    peak: 'peak',
    'last-uva': 'UV-A off',
    sunset: 'sunset',
  })[nextEvent.kind] : null;
  const minsToNext = nextEvent ? Math.round((nextEvent.ts - nowTs) / 60000) : null;
  const nowSubLabel = nextEvent && nextEventLabel
    ? `now · ${_fmtMinutes(minsToNext)} to ${nextEventLabel}`
    : 'now';
  const nowEvent = {
    icon: '⏵',
    label: nowSubLabel,
    ts: nowTs,
    isNow: true,
    tooltip: nextEvent && nextEventLabel
      ? `Current time marker — ${_fmtMinutes(minsToNext)} until ${nextEventLabel}.`
      : 'Current time marker — all tracked sun events for today have passed.',
  };
  // Insert "now" at the right chronological position
  const eventsWithNow = [...events, nowEvent].sort((a, b) => a.ts - b.ts);
  const eventRailLabel = (e) => ({
    sunrise: 'Sunrise',
    'first-uva': 'UV-A on',
    peak: 'Peak',
    'last-uva': 'UV-A off',
    sunset: 'Sunset',
  })[e.kind] || (e.isNow ? 'Now' : 'Event');
  const eventRailTime = (e) => {
    if (e.isNow) return e.label.replace(/^now(?: · )?/, '') || 'current';
    if (e.kind === 'first-uva' || e.kind === 'last-uva') return e.label.split(' · ')[0];
    return e.label;
  };
  const timelineTip = 'Today\'s sun timeline — left to right is the timeline through your day. Events left of the highlighted now-marker have passed; events to the right are upcoming.';
  const sunEventsLine = events.length ? `<div class="conditions-now-events-wrap"${_conditionsTooltipAttr(timelineTip, { focusable: true })}>
    <div class="conditions-now-events-caption">Today's sun timeline</div>
    <div class="conditions-now-events">
      <div class="conditions-now-events-rail" role="list" aria-label="Today's sun timeline" style="--conditions-event-count: ${eventsWithNow.length};">
        <span class="conditions-now-events-track" aria-hidden="true"></span>
        ${eventsWithNow.map((e, i) => `<span role="listitem" class="conditions-now-event${e.peak ? ' conditions-now-event-peak' : ''}${e.uvaEvent ? ' conditions-now-event-uva' : ''}${e.isNow ? ' conditions-now-event-now' : ''}${e.ts < nowTs ? ' conditions-now-event-past' : ''}" style="grid-column: ${i + 1};"${_conditionsTooltipAttr(e.tooltip, { focusable: true })} aria-label="${escapeAttr(`${eventRailLabel(e)}: ${e.label}`)}"><span class="conditions-now-event-dot"><span class="conditions-now-event-icon">${e.icon}</span></span><span class="conditions-now-event-copy"><span class="conditions-now-event-label">${escapeHTML(eventRailLabel(e))}</span><span class="conditions-now-event-time">${escapeHTML(eventRailTime(e))}</span></span></span>`).join('')}
      </div>
    </div>
  </div>` : '';

  // Trust footer — source attribution + freshness + sanity warnings.
  // Refresh + Inspect now live in the title row, not down here.
  const ovStored = state.importedData?.sunDefaults?.overrides?.uvIndex;
  const trustFooter = `<div class="conditions-now-trust">
    <span class="conditions-now-source ${offline ? 'is-offline' : (atm._stale ? 'is-stale' : 'is-fresh')}"${_conditionsTooltipAttr(`via ${sourceLabel} · ${freshnessLabel} · refreshes every few minutes · works offline once cached`, { focusable: true })}>
      <span class="conditions-now-source-dot"></span>
      ${offline ? 'offline · cached' : (atm._stale ? 'stale · cached' : 'live')} · via ${escapeHTML(sourceLabel)} · ${escapeHTML(freshnessLabel)}
    </span>
    ${sanityWarnings.length ? `<span class="conditions-now-warning"${_conditionsTooltipAttr(sanityWarnings.join(' · '), { focusable: true })}>⚠ ${sanityWarnings.length} sanity warning${sanityWarnings.length === 1 ? '' : 's'}</span>` : ''}
    <span class="conditions-now-override"${_conditionsTooltipAttr('Manual UVI override — feeds your own UV-meter reading into the spectrum reconstruction. Leave blank to use the live atmosphere fetch.')}>
      <label for="manual-uvi-input">Manual UVI:</label>
      <input type="number" min="0" max="20" step="0.1" inputmode="decimal" id="manual-uvi-input" value="${Number.isFinite(ovStored) ? ovStored : ''}" placeholder="${atm.uvIndex != null && !atm._uvOverridden ? atm.uvIndex.toFixed(1) : '—'}">
      <button type="button" onclick="window._setManualUvi && window._setManualUvi()">Apply</button>
      ${Number.isFinite(ovStored) ? `<button type="button" onclick="window._clearManualUvi && window._clearManualUvi()"${_conditionsTooltipAttr('Clear the manual override')} aria-label="Clear manual UVI override">×</button>` : ''}
    </span>
  </div>`;

  if (variant === 'compact') {
    // Dashboard variant — pills + a 1-line interpretation underneath so
    // users see the actionable info (won't burn / X min to MED) without
    // opening the full Light & Sun page.
    const compactInterp = uvi != null ? (() => {
      let s = vitDLabel;
      if (medResult?.kind === 'no-uv') s += ' · no burn risk';
      else if (medResult?.kind === 'safe-til-sunset') s += ' · won\'t burn before sunset';
      else if (medResult?.kind === 'minutes') s += ` · ~${_fmtMinutes(medResult.value)} to sunburn dose${fpIsDefault ? '*' : ''}`;
      return s;
    })() : '';
    return `<div class="conditions-now-row">
      ${uvi != null ? `<span class="conditions-now-pill conditions-uvi-${uviCls}"${_conditionsTooltipAttr('WHO UV index — sunburn intensity', { focusable: true })}>UVI <strong>${uvi}</strong></span>` : ''}
      ${aqAgg ? `<span class="conditions-now-pill conditions-aq-${aqAgg.cls}"${_conditionsTooltipAttr('Air quality — worst-of category across PM2.5, PM10, and NO₂', { focusable: true })}>AQ ${escapeHTML(aqAgg.label)}</span>` : ''}
      ${peakAt && !peakIsNow ? `<span class="conditions-now-pill"${_conditionsTooltipAttr(`UV index peaks today at ${_fmtTime(peakAt)} · UVI ${peakUvi != null ? peakUvi.toFixed(1) : '—'}`, { focusable: true })}>peak ${_fmtTime(peakAt)}</span>` : ''}
      <span class="conditions-now-source-compact ${offline ? 'is-offline' : (atm._stale ? 'is-stale' : 'is-fresh')}"${_conditionsTooltipAttr(`via ${sourceLabel} · ${freshnessLabel}${offline ? ' (offline)' : ''}`, { focusable: true })}>
        <span class="conditions-now-source-dot"></span>${escapeHTML(sourceLabel)}
      </span>
    </div>
    ${compactInterp ? `<div class="conditions-now-row-interp">${escapeHTML(compactInterp)}</div>` : ''}`;
  }

  // Full Light & Sun page strip — UVI is hero, others are supporting.
  // 4-column grid where UVI spans 2 columns to dominate visually.
  const uviHeroTip = medResult && medResult.kind === 'minutes'
    ? TANNING_MODIFIERS_NOTE
    : 'WHO UV index — sunburn intensity; vitamin-D synthesis rises as UVI climbs.';
  const fpDefaultTip = 'No skin type set yet — using medium (Fitzpatrick III) as a default. Set your actual skin type in Light setup for a personalized estimate.';
  const sunPositionTip = `${SHADOW_RULE_HINT}\n\nSun elevation: ${sunAngle != null ? sunAngle + '°' : 'unknown'} above horizon.`;
  const ozoneTip = ozone != null
    ? 'Total atmospheric ozone column (Dobson Units) — the protective stratospheric layer that blocks UV-B. Lower DU → more UV reaches the surface.'
    : SMOG_HINT;
  const airQualityTip = 'Air quality is the worst-of category across PM2.5, PM10, and NO₂ — so a high traffic-pollutant level (NO₂) won\'t hide behind clean PM. EAQI uses the same multi-pollutant logic.';
  return `<div class="conditions-now-grid">
    <div class="conditions-now-cell conditions-now-cell-hero ${uvi != null ? `conditions-uvi-${uviCls}` : ''}"${_conditionsTooltipAttr(uviHeroTip, { focusable: true })}>
      <div class="conditions-now-label">UV index${atm._uvOverridden ? ` <span class="conditions-now-override-badge"${_conditionsTooltipAttr('Manual UVI override active — clear in Light setup or via the override row below.', { focusable: true })}>manual</span>` : ''}</div>
      <div class="conditions-now-value conditions-now-value-hero">${uvi != null ? uvi : '—'}</div>
      ${uvi != null ? `<div class="conditions-now-interpretation">${escapeHTML(vitDLabel)}${(() => {
        if (!medResult) return '';
        if (medResult.kind === 'no-uv') return ' · UV near zero, no burn risk';
        if (medResult.kind === 'safe-til-sunset') return ' · won\'t burn before sunset';
        if (medResult.kind === 'minutes') return ` · ~${_fmtMinutes(medResult.value)} to your sunburn dose${fpIsDefault ? '*' : ''}`;
        return '';
      })()}${fpIsDefault && medResult?.kind === 'minutes' ? ` <span class="conditions-now-asterisk"${_conditionsTooltipAttr(fpDefaultTip, { focusable: true })}>*</span>` : ''}</div>` : ''}
      ${(cloudChip || peakChip) ? `<div class="conditions-now-chips">
        ${cloudChip ? `<span class="conditions-now-chip">${escapeHTML(cloudChip)}</span>` : ''}
        ${peakChip ? `<span class="conditions-now-chip conditions-now-chip-peak">${escapeHTML(peakChip)}</span>` : ''}
      </div>` : ''}
    </div>
    <div class="conditions-now-cell"${_conditionsTooltipAttr(sunPositionTip, { focusable: true })}>
      <div class="conditions-now-label">Sun position</div>
      <div class="conditions-now-value conditions-now-value-aq">${escapeHTML(_sunPositionLabel(sunAngle))}</div>
      <div class="conditions-now-sub">${escapeHTML(_sunPositionSub(sunAngle))}</div>
    </div>
    <div class="conditions-now-cell ${surfaceOzoneCls ? `conditions-aq-${surfaceOzoneCls}` : ''}"${_conditionsTooltipAttr(ozoneTip, { focusable: true })}>
      <div class="conditions-now-label">${ozone != null ? 'Ozone column' : 'Smog (ground O₃)'}</div>
      <div class="conditions-now-value conditions-now-value-aq">${ozone != null ? ozone : (surfaceOzone != null ? escapeHTML(_surfaceOzoneLabel(surfaceOzone)?.label || '—') : '—')}</div>
      <div class="conditions-now-sub">${
        ozone != null ? 'DU stratospheric' :
        surfaceOzone != null ? escapeHTML(_surfaceOzoneLabel(surfaceOzone)?.action || `${surfaceOzone} µg/m³`) : ''
      }</div>
    </div>
    <div class="conditions-now-cell ${aqAgg ? `conditions-aq-${aqAgg.cls}` : ''}"${_conditionsTooltipAttr(airQualityTip, { focusable: true })}>
      <div class="conditions-now-label">Air quality</div>
      <div class="conditions-now-value conditions-now-value-aq">${aqAgg ? escapeHTML(aqAgg.label) : '—'}</div>
      <div class="conditions-now-sub">${aqAgg ? (aqAgg.why === 'EAQI' ? 'EU air quality index' : (aqAgg.why ? `worst pollutant: ${aqAgg.why} ${aqAgg.why === 'PM2.5' && aqPm25 != null ? aqPm25 + ' µg/m³' : ''}` : 'worst-of multi-pollutant')) : ''}</div>
    </div>
  </div>
  ${sunEventsLine}
  <div class="conditions-now-footnote"${_conditionsTooltipAttr(TANNING_MODIFIERS_NOTE, { focusable: true })}>
    Burn-time estimates are based on Fitzpatrick skin type — actual burn / tan response also depends on <strong>genetics</strong> (e.g. MC1R variants), <strong>diet</strong> (omega-3, antioxidants), <strong>recent sun history</strong>, <strong>circadian state</strong>, sleep, and hydration.
  </div>
  ${trustFooter}`;
}

// ─── Conditions-strip helpers ─────────────────────────────────────────

// What the UVI means for vit-D synthesis (Holick threshold).
function _vitDLabel(uvi) {
  if (uvi == null || uvi < 1) return 'no vit-D synthesis';
  if (uvi < 3) return 'vit-D synthesis weak';
  if (uvi < 6) return 'vit-D synthesis moderate';
  if (uvi < 9) return 'vit-D synthesis strong';
  return 'vit-D synthesis ample (burn risk dominates)';
}

// "Time to MED" for the user — accounts for the real UVI curve from now
// until sunset, not a naive constant-UVI extrapolation. At 6pm with UVI
// 1.7 falling toward 0, naive math says "burn in 14 hours" which is
// nonsense — the sun sets first.
//
// Integrates the user's accumulated erythemal dose hour-by-hour using
// Open-Meteo's hourly forecast. Returns one of:
//   { kind: 'no-uv' }                  — UV near zero, no risk to compute
//   { kind: 'safe-til-sunset' }        — won't burn before sun is down
//   { kind: 'minutes', value: N }      — N minutes from now to MED
function _timeToMed(uvi, fitzpatrick, atm) {
  if (uvi == null || uvi < 0.5) return { kind: 'no-uv' };
  // Standard MED in J/m² by Fitzpatrick type. UVI 1 ≈ 25 mW/m² erythemal.
  const medJoules = { I: 200, II: 250, III: 300, IV: 450, V: 600, VI: 1000 };
  const j = medJoules[fitzpatrick] || medJoules.III;
  const bodyFraction = 0.20; // face + arms + hands + neck default
  const ratePerUvi = 25 * bodyFraction; // mW/m² of erythemal per UVI unit

  // Try the integrated path first — uses Open-Meteo's hourly UVI forecast
  // for today, accumulating dose from now until sunset.
  const hourly = atm?.hourly;
  const sunset = atm?.daily?.sunset;
  if (Array.isArray(hourly?.time) && Array.isArray(hourly?.uv_index) && sunset) {
    const sunsetMs = new Date(sunset).getTime();
    const now = Date.now();
    if (sunsetMs <= now) return { kind: 'no-uv' }; // already past sunset
    let cumulativeJ = 0;
    let lastT = now;
    for (let i = 0; i < hourly.time.length; i++) {
      const tStart = new Date(hourly.time[i]).getTime();
      const tEnd = i + 1 < hourly.time.length ? new Date(hourly.time[i + 1]).getTime() : tStart + 3600000;
      // Skip hours fully before now
      if (tEnd <= now) continue;
      // Stop at sunset
      if (tStart >= sunsetMs) break;
      const segStart = Math.max(tStart, lastT, now);
      const segEnd = Math.min(tEnd, sunsetMs);
      if (segEnd <= segStart) continue;
      const segMinutes = (segEnd - segStart) / 60000;
      const hourlyUvi = hourly.uv_index[i] || 0;
      const erythemalRate = hourlyUvi * ratePerUvi; // mW/m²
      const jPerMin = erythemalRate * 60 / 1000;    // J/m² per minute at this UVI
      const segJ = jPerMin * segMinutes;
      if (cumulativeJ + segJ >= j) {
        // Crosses MED inside this segment — find the exact minute
        const remainingJ = j - cumulativeJ;
        const minutesIntoSeg = jPerMin > 0 ? remainingJ / jPerMin : 0;
        const minutesFromNow = Math.round((segStart - now) / 60000 + minutesIntoSeg);
        return { kind: 'minutes', value: Math.max(0, minutesFromNow) };
      }
      cumulativeJ += segJ;
      lastT = segEnd;
    }
    // Made it to sunset without crossing MED
    return { kind: 'safe-til-sunset' };
  }

  // Fallback — no hourly forecast available (e.g. CAMS / NOAA / offline).
  // Use constant-UVI extrapolation, but clamp at "won't burn today" if the
  // result exceeds time until sunset (when known).
  const erythemalRate = uvi * ratePerUvi;
  if (erythemalRate <= 0) return { kind: 'no-uv' };
  const jPerMin = erythemalRate * 60 / 1000;
  const naiveMin = Math.round(j / jPerMin);
  if (sunset) {
    const minToSunset = Math.max(0, (new Date(sunset).getTime() - Date.now()) / 60000);
    if (naiveMin > minToSunset) return { kind: 'safe-til-sunset' };
  }
  return { kind: 'minutes', value: naiveMin };
}

// Format minutes as "Xh Ym" / "Xm" / "<1m"
function _fmtMinutes(min) {
  if (min == null) return '—';
  if (min < 1) return '<1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Sun-position headline — what the sun's doing, in plain English. Used
// as the value cell instead of bare degrees.
function _sunPositionLabel(elevDeg) {
  if (elevDeg == null) return '—';
  if (elevDeg < 0) return 'Sun set';
  if (elevDeg < 5) return 'At horizon';
  if (elevDeg < 15) return 'Very low';
  if (elevDeg < 30) return 'Low';
  if (elevDeg < 50) return 'Mid-sky';
  if (elevDeg < 70) return 'High';
  return 'Overhead';
}

// Sun-position sub — supporting context with shadow ratio + UV strength.
function _sunPositionSub(elevDeg) {
  if (elevDeg == null || elevDeg < 0) return 'no UV';
  if (elevDeg < 5) return 'UV negligible';
  const ratio = 1 / Math.tan(elevDeg * Math.PI / 180);
  const r = ratio.toFixed(1);
  if (elevDeg >= 70) return `UV peak · shadow ${r}× height`;
  if (elevDeg >= 50) return `UV strong · shadow ${r}× height`;
  if (elevDeg >= 30) return `UV building · shadow ${r}× height`;
  if (elevDeg >= 15) return `UV moderate · shadow ${r}× height`;
  return `UV weak · shadow ${r}× height`;
}

// Compute the time of day when UV-A first reaches the ground (and when
// it stops). UV-A 320-400 nm requires sun elevation ~5° above the horizon
// — below that, atmospheric path is too long for meaningful 320-400 nm to
// penetrate. This is "biological dawn" / "biological dusk" — the moments
// when the eye + skin actually start receiving the violet/UV-A signals
// that drive circadian entrainment, α-MSH / β-endorphin release, and
// retinal dopamine. Much more biologically meaningful than civil sunrise.
//
// Returns { firstUVA: <Date>, lastUVA: <Date> } for the day, or nulls if
// the sun never rises high enough (polar winter) or coords unavailable.
//
// Threshold: 5° elevation. Reference: Hattar / Lambert eye-skin axis
// literature; OZONE-corrected UV-A penetration models (Madronich 1998).
function _computeUvaWindow(coords, dateLike) {
  if (!coords || !window.solarZenithAngle) return { firstUVA: null, lastUVA: null };
  const baseDate = dateLike ? new Date(dateLike) : new Date();
  const day = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const SAMPLE_STEP_MIN = 1;
  const ELEVATION_THRESHOLD_DEG = 5; // sun elevation above horizon for UV-A penetration
  let firstUVA = null;
  let lastUVA = null;
  // Scan minute-by-minute through the day. Lighter than it looks — 1440
  // calls to a small math function per render, debounced by the 5-min
  // conditions cache, so amortized cost is trivial.
  for (let m = 0; m < 24 * 60; m += SAMPLE_STEP_MIN) {
    const t = new Date(day.getTime() + m * 60_000);
    const zenith = window.solarZenithAngle(t, coords.lat, coords.lon);
    const elevation = 90 - zenith;
    if (elevation >= ELEVATION_THRESHOLD_DEG) {
      if (!firstUVA) firstUVA = t;
      lastUVA = t;
    }
  }
  return { firstUVA, lastUVA };
}

// Sun-position narrative — uses the "shadow rule" as a UV-strength proxy.
// Elevation drives UV intensity: shadow shorter than your height = sun
// high = strong UV. Shadow longer than you = sun low = weak UV. Returns
// "qualitative phrase · shadow ratio" so users see both the meaning and
// the underlying number.
function _shadowNarrative(elevDeg) {
  if (elevDeg == null) return '';
  if (elevDeg < 5) return 'sun grazing horizon · UV negligible';
  const ratio = 1 / Math.tan(elevDeg * Math.PI / 180);
  const r = ratio.toFixed(1);
  if (elevDeg >= 70) return `sun overhead · UV peak (shadow ${r}× height)`;
  if (elevDeg >= 50) return `sun high · UV strong (shadow ${r}× height)`;
  if (elevDeg >= 30) return `sun mid-sky · UV building (shadow ${r}× height)`;
  if (elevDeg >= 15) return `sun low · UV moderate (shadow ${r}× height)`;
  return `sun very low · UV weak (shadow ${r}× height)`;
}

// Tooltip explainer attached to the Sun-position cell so the shadow-rule
// makes sense to anyone not familiar with the heuristic.
const SHADOW_RULE_HINT = 'Shadow rule: when your shadow is shorter than you, UV is high (strong sunburn risk). When shadow is longer than you, UV is weak. Used by dermatology orgs as a no-meter outdoor heuristic.';

// The Fitzpatrick scale is a coarse model — actual burn / tan response is
// modulated by genetics (MC1R / IRF4 / TYR variants), diet (omega-3,
// lycopene, antioxidants), recent sun history (tan-induced photoadapt),
// circadian state (melanin synthesis is rhythmic), sleep, and hydration.
// Surfaced as a tooltip on the burn-estimate + as a footnote line.
const TANNING_MODIFIERS_NOTE = 'Estimate based on Fitzpatrick skin type alone. Actual burn time also depends on genetics (e.g. MC1R variants), diet (omega-3 / antioxidants), recent sun history (tan), circadian state, sleep, and hydration. Use as a starting point, not gospel.';

// Friendly cloud-cover narrative — "Overcast" / "Partly cloudy" / "Clear sky".
function _cloudNarrative(pct) {
  if (pct == null) return null;
  if (pct < 10) return 'Clear sky';
  if (pct < 30) return 'Mostly clear';
  if (pct < 60) return 'Partly cloudy';
  if (pct < 90) return 'Mostly cloudy';
  return 'Overcast';
}

// Aggregate AQ from multiple pollutants — return the worst-of category so
// a user with high NO2 but low PM2.5 isn't told "Good" (false reassurance).
// EAQI from Open-Meteo (when available) is preferred — it's already the
// official multi-pollutant aggregation.
function _aggregateAQ(airQuality, fallbackEaqi) {
  const cats = [];
  // Open-Meteo's european_aqi is on a 0-500 scale (not the 1-6 categorical
  // version): 0-20 Good, 20-40 Fair, 40-60 Moderate, 60-80 Poor,
  // 80-100 Very Poor, 100+ Extremely Poor.
  if (Number.isFinite(fallbackEaqi)) {
    if (fallbackEaqi <= 20) cats.push({ cls: 'good', label: 'Good', score: 0, why: 'EAQI' });
    else if (fallbackEaqi <= 40) cats.push({ cls: 'good', label: 'Fair', score: 1, why: 'EAQI' });
    else if (fallbackEaqi <= 60) cats.push({ cls: 'moderate', label: 'Moderate', score: 2, why: 'EAQI' });
    else if (fallbackEaqi <= 80) cats.push({ cls: 'unhealthy-sensitive', label: 'Poor', score: 3, why: 'EAQI' });
    else if (fallbackEaqi <= 100) cats.push({ cls: 'unhealthy', label: 'Very poor', score: 4, why: 'EAQI' });
    else cats.push({ cls: 'hazardous', label: 'Extremely poor', score: 5, why: 'EAQI' });
  }
  if (airQuality) {
    const pm25 = airQuality.pm25;
    const pm10 = airQuality.pm10;
    const no2 = airQuality.no2;
    if (Number.isFinite(pm25)) {
      if (pm25 < 12) cats.push({ cls: 'good', label: 'Good', score: 0, why: 'PM2.5' });
      else if (pm25 < 35) cats.push({ cls: 'moderate', label: 'Moderate', score: 2, why: 'PM2.5' });
      else if (pm25 < 55) cats.push({ cls: 'unhealthy-sensitive', label: 'Unhealthy for sensitive', score: 3, why: 'PM2.5' });
      else if (pm25 < 150) cats.push({ cls: 'unhealthy', label: 'Unhealthy', score: 4, why: 'PM2.5' });
      else cats.push({ cls: 'hazardous', label: 'Hazardous', score: 5, why: 'PM2.5' });
    }
    if (Number.isFinite(pm10)) {
      if (pm10 < 54) cats.push({ cls: 'good', label: 'Good', score: 0, why: 'PM10' });
      else if (pm10 < 154) cats.push({ cls: 'moderate', label: 'Moderate', score: 2, why: 'PM10' });
      else if (pm10 < 254) cats.push({ cls: 'unhealthy-sensitive', label: 'Unhealthy for sensitive', score: 3, why: 'PM10' });
      else cats.push({ cls: 'unhealthy', label: 'Unhealthy', score: 4, why: 'PM10' });
    }
    if (Number.isFinite(no2)) {
      // µg/m³ — WHO 1-hour guideline 200, EU annual limit 40, EAQI thresholds
      if (no2 < 40) cats.push({ cls: 'good', label: 'Good', score: 0, why: 'NO₂' });
      else if (no2 < 90) cats.push({ cls: 'moderate', label: 'Moderate', score: 2, why: 'NO₂' });
      else if (no2 < 120) cats.push({ cls: 'unhealthy-sensitive', label: 'Unhealthy for sensitive', score: 3, why: 'NO₂' });
      else if (no2 < 230) cats.push({ cls: 'unhealthy', label: 'Unhealthy', score: 4, why: 'NO₂' });
      else cats.push({ cls: 'hazardous', label: 'Hazardous', score: 5, why: 'NO₂' });
    }
  }
  if (cats.length === 0) return null;
  // Worst-of — highest score wins
  cats.sort((a, b) => b.score - a.score);
  return cats[0];
}

// Format an ISO time as HH:MM in the local timezone (Open-Meteo returns
// "2026-04-30T13:18" already in the requested timezone, so just slice).
function _fmtTime(iso) {
  if (!iso) return '—';
  // Slice the HH:MM portion — Open-Meteo returns YYYY-MM-DDTHH:MM
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : iso;
}

// Surface-ozone (smog) categorization. WHO 8-hour guideline is 100 µg/m³.
// Returns the WHO color class + a layperson-friendly category + an
// actionable line about outdoor exercise (the main lifestyle impact —
// surface ozone irritates lungs, worse during exertion).
function _surfaceOzoneCls(ugm3) {
  if (ugm3 == null) return null;
  if (ugm3 < 50) return 'good';
  if (ugm3 < 100) return 'moderate';
  if (ugm3 < 180) return 'unhealthy-sensitive';
  if (ugm3 < 240) return 'unhealthy';
  return 'hazardous';
}
function _surfaceOzoneLabel(ugm3) {
  if (ugm3 == null) return null;
  if (ugm3 < 50)  return { label: 'Clean',     action: 'fine for any outdoor activity' };
  if (ugm3 < 100) return { label: 'Mild',      action: 'fine for most · sensitive may feel it' };
  if (ugm3 < 180) return { label: 'Moderate',  action: 'go easy on hard cardio outdoors' };
  if (ugm3 < 240) return { label: 'Unhealthy', action: 'limit outdoor exercise' };
  return                  { label: 'Hazardous', action: 'avoid outdoor exercise' };
}

// Tooltip explainer for the smog cell — what surface ozone is + why it matters.
const SMOG_HINT = 'Smog = ground-level ozone (O₃), formed when sunlight reacts with vehicle exhaust + industrial emissions. Higher levels irritate lungs and reduce exercise capacity, especially for asthma, COPD, kids, elderly. WHO 8-hour guideline: 100 µg/m³.';

// Map internal provider keys to user-friendly attribution labels.
function _humanProviderLabel(source) {
  if (!source) return 'unknown';
  if (source.startsWith('open_meteo')) return 'Open-Meteo';
  if (source.startsWith('selfhost')) return 'self-hosted';
  if (source.startsWith('cams')) return 'CAMS';
  if (source.startsWith('noaa')) return 'NOAA NWS';
  if (source.startsWith('manual')) return 'manual entry';
  if (source.startsWith('zenith_offline') || source.startsWith('offline')) return 'offline estimate';
  return source.replace(/_stale$/, '');
}

// Check the atmosphere response for plausibility — flag suspicious values
// that suggest a parser bug, a stale provider, or a cosmic-ray bit-flip.
function _sanityCheckAtmosphere(atm, coords) {
  const warnings = [];
  if (atm.uvIndex != null) {
    if (atm.uvIndex < 0) warnings.push(`UVI is ${atm.uvIndex} (should be ≥ 0)`);
    if (atm.uvIndex > 16) warnings.push(`UVI is ${atm.uvIndex} (extreme — typical max ~12-13)`);
    // Live UVI exceeding today's forecast peak by >20% suggests a stale
    // or wrong-hour cache entry (the same bug pattern that produced the
    // "saw UVI 8+ briefly when daily max was 6" report). Forecast peak
    // can legitimately revise upward by ~10-15% as forecast models
    // refresh through the day, but a 20%+ overshoot is almost always a
    // data anomaly worth surfacing.
    const peak = atm.daily?.uvIndexMax;
    if (Number.isFinite(peak) && peak > 0 && atm.uvIndex > peak * 1.2) {
      warnings.push(`UVI ${atm.uvIndex.toFixed(1)} exceeds today's forecast peak (${peak.toFixed(1)}) — likely stale data, try Refresh`);
    }
    // UVI should be near zero when sun is below horizon
    try {
      if (window.solarZenithAngle && coords) {
        const z = window.solarZenithAngle(new Date(), coords.lat, coords.lon);
        if (z > 95 && atm.uvIndex > 0.3) {
          warnings.push(`UVI ${atm.uvIndex} reported but sun is ${Math.round(z - 90)}° below horizon`);
        }
      }
    } catch (e) {}
  }
  if (atm.cloudCover != null && (atm.cloudCover < 0 || atm.cloudCover > 100)) {
    warnings.push(`Cloud cover ${atm.cloudCover}% out of 0-100 range`);
  }
  const aq = atm.airQuality || {};
  if (aq.pm25 != null && aq.pm25 < 0) warnings.push(`PM2.5 reported as negative (${aq.pm25})`);
  if (aq.pm10 != null && aq.pm10 < 0) warnings.push(`PM10 reported as negative (${aq.pm10})`);
  if (aq.no2 != null && aq.no2 < 0) warnings.push(`NO₂ reported as negative (${aq.no2})`);
  if (aq.surfaceOzoneUgM3 != null) {
    if (aq.surfaceOzoneUgM3 < 0) warnings.push(`Surface ozone reported as negative (${aq.surfaceOzoneUgM3})`);
    else if (aq.surfaceOzoneUgM3 > 1000) warnings.push(`Surface ozone ${aq.surfaceOzoneUgM3} µg/m³ extreme — typical max ~400`);
  }
  if (aq.european_aqi != null && (aq.european_aqi < 0 || aq.european_aqi > 500)) {
    warnings.push(`European AQI ${aq.european_aqi} outside 0-500 range`);
  }
  if (atm.ozoneDU != null && (atm.ozoneDU < 100 || atm.ozoneDU > 600)) {
    warnings.push(`Ozone column ${atm.ozoneDU} DU outside typical 200-450 range`);
  }
  return warnings;
}

// Format elapsed milliseconds as mm:ss (under 1hr) or h:mm:ss (above).
// Used by the dashboard Light Today CTA so its timer ticks every second.
function _formatElapsedShort(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
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

// True if current time is within ±2h of sunrise / midday / sunset.
// Uses a simple geographic estimate from the active profile's country (or
// 50°N if unset). Browser locale doesn't carry lat/lon, so we fall back to
// time-of-day heuristics: 5–9am, 11am–2pm, 4–8pm.
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
// Marker detail modals are already a focused view, so keep history compact by
// default and expand in place instead of opening a nested history modal.
const MARKER_HISTORY_DEFAULT_CAP = 3;
const MARKER_HISTORY_EXPANDED_CAP = 40;

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

let _dashboardOrganizeMode = false;
let _draggingDashboardWidgetId = null;
let _dashboardGenomeSnpLoadPromise = null;

const DASHBOARD_WIDGETS_VERSION = 10;
const DASHBOARD_WIDGETS = [
  { id: 'bio-age', source: 'Labs', title: 'Biological Age', description: 'Age-derived biological readout', size: 'half', render: renderDashboardBioAgeWidget },
  { id: 'focus', source: 'Insight', title: 'Current Focus', description: 'One synthesized read on the latest data', size: 'half', render: () => renderFocusCard() },
  { id: 'recommendations', source: 'Insight', title: 'Recommended Next Steps', description: 'Top data-linked actions across lenses', size: 'half', render: renderDashboardRecommendationsWidget },
  { id: 'spotlight', source: 'Labs', title: 'Current Priority', description: 'Highest-priority marker with the reason it was selected', size: 'half', render: renderDashboardSpotlightWidget },
  { id: 'wearables', source: 'Body', title: 'Biometrics Overview', description: 'User-selected body signal tiles', size: 'full', render: renderDashboardWearableTilesWidget },
  { id: 'quick-markers', source: 'Labs', title: 'Quick Markers', description: 'Pinned and priority-ranked marker tiles', size: 'full', render: renderDashboardQuickMarkersWidget },
  { id: 'insights', source: 'Insight', title: 'AI Insights', description: 'Top trend and range reads', size: 'half', render: renderDashboardInsightsListWidget },
  { id: 'genome', source: 'Genome', title: 'Genetic Modifiers', description: 'Actionable SNP context relevant to labs and goals', size: 'half', render: renderDashboardGenomeWidget },
  { id: 'alerts', source: 'Labs', title: 'Needs Attention', description: 'Sudden changes and critical out-of-range markers', size: 'half', render: renderDashboardAlertsWidget },
  { id: 'correlation', source: 'Tools', title: 'Correlations', description: 'Highest linked marker pairs', size: 'half', render: renderDashboardCorrelationWidget },
  { id: 'light-today', source: 'Light', title: 'Light Today', description: "Today's light synthesis across sun, devices, and environment", render: renderDashboardLightTodayWidget },
  { id: 'light-conditions-now', source: 'Light', title: 'Conditions Now', description: 'Current outdoor UV, atmosphere, and air quality', size: 'full', render: renderDashboardLightConditionsWidget },
  { id: 'light-session-log', source: 'Light', title: 'Log Sessions', description: 'Start sun or therapy sessions quickly', size: 'third', render: renderDashboardLightSessionLogWidget },
  { id: 'light-channels', source: 'Light', title: 'Light Channels', description: 'Seven-day rhythm across light biology channels', size: 'half', render: renderDashboardLightChannelsWidget },
  { id: 'profile-context', source: 'Insight', title: 'Profile Context', description: 'Goals, history, lifestyle, and context cards', render: () => renderProfileContextCards() },
  { id: 'cycle', source: 'Body', title: 'Cycle', description: 'Menstrual cycle context', size: 'half', isAvailable: () => state.profileSex === 'female', render: (ctx) => renderMenstrualCycleSection(ctx.data, { variant: 'dashboard', showHeader: false }) },
  { id: 'supplements', source: 'Body', title: 'Supplements & Meds', description: 'Supplements and medication timeline', render: () => renderSupplementsSection() },
  { id: 'key-trends', source: 'Labs', title: 'Key Trends', description: 'Auto-selected markers from your current range', render: renderDashboardKeyTrendsWidget },
  { id: 'notes', source: 'Labs', title: 'Notes', description: 'Timeline notes linked to your data', render: renderDashboardNotesWidget },
];
const DASHBOARD_WIDGET_SOURCE_ORDER = ['Labs', 'Genome', 'Body', 'Light', 'Insight', 'Tools'];
const DASHBOARD_WIDGET_DEFAULT_IDS = [
  'focus',
  'cycle',
  'spotlight',
  'quick-markers',
  'key-trends',
  'recommendations',
  'profile-context',
  'wearables',
  'bio-age',
];

function dashboardWidgetStorageKey() {
  return profileStorageKey(state.currentProfile || 'default', `dashboardWidgetsV${DASHBOARD_WIDGETS_VERSION}`);
}

function isDashboardFixedWidgetAvailable(def) {
  return !!def && (typeof def.isAvailable !== 'function' || def.isAvailable());
}

function getAvailableDashboardFixedWidgets() {
  return DASHBOARD_WIDGETS.filter(isDashboardFixedWidgetAvailable);
}

function getAvailableDashboardFixedWidgetIds() {
  return getAvailableDashboardFixedWidgets().map(w => w.id);
}

function dashboardMarkerWidgetId(markerId) {
  return safeMarkerId(markerId) ? `marker_${markerId}` : '';
}

function dashboardMarkerIdFromWidgetId(widgetId) {
  if (typeof widgetId !== 'string' || !widgetId.startsWith('marker_')) return '';
  const markerId = widgetId.slice('marker_'.length);
  return safeMarkerId(markerId) ? markerId : '';
}

function isDashboardMarkerWidgetId(widgetId) {
  return !!dashboardMarkerIdFromWidgetId(widgetId);
}

function isKnownDashboardWidgetId(id) {
  return getAvailableDashboardFixedWidgetIds().includes(id) || isDashboardMarkerWidgetId(id);
}

const DASHBOARD_MANUAL_BIOMETRIC_METRICS = ['weight', 'bp_systolic', 'rhr'];
const DASHBOARD_BIOMETRIC_STALE_MS = 12 * 60 * 60 * 1000;

function dashboardBiometricSelectionKey() {
  return profileStorageKey(state.currentProfile || 'default', 'dashboardBiometricMetricsV1');
}

function getDashboardDefaultWidgetPrefs() {
  const fixedIds = getAvailableDashboardFixedWidgetIds();
  const order = [
    ...DASHBOARD_WIDGET_DEFAULT_IDS,
    ...fixedIds.filter(id => !DASHBOARD_WIDGET_DEFAULT_IDS.includes(id)),
  ].filter(id => fixedIds.includes(id));
  const hidden = fixedIds.filter(id => !DASHBOARD_WIDGET_DEFAULT_IDS.includes(id));
  return { order, hidden };
}

function getDashboardWidgetPrefs() {
  const fallback = getDashboardDefaultWidgetPrefs();
  try {
    const raw = JSON.parse(localStorage.getItem(dashboardWidgetStorageKey()));
    if (!raw || !Array.isArray(raw.order) || !Array.isArray(raw.hidden)) return fallback;
    const fixedIds = getAvailableDashboardFixedWidgetIds();
    const rawOrder = raw.order.filter(id => typeof id === 'string');
    const rawOrderSet = new Set(rawOrder);
    const order = rawOrder.filter(isKnownDashboardWidgetId);
    for (const id of fixedIds) if (!order.includes(id)) order.push(id);
    const hidden = raw.hidden.filter(id => fixedIds.includes(id) || isDashboardMarkerWidgetId(id));
    for (const id of fixedIds) {
      if (!DASHBOARD_WIDGET_DEFAULT_IDS.includes(id) && !rawOrderSet.has(id) && !hidden.includes(id)) hidden.push(id);
    }
    return {
      order,
      hidden,
    };
  } catch (e) {
    return fallback;
  }
}

function saveDashboardWidgetPrefs(prefs) {
  const fixedIds = getAvailableDashboardFixedWidgetIds();
  const order = (prefs.order || []).filter(isKnownDashboardWidgetId);
  for (const id of fixedIds) if (!order.includes(id)) order.push(id);
  const hidden = [...new Set(prefs.hidden || [])].filter(id => fixedIds.includes(id) || isDashboardMarkerWidgetId(id));
  localStorage.setItem(dashboardWidgetStorageKey(), JSON.stringify({ order, hidden }));
}

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
  const saveLabel = candidate.saved ? 'Saved' : 'Save';
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

function getDashboardWidgetDefinition(id, ctx = null) {
  const fixed = DASHBOARD_WIDGETS.find(w => w.id === id);
  if (fixed) return isDashboardFixedWidgetAvailable(fixed) ? fixed : null;
  return getDashboardMarkerWidgetDefinition(id, ctx);
}

function getOrderedDashboardWidgets(prefs = getDashboardWidgetPrefs(), ctx = null) {
  return prefs.order.map(id => getDashboardWidgetDefinition(id, ctx)).filter(Boolean);
}

function getVisibleDashboardWidgetEntries(ctx, prefs = getDashboardWidgetPrefs(), opts = {}) {
  const includeEmpty = opts.includeEmpty ?? _dashboardOrganizeMode;
  const excludeIds = opts.excludeIds || new Set();
  return getOrderedDashboardWidgets(prefs, ctx)
    .map(def => ({ def, body: def.render(ctx) || '' }))
    .filter(entry => !excludeIds.has(entry.def.id))
    .filter(entry => !prefs.hidden.includes(entry.def.id) && (entry.body || includeEmpty));
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

function renderDashboardControlButtons({ includeReset = false } = {}) {
  const organizeLabel = _dashboardOrganizeMode ? 'Done' : 'Customize';
  return `<button class="dashboard-action-btn" type="button" onclick="window.toggleDashboardOrganizeMode()">${organizeLabel}</button>
    <button class="dashboard-action-btn dashboard-action-btn-primary" type="button" onclick="window.openDashboardWidgetPicker()">+ Add widget</button>
    ${includeReset || _dashboardOrganizeMode ? `<button type="button" class="dashboard-action-btn" onclick="window.resetDashboardWidgets()">Reset layout</button>` : ''}`;
}

function renderDashboardStickyControls() {
  return `<div class="dashboard-sticky-actions" aria-label="Floating dashboard widget controls">${renderDashboardControlButtons()}</div>`;
}

function renderDashboardWidget(entry, prefs, index, visibleEntries) {
  const { def, body } = entry;
  const isHidden = prefs.hidden.includes(def.id);
  if (isHidden || (!body && !_dashboardOrganizeMode)) return '';
  const canMoveUp = index > 0;
  const canMoveDown = index < visibleEntries.length - 1;
  const removeLabel = def.customMarkerWidget ? 'Remove' : 'Hide';
  const controls = _dashboardOrganizeMode ? `<div class="dashboard-widget-tools">
      <button type="button" class="dashboard-widget-tool" ${canMoveUp ? '' : 'disabled'} onclick="window.moveDashboardWidget('${def.id}', -1)" aria-label="Move ${escapeHTML(def.title)} up">↑</button>
      <button type="button" class="dashboard-widget-tool" ${canMoveDown ? '' : 'disabled'} onclick="window.moveDashboardWidget('${def.id}', 1)" aria-label="Move ${escapeHTML(def.title)} down">↓</button>
      <button type="button" class="dashboard-widget-tool" onclick="window.hideDashboardWidget('${def.id}')" aria-label="${removeLabel} ${escapeHTML(def.title)}">${removeLabel}</button>
    </div>` : '';
  return `<section class="dashboard-widget dashboard-widget-${def.size || 'full'}${_dashboardOrganizeMode ? ' is-organizing' : ''}${body ? '' : ' is-empty'}"
      data-widget-id="${escapeAttr(def.id)}"
      ${_dashboardOrganizeMode ? `draggable="true" ondragstart="window.startDashboardWidgetDrag(event, '${def.id}')" ondragover="window.allowDashboardWidgetDrop(event)" ondrop="window.dropDashboardWidget(event, '${def.id}')"` : ''}>
    <div class="dashboard-widget-chrome">
      <div class="dashboard-widget-handle" aria-hidden="true">⋮⋮</div>
      <div class="dashboard-widget-heading">
        ${def.source ? `<div class="dashboard-widget-source">${escapeHTML(def.source)}</div>` : ''}
        <div class="dashboard-widget-title">${escapeHTML(def.title)}</div>
        <div class="dashboard-widget-description">${escapeHTML(def.description || '')}</div>
      </div>
      ${controls}
    </div>
    <div class="dashboard-widget-body">${body || '<div class="dashboard-widget-empty">No data available for this widget.</div>'}</div>
  </section>`;
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
  if (state._activeDetailMarkerId === id) showDetailModal(id);
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
    ...MOBILE_WEARABLE_PRIORITY,
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

function renderDashboardWidgets(ctx, title) {
  const prefs = getDashboardWidgetPrefs();
  const visibleEntries = getVisibleDashboardWidgetEntries(ctx, prefs);
  let html = renderDashboardGreeting(ctx, title, visibleEntries.length);
  html += `<div class="drop-zone drop-zone-hidden" id="drop-zone"></div>`;
  html += renderOnboardingBanner();
  html += renderAIConnectionReminder();
  html += renderDashboardStickyControls();
  html += `<div class="dashboard-widgets${_dashboardOrganizeMode ? ' is-organizing' : ''}">`;
  visibleEntries.forEach((entry, index) => { html += renderDashboardWidget(entry, prefs, index, visibleEntries); });
  if (visibleEntries.length === 0) {
    html += `<div class="dashboard-widget dashboard-widget-full is-empty">
      <div class="dashboard-widget-empty">No widgets are visible.</div>
    </div>`;
  }
  html += `</div>`;
  if (_dashboardOrganizeMode) {
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
  setRecommendationState('saved', id, !!on);
}

export function dismissRecommendation(id) {
  setRecommendationState('dismissed', id, true);
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
    html += `<div class="trend-alert-card ${cls}" role="button" tabindex="0" aria-label="${escapeHTML(alert.name)} \u2014 ${label}" onclick="showDetailModal('${alert.id}')">
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
    html += `<div class="alert-card ${cls}" role="button" tabindex="0" aria-label="${label}: ${escapeHTML(f.name)} ${escapeHTML(String(f.value))} ${escapeHTML(f.unit)}" onclick="navigate('${f.categoryKey}')">
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

function rerenderDashboardFromWidgetChange() {
  if (state.currentView === 'dashboard') window.navigate?.('dashboard');
}

function scrollDashboardWidgetIntoView(id) {
  if (!id || typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    const el = [...document.querySelectorAll('.dashboard-widget[data-widget-id]')]
      .find(node => node.dataset.widgetId === id);
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  });
}

function getDashboardViewportTargetWidgetId() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return '';
  const targetLine = Math.max(120, window.innerHeight * 0.36);
  const widgets = [...document.querySelectorAll('.dashboard-widget[data-widget-id]')];
  for (const el of widgets) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom >= targetLine) return el.dataset.widgetId || '';
  }
  return widgets.at(-1)?.dataset.widgetId || '';
}

function insertDashboardWidgetAtViewport(prefs, id) {
  prefs.order = (prefs.order || []).filter(widgetId => widgetId !== id);
  prefs.hidden = (prefs.hidden || []).filter(widgetId => widgetId !== id);
  const targetId = getDashboardViewportTargetWidgetId();
  const targetIndex = targetId ? prefs.order.indexOf(targetId) : -1;
  if (targetIndex >= 0) prefs.order.splice(targetIndex, 0, id);
  else prefs.order.push(id);
}

function getDashboardMarkerWidgetOptions(data = getActiveData(), prefs = getDashboardWidgetPrefs()) {
  const existing = new Set((prefs.order || []).map(dashboardMarkerIdFromWidgetId).filter(Boolean));
  const options = [];
  for (const [catKey, category] of Object.entries(data.categories || {})) {
    for (const [markerKey, marker] of Object.entries(category.markers || {})) {
      const markerId = `${catKey}_${markerKey}`;
      if (!safeMarkerId(markerId) || existing.has(markerId) || marker?.hidden || !markerHasData(marker)) continue;
      const latestIdx = getLatestValueIndex(marker.values || []);
      if (latestIdx < 0) continue;
      const range = getEffectiveRangeForDate(marker, latestIdx);
      const value = marker.values[latestIdx];
      const status = getStatus(value, range.min, range.max);
      options.push({
        id: markerId,
        name: marker.name || markerKey,
        category: category.label || catKey,
        value: formatValue(value),
        unit: marker.unit || '',
        status,
      });
    }
  }
  return options.sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.name).localeCompare(String(b.name)));
}

function getDashboardBiometricWidgetOptions(prefs = getDashboardWidgetPrefs()) {
  const selected = new Set(getDashboardBiometricSelection());
  const options = [];
  for (const metricId of getDashboardBiometricMetricOrder()) {
    if (selected.has(metricId)) continue;
    if (metricId === 'bp_diastolic' && selected.has('bp_systolic')) continue;
    const tile = getDashboardBiometricTile(metricId, { allowEmptyManual: true });
    const canon = canonicalMetric(metricId);
    if (!tile || !canon) continue;
    options.push({
      id: metricId,
      label: tile.label,
      sub: canon.sub || '',
      value: tile.value,
      unit: tile.unit,
      change: tile.change,
    });
  }
  return options;
}

function renderDashboardMarkerWidgetOption(option) {
  const searchText = `${option.name} ${option.category} ${option.value} ${option.unit}`.toLowerCase();
  return `<button type="button" class="dashboard-widget-picker-card dashboard-marker-widget-option" data-marker-search="${escapeAttr(searchText)}" onclick="window.addDashboardMarkerWidget('${option.id}')">
    <span class="dashboard-widget-picker-title">${escapeHTML(option.name)}</span>
    <span class="dashboard-widget-picker-sub">${escapeHTML(option.category)} · ${escapeHTML(option.value)}${option.unit ? ` ${escapeHTML(option.unit)}` : ''}</span>
    <span class="dashboard-widget-picker-action">Add marker widget</span>
  </button>`;
}

function renderDashboardBiometricWidgetOption(option) {
  const searchText = `${option.label} ${option.sub} ${option.value} ${option.unit} ${option.change}`.toLowerCase();
  return `<button type="button" class="dashboard-widget-picker-card dashboard-biometric-widget-option" data-biometric-search="${escapeAttr(searchText)}" onclick="window.addDashboardBiometricMetric('${option.id}')">
    <span class="dashboard-widget-picker-title">${escapeHTML(option.label)}${option.sub ? ` <small>${escapeHTML(option.sub)}</small>` : ''}</span>
    <span class="dashboard-widget-picker-sub">${escapeHTML(option.value)}${option.unit ? ` ${escapeHTML(option.unit)}` : ''} · ${escapeHTML(option.change || 'latest')}</span>
    <span class="dashboard-widget-picker-action">Add to Biometrics Overview</span>
  </button>`;
}

function renderDashboardPickerFixedGroups(hidden) {
  if (!hidden.length) return `<div class="dashboard-widget-picker-empty">All dashboard widgets are visible.</div>`;
  const groups = new Map();
  for (const def of hidden) {
    const source = def.source || 'Other';
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push(def);
  }
  const orderedSources = [
    ...DASHBOARD_WIDGET_SOURCE_ORDER,
    ...[...groups.keys()].filter(source => !DASHBOARD_WIDGET_SOURCE_ORDER.includes(source)).sort(),
  ];
  return orderedSources
    .filter(source => groups.has(source))
    .map(source => `<div class="dashboard-widget-picker-source">
      <div class="dashboard-widget-picker-label">${escapeHTML(source)}</div>
      <div class="dashboard-widget-picker-grid">${groups.get(source).map(def => `<button type="button" class="dashboard-widget-picker-card" onclick="window.showDashboardWidget('${def.id}')">
        <span class="dashboard-widget-picker-title">${escapeHTML(def.title)}</span>
        <span class="dashboard-widget-picker-sub">${escapeHTML(def.description || '')}</span>
        <span class="dashboard-widget-picker-action">Add dashboard widget</span>
      </button>`).join('')}</div>
    </div>`)
    .join('');
}

function filterDashboardPickerOptions(selector, dataAttr, emptyId, query = '') {
  const needle = String(query || '').trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll?.(selector).forEach(el => {
    const match = !needle || (el.dataset[dataAttr] || '').includes(needle);
    el.hidden = !match;
    if (match) visible += 1;
  });
  const empty = document.getElementById(emptyId);
  if (empty) empty.hidden = visible > 0;
}

export function toggleDashboardOrganizeMode(force) {
  _dashboardOrganizeMode = typeof force === 'boolean' ? force : !_dashboardOrganizeMode;
  rerenderDashboardFromWidgetChange();
}

export function moveDashboardWidget(id, direction) {
  const prefs = getDashboardWidgetPrefs();
  const visible = prefs.order.filter(widgetId => !prefs.hidden.includes(widgetId));
  const visibleIndex = visible.indexOf(id);
  const targetVisibleId = visible[visibleIndex + direction];
  if (visibleIndex < 0 || !targetVisibleId) return;
  const from = prefs.order.indexOf(id);
  const to = prefs.order.indexOf(targetVisibleId);
  prefs.order.splice(from, 1);
  prefs.order.splice(to, 0, id);
  saveDashboardWidgetPrefs(prefs);
  rerenderDashboardFromWidgetChange();
}

export function hideDashboardWidget(id) {
  const prefs = getDashboardWidgetPrefs();
  if (isDashboardMarkerWidgetId(id)) {
    prefs.order = prefs.order.filter(widgetId => widgetId !== id);
    prefs.hidden = prefs.hidden.filter(widgetId => widgetId !== id);
  } else if (!prefs.hidden.includes(id)) {
    prefs.hidden.push(id);
  }
  saveDashboardWidgetPrefs(prefs);
  rerenderDashboardFromWidgetChange();
}

export function showDashboardWidget(id) {
  if (!getAvailableDashboardFixedWidgetIds().includes(id)) return;
  const prefs = getDashboardWidgetPrefs();
  insertDashboardWidgetAtViewport(prefs, id);
  saveDashboardWidgetPrefs(prefs);
  closeDashboardWidgetPicker();
  rerenderDashboardFromWidgetChange();
  scrollDashboardWidgetIntoView(id);
}

export function addDashboardWidgetFromLens(id) {
  showDashboardWidget(id);
  if (state.currentView && state.currentView !== 'dashboard') window.navigate?.(state.currentView);
  showNotification('Added to Dashboard', 'success');
}

export function removeDashboardWidgetFromLens(id) {
  if (!getAvailableDashboardFixedWidgetIds().includes(id)) return;
  const prefs = getDashboardWidgetPrefs();
  if (!prefs.hidden.includes(id)) prefs.hidden.push(id);
  saveDashboardWidgetPrefs(prefs);
  if (state.currentView === 'dashboard') rerenderDashboardFromWidgetChange();
  else if (state.currentView) window.navigate?.(state.currentView);
  showNotification('Removed from Dashboard', 'info');
}

export function addDashboardMarkerWidget(markerId) {
  const widgetId = dashboardMarkerWidgetId(markerId);
  if (!widgetId) return;
  const hit = getDashboardMarkerById(getActiveData(), markerId);
  if (!hit) {
    showNotification('That marker has no data yet', 'info');
    return;
  }
  const prefs = getDashboardWidgetPrefs();
  insertDashboardWidgetAtViewport(prefs, widgetId);
  saveDashboardWidgetPrefs(prefs);
  closeDashboardWidgetPicker();
  rerenderDashboardFromWidgetChange();
  scrollDashboardWidgetIntoView(widgetId);
}

export function addDashboardBiometricMetric(metricId) {
  if (!safeMarkerId(metricId) || !canonicalMetric(metricId)) return;
  if (!getDashboardBiometricTile(metricId, { allowEmptyManual: true })) {
    showNotification('That biometric has no data yet', 'info');
    return;
  }
  const selected = getDashboardBiometricSelection();
  if (!selected.includes(metricId)) saveDashboardBiometricSelection([...selected, metricId]);
  const prefs = getDashboardWidgetPrefs();
  const wasHidden = prefs.hidden.includes('wearables');
  prefs.hidden = prefs.hidden.filter(id => id !== 'wearables');
  if (wasHidden) prefs.order = prefs.order.filter(id => id !== 'wearables');
  if (wasHidden || !prefs.order.includes('wearables')) insertDashboardWidgetAtViewport(prefs, 'wearables');
  saveDashboardWidgetPrefs(prefs);
  closeDashboardWidgetPicker();
  rerenderDashboardFromWidgetChange();
  scrollDashboardWidgetIntoView('wearables');
}

export function addDashboardBiometricWidget(metricId) {
  addDashboardBiometricMetric(metricId);
}

export function removeDashboardBiometricMetric(metricId) {
  const selected = getDashboardBiometricSelection().filter(id => id !== metricId);
  saveDashboardBiometricSelection(selected);
  rerenderDashboardFromWidgetChange();
}

export function filterDashboardMarkerWidgetPicker(query = '') {
  filterDashboardPickerOptions('.dashboard-marker-widget-option', 'markerSearch', 'dashboard-marker-widget-empty', query);
}

export function filterDashboardBiometricWidgetPicker(query = '') {
  filterDashboardPickerOptions('.dashboard-biometric-widget-option', 'biometricSearch', 'dashboard-biometric-widget-empty', query);
}

export function resetDashboardWidgets() {
  localStorage.removeItem(dashboardWidgetStorageKey());
  localStorage.removeItem(dashboardBiometricSelectionKey());
  _dashboardOrganizeMode = false;
  rerenderDashboardFromWidgetChange();
}

export function clearDashboardWidgets() {
  saveDashboardWidgetPrefs({
    order: [...getAvailableDashboardFixedWidgetIds()],
    hidden: [...getAvailableDashboardFixedWidgetIds()],
  });
  _dashboardOrganizeMode = false;
  rerenderDashboardFromWidgetChange();
}

export function openDashboardWidgetPicker() {
  closeDashboardWidgetPicker();
  const prefs = getDashboardWidgetPrefs();
  const hidden = getAvailableDashboardFixedWidgets().filter(def => prefs.hidden.includes(def.id));
  const hiddenList = renderDashboardPickerFixedGroups(hidden);
  const biometricOptions = getDashboardBiometricWidgetOptions(prefs);
  const biometricList = biometricOptions.length ? biometricOptions.map(renderDashboardBiometricWidgetOption).join('') : '';
  const markerOptions = getDashboardMarkerWidgetOptions(getActiveData(), prefs);
  const markerList = markerOptions.length ? markerOptions.map(renderDashboardMarkerWidgetOption).join('') : '';
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-overlay show" id="dashboard-widget-picker-overlay" onclick="if(event.target===this)window.closeDashboardWidgetPicker()">
    <div class="modal show dashboard-widget-picker" role="dialog" aria-modal="true" aria-labelledby="dashboard-widget-picker-title">
      <button class="modal-close" aria-label="Close" onclick="window.closeDashboardWidgetPicker()">&times;</button>
      <h3 id="dashboard-widget-picker-title">Add dashboard widget</h3>
      <div class="dashboard-widget-picker-section">
        <div class="dashboard-widget-picker-label">Lens and tool widgets</div>
        <div class="dashboard-widget-picker-grid">${hiddenList}</div>
      </div>
      <div class="dashboard-widget-picker-section">
        <label class="dashboard-widget-picker-label" for="dashboard-biometric-widget-search">Body / Biometrics Overview metrics</label>
        <input id="dashboard-biometric-widget-search" class="dashboard-widget-picker-search" type="search" placeholder="Search biometrics to add" oninput="window.filterDashboardBiometricWidgetPicker(this.value)">
        <div class="dashboard-widget-picker-grid dashboard-biometric-widget-grid">${biometricList}</div>
        <div class="dashboard-widget-picker-empty" id="dashboard-biometric-widget-empty" ${biometricOptions.length ? 'hidden' : ''}>All available biometrics are already in the overview.</div>
      </div>
      <div class="dashboard-widget-picker-section">
        <label class="dashboard-widget-picker-label" for="dashboard-marker-widget-search">Labs / Single marker widgets</label>
        <input id="dashboard-marker-widget-search" class="dashboard-widget-picker-search" type="search" placeholder="Search markers" oninput="window.filterDashboardMarkerWidgetPicker(this.value)">
        <div class="dashboard-widget-picker-grid dashboard-marker-widget-grid">${markerList}</div>
        <div class="dashboard-widget-picker-empty" id="dashboard-marker-widget-empty" ${markerOptions.length ? 'hidden' : ''}>No available markers to add.</div>
      </div>
      <div class="dashboard-widget-picker-actions">
        <button type="button" class="dashboard-action-btn" onclick="window.toggleDashboardOrganizeMode(true);window.closeDashboardWidgetPicker()">Customize layout</button>
        <button type="button" class="dashboard-action-btn" onclick="window.resetDashboardWidgets();window.closeDashboardWidgetPicker()">Reset layout</button>
      </div>
    </div>
  </div>`);
}

export function openDashboardBiometricPicker() {
  closeDashboardWidgetPicker();
  const prefs = getDashboardWidgetPrefs();
  const biometricOptions = getDashboardBiometricWidgetOptions(prefs);
  const biometricList = biometricOptions.length ? biometricOptions.map(renderDashboardBiometricWidgetOption).join('') : '';
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-overlay show" id="dashboard-widget-picker-overlay" onclick="if(event.target===this)window.closeDashboardWidgetPicker()">
    <div class="modal show dashboard-widget-picker dashboard-biometric-picker" role="dialog" aria-modal="true" aria-labelledby="dashboard-biometric-picker-title">
      <button class="modal-close" aria-label="Close" onclick="window.closeDashboardWidgetPicker()">&times;</button>
      <h3 id="dashboard-biometric-picker-title">Add biometric metrics</h3>
      <div class="dashboard-widget-picker-section">
        <label class="dashboard-widget-picker-label" for="dashboard-biometric-widget-search">Manual and wearable metrics</label>
        <input id="dashboard-biometric-widget-search" class="dashboard-widget-picker-search" type="search" placeholder="Search biometrics to add" oninput="window.filterDashboardBiometricWidgetPicker(this.value)">
        <div class="dashboard-widget-picker-grid dashboard-biometric-widget-grid">${biometricList}</div>
        <div class="dashboard-widget-picker-empty" id="dashboard-biometric-widget-empty" ${biometricOptions.length ? 'hidden' : ''}>All available biometrics are already in the overview.</div>
      </div>
      <div class="dashboard-widget-picker-actions">
        <button type="button" class="dashboard-action-btn" onclick="window.openSettingsModal && window.openSettingsModal('wearables');window.closeDashboardWidgetPicker()">Connect source</button>
      </div>
    </div>
  </div>`);
  setTimeout(() => document.getElementById('dashboard-biometric-widget-search')?.focus(), 0);
}

export function closeDashboardWidgetPicker() {
  document.getElementById('dashboard-widget-picker-overlay')?.remove();
}

export function startDashboardWidgetDrag(event, id) {
  _draggingDashboardWidgetId = id;
  event.dataTransfer?.setData('text/plain', id);
  event.dataTransfer?.setDragImage?.(event.currentTarget, 20, 20);
}

export function allowDashboardWidgetDrop(event) {
  if (!_dashboardOrganizeMode) return;
  event.preventDefault();
}

export function dropDashboardWidget(event, targetId) {
  if (!_dashboardOrganizeMode) return;
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData('text/plain') || _draggingDashboardWidgetId;
  _draggingDashboardWidgetId = null;
  if (!sourceId || sourceId === targetId) return;
  const prefs = getDashboardWidgetPrefs();
  const from = prefs.order.indexOf(sourceId);
  const to = prefs.order.indexOf(targetId);
  if (from < 0 || to < 0) return;
  prefs.order.splice(from, 1);
  prefs.order.splice(to, 0, sourceId);
  saveDashboardWidgetPrefs(prefs);
  rerenderDashboardFromWidgetChange();
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
// MOBILE DASHBOARD
// ═══════════════════════════════════════════════

const MOBILE_DASHBOARD_QUERY = '(max-width: 799px)';
let _mobileDashboardManualTabLockUntil = 0;

function isMobileDashboardViewport() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(MOBILE_DASHBOARD_QUERY).matches;
}

function getMobileBottomTabForRoute(route) {
  if (['dashboard', 'labs', 'body', 'light', 'insight'].includes(route)) return route;
  if (route === 'recommendations') return 'insight';
  if (route === 'compare' || route === 'correlations') return 'labs';
  if (route && getActiveData().categories?.[route]) return 'labs';
  return 'dashboard';
}

function syncMobileBottomNav(route = state.currentView || 'dashboard') {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('mobile-bottom-tabs');
  const hasDashboardShell = document.body.classList.contains('mobile-dashboard-active');
  const shouldRender = isMobileDashboardViewport() && !hasDashboardShell;
  document.body.classList.toggle('mobile-tabs-active', shouldRender);
  if (!shouldRender) {
    existing?.remove();
    return;
  }
  const activeTab = getMobileBottomTabForRoute(route);
  const html = renderMobileBottomTabs(activeTab, { id: 'mobile-bottom-tabs' });
  if (existing) {
    existing.outerHTML = html;
  } else {
    document.body.insertAdjacentHTML('beforeend', html);
  }
}

export function refreshMobileDashboardActiveTab() {
  if (!document.body.classList.contains('mobile-dashboard-active')) return;
  _mobileDashboardManualTabLockUntil = 0;
  mobileDashboardSetTab('dashboard', { fromScroll: true });
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mobileDashboardMedia = window.matchMedia(MOBILE_DASHBOARD_QUERY);
  const refreshDashboardForBreakpoint = () => {
    if (state.currentView === 'dashboard') window.navigate?.('dashboard');
    else syncMobileBottomNav(state.currentView || 'dashboard');
  };
  if (typeof mobileDashboardMedia.addEventListener === 'function') {
    mobileDashboardMedia.addEventListener('change', refreshDashboardForBreakpoint);
  } else if (typeof mobileDashboardMedia.addListener === 'function') {
    mobileDashboardMedia.addListener(refreshDashboardForBreakpoint);
  }
}

function getMobileDashboardProfile() {
  const profiles = getProfiles() || [];
  return profiles.find(p => p.id === state.currentProfile) || profiles[0] || { id: 'default', name: 'Default' };
}

function getMobileGreetingName(profile) {
  const name = (profile?.name || 'there').trim();
  if (!name || name === 'Default') return 'there';
  return name.split(/\s+/)[0];
}

function getMobileDashboardCounts(data) {
  let markerCount = 0;
  let inRange = 0;
  let flagged = 0;
  for (const cat of Object.values(data.categories || {})) {
    for (const marker of Object.values(cat.markers || {})) {
      if (!markerHasData(marker)) continue;
      markerCount++;
      const idx = getLatestValueIndex(marker.values || []);
      if (idx < 0) continue;
      const value = marker.values[idx];
      const range = getEffectiveRangeForDate(marker, idx);
      const status = getStatus(value, range.min, range.max);
      if (status === 'normal') inRange++;
      else if (status === 'high' || status === 'low') flagged++;
    }
  }
  const latestDate = data.dates?.[data.dates.length - 1] || '';
  return { markerCount, inRange, flagged, latestDate };
}

function mobileStatusLabel(status) {
  if (status === 'normal') return 'In range';
  if (status === 'high') return 'High';
  if (status === 'low') return 'Low';
  return 'No value';
}

function mobileStatusTone(status) {
  if (status === 'normal') return 'good';
  if (status === 'high' || status === 'low') return 'alert';
  return 'muted';
}

function getMobileMarkerSummary(data, catKey, markerKey) {
  const id = `${catKey}_${markerKey}`;
  if (!safeMarkerId(id)) return null;
  const category = data.categories?.[catKey];
  const marker = category?.markers?.[markerKey];
  if (!marker || !markerHasData(marker)) return null;
  const latestIdx = getLatestValueIndex(marker.values || []);
  if (latestIdx < 0) return null;
  const value = marker.values[latestIdx];
  const range = getEffectiveRangeForDate(marker, latestIdx);
  const status = getStatus(value, range.min, range.max);
  const trend = getTrend(marker.values || [], range.min, range.max);
  const labelSource = marker.singlePoint ? [marker.singleDateLabel || 'Latest'] : (data.dateLabels || data.dates || []);
  state.markerRegistry[id] = marker;
  return {
    id,
    name: marker.name || markerKey,
    category: category.label || catKey,
    value: formatValue(value),
    unit: marker.unit || '',
    date: labelSource[latestIdx] || 'Latest',
    status,
    statusLabel: mobileStatusLabel(status),
    tone: mobileStatusTone(status),
    trend,
    values: marker.values || [],
  };
}

function getMobileDashboardMarkers(ctx) {
  const seen = new Set();
  const summaries = [];
  const add = (catKey, markerKey, sourceData = ctx.filteredData) => {
    const id = `${catKey}_${markerKey}`;
    if (seen.has(id)) return;
    const summary = getMobileMarkerSummary(sourceData, catKey, markerKey)
      || getMobileMarkerSummary(ctx.data, catKey, markerKey);
    if (!summary) return;
    seen.add(id);
    summaries.push(summary);
  };

  for (const km of ctx.keyMarkers || []) add(km.cat, km.key);
  for (const alert of ctx.trendAlerts || []) {
    const idx = alert.id.indexOf('_');
    if (idx > 0) add(alert.id.slice(0, idx), alert.id.slice(idx + 1));
  }
  for (const flag of getAllFlaggedMarkers(ctx.data).slice(0, 12)) {
    add(flag.categoryKey, flag.markerKey, ctx.data);
  }
  for (const [catKey, category] of Object.entries(ctx.filteredData.categories || {})) {
    for (const markerKey of Object.keys(category.markers || {})) add(catKey, markerKey);
    if (summaries.length >= 10) break;
  }
  return summaries.slice(0, 10);
}

function renderMobileSparkline(values, status) {
  const points = (values || []).filter(v => v !== null && Number.isFinite(Number(v))).slice(-7).map(Number);
  if (points.length < 2) return `<span class="m-spark m-spark-empty" aria-hidden="true"></span>`;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points.map((value, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 28 - ((value - min) / span) * 24;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="m-spark m-spark-${escapeAttr(status)}" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${escapeAttr(coords)}"></polyline>
  </svg>`;
}

function renderMobileStatCard(item) {
  if (item.type === 'summary') {
    const summaryLabel = `${item.label}: ${item.value}, ${item.meta}`;
    return `<div class="m-stat-card m-stat-summary" role="group" aria-label="${escapeAttr(summaryLabel)}">
      <div class="m-stat-head"><span class="m-marker-dot" aria-hidden="true"></span><span class="m-stat-label">${escapeHTML(item.label)}</span></div>
      <strong>${escapeHTML(item.value)}</strong>
      <span class="m-stat-meta">${escapeHTML(item.meta)}</span>
    </div>`;
  }
  return `<button type="button" class="m-stat-card m-stat-${escapeAttr(item.status)}" onclick="window.showDetailModal('${item.id}')" aria-label="${escapeAttr(item.name + ': ' + item.value + ' ' + item.unit + ', ' + item.statusLabel)}">
    <div class="m-stat-head"><span class="m-marker-dot m-marker-${escapeAttr(item.status)}" aria-hidden="true"></span><span class="m-stat-label">${escapeHTML(item.name)}</span></div>
    <strong>${escapeHTML(item.value)}${item.unit ? `<small>${escapeHTML(item.unit)}</small>` : ''}</strong>
    <span class="m-stat-meta">${escapeHTML(item.statusLabel)}${item.trend?.arrow ? ` · ${escapeHTML(item.trend.arrow)}` : ''}</span>
  </button>`;
}

function getMobileDashboardStats(data, ctx, markers) {
  const counts = getMobileDashboardCounts(data);
  const cards = markers.slice(0, 4).map(marker => ({ ...marker, type: 'marker' }));
  const summaryCards = [
    { type: 'summary', label: 'Attention', value: String((ctx.trendAlerts?.length || 0) + counts.flagged), meta: 'active flags' },
    { type: 'summary', label: 'In range', value: `${counts.inRange}/${counts.markerCount || 0}`, meta: 'latest values' },
    { type: 'summary', label: 'Last labs', value: counts.latestDate ? formatDate(counts.latestDate, 'short') : 'N/A', meta: `${data.dates?.length || 0} dates` },
    { type: 'summary', label: 'Markers', value: String(counts.markerCount), meta: 'tracked' },
  ];
  for (const card of summaryCards) {
    if (cards.length >= 4) break;
    cards.push(card);
  }
  return cards.slice(0, 4);
}

function getMobileDashboardInsights(ctx, markers) {
  const insights = [];
  for (const flag of ctx.criticalFlags.slice(0, 2)) {
    const summary = markers.find(m => m.id === flag.id);
    insights.push({
      id: flag.id,
      tone: 'danger',
      eyebrow: flag.status === 'high' ? 'Critical high' : 'Critical low',
      title: flag.name,
      body: `${formatValue(flag.rawValue)} ${flag.unit || ''} is outside the active range.`,
      meta: summary?.trend?.arrow || summary?.date || '',
    });
  }
  for (const alert of ctx.trendAlerts.slice(0, 3)) {
    if (insights.length >= 3) break;
    insights.push({
      id: alert.id,
      tone: alert.concern.startsWith('past_') || alert.concern.startsWith('sudden_') ? 'warn' : 'info',
      eyebrow: 'Trend',
      title: alert.name,
      body: alert.concern.replace(/_/g, ' '),
      meta: (alert.spark || []).join(' -> '),
    });
  }
  if (insights.length === 0) {
    insights.push({
      tone: 'good',
      eyebrow: 'Snapshot',
      title: 'No urgent trend alerts',
      body: 'Latest high-priority markers are not showing sudden range breaks.',
      meta: `${markers.length} markers in the mobile watch list`,
    });
  }
  return insights.slice(0, 3);
}

function renderMobileInsightCard(insight) {
  const body = `<span class="m-insight-eyebrow">${escapeHTML(insight.eyebrow)}</span>
    <strong>${escapeHTML(insight.title)}</strong>
    <span>${escapeHTML(insight.body)}</span>
    ${insight.meta ? `<small>${escapeHTML(insight.meta)}</small>` : ''}`;
  if (insight.id && safeMarkerId(insight.id)) {
    return `<button type="button" class="m-insight m-insight-${escapeAttr(insight.tone)}" onclick="window.showDetailModal('${insight.id}')">${body}</button>`;
  }
  return `<div class="m-insight m-insight-${escapeAttr(insight.tone)}">${body}</div>`;
}

function renderMobileMarkerRow(marker) {
  return `<button type="button" class="m-marker-row" onclick="window.showDetailModal('${marker.id}')" aria-label="${escapeAttr(marker.name + ': ' + marker.value + ' ' + marker.unit)}">
    <span class="m-marker-dot m-marker-${escapeAttr(marker.status)}" aria-hidden="true"></span>
    <span class="m-marker-main">
      <strong>${escapeHTML(marker.name)}</strong>
      <small>${escapeHTML(marker.category)} · ${escapeHTML(marker.date)}</small>
    </span>
    ${renderMobileSparkline(marker.values, marker.status)}
    <span class="m-marker-value">
      <strong>${escapeHTML(marker.value)}</strong>
      ${marker.unit ? `<small>${escapeHTML(marker.unit)}</small>` : ''}
    </span>
  </button>`;
}

const MOBILE_WEARABLE_PRIORITY = [
  'hrv_rmssd',
  'sleep_score',
  'readiness_score',
  'steps',
  'rhr',
  'weight',
  'body_fat_pct',
  'bp_systolic',
];

function formatMobileWearableValue(metricId, metric, summary) {
  if (metricId === 'bp_systolic' && summary?.metrics?.bp_diastolic?.latest != null) {
    return `${formatValue(metric.latest)}/${formatValue(summary.metrics.bp_diastolic.latest)}`;
  }
  const value = Number(metric?.latest);
  if (!Number.isFinite(value)) return '—';
  if (metricId === 'steps' && Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  }
  return formatValue(value);
}

function formatMobileWearableDelta(metricId, metric, canon) {
  const latest = Number(metric?.latest);
  const baseline = Number(metric?.baseline);
  if (!Number.isFinite(latest) || !Number.isFinite(baseline) || baseline === 0) return '';
  if (metricId === 'steps') return '';
  if (canon?.sub === 'Δ') {
    const diff = latest - baseline;
    const arrow = diff > 0.005 ? '↑' : diff < -0.005 ? '↓' : '→';
    return `${arrow} ${Math.abs(diff).toFixed(2)}${canon.unit || ''}`;
  }
  const pct = ((latest - baseline) / baseline) * 100;
  if (Math.abs(pct) < 0.5) return '→ baseline';
  const arrow = pct > 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(pct).toFixed(0)}%`;
}

function getMobileWearableTiles() {
  const summary = state.importedData?.wearableSummary;
  if (!summary?.metrics || Object.keys(summary.metrics).length === 0) return [];
  const sourceIds = Object.keys(summary.sources || {});
  const registryOrder = metricsForSources(sourceIds.length ? sourceIds : Object.keys(summary.metrics || {}));
  const ordered = [
    ...MOBILE_WEARABLE_PRIORITY,
    ...registryOrder,
    ...Object.keys(summary.metrics || {}),
  ];
  const seen = new Set();
  const tiles = [];
  for (const metricId of ordered) {
    if (seen.has(metricId)) continue;
    seen.add(metricId);
    if (metricId === 'bp_diastolic' && summary.metrics.bp_systolic) continue;
    const metric = summary.metrics[metricId];
    const canon = canonicalMetric(metricId);
    if (!metric || !canon || metric.latest == null) continue;
    tiles.push({
      id: metricId,
      label: canon.label,
      value: formatMobileWearableValue(metricId, metric, summary),
      unit: metricId === 'bp_systolic' ? 'mmHg' : (canon.unit || canon.sub || ''),
      change: formatMobileWearableDelta(metricId, metric, canon),
    });
    if (tiles.length >= 4) break;
  }
  return tiles;
}

function renderMobileWearableTiles(tiles) {
  if (!tiles.length) {
    return `<div class="m-wear-empty">
      <strong>Connect body data</strong>
      <span>HRV, sleep, steps, recovery and body composition can sit next to your labs.</span>
      <button type="button" onclick="window.openSettingsModal && window.openSettingsModal('wearables')">Connect</button>
    </div>`;
  }
  return `<div class="m-wear-strip">
    ${tiles.map(tile => `<button type="button" class="m-wear-tile" onclick="window.openWearableDetail ? window.openWearableDetail('${escapeAttr(tile.id)}') : window.openSettingsModal?.('wearables')" aria-label="${escapeAttr(tile.label + ': ' + tile.value + ' ' + tile.unit)}">
      <span class="m-wear-label">${escapeHTML(tile.label)}</span>
      <strong>${escapeHTML(tile.value)}${tile.unit ? `<small>${escapeHTML(tile.unit)}</small>` : ''}</strong>
      <span class="m-wear-change">${escapeHTML(tile.change || 'latest')}</span>
    </button>`).join('')}
  </div>`;
}

function renderMobileSectionHead(title, count, actionLabel = '', action = '') {
  return `<div class="m-section-head">
    <div class="m-section-labels">
      <span class="m-section-title">${escapeHTML(title)}</span>
      ${count ? `<span class="m-section-count">${escapeHTML(count)}</span>` : ''}
    </div>
    ${actionLabel && action ? `<button type="button" onclick="${escapeAttr(action)}">${escapeHTML(actionLabel)}</button>` : ''}
  </div>`;
}

function renderMobileIcon(name) {
  const icons = {
    labs: '<rect x="4" y="4" width="6" height="6" rx="1.2"></rect><rect x="14" y="4" width="6" height="6" rx="1.2"></rect><rect x="4" y="14" width="6" height="6" rx="1.2"></rect><rect x="14" y="14" width="6" height="6" rx="1.2"></rect>',
    genome: '<path d="M8 4c4 4 4 12 8 16"></path><path d="M16 4c-4 4-4 12-8 16"></path><path d="M9.5 8h5"></path><path d="M9.5 12h5"></path><path d="M9.5 16h5"></path>',
    body: '<path d="M4 12h4l2-6 4 12 2-6h4"></path>',
    light: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v3"></path><path d="M12 19v3"></path><path d="M4.93 4.93l2.12 2.12"></path><path d="M16.95 16.95l2.12 2.12"></path><path d="M2 12h3"></path><path d="M19 12h3"></path><path d="M4.93 19.07l2.12-2.12"></path><path d="M16.95 7.05l2.12-2.12"></path>',
    insight: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path><path d="M8 9h8"></path><path d="M8 13h5"></path>',
    more: '<path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path>',
    tweaks: '<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>',
    settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
    search: '<circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path>',
    chat: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>',
  };
  return `<svg class="m-svg-icon" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.labs}</svg>`;
}

export function mobileDashboardSetTab(tab, { fromScroll = false } = {}) {
  if (!fromScroll) _mobileDashboardManualTabLockUntil = Date.now() + 600;
  document.querySelectorAll('.m-tab').forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

function renderMobileBottomTabs(activeTab = 'dashboard', { id = '' } = {}) {
  const navId = id ? ` id="${id}"` : '';
  const tabAttrs = tab => `class="m-tab${activeTab === tab ? ' active' : ''}" data-tab="${tab}" aria-current="${activeTab === tab ? 'page' : 'false'}"`;
  return `<nav${navId} class="m-tabbar" aria-label="Mobile primary navigation">
    <button type="button" ${tabAttrs('dashboard')} onclick="window.mobileDashboardSetTab('dashboard');window.navigate('dashboard')" aria-label="Dashboard"><span class="m-tab-icon">${renderMobileIcon('labs')}</span><small>Home</small></button>
    <button type="button" ${tabAttrs('labs')} onclick="window.mobileDashboardSetTab('labs');window.navigate('labs')" aria-label="Labs"><span class="m-tab-icon">${renderMobileIcon('labs')}</span><small>Labs</small></button>
    <button type="button" ${tabAttrs('body')} onclick="window.mobileDashboardSetTab('body');window.navigate('body')" aria-label="Body"><span class="m-tab-icon">${renderMobileIcon('body')}</span><small>Body</small></button>
    <button type="button" ${tabAttrs('light')} onclick="window.mobileDashboardSetTab('light');window.navigate('light')" aria-label="Light"><span class="m-tab-icon">${renderMobileIcon('light')}</span><small>Light</small></button>
    <button type="button" ${tabAttrs('insight')} onclick="window.mobileDashboardSetTab('insight');window.navigate('insight')" aria-label="Insight"><span class="m-tab-icon">${renderMobileIcon('insight')}</span><small>Insight</small></button>
  </nav>`;
}

function renderMobileDashboardWidgetStack(ctx) {
  const prefs = getDashboardWidgetPrefs();
  const visibleEntries = getVisibleDashboardWidgetEntries(ctx, prefs);
  return `<section class="m-section m-dashboard-widget-section">
    ${renderMobileSectionHead('Dashboard widgets', String(visibleEntries.length))}
    <div class="m-dashboard-widget-actions">${renderDashboardControlButtons({ includeReset: _dashboardOrganizeMode })}</div>
    <div class="dashboard-widgets m-dashboard-widgets">
      ${visibleEntries.length
        ? visibleEntries.map((entry, index) => renderDashboardWidget(entry, prefs, index, visibleEntries)).join('')
        : '<div class="dashboard-widget dashboard-widget-full is-empty"><div class="dashboard-widget-empty">No widgets are visible.</div></div>'}
    </div>
  </section>`;
}

export function openMobileDashboardSearch() {
  if (window.toggleMobileSidebar) window.toggleMobileSidebar();
  setTimeout(() => document.getElementById('sidebar-search')?.focus(), 80);
}

export function mobileDashboardJump(section) {
  const route = ['dashboard', 'labs', 'genome', 'body', 'light', 'insight', 'recommendations'].includes(section) ? section : 'dashboard';
  mobileDashboardSetTab(route === 'genome' || route === 'recommendations' ? 'dashboard' : route);
  window.navigate?.(route);
}

function renderMobileDashboard(data, { resetScroll = false } = {}) {
  const main = document.getElementById("main-content");
  if (!main) return;
  const ctx = buildDashboardWidgetContext(data);
  const profile = getMobileDashboardProfile();
  const mobileWidgetStack = renderMobileDashboardWidgetStack(ctx);
  const firstName = getMobileGreetingName(profile);
  const counts = getMobileDashboardCounts(data);
  const greetingSub = [
    `${counts.markerCount || 0} markers`,
    counts.latestDate ? `last draw ${formatDate(counts.latestDate, 'short')}` : '',
    `${data.dates?.length || 0} draw${data.dates?.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');

  document.body.classList.add('mobile-dashboard-active');
  main.innerHTML = `<div class="drop-zone drop-zone-hidden" id="drop-zone"></div>
    <div class="m-shell">
      <div class="m-bg" aria-hidden="true"></div>
      <div class="m-content">
        <section class="m-greeting">
          <h1>Hey ${escapeHTML(firstName)}.</h1>
          <div class="m-greeting-sub">${escapeHTML(greetingSub)}</div>
        </section>

        ${mobileWidgetStack}
      </div>
      <button type="button" class="m-chat-fab" onclick="window.openChatPanel && window.openChatPanel()" aria-label="Ask AI">${renderMobileIcon('chat')}</button>
      ${renderMobileBottomTabs('dashboard')}
    </div>`;

  if (resetScroll && typeof window.scrollTo === 'function') {
    window.scrollTo(0, 0);
  }
  setupDropZone();
  refreshMobileDashboardActiveTab();
  loadContextHealthDots();
  if (window.loadContextCardTips) window.loadContextCardTips();
  loadCommitHash();
  if (window.loadCatalog) window.loadCatalog().then(c => { window._cachedCatalog = c; });
}

Object.assign(window, {
  openMobileDashboardSearch,
  mobileDashboardJump,
  mobileDashboardSetTab,
  refreshMobileDashboardActiveTab,
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

// Remembered focus before a detail modal opens, so closeModal() can return
// focus to the trigger. Keyboard users otherwise land on <body> after close
// and lose their place in the page.
let _modalLastTrigger = null;
export function rememberModalTrigger() {
  const el = document.activeElement;
  _modalLastTrigger = (el && el !== document.body && typeof el.focus === 'function') ? el : null;
}
function restoreModalTrigger() {
  const el = _modalLastTrigger;
  _modalLastTrigger = null;
  if (!el || !document.contains(el)) return;
  try { el.focus(); } catch { /* element may have been replaced */ }
}
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
// DETAIL MODAL & MANUAL ENTRY
// ═══════════════════════════════════════════════

export async function fetchCustomMarkerDescription(markerId, markerName, unit) {
  const cacheKey = 'labcharts-marker-desc';
  const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
  if (cache[markerId]) return cache[markerId];
  if (!hasAIProvider()) return null;
  try {
    const descResult = await callClaudeAPI({
      system: 'You are a concise medical reference. Reply with exactly one sentence (max 30 words) explaining what this blood biomarker measures and why it matters clinically. No preamble.',
      messages: [{ role: 'user', content: `${markerName} (${unit})` }],
      maxTokens: 100
    });
    if (descResult && descResult.usage) {
      trackUsage(getAIProvider(), getActiveModelId(), descResult.usage.inputTokens || 0, descResult.usage.outputTokens || 0);
    }
    const resp = (descResult && descResult.text) || '';
    const text = resp.trim();
    if (text) {
      cache[markerId] = text;
      localStorage.setItem(cacheKey, JSON.stringify(cache));
    }
    return text || null;
  } catch { return null; }
}

export function showDetailModal(id, opts = {}) {
  // id is interpolated into multiple inline-onclick handlers in the modal
  // body (Add Value, Save/Cancel/Delete note, Ask AI, Delete custom marker).
  // Reject anything outside the strict allowlist so a poisoned customMarker
  // key can't break out of the JS string context.
  if (!safeMarkerId(id)) return;
  const data = getActiveData();
  const idx = id.indexOf('_');
  const catKey = id.slice(0, idx), mKey = id.slice(idx + 1);
  let marker = data.categories[catKey]?.markers[mKey];
  if (marker) state.markerRegistry[id] = marker;
  if (!marker) return;
  // Remember which marker is open so toggleAltUnits can re-render in place.
  state._activeDetailMarkerId = id;
  rememberModalTrigger();
  const modal = setDetailModalShell('marker-detail-modal');
  const overlay = document.getElementById("modal-overlay");
  if (!modal) return;
  const dates = marker.singlePoint ? [marker.singleDateLabel || "N/A"] : data.dateLabels;
  const r = getEffectiveRange(marker);
  const modalPoints = marker.values.map((v, i) => ({ v, i })).filter(x => x.v !== null && x.v !== undefined);
  const showAllHistory = !!opts.showAllHistory;
  const requestedHistoryLimit = Number.isFinite(opts.historyLimit)
    ? Math.max(MARKER_HISTORY_DEFAULT_CAP, Math.floor(opts.historyLimit))
    : MARKER_HISTORY_EXPANDED_CAP;
  const expandedHistoryLimit = Math.min(modalPoints.length, requestedHistoryLimit);
  const visibleHistoryPoints = showAllHistory ? modalPoints.slice(-expandedHistoryLimit) : modalPoints.slice(-MARKER_HISTORY_DEFAULT_CAP);
  const hiddenHistoryCount = modalPoints.length - visibleHistoryPoints.length;
  const latestPoint = modalPoints[modalPoints.length - 1] || null;
  const prevPoint = modalPoints.length > 1 ? modalPoints[modalPoints.length - 2] : null;
  const firstPoint = modalPoints[0] || null;
  const latestRange = latestPoint ? getEffectiveRangeForDate(marker, latestPoint.i) : r;
  const latestStatus = latestPoint ? getStatus(latestPoint.v, latestRange.min, latestRange.max) : 'missing';
  const statusText = latestStatus === 'normal' ? 'In range'
    : latestStatus === 'high' ? 'Above range'
    : latestStatus === 'low' ? 'Below range'
    : 'No value';
  const deltaFromPrev = latestPoint && prevPoint && Number(prevPoint.v) !== 0
    ? (((Number(latestPoint.v) - Number(prevPoint.v)) / Number(prevPoint.v)) * 100)
    : null;
  const deltaFromFirst = latestPoint && firstPoint && Number(firstPoint.v) !== 0
    ? (((Number(latestPoint.v) - Number(firstPoint.v)) / Number(firstPoint.v)) * 100)
    : null;
  const latestUnit = marker.unit || '';
  const latestDisplay = latestPoint ? formatValue(latestPoint.v) : '—';
  const latestDateLabel = latestPoint ? (dates[latestPoint.i] || 'Latest') : 'No values';
  const hasReferenceRange = marker.refMin != null || marker.refMax != null;
  const referenceMinDisplay = hasReferenceRange && marker.refMin != null ? formatValue(marker.refMin) : latestRange.min != null ? formatValue(latestRange.min) : '—';
  const referenceMaxDisplay = hasReferenceRange && marker.refMax != null ? formatValue(marker.refMax) : latestRange.max != null ? formatValue(latestRange.max) : '—';
  const referenceDisplay = `${referenceMinDisplay}–${referenceMaxDisplay} ${latestUnit}`.trim();
  const referenceMetaLabel = hasReferenceRange ? 'Ref' : 'Range';
  const hasOptimalRange = marker.optimalMin != null && marker.optimalMax != null;
  const optimalDisplay = `${marker.optimalMin != null ? formatValue(marker.optimalMin) : '—'}–${marker.optimalMax != null ? formatValue(marker.optimalMax) : '—'} ${latestUnit}`.trim();
  const rangeMainDisplay = hasOptimalRange ? optimalDisplay : referenceDisplay;
  const rangeMainLabel = hasOptimalRange ? 'optimal' : referenceMetaLabel.toLowerCase();
  const clampPct = value => Math.max(0, Math.min(100, value));
  const numericOrNull = value => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const rangeBandHtml = (() => {
    const latestValue = latestPoint ? numericOrNull(latestPoint.v) : null;
    const refMin = numericOrNull(marker.refMin);
    const refMax = numericOrNull(marker.refMax);
    const effMin = numericOrNull(latestRange.min);
    const effMax = numericOrNull(latestRange.max);
    const optMin = numericOrNull(marker.optimalMin);
    const optMax = numericOrNull(marker.optimalMax);
    const baseMin = refMin ?? effMin;
    const baseMax = refMax ?? effMax;
    if (baseMin == null || baseMax == null || latestValue == null || Number(baseMax) === Number(baseMin)) return '';
    const hasOptimalBand = optMin != null && optMax != null;
    const goodMin = hasOptimalBand ? Math.min(optMin, optMax) : Math.min(baseMin, baseMax);
    const goodMax = hasOptimalBand ? Math.max(optMin, optMax) : Math.max(baseMin, baseMax);
    let min = Math.min(baseMin, baseMax);
    let max = Math.max(baseMin, baseMax);
    const goodSpan = goodMax - goodMin;
    if (goodSpan > 0) {
      const zonePad = goodSpan * 0.1;
      if (goodMin > 0) min = Math.min(min, goodMin - zonePad);
      max = Math.max(max, goodMax + zonePad);
    }
    for (const value of [goodMin, goodMax, latestValue]) {
      if (value == null) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    if (max === min) return '';
    let span = max - min;
    if (latestValue <= min) min -= span * 0.08;
    if (latestValue >= max) max += span * 0.08;
    span = max - min;
    if (span <= 0) return '';
    const dot = clampPct(((latestValue - min) / span) * 100);
    const optStart = clampPct(((goodMin - min) / span) * 100);
    const optEnd = clampPct(((goodMax - min) / span) * 100);
    const optLeft = optStart != null && optEnd != null ? Math.min(optStart, optEnd) : null;
    const optRight = optStart != null && optEnd != null ? Math.max(optStart, optEnd) : null;
    const optWidth = optLeft != null && optRight != null ? Math.max(0, optRight - optLeft) : 0;
    const lowZoneWidth = optLeft != null ? Math.max(0, optLeft) : 0;
    const highZoneWidth = optRight != null ? Math.max(0, 100 - optRight) : 0;
    return `<div class="gb-range-band" aria-label="Range position">
      <div class="gb-range-band-track">
        ${lowZoneWidth ? `<div class="gb-range-band-zone gb-range-band-zone-low" style="left:0%;width:${lowZoneWidth}%"></div>` : ''}
        ${highZoneWidth ? `<div class="gb-range-band-zone gb-range-band-zone-high" style="left:${optRight}%;width:${highZoneWidth}%"></div>` : ''}
        ${optWidth ? `<div class="gb-range-band-opt" style="left:${optLeft}%;width:${optWidth}%"></div>` : ''}
      </div>
      <div class="gb-range-band-dot gb-range-band-dot-${escapeAttr(latestStatus)}" style="left:${dot}%"></div>
      <div class="gb-range-band-scale"><span>${escapeHTML(formatValue(min))}</span><span>${escapeHTML(formatValue(max))}</span></div>
    </div>`;
  })();
  const dotKey = id.replace('_', '.');
  let rangeInfo = '';
  const overrides = state.importedData?.refOverrides?.[dotKey] || {};
  const refEditable = (label, min, max, type) => {
    const isEdited = type === 'optimal' ? ('optimalMin' in overrides || 'optimalMax' in overrides) : ('refMin' in overrides || 'refMax' in overrides);
    const source = type === 'optimal' ? overrides.optimalSource : overrides.refSource;
    const badgeLabel = source === 'manual' ? 'edited' : 'lab';
    const hasLabStash = type === 'optimal' ? 'labOptimalMin' in overrides : 'labRefMin' in overrides;
    const badgeTitle = source === 'manual' ? (hasLabStash ? 'Manually edited — click to revert to lab range' : 'Manually edited — click to revert to default') : 'Custom range from your lab — click to revert to default';
    const editedBadge = isEdited ? ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="${badgeTitle}" title="${badgeTitle}" onclick="event.stopPropagation();revertRefRange('${id}','${type}')">${badgeLabel} \u00d7</span>` : '';
    const displayMin = min != null ? min : '–';
    const displayMax = max != null ? max : '–';
    return ` &middot; ${type === 'optimal' ? '<span style="color:var(--green)">' : ''}${label}: <span class="ref-editable" role="button" tabindex="0" aria-label="Edit ${label} range" onclick="editRefRange('${id}','${type}',event)" title="Click to edit">${displayMin} \u2013 ${displayMax}</span>${editedBadge}${type === 'optimal' ? '</span>' : ''}`;
  };
  const isCustom = !!state.importedData?.customMarkers?.[dotKey];
  const hasRef = marker.refMin != null || marker.refMax != null;
  const hasOpt = marker.optimalMin != null || marker.optimalMax != null;
  if (state.rangeMode === 'both') {
    if (hasRef) rangeInfo += refEditable('Reference', marker.refMin, marker.refMax, 'ref');
    else if (isCustom) rangeInfo += refEditable('Reference', '–', '–', 'ref');
    if (hasOpt) rangeInfo += refEditable('Optimal', marker.optimalMin, marker.optimalMax, 'optimal');
    else if (isCustom) rangeInfo += refEditable('Optimal', '–', '–', 'optimal');
  } else if (state.rangeMode === 'optimal') {
    if (hasOpt) rangeInfo = refEditable('Optimal', marker.optimalMin, marker.optimalMax, 'optimal');
    else if (isCustom) rangeInfo = refEditable('Optimal', '–', '–', 'optimal');
  } else if (hasRef) {
    rangeInfo = refEditable('Reference', marker.refMin, marker.refMax, 'ref');
  } else if (isCustom) {
    rangeInfo = refEditable('Reference', '–', '–', 'ref');
  }
  const rangeCardControls = rangeInfo ? rangeInfo.replace(/^ &middot; /, '') : '';
  const isRenamed = !!state.importedData?.markerLabels?.[dotKey];
  const renameLink = isRenamed
    ? ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Revert renamed marker to original" title="Renamed — click to revert to original" onclick="event.stopPropagation();revertMarkerName('${id}')" style="cursor:pointer">renamed ×</span> <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Rename marker" title="Rename marker" onclick="event.stopPropagation();renameMarker('${id}')" style="cursor:pointer;font-size:12px">rename</span>`
    : ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Rename marker" title="Rename marker" onclick="event.stopPropagation();renameMarker('${id}')" style="cursor:pointer;font-size:12px">rename</span>`;
  // Dual-unit summary: render a secondary line under modal-unit when this marker
  // has a UNIT_CONVERSIONS entry AND the per-profile "show alt units" toggle is
  // on (Settings → Display). Mirrors the primary line's ranges in the other
  // system so a user reading a lab report in the non-active unit can cross-check
  // without flipping the global US/EU toggle.
  const isUSMode = state.unitSystem === 'US';
  const hasConv = !!UNIT_CONVERSIONS[dotKey];
  let altUnitInfo = '';
  if (hasConv && state.showAltUnits) {
    const probe = marker.refMax ?? marker.refMin ?? 1;
    const altProbe = getAlternateUnit(dotKey, probe, isUSMode);
    if (altProbe) {
      const altUnit = altProbe.unit;
      const altRange = (min, max) => {
        const a = min != null ? getAlternateUnit(dotKey, min, isUSMode)?.value : null;
        const b = max != null ? getAlternateUnit(dotKey, max, isUSMode)?.value : null;
        const dispA = a != null ? formatValue(a) : '–';
        const dispB = b != null ? formatValue(b) : '–';
        return `${dispA} – ${dispB}`;
      };
      let altRanges = '';
      if (state.rangeMode === 'both') {
        if (hasRef) altRanges += ` &middot; Reference: ${altRange(marker.refMin, marker.refMax)}`;
        if (hasOpt) altRanges += ` &middot; <span style="color:var(--green)">Optimal: ${altRange(marker.optimalMin, marker.optimalMax)}</span>`;
      } else if (state.rangeMode === 'optimal' && hasOpt) {
        altRanges = ` &middot; Optimal: ${altRange(marker.optimalMin, marker.optimalMax)}`;
      } else if (hasRef) {
        altRanges = ` &middot; Reference: ${altRange(marker.refMin, marker.refMax)}`;
      }
      altUnitInfo = `<div class="modal-unit modal-unit-alt" title="Same marker, alternate unit system">≈ ${escapeHTML(altUnit)}${altRanges}</div>`;
    }
  }
  const quickMarkerPinned = isDashboardQuickMarkerPinned(id);
  const quickMarkerPinText = quickMarkerPinned ? 'Pinned' : 'Pin';
  const quickMarkerPinTitle = quickMarkerPinned ? 'Remove from Quick Markers' : 'Pin to Quick Markers';
  let html = `<div class="gb-detail-head">
      <div>
        <div class="gb-detail-kicker">${escapeHTML(data.categories[catKey]?.label || catKey)}</div>
        <h3>${escapeHTML(marker.name)}${renameLink}</h3>
        <div class="modal-unit">${escapeHTML(marker.unit)}</div>
        ${altUnitInfo}
      </div>
      <div class="gb-detail-head-actions">
        <button type="button" class="gb-detail-pin-btn${quickMarkerPinned ? ' is-pinned' : ''}" aria-pressed="${quickMarkerPinned ? 'true' : 'false'}" title="${escapeAttr(quickMarkerPinTitle)}" onclick="window.toggleDashboardQuickMarkerPin('${id}')">${escapeHTML(quickMarkerPinText)}</button>
        <span class="gb-detail-status gb-detail-status-${escapeAttr(latestStatus)}">${escapeHTML(statusText)}</span>
      </div>
      <button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
    </div>
    <div class="marker-description" id="marker-desc"></div>
    <div class="gb-detail-summary">
      <div class="stat-card">
        <div class="stat-card-label">Latest</div>
        <div class="stat-card-value val-${escapeAttr(latestStatus)}">${escapeHTML(latestDisplay)}${latestUnit ? ` <span>${escapeHTML(latestUnit)}</span>` : ''}</div>
        <div class="stat-card-meta">${escapeHTML(latestDateLabel)}${deltaFromPrev != null ? ` · ${deltaFromPrev >= 0 ? '+' : ''}${deltaFromPrev.toFixed(1)}% vs prev` : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Ranges</div>
        <div class="stat-card-value stat-card-value-range">${escapeHTML(rangeMainDisplay)} <span>${escapeHTML(rangeMainLabel)}</span></div>
        <div class="stat-card-meta">${escapeHTML(referenceMetaLabel)} ${escapeHTML(referenceDisplay)}${deltaFromFirst != null ? ` · ${deltaFromFirst >= 0 ? '+' : ''}${deltaFromFirst.toFixed(1)}% vs first` : ''}</div>
        ${rangeCardControls ? `<div class="stat-card-range-controls">${rangeCardControls}</div>` : ''}
      </div>
    </div>
    ${rangeBandHtml}
    <div class="gb-detail-section-label">Trend</div>
    <div class="modal-chart"><canvas id="chart-modal"></canvas></div>
    <div class="gb-detail-section-label">History</div>
    <div class="modal-values-grid marker-history-list">`;
  for (const point of visibleHistoryPoints) {
    const { v, i } = point;
    const ri = getEffectiveRangeForDate(marker, i);
    const s = getStatus(v, ri.min, ri.max);
    const sl = s==="normal"?"\u2713 In Range":s==="high"?"\u25B2 Above Range":s==="low"?"\u25BC Below Range":"Unknown";
    const phaseLabel = marker.phaseLabels && marker.phaseLabels[i];
    const phaseInfo = phaseLabel ? `<div class="mv-phase">${phaseLabel} \u2022 ${formatValue(ri.min)}\u2013${formatValue(ri.max)}</div>` : '';
    const rawDate = marker.singlePoint ? null : data.dates[i];
    const matchingNote = rawDate && state.importedData.notes ? state.importedData.notes.find(n => n.date === rawDate) : null;
    const noteIcon = matchingNote ? `<button type="button" class="mv-note" onclick="event.stopPropagation();this.parentElement.parentElement.querySelector('.mv-note-text').classList.toggle('show')">Note</button><div class="mv-note-text">${escapeHTML(matchingNote.text)}</div>` : '';
    const mvKey = dotKey + ':' + rawDate;
    const manualVal = rawDate && state.importedData.manualValues && state.importedData.manualValues[mvKey];
    const isManual = manualVal !== undefined && manualVal !== null;
    const canRevert = isManual && manualVal !== true;
    const manualBadge = canRevert
      ? ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Revert edited value" title="Edited — click to revert" onclick="event.stopPropagation();revertMarkerValue('${id}','${rawDate}')">edited \u00d7</span>`
      : isManual ? ' <span class="ref-edited-badge" title="Manually entered">manual</span>' : '';
    const deleteBtn = `<button class="mv-delete" onclick="event.stopPropagation();deleteMarkerValue('${id}','${rawDate}')" title="Remove this value">&times;</button>`;
    const editClick = rawDate ? ` onclick="event.stopPropagation();editMarkerValue('${id}','${rawDate}',${v},event)" title="Click to edit" style="cursor:pointer"` : '';
    // Provenance: which file imported this value
    let sourceHtml = '';
    if (rawDate) {
      const srcEntry = state.importedData.entries?.find(e => e.date === rawDate);
      const src = srcEntry?.markerSources?.[dotKey];
      if (src) {
        const fname = src.file;
        if (fname) {
          const display = fname.length > 30 ? fname.slice(0, 27) + '...' : fname;
          sourceHtml = `<div class="mv-source" title="${escapeHTML(fname)}">${escapeHTML(display)}</div>`;
        } else {
          sourceHtml = `<div class="mv-source mv-source-manual">manual entry</div>`;
        }
      } else if (srcEntry?.sourceFile) {
        const fname = srcEntry.sourceFile;
        const display = fname.length > 30 ? fname.slice(0, 27) + '...' : fname;
        sourceHtml = `<div class="mv-source" title="${escapeHTML(fname)}">${escapeHTML(display)}</div>`;
      }
    }
    // Per-value note (markerValueNotes keyed `dotKey:date`).
    const valueNote = rawDate ? state.importedData.markerValueNotes?.[mvKey] : null;
    const valueNoteHtml = rawDate
      ? (valueNote
          ? `<div class="mv-value-note has-note"><span class="mv-value-note-text" role="button" tabindex="0" title="Click to edit note" onclick="event.stopPropagation();editValueNote('${id}','${rawDate}')">${escapeHTML(valueNote)}</span> <button class="mv-value-note-delete" title="Remove note" onclick="event.stopPropagation();deleteValueNote('${id}','${rawDate}')">&times;</button></div>`
          : `<div class="mv-value-note add-note" role="button" tabindex="0" title="Add a note for this value" onclick="event.stopPropagation();editValueNote('${id}','${rawDate}')">+ note</div>`)
      : '';
    const altVal = (hasConv && state.showAltUnits) ? getAlternateUnit(dotKey, v, isUSMode) : null;
    const altLine = altVal ? `<div class="mv-alt" title="Same value, alternate unit">≈ ${formatValue(altVal.value)} ${escapeHTML(altVal.unit)}</div>` : '';
    html += `<div class="modal-value-card marker-history-row status-${s}">${deleteBtn}
      <div class="marker-history-date-row"><div class="mv-date">${dates[i]}${noteIcon}</div>${sourceHtml}</div>
      <div class="marker-history-value-row"><div class="mv-value val-${s}"${editClick}>${formatValue(v)}${manualBadge}</div><div class="mv-status val-${s}">${sl}</div></div>
      ${altLine}${phaseInfo}${valueNoteHtml}</div>`;
  }
  html += `</div>`;
  if (hiddenHistoryCount > 0) {
    const nextHistoryLimit = showAllHistory
      ? Math.min(modalPoints.length, expandedHistoryLimit + MARKER_HISTORY_EXPANDED_CAP)
      : MARKER_HISTORY_EXPANDED_CAP;
    const showCount = showAllHistory
      ? Math.min(MARKER_HISTORY_EXPANDED_CAP, hiddenHistoryCount)
      : Math.min(MARKER_HISTORY_EXPANDED_CAP, hiddenHistoryCount);
    const historyButtonLabel = showAllHistory
      ? `Show ${showCount} older ${showCount === 1 ? 'value' : 'values'}`
      : `View more history (${modalPoints.length} values)`;
    html += `<button class="light-sessions-show-more marker-history-show-more" onclick="event.stopPropagation();showDetailModal('${id}', { showAllHistory: true, historyLimit: ${nextHistoryLimit}, scrollToHistory: true })">${historyButtonLabel}</button>`;
  } else if (showAllHistory && modalPoints.length > MARKER_HISTORY_DEFAULT_CAP) {
    html += `<button class="light-sessions-show-more marker-history-show-more" onclick="event.stopPropagation();showDetailModal('${id}', { scrollToHistory: true })">Show last ${MARKER_HISTORY_DEFAULT_CAP} values</button>`;
  }
  const nonNull = modalPoints;
  if (nonNull.length >= 2) {
    const f = nonNull[0], l = nonNull[nonNull.length-1];
    const ch = l.v - f.v, pct = ((ch/f.v)*100).toFixed(1);
    const dir = ch > 0 ? "increased" : ch < 0 ? "decreased" : "unchanged";
    html += `<div class="modal-ref-info"><strong>Trend:</strong> ${dir} by ${Math.abs(ch).toFixed(2)} ${escapeHTML(marker.unit)} (${ch>0?"+":""}${pct}%) from ${dates[f.i]} to ${dates[l.i]}</div>`;
  }
  // Calculated marker input diagnostic — show missing inputs
  const calcInputs = {
    'calculatedRatios_phenoAge': [
      ['proteins', 'albumin', 'Albumin'], ['biochemistry', 'creatinine', 'Creatinine'],
      ['biochemistry', 'glucose', 'Glucose'], ['proteins', 'hsCRP', 'CRP'],
      ['differential', 'lymphocytesPct', 'Lymphocytes %'], ['hematology', 'mcv', 'MCV'],
      ['hematology', 'rdwcv', 'RDW-CV'], ['biochemistry', 'alp', 'ALP'], ['hematology', 'wbc', 'WBC']
    ],
    'calculatedRatios_bortzAge': [
      ['proteins', 'albumin', 'Albumin'], ['biochemistry', 'alp', 'ALP'],
      ['biochemistry', 'urea', 'Urea'], ['lipids', 'cholesterol', 'Cholesterol'],
      ['biochemistry', 'creatinine', 'Creatinine'], ['biochemistry', 'cystatinC', 'Cystatin C'],
      ['diabetes', 'hba1c', 'HbA1c'], ['proteins', 'hsCRP', 'CRP'],
      ['biochemistry', 'ggt', 'GGT'], ['hematology', 'rbc', 'RBC'],
      ['hematology', 'mcv', 'MCV'], ['hematology', 'rdwcv', 'RDW-CV'],
      ['differential', 'monocytes', 'Monocytes'], ['differential', 'neutrophils', 'Neutrophils'],
      ['differential', 'lymphocytesPct', 'Lymphocytes %'], ['biochemistry', 'alt', 'ALT'],
      ['hormones', 'shbg', 'SHBG'], ['vitamins', 'vitaminD', 'Vitamin D'],
      ['biochemistry', 'glucose', 'Glucose'], ['hematology', 'mch', 'MCH'],
      ['lipids', 'apoAI', 'ApoA-I']
    ],
    'calculatedRatios_biologicalAge': [],
    'calculatedRatios_bunCreatRatio': [
      ['biochemistry', 'urea', 'Urea (BUN)'], ['biochemistry', 'creatinine', 'Creatinine']
    ],
    'calculatedRatios_freeWaterDeficit': [['electrolytes', 'sodium', 'Sodium']],
    'calculatedRatios_tgHdlRatio': [['lipids', 'triglycerides', 'Triglycerides'], ['lipids', 'hdl', 'HDL']],
    'calculatedRatios_ldlHdlRatio': [['lipids', 'ldl', 'LDL'], ['lipids', 'hdl', 'HDL']],
    'calculatedRatios_nlr': [['differential', 'neutrophils', 'Neutrophils'], ['differential', 'lymphocytes', 'Lymphocytes']],
    'calculatedRatios_plr': [['hematology', 'platelets', 'Platelets'], ['differential', 'lymphocytes', 'Lymphocytes']],
    'calculatedRatios_deRitisRatio': [['biochemistry', 'ast', 'AST'], ['biochemistry', 'alt', 'ALT']],
    'calculatedRatios_copperZincRatio': [['electrolytes', 'copper', 'Copper'], ['electrolytes', 'zinc', 'Zinc']],
    'calculatedRatios_apoBapoAIRatio': [['lipids', 'apoB', 'ApoB'], ['lipids', 'apoAI', 'ApoA-I']],
    'calculatedRatios_crpHdlRatio': [['proteins', 'hsCRP', 'CRP'], ['lipids', 'hdl', 'HDL']],
  };
  const inputs = calcInputs[id];
  if (inputs) {
    const issues = [];
    // Check for completely missing markers
    const missing = inputs.filter(([cat, key]) => {
      const vals = data.categories[cat]?.markers[key]?.values;
      return !vals || vals.every(v => v == null);
    });
    if ((id === 'calculatedRatios_phenoAge' || id === 'calculatedRatios_bortzAge' || id === 'calculatedRatios_biologicalAge') && !state.profileDob) {
      issues.push('Date of birth not set (required for age at blood draw)');
    }
    if (missing.length > 0) {
      issues.push(`Missing: ${missing.map(m => m[2]).join(', ')}`);
    }
    // Biological age clocks: per-date gap check, CRP fallback, unit sanity
    const _isBioAgeClock = id === 'calculatedRatios_phenoAge' || id === 'calculatedRatios_bortzAge';
    if (_isBioAgeClock && state.profileDob) {
      // For CRP check: accept either hs-CRP or standard CRP
      const _hasCRPonDate = (idx) => {
        const hs = data.categories.proteins?.markers.hsCRP?.values?.[idx];
        const std = data.categories.proteins?.markers.crp?.values?.[idx];
        return hs != null || std != null;
      };
      // Override the missing check for CRP — it's satisfied by either marker
      const crpInInputs = inputs.some(([, key]) => key === 'hsCRP');
      if (crpInInputs && missing.some(([, key]) => key === 'hsCRP')) {
        const hasAnyCRP = data.categories.proteins?.markers.hsCRP?.values?.some(v => v != null)
          || data.categories.proteins?.markers.crp?.values?.some(v => v != null);
        if (hasAnyCRP) {
          // Remove CRP from missing list — it's covered by the fallback
          const idx = missing.findIndex(([, key]) => key === 'hsCRP');
          if (idx >= 0) missing.splice(idx, 1);
          // Re-generate missing message
          if (missing.length > 0) {
            const mi = issues.findIndex(s => s.startsWith('Missing:'));
            if (mi >= 0) issues[mi] = `Missing: ${missing.map(m => m[2]).join(', ')}`;
          } else {
            const mi = issues.findIndex(s => s.startsWith('Missing:'));
            if (mi >= 0) issues.splice(mi, 1);
          }
        }
      }
      if (missing.length === 0) {
        const latestIdx = data.dates.length - 1;
        if (latestIdx >= 0) {
          const nullAt = inputs.filter(([cat, key]) => {
            if (key === 'hsCRP') return !_hasCRPonDate(latestIdx);
            const v = data.categories[cat]?.markers[key]?.values?.[latestIdx];
            return v == null;
          });
          if (nullAt.length > 0) {
            issues.push(`Missing on latest date (${data.dateLabels[latestIdx]}): ${nullAt.map(m => m[2]).join(', ')}`);
          }
          // CRP value sanity
          const crpVal = data.categories.proteins?.markers.hsCRP?.values?.[latestIdx]
            ?? data.categories.proteins?.markers.crp?.values?.[latestIdx];
          if (crpVal != null && crpVal <= 0) {
            issues.push('CRP is zero or negative — cannot calculate (log undefined)');
          }
          // Unit sanity warnings
          const albVal = data.categories.proteins?.markers.albumin?.values?.[latestIdx];
          if (albVal != null && albVal > 10) {
            issues.push(`Albumin value ${albVal} looks like g/dL — expected g/L (typically 35–55)`);
          }
          const lymphVal = data.categories.differential?.markers.lymphocytesPct?.values?.[latestIdx];
          if (lymphVal != null && lymphVal > 1) {
            issues.push(`Lymphocytes % value ${lymphVal} looks like a percentage — expected fraction 0–1 (e.g. 0.28)`);
          }
          const alpVal = data.categories.biochemistry?.markers.alp?.values?.[latestIdx];
          if (alpVal != null && alpVal > 10) {
            issues.push(`ALP value ${alpVal} looks like U/L — expected µkat/L (typically 0.5–2.0)`);
          }
        }
      }
    }
    // Biological Age: show component status
    if (id === 'calculatedRatios_biologicalAge') {
      const latestIdx = data.dates.length - 1;
      const pheno = data.categories.calculatedRatios?.markers?.phenoAge?.values?.[latestIdx];
      const bortz = data.categories.calculatedRatios?.markers?.bortzAge?.values?.[latestIdx];
      if (pheno == null && bortz == null) {
        issues.push('Neither PhenoAge nor Bortz Age could be calculated — check their detail views for missing inputs');
      } else {
        const age = state.profileDob ? ((new Date(data.dates[latestIdx] + 'T00:00:00') - new Date(state.profileDob + 'T00:00:00')) / (365.25*24*60*60*1000)) : null;
        const parts = [];
        if (pheno != null) parts.push(`PhenoAge: ${pheno}${age ? ' (' + (pheno - age > 0 ? '+' : '') + (pheno - age).toFixed(1) + 'y)' : ''}`);
        if (bortz != null) parts.push(`Bortz Age: ${bortz}${age ? ' (' + (bortz - age > 0 ? '+' : '') + (bortz - age).toFixed(1) + 'y)' : ''}`);
        if (pheno == null) parts.push('PhenoAge: not calculated');
        if (bortz == null) parts.push('Bortz Age: not calculated');
        issues.push(parts.join(' · '));
      }
    }
    if (issues.length > 0) {
      html += `<div class="calc-missing-inputs">Not calculated — ${issues.join('. ')}</div>`;
    }
  }
  // Collect inline SNPs for the unified rec section (genetics + actionable tips together)
  const _inlineSNPs = (state.importedData.genetics?.snps && window._getRelevantSNPs) ? window._getRelevantSNPs(dotKey) : [];
  html += `<div class="gb-detail-actions">
    <div class="gb-detail-action-row">
      <button class="manual-entry-btn" onclick="event.stopPropagation();openManualEntryForm('${id}')">+ Add Value Manually</button>
      <button class="ask-ai-btn" onclick="event.stopPropagation();askAIAboutMarker('${id}')">Ask AI</button>
    </div>`;
  // Marker note
  const markerNote = state.importedData.markerNotes?.[dotKey] || '';
  html += `<div class="marker-note-section">
    <div class="marker-note-header"><span class="marker-note-label">Note</span><button class="marker-note-edit-btn" onclick="event.stopPropagation();toggleMarkerNoteEditor('${dotKey}')">${markerNote ? 'Edit' : '+ Add note'}</button></div>
    ${markerNote ? `<div class="marker-note-text">${escapeHTML(markerNote)}</div>` : ''}
    <div class="marker-note-editor" id="marker-note-editor" style="display:none">
      <textarea id="marker-note-input" placeholder="Your notes about this marker (e.g. why it's high, what to watch for, what you've learned...)" rows="3">${escapeHTML(markerNote)}</textarea>
      <div class="marker-note-actions">
        <button class="import-btn import-btn-primary" onclick="event.stopPropagation();saveMarkerNote('${dotKey}','${id}')">Save</button>
        <button class="import-btn import-btn-secondary" onclick="event.stopPropagation();toggleMarkerNoteEditor('${dotKey}')">Cancel</button>
        ${markerNote ? `<button class="import-btn import-btn-secondary" style="color:var(--red)" onclick="event.stopPropagation();deleteMarkerNote('${dotKey}','${id}')">Delete</button>` : ''}
	      </div>
	    </div>
	  </div>`;
  // Recommendation placeholder — shown for any marker with a catalog slot
  if (window.isProductRecsEnabled && window.isProductRecsEnabled()) {
    html += `<div id="rec-modal-${id}"></div>`;
  }
  html += `</div>`;
  // Show delete link for custom markers only
  if (state.importedData?.customMarkers?.[dotKey]) {
    html += `<div style="text-align:center;margin-top:8px"><a href="#" style="color:var(--text-muted);font-size:0.8rem" onclick="event.preventDefault();event.stopPropagation();deleteCustomMarker('${id}')">Delete this marker</a></div>`;
  }
  modal.innerHTML = html;
  overlay.classList.add("show");
  if (opts.scrollToHistory) {
    setTimeout(() => {
      const historyEl = modal.querySelector('.marker-history-list');
      if (historyEl) historyEl.scrollIntoView({ block: 'start' });
    }, 0);
  }
  // Async-fill recommendation section (unified: genetics + actionable tips)
  if (window.renderRecommendationSection) {
    const _latestVal = marker.values?.filter(v => v !== null).pop();
    const _markerStatus = _latestVal != null ? getStatus(_latestVal, r.min, r.max) : 'missing';
    window.renderRecommendationSection(id.replace('_','.'), { label: 'What can help', maxProducts: 3, inlineSNPs: _inlineSNPs, markerStatus: _markerStatus })
      .then(h => {
        const el = document.getElementById('rec-modal-' + id);
        if (h && el) {
          el.innerHTML = h;
          if (opts.scrollToRec) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
  }
  setTimeout(() => {
    if (document.getElementById("chart-modal")) {
      if (state.chartInstances["modal"]) { state.chartInstances["modal"].destroy(); delete state.chartInstances["modal"]; }
      createLineChart("modal", marker, data.dateLabels, data.dates, data.phaseLabels);
    }
  }, 50);
  // Display marker description (sync for schema markers, async fetch for custom)
  const descEl = document.getElementById('marker-desc');
  if (descEl) {
    const desc = getMarkerDescription(id);
    if (desc) {
      descEl.textContent = desc;
      descEl.classList.add('loaded');
    } else if (!marker.desc && hasAIProvider()) {
      descEl.classList.add('loading');
      fetchCustomMarkerDescription(id, marker.name, marker.unit).then(text => {
        const el = document.getElementById('marker-desc');
        if (text && el) {
          el.textContent = text;
          el.classList.remove('loading');
          el.classList.add('loaded');
        } else if (el) {
          el.remove();
        }
      });
    } else {
      descEl.remove();
    }
  }
}

export function openManualEntryForm(id, prefillDate) {
  // Always re-resolve from getActiveData — `state.markerRegistry` carries a
  // marker frozen at the moment it was rendered, and `marker.unit` reflects
  // the unit-system mode in effect *then*. After a US↔EU toggle the registry
  // entry can lie about the current display unit, breaking the unit-picker
  // comparison in saveManualEntry. Refresh on every open.
  const idx = id.indexOf('_');
  if (idx < 0) return;
  const catKey = id.slice(0, idx), mKey = id.slice(idx + 1);
  const data = getActiveData();
  const marker = data.categories[catKey]?.markers[mKey];
  if (marker) state.markerRegistry[id] = marker;
  if (!marker) return;
  const modal = setDetailModalShell('gb-form-modal', 'marker-form-modal');
  const overlay = document.getElementById("modal-overlay");
  if (!modal) return;
  const today = new Date().toISOString().slice(0, 10);
  // Date fallback chain: explicit prefill (e.g. empty-cell click) → last-used in this session → today.
  // sessionStorage clears when the tab closes, so we don't outlast a single sitting.
  let sessionLast = null;
  try {
    const raw = sessionStorage.getItem('labcharts-last-manual-date');
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) sessionLast = raw;
  } catch (_) { /* sessionStorage may be unavailable (private mode) */ }
  const dateValue = (typeof prefillDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(prefillDate))
    ? prefillDate
    : (sessionLast || today);
  const refText = marker.refMin != null || marker.refMax != null
    ? `Reference: ${marker.refMin != null ? marker.refMin : '–'} \u2013 ${marker.refMax != null ? marker.refMax : '–'} ${escapeHTML(marker.unit)}`
    : '';
  // Placeholder hint: midpoint of ref range if known, otherwise a neutral example.
  let placeholderHint = 'e.g. 5.4';
  if (marker.refMin != null && marker.refMax != null) {
    placeholderHint = `e.g. ${formatValue((marker.refMin + marker.refMax) / 2)}`;
  }
  // Per-field unit picker: surface the alternate unit when this marker has a
  // UNIT_CONVERSIONS entry, so users entering a value from a lab report in the
  // other system don't have to mentally convert. Default = current display unit.
  const dotKeyForUnit = id.replace('_', '.');
  const _meIsUS = state.unitSystem === 'US';
  const _meConv = UNIT_CONVERSIONS[dotKeyForUnit];
  let _meAltUnit = null;
  if (_meConv) {
    const probe = marker.refMax ?? marker.refMin ?? 1;
    const alt = getAlternateUnit(dotKeyForUnit, probe, _meIsUS);
    if (alt) _meAltUnit = alt.unit;
  }
  const unitPickerHtml = _meAltUnit
    ? `<select id="me-unit" class="me-unit-select" aria-label="Input unit">
         <option value="${escapeHTML(marker.unit)}" selected>${escapeHTML(marker.unit)}</option>
         <option value="${escapeHTML(_meAltUnit)}">${escapeHTML(_meAltUnit)}</option>
       </select>`
    : `<span style="color:var(--text-muted);font-weight:400">(${escapeHTML(marker.unit)})</span>`;
  modal.innerHTML = `<div class="gb-modal-head">
      <div>
        <div class="gb-modal-kicker">${escapeHTML(data.categories[catKey]?.label || catKey)}</div>
        <div class="gb-modal-title">Add Value Manually</div>
      </div>
      <button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
    </div>
    <div class="gb-form-body">
    <div class="modal-unit"><strong>${escapeHTML(marker.name)}</strong> \u00b7 ${escapeHTML(marker.unit)}${refText ? ' \u00b7 ' + refText : ''}</div>
    <div class="manual-entry-form">
      <div class="me-field">
        <label for="me-date">Date</label>
        <input type="date" id="me-date" value="${dateValue}" max="${today}">
      </div>
      <div class="me-field">
        <label for="me-value">Value ${unitPickerHtml}</label>
        <input type="number" id="me-value" step="any" placeholder="${escapeHTML(placeholderHint)}" autofocus>
      </div>
      <div class="me-field">
        <label for="me-note">Note <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
        <textarea id="me-note" rows="2" placeholder="Context for this value — e.g. fasted 14h, post-workout, different lab, retake of low value..."></textarea>
      </div>
      <div class="gb-form-actions">
        <button class="import-btn import-btn-primary" onclick="saveManualEntry('${id}')">Save</button>
        <button class="import-btn import-btn-secondary" onclick="saveAndAddAnotherManualEntry('${id}')" title="Save this value, then enter another marker for the same date">Save &amp; Add Another</button>
        <button class="import-btn import-btn-secondary" onclick="showDetailModal('${id}')">Cancel</button>
      </div>
    </div>
    </div>`;
  overlay.classList.add("show");
  setTimeout(() => {
    const el = document.getElementById('me-value');
    if (el) {
      el.focus();
      // Enter-to-save / Esc-to-cancel for keyboard users.
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveManualEntry(id); }
        else if (e.key === 'Escape') { e.preventDefault(); showDetailModal(id); }
      };
      el.addEventListener('keydown', onKey);
      const dateEl = document.getElementById('me-date');
      if (dateEl) dateEl.addEventListener('keydown', onKey);
    }
  }, 50);
}

// Insulin is stored under hormones.insulin but also surfaced on the diabetes
// category as diabetes.insulin_d (so the marker shows up in both contexts).
// Per-value notes need to mirror across both keys regardless of which
// category the user is editing from. Returns the OTHER key (if any) so the
// caller can write the same note value to both sides.
function _insulinMirrorNoteKey(dotKey, date) {
  if (dotKey === 'hormones.insulin') return 'diabetes.insulin_d:' + date;
  if (dotKey === 'diabetes.insulin_d') return 'hormones.insulin:' + date;
  return null;
}

export async function saveManualEntry(id, opts = {}) {
  const { keepOpen = false } = opts;
  const dateInput = document.getElementById('me-date');
  const valueInput = document.getElementById('me-value');
  const noteInput = document.getElementById('me-note');
  const unitInput = document.getElementById('me-unit');
  if (!dateInput || !valueInput) return;
  const date = dateInput.value;
  const value = parseFloat(valueInput.value);
  // Cap notes at 500 chars to defend against runaway paste — matches the
  // wearable-manual.js `_sanitizeNote` ceiling. Notes flow into IDB +
  // sync payloads + AI context; a few-MB paste would bloat all three.
  const noteRaw = noteInput ? noteInput.value.trim() : '';
  const noteText = noteRaw.length > 500 ? noteRaw.slice(0, 500) : noteRaw;
  if (!date) { showNotification('Please enter a date', 'error'); return; }
  if (isNaN(value)) { showNotification('Please enter a valid number', 'error'); return; }
  const dotKey = id.replace('_', '.');
  // Always re-resolve marker from getActiveData (not state.markerRegistry):
  // the registry may hold a marker.unit captured under a different unit-system
  // mode, which would break the unit-picker comparison below.
  const _meIdx = id.indexOf('_');
  const marker = _meIdx > 0
    ? getActiveData().categories[id.slice(0, _meIdx)]?.markers[id.slice(_meIdx + 1)]
    : null;
  // Unit-picker integration: if the user selected the alternate unit, the
  // range sanity check needs alt-unit-space refs (otherwise typing "90 mg/dL"
  // against an SI ref range of 4–6 mmol/L would always trigger the warning).
  const inputUnit = unitInput?.value || marker?.unit || '';
  const usingAltUnit = !!(marker && inputUnit && inputUnit !== marker.unit);
  let checkRefMin = marker?.refMin, checkRefMax = marker?.refMax, checkUnit = marker?.unit;
  if (marker && usingAltUnit) {
    const isUSMode = state.unitSystem === 'US';
    const altMin = marker.refMin != null ? getAlternateUnit(dotKey, marker.refMin, isUSMode) : null;
    const altMax = marker.refMax != null ? getAlternateUnit(dotKey, marker.refMax, isUSMode) : null;
    checkRefMin = altMin?.value ?? null;
    checkRefMax = altMax?.value ?? null;
    checkUnit = inputUnit;
  }
  // Range sanity check: catches decimal/unit slips (e.g. typing 100 mg/dL when SI ref is 4–6 mmol/L).
  if (marker) {
    let warn = null;
    if (value < 0) warn = `${value} is negative — values are usually 0 or positive.`;
    else if (checkRefMax != null && checkRefMax > 0 && value > checkRefMax * 10) warn = `${value} is much higher than the reference range (${checkRefMin ?? '?'}–${checkRefMax} ${checkUnit}). Did you enter the right unit?`;
    else if (checkRefMin != null && checkRefMin > 0 && value < checkRefMin / 10) warn = `${value} is much lower than the reference range (${checkRefMin}–${checkRefMax ?? '?'} ${checkUnit}). Did you enter the right unit?`;
    if (warn && !await showConfirmDialog(`${warn}\n\nSave anyway?`)) return;
  }
  // Duplicate-date check: an existing value for this marker on the same date.
  const existingEntry = state.importedData.entries?.find(e => e.date === date);
  if (existingEntry && existingEntry.markers && existingEntry.markers[dotKey] != null) {
    // Show in display units — find the marker's display value at this date.
    const data = getActiveData();
    const dateIdx = data.dates.indexOf(date);
    const displayVal = (dateIdx >= 0 && marker) ? marker.values[dateIdx] : existingEntry.markers[dotKey];
    const unit = marker?.unit || '';
    if (!await showConfirmDialog(`A value of ${displayVal} ${unit} already exists for ${date}. Overwrite?`)) return;
  }
  if (!state.importedData.entries) state.importedData.entries = [];
  let entry = state.importedData.entries.find(e => e.date === date);
  if (!entry) {
    entry = { date: date, markers: {} };
    state.importedData.entries.push(entry);
  }
  // If the user picked the alternate unit, convert from there directly to SI
  // (convertUserInputToSI is a no-op when inputUnit is already the SI unit, so
  // the EU-mode default keeps working unchanged). Otherwise fall through to the
  // existing display→SI path which handles the US-mode case.
  const storedValue = usingAltUnit
    ? convertUserInputToSI(dotKey, value, inputUnit)
    : convertDisplayToSI(dotKey, value);
  entry.markers[dotKey] = storedValue;
  if (!entry.markerSources) entry.markerSources = {};
  entry.markerSources[dotKey] = { file: null, at: Date.now() };
  if (!state.importedData.manualValues) state.importedData.manualValues = {};
  state.importedData.manualValues[dotKey + ':' + date] = true;
  // Per-value note: store on save when non-empty; clear when emptied.
  if (!state.importedData.markerValueNotes) state.importedData.markerValueNotes = {};
  const noteKey = dotKey + ':' + date;
  if (noteText) state.importedData.markerValueNotes[noteKey] = noteText;
  else delete state.importedData.markerValueNotes[noteKey];
  if (dotKey === 'hormones.insulin') {
    entry.markers['diabetes.insulin_d'] = storedValue;
    entry.markerSources['diabetes.insulin_d'] = entry.markerSources[dotKey];
  }
  // Mirror the per-value note across the insulin dual-mapping — same reading,
  // two views. Bidirectional: user may save via either category page. Without
  // this, a note added on one side wouldn't show on the other, and orphans
  // would accumulate over delete cycles.
  const insulinNoteMirror = _insulinMirrorNoteKey(dotKey, date);
  if (insulinNoteMirror) {
    if (noteText) state.importedData.markerValueNotes[insulinNoteMirror] = noteText;
    else delete state.importedData.markerValueNotes[insulinNoteMirror];
  }
  recalculateHOMAIR(entry);
  saveImportedData();
  // Remember the date session-wide so the next manual entry defaults to it.
  try { sessionStorage.setItem('labcharts-last-manual-date', date); } catch (_) {}
  window.buildSidebar();
  updateHeaderDates();
  const targetCat = id.indexOf('_') !== -1 ? id.slice(0, id.indexOf('_')) : null;
  const data = getActiveData();
  const navCat = (targetCat && data.categories?.[targetCat]) ? targetCat : "dashboard";
  showNotification(`Added ${state.markerRegistry[id]?.name || id}: ${value} on ${date}`, 'success');
  if (keepOpen) {
    // Rebuild page underneath, re-open the manual-entry form with the same id + date.
    // Form re-render is in-place (modal.innerHTML), so no flicker.
    navigate(navCat);
    openManualEntryForm(id, date);
  } else {
    closeModal();
    navigate(navCat);
    // Re-open detail modal so user stays in context (#29)
    setTimeout(() => showDetailModal(id), 50);
  }
}

export function saveAndAddAnotherManualEntry(id) {
  return saveManualEntry(id, { keepOpen: true });
}

export function openCreateMarkerModal() {
  const modal = setDetailModalShell('gb-form-modal', 'marker-form-modal');
  const overlay = document.getElementById("modal-overlay");
  if (!modal) return;
  // Build category options from schema + existing custom categories
  const data = getActiveData();
  const catOptions = Object.entries(data.categories)
    .map(([key, c]) => `<option value="${key}">${escapeHTML(c.label)}</option>`)
    .join('');
  modal.innerHTML = `<div class="gb-modal-head">
      <div>
        <div class="gb-modal-kicker">Custom marker</div>
        <div class="gb-modal-title">Create New Biomarker</div>
      </div>
      <button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
    </div>
    <div class="gb-form-body">
    <div class="manual-entry-form">
      <div class="me-field">
        <label>Category</label>
        <div class="cm-cat-row">
          <select id="cm-category" onchange="document.getElementById('cm-new-cat-row').style.display=this.value==='__new__'?'flex':'none'">
            ${catOptions}
            <option value="__new__">+ New category...</option>
          </select>
          <div id="cm-new-cat-row" style="display:none;margin-top:6px;gap:8px;align-items:center">
            <span id="cm-new-cat-icon" title="Pick icon" style="cursor:pointer;font-size:20px;min-width:28px;text-align:center" data-custom="" onclick="pickNewCatIcon(this)">\uD83D\uDD16</span>
            <input type="text" id="cm-new-cat" placeholder="Category name" style="flex:1">
          </div>
        </div>
      </div>
      <div class="me-field">
        <label>Marker name</label>
        <input type="text" id="cm-name" placeholder="e.g. Lipoprotein(a)" autofocus>
      </div>
      <div class="me-field">
        <label>Unit</label>
        <input type="text" id="cm-unit" placeholder="e.g. mg/dL, nmol/L, %">
      </div>
      <div class="me-field">
        <label>Reference range (optional)</label>
        <div style="display:flex;gap:8px">
          <input type="number" id="cm-ref-min" step="any" placeholder="Min">
          <span style="line-height:36px">\u2013</span>
          <input type="number" id="cm-ref-max" step="any" placeholder="Max">
        </div>
      </div>
      <div class="me-field">
        <label>Optimal range (optional)</label>
        <div style="display:flex;gap:8px">
          <input type="number" id="cm-opt-min" step="any" placeholder="Min">
          <span style="line-height:36px">\u2013</span>
          <input type="number" id="cm-opt-max" step="any" placeholder="Max">
        </div>
      </div>
      <div class="gb-form-actions">
        <button class="import-btn import-btn-primary" onclick="saveCustomMarker()">Create</button>
        <button class="import-btn import-btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </div>
    </div>`;
  overlay.classList.add("show");
  setTimeout(() => { const el = document.getElementById('cm-name'); if (el) el.focus(); }, 50);
}

export function pickNewCatIcon(el) {
  showEmojiPicker(el, (emoji) => {
    if (emoji) { el.textContent = emoji; el.dataset.custom = '1'; }
  });
}

export function saveCustomMarker() {
  const catSelect = document.getElementById('cm-category');
  const newCatInput = document.getElementById('cm-new-cat');
  const nameInput = document.getElementById('cm-name');
  const unitInput = document.getElementById('cm-unit');
  const refMinInput = document.getElementById('cm-ref-min');
  const refMaxInput = document.getElementById('cm-ref-max');
  if (!nameInput?.value.trim()) { showNotification('Please enter a marker name', 'error'); return; }
  const name = nameInput.value.trim();
  // Determine category key and label
  let catKey, catLabel;
  if (catSelect.value === '__new__') {
    catLabel = (newCatInput?.value || '').trim();
    if (!catLabel) { showNotification('Please enter a category name', 'error'); return; }
    const iconEl = document.getElementById('cm-new-cat-icon');
    var newCatIcon = iconEl?.dataset.custom === '1' ? iconEl.textContent.trim() : null;
    catKey = catLabel.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/)
      .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
    if (!catKey || /^\d/.test(catKey)) catKey = 'custom' + catKey.charAt(0).toUpperCase() + catKey.slice(1);
  } else {
    catKey = catSelect.value;
    catLabel = catSelect.options[catSelect.selectedIndex].text;
  }
  // Generate marker key from name (camelCase)
  const markerKey = name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
  if (!markerKey) { showNotification('Could not generate a valid key from marker name', 'error'); return; }
  const fullKey = catKey + '.' + markerKey;
  // Check for conflicts
  const data = getActiveData();
  const existingCat = data.categories[catKey];
  if (existingCat?.markers[markerKey]) {
    showNotification('A marker with this name already exists in that category', 'error');
    return;
  }
  // Parse optional ref range
  const refMin = refMinInput?.value ? parseFloat(refMinInput.value) : null;
  const refMax = refMaxInput?.value ? parseFloat(refMaxInput.value) : null;
  const optMinInput = document.getElementById('cm-opt-min');
  const optMaxInput = document.getElementById('cm-opt-max');
  const optMin = optMinInput?.value ? parseFloat(optMinInput.value) : null;
  const optMax = optMaxInput?.value ? parseFloat(optMaxInput.value) : null;
  // Save custom marker definition
  if (!state.importedData.customMarkers) state.importedData.customMarkers = {};
  const cmDef = {
    name,
    unit: (unitInput?.value || '').trim(),
    refMin: isNaN(refMin) ? null : refMin,
    refMax: isNaN(refMax) ? null : refMax,
    categoryLabel: catLabel,
    ...(typeof newCatIcon !== 'undefined' && newCatIcon ? { icon: newCatIcon } : {})
  };
  state.importedData.customMarkers[fullKey] = cmDef;
  // Save optimal range as refOverride if provided
  if (optMin != null && !isNaN(optMin) && optMax != null && !isNaN(optMax)) {
    if (!state.importedData.refOverrides) state.importedData.refOverrides = {};
    state.importedData.refOverrides[fullKey] = {
      ...(state.importedData.refOverrides[fullKey] || {}),
      optimalMin: optMin,
      optimalMax: optMax
    };
  }
  saveImportedData();
  window.buildSidebar();
  closeModal();
  showNotification(`Created "${name}" in ${catLabel}`, 'success');
  // Register marker and open manual entry to add first value
  const id = catKey + '_' + markerKey;
  state.markerRegistry[id] = {
    name,
    unit: (unitInput?.value || '').trim(),
    refMin: isNaN(refMin) ? null : refMin,
    refMax: isNaN(refMax) ? null : refMax,
    custom: true
  };
  setTimeout(() => openManualEntryForm(id), 100);
}

export async function deleteMarkerValue(id, date) {
  const dotKey = id.replace('_', '.');
  if (!state.importedData.entries) return;
  const entry = state.importedData.entries.find(e => e.date === date);
  if (!entry || entry.markers[dotKey] === undefined) return;
  if (await showConfirmDialog(`Delete this value (${date})? This can't be undone.`)) {
    delete entry.markers[dotKey];
    // Clean up provenance and manual tracking
    if (entry.markerSources) delete entry.markerSources[dotKey];
    if (state.importedData.manualValues) delete state.importedData.manualValues[dotKey + ':' + date];
    // Drop the per-value note (if any) — value is gone, note is orphaned.
    if (state.importedData.markerValueNotes) delete state.importedData.markerValueNotes[dotKey + ':' + date];
    // Clean up insulin dual-mapping (value, provenance, AND the per-value
    // note for the mirror key — same reading, both views must go together).
    if (dotKey === 'hormones.insulin') {
      delete entry.markers['diabetes.insulin_d'];
      if (entry.markerSources) delete entry.markerSources['diabetes.insulin_d'];
      recalculateHOMAIR(entry);
    }
    // Mirror the note delete in both directions — user may delete via either
    // category. Forward-only would leave orphans on the other side.
    const mirrorKey = _insulinMirrorNoteKey(dotKey, date);
    if (mirrorKey && state.importedData.markerValueNotes) {
      delete state.importedData.markerValueNotes[mirrorKey];
    }
    // Remove entry entirely if no markers left
    if (Object.keys(entry.markers).length === 0) {
      state.importedData.entries = state.importedData.entries.filter(e => e.date !== date);
    }
    saveImportedData();
    window.buildSidebar();
    updateHeaderDates();
    // Re-open the detail modal to show updated values. buildSidebar
    // resets .active to Dashboard, so use state.currentView (kept in
    // sync by navigate) instead of re-reading the DOM.
    navigate(state.currentView || "dashboard");
    showDetailModal(id);
    showNotification(`Removed value from ${date}`, 'info');
  }
}

export async function deleteCustomMarker(id) {
  const dotKey = id.replace('_', '.');
  const catKey = dotKey.split('.')[0];
  const def = state.importedData?.customMarkers?.[dotKey];
  if (!def) return;
  // Find all custom markers in same category
  const siblingsInCat = Object.keys(state.importedData.customMarkers).filter(k => k.startsWith(catKey + '.'));
  const isLastInCat = siblingsInCat.length <= 1;
  const msg = isLastInCat
    ? `Delete "${def.name}" and the entire "${def.categoryLabel || catKey}" category? This cannot be undone.`
    : `Delete "${def.name}" and all its values? This cannot be undone.`;
  if (await showConfirmDialog(msg)) {
    // Determine which keys to delete — just this marker, or all in category
    const keysToDelete = isLastInCat ? siblingsInCat : [dotKey];
    for (const key of keysToDelete) {
      // Remove from all entries
      if (state.importedData.entries) {
        for (const entry of state.importedData.entries) {
          if (entry.markers) delete entry.markers[key];
        }
      }
      // Remove manual value tracking
      if (state.importedData.manualValues) {
        for (const k of Object.keys(state.importedData.manualValues)) {
          if (k.startsWith(key + ':')) delete state.importedData.manualValues[k];
        }
      }
      // Remove ref overrides
      if (state.importedData.refOverrides) delete state.importedData.refOverrides[key];
      // Remove custom marker definition
      delete state.importedData.customMarkers[key];
    }
    // Clean up empty entries
    if (state.importedData.entries) {
      state.importedData.entries = state.importedData.entries.filter(e => Object.keys(e.markers || {}).length > 0);
    }
    saveImportedData();
    closeModal();
    window.buildSidebar();
    updateHeaderDates();
    navigate('dashboard');
    showNotification(`Deleted "${def.name}"${isLastInCat && siblingsInCat.length > 1 ? ` and ${siblingsInCat.length - 1} other marker(s)` : ''}`, 'info');
  }
}

export function editMarkerValue(id, date, currentValue, event) {
  const el = event.target.closest('.mv-value');
  if (!el || el.querySelector('input')) return;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = 'any';
  input.value = currentValue;
  input.className = 'ref-edit-input';
  input.style.cssText = 'width:100%;max-width:140px;text-align:center;font-size:inherit;box-sizing:border-box;padding:2px 4px';
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();
  let cancelled = false;
  const save = () => {
    if (cancelled) return;
    const newValue = parseFloat(input.value);
    if (isNaN(newValue)) { showDetailModal(id); return; }
    // No-op if the value didn't change — don't flip provenance to manual.
    if (newValue === parseFloat(currentValue)) { showDetailModal(id); return; }
    const dotKey = id.replace('_', '.');
    const entry = state.importedData.entries?.find(e => e.date === date);
    if (!entry) return;
    // Track as manually edited — store original value for revert (true = manual entry with no original)
    if (!state.importedData.manualValues) state.importedData.manualValues = {};
    const mvKey = dotKey + ':' + date;
    if (!(mvKey in state.importedData.manualValues)) {
      // First edit — save original SI value for revert
      state.importedData.manualValues[mvKey] = entry.markers[dotKey] != null ? entry.markers[dotKey] : true;
    }
    const storedValue = convertDisplayToSI(dotKey, newValue);
    entry.markers[dotKey] = storedValue;
    // Update provenance to reflect manual edit
    if (!entry.markerSources) entry.markerSources = {};
    entry.markerSources[dotKey] = { file: null, at: Date.now() };
    if (dotKey === 'hormones.insulin') { entry.markers['diabetes.insulin_d'] = storedValue; if (entry.markerSources) entry.markerSources['diabetes.insulin_d'] = entry.markerSources[dotKey]; recalculateHOMAIR(entry); }
    saveImportedData();
    // Rebuild the underlying view so Table/Heatmap/Chart reflect the edit.
    window.navigate(state.currentView || 'dashboard');
    showDetailModal(id);
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
    else if (e.key === 'Escape') { cancelled = true; showDetailModal(id); }
  });
}

export function revertMarkerValue(id, date) {
  const dotKey = id.replace('_', '.');
  const mvKey = dotKey + ':' + date;
  const original = state.importedData.manualValues?.[mvKey];
  if (original == null || original === true) return;
  const entry = state.importedData.entries?.find(e => e.date === date);
  if (!entry) return;
  entry.markers[dotKey] = original;
  if (dotKey === 'hormones.insulin') { entry.markers['diabetes.insulin_d'] = original; recalculateHOMAIR(entry); }
  delete state.importedData.manualValues[mvKey];
  saveImportedData();
  // Rebuild the underlying view so Table/Heatmap/Chart reflect the revert.
  window.navigate(state.currentView || 'dashboard');
  showDetailModal(id);
}

export async function editValueNote(id, date) {
  if (!id || !date) return;
  const dotKey = id.replace('_', '.');
  const noteKey = dotKey + ':' + date;
  if (!state.importedData.markerValueNotes) state.importedData.markerValueNotes = {};
  const current = state.importedData.markerValueNotes[noteKey] || '';
  const result = await showPromptDialog(
    current ? `Edit note for ${date}` : `Add note for ${date}`,
    { defaultValue: current, placeholder: 'e.g. fasted 14h, post-workout, different lab', okLabel: 'Save' }
  );
  // showPromptDialog collapses cancel + empty-submit to null. Treat null as
  // "no change" — explicit deletion is via the dedicated × affordance.
  if (result === null) return;
  // Cap to match saveManualEntry — defends against runaway paste flowing
  // into IDB, sync payloads, and AI context.
  const capped = result.length > 500 ? result.slice(0, 500) : result;
  state.importedData.markerValueNotes[noteKey] = capped;
  // Mirror across the insulin dual-mapping in BOTH directions so a note
  // edited via diabetes.insulin_d also lands on hormones.insulin and vice
  // versa.
  const mirror = _insulinMirrorNoteKey(dotKey, date);
  if (mirror) state.importedData.markerValueNotes[mirror] = capped;
  saveImportedData();
  showDetailModal(id);
}

export async function deleteValueNote(id, date) {
  if (!id || !date) return;
  if (!await showConfirmDialog(`Remove the note for ${date}?`)) return;
  const dotKey = id.replace('_', '.');
  const noteKey = dotKey + ':' + date;
  if (state.importedData.markerValueNotes && state.importedData.markerValueNotes[noteKey]) {
    delete state.importedData.markerValueNotes[noteKey];
    // Mirror cleanup in BOTH directions across the insulin dual-mapping.
    const mirror = _insulinMirrorNoteKey(dotKey, date);
    if (mirror) delete state.importedData.markerValueNotes[mirror];
    saveImportedData();
    showDetailModal(id);
  }
}

export function closeModal() {
  document.getElementById("modal-overlay").classList.remove("show");
  const detailModal = document.getElementById("detail-modal");
  if (detailModal) detailModal.className = 'modal';
  if (state.chartInstances["modal"]) { state.chartInstances["modal"].destroy(); delete state.chartInstances["modal"]; }
  document.removeEventListener('click', closeSuggestionsOnClickOutside);
  if (window.closeEMFInterpretation) window.closeEMFInterpretation();
  // Detail-modal Tab focus trap (wearables) — uninstall explicitly so the
  // global keydown handler doesn't outlive the modal it scoped to.
  if (window._uninstallWearableModalFocusTrap) window._uninstallWearableModalFocusTrap();
  // Clear the active-detail-marker pointer so a later toggleAltUnits (fired
  // from Settings → Display) doesn't re-open this modal on top of Settings.
  state._activeDetailMarkerId = null;
  restoreModalTrigger();
}


// ═══════════════════════════════════════════════
// COMPARE DATES
// ═══════════════════════════════════════════════

export function showCompare(data) {
  if (!data) data = getActiveData();
  const main = document.getElementById("main-content");
  let html = `<div class="category-header"><h2>Compare Dates</h2>
    <p>Side-by-side comparison of biomarker values between two collection dates</p></div>`;
  if (data.dates.length < 2) {
    html += `<div class="empty-state"><div class="empty-state-icon">\u2194</div>
      <h3>Not Enough Data</h3><p>Import at least 2 lab result dates to compare values side by side.</p></div>`;
    main.innerHTML = html;
    return;
  }
  if (!state.compareDate1 || !data.dates.includes(state.compareDate1)) state.compareDate1 = data.dates[0];
  if (!state.compareDate2 || !data.dates.includes(state.compareDate2)) state.compareDate2 = data.dates[data.dates.length - 1];
  const fmtOpt = d => {
    const label = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `<option value="${d}">${label}</option>`;
  };
  html += `<div class="compare-controls">
    <label class="compare-date-field" for="compare-select-1"><span>Date 1:</span>
      <select id="compare-select-1" onchange="setCompareDate1(this.value)">${data.dates.map(d => fmtOpt(d)).join('')}</select>
    </label>
    <button class="compare-swap-btn" onclick="swapCompareDates()" title="Swap dates" aria-label="Swap dates">\u21C4</button>
    <label class="compare-date-field" for="compare-select-2"><span>Date 2:</span>
      <select id="compare-select-2" onchange="setCompareDate2(this.value)">${data.dates.map(d => fmtOpt(d)).join('')}</select>
    </label>
  </div>`;
  html += `<div id="compare-results"></div>`;
  main.innerHTML = html;
  document.getElementById('compare-select-1').value = state.compareDate1;
  document.getElementById('compare-select-2').value = state.compareDate2;
  updateCompare();
}

export function setCompareDate1(value) { state.compareDate1 = value; updateCompare(); }
export function setCompareDate2(value) { state.compareDate2 = value; updateCompare(); }

export function updateCompare() {
  const data = getActiveData();
  const container = document.getElementById('compare-results');
  if (!container) return;
  const idx1 = data.dates.indexOf(state.compareDate1);
  const idx2 = data.dates.indexOf(state.compareDate2);
  if (idx1 === -1 || idx2 === -1) { container.innerHTML = ''; return; }
  container.innerHTML = renderCompareTable(data, idx1, idx2);
}

export function swapCompareDates() {
  const tmp = state.compareDate1;
  state.compareDate1 = state.compareDate2;
  state.compareDate2 = tmp;
  const s1 = document.getElementById('compare-select-1');
  const s2 = document.getElementById('compare-select-2');
  if (s1) s1.value = state.compareDate1;
  if (s2) s2.value = state.compareDate2;
  updateCompare();
}

export function renderCompareTable(data, idx1, idx2) {
  const d1Label = data.dateLabels[idx1];
  const d2Label = data.dateLabels[idx2];
  const colgroup = renderTableColgroup([
    'gb-col-marker',
    'gb-col-unit',
    'gb-col-reference',
    'gb-col-compare-date',
    'gb-col-compare-date',
    'gb-col-delta',
    'gb-col-delta',
  ]);
  const headHtml = `<tr>
    <th>Biomarker</th><th>Unit</th><th>Reference</th>
    <th>${d1Label}</th><th>${d2Label}</th><th>Delta</th><th>% Change</th></tr>`;
  let bodyHtml = '';
  for (const [catKey, cat] of Object.entries(data.categories)) {
    if (cat.singlePoint) continue;
    const rows = [];
    for (const [mKey, marker] of Object.entries(cat.markers)) {
      const v1 = marker.values[idx1];
      const v2 = marker.values[idx2];
      if (v1 === null && v2 === null) continue;
      const mr1 = getEffectiveRangeForDate(marker, idx1);
      const mr2 = getEffectiveRangeForDate(marker, idx2);
      const mr = getEffectiveRange(marker);
      const s1 = v1 !== null ? getStatus(v1, mr1.min, mr1.max) : 'missing';
      const s2 = v2 !== null ? getStatus(v2, mr2.min, mr2.max) : 'missing';
      let delta = null, pctChange = null, directionClass = 'compare-neutral';
      if (v1 !== null && v2 !== null) {
        delta = v2 - v1;
        pctChange = v1 !== 0 ? (delta / v1) * 100 : null;
        if (mr.min != null && mr.max != null) {
          const mid = (mr.min + mr.max) / 2;
          const dist1 = Math.abs(v1 - mid);
          const dist2 = Math.abs(v2 - mid);
          if (dist2 < dist1 - 0.001) directionClass = 'compare-improved';
          else if (dist2 > dist1 + 0.001) directionClass = 'compare-worsened';
        }
      }
      const refStr = marker.refMin != null && marker.refMax != null ? `${formatValue(marker.refMin)} \u2013 ${formatValue(marker.refMax)}` : '\u2014';
      rows.push(`<tr>
        <td class="marker-name">${escapeHTML(marker.name)}</td>
        <td style="color:var(--text-muted);font-size:12px">${escapeHTML(marker.unit)}</td>
        <td style="color:var(--text-secondary);font-size:12px">${refStr}</td>
        <td class="value-cell val-${s1}" style="font-weight:600">${v1 !== null ? formatValue(v1) : '\u2014'}</td>
        <td class="value-cell val-${s2}" style="font-weight:600">${v2 !== null ? formatValue(v2) : '\u2014'}</td>
        <td class="${directionClass}" style="font-weight:600">${delta !== null ? (delta > 0 ? '+' : '') + formatValue(delta) : '\u2014'}</td>
        <td class="${directionClass}" style="font-weight:600">${pctChange !== null ? (pctChange > 0 ? '+' : '') + pctChange.toFixed(1) + '%' : '\u2014'}</td>
      </tr>`);
    }
    if (rows.length > 0) {
      bodyHtml += `<tr class="cat-row"><td colspan="7"><span class="compare-category-label">${renderCategoryGlyph(catKey, cat.label)}<span>${escapeHTML(cat.label)}</span></span></td></tr>`;
      bodyHtml += rows.join('');
    }
  }
  return renderScrollableTableShell('compare', 'compare-table-wrapper', 'compare-table', colgroup, headHtml, bodyHtml, 866);
}

// ═══════════════════════════════════════════════
// CORRELATIONS
// ═══════════════════════════════════════════════

export function showCorrelations(data) {
  if (!data) data = getActiveData();
  const main = document.getElementById("main-content");
  let html = `<div class="category-header"><h2>Correlations</h2>
    <p>Compare biomarkers across categories on a normalized scale</p></div>`;
  html += `<div class="correlation-controls">
    <h3>Select Biomarkers (2\u20138)</h3>
    <div class="corr-select-row">
      <div class="corr-dropdown">
        <input type="text" class="corr-search" id="corr-search" placeholder="Search biomarkers..."
          oninput="filterCorrelationOptions()" onfocus="showCorrelationDropdown()">
        <div class="corr-options" id="corr-options"></div>
      </div>
    </div>
    <div class="corr-chips" id="corr-chips"></div>
    <div class="corr-presets">
      <div class="corr-presets-label">Quick Presets:</div>`;
  for (let i = 0; i < CORRELATION_PRESETS.length; i++) {
    html += `<button class="corr-preset-btn" onclick="applyCorrelationPreset(${i})">${CORRELATION_PRESETS[i].label}</button>`;
  }
  html += `</div></div>`;
  html += `<div class="corr-chart-container" id="corr-chart-container" style="display:none">
    <h3>Normalized Comparison (% of Reference Range)
      <button class="corr-ask-ai-btn" onclick="askAIAboutCorrelations()" title="Ask AI about these correlations">Ask AI</button>
    </h3>
    <div class="corr-chart"><canvas id="chart-correlation"></canvas></div></div>`;
  main.innerHTML = html;
  populateCorrelationOptions(data);
  renderCorrelationChips();
  if (state.selectedCorrelationMarkers.length >= 2) renderCorrelationChart();
}

export function populateCorrelationOptions(data) {
  if (!data) data = getActiveData();
  const container = document.getElementById("corr-options");
  if (!container) return;
  let html = '';
  for (const [catKey, cat] of Object.entries(data.categories)) {
    for (const [markerKey, marker] of Object.entries(cat.markers)) {
      if (marker.singlePoint) continue;
      const fullKey = `${catKey}.${markerKey}`;
      const selected = state.selectedCorrelationMarkers.includes(fullKey);
      html += `<div class="corr-option ${selected ? 'selected' : ''}"
        data-key="${fullKey}" data-name="${escapeHTML(marker.name)}" data-cat="${escapeHTML(cat.label)}"
        onclick="toggleCorrelationMarker('${fullKey}')">
        ${escapeHTML(marker.name)} <span class="opt-cat">${escapeHTML(cat.label)}</span></div>`;
    }
  }
  container.innerHTML = html;
}

export function showCorrelationDropdown() {
  document.getElementById("corr-options").classList.add("show");
}

export function filterCorrelationOptions() {
  const search = document.getElementById("corr-search").value.toLowerCase();
  document.querySelectorAll(".corr-option").forEach(opt => {
    const name = opt.dataset.name.toLowerCase();
    const cat = opt.dataset.cat.toLowerCase();
    opt.style.display = (name.includes(search) || cat.includes(search)) ? '' : 'none';
  });
  document.getElementById("corr-options").classList.add("show");
}

export function toggleCorrelationMarker(key) {
  const idx = state.selectedCorrelationMarkers.indexOf(key);
  if (idx !== -1) state.selectedCorrelationMarkers.splice(idx, 1);
  else if (state.selectedCorrelationMarkers.length < 8) state.selectedCorrelationMarkers.push(key);
  renderCorrelationChips();
  populateCorrelationOptions();
  if (state.selectedCorrelationMarkers.length >= 2) renderCorrelationChart();
  else {
    document.getElementById("corr-chart-container").style.display = "none";
    if (state.chartInstances["correlation"]) { state.chartInstances["correlation"].destroy(); delete state.chartInstances["correlation"]; }
  }
}

export function applyCorrelationPreset(idx) {
  state.selectedCorrelationMarkers = [...CORRELATION_PRESETS[idx].markers];
  renderCorrelationChips();
  populateCorrelationOptions();
  if (state.selectedCorrelationMarkers.length >= 2) renderCorrelationChart();
}

export function renderCorrelationChips() {
  const container = document.getElementById("corr-chips");
  if (!container) return;
  const data = getActiveData();
  let html = '';
  state.selectedCorrelationMarkers.forEach((key, i) => {
    const [catKey, markerKey] = key.split('.');
    const marker = data.categories[catKey]?.markers[markerKey];
    if (!marker) return;
    const color = CHIP_COLORS[i % CHIP_COLORS.length];
    html += `<span class="corr-chip" style="background:${color}20;border-color:${color};color:${color}">
      ${escapeHTML(marker.name)} <span class="chip-remove" onclick="toggleCorrelationMarker('${key}')">&times;</span></span>`;
  });
  container.innerHTML = html;
}

export function renderCorrelationChart() {
  const data = getActiveData();
  const container = document.getElementById("corr-chart-container");
  container.style.display = "block";
  if (state.chartInstances["correlation"]) { state.chartInstances["correlation"].destroy(); delete state.chartInstances["correlation"]; }
  const canvas = document.getElementById("chart-correlation");
  if (!canvas) return;
  if (!window.Chart) {
    ensureChartJs().then(() => {
      if (document.getElementById("chart-correlation")) renderCorrelationChart();
    }).catch(() => {});
    return;
  }
  const datasets = [];
  state.selectedCorrelationMarkers.forEach((key, i) => {
    const [catKey, markerKey] = key.split('.');
    const marker = data.categories[catKey]?.markers[markerKey];
    if (!marker) return;
    const normalizedValues = marker.values.map(v => {
      if (v === null) return null;
      if (marker.refMin == null || marker.refMax == null) return 50;
      const range = marker.refMax - marker.refMin;
      return range !== 0 ? ((v - marker.refMin) / range) * 100 : 50;
    });
    const color = CHIP_COLORS[i % CHIP_COLORS.length];
    datasets.push({
      label: marker.name, data: normalizedValues,
      borderColor: color, backgroundColor: color + '20',
      borderWidth: 2.5, pointRadius: 5, pointHoverRadius: 7,
      pointBackgroundColor: color, tension: 0.3, fill: false, spanGaps: true,
      _realValues: marker.values, _unit: marker.unit, _refMin: marker.refMin, _refMax: marker.refMax
    });
  });
  const allVals = datasets.flatMap(ds => ds.data.filter(v => v !== null));
  const minY = Math.min(0, ...allVals) - 10;
  const maxY = Math.max(100, ...allVals) + 10;
  const tc = getChartColors();
  state.chartInstances["correlation"] = new window.Chart(canvas, {
    type: "line",
    data: { labels: data.dateLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: tc.legendColor, font: { size: 12 }, usePointStyle: true, pointStyle: "circle" } },
        tooltip: {
          backgroundColor: tc.tooltipBg, titleColor: tc.tooltipTitle, bodyColor: tc.tooltipBody,
          borderColor: tc.tooltipBorder, borderWidth: 1,
          callbacks: {
            label: (ctx) => {
              const ds = ctx.dataset;
              const realVal = ds._realValues[ctx.dataIndex];
              const pct = ctx.parsed.y;
              return `${ds.label}: ${formatValue(realVal)} ${ds._unit} (${pct !== null ? pct.toFixed(0) + '%' : 'N/A'})`;
            }
          }
        },
        refBand: { refMin: 0, refMax: 100 },
        noteAnnotations: (function() { const n = getNotesForChart(data.dates); return n.length ? { notes: n, chartDates: data.dates } : false; })(),
        supplementBars: (function() { const s = getSupplementsForChart(data.dates); return s.length ? { supplements: s, chartDates: data.dates } : false; })()
      },
      layout: { padding: { top: (function() { const s = getSupplementsForChart(data.dates); return s.length ? s.length * 14 + 6 : 0; })() } },
      scales: {
        x: { ticks: { color: tc.tickColor, font: { size: 11 } }, grid: { display: false } },
        y: { min: minY, max: maxY, ticks: { color: tc.tickColor, font: { size: 10 }, callback: v => v + '%' }, grid: { color: tc.gridColor } }
      }
    },
    plugins: [refBandPlugin, noteAnnotationPlugin, supplementBarPlugin]
  });
}

// ═══════════════════════════════════════════════
// EDITABLE REFERENCE RANGES
// ═══════════════════════════════════════════════

export function editRefRange(id, type, evt) {
  const marker = state.markerRegistry[id];
  if (!marker) return;
  const isOptimal = type === 'optimal';
  const curMin = isOptimal ? marker.optimalMin : marker.refMin;
  const curMax = isOptimal ? marker.optimalMax : marker.refMax;
  const label = isOptimal ? 'Optimal' : 'Reference';

  const span = evt.target.closest('.ref-editable');
  if (!span) return;

  // Replace span with inline inputs
  const form = document.createElement('span');
  form.className = 'ref-edit-form';
  form.innerHTML = `${label}: <span class="ref-edit-field"><input type="text" inputmode="decimal" value="${curMin ?? ''}" placeholder="none" class="ref-edit-input" id="ref-edit-min"><button type="button" class="ref-edit-clear" onclick="document.getElementById('ref-edit-min').value='';document.getElementById('ref-edit-min').focus()" title="Clear (open-ended)">\u00d7</button></span> \u2013 <span class="ref-edit-field"><input type="text" inputmode="decimal" value="${curMax ?? ''}" placeholder="none" class="ref-edit-input" id="ref-edit-max"><button type="button" class="ref-edit-clear" onclick="document.getElementById('ref-edit-max').value='';document.getElementById('ref-edit-max').focus()" title="Clear (open-ended)">\u00d7</button></span> <button class="ref-edit-save" onclick="saveRefRange('${id}','${type}')">Save</button>`;
  span.replaceWith(form);
  form.querySelector('#ref-edit-min').focus();

  // Enter to save
  form.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); window.saveRefRange(id, type); } });
  // Escape to cancel
  form.addEventListener('keydown', e => { if (e.key === 'Escape') showDetailModal(id); });
}

export function saveRefRange(id, type) {
  const dotKey = id.replace('_', '.');
  const minEl = document.getElementById('ref-edit-min');
  const maxEl = document.getElementById('ref-edit-max');
  if (!minEl || !maxEl) return;
  let newMin = minEl.value.trim() !== '' ? parseFloat(minEl.value) : null;
  let newMax = maxEl.value.trim() !== '' ? parseFloat(maxEl.value) : null;
  // Treat NaN as null (open-ended)
  if (newMin != null && isNaN(newMin)) newMin = null;
  if (newMax != null && isNaN(newMax)) newMax = null;

  // If user is in US mode, convert back to SI for storage (overrides are applied before unit conversion)
  if (newMin != null) newMin = convertDisplayToSI(dotKey, newMin);
  if (newMax != null) newMax = convertDisplayToSI(dotKey, newMax);

  if (!state.importedData.refOverrides) state.importedData.refOverrides = {};
  if (!state.importedData.refOverrides[dotKey]) state.importedData.refOverrides[dotKey] = {};

  const ovr = state.importedData.refOverrides[dotKey];
  if (type === 'optimal') {
    // Stash lab values before first manual edit
    if (ovr.optimalSource !== 'manual' && ('optimalMin' in ovr) && !('labOptimalMin' in ovr)) {
      ovr.labOptimalMin = ovr.optimalMin;
      ovr.labOptimalMax = ovr.optimalMax;
    }
    ovr.optimalMin = newMin;
    ovr.optimalMax = newMax;
    ovr.optimalSource = 'manual';
  } else {
    if (ovr.refSource !== 'manual' && ('refMin' in ovr) && !('labRefMin' in ovr)) {
      ovr.labRefMin = ovr.refMin;
      ovr.labRefMax = ovr.refMax;
    }
    ovr.refMin = newMin;
    ovr.refMax = newMax;
    ovr.refSource = 'manual';
  }

  saveImportedData();
  // Refresh background view, then re-render modal with new ranges
  const activeNav = document.querySelector('.nav-item.active');
  navigate(activeNav ? activeNav.dataset.category : 'dashboard');
  showDetailModal(id);
  showNotification('Range updated', 'info');
}

export function revertRefRange(id, type) {
  const dotKey = id.replace('_', '.');
  const ovr = state.importedData?.refOverrides?.[dotKey];
  if (!ovr) return;
  let msg = 'Range reverted to default';
  if (type === 'optimal') {
    if ('labOptimalMin' in ovr) {
      // Revert to imported lab range
      ovr.optimalMin = ovr.labOptimalMin;
      ovr.optimalMax = ovr.labOptimalMax;
      ovr.optimalSource = 'import';
      delete ovr.labOptimalMin; delete ovr.labOptimalMax;
      msg = 'Range reverted to lab range';
    } else {
      delete ovr.optimalMin; delete ovr.optimalMax; delete ovr.optimalSource;
    }
  } else {
    if ('labRefMin' in ovr) {
      ovr.refMin = ovr.labRefMin;
      ovr.refMax = ovr.labRefMax;
      ovr.refSource = 'import';
      delete ovr.labRefMin; delete ovr.labRefMax;
      msg = 'Range reverted to lab range';
    } else {
      delete ovr.refMin; delete ovr.refMax; delete ovr.refSource;
    }
  }
  // Clean up empty override objects
  if (Object.keys(ovr).length === 0) delete state.importedData.refOverrides[dotKey];
  saveImportedData();
  const activeNav = document.querySelector('.nav-item.active');
  navigate(activeNav ? activeNav.dataset.category : 'dashboard');
  showDetailModal(id);
  showNotification(msg, 'info');
}

// ═══════════════════════════════════════════════
// WELCOME INTRO (profile setup on first visit)
// ═══════════════════════════════════════════════


// ═══════════════════════════════════════════════
// MARKER NOTES
// ═══════════════════════════════════════════════

function toggleMarkerNoteEditor(dotKey) {
  const editor = document.getElementById('marker-note-editor');
  if (!editor) return;
  const isHidden = editor.style.display === 'none';
  editor.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const input = document.getElementById('marker-note-input');
    if (input) input.focus();
  }
}

function saveMarkerNote(dotKey, id) {
  const input = document.getElementById('marker-note-input');
  const text = input?.value?.trim();
  if (!text) {
    // Empty text = delete the note
    if (state.importedData.markerNotes?.[dotKey]) {
      delete state.importedData.markerNotes[dotKey];
      saveImportedData();
      showNotification('Note removed', 'info');
      showDetailModal(id);
    }
    return;
  }
  if (!state.importedData.markerNotes) state.importedData.markerNotes = {};
  state.importedData.markerNotes[dotKey] = text;
  saveImportedData();
  showNotification('Note saved', 'success');
  showDetailModal(id);
}

function deleteMarkerNote(dotKey, id) {
  if (!state.importedData.markerNotes) return;
  delete state.importedData.markerNotes[dotKey];
  saveImportedData();
  showNotification('Note removed', 'info');
  showDetailModal(id);
}

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
