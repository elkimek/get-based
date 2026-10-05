// client-list-runtime.js - Browser runtime adapters for client-list UI shell hooks.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { getDnaModuleFunction, getDnaModuleValue } from './dna-runtime-bridge.js';
import { showNotification } from './utils.js';

type ClientListCalls = {
  navigate: ((route: string) => unknown) | null;
  renderProfileButton: (() => unknown) | null;
  showNotification: typeof showNotification | null;
};
export type ClientListRuntimeSnapshot = { [Key in keyof ClientListCalls]: unknown };
const clientListRuntimeDeps: ClientListCalls = {
  navigate: (null),
  renderProfileButton: (null),
  showNotification: (showNotification),
};

export function configureClientListRuntimeDeps(deps: unknown = {}): ClientListRuntimeSnapshot {
  return configureRuntimeCallbacks(clientListRuntimeDeps, deps as Partial<ClientListCalls>, 'inherited');
}

export function getClientHaplogroupList(): unknown[] {
  const list = getDnaModuleValue('HAPLOGROUP_LIST');
  return Array.isArray(list) ? list : [];
}

export function navigateClientListRoute(route: string) {
  clientListRuntimeDeps.navigate?.(route);
}

export function refreshClientProfileButton() {
  clientListRuntimeDeps.renderProfileButton?.();
}

export function showClientListNotification(message: unknown, type: string) {
  clientListRuntimeDeps.showNotification?.(message, type);
}

export function setClientManualHaplogroup(haplogroup: string): unknown {
  const setManualHaplogroup = getDnaModuleFunction('setManualHaplogroup');
  return setManualHaplogroup ? (setManualHaplogroup as (haplogroup: string) => unknown)(haplogroup) : false;
}

export function hasClientListAIProvider() {
  try {
    return hasAssistantFeatureProvider() === true;
  } catch {
    return false;
  }
}
