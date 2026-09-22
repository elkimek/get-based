import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pipeline: vi.fn(), env: { backends: { onnx: { wasm: {}, webgpu: {} } } } }));
vi.mock('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0', () => mocks);
let receive, post, recognizer, dispose;
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  dispose = vi.fn().mockResolvedValue(undefined);
  recognizer = Object.assign(vi.fn().mockResolvedValue({ text: ' hello ' }), { dispose });
  mocks.pipeline.mockReset().mockResolvedValue(recognizer);
  mocks.env.backends.onnx = { wasm: {}, webgpu: {} };
  post = vi.fn();
  vi.stubGlobal('self', {
    location: { search: '', origin: 'https://app.test' }, navigator: {}, postMessage: post,
    addEventListener: (_type, handler) => { receive = handler; },
  });
  await import('../js/voice-local-stt-worker.js');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const send = data => receive({ origin: '', data: { id: 'request', ...data } });
const messages = type => post.mock.calls.map(([message]) => message).filter(message => message.type === type);

it('ignores cross-origin messages without loading models', async () => {
  await receive({ origin: 'https://foreign.test', data: { type: 'init' } });
  expect(post).not.toHaveBeenCalled(); expect(mocks.pipeline).not.toHaveBeenCalled();
});
it.each([undefined, 'unsupported'])('reports malformed message type %s', async type => {
  await send({ type });
  expect(messages('error')[0]).toMatchObject({ id: 'request', kind: 'stt', message: expect.stringContaining('Unknown STT') });
});
it('reuses matching models and releases weights when switching', async () => {
  await send({ type: 'init', backend: 'wasm' });
  await send({ type: 'init', backend: 'wasm' });
  expect(mocks.pipeline).toHaveBeenCalledOnce();
  await send({ type: 'init', backend: 'wasm', model: 'onnx-community/whisper-tiny' });
  expect(dispose).toHaveBeenCalledOnce(); expect(mocks.pipeline).toHaveBeenCalledTimes(2);
  expect(mocks.env.backends.onnx.wasm.proxy).toBe(false);
});
it('disables WASM graph optimizations and filters progress payloads', async () => {
  mocks.pipeline.mockImplementation(async (_task, _model, options) => {
    options.progress_callback({ status: 'loading', loaded: 1, total: 2, secret: 'hidden', file: {} });
    return recognizer;
  });
  await send({ type: 'init', backend: 'wasm' });
  expect(mocks.pipeline).toHaveBeenCalledWith('automatic-speech-recognition', expect.any(String), expect.objectContaining({ device: 'wasm', session_options: { graphOptimizationLevel: 'disabled' } }));
  expect(messages('progress')[0].progress).toEqual({ status: 'loading', loaded: 1, total: 2 });
});
it('falls back from unavailable GPU and reuses the successful fallback', async () => {
  await send({ type: 'init', backend: 'auto' });
  await send({ type: 'init', backend: 'auto' });
  expect(mocks.pipeline).toHaveBeenCalledOnce();
  expect(messages('ready')[0]).toMatchObject({ backend: 'wasm', fallbackReason: expect.stringContaining('not available') });
});
it('does not fall back from an explicit GPU request', async () => {
  await send({ type: 'init', backend: 'webgpu' });
  expect(messages('error')).toHaveLength(1); expect(mocks.pipeline).not.toHaveBeenCalled();
});
it('reports unavailable adapters', async () => {
  self.navigator.gpu = { requestAdapter: vi.fn().mockResolvedValue(null) };
  await send({ type: 'init', backend: 'webgpu' });
  expect(messages('error')[0].message).toContain('could not access');
});
it('passes a selected GPU adapter to the inference runtime', async () => {
  const adapter = {};
  self.navigator.gpu = { requestAdapter: vi.fn().mockResolvedValue(adapter) };
  await send({ type: 'init', backend: 'webgpu' });
  expect(mocks.env.backends.onnx.webgpu.adapter).toBe(adapter);
  expect(mocks.pipeline.mock.calls[0][2]).not.toHaveProperty('session_options');
  expect(messages('ready')[0].backend).toBe('webgpu');
});
it('uses the runtime power preference when adapter assignment is read-only', async () => {
  Object.defineProperty(mocks.env.backends.onnx.webgpu, 'adapter', { set() { throw new Error('readonly'); } });
  self.navigator.gpu = { requestAdapter: vi.fn().mockResolvedValue({}) };
  await send({ type: 'init', backend: 'webgpu' });
  expect(mocks.env.backends.onnx.webgpu.powerPreference).toBe('high-performance');
  expect(messages('ready')).toHaveLength(1);
});
it('tolerates a frozen GPU environment without hiding inference failures', async () => {
  Object.freeze(mocks.env.backends.onnx.webgpu);
  self.navigator.gpu = { requestAdapter: vi.fn().mockResolvedValue({}) };
  mocks.pipeline.mockRejectedValueOnce(new Error('GPU allocation failed'));
  await send({ type: 'init', backend: 'webgpu' });
  expect(messages('error')[0].message).toBe('GPU allocation failed');
});
it('uses WASM only when automatic GPU fallback is disabled', async () => {
  mocks.pipeline.mockRejectedValueOnce(new Error('WASM unavailable'));
  await send({ type: 'init', allowWebGpuFallback: false });
  expect(mocks.pipeline).toHaveBeenCalledOnce();
  expect(mocks.pipeline.mock.calls[0][2].device).toBe('wasm');
  expect(messages('error')[0].message).toBe('WASM unavailable');
});
it('recovers from failed loading on a later request', async () => {
  mocks.pipeline.mockRejectedValueOnce(new Error('download interrupted'));
  await send({ type: 'init', backend: 'wasm' });
  await send({ type: 'init', backend: 'wasm' });
  expect(messages('error')).toHaveLength(1); expect(messages('ready')).toHaveLength(1);
});
it.each(['auto', 'cs'])('passes audio and language %s with bounded chunking options', async language => {
  const audio = new Float32Array([0.2, -0.2]);
  await send({ type: 'transcribe', backend: 'wasm', audio: audio.buffer, language });
  expect([...recognizer.mock.calls[0][0]]).toEqual([...audio]);
  expect(recognizer.mock.calls[0][1]).toMatchObject({ task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: false });
  if (language === 'auto') expect(recognizer.mock.calls[0][1]).not.toHaveProperty('language');
  else expect(recognizer.mock.calls[0][1].language).toBe(language);
  expect(messages('transcript')[0]).toMatchObject({ text: 'hello', language: language === 'auto' ? undefined : language });
});
it.each([{ result: [{ text: ' first ' }, { text: ' second ' }] }, { result: [] }, { result: null }])('normalizes result shape $result', async ({ result }) => {
  recognizer.mockResolvedValue(result);
  await send({ type: 'transcribe', backend: 'wasm', audio: new Float32Array(0) });
  expect(messages('transcript')[0].text).toBe(result?.length ? 'first' : '');
});
it('reports inference rejection without a false transcript and permits retry', async () => {
  recognizer.mockRejectedValueOnce(new Error('inference failed'));
  await send({ type: 'transcribe', backend: 'wasm', audio: new Float32Array(0) });
  expect(messages('transcript')).toHaveLength(0);
  expect(messages('error')[0].message).toBe('inference failed');
  await send({ type: 'transcribe', backend: 'wasm', audio: new Float32Array(0) });
  expect(messages('transcript')).toHaveLength(1); expect(mocks.pipeline).toHaveBeenCalledOnce();
});
it('returns mock transcripts without loading weights', async () => {
  self.location.search = '?mock';
  await send({ type: 'transcribe', language: 'auto', mockTranscript: 'Mock speech' });
  expect(messages('transcript')[0]).toMatchObject({ text: 'Mock speech', language: 'en', backend: 'mock' });
  expect(mocks.pipeline).not.toHaveBeenCalled();
});
it('reloads after failed disposal instead of reusing broken weights', async () => {
  await send({ type: 'init', backend: 'wasm' });
  dispose.mockRejectedValueOnce(new Error('dispose failed'));
  await send({ type: 'dispose' });
  expect(messages('error')[0].message).toBe('dispose failed');
  expect(messages('disposed')).toHaveLength(0);
  await send({ type: 'init', backend: 'wasm' });
  expect(mocks.pipeline).toHaveBeenCalledTimes(2);
});
it('keeps replacement weights when older disposal finishes late', async () => {
  await send({ type: 'init', backend: 'wasm' });
  let finish;
  dispose.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = send({ type: 'dispose' });
  await send({ type: 'init', backend: 'wasm', model: 'onnx-community/whisper-tiny' });
  finish(); await pending;
  await send({ type: 'init', backend: 'wasm', model: 'onnx-community/whisper-tiny' });
  expect(mocks.pipeline).toHaveBeenCalledTimes(2);
  expect(messages('disposed')).toHaveLength(1);
});
