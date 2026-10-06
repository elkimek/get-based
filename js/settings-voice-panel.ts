import { mountVoiceSettingsPanel } from './settings-voice-component.js';
import { getVoiceSettingsView } from './settings-voice-view-runtime.js';
import type { VoiceSettingsView } from './settings-voice-contract.js';
import type { VoiceKind } from '../types/voice-local.js';
import type { VoiceProvider } from '../types/voice-provider.js';
import type { VoiceCatalogEntry } from './voice-catalog-storage.js';
type VoiceSettings = ReturnType<typeof getVoiceSettings>;
type VoiceModelOption = Awaited<ReturnType<VoiceProvider['listModels']>>[number];
type PpqCatalogContext = { generation: number; language: string };
type CatalogRequest = { generation: number; controller: AbortController; promise: Promise<VoiceCatalogEntry[]> };

// settings-voice-panel.js — Voice settings actions and hydration.

import { getErrorMessage } from './caught-error.js';
import {
  setActionBusy,
  handleLocalModelAction,
  handleLocalModelProgress,
  refreshLocalModelDetails,
  verifyRenderedLocalModels,
} from './settings-voice-model-controller.js';
import {
  renderVoiceSettingsPanel,
  voiceProviderKeyStatus,
  voiceProviderLabels,
} from './settings-voice-view.js';
import { refreshSttHardwareDescription, refreshTtsHardwareDescription } from './settings-voice-hardware.js';
import { showNotification } from './utils.js';
import { readVoiceCatalog, writeVoiceCatalog } from './voice-catalog-storage.js';
import {
  getOpenRouterDefaultVoice,
  normalizeOpenRouterVoice,
  openRouterVoiceCatalogId,
  voicesForOpenRouterModel,
} from './voice-openrouter-catalog.js';
import {
  resolveVoiceProviderId,
} from './voice-ai-provider.js';
import { voicePlayer } from './voice-player.js';
import { loadVoiceProvider } from './voice-provider-registry.js';
import {
  getVoiceProviderKey,
  getVoiceSettings,
  hasVoiceProviderKey,
  saveVoiceProviderKey,
  setSharedVoiceProvider,
  setVoiceSetting,
} from './voice-settings-storage.js';

export { renderVoiceSettingsPanel };

let installedProgressListener = false;
let ppqCatalogGeneration = 0;
let ppqCatalogRequest: CatalogRequest | null = null;
type CatalogContext = { view: VoiceSettingsView; fingerprint: string; options: ReturnType<typeof providerOptionsFor>; current(): boolean };
type PanelCatalogRequest = { context: CatalogContext; promise: Promise<VoiceCatalogEntry[]> };
const panelCatalogRequests = new WeakMap<HTMLElement, Map<string, PanelCatalogRequest>>();
let openRouterCatalogueKey = '';
// Requests belong to one mounted view and one connection/selection snapshot.
// A remount starts its own hydration; late replies cannot persist stale choices.
function catalogFingerprint(provider: string): string {
  const settings = getVoiceSettings();
  return JSON.stringify([getVoiceProviderKey(provider), settings.localServerUrl, settings.outputLanguage,
    settings.openRouterTtsModel, resolveVoiceProviderId('stt', settings.inputProvider),
    resolveVoiceProviderId('tts', settings.outputProvider)]);
}
function catalogContext(panel: HTMLElement, provider: string): CatalogContext | null {
  const view = getVoiceSettingsView(panel);
  if (!view) return null;
  const fingerprint = catalogFingerprint(provider);
  return { view, fingerprint, options: providerOptionsFor(provider, getVoiceSettings()),
    current: () => getVoiceSettingsView(panel) === view && catalogFingerprint(provider) === fingerprint };
}
function pendingCatalog(panel: HTMLElement, provider: string, context: CatalogContext): Promise<VoiceCatalogEntry[]> | null {
  const request = panelCatalogRequests.get(panel)?.get(provider);
  return request?.context.fingerprint === context.fingerprint && request.context.current() ? request.promise : null;
}
function trackCatalog(panel: HTMLElement, provider: string, context: CatalogContext, promise: Promise<VoiceCatalogEntry[]>): Promise<VoiceCatalogEntry[]> {
  let requests = panelCatalogRequests.get(panel);
  if (!requests) { requests = new Map(); panelCatalogRequests.set(panel, requests); }
  const request = { context, promise }; requests.set(provider, request);
  return promise.finally(() => { if (requests.get(provider) === request) requests.delete(provider); });
}
const openRouterLiveModels: Record<VoiceKind, VoiceModelOption[]> = {
  stt: [],
  tts: [],
};

function providerOptionsFor(provider: string, settings: VoiceSettings) {
  return {
    apiKey: getVoiceProviderKey(provider),
    baseUrl: settings.localServerUrl,
    language: settings.outputLanguage,
    modelId: provider === 'openrouter' ? settings.openRouterTtsModel : undefined,
  };
}

function ppqCatalogContext(providerId: string, settings: VoiceSettings) {
  return providerId === 'ppq'
    ? { generation: ppqCatalogGeneration, language: settings.outputLanguage }
    : null;
}

function isPpqCatalogContextCurrent(context: PpqCatalogContext | null) {
  if (!context) return true;
  const current = getVoiceSettings();
  return context.generation === ppqCatalogGeneration
    && context.language === current.outputLanguage;
}

function refreshVisibility(panel: HTMLElement) {
  getVoiceSettingsView(panel)?.refresh();
  const settings = getVoiceSettings();
  void refreshSttHardwareDescription(panel, settings);
  void refreshTtsHardwareDescription(panel, settings);
}

function setTestStatus(panel: HTMLElement, provider: string, text: string, isError = false) {
  getVoiceSettingsView(panel)?.setTestStatus(provider, text, isError);
}
function setCatalogStatus(panel: HTMLElement, provider: string, text: string) {
  getVoiceSettingsView(panel)?.setCatalogStatus(provider, text);
}

async function handleKeyAction(panel: HTMLElement, button: HTMLButtonElement, clear = false) {
  const provider = button.dataset.provider || '';
  const input = panel.querySelector(`[data-voice-key-input="${provider}"]`);
  if (!(input instanceof HTMLInputElement)) return;
  const draft = input.value;
  const view = getVoiceSettingsView(panel);
  const value = clear ? '' : draft.trim();
  if (!clear && !value) {
    showNotification('Enter an API key first.', 'error');
    input.focus();
    return;
  }
  setActionBusy(button, true, clear ? 'Clearing…' : 'Saving…');
  try {
    await saveVoiceProviderKey(provider, value);
    if (getVoiceSettingsView(panel) === view && input.value === draft) view?.setKey(provider, value, voiceProviderKeyStatus(provider, !!value));
    showNotification(
      value
        ? `${voiceProviderLabels[provider] || provider} key saved.`
        : 'Voice API key cleared.',
      'success',
    );
  } catch (error) {
    showNotification(getErrorMessage(error, 'Could not save the API key'), 'error', 6000);
  } finally {
    setActionBusy(button, false);
  }
}

function applyVoiceCatalog(panel: HTMLElement, providerId: string, voices: unknown, {
  catalogId = providerId,
  preferredVoice = '',
} = {}) {
  const rows = writeVoiceCatalog(catalogId, voices);
  const view = getVoiceSettingsView(panel);
  if (!view) return rows;
  const settingNames: Record<string, keyof VoiceSettings> = {
    elevenlabs: 'elevenlabsVoice',
    openrouter: 'openRouterVoice',
    ppq: 'ppqVoice',
    venice: 'veniceVoice',
    xai: 'xaiVoice',
  };
  const settingName = settingNames[providerId]!;
  const settings = getVoiceSettings();
  const existing = settings[settingName];
  if (rows.length && !rows.some(voice => voice.id === existing)) {
    const replacement = rows.some(voice => voice.id === preferredVoice)
      ? preferredVoice
      : rows[0]!.id;
    setVoiceSetting(settingName, replacement);
  }
  view.refresh();
  view.setCatalogStatus(providerId, `${rows.length} voice${rows.length === 1 ? '' : 's'} loaded`);
  return rows;
}

function applyOpenRouterModelCatalog(panel: HTMLElement, kind: VoiceKind, models: VoiceModelOption[]) {
  if (!getVoiceSettingsView(panel)) return null;
  const settingName = kind === 'stt' ? 'openRouterSttModel' : 'openRouterTtsModel';
  const existing = getVoiceSettings()[settingName];
  const rows = Array.isArray(models) ? models : [];
  const selectedModel = rows.find(model => model.id === existing) || rows[0];
  if (selectedModel && selectedModel.id !== existing) {
    setVoiceSetting(settingName, selectedModel.id);
  }
  return selectedModel;
}

function applyOpenRouterVoices(panel: HTMLElement, model: VoiceModelOption | null | undefined) {
  if (!model) return [];
  return applyVoiceCatalog(panel, 'openrouter', voicesForOpenRouterModel(model), {
    catalogId: openRouterVoiceCatalogId(model.id),
    preferredVoice: getOpenRouterDefaultVoice(model.id),
  });
}

function refreshOpenRouterVoicesFromCache(panel: HTMLElement) {
  const settings = getVoiceSettings();
  const model = openRouterLiveModels.tts.find(row => row.id === settings.openRouterTtsModel);
  return model ? applyOpenRouterVoices(panel, model) : [];
}

async function hydrateOpenRouterCatalog(panel: HTMLElement, { force = false } = {}) {
  const settings = getVoiceSettings();
  const usesStt = resolveVoiceProviderId('stt', settings.inputProvider) === 'openrouter';
  const usesTts = resolveVoiceProviderId('tts', settings.outputProvider) === 'openrouter';
  if ((!usesStt && !usesTts) || !hasVoiceProviderKey('openrouter')) return [];
  const context = catalogContext(panel, 'openrouter');
  if (!context) return [];
  if (!force && openRouterCatalogueKey === context.options.apiKey && (!usesStt || openRouterLiveModels.stt.length)
    && (!usesTts || openRouterLiveModels.tts.length)) {
    const selected = usesTts
      ? applyOpenRouterModelCatalog(panel, 'tts', openRouterLiveModels.tts)
      : null;
    if (usesStt) applyOpenRouterModelCatalog(panel, 'stt', openRouterLiveModels.stt);
    return selected ? applyOpenRouterVoices(panel, selected) : [];
  }
  const pending = pendingCatalog(panel, 'openrouter', context); if (pending) return pending;
  setCatalogStatus(panel, 'openrouter', 'Loading models and voices…');
  const promise = loadVoiceProvider('openrouter')
    .then(async provider => {
      const [sttModels, ttsModels] = await Promise.all([
        usesStt ? provider.listModels('stt', context.options) : [],
        usesTts ? provider.listModels('tts', context.options) : [],
      ]);
      if (!context.current()) return [];
      if (usesStt && !sttModels.length) throw new Error('No curated OpenRouter transcription models are currently available.');
      if (usesTts && !ttsModels.length) throw new Error('No curated OpenRouter speech models are currently available.');
      openRouterCatalogueKey = context.options.apiKey;
      if (usesStt) openRouterLiveModels.stt = sttModels;
      if (usesTts) openRouterLiveModels.tts = ttsModels;
      if (usesStt) applyOpenRouterModelCatalog(panel, 'stt', sttModels);
      const selected = usesTts ? applyOpenRouterModelCatalog(panel, 'tts', ttsModels) : null;
      return selected ? applyOpenRouterVoices(panel, selected) : [];
    })
    .catch(error => {
      if (!context.current()) return [];
      const message = getErrorMessage(error, 'Could not load OpenRouter voice options');
      setCatalogStatus(panel, 'openrouter', message);
      if (usesTts) {
        const modelId = settings.openRouterTtsModel;
        const fallbackVoices = [getOpenRouterDefaultVoice(modelId)].filter(Boolean);
        const fallback = applyVoiceCatalog(
          panel,
          'openrouter',
          fallbackVoices.map(voice => normalizeOpenRouterVoice(modelId, voice)),
          {
            catalogId: openRouterVoiceCatalogId(modelId),
            preferredVoice: getOpenRouterDefaultVoice(modelId),
          },
        );
        setCatalogStatus(panel, 'openrouter', message);
        return fallback;
      }
      return [];
    });
  return trackCatalog(panel, 'openrouter', context, promise);
}

async function hydratePpqVoiceCatalog(panel: HTMLElement, { force = false } = {}) {
  const settings = getVoiceSettings();
  if (
    resolveVoiceProviderId('tts', settings.outputProvider) !== 'ppq'
    || !hasVoiceProviderKey('ppq')
    || (!force && readVoiceCatalog('ppq').length)
  ) {
    return [];
  }
  const context = catalogContext(panel, 'ppq');
  if (!context) return [];
  if (ppqCatalogRequest && !force) return ppqCatalogRequest.promise;
  if (ppqCatalogRequest) ppqCatalogRequest.controller.abort();
  const generation = ++ppqCatalogGeneration;
  const controller = new AbortController();
  const requestedLanguage = settings.outputLanguage;
  setCatalogStatus(panel, 'ppq', 'Loading voices…');
  const promise = loadVoiceProvider('ppq')
    .then(provider => {
      if (typeof provider.listVoices !== 'function') {
        throw new Error('PPQ does not expose a compatible voice catalogue.');
      }
      return provider.listVoices({
        ...context.options,
        signal: controller.signal,
      });
    })
    .then(voices => {
      const current = getVoiceSettings();
      if (
        !context.current()
        || generation !== ppqCatalogGeneration
        || resolveVoiceProviderId('tts', current.outputProvider) !== 'ppq'
        || current.outputLanguage !== requestedLanguage
      ) {
        return [];
      }
      if (!voices.length) throw new Error('PPQ returned no compatible voices.');
      return applyVoiceCatalog(panel, 'ppq', voices);
    })
    .catch(error => {
      if (!context.current() || generation !== ppqCatalogGeneration || controller.signal.aborted) return [];
      setCatalogStatus(panel, 'ppq', getErrorMessage(error, 'Could not load PPQ voices'));
      return [];
    })
    .finally(() => {
      if (ppqCatalogRequest?.generation === generation) ppqCatalogRequest = null;
    });
  ppqCatalogRequest = { generation, controller, promise };
  return promise;
}

async function hydrateVeniceVoiceCatalog(panel: HTMLElement, { force = false } = {}) {
  const settings = getVoiceSettings();
  if (
    resolveVoiceProviderId('tts', settings.outputProvider) !== 'venice'
    || !hasVoiceProviderKey('venice')
    || (!force && readVoiceCatalog('venice').length)
  ) {
    return [];
  }
  const context = catalogContext(panel, 'venice');
  if (!context) return [];
  const pending = pendingCatalog(panel, 'venice', context); if (pending) return pending;
  setCatalogStatus(panel, 'venice', 'Loading private Kokoro voices…');
  const promise = loadVoiceProvider('venice')
    .then(provider => {
      if (typeof provider.listVoices !== 'function') {
        throw new Error('Venice does not expose a compatible voice catalogue.');
      }
      return provider.listVoices(context.options);
    })
    .then(voices => {
      if (!context.current()) return [];
      if (!voices.length) throw new Error('Venice returned no Kokoro voices.');
      return applyVoiceCatalog(panel, 'venice', voices, { preferredVoice: 'af_sky' });
    })
    .catch(error => {
      if (!context.current()) return [];
      setCatalogStatus(panel, 'venice', getErrorMessage(error, 'Could not load Venice voices'));
      return [];
    });
  return trackCatalog(panel, 'venice', context, promise);
}

async function handleTestProvider(panel: HTMLElement, button: HTMLButtonElement) {
  const providerId = button.dataset.provider || 'browser-local';
  const settings = getVoiceSettings();
  const ppqContext = ppqCatalogContext(providerId, settings);
  const context = catalogContext(panel, providerId);
  if (!context) return;
  setActionBusy(button, true, 'Testing…');
  setTestStatus(panel, providerId, 'Connecting…');
  try {
    const provider = await loadVoiceProvider(providerId);
    const result = await provider.testConnection(
      context.options,
    );
    if (!context.current()) return;
    if (['local-server', 'xai', 'elevenlabs', 'openrouter', 'ppq', 'venice'].includes(providerId)) {
      const { requestAIProviderActivation } = await import('./cloud-ai-consent.js');
      const activated = await requestAIProviderActivation(providerId, {
        endpoint: providerId === 'local-server' ? settings.localServerUrl : '',
      });
      if (!activated) {
        setTestStatus(panel, providerId, 'Connection verified — AI voice not activated.');
        return;
      }
    }
    if (
      Array.isArray(result.voices)
      && result.voices.length
      && ['xai', 'elevenlabs', 'openrouter', 'ppq', 'venice'].includes(providerId)
      && context.current() && isPpqCatalogContextCurrent(ppqContext)
    ) {
      applyVoiceCatalog(panel, providerId, result.voices, providerId === 'openrouter'
        ? {
            catalogId: openRouterVoiceCatalogId(getVoiceSettings().openRouterTtsModel),
            preferredVoice: getOpenRouterDefaultVoice(getVoiceSettings().openRouterTtsModel),
          }
        : providerId === 'venice'
          ? { preferredVoice: 'af_sky' }
          : {});
    }
    if (context.current()) setTestStatus(panel, providerId, result.message || 'Connected.');
  } catch (error) {
    if (context.current()) setTestStatus(panel, providerId, getErrorMessage(error, 'Connection failed'), true);
  } finally {
    setActionBusy(button, false);
  }
}

async function handleRefreshVoices(panel: HTMLElement, button: HTMLButtonElement) {
  const providerId = button.dataset.provider || '';
  if (!hasVoiceProviderKey(providerId)) {
    showNotification(
      ['openrouter', 'ppq', 'venice'].includes(providerId)
        ? `Connect ${voiceProviderLabels[providerId] || providerId} in AI settings first.`
        : `Save a ${voiceProviderLabels[providerId] || providerId} API key first.`,
      'error',
    );
    return;
  }
  const settings = getVoiceSettings();
  const ppqContext = ppqCatalogContext(providerId, settings);
  const context = catalogContext(panel, providerId);
  if (!context) return;
  setActionBusy(button, true, 'Refreshing…');
  try {
    const provider = await loadVoiceProvider(providerId);
    if (typeof provider.listVoices !== 'function') {
      throw new Error(`${voiceProviderLabels[providerId] || providerId} does not expose a voice catalogue.`);
    }
    const voices = await provider.listVoices(
      context.options,
    );
    if (!context.current() || !isPpqCatalogContextCurrent(ppqContext)) return;
    if (!voices.length) throw new Error('The provider returned no voices.');
    applyVoiceCatalog(panel, providerId, voices, providerId === 'openrouter'
      ? {
          catalogId: openRouterVoiceCatalogId(getVoiceSettings().openRouterTtsModel),
          preferredVoice: getOpenRouterDefaultVoice(getVoiceSettings().openRouterTtsModel),
        }
      : providerId === 'venice'
        ? { preferredVoice: 'af_sky' }
        : {});
    showNotification(`${voices.length} voices loaded.`, 'success');
  } catch (error) {
    showNotification(getErrorMessage(error, 'Could not load voices'), 'error', 6000);
  } finally {
    setActionBusy(button, false);
  }
}

async function handleVoiceClick(event: Event, panel: HTMLElement) {
  const target = event.target instanceof Element
    ? event.target.closest('[data-voice-action]')
    : null;
  if (!(target instanceof HTMLButtonElement) || !panel.contains(target)) return;
  event.preventDefault();
  if (await handleLocalModelAction(panel, target)) return;
  const action = target.dataset.voiceAction;
  if (action === 'save-key') await handleKeyAction(panel, target);
  if (action === 'clear-key') await handleKeyAction(panel, target, true);
  if (action === 'test-provider') await handleTestProvider(panel, target);
  if (action === 'refresh-voices') await handleRefreshVoices(panel, target);
}

function handleVoiceSetting(event: Event, panel: HTMLElement) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return;
  if (input.matches('[data-voice-shared-provider]')) {
    setSharedVoiceProvider(input.value);
    refreshVisibility(panel);
    void hydratePpqVoiceCatalog(panel);
    void hydrateOpenRouterCatalog(panel);
    void hydrateVeniceVoiceCatalog(panel);
    return;
  }
  const setting = input.dataset.voiceSetting;
  if (!setting) return;
  const value = setting === 'providersLinked' && input instanceof HTMLInputElement
    ? !input.checked
    : input instanceof HTMLInputElement && input.type === 'checkbox'
      ? input.checked
      : input.value;
  try {
    setVoiceSetting(setting, value);
    if (setting === 'autoRead' && value === true) voicePlayer.unlock();
    refreshVisibility(panel);
    if (['outputProvider', 'outputLanguage', 'providersLinked'].includes(setting)) {
      void hydratePpqVoiceCatalog(panel, { force: setting === 'outputLanguage' });
    }
    if (setting === 'openRouterTtsModel') refreshOpenRouterVoicesFromCache(panel);
    if (['inputProvider', 'outputProvider', 'providersLinked'].includes(setting)) {
      void hydrateOpenRouterCatalog(panel);
      void hydrateVeniceVoiceCatalog(panel);
    }
    if (['localSttModel', 'localSttBackend'].includes(setting)) {
      refreshLocalModelDetails(panel, 'stt');
    }
    if (['localTtsModel', 'localTtsBackend'].includes(setting)) {
      refreshLocalModelDetails(panel, 'tts');
    }
  } catch (error) {
    showNotification(getErrorMessage(error, 'Could not save voice setting'), 'error');
  }
}

export function installVoiceSettingsPanel(root: Document | HTMLElement = document) {
  const panel = root.querySelector?.('[data-tab-panel="voice"]');
  if (!(panel instanceof HTMLElement)) return false;
  mountVoiceSettingsPanel(panel);
  if (panel.dataset.voiceDelegates !== '1') {
    panel.dataset.voiceDelegates = '1';
    panel.addEventListener('click', event => { void handleVoiceClick(event, panel); });
    panel.addEventListener('submit', event => event.preventDefault());
    panel.addEventListener('change', event => handleVoiceSetting(event, panel));
    panel.addEventListener('input', event => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.type === 'range') {
        handleVoiceSetting(event, panel);
      }
    });
  }
  if (!installedProgressListener && typeof globalThis.addEventListener === 'function') {
    installedProgressListener = true;
    globalThis.addEventListener('labcharts-voice-model-progress', event => {
      const current = document.querySelector('[data-tab-panel="voice"]');
      if (current instanceof HTMLElement) handleLocalModelProgress(event, current);
    });
    globalThis.addEventListener('labcharts-ai-settings-local-changed', () => {
      const current = document.querySelector('[data-tab-panel="voice"]');
      if (current instanceof HTMLElement) {
        refreshVisibility(current);
        void hydratePpqVoiceCatalog(current);
        void hydrateOpenRouterCatalog(current);
        void hydrateVeniceVoiceCatalog(current);
      }
    });
  }
  refreshVisibility(panel);
  // Refresh on panel hydration so a catalogue cached for an older reading
  // language cannot leave the PPQ picker showing incompatible voices.
  void hydratePpqVoiceCatalog(panel, { force: true });
  void hydrateOpenRouterCatalog(panel, { force: true });
  void hydrateVeniceVoiceCatalog(panel, { force: true });
  void verifyRenderedLocalModels(panel);
  return true;
}

export function hydrateVoiceSettingsPanel() {
  return installVoiceSettingsPanel(document);
}

export { readVoiceCatalog };
