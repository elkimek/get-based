import { describe, expect, it } from 'vitest';

import {
  normalizeVoiceAction,
  normalizeVoiceProvider,
  normalizeVoiceTtsPayload,
  readVoiceBearer,
  readVoiceRequestBytes,
  voiceUpstream,
} from '../lib/voice-relay-policy.js';

describe('voice relay policy', () => {
  it('only accepts the explicit provider and action allowlists', () => {
    expect(normalizeVoiceProvider('xai')).toBe('xai');
    expect(normalizeVoiceProvider('elevenlabs')).toBe('elevenlabs');
    expect(normalizeVoiceProvider('openrouter')).toBe('openrouter');
    expect(normalizeVoiceProvider('ppq')).toBe('ppq');
    expect(normalizeVoiceProvider('venice')).toBe('venice');
    expect(normalizeVoiceProvider('https://attacker.test')).toBeNull();
    expect(normalizeVoiceAction('stt')).toBe('stt');
    expect(normalizeVoiceAction('tts')).toBe('tts');
    expect(normalizeVoiceAction('voices')).toBe('voices');
    expect(normalizeVoiceAction('proxy')).toBeNull();
  });

  it('accepts bounded bearer values without returning malformed headers', () => {
    expect(readVoiceBearer(new Request('https://getbased.health/api/voice', {
      headers: { Authorization: 'Bearer secret' },
    }))).toBe('secret');
    expect(readVoiceBearer(new Request('https://getbased.health/api/voice', {
      headers: { Authorization: 'Basic secret' },
    }))).toBe('');
  });

  it('maps providers to fixed upstream hosts and sanitizes TTS fields', () => {
    const xaiPayload = normalizeVoiceTtsPayload('xai', {
      text: 'Hello',
      voiceId: '../../evil',
      language: 'en',
      rate: 2,
    });
    const xai = voiceUpstream('xai', 'tts', 'secret', xaiPayload);
    expect(xai.url).toBe('https://api.x.ai/v1/tts');
    expect(JSON.parse(xai.body)).toMatchObject({
      text: 'Hello',
      voice_id: 'eve',
      language: 'en',
      speed: 1.5,
    });

    const elevenPayload = normalizeVoiceTtsPayload('elevenlabs', {
      text: 'Hello',
      voiceId: 'voice-safe',
      modelId: 'eleven_multilingual_v2',
      rate: 1.5,
    });
    const eleven = voiceUpstream('elevenlabs', 'tts', 'secret', elevenPayload);
    expect(eleven.url).toContain('https://api.elevenlabs.io/v1/text-to-speech/voice-safe/stream');
    expect(JSON.parse(eleven.body)).toMatchObject({
      model_id: 'eleven_multilingual_v2',
      voice_settings: { speed: 1.2 },
    });
    expect(() => normalizeVoiceTtsPayload('elevenlabs', {
      text: 'Hello',
      voiceId: '',
    })).toThrow('An ElevenLabs voice is required.');

    const openRouterPayload = normalizeVoiceTtsPayload('openrouter', {
      text: 'Hello',
      modelId: 'hexgrad/kokoro-82m',
      voiceId: 'af_heart',
      language: 'cs',
      rate: 1.25,
    });
    const openRouter = voiceUpstream('openrouter', 'tts', 'secret', openRouterPayload);
    expect(openRouter.url).toBe('https://openrouter.ai/api/v1/audio/speech');
    expect(JSON.parse(openRouter.body)).toEqual({
      input: 'Hello',
      model: 'hexgrad/kokoro-82m',
      voice: 'af_heart',
      speed: 1.25,
      response_format: 'mp3',
    });
    expect(openRouter.headers.Accept).toBe('audio/mpeg');

    expect(normalizeVoiceTtsPayload('openrouter', { text: 'Default voice' })).toMatchObject({
      model: 'hexgrad/kokoro-82m',
      voice: 'af_heart',
      response_format: 'mp3',
    });

    const ppq = voiceUpstream('ppq', 'stt', 'secret');
    expect(ppq.url).toBe('https://api.ppq.ai/v1/audio/transcriptions');
    const ppqVoices = voiceUpstream('ppq', 'voices', 'secret');
    expect(ppqVoices).toMatchObject({
      url: 'https://api.ppq.ai/v1/audio/voices',
      method: 'GET',
    });
    const ppqSpeech = voiceUpstream('ppq', 'tts', 'secret', normalizeVoiceTtsPayload(
      'ppq',
      { text: 'Hello', language: 'en' },
    ));
    expect(JSON.parse(ppqSpeech.body)).toEqual({
      input: 'Hello',
      model: 'deepgram_aura_2',
      language: 'en',
    });
    const venice = voiceUpstream('venice', 'tts', 'secret', normalizeVoiceTtsPayload(
      'venice',
      { text: 'Hello', language: 'en' },
    ));
    expect(venice.url).toBe('https://api.venice.ai/api/v1/audio/speech');
    expect(JSON.parse(venice.body)).toMatchObject({
      model: 'tts-kokoro',
      voice: 'af_sky',
      language: 'en',
      streaming: true,
    });
  });

  it('caps streamed request bodies before buffering the rest', async () => {
    let cancelled = false;
    const request = {
      headers: new Headers(),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(6));
          controller.enqueue(new Uint8Array(6));
        },
        cancel() {
          cancelled = true;
        },
      }),
    };
    await expect(readVoiceRequestBytes(request, 10)).rejects.toMatchObject({
      code: 'VOICE_REQUEST_TOO_LARGE',
    });
    expect(cancelled).toBe(true);
  });
});
