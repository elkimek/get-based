// @vitest-environment node

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Mock } from 'vitest';
type FixtureChild = Omit<ChildProcessWithoutNullStreams, 'exitCode' | 'signalCode'> & {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: Mock<ChildProcessWithoutNullStreams['kill']>;
};

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { CodexAppServerClient } from '../lib/codex-app-server-client.js';
import { ACPAgentClient } from '../lib/acp-agent-client.js';

function fakeChild() {
  const child = new EventEmitter() as FixtureChild;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn();
  return child;
}

describe('CodexAppServerClient', () => {
  it.each(['codex', 'acp'])('ignores delayed output and exit from a replaced %s process', async kind => {
    const oldChild = fakeChild();
    const newChild = fakeChild();
    const spawnImpl = vi.fn().mockReturnValueOnce(oldChild).mockReturnValueOnce(newChild);
    const client = kind === 'codex' ? new CodexAppServerClient({ spawnImpl })
      : new ACPAgentClient({ id: 'opencode', command: 'opencode', args: ['acp'], cwd: '/tmp', spawnImpl });
    client.start();
    await client.restart();
    const pending = client.request('ping', {});
    oldChild.stdout.write('{"id":1,"result":{"stale":true}}\n');
    oldChild.emit('exit', 0);
    expect(client.child).toBe(newChild);
    newChild.stdout.write('{"id":1,"result":{"current":true}}\n');
    await expect(pending).resolves.toEqual({ current: true });
    await client.close();
  });
  it('performs the experimental initialize handshake', async () => {
    const child = fakeChild();
    const writes: unknown[] = [];
    child.stdin.on('data', chunk => writes.push(...String(chunk).trim().split('\n').map(JSON.parse as unknown as (value: string, index: number) => unknown)));
    const client = new CodexAppServerClient({ spawnImpl: () => child });
    const initialized = client.initialize();
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      id: 1,
      method: 'initialize',
      params: { capabilities: { experimentalApi: true }, clientInfo: { name: 'getbased-agent-host' } },
    });
    child.stdout.write(`${JSON.stringify({ id: 1, result: { userAgent: 'codex-test' } })}\n`);
    await expect(initialized).resolves.toEqual({ userAgent: 'codex-test' });
    expect(writes[1]).toEqual({ method: 'initialized', params: {} });
    await client.close();
  });

  it('separates notifications and server requests', async () => {
    const child = fakeChild();
    const client = new CodexAppServerClient({ spawnImpl: () => child });
    const notification = vi.fn();
    const serverRequest = vi.fn();
    client.on('notification', notification);
    client.on('serverRequest', serverRequest);
    client.start();
    child.stdout.write('{"method":"turn/started","params":{"threadId":"t1"}}\n');
    child.stdout.write('{"id":7,"method":"item/tool/call","params":{"tool":"getbased_section"}}\n');
    await vi.waitFor(() => expect(serverRequest).toHaveBeenCalledTimes(1));
    expect(notification).toHaveBeenCalledWith({ method: 'turn/started', params: { threadId: 't1' } });
    expect(serverRequest).toHaveBeenCalledWith({ id: 7, method: 'item/tool/call', params: { tool: 'getbased_section' } });
    await client.close();
  });
});

it.each([['closed pipe','closed pipe'],[{reason:'opaque'},'Codex app-server request failed.']] as const)('reports raw write failure %j and clears pending requests', async (failure,message) => {
  const child=fakeChild();vi.spyOn(child.stdin,'write').mockImplementation(()=>{throw failure;});
  const client=new CodexAppServerClient({spawnImpl:()=>child});
  await expect(client.request('probe',{})).rejects.toMatchObject({message,code:'write_failed'});
  expect(client.pending.size).toBe(0);await client.close();
});
it('refuses request/reply/notification when no process is available without spawning one', async () => {
  const spawnImpl=vi.fn(()=>fakeChild());const client=new CodexAppServerClient({spawnImpl});client.start=vi.fn();
  await expect(client.request('probe')).rejects.toMatchObject({code:'process_unavailable'});
  expect(()=>client.respond(1,{})).toThrow('unavailable');expect(()=>client.notify('probe')).toThrow('unavailable');
  expect(spawnImpl).not.toHaveBeenCalled();
});
it('writes a server-request reply with the original ID and no notification method', async () => {
  const child=fakeChild(),writes:string[]=[];child.stdin.on('data',chunk=>writes.push(String(chunk)));
  const client=new CodexAppServerClient({spawnImpl:()=>child});client.start();client.respond('server-request',{allowed:false});
  expect(writes.map(value=>JSON.parse(value))).toEqual([{id:'server-request',result:{allowed:false}}]);await client.close();
});
