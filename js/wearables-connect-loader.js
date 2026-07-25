// @ts-check
// wearables-connect-loader.js — shared on-demand loader for vendor OAuth/sync code

/** @typedef {typeof import('./wearables-connect.js')} WearablesConnectModule */
/** @type {Promise<WearablesConnectModule> | null} */
let wearablesConnectModulePromise = null;
/** @type {WearablesConnectModule | null} */
let wearablesConnectModule = null;
let useWearablesConnectRetryUrl = false;

export function isWearablesConnectModuleLoaded() {
  return wearablesConnectModule !== null;
}

/** @returns {Promise<WearablesConnectModule>} */
function loadWearablesConnectRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./wearables-connect.js?lazy-retry=1');
}

/** @returns {Promise<WearablesConnectModule>} */
export function loadWearablesConnectModule() {
  if (!wearablesConnectModulePromise) {
    const load = useWearablesConnectRetryUrl
      ? loadWearablesConnectRetryModule()
      : import('./wearables-connect.js');
    wearablesConnectModulePromise = load
      .then(module => (wearablesConnectModule = module))
      .catch(error => {
        wearablesConnectModulePromise = null;
        wearablesConnectModule = null;
        useWearablesConnectRetryUrl = true;
        throw error;
      });
  }
  return wearablesConnectModulePromise;
}
