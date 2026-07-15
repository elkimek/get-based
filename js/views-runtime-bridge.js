// @ts-check
// views-runtime-bridge.js - Module-scoped access to cycle-sensitive view actions.

/** @type {Record<string, (...args: any[]) => any>} */
const viewRuntime = Object.create(null);

/** @param {Record<string, unknown>} api */
export function configureViewRuntime(api = {}) {
  const previous = { ...viewRuntime };
  for (const [name, value] of Object.entries(api)) {
    if (typeof value === 'function') {
      viewRuntime[name] = /** @type {(...args: any[]) => any} */ (value);
    }
  }
  return previous;
}

/** @param {string} name */
export function getViewRuntimeFunction(name) {
  return typeof viewRuntime[name] === 'function' ? viewRuntime[name] : null;
}
