// settings-provider-bridge.js - lazy bridge from Settings to provider panel modules.

import {
  clearOpenRouterOAuthSession,
  getAIProvider,
  getOpenRouterKey,
  rememberOpenRouterOAuthPreviousProvider,
} from './api.js';
import { getChatBackend, setChatBackend } from './agent-chat-settings.js';

type ProviderPanels = typeof import('./provider-panels.js');
type WalletPanels = typeof import('./provider-wallet-panels.js');
type BridgeOperations = { closeSettingsModal(): unknown; openSettingsModal(): unknown; refreshNutritionAISettings(): unknown };
type BridgeSnapshot = { [Key in keyof BridgeOperations]: unknown };

let _providerPanelsLoad: Promise<ProviderPanels> | null = null;
let settingsHadProvider = false;

const settingsProviderBridgeDeps: BridgeSnapshot = {
  closeSettingsModal: () => {},
  openSettingsModal: () => {},
  refreshNutritionAISettings: () => {},
};

export function configureSettingsProviderBridgeDeps(deps: unknown = {}) {
  const previous = { ...settingsProviderBridgeDeps };
  for (const name of Object.keys(settingsProviderBridgeDeps)) {
    if (typeof (deps as Record<string, unknown>)[name] === 'function') settingsProviderBridgeDeps[name as keyof BridgeSnapshot] = (deps as Record<string, unknown>)[name];
  }
  return previous;
}

export function setSettingsProviderHadProvider(value: unknown) {
  settingsHadProvider = value === true;
}

function loadProviderPanels() {
  if (!_providerPanelsLoad) {
    _providerPanelsLoad = import('./provider-panels.js').then(providerPanels => {
      providerPanels.configureProviderPanelDeps({
        closeSettingsModal: () => (settingsProviderBridgeDeps as BridgeOperations).closeSettingsModal(),
        hadProviderBeforeSettings: () => settingsHadProvider,
        openSettingsModal: () => (settingsProviderBridgeDeps as BridgeOperations).openSettingsModal(),
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

function setProviderButtonState(provider: unknown) {
  const buttons = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('.ai-provider-btn')) as HTMLElement[]);
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === provider);
  });
}

export function switchAIProviderBridge(provider: unknown) {
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
    (settingsProviderBridgeDeps as BridgeOperations).refreshNutritionAISettings();
  }).catch(() => {});
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('getbased:chat-backend-changed', () => {
    setProviderButtonState(getChatBackend() === 'codex' ? 'cli' : getAIProvider());
  });
}

export function toggleAIPauseBridge(enabled: unknown) {
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

// Load saved funding recovery only for the active direct Routstr provider.
let walletPanelsLoad: Promise<WalletPanels> | null = null;
function syncWalletFunding() {
  try {
    if (!walletPanelsLoad) {
      if (getAIProvider() !== 'routstr' || getChatBackend() !== 'direct' || !localStorage.getItem('labcharts-cashu-wallet-mnemonic')) return;
      walletPanelsLoad = import('./provider-wallet-panels.js');
    }
    void walletPanelsLoad.then(panels => panels.startRoutstrFundingMonitor()).catch(() => {});
  } catch {}
}
globalThis.addEventListener?.('labcharts-ai-settings-local-changed', syncWalletFunding);
globalThis.addEventListener?.('labcharts-ai-settings-synced', syncWalletFunding);
globalThis.addEventListener?.('getbased:chat-backend-changed', syncWalletFunding);
globalThis.addEventListener?.('storage', event => {
  if (!(event as Event & { key?: unknown }).key || (['labcharts-ai-provider', 'labcharts-chat-backend'] as readonly unknown[]).includes((event as Event & { key?: unknown }).key)) syncWalletFunding();
});
syncWalletFunding();
