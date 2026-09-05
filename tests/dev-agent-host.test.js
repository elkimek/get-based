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
    expect(controller.describe().agents[0]).toMatchObject({
      status: 'available', version: 'codex-cli 0.150.1', protocolVersion: 5,
      capabilities: expect.arrayContaining(['companion-control', 'execution-targets']),
      companionVersion: '1.2.0', runtimeMode: 'temporary',
    });
    expect(spawnImpl).toHaveBeenCalledWith(process.execPath, [
      '--watch-preserve-output', '--watch', '/workspace/server/agent-host-server.js',
    ], expect.objectContaining({
      cwd: '/workspace', stdio: ['ignore', 'pipe', 'pipe'],
      env: expect.objectContaining({ GETBASED_AGENT_HOST_STRICT_PORT: '0' }),
    }));

    controller.close();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('lists detected CLIs and enables implemented adapters', () => {
    const child = fakeChild();
    const versions = new Map([
      ['codex', 'codex-cli 0.150.1'],
      ['opencode', '1.18.23'],
      ['hermes', 'Hermes Agent v0.21.0'],
      ['grok', 'grok 1.0.3'],
      ['openclaw', 'OpenClaw 2026.9.1'],
    ]);
    const controller = startDevAgentHost({
      root: '/workspace',
      env: { GETBASED_OPENCLAW_COMMAND: 'openclaw' },
      execFileSyncImpl: vi.fn(command => {
        const version = versions.get(String(command));
        if (!version) throw new Error('missing');
        return version;
      }),
      prepareStorage: vi.fn(() => ({ token: 'private-token' })),
      spawnImpl: vi.fn(() => child),
    });

    expect(controller.describe().agents.map(agent => agent.id)).toEqual(['codex', 'opencode', 'hermes', 'grok', 'openclaw']);
    expect(controller.describe().agents.map(agent => agent.compatible)).toEqual([true, true, true, true, true]);
  });

  it('keeps Claude Agent dormant unless API/Console use is explicitly enabled', () => {
    const discover = env => startDevAgentHost({
      root: '/workspace', env,
      execFileSyncImpl: vi.fn((command, args) => {
        if (command !== 'claude') throw new Error('missing');
        if (args[0] === '--version') return 'Claude CLI 2.1.0';
        if (args[0] === 'auth') return JSON.stringify({ loggedIn: true });
        throw new Error('unexpected');
      }),
      prepareStorage: vi.fn(() => ({ token: 'private-token' })),
      spawnImpl: vi.fn(() => fakeChild()),
    });

    expect(discover({}).describe().agents).toEqual([]);
    const enabled = discover({ GETBASED_ENABLE_CLAUDE_AGENT: 'api-console' });
    expect(enabled.describe().agents).toEqual([expect.objectContaining({
      id: 'claude', name: 'Claude Agent', status: 'starting',
      description: 'Anthropic agent · API/Console billing only',
    })]);
    enabled.close();
  });

  it('reports a non-zero logged-out Claude status as sign-in required', () => {
    const controller = startDevAgentHost({
      root: '/workspace', env: { GETBASED_ENABLE_CLAUDE_AGENT: 'api-console' },
      execFileSyncImpl: vi.fn((command, args) => {
        if (command !== 'claude') throw new Error('missing');
        if (args[0] === '--version') return 'Claude CLI 2.1.0';
        if (args[0] === 'auth') throw Object.assign(new Error('Command failed'), {
          stdout: JSON.stringify({ loggedIn: false, authMethod: 'none' }),
        });
        throw new Error('unexpected');
      }),
      prepareStorage: vi.fn(() => ({ token: 'private-token' })),
      spawnImpl: vi.fn(() => fakeChild()),
    });

    expect(controller.describe().agents).toEqual([expect.objectContaining({
      id: 'claude', name: 'Claude Agent', status: 'login_required',
      message: 'Run `claude auth login --console` for API billing, then check the connection again.',
    })]);
    controller.close();
  });

  it('honors an explicit CLI path during development discovery', () => {
    const child = fakeChild();
    const run = vi.fn(command => {
      if (command === '/opt/custom/codex') return 'codex-cli custom';
      throw new Error('missing');
    });
    const controller = startDevAgentHost({
      root: '/workspace',
      env: { GETBASED_CODEX_COMMAND: '/opt/custom/codex' },
      execFileSyncImpl: run,
      prepareStorage: vi.fn(() => ({ token: 'private-token' })),
      spawnImpl: vi.fn(() => child),
    });

    expect(controller.describe().agents).toEqual([expect.objectContaining({
      id: 'codex', version: 'codex-cli custom',
    })]);
    expect(run).toHaveBeenCalledWith('/opt/custom/codex', ['--version'], expect.any(Object));
    controller.close();
  });

  it('reuses an authenticated Codex bridge that is already running', async () => {
    const child = fakeChild();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const controller = startDevAgentHost({
      root: '/workspace',
      env: { GETBASED_AGENT_HOST_PORT: '8324' },
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

  it('follows the current development companion to the next free discovery port', () => {
    const child = fakeChild();
    const controller = startDevAgentHost({
      root: '/workspace', env: {},
      execFileSyncImpl: vi.fn(command => {
        if (command === 'codex') return 'codex-cli 0.150.1';
        throw new Error('missing');
      }),
      prepareStorage: vi.fn(() => ({ token: 'private-token' })),
      spawnImpl: vi.fn(() => child),
    });

    child.stderr.emit('data', 'listen EADDRINUSE: address already in use 127.0.0.1:8324');
    expect(controller.describe().agents[0]).toMatchObject({ status: 'starting', endpoint: 'http://127.0.0.1:8324' });
    child.stdout.emit('data', 'getbased Companion listening at http://127.0.0.1:8325\n');
    expect(controller.describe().agents[0]).toMatchObject({ status: 'available', endpoint: 'http://127.0.0.1:8325' });
    controller.close();
  });
});
