// @ts-check
// light-conditions-renderer.js — Current-conditions presentation owner.

import { state } from './state.js';
import { escapeAttr, escapeHTML } from './utils.js';
import {
  _aggregateAQ,
  _cloudNarrative,
  _computeUvaWindow,
  _fmtMinutes,
  _fmtTime,
  _humanProviderLabel,
  _sanityCheckAtmosphere,
  _solarZenithAngle,
  _sunPositionLabel,
  _sunPositionSub,
  _surfaceOzoneCls,
  _surfaceOzoneLabel,
  _timeToMed,
  _vitDLabel,
  SHADOW_RULE_HINT,
  SMOG_HINT,
  TANNING_MODIFIERS_NOTE,
} from './light-conditions-interpretation.js';

function conditionsTooltipAttr(text, opts = {}) {
  if (!text) return '';
  return ` data-conditions-tooltip="${escapeAttr(text)}"${opts.focusable ? ' tabindex="0"' : ''}`;
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
  const zenith = _solarZenithAngle(new Date(), coords);
  const sunAngle = zenith != null ? Math.round(90 - zenith) : null;

  // UV index color ramp — UVI 0 green → UVI 11+ purple.
  let uviCls = 'low';
  if (uvi != null) {
    if (uvi >= 11) uviCls = 'extreme';
    else if (uvi >= 8) uviCls = 'very-high';
    else if (uvi >= 6) uviCls = 'high';
    else if (uvi >= 3) uviCls = 'moderate';
  }

  // Resolve user's Fitzpatrick (for time-to-MED). Track whether it's
  // user-set vs the default III fallback so we can qualify the readout.
  const userFp = state.importedData?.sunDefaults?.fitzpatrick
    || (state.importedData?.lightCircadian?.skinType?.match?.(/^(I{1,3}|IV|VI?)\b/) || [])[1];
  const fp = userFp || 'III';
  const fpIsDefault = !userFp;
  const medResult = uvi != null ? _timeToMed(uvi, fp, atm) : null;
  const vitDLabel = _vitDLabel(uvi);
  const peakAt = atm.daily?.peakAt;
  const peakUvi = atm.daily?.uvIndexMax;
  const peakIsNow = peakAt && uvi != null && peakUvi != null && uvi >= peakUvi - 0.3;
  const peakChip = peakAt && peakUvi != null && !peakIsNow
    ? `peak ${_fmtTime(peakAt)} · UVI ${peakUvi.toFixed(1)}`
    : (peakIsNow ? 'at today\'s peak' : '');
  const cloudWord = _cloudNarrative(cloud);
  const cloudChip = cloudWord
    ? (uviClear != null && uvi != null && uviClear > uvi + 0.5
       ? `${cloudWord} · clear-sky max UVI ${uviClear.toFixed(1)}`
       : cloudWord)
    : '';
  const surfaceOzoneCls = _surfaceOzoneCls(surfaceOzone);
  const eaqi = atm.airQuality?.european_aqi ?? null;
  const aqAgg = _aggregateAQ(atm.airQuality, eaqi);

  // Build today's chronological sun-event rail with a current-time marker.
  const sunrise = atm.daily?.sunrise;
  const sunset = atm.daily?.sunset;
  const { firstUVA, lastUVA } = _computeUvaWindow(coords, sunrise || new Date());
  const events = [];
  if (sunrise) {
    events.push({
      icon: '🌅',
      label: _fmtTime(sunrise),
      ts: new Date(sunrise).getTime(),
      kind: 'sunrise',
      tooltip: 'Geometric sunrise — sun crosses horizon. UV-A still negligible, eye-light barely above twilight.',
    });
  }
  const localHHMM = date => {
    const pad = value => String(value).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
  if (peakAt) {
    events.push({
      icon: '☀',
      label: `${_fmtTime(peakAt)}${peakUvi != null ? ` · UVI ${peakUvi.toFixed(1)}` : ''}`,
      ts: new Date(peakAt).getTime(),
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
      tooltip: 'Sun drops below ~5° elevation — UV-A fades from the surface. Biological dusk window closes; melatonin synthesis ramps up.',
    });
  }
  if (sunset) {
    events.push({
      icon: '🌇',
      label: _fmtTime(sunset),
      ts: new Date(sunset).getTime(),
      kind: 'sunset',
      tooltip: 'Geometric sunset — sun drops below horizon. UV-A already gone for ~30-60 min.',
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
    <div class="conditions-now-events-caption">Today's sun timeline</div>
    <div class="conditions-now-events">
      <div class="conditions-now-events-rail" role="list" aria-label="Today's sun timeline" style="--conditions-event-count: ${eventsWithNow.length};">
        <span class="conditions-now-events-track" aria-hidden="true"></span>
        ${eventsWithNow.map((event, index) => `<span role="listitem" class="conditions-now-event${event.peak ? ' conditions-now-event-peak' : ''}${event.uvaEvent ? ' conditions-now-event-uva' : ''}${event.isNow ? ' conditions-now-event-now' : ''}${event.ts < nowTs ? ' conditions-now-event-past' : ''}" style="grid-column: ${index + 1};"${conditionsTooltipAttr(event.tooltip, { focusable: true })} aria-label="${escapeAttr(`${eventRailLabel(event)}: ${event.label}`)}"><span class="conditions-now-event-dot"><span class="conditions-now-event-icon">${event.icon}</span></span><span class="conditions-now-event-copy"><span class="conditions-now-event-label">${escapeHTML(eventRailLabel(event))}</span><span class="conditions-now-event-time">${escapeHTML(eventRailTime(event))}</span></span></span>`).join('')}
      </div>
    </div>
  </div>` : '';

  const storedOverride = state.importedData?.sunDefaults?.overrides?.uvIndex;
  const trustFooter = `<div class="conditions-now-trust">
    <span class="conditions-now-source ${offline ? 'is-offline' : (atm._stale ? 'is-stale' : 'is-fresh')}"${conditionsTooltipAttr(`via ${sourceLabel} · ${freshnessLabel} · refreshes every few minutes · works offline once cached`, { focusable: true })}>
      <span class="conditions-now-source-dot"></span>
      ${offline ? 'offline · cached' : (atm._stale ? 'stale · cached' : 'live')} · via ${escapeHTML(sourceLabel)} · ${escapeHTML(freshnessLabel)}
    </span>
    ${sanityWarnings.length ? `<span class="conditions-now-warning"${conditionsTooltipAttr(sanityWarnings.join(' · '), { focusable: true })}>⚠ ${sanityWarnings.length} sanity warning${sanityWarnings.length === 1 ? '' : 's'}</span>` : ''}
    <span class="conditions-now-override"${conditionsTooltipAttr('Manual UVI override — feeds your own UV-meter reading into the spectrum reconstruction. Leave blank to use the live atmosphere fetch.')}>
      <label for="manual-uvi-input">Manual UVI:</label>
      <input type="number" min="0" max="20" step="0.1" inputmode="decimal" id="manual-uvi-input" value="${Number.isFinite(storedOverride) ? storedOverride : ''}" placeholder="${atm.uvIndex != null && !atm._uvOverridden ? atm.uvIndex.toFixed(1) : '—'}">
      <button type="button" data-light-conditions-action="set-manual-uvi">Apply</button>
      ${Number.isFinite(storedOverride) ? `<button type="button" data-light-conditions-action="clear-manual-uvi"${conditionsTooltipAttr('Clear the manual override')} aria-label="Clear manual UVI override">×</button>` : ''}
    </span>
  </div>`;

  if (variant === 'compact') {
    const compactInterpretation = uvi != null ? (() => {
      let text = vitDLabel;
      if (medResult?.kind === 'no-uv') text += ' · no burn risk';
      else if (medResult?.kind === 'safe-til-sunset') text += ' · won\'t burn before sunset';
      else if (medResult?.kind === 'minutes') text += ` · ~${_fmtMinutes(medResult.value)} to sunburn dose${fpIsDefault ? '*' : ''}`;
      return text;
    })() : '';
    return `<div class="conditions-now-row">
      ${uvi != null ? `<span class="conditions-now-pill conditions-uvi-${uviCls}"${conditionsTooltipAttr('WHO UV index — sunburn intensity', { focusable: true })}>UVI <strong>${uvi}</strong></span>` : ''}
      ${aqAgg ? `<span class="conditions-now-pill conditions-aq-${aqAgg.cls}"${conditionsTooltipAttr('Air quality — worst-of category across PM2.5, PM10, and NO₂', { focusable: true })}>AQ ${escapeHTML(aqAgg.label)}</span>` : ''}
      ${peakAt && !peakIsNow ? `<span class="conditions-now-pill"${conditionsTooltipAttr(`UV index peaks today at ${_fmtTime(peakAt)} · UVI ${peakUvi != null ? peakUvi.toFixed(1) : '—'}`, { focusable: true })}>peak ${_fmtTime(peakAt)}</span>` : ''}
      <span class="conditions-now-source-compact ${offline ? 'is-offline' : (atm._stale ? 'is-stale' : 'is-fresh')}"${conditionsTooltipAttr(`via ${sourceLabel} · ${freshnessLabel}${offline ? ' (offline)' : ''}`, { focusable: true })}>
        <span class="conditions-now-source-dot"></span>${escapeHTML(sourceLabel)}
      </span>
    </div>
    ${compactInterpretation ? `<div class="conditions-now-row-interp">${escapeHTML(compactInterpretation)}</div>` : ''}`;
  }

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
    <div class="conditions-now-cell conditions-now-cell-hero ${uvi != null ? `conditions-uvi-${uviCls}` : ''}"${conditionsTooltipAttr(uviHeroTip, { focusable: true })}>
      <div class="conditions-now-label">UV index${atm._uvOverridden ? ` <span class="conditions-now-override-badge"${conditionsTooltipAttr('Manual UVI override active — clear in Light setup or via the override row below.', { focusable: true })}>manual</span>` : ''}</div>
      <div class="conditions-now-value conditions-now-value-hero">${uvi != null ? uvi : '—'}</div>
      ${uvi != null ? `<div class="conditions-now-interpretation">${escapeHTML(vitDLabel)}${(() => {
        if (!medResult) return '';
        if (medResult.kind === 'no-uv') return ' · UV near zero, no burn risk';
        if (medResult.kind === 'safe-til-sunset') return ' · won\'t burn before sunset';
        if (medResult.kind === 'minutes') return ` · ~${_fmtMinutes(medResult.value)} to your sunburn dose${fpIsDefault ? '*' : ''}`;
        return '';
      })()}${fpIsDefault && medResult?.kind === 'minutes' ? ` <span class="conditions-now-asterisk"${conditionsTooltipAttr(fpDefaultTip, { focusable: true })}>*</span>` : ''}</div>` : ''}
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
    <div class="conditions-now-cell ${surfaceOzoneCls ? `conditions-aq-${surfaceOzoneCls}` : ''}"${conditionsTooltipAttr(ozoneTip, { focusable: true })}>
      <div class="conditions-now-label">${ozone != null ? 'Ozone column' : 'Smog (ground O₃)'}</div>
      <div class="conditions-now-value conditions-now-value-aq">${ozone != null ? ozone : (surfaceOzone != null ? escapeHTML(_surfaceOzoneLabel(surfaceOzone)?.label || '—') : '—')}</div>
      <div class="conditions-now-sub">${
        ozone != null ? 'DU stratospheric'
          : surfaceOzone != null ? escapeHTML(_surfaceOzoneLabel(surfaceOzone)?.action || `${surfaceOzone} µg/m³`) : ''
      }</div>
    </div>
    <div class="conditions-now-cell ${aqAgg ? `conditions-aq-${aqAgg.cls}` : ''}"${conditionsTooltipAttr(airQualityTip, { focusable: true })}>
      <div class="conditions-now-label">Air quality</div>
      <div class="conditions-now-value conditions-now-value-aq">${aqAgg ? escapeHTML(aqAgg.label) : '—'}</div>
      <div class="conditions-now-sub">${aqAgg ? (aqAgg.why === 'EAQI' ? 'EU air quality index' : (aqAgg.why ? `worst pollutant: ${aqAgg.why} ${aqAgg.why === 'PM2.5' && aqPm25 != null ? aqPm25 + ' µg/m³' : ''}` : 'worst-of multi-pollutant')) : ''}</div>
    </div>
  </div>
  ${sunEventsLine}
  <div class="conditions-now-footnote"${conditionsTooltipAttr(TANNING_MODIFIERS_NOTE, { focusable: true })}>
    Burn-time estimates are based on Fitzpatrick skin type — actual burn / tan response also depends on <strong>genetics</strong> (e.g. MC1R variants), <strong>diet</strong> (omega-3, antioxidants), <strong>recent sun history</strong>, <strong>circadian state</strong>, sleep, and hydration.
  </div>
  ${trustFooter}`;
}
