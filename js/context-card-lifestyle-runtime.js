// @ts-check
// context-card-lifestyle-runtime.js - Browser runtime adapters for lifestyle context editors.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { openContextModalRuntime } from './context-cards-runtime.js';
import { updateChatHeaderModelRuntime } from './chat-runtime.js';

const lifestyleRuntimeDeps = {
  closeModal: /** @type {null | (() => unknown)} */ (null),
  navigate: /** @type {null | ((category?: string) => unknown)} */ (null),
  openChatPanel: /** @type {null | (() => unknown)} */ (null),
  useChatPrompt: /** @type {null | ((prompt: string) => unknown)} */ (null),
};

export function configureContextCardLifestyleRuntimeDeps(deps = {}) {
  return configureRuntimeCallbacks(lifestyleRuntimeDeps, deps, 'inherited');
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

const LIFESTYLE_DELEGATES_BOUND_KEY = '__lifestyleContextDelegatesBound';

export function markLifestyleContextDelegatesBoundRuntime() {
  const runtime = getRuntimeWindow();
  if (!runtime || runtime[LIFESTYLE_DELEGATES_BOUND_KEY]) return false;
  runtime[LIFESTYLE_DELEGATES_BOUND_KEY] = true;
  return true;
}

export function closeLifestyleContextModalRuntime() {
  lifestyleRuntimeDeps.closeModal?.();
}

/** @param {string | undefined} category */
export function navigateLifestyleContextRuntime(category) {
  lifestyleRuntimeDeps.navigate?.(category);
}

/** @param {string | undefined} category */
export function closeLifestyleContextModalAndNavigateRuntime(category) {
  closeLifestyleContextModalRuntime();
  navigateLifestyleContextRuntime(category);
}

export function updateLifestyleChatHeaderModelRuntime() {
  updateChatHeaderModelRuntime();
}

/** @param {(() => void) | null} reopenSunSetup */
export function openLightSetupFromLifestyleRuntime(reopenSunSetup) {
  closeLifestyleContextModalRuntime();
  navigateLifestyleContextRuntime('light');
  if (typeof reopenSunSetup !== 'function') return;
  setTimeout(() => {
    reopenSunSetup();
  }, 200);
}

export function discussDietContaminantsRuntime() {
  closeLifestyleContextModalRuntime();
  lifestyleRuntimeDeps.openChatPanel?.();
  setTimeout(() => {
    lifestyleRuntimeDeps.useChatPrompt?.('What food contaminants should I be concerned about based on my diet?');
  }, 300);
}

export function returnToLifestyleContextModalRuntime() {
  closeLifestyleContextModalRuntime();
  setTimeout(() => {
    openContextModalRuntime();
  }, 0);
}
