import {expect, test} from '@playwright/test';
import {waitForAsyncCondition} from '../helpers/awaited-condition.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {resolve = yes;});
  return {promise, resolve};
}

test('a pending predicate resolving false cannot complete the barrier before a later true result', async () => {
  const first = deferred<boolean>(), second = deferred<boolean>();
  const firstEntered = deferred<void>(), secondEntered = deferred<void>();
  let calls = 0, completed = false;
  const waiting = waitForAsyncCondition(() => {
    calls++;
    if (calls === 1) {firstEntered.resolve(); return first.promise;}
    secondEntered.resolve();
    return second.promise;
  }, 1000).then(() => {completed = true;});
  await firstEntered.promise;
  expect(completed).toBe(false);
  first.resolve(false);
  await secondEntered.promise;
  expect(calls).toBe(2);
  expect(completed).toBe(false);
  second.resolve(true);
  await waiting;
  expect(completed).toBe(true);
  expect(calls).toBe(2);
});

test('a predicate that always resolves false fails within its original finite budget', async () => {
  let calls = 0;
  await expect(waitForAsyncCondition(async () => {calls++; return false;}, 100))
    .rejects.toThrow(/Timeout 100ms exceeded/);
  expect(calls).toBeGreaterThan(0);
});

test('a predicate that never settles cannot escape its finite budget', async () => {
  const pending = deferred<boolean>();
  await expect(waitForAsyncCondition(() => pending.promise, 100))
    .rejects.toThrow(/Timeout 100ms exceeded/);
  pending.resolve(false);
});

test('a predicate rejection propagates its original error without being retried or converted into readiness', async () => {
  const failure = Error('synthetic predicate failure');
  let calls = 0;
  await expect(waitForAsyncCondition(async () => {calls++; throw failure;}, 1000)).rejects.toBe(failure);
  expect(calls).toBe(1);
});
