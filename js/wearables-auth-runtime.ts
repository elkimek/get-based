// wearables-auth-runtime.js - Browser runtime adapters for wearable OAuth modules.

function getRuntimeWindow(): (Window & typeof globalThis & Record<string, unknown>) | null {
  return typeof window !== 'undefined'
    ? (window as Window & typeof globalThis & Record<string, unknown>)
    : null;
}

export function getWearableAuthLocation() {
  return getRuntimeWindow()?.location || null;
}

export function redirectWearableAuth(url: string) {
  const location = getWearableAuthLocation();
  if (!location) return false;
  location.href = url;
  return true;
}

export function exposeWearableAuthDebug(name: string, api: Record<string, unknown>, enabled = false) {
  if (!enabled) return false;
  const runtime = getRuntimeWindow();
  if (!runtime) return false;
  runtime[name] = api;
  return true;
}
