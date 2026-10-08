// Pure current-conditions projection. Atmospheric interpretation remains in its domain owner.

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

import type { AtmosphereSnapshot, AirQualityReadings } from './sun-uvdata-atmosphere.js';
import type { SolarCoordinates } from './light-conditions-interpretation.js';

type RawAtmosphereFields = 'uvIndex' | 'uvClearSky' | 'ozoneDU' | 'cloudCover' | 'validAt' | 'fetchedAt' | 'source' | '_offline' | '_stale';
export type ConditionsAirQuality = { [Field in keyof AirQualityReadings]?: unknown };
export type ConditionsAtmosphere = { [Field in RawAtmosphereFields]?: unknown } & {
  daily?: { [Field in keyof NonNullable<AtmosphereSnapshot['daily']>]?: unknown } | null;
  hourly?: { utcOffsetSeconds?: unknown } | null;
  airQuality?: ConditionsAirQuality | null;
};
type SunEventKind = 'sunrise' | 'first-uva' | 'peak' | 'last-uva' | 'sunset';
interface SunRailEvent {
  icon: string; label: string; ts: number; tooltip: string;
  kind?: SunEventKind; isNow?: boolean; peak?: boolean; uvaEvent?: boolean;
}
type SunEvent = SunRailEvent & { kind: SunEventKind };

function sourceAttribution(source: unknown, fallbackLabel: string) {
  const value = String(source || '');
  const links: { label: string; href: string }[] = [];
  if (value.includes('cams')) links.push({ label: 'CAMS', href: 'https://atmosphere.copernicus.eu/' });
  if (value.includes('open_meteo')) links.push({ label: 'Open-Meteo', href: 'https://open-meteo.com/' });
  if (value.includes('noaa')) links.push({ label: 'NOAA NWS', href: 'https://www.weather.gov/' });
  return { links, fallbackLabel };
}

export function projectConditions(atm: ConditionsAtmosphere, coords: SolarCoordinates | null | undefined, variant: string, offline = false) {
  const uvi = atm.uvIndex != null ? Math.round((atm.uvIndex as number) * 10) / 10 : null;
  const uviClear = atm.uvClearSky != null ? Math.round((atm.uvClearSky as number) * 10) / 10 : null;
  // Stratospheric ozone (DU) — only available with CAMS/selfhost. Free
  // Open-Meteo can't deliver it, so the cell typically falls back to the
  // surface-ozone AQ reading further down.
  const ozone = atm.ozoneDU != null ? Math.round(atm.ozoneDU as number) : null;
  const surfaceOzone = atm.airQuality?.surfaceOzoneUgM3 != null ? Math.round(atm.airQuality.surfaceOzoneUgM3 as number) : null;
  const cloud = atm.cloudCover != null ? Math.round(atm.cloudCover as number) : null;

  // Sanity-check the data — UVI shouldn't exist when sun is below horizon,
  // shouldn't exceed ~16 anywhere on Earth, etc. Flag suspicious responses
  // so the user knows when the upstream looks off.
  const sanityWarnings = (_sanityCheckAtmosphere as unknown as (atm: ConditionsAtmosphere, coords: SolarCoordinates | null | undefined) => ReturnType<typeof _sanityCheckAtmosphere>)(atm, coords);
  const uviWarnings = sanityWarnings.filter(warning => warning.startsWith('UVI'));
  const uviReliable = uviWarnings.length === 0;
  const sourceLabel = (_humanProviderLabel as (source: unknown) => ReturnType<typeof _humanProviderLabel>)(atm.source);
  const validAt = Number.isFinite(atm.validAt) ? atm.validAt : atm.fetchedAt;
  const validAgoMin = validAt ? Math.max(0, Math.round((Date.now() - (validAt as number)) / 60000)) : null;
  const fetchedAgoMin = atm.fetchedAt ? Math.max(0, Math.round((Date.now() - (atm.fetchedAt as number)) / 60000)) : null;
  const elapsedLabel = (minutes: number | null) => minutes == null ? 'unknown'
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
  const peakIsNow = peakAt && uvi != null && peakUvi != null && uvi >= (peakUvi as number) - 0.3;
  const peakChip = peakAt && peakUvi != null && !peakIsNow
    ? `peak ${_fmtTime(peakAt as string)} · UVI ${(peakUvi as number).toFixed(1)}`
    : (peakIsNow ? 'at today\'s peak' : '');
  const cloudWord = _cloudNarrative(cloud);
  const cloudChip = cloudWord
    ? (uviClear != null && uvi != null && uviClear > uvi + 0.5
       ? `${cloudWord} · clear-sky UVI ${uviClear.toFixed(1)}`
       : cloudWord)
    : '';
  const eaqi = atm.airQuality?.european_aqi ?? null;
  const aqAgg = (_aggregateAQ as unknown as (airQuality: ConditionsAirQuality | null | undefined, fallbackEaqi: unknown) => ReturnType<typeof _aggregateAQ>)(atm.airQuality, eaqi);
  const ozoneEaqi = atm.airQuality?.european_aqi_ozone ?? null;
  const ozoneCategory = (_europeanAQCategory as (index: unknown) => ReturnType<typeof _europeanAQCategory>)(ozoneEaqi);

  // Build today's chronological sun-event rail with a current-time marker.
  const sunrise = atm.daily?.sunrise;
  const sunset = atm.daily?.sunset;
  const locationOffsetSeconds = Number(atm.hourly?.utcOffsetSeconds) || 0;
  const sunriseMs = parseProviderTimeMs(sunrise, locationOffsetSeconds);
  const sunsetMs = parseProviderTimeMs(sunset, locationOffsetSeconds);
  const peakAtMs = parseProviderTimeMs(peakAt, locationOffsetSeconds);
  const uvaAnchor = Number.isFinite(sunriseMs) ? new Date(sunriseMs) : new Date();
  const { firstUVA, lastUVA } = _computeUvaWindow(coords, uvaAnchor, locationOffsetSeconds);
  const events: SunEvent[] = [];
  if (sunrise) {
    events.push({
      icon: '🌅',
      label: _fmtTime(sunrise as string),
      ts: sunriseMs,
      kind: 'sunrise',
      tooltip: 'Geometric sunrise — the solar disk crosses the horizon and the direct spectrum begins its transition from twilight.',
    });
  }
  const localHHMM = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, '0');
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
      label: `${_fmtTime(peakAt as string)}${peakUvi != null ? ` · UVI ${(peakUvi as number).toFixed(1)}` : ''}`,
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
      label: _fmtTime(sunset as string),
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
  const eventsWithNow: SunRailEvent[] = [...events, nowEvent].sort((a, b) => a.ts - b.ts);
  const eventRailLabel = (event: SunRailEvent) => ({
    sunrise: 'Sunrise',
    'first-uva': 'UV-A on',
    peak: 'Peak',
    'last-uva': 'UV-A off',
    sunset: 'Sunset',
  })[event.kind!] || (event.isNow ? 'Now' : 'Event');
  const eventRailTime = (event: SunRailEvent) => {
    if (event.isNow) return event.label.replace(/^now(?: · )?/, '') || 'current';
    if (event.kind === 'first-uva' || event.kind === 'last-uva') return event.label.split(' · ')[0];
    return event.label;
  };
  const timelineTip = 'Today\'s sun timeline — left to right is the timeline through your day. Events left of the highlighted now-marker have passed; events to the right are upcoming.';
  const rail = events.length ? eventsWithNow.map((event, index) => ({
    ...event, column: index + 1, past: event.ts < nowTs,
    heading: eventRailLabel(event), time: eventRailTime(event),
    ariaLabel: `${eventRailLabel(event)}: ${event.label}. ${event.tooltip}`,
  })) : [];

  const sourceIsGeometryOffline = atm._offline || /(?:zenith_offline|offline)/.test(String(atm.source || ''));
  const sourceIsOffline = offline || sourceIsGeometryOffline;
  const sourceIsStale = !sourceIsOffline && !!atm._stale;
  const sourceStatusClass = sourceIsOffline ? 'is-offline' : (sourceIsStale ? 'is-stale' : 'is-fresh');
  const sourceStatusLabel = sourceIsGeometryOffline ? 'offline modeled estimate'
    : offline ? 'offline · cached model'
    : sourceIsStale ? 'stale cached model'
    : 'current model';
  const attribution = sourceAttribution(atm.source, sourceLabel);
  const compactInterpretation = uvi != null
    ? (uviReliable ? uviLabel : '⚠ UVI data looks inconsistent — see Details') : '';
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
    ? (ozoneCategory ? `O₃ ${surfaceOzone} µg/m³ · EU index ${Math.round(ozoneEaqi as number)}` : 'current O₃ concentration')
    : (ozone != null ? 'DU · UV model input' : '');
  const airQualityTip = 'Provider-computed European Air Quality Index. The overall category and pollutant components use their specified averaging windows; raw current concentrations are context only.';
  return {
    variant, uvi, uviCls, uviReliable, uviLabel, uviHeroTip, cloudChip, peakChip,
    compactInterpretation, peakTime: peakAt && !peakIsNow ? _fmtTime(peakAt as string) : '',
    peakTooltip: `UV index peaks today at ${_fmtTime(peakAt as string)} · UVI ${peakUvi != null ? (peakUvi as number).toFixed(1) : '—'}`,
    sunPositionTip, sunPosition: _sunPositionLabel(sunAngle), sunPositionSub: _sunPositionSub(sunAngle),
    ozoneTip, ozoneCls, ozoneValue, ozoneSub, ozoneLabel: showSurfaceOzone ? 'Ground ozone' : 'Ozone column',
    airQualityTip, aqAgg, airQualitySub: aqAgg ? `EU index ${Math.round(aqAgg.index)}${aqAgg.why !== 'EAQI' ? ` · highest: ${aqAgg.why}` : ''}` : '',
    rail, timelineTip, attribution, sourceStatusClass, sourceStatusLabel, freshnessLabel,
    sourceTooltip: `Model valid ${freshnessLabel}; retrieved ${retrievedLabel}. Refreshes every few minutes and can use a clearly marked cached or offline estimate.`,
    compactSourceTooltip: `${sourceStatusLabel}; model valid ${freshnessLabel}`,
    sanityWarnings, warningsTooltip: sanityWarnings.join(' · '),
  };
}

export type ConditionsView = ReturnType<typeof projectConditions>;
export interface ConditionsSlotView { id: string; variant: string; view: ConditionsView | null }
export interface ConditionsInspectionView {
  fields: { label: string; value: string; title?: string }[];
  warnings: string[];
  raw: string;
  cacheKeys: string[];
}
export type ConditionsPresentationProps =
  | { kind: 'conditions'; view: ConditionsView }
  | { kind: 'slot'; slot: ConditionsSlotView }
  | { kind: 'widget'; hasLocation: boolean; slot: ConditionsSlotView }
  | { kind: 'message'; message: string; error?: string | null }
  | { kind: 'inspect'; view: ConditionsInspectionView };
