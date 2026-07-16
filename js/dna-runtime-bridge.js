// @ts-check
// dna-runtime-bridge.js - Cycle-safe access to DNA module actions and values.

/** @type {Record<string, unknown>} */
const dnaModuleBridge = Object.create(null);

/** @param {Record<string, unknown>} api */
export function configureDnaModuleBridge(api = {}) {
  /** @type {Record<string, unknown>} */
  const previous = { ...dnaModuleBridge };
  for (const name of Object.keys(api)) {
    if (!(name in previous)) previous[name] = null;
  }
  for (const [name, value] of Object.entries(api)) {
    if (value === null) delete dnaModuleBridge[name];
    else dnaModuleBridge[name] = value;
  }
  return previous;
}

/** @param {string} name */
export function getDnaModuleFunction(name) {
  const value = dnaModuleBridge[name];
  return typeof value === 'function'
    ? /** @type {(...args: any[]) => any} */ (value)
    : null;
}

/**
 * @param {string} name
 * @param {any} [fallback]
 */
export function getDnaModuleValue(name, fallback = null) {
  return name in dnaModuleBridge ? dnaModuleBridge[name] : fallback;
}
