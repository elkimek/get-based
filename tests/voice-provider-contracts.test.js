import { afterEach, describe, expect, it, vi } from 'vitest';

import { localServerVoiceProvider } from '../js/voice-provider-local-server.js';
import { browserLocalVoiceProvider } from '../js/voice-provider-browser-local.js';
import {
  relaySynthesis,
  relayTranscription,
  relayVoices,
} from '../js/voice-provider-cloud-shared.js';
import { loadVoiceProvider } from '../js/voice-provider-registry.js';
import {
  getSharedVoiceProviders,
  getVoiceProviderDefinition,
  getVoiceProvidersFor,
} from '../js/voice-provider-catalog.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('voice provider registry', () => {
  it('loads every provider through literal lazy boundaries', async () => {
    await expect(loadVoiceProvider('browser-local')).resolves.toMatchObject({ id: 'browser-local' });
    await expect(loadVoiceProvider('local-server')).resolves.toMatchObject({ id: 'local-server' });
    await expect(loadVoiceProvider('xai')).resolves.toMatchObject({ id: 'xai' });
    await expect(loadVoiceProvider('elevenlabs')).resolves.toMatchObject({ id: 'elevenlabs' });
  });

  it('publishes capabilities independently from adapter loading', () => {
    expect(getVoiceProviderDefinition('xai')).toMatchObject({
      execution: 'cloud',
      capabilities: { stt: true, tts: true, streamingTts: true },
    });
    expect(getVoiceProvidersFor('stt').map(provider => provider.id)).toContain('browser-local');
    expect(getVoiceProvidersFor('tts').map(provider => provider.id)).toContain('elevenlabs');
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

describe('hosted voice relay client', () => {
  it('keeps API keys in authorization headers and uploads audio as multipart', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      text: 'cloud transcript',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await relayTranscription('elevenlabs', {
      audio: new Blob(['audio'], { type: 'audio/webm' }),
      apiKey: 'xi-secret',
      modelId: 'scribe_v2',
      language: 'cs',
    });

    expect(result.text).toBe('cloud transcript');
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/voice?action=stt');
    expect(init.headers.Authorization).toBe('Bearer xi-secret');
    expect(init.headers['X-Voice-Provider']).toBe('elevenlabs');
    expect(init.body.get('model_id')).toBe('scribe_v2');
    expect(init.body.get('language_code')).toBe('cs');
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

    const speech = await relaySynthesis('elevenlabs', {
      apiKey: 'xi-secret',
      text: 'Hello',
      voiceId: 'voice-1',
      modelId: 'eleven_multilingual_v2',
    });
    expect(speech.stream).toBeInstanceOf(ReadableStream);
    expect(speech.contentType).toBe('audio/mpeg');
    await expect(new Response(speech.stream).arrayBuffer())
      .resolves.toEqual(new Uint8Array([4, 5]).buffer);

    const voices = await relayVoices('elevenlabs', { apiKey: 'xi-secret' });
    expect(voices).toEqual([expect.objectContaining({
      id: 'voice-1',
      name: 'Calm',
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

    await expect(relayVoices('elevenlabs', { apiKey: 'bad-key' }))
      .rejects.toThrow('The ElevenLabs API key is invalid.');
  });

  it('does not send ElevenLabs speech without an explicit voice selection', async () => {
    globalThis.fetch = vi.fn();
    await expect(relaySynthesis('elevenlabs', {
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
