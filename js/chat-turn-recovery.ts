import { chatTurnFailureNotice, hasChatTurnOutcome, type ChatTurnOutcome } from '../shared/chat-turn-outcome.js';
import type { AgentDraft } from './agent-tool-runtime.js';
import { normalizeChatMessages, type StoredChatMessage } from './chat-storage-safety.js';

interface RecoverableRuntime { getDrafts(): AgentDraft[]; getOutcome(): ChatTurnOutcome }
export interface ChatTurnReviewDraft extends Omit<AgentDraft, 'status'> {
  profileId: string; status: NonNullable<StoredChatMessage['agentDrafts']>[number]['status'];
}
export interface ChatTurnRecovery {
  content: string;
  agentDrafts: ChatTurnReviewDraft[];
  stopped?: true;
  error?: true;
}
/** Reuse the saved-history contract, including bounds and superseded reviews. */
export function projectChatTurnReviews(runtime: RecoverableRuntime, profileId: string) {
  const normalized = normalizeChatMessages([{ role: 'assistant', content: '', agentDrafts: runtime.getDrafts().map(draft => ({ ...draft, profileId })) }])[0]?.agentDrafts || [];
  const agentDrafts: ChatTurnReviewDraft[] = normalized.map(draft => ({ ...draft, payload: { ...draft.payload } }));
  const pending = new Set(agentDrafts.filter(draft => draft.status === 'pending').map(draft => draft.id));
  const outcome = runtime.getOutcome();
  return { agentDrafts, outcome: { ...outcome, reviews: outcome.reviews.filter(review => review.kind === 'app' || pending.has(review.id)) } };
}
// Only a live local tool runtime can create recovery authority. Imported error
// objects, conversation data and provider messages cannot forge this attachment.
const recoveries = new WeakMap<object, { recovery: ChatTurnRecovery; current: () => boolean }>();
export function captureChatTurnFailure(error: unknown, runtime: RecoverableRuntime, profileId: string, current: () => boolean, signal?: AbortSignal): unknown {
  if (!current()) return error;
  const { agentDrafts, outcome } = projectChatTurnReviews(runtime, profileId);
  if (!hasChatTurnOutcome(outcome)) return error;
  const stopped = signal?.aborted === true || error instanceof Error && error.name === 'AbortError';
  const failure = new Error(chatTurnFailureNotice(outcome, stopped));
  failure.name = stopped ? 'AbortError' : 'ChatTurnError';
  recoveries.set(failure, { current, recovery: { content: failure.message, agentDrafts, ...(stopped ? { stopped: true as const } : { error: true as const }) } });
  return failure;
}
export function getChatTurnRecovery(error: unknown): ChatTurnRecovery | undefined {
  const entry = error && typeof error === 'object' ? recoveries.get(error) : undefined;
  return entry?.current() ? entry.recovery : undefined;
}
