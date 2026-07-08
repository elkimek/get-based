// @ts-check
// client-list-runtime.js - Browser runtime adapters for client-list UI shell hooks.

import { hasAIProvider } from './api.js';

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
  return typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
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

/** @param {() => void} [fallback] */
export function closeClientListFromRuntime(fallback) {
  const close = getRuntimeFunction('closeClientList') || fallback;
  close?.();
}

/** @param {string} route */
export function navigateClientListRoute(route) {
  getRuntimeFunction('navigate')?.(route);
}

export function refreshClientProfileButton() {
  getRuntimeFunction('renderProfileButton')?.();
}

/**
 * @param {string} message
 * @param {string} type
 */
export function showClientListNotification(message, type) {
  getRuntimeFunction('showNotification')?.(message, type);
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

/** @param {Record<string, any>} bindings */
export function publishClientListWindowBindings(bindings) {
  if (typeof window === 'undefined') return;
  Object.assign(getRuntimeWindow(), bindings);
}
