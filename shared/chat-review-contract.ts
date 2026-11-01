import { claimsPreparedChatProposal, CHAT_PROPOSAL_MISSING, CHAT_PROPOSAL_NONE } from './chat-tool-instructions.js';
import type { ChatReviewReference } from './chat-turn-outcome.js';

/** Common presentation only. Domain owners retain validation, Apply and Undo authority. */
export function chatReviewLifecycle(status: string, nativeOnly = false) {
  if (nativeOnly) return { phase: 'inactive', label: 'Managed in native UI', canReview: false } as const;
  switch (status) {
    case 'pending': return { phase: 'pending', label: 'Review required', canReview: true } as const;
    case 'applying': return { phase: 'applying', label: 'Change in progress', canReview: false } as const;
    case 'applied': case 'changed': return { phase: 'saved', label: 'Saved', canReview: false } as const;
    case 'discarded': return { phase: 'inactive', label: 'Discarded', canReview: false } as const;
    case 'undone': return { phase: 'inactive', label: 'Undone', canReview: false } as const;
    case 'superseded': return { phase: 'inactive', label: 'Replaced by a newer proposal', canReview: false } as const;
    case 'expired': return { phase: 'inactive', label: 'Review expired', canReview: false } as const;
    case 'conflict': return { phase: 'conflict', label: 'Changed since review', canReview: false } as const;
    default: return { phase: 'unconfirmed', label: 'Outcome unconfirmed', canReview: false } as const;
  }
}
/** These checks may request one bounded repair; model prose never supplies review IDs. */
export function needsChatReviewRepair(text: string, reviews: readonly ChatReviewReference[], requested = false): boolean {
  return !reviews.length && (requested || claimsPreparedChatProposal(text));
}
export function chatReviewCompletionText(text: string, reviews: readonly ChatReviewReference[], requested: boolean, toolCount: number): string {
  if (!needsChatReviewRepair(text, reviews, requested)) return text;
  return claimsPreparedChatProposal(text, requested) || !toolCount ? CHAT_PROPOSAL_MISSING : `${CHAT_PROPOSAL_NONE}\n\n${text}`;
}
export function chatPreparedReviewNotice(reviews: readonly ChatReviewReference[]): string {
  return reviews.length ? `Review the ${reviews.length === 1 ? 'proposal' : `${reviews.length} proposals`} below. Changes require Apply.` : CHAT_PROPOSAL_MISSING;
}
