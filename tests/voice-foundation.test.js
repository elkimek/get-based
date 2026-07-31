import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureApiProviderStorageRuntimeDeps,
} from '../js/api-provider-storage-runtime.js';
import { clearKeyCache } from '../js/crypto-key-cache.js';
import {
  VOICE_STORAGE_KEYS,
  getVoiceProviderKey,
  getVoiceSettings,
  normalizeLocalVoiceServerUrl,
  saveVoiceProviderKey,
  setVoiceSetting,
} from '../js/voice-settings-storage.js';
import {
  VOICE_BACKUP_KEYS,
  VOICE_ENCRYPTED_SYNC_KEYS,
  VOICE_SYNC_KEYS,
} from '../js/voice-settings-schema.js';
import { encodeWav, resampleAudio } from '../js/voice-audio.js';
import { resolveLocalSttLanguage } from '../js/voice-model-catalog.js';
import {
  isLocalVoiceModelReady,
  removeLocalVoiceModel,
  resolveLocalBackend,
  verifyLocalVoiceModelReady,
} from '../js/voice-local-engine.js';
import { localModelStatusText } from '../js/settings-voice-hardware.js';
import { normalizeSpeechText, splitSpeechText } from '../js/voice-text.js';

afterEach(() => {
  for (const key of Object.values(VOICE_STORAGE_KEYS)) localStorage.removeItem(key);
  clearKeyCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('voice settings storage', () => {
  it('defaults to one linked browser-local service for input and output', () => {
    expect(getVoiceSettings()).toMatchObject({
      inputProvider: 'browser-local',
      outputProvider: 'browser-local',
      providersLinked: true,
      inputLanguage: 'auto',
      outputLanguage: 'en',
      localSttBackend: 'auto',
      localTtsBackend: 'auto',
      localVoice: 'af_heart',
      autoRead: false,
      rate: 1,
    });
    expect(getVoiceSettings().localSttModel).toBe('onnx-community/whisper-small');
  });

  it('migrates removed legacy Whisper selections to Small', () => {
    localStorage.setItem(
      VOICE_STORAGE_KEYS.localSttModel,
      'onnx-community/whisper-tiny',
    );
    expect(getVoiceSettings().localSttModel).toBe('onnx-community/whisper-small');

    setVoiceSetting('localSttModel', 'onnx-community/whisper-tiny');
    expect(getVoiceSettings().localSttModel).toBe('onnx-community/whisper-small');
  });

  it('preserves existing split providers and can link them explicitly', () => {
    localStorage.setItem(VOICE_STORAGE_KEYS.inputProvider, 'browser-local');
    localStorage.setItem(VOICE_STORAGE_KEYS.outputProvider, 'elevenlabs');
    expect(getVoiceSettings().providersLinked).toBe(false);

    setVoiceSetting('providersLinked', true);
    expect(getVoiceSettings()).toMatchObject({
      providersLinked: true,
      inputProvider: 'browser-local',
      outputProvider: 'browser-local',
    });
  });

  it('keeps hardware-specific choices device-local from sync but includes them in backups', () => {
    expect(VOICE_SYNC_KEYS).toContain(VOICE_STORAGE_KEYS.xaiKey);
    expect(VOICE_SYNC_KEYS).not.toContain(VOICE_STORAGE_KEYS.inputProvider);
    expect(VOICE_SYNC_KEYS).not.toContain(VOICE_STORAGE_KEYS.localSttBackend);
    expect(VOICE_SYNC_KEYS).not.toContain(VOICE_STORAGE_KEYS.localServerUrl);
    expect(VOICE_ENCRYPTED_SYNC_KEYS).toEqual(expect.arrayContaining([
      VOICE_STORAGE_KEYS.xaiKey,
      VOICE_STORAGE_KEYS.elevenlabsKey,
    ]));
    expect(VOICE_BACKUP_KEYS).toEqual(expect.arrayContaining([
      VOICE_STORAGE_KEYS.inputProvider,
      VOICE_STORAGE_KEYS.localSttBackend,
      VOICE_STORAGE_KEYS.localServerUrl,
    ]));
  });

  it('normalizes providers, speed, language, and local server URLs', () => {
    setVoiceSetting('providersLinked', false);
    setVoiceSetting('inputProvider', 'xai');
    setVoiceSetting('outputProvider', 'untrusted');
    setVoiceSetting('inputLanguage', 'cs');
    setVoiceSetting('localSttBackend', 'wasm');
    setVoiceSetting('localTtsBackend', 'webgpu');
    setVoiceSetting('rate', 9);
    setVoiceSetting('localServerUrl', 'http://localhost:8000/v1/');

    expect(getVoiceSettings()).toMatchObject({
      inputProvider: 'xai',
      outputProvider: 'browser-local',
      inputLanguage: 'cs',
      localSttBackend: 'wasm',
      localTtsBackend: 'webgpu',
      rate: 2,
      localServerUrl: 'http://localhost:8000',
    });
    expect(normalizeLocalVoiceServerUrl('javascript:alert(1)')).toBe('');
    expect(normalizeLocalVoiceServerUrl('not a url')).toBe('');
  });

  it('routes provider credentials through encrypted storage and the memory cache', async () => {
    const encryptedSetItem = vi.fn().mockResolvedValue(undefined);
    const previous = configureApiProviderStorageRuntimeDeps({ encryptedSetItem });
    try {
      await saveVoiceProviderKey('elevenlabs', ' secret ');
      expect(encryptedSetItem).toHaveBeenCalledWith(
        VOICE_STORAGE_KEYS.elevenlabsKey,
        'secret',
      );
      expect(getVoiceProviderKey('elevenlabs')).toBe('secret');
    } finally {
      configureApiProviderStorageRuntimeDeps(previous);
    }
  });
});

describe('speech text normalization', () => {
  it('reads semantic text without speaking Markdown or URLs', () => {
    const normalized = normalizeSpeechText(`
## Result

- Ferritin is **42 ng/mL**.
- Read [the source](https://example.test/path).

\`\`\`js
alert('not spoken');
\`\`\`
`);
    expect(normalized).toContain('Result');
    expect(normalized).toContain('Ferritin is 42 ng/mL.');
    expect(normalized).toContain('Read the source.');
    expect(normalized).toContain('Code block omitted.');
    expect(normalized).not.toContain('https://');
    expect(normalized).not.toContain('```');
  });

  it('does not turn paragraph boundaries into doubled punctuation', () => {
    expect(normalizeSpeechText('First sentence.\n\nSecond sentence.')).toBe(
      'First sentence. Second sentence.',
    );
  });

  it('keeps an unpunctuated heading with the paragraph it introduces', () => {
    expect(normalizeSpeechText(
      'Thyroid panel explanation (male, 36)\n\n'
      + 'Your thyroid data is stale. Values may no longer reflect current status.',
    )).toBe(
      'Thyroid panel explanation (male, 36): '
      + 'Your thyroid data is stale. Values may no longer reflect current status.',
    );
  });

  it('skips a compact Markdown table with a concise spoken notice', () => {
    const normalized = normalizeSpeechText(`
| Marker | Result | Range |
| --- | ---: | :--- |
| Ferritin | 42 ng/mL | 30–300 |
| Iron | 85 µg/dL | 60–170 |
`);
    expect(normalized).toBe(
      'See the table in the message for details.',
    );
    expect(normalized).not.toContain('Ferritin');
    expect(normalized).not.toContain('Iron');
  });

  it('keeps surrounding prose while skipping every row in a long table', () => {
    const normalized = normalizeSpeechText(`
The notable results are shown below.

| Marker | Result | Status |
| --- | ---: | --- |
| A | 1 | Normal |
| B | 2 | Normal |
| C | 3 | Normal |
| D | 4 | Normal |
| E | 5 | Normal |
| F | 6 | Normal |
| G | 7 | High |
| H | 8 | Critical |

Retesting is recommended.
`);
    expect(normalized).toBe(
      'The notable results are shown below. '
      + 'See the table in the message for details. '
      + 'Retesting is recommended.',
    );
    expect(normalized).not.toContain('Normal');
    expect(normalized).not.toContain('Critical');
  });

  it('uses the same concise copy for a one-row table', () => {
    expect(normalizeSpeechText(`
| Marker | Result | Unit | Status |
| --- | ---: | --- | --- |
| Ferritin | 42 | ng/mL | Normal |
`)).toBe('See the table in the message for details.');
  });

  it('splits long speech on sentence boundaries', () => {
    const chunks = splitSpeechText(
      `${'First sentence. '.repeat(20)}${'Second sentence. '.repeat(20)}`,
      220,
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.length <= 225)).toBe(true);
    expect(chunks.join(' ')).toContain('Second sentence.');
  });
});

describe('local transcription language', () => {
  it('passes explicit and automatic choices through to multilingual models', () => {
    expect(resolveLocalSttLanguage('onnx-community/whisper-small', 'cs')).toBe('cs');
    expect(resolveLocalSttLanguage('onnx-community/whisper-small', 'auto')).toBe('auto');
    expect(resolveLocalSttLanguage('onnx-community/whisper-large-v3-turbo', 'de')).toBe('de');
  });

  it('reports the actual backend and last inference time', () => {
    expect(localModelStatusText({ backend: 'webgpu', lastInferenceMs: 20_140 })).toBe(
      'Ready to use · Graphics processor · last transcription 20.1s',
    );
    expect(localModelStatusText({
      backend: 'wasm',
      fallbackReason: 'No adapter',
      lastInferenceMs: 16_050,
    })).toBe('Ready to use · Main processor (graphics unavailable) · last transcription 16.1s');
    expect(localModelStatusText({
      backend: 'wasm',
      lastInferenceMs: 7_500,
    }, 'tts')).toBe('Ready to use · Main processor · last speech generation 7.5s');
  });

  it('chooses the fastest measured backend without assuming GPU is faster', () => {
    expect(resolveLocalBackend('auto')).toBe('wasm');
    expect(resolveLocalBackend('auto', { wasm: null, webgpu: null })).toBe('wasm');
    expect(resolveLocalBackend('auto', { wasm: 2_100 })).toBe('wasm');
    expect(resolveLocalBackend('auto', { webgpu: 9_800 })).toBe('webgpu');
    expect(resolveLocalBackend('auto', { wasm: 2_100, webgpu: 9_800 })).toBe('wasm');
    expect(resolveLocalBackend('auto', { wasm: 16_000, webgpu: 10_000 })).toBe('webgpu');
    expect(resolveLocalBackend('auto', {
      wasm: { realtimeFactor: 0.8 },
      webgpu: { realtimeFactor: 0.5 },
    })).toBe('webgpu');
    expect(resolveLocalBackend('webgpu', { wasm: 1 })).toBe('webgpu');
  });

  it('requires an explicit Kokoro download for each weight variant', () => {
    const key = 'labcharts-voice-model-installed-tts-onnx-community%2FKokoro-82M-v1.0-ONNX';
    localStorage.setItem(key, JSON.stringify({
      version: '2',
      model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
      backend: 'wasm',
      availableBackends: ['wasm'],
    }));
    expect(isLocalVoiceModelReady('tts', 'onnx-community/Kokoro-82M-v1.0-ONNX', 'wasm')).toBe(true);
    expect(isLocalVoiceModelReady('tts', 'onnx-community/Kokoro-82M-v1.0-ONNX', 'webgpu')).toBe(false);
    localStorage.removeItem(key);
  });

  it('invalidates a ready marker when the browser evicted its model files', async () => {
    const model = 'onnx-community/whisper-small';
    const key = 'labcharts-voice-model-installed-stt-onnx-community%2Fwhisper-small';
    localStorage.setItem(key, JSON.stringify({
      version: '2',
      model,
      backend: 'wasm',
    }));
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['transformers-cache']),
      open: vi.fn().mockResolvedValue({ keys: vi.fn().mockResolvedValue([]) }),
    });

    await expect(verifyLocalVoiceModelReady('stt', model, 'wasm')).resolves.toBe(false);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('matches every encoded slash when removing nested model cache paths', async () => {
    const deleteEntry = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['transformers-cache']),
      open: vi.fn().mockResolvedValue({
        keys: vi.fn().mockResolvedValue([
          new Request('https://models.test/org%2Ffamily%2Fmodel/config.json'),
        ]),
        delete: deleteEntry,
      }),
    });

    await expect(removeLocalVoiceModel('stt', 'org/family/model')).resolves.toBe(1);
    expect(deleteEntry).toHaveBeenCalledOnce();
  });
});

describe('voice audio utilities', () => {
  it('resamples audio and emits a valid mono PCM WAV header', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1]);
    const resampled = resampleAudio(samples, 4, 8);
    expect(resampled).toHaveLength(8);
    const wav = encodeWav(samples, 16_000);
    const view = new DataView(wav);
    expect(String.fromCharCode(...new Uint8Array(wav.slice(0, 4)))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(22, true)).toBe(1);
  });
});
