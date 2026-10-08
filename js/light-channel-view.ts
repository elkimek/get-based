import { renderHTML as renderChannelDetail } from './components/LightChannelDetail.svelte.html.js';
import { projectChannelDetail } from './light-channel-presentation.js';
import { renderHTML as renderLightReview } from './components/LightReviewAI.svelte.html.js';
// light-channel-view.js — Light channel pill and detail renderers

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { getCachedConditionsAtmosphere } from './light-conditions-now.js';

// Private operations used by the original renderer, not validation of injected
// callbacks or persisted values. Public configuration snapshots and merged totals
// stay opaque; erased readers preserve unchecked coercions and error behavior.
interface ChannelMetaReader { icon?: unknown; label?: unknown; what?: unknown }
interface ChannelDayOperations { sun: number; device: number; date: { getDay(): number; getTime(): unknown } }
interface ChannelDeviceReader { channels?: unknown }
interface ChannelAtmosphereOperations { daily?: { peakAt?: string | number | null; uvIndexMax?: number | null } | null }
interface ChannelNavigationOperations { then?: ((callback: () => unknown) => { catch(callback: (error: unknown) => unknown): unknown }) | null }
interface ChannelCalls extends Record<string, unknown> {
  channelDisplay: unknown;
  dailyChannelBreakdown: ((key: unknown, days: number) => ChannelDayOperations[]) | null;
  dailyVitaminDIUBreakdown: ((days: number) => ChannelDayOperations[]) | null;
  rollingChannelTotals: (days: number) => unknown;
  rollingDeviceTotals: (days: number) => unknown;
  pbmJoulesPerCm2: ((value: number) => number) | null;
  getDevices: () => unknown;
  navigate: (view: string) => unknown;
  quickLogSunSession: () => unknown;
  quickLogDeviceSession: () => unknown;
}
interface ChannelActionTarget { closest?: ((selector: string) => HTMLElement | null) | null }
interface ChannelActionRoot { contains?: ((element: HTMLElement) => unknown) | null; addEventListener(type: string, listener: (event: ChannelActionEvent) => void): unknown; [key: symbol]: unknown }
interface ChannelActionEvent { target?: ChannelActionTarget | null; currentTarget?: ChannelActionRoot | null; stopPropagation(): unknown }
interface ChannelSessionReader { endedAt?: unknown }

const lightChannelDeps: ChannelCalls = {
  channelDisplay: {}, dailyChannelBreakdown: null, dailyVitaminDIUBreakdown: null, weeklyChannelTier: () => 0,
  tierLabel: () => 'none', rollingChannelTotals: () => ({}), rollingDeviceTotals: () => ({}), rollingVitaminDIU: () => 0,
  pbmJoulesPerCm2: null, getDevices: () => [], navigate: () => {}, quickLogSunSession: () => {}, quickLogDeviceSession: () => {},
};
export function configureLightChannelView(deps: unknown = {}): Record<string, unknown> { const previous = { ...lightChannelDeps }; Object.assign(lightChannelDeps, deps); return previous; }
const getChannelDisplay = () => (lightChannelDeps.channelDisplay || {}) as Record<string, ChannelMetaReader | undefined>;

const LIGHT_CHANNEL_ACTION_ATTR = 'data-light-channel-action';
const LIGHT_CHANNEL_ACTION_DELEGATE_KEY = Symbol.for('getbased.lightChannelActionDelegatesInstalled'), lightChannelActionDelegateRoots = new WeakSet();
function closestLightChannelAction(target: ChannelActionTarget | null | undefined) { return target?.closest?.(`[${LIGHT_CHANNEL_ACTION_ATTR}]`) || null; }
function handleLightChannelActionClick(event: ChannelActionEvent) {
  const actionEl = closestLightChannelAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(LIGHT_CHANNEL_ACTION_ATTR);
  const channelKey = (actionEl as HTMLElement).dataset.channel || '';
  let handled = true;
  if (action === 'toggle-detail' && channelKey) _toggleChannelDetail(channelKey);
  else if (action === 'quick-log-sun') lightChannelDeps.quickLogSunSession();
  else if (action === 'quick-log-device') lightChannelDeps.quickLogDeviceSession();
  else handled = false;
  if (handled) event.stopPropagation();
}
export function installLightChannelActionDelegates(root: unknown = typeof document !== 'undefined' ? document : null) {
  if (!root || lightChannelActionDelegateRoots.has(root as object) || (root as ChannelActionRoot)[LIGHT_CHANNEL_ACTION_DELEGATE_KEY]) return;
  lightChannelActionDelegateRoots.add(root as object);
  Object.defineProperty(root, LIGHT_CHANNEL_ACTION_DELEGATE_KEY, { value: true, configurable: true });
  (root as ChannelActionRoot).addEventListener('click', handleLightChannelActionClick);
}
if (typeof document !== 'undefined') installLightChannelActionDelegates();
export function mergeTotals(a: unknown, b: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [k, v] of Object.entries(b || {})) out[k] = ((out[k] || 0) as number) + (v as number);
  return out;
}

const _hasSignal = (value: unknown) => Number.isFinite(value) && (value as number) > 0.0001;

function _sourceSignalLabel(sun: unknown, device: unknown) {
  const hasSun = _hasSignal(sun);
  const hasDevice = _hasSignal(device);
  if (hasSun && hasDevice) return 'Sunlight + device logged';
  if (hasSun) return 'Sunlight logged';
  if (hasDevice) return 'Device logged';
  return 'Not logged';
}

// Mini 7-day sparkline rendered as inline SVG. Height shows the rhythm of
// modeled exposure, while solid/faded segments keep sunlight and devices
// visibly separate. There is no target or completion color.
export function _channelSparkline(channelKey: unknown) {
  const breakdown = lightChannelDeps.dailyChannelBreakdown;
  if (!breakdown) return '';
  const days = breakdown(channelKey, 7);
  const observedMax = Math.max(0, ...days.flatMap(d => [d.sun, d.device]));
  const max = Math.max(observedMax, 0.001);
  const W = 47, H = 14, barW = 2, pairGap = 1, gap = 2;
  const bars = days.map((d, i) => {
    const x = i * (barW * 2 + pairGap + gap);
    const total = d.sun + d.device;
    if (!_hasSignal(total)) {
      return `<rect x="${x}" y="${H - 1.5}" width="${barW * 2 + pairGap}" height="1.5" fill="var(--text-muted)" opacity="0.22" rx="0.6"/>`;
    }
    const sunH = Math.max(0, (d.sun / max) * H);
    const devH = Math.max(0, (d.device / max) * H);
    return `${sunH > 0 ? `<rect x="${x}" y="${H - sunH}" width="${barW}" height="${sunH}" fill="var(--channel-accent, var(--accent))" opacity="0.9" rx="0.6"/>` : ''}${devH > 0 ? `<rect x="${x + barW + pairGap}" y="${H - devH}" width="${barW}" height="${devH}" fill="var(--channel-accent, var(--accent))" opacity="0.38" rx="0.6"/>` : ''}`;
  }).join('');
  return `<svg class="light-pill-sparkline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${bars}</svg>`;
}

// Count days on which this channel received any modeled signal. This is a log
// summary, not a sufficiency threshold or a biological streak.
export function _channelDayCount(channelKey: unknown) {
  const breakdown = lightChannelDeps.dailyChannelBreakdown;
  if (!breakdown) return { txt: 'Not logged', n: 0, sun: 0, device: 0 };
  const days = breakdown(channelKey, 7);
  let n = 0, sun = 0, device = 0;
  for (const d of days) {
    if (_hasSignal(d.sun + d.device)) n++;
    if (_hasSignal(d.sun)) sun++;
    if (_hasSignal(d.device)) device++;
  }
  return { txt: n ? `${n} day${n === 1 ? '' : 's'}` : 'Not logged', n, sun, device };
}

// Unified channel pill row — same vocabulary as the dashboard strip,
// reused on the Light page where each pill is a click-to-expand entry into
// a per-channel drill-down panel (source, rhythm, plain-language meaning,
// and research). Empty state renders the same row with all-empty
// sparklines; bars fill in as data accumulates. One renderer for both
// states.
export function renderChannelPills(sunTotals7d: unknown, deviceTotals7d: unknown = {}) {
  const ch = getChannelDisplay();
  const order = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'];
  let html = `<div class="light-pills-row light-pills-interactive">`;
  for (const k of order) {
    const meta = ch[k] || {};
    const sun = (sunTotals7d as Record<string, unknown>)[k] || 0;
    const device = (deviceTotals7d as Record<string, unknown>)[k] || 0;
    const active = _hasSignal(sun) || _hasSignal(device);
    const sourceLabel = _sourceSignalLabel(sun, device);
    const dc = _channelDayCount(k);
    const sourceDays = [dc.sun ? `sunlight ${dc.sun}d` : '', dc.device ? `device ${dc.device}d` : ''].filter(Boolean).join(' · ');
    const tip = `${meta.what || ''} — ${sourceLabel}${sourceDays ? ` (${sourceDays})` : ''}.`;
    const detailId = `light-pill-detail-${k}`;
    html += `<button type="button" class="light-pill light-pill-tier-${active ? 2 : 0} light-pill-signal-${active ? 'logged' : 'empty'} light-pill-interactive" data-light-channel-action="toggle-detail" data-channel="${escapeAttr(k)}" aria-expanded="false" aria-controls="${detailId}" title="${escapeHTML(tip)}">
      <span class="light-pill-icon" aria-hidden="true">${meta.icon || '·'}</span>
      <span class="light-pill-label">${escapeHTML(meta.label || k)}</span>
      ${_channelSparkline(k)}
      <span class="light-pill-daycount">${escapeHTML(dc.txt)}</span>
      <span class="sr-only">${escapeHTML(sourceLabel)}${dc.n ? ` on ${dc.n} day${dc.n === 1 ? '' : 's'} this week` : ''}</span>
    </button>`;
  }
  html += `</div>`;
  // The drill-down slot lives below the row. Only one channel is expanded
  // at a time — toggling collapses any other open detail.
  html += `<div class="light-channel-detail-slot" data-channel-detail-slot></div>`;
  return html;
}

// Gather current service values once. The pure view model owns chart geometry
// and reading copy; authored Svelte owns all detail markup.
function _renderChannelDetailPanel(channelKey: unknown) {
  const channel = String(channelKey);
  const meta = getChannelDisplay()[channel] || {};
  const sunTotals = (typeof lightChannelDeps.rollingChannelTotals === 'function' ? lightChannelDeps.rollingChannelTotals(7) : null) || {};
  const deviceTotals = (typeof lightChannelDeps.rollingDeviceTotals === 'function' ? lightChannelDeps.rollingDeviceTotals(7) : null) || {};
  let recentDays: ChannelDayOperations[] = [];
  try { recentDays = lightChannelDeps.dailyChannelBreakdown?.(channelKey, 14).slice(7) || []; } catch {}
  const devices = lightChannelDeps.getDevices() || [];
  const atmosphere = getCachedConditionsAtmosphere() as ChannelAtmosphereOperations | null | undefined;
  const chartDays = lightChannelDeps.dailyChannelBreakdown?.(channelKey, 7) || null;
  const iuDays = chartDays && channelKey === 'vitamin_d' && lightChannelDeps.dailyVitaminDIUBreakdown
    ? lightChannelDeps.dailyVitaminDIUBreakdown(7) : null;
  return renderChannelDetail({ view: projectChannelDetail({ channel, meta,
    sun: (sunTotals as Record<string, unknown>)[channel] || 0,
    device: (deviceTotals as Record<string, unknown>)[channel] || 0,
    recentDays, chartDays, iuDays, pbmJoulesPerCm2: lightChannelDeps.pbmJoulesPerCm2,
    matchingDevice: ((devices || []) as ChannelDeviceReader[]).some(item => Array.isArray(item.channels) && item.channels.includes(channelKey)),
    peakAt: atmosphere?.daily?.peakAt || null, peakUV: atmosphere?.daily?.uvIndexMax ?? null,
  }) });
}

// Navigate to the Light & Sun page and auto-expand the channel's
// drill-down panel. Used when the user taps a dashboard pill — gives
// them one-click access to the science / 30d trend / suggestion
// instead of forcing them to find the same pill on the Light page
// after navigation. Already on Light? Just toggle in place.
export function _openChannelOnLightPage(channelKey: unknown) {
  // Helper: scroll the expanded panel into view + briefly flash so the
  // user notices when they're already on the Light page and the panel may
  // be far below the fold.
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
  // Two rAFs keep the devices/env/tools slot from racing the toggle.
  const expandAfterNavigation = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    _toggleChannelDetail(channelKey);
    flashPanel();
  }));
  const navigation = lightChannelDeps.navigate('light') as ChannelNavigationOperations | null | undefined;
  if (!navigation || typeof navigation.then !== 'function') { expandAfterNavigation(); return; }
  void navigation.then(expandAfterNavigation).catch(err => console.error('Failed to open Light & Sun channel', err));
}

// Toggle a per-channel detail panel below the pill row. One channel
// expanded at a time — opening another collapses the previous one.
// Re-clicking the same pill collapses it.
export function _toggleChannelDetail(channelKey: unknown) {
  const slot = (document.querySelector('[data-channel-detail-slot]') as HTMLElement | null);
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
  slot.dataset.openChannel = channelKey as string;
  // Mark the matching pill expanded; move focus into the panel for SR users
  for (const p of pills) {
    if ((p as HTMLElement).dataset.channel === channelKey) {
      p.setAttribute('aria-expanded', 'true');
      const panel = (slot.firstElementChild as HTMLElement | null);
      if (panel) panel.setAttribute('tabindex', '-1');
      requestAnimationFrame(() => panel && panel.focus({ preventScroll: false }));
      break;
    }
  }
}

function _weeklySessionSummary(sessions: unknown, start: number, end: number) {
  const completed = ((Array.isArray(sessions) ? sessions : []) as Array<ChannelSessionReader | null | undefined>).filter(session => {
    const timestamp = Number(session?.endedAt || 0);
    return timestamp >= start && timestamp < end;
  });
  const days = new Set(completed.map(session => {
    const date = new Date(Number(session!.endedAt));
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }));
  return { sessions: completed.length, days: days.size };
}

function _sessionCountText(count: number, source: string) {
  return `${count} ${source} session${count === 1 ? '' : 's'}`;
}

// Calm seven-day summary for users without AI, and the grounding content
// shown before an AI review is requested. It compares logging patterns only:
// missing records never become a claim that the person received no light.
// Session arrays are optional so older consumers that only have channel
// totals still receive a useful source summary.
export function renderSuggestion(sunTotals7d: unknown = {}, deviceTotals7d: unknown = {}, sunSessions: unknown = null, deviceSessions: unknown = null) {
  const hasSun = Object.values(sunTotals7d as object).some(_hasSignal);
  const hasDevice = Object.values(deviceTotals7d as object).some(_hasSignal);
  const now = Date.now();
  const dayMs = 86400000;
  const hasSessionHistory = Array.isArray(sunSessions) || Array.isArray(deviceSessions);
  const currentSun = hasSessionHistory
    ? _weeklySessionSummary(sunSessions, now - 7 * dayMs, now)
    : { sessions: hasSun ? 1 : 0, days: hasSun ? 1 : 0 };
  const currentDevice = hasSessionHistory
    ? _weeklySessionSummary(deviceSessions, now - 7 * dayMs, now)
    : { sessions: hasDevice ? 1 : 0, days: hasDevice ? 1 : 0 };
  const previousSun = hasSessionHistory
    ? _weeklySessionSummary(sunSessions, now - 14 * dayMs, now - 7 * dayMs)
    : { sessions: 0, days: 0 };
  const previousDevice = hasSessionHistory
    ? _weeklySessionSummary(deviceSessions, now - 14 * dayMs, now - 7 * dayMs)
    : { sessions: 0, days: 0 };
  const currentTotal = currentSun.sessions + currentDevice.sessions;
  const previousTotal = previousSun.sessions + previousDevice.sessions;
  const loggedDays = new Set<string>();
  if (hasSessionHistory) {
    for (const session of [...((sunSessions || []) as Iterable<ChannelSessionReader | null | undefined>), ...((deviceSessions || []) as Iterable<ChannelSessionReader | null | undefined>)]) {
      const timestamp = Number(session?.endedAt || 0);
      if (timestamp < now - 7 * dayMs || timestamp >= now) continue;
      const date = new Date(timestamp);
      loggedDays.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
    }
  }

  let headline: string;
  let nextStep: string;
  if (currentTotal === 0) {
    headline = 'No outdoor or device sessions were logged in the past 7 days. We can’t tell whether you received little light or simply didn’t record it.';
    nextStep = 'If this reflects your week, a brief outdoor daylight break when practical can add a clear daytime signal. Ambient daylight is enough for the eyes; never stare at the sun.';
  } else {
    const sourceParts = [
      currentSun.sessions ? _sessionCountText(currentSun.sessions, 'outdoor') : '',
      currentDevice.sessions ? _sessionCountText(currentDevice.sessions, 'device') : '',
    ].filter(Boolean);
    const dayText = hasSessionHistory ? ` across ${loggedDays.size} logged day${loggedDays.size === 1 ? '' : 's'}` : '';
    headline = `The past 7 days contain ${sourceParts.join(' and ')}${dayText}.`;
    if (currentSun.sessions === 0 && currentDevice.sessions > 0) {
      nextStep = 'Devices supply targeted light. Outdoor daylight adds a wider spectrum and time-of-day context that a device does not copy.';
    } else if (currentSun.sessions > 0 && currentDevice.sessions > 0) {
      nextStep = 'Sunlight and device records stay separate; neither is added into a biological completion score.';
    } else {
      nextStep = 'The records show exposure, not whether every light-responsive pathway received enough stimulation.';
    }
  }

  let comparison: string;
  if (previousTotal === 0 && currentTotal === 0) comparison = 'There are no logged sessions in the previous 7 days either.';
  else if (previousTotal === 0) comparison = 'The previous 7 days contain no logged sessions for comparison.';
  else {
    comparison = `Previous 7 days: ${_sessionCountText(previousSun.sessions, 'outdoor')} and ${_sessionCountText(previousDevice.sessions, 'device')}.`;
  }

  return renderLightReview({ view: { kind: 'weekly-fallback', headline, comparison, nextStep, empty: currentTotal === 0 } });
}
