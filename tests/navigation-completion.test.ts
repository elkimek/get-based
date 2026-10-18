import {expect, it, vi} from 'vitest';
import {createNavigationCompletionTracker} from '../js/navigation-completion.js';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}

it('returns every synchronous value and native Promise by exact identity and invokes navigation once', () => {
  const tracker = createNavigationCompletionTracker();
  const opaque = {}, callback = vi.fn(() => opaque), pending = deferred<object>();
  expect(tracker.run(callback)).toBe(opaque);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(tracker.completeInitial(opaque)).toBe(opaque);
  expect(tracker.run(() => undefined)).toBeUndefined();
  expect(tracker.completeInitial(undefined)).toBeUndefined();
  expect(tracker.drain()).toBeUndefined();
  expect(tracker.run(() => pending.promise)).toBe(pending.promise);
  pending.resolve({});
});

it('does not inspect opaque injected thenables or replace untracked Promise returns', () => {
  const tracker = createNavigationCompletionTracker(), getter = vi.fn(() => () => {});
  const opaque = Object.defineProperty({}, 'then', {get: getter});
  expect(tracker.run(() => opaque)).toBe(opaque);
  expect(tracker.completeInitial(opaque)).toBe(opaque);
  expect(tracker.drain()).toBeUndefined();
  expect(getter).not.toHaveBeenCalled();
  const external = Promise.resolve('external');
  expect(tracker.completeInitial(external)).toBe(external);
});

it('waits for the initial live native Promise and preserves its result', async () => {
  const tracker = createNavigationCompletionTracker(), pending = deferred<object>(), value = {};
  const original = tracker.run(() => pending.promise), result = tracker.completeInitial(original);
  let complete = false;
  void Promise.resolve(result).then(() => {complete = true;});
  await Promise.resolve();
  expect(complete).toBe(false);
  pending.resolve(value);
  await expect(result).resolves.toBe(value);
  expect(tracker.drain()).toBeUndefined();
});

it('follows a ready replacement without waiting for a retired never-settling import', async () => {
  const tracker = createNavigationCompletionTracker(), stalled = deferred<unknown>();
  const original = tracker.run(() => stalled.promise), completion = tracker.completeInitial(original);
  const replacement = deferred<string>();
  tracker.run(() => replacement.promise);
  replacement.resolve('ready replacement');
  await expect(completion).resolves.toBe('ready replacement');
  expect(tracker.drain()).toBeUndefined();
});

it('waits through rapid replacements and observes only the current completion', async () => {
  const tracker = createNavigationCompletionTracker(), first = deferred<unknown>(), second = deferred<unknown>(), third = deferred<string>();
  const original = tracker.run(() => first.promise), completion = tracker.completeInitial(original);
  tracker.run(() => second.promise);
  tracker.run(() => third.promise);
  first.resolve(false); second.resolve('retired');
  let complete = false;
  void Promise.resolve(completion).then(() => {complete = true;});
  for (let tick = 0; tick < 5; tick++) await Promise.resolve();
  expect(complete).toBe(false);
  third.resolve('current');
  await expect(completion).resolves.toBe('current');
});

it('consumes rejections from superseded routes, including one replaced before the initial waiter starts', async () => {
  const tracker = createNavigationCompletionTracker(), first = deferred<unknown>(), second = deferred<unknown>();
  const original = tracker.run(() => first.promise);
  tracker.run(() => second.promise);
  tracker.run(() => Promise.resolve('current'));
  first.reject(Error('retired first')); second.reject(Error('retired intermediate'));
  await expect(tracker.completeInitial(original)).resolves.toBe('current');
  expect(tracker.drain()).toBeUndefined();
});

it('propagates a live rejection unchanged and never marks it observed as ready', async () => {
  const tracker = createNavigationCompletionTracker(), pending = deferred<unknown>(), failure = Error('live route failure');
  const original = tracker.run(() => pending.promise), completion = tracker.completeInitial(original);
  pending.reject(failure);
  await expect(completion).rejects.toBe(failure);
  await expect(tracker.drain()).rejects.toBe(failure);
});

it('keeps public synchronous throws unchanged and propagates the live replacement failure', async () => {
  const tracker = createNavigationCompletionTracker(), stalled = deferred<unknown>(), failure = Error('live synchronous failure');
  const original = tracker.run(() => stalled.promise), completion = tracker.completeInitial(original);
  expect(() => tracker.run(() => {throw failure;})).toThrow(failure);
  await expect(completion).rejects.toBe(failure);
  expect(() => tracker.drain()).toThrow(failure);
});

it('drains navigation started during later bootstrap and notices a new owner after the first drain', async () => {
  const tracker = createNavigationCompletionTracker();
  const initial = tracker.run(() => Promise.resolve('initial'));
  await tracker.completeInitial(initial);
  const later = deferred<string>();
  tracker.run(() => later.promise);
  const firstDrain = tracker.drain();
  expect(firstDrain).toBeInstanceOf(Promise);
  later.resolve('later');
  await expect(firstDrain).resolves.toBe('later');
  const last = deferred<string>();
  tracker.run(() => last.promise);
  const secondDrain = tracker.drain();
  expect(secondDrain).toBeInstanceOf(Promise);
  last.resolve('last');
  await expect(secondDrain).resolves.toBe('last');
  expect(tracker.drain()).toBeUndefined();
});

it('preserves a synchronous replacement and handles reentrant navigation without restoring the older owner', async () => {
  const tracker = createNavigationCompletionTracker(), old = deferred<unknown>(), replacement = deferred<string>();
  const original = tracker.run(() => {
    tracker.run(() => replacement.promise);
    return old.promise;
  });
  const completion = tracker.completeInitial(original);
  replacement.resolve('reentrant current');
  await expect(completion).resolves.toBe('reentrant current');
  tracker.run(() => 'synchronous current');
  expect(tracker.drain()).toBeUndefined();
});

it('ends observation only at a stable final drain and leaves later native Promise handlers untouched', async () => {
  const tracker = createNavigationCompletionTracker(), initial = deferred<unknown>();
  const result = tracker.run(() => initial.promise);
  const completion = tracker.completeInitial(result);
  expect(tracker.isActive()).toBe(true);
  initial.resolve('ready');
  await completion;
  expect(tracker.isActive()).toBe(true);
  expect(tracker.drain()).toBeUndefined();
  expect(tracker.isActive()).toBe(false);
  const later = deferred<unknown>(), observedThen = vi.spyOn(later.promise, 'then'), failure = Error('post-ready live error');
  expect(tracker.run(() => later.promise)).toBe(later.promise);
  expect(tracker.completeInitial(later.promise)).toBe(later.promise);
  expect(tracker.drain()).toBeUndefined();
  expect(observedThen).not.toHaveBeenCalled();
  const received = Promise.prototype.then.call(later.promise, () => undefined, (error: unknown) => error);
  later.reject(failure);
  await expect(received).resolves.toBe(failure);
  expect(observedThen).not.toHaveBeenCalled();
});

it('retains handlers already attached to stale startup rejections after the final stable drain', async () => {
  const tracker = createNavigationCompletionTracker(), stale = deferred<unknown>();
  const first = tracker.run(() => stale.promise), completion = tracker.completeInitial(first);
  tracker.run(() => Promise.resolve('current'));
  await completion;
  expect(tracker.drain()).toBeUndefined();
  expect(tracker.isActive()).toBe(false);
  stale.reject(Error('retired startup import'));
  await Promise.resolve();
  expect(tracker.isActive()).toBe(false);
});
