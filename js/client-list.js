// @ts-check
// client-list.js — lightweight public entry point for the Client List modal

import { closeModalOverlay } from './modal-lifecycle.js';
import { showClientListNotification } from './client-list-runtime.js';

/** @typedef {typeof import('./client-list-impl.js')} ClientListModule */

/** @typedef {{
 *   exportAllDataJSON: () => Promise<void> | void,
 *   exportClientJSON: (profileId: string, includeChat?: boolean) => Promise<void> | void,
 *   importDataJSON: (file: File) => Promise<void> | void,
 *   loadDemoData: (sex?: string) => Promise<void> | void,
 *   openProfileShareModal: (profileId?: string) => void,
 * }} ClientListRuntime */

/** @type {Promise<ClientListModule> | null} */
let clientListModulePromise = null;
/** @type {ClientListModule | null} */
let clientListModule = null;
let useClientListRetryUrl = false;

/** @type {ClientListRuntime} */
const clientListRuntime = {
  exportAllDataJSON: () => {},
  exportClientJSON: () => {},
  importDataJSON: () => {},
  loadDemoData: () => {},
  openProfileShareModal: () => {},
};

export function isClientListModuleLoaded() {
  return clientListModule !== null;
}

/** @returns {Promise<ClientListModule>} */
function loadClientListRetryModule() {
  // @ts-expect-error The browser accepts a fixed query-string module URL;
  // TypeScript resolves declarations only for the query-free source path.
  return import('./client-list-impl.js?lazy-retry=1');
}

/** @returns {Promise<ClientListModule>} */
export function loadClientListModule() {
  if (!clientListModulePromise) {
    // Browsers cache failed module-map fetches by URL. A fixed second literal
    // gives the user one genuine retry without introducing a computed import.
    const moduleLoad = useClientListRetryUrl
      ? loadClientListRetryModule()
      : import('./client-list-impl.js');
    clientListModulePromise = moduleLoad
      .then(module => {
        clientListModule = module;
        module.configureClientListRuntime(clientListRuntime);
        return module;
      })
      .catch(err => {
        clientListModulePromise = null;
        clientListModule = null;
        useClientListRetryUrl = true;
        throw err;
      });
  }
  return clientListModulePromise;
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
  clientListModule?.configureClientListRuntime(runtime);
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
  if (clientListModule) {
    try {
      const action = clientListModule[name];
      if (typeof action !== 'function') {
        throw new Error(`Client List action ${String(name)} is unavailable`);
      }
      return Reflect.apply(action, clientListModule, args);
    } catch (err) {
      return reportClientListActionError(name, err);
    }
  }
  return loadClientListModule()
    .then(module => {
      const action = module[name];
      if (typeof action !== 'function') {
        throw new Error(`Client List action ${String(name)} is unavailable`);
      }
      return Reflect.apply(action, module, args);
    })
    .catch(err => reportClientListActionError(name, err));
}

export function openClientList(...args) {
  return runClientListAction('openClientList', args);
}

// Escape and outside-click handling must not fetch the Client List
// implementation just to dismiss an overlay owned by another feature.
export function closeClientList() {
  if (clientListModule) return clientListModule.closeClientList();
  closeModalOverlay('client-list-overlay');
}

export function openClientForm(...args) {
  return runClientListAction('openClientForm', args);
}

export function openProfileLocationEditor(...args) {
  return runClientListAction('openProfileLocationEditor', args);
}
