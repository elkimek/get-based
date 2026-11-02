import { expect, it } from 'vitest';
import { chatReviewLifecycle, chatPreparedReviewNotice, needsChatReviewRepair, chatReviewCompletionText } from '../shared/chat-review-contract.js';
import { CHAT_PROPOSAL_MISSING } from '../shared/chat-tool-instructions.js';
import type { ChatReviewReference } from '../shared/chat-turn-outcome.js';

it.each(['applying', 'applied', 'changed', 'discarded', 'undone', 'superseded', 'expired', 'conflict', 'failed', 'unknown', ''])('does not offer Apply for the %s lifecycle', status => {
  expect(chatReviewLifecycle(status).canReview).toBe(false);
});
it('keeps retired historical proposals inactive even if their stored status says pending', () => {
  expect(chatReviewLifecycle('pending', true)).toEqual({ phase: 'inactive', label: 'Managed in native UI', canReview: false });
  expect(chatReviewLifecycle('pending').canReview).toBe(true);
});
it('uses actual IDs for the local review notice and cannot derive a review from model prose', () => {
  const text = 'Here are the proposal cards for your review. Apply in getbased.';
  expect(needsChatReviewRepair(text, [])).toBe(true);
  expect(chatReviewCompletionText(text, [], false, 3)).toBe(CHAT_PROPOSAL_MISSING);
  expect(chatPreparedReviewNotice([])).toBe(CHAT_PROPOSAL_MISSING);
  const reviews: ChatReviewReference[] = [{ id: 'actual-context', kind: 'context', target: 'sleep' }, { id: 'actual-app', kind: 'app', target: 'display.preferences' }];
  expect(chatPreparedReviewNotice(reviews)).toBe('Review the 2 proposals below. Changes require Apply.');
  expect(needsChatReviewRepair('Please review.', reviews, true)).toBe(false);
  expect(chatReviewCompletionText('Your sleep question still matters.', reviews, true, 4)).toBe('Your sleep question still matters.');
});
