// @ts-check
// client-list-runtime.js - Browser runtime adapters for client-list UI shell hooks.

import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { getDnaModuleFunction, getDnaModuleValue } from './dna-runtime-bridge.js';
import { showNotification } from './utils.js';

const clientListRuntimeDeps = {
  navigate: /** @type {null | ((route: string) => void)} */ (null),
  renderProfileButton: /** @type {null | (() => void)} */ (null),
  showNotification: /** @type {null | typeof showNotification} */ (showNotification),
};

export function configureClientListRuntimeDeps(deps = {}) {
  const previous = { ...clientListRuntimeDeps };
  if ('navigate' in deps) {
    clientListRuntimeDeps.navigate = typeof deps.navigate === 'function'
      ? /** @type {(route: string) => void} */ (deps.navigate)
      : null;
  }
  if ('renderProfileButton' in deps) {
    clientListRuntimeDeps.renderProfileButton = typeof deps.renderProfileButton === 'function'
      ? /** @type {() => void} */ (deps.renderProfileButton)
      : null;
  }
  if ('showNotification' in deps) {
    clientListRuntimeDeps.showNotification = typeof deps.showNotification === 'function'
      ? /** @type {typeof showNotification} */ (deps.showNotification)
      : null;
  }
  return previous;
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
