// @ts-check
// onboarding-view-runtime.js - Browser runtime adapters for dashboard onboarding hooks.

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
  const createNewThread = getRuntimeFunction('createNewThread');
  if (!createNewThread) return false;
  createNewThread();
  return true;
}

export function renderOnboardingChatMessagesRuntime() {
  getRuntimeFunction('renderChatMessages')?.();
}
