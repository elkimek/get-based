import { describe, expect, it } from 'vitest';

import { mergeDiscussionPendingPersonas } from '../js/chat-discussion-turns.js';

describe('single-participant discussion retry', () => {
  it('preserves deferred participants and the original pending order after success', () => {
    const house = { id: 'house' };
    const coach = { id: 'custom_coach' };
    const researcher = { id: 'longevity' };
    expect(mergeDiscussionPendingPersonas([], [coach, researcher], [house, coach, researcher]))
      .toEqual([coach, researcher]);
  });

  it('keeps the selected participant pending when its isolated retry fails again', () => {
    const house = { id: 'house' };
    const coach = { id: 'custom_coach' };
    expect(mergeDiscussionPendingPersonas([house], [coach], [house, coach]))
      .toEqual([house, coach]);
  });
});
