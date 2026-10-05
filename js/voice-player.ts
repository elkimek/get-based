export interface VoicePlaybackOptions { signal?: AbortSignal | undefined; rate?: number | undefined }
export interface VoiceStreamPlaybackOptions extends VoicePlaybackOptions { contentType?: string; progressive?: boolean }
export interface VoicePcmPlaybackOptions extends VoicePlaybackOptions {
  onPlaybackStart?: (() => void) | undefined; onPlaybackWaiting?: (() => void) | undefined;
}
export interface VoicePcmChunk { samples?: Float32Array | ArrayLike<number> | undefined; sampleRate?: number | undefined }
export interface VoicePlayerOptions {
  audioFactory?: () => HTMLAudioElement; audioContextFactory?: () => AudioContext | null;
  mediaSourceFactory?: () => MediaSource | null; isMediaSourceTypeSupported?: (mimeType: string) => boolean;
  createObjectURL?: (value: Blob | MediaSource) => string; revokeObjectURL?: (url: string) => void;
  audioUnlockTimeoutMs?: number; pcmStallTimeoutMs?: number;
}
type PreparedStream = { audio: HTMLAudioElement; mediaSource: MediaSource; mimeType: string; objectUrl: string; playPromise: Promise<void> };

// voice-player.js — one-at-a-time blob playback with URL and abort cleanup.

function abortError(reason?: unknown) {
  return reason instanceof Error
    ? reason
    : new DOMException('Speech playback stopped', 'AbortError');
}

function baseMimeType(value: unknown) {
  return String(value || 'audio/mpeg').split(';')[0]!.trim().toLowerCase();
}

function waitForPromise<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function readStreamChunk<T>(reader: ReadableStreamDefaultReader<T>, signal: AbortSignal | undefined, timeoutMs = 120_000) {
  return new Promise<ReadableStreamReadResult<T>>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = <V>(operation: (value: V) => void) => (value: V) => {
      if (settled) return;
      settled = true;
      cleanup();
      operation(value);
    };
    const onAbort = () => finish(reject)(abortError(signal?.reason));
    const timeoutId = setTimeout(() => finish(reject)(new Error(
      'Local speech generation stopped responding. Try a shorter reply or another voice service.',
    )), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    reader.read().then(finish(resolve), finish(reject));
  });
}

export function trimPcmEdgeSilence(samples: Float32Array, sampleRate: number, {
  threshold = 0.0015,
  keepSeconds = 0.06,
}: { threshold?: number; keepSeconds?: number } = {}) {
  if (!(samples instanceof Float32Array) || !samples.length) return samples;
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]!) < threshold) first += 1;
  if (first === samples.length) return samples;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]!) < threshold) last -= 1;
  const keep = Math.max(0, Math.round((Number(sampleRate) || 24_000) * keepSeconds));
  return samples.subarray(Math.max(0, first - keep), Math.min(samples.length, last + keep + 1));
}

function waitForMediaSourceOpen(mediaSource: MediaSource, signal: AbortSignal | undefined) {
  if (mediaSource.readyState === 'open') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      mediaSource.removeEventListener('sourceopen', onOpen);
      mediaSource.removeEventListener('sourceclose', onClose);
      signal?.removeEventListener('abort', onAbort);
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error('Streaming audio could not be opened.'));
    };
    const onAbort = () => {
      cleanup();
      reject(abortError(signal?.reason));
    };
    mediaSource.addEventListener('sourceopen', onOpen, { once: true });
    mediaSource.addEventListener('sourceclose', onClose, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function appendSourceBuffer(sourceBuffer: SourceBuffer, bytes: Uint8Array, signal: AbortSignal | undefined) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      sourceBuffer.removeEventListener('updateend', onUpdateEnd);
      sourceBuffer.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onUpdateEnd = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('A streamed audio segment could not be decoded.'));
    };
    const onAbort = () => {
      cleanup();
      reject(abortError(signal?.reason));
    };
    sourceBuffer.addEventListener('updateend', onUpdateEnd, { once: true });
    sourceBuffer.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      sourceBuffer.appendBuffer(bytes as BufferSource);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export class VoicePlayer {
  declare audioFactory: () => HTMLAudioElement;
  declare audioContextFactory: () => AudioContext | null;
  declare mediaSourceFactory: () => MediaSource | null;
  declare isMediaSourceTypeSupported: (mimeType: string) => boolean;
  declare createObjectURL: (value: Blob | MediaSource) => string;
  declare revokeObjectURL: (url: string) => void;
  declare audioUnlockTimeoutMs: number;
  declare pcmStallTimeoutMs: number;
  declare audio: HTMLAudioElement | null;
  declare audioContext: AudioContext | null;
  declare audioSource: AudioBufferSourceNode | null;
  declare mediaSource: MediaSource | null;
  declare sourceBuffer: SourceBuffer | null;
  declare streamReader: ReadableStreamDefaultReader<Uint8Array> | ReadableStreamDefaultReader<VoicePcmChunk> | null;
  declare scheduledAudioSources: Set<AudioBufferSourceNode>;
  declare preparedStream: PreparedStream | null;
  declare objectUrl: string;
  declare playbackActivated: boolean;
  declare audioUnlockPromise: Promise<void> | null;
  declare playbackGeneration: number;
  declare rejectCurrent: ((reason: Error) => void) | null;

  constructor(options: VoicePlayerOptions = {}) {
    this.audioFactory = options.audioFactory || (() => new Audio());
    this.audioContextFactory = options.audioContextFactory || (() => {
      const AudioContextClass = globalThis.AudioContext || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      return AudioContextClass ? new AudioContextClass() : null;
    });
    this.mediaSourceFactory = options.mediaSourceFactory || (() => (
      typeof MediaSource === 'undefined' ? null : new MediaSource()
    ));
    this.isMediaSourceTypeSupported = options.isMediaSourceTypeSupported || (mimeType => (
      typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mimeType)
    ));
    this.createObjectURL = options.createObjectURL || (blob => URL.createObjectURL(blob));
    this.revokeObjectURL = options.revokeObjectURL || (url => URL.revokeObjectURL(url));
    this.audioUnlockTimeoutMs = Math.max(1000, Number(options.audioUnlockTimeoutMs) || 5000);
    this.pcmStallTimeoutMs = Math.max(1000, Number(options.pcmStallTimeoutMs) || 120_000);
    this.audio = null;
    this.audioContext = null;
    this.audioSource = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.streamReader = null;
    this.scheduledAudioSources = new Set();
    this.preparedStream = null;
    this.objectUrl = '';
    this.playbackActivated = false;
    this.audioUnlockPromise = null;
    this.playbackGeneration = 0;
    this.rejectCurrent = null;
  }

  get isPlaying() {
    return !!this.audioSource
      || this.scheduledAudioSources.size > 0
      || (!!this.audio && !this.audio.paused);
  }

  get hasPlaybackActivation() {
    return this.playbackActivated;
  }

  /**
   * Resume Web Audio while the user click is still active. Model preparation
   * can outlive transient browser activation, so waiting until synthesis
   * finishes can otherwise produce valid but silent audio.
   */
  unlock() {
    try {
      this.audioContext ||= this.audioContextFactory();
      if (!this.audioContext) return false;
      if (this.audioContext.state === 'suspended') {
        this.playbackActivated = true;
        this.audioUnlockPromise = Promise.resolve(this.audioContext.resume()).then(() => {
          if (this.audioContext?.state === 'suspended') {
            throw new Error('The browser kept audio playback suspended.');
          }
        }).catch(error => {
          this.playbackActivated = false;
          throw error;
        });
        void this.audioUnlockPromise.catch(() => {});
      } else {
        this.playbackActivated = true;
        this.audioUnlockPromise = Promise.resolve();
      }
      return true;
    } catch {
      this.playbackActivated = false;
      return false;
    }
  }

  async ensureAudioContextReady() {
    const context = this.audioContext;
    if (!context) throw new Error('Web Audio is unavailable.');
    if (!this.audioUnlockPromise && context.state === 'suspended') this.unlock();
    if (this.audioUnlockPromise) {
      try {
        await waitForPromise(
          this.audioUnlockPromise,
          this.audioUnlockTimeoutMs,
          'Audio playback could not be enabled. Tap Listen again and keep this tab in the foreground.',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || '');
        if (message.startsWith('Audio playback could not be enabled.')) throw error;
        throw new Error(
          'Audio playback could not be enabled. Tap Listen again and check this site’s sound permission.',
          { cause: error },
        );
      }
    }
    if (context.state === 'suspended') {
      throw new Error('Audio playback is blocked. Tap Listen again and check this site’s sound permission.');
    }
  }

  supportsStreaming(contentType = 'audio/mpeg') {
    const mimeType = baseMimeType(contentType);
    try {
      return !!this.mediaSourceFactory && this.isMediaSourceTypeSupported(mimeType);
    } catch {
      return false;
    }
  }

  /**
   * Start the media element while transient user activation is still present.
   * The provider response can arrive later and attach its ReadableStream.
   */
  primeStreamPlayback(contentType = 'audio/mpeg', rate = 1) {
    const mimeType = baseMimeType(contentType);
    if (!this.supportsStreaming(mimeType)) return false;
    this.stop();
    try {
      const mediaSource = this.mediaSourceFactory();
      if (!mediaSource) return false;
      const audio = this.audioFactory();
      const objectUrl = this.createObjectURL(mediaSource);
      audio.src = objectUrl;
      audio.playbackRate = Math.max(0.5, Math.min(2, Number(rate) || 1));
      this.audio = audio;
      this.mediaSource = mediaSource;
      this.objectUrl = objectUrl;
      const playPromise = Promise.resolve(audio.play());
      // Observe a delayed autoplay rejection immediately; playStream still
      // awaits the original promise and reports the error to the caller.
      this.playbackActivated = true;
      void playPromise.catch(() => {
        this.playbackActivated = false;
      });
      this.preparedStream = { audio, mediaSource, mimeType, objectUrl, playPromise };
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  stop(reason?: unknown) {
    this.playbackGeneration += 1;
    const reject = this.rejectCurrent;
    this.rejectCurrent = null;
    const reader = this.streamReader;
    this.streamReader = null;
    if (reader) void reader.cancel(reason).catch(() => {});
    if (this.sourceBuffer) {
      try {
        if (this.sourceBuffer.updating) this.sourceBuffer.abort();
      } catch {}
      this.sourceBuffer = null;
    }
    this.mediaSource = null;
    this.preparedStream = null;
    for (const source of this.scheduledAudioSources) {
      source.onended = null;
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
    }
    this.scheduledAudioSources.clear();
    if (this.audioSource) {
      const source = this.audioSource;
      this.audioSource = null;
      source.onended = null;
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
    }
    if (this.audio) {
      try { this.audio.pause(); } catch {}
      this.audio.removeAttribute?.('src');
      this.audio.load?.();
      this.audio = null;
    }
    if (this.objectUrl) {
      this.revokeObjectURL(this.objectUrl);
      this.objectUrl = '';
    }
    reject?.(abortError(reason));
  }

  async playWithAudioContext(blob: Blob, { signal, rate }: VoicePlaybackOptions) {
    const context = this.audioContext;
    if (!context) throw new Error('Web Audio is unavailable.');
    const generation = this.playbackGeneration;
    const assertCurrent = () => {
      if (signal?.aborted || generation !== this.playbackGeneration) throw abortError(signal?.reason);
    };
    await this.ensureAudioContextReady();
    assertCurrent();
    const bytes = await blob.arrayBuffer();
    assertCurrent();
    const buffer = await context.decodeAudioData(bytes.slice(0));
    assertCurrent();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.5, Math.min(2, Number(rate) || 1));
    source.connect(context.destination);
    this.audioSource = source;
    return new Promise<boolean>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        source.onended = null;
        this.rejectCurrent = null;
        if (this.audioSource === source) this.audioSource = null;
        try { source.disconnect(); } catch {}
      };
      const onEnded = () => {
        cleanup();
        resolve(true);
      };
      const onAbort = () => {
        try { source.stop(); } catch {}
        cleanup();
        reject(abortError(signal?.reason));
      };
      this.rejectCurrent = reason => {
        try { source.stop(); } catch {}
        cleanup();
        reject(reason);
      };
      source.onended = onEnded;
      signal?.addEventListener('abort', onAbort, { once: true });
      try { source.start(); } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  playWithHtmlAudio(blob: Blob, { signal, rate }: VoicePlaybackOptions) {
    const audio = this.audioFactory();
    const objectUrl = this.createObjectURL(blob);
    this.audio = audio;
    this.objectUrl = objectUrl;
    audio.src = objectUrl;
    audio.playbackRate = Math.max(0.5, Math.min(2, Number(rate) || 1));
    return new Promise<boolean>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        this.rejectCurrent = null;
        if (this.audio === audio) this.audio = null;
        try { audio.pause(); } catch {}
        audio.removeAttribute?.('src');
        audio.load?.();
        if (this.objectUrl === objectUrl) {
          this.revokeObjectURL(objectUrl);
          this.objectUrl = '';
        }
      };
      const onEnded = () => {
        cleanup();
        resolve(true);
      };
      const onError = () => {
        cleanup();
        reject(new Error('Speech audio could not be played.'));
      };
      const onAbort = () => {
        try { audio.pause(); } catch {}
        cleanup();
        reject(abortError(signal?.reason));
      };
      this.rejectCurrent = reason => {
        try { audio.pause(); } catch {}
        cleanup();
        reject(reason);
      };
      audio.addEventListener('ended', onEnded, { once: true });
      audio.addEventListener('error', onError, { once: true });
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        Promise.resolve(audio.play()).catch(error => {
          cleanup();
          reject(error);
        });
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  async bufferStream(stream: ReadableStream<Uint8Array>, contentType: string, signal: AbortSignal | undefined) {
    this.stop();
    const generation = this.playbackGeneration;
    const reader = stream.getReader();
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    const stop = (reason: unknown) => controller.abort(reason);
    this.streamReader = reader;
    this.rejectCurrent = stop;
    signal?.addEventListener('abort', abort, { once: true });
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    try {
      while (true) {
        if (signal?.aborted || controller.signal.aborted || generation !== this.playbackGeneration) throw abortError(signal?.reason);
        const { done, value } = await readStreamChunk(reader, controller.signal);
        if (done) break;
        chunks.push(value as Uint8Array<ArrayBuffer>);
      }
      if (controller.signal.aborted || generation !== this.playbackGeneration) throw abortError(signal?.reason);
      return new Blob(chunks, { type: contentType });
    } catch (error) {
      void reader.cancel(error).catch(() => {});
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (this.streamReader === reader) this.streamReader = null;
      if (this.rejectCurrent === stop) this.rejectCurrent = null;
      try { reader.releaseLock(); } catch {}
    }
  }

  /**
   * Play provider bytes as they arrive. MediaSource handles arbitrary network
   * chunk boundaries and incremental MP3 parsing; unsupported browsers buffer
   * the same stream into a Blob and use the existing Web Audio fallback.
   *
     */
  async playStream(stream: ReadableStream<Uint8Array>, {
    contentType = 'audio/mpeg',
    signal,
    rate = 1,
    progressive = true,
  }: VoiceStreamPlaybackOptions = {}) {
    const mimeType = baseMimeType(contentType);
    if (signal?.aborted) throw abortError(signal.reason);
    const canStream = progressive && this.supportsStreaming(mimeType);
    const prepared = canStream && this.preparedStream?.mimeType === mimeType
      ? this.preparedStream
      : null;
    if (!canStream || (!prepared && !this.primeStreamPlayback(mimeType, rate))) {
      const buffering = this.bufferStream(stream, contentType, signal);
      const generation = this.playbackGeneration;
      const blob = await buffering;
      if (generation !== this.playbackGeneration) throw abortError(signal?.reason);
      return this.play(blob, { signal, rate });
    }
    const session = prepared || this.preparedStream;
    if (!session) throw new Error('Streaming audio could not be prepared.');
    this.preparedStream = null;
    const {
      audio,
      mediaSource,
      objectUrl,
      playPromise,
    } = session;

    return new Promise<boolean>((resolve, reject) => {
      let settled = false;
      const lifecycle = new AbortController();
      let receivedBytes = 0;
      let readerDone = false;
        let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
        let sourceBuffer: SourceBuffer | null = null;
      const releaseReader = () => {
        if (!reader) return;
        const activeReader = reader;
        reader = null;
        if (this.streamReader === activeReader) this.streamReader = null;
        try { activeReader.releaseLock(); } catch {}
      };
      const cleanup = (reason?: unknown) => {
        if (settled) return;
        settled = true;
        lifecycle.abort(reason);
        signal?.removeEventListener('abort', onAbort);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onAudioError);
        if (this.rejectCurrent === fail) this.rejectCurrent = null;
        if (reader && !readerDone) {
          const activeReader = reader;
          void activeReader.cancel(reason).catch(() => {}).finally(() => {
            if (reader === activeReader) releaseReader();
            else {
              try { activeReader.releaseLock(); } catch {}
            }
          });
        } else {
          releaseReader();
        }
        if (sourceBuffer) {
          try {
            if (sourceBuffer.updating) sourceBuffer.abort();
          } catch {}
        }
        if (this.sourceBuffer === sourceBuffer) this.sourceBuffer = null;
        try {
          if (reason && mediaSource.readyState === 'open') mediaSource.endOfStream('decode');
        } catch {}
        try { audio.pause(); } catch {}
        audio.removeAttribute?.('src');
        audio.load?.();
        if (this.audio === audio) this.audio = null;
        if (this.mediaSource === mediaSource) this.mediaSource = null;
        if (this.objectUrl === objectUrl) {
          this.revokeObjectURL(objectUrl);
          this.objectUrl = '';
        }
      };
      const fail = (error: unknown) => {
        if (settled) return;
        const failure = error instanceof Error
          ? error
          : new Error(String(error || 'Streaming audio failed.'));
        cleanup(failure);
        reject(failure);
      };
      const onEnded = () => {
        cleanup();
        resolve(true);
      };
      const onAudioError = () => fail(new Error('Streamed speech audio could not be played.'));
      const onAbort = () => {
        fail(abortError(signal?.reason));
      };
      this.rejectCurrent = fail;
      audio.addEventListener('ended', onEnded, { once: true });
      audio.addEventListener('error', onAudioError, { once: true });
      signal?.addEventListener('abort', onAbort, { once: true });
      void playPromise.catch(fail);

      void (async () => {
        try {
          await waitForPromise(waitForMediaSourceOpen(mediaSource, lifecycle.signal),
            this.audioUnlockTimeoutMs, 'Streaming audio could not be opened.');
          if (settled) return;
          sourceBuffer = mediaSource.addSourceBuffer(mimeType);
          this.sourceBuffer = sourceBuffer;
          reader = stream.getReader();
          this.streamReader = reader;
          while (true) {
            const { done, value } = await readStreamChunk(reader, lifecycle.signal);
            if (settled) return;
            if (done) break;
            if (!value?.byteLength) continue;
            receivedBytes += value.byteLength;
            await waitForPromise(appendSourceBuffer(sourceBuffer, value, lifecycle.signal),
              120_000, 'A streamed audio segment stopped responding.');
          }
          readerDone = true;
          releaseReader();
          if (!receivedBytes) throw new Error('The voice provider returned an empty audio stream.');
          if (mediaSource.readyState === 'open') mediaSource.endOfStream();
          await playPromise;
        } catch (error) {
          fail(error);
        }
      })();
    });
  }

  /**
   * Schedule local Float32 PCM chunks as soon as Kokoro emits them.
   *
     */
  async playPcmStream(stream: ReadableStream<VoicePcmChunk>, {
    signal,
    rate = 1,
    onPlaybackStart,
    onPlaybackWaiting,
  }: VoicePcmPlaybackOptions = {}) {
    this.stop();
    if (signal?.aborted) throw abortError(signal.reason);
    this.audioContext ||= this.audioContextFactory();
    const context = this.audioContext;
    if (!context) throw new Error('Web Audio is unavailable for local speech streaming.');
    const generation = this.playbackGeneration;
    await this.ensureAudioContextReady();
    if (signal?.aborted || generation !== this.playbackGeneration) throw abortError(signal?.reason);

    const internalController = new AbortController();
    const onExternalAbort = () => internalController.abort(signal?.reason);
    signal?.addEventListener('abort', onExternalAbort, { once: true });
    const stopCurrent = (reason: unknown) => internalController.abort(reason);
    this.rejectCurrent = stopCurrent;
    const reader = stream.getReader();
    this.streamReader = reader;
    let nextStartTime = context.currentTime + 0.03;
    let receivedSamples = 0;
    let lastPlayback: Promise<void> | null = null;
    let playbackStarted = false;
    let streamDone = false;
    let waitingForChunk = false;
    const sessionSources = new Set<AudioBufferSourceNode>();

    const schedule = (samples: Float32Array, sampleRate: number) => {
      const buffer = context.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = Math.max(0.5, Math.min(2, Number(rate) || 1));
      source.connect(context.destination);
      this.scheduledAudioSources.add(source);
      sessionSources.add(source);
      const startTime = Math.max(nextStartTime, context.currentTime + 0.02);
      nextStartTime = startTime + buffer.duration / source.playbackRate.value;
      receivedSamples += samples.length;
      lastPlayback = new Promise<void>(resolve => {
        source.onended = () => {
          source.onended = null;
          this.scheduledAudioSources.delete(source);
          sessionSources.delete(source);
          try { source.disconnect(); } catch {}
          if (!streamDone && this.scheduledAudioSources.size === 0) {
            waitingForChunk = true;
            try { onPlaybackWaiting?.(); } catch {}
          }
          resolve();
        };
      });
      source.start(startTime);
      if (!playbackStarted || waitingForChunk) {
        playbackStarted = true;
        waitingForChunk = false;
        try { onPlaybackStart?.(); } catch {}
      }
    };

    try {
      while (true) {
        if (internalController.signal.aborted) {
          throw abortError(internalController.signal.reason);
        }
        const { done, value } = await readStreamChunk(
          reader,
          internalController.signal,
          this.pcmStallTimeoutMs,
        );
        if (done) {
          streamDone = true;
          break;
        }
        const rawSamples = value?.samples instanceof Float32Array
          ? value.samples
          : new Float32Array(value?.samples || []);
        const sampleRate = Math.max(8_000, Number(value?.sampleRate) || 24_000);
        const samples = trimPcmEdgeSilence(rawSamples, sampleRate);
        if (!samples.length) continue;
        schedule(samples, sampleRate);
      }
      if (internalController.signal.aborted) {
        throw abortError(internalController.signal.reason);
      }
      // schedule() assigns this promise from a nested callback.
      const finalPlayback = lastPlayback as Promise<void> | null;
      if (!receivedSamples || !finalPlayback) {
        throw new Error('Kokoro returned an empty audio stream.');
      }
      // stop() clears onended handlers, so cancellation must also settle the
      // final wait after the producer has already closed its stream.
      await new Promise<void>((resolve, reject) => {
        const signal = internalController.signal;
        const onAbort = () => {
          signal.removeEventListener('abort', onAbort);
          reject(abortError(signal.reason));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        finalPlayback.then(value => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        }, error => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        });
        if (signal.aborted) onAbort();
      });
      return true;
    } catch (error) {
      // Only retire sources created by this session; a replacement may already
      // have started while cancellation of the old reader was pending.
      for (const source of sessionSources) {
        source.onended = null;
        this.scheduledAudioSources.delete(source);
        try { source.stop(); } catch {}
        try { source.disconnect(); } catch {}
      }
      sessionSources.clear();
      try { await reader.cancel(error); } catch {}
      throw error;
    } finally {
      signal?.removeEventListener('abort', onExternalAbort);
      if (this.rejectCurrent === stopCurrent) this.rejectCurrent = null;
      if (this.streamReader === reader) this.streamReader = null;
      try { reader.releaseLock(); } catch {}
    }
  }

  play(blob: Blob, { signal, rate = 1 }: VoicePlaybackOptions = {}) {
    this.stop();
    if (signal?.aborted) return Promise.reject(abortError(signal.reason));
    const generation = this.playbackGeneration;
    if (this.audioContext) {
      return this.playWithAudioContext(blob, { signal, rate }).catch(error => {
        if (generation !== this.playbackGeneration) throw abortError();
        if (error?.name === 'AbortError' || signal?.aborted) throw error;
        return this.playWithHtmlAudio(blob, { signal, rate });
      });
    }
    return this.playWithHtmlAudio(blob, { signal, rate });
  }
}

export const voicePlayer = new VoicePlayer();
