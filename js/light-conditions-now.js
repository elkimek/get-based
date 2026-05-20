// light-conditions-now.js — Current outdoor conditions widget for Light & Sun

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';

export function renderLightConditionsWidgetBody({ variant = 'full', slotId = '' } = {}) {
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

export function getCachedConditionsAtmosphere() {
  const coords = (typeof window !== 'undefined' && window.getSunCoords && window.getSunCoords()) || null;
  const key = _coordKey(coords);
  return (_conditionsCache && _conditionsCache.coordKey === key) ? _conditionsCache.atm : null;
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
export function _refreshConditionsNow() {
  if (typeof window.purgeMeteoCache === 'function') {
    try { window.purgeMeteoCache(); } catch {}
  }
  document.querySelectorAll('.conditions-now').forEach(el => {
    const id = el.id;
    const variant = el.dataset.variant || 'full';
    if (id) _refreshConditions(id, variant, { force: true });
  });
}

export async function _setManualUvi() {
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

export async function _clearManualUvi() {
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
export function _inspectConditionsNow() {
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
export function _formatElapsedShort(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}
