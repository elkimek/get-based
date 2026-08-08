// @ts-check
// chat-discussion-flow.js - public discussion user-action handlers

import { state } from './state.js';
import {
  getCurrentDiscussionState, reopenCurrentDiscussionThread,
} from './chat-discussion-state.js';
import {
  getChatAbortController,
} from './chat-discussion-callbacks.js';
import {
  readDiscussPersonaPickerSelection, removeDiscussContinuePrompt, removeDiscussPersonaPicker,
  showDiscussPersonaPicker,
} from './chat-discussion-ui.js';
import {
  runDiscussion, runDiscussionContinuation, runSingleDiscussionTurn,
} from './chat-discussion-turns.js';
import { hasPendingAttachments } from './chat-images.js';
import { showNotification } from './utils.js';

export {
  cleanupDiscussionState, endDiscussion, restoreDiscussionContinuePrompt,
  showDiscussContinuePrompt,
} from './chat-discussion-lifecycle.js';

export async function sendDiscussionUserTurn(text, discussionState = getCurrentDiscussionState()) {
  if (!discussionState) return;
  if (getChatAbortController()) return;
  const threadId = state.currentThreadId;
  removeDiscussContinuePrompt();
  await runDiscussionContinuation(
    discussionState.personas,
    discussionState.originalPersonality,
    text,
    { suppressAutoMsg: true, threadId }
  );
}

/** @param {string | null} [personaId] */
export async function resumeDiscussion(personaId = null) {
  if (getChatAbortController()) return;
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  const discussionState = getCurrentDiscussionState({ allowHistoryFallback: false });
  const pendingPersonas = thread?.discussionPendingPersonas;
  if (!discussionState || !Array.isArray(pendingPersonas) || !pendingPersonas.length) return;
  const selectedPersonas = personaId
    ? pendingPersonas.filter(persona => persona.id === personaId)
    : pendingPersonas;
  if (!selectedPersonas.length) return;
  const deferredPersonas = personaId
    ? pendingPersonas.filter(persona => persona.id !== personaId)
    : [];
  await runDiscussionContinuation(
    selectedPersonas,
    discussionState.originalPersonality,
    null,
    {
      allPersonas: discussionState.personas,
      deferredPersonas,
      pendingOrder: pendingPersonas,
      suppressAutoMsg: true,
      threadId: state.currentThreadId,
    },
  );
}

export async function continueDiscussion() {
  if (getChatAbortController()) return;
  // Compatibility entry point. Discussion turns now use the main composer.
  document.getElementById('chat-input')?.focus();
}

export async function startDiscussion() {
  if (getChatAbortController()) return;
  if (hasPendingAttachments()) {
    showNotification('Send or remove the attached images before starting a discussion.', 'info', 5000);
    return;
  }

  reopenCurrentDiscussionThread();

  showDiscussPersonaPicker();
}

export async function startDiscussionFromPicker() {
  const selection = readDiscussPersonaPickerSelection();
  if (!selection) return;
  const { allPersonas, newPersonas } = selection;
  removeDiscussPersonaPicker();

  if (newPersonas.length === 1) {
    // The active persona has already answered the current turn. Let only the
    // newly added perspective weigh in now; everyone joins future user turns.
    return runSingleDiscussionTurn(newPersonas[0], allPersonas);
  }
  return runDiscussion(allPersonas);
}
