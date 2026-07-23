// @ts-check
// wearables-apple-health-runtime.js - Browser runtime adapters for Apple Health import hooks.

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/** @type {{ parseCycleBlob: ((blob: Blob, fileName: string, onProgress: ((event: any) => void) | null) => Promise<any>) | null, showCyclePreview: ((parsed: any) => Promise<any>) | null }} */
const appleHealthRuntimeDeps = {
  parseCycleBlob: null,
  showCyclePreview: null,
};

/**
 * @param {{ parseCycleBlob?: ((blob: Blob, fileName: string, onProgress: ((event: any) => void) | null) => Promise<any>) | null, showCyclePreview?: ((parsed: any) => Promise<any>) | null }} deps
 */
export function configureAppleHealthRuntimeDeps(deps = {}) {
  const previous = { ...appleHealthRuntimeDeps };
  if (Object.hasOwn(deps, 'parseCycleBlob')) {
    appleHealthRuntimeDeps.parseCycleBlob = typeof deps.parseCycleBlob === 'function' ? deps.parseCycleBlob : null;
  }
  if (Object.hasOwn(deps, 'showCyclePreview')) {
    appleHealthRuntimeDeps.showCyclePreview = typeof deps.showCyclePreview === 'function' ? deps.showCyclePreview : null;
  }
  return previous;
}

export function getAppleHealthJSZip() {
  return getRuntimeWindow()?.JSZip || null;
}

export async function parseAppleHealthCycleRuntime(blob, fileName, onProgress = null) {
  if (!appleHealthRuntimeDeps.parseCycleBlob) return null;
  return appleHealthRuntimeDeps.parseCycleBlob(blob, fileName, onProgress);
}

export async function showAppleHealthCyclePreviewRuntime(parsed) {
  if (!appleHealthRuntimeDeps.showCyclePreview) return null;
  return appleHealthRuntimeDeps.showCyclePreview(parsed);
}
