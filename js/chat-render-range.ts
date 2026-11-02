// chat-render-range.js — bounded transcript range state for long conversations.

export const CHAT_RENDER_WINDOW_SIZE = 120;
const CHAT_RENDER_BATCH_SIZE = 120;
const explicitStarts = new Map<string, number>();

export function getChatRenderStart(threadId: string | null | undefined, total: number, visibleStart?: number): number {
  const safeTotal = Math.max(0, Math.trunc(total));
  const explicit = threadId ? explicitStarts.get(threadId) : undefined;
  const start = explicit === undefined ? Math.max(0, safeTotal - CHAT_RENDER_WINDOW_SIZE) : Math.min(explicit, safeTotal);
  // Retain visible messages while reading; do not turn this into a persistent expansion.
  return typeof visibleStart === 'number' && Number.isFinite(visibleStart)
    ? Math.min(start, Math.max(0, Math.trunc(visibleStart))) : start;
}

export function expandChatRenderWindow(threadId: string | null | undefined, total: number, visibleStart?: number): number {
  if (!threadId) return 0;
  const start = Math.max(0, getChatRenderStart(threadId, total, visibleStart) - CHAT_RENDER_BATCH_SIZE);
  explicitStarts.set(threadId, start);
  return start;
}

export function revealChatRenderIndex(threadId: string | null | undefined, index: number, total: number): boolean {
  if (!threadId || !Number.isInteger(index) || index < 0 || index >= total) return false;
  const current = getChatRenderStart(threadId, total);
  if (index >= current) return false;
  explicitStarts.set(threadId, Math.max(0, index - 12));
  return true;
}

export function resetChatRenderWindow(threadId?: string | null): void {
  if (threadId) explicitStarts.delete(threadId);
  else explicitStarts.clear();
}
