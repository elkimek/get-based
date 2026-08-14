// @ts-check
// sun-location.js — Deterministic home coordinates and temporary current location.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { getProfileLocation, getResolvedProfileCoords } from './profile.js';
import { COUNTRY_CENTROIDS, COUNTRY_LATITUDES } from './constants.js';
import {
  hasSunGeolocationRuntime,
  requestSunGeolocationPositionRuntime,
} from './sun-runtime.js';

// Country band → centroid lat (0=tropical, 4=subarctic). Used as the lat
// fallback when a country lacks an explicit COUNTRY_CENTROIDS entry.
//
// Bands follow the Holick UV-availability scheme (Holick 2007 NEJM,
// "Vitamin D Deficiency"): tropical 0-23.5°, subtropical 23.5-35°,
// temperate 35-50°, cold-temperate 50-60°, subarctic 60°+. Centroid
// values are band midpoints, capped at 65° because cutaneous vitamin-D
// synthesis below 5° solar elevation is negligible (Webb 2018).
const BAND_CENTROID_LAT = [15, 32, 45, 55, 65];
const CURRENT_LOCATION_KEY = 'labcharts-sun-current-location-v1';
let currentLocationMemory = null;

function getSessionStorage() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function readCurrentLocation() {
  let value = currentLocationMemory;
  try {
    const raw = getSessionStorage()?.getItem(CURRENT_LOCATION_KEY);
    if (raw) value = JSON.parse(raw);
  } catch {
    // In-memory fallback remains usable when session storage is unavailable.
  }
  const expiresAt = Number(value?.expiresAt);
  if (!value || !Number.isFinite(value.lat) || !Number.isFinite(value.lon)
      || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    clearCurrentLocation();
    return null;
  }
  return value;
}

function nextLocalMidnight(now = new Date()) {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}

function privacyRound(value, places = 1) {
  const scale = 10 ** places;
  return Math.round(Number(value) * scale) / scale;
}

export function clearCurrentLocation() {
  currentLocationMemory = null;
  try { getSessionStorage()?.removeItem(CURRENT_LOCATION_KEY); } catch (_) {}
}

export function getSunCoords() {
  // 1. Explicit current-device location, rounded before storage and valid
  // only in this browser tab until local midnight.
  const currentLocation = readCurrentLocation();
  if (currentLocation) return { ...currentLocation, source: 'current-device' };

  // 2. Legacy saved coordinates remain readable for existing profiles. New
  // device-location requests never write to this persistent profile field.
  const profileLocation = state.importedData?.sunDefaults?.coords;
  const profileLon = Number(profileLocation?.lon ?? profileLocation?.lng);
  if (profileLocation && Number.isFinite(profileLocation.lat) && Number.isFinite(profileLon)) {
    return {
      lat: profileLocation.lat,
      lon: profileLon,
      altitudeM: Number.isFinite(profileLocation.altitudeM) ? profileLocation.altitudeM : undefined,
      source: 'profile-precise',
    };
  }

  // 3. Optional home postal area. This stays separate from current-device
  // location so circadian/home context does not silently change while travel.
  const resolvedHome = getResolvedProfileCoords();
  if (resolvedHome) return resolvedHome;

  // 4. Profile country → deterministic centroid. Never derive longitude
  // from the current device timezone: that would make the same profile
  // produce different solar-position results across devices and DST states.
  const country = (getProfileLocation()?.country || '').toLowerCase().trim();
  if (country && COUNTRY_LATITUDES[country] !== undefined) {
    const centroid = COUNTRY_CENTROIDS[country];
    if (centroid && Number.isFinite(centroid.lat) && Number.isFinite(centroid.lon)) {
      return { lat: centroid.lat, lon: centroid.lon, source: 'country-band' };
    }
    const bandIndex = COUNTRY_LATITUDES[country];
    const lat = BAND_CENTROID_LAT[bandIndex] ?? 45;
    return { lat, lon: 0, source: 'country-band' };
  }

  // A timezone-only latitude fallback is physically wrong for users in
  // another hemisphere. Callers already surface country/location setup.
  return null;
}

// Compatibility export name retained for existing action wiring. This is now
// an explicit, temporary "use my current location today" request.
export async function requestPreciseLocation() {
  if (!hasSunGeolocationRuntime()) {
    showNotification('Browser geolocation not available — country-level estimate will be used.');
    return null;
  }
  try {
    const position = await requestSunGeolocationPositionRuntime({
      timeout: 8000,
      maximumAge: 60_000 * 30,
      enableHighAccuracy: true,
    });
    const latitude = Number(position.coords.latitude);
    const longitude = Number(position.coords.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('invalid coordinates');
    const altitude = position.coords.altitude == null ? NaN : Number(position.coords.altitude);
    const accuracy = position.coords.accuracy == null ? NaN : Number(position.coords.accuracy);
    const value = {
      lat: privacyRound(latitude),
      lon: privacyRound(longitude),
      altitudeM: Number.isFinite(altitude) ? Math.round(altitude / 100) * 100 : undefined,
      accuracyM: Number.isFinite(accuracy) ? Math.max(0, Math.round(accuracy / 100) * 100) : null,
      capturedAt: Date.now(),
      expiresAt: nextLocalMidnight(),
      source: 'current-device',
    };
    currentLocationMemory = value;
    try { getSessionStorage()?.setItem(CURRENT_LOCATION_KEY, JSON.stringify(value)); } catch (_) {}
    showNotification('Current location is active for today — rounded locally and not saved to your profile.');
    return value;
  } catch {
    showNotification('Location not shared — your home or country estimate will be used.');
    return null;
  }
}

export const requestCurrentLocation = requestPreciseLocation;
