import type { VoiceKind } from '../types/voice-local.js';
import type { VoiceListEntry } from '../types/voice-provider.js';
type VoiceSettings = ReturnType<typeof getVoiceSettings>;
type VoiceModelOption = { id: string; label: string; optionLabel?: string };

// settings-voice-view.js — Voice settings markup without action side effects.

import {
  renderSttHardwareRow,
  renderTtsHardwareRow,
} from './settings-voice-hardware.js';
import { localModelUiStatus } from './settings-voice-model-controller.js';
import { escapeAttr, escapeHTML } from './utils.js';
import { readVoiceCatalog } from './voice-catalog-storage.js';
import {
  isLocalVoiceModelReady,
} from './voice-local-engine.js';
import {
  KOKORO_VOICES,
  LOCAL_STT_MODELS,
  VOICE_LANGUAGES,
  getLocalModel,
  getLocalModelStorageCopy,
} from './voice-model-catalog.js';
import {
  openRouterVoiceCatalogId,
} from './voice-openrouter-catalog.js';
import { getAutomaticVoiceStatus, resolveVoiceProviderId } from './voice-ai-provider.js';
import {
  VOICE_PROVIDERS,
  getSharedVoiceProviders,
  getVoiceProvidersFor,
} from './voice-provider-catalog.js';
import {
  getVoiceProviderKey,
  getVoiceSettings,
  hasVoiceProviderKey,
} from './voice-settings-storage.js';

function selected(value: unknown, expected: unknown) {
  return value === expected ? ' selected' : '';
}

function providerOptions(value: string, kind = 'shared') {
  const providers = kind === 'shared'
    ? getSharedVoiceProviders()
    : getVoiceProvidersFor(kind);
  return providers.map(provider => {
    const label = provider.id === 'auto'
      ? 'Automatic'
      : provider.credentialSource === 'ai'
        ? `${provider.label} (AI connection)`
        : provider.privacy === 'cloud'
          ? `${provider.label} (cloud)`
      : provider.id === 'local-server'
        ? 'Local server'
        : provider.label;
    return `<option value="${provider.id}"${selected(value, provider.id)}>${escapeHTML(label)}</option>`;
  }).join('');
}

function languageOptions(value: string, { includeAuto = true } = {}) {
  return VOICE_LANGUAGES
    .filter(language => includeAuto || language.id !== 'auto')
    .map(language => (
      `<option value="${language.id}"${selected(value, language.id)}>${escapeHTML(language.label)}</option>`
    )).join('');
}

function modelOptions(models: readonly VoiceModelOption[], value: string) {
  return models.map(model => (
    `<option value="${escapeAttr(model.id)}"${selected(value, model.id)}>${escapeHTML(model.optionLabel || model.label)}</option>`
  )).join('');
}

function localVoiceOptions(value: string) {
  const renderGroup = (label: string, voices: readonly (typeof KOKORO_VOICES)[number][]) => `
    <optgroup label="${label}">
      ${voices.map(voice => (
        `<option value="${voice.id}"${selected(value, voice.id)}>${escapeHTML(voice.name)} · ${escapeHTML(voice.language)}</option>`
      )).join('')}
    </optgroup>`;
  return [
    renderGroup('Female voices', KOKORO_VOICES.filter(voice => voice.gender === 'Female')),
    renderGroup('Male voices', KOKORO_VOICES.filter(voice => voice.gender === 'Male')),
  ].join('');
}

export function voiceOptionLabel(voice: VoiceListEntry) {
  return [
    voice.name || voice.id,
    voice.language,
    voice.descriptor || voice.gender,
  ].filter(Boolean).join(' · ');
}

function cloudVoiceOptions(provider: string, selectedId: string) {
  const voices = readVoiceCatalog(provider);
  const selectedVoice = voices.find(voice => voice.id === selectedId);
  const fallback = selectedId && !selectedVoice
    ? `<option value="${escapeAttr(selectedId)}" selected>${provider === 'xai' && selectedId === 'eve'
      ? 'Eve · built-in voice'
      : 'Saved voice · refresh to load its name'}</option>`
    : '';
  const placeholder = !selectedId && !voices.length
    ? '<option value="">Refresh to load voices</option>'
    : '';
  return `${fallback}${placeholder}${voices.map(voice => (
    `<option value="${escapeAttr(voice.id)}"${selected(selectedId, voice.id)}>${escapeHTML(voiceOptionLabel(voice))}</option>`
  )).join('')}`;
}

export function voiceProviderKeyStatus(provider: string, configured = hasVoiceProviderKey(provider)) {
  if (!configured) return 'Not configured';
  return provider === 'local-server'
    ? 'Saved securely on this device'
    : 'Saved encrypted in this browser · included in encrypted sync when enabled';
}

// Keep title, attributes, then description evaluation in the markup's original order.
function renderVoiceCopy(title: string, descriptionAttributes: string, description: string, padding = '        ') {
  return `<div class="settings-copy">
${padding}  <div class="settings-copy-title">${title}</div>
${padding}  <div class="settings-copy-desc"${descriptionAttributes}>${description}</div>
${padding}</div>`;
}

function renderProviderNotice() {
  return `
    <div class="settings-row voice-overview">
      <div class="settings-section">
        <div class="settings-action-row">
          ${renderVoiceCopy(`Voice can stay on this device`, ``, `Choose On this device to keep recordings and reply text in this browser. Automatic can reuse a voice-capable direct AI provider, but stays on this device during CLI chat unless you explicitly choose another voice service.`, "          ")}
        </div>
      </div>
    </div>`;
}

function renderServiceSection(settings: VoiceSettings) {
  const automatic = getAutomaticVoiceStatus();
  return `
    <div class="settings-group-title">Service</div>
    <div class="settings-row voice-settings-list voice-service-card">
      <div class="settings-section voice-setting-row" data-voice-mode="linked">
        ${renderVoiceCopy(`Default speech service`, ``, `Used for both STT and TTS unless you separate them below.`)}
        <label class="voice-control">
          <span class="sr-only">Voice service</span>
          <select class="api-key-input" data-voice-shared-provider>
            ${providerOptions(settings.inputProvider)}
          </select>
        </label>
      </div>
      <div class="settings-section voice-setting-row" data-voice-auto-row${settings.inputProvider === 'auto' || settings.outputProvider === 'auto' ? '' : ' hidden'}>
        ${renderVoiceCopy(`Automatic provider`, ` data-voice-auto-status data-state="${automatic.state}"`, `${escapeHTML(automatic.text)}`)}
        <button type="button" class="settings-link-btn" data-settings-tab="ai">AI settings</button>
      </div>
      <div class="settings-section">
        <div class="settings-action-row">
          ${renderVoiceCopy(`Use separate STT and TTS services`, ``, `For example, keep dictation on-device while using a cloud voice.`, "          ")}
          <label class="toggle-switch">
            <input type="checkbox" data-voice-setting="providersLinked"
              aria-label="Use separate speech-to-text and text-to-speech services"${settings.providersLinked ? '' : ' checked'}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>`;
}

function renderInputSection(settings: VoiceSettings) {
  const inputProvider = resolveVoiceProviderId('stt', settings.inputProvider);
  const localSttModel = getLocalModel('stt', settings.localSttModel);
  const locksLanguage = inputProvider === 'browser-local'
    && !localSttModel.multilingual;
  const selectedLanguage = locksLanguage ? 'en' : settings.inputLanguage;
  return `
    <section class="voice-task-block" aria-labelledby="voice-stt-heading">
      <header class="voice-task-heading">
        <h3 id="voice-stt-heading">Speech-to-text <span>STT</span></h3>
        <p>Dictation: turns what you say into text.</p>
      </header>
    <div class="settings-row voice-settings-list voice-task-card">
      <div class="settings-section voice-setting-row" data-voice-mode="separate">
        ${renderVoiceCopy(`STT service`, ``, `Service used for dictation.`)}
        <label class="voice-control">
          <span class="sr-only">Dictation service</span>
          <select class="api-key-input" data-voice-setting="inputProvider">
            ${providerOptions(settings.inputProvider, 'stt')}
          </select>
        </label>
      </div>
      <div class="settings-section voice-setting-row">
        ${renderVoiceCopy(`Spoken language`, ` data-voice-language-description`, `${locksLanguage
            ? `${escapeHTML(localSttModel.label)} supports English only.`
            : 'Automatic detection works for most people. Choose a language if words are being misunderstood.'}`)}
        <label class="voice-control">
          <span class="sr-only">Spoken language</span>
          <select class="api-key-input" data-voice-setting="inputLanguage"${locksLanguage ? ' disabled' : ''}>
            ${languageOptions(selectedLanguage)}
          </select>
        </label>
      </div>
      <div class="settings-section voice-setting-row" data-voice-visible="input:browser-local">
        ${renderVoiceCopy(`Whisper model`, ``, `Small is fastest. Medium adds accuracy with a smaller download than Large; actual speed depends on your processor.`)}
        <label class="voice-control">
          <span class="sr-only">Transcription quality and speed</span>
          <select class="api-key-input" data-voice-setting="localSttModel">
            ${modelOptions(LOCAL_STT_MODELS, settings.localSttModel)}
          </select>
        </label>
      </div>
      <div class="settings-section voice-setting-row" data-voice-visible="input:openrouter">
        ${renderVoiceCopy(`Transcription model`, ``, `Accurate multilingual transcription routed through OpenRouter.`)}
        <span class="voice-control" data-voice-openrouter-model-label="stt">Whisper Large V3</span>
      </div>
      <div class="settings-section voice-setting-row" data-voice-visible="input:venice">
        ${renderVoiceCopy(`Transcription model`, ``, `Private, zero-retention transcription through Venice's audio API. If latency matters, use different services and choose OpenRouter for dictation.`)}
        <span class="voice-control">Whisper Large V3</span>
      </div>
      ${renderSttHardwareRow(settings)}
      ${renderLocalModelRow('stt', localSttModel, settings)}
      <div class="settings-section voice-setting-row" data-voice-visible="input:local-server">
        ${renderVoiceCopy(`Transcription model`, ``, `The model name expected by your server, such as whisper-1.`)}
        <label class="voice-control">
          <span class="sr-only">Transcription server model</span>
          <input class="api-key-input" value="${escapeAttr(settings.localServerSttModel)}"
            data-voice-setting="localServerSttModel" autocomplete="off" spellcheck="false">
        </label>
      </div>
    </div>
    </section>`;
}

function renderOutputSection(settings: VoiceSettings) {
  const outputProvider = resolveVoiceProviderId('tts', settings.outputProvider);
  const localOutput = outputProvider === 'browser-local';
  const xaiCatalogCount = readVoiceCatalog('xai').length;
  const ppqCatalogCount = readVoiceCatalog('ppq').length;
  const elevenCatalogCount = readVoiceCatalog('elevenlabs').length;
  const openRouterCatalogId = openRouterVoiceCatalogId(settings.openRouterTtsModel);
  const openRouterCatalogCount = readVoiceCatalog(openRouterCatalogId).length;
  const veniceCatalogCount = readVoiceCatalog('venice').length;
  return `
    <section class="voice-task-block" aria-labelledby="voice-tts-heading">
      <header class="voice-task-heading">
        <h3 id="voice-tts-heading">Text-to-speech <span>TTS</span></h3>
        <p>Listening: turns assistant replies into audio.</p>
      </header>
    <div class="settings-row voice-settings-list voice-task-card">
      <div class="settings-section voice-setting-row" data-voice-mode="separate">
        ${renderVoiceCopy(`TTS service`, ``, `Service used to read replies.`)}
        <label class="voice-control">
          <span class="sr-only">Spoken replies service</span>
          <select class="api-key-input" data-voice-setting="outputProvider">
            ${providerOptions(settings.outputProvider, 'tts')}
          </select>
        </label>
      </div>
      <div class="settings-section voice-setting-row" data-voice-output-language-row${localOutput ? ' hidden' : ''}>
        ${renderVoiceCopy(`Reading language`, ` data-voice-output-language-description`, `${localOutput
            ? 'The on-device voices currently read English.'
            : 'Choose the language used to read assistant replies.'}`)}
        <label class="voice-control">
          <span class="sr-only">Reading language</span>
          <select class="api-key-input" data-voice-setting="outputLanguage"${localOutput ? ' disabled' : ''}>
            ${languageOptions(localOutput ? 'en' : settings.outputLanguage, { includeAuto: false })}
          </select>
        </label>
      </div>
      <div class="settings-section voice-setting-row" data-voice-visible="output:browser-local">
        ${renderVoiceCopy(`Voice`, ``, `Choose a female or male voice with an American or British accent.`)}
        <label class="voice-control">
          <span class="sr-only">Voice</span>
          <select class="api-key-input" data-voice-setting="localVoice">
            ${localVoiceOptions(settings.localVoice)}
          </select>
        </label>
      </div>
      ${renderTtsHardwareRow(settings)}
      ${renderLocalModelRow('tts', getLocalModel('tts', settings.localTtsModel), settings)}
      <div class="settings-section voice-setting-row" data-voice-visible="output:local-server">
        ${renderVoiceCopy(`Speech model`, ``, `The model name expected by your server.`)}
        <label class="voice-control">
          <span class="sr-only">Speech server model</span>
          <input class="api-key-input" value="${escapeAttr(settings.localServerTtsModel)}"
            data-voice-setting="localServerTtsModel" autocomplete="off" spellcheck="false">
        </label>
      </div>
      <div class="settings-section voice-setting-row" data-voice-visible="output:local-server">
        ${renderVoiceCopy(`Server voice`, ``, `Voice identifier understood by your local server.`)}
        <label class="voice-control">
          <span class="sr-only">Server voice</span>
          <input class="api-key-input" value="${escapeAttr(settings.localServerVoice)}"
            data-voice-setting="localServerVoice" autocomplete="off" spellcheck="false">
        </label>
      </div>
      ${renderCloudVoiceRow('xai', 'xAI voice', settings.xaiVoice, xaiCatalogCount)}
      ${renderCloudVoiceRow(
        'elevenlabs',
        'ElevenLabs voice',
        settings.elevenlabsVoice,
        elevenCatalogCount,
      )}
      ${renderCloudVoiceRow('ppq', 'PPQ voice', settings.ppqVoice, ppqCatalogCount)}
      <div class="settings-section voice-setting-row" data-voice-visible="output:openrouter">
        ${renderVoiceCopy(`Speech model`, ``, `Reliable cloud speech routed through OpenRouter, without a local model download.`)}
        <span class="voice-control" data-voice-openrouter-model-label="tts">Kokoro 82M</span>
      </div>
      ${renderCloudVoiceRow(
        'openrouter',
        'Voice through OpenRouter',
        settings.openRouterVoice,
        openRouterCatalogCount,
        openRouterCatalogId,
        'Choose a cloud Kokoro voice. The model runs remotely, so no download or local inference is needed.',
      )}
      <div class="settings-section voice-setting-row" data-voice-visible="output:venice">
        ${renderVoiceCopy(`Speech model`, ``, `Private, zero-retention speech through Venice's audio API, separate from chat E2EE.`)}
        <span class="voice-control">Kokoro 82M</span>
      </div>
      ${renderCloudVoiceRow(
        'venice',
        'Venice Kokoro voice',
        settings.veniceVoice,
        veniceCatalogCount,
        'venice',
        'Choose from the private Kokoro voices available with your Venice connection.',
      )}
      <div class="settings-section voice-setting-row">
        ${renderVoiceCopy(`Speaking speed <output id="voice-rate-value">${settings.rate.toFixed(2).replace(/0$/, '')}×</output>`, ``, `Adjust how quickly replies are read aloud.`)}
        <label class="voice-control voice-rate-field">
          <span class="sr-only">Speaking speed</span>
          <input type="range" min="0.5" max="2" step="0.05" value="${settings.rate}" data-voice-setting="rate">
        </label>
      </div>
      <div class="settings-section">
        <div class="settings-action-row">
          ${renderVoiceCopy(`Read new replies automatically`, ``, `Works while chat is open. You can stop playback at any time.`, "          ")}
          <label class="toggle-switch">
            <input type="checkbox" aria-label="Read new replies automatically" data-voice-setting="autoRead"${settings.autoRead ? ' checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
    </section>`;
}

function renderCloudVoiceRow(
  provider: string,
  title: string,
  value: string,
  catalogCount: number,
  catalogId = provider,
  description = 'Choose from the voices available with your connection.',
) {
  const settingNames: Record<string, string | undefined> = {
    elevenlabs: 'elevenlabsVoice',
    openrouter: 'openRouterVoice',
    ppq: 'ppqVoice',
    venice: 'veniceVoice',
    xai: 'xaiVoice',
  };
  return `
    <div class="settings-section voice-setting-row" data-voice-visible="output:${provider}">
      ${renderVoiceCopy(`${title}`, ``, `${escapeHTML(description)}`, "      ")}
      <div class="voice-control-stack">
        <label class="voice-control">
          <span class="sr-only">${title}</span>
          <select class="api-key-input" data-voice-cloud-voices="${provider}"
            data-voice-setting="${settingNames[provider]}">
            ${cloudVoiceOptions(catalogId, value)}
          </select>
        </label>
        <button type="button" class="settings-link-btn voice-inline-action"
          data-voice-action="refresh-voices" data-provider="${provider}">Refresh voices</button>
        <small class="voice-catalog-status" data-voice-catalog-status="${provider}">${catalogCount
          ? `${catalogCount} voices loaded`
          : ''}</small>
      </div>
    </div>`;
}

function renderLocalModelRow(kind: VoiceKind, model: ReturnType<typeof getLocalModel>, settings: VoiceSettings) {
  const backend = kind === 'tts' ? settings.localTtsBackend : settings.localSttBackend;
  const ready = isLocalVoiceModelReady(kind, model.id, backend);
  const direction = kind === 'tts' ? 'output' : 'input';
  return `
    <div class="settings-section voice-model-row" data-voice-visible="${direction}:browser-local"
      data-voice-model-kind="${kind}">
      ${renderVoiceCopy(`${escapeHTML(model.label)}`, ``, `${escapeHTML(getLocalModelStorageCopy(kind, model.id, backend))}</div>
        <div class="voice-model-state" data-state="${ready ? 'ready' : 'missing'}"
          data-voice-model-status="${kind}">${localModelUiStatus(kind, model.id)}</div>
        <div class="voice-model-progress" hidden data-voice-model-progress="${kind}">
          <div class="voice-model-progress-track" role="progressbar"
            aria-label="${escapeAttr(model.label)} download progress"><span></span></div>
          <small>Preparing model…</small>
        `, "      ")}
      <div class="voice-model-actions">
        <button type="button" class="import-btn settings-mini-btn"
          data-voice-action="install-model" data-kind="${kind}"${ready ? ' disabled' : ''}>${ready ? 'Ready' : 'Download'}</button>
        <button type="button" class="settings-link-btn"
          data-voice-action="remove-model" data-kind="${kind}"${ready ? '' : ' disabled'}>Remove files</button>
      </div>
    </div>`;
}

function renderConnectionCard(provider: string, title: string, description: string, settings: VoiceSettings) {
  const isServer = provider === 'local-server';
  const keyLabel = isServer ? 'Optional server API key' : `${title} API key`;
  const docsLink = provider === 'xai'
    ? 'https://console.x.ai/'
    : provider === 'elevenlabs'
      ? 'https://elevenlabs.io/app/settings/api-keys'
      : '';
  return `
    <div class="settings-section">
      <details class="voice-connection-card" data-voice-connection="${provider}">
        <summary>
          <span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(description)}</small></span>
          <em data-voice-key-status="${provider}">${escapeHTML(voiceProviderKeyStatus(provider))}</em>
        </summary>
        <form class="voice-connection-body" data-voice-connection-form="${provider}">
          <input type="text" name="voice-provider" value="${provider}" autocomplete="username" hidden>
          ${isServer ? `
            <label class="voice-field">
              <span>Server URL</span>
              <input type="url" class="api-key-input" value="${escapeAttr(settings.localServerUrl)}"
                placeholder="http://127.0.0.1:8000" data-voice-setting="localServerUrl"
                autocomplete="url" spellcheck="false">
              <small>Connects directly from this browser. The URL and optional key stay on this device.</small>
            </label>` : `
            <p class="voice-cloud-disclosure">Connects directly from this browser to ${escapeHTML(title)}. Your key is sent only to that provider for its requests.</p>`}
          <label class="voice-field">
            <span>${escapeHTML(keyLabel)}</span>
            <input type="password" class="api-key-input" data-voice-key-input="${provider}"
              value="${escapeAttr(getVoiceProviderKey(provider))}" placeholder="Paste key"
              autocomplete="new-password" autocapitalize="none" spellcheck="false">
          </label>
          <div class="voice-connection-actions">
            <button type="button" class="import-btn" data-voice-action="save-key"
              data-provider="${provider}">Save key</button>
            <button type="button" class="settings-link-btn" data-voice-action="clear-key"
              data-provider="${provider}">Clear</button>
            <button type="button" class="settings-link-btn" data-voice-action="test-provider"
              data-provider="${provider}">Test connection</button>
            ${docsLink ? `<a class="settings-link-btn" href="${docsLink}" target="_blank" rel="noopener">Create key ↗</a>` : ''}
          </div>
          <div class="voice-test-status" role="status" aria-live="polite"
            data-voice-test-status="${provider}"></div>
        </form>
      </details>
    </div>`;
}

function renderConnections(settings: VoiceSettings) {
  return `
    <details class="voice-advanced-connections">
      <summary>
        <span><strong>Advanced connections</strong><small>Local server and direct provider keys</small></span>
      </summary>
    <div class="settings-row voice-connections">
      <div class="settings-section">
        <div class="settings-action-row">
          ${renderVoiceCopy(`AI provider connections`, ``, `PPQ, OpenRouter, and Venice reuse the encrypted connection from AI settings and receive compatible voice requests directly from this browser. Routstr voice is not live yet and falls back to this device.`, "          ")}
          <button type="button" class="settings-link-btn" data-settings-tab="ai">Manage</button>
        </div>
      </div>
      ${renderConnectionCard(
        'local-server',
        'OpenAI-compatible local server',
        'Whisper.cpp, LocalAI, Speaches, or another compatible app',
        settings,
      )}
      ${renderConnectionCard('xai', 'xAI', 'Cloud transcription and speech with your own key', settings)}
      ${renderConnectionCard('elevenlabs', 'ElevenLabs', 'Scribe transcription and multilingual voices', settings)}
    </div>
    </details>`;
}

export function renderVoiceSettingsPanel(active = false) {
  const settings = getVoiceSettings();
  return `
    <div class="settings-tab-panel${active ? ' active' : ''}" data-tab-panel="voice" id="settings-tab-voice" role="tabpanel" aria-label="Voice">
      ${renderProviderNotice()}
      ${renderServiceSection(settings)}
      ${renderInputSection(settings)}
      ${renderOutputSection(settings)}
      ${renderConnections(settings)}
    </div>`;
}

export const voiceProviderLabels = Object.freeze(Object.fromEntries(
  VOICE_PROVIDERS.map(provider => [provider.id, provider.label]),
));
