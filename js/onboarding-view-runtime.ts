// onboarding-view-runtime.js - Browser runtime adapters for dashboard onboarding hooks.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { renderChatMessagesRuntime } from './chat-runtime.js';

interface OnboardingViewRuntimeDeps {
  buildSidebar: ((data: unknown) => unknown) | null;
  createNewThread: (() => unknown) | null;
  navigate: ((route: string, data: unknown) => unknown) | null;
  openChatPanel: (() => unknown) | null;
  toggleChatPanel: (() => unknown) | null;
}

const onboardingViewRuntimeDeps: OnboardingViewRuntimeDeps = {
  buildSidebar:  null,
  createNewThread:  null,
  navigate:  null,
  openChatPanel:  null,
  toggleChatPanel:  null,
};

export function configureOnboardingViewRuntimeDeps(deps: unknown = {}) {
  return configureRuntimeCallbacks(onboardingViewRuntimeDeps, deps as Partial<OnboardingViewRuntimeDeps>) as { [Key in keyof OnboardingViewRuntimeDeps]: unknown };
}

export function rebuildOnboardingSidebarRuntime(data: unknown) {
  onboardingViewRuntimeDeps.buildSidebar?.(data);
}

export function navigateOnboardingRuntime(route: string, data: unknown, preferredNavigate: unknown = null) {
  const navigate = typeof preferredNavigate === 'function'
    ? preferredNavigate as NonNullable<OnboardingViewRuntimeDeps['navigate']>
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
