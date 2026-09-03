// @vitest-environment node

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { CodexAppServerClient } from '../lib/codex-app-server-client.js';

function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn();
  return child;
}

describe('CodexAppServerClient', () => {
  it('performs the experimental initialize handshake', async () => {
    const child = fakeChild();
    const writes = [];
    child.stdin.on('data', chunk => writes.push(...String(chunk).trim().split('\n').map(JSON.parse)));
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

