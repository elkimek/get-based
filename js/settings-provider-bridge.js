// @ts-check
// settings-provider-bridge.js - lazy bridge from Settings to provider panel modules.

import {
  clearOpenRouterOAuthSession,
  getAIProvider,
  getOpenRouterKey,
  rememberOpenRouterOAuthPreviousProvider,
} from './api.js';
import { getChatBackend, setChatBackend } from './agent-chat-settings.js';

let _providerPanelsLoad = null;
let settingsHadProvider = false;

const settingsProviderBridgeDeps = {
  closeSettingsModal: () => {},
  openSettingsModal: () => {},
  refreshNutritionAISettings: () => {},
};

export function configureSettingsProviderBridgeDeps(deps = {}) {
  const previous = { ...settingsProviderBridgeDeps };
  for (const name of Object.keys(settingsProviderBridgeDeps)) {
    if (typeof deps[name] === 'function') settingsProviderBridgeDeps[name] = deps[name];
  }
  return previous;
}

export function setSettingsProviderHadProvider(value) {
  settingsHadProvider = value === true;
}

function loadProviderPanels() {
  if (!_providerPanelsLoad) {
    _providerPanelsLoad = import('./provider-panels.js').then(providerPanels => {
      providerPanels.configureProviderPanelDeps({
        closeSettingsModal: () => settingsProviderBridgeDeps.closeSettingsModal(),
        hadProviderBeforeSettings: () => settingsHadProvider,
        openSettingsModal: () => settingsProviderBridgeDeps.openSettingsModal(),
      });
      return providerPanels;
    });
  }
  return _providerPanelsLoad;
}

export function renderAIProviderPanelBridge() {
  loadProviderPanels().then(providerPanels => {
    const panel = document.getElementById('ai-provider-panel');
    if (panel) panel.innerHTML = providerPanels.renderAIProviderPanel(getAIProvider());
  }).catch(() => {});
  return '<div class="ai-provider-panel"><div class="ai-provider-desc">Loading provider settings...</div></div>';
}

function setProviderButtonState(provider) {
  const buttons = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('.ai-provider-btn')));
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === provider);
  });
}

export function switchAIProviderBridge(provider) {
  const previousProvider = getAIProvider();
  if (provider === 'openrouter' && previousProvider !== 'openrouter' && !getOpenRouterKey()) {
    rememberOpenRouterOAuthPreviousProvider(previousProvider);
  } else if (provider !== 'openrouter') {
    clearOpenRouterOAuthSession();
  }
  setProviderButtonState(provider);
  const panel = document.getElementById('ai-provider-panel');
  if (panel) panel.innerHTML = '<div class="ai-provider-panel"><div class="ai-provider-desc">Loading provider settings...</div></div>';
  loadProviderPanels().then(async providerPanels => {
    const changed = await providerPanels.switchAIProvider(provider, { previousProvider });
    setProviderButtonState(changed ? provider : previousProvider);
    if (changed) setChatBackend('direct');
    settingsProviderBridgeDeps.refreshNutritionAISettings();
  }).catch(() => {});
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('getbased:chat-backend-changed', () => {
    setProviderButtonState(getChatBackend() === 'codex' ? 'cli' : getAIProvider());
  });
}

export function toggleAIPauseBridge(enabled) {
  return loadProviderPanels().then(providerPanels => providerPanels.toggleAIPause(enabled));
}

export function testPIIOllamaConnectionBridge() {
  return loadProviderPanels().then(providerPanels => providerPanels.testPIIOllamaConnection());
}

export function initSettingsProviderPanels() {
  return loadProviderPanels().then(providerPanels => {
    providerPanels.initSettingsOllamaCheck();
    providerPanels.initSettingsModelFetch();
  });
}
