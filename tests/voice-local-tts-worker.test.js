import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ load: vi.fn(), push: vi.fn(), close: vi.fn() }));
vi.mock('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js', () => ({
  KokoroTTS: { from_pretrained: mocks.load },
  TextSplitterStream: class { push = mocks.push; close = mocks.close; },
}));
let receive, post, dispose, stream;
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  dispose = vi.fn().mockResolvedValue(undefined);
  stream = vi.fn(async function* () { yield { audio: { audio: [0.1, 0.2], sampling_rate: 24000 } }; });
  mocks.load.mockReset().mockResolvedValue({ model: { dispose }, stream });
  post = vi.fn();
  vi.stubGlobal('self', {
    location: { search: '', origin: 'https://app.test' }, navigator: {}, postMessage: post,
    addEventListener: (_name, callback) => { receive = callback; },
  });
  await import('../js/voice-local-tts-worker.js');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const send = data => receive({ origin: '', data: { id: 'request', ...data } });
const messages = type => post.mock.calls.map(([message]) => message).filter(message => message.type === type);

describe('TTS worker protocol with a stub model, without downloads', () => {
  it('ignores foreign-origin messages before loading a model', async () => {
    await receive({ origin: 'https://foreign.test', data: { type: 'init' } });
    expect(post).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('reports unknown messages using their request ID', async () => {
    await send({ type: 'unknown' });
    expect(messages('error')).toEqual([expect.objectContaining({ id: 'request', message: 'Unknown TTS worker message: unknown' })]);
  });
  it('reuses a ready model and disposes it when the model changes', async () => {
    await send({ type: 'init', model: 'first', backend: 'wasm' });
    await send({ type: 'init', model: 'first', backend: 'wasm' });
    expect(mocks.load).toHaveBeenCalledOnce();
    await send({ type: 'init', model: 'second', backend: 'wasm' });
    expect(dispose).toHaveBeenCalledOnce();
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(messages('ready').at(-1)).toMatchObject({ model: 'second', backend: 'wasm' });
  });
  it('falls back to WASM when automatic WebGPU initialization fails', async () => {
    await send({ type: 'init', backend: 'auto', preferredBackend: 'webgpu' });
    expect(messages('ready')[0]).toMatchObject({ backend: 'wasm', fallbackReason: expect.stringContaining('not available') });
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(expect.any(String), expect.objectContaining({ device: 'wasm', dtype: 'q8' }));
  });
  it('does not silently change an explicitly requested GPU backend', async () => {
    await send({ type: 'init', backend: 'webgpu' });
    expect(messages('error')).toHaveLength(1);
    expect(messages('ready')).toHaveLength(0);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('reports a missing GPU adapter', async () => {
    self.navigator.gpu = { requestAdapter: vi.fn().mockResolvedValue(null) };
    await send({ type: 'init', backend: 'webgpu' });
    expect(messages('error')[0].message).toContain('could not access');
  });
  it('loads GPU weights and sanitizes progress messages', async () => {
    self.navigator.gpu = { requestAdapter: vi.fn().mockResolvedValue({}) };
    mocks.load.mockImplementation(async (_model, options) => {
      options.progress_callback({ status: 'loading', progress: 50, secret: 'hidden', file: {} });
      return { model: { dispose }, stream };
    });
    await send({ type: 'init', backend: 'webgpu' });
    expect(mocks.load).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ dtype: 'fp32', device: 'webgpu' }));
    expect(messages('progress')[0].progress).toEqual({ status: 'loading', progress: 50 });
  });
  it('restores console handlers after failed loading and permits a retry', async () => {
    const warn = console.warn, error = console.error;
    mocks.load.mockRejectedValueOnce(new Error('download failed'));
    await send({ type: 'init', backend: 'wasm' });
    expect(messages('error')[0].message).toBe('download failed');
    expect(console.warn).toBe(warn); expect(console.error).toBe(error);
    await send({ type: 'init', backend: 'wasm' });
    expect(messages('ready')).toHaveLength(1);
  });
  it('honors disabled GPU fallback when automatic loading fails', async () => {
    mocks.load.mockRejectedValue(new Error('WASM failed'));
    await send({ type: 'init', backend: 'auto', preferredBackend: 'webgpu', allowWebGpuFallback: false });
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(mocks.load.mock.calls[0][1].device).toBe('wasm');
    expect(messages('error')[0].message).toBe('WASM failed');
  });
  it('concatenates buffered chunks and transfers only the final audio', async () => {
    stream.mockImplementation(async function* () {
      yield {}; yield { audio: { data: [1, 2], sampleRate: 16000 } };
      yield { audio: { audio: new Float32Array([3]), sampling_rate: 16000 } };
    });
    await send({ type: 'synthesize', backend: 'wasm', text: 'Hello', voice: 'voice', rate: 1.5 });
    const result = messages('audio')[0];
    expect([...new Float32Array(result.samples)]).toEqual([1, 2, 3]);
    expect(result).toMatchObject({ sampleRate: 16000, audioSeconds: 3 / 16000 });
    expect(post.mock.calls.at(-1)[1]).toEqual([result.samples]);
    expect(mocks.push).toHaveBeenCalledWith('Hello');
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(stream).toHaveBeenCalledWith(expect.anything(), { voice: 'voice', speed: 1.5 });
  });
  it('streams copied audio chunks followed by one completion', async () => {
    const samples = new Float32Array([1, 2]);
    stream.mockImplementation(async function* () { yield { audio: { audio: samples } }; });
    await send({ type: 'synthesize', backend: 'wasm', streaming: true });
    expect(messages('audio')).toHaveLength(0);
    const chunk = messages('audio-chunk')[0];
    expect([...new Float32Array(chunk.samples)]).toEqual([1, 2]);
    expect(chunk.samples).not.toBe(samples.buffer);
    expect(messages('audio-done')).toEqual([expect.objectContaining({ audioSeconds: 2 / 24000 })]);
  });
  it.each([false, true])('reports empty audio without success (streaming=%s)', async streaming => {
    stream.mockImplementation(async function* () { yield {}; });
    await send({ type: 'synthesize', backend: 'wasm', streaming });
    expect(messages('error')[0].message).toBe('Kokoro returned no audio.');
    expect(messages('audio')).toHaveLength(0); expect(messages('audio-done')).toHaveLength(0);
  });
  it('reports mid-stream failure without a false completion', async () => {
    stream.mockImplementation(async function* () { yield { audio: { audio: [1] } }; throw new Error('inference failed'); });
    await send({ type: 'synthesize', backend: 'wasm', streaming: true });
    expect(messages('audio-chunk')).toHaveLength(1);
    expect(messages('audio-done')).toHaveLength(0);
    expect(messages('error')[0].message).toBe('inference failed');
  });
  it('disposes a loaded model and reloads on the next request', async () => {
    await send({ type: 'init', backend: 'wasm' });
    await send({ type: 'dispose' });
    expect(dispose).toHaveBeenCalledOnce();
    expect(messages('disposed')).toHaveLength(1);
    await send({ type: 'init', backend: 'wasm' });
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
});


it('does not reuse a model after disposal reports an error', async () => {
  await send({ type: 'init', backend: 'wasm' });
  dispose.mockRejectedValueOnce(new Error('dispose failed'));
  await send({ type: 'dispose' });
  expect(messages('error')[0].message).toBe('dispose failed');
  expect(messages('disposed')).toHaveLength(0);
  await send({ type: 'init', backend: 'wasm' });
  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(messages('ready')).toHaveLength(2);
});

it('suppresses only known engine diagnostics and restores unrelated logging', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.load.mockImplementation(async () => {
    console.warn('Unable to determine content-length from response headers');
    console.error('VerifyEachNodeIsAssignedToAnEp');
    console.warn('unexpected warning', 7);
    console.error('unexpected error', 8);
    return { model: { dispose }, stream };
  });
  await send({ type: 'init', backend: 'wasm' });
  expect(warn).toHaveBeenCalledExactlyOnceWith('unexpected warning', 7);
  expect(error).toHaveBeenCalledExactlyOnceWith('unexpected error', 8);
  expect(console.warn).toBe(warn); expect(console.error).toBe(error);
});

it.each([false, true])('produces bounded mock audio without loading weights (streaming=%s)', async streaming => {
  self.location.search = '?mock';
  await send({ type: 'synthesize', streaming });
  expect(mocks.load).not.toHaveBeenCalled();
  const audio = messages(streaming ? 'audio-chunk' : 'audio')[0];
  expect(new Float32Array(audio.samples)).toHaveLength(2880);
  expect(audio.sampleRate).toBe(24000);
  if (streaming) expect(messages('audio-done')[0]).toMatchObject({ backend: 'mock', audioSeconds: 0.12 });
  else expect(audio).toMatchObject({ backend: 'mock', audioSeconds: 0.12 });
});

it('does not clear a replacement model when earlier disposal finishes late', async () => {
  await send({ type: 'init', model: 'first', backend: 'wasm' });
  let finishDisposal;
  dispose.mockImplementationOnce(() => new Promise(resolve => { finishDisposal = resolve; }));
  const pending = send({ type: 'dispose' });
  await send({ type: 'init', model: 'second', backend: 'wasm' });
  finishDisposal(); await pending;
  await send({ type: 'init', model: 'second', backend: 'wasm' });
  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(messages('ready').at(-1)).toMatchObject({ model: 'second', backend: 'wasm' });
});
