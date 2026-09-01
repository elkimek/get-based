// @ts-check
// voice-model-catalog.js — pinned browser-local voice models and voices.

export const VOICE_RUNTIME_VERSION = '2';

export const LOCAL_VOICE_BACKENDS = Object.freeze([
  { id: 'auto', label: 'Automatic (recommended)' },
  { id: 'webgpu', label: 'Graphics processor (GPU)' },
  { id: 'wasm', label: 'Main processor (CPU)' },
]);

// Compatibility export for callers outside the Voice settings panel.
export const LOCAL_STT_BACKENDS = LOCAL_VOICE_BACKENDS;

export const LOCAL_STT_MODELS = Object.freeze([
  {
    id: 'onnx-community/whisper-small',
    label: 'Whisper Small · Recommended',
    optionLabel: 'Recommended · Whisper Small',
    language: 'Multilingual',
    multilingual: true,
    dtype: 'q8',
    downloadMB: 260,
    license: 'Apache-2.0',
    notes: 'Recommended default for most devices: faster than the larger tiers, with lower transcription accuracy.',
  },
  {
    id: 'onnx-community/whisper-medium-ONNX',
    label: 'Whisper Medium · Balanced',
    optionLabel: 'Balanced · Whisper Medium',
    language: 'Multilingual',
    multilingual: true,
    dtype: 'q4',
    downloadMB: 690,
    license: 'Apache-2.0',
    notes: 'Balanced accuracy tier between Small and Large. Speed varies by hardware and processing mode.',
  },
  {
    id: 'onnx-community/whisper-large-v3-turbo',
    label: 'Whisper Large v3 Turbo · Higher accuracy',
    optionLabel: 'Higher accuracy · Whisper Large',
    language: 'Multilingual',
    multilingual: true,
    dtype: 'q4',
    downloadMB: 770,
    license: 'Apache-2.0',
    notes: 'High-end multilingual option. Requires substantially more memory and storage.',
  },
]);

export const LOCAL_TTS_MODELS = Object.freeze([
  {
    id: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    label: 'Kokoro 82M',
    language: 'English',
    downloadMB: 95,
    gpuDownloadMB: 330,
    license: 'Apache-2.0',
    notes: 'Natural English speech with US and UK voices. Quantized for broad WASM compatibility.',
  },
]);

export const KOKORO_VOICES = Object.freeze([
  { id: 'af_heart', name: 'Heart', language: 'en-US', gender: 'Female', quality: 'A' },
  { id: 'af_bella', name: 'Bella', language: 'en-US', gender: 'Female', quality: 'A-' },
  { id: 'af_nicole', name: 'Nicole', language: 'en-US', gender: 'Female', quality: 'B-' },
  { id: 'af_sarah', name: 'Sarah', language: 'en-US', gender: 'Female', quality: 'B' },
  { id: 'af_kore', name: 'Kore', language: 'en-US', gender: 'Female', quality: 'C+' },
  { id: 'af_nova', name: 'Nova', language: 'en-US', gender: 'Female', quality: 'C' },
  { id: 'am_fenrir', name: 'Fenrir', language: 'en-US', gender: 'Male', quality: 'C+' },
  { id: 'am_michael', name: 'Michael', language: 'en-US', gender: 'Male', quality: 'C+' },
  { id: 'am_puck', name: 'Puck', language: 'en-US', gender: 'Male', quality: 'C+' },
  { id: 'am_liam', name: 'Liam', language: 'en-US', gender: 'Male', quality: 'C' },
  { id: 'bf_emma', name: 'Emma', language: 'en-GB', gender: 'Female', quality: 'B-' },
  { id: 'bf_isabella', name: 'Isabella', language: 'en-GB', gender: 'Female', quality: 'C' },
  { id: 'bf_alice', name: 'Alice', language: 'en-GB', gender: 'Female', quality: 'D' },
  { id: 'bf_lily', name: 'Lily', language: 'en-GB', gender: 'Female', quality: 'D' },
  { id: 'bm_fable', name: 'Fable', language: 'en-GB', gender: 'Male', quality: 'C' },
  { id: 'bm_george', name: 'George', language: 'en-GB', gender: 'Male', quality: 'C' },
  { id: 'bm_lewis', name: 'Lewis', language: 'en-GB', gender: 'Male', quality: 'D+' },
  { id: 'bm_daniel', name: 'Daniel', language: 'en-GB', gender: 'Male', quality: 'D' },
]);

export const VOICE_LANGUAGES = Object.freeze([
  { id: 'auto', label: 'Detect automatically' },
  { id: 'en', label: 'English' },
  { id: 'cs', label: 'Czech' },
  { id: 'de', label: 'German' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
  { id: 'it', label: 'Italian' },
  { id: 'ja', label: 'Japanese' },
  { id: 'ko', label: 'Korean' },
  { id: 'nl', label: 'Dutch' },
  { id: 'pl', label: 'Polish' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'ru', label: 'Russian' },
  { id: 'zh', label: 'Chinese' },
]);

export function getLocalVoice(voiceId) {
  return KOKORO_VOICES.find(voice => voice.id === voiceId) || KOKORO_VOICES[0];
}

export function getLocalModel(kind, modelId) {
  const models = kind === 'tts' ? LOCAL_TTS_MODELS : LOCAL_STT_MODELS;
  return models.find(model => model.id === modelId) || models[0];
}

export function resolveLocalSttLanguage(modelId, language = 'auto') {
  const model = getLocalModel('stt', modelId);
  return model.multilingual ? String(language || 'auto') : 'en';
}
