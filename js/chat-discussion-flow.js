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

export async function continueDiscussion() {
  if (getChatAbortController()) return;
  const steerInput = document.getElementById('chat-discuss-steer');
  const steerText = steerInput ? steerInput.value.trim() : '';
  const threadId = state.currentThreadId;
  removeDiscussContinuePrompt();
  const personas = state._discussionPersonas;
  const originalPersonality = state._discussionOriginalPersonality;
  if (!personas || personas.length < 2) return;

  await runDiscussionContinuation(personas, originalPersonality, steerText || null, { threadId });
}

export async function startDiscussion() {
  if (getChatAbortController()) return;

  reopenCurrentDiscussionThread();

  showDiscussPersonaPicker();
}

export async function startDiscussionFromPicker() {
  const selection = readDiscussPersonaPickerSelection();
  if (!selection) return;
  const { allPersonas, newPersonas } = selection;
  removeDiscussPersonaPicker();

  if (newPersonas.length > 0) {
    // Adding a new persona - only they respond for this turn.
    return runSingleDiscussionTurn(newPersonas[0], allPersonas);
  }
  return runDiscussion(allPersonas);
}
