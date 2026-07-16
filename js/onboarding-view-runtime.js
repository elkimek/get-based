// @ts-check
// onboarding-view-runtime.js - Browser runtime adapters for dashboard onboarding hooks.

import { renderChatMessagesRuntime } from './chat-runtime.js';

const onboardingViewRuntimeDeps = {
  buildSidebar: /** @type {null | ((data: unknown) => void)} */ (null),
  createNewThread: /** @type {null | (() => void)} */ (null),
  navigate: /** @type {null | ((route: string, data: unknown) => void)} */ (null),
  openChatPanel: /** @type {null | (() => unknown)} */ (null),
  toggleChatPanel: /** @type {null | (() => void)} */ (null),
};

export function configureOnboardingViewRuntimeDeps(deps = {}) {
  const previous = { ...onboardingViewRuntimeDeps };
  if (Object.prototype.hasOwnProperty.call(deps, 'buildSidebar')) {
    onboardingViewRuntimeDeps.buildSidebar = typeof deps.buildSidebar === 'function'
      ? deps.buildSidebar
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(deps, 'createNewThread')) {
    onboardingViewRuntimeDeps.createNewThread = typeof deps.createNewThread === 'function'
      ? deps.createNewThread
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(deps, 'navigate')) {
    onboardingViewRuntimeDeps.navigate = typeof deps.navigate === 'function'
      ? deps.navigate
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(deps, 'openChatPanel')) {
    onboardingViewRuntimeDeps.openChatPanel = typeof deps.openChatPanel === 'function'
      ? deps.openChatPanel
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(deps, 'toggleChatPanel')) {
    onboardingViewRuntimeDeps.toggleChatPanel = typeof deps.toggleChatPanel === 'function'
      ? deps.toggleChatPanel
      : null;
  }
  return previous;
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
