// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {getHostedTransition} from '../shared/hosted-transition.js';
const config = vi.hoisted(() => ({official: true}));
vi.mock('../shared/hosted-transition.js', async load => {
  const actual = await load<typeof import('../shared/hosted-transition.js')>();
  return {...actual, getHostedTransition: () => config.official ? actual.getHostedTransition('https://app.getbased.health', Date.now(), {
    announcedAt: '2026-11-12T00:00:00Z', announcementUrl: null, demoUrl: null,
  }) : null};
});
import {watchHostedTransitionCutoff} from '../js/hosted-transition-monitor.js';
let stop: (() => void) | undefined;
beforeEach(() => {vi.useFakeTimers(); config.official = true; vi.setSystemTime(Date.parse('2026-12-11T23:59:59Z'));});
afterEach(() => {stop?.(); stop = undefined; vi.useRealTimers(); vi.restoreAllMocks();});
it('checks the exact wall-clock cutoff and retires every timer after one handoff', () => {
  const cutoff = vi.fn(); stop = watchHostedTransitionCutoff(cutoff);
  expect(getHostedTransition('ignored')?.phase).toBe('notice');
  vi.advanceTimersByTime(999); expect(cutoff).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(cutoff).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(120_000); expect(cutoff).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});
it.each(['visibilitychange', 'pageshow', 'focus'])('catches suspended time when %s resumes without waiting for a timer', event => {
  const cutoff = vi.fn(); stop = watchHostedTransitionCutoff(cutoff);
  vi.setSystemTime(Date.parse('2026-12-13T00:00:00Z'));
  (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event));
  expect(cutoff).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});
it('never starts monitoring independent self-hosted deployments', () => {
  config.official = false; const cutoff = vi.fn(); stop = watchHostedTransitionCutoff(cutoff);
  vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000); expect(cutoff).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
