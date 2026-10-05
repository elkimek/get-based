import type { VoiceGpu, VoiceProgress, VoiceReady, VoiceReply, VoiceRequest, VoiceRequestId } from '../types/voice-local.js';
declare const self: {
  location: { search: string; origin: string };
  navigator: { gpu?: VoiceGpu };
  postMessage(message: VoiceReply, transfer?: Transferable[]): void;
  addEventListener(type: 'message', handler: (event: MessageEvent<VoiceRequest>) => unknown): void;
};
import type { LocalVoiceModel } from './voice-model-catalog.js';
interface RecognizerOptions { task: string; chunk_length_s: number; stride_length_s: number; return_timestamps: boolean; language?: string }
export interface Recognizer {
  (audio: Float32Array, options: RecognizerOptions): Promise<{ text?: string } | { text?: string }[] | null>;
  dispose?(): Promise<void>;
}
interface RecognizerLoadOptions {
  device: string; dtype: string; progress_callback(progress: VoiceProgress): void;
  session_options?: { graphOptimizationLevel: 'disabled' };
}
export interface TransformersModule {
  env: { backends: { onnx: { wasm: { proxy: boolean }; webgpu?: { adapter?: object; powerPreference?: string } } } };
  pipeline(task: 'automatic-speech-recognition', model: string, options: RecognizerLoadOptions): Promise<Recognizer>;
}
// voice-local-stt-worker.js — Whisper inference in a dedicated module worker.

import { getErrorMessage } from './caught-error.js';
import { getLocalModel } from './voice-model-catalog.js';

const DEFAULT_MODEL = 'onnx-community/whisper-small';

let recognizer: Recognizer | null = null;
let activeModel = '';
let activeBackend = '';
let activeFallbackReason = '';
let transformersModule: TransformersModule | null = null;

function isMockMode() {
  return new URLSearchParams(self.location.search || '').has('mock');
}

function postProgress(id: VoiceRequestId, progress: VoiceProgress) {
  const safe: Record<string, string | number> = {};
  for (const key of ['status', 'name', 'file', 'progress', 'loaded', 'total']) {
    const value = progress?.[key];
    if (typeof value === 'string' || typeof value === 'number') safe[key] = value;
  }
  self.postMessage({ type: 'progress', id, kind: 'stt', progress: safe });
}

async function ensureTransformers() {
  if (transformersModule) return transformersModule;
  // @ts-expect-error Browser module workers can import the pinned HTTPS module.
  transformersModule = (await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0')) as TransformersModule;
  transformersModule.env.backends.onnx.wasm.proxy = false;
  return transformersModule;
}

function normalizeBackend(value: string | undefined) {
  return ['auto', 'webgpu', 'wasm'].includes(value!) ? value! : 'auto';
}

async function prepareWebGpuAdapter(module: TransformersModule | null) {
  if (!self.navigator?.gpu) throw new Error('WebGPU is not available in this browser.');
  const adapter = await self.navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) throw new Error('The browser could not access a WebGPU adapter.');
  const webgpuEnvironment = module!.env.backends?.onnx?.webgpu;
  if (webgpuEnvironment) {
    try {
      webgpuEnvironment.adapter = adapter;
    } catch {
      try { webgpuEnvironment.powerPreference = 'high-performance'; } catch {}
    }
  }
}

async function createRecognizer(pipeline: TransformersModule['pipeline'], model: string, modelConfig: LocalVoiceModel, backend: string, id: VoiceRequestId) {
  if (backend === 'webgpu') await prepareWebGpuAdapter(transformersModule);
  const options: RecognizerLoadOptions = {
    device: backend,
    dtype: modelConfig.dtype || 'q8',
    progress_callback: progress => postProgress(id, progress),
  };
  if (backend === 'wasm') {
    options.session_options = {
      graphOptimizationLevel: 'disabled',
    };
  }
  return pipeline('automatic-speech-recognition', model, options);
}

async function loadRecognizer(
  model: string | undefined,
  id: VoiceRequestId,
  backendPreference = 'auto',
  preferredBackend = 'webgpu',
  allowWebGpuFallback = true,
): Promise<VoiceReady> {
  const requestedModel = String(model || DEFAULT_MODEL);
  const requestedBackend = normalizeBackend(backendPreference);
  const autoPreference = ['webgpu', 'wasm'].includes(preferredBackend)
    ? preferredBackend
    : 'webgpu';
  const activeBackendMatches = requestedBackend === 'auto'
    ? autoPreference === activeBackend || !!activeFallbackReason
    : requestedBackend === activeBackend;
  if (recognizer && activeModel === requestedModel && activeBackendMatches) {
    return {
      model: activeModel,
      backend: activeBackend,
      fallbackReason: activeFallbackReason || undefined,
    };
  }
  await recognizer?.dispose?.().catch?.(() => {});
  recognizer = null;
  activeModel = '';
  activeBackend = '';
  activeFallbackReason = '';

  if (isMockMode()) {
    activeModel = requestedModel;
    activeBackend = 'mock';
    activeFallbackReason = '';
    return { model: activeModel, backend: activeBackend };
  }

  const { pipeline } = await ensureTransformers();
  const modelConfig = getLocalModel('stt', requestedModel);
  const candidates = requestedBackend === 'auto'
    ? allowWebGpuFallback
      ? [autoPreference, autoPreference === 'webgpu' ? 'wasm' : 'webgpu']
      : ['wasm']
    : [requestedBackend];
  let fallbackReason = '';
  for (const backend of candidates) {
    try {
      recognizer = await createRecognizer(
        pipeline,
        requestedModel,
        modelConfig,
        backend,
        id,
      );
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
      fallbackReason = getErrorMessage(error, 'WebGPU initialization failed');
      await recognizer?.dispose?.().catch?.(() => {});
      recognizer = null;
    }
  }
  throw new Error('No local transcription backend is available.');
}

async function transcribe(message: VoiceRequest) {
  const ready = await loadRecognizer(
    message.model,
    message.id,
    message.backend,
    message.preferredBackend,
    message.allowWebGpuFallback,
  );
  if (isMockMode()) {
    return {
      ...ready,
      text: String(message.mockTranscript || 'Mock voice transcript'),
      language: message.language === 'auto' ? 'en' : message.language,
      inferenceMs: 0,
    };
  }
  const samples = new Float32Array(message.audio!);
  const options: RecognizerOptions = {
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
  };
  if (message.language && message.language !== 'auto') options.language = message.language;
  const startedAt = performance.now();
  const result = await recognizer!(samples, options);
  return {
    ...ready,
    text: String(Array.isArray(result) ? result[0]?.text || '' : result?.text || '').trim(),
    language: message.language === 'auto' ? undefined : message.language,
    inferenceMs: performance.now() - startedAt,
  };
}

self.addEventListener('message', async event => {
  if (event.origin && event.origin !== self.location.origin) return;
  const message = event.data || {};
  const id = message.id;
  try {
    if (message.type === 'init') {
      const ready = await loadRecognizer(
        message.model,
        id,
        message.backend,
        message.preferredBackend,
        message.allowWebGpuFallback,
      );
      self.postMessage({ type: 'ready', id, kind: 'stt', ...ready });
      return;
    }
    if (message.type === 'transcribe') {
      const result = await transcribe(message);
      self.postMessage({ type: 'transcript', id, kind: 'stt', ...result });
      return;
    }
    if (message.type === 'dispose') {
      const previousRecognizer = recognizer;
      recognizer = null;
      activeModel = '';
      activeBackend = '';
      activeFallbackReason = '';
      await previousRecognizer?.dispose?.();
      self.postMessage({ type: 'disposed', id, kind: 'stt' });
      return;
    }
    throw new Error(`Unknown STT worker message: ${message.type}`);
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      kind: 'stt',
      backend: activeBackend || undefined,
      message: getErrorMessage(error, 'Local transcription failed'),
    });
  }
});
