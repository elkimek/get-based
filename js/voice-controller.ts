import type { VoiceSynthesisResult } from '../types/voice-provider.js';
import type { VoiceKind } from '../types/voice-local.js';
import type { ChatCaptureMode, ChatSpeechMode as SpeechButtonMode } from './chat-voice-contract.js';
import { publishChatCapture } from './chat-voice-view.js';
import { captureChatComposerInput } from './chat-composer-input-port.js';

// voice-controller.js — chat microphone and per-message speech orchestration.

import { state } from './state.js';
import { getErrorMessage } from './caught-error.js';
import { publishChatSpeech } from './chat-speech-component.js';
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
const LOCAL_STT_TIMEOUT_MS = 3 * 60 * 1000;
// Kokoro's own TextSplitterStream emits sentence-sized audio progressively.
// Keep the outer request large to avoid restarting playback between paragraphs.
const BROWSER_LOCAL_SPEECH_CHUNK_CHARACTERS = 3500;
const REMOTE_SPEECH_CHUNK_CHARACTERS = 3500;
interface CaptureOperation {
  input: HTMLTextAreaElement;
  originCurrent(): boolean;
  settings: ReturnType<typeof getVoiceSettings>;
  session: VoiceCaptureSession | null;
  controller: AbortController;
  startedAt: number;
  privacy: string;
  ticker: ReturnType<typeof setInterval> | null;
  errorTimer: ReturnType<typeof setTimeout> | null;
}
let capture: CaptureOperation | null = null;
let captureState: ChatCaptureMode = 'idle';
let speechAbortController: AbortController | null = null;
let autoReadActivationNoticeShown = false;
let speakingMessageIndex: number | null = null;
let speechButtonMode: SpeechButtonMode = 'idle';
let voiceActivityEpoch = 0;

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function setCaptureUi(mode: ChatCaptureMode, text = '') {
  captureState = mode;
  publishChatCapture(mode, text);
}
function isCaptureCurrent(operation: CaptureOperation): boolean {
  return capture === operation && operation.originCurrent();
}
function cancelCapture(): void {
  const previous = capture; capture = null;
  if (previous) {
    previous.controller.abort(new DOMException('Voice input cancelled', 'AbortError'));
    previous.session?.cancel();
    if (previous.ticker) clearInterval(previous.ticker);
    if (previous.errorTimer) clearTimeout(previous.errorTimer);
  }
  setCaptureUi('idle');
}
function captureError(operation: CaptureOperation, message: string): void {
  if (!isCaptureCurrent(operation)) return;
  if (operation.ticker) clearInterval(operation.ticker);
  operation.ticker = null;
  operation.session?.cancel(); operation.session = null;
  setCaptureUi('error', message);
  showNotification(message, 'error', 6000);
  operation.errorTimer = setTimeout(() => {
    if (isCaptureCurrent(operation)) cancelCapture();
  }, 5000);
}
function tickCapture(operation: CaptureOperation): void {
  if (!isCaptureCurrent(operation)) {
    if (capture === operation) cancelCapture();
    return;
  }
  if (captureState === 'recording') {
    setCaptureUi('recording', `Listening · ${formatElapsed(Date.now() - operation.startedAt)} · ${operation.privacy} · tap to finish`);
  } else if (captureState === 'transcribing') {
    const local = operation.settings.inputProvider === 'browser-local';
    setCaptureUi('transcribing', `${local ? 'Transcribing on this device' : 'Transcribing'} · ${formatElapsed(Date.now() - operation.startedAt)} · tap to cancel`);
  }
}

async function guideToLocalModelDownload(kind: VoiceKind, modelId: string, { automatic = false } = {}) {
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
  } catch { }
  return false;
}

function insertTranscript(input: HTMLTextAreaElement, text: unknown) {
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
  const operation = capture;
  if (!operation?.session || captureState !== 'recording') return false;
  if (!isCaptureCurrent(operation)) { cancelCapture(); return false; }
  const session = operation.session;
  setCaptureUi('transcribing', 'Preparing transcription… · tap to cancel');
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const audio = await session.stop();
    operation.session = null;
    if (!isCaptureCurrent(operation) || operation.controller.signal.aborted) return false;
    if (!audio.size) throw new Error('The recording was empty.');
    const local = operation.settings.inputProvider === 'browser-local';
    operation.startedAt = Date.now();
    tickCapture(operation);
    if (local) timeoutId = setTimeout(() => operation.controller.abort(new DOMException(
      'Local transcription took longer than 3 minutes. Try the graphics processor, a shorter recording, or a hosted service.', 'TimeoutError',
    )), LOCAL_STT_TIMEOUT_MS);
    const result = await transcribeVoice(audio, { settings: operation.settings, signal: operation.controller.signal });
    if (!isCaptureCurrent(operation)) return false;
    if (operation.controller.signal.aborted) throw operation.controller.signal.reason;
    insertTranscript(operation.input, result.text);
    cancelCapture();
    if (result.providerId === 'browser-local' && Number.isFinite(result.inferenceMs)) {
      const execution = result.backend === 'webgpu' ? 'GPU' : 'CPU';
      showNotification(`Transcribed in ${(result.inferenceMs as number / 1000).toFixed(1)}s using ${execution}.`, 'success', 4500);
    }
    return true;
  } catch (error) {
    if (!isCaptureCurrent(operation)) return false;
    if (error instanceof DOMException && error.name === 'AbortError') cancelCapture();
    else captureError(operation, getErrorMessage(error, 'Voice transcription failed'));
    return false;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    // Old results never clear a new recording's ticker or status.
    if (capture === operation && !operation.originCurrent()) cancelCapture();
  }
}

async function startVoiceRecording() {
  cancelCapture();
  voiceActivityEpoch += 1;
  stopSpeechPlayback();
  const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
  if (!input) return false;
  const inputCurrent = captureChatComposerInput(input);
  const profile = state.currentProfile, thread = state.currentThreadId;
  const settings = getVoiceSettings();
  const inputProviderId = getVoiceProviderId('stt', settings);
  // Resolve linked providers once. Recording and transcription must use the
  // same disclosed destination even if the AI provider changes meanwhile.
  settings.inputProvider = inputProviderId;
  const provider = getVoiceProviderDefinition(inputProviderId);
  const operation: CaptureOperation = {
    input, settings, session: null, controller: new AbortController(), startedAt: 0,
    originCurrent: () => inputCurrent() && profile === state.currentProfile && thread === state.currentThreadId,
    privacy: provider.privacy === 'local' ? 'audio stays on this device' : provider.privacy === 'local-network' ? `audio goes to ${provider.label}` : `audio will be sent to ${provider.label}`,
    ticker: null, errorTimer: null,
  };
  capture = operation;
  setCaptureUi('preparing', 'Preparing voice input… · tap to cancel');
  operation.ticker = setInterval(() => tickCapture(operation), 1000);
  try {
    if (inputProviderId === 'browser-local') {
      let modelReady = isLocalVoiceModelReady('stt', settings.localSttModel, settings.localSttBackend);
      if (modelReady) modelReady = await verifyLocalVoiceModelReady('stt', settings.localSttModel, settings.localSttBackend);
      if (!isCaptureCurrent(operation)) return false;
      if (!modelReady) {
        captureError(operation, 'Download the selected transcription model first');
        return guideToLocalModelDownload('stt', settings.localSttModel);
      }
    }
    await ensureVoiceRequestPrivacy('stt', inputProviderId, settings);
    if (!isCaptureCurrent(operation) || operation.controller.signal.aborted) return false;
    setCaptureUi('requesting', 'Requesting microphone access… · tap to cancel');
    const session = new VoiceCaptureSession({
      maxDurationMs: MAX_RECORDING_MS, onLimit: () => {
        if (isCaptureCurrent(operation)) void finishVoiceRecording();
        else if (capture === operation) cancelCapture();
      }
    });
    operation.session = session;
    await session.start();
    if (!isCaptureCurrent(operation) || operation.controller.signal.aborted) { session.cancel(); return false; }
    operation.startedAt = Date.now(); tickCapture(operation);
    setCaptureUi('recording', `Listening · 0:00 · ${operation.privacy} · tap to finish`);
    return true;
  } catch (error) {
    if (!isCaptureCurrent(operation)) return false;
    if (error instanceof DOMException && error.name === 'AbortError') { cancelCapture(); return false; }
    const name = (error as { name?: unknown; } | null)?.name;
    const denied = name === 'NotAllowedError' || name === 'SecurityError';
    captureError(operation, denied ? 'Microphone access was denied. Allow it in your browser site settings and try again.' : getErrorMessage(error, 'Could not start the microphone'));
    return false;
  } finally {
    if (capture === operation && !operation.originCurrent()) cancelCapture();
  }
}

export function toggleVoiceRecording() {
  if (captureState === 'recording') return finishVoiceRecording();
  if (['preparing', 'requesting', 'transcribing'].includes(captureState)) {
    cancelCapture(); return Promise.resolve(false);
  }
  return startVoiceRecording();
}

function speechButton(messageIndex: number) {
  return (
    document.getElementById(`chat-listen-btn-${messageIndex}`)
  ) as HTMLButtonElement | null;
}

function setSpeechButton(messageIndex: number, mode: SpeechButtonMode) {
  if (speakingMessageIndex === messageIndex || mode === 'idle') speechButtonMode = mode;
  publishChatSpeech(messageIndex, mode);
}

function stopSpeechPlayback() {
  const previousIndex = speakingMessageIndex;
  speechAbortController?.abort();
  speechAbortController = null;
  voicePlayer.stop();
  speakingMessageIndex = null;
  if (previousIndex !== null) setSpeechButton(previousIndex, 'idle');
}

export async function readAssistantMessage(messageIndex: number, { automatic = false } = {}) {
  const message = state.chatHistory[messageIndex];
  if (!message || message.role !== 'assistant' || message.error) return false;
  if (speakingMessageIndex === messageIndex) {
    voiceActivityEpoch += 1;
    stopSpeechPlayback();
    return false;
  }
  voiceActivityEpoch += 1;
  const activityEpoch = voiceActivityEpoch;
  const threadId = state.currentThreadId, profile = state.currentProfile;
  const isCurrentRequest = () => (
    voiceActivityEpoch === activityEpoch
    && state.currentProfile === profile
    && state.currentThreadId === threadId
    && state.chatHistory[messageIndex] === message
  );
  stopSpeechPlayback();
  cancelCapture();
  const settings = getVoiceSettings();
  const outputProviderId = getVoiceProviderId('tts', settings);
  settings.outputProvider = outputProviderId;
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
    if (streamsProgressiveAudio) voicePlayer.primeStreamPlayback('audio/mpeg', 1);
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
    const synthesize = (chunk: string) => voice.synthesize(chunk);
    let pendingSynthesis = synthesize(chunks[0]!);
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
        ? synthesize(chunks[index + 1]!)
        : null;
      // Mark an early prefetch failure as observed while preserving the
      // original promise so the loop still reports it after playback.
      if (nextSynthesis) void nextSynthesis.catch(() => undefined);
      try {
        if (hasPcmStream) {
          await voicePlayer.playPcmStream(result.pcmStream as NonNullable<VoiceSynthesisResult['pcmStream']>, {
            signal: controller.signal,
            rate: 1,
            onPlaybackStart: () => { if (isCurrentRequest() && !controller.signal.aborted) setSpeechButton(messageIndex, 'speaking'); },
            onPlaybackWaiting: () => { if (isCurrentRequest() && !controller.signal.aborted) setSpeechButton(messageIndex, 'waiting'); },
          });
        } else if (hasStream) {
          setSpeechButton(messageIndex, 'speaking');
          await voicePlayer.playStream(result.stream as NonNullable<VoiceSynthesisResult['stream']>, {
            contentType: result.contentType,
            signal: controller.signal,
            rate: 1,
            progressive: streamsProgressiveAudio && !automatic,
          });
        } else {
          setSpeechButton(messageIndex, 'speaking');
          await voicePlayer.play(result.audio as Blob, {
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
    const caught = error as { name?: unknown; } | null | undefined;
    if (caught?.name !== 'AbortError' && !controller.signal.aborted && isCurrentRequest()) {
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

export function toggleMessageSpeech(messageIndex: number) {
  return readAssistantMessage(messageIndex);
}

export function isVoicePlaybackActive() {
  return speakingMessageIndex !== null
    && !!speechAbortController
    && !speechAbortController.signal.aborted;
}

export function restoreVoicePlaybackUi() {
  if (!isVoicePlaybackActive() || speakingMessageIndex === null) return false;
  setSpeechButton(
    speakingMessageIndex,
    speechButtonMode === 'idle' ? (voicePlayer.isPlaying ? 'speaking' : 'busy') : speechButtonMode,
  );
  return !!speechButton(speakingMessageIndex);
}

export function stopVoiceActivity({ preservePlayback = false } = {}) {
  const hadActivity = captureState !== 'idle' || speakingMessageIndex !== null;
  const hadCaptureActivity = captureState !== 'idle';
  if (!preservePlayback || hadCaptureActivity) voiceActivityEpoch += 1;
  if (hadCaptureActivity) cancelCapture();
  if (!preservePlayback) stopSpeechPlayback();
  return hadActivity;
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('pagehide', () => stopVoiceActivity());
}
