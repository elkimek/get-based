import { describe, expect, it } from 'vitest';
import { createChatTurnOutcome, hasChatTurnOutcome, chatTurnFailureNotice, MAX_CHAT_DATA_REVIEWS, MAX_CHAT_APP_REVIEWS } from '../shared/chat-turn-outcome.js';
import { captureChatTurnFailure, getChatTurnRecovery } from '../js/chat-turn-recovery.js';
import type { AgentDraft } from '../js/agent-tool-runtime.js';

describe('verified chat turn outcomes', () => {
  it('starts empty and never invents a saved outcome', () => {
    const turn = createChatTurnOutcome(); expect(hasChatTurnOutcome(turn.snapshot())).toBe(false);
    expect(chatTurnFailureNotice(turn.snapshot())).toBe('The response could not finish.');
  });
  it('retains exact review IDs, deduplicates them and returns independent bounded snapshots', () => {
    const turn = createChatTurnOutcome();
    turn.review('one', 'context', 'healthGoals'); turn.review('one', 'context', 'healthGoals');
    turn.review('../invalid', 'data', 'meals'); turn.review('bad-target', 'app', 'private text');
    expect(turn.snapshot().reviews).toEqual([{ id: 'one', kind: 'context', target: 'healthGoals' }]);
    const copy = turn.snapshot(); copy.reviews[0]!.target = 'changed'; copy.reviews.push({ id: 'fake', kind: 'app', target: 'display.preferences' });
    expect(turn.snapshot().reviews).toEqual([{ id: 'one', kind: 'context', target: 'healthGoals' }]);
    for (let i = 0; i < 40; i++) turn.review(`r-${i}`, 'data', 'meals');
    expect(turn.snapshot().reviews).toHaveLength(MAX_CHAT_DATA_REVIEWS + MAX_CHAT_APP_REVIEWS);
  });
  it('retains confirmed effects across later failures without storing tool values', () => {
    const turn = createChatTurnOutcome(); turn.navigation({ settingsSaved: true, dataSaved: false, opened: 'labs', privateValue: 'PRIVATE_SENTINEL' });
    turn.navigation({ settingsSaved: false, dataSaved: false, opened: null }); turn.unconfirmed();
    expect(turn.snapshot()).toEqual({ reviews: [], settingsSaved: true, dataSaved: false, viewOpened: true, unconfirmedCommand: true });
    const notice = chatTurnFailureNotice(turn.snapshot());
    expect(notice).toContain('App preferences were saved'); expect(notice).toContain('unconfirmed outcome');
    expect(notice).not.toContain('No change'); expect(JSON.stringify(turn.snapshot())).not.toContain('PRIVATE_SENTINEL');
  });
  it('records only explicit effect booleans and distinguishes proposals from saved data', () => {
    const turn = createChatTurnOutcome(); turn.navigation({ settingsSaved: 'true', dataSaved: 1, changed: true });
    expect(hasChatTurnOutcome(turn.snapshot())).toBe(false);
    turn.review('review', 'data', 'meals');
    expect(chatTurnFailureNotice(turn.snapshot(), true)).toBe('Response stopped. 1 proposal remains available for review. Proposed changes require Apply.');
    expect(turn.snapshot().dataSaved).toBe(false);
  });
});

const draft: AgentDraft = { id: 'review', kind: 'context', summary: 'Review', status: 'pending', payload: { card: 'healthGoals', baseline: '[]', changes: [{ field: 'goals', operation: 'add', record: { text: 'Improve sleep' } }], reason: 'User goal.', evidence: 'I want to improve sleep.' } };
it('attaches real pending reviews to a local failure without giving imported error objects authority', () => {
  const turn = createChatTurnOutcome(); turn.review(draft.id, 'context', 'healthGoals');
  const failure = captureChatTurnFailure(new Error('Network'), { getDrafts: () => [draft], getOutcome: turn.snapshot }, 'origin', () => true);
  expect(failure).toMatchObject({ name: 'ChatTurnError' });
  expect(getChatTurnRecovery(failure)).toEqual({ content: 'The response could not finish. 1 proposal remains available for review. Proposed changes require Apply.', agentDrafts: [{ ...draft, profileId: 'origin' }], error: true });
  expect(getChatTurnRecovery({ ...(failure as Error), agentDrafts: [draft] })).toBeUndefined();
});
it('keeps ordinary errors unchanged and withholds recovery after ownership retirement', () => {
  const turn = createChatTurnOutcome(), error = new Error('Network');
  expect(captureChatTurnFailure(error, { getDrafts: () => [], getOutcome: turn.snapshot }, 'origin', () => true)).toBe(error);
  turn.review(draft.id, 'context', 'healthGoals');
  expect(captureChatTurnFailure(error, { getDrafts: () => [draft], getOutcome: turn.snapshot }, 'origin', () => false)).toBe(error);
  expect(getChatTurnRecovery(error)).toBeUndefined();
});
it('preserves cancellation identity while retaining already prepared reviews', () => {
  const turn = createChatTurnOutcome(); turn.review(draft.id, 'context', 'healthGoals');
  const failure = captureChatTurnFailure(new DOMException('Cancelled', 'AbortError'), { getDrafts: () => [draft], getOutcome: turn.snapshot }, 'origin', () => true);
  expect(failure).toMatchObject({ name: 'AbortError' }); expect(getChatTurnRecovery(failure)?.stopped).toBe(true);
});

it('rechecks ownership when reading a previously captured recovery', () => {
  const turn = createChatTurnOutcome(); turn.review(draft.id, 'context', 'healthGoals'); let current = true;
  const failure = captureChatTurnFailure(new Error('Network'), { getDrafts: () => [draft], getOutcome: turn.snapshot }, 'origin', () => current);
  expect(getChatTurnRecovery(failure)).toBeDefined(); current = false; expect(getChatTurnRecovery(failure)).toBeUndefined();
});

it('counts only still-pending review IDs while preserving superseded cards in history', async () => {
  const { projectChatTurnReviews } = await import('../js/chat-turn-recovery.js');
  const second = { ...draft, id: 'new-review' }, turn = createChatTurnOutcome();
  turn.review(draft.id, 'context', 'healthGoals'); turn.review(second.id, 'context', 'healthGoals');
  const runtime = { getDrafts: () => [draft, second], getOutcome: turn.snapshot };
  const projected = projectChatTurnReviews(runtime, 'origin');
  expect(projected.agentDrafts.map(card => [card.id, card.status])).toEqual([[draft.id, 'superseded'], [second.id, 'pending']]);
  expect(projected.outcome.reviews).toEqual([{ id: second.id, kind: 'context', target: 'healthGoals' }]);
  const failure = captureChatTurnFailure(new Error('Network'), runtime, 'origin', () => true);
  expect(getChatTurnRecovery(failure)?.content).toContain('1 proposal remains');
  expect(getChatTurnRecovery(failure)?.agentDrafts).toHaveLength(2);
  expect(draft.status).toBe('pending');
});
