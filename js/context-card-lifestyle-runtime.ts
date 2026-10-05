// context-card-lifestyle-runtime.js - Browser runtime adapters for lifestyle context editors.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { openContextModalRuntime } from './context-cards-runtime.js';
import { updateChatHeaderModelRuntime } from './chat-runtime.js';

interface LifestyleRuntimeDeps {
  closeModal: (() => unknown) | null;
  navigate: ((category?: string) => unknown) | null;
  openChatPanel: (() => unknown) | null;
  useChatPrompt: ((prompt: string) => unknown) | null;
}
const lifestyleRuntimeDeps: LifestyleRuntimeDeps = {
  closeModal: null,
  navigate: null,
  openChatPanel: null,
  useChatPrompt: null,
};

export function configureContextCardLifestyleRuntimeDeps(deps: Partial<LifestyleRuntimeDeps> = {}) {
  return configureRuntimeCallbacks(lifestyleRuntimeDeps, deps, 'inherited');
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? (window as Window & { __lifestyleContextDelegatesBound?: boolean })
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

export function navigateLifestyleContextRuntime(category: string | undefined) {
  lifestyleRuntimeDeps.navigate?.(category);
}

export function closeLifestyleContextModalAndNavigateRuntime(category: string | undefined) {
  closeLifestyleContextModalRuntime();
  navigateLifestyleContextRuntime(category);
}

export function updateLifestyleChatHeaderModelRuntime() {
  updateChatHeaderModelRuntime();
}

export function openLightSetupFromLifestyleRuntime(reopenSunSetup?: (() => void) | null) {
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
