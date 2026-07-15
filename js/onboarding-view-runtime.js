// @ts-check
// onboarding-view-runtime.js - Browser runtime adapters for dashboard onboarding hooks.

import { getViewRuntimeFunction } from './views-runtime-bridge.js';

const onboardingViewRuntimeDeps = {
  createNewThread: /** @type {null | (() => void)} */ (null),
};

export function configureOnboardingViewRuntimeDeps(deps = {}) {
  const previous = { ...onboardingViewRuntimeDeps };
  if (Object.prototype.hasOwnProperty.call(deps, 'createNewThread')) {
    onboardingViewRuntimeDeps.createNewThread = typeof deps.createNewThread === 'function'
      ? deps.createNewThread
      : null;
  }
  return previous;
}

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
  if (!runtime) return null;
  const fn = runtime[name];
  if (typeof fn === 'function') return fn.bind(runtime);
  return name === 'navigate' ? getViewRuntimeFunction(name) : null;
}

/** @param {unknown} data */
export function rebuildOnboardingSidebarRuntime(data) {
  getRuntimeFunction('buildSidebar')?.(data);
}

/**
 * @param {string} route
 * @param {unknown} data
 * @param {Function | null} [preferredNavigate]
 */
export function navigateOnboardingRuntime(route, data, preferredNavigate = null) {
  const navigate = typeof preferredNavigate === 'function'
    ? preferredNavigate
    : getRuntimeFunction('navigate');
  navigate?.(route, data);
}

export function openOnboardingChatPanelRuntime() {
  const openChatPanel = getRuntimeFunction('openChatPanel');
  return openChatPanel ? Promise.resolve(openChatPanel()) : null;
}

export function openOnboardingProviderChatRuntime() {
  const openChatPanel = getRuntimeFunction('openChatPanel');
  if (openChatPanel) {
    openChatPanel();
    return true;
  }
  const toggleChatPanel = getRuntimeFunction('toggleChatPanel');
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
  getRuntimeFunction('renderChatMessages')?.();
}
