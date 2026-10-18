// light-page-view.js — Light & Sun page shell and dashboard strip renderers

import type { PageCalls, PageActionEvent, PageDelegateRoot, PageInnerHTMLWriter, PageOuterHTMLWriter, PageMetaOperations, PageWidget, PageSessionOperations } from '../types/light-page-view.js';
import { state } from './state.js';
import { renderHTML as renderLightPresentation } from './components/LightPagePresentation.svelte.html.js';
import { LIGHT_CHANNEL_ORDER } from './light-channel-presentation.js';
import { projectLightToday } from './light-today-presentation.js';
import { projectLightSessionActions, projectLightUVSafety } from './light-page-presentation.js';
import { getLensContentGrid } from './lens-page-shell-core.js';
import{projectLensHeader}from'./lens-shell-presentation.js';
import type{LightPageBodyProps}from'./light-page-presentation.js';
import { getLightConditionsWidgetView, getConditionsNowView, _formatElapsedShort } from './light-conditions-now.js';
import { getUnifiedSessionsView } from './light-sessions-view.js';
import {
  _channelSparklineView,
  _channelDayCount,
  renderChannelPills,
  getChannelPillsView,
  _toggleChannelDetail,
  getWeeklyFallbackView,
} from './light-channel-view.js';

const lightPageDeps: PageCalls = {
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
  getSunDataSourceSettingsView: () => null,
  getLightTodayDashboardView: () => null,
  getLightTodayHeroView: () => null,
  getSunSessionRowView: () => null,
  getActiveDeviceSessionCardView: () => null,
  getSunSetupCardView: () => null,
  getChannelMixVerdictView: staticFallback => staticFallback,
  renderDevicesSection: async () => '',
  renderEnvironmentAssessmentSummary: () => '',
  renderLightTools: () => '',
};

// A monotonic suffix prevents an older async device render from targeting a
// newer Light page that happened to render within the same millisecond.
let lightWidgetSlotSequence = 0;

export function configureLightPageView(deps: unknown = {}) {
  Object.assign(lightPageDeps, deps);
}

function closestLightPageAction(event: PageActionEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const actionEl = (target.closest('[data-light-page-action]') as HTMLElement | null);
  if (!actionEl) return null;
  return event.currentTarget?.contains(actionEl) ? actionEl : null;
}

function handleLightPageActionClick(event: PageActionEvent) {
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
export function installLightPageActionDelegates(root: unknown = (typeof document !== 'undefined' ? document : null)) {
  if (!root || lightPageActionDelegateRoots.has(root as object)) return;
  lightPageActionDelegateRoots.add(root as object);
  (root as PageDelegateRoot).addEventListener('click', handleLightPageActionClick);
}

if (typeof document !== 'undefined') installLightPageActionDelegates();

// ═══════════════════════════════════════════════
// LIGHT TODAY STRIP — legacy compact surface used by welcome/embedded views
// ═══════════════════════════════════════════════

export function getDashboardLightChannelPills() {
  const channels = (lightPageDeps.channelDisplay || {}) as Record<string, PageMetaOperations | undefined>;
  const sun = lightPageDeps.rollingChannelTotals(7) || {};
  const device = lightPageDeps.rollingDeviceTotals(7) || {};
  const pills = LIGHT_CHANNEL_ORDER.map(key => {
    const meta = channels[key] || {};
    const hasSun = (sun[key] || 0) > 0.0001;
    const hasDevice = (device[key] || 0) > 0.0001;
    const source = hasSun && hasDevice ? 'Sunlight and device logged' : hasSun ? 'Sunlight logged' : hasDevice ? 'Device logged' : 'Not logged';
    const days = _channelDayCount(key);
    return { key, active: hasSun || hasDevice, name: String(meta.label || key), icon: String(meta.icon || '·'),
      title: `${meta.what || ''} — ${source}${days.n ? ` on ${days.n} day${days.n === 1 ? '' : 's'} this week` : ''}. Tap for details.`,
      label: (meta.label || key) + ', ' + source + ', tap to open detail',
      days: String(days.txt), chart: _channelSparklineView(key),
    };
  });
  return pills;
}
export function renderDashboardLightChannelPills() {
  return renderLightPresentation({ kind: 'pills', pills: getDashboardLightChannelPills() });
}

// Called through the lazy dashboard port; the widget controller owns its log count.
export function getDashboardLightChannelsWidgetView(totalSessions:number):Extract<LightPageBodyProps,{kind:'dashboard-channels'}> {
  const lead = totalSessions === 0
    ? 'No light sessions yet. Log sunlight or a device session to see which pathways may have received a signal.'
    : 'Seven-day light rhythm, with sunlight and device signals kept separate.';
  return { kind: 'dashboard-channels', lead, pills: getDashboardLightChannelPills() };
}

export function renderDashboardLightChannelsWidget(totalSessions:number) {
  return renderLightPresentation(getDashboardLightChannelsWidgetView(totalSessions));
}

export function getLightSessionLogActionsView() {
  const sessions = lightPageDeps.getSessions() || [];
  const devices = lightPageDeps.getDevices() || [];
  const deviceSessions = lightPageDeps.getDeviceSessions() || [];
  return { kind: 'actions' as const, view: projectLightSessionActions({
    sunActive: !!lightPageDeps.getActiveSession(), deviceActive: !!lightPageDeps.getActiveDeviceSession(),
    hasDevices: devices.length > 0, totalSessions: sessions.length + deviceSessions.length,
  }) };
}
export function renderLightSessionLogActions(){return renderLightPresentation(getLightSessionLogActionsView());}

/**
 * Shared live-session surface for the Light page and its optional dashboard
 * widget. Keeping this renderer shared matters: both placements carry the
 * same session id, so the existing sun/device tickers can update every copy
 * without maintaining a second live-dose calculation path.
 *
 * @param {{ includeEmptyState?: boolean }} [options]
 */
export function getLightLiveSessionView({ includeEmptyState = false }: { includeEmptyState?: unknown } = {}) {
  const activeSun = lightPageDeps.getActiveSession() || null;
  const sunView = activeSun ? lightPageDeps.getSunSessionRowView(activeSun) : null;
  const deviceView = lightPageDeps.getActiveDeviceSessionCardView();
  if (activeSun || deviceView) return { kind:'live' as const,sun:!!activeSun,sunView,deviceView };
  if (!includeEmptyState) return null;
  return getLightWidgetPromptView('No light session is running', 'Open Light & Sun', 'navigate-light',
    'Start an outdoor or therapy-device session there; this widget will then show its live timer, estimates, and stop controls.', 'light-live-session-empty');
}

function getLightWidgetPromptView(status: unknown, ctaLabel: unknown, ctaAction: unknown, hint: unknown, extraClass = '') {
  return { kind: 'prompt' as const, view: {
    status: String(status ?? ''), label: String(ctaLabel ?? ''), action: String(ctaAction ?? ''),
    hint: String(hint ?? ''), extraClass,
  } };
}

function getLightMethodsWidgetView() {
  const fitzpatrick = state.importedData?.sunDefaults?.fitzpatrick || null;
  const skinBasis = fitzpatrick
    ? `The current model uses Fitzpatrick ${fitzpatrick} as a rough base-MED reference, not a personal safe exposure time.`
    : 'Personalized burn-time guidance stays hidden until a skin type is configured.';
  const dataSource = lightPageDeps.getSunDataSourceSettingsView();
  return {kind:'methods' as const,skinBasis,dataSource:dataSource||null};
}

export function getLightTodayStripView() {
  const sessions = lightPageDeps.getSessions() || [];
  const solarWindow = isSolarWindow();
  const active = lightPageDeps.getActiveSession() || null;
  const medToday = lightPageDeps.cumulativeMEDToday() || 0;
  const devices = lightPageDeps.getDevices() || [];
  const defaults = state.importedData?.sunDefaults;
  const hasSetup = !!(defaults && defaults.completedAt && defaults.fitzpatrick);
  const environment = state.importedData?.lightEnvironment;
  const hasRooms = !!(environment && Array.isArray(environment.rooms) && environment.rooms.length > 0);
  const currentPause = active?.paused && Number.isFinite(active.pausedAt) ? Math.max(0, Date.now() - active.pausedAt) : 0;
  const elapsed = active ? _formatElapsedShort(Math.max(0, Date.now() - active.startedAt - (active.accumulatedPausedMs || 0) - currentPause)) : '';
  const now = Date.now();
  const deviceSessions = lightPageDeps.getDeviceSessions() || [];
  const weeklyIU = lightPageDeps.rollingVitaminDIU(7) || 0;
  const budget = lightPageDeps.vitaminDBudgetStatus();
  const coords = lightPageDeps.getSunCoords() || null;
  const view = projectLightToday({ sessions, solarWindow, windowLabel: solarWindowLabel(), active, medToday,
    devices, hasSetup, hasRooms, now, elapsed, deviceSessions, weeklyIU, budget, coords,
  });
  return {kind:'today' as const,view,dashboard:lightPageDeps.getLightTodayDashboardView()||null,
    conditions:getConditionsNowView({variant:'compact'}),pills:getDashboardLightChannelPills()};
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
  const slot = (section.querySelector('[data-channel-detail-slot]') as HTMLElement | null);
  const openChannel = slot?.dataset.openChannel || '';
  if (row) {
    const wrap = document.createElement('div') as PageInnerHTMLWriter;
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

function _hasCompletedSunSessionToday(sessions: unknown) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return (Array.isArray(sessions) ? sessions : []).some(session => {
    const timestamp = Number((session as PageSessionOperations | null | undefined)?.endedAt || 0);
    return timestamp >= start && timestamp < end;
  });
}

function getTodayUVSafetyView(sessions: unknown, medToday: number, medYesterday: number) {
  if (!_hasCompletedSunSessionToday(sessions) && !(medToday > 0)) return null;
  return projectLightUVSafety(medToday,medYesterday);
}

// ═══════════════════════════════════════════════
// LIGHT & SUN — dedicated view
// ═══════════════════════════════════════════════

export function showLight(_data: unknown) {
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
  const widgets: PageWidget[] = [];

  const projectedHeader=projectLensHeader('Light & Sun','Sunlight, indoor light, and your daily rhythm.');
  const header={title:projectedHeader.title,subtitle:projectedHeader.subtitle,className:projectedHeader.className};

  // AI hero verdict — synthesizes today's full picture (sun + devices +
  // environment + trends) into one read. Sits above active-session and
  // conditions so the user gets the "how am I doing?" answer before the
  // raw inputs.
  try {
    const safety = getTodayUVSafetyView(sessions, medToday, medYesterday);
    const ai = lightPageDeps.getLightTodayHeroView() || null;
    if (safety || ai) {
      widgets.push({
        id: 'light-today',
        title: 'Today',
        description: 'What stands out today, including modeled UV safety and one useful next step',
        content: {kind:'today-hero',safety,ai},
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
  const activeSessionBody = getLightLiveSessionView();
  if (activeSessionBody) {
    widgets.push({
      id: 'light-live-session',
      title: 'Live Session',
      description: 'Running sun or therapy sessions with stop controls',
      content: {kind:'body',props:activeSessionBody},
      size: 'full',
      opts: { source: 'Light', dashboardId: 'light-live-session' },
    });
  }

  // Always-visible "Conditions now" panel — UVI / ozone / AQI / sun angle.
  // Tells the user whether right now is a good time to go out, even before
  // they have any session history.
  // Setup card / saved summary. getSunSetupCardView() returns the editor
  // when onboarding is incomplete or the user has reopened to edit, and a
  // compact "Light setup saved" summary with an Edit button otherwise.
  let setupView:ReturnType<PageCalls['getSunSetupCardView']>=null;
  try { setupView = lightPageDeps.getSunSetupCardView() || null; } catch (_) {}
  const conditionsCoords = lightPageDeps.getSunCoords();
  const location=conditionsCoords?.source==='country-band'?getSunCoordsHintView():null;
  const conditions=getLightConditionsWidgetView({variant:'full'});
  widgets.push({
    id: 'light-conditions-now',
    title: 'Conditions Now',
    description: 'Current outdoor UVI, atmosphere, air quality, and sun timing',
    content: {kind:'conditions',location,props:conditions},
    size: 'full',
    opts: { source: 'Light', dashboardId: 'light-conditions-now' },
  });
  widgets.push({
    id: 'light-setup',
    title: 'Light Setup',
    description: 'Skin type, indoor light context, and personal light assumptions',
    content: {kind:'setup',props:setupView},
    size: 'half',
    opts: { source: 'Light', dashboardId: '' },
  });
  const logBody = getLightSessionLogActionsView();
  widgets.push({
    id: 'light-session-log',
    title: 'Log Sessions',
    description: 'Start sun or therapy sessions and backfill past exposure',
    content: {kind:'body',props:logBody},
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
  const channelsBody:LightPageBodyProps={kind:'channels',lead,pills:getChannelPillsView(totals7d,devTotals7d),location:isEmpty?getSunCoordsHintView():null};
  widgets.push({
    id: 'light-channels',
    title: 'What Your Light May Stimulate',
    description: 'Simple eye, skin, and body signals from sunlight and devices',
    content: {kind:'body',props:channelsBody},
    size: 'full',
    opts: { source: 'Light', dashboardId: 'light-channels' },
  });

  // This is a trend review, not today's safety surface. Keep the internal
  // widget id for saved page-order compatibility while giving the visible
  // module a precise job. It remains useful when no sessions were logged:
  // that state is labeled as missing data rather than missing exposure.
  const staticWeeklyReview = getWeeklyFallbackView(totals7d,devTotals7d,sessions,deviceSessionsAll);
  const weeklyReview = lightPageDeps.getChannelMixVerdictView(staticWeeklyReview) || staticWeeklyReview;
  const weeklyBody:LightPageBodyProps={kind:'weekly',review:weeklyReview};
  widgets.push({
    id: 'light-guidance',
    title: 'Weekly Light Review',
    description: 'What your past 7 days show, what changed, and one conservative next step',
    content: {kind:'body',props:weeklyBody},
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });

  if (!isEmpty) {

    // Unified sessions list — sun + device merged chronologically.
    // Active sun session is pinned at top of page; this list shows
    // historical (ended) ones. Skip the section header when empty so
    // a freshly-started session doesn't render an orphan "Sessions"
    // heading with no rows under it.
    const sessionHistory = getUnifiedSessionsView();
    if (sessionHistory) {
      // Header carries the count so the user gets a quick "do I have a
      // history yet?" answer alongside the section name. Replaces the
      // earlier orphan tally that sat above the CTAs.
      const _countLabel = totalSessions === 0 ? '' : ` (${totalSessions})`;
      widgets.push({
        id: 'light-sessions',
        title: `Recent Sessions${_countLabel}`,
        description: 'Chronological outdoor sun and therapy device history',
        content: {kind:'history',props:sessionHistory},
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
    content: {kind:'body',props:{kind:'loading',id:devicesSlotId,label:'Loading devices...'}},
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });
  widgets.push({
    id: 'light-environment',
    title: 'Indoor Light Assessment',
    description: 'Rooms, screens, readings, and saved audit snapshots',
    content: {kind:'body',props:{kind:'loading',id:environmentSlotId,label:'Loading environment...'}},
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });
  widgets.push({
    id: 'light-tools',
    title: 'Measurement Tools',
    description: 'On-device light checks and room measurement workflows',
    content: {kind:'body',props:{kind:'loading',id:toolsSlotId,label:'Loading tools...'}},
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });
  widgets.push({
    id: 'light-methods',
    title: 'Methods & Sources',
    description: 'Estimation model, uncertainty, and sun data source controls',
    content: {kind:'body',props:getLightMethodsWidgetView()},
    size: 'full',
    opts: { source: 'Light', dashboardId: '' },
  });

  main.innerHTML = renderLightPresentation({kind:'page',view:{header,grid:getLensContentGrid('light',widgets)}});
  main.querySelector('.light-page')?.classList.add('is-ready');

  let devicesRender: unknown;
  try {
    devicesRender = lightPageDeps.renderDevicesSection();
  } catch (error) {
    devicesRender = Promise.reject(error);
  }
  Promise.resolve(devicesRender).then((devHtml) => {
    const slot = document.getElementById(devicesSlotId) as PageOuterHTMLWriter | null;
    if (!slot) return;
    const devices = lightPageDeps.getDevices() || [];
    slot.outerHTML = devices.length > 0
      ? devHtml
      : renderLightWidgetPrompt('No devices added', 'Add device', 'open-add-device', 'Device sessions show targeted light alongside sunlight, without treating the two as interchangeable.');
  }).catch(() => {
    const slot = document.getElementById(devicesSlotId) as PageOuterHTMLWriter | null;
    if (slot) slot.outerHTML = renderLightWidgetPrompt('Devices could not load', 'Retry', 'navigate-light', 'Your saved device data was not removed. Reopen Light & Sun to try again.');
  });
  const envSlot = document.getElementById(environmentSlotId) as PageOuterHTMLWriter | null;
  if (envSlot) {
    try {
      const envHtml = lightPageDeps.renderEnvironmentAssessmentSummary() || '';
      envSlot.outerHTML = envHtml
        || renderLightWidgetPrompt('No rooms mapped', 'Open assessment', 'open-light-environment', 'Map bedroom, office, screens, and evening light so Light can interpret your indoor day.', 'light-environment-prompt');
    } catch (error) {
      envSlot.outerHTML = renderLightWidgetPrompt('Assessment could not load', 'Retry', 'navigate-light', 'Your saved rooms and audits were not removed. Reopen Light & Sun to try again.');
    }
  }
  const toolsSlot = document.getElementById(toolsSlotId) as PageOuterHTMLWriter | null;
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
  const wrap = document.createElement('div') as PageInnerHTMLWriter;
  wrap.innerHTML = lightPageDeps.renderLightTools() || '';
  if (wrap.firstElementChild) collapsed.replaceWith(wrap.firstElementChild);
}

function getSunCoordsHintView() {
  const coords = lightPageDeps.getSunCoords();
  if (!coords) return { country: false };
  if (coords.source === 'country-band') return { country: true, latitude: String(coords.lat) };
  return null;
}



export function renderLightLiveSession(options: {includeEmptyState?:unknown}={}){const props=getLightLiveSessionView(options);return props?renderLightPresentation(props):'';}
function renderLightWidgetPrompt(status:unknown,ctaLabel:unknown,ctaAction:unknown,hint:unknown,extraClass=''){return renderLightPresentation(getLightWidgetPromptView(status,ctaLabel,ctaAction,hint,extraClass));}
export function renderLightTodayStrip(){return renderLightPresentation(getLightTodayStripView());}
