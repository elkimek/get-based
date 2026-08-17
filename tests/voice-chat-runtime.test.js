// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { state } from '../js/state.js';
import { clearKeyCache, updateKeyCache } from '../js/crypto-key-cache.js';
import {
  buildActionBar,
  configureChatMessageActionDeps,
} from '../js/chat-actions.js';
import {
  installVoiceSettingsPanel,
  renderVoiceSettingsPanel,
} from '../js/settings-voice-panel.js';
import { voiceProviderKeyStatus } from '../js/settings-voice-view.js';
import { VoiceCaptureSession, preferredMimeType } from '../js/voice-capture.js';
import {
  configureVoiceLocalEngine,
  terminateLocalVoiceWorker,
} from '../js/voice-local-engine.js';
import { VoicePlayer, trimPcmEdgeSilence } from '../js/voice-player.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realFetch = globalThis.fetch;

class FakeMediaRecorder extends EventTarget {
  static isTypeSupported(type) {
    return type === 'audio/webm;codecs=opus';
  }

  constructor(_stream, options = {}) {
    super();
    this.mimeType = options.mimeType || 'audio/webm';
    this.state = 'inactive';
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    const dataEvent = new Event('dataavailable');
    Object.defineProperty(dataEvent, 'data', {
      value: new Blob(['voice'], { type: this.mimeType }),
    });
    this.dispatchEvent(dataEvent);
    this.state = 'inactive';
    this.dispatchEvent(new Event('stop'));
  }
}

class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.paused = true;
    this.src = '';
    this.playbackRate = 1;
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  removeAttribute() {}
  load() {}
}

class FakeSourceBuffer extends EventTarget {
  constructor() {
    super();
    this.updating = false;
    this.appended = [];
  }

  appendBuffer(bytes) {
    this.updating = true;
    this.appended.push(new Uint8Array(bytes));
    queueMicrotask(() => {
      this.updating = false;
      this.dispatchEvent(new Event('updateend'));
    });
  }

  abort() {
    this.updating = false;
  }
}

class FakeMediaSource extends EventTarget {
  constructor() {
    super();
    this.readyState = 'closed';
    this.sourceBuffer = new FakeSourceBuffer();
  }

  open() {
    this.readyState = 'open';
    this.dispatchEvent(new Event('sourceopen'));
  }

  addSourceBuffer() {
    return this.sourceBuffer;
  }

  endOfStream() {
    this.readyState = 'ended';
  }
}

class FakeBufferSource {
  constructor() {
    this.buffer = null;
    this.playbackRate = { value: 1 };
    this.onended = null;
    this.connected = false;
  }

  connect() { this.connected = true; }
  disconnect() { this.connected = false; }
  stop() {}
  start() { queueMicrotask(() => this.onended?.()); }
}

class FakeAudioContext {
  constructor() {
    this.state = 'suspended';
    this.destination = {};
    this.source = null;
    this.currentTime = 0;
    this.createdBuffers = [];
  }

  async resume() { this.state = 'running'; }
  async decodeAudioData() { return {}; }
  createBuffer(_channels, length, sampleRate) {
    const channel = new Float32Array(length);
    const buffer = {
      duration: length / sampleRate,
      getChannelData: () => channel,
    };
    this.createdBuffers.push(buffer);
    return buffer;
  }
  createBufferSource() {
    this.source = new FakeBufferSource();
    return this.source;
  }
}

class ControlledVoiceWorker extends EventTarget {
  constructor() {
    super();
    this.request = null;
  }

  postMessage(request) {
    this.request = request;
  }

  respond(data) {
    const event = new Event('message');
    Object.defineProperty(event, 'data', { value: data });
    this.dispatchEvent(event);
  }

  terminate() {}
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="notification-container"></div>';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  clearKeyCache();
  vi.restoreAllMocks();
});

describe('voice capture and playback primitives', () => {
  it('chooses an available compressed microphone format', () => {
    expect(preferredMimeType(FakeMediaRecorder)).toBe('audio/webm;codecs=opus');
  });

  it('returns an audio blob and always stops microphone tracks', async () => {
    const stopTrack = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopTrack }],
    };
    const session = new VoiceCaptureSession({
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      MediaRecorderClass: FakeMediaRecorder,
      maxDurationMs: 30_000,
    });

    await session.start();
    const blob = await session.stop();

    expect(blob.type).toBe('audio/webm;codecs=opus');
    expect(blob.size).toBeGreaterThan(0);
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('revokes each object URL after playback and rejects stopped playback', async () => {
    const audio = new FakeAudio();
    const revoke = vi.fn();
    const player = new VoicePlayer({
      audioFactory: () => audio,
      createObjectURL: () => 'blob:voice',
      revokeObjectURL: revoke,
    });
    const first = player.play(new Blob(['first']));
    audio.dispatchEvent(new Event('ended'));
    await expect(first).resolves.toBe(true);
    expect(revoke).toHaveBeenCalledWith('blob:voice');

    const secondAudio = new FakeAudio();
    const secondPlayer = new VoicePlayer({
      audioFactory: () => secondAudio,
      createObjectURL: () => 'blob:second',
      revokeObjectURL: revoke,
    });
    const second = secondPlayer.play(new Blob(['second']));
    secondPlayer.stop();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('unlocks Web Audio during the user action and plays after delayed synthesis', async () => {
    const context = new FakeAudioContext();
    const player = new VoicePlayer({
      audioContextFactory: () => context,
    });

    expect(player.unlock()).toBe(true);
    expect(player.hasPlaybackActivation).toBe(true);
    await Promise.resolve();
    expect(context.state).toBe('running');
    await expect(player.play(new Blob(['speech']), { rate: 1.2 })).resolves.toBe(true);
    expect(context.source.playbackRate.value).toBe(1.2);
    expect(context.source.connected).toBe(false);
    expect(player.isPlaying).toBe(false);
  });

  it('buffers a provider stream only when MediaSource playback is unavailable', async () => {
    const audio = new FakeAudio();
    const player = new VoicePlayer({
      audioFactory: () => audio,
      isMediaSourceTypeSupported: () => false,
      createObjectURL: blob => `blob:stream-${blob.size}`,
      revokeObjectURL: vi.fn(),
    });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
        controller.close();
      },
    });

    const playback = player.playStream(stream, { contentType: 'audio/mpeg' });
    await vi.waitFor(() => expect(audio.src).toBe('blob:stream-4'));
    audio.dispatchEvent(new Event('ended'));

    await expect(playback).resolves.toBe(true);
  });

  it('buffers automatic provider playback through the user-unlocked audio context', async () => {
    const context = new FakeAudioContext();
    const player = new VoicePlayer({
      audioContextFactory: () => context,
      mediaSourceFactory: () => new FakeMediaSource(),
      isMediaSourceTypeSupported: () => true,
    });
    expect(player.unlock()).toBe(true);
    await Promise.resolve();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
        controller.close();
      },
    });

    await expect(player.playStream(stream, {
      contentType: 'audio/mpeg',
      progressive: false,
    })).resolves.toBe(true);
    expect(context.source).not.toBeNull();
  });

  it('primes media playback and appends provider bytes progressively', async () => {
    const audio = new FakeAudio();
    const mediaSource = new FakeMediaSource();
    const player = new VoicePlayer({
      audioFactory: () => audio,
      mediaSourceFactory: () => mediaSource,
      isMediaSourceTypeSupported: type => type === 'audio/mpeg',
      createObjectURL: () => 'blob:media-source',
      revokeObjectURL: vi.fn(),
    });
    let releaseSecondChunk;
    const secondChunkReady = new Promise(resolve => { releaseSecondChunk = resolve; });
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        await secondChunkReady;
        controller.enqueue(new Uint8Array([3, 4]));
        controller.close();
      },
    });

    expect(player.primeStreamPlayback('audio/mpeg')).toBe(true);
    expect(audio.paused).toBe(false);
    const playback = player.playStream(stream, { contentType: 'audio/mpeg' });
    mediaSource.open();
    await vi.waitFor(() => expect(mediaSource.sourceBuffer.appended).toHaveLength(1));
    expect(mediaSource.sourceBuffer.appended[0]).toEqual(new Uint8Array([1, 2]));
    releaseSecondChunk();
    await vi.waitFor(() => expect(mediaSource.sourceBuffer.appended).toHaveLength(2));
    audio.dispatchEvent(new Event('ended'));

    await expect(playback).resolves.toBe(true);
    expect(mediaSource.readyState).toBe('ended');
  });

  it('cancels and releases a failed provider stream before clearing session state', async () => {
    const audio = new FakeAudio();
    const mediaSource = new FakeMediaSource();
    mediaSource.sourceBuffer.appendBuffer = () => {
      throw new Error('decoder rejected bytes');
    };
    const cancel = vi.fn();
    const revoke = vi.fn();
    const pause = vi.spyOn(audio, 'pause');
    const player = new VoicePlayer({
      audioFactory: () => audio,
      mediaSourceFactory: () => mediaSource,
      isMediaSourceTypeSupported: () => true,
      createObjectURL: () => 'blob:failed-stream',
      revokeObjectURL: revoke,
    });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
      },
      cancel,
    });

    expect(player.primeStreamPlayback('audio/mpeg')).toBe(true);
    const playback = player.playStream(stream, { contentType: 'audio/mpeg' });
    mediaSource.open();

    await expect(playback).rejects.toThrow('decoder rejected bytes');
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    expect(pause).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:failed-stream');
    expect(player.audio).toBeNull();
    expect(player.streamReader).toBeNull();
    expect(player.sourceBuffer).toBeNull();
  });

  it('schedules local PCM chunks as Kokoro emits them', async () => {
    const context = new FakeAudioContext();
    const player = new VoicePlayer({
      audioContextFactory: () => context,
    });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue({
          samples: new Float32Array([0, 0.25, -0.25]),
          sampleRate: 24_000,
        });
        controller.enqueue({
          samples: new Float32Array([0.1, -0.1]),
          sampleRate: 24_000,
        });
        controller.close();
      },
    });

    await expect(player.playPcmStream(stream)).resolves.toBe(true);
    expect(context.createdBuffers).toHaveLength(2);
    expect(context.createdBuffers[0].getChannelData()).toEqual(
      new Float32Array([0, 0.25, -0.25]),
    );
    expect(player.scheduledAudioSources.size).toBe(0);
  });

  it('keeps a short natural pause while trimming excessive PCM edge silence', () => {
    const samples = new Float32Array(24_000);
    samples.fill(0.2, 8_000, 16_000);
    const trimmed = trimPcmEdgeSilence(samples, 24_000);
    expect(trimmed.length).toBe(8_000 + (2 * 2_880));
    expect(trimmed[2_880]).toBeCloseTo(0.2);
  });
});

describe('voice settings and chat controls', () => {
  it('loads curated OpenRouter models and model-specific voices automatically', async () => {
    localStorage.setItem('labcharts-ai-provider', 'openrouter');
    updateKeyCache('labcharts-openrouter-key', 'or-ai-key');
    globalThis.fetch = vi.fn().mockImplementation(url => Promise.resolve(new Response(JSON.stringify({
      data: String(url).includes('transcription')
        ? [
            { id: 'openai/whisper-large-v3' },
            { id: 'openai/whisper-large-v3-turbo' },
            { id: 'openai/gpt-4o-mini-transcribe' },
            { id: 'obscure/stt' },
          ]
        : [
            {
              id: 'x-ai/grok-voice-tts-1.0',
              supported_voices: ['eve', 'ara', 'rex', 'sal', 'leo'],
            },
            {
              id: 'google/gemini-3.1-flash-tts-preview',
              supported_voices: ['Zephyr', 'Puck'],
            },
            {
              id: 'hexgrad/kokoro-82m',
              supported_voices: ['af_heart', 'bm_george'],
            },
          ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    document.body.innerHTML = `<main>${renderVoiceSettingsPanel(true)}</main>`;
    installVoiceSettingsPanel(document);
    const sttModel = document.querySelector('[data-voice-openrouter-model-label="stt"]');
    const ttsModel = document.querySelector('[data-voice-openrouter-model-label="tts"]');
    const voice = document.querySelector('[data-voice-cloud-voices="openrouter"]');

    await vi.waitFor(() => expect(voice.options).toHaveLength(2));
    expect(sttModel.textContent).toBe('Whisper Large V3');
    expect(ttsModel.textContent).toBe('Kokoro 82M');
    expect(voice.value).toBe('af_heart');
    expect(voice.options[0].textContent).toBe('Af Heart · en-US · female');
    expect(document.body.textContent).not.toContain('Grok Voice via OpenRouter');
  });

  it('buffers OpenRouter TTS before playback instead of using MediaSource', async () => {
    const originalHistory = state.chatHistory;
    const originalThreadId = state.currentThreadId;
    localStorage.setItem('labcharts-ai-provider', 'openrouter');
    updateKeyCache('labcharts-openrouter-key', 'or-managed-voice-key');
    state.currentThreadId = 'openrouter-tts-buffer-test';
    state.chatHistory = [{ role: 'assistant', content: 'A spoken subscription reply.' }];
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    }));
    const unlock = vi.spyOn(VoicePlayer.prototype, 'unlock').mockReturnValue(true);
    const prime = vi.spyOn(VoicePlayer.prototype, 'primeStreamPlayback').mockReturnValue(true);
    const playStream = vi.spyOn(VoicePlayer.prototype, 'playStream').mockResolvedValue(true);

    try {
      const { readAssistantMessage } = await import('../js/voice-controller.js');
      await expect(readAssistantMessage(0)).resolves.toBe(true);

      expect(unlock).toHaveBeenCalled();
      expect(prime).not.toHaveBeenCalled();
      expect(playStream).toHaveBeenCalledWith(expect.any(ReadableStream), expect.objectContaining({
        contentType: 'audio/mpeg',
        progressive: false,
      }));
      expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toMatchObject({
        modelId: 'hexgrad/kokoro-82m',
        voiceId: 'af_heart',
      });
    } finally {
      state.chatHistory = originalHistory;
      state.currentThreadId = originalThreadId;
    }
  });

  it('loads PPQ voice choices automatically when PPQ is the active AI provider', async () => {
    localStorage.setItem('labcharts-ai-provider', 'ppq');
    updateKeyCache('labcharts-ppq-key', 'ppq-ai-key');
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        {
          id: 'aura-2-thalia-en',
          name: 'Thalia',
          model_id: 'deepgram_aura_2',
          language: 'en',
          gender: 'female',
        },
        {
          id: 'incompatible-eleven-voice',
          name: 'Other model',
          model_id: 'eleven_v3',
          language: 'multi',
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    document.body.innerHTML = `<main>${renderVoiceSettingsPanel(true)}</main>`;
    installVoiceSettingsPanel(document);
    const row = document.querySelector('[data-voice-visible="output:ppq"]');
    const select = document.querySelector('[data-voice-cloud-voices="ppq"]');

    await vi.waitFor(() => expect(select.value).toBe('aura-2-thalia-en'));
    expect(select.options).toHaveLength(1);
    expect(row.hidden).toBe(false);
    expect(select.options[0].textContent).toBe('Thalia · en · female');
    expect(localStorage.getItem('labcharts-ppq-voice')).toBe('aura-2-thalia-en');
  });

  it('does not let an older PPQ language request replace the current voice catalogue', async () => {
    localStorage.setItem('labcharts-ai-provider', 'ppq');
    updateKeyCache('labcharts-ppq-key', 'ppq-ai-key');
    const pending = [];
    globalThis.fetch = vi.fn((_url, options) => new Promise(resolve => {
      pending.push({ resolve, signal: options?.signal });
    }));

    document.body.innerHTML = `<main>${renderVoiceSettingsPanel(true)}</main>`;
    installVoiceSettingsPanel(document);
    await vi.waitFor(() => expect(pending).toHaveLength(1));

    const language = document.querySelector('[data-voice-setting="outputLanguage"]');
    language.value = 'fr';
    language.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0].signal.aborted).toBe(true);

    pending[1].resolve(new Response(JSON.stringify({
      data: [{
        id: 'aura-2-agathe-fr',
        name: 'Agathe',
        model_id: 'deepgram_aura_2',
        language: 'fr',
        gender: 'female',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const select = document.querySelector('[data-voice-cloud-voices="ppq"]');
    await vi.waitFor(() => expect(select.value).toBe('aura-2-agathe-fr'));

    pending[0].resolve(new Response(JSON.stringify({
      data: [{
        id: 'aura-2-thalia-en',
        name: 'Thalia',
        model_id: 'deepgram_aura_2',
        language: 'en',
        gender: 'female',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(select.value).toBe('aura-2-agathe-fr');
    expect([...select.options].map(option => option.value)).toEqual(['aura-2-agathe-fr']);
    expect(localStorage.getItem('labcharts-ppq-voice')).toBe('aura-2-agathe-fr');
  });

  it.each([
    ['manual refresh', 'refresh-voices'],
    ['connection test', 'test-provider'],
  ])('does not let a stale PPQ %s overwrite a newer language catalogue', async (_label, action) => {
    localStorage.setItem('labcharts-ai-provider', 'ppq');
    updateKeyCache('labcharts-ppq-key', 'ppq-ai-key');
    const pending = [];
    globalThis.fetch = vi.fn((_url, options) => new Promise(resolve => {
      pending.push({ resolve, signal: options?.signal });
    }));
    const responseFor = (id, name, language) => new Response(JSON.stringify({
      data: [{
        id,
        name,
        model_id: 'deepgram_aura_2',
        language,
        gender: 'female',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    document.body.innerHTML = `<main>${renderVoiceSettingsPanel(true)}</main>`;
    installVoiceSettingsPanel(document);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    pending[0].resolve(responseFor('aura-2-thalia-en', 'Thalia', 'en'));
    const select = document.querySelector('[data-voice-cloud-voices="ppq"]');
    await vi.waitFor(() => expect(select.value).toBe('aura-2-thalia-en'));

    let button = document.querySelector(`[data-voice-action="${action}"][data-provider="ppq"]`);
    if (!(button instanceof HTMLButtonElement)) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.voiceAction = action;
      button.dataset.provider = 'ppq';
      document.querySelector('[data-tab-panel="voice"]').appendChild(button);
    }
    button.click();
    await vi.waitFor(() => expect(pending).toHaveLength(2));

    const language = document.querySelector('[data-voice-setting="outputLanguage"]');
    language.value = 'fr';
    language.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    pending[2].resolve(responseFor('aura-2-agathe-fr', 'Agathe', 'fr'));
    await vi.waitFor(() => expect(select.value).toBe('aura-2-agathe-fr'));

    pending[1].resolve(responseFor('aura-2-thalia-en', 'Thalia', 'en'));
    await vi.waitFor(() => expect(button.disabled).toBe(false));

    expect(select.value).toBe('aura-2-agathe-fr');
    expect([...select.options].map(option => option.value)).toEqual(['aura-2-agathe-fr']);
    expect(localStorage.getItem('labcharts-ppq-voice')).toBe('aura-2-agathe-fr');
  });

  it('loads private Venice Kokoro voices automatically and saves the selection', async () => {
    localStorage.setItem('labcharts-ai-provider', 'venice');
    updateKeyCache('labcharts-venice-key', 'venice-ai-key');
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: 'tts-kokoro',
        type: 'tts',
        model_spec: {
          privacy: 'private',
          default_voice: 'af_sky',
          voices: ['af_sky', 'bm_george'],
        },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    document.body.innerHTML = `<main>${renderVoiceSettingsPanel(true)}</main>`;
    installVoiceSettingsPanel(document);
    const inputRow = document.querySelector('[data-voice-visible="input:venice"]');
    const outputRows = document.querySelectorAll('[data-voice-visible="output:venice"]');
    const select = document.querySelector('[data-voice-cloud-voices="venice"]');

    await vi.waitFor(() => expect(select.options).toHaveLength(2));
    expect(inputRow.hidden).toBe(false);
    expect(inputRow.textContent).toContain('Whisper Large V3');
    expect(inputRow.textContent).toContain('choose OpenRouter for dictation');
    expect([...outputRows].every(row => !row.hidden)).toBe(true);
    expect(select.value).toBe('af_sky');
    expect(select.options[0].textContent).toBe('Af Sky · en-US · female');
    expect(document.body.textContent).toContain('Private, zero-retention transcription');
    expect(document.body.textContent).toContain('separate from chat E2EE');

    select.value = 'bm_george';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(localStorage.getItem('labcharts-venice-voice')).toBe('bm_george');
  });

  it('discloses encrypted sync for cloud keys without claiming local-server sync', () => {
    expect(voiceProviderKeyStatus('xai', true)).toContain('included in encrypted sync');
    expect(voiceProviderKeyStatus('elevenlabs', true)).toContain('encrypted in this browser');
    expect(voiceProviderKeyStatus('local-server', true)).toBe('Saved securely on this device');
    expect(voiceProviderKeyStatus('xai', false)).toBe('Not configured');
  });

  it('links providers by default and reveals independent choices on request', () => {
    document.body.innerHTML = `<main>${renderVoiceSettingsPanel(true)}</main>`;
    expect(installVoiceSettingsPanel(document)).toBe(true);
    const panel = document.querySelector('[data-tab-panel="voice"]');
    const inputProvider = panel.querySelector('[data-voice-setting="inputProvider"]');
    const outputProvider = panel.querySelector('[data-voice-setting="outputProvider"]');
    const sharedProvider = panel.querySelector('[data-voice-shared-provider]');
    const separateProviders = panel.querySelector('[data-voice-setting="providersLinked"]');

    sharedProvider.value = 'xai';
    sharedProvider.dispatchEvent(new Event('change', { bubbles: true }));
    expect(localStorage.getItem('labcharts-voice-input-provider')).toBe('xai');
    expect(localStorage.getItem('labcharts-voice-output-provider')).toBe('xai');
    separateProviders.checked = true;
    separateProviders.dispatchEvent(new Event('change', { bubbles: true }));
    inputProvider.value = 'xai';
    inputProvider.dispatchEvent(new Event('change', { bubbles: true }));
    outputProvider.value = 'elevenlabs';
    outputProvider.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('labcharts-voice-input-provider')).toBe('xai');
    expect(localStorage.getItem('labcharts-voice-output-provider')).toBe('elevenlabs');
    expect(localStorage.getItem('labcharts-voice-providers-linked')).toBe('false');
    expect(panel.querySelector('[data-voice-visible="output:elevenlabs"]').hidden).toBe(false);
    expect(panel.textContent).toContain('Use different services for dictation and listening');
    expect(panel.querySelector(
      '[data-voice-action="install-model"][data-kind="stt"]',
    ).disabled).toBe(false);
    expect(panel.querySelector(
      '[data-voice-action="remove-model"][data-kind="stt"]',
    ).disabled).toBe(true);
    expect(panel.querySelector('.voice-model-footnote').textContent.replace(/\s+/g, ' '))
      .toContain('never start a model download automatically');
  });

  it('requires the explicit Kokoro GPU weight download when processing changes', () => {
    localStorage.setItem('labcharts-voice-local-tts-backend', 'wasm');
    localStorage.setItem(
      'labcharts-voice-model-installed-tts-onnx-community%2FKokoro-82M-v1.0-ONNX',
      JSON.stringify({
        version: '2',
        model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
        backend: 'wasm',
        availableBackends: ['wasm'],
      }),
    );
    document.body.innerHTML = `<main>${renderVoiceSettingsPanel(true)}</main>`;
    installVoiceSettingsPanel(document);
    const select = document.querySelector('[data-voice-setting="localTtsBackend"]');
    select.value = 'webgpu';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const row = document.querySelector('[data-voice-model-kind="tts"]');
    expect(row.textContent).toContain('about 330 MB');
    expect(row.textContent).toContain('Download needed for the selected processing mode');
    expect(row.querySelector('[data-voice-action="install-model"]').disabled).toBe(false);
  });

  it('keeps model progress and completion attached to the selection that started them', async () => {
    const worker = new ControlledVoiceWorker();
    const previous = configureVoiceLocalEngine({ workerFactory: () => worker });
    try {
      document.body.innerHTML = `<main>${renderVoiceSettingsPanel(true)}</main>`;
      installVoiceSettingsPanel(document);
      const panel = document.querySelector('[data-tab-panel="voice"]');
      const modelSelect = panel.querySelector('[data-voice-setting="localSttModel"]');
      const backendSelect = panel.querySelector('[data-voice-setting="localSttBackend"]');
      const button = panel.querySelector(
        '[data-voice-action="install-model"][data-kind="stt"]',
      );
      button.click();
      await vi.waitFor(() => expect(worker.request).not.toBeNull());
      expect(modelSelect.disabled).toBe(true);
      expect(backendSelect.disabled).toBe(true);

      modelSelect.value = 'onnx-community/whisper-large-v3-turbo';
      modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const progress = panel.querySelector('[data-voice-model-progress="stt"]');
      expect(progress.hidden).toBe(true);
      worker.respond({
        type: 'progress',
        id: worker.request.id,
        progress: { file: 'old-model.onnx' },
      });
      expect(progress.hidden).toBe(true);

      worker.respond({
        type: 'ready',
        id: worker.request.id,
        backend: 'wasm',
      });
      await vi.waitFor(() => expect(modelSelect.disabled).toBe(false));
      const row = panel.querySelector('[data-voice-model-kind="stt"]');
      expect(row.querySelector('.settings-copy-title').textContent).toContain('Large v3 Turbo');
      expect(row.querySelector('[data-voice-model-status="stt"]').textContent)
        .toBe('Not downloaded yet');
    } finally {
      terminateLocalVoiceWorker('stt');
      configureVoiceLocalEngine(previous);
    }
  });

  it('renders Listen only on assistant messages and delegates its exact index', () => {
    const original = state.chatHistory;
    const called = [];
    const previousDeps = configureChatMessageActionDeps({
      toggleMessageSpeech: index => called.push(index),
    });
    try {
      state.chatHistory = [
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer' },
      ];
      expect(buildActionBar(0)).toBe('');
      document.body.innerHTML = buildActionBar(1);
      const button = document.getElementById('chat-listen-btn-1');
      expect(button?.textContent).toContain('Listen');
      button.click();
      expect(called).toEqual([1]);
    } finally {
      configureChatMessageActionDeps(previousDeps);
      state.chatHistory = original;
    }
  });

  it('keeps the heavy controller behind the first-use loader boundary', () => {
    const loader = fs.readFileSync(path.join(root, 'js/voice-loader.js'), 'utf8');
    const chatLoader = fs.readFileSync(path.join(root, 'js/chat-loader.js'), 'utf8');
    const shell = fs.readFileSync(path.join(root, 'js/app-shell-hooks.js'), 'utf8');
    expect(loader).toContain("import('./voice-controller.js')");
    expect(chatLoader).not.toContain("from './voice-controller.js'");
    expect(shell).not.toContain("from './voice-controller.js'");
  });
});
