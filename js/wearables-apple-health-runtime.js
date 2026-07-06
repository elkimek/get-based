// @ts-check
// wearables-apple-health-runtime.js - Browser runtime adapters for Apple Health import hooks.

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

export function getAppleHealthJSZip() {
  return getRuntimeWindow()?.JSZip || null;
}

/** @param {Record<string, unknown>} bindings */
export function exposeAppleHealthDebugBindings(bindings) {
  const runtime = getRuntimeWindow();
  if (runtime) Object.assign(runtime, bindings);
}
