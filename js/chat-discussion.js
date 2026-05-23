// chat-discussion.js — Multi-persona discussion/debate orchestration

import { state } from './state.js';
import {
  updateChatHeaderTitle,
} from './chat-personalities.js';
import {
  clearCurrentDiscussionThreadState, getCurrentDiscussionState, getCurrentThread,
  reopenCurrentDiscussionThread,
} from './chat-discussion-state.js';
import {
  getChatAbortController,
} from './chat-discussion-callbacks.js';
import {
  readDiscussPersonaPickerSelection, removeDiscussContinuePrompt, removeDiscussPersonaPicker,
  showDiscussContinuePrompt as showDiscussContinuePromptUI,
  showDiscussPersonaPicker, updateDiscussButton,
} from './chat-discussion-ui.js';
import {
  runDiscussionRound,
} from './chat-discussion-round-runner.js';
import {
  isRoundThreadActive, persistDiscussionThreadState,
} from './chat-discussion-round-state.js';
import {
  buildDiscussionJoinMessage, DISCUSSION_JOIN_PROMPT,
} from './chat-discussion-round-prompts.js';

export { getCurrentDiscussionState, getThreadPersonaCount } from './chat-discussion-state.js';
export { configureChatDiscussion } from './chat-discussion-callbacks.js';
export { removeDiscussContinuePrompt, updateDiscussButton } from './chat-discussion-ui.js';

export function restoreDiscussionContinuePrompt() {
  const discussionState = getCurrentDiscussionState();
  if (!discussionState) return;
  showDiscussContinuePrompt(discussionState.personas, discussionState.originalPersonality);
}

export async function sendDiscussionUserTurn(text, discussionState = getCurrentDiscussionState()) {
  if (!discussionState) return;
  if (getChatAbortController()) return;
  const threadId = state.currentThreadId;
  removeDiscussContinuePrompt();
  persistDiscussionThreadState(threadId, discussionState.personas, discussionState.originalPersonality);
  await runDiscussionRound(discussionState.personas, text, { suppressAutoMsg: true, threadId });
  _finishDiscussionRound(discussionState.personas, discussionState.originalPersonality, threadId);
}

export function showDiscussContinuePrompt(personas, originalPersonality) {
  showDiscussContinuePromptUI(personas, originalPersonality, {
    onPersist() {
      const thread = getCurrentThread();
      if (thread) persistDiscussionThreadState(thread.id, personas, originalPersonality);
    },
  });
}

export function cleanupDiscussionState({ clearThread = false, markEnded = false } = {}) {
  removeDiscussContinuePrompt();
  removeDiscussPersonaPicker();
  delete state._discussionPersonas;
  delete state._discussionOriginalPersonality;

  // Only clear persisted discussion state when the user explicitly ends it.
  // Thread switches and new-thread creation should remove transient UI state
  // without erasing the old thread's Continue prompt metadata.
  clearCurrentDiscussionThreadState({ clearThread, markEnded });
}

export async function continueDiscussion() {
  if (getChatAbortController()) return;
  // Read steer input before removing the prompt
  const steerInput = document.getElementById('chat-discuss-steer');
  const steerText = steerInput ? steerInput.value.trim() : '';
  const threadId = state.currentThreadId;
  removeDiscussContinuePrompt();
  const personas = state._discussionPersonas;
  const originalPersonality = state._discussionOriginalPersonality;
  if (!personas || personas.length < 2) return;

  persistDiscussionThreadState(threadId, personas, originalPersonality);
  await runDiscussionRound(personas, steerText || null, { threadId });
  _finishDiscussionRound(personas, originalPersonality, threadId);
}

export function endDiscussion() {
  const orig = state._discussionOriginalPersonality;
  cleanupDiscussionState({ clearThread: true, markEnded: true });
  if (orig) {
    state.currentChatPersonality = orig;
    localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, orig);
  }
  updateDiscussButton();
}

export async function startDiscussion() {
  if (getChatAbortController()) return; // already streaming

  reopenCurrentDiscussionThread();

  showDiscussPersonaPicker();
}

export async function startDiscussionFromPicker() {
  const selection = readDiscussPersonaPickerSelection();
  if (!selection) return;
  const { allPersonas, newPersonas } = selection;
  removeDiscussPersonaPicker();

  if (newPersonas.length > 0) {
    // Adding a new persona — only they respond (one turn)
    return _runSingleTurn(newPersonas[0], allPersonas);
  }
  // Shouldn't happen, but fallback
  return _runDiscussion(allPersonas);
}

function _finishDiscussionRound(personas, originalPersonality, threadId = state.currentThreadId) {
  persistDiscussionThreadState(threadId, personas, originalPersonality);
  if (!isRoundThreadActive(threadId)) return;
  state.currentChatPersonality = originalPersonality;
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, originalPersonality);
  updateDiscussButton();
  updateChatHeaderTitle();
  if (!getChatAbortController()) {
    showDiscussContinuePrompt(personas, originalPersonality);
  }
}

async function _runSingleTurn(persona, allPersonas) {
  const originalPersonality = state.currentChatPersonality;
  const threadId = state.currentThreadId;
  persistDiscussionThreadState(threadId, allPersonas, originalPersonality);
  state.chatHistory.push(buildDiscussionJoinMessage(persona));
  await runDiscussionRound([persona], DISCUSSION_JOIN_PROMPT, { hideAutoMsg: true, threadId });
  _finishDiscussionRound(allPersonas, originalPersonality, threadId);
}

async function _runDiscussion(personas) {
  const originalPersonality = state.currentChatPersonality;
  const threadId = state.currentThreadId;
  persistDiscussionThreadState(threadId, personas, originalPersonality);
  await runDiscussionRound(personas, null, { threadId });
  _finishDiscussionRound(personas, originalPersonality, threadId);
}
