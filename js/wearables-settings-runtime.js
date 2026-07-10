// @ts-check
// wearables-settings-runtime.js - Browser runtime adapters for wearable settings hooks.

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

export function closeWearableSettingsModal() {
  getRuntimeFunction('closeSettingsModal')?.();
}

export function navigateWearablesDashboard() {
  getRuntimeFunction('navigate')?.('dashboard');
}

/** @param {string} message */
export async function confirmWearableSettingsAction(message) {
  const confirm = getRuntimeFunction('showConfirmDialog');
  return confirm ? !!await confirm(message) : false;
}

/** @param {Record<string, unknown>} bindings */
export function exposeWearableSettingsBindings(bindings) {
  const runtime = getRuntimeWindow();
  if (runtime) Object.assign(runtime, bindings);
}
