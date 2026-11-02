import { expect, it } from 'vitest';
import { runNativeCommandWithLocks } from '../js/native-command-locks.js';

it.each(['synchronous', 'asynchronous'])('owns a %s command error without rejecting a native lock callback', async mode => {
  const callbacks: Promise<unknown>[] = [], names: string[] = [];
  const manager = { request: async (name: string, _options: unknown, callback: () => Promise<unknown>) => { names.push(name); const promise = callback(); callbacks.push(promise); return await promise; } } as unknown as Pick<LockManager, 'request'>;
  const error = Object.assign(new Error('Expected native command failure'), { noChangeApplied: true });
  const command = mode === 'synchronous' ? () => { throw error; } : async () => { await Promise.resolve(); throw error; };
  await expect(runNativeCommandWithLocks(manager, ['browser', 'profile'], command)).rejects.toBe(error);
  expect(names).toEqual(['browser', 'profile']);
  expect((await Promise.allSettled(callbacks)).map(result => result.status)).toEqual(['fulfilled', 'fulfilled']);
});

it('does not run a command when a nested lock is denied, and preserves the original error', async () => {
  const error = new DOMException('Synthetic lock unavailable', 'SecurityError'); let called = false;
  const manager = { request: async (name: string, _options: unknown, callback: () => Promise<unknown>) => { if (name === 'profile') throw error; return callback(); } } as unknown as Pick<LockManager, 'request'>;
  await expect(runNativeCommandWithLocks(manager, ['browser', 'profile'], () => { called = true; })).rejects.toBe(error);
  expect(called).toBe(false);
});
