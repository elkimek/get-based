import type { SunSetupCoords } from './sun-defaults-model.js';

type SolarZenithReader = (date: Date, lat: number, lon: number) => unknown;

export function computeSunriseSunset(coords: SunSetupCoords | null | undefined, date: unknown, solarZenithAngle: SolarZenithReader | null | undefined) {
  if (!coords || typeof solarZenithAngle !== 'function') return { sunrise: null, sunset: null };
  const baseDate = date ? new Date(date as string) : new Date();
  const day = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  let sunrise: Date | null = null;
  let sunset: Date | null = null;
  let prevAbove: boolean | null = null;
  for (let minutes = 0; minutes < 24 * 60; minutes += 5) {
    const time = new Date(day.getTime() + minutes * 60_000);
    const zenith = solarZenithAngle(time, coords.lat, coords.lon);
    if (!Number.isFinite(zenith)) continue;
    const above = (zenith as number) < 90.83;
    if (prevAbove != null && above !== prevAbove) {
      if (above && !sunrise) sunrise = time;
      else if (!above && !sunset) sunset = time;
    }
    prevAbove = above;
  }
  return { sunrise, sunset };
}

export function classifyDayWindow(coords: SunSetupCoords | null | undefined, now: Date | null | undefined, solarZenithAngle: SolarZenithReader | null | undefined) {
  const time = now || new Date();
  const { sunrise, sunset } = computeSunriseSunset(coords, time, solarZenithAngle);
  if (!sunrise || !sunset) {
    const hour = time.getHours();
    let label = 'Outside golden hour';
    if (hour >= 5 && hour < 9) label = 'Sunrise window';
    else if (hour >= 16 && hour < 21) label = 'Sunset window';
    return { kind: 'unknown', label, sunrise: null, sunset: null };
  }
  const timestamp = time.getTime();
  const sunriseMs = sunrise.getTime();
  const sunsetMs = sunset.getTime();
  if (timestamp >= sunriseMs - 30 * 60_000 && timestamp <= sunriseMs + 90 * 60_000) {
    return { kind: 'sunrise', label: 'Sunrise window', sunrise, sunset };
  }
  if (timestamp >= sunsetMs - 90 * 60_000 && timestamp <= sunsetMs + 30 * 60_000) {
    return { kind: 'sunset', label: 'Sunset window', sunrise, sunset };
  }
  if (timestamp > sunriseMs && timestamp < sunsetMs) {
    return { kind: 'midday', label: 'Midday — past sunrise, before sunset', sunrise, sunset };
  }
  return { kind: 'night', label: 'Night — sun is below horizon', sunrise, sunset };
}

export function formatSunClock(date: Pick<Date, 'toLocaleTimeString'> | null | undefined) {
  if (!date) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function normalizeGoldenHourMinutes(value: unknown) {
  const parsed = parseInt(value as string, 10);
  if (!Number.isFinite(parsed)) return 15;
  return Math.min(120, Math.max(1, parsed));
}
