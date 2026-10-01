
import { createRetryingModuleLoader } from './retrying-module-loader.js';
/** @typedef {typeof import('./wearables-connect.js')} WearablesConnectModule */

const wearablesConnectModuleLoader = createRetryingModuleLoader(
  retry => retry ? loadWearablesConnectRetryModule() : import('./wearables-connect.js'),
);

// @ts-check
// wearables-connect-loader.js — shared on-demand loader for vendor OAuth/sync code

export function isWearablesConnectModuleLoaded() {
  return wearablesConnectModuleLoader.module !== null;
}

/** @returns {Promise<WearablesConnectModule>} */
function loadWearablesConnectRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./wearables-connect.js?lazy-retry=1');
}

/** @returns {Promise<WearablesConnectModule>} */
export function loadWearablesConnectModule() {
  return wearablesConnectModuleLoader.load();
}
