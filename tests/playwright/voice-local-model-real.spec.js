import { expect, test } from '@playwright/test';

const runRealModels = process.env.GETBASED_VOICE_REAL_MODELS === '1';
const runLargeModel = process.env.GETBASED_VOICE_LARGE_MODEL === '1';
const expectTtsGpuRejection = process.env.GETBASED_VOICE_EXPECT_TTS_GPU_REJECTION === '1';
const smallModelBackend = process.env.GETBASED_VOICE_SMALL_BACKEND || 'auto';
const ttsModelBackend = process.env.GETBASED_VOICE_TTS_BACKEND || 'auto';
const largeModelBackend = process.env.GETBASED_VOICE_LARGE_BACKEND || 'webgpu';

test.describe('Voice real local models', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!runRealModels, 'Set GETBASED_VOICE_REAL_MODELS=1 to download and run the real models.');

  test('downloads Kokoro and Whisper, then completes a speech round trip', async ({ page }) => {
    test.setTimeout(10 * 60_000);
    const browserIssues = [];

    page.on('console', message => {
      const row = `[browser:${message.type()}] ${message.text()}`;
      console.log(row);
      const expectedWebGpuFallback = message.type() === 'warning'
        && message.text() === 'No available adapters.';
      if (!expectedWebGpuFallback && (
        message.type() === 'error'
        || message.type() === 'warning'
      )) browserIssues.push(row);
    });
    page.on('pageerror', error => {
      const row = `[pageerror] ${error.stack || error.message}`;
      console.log(row);
      browserIssues.push(row);
    });
    page.on('requestfailed', request => {
      const row = `[requestfailed] ${request.url()} — ${request.failure()?.errorText || 'failed'}`;
      console.log(row);
      browserIssues.push(row);
    });
    page.on('response', response => {
      if (response.status() < 400) return;
      const row = `[response:${response.status()}] ${response.url()}`;
      console.log(row);
      browserIssues.push(row);
    });

    await page.goto('/app', { waitUntil: 'load' });
    const consentOverlay = page.locator('#legal-consent-overlay');
    if (await consentOverlay.isVisible()) {
      await page.locator('#legal-consent-checkbox').check();
      await page.locator('[data-legal-consent-action="accept"]').click();
      await expect(consentOverlay).toHaveCount(0);
    }
    await page.waitForTimeout(500);
    await page.evaluate(async ({ sttBackend, ttsBackend }) => {
      const { state } = await import('/js/state.js');
      const { profileStorageKey } = await import('/js/profile.js');
      const { endTour } = await import('/js/tour.js');
      const { setVoiceSetting } = await import('/js/voice-settings-storage.js');
      endTour({ openEmptyChat: false });
      setVoiceSetting('localSttBackend', sttBackend);
      setVoiceSetting('localTtsBackend', ttsBackend);
      localStorage.setItem(profileStorageKey(state.currentProfile, 'tour'), 'completed');
      localStorage.setItem(profileStorageKey(state.currentProfile, 'emptyTour'), 'completed');
    }, { sttBackend: smallModelBackend, ttsBackend: ttsModelBackend });
    await page.locator('.settings-btn').first().click();
    await page.locator('[data-settings-tab="voice"]').click();
    await expect(page.locator('[data-tab-panel="voice"]')).toHaveClass(/\bactive\b/);

    console.log(`[stage] Installing Kokoro (${ttsModelBackend})`);
    const ttsRow = page.locator('[data-voice-model-kind="tts"]');
    await ttsRow.getByRole('button', { name: 'Download' }).click();
    await expect(ttsRow.locator('[data-voice-model-status="tts"]')).toContainText(
      'Ready',
      { timeout: 5 * 60_000 },
    );
    await expect(ttsRow.locator('.voice-model-progress-track')).toHaveClass(/\bcomplete\b/);
    await expect(ttsRow.locator('.voice-model-progress small')).toContainText('model is ready');

    console.log('[stage] Installing Whisper Small q8 (safe graph mode)');
    const sttRow = page.locator('[data-voice-model-kind="stt"]');
    await sttRow.getByRole('button', { name: 'Download' }).click();
    await expect(sttRow.locator('[data-voice-model-status="stt"]')).toContainText(
      'Ready',
      { timeout: 5 * 60_000 },
    );
    await expect(sttRow.locator('.voice-model-progress-track')).toHaveClass(/\bcomplete\b/);
    await expect(sttRow.locator('.voice-model-progress small')).toContainText('model is ready');
    await expect(sttRow.locator('[data-voice-action="install-model"]')).toHaveText('Ready');
    await expect(sttRow.locator('[data-voice-action="install-model"]')).toBeDisabled();
    await expect(sttRow.locator('[data-voice-action="remove-model"]')).toBeEnabled();

    console.log('[stage] Running Kokoro synthesis and Whisper transcription');
    const result = await page.evaluate(async ({ sttBackend, ttsBackend }) => {
      const { browserLocalVoiceProvider } = await import('/js/voice-provider-browser-local.js');
      const speech = await browserLocalVoiceProvider.synthesize({
        text: 'Check my iron level.',
        modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
        voiceId: 'af_heart',
        rate: 1,
        backend: ttsBackend,
      });
      const wav = new Uint8Array(await speech.audio.arrayBuffer());
      const transcript = await browserLocalVoiceProvider.transcribe({
        audio: speech.audio,
        modelId: 'onnx-community/whisper-small',
        language: 'en',
        backend: sttBackend,
      });
      const { getLocalVoiceModelStatus } = await import('/js/voice-local-engine.js');
      const installedStatus = getLocalVoiceModelStatus(
        'stt',
        'onnx-community/whisper-small',
      );
      const installedTtsStatus = getLocalVoiceModelStatus(
        'tts',
        'onnx-community/Kokoro-82M-v1.0-ONNX',
      );
      const { state } = await import('/js/state.js');
      const { buildActionBar, configureChatMessageActionDeps } = await import('/js/chat-actions.js');
      const { readAssistantMessage } = await import('/js/voice-controller.js');
      configureChatMessageActionDeps({ toggleMessageSpeech: readAssistantMessage });
      state.chatHistory = [{ role: 'assistant', content: 'Check my iron level.' }];
      const host = document.createElement('div');
      host.id = 'real-voice-action-host';
      host.style.cssText = 'position:fixed;z-index:2147483647;top:20px;right:20px;padding:12px;background:#111';
      host.innerHTML = buildActionBar(0);
      document.body.appendChild(host);
      let sumSquares = 0;
      let peak = 0;
      const sampleView = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
      const sampleCount = Math.floor((wav.byteLength - 44) / 2);
      for (let index = 0; index < sampleCount; index += 1) {
        const sample = sampleView.getInt16(44 + index * 2, true) / 32768;
        sumSquares += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      return {
        audioBytes: wav.byteLength,
        riff: String.fromCharCode(...wav.slice(0, 4)),
        rms: Math.sqrt(sumSquares / Math.max(1, sampleCount)),
        peak,
        speechBackend: speech.backend,
        speechInferenceMs: speech.inferenceMs,
        speechInstalledBackend: installedTtsStatus?.backend || '',
        speechPerformance: installedTtsStatus?.performance || {},
        transcriptBackend: transcript.backend,
        transcriptFallbackReason: transcript.fallbackReason || '',
        transcriptInferenceMs: transcript.inferenceMs,
        installedBackend: installedStatus?.backend || '',
        installedInferenceMs: installedStatus?.lastInferenceMs || 0,
        installedPerformance: installedStatus?.performance || {},
        transcript: transcript.text,
      };
    }, { sttBackend: smallModelBackend, ttsBackend: ttsModelBackend });
    console.log(`[stage] Round trip complete: ${JSON.stringify(result)}`);

    console.log('[stage] Playing Kokoro through the real chat Web Audio path');
    await page.locator('#settings-modal .modal-close').click();
    const listenButton = page.locator('#chat-listen-btn-0');
    await listenButton.click();
    await expect(listenButton).toContainText('Stop', { timeout: 2 * 60_000 });
    await expect(listenButton).toContainText('Listen', { timeout: 30_000 });
    const playbackState = await page.evaluate(async () => {
      const { voicePlayer } = await import('/js/voice-player.js');
      return {
        contextState: voicePlayer.audioContext?.state || '',
        isPlaying: voicePlayer.isPlaying,
      };
    });
    await page.locator('#real-voice-action-host').evaluate(element => element.remove());

    expect(result.riff).toBe('RIFF');
    expect(result.audioBytes).toBeGreaterThan(10_000);
    expect(result.rms).toBeGreaterThan(0.005);
    expect(result.peak).toBeGreaterThan(0.05);
    expect(result.transcript.toLowerCase()).toContain('check');
    expect(result.transcript.toLowerCase()).toContain('level');
    expect(result.transcriptInferenceMs).toBeGreaterThan(0);
    expect(result.installedBackend).toBe(result.transcriptBackend);
    expect(result.installedInferenceMs).toBeCloseTo(result.transcriptInferenceMs, 3);
    expect(result.installedPerformance[result.transcriptBackend].realtimeFactor).toBeGreaterThan(0);
    expect(result.installedPerformance[result.transcriptBackend].audioSeconds).toBeGreaterThan(0);
    expect(result.speechBackend).toMatch(/^(webgpu|wasm)$/);
    expect(result.speechBackend).toBe(ttsModelBackend === 'auto' ? 'wasm' : ttsModelBackend);
    expect(result.speechInferenceMs).toBeGreaterThan(0);
    expect(result.speechInstalledBackend).toBe(result.speechBackend);
    expect(result.speechPerformance[result.speechBackend].realtimeFactor).toBeGreaterThan(0);
    expect(result.transcriptBackend).toMatch(/^(webgpu|wasm)$/);
    expect(playbackState.contextState).toBe('running');
    expect(playbackState.isPlaying).toBe(false);
    expect(browserIssues).toEqual([]);
  });

  test('starts a long Kokoro reply promptly and plays every bounded segment', async ({ page }) => {
    test.setTimeout(4 * 60_000);
    await page.goto('/app', { waitUntil: 'load' });
    const consentOverlay = page.locator('#legal-consent-overlay');
    if (await consentOverlay.isVisible()) {
      await page.locator('#legal-consent-checkbox').check();
      await page.locator('[data-legal-consent-action="accept"]').click();
      await expect(consentOverlay).toHaveCount(0);
    }
    await page.evaluate(async () => {
      const { browserLocalVoiceProvider } = await import('/js/voice-provider-browser-local.js');
      const { state } = await import('/js/state.js');
      const { buildActionBar, configureChatMessageActionDeps } = await import('/js/chat-actions.js');
      const { readAssistantMessage } = await import('/js/voice-controller.js');
      await browserLocalVoiceProvider.installModel(
        'tts',
        'onnx-community/Kokoro-82M-v1.0-ONNX',
      );
      configureChatMessageActionDeps({ toggleMessageSpeech: readAssistantMessage });
      state.chatHistory = [{
        role: 'assistant',
        content: [
          'I would not die because I am software rather than a living organism.',
          'I do not have a body, consciousness, or biological life.',
          'A running system can be interrupted, copied, restored, or changed.',
          'Those events are different from death in the human sense.',
          'The distinction depends on what we mean by identity and continuity.',
        ].join(' '),
      }];
      const host = document.createElement('div');
      host.id = 'long-voice-action-host';
      host.style.cssText = 'position:fixed;z-index:2147483647;top:20px;right:20px;padding:12px;background:#111';
      host.innerHTML = buildActionBar(0);
      document.body.appendChild(host);
    });

    const listenButton = page.locator('#chat-listen-btn-0');
    const startedAt = Date.now();
    await listenButton.click();
    await expect(listenButton).toContainText('Stop', { timeout: 20_000 });
    await expect.poll(
      () => page.evaluate(async () => {
        const { voicePlayer } = await import('/js/voice-player.js');
        return voicePlayer.scheduledAudioSources.size;
      }),
      { timeout: 20_000, message: 'Kokoro should schedule its first PCM chunk promptly' },
    ).toBeGreaterThan(0);
    const firstAudioDelayMs = Date.now() - startedAt;
    console.log(`[stage] Kokoro first PCM audio scheduled after ${firstAudioDelayMs}ms`);
    await expect(listenButton).toContainText('Listen', { timeout: 60_000 });
    const playbackState = await page.evaluate(async () => {
      const { voicePlayer } = await import('/js/voice-player.js');
      return {
        contextState: voicePlayer.audioContext?.state || '',
        isPlaying: voicePlayer.isPlaying,
      };
    });
    await page.locator('#long-voice-action-host').evaluate(element => element.remove());

    expect(firstAudioDelayMs).toBeLessThan(20_000);
    expect(playbackState).toEqual({ contextState: 'running', isPlaying: false });
  });

  test('does not turn a paragraph boundary into a long Kokoro pause', async ({ page }) => {
    test.setTimeout(3 * 60_000);
    await page.goto('/app', { waitUntil: 'load' });
    const metrics = await page.evaluate(async () => {
      const { browserLocalVoiceProvider } = await import('/js/voice-provider-browser-local.js');
      const { normalizeSpeechText } = await import('/js/voice-text.js');
      await browserLocalVoiceProvider.installModel(
        'tts',
        'onnx-community/Kokoro-82M-v1.0-ONNX',
      );
      const text = normalizeSpeechText(
        'Thyroid panel explanation (male, 36)\n\n'
        + 'Your thyroid data is stale — last drawn 2026-01-16 '
        + '(6.5 months ago as of today, 2026-07-30). '
        + 'Values may no longer reflect current status. '
        + 'Retest is recommended, ideally as a fuller set. '
        + 'Discuss interpretation and any decisions with your physician.',
      );
      const result = await browserLocalVoiceProvider.synthesize({
        text,
        modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
        voiceId: 'af_heart',
        rate: 1,
        streaming: true,
      });
      const reader = result.pcmStream.getReader();
      const startedAt = performance.now();
      let playbackCursor = 0;
      let initialDelaySeconds = 0;
      let totalDurationSeconds = 0;
      let maximumUnderrunSeconds = 0;
      let maximumEmbeddedSilenceSeconds = 0;
      const chunkTimings = [];
      let chunks = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const arrivedAt = (performance.now() - startedAt) / 1000;
        const samples = value.samples;
        const sampleRate = value.sampleRate;
        if (!samples.length) continue;
        const duration = samples.length / sampleRate;
        const underrun = chunks
          ? Math.max(0, arrivedAt - playbackCursor)
          : 0;
        if (!chunks) initialDelaySeconds = arrivedAt;
        maximumUnderrunSeconds = Math.max(maximumUnderrunSeconds, underrun);
        playbackCursor = Math.max(playbackCursor, arrivedAt) + duration;
        totalDurationSeconds += duration;
        chunkTimings.push({ arrivedAt, duration, underrun });
        chunks += 1;

        let silentRun = 0;
        let longestSilentRun = 0;
        for (const sample of samples) {
          if (Math.abs(sample) < 0.0025) {
            silentRun += 1;
            longestSilentRun = Math.max(longestSilentRun, silentRun);
          } else {
            silentRun = 0;
          }
        }
        maximumEmbeddedSilenceSeconds = Math.max(
          maximumEmbeddedSilenceSeconds,
          longestSilentRun / sampleRate,
        );
      }
      return {
        text,
        chunks,
        chunkTimings,
        initialDelaySeconds,
        totalDurationSeconds,
        maximumUnderrunSeconds,
        maximumEmbeddedSilenceSeconds,
      };
    });
    console.log(`[stage] Kokoro paragraph metrics: ${JSON.stringify(metrics)}`);

    expect(metrics.text).not.toContain('..');
    expect(metrics.text).toContain(
      'Thyroid panel explanation (male, 36): Your thyroid data is stale',
    );
    expect(metrics.chunks).toBeGreaterThanOrEqual(2);
    expect(metrics.maximumUnderrunSeconds).toBeLessThan(0.5);
    expect(metrics.maximumEmbeddedSilenceSeconds).toBeLessThan(1.5);
  });

  test('rejects a Kokoro GPU backend that produces invalid audio', async ({ page }) => {
    test.skip(!expectTtsGpuRejection, 'Set GETBASED_VOICE_EXPECT_TTS_GPU_REJECTION=1 on an affected GPU.');
    test.setTimeout(5 * 60_000);
    await page.goto('/app', { waitUntil: 'load' });
    const result = await page.evaluate(async () => {
      const { browserLocalVoiceProvider } = await import('/js/voice-provider-browser-local.js');
      try {
        await browserLocalVoiceProvider.installModel(
          'tts',
          'onnx-community/Kokoro-82M-v1.0-ONNX',
          undefined,
          'webgpu',
        );
        return { ok: true, message: '' };
      } catch (error) {
        return { ok: false, message: String(error?.message || error) };
      }
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Graphics speech validation failed');
  });

  test('runs the high-end Whisper Large v3 Turbo q4 tier', async ({ page }) => {
    test.skip(!runLargeModel, 'Set GETBASED_VOICE_LARGE_MODEL=1 to run the large-model canary.');
    test.setTimeout(10 * 60_000);
    await page.goto('/app', { waitUntil: 'load' });
    const result = await page.evaluate(async backend => {
      const { browserLocalVoiceProvider } = await import('/js/voice-provider-browser-local.js');
      await browserLocalVoiceProvider.installModel(
        'tts',
        'onnx-community/Kokoro-82M-v1.0-ONNX',
      );
      await browserLocalVoiceProvider.installModel(
        'stt',
        'onnx-community/whisper-large-v3-turbo',
        undefined,
        backend,
      );
      const speech = await browserLocalVoiceProvider.synthesize({
        text: 'Check my iron level.',
        modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
        voiceId: 'af_heart',
        rate: 1,
      });
      const startedAt = performance.now();
      const transcript = await browserLocalVoiceProvider.transcribe({
        audio: speech.audio,
        modelId: 'onnx-community/whisper-large-v3-turbo',
        language: 'en',
        backend,
      });
      return { ...transcript, elapsedMs: performance.now() - startedAt };
    }, largeModelBackend);
    console.log(`[stage] Whisper Large v3 Turbo result: ${JSON.stringify(result)}`);

    expect(result.backend).toBe(largeModelBackend);
    expect(result.text.toLowerCase()).toContain('check my iron level');
  });
});
