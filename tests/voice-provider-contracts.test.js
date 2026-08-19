import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { localServerVoiceProvider } from '../js/voice-provider-local-server.js';
import { browserLocalVoiceProvider } from '../js/voice-provider-browser-local.js';
import { clearKeyCache, updateKeyCache } from '../js/crypto-key-cache.js';
import {
  fetchOpenRouterVoiceModels,
  voicesForOpenRouterModel,
} from '../js/voice-openrouter-catalog.js';
import {
  directSynthesis,
  directTranscription,
  directVoices,
} from '../js/voice-provider-cloud-shared.js';
import {
  CLOUD_AI_CONSENT_KEY,
  CLOUD_AI_CONSENT_VERSION,
} from '../js/cloud-ai-consent.js';
import { fetchVeniceKokoroVoices } from '../js/voice-provider-ai-cloud.js';
import { loadVoiceProvider } from '../js/voice-provider-registry.js';
import {
  getSharedVoiceProviders,
  getVoiceProviderDefinition,
  getVoiceProvidersFor,
} from '../js/voice-provider-catalog.js';
import { createVoiceSynthesizer, transcribeVoice } from '../js/voice-service.js';
import {
  VOICE_STORAGE_KEYS,
  getVoiceSettings,
  setVoiceSetting,
} from '../js/voice-settings-storage.js';

const realFetch = globalThis.fetch;

beforeEach(() => {
  const approvals = Object.fromEntries(
    ['openrouter', 'ppq', 'venice', 'xai', 'elevenlabs'].map(provider => [provider, {
      accepted: true,
      provider,
    }]),
  );
  localStorage.setItem(CLOUD_AI_CONSENT_KEY, JSON.stringify({
    version: CLOUD_AI_CONSENT_VERSION,
    approvals,
  }));
});

afterEach(() => {
  globalThis.fetch = realFetch;
  localStorage.clear();
  clearKeyCache();
  vi.restoreAllMocks();
});

describe('voice provider registry', () => {
  it('loads every provider through literal lazy boundaries', async () => {
    await expect(loadVoiceProvider('browser-local')).resolves.toMatchObject({ id: 'browser-local' });
    await expect(loadVoiceProvider('local-server')).resolves.toMatchObject({ id: 'local-server' });
    await expect(loadVoiceProvider('xai')).resolves.toMatchObject({ id: 'xai' });
    await expect(loadVoiceProvider('elevenlabs')).resolves.toMatchObject({ id: 'elevenlabs' });
    await expect(loadVoiceProvider('openrouter')).resolves.toMatchObject({ id: 'openrouter' });
    await expect(loadVoiceProvider('ppq')).resolves.toMatchObject({ id: 'ppq' });
    await expect(loadVoiceProvider('venice')).resolves.toMatchObject({ id: 'venice' });
  });

  it('publishes capabilities independently from adapter loading', () => {
    expect(getVoiceProviderDefinition('xai')).toMatchObject({
      execution: 'cloud',
      capabilities: { stt: true, tts: true, streamingTts: true },
    });
    expect(getVoiceProvidersFor('stt').map(provider => provider.id)).toContain('browser-local');
    expect(getVoiceProvidersFor('tts').map(provider => provider.id)).toContain('elevenlabs');
    expect(getVoiceProvidersFor('stt').map(provider => provider.id)).toEqual(
      expect.arrayContaining(['auto', 'openrouter', 'ppq', 'venice']),
    );
    expect(getSharedVoiceProviders().every(provider => (
      provider.capabilities.stt && provider.capabilities.tts
    ))).toBe(true);
  });
});

describe('browser-local voice provider', () => {
  it('requires an explicit model installation before inference', async () => {
    localStorage.clear();
    await expect(browserLocalVoiceProvider.transcribe({
      audio: new Float32Array([0]),
      modelId: 'onnx-community/whisper-small',
      language: 'en',
    })).rejects.toThrow('is not downloaded');
    await expect(browserLocalVoiceProvider.synthesize({
      text: 'Hello',
      modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
      voiceId: 'af_heart',
    })).rejects.toThrow('is not downloaded');
  });
});

describe('OpenAI-compatible local voice provider', () => {
  it('sends multipart transcription directly to the configured local server', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      text: 'local transcript',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await localServerVoiceProvider.transcribe({
      audio: new Blob(['audio'], { type: 'audio/webm' }),
      baseUrl: 'http://localhost:8001',
      apiKey: 'local-secret',
      modelId: 'whisper-small',
      language: 'en',
    });

    expect(result.text).toBe('local transcript');
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:8001/v1/audio/transcriptions');
    expect(init.headers.Authorization).toBe('Bearer local-secret');
    expect(init.body.get('model')).toBe('whisper-small');
    expect(init.body.get('language')).toBe('en');
    expect(init.body.get('file')).toBeInstanceOf(Blob);
  });

  it('uses the OpenAI speech contract and returns progressive audio', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    }));
    const result = await localServerVoiceProvider.synthesize({
      text: 'Hello',
      baseUrl: 'http://localhost:8001',
      modelId: 'kokoro',
      voiceId: 'af_heart',
      rate: 1.2,
    });
    expect(result.stream).toBeInstanceOf(ReadableStream);
    await expect(new Response(result.stream).arrayBuffer())
      .resolves.toEqual(new Uint8Array([1, 2, 3]).buffer);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({
      input: 'Hello',
      model: 'kokoro',
      voice: 'af_heart',
      speed: 1.2,
    });
  });
});

describe('direct browser cloud voice client', () => {
  it('loads only the private Kokoro voice catalogue selected for Venice', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        {
          id: 'tts-kokoro',
          type: 'tts',
          model_spec: {
            privacy: 'private',
            default_voice: 'af_sky',
            voices: ['af_sky', 'bm_george'],
          },
        },
        {
          id: 'tts-expensive',
          type: 'tts',
          model_spec: { privacy: 'anonymized', voices: ['other-voice'] },
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const voices = await fetchVeniceKokoroVoices({ apiKey: 'venice-secret' });

    expect(voices).toEqual([
      expect.objectContaining({ id: 'af_sky', language: 'en-US', descriptor: 'female' }),
      expect.objectContaining({ id: 'bm_george', language: 'en-GB', descriptor: 'male' }),
    ]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.venice.ai/api/v1/models?type=tts',
      expect.objectContaining({ headers: { Authorization: 'Bearer venice-secret' } }),
    );
  });

  it('keeps only the curated live OpenRouter voice models and their advertised voices', async () => {
    globalThis.fetch = vi.fn().mockImplementation(url => Promise.resolve(new Response(JSON.stringify({
      data: String(url).includes('transcription')
        ? [
            { id: 'openai/gpt-4o-mini-transcribe' },
            { id: 'obscure/expensive-transcriber' },
            { id: 'openai/whisper-large-v3-turbo' },
            { id: 'openai/whisper-large-v3' },
          ]
        : [
            {
              id: 'x-ai/grok-voice-tts-1.0',
              supported_voices: ['eve', 'ara', 'rex', 'sal', 'leo'],
            },
            {
              id: 'google/gemini-3.1-flash-tts-preview',
              supported_voices: ['Zephyr', 'Puck'],
            },
            {
              id: 'hexgrad/kokoro-82m',
              supported_voices: ['af_heart', 'bm_george'],
            },
            { id: 'expensive/voice', supported_voices: ['costly'] },
          ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const [sttModels, ttsModels] = await Promise.all([
      fetchOpenRouterVoiceModels('stt', { apiKey: 'or-secret' }),
      fetchOpenRouterVoiceModels('tts', { apiKey: 'or-secret' }),
    ]);

    expect(sttModels.map(model => model.id)).toEqual([
      'openai/whisper-large-v3',
    ]);
    expect(ttsModels.map(model => model.id)).toEqual([
      'hexgrad/kokoro-82m',
    ]);
    expect(voicesForOpenRouterModel(ttsModels[0])).toEqual([
      expect.objectContaining({ id: 'af_heart', language: 'en-US', descriptor: 'female' }),
      expect.objectContaining({ id: 'bm_george', language: 'en-GB', descriptor: 'male' }),
    ]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models?output_modalities=speech',
      expect.objectContaining({ headers: { Authorization: 'Bearer or-secret' } }),
    );
  });

  it('normalizes removed OpenRouter voice models to the curated defaults', async () => {
    localStorage.setItem('labcharts-ai-provider', 'openrouter');
    updateKeyCache('labcharts-openrouter-key', 'or-ai-secret');
    setVoiceSetting('openRouterSttModel', 'openai/whisper-large-v3-turbo');
    localStorage.setItem(VOICE_STORAGE_KEYS.openRouterTtsModel, 'x-ai/grok-voice-tts-1.0');
    localStorage.setItem(VOICE_STORAGE_KEYS.openRouterVoice, 'eve');
    expect(getVoiceSettings()).toMatchObject({
      openRouterTtsModel: 'hexgrad/kokoro-82m',
      openRouterVoice: 'af_heart',
    });
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'OpenRouter transcript' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([4, 6]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }));

    await transcribeVoice(new Blob(['audio'], { type: 'audio/webm' }));
    const synthesizer = await createVoiceSynthesizer();
    await synthesizer.synthesize('Ahoj');

    const transcription = globalThis.fetch.mock.calls[0][1];
    expect(transcription.body.get('model')).toBe('openai/whisper-large-v3');
    const speech = JSON.parse(globalThis.fetch.mock.calls[1][1].body);
    expect(speech).toMatchObject({
      model: 'hexgrad/kokoro-82m',
      voice: 'af_heart',
    });
  });

  it('automatically reuses the active PPQ AI connection for dictation', async () => {
    localStorage.setItem('labcharts-ai-provider', 'ppq');
    updateKeyCache('labcharts-ppq-key', 'ppq-ai-secret');
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      text: 'automatic PPQ transcript',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await transcribeVoice(new Blob(['audio'], { type: 'audio/webm' }), {
      settings: getVoiceSettings(),
    });

    expect(result).toMatchObject({
      text: 'automatic PPQ transcript',
      providerId: 'ppq',
    });
    const [url, request] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.ppq.ai/v1/audio/transcriptions');
    expect(request.headers.Authorization).toBe('Bearer ppq-ai-secret');
    expect(request.body.get('model')).toBe('nova-3');
    expect(request.body.get('language')).toBe('multi');
  });

  it('uses the saved PPQ voice through the automatic AI connection', async () => {
    localStorage.setItem('labcharts-ai-provider', 'ppq');
    updateKeyCache('labcharts-ppq-key', 'ppq-ai-secret');
    setVoiceSetting('ppqVoice', 'aura-2-thalia-en');
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([3, 5]), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    }));

    const synthesizer = await createVoiceSynthesizer();
    await synthesizer.synthesize('Hello from PPQ');

    const [url, request] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.ppq.ai/v1/audio/speech');
    expect(request.headers.Authorization).toBe('Bearer ppq-ai-secret');
    expect(JSON.parse(request.body)).toMatchObject({
      model: 'deepgram_aura_2',
      voice: 'aura-2-thalia-en',
    });
  });

  it('uses the saved Venice Kokoro voice through the automatic AI connection', async () => {
    localStorage.setItem('labcharts-ai-provider', 'venice');
    updateKeyCache('labcharts-venice-key', 'venice-ai-secret');
    setVoiceSetting('veniceVoice', 'bm_george');
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([7, 9]), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    }));

    const synthesizer = await createVoiceSynthesizer();
    await synthesizer.synthesize('Hello from Venice');

    const [url, request] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.venice.ai/api/v1/audio/speech');
    expect(request.headers.Authorization).toBe('Bearer venice-ai-secret');
    expect(JSON.parse(request.body)).toMatchObject({
      model: 'tts-kokoro',
      voice: 'bm_george',
    });
  });

  it('uses private Whisper Large V3 for automatic Venice dictation', async () => {
    localStorage.setItem('labcharts-ai-provider', 'venice');
    updateKeyCache('labcharts-venice-key', 'venice-ai-secret');
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      text: 'accurate Venice transcript',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await transcribeVoice(new Blob(['audio'], { type: 'audio/webm' }));

    expect(result).toMatchObject({
      text: 'accurate Venice transcript',
      providerId: 'venice',
    });
    const [, request] = globalThis.fetch.mock.calls[0];
    expect(request.body.get('model')).toBe('openai/whisper-large-v3');
  });

  it('keeps API keys in authorization headers and uploads audio as multipart', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      text: 'cloud transcript',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await directTranscription('elevenlabs', {
      audio: new Blob(['audio'], { type: 'audio/webm' }),
      apiKey: 'xi-secret',
      modelId: 'scribe_v2',
      language: 'cs',
    });

    expect(result.text).toBe('cloud transcript');
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect(init.headers['xi-api-key']).toBe('xi-secret');
    expect(init.credentials).toBe('omit');
    expect(init.body.get('model_id')).toBe('scribe_v2');
    expect(init.body.get('language_code')).toBe('cs');
  });

  it('uses OpenAI-compatible voice contracts for AI-provider connections', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'PPQ transcript' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([7, 8]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }));

    await directTranscription('ppq', {
      audio: new Blob(['audio'], { type: 'audio/webm' }),
      apiKey: 'ppq-secret',
      modelId: 'nova-3',
      language: 'auto',
    });
    const transcription = globalThis.fetch.mock.calls[0][1];
    expect(transcription.body.get('model')).toBe('nova-3');
    expect(transcription.body.get('response_format')).toBe('json');
    expect(transcription.body.get('language')).toBe('multi');

    await directSynthesis('openrouter', {
      apiKey: 'or-secret',
      text: 'Hello',
      modelId: 'hexgrad/kokoro-82m',
      voiceId: 'af_heart',
    });
    const speech = JSON.parse(globalThis.fetch.mock.calls[1][1].body);
    expect(speech).toMatchObject({
      input: 'Hello',
      model: 'hexgrad/kokoro-82m',
      voice: 'af_heart',
    });
  });

  it('explains OpenRouter privacy guardrail failures', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        message: 'No endpoints available matching your guardrail restrictions and data policy.',
      },
    }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    await expect(directSynthesis('openrouter', {
      apiKey: 'or-secret',
      text: 'Hello',
      modelId: 'hexgrad/kokoro-82m',
      voiceId: 'af_heart',
    })).rejects.toThrow('openrouter.ai/settings/privacy');
  });

  it('returns a progressive TTS stream and normalizes provider voice catalogues', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([4, 5]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        voices: [{
          voice_id: 'voice-1',
          name: 'Calm',
          labels: { language: 'en', gender: 'female' },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const speech = await directSynthesis('elevenlabs', {
      apiKey: 'xi-secret',
      text: 'Hello',
      voiceId: 'voice-1',
      modelId: 'eleven_multilingual_v2',
    });
    expect(speech.stream).toBeInstanceOf(ReadableStream);
    expect(speech.contentType).toBe('audio/mpeg');
    await expect(new Response(speech.stream).arrayBuffer())
      .resolves.toEqual(new Uint8Array([4, 5]).buffer);

    const voices = await directVoices('elevenlabs', { apiKey: 'xi-secret' });
    expect(voices).toEqual([expect.objectContaining({
      id: 'voice-1',
      name: 'Calm',
      language: 'en',
      descriptor: 'female',
    })]);
  });

  it('loads PPQ Deepgram voices compatible with the selected language', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        {
          id: 'aura-english',
          name: 'English Voice',
          model_id: 'deepgram_aura_2',
          language: 'en',
          gender: 'female',
        },
        {
          id: 'aura-french',
          name: 'French Voice',
          model_id: 'deepgram_aura_2',
          language: 'fr',
          gender: 'male',
        },
        {
          id: 'eleven-english',
          name: 'Wrong model',
          model_id: 'eleven_v3',
          language: 'en',
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const voices = await directVoices('ppq', {
      apiKey: 'ppq-secret',
      language: 'en',
    });

    expect(voices).toEqual([expect.objectContaining({
      id: 'aura-english',
      name: 'English Voice',
      language: 'en',
      descriptor: 'female',
    })]);
  });

  it('turns nested provider error payloads into readable messages', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: {
        status: 'invalid_api_key',
        message: 'The ElevenLabs API key is invalid.',
      },
    }), { status: 401, headers: { 'Content-Type': 'application/json' } }));

    await expect(directVoices('elevenlabs', { apiKey: 'bad-key' }))
      .rejects.toThrow('The ElevenLabs API key is invalid.');
  });

  it('does not send ElevenLabs speech without an explicit voice selection', async () => {
    globalThis.fetch = vi.fn();
    await expect(directSynthesis('elevenlabs', {
      apiKey: 'xi-secret',
      text: 'Hello',
      voiceId: '',
    })).rejects.toThrow('Refresh ElevenLabs voices and choose a voice');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('voice provider error handling', () => {
  it('turns nested local-server errors into readable messages', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        detail: [{ message: 'The local model could not be loaded.' }],
      },
    }), { status: 503, headers: { 'Content-Type': 'application/json' } }));

    await expect(localServerVoiceProvider.testConnection({ baseUrl: 'http://127.0.0.1:8765' }))
      .rejects.toThrow('The local model could not be loaded.');
  });
});
