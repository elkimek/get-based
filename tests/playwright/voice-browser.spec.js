import { expect, test } from './coverage-fixture.js';

async function installVoiceBrowserFakes(page) {
  await page.addInitScript(() => {
    window.__voiceTrackStops = 0;
    window.__voiceGetUserMediaCalls = 0;
    window.__voiceObjectUrlKinds = [];
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
        const event = new Event('dataavailable');
        Object.defineProperty(event, 'data', {
          value: new Blob(['browser voice fixture'], { type: this.mimeType }),
        });
        this.dispatchEvent(event);
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
        queueMicrotask(() => this.dispatchEvent(new Event('ended')));
        return Promise.resolve();
      }

      pause() {
        this.paused = true;
      }

      removeAttribute() {}
      load() {}
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          window.__voiceGetUserMediaCalls += 1;
          return {
            getTracks: () => [{
              stop: () => { window.__voiceTrackStops += 1; },
            }],
          };
        },
      },
    });
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: async () => ({
          info: { description: 'Test GPU' },
        }),
      },
    });
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: FakeMediaRecorder,
    });
    Object.defineProperty(window, 'Audio', {
      configurable: true,
      value: FakeAudio,
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: source => {
        window.__voiceObjectUrlKinds.push(source instanceof Blob
          ? `blob:${source.type}:${source.size}`
          : 'media-source');
        return 'blob:voice-browser-fixture';
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: () => {},
    });
  });
}

async function openVoiceSettingsFromUi(page) {
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { profileStorageKey } = await import('/js/profile.js');
    const { endTour } = await import('/js/tour.js');
    endTour({ openEmptyChat: false });
    localStorage.setItem(profileStorageKey(state.currentProfile, 'tour'), 'completed');
    localStorage.setItem(profileStorageKey(state.currentProfile, 'emptyTour'), 'completed');
  });
  await page.locator('.settings-btn').first().click();
  await page.locator('[data-settings-tab="voice"]').click();
  await expect(page.locator('[data-tab-panel="voice"]')).toHaveClass(/\bactive\b/);
}

test('voice playback skips Markdown tables without dropping surrounding prose', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const spokenText = await page.evaluate(async () => {
    const { normalizeSpeechText } = await import('/js/voice-text.js');
    return normalizeSpeechText(`
The notable results are shown below.

| Marker | Result | Status |
| --- | ---: | --- |
| Ferritin | 42 | Normal |
| Iron | 85 | High |

Retesting is recommended.
`);
  });

  expect(spokenText).toBe(
    'The notable results are shown below. '
    + 'See the table in the message for details. '
    + 'Retesting is recommended.',
  );
  expect(spokenText).not.toContain('Ferritin');
  expect(spokenText).not.toContain('Iron');
});

test('browser-local voice routes first use to an explicit model download', async ({ page }) => {
  await installVoiceBrowserFakes(page);
  await page.goto('/app', { waitUntil: 'load' });

  const started = await page.evaluate(async () => {
    const { toggleVoiceRecording } = await import('/js/voice-controller.js');
    return toggleVoiceRecording();
  });

  expect(started).toBe(false);
  expect(await page.evaluate(() => window.__voiceGetUserMediaCalls)).toBe(0);
  await expect(page.locator('[data-tab-panel="voice"]')).toHaveClass(/\bactive\b/);
  const sttRow = page.locator('[data-voice-model-kind="stt"]');
  await expect(sttRow.locator('[data-voice-model-status="stt"]')).toContainText(
    'Not downloaded yet',
  );
  await expect(sttRow.locator('[data-voice-action="install-model"]')).toBeEnabled();
  await expect(sttRow.locator('[data-voice-action="install-model"]')).toBeFocused();
  await expect(sttRow.locator('[data-voice-action="remove-model"]')).toBeDisabled();
  await expect(page.locator('.voice-model-footnote')).toContainText(
    'never start a model download automatically',
  );
});

test('denied hosted dictation never requests microphone access', async ({ page }) => {
  await installVoiceBrowserFakes(page);
  await page.goto('/app', { waitUntil: 'load' });

  const started = await page.evaluate(async () => {
    const [{ configureAppExtension }, { updateKeyCache }, cloudConsent, settings, controller] = await Promise.all([
      import('/js/app-extension-runtime.js'),
      import('/js/crypto-key-cache.js'),
      import('/js/cloud-ai-consent.js'),
      import('/js/voice-settings-storage.js'),
      import('/js/voice-controller.js'),
    ]);
    configureAppExtension({
      id: 'voice-browser-privacy-test',
      voice: {
        isRequestOwned: ({ providerId }) => providerId === 'openrouter',
        authorizeRequest: () => false,
      },
    });
    localStorage.setItem('labcharts-ai-provider', 'openrouter');
    localStorage.setItem(cloudConsent.CLOUD_AI_CONSENT_KEY, JSON.stringify({
      version: cloudConsent.CLOUD_AI_CONSENT_VERSION,
      approvals: { openrouter: { accepted: true } },
    }));
    updateKeyCache('labcharts-openrouter-key', 'or-browser-privacy-test');
    settings.setVoiceSetting('inputProvider', 'openrouter');
    return controller.toggleVoiceRecording();
  });

  expect(started).toBe(false);
  expect(await page.evaluate(() => window.__voiceGetUserMediaCalls)).toBe(0);
  await expect(page.locator('#chat-voice-status')).toContainText('No audio was sent');
});

test('an edition can buffer managed OpenRouter speech before browser playback', async ({ page }) => {
  await installVoiceBrowserFakes(page);
  let requestPayload;
  await page.route('https://openrouter.ai/api/v1/audio/speech', async route => {
    requestPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
      body: 'mock openrouter mp3 bytes',
    });
  });
  await page.goto('/app', { waitUntil: 'load' });

  const result = await page.evaluate(async () => {
    const [{ state }, { configureAppExtension }, { updateKeyCache }, cloudConsent, controller] = await Promise.all([
      import('/js/state.js'),
      import('/js/app-extension-runtime.js'),
      import('/js/crypto-key-cache.js'),
      import('/js/cloud-ai-consent.js'),
      import('/js/voice-controller.js'),
    ]);
    configureAppExtension({
      id: 'managed-openrouter-playback-test',
      voice: {
        getPlaybackPolicy: ({ providerId }) => providerId === 'openrouter'
          ? { progressive: false }
          : {},
      },
    });
    localStorage.setItem('labcharts-ai-provider', 'openrouter');
    localStorage.setItem(cloudConsent.CLOUD_AI_CONSENT_KEY, JSON.stringify({
      version: cloudConsent.CLOUD_AI_CONSENT_VERSION,
      approvals: { openrouter: { accepted: true, provider: 'openrouter' } },
    }));
    updateKeyCache('labcharts-openrouter-key', 'or-browser-tts-test');
    state.currentThreadId = 'openrouter-tts-browser-test';
    state.chatHistory = [{ role: 'assistant', content: 'Read this subscription reply.' }];
    return controller.readAssistantMessage(0);
  });

  expect(result).toBe(true);
  expect(requestPayload).toMatchObject({
    model: 'hexgrad/kokoro-82m',
    voice: 'af_heart',
  });
  expect(await page.evaluate(() => window.__voiceObjectUrlKinds)).toEqual([
    'blob:audio/mpeg:25',
  ]);
});

test('pending first-use auto-read stays bound to its open panel and thread', async ({ page }) => {
  let releaseController;
  let markControllerRequested;
  const controllerGate = new Promise(resolve => { releaseController = resolve; });
  const controllerRequested = new Promise(resolve => { markControllerRequested = resolve; });
  await page.route('**/js/voice-controller.js', async route => {
    markControllerRequested();
    await controllerGate;
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: `
        export function readAssistantMessage(messageIndex, options) {
          globalThis.__pendingVoiceReadCalls.push({ messageIndex, automatic: options?.automatic });
          return Promise.resolve(true);
        }
        export function stopVoiceActivity() { return true; }
        export function toggleMessageSpeech() { return Promise.resolve(true); }
        export function toggleVoiceRecording() { return Promise.resolve(true); }
      `,
    });
  });
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const loader = await import('/js/voice-loader.js?pending-auto-read-context=1');
    const panel = document.getElementById('chat-panel');
    panel.classList.add('open');
    state.currentThreadId = 'thread-origin';
    state.chatHistory = [{ role: 'assistant', content: 'Origin reply' }];
    localStorage.setItem('labcharts-voice-auto-read', 'true');
    globalThis.__pendingVoiceReadCalls = [];
    globalThis.__pendingVoiceLoader = loader;
    globalThis.__pendingVoiceRead = loader.maybeAutoReadAssistantMessage(0);
  });
  await controllerRequested;

  await page.evaluate(() => {
    document.getElementById('chat-panel')?.classList.remove('open');
    globalThis.__pendingVoiceLoader.stopVoiceActivity();
  });
  releaseController();
  expect(await page.evaluate(() => globalThis.__pendingVoiceRead)).toBe(false);
  expect(await page.evaluate(() => globalThis.__pendingVoiceReadCalls)).toEqual([]);

  const switchedThreadResult = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const panel = document.getElementById('chat-panel');
    panel.classList.add('open');
    state.currentThreadId = 'thread-origin';
    state.chatHistory = [{ role: 'assistant', content: 'Origin reply' }];
    const pending = globalThis.__pendingVoiceLoader.maybeAutoReadAssistantMessage(0);
    state.currentThreadId = 'thread-other';
    state.chatHistory = [{ role: 'assistant', content: 'Unrelated reply' }];
    return pending;
  });
  expect(switchedThreadResult).toBe(false);
  expect(await page.evaluate(() => globalThis.__pendingVoiceReadCalls)).toEqual([]);
});

test('Voice settings and chat STT/TTS controls work with a local compatible server', async ({ page }) => {
  await installVoiceBrowserFakes(page);
  await page.route('http://127.0.0.1:8765/**', async route => {
    const request = route.request();
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization,content-type',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (new URL(request.url()).pathname.endsWith('/audio/transcriptions')) {
      await route.fulfill({
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'check my ferritin' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      // Use a non-MediaSource fixture so the fake audio element exercises the
      // buffered fallback; progressive MP3 transport is covered by unit tests.
      headers: { ...headers, 'Content-Type': 'audio/wav' },
      body: 'mock audio',
    });
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    localStorage.setItem(
      'labcharts-voice-model-installed-stt-onnx-community%2Fwhisper-small',
      JSON.stringify({
        version: '2',
        model: 'onnx-community/whisper-small',
        backend: 'wasm',
        performance: {
          wasm: { realtimeFactor: 0.5 },
          webgpu: { realtimeFactor: 2 },
        },
      }),
    );
    localStorage.setItem(
      'labcharts-voice-model-installed-tts-onnx-community%2FKokoro-82M-v1.0-ONNX',
      JSON.stringify({
        version: '2',
        model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
        backend: 'webgpu',
        performance: {
          wasm: { realtimeFactor: 1.2 },
          webgpu: { realtimeFactor: 0.6 },
        },
      }),
    );
    const modelCache = await caches.open('voice-model-test-fixtures');
    await modelCache.put(
      'https://huggingface.co/onnx-community/whisper-small/resolve/main/config.json',
      new Response('{}'),
    );
    await modelCache.put(
      'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/config.json',
      new Response('{}'),
    );
  });

  await openVoiceSettingsFromUi(page);
  await expect(page.locator('[data-tab-panel="voice"]')).toHaveClass(/\bactive\b/);
  await expect(page.locator('[data-tab-panel="voice"]')).toContainText('Where voice is processed');
  await expect(page.locator('[data-tab-panel="voice"]')).toContainText('Quality and speed');
  await expect(page.locator('[data-tab-panel="voice"]')).toContainText('Processing');
  await expect(page.locator('[data-tab-panel="voice"]')).toContainText(
    'Use different services for dictation and listening',
  );
  await expect(page.locator('[data-tab-panel="voice"]')).toContainText('Speaking speed');
  await expect(page.locator('[data-voice-shared-provider]')).toHaveValue('auto');
  await expect(page.locator('[data-voice-setting="inputProvider"]')).toHaveValue('auto');
  await expect(page.locator('[data-voice-setting="outputProvider"]')).toHaveValue('auto');
  await expect(page.locator('[data-voice-auto-status]')).toContainText(
    'OpenRouter is not connected yet, so voice stays on this device',
  );
  await expect(page.locator('[data-voice-setting="inputProvider"]')).toBeHidden();
  const separateServicesToggle = page.locator(
    'label.toggle-switch:has([data-voice-setting="providersLinked"])',
  );
  await separateServicesToggle.click();
  await expect(page.locator('[data-voice-setting="inputProvider"]')).toBeVisible();
  await separateServicesToggle.click();
  await expect(page.locator('[data-voice-model-kind="stt"]')).toContainText('Whisper Small');
  await expect(page.locator('[data-voice-model-kind="tts"]')).toContainText('Kokoro');
  const sttModelSelect = page.locator('[data-voice-setting="localSttModel"]');
  const languageSelect = page.locator('[data-voice-setting="inputLanguage"]');
  const hardwareSelect = page.locator('[data-voice-setting="localSttBackend"]');
  const speechHardwareSelect = page.locator('[data-voice-setting="localTtsBackend"]');
  const outputLanguageSelect = page.locator('[data-voice-setting="outputLanguage"]');
  await expect(sttModelSelect.locator('option')).toHaveCount(2);
  await expect(hardwareSelect).toHaveValue('auto');
  await expect(hardwareSelect.locator('option')).toHaveCount(3);
  await expect(hardwareSelect.locator('option').first()).toHaveText('Automatic (recommended)');
  await hardwareSelect.selectOption('wasm');
  await expect(page.locator('[data-voice-hardware-description]')).toContainText(
    'Uses your computer’s main processor',
  );
  await hardwareSelect.selectOption('auto');
  await expect(page.locator('[data-voice-hardware-description]')).toContainText(
    'Automatic will use the main processor; it was about 4.0× faster in your tests.',
  );
  await expect(outputLanguageSelect).toBeDisabled();
  await expect(outputLanguageSelect).toHaveValue('en');
  await expect(speechHardwareSelect).toHaveValue('auto');
  await expect(speechHardwareSelect.locator('option')).toHaveCount(3);
  await expect(page.locator('[data-voice-output-hardware-description]')).toContainText(
    'Automatic will use the graphics processor; it was about 2.0× faster in your tests.',
  );
  await page.locator('[data-voice-shared-provider]').selectOption('local-server');
  await expect(outputLanguageSelect).toBeEnabled();
  await page.locator('[data-voice-shared-provider]').selectOption('browser-local');
  await expect(sttModelSelect).toContainText('Higher accuracy · Whisper Large');
  await languageSelect.selectOption('cs');
  await sttModelSelect.selectOption('onnx-community/whisper-large-v3-turbo');
  await expect(languageSelect).toBeEnabled();
  await expect(languageSelect).toHaveValue('cs');
  await expect(page.locator('[data-voice-model-kind="stt"]')).toContainText(
    'Whisper Large v3 Turbo · Higher accuracy',
  );
  await expect(page.locator('[data-voice-model-kind="stt"]')).toContainText('about 770 MB');
  await sttModelSelect.selectOption('onnx-community/whisper-small');

  const result = await page.evaluate(async () => {
    const settings = await import('/js/voice-settings-storage.js');
    const controller = await import('/js/voice-controller.js');
    const actions = await import('/js/chat-actions.js');
    const { state } = await import('/js/state.js');
    settings.setVoiceSetting('inputProvider', 'local-server');
    settings.setVoiceSetting('outputProvider', 'local-server');
    settings.setVoiceSetting('localServerUrl', 'http://127.0.0.1:8765');

    const input = document.getElementById('chat-input');
    input.value = 'Draft:';
    input.setSelectionRange(input.value.length, input.value.length);
    await controller.toggleVoiceRecording();
    const recordingPressed = document.getElementById('chat-voice-btn')?.getAttribute('aria-pressed');
    await controller.toggleVoiceRecording();

    state.chatHistory = [{ role: 'assistant', content: '**Ferritin** is worth reviewing.' }];
    const host = document.createElement('div');
    host.innerHTML = actions.buildActionBar(0);
    document.body.appendChild(host);
    const readResult = await controller.readAssistantMessage(0);
    const listenLabel = document.getElementById('chat-listen-btn-0')?.textContent;
    host.remove();

    return {
      composer: input.value,
      recordingPressed,
      readResult,
      listenLabel,
      trackStops: window.__voiceTrackStops,
    };
  });

  expect(result).toEqual({
    composer: 'Draft: check my ferritin',
    recordingPressed: 'true',
    readResult: true,
    listenLabel: 'Listen',
    trackStops: 1,
  });
});

test('OpenRouter voice settings expose only curated live models and matching voices', async ({ page }) => {
  await page.route('https://openrouter.ai/api/v1/models**', async route => {
    const modality = new URL(route.request().url()).searchParams.get('output_modalities');
    const data = modality === 'transcription'
      ? [
          { id: 'openai/whisper-large-v3' },
          { id: 'openai/whisper-large-v3-turbo' },
          { id: 'openai/gpt-4o-mini-transcribe' },
          { id: 'obscure/transcriber' },
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
          { id: 'obscure/expensive-voice', supported_voices: ['costly'] },
        ];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data }),
    });
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    localStorage.setItem('labcharts-ai-provider', 'openrouter');
    const { updateKeyCache } = await import('/js/crypto-key-cache.js');
    updateKeyCache('labcharts-openrouter-key', 'or-browser-key');
  });
  await openVoiceSettingsFromUi(page);

  const sttModel = page.locator('[data-voice-openrouter-model-label="stt"]');
  const ttsModel = page.locator('[data-voice-openrouter-model-label="tts"]');
  const voice = page.locator('[data-voice-cloud-voices="openrouter"]');
  await expect(sttModel).toBeVisible();
  await expect(ttsModel).toBeVisible();
  await expect(sttModel).toHaveText('Whisper Large V3');
  await expect(ttsModel).toHaveText('Kokoro 82M');
  await expect(voice.locator('option')).toHaveCount(2);
  await expect(voice).toHaveValue('af_heart');
  await expect(voice.locator('option').first()).toHaveText('Af Heart · en-US · female');

  await expect(page.getByText('Grok Voice via OpenRouter')).toHaveCount(0);
});

test('Venice voice settings load the private Kokoro voices and preserve the choice', async ({ page }) => {
  await page.route('https://api.venice.ai/api/v1/models?type=tts', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{
          id: 'tts-kokoro',
          type: 'tts',
          model_spec: {
            privacy: 'private',
            default_voice: 'af_sky',
            voices: ['af_sky', 'bm_george'],
          },
        }],
      }),
    });
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    localStorage.setItem('labcharts-ai-provider', 'venice');
    const { updateKeyCache } = await import('/js/crypto-key-cache.js');
    updateKeyCache('labcharts-venice-key', 'venice-browser-key');
  });
  await openVoiceSettingsFromUi(page);

  await expect(page.locator('[data-voice-visible="input:venice"]')).toBeVisible();
  await expect(page.locator('[data-voice-visible="input:venice"]'))
    .toContainText('Whisper Large V3');
  await expect(page.locator('[data-voice-visible="input:venice"]'))
    .toContainText('choose OpenRouter for dictation');
  const voice = page.locator('[data-voice-cloud-voices="venice"]');
  await expect(voice).toBeVisible();
  await expect(voice.locator('option')).toHaveCount(2);
  await expect(voice).toHaveValue('af_sky');
  await expect(voice.locator('option').first()).toHaveText('Af Sky · en-US · female');
  await voice.selectOption('bm_george');
  await expect(voice).toHaveValue('bm_george');
  await expect(page.locator('[data-voice-visible="output:venice"]').first())
    .toContainText('separate from chat E2EE');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('labcharts-venice-voice')))
    .toBe('bm_george');
});

test('built-in Voice workers complete their mock STT and TTS protocols', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const request = (worker, message, transfer = []) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Voice worker timed out')), 5000);
      const onMessage = event => {
        if (event.data?.id !== message.id || event.data?.type === 'progress') return;
        clearTimeout(timeout);
        worker.removeEventListener('message', onMessage);
        if (event.data.type === 'error') reject(new Error(event.data.message));
        else resolve(event.data);
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage(message, transfer);
    });
    const requestStream = (worker, message) => new Promise((resolve, reject) => {
      const chunks = [];
      const timeout = setTimeout(() => reject(new Error('Voice stream timed out')), 5000);
      const onMessage = event => {
        if (event.data?.id !== message.id || event.data?.type === 'progress') return;
        if (event.data.type === 'error') {
          clearTimeout(timeout);
          worker.removeEventListener('message', onMessage);
          reject(new Error(event.data.message));
          return;
        }
        if (event.data.type === 'audio-chunk') {
          chunks.push(event.data.samples.byteLength);
          return;
        }
        if (event.data.type === 'audio-done') {
          clearTimeout(timeout);
          worker.removeEventListener('message', onMessage);
          resolve(chunks);
        }
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage(message);
    });

    const stt = new Worker('/js/voice-local-stt-worker.js?mock=1', { type: 'module' });
    const tts = new Worker('/js/voice-local-tts-worker.js?mock=1', { type: 'module' });
    try {
      const readyStt = await request(stt, { id: 1, type: 'init', model: 'mock-whisper' });
      const samples = new Float32Array([0, 0.1, -0.1]);
      const transcript = await request(stt, {
        id: 2,
        type: 'transcribe',
        model: 'mock-whisper',
        language: 'en',
        mockTranscript: 'worker transcript',
        audio: samples.buffer,
      }, [samples.buffer]);
      const readyTts = await request(tts, { id: 3, type: 'init', model: 'mock-kokoro' });
      const speech = await request(tts, {
        id: 4,
        type: 'synthesize',
        model: 'mock-kokoro',
        voice: 'af_heart',
        text: 'Hello',
      });
      const streamedChunks = await requestStream(tts, {
        id: 5,
        type: 'synthesize',
        streaming: true,
        model: 'mock-kokoro',
        voice: 'af_heart',
        text: 'Stream hello',
      });
      return {
        sttBackend: readyStt.backend,
        text: transcript.text,
        ttsBackend: readyTts.backend,
        ttsSamples: speech.samples.byteLength,
        streamedChunks,
        sampleRate: speech.sampleRate,
      };
    } finally {
      stt.terminate();
      tts.terminate();
    }
  });

  expect(result).toEqual({
    sttBackend: 'mock',
    text: 'worker transcript',
    ttsBackend: 'mock',
    ttsSamples: 11_520,
    streamedChunks: [11_520],
    sampleRate: 24_000,
  });
});

test('cloud connection controls preserve masked keys, labels, and provider errors', async ({ page }) => {
  let elevenMode = 'error';
  await page.route(/https:\/\/(?:api\.x\.ai\/v1\/tts\/voices|api\.elevenlabs\.io\/v2\/voices.*)/, async route => {
    if (route.request().url().includes('api.x.ai')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          voices: Array.from({ length: 26 }, (_, index) => ({
            id: `voice-${index + 1}`,
            name: `Voice ${index + 1}`,
          })),
        }),
      });
      return;
    }
    if (elevenMode === 'success') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          voices: [
            { voice_id: 'eleven-calm', name: 'Calm Clinician', labels: { language: 'en', gender: 'female' } },
            { voice_id: 'eleven-warm', name: 'Warm Guide', labels: { language: 'en', gender: 'male' } },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        detail: {
          status: 'invalid_api_key',
          message: 'The ElevenLabs API key is invalid.',
        },
      }),
    });
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const cloudConsent = await import('/js/cloud-ai-consent.js');
    localStorage.setItem(cloudConsent.CLOUD_AI_CONSENT_KEY, JSON.stringify({
      version: cloudConsent.CLOUD_AI_CONSENT_VERSION,
      approvals: {
        xai: { accepted: true },
        elevenlabs: { accepted: true },
      },
    }));
  });
  await openVoiceSettingsFromUi(page);

  const xaiCard = page.locator('[data-voice-connection="xai"]');
  await xaiCard.locator('summary').click();
  const xaiKey = xaiCard.locator('[data-voice-key-input="xai"]');
  const xaiValue = 'xai-browser-secret-123';
  await xaiKey.fill(xaiValue);
  await xaiCard.getByRole('button', { name: 'Save key' }).click();
  await expect(xaiKey).toHaveAttribute('type', 'password');
  await expect(xaiKey).toHaveValue(xaiValue);
  await expect(xaiCard.locator('[data-voice-key-status="xai"]'))
    .toContainText('included in encrypted sync when enabled');
  await xaiCard.getByRole('button', { name: 'Test connection' }).click();
  await expect(xaiCard.locator('[data-voice-test-status="xai"]'))
    .toHaveText('Connected. 26 voices available.');
  await expect(xaiKey).toHaveValue(xaiValue);
  const sharedProvider = page.locator('[data-voice-shared-provider]');
  await sharedProvider.selectOption('xai');
  const xaiVoices = page.locator('[data-voice-cloud-voices="xai"]');
  await expect(xaiVoices.locator('option')).toHaveCount(26);
  await expect(xaiVoices.locator('option').first()).toHaveText('Voice 1');
  await xaiVoices.selectOption('voice-12');

  const elevenCard = page.locator('[data-voice-connection="elevenlabs"]');
  await elevenCard.locator('summary').click();
  const elevenKey = elevenCard.locator('[data-voice-key-input="elevenlabs"]');
  const elevenValue = 'xi-browser-secret-456';
  await elevenKey.fill(elevenValue);
  await elevenCard.getByRole('button', { name: 'Save key' }).click();
  await expect(elevenCard.locator('[data-voice-key-status="elevenlabs"]'))
    .toContainText('included in encrypted sync when enabled');
  await elevenCard.getByRole('button', { name: 'Test connection' }).click();
  await expect(elevenCard.locator('[data-voice-test-status="elevenlabs"]'))
    .toHaveText('The ElevenLabs API key is invalid.');
  await expect(elevenKey).toHaveValue(elevenValue);
  elevenMode = 'success';
  await sharedProvider.selectOption('elevenlabs');
  const elevenVoices = page.locator('[data-voice-cloud-voices="elevenlabs"]');
  await page.locator('[data-voice-visible="output:elevenlabs"]')
    .getByRole('button', { name: 'Refresh voices' })
    .click();
  await expect(elevenVoices.locator('option')).toHaveCount(2);
  await expect(elevenVoices.locator('option').first()).toHaveText('Calm Clinician · en · female');
  await elevenVoices.selectOption('eleven-warm');

  await page.evaluate(async () => {
    const settings = await import('/js/settings.js');
    settings.openSettingsModal('voice');
  });
  await expect(page.locator('[data-voice-key-input="xai"]')).toHaveValue(xaiValue);
  await expect(page.locator('[data-voice-key-input="elevenlabs"]')).toHaveValue(elevenValue);
  await expect(page.locator('[data-voice-cloud-voices="xai"]')).toHaveValue('voice-12');
  await expect(page.locator('[data-voice-cloud-voices="xai"] option:checked')).toHaveText('Voice 12');
  await expect(page.locator('[data-voice-cloud-voices="elevenlabs"]')).toHaveValue('eleven-warm');
  await expect(page.locator('[data-voice-cloud-voices="elevenlabs"] option:checked'))
    .toHaveText('Warm Guide · en · male');
});

test('Voice settings use standard responsive Settings rows without horizontal overflow', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await openVoiceSettingsFromUi(page);

  await expect(page.locator('.voice-settings-list .settings-section')).toHaveCount(25);
  await expect(page.locator('.voice-model-list .settings-section')).toHaveCount(2);
  await expect(page.locator('[data-voice-setting="localVoice"] optgroup')).toHaveCount(2);
  await expect(page.locator('[data-voice-setting="localVoice"] optgroup').first())
    .toHaveAttribute('label', 'Female voices');
  await expect(page.locator('[data-voice-setting="localVoice"] optgroup').nth(1))
    .toHaveAttribute('label', 'Male voices');

  const layout = async () => page.locator('[data-tab-panel="voice"]').evaluate(panel => {
    const content = panel.closest('.settings-content');
    const visibleControls = [...panel.querySelectorAll('input, select, button')]
      .filter(element => element.getClientRects().length);
    const contentRect = content.getBoundingClientRect();
    return {
      panelOverflow: panel.scrollWidth - panel.clientWidth,
      contentOverflow: content.scrollWidth - content.clientWidth,
      controlsInside: visibleControls.every(element => {
        const rect = element.getBoundingClientRect();
        return rect.left >= contentRect.left - 1 && rect.right <= contentRect.right + 1;
      }),
    };
  });

  expect(await layout()).toEqual({
    panelOverflow: 0,
    contentOverflow: 0,
    controlsInside: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await layout()).toEqual({
    panelOverflow: 0,
    contentOverflow: 0,
    controlsInside: true,
  });
});
