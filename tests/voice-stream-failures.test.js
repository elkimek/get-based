import { afterEach, expect, it, vi } from 'vitest';
import { VoicePlayer } from '../js/voice-player.js';

const players = [];
afterEach(() => { for (const player of players.splice(0)) player.stop(); vi.useRealTimers(); });
function fixture({ open = true, appendError, playError, addError, delayedAppend = false } = {}) {
  const buffer = Object.assign(new EventTarget(), {
    updating: false, abort: vi.fn(),
    appendBuffer: vi.fn(function () {
      if (appendError) throw appendError;
      this.updating = true;
      if (!delayedAppend) queueMicrotask(() => { this.updating = false; this.dispatchEvent(new Event('updateend')); });
    }),
  });
  const media = Object.assign(new EventTarget(), {
    readyState: open ? 'open' : 'closed', endOfStream: vi.fn(),
    addSourceBuffer: vi.fn(() => { if (addError) throw addError; return buffer; }),
  });
  const audio = Object.assign(new EventTarget(), {
    paused: true, play: vi.fn(() => playError ? Promise.reject(playError) : Promise.resolve()),
    pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn(),
  });
  const revoke = vi.fn();
  const player = new VoicePlayer({
    audioFactory: () => audio, mediaSourceFactory: () => media, isMediaSourceTypeSupported: () => true,
    createObjectURL: () => 'blob:stream', revokeObjectURL: revoke,
  });
  players.push(player);
  return { player, audio, media, buffer, revoke };
}
function provider(chunks = [], closed = true) {
  const cancel = vi.fn();
  const stream = new ReadableStream({ start(controller) { chunks.forEach(chunk => controller.enqueue(chunk)); if (closed) controller.close(); }, cancel });
  return { stream, cancel };
}
function clean(f) {
  expect(f.revoke).toHaveBeenCalledExactlyOnceWith('blob:stream');
  expect(f.player.audio).toBeNull(); expect(f.player.sourceBuffer).toBeNull();
  expect(f.player.streamReader).toBeNull(); expect(f.player.rejectCurrent).toBeNull();
}
it('rejects empty provider audio and releases every resource', async () => {
  const f = fixture(), p = provider([new Uint8Array(0)]);
  await expect(f.player.playStream(p.stream)).rejects.toThrow('empty audio stream');
  expect(f.buffer.appendBuffer).not.toHaveBeenCalled(); clean(f); expect(p.stream.locked).toBe(false);
});
it('handles synchronous decoder append failure and cancels the provider', async () => {
  const f = fixture({ appendError: new Error('quota exceeded') }), p = provider([new Uint8Array([1])], false);
  await expect(f.player.playStream(p.stream)).rejects.toThrow('quota exceeded');
  await vi.waitFor(() => expect(p.stream.locked).toBe(false));
  expect(p.cancel).toHaveBeenCalledOnce(); clean(f);
});
it('handles asynchronous decoder failure and stops updating buffers', async () => {
  const f = fixture({ delayedAppend: true }), p = provider([new Uint8Array([1])], false);
  const outcome = f.player.playStream(p.stream).catch(error => error);
  await vi.waitFor(() => expect(f.buffer.appendBuffer).toHaveBeenCalledOnce());
  f.buffer.dispatchEvent(new Event('error'));
  expect((await outcome).message).toContain('could not be decoded');
  expect(f.buffer.abort).toHaveBeenCalledOnce(); clean(f);
});
it('settles when the source closes before opening', async () => {
  const f = fixture({ open: false }), p = provider();
  const outcome = f.player.playStream(p.stream).catch(error => error);
  f.media.dispatchEvent(new Event('sourceclose'));
  expect((await outcome).message).toContain('could not be opened');
  expect(f.media.addSourceBuffer).not.toHaveBeenCalled(); clean(f);
});
it('releases primed resources when autoplay is rejected', async () => {
  const f = fixture({ open: false, playError: new Error('autoplay blocked') }), p = provider();
  await expect(f.player.playStream(p.stream)).rejects.toThrow('autoplay blocked'); clean(f);
});
it('releases resources when the browser rejects the source format', async () => {
  const f = fixture({ addError: new Error('unsupported codec') }), p = provider();
  await expect(f.player.playStream(p.stream)).rejects.toThrow('unsupported codec');
  expect(p.stream.locked).toBe(false); clean(f);
});
it('cancels pending reads on audio element error', async () => {
  const f = fixture(), p = provider([], false);
  const outcome = f.player.playStream(p.stream).catch(error => error);
  await vi.waitFor(() => expect(p.stream.locked).toBe(true));
  f.audio.dispatchEvent(new Event('error'));
  expect((await outcome).message).toContain('could not be played');
  await vi.waitFor(() => expect(p.stream.locked).toBe(false));
  expect(p.cancel).toHaveBeenCalledOnce(); clean(f);
});
it('ignores empty chunks, preserves chunk order and finishes only after audio ends', async () => {
  const f = fixture(), p = provider([new Uint8Array(0), new Uint8Array([1]), new Uint8Array([2])]);
  let finished = false;
  const playback = f.player.playStream(p.stream).then(() => { finished = true; });
  await vi.waitFor(() => expect(f.media.endOfStream).toHaveBeenCalledWith());
  expect(f.buffer.appendBuffer.mock.calls.map(([bytes]) => [...bytes])).toEqual([[1], [2]]);
  expect(finished).toBe(false);
  f.audio.dispatchEvent(new Event('ended')); await playback; clean(f);
});
it('settles and releases a MediaSource that never opens', async () => {
  vi.useFakeTimers(); const f = fixture({ open: false }), p = provider();
  let outcome;
  void f.player.playStream(p.stream).catch(error => { outcome = error; });
  await vi.advanceTimersByTimeAsync(5001);
  expect(outcome?.message).toContain('could not be opened'); clean(f);
});
it('times out a stalled provider and cancels its reader', async () => {
  vi.useFakeTimers(); const f = fixture(), p = provider([], false);
  let outcome;
  void f.player.playStream(p.stream).catch(error => { outcome = error; });
  await vi.advanceTimersByTimeAsync(120001);
  expect(outcome?.message).toContain('stopped responding');
  expect(p.cancel).toHaveBeenCalledOnce(); clean(f); expect(p.stream.locked).toBe(false);
});
it('times out a decoder that never emits updateend and removes its listeners', async () => {
  vi.useFakeTimers(); const f = fixture({ delayedAppend: true }), p = provider([new Uint8Array([1])], false);
  const remove = vi.spyOn(f.buffer, 'removeEventListener');
  let outcome;
  void f.player.playStream(p.stream).catch(error => { outcome = error; });
  await vi.advanceTimersByTimeAsync(120001);
  expect(outcome?.message).toContain('segment stopped responding');
  expect(f.buffer.abort).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledWith('updateend', expect.any(Function));
  f.buffer.dispatchEvent(new Event('updateend'));
  expect(p.cancel).toHaveBeenCalledOnce(); clean(f);
});
