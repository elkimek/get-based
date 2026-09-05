// @ts-check
// light-page-view.js — Light & Sun page shell and dashboard strip renderers

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { renderLensHeader, renderLensPageWidgets } from './lens-page-shell.js';
import { renderLightConditionsWidgetBody, renderConditionsNow, _formatElapsedShort } from './light-conditions-now.js';
import { renderUnifiedSessionsList } from './light-sessions-view.js';
import {
  _channelSparkline,
  _channelDayCount,
  renderChannelPills,
  _toggleChannelDetail,
  renderSuggestion,
} from './light-channel-view.js';

/** @type {Record<string, any>} */
const lightPageDeps = {
  channelDisplay: {},
  weeklyChannelTier: () => 0,
  channelTier: () => 0,
  getSessions: () => [],
  getDevices: () => [],
  getDeviceSessions: () => [],
  getActiveDeviceSession: () => null,
  getActiveSession: () => null,
  rollingChannelTotals: () => ({}),
  rollingDeviceTotals: () => ({}),
  cumulativeMEDToday: () => 0,
  cumulativeMEDYesterday: () => 0,
  rollingVitaminDIU: () => 0,
  vitaminDBudgetStatus: () => null,
  getSunCoords: () => null,
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
  renderSunDataSourceSettings: () => '',
  renderLightTodayDashboardChip: () => '',
  renderLightTodayHero: () => '',
  renderSunSessionRow: () => '',
  renderActiveDeviceSessionCard: () => '',
  renderSunSetupCard: () => '',
  renderChannelMixVerdict: staticFallback => staticFallback,
  renderDevicesSection: async () => '',
  renderEnvironmentAssessmentSummary: () => '',
  renderLightTools: () => '',
};

// A monotonic suffix prevents an older async device render from targeting a
// newer Light page that happened to render within the same millisecond.
let lightWidgetSlotSequence = 0;

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
    lightPageDeps.quickLogSunSession();
  } else if (action === 'open-detailed-session') {
    lightPageDeps.openDetailedSessionDialog();
  } else if (action === 'navigate-light') {
    lightPageDeps.navigate('light');
  } else if (action === 'request-precise-location') {
    lightPageDeps.requestPreciseLocation();
  } else if (action === 'open-light-environment') {
    lightPageDeps.openLightEnvironmentAssessment();
  } else if (action === 'expand-light-tools') {
    _expandLightToolsSection();
  }
}

const lightPageActionDelegateRoots = new WeakSet();
export function installLightPageActionDelegates(root = (typeof document !== 'undefined' ? document : null)) {
  if (!root || lightPageActionDelegateRoots.has(root)) return;
  lightPageActionDelegateRoots.add(root);
  root.addEventListener('click', handleLightPageActionClick);
}

if (typeof document !== 'undefined') installLightPageActionDelegates();

// ═══════════════════════════════════════════════
// LIGHT TODAY STRIP — legacy compact surface used by welcome/embedded views
// ═══════════════════════════════════════════════

export function renderDashboardLightChannelPills() {
  const ch = lightPageDeps.channelDisplay || {};
  const order = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  const sunTotals7d = lightPageDeps.rollingChannelTotals(7) || {};
  const devTotals7d = lightPageDeps.rollingDeviceTotals(7) || {};
  return `<div class="light-pills-row">
    ${order.map(k => {
      const meta = ch[k] || {};
      const hasSun = (sunTotals7d[k] || 0) > 0.0001;
      const hasDevice = (devTotals7d[k] || 0) > 0.0001;
      const active = hasSun || hasDevice;
      const source = hasSun && hasDevice ? 'Sunlight and device logged' : hasSun ? 'Sunlight logged' : hasDevice ? 'Device logged' : 'Not logged';
      const dc = _channelDayCount(k);
      const tip = `${meta.what || ''} — ${source}${dc.n ? ` on ${dc.n} day${dc.n === 1 ? '' : 's'} this week` : ''}. Tap for details.`;
      return `<button type="button" class="light-pill light-pill-tier-${active ? 2 : 0} light-pill-signal-${active ? 'logged' : 'empty'} light-pill-dashboard" data-light-page-action="open-channel" data-channel="${escapeAttr(k)}" title="${escapeHTML(tip)}" aria-label="${escapeHTML((meta.label || k) + ', ' + source + ', tap to open detail')}">
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
  const deviceActive = !!lightPageDeps.getActiveDeviceSession();
  let ctaButtons = '';
  if (sunActive || deviceActive) {
    // Stop controls live in the live-session card. Keep only starts that are
    // actually available; the device store permits one device timer at once.
    const availableStarts = [];
    if (!sunActive) {
      availableStarts.push('<button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-log-action" data-light-page-action="quick-log-sun">Start sun session</button>');
    }
    if (!deviceActive) {
      availableStarts.push(hasDevices
        ? '<button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-log-action" data-light-page-action="quick-log-device">Start device session</button>'
        : '<button type="button" class="dashboard-action-btn light-log-action" data-light-page-action="open-add-device">Add light device</button>');
    }
    ctaButtons = availableStarts.join('');
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

/**
 * Shared live-session surface for the Light page and its optional dashboard
 * widget. Keeping this renderer shared matters: both placements carry the
 * same session id, so the existing sun/device tickers can update every copy
 * without maintaining a second live-dose calculation path.
 *
 * @param {{ includeEmptyState?: boolean }} [options]
 */
export function renderLightLiveSession({ includeEmptyState = false } = {}) {
  const activeSunSession = lightPageDeps.getActiveSession() || null;
  let html = '';
  if (activeSunSession) {
    html += `<div class="light-active-session-pinned" aria-label="Active sun session">${lightPageDeps.renderSunSessionRow(activeSunSession)}</div>`;
  }
  const activeDeviceHtml = lightPageDeps.renderActiveDeviceSessionCard();
  if (activeDeviceHtml) {
    html += `<div class="light-active-session-pinned" aria-label="Active device session">${activeDeviceHtml}</div>`;
  }
  if (html || !includeEmptyState) return html;
  return renderLightWidgetPrompt(
    'No light session is running',
    'Open Light & Sun',
    'navigate-light',
    'Start an outdoor or therapy-device session there; this widget will then show its live timer, estimates, and stop controls.',
    'light-live-session-empty',
  );
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
  const configuredFitzpatrick = state.importedData?.sunDefaults?.fitzpatrick || null;
  const skinBasis = configuredFitzpatrick
    ? `The current model uses Fitzpatrick ${escapeHTML(configuredFitzpatrick)} as a rough base-MED reference, not a personal safe exposure time.`
    : 'Personalized burn-time guidance stays hidden until a skin type is configured.';
  let html = `<details class="light-explainer">
    <summary>How these estimates work</summary>
    <div class="light-explainer-body">
      <p><strong>Burn risk.</strong> UV dose is estimated for the skin that is exposed. Exposing more skin changes the whole-body estimate, but does not make the dose safer for each patch. Sunscreen is not counted as extra safe time. ${skinBasis} Medicines, altitude, reflection, irritated skin, uneven sunscreen, and personal sensitivity can all change the real limit. Stop before redness and never stay longer just to raise an estimate.</p>
      <p><strong>Vitamin D.</strong> We estimate how much vitamin-D-making UVB reaches uncovered skin, then account for exposed area and skin type. The result is an IU-equivalent estimate, not a measurement of absorption or a prediction of blood vitamin D.</p>
      <p><strong>Other light signals.</strong> The cards show when parts of sunlight or device light may reach light-sensitive pathways in the eyes and skin. They describe possible stimulation, not a measured body response, daily requirement, or completion score. Sunlight and devices stay separate because a targeted device is not the same as full-spectrum daylight.</p>
      <p><strong>Uncertainty.</strong> Weather, shade, glass, clothing, skin, distance, and device specifications can change the estimate. Treat ranges as context, not a prescription.</p>
      <p><strong>UV-A transition.</strong> “On” marks when modeled UV-A becomes meaningfully available as the sun rises; “off” marks when it fades near sunset. It is a useful transition window, not an instant whole-body switch. Small amounts may still be present outside it. Never look directly at the sun.</p>
      <p><strong>Safety basis.</strong> Eye and skin UV warnings use <a href="https://www.icnirp.org/cms/upload/publications/ICNIRPUVWorkersHP.pdf" target="_blank" rel="noopener">ICNIRP exposure references</a> and <a href="https://www.who.int/news-room/questions-and-answers/item/radiation-protecting-against-skin-cancer" target="_blank" rel="noopener">WHO protection guidance</a>. UV can damage skin and eyes, and <a href="https://www.iarc.who.int/news-events/sunbeds-and-uv-radiation/" target="_blank" rel="noopener">artificial UV is not treated as harmless</a> because it is used for wellness. The app withholds UV numbers when device output, band split, or distance is not adequately specified.</p>
      <p><strong>Photobiology lens.</strong> Channel explanations draw on published photobiology, circadian biology, and light-response research. Safety limits and numerical doses use the cited primary or institutional sources, while exploratory mechanisms remain labeled as modeled or under study.</p>
      <p><strong>Weather data.</strong> On the hosted app, the default first requests <a href="https://atmosphere.copernicus.eu/" target="_blank" rel="noopener">CAMS</a> data through a fixed private relay using only coordinates rounded to a ~11 km grid and the requested time. The relay looks up a locally downloaded CAMS grid; it does not forward your coordinates to Copernicus or Open-Meteo. If CAMS is unavailable or incomplete, your browser contacts <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> directly with the same rounded location for weather and air-quality fields. A self-hoster can use a relay under their own control.</p>
      <p><strong>Want the technical details?</strong> See <a href="https://docs.getbased.health/developers/sun-spectrum-model" target="_blank" rel="noopener">the model notes and sources</a>.</p>
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
    setupBtn = `<button type="button" class="light-today-cta light-today-cta-secondary" data-light-page-action="navigate-light" title="Skin type, location, indoor light, photosensitive meds — 30 seconds. Drives every Light & Sun calculation.">🌞 Set up Light & Sun</button>`;
  } else if (!hasRooms) {
    setupBtn = `<button type="button" class="light-today-cta light-today-cta-secondary" data-light-page-action="navigate-light" title="Map your rooms — most of your day is under indoor lights">🛋 Map a room</button>`;
  }
  // Keep the legacy roomBtn name so the template strings below don't change.
  const roomBtn = setupBtn;

  let cta;
  if (active) {
    // mm:ss live counter; the active-session ticker updates this same
    // element every second via the [data-live-elapsed-for] selector.
    const currentPauseMs = active.paused && Number.isFinite(active.pausedAt)
      ? Math.max(0, Date.now() - active.pausedAt)
      : 0;
    const elapsedMs = Math.max(0, Date.now() - active.startedAt - (active.accumulatedPausedMs || 0) - currentPauseMs);
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

  // Burn-risk gauge — qualitative, plain English, no acronyms
  const medPct = Math.round(medToday * 100);
  let medCls = 'ok', medMsg = 'low modeled UV dose';
  if (medToday >= 1) { medCls = 'over'; medMsg = 'base MED reference reached — stop UV exposure'; }
  else if (medToday >= 0.7) { medCls = 'warn'; medMsg = 'approaching the base MED reference'; }
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
  const devSessionsAll = lightPageDeps.getDeviceSessions() || [];
  const devWeek = devSessionsAll.filter(s => (s.startedAt || 0) >= weekCutoff).length;
  const weekTotal = sunWeek + devWeek;
  // Rolling 7-day vitamin D total in IU — sums per-session yields with
  // each session's 20k saturation cap, so a week of three good sessions
  // doesn't get clipped to one session's maximum. Hidden when the total
  // is essentially zero (cloudy week / no UVB exposure / device-only).
  const weeklyIU = lightPageDeps.rollingVitaminDIU(7) || 0;
  let weeklyIUStr = '';
  if (weeklyIU >= 100) {
    // Keep this explicitly as an IU-equivalent comparison total. Aggregating
    // sessions does not remove the model's biological uncertainty.
    const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
      : n >= 1000 ? Math.round(n / 100) * 100
      : Math.round(n / 10) * 10;
    weeklyIUStr = `<span class="light-today-vitd" title="Modeled vitamin D IU-equivalent from incident action-weighted UVB over the last 7 days. This is not measured skin absorption or a predicted blood response; optical and individual biological uncertainty is multi-fold.">☀ ~${fmt(weeklyIU)} IU-eq vitamin D estimate this week</span>`;
  }

  // Vitamin-D cross-check. Oral intake and the sunlight IU-equivalent are
  // deliberately displayed as separate, non-additive quantities. The app
  // currently models supplement intake, not vitamin D from foods/beverages;
  // therefore its 4,000 IU adult-UL alert is explicitly incomplete.
  let vitDBudgetChip = '';
  const b = lightPageDeps.vitaminDBudgetStatus();
  if (b) {
    const fmtIU = (n) => n >= 1000 ? `${(n/1000).toFixed(1).replace(/\.0$/, '')}k` : `${Math.round(n)}`;
    if (b.exceedsSupplementUL) {
      vitDBudgetChip = `<span class="light-today-vitd-warn" title="The adult tolerable upper intake level is 4,000 IU/day from food, beverages, and supplements. The app sees ${fmtIU(b.supplementIU)} IU in logged supplements but does not know dietary intake. Its separate ~${fmtIU(b.sunIU)} IU-eq sunlight estimate is not intake and is not added. Discuss clinician-directed high-dose treatment with the prescriber.">⚠ Logged vitamin D supplements: ${fmtIU(b.supplementIU)} IU above the adult intake UL</span>`;
    } else if (b.supplementIU > 0 && b.sunIU > 0) {
      vitDBudgetChip = `<span class="light-today-vitd-info" title="Separate quantities: ${fmtIU(b.supplementIU)} IU in logged supplements; ~${fmtIU(b.sunIU)} IU-equivalent from the optical sunlight model. The sunlight estimate is not measured synthesis or intake and is not added to the supplement amount.">Vit D: ${fmtIU(b.supplementIU)} IU supplements · ~${fmtIU(b.sunIU)} IU-eq sunlight</span>`;
    }
  }

  // High-altitude UV chip — UV irradiance climbs ~10% per 1000m above sea
  // level (WHO/INTERSUN). At >1500m it's a meaningful safety modifier the
  // user should see before going outside.
  const altCoords = lightPageDeps.getSunCoords() || null;
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
      <a href="#" class="light-today-link" data-light-page-action="navigate-light">Open Light &amp; Sun →</a>
    </div>
    ${lightPageDeps.renderLightTodayDashboardChip() || ''}
    ${renderConditionsNow({ variant: 'compact' })}
    ${renderDashboardLightChannelPills()}
    ${weeklyIUStr || vitDBudgetChip ? `<div class="light-today-vitd-row">${weeklyIUStr}${vitDBudgetChip ? ' ' + vitDBudgetChip : ''}</div>` : ''}
    <div class="light-today-foot">
      ${showBurnRisk ? `<span class="light-today-med light-today-med-${medCls}" title="Today's modeled erythemal dose compared with a rough Fitzpatrick base MED. This is not a personal threshold, and sunscreen is not credited as extra safe time.">
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
  const devTotals7d = lightPageDeps.rollingDeviceTotals(7) || {};
  const row = section.querySelector('.light-pills-row');
  const slot = /** @type {HTMLElement | null} */ (section.querySelector('[data-channel-detail-slot]'));
  const openChannel = slot?.dataset.openChannel || '';
  if (row) {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderChannelPills(totals7d, devTotals7d);
    const newRow = wrap.querySelector('.light-pills-row');
    if (newRow) row.replaceWith(newRow);
      // Replace the slot with the freshly-built one too, then re-render the
      // open panel if there was one. This keeps the source/rhythm state live.
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

function _hasCompletedSunSessionToday(sessions) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return (Array.isArray(sessions) ? sessions : []).some(session => {
    const timestamp = Number(session?.endedAt || 0);
    return timestamp >= start && timestamp < end;
  });
}

function renderTodayUVSafety(sessions, medToday, medYesterday) {
  if (!_hasCompletedSunSessionToday(sessions) && !(medToday > 0)) return '';
  const medPct = Math.round(medToday * 100);
  let medCls = 'info';
  let medTitle = 'Modeled UV dose today: low';
  let medMsg = 'The estimate is below the base MED reference, but it cannot certify safety.';
  if (medToday >= 1) {
    medCls = 'over';
    medTitle = 'Base MED reference reached';
    medMsg = 'Stop UV exposure and move to shade or cover up. This is not a personal threshold.';
  } else if (medToday >= 0.7) {
    medCls = 'warn';
    medTitle = 'Approaching base MED reference';
    medMsg = 'Move to shade or cover up; do not chase a channel or vitamin-D estimate.';
  } else if (medToday >= 0.3) {
    medTitle = 'Moderate modeled UV dose today';
    medMsg = 'Avoid redness; medication reactions and individual response are not predicted.';
  }
  const carryChip = (medYesterday >= 0.7 && medToday > 0)
    ? `<div class="light-med-carryover" title="Yesterday's modeled dose was ${Math.round(medYesterday * 100)}% of its base MED reference. Recent redness or tenderness matters more than an arithmetic carry-over formula.">⚠ High modeled UV exposure yesterday — be extra cautious today.</div>`
    : '';
  return `<section class="light-today-uv-safety" aria-label="UV safety today">
    <div class="light-today-safety-label">UV safety today</div>
    <div class="light-med-banner light-med-${medCls}">
      <div class="light-med-icon">${medToday >= 1 ? '⚠' : medToday >= 0.7 ? '!' : 'i'}</div>
      <div class="light-med-body">
        <div class="light-med-title">${medTitle}${medPct > 0 ? ` <span class="light-med-pct">(${medPct}% of base MED)</span>` : ''}</div>
        <div class="light-med-sub">${medMsg}</div>
        ${carryChip}
      </div>
    </div>
  </section>`;
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
  if (!main) return;
  const sessions = lightPageDeps.getSessions() || [];
  const totals7d = lightPageDeps.rollingChannelTotals(7) || {};
  const medToday = lightPageDeps.cumulativeMEDToday() || 0;
  const medYesterday = lightPageDeps.cumulativeMEDYesterday() || 0;
  const deviceSessionsAll = lightPageDeps.getDeviceSessions() || [];
  const totalSessions = sessions.length + deviceSessionsAll.length;
  const widgets = [];

  let html = `<div class="light-page">
    ${renderLensHeader('Light & Sun', 'Sunlight, indoor light, and your daily rhythm.')}`;

  // AI hero verdict — synthesizes today's full picture (sun + devices +
  // environment + trends) into one read. Sits above active-session and
  // conditions so the user gets the "how am I doing?" answer before the
  // raw inputs.
  try {
    const uvSafetyBody = renderTodayUVSafety(sessions, medToday, medYesterday);
    const aiTodayBody = lightPageDeps.renderLightTodayHero() || '';
    const todayBody = `${uvSafetyBody}${aiTodayBody}`;
    if (todayBody) {
      widgets.push({
        id: 'light-today',
        title: 'Today',
        description: 'What stands out today, including modeled UV safety and one useful next step',
        body: todayBody,
        size: 'full',
        opts: { source: 'Light', dashboardId: 'light-today' },
      });
    }
  } catch (_) {}

  // Active sun session card — pinned at the very top of the page so the
  // live timer + channel chips + Pause/Flip/Sunscreen controls are the
  // first thing the user sees when a session is running. Renders above
  // Conditions / Setup / Stop CTA. Filtered out of the historical
  // sessions list further down so the same row doesn't render twice.
  const activeSessionBody = renderLightLiveSession();
  if (activeSessionBody) {
    widgets.push({
      id: 'light-live-session',
      title: 'Live Session',
      description: 'Running sun or therapy sessions with stop controls',
      body: activeSessionBody,
      size: 'full',
      opts: { source: 'Light', dashboardId: 'light-live-session' },
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
  const conditionsCoords = lightPageDeps.getSunCoords();
  const conditionsLocationHint = conditionsCoords?.source === 'country-band' ? getSunCoordsHint() : '';
  const conditionsBody = `${conditionsLocationHint}${renderLightConditionsWidgetBody({ variant: 'full' })}`;
  widgets.push({
    id: 'light-conditions-now',
    title: 'Conditions Now',
    description: 'Current outdoor UVI, atmosphere, air quality, and sun timing',
    body: conditionsBody,
    size: 'full',
    opts: { source: 'Light', dashboardId: 'light-conditions-now' },
  });
  widgets.push({
    id: 'light-setup',
    title: 'Light Setup',
    description: 'Skin type, indoor light context, and personal light assumptions',
    body: setupHtml,
    size: 'half',
    opts: { source: 'Light', dashboardId: '' },
  });
  const logBody = renderLightSessionLogActions();
  widgets.push({
    id: 'light-session-log',
    title: 'Log Sessions',
    description: 'Start sun or therapy sessions and backfill past exposure',
    body: logBody,
    size: 'half',
    opts: { source: 'Light', dashboardId: 'light-session-log' },
  });
  // Keep sunlight and device signals separate. Both may reach a channel,
  // but a targeted device is not a fraction of full-spectrum sunlight.
  const devTotals7d = lightPageDeps.rollingDeviceTotals(7) || {};

  // Unified channel cards. Tapping one opens its source, rhythm, meaning,
  // safety context, and optional research without presenting a quota.
  const isEmpty = totalSessions === 0;
  const lead = isEmpty
    ? 'Sunlight does more than make vitamin D. Start a session to see which light-responsive systems the exposure may have reached.'
    : 'Each card shows a light-responsive pathway seen in your recent logs. It is an exposure story, not a daily score or quota.';
  const channelsBody = `<div class="light-channels-section">
    <p class="light-section-hint">${lead}</p>
    ${renderChannelPills(totals7d, devTotals7d)}
    ${isEmpty ? getSunCoordsHint() : ''}
  </div>`;
  widgets.push({
    id: 'light-channels',
    title: 'What Your Light May Stimulate',
    description: 'Simple eye, skin, and body signals from sunlight and devices',
    body: channelsBody,
    size: 'full',
    opts: { source: 'Light', dashboardId: 'light-channels' },
  });

  // This is a trend review, not today's safety surface. Keep the internal
  // widget id for saved page-order compatibility while giving the visible
  // module a precise job. It remains useful when no sessions were logged:
  // that state is labeled as missing data rather than missing exposure.
  const staticWeeklyReview = renderSuggestion(totals7d, devTotals7d, sessions, deviceSessionsAll);
  const weeklyReview = lightPageDeps.renderChannelMixVerdict(staticWeeklyReview) || staticWeeklyReview;
  const weeklyBody = `${weeklyReview}<p class="light-weekly-disclaimer">Wellness interpretation, not medical advice. This review uses logged sessions and may miss unrecorded exposure; it does not measure vitamin-D status or a personal safe UV limit.</p>`;
  widgets.push({
    id: 'light-guidance',
    title: 'Weekly Light Review',
    description: 'What your past 7 days show, what changed, and one conservative next step',
    body: weeklyBody,
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });

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
        description: 'Chronological outdoor sun and therapy device history',
        body: _unifiedHtml,
        size: 'full',
        opts: { source: 'Light', dashboardId: '' },
      });
    }
  }

  // Page-only Light workbench surfaces stay separate widgets so each one can
  // be reordered, scanned, and visually handled like the rest of the redesign.
  const slotSuffix = `${Date.now()}-${++lightWidgetSlotSequence}`;
  const devicesSlotId = `light-devices-slot-${slotSuffix}`;
  const environmentSlotId = `light-environment-slot-${slotSuffix}`;
  const toolsSlotId = `light-tools-slot-${slotSuffix}`;
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
    title: 'Indoor Light Assessment',
    description: 'Rooms, screens, readings, and saved audit snapshots',
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

  let devicesRender;
  try {
    devicesRender = lightPageDeps.renderDevicesSection();
  } catch (error) {
    devicesRender = Promise.reject(error);
  }
  Promise.resolve(devicesRender).then((devHtml) => {
    const slot = document.getElementById(devicesSlotId);
    if (!slot) return;
    const devices = lightPageDeps.getDevices() || [];
    slot.outerHTML = devices.length > 0
      ? devHtml
      : renderLightWidgetPrompt('No devices added', 'Add device', 'open-add-device', 'Device sessions show targeted light alongside sunlight, without treating the two as interchangeable.');
  }).catch(() => {
    const slot = document.getElementById(devicesSlotId);
    if (slot) slot.outerHTML = renderLightWidgetPrompt('Devices could not load', 'Retry', 'navigate-light', 'Your saved device data was not removed. Reopen Light & Sun to try again.');
  });
  const envSlot = document.getElementById(environmentSlotId);
  if (envSlot) {
    try {
      const envHtml = lightPageDeps.renderEnvironmentAssessmentSummary() || '';
      envSlot.outerHTML = envHtml
        || renderLightWidgetPrompt('No rooms mapped', 'Open assessment', 'open-light-environment', 'Map bedroom, office, screens, and evening light so Light can interpret your indoor day.', 'light-environment-prompt');
    } catch (error) {
      envSlot.outerHTML = renderLightWidgetPrompt('Assessment could not load', 'Retry', 'navigate-light', 'Your saved rooms and audits were not removed. Reopen Light & Sun to try again.');
    }
  }
  const toolsSlot = document.getElementById(toolsSlotId);
  if (toolsSlot) {
    try {
      const toolsHtml = lightPageDeps.renderLightTools() || '';
      toolsSlot.outerHTML = toolsHtml
        || renderLightWidgetPrompt('No measurements yet', 'Open light tools', 'expand-light-tools', 'Run lux, flicker, color temperature, glass, and sleep-darkness checks on this device. Camera frames stay local.', 'light-tools-section-collapsed');
    } catch (error) {
      toolsSlot.outerHTML = renderLightWidgetPrompt('Measurement tools could not load', 'Retry', 'navigate-light', 'Saved measurements were not removed. Reopen Light & Sun to try again.');
    }
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
    return `<p class="light-intro-hint">Tip: set your home country in Profile, or <a href="#" data-light-page-action="request-precise-location">use your current location today</a>. Device coordinates are privacy-rounded and temporary.</p>`;
  }
  if (c.source === 'country-band') {
    return `<p class="light-intro-hint">Calculations use your country (~${c.lat}° lat). Add a postal code in Profile, or <a href="#" data-light-page-action="request-precise-location">use current location today</a> for local conditions.</p>`;
  }
  return '';
}
