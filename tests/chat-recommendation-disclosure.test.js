import { describe, expect, it } from 'vitest';

import {
  getRecommendationDisclosureState,
  recommendationSummaryHTML,
} from '../js/chat-recommendation-disclosure.js';

describe('chat recommendation disclosure', () => {
  it('keeps the first recommendation block collapsed with a discovery cue', () => {
    expect(getRecommendationDisclosureState([], ['sleep.light', 'sleep.light']))
      .toEqual({ count: 1, open: false, isNew: true });
  });

  it('keeps repeated recommendations collapsed without a new cue', () => {
    const history = [{ role: 'assistant', recSlots: ['sleep.light', 'sleep.blackout'] }];
    expect(getRecommendationDisclosureState(history, ['sleep.blackout', 'sleep.light']))
      .toEqual({ count: 2, open: false, isNew: false });
  });

  it('marks materially changed recommendations as new but collapsed', () => {
    const history = [{ role: 'assistant', recSlots: ['sleep.light'] }];
    expect(getRecommendationDisclosureState(history, ['sleep.blackout']))
      .toEqual({ count: 1, open: false, isNew: true });
  });

  it('builds a concise count and optional new badge', () => {
    expect(recommendationSummaryHTML(1)).toContain('See <span class="rec-chat-count">1 helpful suggestion');
    expect(recommendationSummaryHTML(3, true)).toContain('3 helpful suggestions');
    expect(recommendationSummaryHTML(3, true)).toContain('rec-chat-new');
  });
});
