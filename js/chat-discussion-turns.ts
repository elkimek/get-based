// chat-discussion-turns.js - discussion round turn execution helpers

import { state } from './state.js';
import {
  runDiscussionRound,
} from './chat-discussion-round-runner.js';
import {
  persistDiscussionPendingPersonas, persistDiscussionThreadState,
} from './chat-discussion-round-state.js';
import {
  buildDiscussionJoinMessage, DISCUSSION_JOIN_PROMPT,
} from './chat-discussion-round-prompts.js';
import { finishDiscussionRound, showDiscussContinuePrompt } from './chat-discussion-lifecycle.js';

export interface DiscussionContinuationOptions { threadId?: unknown; allPersonas?: unknown; deferredPersonas?: unknown; pendingOrder?: unknown; suppressAutoMsg?: unknown }
interface PendingPersonaReader { id?: unknown }

export function mergeDiscussionPendingPersonas(resultRemaining: unknown, deferredPersonas: unknown, pendingOrder: unknown): unknown {
  const remainingIds = new Set([
    ...((resultRemaining || []) as Iterable<PendingPersonaReader>),
    ...((deferredPersonas || []) as Iterable<PendingPersonaReader>),
  ].map(persona => persona.id));
  const order = Array.isArray(pendingOrder)
    ? pendingOrder
    : [...((resultRemaining || []) as Iterable<PendingPersonaReader>), ...((deferredPersonas || []) as Iterable<PendingPersonaReader>)];
  return (order as { filter(callback: (persona: PendingPersonaReader) => unknown): unknown }).filter(persona => remainingIds.has(persona.id));
}

export async function runDiscussionContinuation(personas: unknown, originalPersonality: unknown, text: unknown, opts: DiscussionContinuationOptions = {}) {
  const threadId = opts.threadId || state.currentThreadId;
  const allPersonas = opts.allPersonas || personas;
  const deferredPersonas = Array.isArray(opts.deferredPersonas) ? opts.deferredPersonas : [];
  persistDiscussionThreadState(threadId, allPersonas, originalPersonality);
  persistDiscussionPendingPersonas(threadId, deferredPersonas);
  if (threadId === state.currentThreadId) showDiscussContinuePrompt(allPersonas, originalPersonality);
  const result = await runDiscussionRound(personas, text, {
    suppressAutoMsg: opts.suppressAutoMsg,
    threadId,
  });
  const remainingPersonas = mergeDiscussionPendingPersonas(
    result?.remainingPersonas,
    deferredPersonas,
    opts.pendingOrder,
  );
  persistDiscussionPendingPersonas(threadId, remainingPersonas);
  finishDiscussionRound(allPersonas, originalPersonality, threadId);
  return { ...result, remainingPersonas };
}

export async function runSingleDiscussionTurn(persona: unknown, allPersonas: unknown) {
  const originalPersonality = state.currentChatPersonality;
  const threadId = state.currentThreadId;
  persistDiscussionThreadState(threadId, allPersonas, originalPersonality);
  (state as { chatHistory: unknown[] }).chatHistory.push(buildDiscussionJoinMessage(persona as { name: unknown; icon?: unknown }));
  showDiscussContinuePrompt(allPersonas, originalPersonality);
  const result = await runDiscussionRound([persona], DISCUSSION_JOIN_PROMPT, { hideAutoMsg: true, threadId });
  persistDiscussionPendingPersonas(threadId, result?.remainingPersonas || []);
  finishDiscussionRound(allPersonas, originalPersonality, threadId);
}

export async function runDiscussion(personas: unknown) {
  const originalPersonality = state.currentChatPersonality;
  const threadId = state.currentThreadId;
  await runDiscussionContinuation(personas, originalPersonality, null, { threadId });
}
