// @vitest-environment jsdom
import type { VoiceKind, VoiceReply, VoiceRequest } from '../types/voice-local.js';

import { afterEach, describe, expect, it } from 'vitest';

import {
  configureVoiceLocalEngine,
  getLocalVoiceModelStatus,
  installLocalVoiceModel,
  terminateLocalVoiceWorkers,
  transcribeLocalAudio,
  synthesizeLocalSpeech,
  streamLocalSpeech,
} from '../js/voice-local-engine.js';

type VoiceResponder = ((worker: RespondingVoiceWorker, request: VoiceRequest) => void) & { respondAfterTermination?: boolean };
class RespondingVoiceWorker extends EventTarget {
  declare kind: VoiceKind;
  declare respondToRequest: VoiceResponder;
  declare requests: VoiceRequest[];
  declare terminated: boolean;
  constructor(kind: VoiceKind, respond: VoiceResponder) {
    super();
    this.kind = kind;
    this.respondToRequest = respond;
    this.requests = [];
    this.terminated = false;
  }

  postMessage(request: VoiceRequest) {
    this.requests.push(request);
    queueMicrotask(() => {
      if (!this.terminated || this.respondToRequest.respondAfterTermination) {
        this.respondToRequest(this, request);
      }
    });
  }

  respond(data: VoiceReply) {
    const event = new Event('message');
    Object.defineProperty(event, 'data', { value: data });
    this.dispatchEvent(event);
  }

  terminate() {
    this.terminated = true;
  }
}

function workerKind(url: URL) {
  return String(url).includes('voice-local-tts-worker') ? 'tts' : 'stt';
}

afterEach(() => {
  terminateLocalVoiceWorkers();
  localStorage.clear();
});

describe('local voice worker memory safety', () => {
  it('terminates the resident Whisper worker before allocating Kokoro', async () => {
    const workers: RespondingVoiceWorker[] = [];
    const previous = configureVoiceLocalEngine({
      workerFactory: url => {
        const kind = workerKind(url);
        const worker = new RespondingVoiceWorker(kind, (instance, request) => {
          instance.respond({
            type: 'ready',
            id: request.id,
            kind,
            model: request.model,
            backend: 'wasm',
          });
        });
        workers.push(worker);
        return worker;
      },
    });
    try {
      await installLocalVoiceModel('stt', 'test-whisper-exclusive', undefined, 'wasm');
      expect(workers).toHaveLength(1);
      expect(workers[0]!.terminated).toBe(false);

      await installLocalVoiceModel('tts', 'test-kokoro-exclusive', undefined, 'wasm');
      expect(workers).toHaveLength(2);
      expect(workers[0]!.kind).toBe('stt');
      expect(workers[0]!.terminated).toBe(true);
      expect(workers[1]!.kind).toBe('tts');
    } finally {
      terminateLocalVoiceWorkers();
      configureVoiceLocalEngine(previous);
    }
  });

  it('retries a recoverable Whisper GPU error on CPU with an intact audio buffer', async () => {
    const model = 'test-whisper-gpu-fallback';
    const marker = `labcharts-voice-model-installed-stt-${encodeURIComponent(model)}`;
    localStorage.setItem(marker, JSON.stringify({
      version: '2',
      model,
      backend: 'webgpu',
      availableBackends: ['webgpu'],
    }));
    const workers: RespondingVoiceWorker[] = [];
    const previous = configureVoiceLocalEngine({
      workerFactory: url => {
        const worker = new RespondingVoiceWorker(workerKind(url), (instance, request) => {
          if (request.backend === 'webgpu') {
            instance.respond({
              type: 'error',
              id: request.id,
              backend: 'webgpu',
              message: 'WebGPU device was lost',
            });
            return;
          }
          instance.respond({
            type: 'transcript',
            id: request.id,
            model,
            backend: 'wasm',
            text: 'CPU fallback worked',
            inferenceMs: 25,
          });
        });
        workers.push(worker);
        return worker;
      },
    });
    try {
      const samples = new Float32Array([0, 0.25, -0.25, 0.5]);
      const result = await transcribeLocalAudio(samples, {
        model,
        language: 'en',
        backend: 'webgpu',
      });

      expect(result).toMatchObject({
        text: 'CPU fallback worked',
        backend: 'wasm',
        fallbackReason: 'WebGPU device was lost',
      });
      expect(workers).toHaveLength(2);
      expect(workers[0]!.terminated).toBe(true);
      expect(workers[1]!.requests[0]!.backend).toBe('wasm');
      expect((workers[1]!.requests[0]!.audio as ArrayBuffer).byteLength).toBe(samples.byteLength);
      expect(getLocalVoiceModelStatus('stt', model)).toMatchObject({
        backend: 'wasm',
        availableBackends: expect.arrayContaining(['webgpu', 'wasm']),
      });
    } finally {
      terminateLocalVoiceWorkers();
      configureVoiceLocalEngine(previous);
    }
  });
});

it.each(['buffered', 'stream-before', 'stream-after'] as const)('keeps TTS CPU retry before the first audio chunk (%s)', async mode => {
  const model = 'test-kokoro-cpu-retry';
  localStorage.setItem(`labcharts-voice-model-installed-tts-${encodeURIComponent(model)}`, JSON.stringify({
    version: '2', model, backend: 'webgpu', availableBackends: ['wasm', 'webgpu'],
  }));
  const workers: RespondingVoiceWorker[] = [];
  const samples = new Float32Array([0.25, -0.25]);
  const previous = configureVoiceLocalEngine({
    workerFactory: url => {
      const worker = new RespondingVoiceWorker(workerKind(url), (instance, request) => {
        const chunk = { type: 'audio-chunk', id: request.id, samples: samples.slice().buffer, sampleRate: 24000 };
        if (request.backend === 'webgpu') {
          if (mode === 'stream-after') instance.respond(chunk);
          instance.respond({ type: 'error', id: request.id, backend: 'webgpu', message: 'GPU inference failed' });
          return;
        }
        if (mode !== 'buffered') instance.respond(chunk);
        instance.respond({
          type: mode === 'buffered' ? 'audio' : 'audio-done', id: request.id, model, backend: 'wasm',
          samples: samples.slice().buffer, sampleRate: 24000, inferenceMs: 5, audioSeconds: samples.length / 24000,
        });
      });
      workers.push(worker);
      return worker;
    },
  });
  try {
    const options = { model, backend: 'webgpu' };
    if (mode === 'buffered') {
      const result = await synthesizeLocalSpeech('Hello', options);
      expect([...result.samples]).toEqual([...samples]);
      expect(result).toMatchObject({ backend: 'wasm', fallbackReason: 'GPU inference failed' });
    } else {
      const reader = streamLocalSpeech('Hello', options).getReader();
      const first = await reader.read();
      expect(first.done).toBe(false);
      expect([...first.value!.samples]).toEqual([...samples]);
      if (mode === 'stream-after') {
        await expect(reader.read()).rejects.toMatchObject({ message: 'GPU inference failed', voiceBackend: 'webgpu' });
      } else {
        await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
      }
    }
    expect(workers).toHaveLength(mode === 'stream-after' ? 1 : 2);
    if (mode !== 'stream-after') {
      expect(workers[0]!.terminated).toBe(true);
      expect(workers[1]!.requests[0]!.backend).toBe('wasm');
      expect(getLocalVoiceModelStatus('tts', model)).toMatchObject({ backend: 'wasm', fallbackReason: 'GPU inference failed' });
    }
  } finally {
    terminateLocalVoiceWorkers();
    configureVoiceLocalEngine(previous);
  }
});
