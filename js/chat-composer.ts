import { configureRuntimeFunctions } from './runtime-callbacks.js';
// chat-composer.js — growing message input and per-conversation draft state

import { state } from './state.js';
import {
  clearStoredChatDraft,
  getCachedChatDraft,
  loadChatDraft,
  rememberChatDraft,
} from './chat-draft-storage.js';

let composerInstalled = false;
let draftRestoreRequest = 0;

const composerDeps: { updateSendButtonState: () => unknown } = {
  updateSendButtonState: () => {},
};

export function configureChatComposer(deps: Record<string, unknown> = {}) {
  return (configureRuntimeFunctions as (current: typeof composerDeps, updates: Record<string, unknown>, fields: ReadonlyArray<keyof typeof composerDeps>) => ReturnType<typeof configureRuntimeFunctions<typeof composerDeps>>)(composerDeps, deps, ["updateSendButtonState"]);
}

function getChatInput() {
  if (typeof document === 'undefined') return null;
  return (document.getElementById('chat-input') as HTMLTextAreaElement | null);
}

function draftContext(threadId: string | null | undefined) {
  const profileId = state.currentProfile || 'default';
  return threadId ? { profileId, threadId } : null;
}

export function resizeChatInput(input: HTMLTextAreaElement | null = getChatInput()) {
  if (!input) return 0;
  input.style.height = 'auto';
  const styles = typeof getComputedStyle === 'function' ? getComputedStyle(input) : null;
  const configuredMax = Number.parseFloat(
    styles?.getPropertyValue('--chat-input-max-height') || styles?.maxHeight || '',
  );
  const maxHeight = Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : 240;
  const measuredHeight = Number(input.scrollHeight) || 0;
  if (!measuredHeight) {
    input.classList.remove('is-scrollable');
    return 0;
  }
  const height = Math.min(measuredHeight, maxHeight);
  input.style.height = `${height}px`;
  input.classList.toggle('is-scrollable', measuredHeight > maxHeight);
  return height;
}

export function saveChatDraft(threadId: string | null | undefined = state.currentThreadId) {
  const context = draftContext(threadId);
  const input = getChatInput();
  if (!context || !input) return '';
  rememberChatDraft(context.profileId, context.threadId, input.value);
  return input.value;
}

export function getChatDraft(threadId: string | null | undefined = state.currentThreadId) {
  const context = draftContext(threadId);
  if (!context) return '';
  return getCachedChatDraft(context.profileId, context.threadId) || '';
}

export function clearChatDraft(threadId: string | null | undefined = state.currentThreadId) {
  const context = draftContext(threadId);
  if (!context) return Promise.resolve();
  return clearStoredChatDraft(context.profileId, context.threadId);
}

function applyChatInputValue(value: unknown, focus: boolean) {
  const input = getChatInput();
  if (!input) return false;
  input.value = String(value || '');
  resizeChatInput(input);
  composerDeps.updateSendButtonState();
  if (focus && !input.disabled) input.focus();
  return true;
}

export function setChatInputValue(value: unknown, { remember = true, focus = false }: { remember?: boolean; focus?: boolean } = {}) {
  draftRestoreRequest += 1;
  const applied = applyChatInputValue(value, focus);
  if (!applied) return false;
  if (remember) saveChatDraft();
  return true;
}

export async function restoreChatDraft(threadId: string | null | undefined = state.currentThreadId, { focus = false }: { focus?: boolean } = {}) {
  const context = draftContext(threadId);
  if (!context) return applyChatInputValue('', focus);
  const request = ++draftRestoreRequest;
  applyChatInputValue(getCachedChatDraft(context.profileId, context.threadId) || '', focus);
  const value = await loadChatDraft(context.profileId, context.threadId);
  if (request !== draftRestoreRequest
    || state.currentProfile !== context.profileId
    || state.currentThreadId !== context.threadId) return false;
  return applyChatInputValue(value, focus);
}

export function resetChatComposer({ clearDraft = true, focus = false }: { clearDraft?: boolean; focus?: boolean } = {}) {
  if (clearDraft) void clearChatDraft();
  return setChatInputValue('', { remember: false, focus });
}

export function refreshChatComposer() {
  resizeChatInput();
  composerDeps.updateSendButtonState();
}

function handleComposerInput() {
  draftRestoreRequest += 1;
  saveChatDraft();
  refreshChatComposer();
}

export function initChatComposer() {
  const input = getChatInput();
  if (!input) return false;
  if (!composerInstalled) {
    composerInstalled = true;
    input.addEventListener('input', handleComposerInput);
  }
  refreshChatComposer();
  return true;
}
