// @ts-check
// context-card-lifestyle-runtime.js - Browser runtime adapters for lifestyle context editors.

import { openContextModalRuntime } from './context-cards-runtime.js';

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/**
 * @param {string} name
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

const LIFESTYLE_DELEGATES_BOUND_KEY = '__lifestyleContextDelegatesBound';

export function markLifestyleContextDelegatesBoundRuntime() {
  const runtime = getRuntimeWindow();
  if (!runtime || runtime[LIFESTYLE_DELEGATES_BOUND_KEY]) return false;
  runtime[LIFESTYLE_DELEGATES_BOUND_KEY] = true;
  return true;
}

export function closeLifestyleContextModalRuntime() {
  getRuntimeFunction('closeModal')?.();
}

/** @param {string | undefined} category */
export function navigateLifestyleContextRuntime(category) {
  getRuntimeFunction('navigate')?.(category);
}

/** @param {string | undefined} category */
export function closeLifestyleContextModalAndNavigateRuntime(category) {
  closeLifestyleContextModalRuntime();
  navigateLifestyleContextRuntime(category);
}

export function updateLifestyleChatHeaderModelRuntime() {
  getRuntimeFunction('updateChatHeaderModel')?.();
}

export function openLightSetupFromLifestyleRuntime() {
  closeLifestyleContextModalRuntime();
  navigateLifestyleContextRuntime('light');
  setTimeout(() => {
    getRuntimeFunction('reopenSunSetup')?.();
  }, 200);
}

export function discussDietContaminantsRuntime() {
  closeLifestyleContextModalRuntime();
  getRuntimeFunction('openChatPanel')?.();
  setTimeout(() => {
    getRuntimeFunction('useChatPrompt')?.('What food contaminants should I be concerned about based on my diet?');
  }, 300);
}

export function returnToLifestyleContextModalRuntime() {
  closeLifestyleContextModalRuntime();
  setTimeout(() => {
    openContextModalRuntime();
  }, 0);
}
