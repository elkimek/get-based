// @ts-check
// light-conditions-renderer.js — Current-conditions presentation owner.

import { escapeAttr, escapeHTML } from './utils.js';
import { parseProviderTimeMs } from './sun-uvdata-atmosphere.js';
import {
  _aggregateAQ,
  _cloudNarrative,
  _computeUvaWindow,
  _europeanAQCategory,
  _fmtMinutes,
  _fmtTime,
  _humanProviderLabel,
  _sanityCheckAtmosphere,
  _solarZenithAngle,
  _sunPositionLabel,
  _sunPositionSub,
  _uviConditionLabel,
  SHADOW_RULE_HINT,
  SMOG_HINT,
} from './light-conditions-interpretation.js';

function conditionsTooltipAttr(text, opts = {}) {
  if (!text) return '';
  return ` data-conditions-tooltip="${escapeAttr(text)}"${opts.focusable ? ' tabindex="0"' : ''}`;
}

function sourceAttributionHTML(source, fallbackLabel) {
  const value = String(source || '');
  const links = [];
  if (value.includes('cams')) {
    links.push('<a class="conditions-now-attribution" href="https://atmosphere.copernicus.eu/" target="_blank" rel="noopener">CAMS</a>');
  }
  if (value.includes('open_meteo')) {
    links.push('<a class="conditions-now-attribution" href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>');
  }
  if (value.includes('noaa')) {
    links.push('<a class="conditions-now-attribution" href="https://www.weather.gov/" target="_blank" rel="noopener">NOAA NWS</a>');
  }
  return links.length ? links.join(' + ') : escapeHTML(fallbackLabel);
}

export function renderConditionsHTML(atm, coords, variant, offline = false) {
  const uvi = atm.uvIndex != null ? Math.round(atm.uvIndex * 10) / 10 : null;
  const uviClear = atm.uvClearSky != null ? Math.round(atm.uvClearSky * 10) / 10 : null;
  // Stratospheric ozone (DU) — only available with CAMS/selfhost. Free
  // Open-Meteo can't deliver it, so the cell typically falls back to the
  // surface-ozone AQ reading further down.
  const ozone = atm.ozoneDU != null ? Math.round(atm.ozoneDU) : null;
  const surfaceOzone = atm.airQuality?.surfaceOzoneUgM3 != null ? Math.round(atm.airQuality.surfaceOzoneUgM3) : null;
  const cloud = atm.cloudCover != null ? Math.round(atm.cloudCover) : null;

  // Sanity-check the data — UVI shouldn't exist when sun is below horizon,
  // shouldn't exceed ~16 anywhere on Earth, etc. Flag suspicious responses
  // so the user knows when the upstream looks off.
  const sanityWarnings = _sanityCheckAtmosphere(atm, coords);
  const uviWarnings = sanityWarnings.filter(warning => warning.startsWith('UVI'));
  const uviReliable = uviWarnings.length === 0;
  const sourceLabel = _humanProviderLabel(atm.source);
  const validAt = Number.isFinite(atm.validAt) ? atm.validAt : atm.fetchedAt;
  const validAgoMin = validAt ? Math.max(0, Math.round((Date.now() - validAt) / 60000)) : null;
  const fetchedAgoMin = atm.fetchedAt ? Math.max(0, Math.round((Date.now() - atm.fetchedAt) / 60000)) : null;
  const elapsedLabel = minutes => minutes == null ? 'unknown'
    : minutes < 1 ? 'just now'
    : minutes < 60 ? `${minutes} min ago`
    : `${Math.round(minutes / 60)}h ago`;
  const freshnessLabel = elapsedLabel(validAgoMin);
  const retrievedLabel = elapsedLabel(fetchedAgoMin);
  // Solar zenith angle — degrees from vertical. 0 = sun directly overhead.
  const zenith = _solarZenithAngle(new Date(), coords);
  const sunAngle = zenith != null ? Math.round(90 - zenith) : null;

  // UV index color ramp — UVI 0 green → UVI 11+ purple.
  let uviCls = 'low';
  if (uvi != null && uviReliable) {
    if (uvi >= 11) uviCls = 'extreme';
    else if (uvi >= 8) uviCls = 'very-high';
    else if (uvi >= 6) uviCls = 'high';
    else if (uvi >= 3) uviCls = 'moderate';
  }

  const uviLabel = _uviConditionLabel(uvi);
  const peakAt = atm.daily?.peakAt;
  const peakUvi = atm.daily?.uvIndexMax;
  const peakIsNow = peakAt && uvi != null && peakUvi != null && uvi >= peakUvi - 0.3;
  const peakChip = peakAt && peakUvi != null && !peakIsNow
    ? `peak ${_fmtTime(peakAt)} · UVI ${peakUvi.toFixed(1)}`
    : (peakIsNow ? 'at today\'s peak' : '');
  const cloudWord = _cloudNarrative(cloud);
  const cloudChip = cloudWord
    ? (uviClear != null && uvi != null && uviClear > uvi + 0.5
       ? `${cloudWord} · clear-sky UVI ${uviClear.toFixed(1)}`
       : cloudWord)
    : '';
  const eaqi = atm.airQuality?.european_aqi ?? null;
  const aqAgg = _aggregateAQ(atm.airQuality, eaqi);
  const ozoneEaqi = atm.airQuality?.european_aqi_ozone ?? null;
  const ozoneCategory = _europeanAQCategory(ozoneEaqi);

  // Build today's chronological sun-event rail with a current-time marker.
  const sunrise = atm.daily?.sunrise;
  const sunset = atm.daily?.sunset;
  const locationOffsetSeconds = Number(atm.hourly?.utcOffsetSeconds) || 0;
  const sunriseMs = parseProviderTimeMs(sunrise, locationOffsetSeconds);
  const sunsetMs = parseProviderTimeMs(sunset, locationOffsetSeconds);
  const peakAtMs = parseProviderTimeMs(peakAt, locationOffsetSeconds);
  const uvaAnchor = Number.isFinite(sunriseMs) ? new Date(sunriseMs) : new Date();
  const { firstUVA, lastUVA } = _computeUvaWindow(coords, uvaAnchor, locationOffsetSeconds);
  const events = [];
  if (sunrise) {
    events.push({
      icon: '🌅',
      label: _fmtTime(sunrise),
      ts: sunriseMs,
      kind: 'sunrise',
      tooltip: 'Geometric sunrise — the solar disk crosses the horizon and the direct spectrum begins its transition from twilight.',
    });
  }
  const localHHMM = date => {
    const pad = value => String(value).padStart(2, '0');
    const shifted = new Date(date.getTime() + locationOffsetSeconds * 1000);
    return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
  };
  if (firstUVA) {
    events.push({
      icon: '◐',
      label: `${localHHMM(firstUVA)} · UV-A on`,
      ts: firstUVA.getTime(),
      kind: 'first-uva',
      uvaEvent: true,
      tooltip: 'UV-A transition begins. The sun crosses the model’s ~5° threshold, where surface UV-A becomes a more substantial photobiological input. Photon-driven molecular signaling can be switch-like, while downstream responses depend on wavelength, dose, tissue, and context. Trace diffuse UV-A may be present earlier.',
    });
  }
  if (peakAt) {
    events.push({
      icon: '☀',
      label: `${_fmtTime(peakAt)}${peakUvi != null ? ` · UVI ${peakUvi.toFixed(1)}` : ''}`,
      ts: peakAtMs,
      peak: true,
      kind: 'peak',
      tooltip: 'Solar noon — UVI at its daily maximum.',
    });
  }
  if (lastUVA) {
    events.push({
      icon: '◑',
      label: `${localHHMM(lastUVA)} · UV-A off`,
      ts: lastUVA.getTime(),
      kind: 'last-uva',
      uvaEvent: true,
      tooltip: 'UV-A transition closes. The sun drops below the same ~5° threshold, so this photobiological input rapidly diminishes. Small direct or diffuse UV-A may persist toward sunset and twilight, and downstream signaling does not stop instantly.',
    });
  }
  if (sunset) {
    events.push({
      icon: '🌇',
      label: _fmtTime(sunset),
      ts: sunsetMs,
      kind: 'sunset',
      tooltip: 'Geometric sunset — the solar disk drops below the horizon. Low diffuse twilight, including small UV-A contributions, can persist after this moment.',
    });
  }
  const nowTs = Date.now();
  const upcoming = events.filter(event => event.ts > nowTs).sort((a, b) => a.ts - b.ts);
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
  /** @type {Array<{ icon: string, label: string, ts: number, tooltip: string, kind?: string, isNow?: boolean, peak?: boolean, uvaEvent?: boolean }>} */
  const eventsWithNow = [...events, nowEvent].sort((a, b) => a.ts - b.ts);
  const eventRailLabel = event => ({
    sunrise: 'Sunrise',
    'first-uva': 'UV-A on',
    peak: 'Peak',
    'last-uva': 'UV-A off',
    sunset: 'Sunset',
  })[event.kind] || (event.isNow ? 'Now' : 'Event');
  const eventRailTime = event => {
    if (event.isNow) return event.label.replace(/^now(?: · )?/, '') || 'current';
    if (event.kind === 'first-uva' || event.kind === 'last-uva') return event.label.split(' · ')[0];
    return event.label;
  };
  const timelineTip = 'Today\'s sun timeline — left to right is the timeline through your day. Events left of the highlighted now-marker have passed; events to the right are upcoming.';
  const sunEventsLine = events.length ? `<div class="conditions-now-events-wrap"${conditionsTooltipAttr(timelineTip, { focusable: true })}>
    <div class="conditions-now-events-caption">Today's sun timeline <span class="conditions-now-events-scroll-hint" aria-hidden="true">scroll ↔</span></div>
    <div class="conditions-now-events">
      <div class="conditions-now-events-rail" role="list" aria-label="Today's sun timeline" style="--conditions-event-count: ${eventsWithNow.length};">
        <span class="conditions-now-events-track" aria-hidden="true"></span>
        ${eventsWithNow.map((event, index) => `<span role="listitem" class="conditions-now-event${event.peak ? ' conditions-now-event-peak' : ''}${event.uvaEvent ? ' conditions-now-event-uva' : ''}${event.isNow ? ' conditions-now-event-now' : ''}${event.ts < nowTs ? ' conditions-now-event-past' : ''}" style="grid-column: ${index + 1};"${conditionsTooltipAttr(event.tooltip)} aria-label="${escapeAttr(`${eventRailLabel(event)}: ${event.label}. ${event.tooltip}`)}"><span class="conditions-now-event-dot"><span class="conditions-now-event-icon">${event.icon}</span></span><span class="conditions-now-event-copy"><span class="conditions-now-event-label">${escapeHTML(eventRailLabel(event))}</span><span class="conditions-now-event-time">${escapeHTML(eventRailTime(event))}</span></span></span>`).join('')}
      </div>
    </div>
  </div>` : '';

  const sourceIsGeometryOffline = atm._offline || /(?:zenith_offline|offline)/.test(String(atm.source || ''));
  const sourceIsOffline = offline || sourceIsGeometryOffline;
  const sourceIsStale = !sourceIsOffline && !!atm._stale;
  const sourceStatusClass = sourceIsOffline ? 'is-offline' : (sourceIsStale ? 'is-stale' : 'is-fresh');
  const sourceStatusLabel = sourceIsGeometryOffline ? 'offline modeled estimate'
    : offline ? 'offline · cached model'
    : sourceIsStale ? 'stale cached model'
    : 'current model';
  const sourceHTML = sourceAttributionHTML(atm.source, sourceLabel);
  const trustFooter = `<div class="conditions-now-trust">
    <span class="conditions-now-source ${sourceStatusClass}"${conditionsTooltipAttr(`Model valid ${freshnessLabel}; retrieved ${retrievedLabel}. Refreshes every few minutes and can use a clearly marked cached or offline estimate.`)}>
      <span class="conditions-now-source-dot"></span>
      ${sourceStatusLabel} · via ${sourceHTML} · valid ${escapeHTML(freshnessLabel)}
    </span>
    ${sanityWarnings.length ? `<span class="conditions-now-warning"${conditionsTooltipAttr(sanityWarnings.join(' · '), { focusable: true })}>⚠ ${sanityWarnings.length} sanity warning${sanityWarnings.length === 1 ? '' : 's'}</span>` : ''}
  </div>`;

  if (variant === 'compact') {
    const compactInterpretation = uvi != null
      ? (uviReliable ? uviLabel : '⚠ UVI data looks inconsistent — see Details')
      : '';
    return `<div class="conditions-now-row">
      ${uvi != null ? `<span class="conditions-now-pill${uviReliable ? ` conditions-uvi-${uviCls}` : ' is-unreliable'}"${conditionsTooltipAttr('WHO UV index — erythema-weighted UV level', { focusable: true })}>UVI <strong>${uvi}</strong></span>` : ''}
      ${aqAgg ? `<span class="conditions-now-pill conditions-aq-${aqAgg.cls}"${conditionsTooltipAttr('Provider-computed European Air Quality Index', { focusable: true })}>AQ ${escapeHTML(aqAgg.label)}</span>` : ''}
      ${peakAt && !peakIsNow ? `<span class="conditions-now-pill"${conditionsTooltipAttr(`UV index peaks today at ${_fmtTime(peakAt)} · UVI ${peakUvi != null ? peakUvi.toFixed(1) : '—'}`, { focusable: true })}>peak ${_fmtTime(peakAt)}</span>` : ''}
      <span class="conditions-now-source-compact ${sourceStatusClass}"${conditionsTooltipAttr(`${sourceStatusLabel}; model valid ${freshnessLabel}`)}>
        <span class="conditions-now-source-dot"></span>${sourceHTML}
      </span>
    </div>
    ${compactInterpretation ? `<div class="conditions-now-row-interp">${escapeHTML(compactInterpretation)}</div>` : ''}`;
  }

  const uviHeroTip = 'WHO UV index — an erythema-weighted indicator used for sun-protection decisions. It is not a direct vitamin-D synthesis meter or a personal burn-time guarantee.';
  const sunPositionTip = `${SHADOW_RULE_HINT}\n\nSun elevation: ${sunAngle != null ? sunAngle + '°' : 'unknown'} above horizon.`;
  const showSurfaceOzone = surfaceOzone != null;
  const ozoneTip = showSurfaceOzone
    ? `${SMOG_HINT}${ozone != null ? ` The ${ozone} DU total-ozone column remains available in Details as a separate UV-model input.` : ''}`
    : 'Total atmospheric ozone column (Dobson Units) — a neutral UV-model input, not an air-pollution severity category.';
  const ozoneCls = showSurfaceOzone && ozoneCategory ? `conditions-aq-${ozoneCategory.cls}` : '';
  const ozoneValue = showSurfaceOzone
    ? (ozoneCategory?.label || `${surfaceOzone} µg/m³`)
    : (ozone != null ? String(ozone) : '—');
  const ozoneSub = showSurfaceOzone
    ? (ozoneCategory ? `O₃ ${surfaceOzone} µg/m³ · EU index ${Math.round(ozoneEaqi)}` : 'current O₃ concentration')
    : (ozone != null ? 'DU · UV model input' : '');
  const airQualityTip = 'Provider-computed European Air Quality Index. The overall category and pollutant components use their specified averaging windows; raw current concentrations are context only.';
  return `<div class="conditions-now-grid">
    <div class="conditions-now-cell conditions-now-cell-hero ${uvi != null && uviReliable ? `conditions-uvi-${uviCls}` : ''}${uviReliable ? '' : ' is-unreliable'}"${conditionsTooltipAttr(uviHeroTip, { focusable: true })}>
      <div class="conditions-now-label">UV index</div>
      <div class="conditions-now-value conditions-now-value-hero">${uvi != null ? uvi : '—'}</div>
      ${uvi != null ? `<div class="conditions-now-interpretation">${escapeHTML(uviReliable ? uviLabel : '⚠ UVI data looks inconsistent — see Details')}</div>` : ''}
      ${(cloudChip || peakChip) ? `<div class="conditions-now-chips">
        ${cloudChip ? `<span class="conditions-now-chip">${escapeHTML(cloudChip)}</span>` : ''}
        ${peakChip ? `<span class="conditions-now-chip conditions-now-chip-peak">${escapeHTML(peakChip)}</span>` : ''}
      </div>` : ''}
    </div>
    <div class="conditions-now-cell"${conditionsTooltipAttr(sunPositionTip, { focusable: true })}>
      <div class="conditions-now-label">Sun position</div>
      <div class="conditions-now-value conditions-now-value-aq">${escapeHTML(_sunPositionLabel(sunAngle))}</div>
      <div class="conditions-now-sub">${escapeHTML(_sunPositionSub(sunAngle))}</div>
    </div>
    <div class="conditions-now-cell ${ozoneCls}"${conditionsTooltipAttr(ozoneTip, { focusable: true })}>
      <div class="conditions-now-label">${showSurfaceOzone ? 'Ground ozone' : 'Ozone column'}</div>
      <div class="conditions-now-value conditions-now-value-aq">${escapeHTML(ozoneValue)}</div>
      <div class="conditions-now-sub">${escapeHTML(ozoneSub)}</div>
    </div>
    <div class="conditions-now-cell ${aqAgg ? `conditions-aq-${aqAgg.cls}` : ''}"${conditionsTooltipAttr(airQualityTip, { focusable: true })}>
      <div class="conditions-now-label">Air quality</div>
      <div class="conditions-now-value conditions-now-value-aq">${aqAgg ? escapeHTML(aqAgg.label) : '—'}</div>
      <div class="conditions-now-sub">${aqAgg ? `EU index ${Math.round(aqAgg.index)}${aqAgg.why !== 'EAQI' ? ` · highest: ${escapeHTML(aqAgg.why)}` : ''}` : ''}</div>
    </div>
  </div>
  ${sunEventsLine}
  ${trustFooter}`;
}
