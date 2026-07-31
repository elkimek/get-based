// @ts-check
// voice-provider-browser-local.js — browser-local Whisper and Kokoro adapter.

import { audioSamplesToWavBlob, decodeAudioBlob } from './voice-audio.js';
import {
  isLocalVoiceModelReady,
  installLocalVoiceModel,
  streamLocalSpeech,
  synthesizeLocalSpeech,
  transcribeLocalAudio,
  verifyLocalVoiceModelReady,
} from './voice-local-engine.js';
import {
  KOKORO_VOICES,
  LOCAL_STT_MODELS,
  LOCAL_TTS_MODELS,
  resolveLocalSttLanguage,
} from './voice-model-catalog.js';

async function requireInstalledModel(kind, modelId, backend = 'auto') {
  if (
    isLocalVoiceModelReady(kind, modelId, backend)
    && await verifyLocalVoiceModelReady(kind, modelId, backend)
  ) return;
  const models = kind === 'tts' ? LOCAL_TTS_MODELS : LOCAL_STT_MODELS;
  const model = models.find(item => item.id === modelId) || models[0];
  throw new Error(
    `${model.label} is not downloaded for the selected processing mode. Download it in Settings → Voice before using it.`,
  );
}

export const browserLocalVoiceProvider = {
  id: 'browser-local',
  async transcribe({ audio, modelId, language = 'auto', backend = 'auto', signal }) {
    const model = modelId || LOCAL_STT_MODELS[0].id;
    await requireInstalledModel('stt', model);
    const samples = audio instanceof Float32Array ? audio : await decodeAudioBlob(audio, 16_000);
    return transcribeLocalAudio(samples, {
      model,
      language: resolveLocalSttLanguage(model, language),
      backend,
      signal,
    });
  },
  async synthesize({ text, modelId, voiceId, rate = 1, backend = 'auto', signal, streaming = false }) {
    const model = modelId || LOCAL_TTS_MODELS[0].id;
    await requireInstalledModel('tts', model, backend);
    if (streaming) {
      return {
        pcmStream: streamLocalSpeech(text, {
          model,
          voice: voiceId || KOKORO_VOICES[0].id,
          rate,
          backend,
          signal,
        }),
        contentType: 'audio/x-f32',
      };
    }
    const result = await synthesizeLocalSpeech(text, {
      model,
      voice: voiceId || KOKORO_VOICES[0].id,
      rate,
      backend,
      signal,
    });
    return {
      audio: audioSamplesToWavBlob(result.samples, result.sampleRate),
      contentType: 'audio/wav',
      backend: result.backend,
      inferenceMs: result.inferenceMs,
    };
  },
  listVoices() {
    return Promise.resolve(KOKORO_VOICES.map(voice => ({ ...voice })));
  },
  listModels(kind) {
    return Promise.resolve((kind === 'tts' ? LOCAL_TTS_MODELS : LOCAL_STT_MODELS)
      .map(model => ({ ...model })));
  },
  installModel(kind, modelId, signal, backend = 'auto') {
    return installLocalVoiceModel(kind, modelId, signal, backend);
  },
  testConnection() {
    return Promise.resolve({
      ok: typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined',
      message: typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
        ? 'This browser can run on-device voice models.'
        : 'This browser does not support the required worker and WASM features.',
    });
  },
};

export default browserLocalVoiceProvider;
