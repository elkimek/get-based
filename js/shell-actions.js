// @ts-check
// shell-actions.js - delegated actions for static index.html controls

import { handleImportStatusClick, isImportRunning } from './pdf-import-progress.js';
import { openFeedbackModal } from './feedback.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';

let shellDelegatesInstalled = false;
const shellImportDeps = { handleImportStatusClick, isImportRunning };
const shellFeedbackDeps = { openFeedbackModal };
const shellProfileShareDeps = {
  openProfileShareModal: (_profileId) => {},
};
const shellNavDeps = {
  closeMobileSidebar: () => {},
  toggleMobileSidebar: () => {},
};
const shellChatImageDeps = { toggleHDMode: () => {} };
const shellChatActionDeps = {
  closeChatPanel: () => {},
  clearChatHistory: () => {},
  handleChatKeydown: (_event) => {},
  sendChatMessage: () => {},
  setChatPersonality: (_personality) => {},
  setChatWebSearchEnabled: (_enabled) => {},
  startDiscussion: () => {},
  summarizeThread: () => {},
  toggleChatPanel: () => {},
  toggleChatFullscreen: () => {},
  togglePersonalityBar: () => {},
  toggleVoiceRecording: () => {},
};
const shellChatThreadDeps = {
  createNewThread: () => {},
  filterThreadList: (_value) => {},
  toggleThreadRail: () => {},
};

export function configureShellImportDeps(deps = {}) {
  const previous = { ...shellImportDeps };
  if (typeof deps.handleImportStatusClick === 'function') shellImportDeps.handleImportStatusClick = deps.handleImportStatusClick;
  if (typeof deps.isImportRunning === 'function') shellImportDeps.isImportRunning = deps.isImportRunning;
  return previous;
}

export function configureShellFeedbackDeps(deps = {}) {
  const previous = { ...shellFeedbackDeps };
  if (typeof deps.openFeedbackModal === 'function') shellFeedbackDeps.openFeedbackModal = deps.openFeedbackModal;
  return previous;
}

export function configureShellProfileShareDeps(deps = {}) {
  const previous = { ...shellProfileShareDeps };
  if (typeof deps.openProfileShareModal === 'function') {
    shellProfileShareDeps.openProfileShareModal = deps.openProfileShareModal;
  }
  return previous;
}

/** @param {Partial<typeof shellNavDeps>} [deps] */
export function configureShellNavDeps(deps = {}) {
  const previous = { ...shellNavDeps };
  if (typeof deps.closeMobileSidebar === 'function') shellNavDeps.closeMobileSidebar = deps.closeMobileSidebar;
  if (typeof deps.toggleMobileSidebar === 'function') shellNavDeps.toggleMobileSidebar = deps.toggleMobileSidebar;
  return previous;
}

export function configureShellChatImageDeps(deps = {}) {
  const previous = { ...shellChatImageDeps };
  if (typeof deps.toggleHDMode === 'function') shellChatImageDeps.toggleHDMode = deps.toggleHDMode;
  return previous;
}

/** @param {Partial<typeof shellChatActionDeps>} [deps] */
export function configureShellChatActionDeps(deps = {}) {
  const previous = { ...shellChatActionDeps };
  for (const name of Object.keys(shellChatActionDeps)) {
    const key = /** @type {keyof typeof shellChatActionDeps} */ (name);
    const callback = deps[key];
    if (typeof callback === 'function') shellChatActionDeps[key] = callback;
  }
  return previous;
}

export function configureShellChatThreadDeps(deps = {}) {
  const previous = { ...shellChatThreadDeps };
  if (typeof deps.createNewThread === 'function') shellChatThreadDeps.createNewThread = deps.createNewThread;
  if (typeof deps.filterThreadList === 'function') shellChatThreadDeps.filterThreadList = deps.filterThreadList;
  if (typeof deps.toggleThreadRail === 'function') shellChatThreadDeps.toggleThreadRail = deps.toggleThreadRail;
  return previous;
}

function shellRuntime() {
  return /** @type {Record<string, any>} */ (globalThis);
}

function callShellRuntime(name, ...args) {
  const fn = getSettingsModuleFunction(name) || shellRuntime()[name];
  if (typeof fn === 'function') fn(...args);
}

function closestAction(event, selector) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest(selector);
}

function clickFileInput(id) {
  const input = document.getElementById(id);
  if (input instanceof HTMLInputElement) input.click();
}

function runShellAction(action) {
  if (action === 'toggle-mobile-sidebar') {
    shellNavDeps.toggleMobileSidebar();
    return true;
  } else if (action === 'close-mobile-sidebar') {
    shellNavDeps.closeMobileSidebar();
    return true;
  } else if (action === 'trigger-import') {
    if (shellImportDeps.isImportRunning()) {
      shellImportDeps.handleImportStatusClick();
      return true;
    }
    clickFileInput('pdf-input');
    return true;
  } else if (action === 'share-profile') {
    shellProfileShareDeps.openProfileShareModal();
    return true;
  } else if (action === 'open-tweaks') {
    callShellRuntime('openTweaksPanel');
    return true;
  } else if (action === 'open-settings') {
    callShellRuntime('openSettingsModal');
    return true;
  } else if (action === 'open-ai-settings') {
    callShellRuntime('openSettingsModal', 'ai');
    return true;
  } else if (action === 'open-feedback') {
    shellFeedbackDeps.openFeedbackModal();
    return true;
  } else if (action === 'import-status') {
    shellImportDeps.handleImportStatusClick();
    return true;
  }
  return false;
}

function runChatAction(action, actionEl) {
  if (action === 'toggle-panel') {
    shellChatActionDeps.toggleChatPanel();
    return true;
  } else if (action === 'close-panel') {
    shellChatActionDeps.closeChatPanel();
    return true;
  } else if (action === 'toggle-thread-rail') {
    shellChatThreadDeps.toggleThreadRail();
    return true;
  } else if (action === 'create-thread') {
    shellChatThreadDeps.createNewThread();
    return true;
  } else if (action === 'summarize-thread') {
    shellChatActionDeps.summarizeThread();
    return true;
  } else if (action === 'clear-history') {
    shellChatActionDeps.clearChatHistory();
    return true;
  } else if (action === 'toggle-fullscreen') {
    shellChatActionDeps.toggleChatFullscreen();
    return true;
  } else if (action === 'toggle-personality') {
    shellChatActionDeps.togglePersonalityBar();
    return true;
  } else if (action === 'set-personality') {
    shellChatActionDeps.setChatPersonality(actionEl.dataset.personality || 'default');
    return true;
  } else if (action === 'attach-image') {
    clickFileInput('chat-image-input');
    return true;
  } else if (action === 'toggle-hd') {
    shellChatImageDeps.toggleHDMode();
    return true;
  } else if (action === 'start-discussion') {
    shellChatActionDeps.startDiscussion();
    return true;
  } else if (action === 'send-message') {
    shellChatActionDeps.sendChatMessage();
    return true;
  } else if (action === 'toggle-voice-recording') {
    shellChatActionDeps.toggleVoiceRecording();
    return true;
  }
  return false;
}

function handleShellClick(event) {
  const actionEl = closestAction(event, '[data-shell-action], [data-chat-action]');
  if (!actionEl) return;

  const shellAction = actionEl.dataset.shellAction;
  const chatAction = actionEl.dataset.chatAction;
  if (!shellAction && !chatAction) return;

  const handled = shellAction
    ? runShellAction(shellAction)
    : runChatAction(chatAction, actionEl);
  if (handled) event.preventDefault();
}

function handleShellInput(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.dataset.chatInputAction === 'filter-thread-list') {
    shellChatThreadDeps.filterThreadList(input.value);
  }
}

function handleShellChange(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.dataset.chatChangeAction === 'set-websearch') {
    shellChatActionDeps.setChatWebSearchEnabled(input.checked);
  }
}

function handleShellKeydown(event) {
  const actionEl = closestAction(event, '[data-chat-key-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.chatKeyAction;
  if (action === 'message-input') {
    shellChatActionDeps.handleChatKeydown(event);
  } else if (action === 'toggle-personality' && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    shellChatActionDeps.togglePersonalityBar();
  }
}

export function installShellActionDelegates() {
  if (shellDelegatesInstalled || typeof document === 'undefined') return;
  shellDelegatesInstalled = true;

  document.addEventListener('click', handleShellClick);
  document.addEventListener('input', handleShellInput);
  document.addEventListener('search', handleShellInput);
  document.addEventListener('change', handleShellChange);
  document.addEventListener('keydown', handleShellKeydown);
}
