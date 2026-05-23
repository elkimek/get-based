// chat-discussion-lifecycle.js - cleanup and completion helpers for discussions

import { state } from './state.js';
import {
  updateChatHeaderTitle,
} from './chat-personalities.js';
import {
  clearCurrentDiscussionThreadState, getCurrentDiscussionState, getCurrentThread,
} from './chat-discussion-state.js';
import {
  getChatAbortController,
} from './chat-discussion-callbacks.js';
import {
  removeDiscussContinuePrompt, removeDiscussPersonaPicker,
  showDiscussContinuePrompt as showDiscussContinuePromptUI, updateDiscussButton,
} from './chat-discussion-ui.js';
import {
  isRoundThreadActive, persistDiscussionThreadState,
} from './chat-discussion-round-state.js';

export function restoreDiscussionContinuePrompt() {
  const discussionState = getCurrentDiscussionState();
  if (!discussionState) return;
  showDiscussContinuePrompt(discussionState.personas, discussionState.originalPersonality);
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

export function endDiscussion() {
  const orig = state._discussionOriginalPersonality;
  cleanupDiscussionState({ clearThread: true, markEnded: true });
  if (orig) {
    state.currentChatPersonality = orig;
    localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, orig);
  }
  updateDiscussButton();
}

export function finishDiscussionRound(personas, originalPersonality, threadId = state.currentThreadId) {
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
