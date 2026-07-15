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
