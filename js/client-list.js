// @ts-check
// client-list.js — lightweight public entry point for the Client List modal

import { createRetryingModuleLoader, invokeCachedModule } from './retrying-module-loader.js';
import { closeModalOverlay } from './modal-lifecycle.js';
import { showClientListNotification } from './client-list-runtime.js';

/** @typedef {{
 *   exportAllDataJSON: () => Promise<void> | void,
 *   exportClientJSON: (profileId: string, includeChat?: boolean) => Promise<void> | void,
 *   importDataJSON: (file: File) => Promise<void> | void,
 *   loadDemoData: (sex?: string) => Promise<void> | void,
 *   openProfileShareModal: (profileId?: string) => void,
 * }} ClientListRuntime */

/** @typedef {typeof import('./client-list-impl.js')} ClientListModule */

const clientListModuleLoader = createRetryingModuleLoader(
  retry => retry ? loadClientListRetryModule() : import('./client-list-impl.js'),
  module => {
    module.configureClientListRuntime(clientListRuntime);
    return module;
  },
);

/** @type {ClientListRuntime} */
const clientListRuntime = {
  exportAllDataJSON: () => {},
  exportClientJSON: () => {},
  importDataJSON: () => {},
  loadDemoData: () => {},
  openProfileShareModal: () => {},
};

export function isClientListModuleLoaded() {
  return clientListModuleLoader.module !== null;
}

/** @returns {Promise<ClientListModule>} */
function loadClientListRetryModule() {
  // @ts-expect-error The browser accepts a fixed query-string module URL;
  // TypeScript resolves declarations only for the query-free source path.
  return import('./client-list-impl.js?lazy-retry=1');
}

/** @returns {Promise<ClientListModule>} */
export function loadClientListModule() {
  return clientListModuleLoader.load();
}

/**
 * Preserve startup dependency injection without pulling the implementation
 * into the eager graph.
 *
 * @param {Partial<ClientListRuntime>} [runtime]
 */
export function configureClientListRuntime(runtime = {}) {
  const previous = { ...clientListRuntime };
  Object.assign(clientListRuntime, runtime);
  clientListModuleLoader.module?.configureClientListRuntime(runtime);
  return previous;
}

/** @param {keyof ClientListModule} name @param {unknown} err */
function reportClientListActionError(name, err) {
  console.error(`[client-list] Could not run ${String(name)}:`, err);
  showClientListNotification(
    'Could not open clients. Reload the app to finish updating, then try again.',
    'error',
  );
  return false;
}

/**
 * Keep actions synchronous after the implementation is resident while making
 * the first action load it on demand.
 *
 * @param {keyof ClientListModule} name
 * @param {any[]} args
 */
function runClientListAction(name, args) {
  const run = (/** @type {ClientListModule} */ module) => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Client List action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args);
  };
  return invokeCachedModule(clientListModuleLoader, loadClientListModule, run, err => reportClientListActionError(name, err), 'propagate');
}

export function openClientList(...args) {
  return runClientListAction('openClientList', args);
}

// Escape and outside-click handling must not fetch the Client List
// implementation just to dismiss an overlay owned by another feature.
export function closeClientList() {
  if (clientListModuleLoader.module) return clientListModuleLoader.module.closeClientList();
  closeModalOverlay('client-list-overlay');
}

export function openClientForm(...args) {
  return runClientListAction('openClientForm', args);
}

export function openProfileLocationEditor(...args) {
  return runClientListAction('openProfileLocationEditor', args);
}
