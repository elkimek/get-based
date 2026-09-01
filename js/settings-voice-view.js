// @ts-check
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
  preferredLocalVoiceBackend,
} from './voice-local-engine.js';
import {
  KOKORO_VOICES,
  LOCAL_STT_MODELS,
  VOICE_LANGUAGES,
  getLocalModel,
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

function selected(value, expected) {
  return value === expected ? ' selected' : '';
}

function providerOptions(value, kind = 'shared') {
  const providers = kind === 'shared'
    ? getSharedVoiceProviders()
    : getVoiceProvidersFor(kind);
  return providers.map(provider => {
    const label = provider.id === 'auto'
      ? 'Same as chat (automatic)'
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

function languageOptions(value, { includeAuto = true } = {}) {
  return VOICE_LANGUAGES
    .filter(language => includeAuto || language.id !== 'auto')
    .map(language => (
      `<option value="${language.id}"${selected(value, language.id)}>${escapeHTML(language.label)}</option>`
    )).join('');
}

function modelOptions(models, value) {
  return models.map(model => (
    `<option value="${escapeAttr(model.id)}"${selected(value, model.id)}>${escapeHTML(model.optionLabel || model.label)}</option>`
  )).join('');
}

function localVoiceOptions(value) {
  const renderGroup = (label, voices) => `
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

export function voiceOptionLabel(voice) {
  return [
    voice.name || voice.id,
    voice.language,
    voice.descriptor || voice.gender,
  ].filter(Boolean).join(' · ');
}

function cloudVoiceOptions(provider, selectedId) {
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

export function voiceProviderKeyStatus(provider, configured = hasVoiceProviderKey(provider)) {
  if (!configured) return 'Not configured';
  return provider === 'local-server'
    ? 'Saved securely on this device'
    : 'Saved encrypted in this browser · included in encrypted sync when enabled';
}

function renderProviderNotice() {
  return `
    <div class="settings-row voice-overview">
      <div class="settings-section">
        <div class="settings-action-row">
          <div class="settings-copy">
            <div class="settings-copy-title">Private by default</div>
            <div class="settings-copy-desc">Choose On this device to keep recordings and messages in this browser. Automatic follows your AI provider when it supports voice; other services receive only what you ask them to process.</div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderServiceSection(settings) {
  const automatic = getAutomaticVoiceStatus();
  return `
    <div class="settings-group-title">Voice service</div>
    <div class="settings-row voice-settings-list">
      <div class="settings-section voice-setting-row" data-voice-mode="linked">
        <div class="settings-copy">
          <div class="settings-copy-title">Where voice is processed</div>
          <div class="settings-copy-desc">Choose one service for dictation and spoken replies.</div>
        </div>
        <label class="voice-control">
          <span class="sr-only">Voice service</span>
          <select class="api-key-input" data-voice-shared-provider>
            ${providerOptions(settings.inputProvider)}
          </select>
        </label>
      </div>
      <div class="settings-section voice-setting-row" data-voice-auto-row${settings.inputProvider === 'auto' || settings.outputProvider === 'auto' ? '' : ' hidden'}>
        <div class="settings-copy">
          <div class="settings-copy-title">Automatic provider</div>
          <div class="settings-copy-desc" data-voice-auto-status data-state="${automatic.state}">${escapeHTML(automatic.text)}</div>
        </div>
        <button type="button" class="settings-link-btn" data-settings-tab="ai">AI settings</button>
      </div>
      <div class="settings-section">
        <div class="settings-action-row">
          <div class="settings-copy">
            <div class="settings-copy-title">Use different services for dictation and listening</div>
            <div class="settings-copy-desc">Useful when you want private on-device dictation with a different voice for spoken replies.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-voice-setting="providersLinked"
              aria-label="Use different services for dictation and listening"${settings.providersLinked ? '' : ' checked'}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>`;
}

function renderInputSection(settings) {
  const inputProvider = resolveVoiceProviderId('stt', settings.inputProvider);
  const localSttModel = getLocalModel('stt', settings.localSttModel);
  const locksLanguage = inputProvider === 'browser-local'
    && !localSttModel.multilingual;
  const selectedLanguage = locksLanguage ? 'en' : settings.inputLanguage;
  return `
    <div class="settings-group-title">Voice input</div>
    <div class="settings-row voice-settings-list">
      <div class="settings-section voice-setting-row" data-voice-mode="separate">
        <div class="settings-copy">
          <div class="settings-copy-title">Dictation service</div>
          <div class="settings-copy-desc">Turns what you say into text in the composer.</div>
        </div>
        <label class="voice-control">
          <span class="sr-only">Dictation service</span>
          <select class="api-key-input" data-voice-setting="inputProvider">
            ${providerOptions(settings.inputProvider, 'stt')}
          </select>
        </label>
      </div>
      <div class="settings-section voice-setting-row">
        <div class="settings-copy">
          <div class="settings-copy-title">Spoken language</div>
          <div class="settings-copy-desc" data-voice-language-description>${locksLanguage
            ? `${escapeHTML(localSttModel.label)} supports English only.`
            : 'Automatic detection works for most people. Choose a language if words are being misunderstood.'}</div>
        </div>
        <label class="voice-control">
          <span class="sr-only">Spoken language</span>
          <select class="api-key-input" data-voice-setting="inputLanguage"${locksLanguage ? ' disabled' : ''}>
            ${languageOptions(selectedLanguage)}
          </select>
        </label>
      </div>
      <div class="settings-section voice-setting-row" data-voice-visible="input:browser-local">
        <div class="settings-copy">
          <div class="settings-copy-title">Quality and speed</div>
          <div class="settings-copy-desc">Whisper Small is fastest and recommended for most devices. Medium adds accuracy with a smaller download than Large v3 Turbo. Actual speed varies by hardware and processing mode.</div>
        </div>
        <label class="voice-control">
          <span class="sr-only">Transcription quality and speed</span>
          <select class="api-key-input" data-voice-setting="localSttModel">
            ${modelOptions(LOCAL_STT_MODELS, settings.localSttModel)}
          </select>
        </label>
      </div>
      <div class="settings-section voice-setting-row" data-voice-visible="input:openrouter">
        <div class="settings-copy">
          <div class="settings-copy-title">Transcription model</div>
          <div class="settings-copy-desc">Accurate multilingual transcription routed through OpenRouter.</div>
        </div>
        <span class="voice-control" data-voice-openrouter-model-label="stt">Whisper Large V3</span>
      </div>
      <div class="settings-section voice-setting-row" data-voice-visible="input:venice">
        <div class="settings-copy">
          <div class="settings-copy-title">Transcription model</div>
          <div class="settings-copy-desc">Private, zero-retention transcription through Venice's audio API. If latency matters, use different services and choose OpenRouter for dictation.</div>
        </div>
        <span class="voice-control">Whisper Large V3</span>
      </div>
      ${renderSttHardwareRow(settings)}
      <div class="settings-section voice-setting-row" data-voice-visible="input:local-server">
        <div class="settings-copy">
          <div class="settings-copy-title">Transcription model</div>
          <div class="settings-copy-desc">The model name expected by your server, such as whisper-1.</div>
        </div>
        <label class="voice-control">
          <span class="sr-only">Transcription server model</span>
          <input class="api-key-input" value="${escapeAttr(settings.localServerSttModel)}"
            data-voice-setting="localServerSttModel" autocomplete="off" spellcheck="false">
        </label>
      </div>
    </div>`;
}

function renderOutputSection(settings) {
  const outputProvider = resolveVoiceProviderId('tts', settings.outputProvider);
  const localOutput = outputProvider === 'browser-local';
  const xaiCatalogCount = readVoiceCatalog('xai').length;
  const ppqCatalogCount = readVoiceCatalog('ppq').length;
  const elevenCatalogCount = readVoiceCatalog('elevenlabs').length;
  const openRouterCatalogId = openRouterVoiceCatalogId(settings.openRouterTtsModel);
  const openRouterCatalogCount = readVoiceCatalog(openRouterCatalogId).length;
  const veniceCatalogCount = readVoiceCatalog('venice').length;
  return `
    <div class="settings-group-title">Voice output</div>
    <div class="settings-row voice-settings-list">
      <div class="settings-section voice-setting-row" data-voice-mode="separate">
        <div class="settings-copy">
          <div class="settings-copy-title">Spoken replies service</div>
          <div class="settings-copy-desc">Turns assistant replies into audio.</div>
        </div>
        <label class="voice-control">
          <span class="sr-only">Spoken replies service</span>
          <select class="api-key-input" data-voice-setting="outputProvider">
            ${providerOptions(settings.outputProvider, 'tts')}
          </select>
        </label>
      </div>
      <div class="settings-section voice-setting-row">
        <div class="settings-copy">
          <div class="settings-copy-title">Reading language</div>
          <div class="settings-copy-desc" data-voice-output-language-description>${localOutput
            ? 'The on-device voices currently read English.'
            : 'Choose the language used to read assistant replies.'}</div>
        </div>
        <label class="voice-control">
          <span class="sr-only">Reading language</span>
          <select class="api-key-input" data-voice-setting="outputLanguage"${localOutput ? ' disabled' : ''}>
            ${languageOptions(localOutput ? 'en' : settings.outputLanguage, { includeAuto: false })}
          </select>
        </label>
      </div>
      <div class="settings-section voice-setting-row" data-voice-visible="output:browser-local">
        <div class="settings-copy">
          <div class="settings-copy-title">Voice</div>
          <div class="settings-copy-desc">Choose a female or male voice with an American or British accent.</div>
        </div>
        <label class="voice-control">
          <span class="sr-only">Voice</span>
          <select class="api-key-input" data-voice-setting="localVoice">
            ${localVoiceOptions(settings.localVoice)}
          </select>
        </label>
      </div>
      ${renderTtsHardwareRow(settings)}
      <div class="settings-section voice-setting-row" data-voice-visible="output:local-server">
        <div class="settings-copy">
          <div class="settings-copy-title">Speech model</div>
          <div class="settings-copy-desc">The model name expected by your server.</div>
        </div>
        <label class="voice-control">
          <span class="sr-only">Speech server model</span>
          <input class="api-key-input" value="${escapeAttr(settings.localServerTtsModel)}"
            data-voice-setting="localServerTtsModel" autocomplete="off" spellcheck="false">
        </label>
      </div>
      <div class="settings-section voice-setting-row" data-voice-visible="output:local-server">
        <div class="settings-copy">
          <div class="settings-copy-title">Server voice</div>
          <div class="settings-copy-desc">Voice identifier understood by your local server.</div>
        </div>
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
        <div class="settings-copy">
          <div class="settings-copy-title">Speech model</div>
          <div class="settings-copy-desc">Reliable cloud speech routed through OpenRouter, without a local model download.</div>
        </div>
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
        <div class="settings-copy">
          <div class="settings-copy-title">Speech model</div>
          <div class="settings-copy-desc">Private, zero-retention speech through Venice's audio API, separate from chat E2EE.</div>
        </div>
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
        <div class="settings-copy">
          <div class="settings-copy-title">Speaking speed <output id="voice-rate-value">${settings.rate.toFixed(2).replace(/0$/, '')}×</output></div>
          <div class="settings-copy-desc">Adjust how quickly replies are read aloud.</div>
        </div>
        <label class="voice-control voice-rate-field">
          <span class="sr-only">Speaking speed</span>
          <input type="range" min="0.5" max="2" step="0.05" value="${settings.rate}" data-voice-setting="rate">
        </label>
      </div>
      <div class="settings-section">
        <div class="settings-action-row">
          <div class="settings-copy">
            <div class="settings-copy-title">Read new replies automatically</div>
            <div class="settings-copy-desc">Works while chat is open. You can stop playback at any time.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-voice-setting="autoRead"${settings.autoRead ? ' checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>`;
}

function renderCloudVoiceRow(
  provider,
  title,
  value,
  catalogCount,
  catalogId = provider,
  description = 'Choose from the voices available with your connection.',
) {
  const settingNames = {
    elevenlabs: 'elevenlabsVoice',
    openrouter: 'openRouterVoice',
    ppq: 'ppqVoice',
    venice: 'veniceVoice',
    xai: 'xaiVoice',
  };
  return `
    <div class="settings-section voice-setting-row" data-voice-visible="output:${provider}">
      <div class="settings-copy">
        <div class="settings-copy-title">${title}</div>
        <div class="settings-copy-desc">${escapeHTML(description)}</div>
      </div>
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

function renderLocalModels(settings) {
  const sttModel = getLocalModel('stt', settings.localSttModel);
  const ttsModel = getLocalModel('tts', settings.localTtsModel);
  const renderModel = (kind, model, purpose) => {
    const backend = kind === 'tts' ? settings.localTtsBackend : settings.localSttBackend;
    const ready = isLocalVoiceModelReady(kind, model.id, backend);
    const downloadMB = kind === 'tts'
      && preferredLocalVoiceBackend(kind, model.id, backend) === 'webgpu'
      ? model.gpuDownloadMB
      : model.downloadMB;
    return `
      <div class="settings-section voice-model-row" data-voice-model-kind="${kind}">
        <div class="settings-copy">
          <div class="settings-copy-title">${escapeHTML(model.label)}</div>
          <div class="settings-copy-desc">${purpose} · about ${downloadMB} MB · ${escapeHTML(model.license)}</div>
          <div class="voice-model-state" data-state="${ready ? 'ready' : 'missing'}"
            data-voice-model-status="${kind}">${localModelUiStatus(kind, model.id)}</div>
          <div class="voice-model-progress" hidden data-voice-model-progress="${kind}">
            <div class="voice-model-progress-track" role="progressbar"
              aria-label="${escapeAttr(model.label)} download progress"><span></span></div>
            <small>Preparing model…</small>
          </div>
        </div>
        <div class="voice-model-actions">
          <button type="button" class="import-btn settings-mini-btn"
            data-voice-action="install-model" data-kind="${kind}"${ready ? ' disabled' : ''}>${ready ? 'Ready' : 'Download'}</button>
          <button type="button" class="settings-link-btn"
            data-voice-action="remove-model" data-kind="${kind}"${ready ? '' : ' disabled'}>Remove</button>
        </div>
      </div>`;
  };
  return `
    <div class="settings-group-title">Built-in local models</div>
    <div class="settings-row voice-model-list">
      ${renderModel('stt', sttModel, 'Transcription')}
      ${renderModel('tts', ttsModel, 'Speech')}
      <div class="voice-model-footnote">
        Models download only when you choose Download. Voice actions never start a model download
        automatically. If browser storage removes the files, Voice will ask you to download them again.
      </div>
    </div>`;
}

function renderConnectionCard(provider, title, description, settings) {
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

function renderConnections(settings) {
  return `
    <div class="settings-group-title">Connections</div>
    <div class="settings-row voice-connections">
      <div class="settings-section">
        <div class="settings-action-row">
          <div class="settings-copy">
            <div class="settings-copy-title">AI provider connections</div>
            <div class="settings-copy-desc">PPQ, OpenRouter, and Venice reuse the encrypted connection from AI settings and receive compatible voice requests directly from this browser. Routstr voice is not live yet and falls back to this device.</div>
          </div>
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
    </div>`;
}

export function renderVoiceSettingsPanel(active = false) {
  const settings = getVoiceSettings();
  return `
    <div class="settings-tab-panel${active ? ' active' : ''}" data-tab-panel="voice">
      ${renderProviderNotice()}
      ${renderServiceSection(settings)}
      ${renderInputSection(settings)}
      ${renderOutputSection(settings)}
      ${renderLocalModels(settings)}
      ${renderConnections(settings)}
    </div>`;
}

export const voiceProviderLabels = Object.freeze(Object.fromEntries(
  VOICE_PROVIDERS.map(provider => [provider.id, provider.label]),
));
