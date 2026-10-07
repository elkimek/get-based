// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getRecommendationDisclosureState,
  recommendationSummaryHTML,
  startRecommendationAttention,
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

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe('recommendation attention lifetime', () => {
  function fixture() {
    const wrapper = document.createElement('details');
    wrapper.className = 'rec-chat-wrapper rec-chat-unseen';
    wrapper.innerHTML = '<summary class="rec-chat-summary">Suggestions</summary>';
    document.body.appendChild(wrapper);
    const frames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.set(1, callback); return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
    let emit: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { emit = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    return { wrapper, frames, disconnect, visible() { emit?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver); } };
  }
  it('cancels a queued pulse and observer when a view retires', () => {
    const view = fixture();
    const dispose = startRecommendationAttention(view.wrapper);
    view.visible();
    expect(view.frames.size).toBe(1);
    dispose();
    expect(view.frames.size).toBe(0);
    expect(view.disconnect).toHaveBeenCalled();
    view.visible();
    expect(view.frames.size).toBe(0);
    expect(view.wrapper.classList.contains('rec-chat-attention')).toBe(false);
  });
  it('clears a completed pulse and removes its listener on retirement', () => {
    const view = fixture();
    const dispose = startRecommendationAttention(view.wrapper);
    view.visible(); view.frames.get(1)!(0);
    expect(view.wrapper.classList.contains('rec-chat-attention')).toBe(true);
    view.wrapper.querySelector('summary')!.dispatchEvent(new Event('animationend'));
    expect(view.wrapper.classList.contains('rec-chat-attention')).toBe(false);
    dispose();
  });
  it('does not pulse a disconnected view', () => {
    const view = fixture();
    const dispose = startRecommendationAttention(view.wrapper);
    view.visible(); view.wrapper.remove(); view.frames.get(1)!(0);
    expect(view.wrapper.classList.contains('rec-chat-attention')).toBe(false);
    dispose();
  });
  it('does not allocate attention work when reduced motion is requested', () => {
    const view = fixture();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const dispose = startRecommendationAttention(view.wrapper);
    view.visible();
    expect(view.frames.size).toBe(0);
    expect(view.disconnect).not.toHaveBeenCalled();
    dispose();
  });
});
