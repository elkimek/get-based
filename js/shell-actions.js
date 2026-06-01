// shell-actions.js - delegated actions for static index.html controls

let shellDelegatesInstalled = false;

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
    window.toggleMobileSidebar?.();
  } else if (action === 'close-mobile-sidebar') {
    window.closeMobileSidebar?.();
  } else if (action === 'trigger-import') {
    clickFileInput('pdf-input');
  } else if (action === 'open-tweaks') {
    window.openTweaksPanel?.();
  } else if (action === 'open-settings') {
    window.openSettingsModal?.();
  } else if (action === 'open-ai-settings') {
    window.openSettingsModal?.('ai');
  } else if (action === 'open-feedback') {
    window.openFeedbackModal?.();
  } else if (action === 'import-status') {
    window.handleImportStatusClick?.();
  }
}

function runChatAction(action, actionEl) {
  if (action === 'toggle-panel') {
    window.toggleChatPanel?.();
  } else if (action === 'close-panel') {
    window.closeChatPanel?.();
  } else if (action === 'toggle-thread-rail') {
    window.toggleThreadRail?.();
  } else if (action === 'create-thread') {
    window.createNewThread?.();
  } else if (action === 'summarize-thread') {
    window.summarizeThread?.();
  } else if (action === 'clear-history') {
    window.clearChatHistory?.();
  } else if (action === 'toggle-fullscreen') {
    window.toggleChatFullscreen?.();
  } else if (action === 'toggle-personality') {
    window.togglePersonalityBar?.();
  } else if (action === 'set-personality') {
    window.setChatPersonality?.(actionEl.dataset.personality || 'default');
  } else if (action === 'attach-image') {
    clickFileInput('chat-image-input');
  } else if (action === 'toggle-hd') {
    window.toggleHDMode?.();
  } else if (action === 'start-discussion') {
    window.startDiscussion?.();
  } else if (action === 'send-message') {
    window.sendChatMessage?.();
  }
}

function handleShellClick(event) {
  const actionEl = closestAction(event, '[data-shell-action], [data-chat-action]');
  if (!actionEl) return;

  const shellAction = actionEl.dataset.shellAction;
  const chatAction = actionEl.dataset.chatAction;
  if (!shellAction && !chatAction) return;

  event.preventDefault();
  if (shellAction) runShellAction(shellAction);
  else runChatAction(chatAction, actionEl);
}

function handleShellInput(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.dataset.chatInputAction === 'filter-thread-list') {
    window.filterThreadList?.(input.value);
  }
}

function handleShellChange(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.dataset.chatChangeAction === 'set-websearch') {
    window.setChatWebSearchEnabled?.(input.checked);
  }
}

function handleShellKeydown(event) {
  const actionEl = closestAction(event, '[data-chat-key-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.chatKeyAction;
  if (action === 'message-input') {
    window.handleChatKeydown?.(event);
  } else if (action === 'toggle-personality' && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    window.togglePersonalityBar?.();
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
