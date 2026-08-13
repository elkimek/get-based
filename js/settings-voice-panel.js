// @ts-check
// settings-voice-panel.js — Voice settings actions and hydration.

import { getErrorMessage } from './caught-error.js';
import {
  handleLocalModelAction,
  handleLocalModelProgress,
  refreshLocalModelDetails,
  verifyRenderedLocalModels,
} from './settings-voice-model-controller.js';
import {
  renderVoiceSettingsPanel,
  voiceOptionLabel,
  voiceProviderKeyStatus,
  voiceProviderLabels,
} from './settings-voice-view.js';
import { refreshSttHardwareDescription, refreshTtsHardwareDescription } from './settings-voice-hardware.js';
import { showNotification } from './utils.js';
import { readVoiceCatalog, writeVoiceCatalog } from './voice-catalog-storage.js';
import { getLocalModel } from './voice-model-catalog.js';
import {
  getOpenRouterDefaultVoice,
  normalizeOpenRouterVoice,
  openRouterVoiceCatalogId,
  voicesForOpenRouterModel,
} from './voice-openrouter-catalog.js';
import {
  getAutomaticVoiceStatus,
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
let ppqCatalogRequest = null;
let openRouterCatalogPromise = null;
let veniceCatalogPromise = null;
const openRouterLiveModels = /** @type {{ stt: Array<any>, tts: Array<any> }} */ ({
  stt: [],
  tts: [],
});

function providerOptionsFor(provider, settings) {
  return {
    apiKey: getVoiceProviderKey(provider),
    baseUrl: settings.localServerUrl,
    language: settings.outputLanguage,
    modelId: provider === 'openrouter' ? settings.openRouterTtsModel : undefined,
  };
}

function ppqCatalogContext(providerId, settings) {
  return providerId === 'ppq'
    ? { generation: ppqCatalogGeneration, language: settings.outputLanguage }
    : null;
}

function isPpqCatalogContextCurrent(context) {
  if (!context) return true;
  const current = getVoiceSettings();
  return context.generation === ppqCatalogGeneration
    && context.language === current.outputLanguage;
}

function refreshInputLanguageControl(panel, settings) {
  const select = panel.querySelector('[data-voice-setting="inputLanguage"]');
  if (!(select instanceof HTMLSelectElement)) return;
  const model = getLocalModel('stt', settings.localSttModel);
  const lockedToEnglish = resolveVoiceProviderId('stt', settings.inputProvider) === 'browser-local'
    && !model.multilingual;
  select.disabled = lockedToEnglish;
  select.value = lockedToEnglish ? 'en' : settings.inputLanguage;
  const description = panel.querySelector('[data-voice-language-description]');
  if (description) {
    description.textContent = lockedToEnglish
      ? `${model.label} supports English only.`
      : 'Automatic detection works for most people. Choose a language if words are being misunderstood.';
  }
}

function refreshOutputLanguageControl(panel, settings) {
  const select = panel.querySelector('[data-voice-setting="outputLanguage"]');
  if (!(select instanceof HTMLSelectElement)) return;
  const local = resolveVoiceProviderId('tts', settings.outputProvider) === 'browser-local';
  select.disabled = local;
  select.value = local ? 'en' : settings.outputLanguage;
  const description = panel.querySelector('[data-voice-output-language-description]');
  if (description) {
    description.textContent = local
      ? 'The on-device voices currently read English.'
      : 'Choose the language used to read assistant replies.';
  }
}

function refreshVisibility(panel) {
  const settings = getVoiceSettings();
  const inputProvider = resolveVoiceProviderId('stt', settings.inputProvider);
  const outputProvider = resolveVoiceProviderId('tts', settings.outputProvider);
  for (const element of panel.querySelectorAll('[data-voice-visible]')) {
    const [direction, provider] = String(
      element.getAttribute('data-voice-visible') || '',
    ).split(':');
    const active = direction === 'input'
      ? inputProvider === provider
      : outputProvider === provider;
    element.toggleAttribute('hidden', !active);
  }
  for (const element of panel.querySelectorAll('[data-voice-mode]')) {
    const mode = element.getAttribute('data-voice-mode');
    element.toggleAttribute('hidden', mode === 'linked'
      ? !settings.providersLinked
      : settings.providersLinked);
  }
  const sharedSelect = panel.querySelector('[data-voice-shared-provider]');
  if (sharedSelect instanceof HTMLSelectElement) sharedSelect.value = settings.inputProvider;
  const automatic = getAutomaticVoiceStatus();
  const automaticRow = panel.querySelector('[data-voice-auto-row]');
  if (automaticRow instanceof HTMLElement) {
    automaticRow.hidden = settings.inputProvider !== 'auto' && settings.outputProvider !== 'auto';
  }
  const automaticStatus = panel.querySelector('[data-voice-auto-status]');
  if (automaticStatus instanceof HTMLElement) {
    automaticStatus.textContent = automatic.text;
    automaticStatus.dataset.state = automatic.state;
  }
  const separateToggle = panel.querySelector('[data-voice-setting="providersLinked"]');
  if (separateToggle instanceof HTMLInputElement) {
    separateToggle.checked = !settings.providersLinked;
  }
  refreshInputLanguageControl(panel, settings);
  refreshOutputLanguageControl(panel, settings);
  void refreshSttHardwareDescription(panel, settings);
  void refreshTtsHardwareDescription(panel, settings);
  const rate = panel.querySelector('#voice-rate-value');
  if (rate) rate.textContent = `${settings.rate.toFixed(2).replace(/0$/, '')}×`;
}

function setActionBusy(button, busy, label = 'Working…') {
  if (!(button instanceof HTMLButtonElement)) return;
  if (busy) {
    button.dataset.previousLabel = button.textContent || '';
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.previousLabel || button.textContent || '';
    button.disabled = false;
    delete button.dataset.previousLabel;
  }
}

function setTestStatus(panel, provider, text, isError = false) {
  const status = panel.querySelector(`[data-voice-test-status="${provider}"]`);
  if (!(status instanceof HTMLElement)) return;
  status.textContent = text;
  status.classList.toggle('error', isError);
}

async function handleKeyAction(panel, button, clear = false) {
  const provider = button.dataset.provider || '';
  const input = panel.querySelector(`[data-voice-key-input="${provider}"]`);
  if (!(input instanceof HTMLInputElement)) return;
  const value = clear ? '' : input.value.trim();
  if (!clear && !value) {
    showNotification('Enter an API key first.', 'error');
    input.focus();
    return;
  }
  setActionBusy(button, true, clear ? 'Clearing…' : 'Saving…');
  try {
    await saveVoiceProviderKey(provider, value);
    input.value = value;
    const status = panel.querySelector(`[data-voice-key-status="${provider}"]`);
    if (status) status.textContent = voiceProviderKeyStatus(provider, !!value);
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

function populateVoiceSelect(select, voices, selectedId) {
  select.replaceChildren();
  for (const voice of voices) {
    const option = document.createElement('option');
    option.value = String(voice.id || '');
    option.textContent = voiceOptionLabel(voice);
    option.selected = option.value === selectedId;
    select.appendChild(option);
  }
}

function applyVoiceCatalog(panel, providerId, voices, {
  catalogId = providerId,
  preferredVoice = '',
} = {}) {
  const rows = writeVoiceCatalog(catalogId, voices);
  const select = panel.querySelector(`[data-voice-cloud-voices="${providerId}"]`);
  if (!(select instanceof HTMLSelectElement)) return rows;
  const settingNames = {
    elevenlabs: 'elevenlabsVoice',
    openrouter: 'openRouterVoice',
    ppq: 'ppqVoice',
    venice: 'veniceVoice',
    xai: 'xaiVoice',
  };
  const settingName = settingNames[providerId];
  const settings = getVoiceSettings();
  const existing = settings[settingName];
  populateVoiceSelect(select, rows, existing);
  if (rows.length && !rows.some(voice => voice.id === existing)) {
    const replacement = rows.some(voice => voice.id === preferredVoice)
      ? preferredVoice
      : rows[0].id;
    setVoiceSetting(settingName, replacement);
    select.value = replacement;
  }
  const status = panel.querySelector(`[data-voice-catalog-status="${providerId}"]`);
  if (status) status.textContent = `${rows.length} voice${rows.length === 1 ? '' : 's'} loaded`;
  return rows;
}

function populateModelSelect(select, models, selectedId) {
  select.replaceChildren();
  for (const model of models) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.optionLabel || model.label || model.id;
    option.selected = option.value === selectedId;
    select.appendChild(option);
  }
}

function applyOpenRouterModelCatalog(panel, kind, models) {
  const select = panel.querySelector(`[data-voice-openrouter-model="${kind}"]`);
  const settingName = kind === 'stt' ? 'openRouterSttModel' : 'openRouterTtsModel';
  const existing = getVoiceSettings()[settingName];
  const rows = Array.isArray(models) ? models : [];
  if (select instanceof HTMLSelectElement) populateModelSelect(select, rows, existing);
  const selectedModel = rows.find(model => model.id === existing) || rows[0];
  if (selectedModel && selectedModel.id !== existing) {
    setVoiceSetting(settingName, selectedModel.id);
    if (select instanceof HTMLSelectElement) select.value = selectedModel.id;
  }
  return selectedModel;
}

function applyOpenRouterVoices(panel, model) {
  if (!model) return [];
  return applyVoiceCatalog(panel, 'openrouter', voicesForOpenRouterModel(model), {
    catalogId: openRouterVoiceCatalogId(model.id),
    preferredVoice: getOpenRouterDefaultVoice(model.id),
  });
}

function refreshOpenRouterVoicesFromCache(panel) {
  const settings = getVoiceSettings();
  const model = openRouterLiveModels.tts.find(row => row.id === settings.openRouterTtsModel);
  return model ? applyOpenRouterVoices(panel, model) : [];
}

async function hydrateOpenRouterCatalog(panel, { force = false } = {}) {
  const settings = getVoiceSettings();
  const usesStt = resolveVoiceProviderId('stt', settings.inputProvider) === 'openrouter';
  const usesTts = resolveVoiceProviderId('tts', settings.outputProvider) === 'openrouter';
  if ((!usesStt && !usesTts) || !hasVoiceProviderKey('openrouter')) return [];
  if (!force && (!usesStt || openRouterLiveModels.stt.length)
    && (!usesTts || openRouterLiveModels.tts.length)) {
    const selected = usesTts
      ? applyOpenRouterModelCatalog(panel, 'tts', openRouterLiveModels.tts)
      : null;
    if (usesStt) applyOpenRouterModelCatalog(panel, 'stt', openRouterLiveModels.stt);
    return selected ? applyOpenRouterVoices(panel, selected) : [];
  }
  if (openRouterCatalogPromise) return openRouterCatalogPromise;
  const status = panel.querySelector('[data-voice-catalog-status="openrouter"]');
  if (status) status.textContent = 'Loading models and voices…';
  openRouterCatalogPromise = loadVoiceProvider('openrouter')
    .then(async provider => {
      const [sttModels, ttsModels] = await Promise.all([
        usesStt ? provider.listModels('stt', providerOptionsFor('openrouter', settings)) : [],
        usesTts ? provider.listModels('tts', providerOptionsFor('openrouter', settings)) : [],
      ]);
      if (usesStt && !sttModels.length) throw new Error('No curated OpenRouter transcription models are currently available.');
      if (usesTts && !ttsModels.length) throw new Error('No curated OpenRouter speech models are currently available.');
      if (usesStt) openRouterLiveModels.stt = sttModels;
      if (usesTts) openRouterLiveModels.tts = ttsModels;
      if (usesStt) applyOpenRouterModelCatalog(panel, 'stt', sttModels);
      const selected = usesTts ? applyOpenRouterModelCatalog(panel, 'tts', ttsModels) : null;
      return selected ? applyOpenRouterVoices(panel, selected) : [];
    })
    .catch(error => {
      if (status) status.textContent = getErrorMessage(error, 'Could not load OpenRouter voice options');
      if (usesTts) {
        const modelId = settings.openRouterTtsModel;
        const fallbackVoices = [getOpenRouterDefaultVoice(modelId)].filter(Boolean);
        return applyVoiceCatalog(
          panel,
          'openrouter',
          fallbackVoices.map(voice => normalizeOpenRouterVoice(modelId, voice)),
          {
            catalogId: openRouterVoiceCatalogId(modelId),
            preferredVoice: getOpenRouterDefaultVoice(modelId),
          },
        );
      }
      return [];
    })
    .finally(() => { openRouterCatalogPromise = null; });
  return openRouterCatalogPromise;
}

async function hydratePpqVoiceCatalog(panel, { force = false } = {}) {
  const settings = getVoiceSettings();
  if (
    resolveVoiceProviderId('tts', settings.outputProvider) !== 'ppq'
    || !hasVoiceProviderKey('ppq')
    || (!force && readVoiceCatalog('ppq').length)
  ) {
    return [];
  }
  if (ppqCatalogRequest && !force) return ppqCatalogRequest.promise;
  if (ppqCatalogRequest) ppqCatalogRequest.controller.abort();
  const generation = ++ppqCatalogGeneration;
  const controller = new AbortController();
  const requestedLanguage = settings.outputLanguage;
  const status = panel.querySelector('[data-voice-catalog-status="ppq"]');
  if (status) status.textContent = 'Loading voices…';
  const promise = loadVoiceProvider('ppq')
    .then(provider => {
      if (typeof provider.listVoices !== 'function') {
        throw new Error('PPQ does not expose a compatible voice catalogue.');
      }
      return provider.listVoices({
        ...providerOptionsFor('ppq', settings),
        signal: controller.signal,
      });
    })
    .then(voices => {
      const current = getVoiceSettings();
      if (
        generation !== ppqCatalogGeneration
        || resolveVoiceProviderId('tts', current.outputProvider) !== 'ppq'
        || current.outputLanguage !== requestedLanguage
      ) {
        return [];
      }
      if (!voices.length) throw new Error('PPQ returned no compatible voices.');
      return applyVoiceCatalog(panel, 'ppq', voices);
    })
    .catch(error => {
      if (generation !== ppqCatalogGeneration || controller.signal.aborted) return [];
      if (status) status.textContent = getErrorMessage(error, 'Could not load PPQ voices');
      return [];
    })
    .finally(() => {
      if (ppqCatalogRequest?.generation === generation) ppqCatalogRequest = null;
    });
  ppqCatalogRequest = { generation, controller, promise };
  return promise;
}

async function hydrateVeniceVoiceCatalog(panel, { force = false } = {}) {
  const settings = getVoiceSettings();
  if (
    resolveVoiceProviderId('tts', settings.outputProvider) !== 'venice'
    || !hasVoiceProviderKey('venice')
    || (!force && readVoiceCatalog('venice').length)
  ) {
    return [];
  }
  if (veniceCatalogPromise) return veniceCatalogPromise;
  const status = panel.querySelector('[data-voice-catalog-status="venice"]');
  if (status) status.textContent = 'Loading private Kokoro voices…';
  veniceCatalogPromise = loadVoiceProvider('venice')
    .then(provider => {
      if (typeof provider.listVoices !== 'function') {
        throw new Error('Venice does not expose a compatible voice catalogue.');
      }
      return provider.listVoices(providerOptionsFor('venice', settings));
    })
    .then(voices => {
      if (!voices.length) throw new Error('Venice returned no Kokoro voices.');
      return applyVoiceCatalog(panel, 'venice', voices, { preferredVoice: 'af_sky' });
    })
    .catch(error => {
      if (status) status.textContent = getErrorMessage(error, 'Could not load Venice voices');
      return [];
    })
    .finally(() => { veniceCatalogPromise = null; });
  return veniceCatalogPromise;
}

async function handleTestProvider(panel, button) {
  const providerId = button.dataset.provider || 'browser-local';
  const settings = getVoiceSettings();
  const catalogContext = ppqCatalogContext(providerId, settings);
  setActionBusy(button, true, 'Testing…');
  setTestStatus(panel, providerId, 'Connecting…');
  try {
    const provider = await loadVoiceProvider(providerId);
    const result = await provider.testConnection(
      providerOptionsFor(providerId, settings),
    );
    if (
      Array.isArray(result.voices)
      && result.voices.length
      && ['xai', 'elevenlabs', 'openrouter', 'ppq', 'venice'].includes(providerId)
      && isPpqCatalogContextCurrent(catalogContext)
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
    setTestStatus(panel, providerId, result.message || 'Connected.');
  } catch (error) {
    setTestStatus(panel, providerId, getErrorMessage(error, 'Connection failed'), true);
  } finally {
    setActionBusy(button, false);
  }
}

async function handleRefreshVoices(panel, button) {
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
  const catalogContext = ppqCatalogContext(providerId, settings);
  setActionBusy(button, true, 'Refreshing…');
  try {
    const provider = await loadVoiceProvider(providerId);
    if (typeof provider.listVoices !== 'function') {
      throw new Error(`${voiceProviderLabels[providerId] || providerId} does not expose a voice catalogue.`);
    }
    const voices = await provider.listVoices(
      providerOptionsFor(providerId, settings),
    );
    if (!isPpqCatalogContextCurrent(catalogContext)) return;
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

async function handleVoiceClick(event, panel) {
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

function handleVoiceSetting(event, panel) {
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

/** @param {Document | HTMLElement} [root] */
export function installVoiceSettingsPanel(root = document) {
  const panel = root.querySelector?.('[data-tab-panel="voice"]');
  if (!(panel instanceof HTMLElement)) return false;
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
