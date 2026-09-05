// @ts-check
// voice-local-engine.js — serialized main-thread controller for local voice workers.

import { VOICE_RUNTIME_VERSION } from './voice-model-catalog.js';

const INSTALL_KEY_PREFIX = 'labcharts-voice-model-installed-';

const defaultWorkerUrls = {
  stt: new URL('./voice-local-stt-worker.js', import.meta.url),
  tts: new URL('./voice-local-tts-worker.js', import.meta.url),
};

const engineDeps = {
  workerFactory: (url) => new Worker(url, { type: 'module' }),
  workerUrls: defaultWorkerUrls,
};

const workers = { stt: null, tts: null };
const inflight = { stt: new Map(), tts: new Map() };
const queues = { stt: Promise.resolve(), tts: Promise.resolve() };
const failedGpuModels = { stt: new Set(), tts: new Set() };
let nextRequestId = 1;

/**
 * Android browsers expose WebGPU through the regular mobile GPU, not the
 * device's NPU. Large local voice graphs can be slower than WASM or cause the
 * browser GPU process to run out of memory, so Automatic stays on CPU there.
 *
 * @param {Navigator | { userAgent?: string, userAgentData?: { platform?: string } } | undefined} [navigatorLike]
 */
export function isAndroidDevice(navigatorLike = globalThis.navigator) {
  const platform = String(/** @type {any} */ (navigatorLike)?.userAgentData?.platform || '');
  const userAgent = String(navigatorLike?.userAgent || '');
  return /android/i.test(`${platform} ${userAgent}`);
}

export function configureVoiceLocalEngine(deps = {}) {
  const previous = {
    workerFactory: engineDeps.workerFactory,
    workerUrls: engineDeps.workerUrls,
  };
  if (typeof deps.workerFactory === 'function') engineDeps.workerFactory = deps.workerFactory;
  if (deps.workerUrls) engineDeps.workerUrls = { ...engineDeps.workerUrls, ...deps.workerUrls };
  return previous;
}

function installKey(kind, model) {
  return `${INSTALL_KEY_PREFIX}${kind}-${encodeURIComponent(model)}`;
}

function rememberInstalled(
  kind,
  model,
  backend,
  fallbackReason = '',
  inferenceMs,
  audioSeconds,
) {
  try {
    const previous = getLocalVoiceModelStatus(kind, model);
    const performance = { ...(previous?.performance || {}) };
    const availableBackends = new Set(previous?.availableBackends || [previous?.backend].filter(Boolean));
    if (['wasm', 'webgpu'].includes(backend)) availableBackends.add(backend);
    if (Number.isFinite(inferenceMs) && ['wasm', 'webgpu'].includes(backend)) {
      const safeAudioSeconds = Number(audioSeconds);
      performance[backend] = {
        inferenceMs: Number(inferenceMs),
        ...(Number.isFinite(safeAudioSeconds) && safeAudioSeconds > 0
          ? {
            audioSeconds: safeAudioSeconds,
            realtimeFactor: Number(inferenceMs) / 1000 / safeAudioSeconds,
          }
          : {}),
      };
    }
    localStorage.setItem(installKey(kind, model), JSON.stringify({
      version: VOICE_RUNTIME_VERSION,
      model,
      backend,
      fallbackReason: String(fallbackReason || ''),
      ...(Number.isFinite(inferenceMs) ? { lastInferenceMs: Number(inferenceMs) } : {}),
      ...(Object.keys(performance).length ? { performance } : {}),
      ...(availableBackends.size ? { availableBackends: [...availableBackends] } : {}),
      installedAt: Date.now(),
    }));
  } catch {}
}

export function isMobileVoiceDevice(navigatorValue = globalThis.navigator) {
  try {
    const clientHints = /** @type {any} */ (navigatorValue)?.userAgentData;
    if (typeof clientHints?.mobile === 'boolean') return clientHints.mobile;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(String(navigatorValue?.userAgent || ''));
  } catch {
    return false;
  }
}

export function initialLocalVoiceBackend(navigatorValue = globalThis.navigator) {
  const gpu = /** @type {any} */ (navigatorValue)?.gpu;
  return !isAndroidDevice(navigatorValue)
    && isMobileVoiceDevice(navigatorValue)
    && typeof gpu?.requestAdapter === 'function'
    ? 'webgpu'
    : 'wasm';
}

/**
 * @param {string} [backend]
 * @param {Record<string, any>} [performance]
 * @param {'wasm' | 'webgpu' | { android?: boolean, initialBackend?: 'wasm' | 'webgpu' }} [initialBackendOrEnvironment]
 */
export function resolveLocalBackend(
  backend = 'auto',
  performance = {},
  initialBackendOrEnvironment = 'wasm',
) {
  if (backend !== 'auto') return backend;
  const environment = typeof initialBackendOrEnvironment === 'object'
    ? initialBackendOrEnvironment
    : {};
  const initialBackend = typeof initialBackendOrEnvironment === 'string'
    ? initialBackendOrEnvironment
    : environment.initialBackend || 'wasm';
  const android = typeof environment.android === 'boolean'
    ? environment.android
    : isAndroidDevice();
  if (android) return 'wasm';
  const score = measurement => {
    if (measurement == null) return Number.NaN;
    const normalized = Number(measurement?.realtimeFactor);
    if (Number.isFinite(normalized)) return normalized;
    return Number(measurement);
  };
  const cpuScore = score(performance.wasm);
  const gpuScore = score(performance.webgpu);
  if (Number.isFinite(cpuScore) && Number.isFinite(gpuScore)) {
    return gpuScore < cpuScore ? 'webgpu' : 'wasm';
  }
  if (Number.isFinite(gpuScore)) return 'webgpu';
  return initialBackend === 'webgpu' ? 'webgpu' : 'wasm';
}

export function preferredLocalVoiceBackend(kind, model, backend) {
  if (backend === 'auto' && failedGpuModels[kind].has(String(model || ''))) return 'wasm';
  const status = getLocalVoiceModelStatus(kind, model);
  const performance = status?.performance || {};
  if (
    backend === 'auto'
    && !isAndroidDevice()
    && !Object.keys(performance).length
    && status?.fallbackReason
    && ['wasm', 'webgpu'].includes(status.backend)
  ) {
    return status.backend;
  }
  return resolveLocalBackend(backend, performance, initialLocalVoiceBackend());
}

// Retained for compatibility with integrations that used the original
// transcription-specific name before the backend chooser became shared.
export const resolveLocalSttBackend = resolveLocalBackend;

export function getLocalVoiceModelStatus(kind, model) {
  try {
    const parsed = JSON.parse(localStorage.getItem(installKey(kind, model)) || 'null');
    if (parsed?.version !== VOICE_RUNTIME_VERSION || parsed?.model !== model) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isLocalVoiceModelReady(kind, model, backend = 'auto') {
  const status = getLocalVoiceModelStatus(kind, model);
  if (!status) return false;
  if (kind !== 'tts') return true;
  const available = new Set([
    ...(status.availableBackends || [status.backend]),
    ...Object.keys(status.performance || {}),
  ]);
  const preferred = preferredLocalVoiceBackend(kind, model, backend);
  return available.has(preferred);
}

async function hasCachedModelAssets(model) {
  if (typeof caches === 'undefined') return true;
  const needles = [
    String(model),
    encodeURIComponent(String(model)),
    String(model).replaceAll('/', '%2F'),
  ];
  try {
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      if (requests.some(request => needles.some(needle => request.url.includes(needle)))) {
        return true;
      }
    }
  } catch {
    // Cache inspection can be restricted independently from model execution.
    // Preserve the marker when the browser does not allow verification.
    return true;
  }
  return false;
}

export async function verifyLocalVoiceModelReady(kind, model, backend = 'auto') {
  if (!isLocalVoiceModelReady(kind, model, backend)) return false;
  if (await hasCachedModelAssets(model)) return true;
  terminateLocalVoiceWorker(kind);
  try { localStorage.removeItem(installKey(kind, model)); } catch {}
  return false;
}

function hasStaleInstallation(kind, model) {
  try {
    const parsed = JSON.parse(localStorage.getItem(installKey(kind, model)) || 'null');
    return !!parsed && (parsed.version !== VOICE_RUNTIME_VERSION || parsed.model !== model);
  } catch {
    return true;
  }
}

function dispatchProgress(detail) {
  if (typeof globalThis.dispatchEvent !== 'function') return;
  try {
    globalThis.dispatchEvent(new CustomEvent('labcharts-voice-model-progress', { detail }));
  } catch {}
}

function rejectInflight(kind, error) {
  for (const pending of inflight[kind].values()) pending.reject(error);
  inflight[kind].clear();
}

function ensureWorker(kind) {
  if (workers[kind]) return workers[kind];
  const worker = engineDeps.workerFactory(engineDeps.workerUrls[kind]);
  worker.addEventListener('message', event => {
    const message = event.data || {};
    if (message.type === 'progress') {
      const pending = inflight[kind].get(message.id);
      if (pending) {
        dispatchProgress({
          ...message,
          kind,
          model: pending.model,
          backend: pending.backend,
        });
      }
      return;
    }
    const pending = inflight[kind].get(message.id);
    if (!pending) return;
    if (message.type === 'audio-chunk') {
      pending.onChunk?.(message);
      return;
    }
    inflight[kind].delete(message.id);
    if (message.type === 'error') {
      const error = new Error(message.message || `Local ${kind} failed`);
      if (message.backend) /** @type {any} */ (error).voiceBackend = message.backend;
      pending.reject(error);
    } else pending.resolve(message);
  });
  worker.addEventListener('error', event => {
    const error = new Error(event.message || `Local ${kind} worker failed`);
    rejectInflight(kind, error);
    worker.terminate();
    workers[kind] = null;
  });
  workers[kind] = worker;
  return worker;
}

function rawWorkerRequest(kind, payload, transfer = [], signal, onChunk) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException('Voice operation aborted', 'AbortError'));
      return;
    }
    const id = nextRequestId++;
    const worker = ensureWorker(kind);
    const onAbort = () => {
      inflight[kind].delete(id);
      reject(signal.reason || new DOMException('Voice operation aborted', 'AbortError'));
      terminateLocalVoiceWorker(kind);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    inflight[kind].set(id, {
      model: payload.model,
      backend: payload.backend,
      onChunk,
      resolve: value => {
        signal?.removeEventListener('abort', onAbort);
        resolve(value);
      },
      reject: error => {
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      },
    });
    worker.postMessage({ ...payload, id }, transfer);
  });
}

function workerRequest(kind, payload, transfer = [], signal, onChunk) {
  const result = queues[kind].catch(() => undefined)
    .then(() => {
      // Whisper and Kokoro are large enough that retaining both workers can
      // exhaust a mobile browser's CPU/GPU memory. Voice turns are sequential,
      // so release the inactive model immediately before allocating this one.
      terminateLocalVoiceWorker(kind === 'stt' ? 'tts' : 'stt');
      return rawWorkerRequest(kind, payload, transfer, signal, onChunk);
    });
  queues[kind] = result.catch(() => undefined);
  return result;
}

export async function installLocalVoiceModel(kind, model, signal, backend = 'auto') {
  if (hasStaleInstallation(kind, model)) {
    await removeLocalVoiceModel(kind, model);
  }
  const preferredBackend = preferredLocalVoiceBackend(kind, model, backend);
  const result = await workerRequest(
    kind,
    {
      type: 'init',
      model,
      backend,
      preferredBackend,
      allowWebGpuFallback: !isAndroidDevice(),
    },
    [],
    signal,
  );
  rememberInstalled(kind, model, result.backend, result.fallbackReason);
  return result;
}

/**
 * @param {Float32Array | ArrayLike<number>} samples
 * @param {{ model?: string, language?: string, backend?: string, signal?: AbortSignal }} [options]
 */
export async function transcribeLocalAudio(samples, {
  model,
  language = 'auto',
  backend = 'auto',
  signal,
} = {}) {
  const audio = samples instanceof Float32Array ? samples : new Float32Array(samples || []);
  const audioSeconds = audio.length / 16_000;
  const preferredBackend = preferredLocalVoiceBackend('stt', model, backend);
  const request = (requestedBackend, requestedPreference, allowWebGpuFallback) => {
    const transferableAudio = audio.slice();
    return workerRequest(
      'stt',
      {
        type: 'transcribe',
        model,
        language,
        backend: requestedBackend,
        preferredBackend: requestedPreference,
        allowWebGpuFallback,
        audio: transferableAudio.buffer,
      },
      [transferableAudio.buffer],
      signal,
    );
  };
  let result;
  try {
    result = await request(backend, preferredBackend, !isAndroidDevice());
  } catch (error) {
    const errorBackend = /** @type {any} */ (error)?.voiceBackend;
    const mayBeGpuFailure = errorBackend === 'webgpu'
      || backend === 'webgpu'
      || (backend === 'auto' && preferredBackend === 'webgpu');
    if (
      !mayBeGpuFailure
      || /** @type {any} */ (error)?.name === 'AbortError'
      || !isLocalVoiceModelReady('stt', model, 'wasm')
    ) throw error;
    failedGpuModels.stt.add(String(model || ''));
    terminateLocalVoiceWorker('stt');
    result = await request('wasm', 'wasm', false);
    result.fallbackReason = String(/** @type {any} */ (error)?.message || 'Graphics processing failed');
  }
  rememberInstalled(
    'stt',
    result.model || model,
    result.backend,
    result.fallbackReason,
    result.inferenceMs,
    audioSeconds,
  );
  return {
    text: result.text || '',
    language: result.language,
    backend: result.backend,
    fallbackReason: result.fallbackReason,
    inferenceMs: result.inferenceMs,
  };
}

/**
 * @param {string} text
 * @param {{ model?: string, voice?: string, rate?: number, backend?: string, signal?: AbortSignal }} [options]
 */
export async function synthesizeLocalSpeech(text, {
  model,
  voice,
  rate = 1,
  backend = 'auto',
  signal,
} = {}) {
  const preferredBackend = preferredLocalVoiceBackend('tts', model, backend);
  const request = (requestedBackend, requestedPreference, allowWebGpuFallback) => workerRequest(
    'tts',
    {
      type: 'synthesize',
      model,
      voice,
      rate,
      backend: requestedBackend,
      preferredBackend: requestedPreference,
      allowWebGpuFallback,
      text: String(text || ''),
    },
    [],
    signal,
  );
  let result;
  try {
    result = await request(backend, preferredBackend, !isAndroidDevice());
  } catch (error) {
    const errorBackend = /** @type {any} */ (error)?.voiceBackend;
    const mayBeGpuFailure = errorBackend === 'webgpu'
      || backend === 'webgpu'
      || (backend === 'auto' && preferredBackend === 'webgpu');
    if (
      !mayBeGpuFailure
      || /** @type {any} */ (error)?.name === 'AbortError'
      || !isLocalVoiceModelReady('tts', model, 'wasm')
    ) throw error;
    failedGpuModels.tts.add(String(model || ''));
    terminateLocalVoiceWorker('tts');
    result = await request('wasm', 'wasm', false);
    result.fallbackReason = String(/** @type {any} */ (error)?.message || 'Graphics processing failed');
  }
  rememberInstalled(
    'tts',
    result.model || model,
    result.backend,
    result.fallbackReason,
    result.inferenceMs,
    result.audioSeconds,
  );
  return {
    samples: new Float32Array(result.samples),
    sampleRate: Number(result.sampleRate) || 24_000,
    backend: result.backend,
    fallbackReason: result.fallbackReason,
    inferenceMs: result.inferenceMs,
  };
}

/**
 * Begin Kokoro inference and expose each generated PCM part immediately.
 *
 * @param {string} text
 * @param {{ model?: string, voice?: string, rate?: number, backend?: string, signal?: AbortSignal }} [options]
 */
export function streamLocalSpeech(text, {
  model,
  voice,
  rate = 1,
  backend = 'auto',
  signal,
} = {}) {
  let cancelled = false;
  const preferredBackend = preferredLocalVoiceBackend('tts', model, backend);
  const stream = new ReadableStream({
    start(controller) {
      let emittedChunks = 0;
      const onChunk = message => {
        if (cancelled) return;
        emittedChunks += 1;
        controller.enqueue({
          samples: new Float32Array(message.samples),
          sampleRate: Number(message.sampleRate) || 24_000,
        });
      };
      const request = (requestedBackend, requestedPreference, allowWebGpuFallback) => workerRequest(
        'tts',
        {
          type: 'synthesize',
          streaming: true,
          model,
          voice,
          rate,
          backend: requestedBackend,
          preferredBackend: requestedPreference,
          allowWebGpuFallback,
          text: String(text || ''),
        },
        [],
        signal,
        onChunk,
      );
      const run = async () => {
        try {
          return await request(backend, preferredBackend, !isAndroidDevice());
        } catch (error) {
          const errorBackend = /** @type {any} */ (error)?.voiceBackend;
          const mayBeGpuFailure = errorBackend === 'webgpu'
            || backend === 'webgpu'
            || (backend === 'auto' && preferredBackend === 'webgpu');
          if (
            emittedChunks > 0
            || !mayBeGpuFailure
            || /** @type {any} */ (error)?.name === 'AbortError'
            || !isLocalVoiceModelReady('tts', model, 'wasm')
          ) throw error;
          failedGpuModels.tts.add(String(model || ''));
          terminateLocalVoiceWorker('tts');
          const result = await request('wasm', 'wasm', false);
          result.fallbackReason = String(/** @type {any} */ (error)?.message || 'Graphics processing failed');
          return result;
        }
      };
      void run().then(result => {
        rememberInstalled(
          'tts',
          result.model || model,
          result.backend,
          result.fallbackReason,
          result.inferenceMs,
          result.audioSeconds,
        );
        if (!cancelled) controller.close();
      }).catch(error => {
        if (!cancelled) controller.error(error);
      });
    },
    cancel() {
      cancelled = true;
      terminateLocalVoiceWorker('tts');
    },
  });
  return stream;
}

export function terminateLocalVoiceWorker(kind) {
  const worker = workers[kind];
  if (!worker) return;
  workers[kind] = null;
  worker.terminate();
  rejectInflight(kind, new DOMException('Voice worker stopped', 'AbortError'));
}

export function terminateLocalVoiceWorkers() {
  terminateLocalVoiceWorker('stt');
  terminateLocalVoiceWorker('tts');
}

export async function removeLocalVoiceModel(kind, model) {
  terminateLocalVoiceWorker(kind);
  try { localStorage.removeItem(installKey(kind, model)); } catch {}
  if (typeof caches === 'undefined') return 0;
  const needles = [
    String(model),
    encodeURIComponent(String(model)),
    String(model).replaceAll('/', '%2F'),
  ];
  let removed = 0;
  for (const cacheName of await caches.keys()) {
    const cache = await caches.open(cacheName);
    for (const request of await cache.keys()) {
      if (!needles.some(needle => request.url.includes(needle))) continue;
      if (await cache.delete(request)) removed += 1;
    }
  }
  return removed;
}
