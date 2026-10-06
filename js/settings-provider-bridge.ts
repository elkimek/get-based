import { mountAiSettings,getAiSettingsView,disposeAiSettings,setAiSettingsSelection } from './ai-settings-component.js';
import { buildAiSettingsSnapshot } from './ai-settings-presentation.js';
import { AI_PROVIDER_IDS,type AiProviderId } from './ai-settings-contract.js';
import { setAiSettingsEnabled } from './ai-settings-actions.js';
import { renderCLIAgentProviderPanel } from './settings-cli-agent-panel.js';
import { isAIPaused } from './api.js';
import { disposeCliAgentSettings } from './cli-agent-settings-component.js';
import { disposeLocalAiSettings } from './local-ai-settings-component.js';
import { disposeCustomSettings } from './custom-settings-component.js';
import { disposePpqSettings } from './ppq-settings-component.js';
// settings-provider-bridge.js - lazy bridge from Settings to provider panel modules.

import {
  clearOpenRouterOAuthSession,
  getAIProvider,
  getOpenRouterKey,
  rememberOpenRouterOAuthPreviousProvider,
} from './api.js';
import { disposeVeniceSettings } from './venice-settings-component.js';
import { disposeOpenRouterSettings } from './openrouter-settings-component.js';
import { getChatBackend, setChatBackend } from './agent-chat-settings.js';

type ProviderPanels = typeof import('./provider-panels.js');
type WalletPanels = typeof import('./provider-wallet-panels.js');
type BridgeOperations = { closeSettingsModal(): unknown; openSettingsModal(): unknown; refreshNutritionAISettings(): unknown };
type BridgeSnapshot = { [Key in keyof BridgeOperations]: unknown };

let _providerPanelsLoad: Promise<ProviderPanels> | null = null;
let settingsHadProvider = false;
let providerViewEpoch = 0;
let walletPanelsLoad: Promise<WalletPanels> | null = null;
let loadedWalletPanels: WalletPanels | null = null;
function loadWalletPanels(): Promise<WalletPanels> {
  if (!walletPanelsLoad) walletPanelsLoad = import('./provider-wallet-panels.js').then(panels => {
    loadedWalletPanels = panels; return panels;
  }).catch(error => { walletPanelsLoad = null; throw error; });
  return walletPanelsLoad;
}
export function disposeSettingsProviderPanels(): void {
  ++providerViewEpoch;
  disposeProviderChildren();
  disposeAiSettings();
}
function disposeProviderChildren(): void {
  loadedWalletPanels?.clearRoutstrWalletTimers();
  disposeCliAgentSettings();
  disposeLocalAiSettings();
  disposeCustomSettings();
  disposeOpenRouterSettings();
  disposeVeniceSettings();
  disposePpqSettings();
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
    _providerPanelsLoad = import('./provider-panels.js').then(async providerPanels => {
      await loadWalletPanels();
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

export function renderAIProviderPanelBridge(): string { return '<div data-ai-provider-loading-host></div>'; }
export function hydrateAiSettings(hideProviders: boolean, onSelect?: (provider:AiProviderId,button:HTMLButtonElement) => unknown): void {
  const host = document.querySelector<HTMLElement>('[data-ai-settings-host]');
  if (!host?.isConnected) return;
  const view = mountAiSettings(host,buildAiSettingsSnapshot({ enabled:!isAIPaused(),hideProviders,provider:getAIProvider(),backend:getChatBackend() }),{
    pause:toggleAIPauseBridge,select:onSelect || (provider => provider === 'cli' ? showCLIAgentProviderBridge() : switchAIProviderBridge(provider)),
  });
  const panel = view.getProviderHost();
  if (panel) panel.innerHTML = getChatBackend() === 'codex' ? renderCLIAgentProviderPanel() : renderAIProviderPanelBridge();
  if (getChatBackend() === 'codex') view.setProviderStatus('ready');
}
function captureProviderView() {
  const view = getAiSettingsView(), panel = view?.getProviderHost() || null;
  const epoch = ++providerViewEpoch;
  return { panel,view,isCurrent:() => !!view?.isCurrent() && !!panel && panel.isConnected && panel === view.getProviderHost() && epoch === providerViewEpoch };
}
function showProviderLoadFailure(): void { getAiSettingsView()?.setProviderStatus('error'); }
export function showCLIAgentProviderBridge(): void {
  const owner = captureProviderView();
  if (!owner.panel) return;
  disposeProviderChildren();
  owner.view?.setSelected('cli'); owner.view?.setProviderStatus('ready');
  owner.panel.innerHTML = renderCLIAgentProviderPanel();
}

export function switchAIProviderBridge(provider: unknown): void {
  if (!AI_PROVIDER_IDS.includes(provider as AiProviderId) || provider === 'cli') return;
  const previousProvider = getAIProvider(), previousActive = getChatBackend() === 'codex' ? 'cli' : previousProvider;
  const owner = captureProviderView();
  if (!owner.panel) return;
  if (provider === 'openrouter' && previousProvider !== 'openrouter' && !getOpenRouterKey()) rememberOpenRouterOAuthPreviousProvider(previousProvider);
  else if (provider !== 'openrouter') clearOpenRouterOAuthSession();
  setAiSettingsSelection(provider);
  owner.view?.setProviderStatus('loading');
  disposeProviderChildren();
  owner.panel.innerHTML = renderAIProviderPanelBridge();
  void loadProviderPanels().then(async panels => {
    if (!owner.isCurrent()) return;
    const changed = await panels.switchAIProvider(provider, { previousProvider, isCurrent: owner.isCurrent });
    if (!owner.isCurrent()) return;
    if (!changed && previousActive === 'cli') { showCLIAgentProviderBridge(); return; }
    setAiSettingsSelection(changed ? provider : previousProvider);
    owner.view?.setProviderStatus('ready');
    if (changed) setChatBackend('direct');
    (settingsProviderBridgeDeps as BridgeOperations).refreshNutritionAISettings();
  }).catch(() => { if (owner.isCurrent()) showProviderLoadFailure(); });
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('getbased:chat-backend-changed', () => {
    setAiSettingsSelection(getChatBackend() === 'codex' ? 'cli' : getAIProvider());
  });
}

export function toggleAIPauseBridge(enabled: unknown): void {
  const view = getAiSettingsView(); if (!view) return;
  try { setAiSettingsEnabled(enabled); view.setPauseError(''); }
  catch { if (view.isCurrent()) view.setPauseError('AI features could not be updated. Try again.'); }
  finally { if (view.isCurrent()) { try { view.setEnabled(!isAIPaused()); } catch { view.setEnabled(view.getSnapshot().enabled); } } }
}

export function testPIIOllamaConnectionBridge() {
  return loadProviderPanels().then(providerPanels => providerPanels.testPIIOllamaConnection());
}

export async function initSettingsProviderPanels(): Promise<void> {
  const owner = captureProviderView();
  if (!owner.panel) return;
  const initialChild = owner.panel.firstElementChild;
  const ownsLoadingView = () => owner.isCurrent() && owner.panel?.firstElementChild === initialChild;
  try {
    const panels = await loadProviderPanels();
    if (!ownsLoadingView()) return;
    const provider = getAIProvider(), backend = getChatBackend();
    owner.view?.setSelected(backend === 'codex' ? 'cli' : provider);
    if (backend !== 'codex') {
      owner.panel.innerHTML = panels.renderAIProviderPanel(provider);
      panels.hydrateOwnedProviderSettings();
      owner.view?.setProviderStatus('ready');
    }
    panels.initSettingsOllamaCheck();
    panels.initSettingsModelFetch();
  } catch { if (ownsLoadingView()) showProviderLoadFailure(); }
}

// Load saved funding recovery only for the active direct Routstr provider.
function syncWalletFunding() {
  try {
    if (!walletPanelsLoad) {
      if (getAIProvider() !== 'routstr' || getChatBackend() !== 'direct' || !localStorage.getItem('labcharts-cashu-wallet-mnemonic')) return;
    }
    void loadWalletPanels().then(panels => panels.startRoutstrFundingMonitor()).catch(() => {});
  } catch {}
}
globalThis.addEventListener?.('labcharts-ai-settings-local-changed', syncWalletFunding);
globalThis.addEventListener?.('labcharts-ai-settings-synced', syncWalletFunding);
globalThis.addEventListener?.('getbased:chat-backend-changed', syncWalletFunding);
globalThis.addEventListener?.('storage', event => {
  if (!(event as Event & { key?: unknown }).key || (['labcharts-ai-provider', 'labcharts-chat-backend'] as readonly unknown[]).includes((event as Event & { key?: unknown }).key)) syncWalletFunding();
});
syncWalletFunding();
