// @ts-check
// voice-settings-storage.js — device-local voice preferences and encrypted BYOK credentials.

import {
  dispatchAISettingsLocalChangedRuntime,
  encryptedSetProviderItemRuntime,
} from './api-provider-storage-runtime.js';
import { getCachedKey, updateKeyCache } from './crypto-key-cache.js';
import {
  KOKORO_VOICES,
  LOCAL_STT_MODELS,
  LOCAL_TTS_MODELS,
  VOICE_LANGUAGES,
} from './voice-model-catalog.js';
import { VOICE_PROVIDERS } from './voice-provider-catalog.js';
import { VOICE_STORAGE_KEYS } from './voice-settings-schema.js';

export { VOICE_STORAGE_KEYS } from './voice-settings-schema.js';

const PROVIDER_IDS = new Set(VOICE_PROVIDERS.map(provider => provider.id));
const LANGUAGE_IDS = new Set(VOICE_LANGUAGES.map(language => language.id));
const STT_BACKEND_IDS = new Set(['auto', 'webgpu', 'wasm']);

function storageGet(key, fallback = '') {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  localStorage.setItem(key, String(value));
  dispatchVoiceSettingsChanged();
  dispatchAISettingsLocalChangedRuntime();
}

function storageSetMany(entries) {
  for (const [key, value] of entries) localStorage.setItem(key, String(value));
  dispatchVoiceSettingsChanged();
  dispatchAISettingsLocalChangedRuntime();
}

function normalizeProvider(value) {
  return PROVIDER_IDS.has(value) ? value : 'browser-local';
}

function normalizeLanguage(value) {
  return LANGUAGE_IDS.has(value) ? value : 'auto';
}

function normalizeSttBackend(value) {
  return STT_BACKEND_IDS.has(value) ? value : 'auto';
}

function getLocalSttModelPreference() {
  const stored = storageGet(VOICE_STORAGE_KEYS.localSttModel);
  const choiceVersion = storageGet(VOICE_STORAGE_KEYS.localSttModelChoiceVersion);
  let selected = LOCAL_STT_MODELS.some(model => model.id === stored)
    ? stored
    : LOCAL_STT_MODELS[0].id;

  // Upgrade either former implicit default once. Explicit choices made after
  // this catalog revision are preserved.
  if (choiceVersion !== '3' && (
    stored === 'onnx-community/whisper-tiny'
    || stored === 'onnx-community/whisper-base'
  )) {
    selected = LOCAL_STT_MODELS[0].id;
  }
  try {
    localStorage.setItem(VOICE_STORAGE_KEYS.localSttModel, selected);
    localStorage.setItem(VOICE_STORAGE_KEYS.localSttModelChoiceVersion, '3');
  } catch {}
  return selected;
}

export function normalizeLocalVoiceServerUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/v1\/?$/i, '') || '/';
    return url.href.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function getVoiceSettings() {
  const rate = Number(storageGet(VOICE_STORAGE_KEYS.rate, '1'));
  const inputProvider = normalizeProvider(storageGet(
    VOICE_STORAGE_KEYS.inputProvider,
    'browser-local',
  ));
  const outputProvider = normalizeProvider(storageGet(
    VOICE_STORAGE_KEYS.outputProvider,
    'browser-local',
  ));
  const storedLinked = storageGet(VOICE_STORAGE_KEYS.providersLinked);
  return {
    inputProvider,
    outputProvider,
    // Existing installations with deliberately different providers migrate
    // directly into advanced mode; equal selections use the simpler linked UI.
    providersLinked: storedLinked
      ? storedLinked === 'true'
      : inputProvider === outputProvider,
    inputLanguage: normalizeLanguage(storageGet(VOICE_STORAGE_KEYS.inputLanguage, 'auto')),
    outputLanguage: normalizeLanguage(storageGet(VOICE_STORAGE_KEYS.outputLanguage, 'en')),
    localSttModel: getLocalSttModelPreference(),
    localSttBackend: normalizeSttBackend(storageGet(VOICE_STORAGE_KEYS.localSttBackend, 'auto')),
    localTtsBackend: normalizeSttBackend(storageGet(VOICE_STORAGE_KEYS.localTtsBackend, 'auto')),
    localTtsModel: storageGet(VOICE_STORAGE_KEYS.localTtsModel, LOCAL_TTS_MODELS[0].id),
    localVoice: storageGet(VOICE_STORAGE_KEYS.localVoice, KOKORO_VOICES[0].id),
    localServerUrl: normalizeLocalVoiceServerUrl(storageGet(VOICE_STORAGE_KEYS.localServerUrl)),
    localServerSttModel: storageGet(VOICE_STORAGE_KEYS.localServerSttModel, 'whisper-1'),
    localServerTtsModel: storageGet(VOICE_STORAGE_KEYS.localServerTtsModel, 'tts-1'),
    localServerVoice: storageGet(VOICE_STORAGE_KEYS.localServerVoice, 'alloy'),
    xaiVoice: storageGet(VOICE_STORAGE_KEYS.xaiVoice, 'eve'),
    elevenlabsVoice: storageGet(VOICE_STORAGE_KEYS.elevenlabsVoice),
    elevenlabsTtsModel: storageGet(VOICE_STORAGE_KEYS.elevenlabsTtsModel, 'eleven_multilingual_v2'),
    rate: Number.isFinite(rate) ? Math.min(2, Math.max(0.5, rate)) : 1,
    autoRead: storageGet(VOICE_STORAGE_KEYS.autoRead) === 'true',
  };
}

export function setVoiceSetting(name, value) {
  const key = VOICE_STORAGE_KEYS[name];
  if (!key || ['xaiKey', 'elevenlabsKey', 'localServerKey'].includes(name)) {
    throw new Error(`Unsupported voice preference: ${name}`);
  }
  let normalized = value;
  if (name === 'inputProvider' || name === 'outputProvider') normalized = normalizeProvider(String(value));
  if (name === 'providersLinked') normalized = value ? 'true' : 'false';
  if (name === 'inputLanguage' || name === 'outputLanguage') normalized = normalizeLanguage(String(value));
  if (name === 'localSttBackend' || name === 'localTtsBackend') normalized = normalizeSttBackend(String(value));
  if (name === 'localServerUrl') normalized = normalizeLocalVoiceServerUrl(value);
  if (name === 'rate') normalized = Math.min(2, Math.max(0.5, Number(value) || 1));
  if (name === 'autoRead') normalized = value ? 'true' : 'false';
  if (name === 'localSttModel') {
    try {
      localStorage.setItem(VOICE_STORAGE_KEYS.localSttModelChoiceVersion, '3');
    } catch {}
  }
  if (name === 'providersLinked' && normalized === 'true') {
    const provider = getVoiceSettings().inputProvider;
    storageSetMany([
      [VOICE_STORAGE_KEYS.providersLinked, 'true'],
      [VOICE_STORAGE_KEYS.inputProvider, provider],
      [VOICE_STORAGE_KEYS.outputProvider, provider],
    ]);
    return getVoiceSettings();
  }
  if (
    (name === 'inputProvider' || name === 'outputProvider')
    && getVoiceSettings().providersLinked
  ) {
    storageSetMany([
      [VOICE_STORAGE_KEYS.providersLinked, 'true'],
      [VOICE_STORAGE_KEYS.inputProvider, normalized],
      [VOICE_STORAGE_KEYS.outputProvider, normalized],
    ]);
    return getVoiceSettings();
  }
  storageSet(key, normalized);
  return getVoiceSettings();
}

export function setSharedVoiceProvider(provider) {
  const normalized = normalizeProvider(String(provider));
  storageSetMany([
    [VOICE_STORAGE_KEYS.providersLinked, 'true'],
    [VOICE_STORAGE_KEYS.inputProvider, normalized],
    [VOICE_STORAGE_KEYS.outputProvider, normalized],
  ]);
  return getVoiceSettings();
}

export function getVoiceProviderKey(provider) {
  const key = provider === 'xai'
    ? VOICE_STORAGE_KEYS.xaiKey
    : provider === 'elevenlabs'
      ? VOICE_STORAGE_KEYS.elevenlabsKey
      : provider === 'local-server'
        ? VOICE_STORAGE_KEYS.localServerKey
        : '';
  return key ? getCachedKey(key) || '' : '';
}

export async function saveVoiceProviderKey(provider, value) {
  const key = provider === 'xai'
    ? VOICE_STORAGE_KEYS.xaiKey
    : provider === 'elevenlabs'
      ? VOICE_STORAGE_KEYS.elevenlabsKey
      : provider === 'local-server'
        ? VOICE_STORAGE_KEYS.localServerKey
        : '';
  if (!key) throw new Error(`Provider ${provider} does not accept an API key`);
  const clean = String(value || '').trim();
  await encryptedSetProviderItemRuntime(key, clean);
  updateKeyCache(key, clean);
  dispatchVoiceSettingsChanged();
  dispatchAISettingsLocalChangedRuntime();
}

export function hasVoiceProviderKey(provider) {
  return !!getVoiceProviderKey(provider);
}

export function dispatchVoiceSettingsChanged() {
  if (typeof globalThis.dispatchEvent !== 'function') return false;
  try {
    globalThis.dispatchEvent(new CustomEvent('labcharts-voice-settings-changed'));
    return true;
  } catch {
    return false;
  }
}
