// @ts-check
// voice-loader.js — tiny first-use boundary for microphone and speech features.

/** @typedef {typeof import('./voice-controller.js')} VoiceModule */

/** @type {Promise<VoiceModule> | null} */
let voiceModulePromise = null;
/** @type {VoiceModule | null} */
let voiceModule = null;
let useRetryUrl = false;

function loadRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free module URL.
  return import('./voice-controller.js?lazy-retry=1');
}

export function loadVoiceModule() {
  if (!voiceModulePromise) {
    const load = useRetryUrl ? loadRetryModule() : import('./voice-controller.js');
    voiceModulePromise = load.then(module => {
      voiceModule = module;
      return module;
    }).catch(error => {
      voiceModulePromise = null;
      voiceModule = null;
      useRetryUrl = true;
      throw error;
    });
  }
  return voiceModulePromise;
}

export function toggleVoiceRecording() {
  return loadVoiceModule().then(module => module.toggleVoiceRecording());
}

/** @param {number} messageIndex */
export function toggleMessageSpeech(messageIndex) {
  return loadVoiceModule().then(module => module.toggleMessageSpeech(messageIndex));
}

export function stopVoiceActivity() {
  return voiceModule?.stopVoiceActivity() || false;
}

export function maybeAutoReadAssistantMessage(messageIndex) {
  try {
    if (localStorage.getItem('labcharts-voice-auto-read') !== 'true') return false;
  } catch {
    return false;
  }
  if (!document.getElementById('chat-panel')?.classList.contains('open')) return false;
  return loadVoiceModule().then(module => module.readAssistantMessage(messageIndex, { automatic: true }));
}
