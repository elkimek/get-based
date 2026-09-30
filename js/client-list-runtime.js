// @ts-check
// client-list-runtime.js - Browser runtime adapters for client-list UI shell hooks.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { getDnaModuleFunction, getDnaModuleValue } from './dna-runtime-bridge.js';
import { showNotification } from './utils.js';

const clientListRuntimeDeps = {
  navigate: /** @type {null | ((route: string) => void)} */ (null),
  renderProfileButton: /** @type {null | (() => void)} */ (null),
  showNotification: /** @type {null | typeof showNotification} */ (showNotification),
};

export function configureClientListRuntimeDeps(deps = {}) {
  return configureRuntimeCallbacks(clientListRuntimeDeps, deps, 'inherited');
}

export function getClientHaplogroupList() {
  const list = getDnaModuleValue('HAPLOGROUP_LIST');
  return Array.isArray(list) ? list : [];
}

/** @param {string} route */
export function navigateClientListRoute(route) {
  clientListRuntimeDeps.navigate?.(route);
}

export function refreshClientProfileButton() {
  clientListRuntimeDeps.renderProfileButton?.();
}

/**
 * @param {string} message
 * @param {string} type
 */
export function showClientListNotification(message, type) {
  clientListRuntimeDeps.showNotification?.(message, type);
}

/** @param {string} haplogroup */
export function setClientManualHaplogroup(haplogroup) {
  const setManualHaplogroup = getDnaModuleFunction('setManualHaplogroup');
  return setManualHaplogroup ? setManualHaplogroup(haplogroup) : false;
}

export function hasClientListAIProvider() {
  try {
    return hasAssistantFeatureProvider() === true;
  } catch {
    return false;
  }
}
