// @ts-check
// client-list-runtime.js - Browser runtime adapters for client-list UI shell hooks.

import { hasAIProvider } from './api.js';
import { showNotification } from './utils.js';
import { getViewRuntimeFunction } from './views-runtime-bridge.js';

const clientListRuntimeDeps = { showNotification };

export function configureClientListRuntimeDeps(deps = {}) {
  const previous = { ...clientListRuntimeDeps };
  if ('showNotification' in deps) {
    clientListRuntimeDeps.showNotification = typeof deps.showNotification === 'function'
      ? /** @type {typeof showNotification} */ (deps.showNotification)
      : null;
  }
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : /** @type {any} */ (globalThis);
}

/**
 * @param {string} name
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  const fn = runtime[name];
  if (typeof fn === 'function') return fn.bind(runtime);
  return name === 'navigate' && typeof window !== 'undefined' ? getViewRuntimeFunction(name) : null;
}

/**
 * @param {string} name
 * @returns {any}
 */
function getRuntimeValue(name) {
  return getRuntimeWindow()[name];
}

export function getClientHaplogroupList() {
  const list = getRuntimeValue('HAPLOGROUP_LIST');
  return Array.isArray(list) ? list : [];
}

/** @param {string} route */
export function navigateClientListRoute(route) {
  getRuntimeFunction('navigate')?.(route);
}

export function refreshClientProfileButton() {
  getViewRuntimeFunction('renderProfileButton')?.();
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
  const setManualHaplogroup = getRuntimeFunction('setManualHaplogroup');
  return setManualHaplogroup ? setManualHaplogroup(haplogroup) : false;
}

export function hasClientListAIProvider() {
  try {
    return hasAIProvider() === true;
  } catch {
    return false;
  }
}
