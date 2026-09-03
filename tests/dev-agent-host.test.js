// @vitest-environment node

import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startDevAgentHost } from '../lib/dev-agent-host.js';

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn();
  return child;
}

describe('development agent discovery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('omits Codex when it is not installed', () => {
    const controller = startDevAgentHost({
      root: '/workspace',
      execFileSyncImpl: () => { throw new Error('missing'); },
    });
    expect(controller.describe()).toEqual({ agents: [] });
  });

  it('starts an installed Codex bridge and keeps transport details out of the terminal', () => {
    const child = fakeChild();
    const spawnImpl = vi.fn(() => child);
    const controller = startDevAgentHost({
      root: '/workspace',
      env: { PATH: '/usr/bin' },
      execFileSyncImpl: vi.fn(command => {
        if (command === 'codex') return 'codex-cli 0.150.1\n';
        throw new Error('missing');
      }),
      prepareStorage: vi.fn(() => ({ token: 'private-token' })),
      spawnImpl,
    });

    expect(controller.describe()).toEqual({ agents: [expect.objectContaining({
      id: 'codex', compatible: true, status: 'starting', token: 'private-token',
    })] });
    child.stdout.emit('data', 'getbased Companion listening at http://127.0.0.1:8324\n');
    expect(controller.describe().agents[0]).toMatchObject({ status: 'available', version: 'codex-cli 0.150.1' });
    expect(spawnImpl).toHaveBeenCalledWith(process.execPath, [
      '--watch-preserve-output', '--watch', '/workspace/server/agent-host-server.js',
    ], expect.objectContaining({
      cwd: '/workspace', stdio: ['ignore', 'pipe', 'pipe'],
      env: expect.objectContaining({ GETBASED_AGENT_HOST_STRICT_PORT: '1' }),
    }));

    controller.close();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('lists detected CLIs while only enabling implemented adapters', () => {
    const child = fakeChild();
    const versions = new Map([
      ['codex', 'codex-cli 0.150.1'],
      ['opencode', '1.18.23'],
      ['hermes', 'Hermes Agent v0.21.0'],
      ['grok', 'grok 1.0.3'],
    ]);
    const controller = startDevAgentHost({
      root: '/workspace',
      execFileSyncImpl: vi.fn(command => {
        const version = versions.get(String(command));
        if (!version) throw new Error('missing');
        return version;
      }),
      prepareStorage: vi.fn(() => ({ token: 'private-token' })),
      spawnImpl: vi.fn(() => child),
    });

    expect(controller.describe().agents.map(agent => agent.id)).toEqual(['codex', 'opencode', 'hermes', 'grok']);
    expect(controller.describe().agents.map(agent => agent.compatible)).toEqual([true, false, false, false]);
  });

  it('reuses an authenticated Codex bridge that is already running', async () => {
    const child = fakeChild();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const controller = startDevAgentHost({
      root: '/workspace',
      execFileSyncImpl: vi.fn(command => {
        if (command === 'codex') return 'codex-cli 0.150.1';
        throw new Error('missing');
      }),
      prepareStorage: vi.fn(() => ({ token: 'private-token' })),
      spawnImpl: vi.fn(() => child),
    });

    child.stderr.emit('data', 'listen EADDRINUSE: address already in use 127.0.0.1:8324');
    await vi.waitFor(() => expect(controller.describe().agents[0].status).toBe('available'));
  });
});
