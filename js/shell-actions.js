// @ts-check
// shell-actions.js - delegated actions for static index.html controls

import { handleImportStatusClick, isImportRunning } from './pdf-import-progress.js';

let shellDelegatesInstalled = false;
const shellImportDeps = { handleImportStatusClick, isImportRunning };

export function configureShellImportDeps(deps = {}) {
  const previous = { ...shellImportDeps };
  if (typeof deps.handleImportStatusClick === 'function') shellImportDeps.handleImportStatusClick = deps.handleImportStatusClick;
  if (typeof deps.isImportRunning === 'function') shellImportDeps.isImportRunning = deps.isImportRunning;
  return previous;
}

function shellRuntime() {
  return /** @type {Record<string, any>} */ (globalThis);
}

function callShellRuntime(name, ...args) {
  const fn = shellRuntime()[name];
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
    callShellRuntime('toggleMobileSidebar');
    return true;
  } else if (action === 'close-mobile-sidebar') {
    callShellRuntime('closeMobileSidebar');
    return true;
  } else if (action === 'trigger-import') {
    if (shellImportDeps.isImportRunning()) {
      shellImportDeps.handleImportStatusClick();
      return true;
    }
    clickFileInput('pdf-input');
    return true;
  } else if (action === 'share-profile') {
    callShellRuntime('openProfileShareModal');
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
    callShellRuntime('openFeedbackModal');
    return true;
  } else if (action === 'import-status') {
    shellImportDeps.handleImportStatusClick();
    return true;
  }
  return false;
}

function runChatAction(action, actionEl) {
  if (action === 'toggle-panel') {
    callShellRuntime('toggleChatPanel');
    return true;
  } else if (action === 'close-panel') {
    callShellRuntime('closeChatPanel');
    return true;
  } else if (action === 'toggle-thread-rail') {
    callShellRuntime('toggleThreadRail');
    return true;
  } else if (action === 'create-thread') {
    callShellRuntime('createNewThread');
    return true;
  } else if (action === 'summarize-thread') {
    callShellRuntime('summarizeThread');
    return true;
  } else if (action === 'clear-history') {
    callShellRuntime('clearChatHistory');
    return true;
  } else if (action === 'toggle-fullscreen') {
    callShellRuntime('toggleChatFullscreen');
    return true;
  } else if (action === 'toggle-personality') {
    callShellRuntime('togglePersonalityBar');
    return true;
  } else if (action === 'set-personality') {
    callShellRuntime('setChatPersonality', actionEl.dataset.personality || 'default');
    return true;
  } else if (action === 'attach-image') {
    clickFileInput('chat-image-input');
    return true;
  } else if (action === 'toggle-hd') {
    callShellRuntime('toggleHDMode');
    return true;
  } else if (action === 'start-discussion') {
    callShellRuntime('startDiscussion');
    return true;
  } else if (action === 'send-message') {
    callShellRuntime('sendChatMessage');
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
    callShellRuntime('filterThreadList', input.value);
  }
}

function handleShellChange(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.dataset.chatChangeAction === 'set-websearch') {
    callShellRuntime('setChatWebSearchEnabled', input.checked);
  }
}

function handleShellKeydown(event) {
  const actionEl = closestAction(event, '[data-chat-key-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.chatKeyAction;
  if (action === 'message-input') {
    callShellRuntime('handleChatKeydown', event);
  } else if (action === 'toggle-personality' && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    callShellRuntime('togglePersonalityBar');
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
