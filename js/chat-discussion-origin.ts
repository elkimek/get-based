import { state } from './state.js';

export interface DiscussionOrigin {
  profileId: typeof state.currentProfile;
  threadId: unknown;
  history: typeof state.chatHistory;
  thread: (typeof state.chatThreads)[number] | undefined;
  isValid(): boolean;
  isActive(): boolean;
  retire(): void;
  watch(changed: () => void): () => void;
}

/** A round may finish in a background conversation, but never in a replacement profile/history. */
export function captureDiscussionOrigin(threadId: unknown = state.currentThreadId, history = state.chatHistory): DiscussionOrigin {
  const profileId = state.currentProfile;
  const thread = state.chatThreads.find(item => item.id === threadId);
  let retired = false;
  const origin: DiscussionOrigin = {
    profileId, threadId, history, thread,
    isValid() {
      if (profileId !== state.currentProfile
        || (thread && !state.chatThreads.includes(thread))
        || (threadId === state.currentThreadId && history !== state.chatHistory)) retired = true;
      return !retired;
    },
    isActive() { return origin.isValid() && threadId === state.currentThreadId && history === state.chatHistory; },
    retire() { retired = true; },
    watch(changed) {
      const profileChanged = () => { origin.retire(); changed(); };
      const observer = new MutationObserver(changed);
      globalThis.addEventListener('labcharts-profile-switched', profileChanged);
      document.addEventListener('chat-thread-changed', changed);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      return () => {
        observer.disconnect();
        globalThis.removeEventListener('labcharts-profile-switched', profileChanged);
        document.removeEventListener('chat-thread-changed', changed);
      };
    },
  };
  return origin;
}
