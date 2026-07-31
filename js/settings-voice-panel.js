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

function providerOptionsFor(provider, settings) {
  return {
    apiKey: getVoiceProviderKey(provider),
    baseUrl: settings.localServerUrl,
  };
}

function refreshInputLanguageControl(panel, settings) {
  const select = panel.querySelector('[data-voice-setting="inputLanguage"]');
  if (!(select instanceof HTMLSelectElement)) return;
  const model = getLocalModel('stt', settings.localSttModel);
  const lockedToEnglish = settings.inputProvider === 'browser-local'
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
  const local = settings.outputProvider === 'browser-local';
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
  for (const element of panel.querySelectorAll('[data-voice-visible]')) {
    const [direction, provider] = String(
      element.getAttribute('data-voice-visible') || '',
    ).split(':');
    const active = direction === 'input'
      ? settings.inputProvider === provider
      : settings.outputProvider === provider;
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

function applyVoiceCatalog(panel, providerId, voices) {
  const rows = writeVoiceCatalog(providerId, voices);
  const select = panel.querySelector(`[data-voice-cloud-voices="${providerId}"]`);
  if (!(select instanceof HTMLSelectElement)) return rows;
  const settingName = providerId === 'xai' ? 'xaiVoice' : 'elevenlabsVoice';
  const settings = getVoiceSettings();
  const existing = providerId === 'xai' ? settings.xaiVoice : settings.elevenlabsVoice;
  populateVoiceSelect(select, rows, existing);
  if (rows.length && !rows.some(voice => voice.id === existing)) {
    setVoiceSetting(settingName, rows[0].id);
    select.value = rows[0].id;
  }
  const status = panel.querySelector(`[data-voice-catalog-status="${providerId}"]`);
  if (status) status.textContent = `${rows.length} voice${rows.length === 1 ? '' : 's'} loaded`;
  return rows;
}

async function handleTestProvider(panel, button) {
  const providerId = button.dataset.provider || 'browser-local';
  setActionBusy(button, true, 'Testing…');
  setTestStatus(panel, providerId, 'Connecting…');
  try {
    const provider = await loadVoiceProvider(providerId);
    const result = await provider.testConnection(
      providerOptionsFor(providerId, getVoiceSettings()),
    );
    if (
      Array.isArray(result.voices)
      && result.voices.length
      && ['xai', 'elevenlabs'].includes(providerId)
    ) {
      applyVoiceCatalog(panel, providerId, result.voices);
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
      `Save a ${voiceProviderLabels[providerId] || providerId} API key first.`,
      'error',
    );
    return;
  }
  setActionBusy(button, true, 'Refreshing…');
  try {
    const provider = await loadVoiceProvider(providerId);
    const voices = await provider.listVoices(
      providerOptionsFor(providerId, getVoiceSettings()),
    );
    if (!voices.length) throw new Error('The provider returned no voices.');
    applyVoiceCatalog(panel, providerId, voices);
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
  }
  refreshVisibility(panel);
  void verifyRenderedLocalModels(panel);
  return true;
}

export function hydrateVoiceSettingsPanel() {
  return installVoiceSettingsPanel(document);
}

export { readVoiceCatalog };
