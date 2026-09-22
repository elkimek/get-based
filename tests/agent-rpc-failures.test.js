// @vitest-environment node
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexAppServerClient } from '../lib/codex-app-server-client.js';
import { ACPAgentClient } from '../lib/acp-agent-client.js';

function childProcess() {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    exitCode: null, signalCode: null, kill: vi.fn(),
  });
}
const clients = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  vi.useRealTimers();
});
function setup(kind, children = [childProcess()]) {
  const spawnImpl = vi.fn();
  for (const child of children) spawnImpl.mockReturnValueOnce(child);
  const client = kind === 'codex'
    ? new CodexAppServerClient({ spawnImpl, requestTimeoutMs: 100 })
    : new ACPAgentClient({ id: 'opencode', command: 'opencode', args: ['acp'], cwd: '/tmp', spawnImpl, requestTimeoutMs: 100 });
  clients.push(client);
  return { client, child: children[0], spawnImpl };
}

describe.each(['codex', 'acp'])('%s RPC failure boundaries', kind => {
  it('cleans up pending entries and timers when request serialization fails', async () => {
    vi.useFakeTimers();
    const { client, child } = setup(kind);
    const params = {}; params.self = params;
    await expect(client.request('ping', params)).rejects.toThrow();
    expect(client.pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(child.stdin.read()).toBeNull();
  });

  it('cleans up a synchronous stdin failure immediately', async () => {
    vi.useFakeTimers();
    const { client, child } = setup(kind);
    child.stdin.write = vi.fn(() => { throw new Error('broken pipe'); });
    await expect(client.request('ping', {})).rejects.toThrow('broken pipe');
    expect(client.pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects callback write failures instead of waiting for timeout', async () => {
    vi.useFakeTimers();
    const { client, child } = setup(kind);
    child.stdin.write = vi.fn((_data, callback) => { callback(new Error('broken pipe')); return false; });
    const pending = client.request('ping', {});
    const outcome = pending.then(() => 'resolved', error => error.message);
    await Promise.resolve();
    expect(client.pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(await outcome).toContain('broken pipe');
  });

  it('handles stdin error events and rejects all pending requests', async () => {
    const { client, child } = setup(kind);
    const one = client.request('one', {}).catch(error => error.message);
    const two = client.request('two', {}).catch(error => error.message);
    expect(() => child.stdin.emit('error', new Error('pipe closed'))).not.toThrow();
    expect(await one).toBe('pipe closed');
    expect(await two).toBe('pipe closed');
    expect(client.pending.size).toBe(0);
    expect(client.child).toBeNull();
  });

  it('expires only the timed-out request and ignores its late reply', async () => {
    vi.useFakeTimers();
    const { client, child } = setup(kind);
    const first = client.request('slow', {}, { timeoutMs: 10 }).catch(error => error.message);
    const second = client.request('other', {}, { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(10);
    expect(await first).toContain('timed out');
    child.stdout.write('{"id":1,"result":"late"}\n');
    expect(client.pending.size).toBe(1);
    child.stdout.write('{"id":2,"result":"current"}\n');
    await expect(second).resolves.toBe('current');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects in-flight work on process exit and restarts for the next request', async () => {
    const oldChild = childProcess(), nextChild = childProcess();
    const { client, spawnImpl } = setup(kind, [oldChild, nextChild]);
    const stopped = client.request('first', {}).catch(error => error.message);
    oldChild.emit('exit', 1, null);
    expect(await stopped).toContain('code 1');
    const current = client.request('second', {});
    expect(() => oldChild.stdin.emit('error', new Error('stale pipe'))).not.toThrow();
    expect(client.child).toBe(nextChild);
    nextChild.stdout.write('{"id":2,"result":"ok"}\n');
    await expect(current).resolves.toBe('ok');
    expect(spawnImpl).toHaveBeenCalledTimes(2);
  });

  it('shares initialization and retries after an RPC error', async () => {
    const { client, child } = setup(kind);
    const first = client.initialize();
    expect(client.initialize()).toBe(first);
    const failed = first.catch(error => error.message);
    child.stdout.write('{"id":1,"error":{"code":-32000,"message":"temporarily unavailable"}}\n');
    expect(await failed).toBe('temporarily unavailable');
    expect(client.initializePromise).toBeNull();
    const retry = client.initialize();
    child.stdout.write('{"id":2,"result":{"protocolVersion":1}}\n');
    await expect(retry).resolves.toEqual({ protocolVersion: 1 });
    expect(client.initialize()).toBe(retry);
    expect(client.pending.size).toBe(0);
  });

  it('rejects every pending request on close, clears timers and requires an explicit restart', async () => {
    vi.useFakeTimers();
    const { client, child } = setup(kind);
    const one = client.request('one', {}).catch(error => error.message);
    const two = client.request('two', {}).catch(error => error.message);
    await client.close();
    expect(await one).toContain('closed');
    expect(await two).toContain('closed');
    expect(client.pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    expect(() => client.request('later', {})).toThrow('closed');
    await client.close();
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('ignores a late write callback after a successful response', async () => {
    const { client, child } = setup(kind);
    let callback;
    child.stdin.write = vi.fn((_data, done) => { callback = done; return true; });
    const request = client.request('ping', {});
    child.stdout.write('{"id":1,"result":"accepted"}\n');
    await expect(request).resolves.toBe('accepted');
    expect(() => callback(new Error('late failure'))).not.toThrow();
    expect(client.pending.size).toBe(0);
  });

  it('reports malformed JSON without consuming a live request', async () => {
    const { client, child } = setup(kind);
    const error = vi.fn(); client.on('protocolError', error);
    const pending = client.request('ping', {});
    child.stdout.write('not-json\nnull\n[]\n{"id":999,"result":"unrelated"}\n');
    expect(error).toHaveBeenCalledOnce();
    expect(client.pending.size).toBe(1);
    child.stdout.write('{"id":1,"result":"ok"}\n');
    await expect(pending).resolves.toBe('ok');
  });
});
