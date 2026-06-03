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
    return true;
  } else if (action === 'close-mobile-sidebar') {
    window.closeMobileSidebar?.();
    return true;
  } else if (action === 'trigger-import') {
    clickFileInput('pdf-input');
    return true;
  } else if (action === 'share-profile') {
    window.openProfileShareModal?.();
    return true;
  } else if (action === 'open-tweaks') {
    window.openTweaksPanel?.();
    return true;
  } else if (action === 'open-settings') {
    window.openSettingsModal?.();
    return true;
  } else if (action === 'open-ai-settings') {
    window.openSettingsModal?.('ai');
    return true;
  } else if (action === 'open-feedback') {
    window.openFeedbackModal?.();
    return true;
  } else if (action === 'import-status') {
    window.handleImportStatusClick?.();
    return true;
  }
  return false;
}

function runChatAction(action, actionEl) {
  if (action === 'toggle-panel') {
    window.toggleChatPanel?.();
    return true;
  } else if (action === 'close-panel') {
    window.closeChatPanel?.();
    return true;
  } else if (action === 'toggle-thread-rail') {
    window.toggleThreadRail?.();
    return true;
  } else if (action === 'create-thread') {
    window.createNewThread?.();
    return true;
  } else if (action === 'summarize-thread') {
    window.summarizeThread?.();
    return true;
  } else if (action === 'clear-history') {
    window.clearChatHistory?.();
    return true;
  } else if (action === 'toggle-fullscreen') {
    window.toggleChatFullscreen?.();
    return true;
  } else if (action === 'toggle-personality') {
    window.togglePersonalityBar?.();
    return true;
  } else if (action === 'set-personality') {
    window.setChatPersonality?.(actionEl.dataset.personality || 'default');
    return true;
  } else if (action === 'attach-image') {
    clickFileInput('chat-image-input');
    return true;
  } else if (action === 'toggle-hd') {
    window.toggleHDMode?.();
    return true;
  } else if (action === 'start-discussion') {
    window.startDiscussion?.();
    return true;
  } else if (action === 'send-message') {
    window.sendChatMessage?.();
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
