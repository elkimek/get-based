// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PendingHostTool } from '../lib/agent-host-turn-state.js';
import { cancelPendingHostTools } from '../lib/agent-host-turn-state.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it.each(['shared', 'per_request'] as const)('preserves live maps and %s result identity during reentrant cancellation', mode => {
  const shared = { success: false };
  const result = () => mode === 'shared' ? shared : { success: false };
  const received: unknown[] = [];
  const original = new Map<string, PendingHostTool>();
  let current = original;
  const replacementRespond = vi.fn();
  const replacement = new Map<string, PendingHostTool>([['second', {
    threadId: 'active', timer: setTimeout(() => {}, 60_000), respond: replacementRespond,
  }]]);
  const entry = (respond: PendingHostTool['respond'], threadId = 'active'): PendingHostTool => ({
    threadId, timer: setTimeout(() => {}, 60_000), respond,
  });
  original.set('first', entry(value => {
    expect(original.has('first')).toBe(false);
    received.push(value);
    original.set('appended', entry(value => { received.push(value); }));
    current = replacement;
  }));
  original.set('second', entry(value => { received.push(value); }));
  const unrelated = entry(vi.fn(), 'another');
  original.set('unrelated', unrelated);

  cancelPendingHostTools(() => current, () => 'active', result);

  expect(received).toHaveLength(3);
  expect(received[0] === received[1]).toBe(mode === 'shared');
  expect(received[1] === received[2]).toBe(mode === 'shared');
  expect([...original.keys()]).toEqual(['second', 'unrelated', 'appended']);
  expect(replacement.size).toBe(0);
  expect(replacementRespond).not.toHaveBeenCalled();
  expect(unrelated.respond).not.toHaveBeenCalled();
  // The replacement entry was deleted but never settled; its timer and the
  // unrelated original timer retain the pre-existing live-map semantics.
  expect(vi.getTimerCount()).toBe(2);
});

it.each(['respond', 'result'] as const)('continues cancellation after a %s exception', failure => {
  const respond = vi.fn(() => { if (failure === 'respond') throw new Error('adapter closed'); });
  const result = vi.fn(() => { if (failure === 'result') throw new Error('result failed'); return {}; });
  const pending = new Map<string, PendingHostTool>(['first', 'second'].map(id => [id, {
    threadId: 'active', timer: setTimeout(() => {}, 60_000), respond,
  }]));

  cancelPendingHostTools(() => pending, () => 'active', result);

  expect(result).toHaveBeenCalledTimes(2);
  expect(respond).toHaveBeenCalledTimes(failure === 'respond' ? 2 : 0);
  expect(pending.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
