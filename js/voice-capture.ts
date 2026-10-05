export interface VoiceCaptureOptions {
  mediaDevices?: MediaDevices; MediaRecorderClass?: typeof MediaRecorder;
  maxDurationMs?: number; onLimit?: () => void;
}

// voice-capture.js — ephemeral microphone capture with explicit lifecycle cleanup.

const DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000;

function preferredMimeType(MediaRecorderClass: Pick<typeof MediaRecorder, 'isTypeSupported'> | null | undefined) {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/webm',
  ];
  if (typeof MediaRecorderClass?.isTypeSupported !== 'function') return '';
  return candidates.find(type => MediaRecorderClass.isTypeSupported(type)) || '';
}

function stopTracks(stream: MediaStream | null) {
  for (const track of stream?.getTracks?.() || []) {
    try { track.stop(); } catch {}
  }
}

export class VoiceCaptureSession {
  declare mediaDevices: MediaDevices;
  declare MediaRecorderClass: typeof MediaRecorder;
  declare maxDurationMs: number;
  declare onLimit: () => void;
  declare stream: MediaStream | null;
  declare recorder: MediaRecorder | null;
  declare chunks: Blob[];
  declare limitTimer: ReturnType<typeof setTimeout> | null;
  declare cancelled: boolean;

  constructor(options: VoiceCaptureOptions = {}) {
    this.mediaDevices = options.mediaDevices || navigator.mediaDevices;
    this.MediaRecorderClass = options.MediaRecorderClass || globalThis.MediaRecorder;
    this.maxDurationMs = Math.max(1000, Number(options.maxDurationMs) || DEFAULT_MAX_DURATION_MS);
    this.onLimit = typeof options.onLimit === 'function' ? options.onLimit : () => {};
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.limitTimer = null;
    this.cancelled = false;
  }

  async start() {
    if (!this.mediaDevices?.getUserMedia || !this.MediaRecorderClass) {
      throw new Error('Microphone recording is not supported by this browser.');
    }
    this.cancelled = false;
    this.chunks = [];
    const stream = await this.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    this.stream = stream;
    const mimeType = preferredMimeType(this.MediaRecorderClass);
    try {
      this.recorder = new this.MediaRecorderClass(stream, mimeType ? { mimeType } : undefined);
    } catch (error) {
      stopTracks(stream);
      this.stream = null;
      throw error;
    }
    this.recorder.addEventListener('dataavailable', event => {
      if (!this.cancelled && event.data?.size) this.chunks.push(event.data);
    });
    this.recorder.start(250);
    this.limitTimer = setTimeout(() => this.onLimit(), this.maxDurationMs);
    return { mimeType: this.recorder.mimeType || mimeType, startedAt: Date.now() };
  }

  stop() {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') {
      stopTracks(this.stream);
      this.stream = null;
      return Promise.resolve(new Blob(this.chunks, { type: recorder?.mimeType || 'audio/webm' }));
    }
    return new Promise<Blob>((resolve, reject) => {
      const cleanup = () => {
        if (this.limitTimer) clearTimeout(this.limitTimer);
        this.limitTimer = null;
        stopTracks(this.stream);
        this.stream = null;
        this.recorder = null;
      };
      recorder.addEventListener('stop', () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
        cleanup();
        resolve(blob);
      }, { once: true });
      recorder.addEventListener('error', event => {
        cleanup();
        reject((event as Event & { error?: unknown }).error || new Error('Microphone recording failed.'));
      }, { once: true });
      try {
        recorder.stop();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  cancel() {
    this.cancelled = true;
    this.chunks = [];
    if (this.limitTimer) clearTimeout(this.limitTimer);
    this.limitTimer = null;
    const recorder = this.recorder;
    this.recorder = null;
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    } catch {}
    stopTracks(this.stream);
    this.stream = null;
  }
}

export { preferredMimeType };
