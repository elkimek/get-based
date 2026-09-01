// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  configureVoiceLocalEngine,
  getLocalVoiceModelStatus,
  installLocalVoiceModel,
  terminateLocalVoiceWorkers,
  transcribeLocalAudio,
} from '../js/voice-local-engine.js';

class RespondingVoiceWorker extends EventTarget {
  constructor(kind, respond) {
    super();
    this.kind = kind;
    this.respondToRequest = respond;
    this.requests = [];
    this.terminated = false;
  }

  postMessage(request) {
    this.requests.push(request);
    queueMicrotask(() => {
      if (!this.terminated || this.respondToRequest.respondAfterTermination) {
        this.respondToRequest(this, request);
      }
    });
  }

  respond(data) {
    const event = new Event('message');
    Object.defineProperty(event, 'data', { value: data });
    this.dispatchEvent(event);
  }

  terminate() {
    this.terminated = true;
  }
}

function workerKind(url) {
  return String(url).includes('voice-local-tts-worker') ? 'tts' : 'stt';
}

afterEach(() => {
  terminateLocalVoiceWorkers();
  localStorage.clear();
});

describe('local voice worker memory safety', () => {
  it('terminates the resident Whisper worker before allocating Kokoro', async () => {
    const workers = [];
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
      expect(workers[0].terminated).toBe(false);

      await installLocalVoiceModel('tts', 'test-kokoro-exclusive', undefined, 'wasm');
      expect(workers).toHaveLength(2);
      expect(workers[0].kind).toBe('stt');
      expect(workers[0].terminated).toBe(true);
      expect(workers[1].kind).toBe('tts');
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
    const workers = [];
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
      expect(workers[0].terminated).toBe(true);
      expect(workers[1].requests[0].backend).toBe('wasm');
      expect(workers[1].requests[0].audio.byteLength).toBe(samples.byteLength);
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
