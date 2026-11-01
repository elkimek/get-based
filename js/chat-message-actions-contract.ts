import { canDiscloseLabOverlays } from './lab-overlay-policy.js';
import type { state } from './state.js';
type ChatMessage = (typeof state.chatHistory)[number];
import { projectAgentDraftCards, type AgentDraftCard } from './agent-draft-presentation.js';
import { normalizeAppControls, type AppControlRecord } from '../shared/agent-control-contract.js';
import { chatReviewLifecycle } from '../shared/chat-review-contract.js';
export type ChatReviewView = { kind: 'data'; card: AgentDraftCard; lifecycle: ReturnType<typeof chatReviewLifecycle> }
  | { kind: 'app'; control: AppControlRecord; lifecycle: ReturnType<typeof chatReviewLifecycle> };
import { canDiscloseLabOrdering } from './lab-ordering-policy.js';
import { chatAppControlAllowed } from '../shared/chat-control-policy.js';
export interface ChatMessageActionsView {
  index: number;
  kind: 'user' | 'assistant';
  retry: { action: 'regenerate-last-message' | 'retry-discussion-participant'; label: string; title: string; personaId?: string | undefined } | null;
  resume: boolean;
  speech: boolean;
  context: { label: string; detail: string | null }[];
  reviews: ChatReviewView[];
}
export function latestVisibleUserMessageIndex(history: readonly ChatMessage[]): number {
  return history.findLastIndex(message => message.role === 'user' && !message.hidden && !message.joined);
}
export function projectChatMessageActions(history: readonly ChatMessage[], index: number): ChatMessageActionsView | null {
  const message = history[index];
  if (!message) return null;
  if (message.role === 'user') {
    if (message.hidden || message.joined || message.hasImages || index !== latestVisibleUserMessageIndex(history)) return null;
    return { index, kind: 'user', retry: null, resume: false, speech: false, context: [], reviews: [] };
  }
  if (message.role !== 'assistant') return null;
  const last = index === history.length - 1;
  let retry: ChatMessageActionsView['retry'] = null;
  if (last && message.discussionError && message.discussionPersonaId) {
    retry = { action: 'retry-discussion-participant', personaId: String(message.discussionPersonaId), label: `Retry ${message.personalityName || 'participant'}`, title: 'Retry only this participant' };
  } else if (last && !message.discussionError && !message.discussion) {
    const interrupted = message.stopped || message.error;
    retry = { action: 'regenerate-last-message', label: interrupted ? 'Retry' : 'Regenerate', title: interrupted ? 'Retry response' : 'Regenerate response' };
  }
  const reviews: ChatReviewView[] = [
    ...projectAgentDraftCards(message).map(card => ({ kind: 'data' as const, card, lifecycle: chatReviewLifecycle(card.status, card.nativeOnly) })),
    ...normalizeAppControls(message.appControls, true).filter(record => (record.action !== 'labs.ordering' || canDiscloseLabOrdering(record)) && (record.action !== 'labs.overlays' || canDiscloseLabOverlays(record)))
      .map(control => ({ kind: 'app' as const, control, lifecycle: chatReviewLifecycle(control.status, !chatAppControlAllowed(control.action, control.parameters)) })),
  ];
  return {
    index, kind: 'assistant', retry, resume: last && !!message.discussionError, speech: !message.error,
    context: Array.isArray(message.context) ? message.context.map(area => ({ label: String(area.label), detail: area.detail ? String(area.detail) : null })) : [],
    reviews,
  };
}
export type ChatCopyMode = 'idle' | 'copied' | 'failed' | 'unsupported';
export const CHAT_COPY_LABELS: Record<ChatCopyMode, string> = { idle: 'Copy', copied: 'Copied', failed: 'Failed', unsupported: 'Not supported' };
