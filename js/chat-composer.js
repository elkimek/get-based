// @ts-check
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

const composerDeps = {
  updateSendButtonState: /** @type {() => void} */ (() => {}),
};

/** @param {Partial<typeof composerDeps>} [deps] */
export function configureChatComposer(deps = {}) {
  const previous = { ...composerDeps };
  if (typeof deps.updateSendButtonState === 'function') {
    composerDeps.updateSendButtonState = deps.updateSendButtonState;
  }
  return previous;
}

function getChatInput() {
  if (typeof document === 'undefined') return null;
  return /** @type {HTMLTextAreaElement | null} */ (document.getElementById('chat-input'));
}

/** @param {string | null | undefined} threadId */
function draftContext(threadId) {
  const profileId = state.currentProfile || 'default';
  return threadId ? { profileId, threadId } : null;
}

/** @param {HTMLTextAreaElement | null} [input] */
export function resizeChatInput(input = getChatInput()) {
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

/** @param {string | null | undefined} [threadId] */
export function saveChatDraft(threadId = state.currentThreadId) {
  const context = draftContext(threadId);
  const input = getChatInput();
  if (!context || !input) return '';
  rememberChatDraft(context.profileId, context.threadId, input.value);
  return input.value;
}

/** @param {string | null | undefined} [threadId] */
export function getChatDraft(threadId = state.currentThreadId) {
  const context = draftContext(threadId);
  if (!context) return '';
  return getCachedChatDraft(context.profileId, context.threadId) || '';
}

/** @param {string | null | undefined} [threadId] */
export function clearChatDraft(threadId = state.currentThreadId) {
  const context = draftContext(threadId);
  if (!context) return Promise.resolve();
  return clearStoredChatDraft(context.profileId, context.threadId);
}

/** @param {string} value @param {boolean} focus */
function applyChatInputValue(value, focus) {
  const input = getChatInput();
  if (!input) return false;
  input.value = String(value || '');
  resizeChatInput(input);
  composerDeps.updateSendButtonState();
  if (focus && !input.disabled) input.focus();
  return true;
}

/**
 * @param {string} value
 * @param {{ remember?: boolean, focus?: boolean }} [options]
 */
export function setChatInputValue(value, { remember = true, focus = false } = {}) {
  draftRestoreRequest += 1;
  const applied = applyChatInputValue(value, focus);
  if (!applied) return false;
  if (remember) saveChatDraft();
  return true;
}

/**
 * @param {string | null | undefined} [threadId]
 * @param {{ focus?: boolean }} [options]
 */
export async function restoreChatDraft(threadId = state.currentThreadId, { focus = false } = {}) {
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

/** @param {{ clearDraft?: boolean, focus?: boolean }} [options] */
export function resetChatComposer({ clearDraft = true, focus = false } = {}) {
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
