// client-list.js — lightweight public entry point for the Client List modal

import { createRetryingModuleLoader, invokeCachedModule } from './retrying-module-loader.js';
import { closeModalOverlay } from './modal-lifecycle.js';
import { showClientListNotification } from './client-list-runtime.js';

import type { ClientListRuntimeSnapshot } from './client-list-impl.js';
type ClientListModule = typeof import('./client-list-impl.js');
type ClientListActionResult<Name extends keyof ClientListModule> = ReturnType<ClientListModule[Name]>;

const clientListModuleLoader = createRetryingModuleLoader<ClientListModule>(
  retry => retry ? loadClientListRetryModule() : import('./client-list-impl.js'),
  module => {
    module.configureClientListRuntime(clientListRuntime);
    return module;
  },
);

// Snapshot fields are opaque because configuration accepts unchecked overrides.
const clientListRuntime: ClientListRuntimeSnapshot = {
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
function loadClientListRetryModule(): Promise<ClientListModule> {
  // The fixed retry URL serves the same checked native module.
  return import('./client-list-impl.js?lazy-retry=1' as './client-list-impl.js');
}

/** @returns {Promise<ClientListModule>} */
export function loadClientListModule(): Promise<ClientListModule> {
  return clientListModuleLoader.load();
}

/**
 * Preserve startup dependency injection without pulling the implementation
 * into the eager graph.
 *
 */
export function configureClientListRuntime(runtime: unknown = {}) {
  const previous = { ...clientListRuntime };
  Object.assign(clientListRuntime, runtime);
  clientListModuleLoader.module?.configureClientListRuntime(runtime);
  return previous;
}

function reportClientListActionError(name: keyof ClientListModule, err: unknown) {
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
 */
function runClientListAction<Name extends keyof ClientListModule>(name: Name, args: unknown[]) {
  const run = (module: ClientListModule): ClientListActionResult<Name> => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Client List action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args) as ClientListActionResult<Name>;
  };
  return invokeCachedModule(clientListModuleLoader, loadClientListModule, run, err => reportClientListActionError(name, err), 'propagate');
}

export function openClientList(...args: unknown[]) {
  return runClientListAction('openClientList', args);
}

// Escape and outside-click handling must not fetch the Client List
// implementation just to dismiss an overlay owned by another feature.
export function closeClientList() {
  if (clientListModuleLoader.module) return clientListModuleLoader.module.closeClientList();
  closeModalOverlay('client-list-overlay');
}

export function openClientForm(...args: unknown[]) {
  return runClientListAction('openClientForm', args);
}

export function openProfileLocationEditor(...args: unknown[]) {
  return runClientListAction('openProfileLocationEditor', args);
}
