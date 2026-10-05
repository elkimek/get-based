import { configureRuntimeFunctions } from './runtime-callbacks.js';
// shell-actions.js - delegated actions for static index.html controls

import { handleImportStatusClick, isImportRunning } from './pdf-import-progress.js';
import { openFeedbackModal } from './feedback.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';
import { openChatContextModalRuntime } from './chat-runtime.js';


// Private invocation views describe only operations performed here. Injected
// getter values remain opaque in public snapshots; these views do not validate them.
type ShellNoArgAction = () => unknown;
type ShellImportCalls = { handleImportStatusClick: ShellNoArgAction; isImportRunning: ShellNoArgAction };
type ShellFeedbackCalls = { openFeedbackModal: ShellNoArgAction };
type ShellProfileShareCalls = { openProfileShareModal: (profileId?: unknown) => unknown };
type ShellNavCalls = { closeMobileSidebar: ShellNoArgAction; toggleMobileSidebar: ShellNoArgAction };
type ShellChatActionCalls = {
  closeChatPanel: ShellNoArgAction; clearChatHistory: ShellNoArgAction;
  handleChatKeydown: (event: KeyboardEvent) => unknown; sendChatMessage: ShellNoArgAction;
  setChatBackendFromUI: (backend: string) => unknown; setChatPersonality: (personality: string) => unknown;
  setChatWebSearchEnabled: (enabled: boolean) => unknown; startDiscussion: ShellNoArgAction;
  summarizeThread: ShellNoArgAction; toggleChatPanel: ShellNoArgAction; toggleChatFullscreen: ShellNoArgAction;
  togglePersonalityBar: ShellNoArgAction; toggleVoiceRecording: ShellNoArgAction;
};
type ShellChatThreadCalls = {
  createThreadProject: ShellNoArgAction; createNewThread: ShellNoArgAction;
  filterThreadList: (value: string) => unknown; setChatThreadSort: (value: string) => unknown;
  toggleThreadRail: ShellNoArgAction;
};
type ShellSnapshot<Calls> = { [Key in keyof Calls]: unknown };
type ShellRuntimeConfigurator = <Calls extends object>(current: Calls, updates: unknown, fields: ReadonlyArray<keyof Calls>) => ShellSnapshot<Calls>;

let shellDelegatesInstalled = false;
const shellImportDeps: ShellImportCalls = { handleImportStatusClick, isImportRunning };
const shellFeedbackDeps: ShellFeedbackCalls = { openFeedbackModal };
const shellProfileShareDeps: ShellProfileShareCalls = {
  openProfileShareModal: (_profileId) => {},
};
const shellNavDeps: ShellNavCalls = {
  closeMobileSidebar: () => {},
  toggleMobileSidebar: () => {},
};
const shellChatActionDeps: ShellChatActionCalls = {
  closeChatPanel: () => {},
  clearChatHistory: () => {},
  handleChatKeydown: (_event) => {},
  sendChatMessage: () => {},
  setChatBackendFromUI: (_backend) => {},
  setChatPersonality: (_personality) => {},
  setChatWebSearchEnabled: (_enabled) => {},
  startDiscussion: () => {},
  summarizeThread: () => {},
  toggleChatPanel: () => {},
  toggleChatFullscreen: () => {},
  togglePersonalityBar: () => {},
  toggleVoiceRecording: () => {},
};
const shellChatThreadDeps: ShellChatThreadCalls = {
  createThreadProject: () => {},
  createNewThread: () => {},
  filterThreadList: (_value) => {},
  setChatThreadSort: (_value) => {},
  toggleThreadRail: () => {},
};

export function configureShellImportDeps(deps: unknown = {}): ShellSnapshot<ShellImportCalls> {
  return (configureRuntimeFunctions as ShellRuntimeConfigurator)(shellImportDeps, deps, ["handleImportStatusClick","isImportRunning"]);
}

export function configureShellFeedbackDeps(deps: unknown = {}): ShellSnapshot<ShellFeedbackCalls> {
  return (configureRuntimeFunctions as ShellRuntimeConfigurator)(shellFeedbackDeps, deps, ["openFeedbackModal"]);
}

export function configureShellProfileShareDeps(deps: unknown = {}): ShellSnapshot<ShellProfileShareCalls> {
  return (configureRuntimeFunctions as ShellRuntimeConfigurator)(shellProfileShareDeps, deps, ["openProfileShareModal"]);
}

export function configureShellNavDeps(deps: unknown = {}): ShellSnapshot<ShellNavCalls> {
  return (configureRuntimeFunctions as ShellRuntimeConfigurator)(shellNavDeps, deps, ["closeMobileSidebar","toggleMobileSidebar"]);
}

export function configureShellChatActionDeps(deps: unknown = {}): ShellSnapshot<ShellChatActionCalls> {
  const previous = { ...shellChatActionDeps };
  for (const name of Object.keys(shellChatActionDeps)) {
    const key = name as keyof ShellChatActionCalls;
    const callback = (deps as ShellSnapshot<ShellChatActionCalls>)[key];
    if (typeof callback === 'function') (shellChatActionDeps as ShellSnapshot<ShellChatActionCalls>)[key] = callback;
  }
  return previous;
}

export function configureShellChatThreadDeps(deps: unknown = {}): ShellSnapshot<ShellChatThreadCalls> {
  return (configureRuntimeFunctions as ShellRuntimeConfigurator)(shellChatThreadDeps, deps, ["createThreadProject","createNewThread","filterThreadList","setChatThreadSort","toggleThreadRail"]);
}

function shellRuntime() {
  return globalThis as unknown as Record<string, unknown>;
}

function callShellRuntime(name: string, ...args: unknown[]) {
  const fn = getSettingsModuleFunction(name) || shellRuntime()[name];
  if (typeof fn === 'function') (fn as (...args: unknown[]) => unknown)(...args);
}

function closestAction(event: Event, selector: string) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest(selector) as HTMLElement | null;
}

function clickFileInput(id: string) {
  const input = document.getElementById(id);
  if (input instanceof HTMLInputElement) input.click();
}

function runShellAction(action: string) {
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
  } else if (action === 'open-feedback') {
    shellFeedbackDeps.openFeedbackModal();
    return true;
  } else if (action === 'import-status') {
    shellImportDeps.handleImportStatusClick();
    return true;
  }
  return false;
}

function runChatAction(action: string | undefined, actionEl: HTMLElement) {
  const closeComposerMenu = () => actionEl.closest('details')?.removeAttribute('open');
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
  } else if (action === 'create-project') {
    shellChatThreadDeps.createThreadProject();
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
    closeComposerMenu();
    clickFileInput('chat-image-input');
    return true;
  } else if (action === 'import-health-file') {
    closeComposerMenu();
    clickFileInput('pdf-input');
    return true;
  } else if (action === 'open-chat-context') {
    closeComposerMenu();
    openChatContextModalRuntime();
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

function handleShellClick(event: Event) {
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

function handleShellInput(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.dataset.chatInputAction === 'filter-thread-list') {
    shellChatThreadDeps.filterThreadList(input.value);
  }
}

function handleShellChange(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) return;
  if (input.dataset.chatChangeAction === 'set-websearch' && input instanceof HTMLInputElement) {
    shellChatActionDeps.setChatWebSearchEnabled(input.checked);
  } else if (input.dataset.chatChangeAction === 'set-backend' && input instanceof HTMLSelectElement) {
    shellChatActionDeps.setChatBackendFromUI(input.value);
  } else if (input.dataset.chatChangeAction === 'sort-thread-list' && input instanceof HTMLSelectElement) {
    shellChatThreadDeps.setChatThreadSort(input.value);
  }
}

function handleShellKeydown(event: KeyboardEvent) {
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
