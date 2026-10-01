// @ts-check
// voice-loader.js — tiny first-use boundary for microphone and speech features.

import { createRetryingModuleLoader } from './retrying-module-loader.js';
import { state } from './state.js';

/** @typedef {typeof import('./voice-controller.js')} VoiceModule */

const voiceModuleLoader = createRetryingModuleLoader(
  retry => retry ? loadRetryModule() : import('./voice-controller.js'),
);

let voiceActivityEpoch = 0;

/**
 * @param {number} messageIndex
 * @returns {{
 *   epoch: number,
 *   message: unknown,
 *   messageIndex: number,
 *   panel: HTMLElement,
 *   threadId: string | null,
 * } | null}
 */
function captureMessageContext(messageIndex) {
  const panel = document.getElementById('chat-panel');
  const message = state.chatHistory[messageIndex];
  if (!panel || !panel.classList.contains('open') || !message) return null;
  return {
    epoch: voiceActivityEpoch,
    message,
    messageIndex,
    panel,
    threadId: state.currentThreadId,
  };
}

/** @param {NonNullable<ReturnType<typeof captureMessageContext>>} context */
function isMessageContextCurrent(context) {
  return context.epoch === voiceActivityEpoch
    && context.panel.isConnected
    && document.getElementById('chat-panel') === context.panel
    && context.panel.classList.contains('open')
    && state.currentThreadId === context.threadId
    && state.chatHistory[context.messageIndex] === context.message;
}

function loadRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free module URL.
  return import('./voice-controller.js?lazy-retry=1');
}

export function loadVoiceModule() {
  return voiceModuleLoader.load();
}

export function toggleVoiceRecording() {
  const epoch = voiceActivityEpoch;
  const panel = document.getElementById('chat-panel');
  return loadVoiceModule().then(module => {
    if (
      epoch !== voiceActivityEpoch
      || !panel?.isConnected
      || document.getElementById('chat-panel') !== panel
      || !panel.classList.contains('open')
    ) {
      return false;
    }
    return module.toggleVoiceRecording();
  });
}

/** @param {number} messageIndex */
export function toggleMessageSpeech(messageIndex) {
  const context = captureMessageContext(messageIndex);
  if (!context) return Promise.resolve(false);
  return loadVoiceModule().then(module => (
    isMessageContextCurrent(context)
      ? module.toggleMessageSpeech(messageIndex)
      : false
  ));
}

export function stopVoiceActivity(options) {
  voiceActivityEpoch += 1;
  return voiceModuleLoader.module?.stopVoiceActivity(options) || false;
}

export function isVoicePlaybackActive() {
  return voiceModuleLoader.module?.isVoicePlaybackActive() || false;
}

export function restoreVoicePlaybackUi() {
  return voiceModuleLoader.module?.restoreVoicePlaybackUi() || false;
}

export function maybeAutoReadAssistantMessage(messageIndex) {
  try {
    if (localStorage.getItem('labcharts-voice-auto-read') !== 'true') return false;
  } catch {
    return false;
  }
  const context = captureMessageContext(messageIndex);
  if (!context) return false;
  return loadVoiceModule().then(module => (
    isMessageContextCurrent(context)
      ? module.readAssistantMessage(messageIndex, { automatic: true })
      : false
  ));
}
