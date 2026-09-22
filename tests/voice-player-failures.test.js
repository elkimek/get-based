import { describe, expect, it, vi } from 'vitest';
import { VoicePlayer } from '../js/voice-player.js';

class AudioStub extends EventTarget {
  paused = true;
  pause = vi.fn(() => { this.paused = true; });
  play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
  removeAttribute = vi.fn();
  load = vi.fn();
}
function fixture() {
  const audios = [];
  const revokeObjectURL = vi.fn();
  const player = new VoicePlayer({
    audioFactory: () => { const audio = new AudioStub(); audios.push(audio); return audio; },
    createObjectURL: () => `blob:voice-${audios.length}`,
    revokeObjectURL,
  });
  return { player, audios, revokeObjectURL };
}
function deferred() {
  let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function contextFixture() {
  const decoding = deferred();
  const source = { playbackRate: { value: 1 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  const context = { state: 'running', destination: {}, decodeAudioData: vi.fn(() => decoding.promise), createBufferSource: vi.fn(() => source) };
  return { decoding, source, context };
}

describe('voice playback failure cleanup', () => {
  it.each(['throw', 'reject'])('releases audio and its URL when play() fails by %s', async mode => {
    const audio = new AudioStub();
    audio.play.mockImplementation(() => {
      if (mode === 'throw') throw new Error('play blocked');
      return Promise.reject(new Error('play blocked'));
    });
    const revoke = vi.fn();
    const player = new VoicePlayer({ audioFactory: () => audio, createObjectURL: () => 'blob:failed', revokeObjectURL: revoke });
    await expect(player.play(new Blob(['audio']))).rejects.toThrow('play blocked');
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:failed');
    expect(player.audio).toBeNull();
    expect(player.rejectCurrent).toBeNull();
    player.stop();
    expect(revoke).toHaveBeenCalledOnce();
  });

  it.each(['error', 'abort'])('cleans up %s without allowing later events to affect replacement playback', async event => {
    const { player, audios, revokeObjectURL } = fixture();
    const controller = new AbortController();
    const first = player.play(new Blob(['first']), { signal: controller.signal }).catch(error => error);
    if (event === 'abort') controller.abort();
    else audios[0].dispatchEvent(new Event('error'));
    expect(await first).toBeInstanceOf(Error);
    const second = player.play(new Blob(['second']));
    audios[0].dispatchEvent(new Event('ended'));
    audios[0].dispatchEvent(new Event('error'));
    expect(player.audio).toBe(audios[1]);
    audios[1].dispatchEvent(new Event('ended'));
    await expect(second).resolves.toBe(true);
    expect(revokeObjectURL.mock.calls).toEqual([['blob:voice-1'], ['blob:voice-2']]);
    expect(player.isPlaying).toBe(false);
  });

  it('does not create resources for an already-aborted request', async () => {
    const { player, audios, revokeObjectURL } = fixture();
    const controller = new AbortController(); controller.abort();
    await expect(player.play(new Blob(['audio']), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(audios).toHaveLength(0);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it.each(['stop', 'replace'])('does not start delayed decoding after %s', async action => {
    const { player, audios } = fixture();
    const { context, decoding, source } = contextFixture();
    player.audioContext = context;
    const first = player.play(new Blob(['first'])).catch(error => error);
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce());
    player.stop();
    let second;
    if (action === 'replace') {
      player.audioContext = null;
      second = player.play(new Blob(['second']));
    }
    decoding.resolve({});
    // A successful start would leave this test's promise pending indefinitely.
    await vi.waitFor(() => expect(source.start).not.toHaveBeenCalled());
    const result = await Promise.race([first, new Promise(resolve => setTimeout(() => resolve('still pending'), 20))]);
    expect(result).toMatchObject({ name: 'AbortError' });
    expect(source.start).not.toHaveBeenCalled();
    if (second) {
      expect(player.audio).toBe(audios[0]);
      audios[0].dispatchEvent(new Event('ended'));
      await expect(second).resolves.toBe(true);
    }
    player.stop();
  });

  it('does not fall back to HTML audio when obsolete decoding rejects', async () => {
    const { player, audios } = fixture();
    const { context, decoding } = contextFixture();
    player.audioContext = context;
    const first = player.play(new Blob(['old'])).catch(error => error);
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce());
    player.audioContext = null;
    const second = player.play(new Blob(['new']));
    decoding.reject(new Error('old decoder failed'));
    expect(await first).toMatchObject({ name: 'AbortError' });
    expect(audios).toHaveLength(1);
    expect(player.audio).toBe(audios[0]);
    audios[0].dispatchEvent(new Event('ended'));
    await expect(second).resolves.toBe(true);
  });

  it('does not begin decoding when stopped during audio activation', async () => {
    const { player, audios } = fixture();
    const { context } = contextFixture();
    const activation = deferred();
    player.audioContext = context;
    player.audioUnlockPromise = activation.promise;
    const playback = player.play(new Blob(['audio'])).catch(error => error);
    player.stop(); activation.resolve();
    expect(await playback).toMatchObject({ name: 'AbortError' });
    expect(context.decodeAudioData).not.toHaveBeenCalled();
    expect(audios).toHaveLength(0);
  });

  it.each(['abort', 'stop'])('settles PCM playback on %s after generation finishes but audio is still playing', async action => {
    const { player } = fixture();
    const { context, source } = contextFixture();
    context.currentTime = 0;
    context.createBuffer = (_channels, count, rate) => ({
      duration: count / rate, getChannelData: () => new Float32Array(count),
    });
    player.audioContext = context;
    const controller = new AbortController();
    const stream = new ReadableStream({ start(target) {
      target.enqueue({ samples: new Float32Array([0.5, 0.5]), sampleRate: 24000 });
      target.close();
    } });
    const playback = player.playPcmStream(stream, { signal: controller.signal }).catch(error => error);
    await vi.waitFor(() => expect(source.start).toHaveBeenCalledOnce());
    if (action === 'abort') controller.abort();
    else player.stop();
    const result = await Promise.race([playback, new Promise(resolve => setTimeout(() => resolve('still pending'), 20))]);
    expect(result).toMatchObject({ name: 'AbortError' });
    expect(source.stop).toHaveBeenCalled();
    expect(source.disconnect).toHaveBeenCalled();
    expect(player.scheduledAudioSources.size).toBe(0);
    expect(player.streamReader).toBeNull();
    expect(stream.locked).toBe(false);
  });

  it.each(['abort', 'stop', 'replace'])('cancels buffered provider audio on %s without reviving old playback', async action => {
    const { player, audios } = fixture();
    const cancel = vi.fn();
    const stream = new ReadableStream({ cancel });
    const controller = new AbortController();
    const old = player.playStream(stream, { progressive: false, signal: controller.signal }).catch(error => error);
    await vi.waitFor(() => expect(stream.locked).toBe(true));
    let replacement;
    if (action === 'abort') controller.abort();
    else if (action === 'stop') player.stop();
    else replacement = player.play(new Blob(['new']));
    const result = await Promise.race([old, new Promise(resolve => setTimeout(() => resolve('still pending'), 20))]);
    expect(result).toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalled();
    expect(stream.locked).toBe(false);
    expect(audios).toHaveLength(replacement ? 1 : 0);
    if (replacement) {
      expect(player.audio).toBe(audios[0]);
      audios[0].dispatchEvent(new Event('ended'));
      await expect(replacement).resolves.toBe(true);
    }
  });

  it.each(['stop', 'abort'])('does not acquire a PCM stream after %s during audio activation', async action => {
    const { player } = fixture();
    const { context } = contextFixture();
    const activation = deferred();
    player.audioContext = context;
    player.audioUnlockPromise = activation.promise;
    const controller = new AbortController();
    const stream = new ReadableStream();
    const playback = player.playPcmStream(stream, { signal: controller.signal }).catch(error => error);
    if (action === 'stop') player.stop();
    else controller.abort();
    activation.resolve();
    const result = await Promise.race([playback, new Promise(resolve => setTimeout(() => resolve('still pending'), 20))]);
    expect(result).toMatchObject({ name: 'AbortError' });
    expect(stream.locked).toBe(false);
    expect(player.streamReader).toBeNull();
    expect(player.rejectCurrent).toBeNull();
  });

  it('does not attach a provider stream when a stopped MediaSource opens late', async () => {
    const audio = new AudioStub();
    const media = Object.assign(new EventTarget(), {
      readyState: 'closed', addSourceBuffer: vi.fn(() => ({})),
    });
    const remove = vi.spyOn(media, 'removeEventListener');
    const player = new VoicePlayer({
      audioFactory: () => audio, mediaSourceFactory: () => media,
      isMediaSourceTypeSupported: () => true,
      createObjectURL: () => 'blob:stream', revokeObjectURL: vi.fn(),
    });
    const stream = new ReadableStream();
    const playback = player.playStream(stream).catch(error => error);
    player.stop();
    expect(await playback).toMatchObject({ name: 'AbortError' });
    expect(remove).toHaveBeenCalledWith('sourceopen', expect.any(Function));
    media.readyState = 'open'; media.dispatchEvent(new Event('sourceopen'));
    await Promise.resolve(); await Promise.resolve();
    expect(media.addSourceBuffer).not.toHaveBeenCalled();
    expect(stream.locked).toBe(false);
    expect(player.streamReader).toBeNull();
  });

  it('disconnects a Web Audio source when start throws before falling back', async () => {
    const { player, audios } = fixture();
    const { context, decoding, source } = contextFixture();
    source.start.mockImplementation(() => { throw new Error('start failed'); });
    decoding.resolve({}); player.audioContext = context;
    const playback = player.play(new Blob(['audio']));
    await vi.waitFor(() => expect(audios).toHaveLength(1));
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(player.audioSource).toBeNull();
    audios[0].dispatchEvent(new Event('ended'));
    await expect(playback).resolves.toBe(true);
  });
});
