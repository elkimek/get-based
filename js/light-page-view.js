// @ts-check
// light-page-view.js — Light & Sun page shell and dashboard strip renderers

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { renderLensHeader, renderLensPageWidgets } from './lens-page-shell.js';
import { renderLightConditionsWidgetBody, renderConditionsNow, _formatElapsedShort } from './light-conditions-now.js';
import { renderUnifiedSessionsList } from './light-sessions-view.js';
import { buildBestNextStep, renderBestNextStep } from './light-next-step.js';
import {
  mergeTotals,
  _channelSparkline,
  _channelDayCount,
  renderChannelPills,
  _toggleChannelDetail,
} from './light-channel-view.js';

/** @type {Record<string, any>} */
const lightPageDeps = {
  channelDisplay: {},
  weeklyChannelTier: () => 0,
  channelTier: () => 0,
  getSessions: () => [],
  getDevices: () => [],
  getDeviceSessions: () => [],
  getActiveSession: () => null,
  rollingChannelTotals: () => ({}),
  rollingDeviceTotals: () => ({}),
  cumulativeMEDToday: () => 0,
  cumulativeMEDYesterday: () => 0,
  rollingVitaminDIU: () => 0,
  vitaminDBudgetStatus: () => null,
  getSunCoords: () => null,
  getCachedConditionsAtmosphere: () => null,
  resumeActiveTickerIfNeeded: () => {},
  ensureActiveDeviceTicker: () => {},
  openChannelOnLightPage: () => {},
  quickLogDeviceSession: () => {},
  openAddDeviceDialog: () => {},
  quickLogSunSession: () => {},
  openDetailedSessionDialog: () => {},
  navigate: () => {},
  requestPreciseLocation: () => {},
  openLightEnvironmentAssessment: () => {},
  openLightSetup: () => {},
  renderSunDataSourceSettings: () => '',
  renderLightTodayDashboardChip: () => '',
  renderLightTodayHero: () => '',
  renderSunSessionRow: () => '',
  renderActiveDeviceSessionCard: () => '',
  renderSunSetupCard: () => '',
  renderDevicesSection: async () => '',
  renderEnvironmentAssessmentSummary: () => '',
  renderLightTools: () => '',
};

let _lightAdvancedExpanded = false;

/** @param {Partial<typeof lightPageDeps>} [deps] */
export function configureLightPageView(deps = {}) {
  Object.assign(lightPageDeps, deps);
}

function closestLightPageAction(event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const actionEl = /** @type {HTMLElement | null} */ (target.closest('[data-light-page-action]'));
  if (!actionEl) return null;
  return event.currentTarget?.contains(actionEl) ? actionEl : null;
}

function handleLightPageActionClick(event) {
  const actionEl = closestLightPageAction(event);
  if (!actionEl) return;
  const action = actionEl.dataset.lightPageAction;
  if (!action) return;

  if (typeof HTMLAnchorElement !== 'undefined' && actionEl instanceof HTMLAnchorElement) event.preventDefault();

  if (action === 'open-channel') {
    lightPageDeps.openChannelOnLightPage(actionEl.dataset.channel || '');
  } else if (action === 'quick-log-device') {
    lightPageDeps.quickLogDeviceSession();
  } else if (action === 'open-add-device') {
    lightPageDeps.openAddDeviceDialog();
  } else if (action === 'quick-log-sun') {
    const wasActive = !!lightPageDeps.getActiveSession();
    Promise.resolve(lightPageDeps.quickLogSunSession()).then(() => {
      if (!wasActive) return;
      requestAnimationFrame(() => {
        document.querySelector('[data-widget-id="light-best-next-step"]')?.scrollIntoView({ block: 'start' });
      });
    }).catch(() => {});
  } else if (action === 'open-detailed-session') {
    lightPageDeps.openDetailedSessionDialog();
  } else if (action === 'navigate-light') {
    lightPageDeps.navigate('light');
  } else if (action === 'request-precise-location') {
    Promise.resolve(lightPageDeps.requestPreciseLocation())
      .then(coords => { if (coords) lightPageDeps.navigate('light'); })
      .catch(() => {});
  } else if (action === 'open-light-environment') {
    lightPageDeps.openLightEnvironmentAssessment();
  } else if (action === 'open-light-setup') {
    lightPageDeps.openLightSetup();
  } else if (action === 'scroll-conditions') {
    document.querySelector('[data-widget-id="light-conditions-now"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (action === 'scroll-live-session') {
    document.querySelector('[data-widget-id="light-live-session"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (action === 'expand-light-tools') {
    _expandLightToolsSection();
  } else if (action === 'show-advanced-light') {
    _lightAdvancedExpanded = true;
    lightPageDeps.navigate('light');
  } else if (action === 'hide-advanced-light') {
    _lightAdvancedExpanded = false;
    lightPageDeps.navigate('light');
  }
}

const lightPageActionDelegateRoots = new WeakSet();
export function installLightPageActionDelegates(root = (typeof document !== 'undefined' ? document : null)) {
  if (!root || lightPageActionDelegateRoots.has(root)) return;
  lightPageActionDelegateRoots.add(root);
  root.addEventListener('click', handleLightPageActionClick);
}

if (typeof document !== 'undefined') installLightPageActionDelegates();

function bestNextStepInput(now = new Date()) {
  const sessions = lightPageDeps.getSessions() || [];
  const deviceSessions = lightPageDeps.getDeviceSessions() || [];
  const defaults = state.importedData?.sunDefaults || {};
  const rooms = state.importedData?.lightEnvironment?.rooms || [];
  return {
    now,
    sessions,
    deviceSessions,
    activeSun: lightPageDeps.getActiveSession() || null,
    activeDevice: deviceSessions.find(session => !session.endedAt) || null,
    atmosphere: lightPageDeps.getCachedConditionsAtmosphere() || null,
    medToday: lightPageDeps.cumulativeMEDToday() || 0,
    medYesterday: lightPageDeps.cumulativeMEDYesterday() || 0,
    hasCoords: !!lightPageDeps.getSunCoords(),
    hasSkinType: !!defaults.fitzpatrick,
    setupDeferred: !!defaults.setupDismissedAt,
    photosensitiveMedTier: defaults.photosensitiveMeds || 'none',
    hasRooms: rooms.length > 0,
  };
}

export function renderLightBestNextStep(now = new Date()) {
  return renderBestNextStep(buildBestNextStep(bestNextStepInput(now)));
}

export function refreshLightBestNextStep() {
  const slot = document.querySelector('[data-light-best-next-step]');
  if (slot) slot.innerHTML = renderLightBestNextStep();
}

if (typeof document !== 'undefined') {
  document.addEventListener('light-conditions-updated', refreshLightBestNextStep);
}

// ═══════════════════════════════════════════════
// LIGHT TODAY STRIP — legacy compact surface used by welcome/embedded views
// ═══════════════════════════════════════════════

export function renderDashboardLightChannelPills() {
  const ch = lightPageDeps.channelDisplay || {};
  // Dashboard pills represent a 7-day rolling total; classify with the
  // weekly tier so optional Light widgets agree with the Light page pills.
  const tier = lightPageDeps.weeklyChannelTier || (() => 0);
  const order = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  const totals7d = lightPageDeps.rollingChannelTotals(7) || {};
  const devTotals7d = lightPageDeps.rollingDeviceTotals(7) || {};
  const combinedTotals7d = mergeTotals(totals7d, devTotals7d);
  return `<div class="light-pills-row">
    ${order.map(k => {
      const meta = ch[k] || {};
      const t = tier(combinedTotals7d[k] || 0, k);
      const dc = _channelDayCount(k);
      const tip = `${meta.what || ''} — exposure recorded on ${dc.n} of 7 days. Tap for details and model assumptions.`;
      return `<button type="button" class="light-pill light-pill-tier-${t} light-pill-dashboard" data-light-page-action="open-channel" data-channel="${escapeAttr(k)}" title="${escapeHTML(tip)}" aria-label="${escapeHTML((meta.label || k) + ', exposure recorded on ' + dc.n + ' of 7 days, tap to open detail')}">
        <span class="light-pill-icon" aria-hidden="true">${meta.icon || '·'}</span>
        <span class="light-pill-label">${escapeHTML(meta.label || k)}</span>
        ${_channelSparkline(k)}
        <span class="light-pill-daycount">${escapeHTML(dc.txt)}</span>
      </button>`;
    }).join('')}
  </div>`;
}

export function renderLightSessionLogActions() {
  const sessions = lightPageDeps.getSessions() || [];
  const devices = lightPageDeps.getDevices() || [];
  const deviceSessionsAll = lightPageDeps.getDeviceSessions() || [];
  const hasDevices = devices.length > 0;
  const totalSessions = sessions.length + deviceSessionsAll.length;
  const sunCount = sessions.length;
  const devCount = deviceSessionsAll.length;
  const tallyDetail = (sunCount > 0 || devCount > 0)
    ? `${sunCount} sun + ${devCount} device`
    : '';
  const sunActive = !!lightPageDeps.getActiveSession();
  let ctaButtons = '';
  if (sunActive) {
    // Stop controls live in the pinned active-session card; this widget keeps
    // the remaining logging actions available without duplicating Stop.
    if (hasDevices) {
      ctaButtons = `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-log-action" data-light-page-action="quick-log-device">Start device session</button>`;
    } else {
      ctaButtons = `<button type="button" class="dashboard-action-btn light-log-action" data-light-page-action="open-add-device">Add light device</button>`;
    }
  } else if (hasDevices) {
    ctaButtons = `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-log-action" data-light-page-action="quick-log-sun">Start sun session</button>
      <button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-log-action" data-light-page-action="quick-log-device">Start device session</button>`;
  } else {
    ctaButtons = `<button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-log-action" data-light-page-action="quick-log-sun">Start sun session</button>
      <button type="button" class="dashboard-action-btn light-log-action" data-light-page-action="open-add-device">Add light device</button>`;
  }
  return `<div class="light-session-log-actions">
    <div class="light-quicklog-row">
      ${ctaButtons}
      <button type="button" class="dashboard-action-btn light-log-action" data-light-page-action="open-detailed-session">Log past session</button>
      ${totalSessions === 0 ? `<span class="light-summary-tally"${tallyDetail ? ` title="${tallyDetail}"` : ''}>No sessions yet</span>` : ''}
    </div>
  </div>`;
}

function renderLightWidgetPrompt(status, ctaLabel, ctaAction, hint, extraClass = '') {
  return `<div class="light-widget-prompt ${escapeAttr(extraClass)}">
    <div class="light-widget-prompt-copy">
      <strong>${escapeHTML(status)}</strong>
      <p>${escapeHTML(hint)}</p>
    </div>
    <button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-widget-prompt-cta" data-light-page-action="${escapeAttr(ctaAction)}">${escapeHTML(ctaLabel)}</button>
  </div>`;
}

function renderLightMethodsWidgetBody() {
  let html = `<details class="light-explainer">
    <summary>How the estimates work</summary>
    <div class="light-explainer-body">
      <p><strong>Modeled burn dose.</strong> This compares recorded UV with the typical dose that can start visible redness for your selected skin type. It is not an exact countdown: skin response, medication, clouds, reflection, and sunscreen use all matter. Leave the sun before redness and use normal sun protection when UVI is 3 or higher.</p>
      <p><strong>Vitamin-D potential.</strong> This is an IU-equivalent estimate based on UVB, exposed skin area, and skin type. It helps compare your own records; it is not a blood test, a required dose, or a guaranteed response.</p>
      <p><strong>Uncertainty.</strong> Weather data, device output, posture, distance, and individual response all vary. Rounded values and input-quality labels show how much trust to place in a number.</p>
      <p><strong>Exposure channels.</strong> The page separates the light you log into six easy-to-compare patterns: vitamin D potential, body-clock light, solar red/infrared, UVA on skin, skin UV response, and outdoor light. These are modeled exposure records—not proof that a health outcome changed.</p>
      <p><strong>Weather data.</strong> The app combines current UV and cloud data with atmosphere estimates. Calculations run on your device, and location is rounded before requests unless you change the privacy setting.</p>
    </div>
  </details>`;
  const dataSourceSettings = lightPageDeps.renderSunDataSourceSettings();
  if (dataSourceSettings) {
    html += `<details class="light-data-source-details">
      <summary>Sun data source</summary>
      <div class="light-data-source-body">${dataSourceSettings}</div>
    </details>`;
  }
  return `<div class="light-methods-stack">${html}</div>`;
}

export function renderLightTodayStrip() {
  const sessions = lightPageDeps.getSessions() || [];
  const inSolarWindow = isSolarWindow();
  // Always render — even a fresh user outside a solar window needs to see
  // that the Light lens exists. The CTA copy adapts to the situation.

  const active = lightPageDeps.getActiveSession() || null;
  const medToday = lightPageDeps.cumulativeMEDToday() || 0;

  // CTA — adaptive to whether the user has therapy devices set up. A
  // winter user with a Joovv but no recent sun should see the device
  // option as a peer, not buried under sun-only copy. Solar windows
  // still privilege outdoor sun (it's a transient cue you'd miss).
  // CTAs are wrapped in .light-today-cta-group so margin-left:auto
  // applies once to the GROUP — without the wrapper each individual
  // CTA's margin-left:auto pushed every button to the right edge,
  // spreading them apart instead of clustering them.
  const devicesArr = lightPageDeps.getDevices() || [];
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
      deviceBtn = `<button type="button" class="light-today-cta light-today-cta-secondary" data-light-page-action="quick-log-device" title="Log a session on your ${escapeAttr(d.brand || '')} ${escapeAttr(d.model || '')}">${escapeHTML(label)}</button>`;
    } else {
      deviceBtn = `<button type="button" class="light-today-cta light-today-cta-secondary" data-light-page-action="quick-log-device" title="Pick from your ${devicesArr.length} devices">🔴 Device <span aria-hidden="true">▼</span></button>`;
    }
  }
  // Once location and skin sensitivity are ready, room mapping becomes the
  // optional next setup layer.
  const sd = state.importedData?.sunDefaults;
  const hasSetup = !!(sd?.fitzpatrick && lightPageDeps.getSunCoords());
  const lightEnv = state.importedData?.lightEnvironment;
  const hasRooms = lightEnv && Array.isArray(lightEnv.rooms) && lightEnv.rooms.length > 0;
  let setupBtn = '';
  if (!hasSetup) {
    setupBtn = `<button type="button" class="light-today-cta light-today-cta-secondary" data-light-page-action="navigate-light" title="Add location and skin sensitivity to make current guidance more relevant.">🌞 Set up Light & Sun</button>`;
  } else if (!hasRooms) {
    setupBtn = `<button type="button" class="light-today-cta light-today-cta-secondary" data-light-page-action="navigate-light" title="Map your rooms — most of your day is under indoor lights">🛋 Map a room</button>`;
  }
  // Keep the legacy roomBtn name so the template strings below don't change.
  const roomBtn = setupBtn;

  let cta;
  if (active) {
    // mm:ss live counter; the active-session ticker updates this same
    // element every second via the [data-live-elapsed-for] selector.
    const elapsedMs = Date.now() - active.startedAt;
    const elapsed = _formatElapsedShort(elapsedMs);
    cta = `<div class="light-today-cta-group"><button type="button" class="light-today-cta light-today-cta-active" data-light-page-action="quick-log-sun" aria-label="Stop active sun session"><span aria-hidden="true">⏹ Stop session — </span><span data-live-elapsed-for="${active.id}" aria-live="off">${elapsed}</span></button></div>`;
  } else if (inSolarWindow) {
    const wlabel = solarWindowLabel();
    cta = `<div class="light-today-cta-group"><button type="button" class="light-today-cta" data-light-page-action="quick-log-sun"><span aria-hidden="true">☀</span> ${wlabel} — log a session</button>${deviceBtn}${roomBtn}</div>`;
  } else if (hasDevices) {
    cta = `<div class="light-today-cta-group"><button type="button" class="light-today-cta" data-light-page-action="quick-log-sun"><span aria-hidden="true">☀</span> Log sun</button>${deviceBtn}${roomBtn}</div>`;
  } else {
    cta = `<div class="light-today-cta-group"><button type="button" class="light-today-cta" data-light-page-action="quick-log-sun">☀ Log a sun session</button>${roomBtn}</div>`;
  }

  // Modeled UV warning — never labels time in the sun as safe.
  const medPct = Math.round(medToday * 100);
  let medCls = 'ok', medMsg = 'moderate modeled UV recorded';
  if (medToday >= 1) { medCls = 'over'; medMsg = 'modeled burn threshold reached — avoid more UV today'; }
  else if (medToday >= 0.7) { medCls = 'warn'; medMsg = 'high modeled UV recorded — choose shade'; }

  // Surface the burn-risk gauge only when it actually carries information.
  // Below 30% MED it's noise on a normal day — the user has the full
  // banner one click away on the Light & Sun page if they need it.
  const showBurnRisk = medToday >= 0.3;
  // Combined session count for the past 7 days — sun + device. Replaces
  // the previous sun-only "X sessions this week" copy which lied about
  // its window (it was actually counting all-time sun sessions).
  const weekCutoff = Date.now() - 7 * 86400 * 1000;
  const sunWeek = sessions.filter(s => (s.startedAt || 0) >= weekCutoff).length;
  const devSessionsAll = lightPageDeps.getDeviceSessions() || [];
  const devWeek = devSessionsAll.filter(s => (s.startedAt || 0) >= weekCutoff).length;
  const weekTotal = sunWeek + devWeek;
  // Rolling 7-day vitamin D IU-equivalent — sums per-session estimates with
  // each session's high-exposure model guard, so a week of three sessions
  // doesn't get clipped to one session's maximum. Hidden when the total
  // is essentially zero (cloudy week / no UVB exposure / device-only).
  const weeklyIU = lightPageDeps.rollingVitaminDIU(7) || 0;
  let weeklyIUStr = '';
  if (weeklyIU >= 100) {
    // The aggregate remains a heuristic; repeated sessions do not justify a
    // validated accuracy percentage because biological response dominates.
    const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
      : n >= 1000 ? Math.round(n / 100) * 100
      : Math.round(n / 10) * 10;
    weeklyIUStr = `<span class="light-today-vitd" title="Modeled vitamin-D potential from recorded UV over the last 7 days. Use it to compare your own pattern; it is not a measured vitamin-D result.">☀ ~${fmt(weeklyIU)} IU-equivalent this week</span>`;
  }

  // Vit-D budget cross-check — shows today's combined sun-derived +
  // supplement IU. Warn chip when supplements alone exceed the IOM 4000
  // IU/d Tolerable Upper Intake Level. Sun-derived doesn't count toward
  // UL (skin photoisomerization plateaus naturally) but is shown for
  // context — clinicians treating high serum 25(OH)D look at total daily
  // input.
  let vitDBudgetChip = '';
  const b = lightPageDeps.vitaminDBudgetStatus();
  if (b) {
    const fmtIU = (n) => n >= 1000 ? `${(n/1000).toFixed(1).replace(/\.0$/, '')}k` : `${Math.round(n)}`;
    if (b.exceedsSupplementUL) {
      vitDBudgetChip = `<span class="light-today-vitd-warn" title="The 4000 IU/day upper limit applies to supplements, not to the app's sunlight estimate. Review a higher supplement dose with a clinician.">⚠ Vitamin-D supplement: ${fmtIU(b.supplementIU)} IU today</span>`;
    }
  }

  // High-altitude UV chip — UV irradiance climbs ~10% per 1000m above sea
  // level (WHO/INTERSUN). At >1500m it's a meaningful safety modifier the
  // user should see before going outside.
  const altCoords = lightPageDeps.getSunCoords() || null;
  const altM = altCoords?.altitudeM || 0;
  const altChip = altM > 1500
    ? `<span class="light-today-altitude" title="UV can be stronger at high altitude. Use the live UVI and normal sun protection rather than this badge as a timer.">⛰ High altitude · ${Math.round(altM)}m</span>`
    : '';
  return `<section class="light-today-strip">
    <div class="light-today-head">
      <span class="light-today-icon">☀</span>
      <span class="light-today-title">Light Today</span>
      <span class="light-today-sub" title="${sunWeek} sun + ${devWeek} device · last 7 days">${weekTotal} light session${weekTotal !== 1 ? 's' : ''} this week</span>
      ${altChip}
      <a href="#" class="light-today-link" data-light-page-action="navigate-light">Open Light &amp; Sun →</a>
    </div>
    ${lightPageDeps.renderLightTodayDashboardChip() || ''}
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
  const totals7d = lightPageDeps.rollingChannelTotals(7) || {};
  const totals30d = lightPageDeps.rollingChannelTotals(30) || {};
  const devTotals7d = lightPageDeps.rollingDeviceTotals(7) || {};
  const devTotals30d = lightPageDeps.rollingDeviceTotals(30) || {};
  const combined7d = mergeTotals(totals7d, devTotals7d);
  const combined30d = mergeTotals(totals30d, devTotals30d);
  const row = section.querySelector('.light-pills-row');
  const slot = /** @type {HTMLElement | null} */ (section.querySelector('[data-channel-detail-slot]'));
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
  try { lightPageDeps.resumeActiveTickerIfNeeded(); } catch (e) {}
  try { lightPageDeps.ensureActiveDeviceTicker(); } catch (e) {}
  const main = document.getElementById("main-content");
  const sessions = lightPageDeps.getSessions() || [];
  const totals7d = lightPageDeps.rollingChannelTotals(7) || {};
  const totals30d = lightPageDeps.rollingChannelTotals(30) || {};
  const deviceSessionsAll = lightPageDeps.getDeviceSessions() || [];
  const totalSessions = sessions.length + deviceSessionsAll.length;
  const widgets = [];

  let html = `<div class="light-page">
    ${renderLensHeader('Light & Sun', 'Plan outdoor time safely, understand your light pattern, and make your daily routine easier to improve.')}`;

  // Keep the optional AI read available, but let the deterministic action
  // lead. Users without an AI provider get the same core product value.
  let todayBody = '';
  try {
    todayBody = lightPageDeps.renderLightTodayHero() || '';
  } catch (_) {}

  // Active sun session card — pinned at the very top of the page so the
  // live timer + channel chips + Pause/Flip/Sunscreen controls are the
  // first thing the user sees when a session is running. Renders above
  // Conditions / Setup / Stop CTA. Filtered out of the historical
  // sessions list further down so the same row doesn't render twice.
  const _activeSunSess = lightPageDeps.getActiveSession() || null;
  let activeSessionBody = '';
  if (_activeSunSess) {
    activeSessionBody += `<div class="light-active-session-pinned" aria-label="Active sun session">${lightPageDeps.renderSunSessionRow(_activeSunSess)}</div>`;
  }
  // Same pattern for active device-therapy sessions (PBM panels, SAD
  // lamps, dawn simulators). Pinned above the conditions panel so the
  // stop button is always one tap away.
  const _activeDevHtml = lightPageDeps.renderActiveDeviceSessionCard();
  if (_activeDevHtml) {
    activeSessionBody += `<div class="light-active-session-pinned" aria-label="Active device session">${_activeDevHtml}</div>`;
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

  widgets.push({
    id: 'light-best-next-step',
    title: 'Best next step',
    description: 'One practical action from current conditions and your recent records',
    body: `<div data-light-best-next-step>${renderLightBestNextStep()}</div>`,
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });

  if (todayBody) {
    widgets.push({
      id: 'light-today',
      title: 'AI perspective',
      description: 'Optional second opinion across outdoor time, devices, rooms, and screens',
      body: todayBody,
      size: 'full',
      opts: { source: 'Light', dashboardId: 'light-today' },
    });
  }

  // Always-visible "Conditions now" panel — UVI / ozone / AQI / sun angle.
  // Tells the user whether right now is a good time to go out, even before
  // they have any session history.
  // Setup card / saved summary. renderSunSetupCard() returns the editor
  // when onboarding is incomplete or the user has reopened to edit, and a
  // compact "Light setup saved" summary with an Edit button otherwise.
  let setupHtml = '';
  try { setupHtml = lightPageDeps.renderSunSetupCard() || ''; } catch (_) {}
  const defaults = state.importedData?.sunDefaults || {};
  const basicsReady = !!(defaults.fitzpatrick && lightPageDeps.getSunCoords());
  const setupDeferred = !!(!defaults.fitzpatrick && defaults.setupDismissedAt);
  const setupWidget = {
    id: 'light-setup',
    title: 'Light Setup',
    description: 'Skin type, indoor light context, and personal light assumptions',
    body: setupHtml,
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  };
  // Best next step now owns activation. Keep incomplete setup close by, but
  // do not make users finish the optional routine audit before seeing value.
  if (!basicsReady && !setupDeferred) widgets.push(setupWidget);
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
  if (basicsReady || setupDeferred) widgets.push(setupWidget);

  // Combine sun + device totals so channels reflect every light source
  const devTotals7d = lightPageDeps.rollingDeviceTotals(7) || {};
  const devTotals30d = lightPageDeps.rollingDeviceTotals(30) || {};
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
  const _wkTier = lightPageDeps.weeklyChannelTier || lightPageDeps.channelTier || (() => 0);
  const litChannels = channelKeysOrdered.filter(k => _wkTier(combined7d[k] || 0, k) > 0).length;
  let lead;
  if (litChannels === 0) {
    lead = `${totalSessions} session${totalSessions === 1 ? '' : 's'} logged. Exposure is still in the lowest comparison band; open a card to see what was recorded and what affects the estimate.`;
  } else {
    lead = `${litChannels} of 6 exposure patterns have enough data to compare. Open any card for the plain-language meaning, input quality, and a practical next step.`;
  }
  const channelsBody = `<div class="light-channels-section">
    <p class="light-section-hint">${lead}</p>
    ${renderChannelPills(combined7d, combined30d)}
    ${isEmpty ? getSunCoordsHint() : ''}
  </div>`;
  if (!isEmpty) {
    widgets.push({
      id: 'light-channels',
      title: 'Your exposure patterns',
      description: 'A clear view of what your outdoor and device sessions recorded',
      body: channelsBody,
      size: 'full',
      opts: { source: 'Light', dashboardId: 'light-channels' },
    });
  }

  if (!isEmpty) {
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
        description: 'Outdoor and light-device sessions, newest first',
        body: _unifiedHtml,
        size: 'full',
        opts: { source: 'Light', dashboardId: '' },
      });
    }
  }

  // Page-only Light workbench surfaces stay separate widgets so each one can
  // be reordered, scanned, and visually handled like the rest of the redesign.
  const devices = lightPageDeps.getDevices() || [];
  const rooms = state.importedData?.lightEnvironment?.rooms || [];
  const measurements = state.importedData?.lightMeasurements || [];
  const hasConfiguredAdvancedData = devices.length > 0 || rooms.length > 0 || measurements.length > 0;
  const showAdvanced = _lightAdvancedExpanded || hasConfiguredAdvancedData;
  const devicesSlotId = showAdvanced ? `light-devices-slot-${Date.now()}` : '';
  const environmentSlotId = showAdvanced ? `light-environment-slot-${Date.now()}` : '';
  const toolsSlotId = showAdvanced ? `light-tools-slot-${Date.now()}` : '';
  if (showAdvanced) widgets.push({
    id: 'light-devices',
    title: 'Light Devices',
    description: 'Therapy panels, SAD lamps, dawn simulators, and device logging',
    body: `<div id="${escapeAttr(devicesSlotId)}" class="light-widget-loading">Loading devices...</div>`,
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });
  if (showAdvanced) widgets.push({
    id: 'light-environment',
    title: 'Indoor Light Assessment',
    description: 'Rooms, screens, readings, and saved audit snapshots',
    body: `<div id="${escapeAttr(environmentSlotId)}" class="light-widget-loading">Loading environment...</div>`,
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });
  if (showAdvanced) widgets.push({
    id: 'light-tools',
    title: 'Measurement Tools',
    description: 'On-device light checks and room measurement workflows',
    body: `<div id="${escapeAttr(toolsSlotId)}" class="light-widget-loading">Loading tools...</div>`,
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });
  if (showAdvanced) widgets.push({
    id: 'light-methods',
    title: 'Methods & Sources',
    description: 'Estimation model, uncertainty, and sun data source controls',
    body: renderLightMethodsWidgetBody(),
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });
  if (!showAdvanced) {
    widgets.push({
      id: 'light-explore',
      title: 'Explore more',
      description: 'Devices, indoor-light checks, measurement tools, and methods',
      body: renderLightWidgetPrompt('Use these when you need them', 'Show advanced tools', 'show-advanced-light', 'You do not need these to start. Open them when you want to add a lamp, map a room, or inspect how an estimate works.'),
      size: 'full',
      opts: { source: 'Light', dashboardId: '' },
    });
  } else if (_lightAdvancedExpanded && !hasConfiguredAdvancedData) {
    widgets.push({
      id: 'light-explore',
      title: 'Advanced tools',
      description: 'Return to the focused everyday view',
      body: renderLightWidgetPrompt('Keep the page focused', 'Hide advanced tools', 'hide-advanced-light', 'Your basic setup and session logging stay available.'),
      size: 'full',
      opts: { source: 'Light', dashboardId: '' },
    });
  }

  html += `${renderLensPageWidgets('light', widgets)}</div>`;

  main.innerHTML = html;
  main.querySelector('.light-page')?.classList.add('is-ready');

  if (showAdvanced) Promise.resolve(lightPageDeps.renderDevicesSection()).then((devHtml) => {
    const slot = document.getElementById(devicesSlotId);
    if (!slot) return;
    const devices = lightPageDeps.getDevices() || [];
    slot.outerHTML = devices.length > 0
      ? devHtml
      : renderLightWidgetPrompt('No devices added', 'Add device', 'open-add-device', 'Therapy panels, SAD lamps, and dawn simulators feed the same Light channels as outdoor sun.');
  }).catch(() => {});
  const envSlot = showAdvanced ? document.getElementById(environmentSlotId) : null;
  if (envSlot) {
    const envHtml = lightPageDeps.renderEnvironmentAssessmentSummary() || '';
    envSlot.outerHTML = envHtml
      || renderLightWidgetPrompt('No rooms mapped', 'Open assessment', 'open-light-environment', 'Map bedroom, office, screens, and evening light so Light can interpret your indoor day.', 'light-environment-prompt');
  }
  const toolsSlot = showAdvanced ? document.getElementById(toolsSlotId) : null;
  if (toolsSlot) {
    const toolsHtml = lightPageDeps.renderLightTools() || '';
    toolsSlot.outerHTML = toolsHtml
      || renderLightWidgetPrompt('No measurements yet', 'Open light tools', 'expand-light-tools', 'Run lux, flicker, color temperature, glass, and sleep-darkness checks on this device. Camera frames stay local.', 'light-tools-section-collapsed');
  }
}

// Expand the collapsed Light tools placeholder into the full 8-card grid.
// Named function so delegated Light page actions can expand the placeholder.
export function _expandLightToolsSection() {
  const collapsed = document.querySelector('.light-tools-section-collapsed');
  if (!collapsed) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = lightPageDeps.renderLightTools() || '';
  if (wrap.firstElementChild) collapsed.replaceWith(wrap.firstElementChild);
}

function getSunCoordsHint() {
  const c = lightPageDeps.getSunCoords();
  if (!c) {
    return `<p class="light-intro-hint">Tip: set your country in the profile editor for accurate sun calculations, or <a href="#" data-light-page-action="request-precise-location">share your precise location</a> once.</p>`;
  }
  if (c.source === 'country-band') {
    return `<p class="light-intro-hint">Calculations use your country (~${c.lat}° lat). <a href="#" data-light-page-action="request-precise-location">Use precise location</a> for sharper results.</p>`;
  }
  return '';
}
