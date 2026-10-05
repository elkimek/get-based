// @vitest-environment node
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { PendingRpcRequest } from '../lib/rpc-client-state.js';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACPAgentClient } from '../lib/acp-agent-client.js';
import { CodexAppServerClient } from '../lib/codex-app-server-client.js';

type ClientKind = 'codex' | 'acp';
function clientFor(kind: ClientKind, child?: ChildProcessWithoutNullStreams) {
  return kind === 'codex'
    ? new CodexAppServerClient({ spawnImpl: () => child! })
    : new ACPAgentClient({ id: 'fixture', command: 'fixture', args: [], cwd: '/tmp', spawnImpl: () => child! });
}
function pending(reject: PendingRpcRequest['reject']): PendingRpcRequest {
  return { resolve() {}, reject, timer: setTimeout(() => {}, 10_000) };
}
function closedChild() {
  return { stdin: { end: vi.fn() }, exitCode: 0, signalCode: null } as unknown as ChildProcessWithoutNullStreams;
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe.each(['codex', 'acp'] as const)('%s pending-request shutdown semantics', kind => {
  it('keeps live iteration while clearing the current map after reentrant replacement', () => {
    vi.useFakeTimers();
    const client = clientFor(kind);
    client.child = closedChild();
    const first = new Map<number, PendingRpcRequest>(), replacement = new Map<number, PendingRpcRequest>();
    const order: string[] = [], failure = new Error('fixture failure');
    let current = first;
    first.set(1, pending(reason => {
      expect(reason).toBe(failure);
      order.push('first');
      first.set(3, pending(() => order.push('appended')));
      current = replacement;
    }));
    first.set(2, pending(() => order.push('second')));
    Object.defineProperty(client, 'pending', { configurable: true, get: () => current });
    client.handleExit(failure);
    expect(order).toEqual(['first', 'second', 'appended']);
    expect(first.size).toBe(3);
    expect(client.pending).toBe(replacement);
    expect(replacement.size).toBe(0);
    expect(client.child).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retains a failing final map read after settling all pending requests', () => {
    vi.useFakeTimers();
    const client = clientFor(kind);
    client.child = closedChild();
    const map = new Map<number, PendingRpcRequest>(), reject = vi.fn();
    map.set(1, pending(reject));
    map.set(2, pending(reject));
    const getterFailure = new Error('replacement map unavailable');
    let reads = 0;
    Object.defineProperty(client, 'pending', { configurable: true, get() {
      if (++reads === 2) throw getterFailure;
      return map;
    } });
    expect(() => client.handleExit('original rejection')).toThrow(getterFailure);
    expect(reads).toBe(2);
    expect(reject.mock.calls).toEqual([['original rejection'], ['original rejection']]);
    expect(map.size).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves protocol-specific close error identities', async () => {
    vi.useFakeTimers();
    const client = clientFor(kind);
    client.child = closedChild();
    const reasons: unknown[] = [];
    client.pending.set(1, pending(reason => reasons.push(reason)));
    client.pending.set(2, pending(reason => reasons.push(reason)));
    await client.close();
    expect(reasons).toHaveLength(2);
    expect(reasons[0]).toBeInstanceOf(Error);
    expect(reasons[1]).toBeInstanceOf(Error);
    expect(reasons[0] === reasons[1]).toBe(kind === 'codex');
    expect(client.pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([1, '1', 999])('retains reply-ID matching for %j', async id => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
      exitCode: 0, signalCode: null,
    }) as unknown as ChildProcessWithoutNullStreams & { stdout: PassThrough };
    const client = clientFor(kind, child);
    const result = client.request('fixture', {}).then(value => ({ value }), error => ({ error }));
    child.stdout.write(`${JSON.stringify({ id, result: 'accepted' })}\n`);
    const matches = id === 1 || (kind === 'acp' && id === '1');
    expect(client.pending.size).toBe(matches ? 0 : 1);
    await client.close();
    if (matches) expect(await result).toEqual({ value: 'accepted' });
    else expect(await result).toMatchObject({ error: expect.any(Error) });
  });
});
