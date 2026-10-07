// Discussion metadata and presentation stay bound to the originating conversation.
import { state } from './state.js';
import { saveChatThreadIndex } from './chat-threads.js';
import { saveChatHistory } from './chat-history.js';
import { captureDiscussionOrigin, type DiscussionOrigin } from './chat-discussion-origin.js';

export function isRoundThreadActive(threadId?: unknown, origin?: DiscussionOrigin): boolean {
  return origin ? origin.threadId === threadId && origin.isActive() : !threadId || state.currentThreadId === threadId;
}
function getThreadById(threadId: unknown, origin?: DiscussionOrigin) {
  if (origin && (origin.threadId !== threadId || !origin.isValid())) return null;
  return state.chatThreads.find(thread => thread.id === threadId) || null;
}
export function persistDiscussionThreadState(threadId: unknown, personas: unknown, originalPersonality: unknown, origin?: DiscussionOrigin): void {
  const thread = getThreadById(threadId, origin);
  if (!thread) return;
  (thread as { discussionPersonas: unknown }).discussionPersonas = personas;
  (thread as { discussionOriginalPersonality: unknown }).discussionOriginalPersonality = originalPersonality;
  delete thread.discussionEnded;
  void saveChatThreadIndex();
}
export function persistDiscussionPendingPersonas(threadId: unknown, personas: unknown, origin?: DiscussionOrigin): void {
  const thread = getThreadById(threadId, origin);
  if (!thread) return;
  if (Array.isArray(personas) && personas.length) (thread as { discussionPendingPersonas: unknown[] }).discussionPendingPersonas = personas;
  else delete thread.discussionPendingPersonas;
  void saveChatThreadIndex();
}
export function renderRoundMessages(threadId: unknown, messages: unknown[], renderMessages: (options?: { preserveScroll?: boolean }) => unknown = () => {}, origin?: DiscussionOrigin): void {
  if (!isRoundThreadActive(threadId, origin)) return;
  if (!origin) (state as { chatHistory: unknown[] }).chatHistory = messages;
  renderMessages({ preserveScroll: true });
}
export async function saveRoundChatHistory(threadId: unknown, messages: unknown[], origin?: DiscussionOrigin): Promise<boolean> {
  if (!threadId) return false;
  if (!origin && isRoundThreadActive(threadId)) (state as { chatHistory: unknown[] }).chatHistory = messages;
  const captured = origin || captureDiscussionOrigin(threadId, messages as typeof state.chatHistory);
  if (!captured.isValid()) return false;
  return saveChatHistory({
    threadId: threadId as typeof state.currentThreadId,
    history: messages as typeof state.chatHistory,
    current: () => captured.isValid(),
    preservePersonality: true,
  });
}
