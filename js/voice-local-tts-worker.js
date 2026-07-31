// @ts-check
// voice-local-tts-worker.js — Kokoro inference in a dedicated module worker.

import { getErrorMessage } from './caught-error.js';

const DEFAULT_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

/**
 * @typedef {{
 *   model: string,
 *   backend: string,
 *   fallbackReason?: string,
 *   streamed: true,
 *   sampleRate: number,
 *   inferenceMs: number,
 *   audioSeconds: number,
 * }} StreamedSpeechResult
 */
/**
 * @typedef {{
 *   model: string,
 *   backend: string,
 *   fallbackReason?: string,
 *   streamed?: false,
 *   samples: Float32Array,
 *   sampleRate: number,
 *   inferenceMs: number,
 *   audioSeconds: number,
 * }} BufferedSpeechResult
 */

let synthesizer = null;
let activeModel = '';
let activeBackend = '';
let activeFallbackReason = '';
let kokoroModule = null;

function isMockMode() {
  return new URLSearchParams(self.location.search || '').has('mock');
}

function postProgress(id, progress) {
  const safe = {};
  for (const key of ['status', 'name', 'file', 'progress', 'loaded', 'total']) {
    const value = progress?.[key];
    if (typeof value === 'string' || typeof value === 'number') safe[key] = value;
  }
  self.postMessage({ type: 'progress', id, kind: 'tts', progress: safe });
}

async function ensureKokoro() {
  if (!kokoroModule) {
    // @ts-expect-error Browser module workers can import the pinned HTTPS module.
    kokoroModule = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js');
  }
  return kokoroModule;
}

/** @template T @param {() => Promise<T>} operation @returns {Promise<T>} */
async function withoutUnknownLengthWarning(operation) {
  const previous = console.warn;
  const previousError = console.error;
  const expected = args => args.map(value => String(value)).join(' ');
  console.warn = (...args) => {
    const message = expected(args);
    if (message.includes('Unable to determine content-length from response headers')) return;
    previous(...args);
  };
  console.error = (...args) => {
    const message = expected(args);
    if (message.includes('VerifyEachNodeIsAssignedToAnEp')) return;
    previousError(...args);
  };
  try {
    return await operation();
  } finally {
    console.warn = previous;
    console.error = previousError;
  }
}

function normalizeBackend(value) {
  return ['auto', 'webgpu', 'wasm'].includes(value) ? value : 'auto';
}

async function prepareWebGpu() {
  if (!self.navigator?.gpu) throw new Error('Graphics processing is not available in this browser.');
  const adapter = await self.navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('The browser could not access a graphics processor.');
}

async function validateWebGpuSpeech(tts) {
  const audio = await tts.generate('This is a voice test.', { voice: 'af_heart' });
  const raw = audio?.audio || audio?.data;
  const samples = raw instanceof Float32Array ? raw : new Float32Array(raw || []);
  let peak = 0;
  let sumSquares = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) throw new Error('Graphics speech validation produced invalid audio.');
    peak = Math.max(peak, Math.abs(sample));
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, samples.length));
  if (samples.length < 12_000 || peak < 0.03 || peak > 0.95 || rms < 0.02) {
    throw new Error('Graphics speech validation failed on this device. Use Automatic or Main processor.');
  }
}

async function createSynthesizer(KokoroTTS, model, backend, id) {
  if (backend === 'webgpu') await prepareWebGpu();
  const tts = await withoutUnknownLengthWarning(() => (
    KokoroTTS.from_pretrained(model, {
      device: backend,
      dtype: backend === 'webgpu' ? 'fp32' : 'q8',
      progress_callback: progress => postProgress(id, progress),
    })
  ));
  if (backend === 'webgpu') {
    try {
      await validateWebGpuSpeech(tts);
    } catch (error) {
      await tts?.model?.dispose?.().catch?.(() => {});
      throw error;
    }
  }
  return tts;
}

async function loadSynthesizer(model, id, backendPreference = 'auto', preferredBackend = 'wasm') {
  const requestedModel = String(model || DEFAULT_MODEL);
  const requestedBackend = normalizeBackend(backendPreference);
  const autoPreference = ['webgpu', 'wasm'].includes(preferredBackend) ? preferredBackend : 'wasm';
  const activeMatches = requestedBackend === 'auto'
    ? activeBackend === autoPreference || !!activeFallbackReason
    : activeBackend === requestedBackend;
  if (synthesizer && activeModel === requestedModel && activeMatches) {
    return {
      model: activeModel,
      backend: activeBackend,
      fallbackReason: activeFallbackReason || undefined,
    };
  }
  await synthesizer?.model?.dispose?.().catch?.(() => {});
  synthesizer = null;

  if (isMockMode()) {
    activeModel = requestedModel;
    activeBackend = 'mock';
    activeFallbackReason = '';
    return { model: activeModel, backend: activeBackend };
  }

  const { KokoroTTS } = await ensureKokoro();
  const candidates = requestedBackend === 'auto'
    ? [autoPreference, autoPreference === 'webgpu' ? 'wasm' : 'webgpu']
    : [requestedBackend];
  let fallbackReason = '';
  for (const backend of candidates) {
    try {
      synthesizer = await createSynthesizer(KokoroTTS, requestedModel, backend, id);
      activeModel = requestedModel;
      activeBackend = backend;
      activeFallbackReason = fallbackReason;
      return {
        model: activeModel,
        backend: activeBackend,
        fallbackReason: fallbackReason || undefined,
      };
    } catch (error) {
      if (requestedBackend !== 'auto' || backend === candidates.at(-1)) throw error;
      fallbackReason = getErrorMessage(error, 'Graphics initialization failed');
      await synthesizer?.model?.dispose?.().catch?.(() => {});
      synthesizer = null;
    }
  }
  throw new Error('No local speech backend is available.');
}

function concatenateAudio(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/** @returns {Promise<StreamedSpeechResult | BufferedSpeechResult>} */
async function synthesize(message) {
  const ready = await loadSynthesizer(
    message.model,
    message.id,
    message.backend,
    message.preferredBackend,
  );
  if (isMockMode()) {
    const sampleRate = 24_000;
    const samples = new Float32Array(Math.round(sampleRate * 0.12));
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.sin(2 * Math.PI * 440 * index / sampleRate) * 0.08;
    }
    if (message.streaming) {
      /** @type {any} */ (self).postMessage({
        type: 'audio-chunk',
        id: message.id,
        kind: 'tts',
        sampleRate,
        samples: samples.buffer,
      }, [samples.buffer]);
      return { ...ready, streamed: true, sampleRate, inferenceMs: 0, audioSeconds: 0.12 };
    }
    return { ...ready, samples, sampleRate, inferenceMs: 0, audioSeconds: 0.12 };
  }

  const startedAt = performance.now();
  const { TextSplitterStream } = await ensureKokoro();
  const splitter = new TextSplitterStream();
  splitter.push(String(message.text || ''));
  splitter.close();
  const parts = [];
  let emittedParts = 0;
  let emittedSamples = 0;
  let sampleRate = 24_000;
  for await (const chunk of synthesizer.stream(splitter, {
    voice: message.voice || 'af_heart',
    speed: Number(message.rate) || 1,
  })) {
    const raw = chunk?.audio;
    const samples = raw?.audio || raw?.data;
    sampleRate = Number(raw?.sampling_rate || raw?.sampleRate) || sampleRate;
    if (!samples) continue;
    const part = samples instanceof Float32Array ? samples : new Float32Array(samples);
    emittedSamples += part.length;
    if (message.streaming) {
      const transferable = part.slice();
      /** @type {any} */ (self).postMessage({
        type: 'audio-chunk',
        id: message.id,
        kind: 'tts',
        sampleRate,
        samples: transferable.buffer,
      }, [transferable.buffer]);
      emittedParts += 1;
    } else {
      parts.push(part);
    }
  }
  if (message.streaming) {
    if (!emittedParts) throw new Error('Kokoro returned no audio.');
    return {
      ...ready,
      streamed: true,
      sampleRate,
      inferenceMs: performance.now() - startedAt,
      audioSeconds: emittedSamples / sampleRate,
    };
  }
  if (!parts.length) throw new Error('Kokoro returned no audio.');
  return {
    ...ready,
    samples: concatenateAudio(parts),
    sampleRate,
    inferenceMs: performance.now() - startedAt,
    audioSeconds: emittedSamples / sampleRate,
  };
}

self.addEventListener('message', async event => {
  if (event.origin && event.origin !== self.location.origin) return;
  const message = event.data || {};
  const id = message.id;
  try {
    if (message.type === 'init') {
      const ready = await loadSynthesizer(
        message.model,
        id,
        message.backend,
        message.preferredBackend,
      );
      self.postMessage({ type: 'ready', id, kind: 'tts', ...ready });
      return;
    }
    if (message.type === 'synthesize') {
      const result = await synthesize(message);
      if (!('samples' in result)) {
        self.postMessage({
          type: 'audio-done',
          id,
          kind: 'tts',
          model: result.model,
          backend: result.backend,
          fallbackReason: result.fallbackReason,
          sampleRate: result.sampleRate,
          inferenceMs: result.inferenceMs,
          audioSeconds: result.audioSeconds,
        });
        return;
      }
      /** @type {any} */ (self).postMessage(
        { type: 'audio', id, kind: 'tts', ...result, samples: result.samples.buffer },
        [result.samples.buffer],
      );
      return;
    }
    if (message.type === 'dispose') {
      await synthesizer?.model?.dispose?.();
      synthesizer = null;
      activeModel = '';
      activeBackend = '';
      activeFallbackReason = '';
      self.postMessage({ type: 'disposed', id, kind: 'tts' });
      return;
    }
    throw new Error(`Unknown TTS worker message: ${message.type}`);
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      kind: 'tts',
      message: getErrorMessage(error, 'Local speech generation failed'),
    });
  }
});
