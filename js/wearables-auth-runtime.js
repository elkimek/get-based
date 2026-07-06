// @ts-check
// wearables-auth-runtime.js - Browser runtime adapters for wearable OAuth modules.

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

export function getWearableAuthLocation() {
  return getRuntimeWindow()?.location || null;
}

export function getWearableAuthProfileId() {
  return getRuntimeWindow()?._labState?.currentProfile || null;
}

/** @param {string} url */
export function redirectWearableAuth(url) {
  const location = getWearableAuthLocation();
  if (!location) return false;
  location.href = url;
  return true;
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} api
 * @param {boolean} enabled
 */
export function exposeWearableAuthDebug(name, api, enabled = false) {
  if (!enabled) return false;
  const runtime = getRuntimeWindow();
  if (!runtime) return false;
  runtime[name] = api;
  return true;
}
