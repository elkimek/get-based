import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough, Writable } from 'node:stream';

vi.mock('../lib/proxy-network.js', () => ({
  fetchWithPinnedProxyDns: (url, options) => globalThis.fetch(url, options),
}));

import voiceEntrypoint, { handler } from '../api/voice.js';
import { handleDevVoiceRelay } from '../lib/dev-voice-relay.js';

const realFetch = globalThis.fetch;
let savedEnv;

function voiceRequest(action, provider, body = {}, headers = {}) {
  const isForm = body instanceof FormData;
  return new Request(`https://getbased.health/api/voice?action=${action}`, {
    method: 'POST',
    headers: {
      origin: 'https://getbased.health',
      authorization: 'Bearer user-provider-key',
      'x-voice-provider': provider,
      ...(isForm ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: typeof body === 'string' || isForm ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  savedEnv = {
    VERCEL: process.env.VERCEL,
    PROXY_ALLOW_INSTANCE_RATE_LIMIT: process.env.PROXY_ALLOW_INSTANCE_RATE_LIMIT,
  };
  delete process.env.VERCEL;
  process.env.PROXY_ALLOW_INSTANCE_RATE_LIMIT = '1';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

describe('voice relay runtime', () => {
  it('uses the Web-standard Vercel entrypoint and rejects unknown providers', async () => {
    expect(voiceEntrypoint).toEqual({ fetch: handler });
    const response = await handler(voiceRequest('tts', 'attacker', { text: 'Hello' }));
    expect(response.status).toBe(400);
    expect(globalThis.fetch).toBe(realFetch);
  });

  it('relays xAI TTS as bounded binary without logging or returning the key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '3' },
    }));
    const response = await handler(voiceRequest('tts', 'xai', {
      text: 'Hello',
      voiceId: 'eve',
      language: 'en',
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.x.ai/v1/tts');
    expect(init.headers.Authorization).toBe('Bearer user-provider-key');
  });

  it('preserves multipart STT bodies and maps ElevenLabs authentication', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      text: 'transcribed',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const form = new FormData();
    form.append('model_id', 'scribe_v2');
    form.append('file', new Blob(['audio'], { type: 'audio/webm' }), 'recording.webm');
    const request = voiceRequest('stt', 'elevenlabs', form);
    const response = await handler(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ text: 'transcribed' });
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect(init.headers['xi-api-key']).toBe('user-provider-key');
    expect(init.headers['Content-Type']).toMatch(/^multipart\/form-data;/);
  });

  it('uses ElevenLabs streaming TTS and preserves the streamed response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
        controller.close();
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    }));
    const response = await handler(voiceRequest('tts', 'elevenlabs', {
      text: 'Hello',
      voiceId: 'voice-safe',
      modelId: 'eleven_multilingual_v2',
    }));
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer()))
      .toEqual(new Uint8Array([1, 2, 3, 4]));
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/v1/text-to-speech/voice-safe/stream');
  });

  it('relays PPQ voice requests to fixed OpenAI-compatible audio endpoints', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([9, 8, 7]), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    }));
    const response = await handler(voiceRequest('tts', 'ppq', {
      text: 'Hello from PPQ',
      modelId: 'deepgram_aura_2',
      language: 'en',
    }));
    expect(response.status).toBe(200);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.ppq.ai/v1/audio/speech');
    expect(init.headers.Authorization).toBe('Bearer user-provider-key');
    expect(JSON.parse(init.body)).toMatchObject({
      input: 'Hello from PPQ',
      model: 'deepgram_aura_2',
      language: 'en',
    });
    expect(JSON.parse(init.body)).not.toHaveProperty('response_format');
  });

  it('relays the live PPQ voice catalogue from its fixed endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      object: 'list',
      data: [{ id: 'aura-2-thalia-en', model_id: 'deepgram_aura_2' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const response = await handler(voiceRequest('voices', 'ppq'));
    expect(response.status).toBe(200);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.ppq.ai/v1/audio/voices');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer user-provider-key');
  });

  it('answers preflight without initializing an upstream request', async () => {
    const response = await handler(new Request('https://getbased.health/api/voice', {
      method: 'OPTIONS',
      headers: { origin: 'https://getbased.health' },
    }));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')).toContain('Authorization');
  });

  it('bridges the same Web handler through the local Node dev server', async () => {
    const request = new PassThrough();
    request.method = 'POST';
    request.url = '/api/voice?action=tts';
    request.headers = {
      host: '127.0.0.1:8000',
      origin: 'http://127.0.0.1:8000',
      'content-type': 'application/json',
    };
    const chunks = [];
    let status = 0;
    const response = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });
    response.headersSent = false;
    response.writeHead = (nextStatus) => {
      status = nextStatus;
      response.headersSent = true;
      return response;
    };
    const finished = new Promise(resolve => response.once('finish', resolve));
    const localHandler = vi.fn(async webRequest => new Response(
      JSON.stringify({ echoed: await webRequest.json() }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    ));

    expect(handleDevVoiceRelay(request, response, { handler: localHandler })).toBe(true);
    request.end(JSON.stringify({ text: 'local bridge' }));
    await finished;

    expect(status).toBe(201);
    expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual({
      echoed: { text: 'local bridge' },
    });
  });

  it('aborts the upstream Web request when the local client disconnects', async () => {
    const request = new PassThrough();
    request.method = 'POST';
    request.url = '/api/voice?action=tts';
    request.headers = {
      host: '127.0.0.1:8000',
      'content-type': 'application/json',
    };
    const response = new Writable({
      write(_chunk, _encoding, callback) { callback(); },
    });
    response.headersSent = false;
    response.writeHead = vi.fn();
    const aborted = new Promise(resolve => {
      handleDevVoiceRelay(request, response, {
        handler: async webRequest => {
          webRequest.signal.addEventListener('abort', () => resolve(webRequest.signal.reason), {
            once: true,
          });
          return new Promise(() => {});
        },
      });
    });

    request.end(JSON.stringify({ text: 'disconnect me' }));
    response.emit('close');

    await expect(aborted).resolves.toMatchObject({ name: 'AbortError' });
    expect(response.writeHead).not.toHaveBeenCalled();
  });
});
