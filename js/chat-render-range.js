// @ts-check
// chat-render-range.js — bounded transcript range state for long conversations.

export const CHAT_RENDER_WINDOW_SIZE = 120;
const CHAT_RENDER_BATCH_SIZE = 120;
/** @type {Map<string, number>} */
const explicitStarts = new Map();

/** @param {string | null | undefined} threadId @param {number} total */
export function getChatRenderStart(threadId, total) {
  const safeTotal = Math.max(0, Math.trunc(total));
  if (!threadId) return Math.max(0, safeTotal - CHAT_RENDER_WINDOW_SIZE);
  const explicit = explicitStarts.get(threadId);
  return explicit === undefined
    ? Math.max(0, safeTotal - CHAT_RENDER_WINDOW_SIZE)
    : Math.min(explicit, safeTotal);
}

/** @param {string | null | undefined} threadId @param {number} total */
export function expandChatRenderWindow(threadId, total) {
  if (!threadId) return 0;
  const start = Math.max(0, getChatRenderStart(threadId, total) - CHAT_RENDER_BATCH_SIZE);
  explicitStarts.set(threadId, start);
  return start;
}

/** @param {string | null | undefined} threadId @param {number} index @param {number} total */
export function revealChatRenderIndex(threadId, index, total) {
  if (!threadId || !Number.isInteger(index) || index < 0 || index >= total) return false;
  const current = getChatRenderStart(threadId, total);
  if (index >= current) return false;
  explicitStarts.set(threadId, Math.max(0, index - 12));
  return true;
}

/** @param {string | null | undefined} [threadId] */
export function resetChatRenderWindow(threadId) {
  if (threadId) explicitStarts.delete(threadId);
  else explicitStarts.clear();
}
