
import { createRetryingModuleLoader } from './retrying-module-loader.js';
type WearablesConnectModule = typeof import('./wearables-connect.js');

const wearablesConnectModuleLoader = createRetryingModuleLoader(
  retry => retry ? loadWearablesConnectRetryModule() : import('./wearables-connect.js'),
);

// wearables-connect-loader.js — shared on-demand loader for vendor OAuth/sync code

export function isWearablesConnectModuleLoaded() {
  return wearablesConnectModuleLoader.module !== null;
}

function loadWearablesConnectRetryModule(): Promise<WearablesConnectModule> {
  return import('./wearables-connect.js?lazy-retry=1' as './wearables-connect.js');
}

export function loadWearablesConnectModule(): Promise<WearablesConnectModule> {
  return wearablesConnectModuleLoader.load();
}
