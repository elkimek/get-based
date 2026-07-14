// @ts-check
// sync-diagnose-runtime.js - Browser runtime adapters for Sync Diagnose shell hooks.

import { showConfirmDialog } from './utils.js';

const syncDiagnoseRuntimeDeps = { showConfirmDialog };

export function configureSyncDiagnoseRuntimeDeps(deps = {}) {
  const previous = { ...syncDiagnoseRuntimeDeps };
  if ('showConfirmDialog' in deps) {
    syncDiagnoseRuntimeDeps.showConfirmDialog = typeof deps.showConfirmDialog === 'function'
      ? /** @type {typeof showConfirmDialog} */ (deps.showConfirmDialog)
      : null;
  }
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/**
 * @param {string} name
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

/**
 * @param {string} message
 * @param {{ fallback?: boolean }} [opts]
 */
export async function confirmSyncDiagnoseActionRuntime(message, opts = {}) {
  const confirm = syncDiagnoseRuntimeDeps.showConfirmDialog;
  if (!confirm) return opts.fallback ?? true;
  return !!await confirm(message);
}
