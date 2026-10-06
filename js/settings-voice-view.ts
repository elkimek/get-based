// Typed presentation snapshots; controllers own actions, storage and requests.
import type { VoiceKind } from '../types/voice-local.js';
import type { VoiceListEntry } from '../types/voice-provider.js';
import type { VoiceField, VoiceOption, VoicePreferences, VoiceSettingsSnapshot } from './settings-voice-contract.js';
import { getVoiceSettings, getVoiceProviderKey, hasVoiceProviderKey } from './voice-settings-storage.js';
import { getAutomaticVoiceStatus, resolveVoiceProviderId } from './voice-ai-provider.js';
import { VOICE_PROVIDERS, getSharedVoiceProviders, getVoiceProvidersFor } from './voice-provider-catalog.js';
import { KOKORO_VOICES, LOCAL_STT_MODELS, VOICE_LANGUAGES, getLocalModel } from './voice-model-catalog.js';
import { getHardwareOptions } from './settings-voice-hardware.js';
import { readVoiceModelView } from './settings-voice-model-controller.js';
import { readVoiceCatalog } from './voice-catalog-storage.js';
import { openRouterVoiceCatalogId } from './voice-openrouter-catalog.js';

export const voiceProviderLabels = Object.freeze(Object.fromEntries(VOICE_PROVIDERS.map(provider => [provider.id, provider.label])));
export function voiceOptionLabel(voice: VoiceListEntry): string {
  return [voice.name || voice.id, voice.language, voice.descriptor || voice.gender].filter(Boolean).join(' · ');
}
export function voiceProviderKeyStatus(provider: string, configured = hasVoiceProviderKey(provider)): string {
  if (!configured) return 'Not configured';
  return provider === 'local-server' ? 'Saved securely on this device' : 'Saved encrypted in this browser · included in encrypted sync when enabled';
}
function providerOptions(kind: 'shared' | VoiceKind): VoiceOption[] {
  return (kind === 'shared' ? getSharedVoiceProviders() : getVoiceProvidersFor(kind)).map(provider => ({
    id: provider.id,
    label: provider.id === 'auto' ? 'Automatic' : provider.credentialSource === 'ai' ? `${provider.label} (AI connection)`
      : provider.privacy === 'cloud' ? `${provider.label} (cloud)` : provider.id === 'local-server' ? 'Local server' : provider.label,
  }));
}
function languageOptions(includeAuto = true): VoiceOption[] {
  return VOICE_LANGUAGES.filter(language => includeAuto || language.id !== 'auto').map(({ id, label }) => ({ id, label }));
}
function cloudOptions(provider: string, selected: string): VoiceOption[] {
  const rows = readVoiceCatalog(provider);
  const fallback = selected && !rows.some(row => row.id === selected)
    ? [{ id: selected, label: provider === 'xai' && selected === 'eve' ? 'Eve · built-in voice' : 'Saved voice · refresh to load its name' }] : [];
  return [...fallback, ...(!selected && !rows.length ? [{ id: '', label: 'Refresh to load voices' }] : []), ...rows.map(row => ({ id: row.id, label: voiceOptionLabel(row) }))];
}
function field(id: string, title: string, description: string, label: string, extra: Partial<VoiceField> = {}): VoiceField {
  return { id, title, description, label, type: 'select', ...extra };
}
function localFields(kind: VoiceKind, settings: VoicePreferences, resolved: string): VoiceField[] {
  const stt = kind === 'stt';
  return [
    field(`${kind}-processor`, 'Processor', '', `${stt ? 'STT' : 'TTS'} processor`, {
      type: 'hardware', kind, setting: stt ? 'localSttBackend' : 'localTtsBackend', value: stt ? settings.localSttBackend : settings.localTtsBackend,
      options: getHardwareOptions(), visible: `${stt ? 'input' : 'output'}:browser-local`, hidden: resolved !== 'browser-local',
    }),
    field(`${kind}-model`, '', '', '', { type: 'model', kind, visible: `${stt ? 'input' : 'output'}:browser-local`, hidden: resolved !== 'browser-local' }),
  ];
}
function cloudField(provider: string, title: string, selected: string, setting: keyof VoicePreferences, resolved: string, catalogId = provider,
  description = 'Choose from the voices available with your connection.'): VoiceField {
  const count = readVoiceCatalog(catalogId).length;
  return field(`tts-voice-${provider}`, title, description, title, { provider, setting, value: selected, options: cloudOptions(catalogId, selected),
    visible: `output:${provider}`, hidden: resolved !== provider, catalogStatus: count ? `${count} voices loaded` : '' });
}
function inputFields(settings: VoicePreferences, resolved: string): VoiceField[] {
  const model = getLocalModel('stt', settings.localSttModel);
  const englishOnly = resolved === 'browser-local' && !model.multilingual;
  return [
    field('stt-service', 'STT service', 'Service used for dictation.', 'Dictation service', { setting: 'inputProvider', value: settings.inputProvider, options: providerOptions('stt'), separate: true, hidden: settings.providersLinked }),
    field('stt-language', 'Spoken language', englishOnly ? `${model.label} supports English only.` : 'Automatic detection works for most people. Choose a language if words are being misunderstood.', 'Spoken language', { setting: 'inputLanguage', value: englishOnly ? 'en' : settings.inputLanguage, disabled: englishOnly, options: languageOptions(), language: 'input' }),
    field('stt-quality', 'Whisper model', 'Small is fastest. Medium adds accuracy with a smaller download than Large; actual speed depends on your processor.', 'Transcription quality and speed', { setting: 'localSttModel', value: settings.localSttModel, options: LOCAL_STT_MODELS.map(row => ({ id: row.id, label: row.optionLabel || row.label })), visible: 'input:browser-local', hidden: resolved !== 'browser-local' }),
    field('stt-openrouter', 'Transcription model', 'Accurate multilingual transcription routed through OpenRouter.', '', { type: 'static', value: 'Whisper Large V3', visible: 'input:openrouter', hidden: resolved !== 'openrouter', openRouterModel: 'stt' }),
    field('stt-venice', 'Transcription model', "Private, zero-retention transcription through Venice's audio API. If latency matters, use different services and choose OpenRouter for dictation.", '', { type: 'static', value: 'Whisper Large V3', visible: 'input:venice', hidden: resolved !== 'venice' }),
    ...localFields('stt', settings, resolved),
    field('stt-server', 'Transcription model', 'The model name expected by your server, such as whisper-1.', 'Transcription server model', { type: 'text', setting: 'localServerSttModel', value: settings.localServerSttModel, visible: 'input:local-server', hidden: resolved !== 'local-server' }),
  ];
}
function outputFields(settings: VoicePreferences, resolved: string): VoiceField[] {
  const local = resolved === 'browser-local';
  return [
    field('tts-service', 'TTS service', 'Service used to read replies.', 'Spoken replies service', { setting: 'outputProvider', value: settings.outputProvider, options: providerOptions('tts'), separate: true, hidden: settings.providersLinked }),
    field('tts-language', 'Reading language', local ? 'The on-device voices currently read English.' : 'Choose the language used to read assistant replies.', 'Reading language', { setting: 'outputLanguage', value: local ? 'en' : settings.outputLanguage, options: languageOptions(false), disabled: local, hidden: local, language: 'output' }),
    field('tts-voice-local', 'Voice', 'Choose a female or male voice with an American or British accent.', 'Voice', { setting: 'localVoice', value: settings.localVoice, options: KOKORO_VOICES.map(row => ({ id: row.id, label: `${row.name} · ${row.language}`, group: `${row.gender} voices` })), visible: 'output:browser-local', hidden: !local }),
    ...localFields('tts', settings, resolved),
    field('tts-server-model', 'Speech model', 'The model name expected by your server.', 'Speech server model', { type: 'text', setting: 'localServerTtsModel', value: settings.localServerTtsModel, visible: 'output:local-server', hidden: resolved !== 'local-server' }),
    field('tts-server-voice', 'Server voice', 'Voice identifier understood by your local server.', 'Server voice', { type: 'text', setting: 'localServerVoice', value: settings.localServerVoice, visible: 'output:local-server', hidden: resolved !== 'local-server' }),
    cloudField('xai', 'xAI voice', settings.xaiVoice, 'xaiVoice', resolved),
    cloudField('elevenlabs', 'ElevenLabs voice', settings.elevenlabsVoice, 'elevenlabsVoice', resolved),
    cloudField('ppq', 'PPQ voice', settings.ppqVoice, 'ppqVoice', resolved),
    field('tts-openrouter', 'Speech model', 'Reliable cloud speech routed through OpenRouter, without a local model download.', '', { type: 'static', value: 'Kokoro 82M', visible: 'output:openrouter', hidden: resolved !== 'openrouter', openRouterModel: 'tts' }),
    cloudField('openrouter', 'Voice through OpenRouter', settings.openRouterVoice, 'openRouterVoice', resolved, openRouterVoiceCatalogId(settings.openRouterTtsModel), 'Choose a cloud Kokoro voice. The model runs remotely, so no download or local inference is needed.'),
    field('tts-venice', 'Speech model', "Private, zero-retention speech through Venice's audio API, separate from chat E2EE.", '', { type: 'static', value: 'Kokoro 82M', visible: 'output:venice', hidden: resolved !== 'venice' }),
    cloudField('venice', 'Venice Kokoro voice', settings.veniceVoice, 'veniceVoice', resolved, 'venice', 'Choose from the private Kokoro voices available with your Venice connection.'),
    field('tts-rate', 'Speaking speed', 'Adjust how quickly replies are read aloud.', 'Speaking speed', { type: 'range', setting: 'rate', value: settings.rate }),
  ];
}
export function getVoiceSettingsSnapshot(): VoiceSettingsSnapshot {
  const settings = getVoiceSettings();
  return { settings, automatic: getAutomaticVoiceStatus(), sharedProviders: providerOptions('shared'),
    input: inputFields(settings, resolveVoiceProviderId('stt', settings.inputProvider)), output: outputFields(settings, resolveVoiceProviderId('tts', settings.outputProvider)),
    models: { stt: readVoiceModelView('stt'), tts: readVoiceModelView('tts') },
    connections: [
      { provider: 'local-server', title: 'OpenAI-compatible local server', description: 'Whisper.cpp, LocalAI, Speaches, or another compatible app', docs: '' },
      { provider: 'xai', title: 'xAI', description: 'Cloud transcription and speech with your own key', docs: 'https://console.x.ai/' },
      { provider: 'elevenlabs', title: 'ElevenLabs', description: 'Scribe transcription and multilingual voices', docs: 'https://elevenlabs.io/app/settings/api-keys' },
    ].map(row => ({ ...row, keyLabel: row.provider === 'local-server' ? 'Optional server API key' : `${row.title} API key`, key: getVoiceProviderKey(row.provider), keyStatus: voiceProviderKeyStatus(row.provider) })),
  };
}
export function renderVoiceSettingsPanel(active = false): string {
  return `<div class="settings-tab-panel${active ? ' active' : ''}" data-tab-panel="voice" id="settings-tab-voice" role="tabpanel" aria-label="Voice"></div>`;
}
