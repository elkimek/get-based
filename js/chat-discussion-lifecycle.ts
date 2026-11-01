// chat-discussion-lifecycle.js - cleanup and completion helpers for discussions

import { state } from './state.js';
import { captureDiscussionOrigin, type DiscussionOrigin } from './chat-discussion-origin.js';
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
  const origin = captureDiscussionOrigin(thread?.id);
  // The UI checks Array.isArray before reading pending rows; this input stays raw.
  /** @type {(personas: Parameters<typeof showDiscussContinuePromptUI>[0], originalPersonality: Parameters<typeof showDiscussContinuePromptUI>[1], options: Omit<NonNullable<Parameters<typeof showDiscussContinuePromptUI>[2]>, 'pendingPersonas'> & { pendingPersonas?: unknown }) => ReturnType<typeof showDiscussContinuePromptUI>} */
  (showDiscussContinuePromptUI)(personas as DiscussionLifecyclePersona[], originalPersonality, {
    pendingPersonas: thread?.discussionPendingPersonas || [],
    onPersist() {
      if (thread && origin.isActive()) persistDiscussionThreadState(thread.id, personas, originalPersonality, origin);
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
  const origin = captureDiscussionOrigin(), root = state.importedData;
  const thread = getCurrentThread();
  if (!thread || thread.discussionEnded) return Promise.resolve(false);
  const fields = ['discussionPersonas', 'discussionOriginalPersonality', 'discussionPendingPersonas', 'discussionEnded', 'personality', 'personalityName', 'personalityIcon'] as const;
  const previous = Object.fromEntries(fields.map(field => [field, thread[field]]));
  const oldPersonality = state.currentChatPersonality;
  const personalityKey = `labcharts-${state.currentProfile}-chatPersonality`, oldStoredPersonality = localStorage.getItem(personalityKey);
  const orig = (state as DiscussionLifecycleState)._discussionOriginalPersonality;
  // Keep the discussion controls visible until the locked index save commits.
  // Closing a page as soon as the controls disappear must not lose this action.
  clearCurrentDiscussionThreadState({ clearThread: true, markEnded: true, persist: false });
  if (orig) {
    (state as DiscussionLifecycleState).currentChatPersonality = orig;
    (localStorage.setItem as (key: string, value: unknown) => void)(`labcharts-${state.currentProfile}-chatPersonality`, orig);
  }
  if (thread) {
    const personality = getActivePersonality();
    thread.personality = state.currentChatPersonality;
    thread.personalityName = personality.name;
    thread.personalityIcon = personality.icon;
  }
  const expected = fields.map(field => thread[field]), expectedPersonality = state.currentChatPersonality;
  return Promise.resolve(saveChatThreadIndex()).then(saved => {
    if (!origin.isActive() || state.importedData !== root || fields.some((field, index) => thread[field] !== expected[index])) return false;
    if (!saved) {
      for (const field of fields) {
        if (previous[field] === undefined) delete thread[field];
        else (thread as Record<string, unknown>)[field] = previous[field];
      }
      if (state.currentChatPersonality === expectedPersonality) {
        state.currentChatPersonality = oldPersonality;
        if (oldStoredPersonality === null) localStorage.removeItem(personalityKey);
        else localStorage.setItem(personalityKey, oldStoredPersonality);
      }
      return false;
    }
    cleanupDiscussionState();
    updateDiscussButton(); updateChatHeaderTitle();
    document.getElementById('chat-input')?.focus();
    return true;
  });
}

export function finishDiscussionRound(personas: unknown, originalPersonality: unknown, threadId: unknown = state.currentThreadId, origin?: DiscussionOrigin) {
  persistDiscussionThreadState(threadId, personas, originalPersonality, origin);
  if (!isRoundThreadActive(threadId, origin) || getChatAbortController()) return;
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
