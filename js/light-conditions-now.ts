// light-conditions-now.js — Current outdoor conditions widget for Light & Sun

import { getErrorMessage } from './caught-error.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  _formatElapsedShort,
  _sanityCheckAtmosphere,
  configureLightConditionsInterpretation,
} from './light-conditions-interpretation.js';
import { renderConditionsHTML } from './light-conditions-renderer.js';
import { projectConditions } from './light-conditions-presentation.js';
import type { ConditionsAtmosphere, ConditionsSlotView, ConditionsInspectionView } from './light-conditions-presentation.js';
import { renderHTML } from './components/LightConditionsPresentation.svelte.html.js';
import type { computeUVConfidence } from './sun-uvdata-atmosphere.js';

export interface ConditionsNowOptions { variant?: unknown; slotId?: unknown }
type ConditionsDependencyName = 'applyAtmOverrides' | 'computeUVConfidence' | 'fetchAtmosphere' | 'getSunCoords' | 'isDebugMode' | 'purgeMeteoCache' | 'showNotification' | 'solarZenithAngle';
type RawConditionsDependencies = Record<ConditionsDependencyName, unknown>;
type ConfidenceInputReader = { [Key in keyof NonNullable<Parameters<typeof computeUVConfidence>[0]>]?: unknown };
// Private operation views retain the original unchecked numeric/date consumers.
// Neither configuration snapshots nor cached payloads promise validated values.
type ConditionsDependencyReader = RawConditionsDependencies & { computeUVConfidence: ((input: ConfidenceInputReader) => ReturnType<typeof computeUVConfidence> | null | undefined) | null | undefined };
interface CoordinateOperationReader { lat: number; lon: number; source?: unknown }
interface AtmosphereOperationReader extends ConditionsAtmosphere { _stale?: unknown; _offline?: unknown; _requestCoords?: unknown; _camsMeta?: unknown; confidence?: unknown }
interface InspectionAtmosphereReader extends Omit<AtmosphereOperationReader, 'validAt' | 'fetchedAt' | 'uvIndex' | 'cloudCover' | 'confidence' | '_requestCoords' | '_camsMeta'> {
  validAt: string | number; fetchedAt: string | number; uvIndex: number; cloudCover: number; confidence: number | null | undefined;
  _requestCoords: { lat: number; lon: number; privacyRounded?: unknown }; _camsMeta: { ageSec: number };
}
interface ConditionsCacheReader { coordKey: string | null; atm: AtmosphereOperationReader; fetchedAt: number }
interface ConditionsActionTarget { closest?: ((selector: string) => Element | null) | null }
interface ConditionsActionRoot { contains?: ((element: Element) => unknown) | null }


export { _formatElapsedShort };

const LIGHT_CONDITIONS_ACTION_ATTR = 'data-light-conditions-action';
const LIGHT_CONDITIONS_ACTION_DELEGATE_KEY = Symbol.for('getbased.lightConditionsActionDelegatesInstalled');
const lightConditionsActionDelegateRoots = new WeakSet<object>();
const lightConditionsDeps: ConditionsDependencyReader = {
  applyAtmOverrides: (atm: unknown) => atm,
  computeUVConfidence: null,
  fetchAtmosphere: null,
  getSunCoords: () => null,
  isDebugMode: () => false,
  purgeMeteoCache: () => {},
  showNotification: null,
  solarZenithAngle: null,
};

export function configureLightConditionsNow(deps: unknown = {}): RawConditionsDependencies {
  const previous = { ...lightConditionsDeps };
  for (const [key, value] of Object.entries((deps || {}) as object)) {
    if (Object.prototype.hasOwnProperty.call(lightConditionsDeps, key)) {
      (lightConditionsDeps as RawConditionsDependencies)[key as ConditionsDependencyName] = value;
    } else {
      _debugWarn('[light-conditions-now] ignoring unknown dependency key', key);
    }
  }
  const solarZenithAngle = typeof lightConditionsDeps.solarZenithAngle === 'function'
    ? lightConditionsDeps.solarZenithAngle : null;
  (configureLightConditionsInterpretation as (deps: { solarZenithAngle: unknown }) => ReturnType<typeof configureLightConditionsInterpretation>)({ solarZenithAngle });
  return previous;
}

function _debugWarn(...args: unknown[]) {
  if (typeof lightConditionsDeps.isDebugMode === 'function' && (lightConditionsDeps.isDebugMode as () => unknown)()) {
    console.warn(...args);
  }
}

function _getSunCoords(): unknown {
  try {
    return (lightConditionsDeps.getSunCoords as () => unknown)() || null;
  } catch (_) {
    return null;
  }
}

function _solarZenithAngle(date: Date, coords: CoordinateOperationReader | null | undefined): unknown {
  if (!coords || typeof lightConditionsDeps.solarZenithAngle !== 'function') return null;
  try {
    return (lightConditionsDeps.solarZenithAngle as (date: Date, lat: unknown, lon: unknown) => unknown)(date, coords.lat, coords.lon);
  } catch (_) {
    return null;
  }
}

function _notify(...args: unknown[]) {
  if (typeof lightConditionsDeps.showNotification === 'function') {
    (lightConditionsDeps.showNotification as (...args: unknown[]) => unknown)(...args);
  }
}

function closestLightConditionsAction(target: EventTarget | null) {
  if (!target || !(target as ConditionsActionTarget).closest) return null;
  return ((target as ConditionsActionTarget).closest!)( `[${LIGHT_CONDITIONS_ACTION_ATTR}]`);
}

function handleLightConditionsActionClick(event: Event) {
  const actionEl = closestLightConditionsAction(event.target);
  if (!actionEl || !(event.currentTarget as ConditionsActionRoot | null)?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(LIGHT_CONDITIONS_ACTION_ATTR);
  if (action === 'refresh') {
    _refreshConditionsNow();
    event.stopPropagation();
    return;
  }
  if (action === 'inspect') {
    _inspectConditionsNow(actionEl instanceof HTMLElement ? actionEl : undefined);
    event.stopPropagation();
    return;
  }
}

export function installLightConditionsActionDelegates(root: unknown = typeof document !== 'undefined' ? document : null) {
  if (!root || lightConditionsActionDelegateRoots.has(root as object) || (root as Record<symbol, unknown>)[LIGHT_CONDITIONS_ACTION_DELEGATE_KEY]) return;
  lightConditionsActionDelegateRoots.add(root as object);
  Object.defineProperty(root, LIGHT_CONDITIONS_ACTION_DELEGATE_KEY, { value: true, configurable: true });
  (root as Pick<Document, 'addEventListener'>).addEventListener('click', handleLightConditionsActionClick);
}

if (typeof document !== 'undefined') installLightConditionsActionDelegates();

export function getLightConditionsWidgetView({ variant = 'full', slotId = '' }: ConditionsNowOptions = {}) {
  const conditionsOpts: ConditionsNowOptions = { variant };
  if (slotId) conditionsOpts.slotId = slotId;
  return {kind:'widget' as const,hasLocation:!!_getSunCoords(),slot:conditionsSlot(conditionsOpts)};
}

// "Conditions now" strip — renders current UVI / ozone / AQI / sun-angle
// for the user's resolved coords. Lazy-fetches via the injected atmosphere
// provider, which has its own 1hr cache layer. On fetch failure, falls back to
// cached or zenith-only estimate and shows a "stale" indicator. Designed
// to work fully offline once any earlier fetch has populated the cache.
//
// Renders as a placeholder div initially; the async fetch fills it in
// after first paint so dashboard render isn't blocked by network I/O.
//
// Cache is coords-keyed so a profile swap (different country → different
// coords) doesn't serve another profile/location's UVI/AQ/etc. Provider-side
// caching still uses the configured privacy-rounded request coordinates.
let _conditionsCache: ConditionsCacheReader | null = null; // { coordKey, atm, fetchedAt }
let _conditionsFetchInFlight = false;
// Per-slot 5min refresh intervals — keyed by deterministic slotId
// ('cond-now-compact' / 'cond-now-full'). Survives strip re-renders
// so a single interval handles auto-refresh for the slot's lifetime.
const _conditionsIntervals = new Map<string, ReturnType<typeof setInterval>>();

function _coordKey(coords: CoordinateOperationReader | null | undefined) {
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) return null;
  return `${coords.lat.toFixed(4)}_${coords.lon.toFixed(4)}`;
}

export function getCachedConditionsAtmosphere(): unknown {
  const coords = _getSunCoords() as CoordinateOperationReader | null | undefined;
  const key = _coordKey(coords);
  return (_conditionsCache && _conditionsCache.coordKey === key) ? _conditionsCache.atm : null;
}

function _centerConditionsNowMarker(slotOrId: unknown) {
  if (typeof document === 'undefined') return;
  const slot = (typeof slotOrId === 'string' ? document.getElementById(slotOrId) : slotOrId) as Pick<HTMLElement, 'querySelector'> | null | undefined;
  const scroller = slot?.querySelector?.<HTMLElement>('.conditions-now-events');
  const nowMarker = slot?.querySelector?.<HTMLElement>('.conditions-now-event-now');
  if (!scroller || !nowMarker || scroller.scrollWidth <= scroller.clientWidth + 2) return;
  const center = () => {
    const nextLeft = nowMarker.offsetLeft + (nowMarker.offsetWidth / 2) - (scroller.clientWidth / 2);
    scroller.scrollLeft = Math.max(0, nextLeft);
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(center);
  else setTimeout(center, 0);
}

export function getConditionsNowView(opts: ConditionsNowOptions = {}) {
  return {kind:'slot' as const,slot:conditionsSlot(opts)};
}

function conditionsSlot(opts: ConditionsNowOptions): ConditionsSlotView {
  const variant = (opts.variant || 'full') as string; // 'full' (Light page) | 'compact' (dashboard)
  // Deterministic slotId per variant — pre-2026-05-08 used Date.now()
  // which made the rendered HTML differ on every call, so any caller
  // doing a string-diff (Light Today strip 5s ticker) saw the strip
  // "always different" and re-swapped innerHTML, tearing this slot
  // down + restarting its loading spinner = visible blink.
  const slotId = (opts.slotId || `cond-now-${variant}`) as string;
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
    const coords = _getSunCoords() as CoordinateOperationReader | null | undefined;
    if (coords && _conditionsCache && _conditionsCache.coordKey === _coordKey(coords)
        && (Date.now() - _conditionsCache.fetchedAt) < 5 * 60 * 1000) {
      setTimeout(() => _centerConditionsNowMarker(slotId), 0);
      return { id: slotId, variant, view: projectConditions(_conditionsCache.atm, coords, variant) };
    }
  } catch (_) {}
  // No aria-live on the wrapper — auto-refresh would re-announce the whole
  // strip every cycle. Only user-triggered refresh announces, via a separate
  // sr-only live region populated in _refreshConditions(opts.force).
  return { id: slotId, variant, view: null };
}

async function _refreshConditions(slotId: string, variant: string, opts: { force?: unknown } = {}) {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  // Clear aria-busy on every exit path — the slot was created with
  // aria-busy="true" so screen readers don't announce intermediate
  // values. Whatever path resolves first must clear it.
  const _resolveBusy = () => slot.setAttribute('aria-busy', 'false');
  const coords = _getSunCoords() as CoordinateOperationReader | null | undefined;
  if (!coords) {
    _resolveBusy();
    slot.innerHTML = renderHTML({ kind: 'message', message: 'Set a country in your profile to see current sun conditions.' });
    return;
  }
  // Throttle: serve in-memory cache if we fetched recently (5 min) AND the
  // coords match the cached entry (within 0.5° bucket). Different coords
  // (profile swap) bust the cache. Force=true bypasses the throttle.
  const now = Date.now();
  const key = _coordKey(coords);
  if (!opts.force && _conditionsCache && _conditionsCache.coordKey === key && (now - _conditionsCache.fetchedAt) < 5 * 60 * 1000) {
    _resolveBusy();
    slot.innerHTML = renderConditionsHTML(_conditionsCache.atm, coords, variant);
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
    let atm: AtmosphereOperationReader | null = null, online = true, fetchError: string | null = null;
    try {
      if (typeof lightConditionsDeps.fetchAtmosphere !== 'function') {
        throw new Error('fetchAtmosphere unavailable');
      }
      atm = await (lightConditionsDeps.fetchAtmosphere as (input: { lat: unknown; lon: unknown; isoTime: string; noCache: boolean }) => unknown)({
        lat: coords.lat,
        lon: coords.lon,
        isoTime: new Date().toISOString(),
        noCache: !!opts.force, // user-triggered refresh skips both fresh + stale cache
      }) as AtmosphereOperationReader | null;
      if (atm?._stale || atm?._offline || /(?:zenith_offline|offline)/.test(String(atm?.source || ''))) online = false;
      if (atm && typeof lightConditionsDeps.applyAtmOverrides === 'function') {
        atm = (lightConditionsDeps.applyAtmOverrides as (atm: unknown) => unknown)(atm) as AtmosphereOperationReader | null;
      }
    } catch (e) {
      online = false;
      fetchError = String(getErrorMessage(e, e));
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
      slot.innerHTML = renderHTML({ kind: 'message', message: "Conditions data unavailable offline. Reconnect once and we'll cache it.", error: fetchError });
      return;
    }
    _conditionsCache = { coordKey: key, atm, fetchedAt: Date.now() };
    slot.setAttribute('aria-busy', 'false');
    slot.innerHTML = renderConditionsHTML(atm, coords, variant, !online);
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
      _notify(online ? '✓ Conditions refreshed' : '✓ Cached values reloaded (offline)');
    }
  } finally {
    _conditionsFetchInFlight = false;
  }
}

// User-triggered: force a re-fetch of conditions, bypassing all caches.
// Re-renders every conditions-now slot on the page (dashboard + Light page
// can both have one mounted at the same time). Also wipes the localStorage
// meteo cache so a device that latched onto a degraded provider
// (e.g. an Open-Meteo-only response cached while CAMS was unreachable
// during a relay-side outage) can recover without tab-killing — the
// next fetch hits the provider chain fresh.
export function _refreshConditionsNow() {
  if (typeof lightConditionsDeps.purgeMeteoCache === 'function') {
    try { (lightConditionsDeps.purgeMeteoCache as () => unknown)(); } catch {}
  }
  document.querySelectorAll('.conditions-now').forEach(el => {
    const slot = el as HTMLElement;
    const id = slot.id;
    const variant = slot.dataset.variant || 'full';
    if (id) _refreshConditions(id, variant, { force: true });
  });
}

function conditionsConfidence(atm: InspectionAtmosphereReader | null, coords: CoordinateOperationReader | null | undefined) {
  // Computed real-time confidence — weights snapshot age, cloud
  // cover, solar elevation, and UVI band so a low-sun heavy-cloud
  // CAMS reading isn't dishonestly reported as 95%.
  const computed = typeof lightConditionsDeps.computeUVConfidence === 'function' ? lightConditionsDeps.computeUVConfidence({
    source: atm?.source,
    snapshotAgeSec: atm?._camsMeta?.ageSec ?? null,
    cloudCover: atm?.cloudCover ?? null,
    zenithDeg: coords && (atm?.validAt || atm?.fetchedAt) ? _solarZenithAngle(new Date(atm.validAt || atm.fetchedAt), coords) : null,
    uvIndex: atm?.uvIndex ?? null,
    isStale: !!atm?._stale,
  }) : (atm?.confidence ?? null);
  if (computed == null) return { value: '—' };
  const pct = Math.round(computed * 100);
  // Tooltip lists the active discounts so the user can see WHY
  // confidence dropped — turns a single number into honest reasoning.
  const factors: string[] = [];
  const age = atm?._camsMeta?.ageSec;
  if (typeof age === 'number' && Number.isFinite(age)) {
    if (age > 86400) factors.push(`stale grid (${Math.round(age/3600)}h old)`);
    else if (age > 43200) factors.push(`grid ${Math.round(age/3600)}h old`);
    else if (age > 21600) factors.push(`grid ${Math.round(age/3600)}h old`);
  }
  const cc = atm?.cloudCover;
  const ccNorm = cc != null && cc > 1 ? cc / 100 : cc;
  if (typeof ccNorm === 'number' && Number.isFinite(ccNorm)) {
    if (ccNorm > 0.8) factors.push(`heavy cloud (${Math.round(ccNorm*100)}%)`);
    else if (ccNorm > 0.5) factors.push(`moderate cloud (${Math.round(ccNorm*100)}%)`);
  }
  if (atm?._stale) factors.push('upstream marked stale');
  if (atm?._offline) factors.push('offline geometry-only estimate');
  const u = atm?.uvIndex;
  if (typeof u === 'number' && Number.isFinite(u) && u < 2) factors.push(`low UVI (${u.toFixed(1)} — model band noisy below 2)`);
  const tip = factors.length ? `Discounted by: ${factors.join('; ')}` : 'No active discounts; baseline source confidence.';
  return { value: `${pct}%`, title: tip };
}


// User-triggered: open a modal showing the raw atmosphere response so the
// user can verify what the provider returned, what we parsed, and what the
// engine will use. Pure inspection — no side effects.
export function _inspectConditionsNow(returnFocus?: HTMLElement) {
  const coords = _getSunCoords() as CoordinateOperationReader | null | undefined;
  const key = _coordKey(coords);
  const atm = ((_conditionsCache && _conditionsCache.coordKey === key) ? _conditionsCache.atm : null) as InspectionAtmosphereReader;
  const warnings = atm ? (_sanityCheckAtmosphere as (atm: unknown, coords: unknown) => ReturnType<typeof _sanityCheckAtmosphere>)(atm, coords) : [];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const closeDialog = () => removeModalOverlay(overlay);
  const cacheKeys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('meteo:')) cacheKeys.push(k);
    }
  } catch (e) {}
  const confidence = conditionsConfidence(atm, coords);
  const view: ConditionsInspectionView = {
    fields: [
      { label: 'Source', value: String(atm?.source || '—') },
      { label: 'Valid at', value: atm?.validAt ? new Date(atm.validAt).toLocaleString() : '—' },
      { label: 'Retrieved at', value: atm?.fetchedAt ? new Date(atm.fetchedAt).toLocaleString() : '—' },
      { label: 'Profile location (local)', value: coords ? `${coords.lat.toFixed(2)}°, ${coords.lon.toFixed(2)}° (${coords.source || 'unknown'})` : '—' },
      { label: 'Location sent to provider', value: Number.isFinite(atm?._requestCoords?.lat) && Number.isFinite(atm?._requestCoords?.lon) ? `${atm._requestCoords.lat.toFixed(2)}°, ${atm._requestCoords.lon.toFixed(2)}°${atm._requestCoords.privacyRounded ? ' (privacy-rounded)' : ''}` : '—' },
      { label: 'Confidence', ...confidence },
    ],
    warnings, raw: atm ? JSON.stringify(atm, null, 2) : 'No cached response.', cacheKeys,
  };
  overlay.innerHTML = renderHTML({ kind: 'inspect', view });
  openAppendedModalOverlay(overlay, closeDialog, { returnFocus });
  overlay.querySelectorAll('[data-conditions-inspect-close]').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });
  overlay.querySelector('#conditions-inspect-refresh')?.addEventListener('click', () => {
    closeDialog();
    _refreshConditionsNow();
  });
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
      const wheelEvent = e as WheelEvent;
      const before = rawPre.scrollTop;
      rawPre.scrollTop = before + wheelEvent.deltaY;
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
function _bustMeteoCacheForCoords(_coords: unknown) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('meteo:')) localStorage.removeItem(k);
    }
  } catch (e) {}
}

export function renderLightConditionsWidgetBody(opts:ConditionsNowOptions={}){return renderHTML(getLightConditionsWidgetView(opts));}
export function renderConditionsNow(opts:ConditionsNowOptions={}){return renderHTML(getConditionsNowView(opts));}
