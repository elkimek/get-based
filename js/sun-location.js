// @ts-check
// sun-location.js — Deterministic Sun coordinates and precise-location upgrade.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { getProfileLocation } from './profile.js';
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

export function getSunCoords() {
  // 1. Profile-cached precise coordinates.
  const profileLocation = state.importedData?.sunDefaults?.coords;
  if (profileLocation && Number.isFinite(profileLocation.lat) && Number.isFinite(profileLocation.lon)) {
    return {
      lat: profileLocation.lat,
      lon: profileLocation.lon,
      source: 'profile-precise',
    };
  }

  // 2. Profile country → deterministic centroid. Never derive longitude
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

// Explicit one-time geolocation upgrade. Surfaces in Settings → Light & Sun
// and through the matching action on the Light page.
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
    if (!state.importedData.sunDefaults) state.importedData.sunDefaults = {};
    state.importedData.sunDefaults.coords = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      altitudeM: position.coords.altitude || 0,
      capturedAt: Date.now(),
    };
    await saveImportedData();
    showNotification('Precise location saved — sun calculations will be more accurate.');
    return state.importedData.sunDefaults.coords;
  } catch {
    showNotification('Location not shared — your country still gives a reasonable estimate.');
    return null;
  }
}
