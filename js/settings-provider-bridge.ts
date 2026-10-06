// settings-provider-bridge.js - lazy bridge from Settings to provider panel modules.

import {
  clearOpenRouterOAuthSession,
  getAIProvider,
  getOpenRouterKey,
  rememberOpenRouterOAuthPreviousProvider,
} from './api.js';
import { disposeOpenRouterSettings } from './openrouter-settings-component.js';
import { getChatBackend, setChatBackend } from './agent-chat-settings.js';

type ProviderPanels = typeof import('./provider-panels.js');
type WalletPanels = typeof import('./provider-wallet-panels.js');
type BridgeOperations = { closeSettingsModal(): unknown; openSettingsModal(): unknown; refreshNutritionAISettings(): unknown };
type BridgeSnapshot = { [Key in keyof BridgeOperations]: unknown };

let _providerPanelsLoad: Promise<ProviderPanels> | null = null;
let settingsHadProvider = false;
let providerViewEpoch = 0;
export function disposeSettingsProviderPanels(): void {
  ++providerViewEpoch;
  disposeOpenRouterSettings();
}

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
    }).catch(error => { _providerPanelsLoad = null; throw error; });
  }
  return _providerPanelsLoad;
}

export function renderAIProviderPanelBridge(): string {
  return '<div class="ai-provider-panel"><div class="ai-provider-desc">Loading provider settings...</div></div>';
}
function captureProviderView() {
  const panel = document.getElementById('ai-provider-panel');
  const epoch = ++providerViewEpoch;
  return { panel, isCurrent: () => !!panel && panel.isConnected && panel === document.getElementById('ai-provider-panel') && epoch === providerViewEpoch };
}
function showProviderLoadFailure(panel: HTMLElement | null): void {
  if (panel) panel.innerHTML = '<div class="ai-provider-desc" role="status">Provider settings could not load. Reopen Settings to retry.</div>';
}

function setProviderButtonState(provider: unknown) {
  const buttons = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('.ai-provider-btn')) as HTMLElement[]);
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === provider);
  });
}

export function switchAIProviderBridge(provider: unknown): void {
  const previousProvider = getAIProvider();
  const owner = captureProviderView();
  if (!owner.panel) return;
  if (provider === 'openrouter' && previousProvider !== 'openrouter' && !getOpenRouterKey()) rememberOpenRouterOAuthPreviousProvider(previousProvider);
  else if (provider !== 'openrouter') clearOpenRouterOAuthSession();
  setProviderButtonState(provider);
  disposeOpenRouterSettings();
  owner.panel.innerHTML = renderAIProviderPanelBridge();
  void loadProviderPanels().then(async panels => {
    if (!owner.isCurrent()) return;
    const changed = await panels.switchAIProvider(provider, { previousProvider, isCurrent: owner.isCurrent });
    if (!owner.isCurrent()) return;
    setProviderButtonState(changed ? provider : previousProvider);
    if (changed) setChatBackend('direct');
    (settingsProviderBridgeDeps as BridgeOperations).refreshNutritionAISettings();
  }).catch(() => { if (owner.isCurrent()) showProviderLoadFailure(owner.panel); });
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

export async function initSettingsProviderPanels(): Promise<void> {
  const owner = captureProviderView();
  const provider = getAIProvider();
  const backend = getChatBackend();
  if (!owner.panel) return;
  try {
    const panels = await loadProviderPanels();
    if (!owner.isCurrent() || getAIProvider() !== provider || getChatBackend() !== backend) return;
    if (backend !== 'codex') {
      owner.panel.innerHTML = panels.renderAIProviderPanel(provider);
      panels.hydrateOpenRouterSettings();
    }
    panels.initSettingsOllamaCheck();
    panels.initSettingsModelFetch();
  } catch { if (owner.isCurrent()) showProviderLoadFailure(owner.panel); }
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
