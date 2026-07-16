// @ts-check
// settings-runtime-bridge.js - Cycle-safe access to Settings module actions.

/** @type {Record<string, (...args: any[]) => any>} */
const settingsModuleBridge = Object.create(null);

/** @param {Record<string, unknown>} api */
export function configureSettingsModuleBridge(api = {}) {
  /** @type {Record<string, ((...args: any[]) => any) | null>} */
  const previous = { ...settingsModuleBridge };
  for (const name of Object.keys(api)) {
    if (!(name in previous)) previous[name] = null;
  }
  for (const [name, value] of Object.entries(api)) {
    if (typeof value === 'function') {
      settingsModuleBridge[name] = /** @type {(...args: any[]) => any} */ (value);
    } else if (value === null) {
      delete settingsModuleBridge[name];
    }
  }
  return previous;
}

/** @param {string} name */
export function getSettingsModuleFunction(name) {
  return typeof settingsModuleBridge[name] === 'function'
    ? settingsModuleBridge[name]
    : null;
}
