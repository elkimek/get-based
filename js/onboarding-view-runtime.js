// @ts-check
// onboarding-view-runtime.js - Browser runtime adapters for dashboard onboarding hooks.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { renderChatMessagesRuntime } from './chat-runtime.js';

const onboardingViewRuntimeDeps = {
  buildSidebar: /** @type {null | ((data: unknown) => void)} */ (null),
  createNewThread: /** @type {null | (() => void)} */ (null),
  navigate: /** @type {null | ((route: string, data: unknown) => void)} */ (null),
  openChatPanel: /** @type {null | (() => unknown)} */ (null),
  toggleChatPanel: /** @type {null | (() => void)} */ (null),
};

export function configureOnboardingViewRuntimeDeps(deps = {}) {
  return configureRuntimeCallbacks(onboardingViewRuntimeDeps, deps);
}

/** @param {unknown} data */
export function rebuildOnboardingSidebarRuntime(data) {
  onboardingViewRuntimeDeps.buildSidebar?.(data);
}

/**
 * @param {string} route
 * @param {unknown} data
 * @param {Function | null} [preferredNavigate]
 */
export function navigateOnboardingRuntime(route, data, preferredNavigate = null) {
  const navigate = typeof preferredNavigate === 'function'
    ? preferredNavigate
    : onboardingViewRuntimeDeps.navigate;
  navigate?.(route, data);
}

export function openOnboardingChatPanelRuntime() {
  const openChatPanel = onboardingViewRuntimeDeps.openChatPanel;
  return openChatPanel ? Promise.resolve(openChatPanel()) : null;
}

export function openOnboardingProviderChatRuntime() {
  const openChatPanel = onboardingViewRuntimeDeps.openChatPanel;
  if (openChatPanel) {
    openChatPanel();
    return true;
  }
  const toggleChatPanel = onboardingViewRuntimeDeps.toggleChatPanel;
  if (toggleChatPanel) {
    toggleChatPanel();
    return true;
  }
  return false;
}

export function createOnboardingChatThreadRuntime() {
  const createNewThread = onboardingViewRuntimeDeps.createNewThread;
  if (!createNewThread) return false;
  createNewThread();
  return true;
}

export function renderOnboardingChatMessagesRuntime() {
  renderChatMessagesRuntime();
}
