// @ts-check
// voice-controller.js — chat microphone and per-message speech orchestration.

import { state } from './state.js';
import { getErrorMessage } from './caught-error.js';
import { setIconButtonContent } from './chat-icons.js';
import { showNotification } from './utils.js';
import { VoiceCaptureSession } from './voice-capture.js';
import { voicePlayer } from './voice-player.js';
import { getLocalModel } from './voice-model-catalog.js';
import {
  isLocalVoiceModelReady,
  verifyLocalVoiceModelReady,
} from './voice-local-engine.js';
import { getVoiceProviderDefinition } from './voice-provider-catalog.js';
import {
  createVoiceSynthesizer,
  ensureVoiceRequestPrivacy,
  getVoiceProviderId,
  transcribeVoice,
} from './voice-service.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';
import { getVoiceSettings } from './voice-settings-storage.js';
import { normalizeSpeechText, splitSpeechText } from './voice-text.js';
import { getAppExtensionVoicePlaybackPolicy } from './app-extension-runtime.js';

const MAX_RECORDING_MS = 5 * 60 * 1000;
// Kokoro's own TextSplitterStream emits sentence-sized audio progressively.
// Keep the outer request large to avoid restarting playback between paragraphs.
const BROWSER_LOCAL_SPEECH_CHUNK_CHARACTERS = 3500;
const REMOTE_SPEECH_CHUNK_CHARACTERS = 3500;
/** @type {VoiceCaptureSession | null} */
let captureSession = null;
let captureState = 'idle';
let captureStartedAt = 0;
let capturePrivacyText = '';
/** @type {ReturnType<typeof setInterval> | null} */
let captureTicker = null;
/** @type {AbortController | null} */
let speechAbortController = null;
let autoReadActivationNoticeShown = false;
/** @type {number | null} */
let speakingMessageIndex = null;
let voiceActivityEpoch = 0;

function chatVoiceButton() {
  return /** @type {HTMLButtonElement | null} */ (document.getElementById('chat-voice-btn'));
}

function chatVoiceStatus() {
  return document.getElementById('chat-voice-status');
}

function formatElapsed(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function setCaptureUi(stateName, text = '') {
  captureState = stateName;
  const button = chatVoiceButton();
  const status = chatVoiceStatus();
  if (button) {
    const recording = stateName === 'recording';
    const busy = stateName === 'requesting' || stateName === 'transcribing';
    button.classList.toggle('recording', recording);
    button.classList.toggle('busy', busy);
    button.setAttribute('aria-pressed', String(recording));
    button.setAttribute('aria-label', recording ? 'Stop recording' : busy ? 'Processing voice' : 'Speak message');
    button.title = recording ? 'Stop and transcribe' : 'Speak message';
    button.disabled = busy;
  }
  if (status) {
    status.textContent = text;
    status.toggleAttribute('hidden', !text);
    status.classList.toggle('error', stateName === 'error');
  }
}

function clearCaptureTicker() {
  if (captureTicker) clearInterval(captureTicker);
  captureTicker = null;
}

function startCaptureTicker() {
  clearCaptureTicker();
  captureTicker = setInterval(() => {
    if (captureState !== 'recording') return;
    setCaptureUi('recording', `Listening · ${formatElapsed(Date.now() - captureStartedAt)} · ${capturePrivacyText} · tap to finish`);
  }, 1000);
}

async function guideToLocalModelDownload(kind, modelId, { automatic = false } = {}) {
  const model = getLocalModel(kind, modelId);
  const purpose = kind === 'tts' ? 'speech playback' : 'voice input';
  const message = `${model.label} must be downloaded for the selected processing mode before ${purpose} can run locally.`;
  if (kind === 'stt') setCaptureUi('error', 'Download the selected transcription model first');
  if (automatic) return false;
  showNotification(message, 'info', 7000);
  try {
    const openSettingsModal = getSettingsModuleFunction('openSettingsModal');
    await openSettingsModal?.('voice');
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-voice-model-kind="${kind}"]`);
      const button = row?.querySelector(
        `[data-voice-action="install-model"][data-kind="${kind}"]`,
      );
      if (!(row instanceof HTMLElement)) return;
      row.classList.add('voice-model-attention');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (button instanceof HTMLButtonElement) button.focus();
      setTimeout(() => row.classList.remove('voice-model-attention'), 3500);
    });
  } catch {}
  return false;
}

function insertTranscript(text) {
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('chat-input'));
  if (!input) throw new Error('Chat composer is unavailable.');
  const transcript = String(text || '').trim();
  if (!transcript) throw new Error('No speech was detected.');
  const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
  const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  const prefix = before && !/\s$/.test(before) ? ' ' : '';
  const suffix = after && !/^\s/.test(after) ? ' ' : '';
  input.value = `${before}${prefix}${transcript}${suffix}${after}`;
  const caret = before.length + prefix.length + transcript.length + suffix.length;
  input.setSelectionRange(caret, caret);
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: transcript }));
  input.focus();
}

async function finishVoiceRecording() {
  const session = captureSession;
  if (!session || captureState !== 'recording') return false;
  captureSession = null;
  clearCaptureTicker();
  setCaptureUi('transcribing', 'Transcribing…');
  const controller = new AbortController();
  speechAbortController?.abort();
  speechAbortController = controller;
  try {
    const audio = await session.stop();
    if (!audio.size) throw new Error('The recording was empty.');
    const settings = getVoiceSettings();
    const result = await transcribeVoice(audio, {
      settings,
      signal: controller.signal,
    });
    insertTranscript(result.text);
    setCaptureUi('idle', '');
    if (result.providerId === 'browser-local' && Number.isFinite(result.inferenceMs)) {
      const execution = result.backend === 'webgpu' ? 'GPU' : 'CPU';
      showNotification(
        `Transcribed in ${(result.inferenceMs / 1000).toFixed(1)}s using ${execution}.`,
        'success',
        4500,
      );
    }
    return true;
  } catch (error) {
    const caught = /** @type {any} */ (error);
    if (caught?.name === 'AbortError') {
      setCaptureUi('idle', '');
      return false;
    }
    const message = getErrorMessage(error, 'Voice transcription failed');
    setCaptureUi('error', message);
    showNotification(message, 'error', 6000);
    setTimeout(() => {
      if (captureState === 'error') setCaptureUi('idle', '');
    }, 5000);
    return false;
  } finally {
    if (speechAbortController === controller) speechAbortController = null;
  }
}

async function startVoiceRecording() {
  voiceActivityEpoch += 1;
  const activityEpoch = voiceActivityEpoch;
  stopSpeechPlayback();
  const settings = getVoiceSettings();
  const inputProviderId = getVoiceProviderId('stt', settings);
  const inputProvider = getVoiceProviderDefinition(inputProviderId);
  capturePrivacyText = inputProvider.privacy === 'local'
    ? 'audio stays on this device'
    : inputProvider.privacy === 'local-network'
      ? `audio goes to ${inputProvider.label}`
      : `audio will be sent to ${inputProvider.label}`;
  if (inputProviderId === 'browser-local') {
    let modelReady = isLocalVoiceModelReady(
      'stt',
      settings.localSttModel,
      settings.localSttBackend,
    );
    if (modelReady) {
      modelReady = await verifyLocalVoiceModelReady(
        'stt',
        settings.localSttModel,
        settings.localSttBackend,
      );
    }
    if (activityEpoch !== voiceActivityEpoch) return false;
    if (!modelReady) return guideToLocalModelDownload('stt', settings.localSttModel);
  }
  try {
    await ensureVoiceRequestPrivacy('stt', inputProviderId, settings);
  } catch (error) {
    const message = getErrorMessage(error, 'Subscription voice privacy could not be verified');
    setCaptureUi('error', message);
    showNotification(message, 'error', 7000);
    setTimeout(() => {
      if (captureState === 'error') setCaptureUi('idle', '');
    }, 5000);
    return false;
  }
  setCaptureUi('requesting', 'Requesting microphone access…');
  const session = new VoiceCaptureSession({
    maxDurationMs: MAX_RECORDING_MS,
    onLimit: () => { void finishVoiceRecording(); },
  });
  captureSession = session;
  try {
    await session.start();
    if (captureSession !== session) {
      session.cancel();
      return false;
    }
    captureStartedAt = Date.now();
    setCaptureUi('recording', `Listening · 0:00 · ${capturePrivacyText} · tap to finish`);
    startCaptureTicker();
    return true;
  } catch (error) {
    const caught = /** @type {any} */ (error);
    captureSession = null;
    session.cancel();
    const denied = caught?.name === 'NotAllowedError' || caught?.name === 'SecurityError';
    const message = denied
      ? 'Microphone access was denied. Allow it in your browser site settings and try again.'
      : getErrorMessage(error, 'Could not start the microphone');
    setCaptureUi('error', message);
    showNotification(message, 'error', 6000);
    return false;
  }
}

export function toggleVoiceRecording() {
  if (captureState === 'recording') return finishVoiceRecording();
  if (captureState === 'requesting' || captureState === 'transcribing') return Promise.resolve(false);
  return startVoiceRecording();
}

function speechButton(messageIndex) {
  return /** @type {HTMLButtonElement | null} */ (
    document.getElementById(`chat-listen-btn-${messageIndex}`)
  );
}

function setSpeechButton(messageIndex, mode) {
  const button = speechButton(messageIndex);
  if (!button) return;
  button.classList.toggle('speaking', mode === 'speaking');
  button.classList.toggle('busy', mode === 'busy');
  button.setAttribute('aria-pressed', String(mode === 'speaking'));
  button.disabled = mode === 'busy';
  if (mode === 'speaking') {
    setIconButtonContent(button, 'stop', 'Stop');
    button.title = 'Stop reading';
  } else if (mode === 'busy') {
    setIconButtonContent(button, 'volume', 'Preparing…');
    button.title = 'Preparing speech';
  } else {
    setIconButtonContent(button, 'volume', 'Listen');
    button.title = 'Read message aloud';
  }
}

function stopSpeechPlayback() {
  const previousIndex = speakingMessageIndex;
  speechAbortController?.abort();
  speechAbortController = null;
  voicePlayer.stop();
  speakingMessageIndex = null;
  if (previousIndex !== null) setSpeechButton(previousIndex, 'idle');
}

export async function readAssistantMessage(messageIndex, { automatic = false } = {}) {
  const message = state.chatHistory[messageIndex];
  if (!message || message.role !== 'assistant' || message.error) return false;
  if (speakingMessageIndex === messageIndex) {
    voiceActivityEpoch += 1;
    stopSpeechPlayback();
    return false;
  }
  voiceActivityEpoch += 1;
  const activityEpoch = voiceActivityEpoch;
  const threadId = state.currentThreadId;
  const isCurrentRequest = () => (
    voiceActivityEpoch === activityEpoch
    && state.currentThreadId === threadId
    && state.chatHistory[messageIndex] === message
  );
  stopSpeechPlayback();
  if (captureState === 'recording') {
    captureSession?.cancel();
    captureSession = null;
    clearCaptureTicker();
    setCaptureUi('idle', '');
  }
  const settings = getVoiceSettings();
  const outputProviderId = getVoiceProviderId('tts', settings);
  if (outputProviderId === 'browser-local') {
    let modelReady = isLocalVoiceModelReady(
      'tts',
      settings.localTtsModel,
      settings.localTtsBackend,
    );
    if (modelReady) {
      modelReady = await verifyLocalVoiceModelReady(
        'tts',
        settings.localTtsModel,
        settings.localTtsBackend,
      );
    }
    if (!isCurrentRequest()) return false;
    if (!modelReady) {
      return guideToLocalModelDownload(
        'tts',
        settings.localTtsModel,
        { automatic },
      );
    }
  }
  const text = normalizeSpeechText(message.content);
  const chunks = splitSpeechText(
    text,
    outputProviderId === 'browser-local'
      ? BROWSER_LOCAL_SPEECH_CHUNK_CHARACTERS
      : outputProviderId === 'ppq'
        ? 1800
        : REMOTE_SPEECH_CHUNK_CHARACTERS,
  );
  if (!chunks.length) {
    if (!automatic) showNotification('This message has no readable text.', 'info');
    return false;
  }
  const providerDefinition = getVoiceProviderDefinition(outputProviderId);
  const playbackPolicy = getAppExtensionVoicePlaybackPolicy({
    kind: 'tts',
    providerId: outputProviderId,
    settings,
  });
  const streamsProgressiveAudio = providerDefinition.execution !== 'browser'
    && providerDefinition.capabilities.streamingTts
    && playbackPolicy.progressive !== false;
  if (automatic && !voicePlayer.hasPlaybackActivation) {
    if (!autoReadActivationNoticeShown) {
      autoReadActivationNoticeShown = true;
      showNotification('Tap Listen once to enable automatic reading in this browser.', 'info', 6000);
    }
    return false;
  }
  if (!automatic) {
    autoReadActivationNoticeShown = false;
    voicePlayer.unlock();
    const primed = streamsProgressiveAudio
      && voicePlayer.primeStreamPlayback('audio/mpeg', 1);
    if (!primed) voicePlayer.unlock();
  }
  const controller = new AbortController();
  speechAbortController = controller;
  speakingMessageIndex = messageIndex;
  setSpeechButton(messageIndex, 'busy');
  try {
    const voice = await createVoiceSynthesizer({
      settings,
      signal: controller.signal,
    });
    if (!isCurrentRequest()) {
      controller.abort();
      return false;
    }
    /** @param {string} chunk */
    const synthesize = chunk => voice.synthesize(chunk);
    let pendingSynthesis = synthesize(chunks[0]);
    for (let index = 0; index < chunks.length; index += 1) {
      const result = await pendingSynthesis;
      if (!isCurrentRequest()) controller.abort();
      if (controller.signal.aborted) {
        throw controller.signal.reason || new DOMException('Voice operation aborted', 'AbortError');
      }
      const hasStream = result?.stream instanceof ReadableStream;
      const hasPcmStream = result?.pcmStream instanceof ReadableStream;
      const emptyWav = result?.audio instanceof Blob
        && result.audio.type === 'audio/wav'
        && result.audio.size <= 44;
      const hasAudioBlob = result?.audio instanceof Blob
        && !!result.audio.size
        && !emptyWav;
      if (!hasStream && !hasPcmStream && !hasAudioBlob) {
        throw new Error('The voice model returned empty audio. Try another voice or restart the model.');
      }
      const nextSynthesis = index + 1 < chunks.length
        ? synthesize(chunks[index + 1])
        : null;
      // Mark an early prefetch failure as observed while preserving the
      // original promise so the loop still reports it after playback.
      if (nextSynthesis) void nextSynthesis.catch(() => undefined);
      setSpeechButton(messageIndex, 'speaking');
      try {
        if (hasPcmStream) {
          await voicePlayer.playPcmStream(result.pcmStream, {
            signal: controller.signal,
            rate: 1,
          });
        } else if (hasStream) {
          await voicePlayer.playStream(result.stream, {
            contentType: result.contentType,
            signal: controller.signal,
            rate: 1,
            progressive: streamsProgressiveAudio && !automatic,
          });
        } else {
          await voicePlayer.play(/** @type {Blob} */ (result.audio), {
            signal: controller.signal,
            rate: 1,
          });
        }
      } catch (error) {
        // A prefetched segment may reject when Stop aborts the shared signal.
        // Observe that rejection before propagating the playback failure.
        await nextSynthesis?.catch(() => undefined);
        throw error;
      }
      if (nextSynthesis) pendingSynthesis = nextSynthesis;
    }
    return true;
  } catch (error) {
    const caught = /** @type {any} */ (error);
    if (caught?.name !== 'AbortError' && !controller.signal.aborted) {
      const detail = getErrorMessage(error, 'Speech generation failed');
      showNotification(detail, 'error', 6000);
    }
    return false;
  } finally {
    if (speechAbortController === controller) {
      speechAbortController = null;
      if (speakingMessageIndex === messageIndex) {
        voicePlayer.stop();
        speakingMessageIndex = null;
      }
      setSpeechButton(messageIndex, 'idle');
    }
  }
}

export function toggleMessageSpeech(messageIndex) {
  return readAssistantMessage(messageIndex);
}

export function stopVoiceActivity() {
  const hadActivity = captureState !== 'idle' || speakingMessageIndex !== null;
  voiceActivityEpoch += 1;
  captureSession?.cancel();
  captureSession = null;
  clearCaptureTicker();
  setCaptureUi('idle', '');
  stopSpeechPlayback();
  return hadActivity;
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('pagehide', stopVoiceActivity);
}
