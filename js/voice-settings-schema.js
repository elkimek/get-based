// @ts-check
// voice-settings-schema.js — authoritative keys and persistence scopes.

export const VOICE_SETTINGS_SCHEMA = Object.freeze({
  inputProvider: { key: 'labcharts-voice-input-provider', scope: 'device' },
  outputProvider: { key: 'labcharts-voice-output-provider', scope: 'device' },
  providersLinked: { key: 'labcharts-voice-providers-linked', scope: 'device' },
  inputLanguage: { key: 'labcharts-voice-input-language', scope: 'sync' },
  outputLanguage: { key: 'labcharts-voice-output-language', scope: 'sync' },
  localSttModel: { key: 'labcharts-voice-local-stt-model', scope: 'device' },
  localSttModelChoiceVersion: {
    key: 'labcharts-voice-local-stt-model-choice-version',
    scope: 'device',
  },
  localSttBackend: { key: 'labcharts-voice-local-stt-backend', scope: 'device' },
  localTtsBackend: { key: 'labcharts-voice-local-tts-backend', scope: 'device' },
  localTtsModel: { key: 'labcharts-voice-local-tts-model', scope: 'device' },
  localVoice: { key: 'labcharts-voice-local-voice', scope: 'sync' },
  localServerUrl: { key: 'labcharts-voice-local-server-url', scope: 'device' },
  localServerSttModel: { key: 'labcharts-voice-local-server-stt-model', scope: 'device' },
  localServerTtsModel: { key: 'labcharts-voice-local-server-tts-model', scope: 'device' },
  localServerVoice: { key: 'labcharts-voice-local-server-voice', scope: 'device' },
  localServerKey: {
    key: 'labcharts-voice-local-server-key',
    scope: 'device',
    secret: true,
  },
  xaiKey: { key: 'labcharts-xai-voice-key', scope: 'sync', secret: true },
  xaiVoice: { key: 'labcharts-xai-voice', scope: 'sync' },
  openRouterSttModel: { key: 'labcharts-openrouter-stt-model', scope: 'sync' },
  openRouterTtsModel: { key: 'labcharts-openrouter-tts-model', scope: 'sync' },
  openRouterVoice: { key: 'labcharts-openrouter-voice', scope: 'sync' },
  ppqVoice: { key: 'labcharts-ppq-voice', scope: 'sync' },
  veniceVoice: { key: 'labcharts-venice-voice', scope: 'sync' },
  elevenlabsKey: {
    key: 'labcharts-elevenlabs-voice-key',
    scope: 'sync',
    secret: true,
  },
  elevenlabsVoice: { key: 'labcharts-elevenlabs-voice', scope: 'sync' },
  elevenlabsTtsModel: { key: 'labcharts-elevenlabs-voice-model', scope: 'sync' },
  rate: { key: 'labcharts-voice-rate', scope: 'sync' },
  autoRead: { key: 'labcharts-voice-auto-read', scope: 'sync' },
});

export const VOICE_STORAGE_KEYS = Object.freeze(Object.fromEntries(
  Object.entries(VOICE_SETTINGS_SCHEMA).map(([name, definition]) => [name, definition.key]),
));

export const VOICE_SYNC_KEYS = Object.freeze(Object.values(VOICE_SETTINGS_SCHEMA)
  .filter(definition => definition.scope === 'sync')
  .map(definition => definition.key));

export const VOICE_ENCRYPTED_SYNC_KEYS = Object.freeze(Object.values(VOICE_SETTINGS_SCHEMA)
  .filter(definition => (
    definition.scope === 'sync' && 'secret' in definition && definition.secret
  ))
  .map(definition => definition.key));

// Full backups preserve both portable and device-specific preferences, but
// model files and fetched voice catalogues remain rebuildable caches.
export const VOICE_BACKUP_KEYS = Object.freeze(Object.values(VOICE_SETTINGS_SCHEMA)
  .map(definition => definition.key));
