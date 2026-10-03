// chat-discussion-lifecycle.js - cleanup and completion helpers for discussions

import { state } from './state.js';
import {
  getActivePersonality, updateChatHeaderTitle,
} from './chat-personalities.js';
import { saveChatThreadIndex } from './chat-threads.js';
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

// Stored discussion metadata is consumed without normalization.
type DiscussionLifecycleState = { _discussionPersonas?: unknown; _discussionOriginalPersonality?: unknown; currentChatPersonality: unknown };
type DiscussionLifecyclePersona = Parameters<typeof showDiscussContinuePromptUI>[0][number];

export function restoreDiscussionContinuePrompt() {
  const discussionState = getCurrentDiscussionState();
  if (!discussionState) return;
  showDiscussContinuePrompt(discussionState.personas, discussionState.originalPersonality);
}

export function showDiscussContinuePrompt(personas: unknown, originalPersonality: unknown) {
  const thread = getCurrentThread();
  // The UI checks Array.isArray before reading pending rows; this input stays raw.
  /** @type {(personas: Parameters<typeof showDiscussContinuePromptUI>[0], originalPersonality: Parameters<typeof showDiscussContinuePromptUI>[1], options: Omit<NonNullable<Parameters<typeof showDiscussContinuePromptUI>[2]>, 'pendingPersonas'> & { pendingPersonas?: unknown }) => ReturnType<typeof showDiscussContinuePromptUI>} */
  (showDiscussContinuePromptUI)(personas as DiscussionLifecyclePersona[], originalPersonality, {
    pendingPersonas: thread?.discussionPendingPersonas || [],
    onPersist() {
      const currentThread = getCurrentThread();
      if (currentThread) persistDiscussionThreadState(currentThread.id, personas, originalPersonality);
    },
  });
}

export function cleanupDiscussionState({ clearThread = false, markEnded = false }: { clearThread?: unknown; markEnded?: unknown } = {}) {
  removeDiscussContinuePrompt();
  removeDiscussPersonaPicker();
  delete (state as DiscussionLifecycleState)._discussionPersonas;
  delete (state as DiscussionLifecycleState)._discussionOriginalPersonality;

  // Only clear persisted discussion state when the user explicitly ends it.
  // Thread switches and new-thread creation should remove transient UI state
  // without erasing the old thread's Continue prompt metadata.
  clearCurrentDiscussionThreadState({ clearThread, markEnded });
}

export function endDiscussion() {
  const orig = (state as DiscussionLifecycleState)._discussionOriginalPersonality;
  cleanupDiscussionState({ clearThread: true, markEnded: true });
  if (orig) {
    (state as DiscussionLifecycleState).currentChatPersonality = orig;
    (localStorage.setItem as (key: string, value: unknown) => void)(`labcharts-${state.currentProfile}-chatPersonality`, orig);
  }
  const thread = getCurrentThread();
  if (thread) {
    const personality = getActivePersonality();
    thread.personality = state.currentChatPersonality;
    thread.personalityName = personality.name;
    thread.personalityIcon = personality.icon;
    void saveChatThreadIndex();
  }
  updateDiscussButton();
  updateChatHeaderTitle();
  document.getElementById('chat-input')?.focus();
}

export function finishDiscussionRound(personas: unknown, originalPersonality: unknown, threadId: unknown = state.currentThreadId) {
  persistDiscussionThreadState(threadId, personas, originalPersonality);
  if (!isRoundThreadActive(threadId)) return;
  (state as DiscussionLifecycleState).currentChatPersonality = originalPersonality;
  (localStorage.setItem as (key: string, value: unknown) => void)(`labcharts-${state.currentProfile}-chatPersonality`, originalPersonality);
  const thread = getCurrentThread();
  if (thread) {
    const personality = getActivePersonality();
    (thread as { personality: unknown }).personality = originalPersonality;
    thread.personalityName = personality.name;
    thread.personalityIcon = personality.icon;
    void saveChatThreadIndex();
  }
  updateDiscussButton();
  updateChatHeaderTitle();
  if (!getChatAbortController()) {
    showDiscussContinuePrompt(personas, originalPersonality);
  }
}
