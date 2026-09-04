// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { startExternalAgentTurn } from '../lib/agent-host-external-turn.js';

function turnOptions(agent) {
  return {
    agent,
    agentId: agent.id,
    requestedThreadId: '',
    requestedActiveKey: `${agent.id}:`,
    dynamicTools: [{ name: 'getbased_lab_context', description: 'Read context', inputSchema: { type: 'object' } }],
    sessionMcp: new Map(),
    mcpSessions: new Map(),
    maxMcpSessions: 8,
    activeTurns: new Map(),
    pendingTools: new Map(),
    turnUploads: [],
    cleanup: vi.fn(),
    origin: 'http://127.0.0.1:8324',
    bridgePath: '/tmp/getbased-companion.mjs',
    baseInstructions: 'Base instructions',
    requestedInstructions: '',
    history: [],
    outputSchema: null,
    prompt: 'Hello',
    model: '',
    effort: '',
    send: vi.fn(),
    close: vi.fn(),
    cleanError: error => error instanceof Error ? error.message : String(error),
    createHandle: sessionId => `handle:${sessionId}`,
  };
}

describe('external agent turn lifecycle', () => {
  it('does not start a prompt when the browser cancels during ACP session setup', async () => {
    let finishSession;
    const agent = {
      id: 'opencode', protocol: 'acp', name: 'OpenCode',
      client: {
        ensureSession: vi.fn(() => new Promise(resolve => { finishSession = resolve; })),
        configureSession: vi.fn(),
        prompt: vi.fn(),
      },
    };
    const options = turnOptions(agent);
    const cancel = startExternalAgentTurn(options);
    await vi.waitFor(() => expect(agent.client.ensureSession).toHaveBeenCalledOnce());

    cancel();
    finishSession({ sessionId: 'session-1', configOptions: [] });

    await vi.waitFor(() => expect(options.close).toHaveBeenCalled());
    expect(agent.client.configureSession).not.toHaveBeenCalled();
    expect(agent.client.prompt).not.toHaveBeenCalled();
    expect(options.activeTurns.size).toBe(0);
    expect(options.mcpSessions.size).toBe(0);
    expect(options.sessionMcp.size).toBe(0);
  });

  it('immediately releases an active ACP turn and any pending browser tool call on cancel', async () => {
    const agent = {
      id: 'opencode', protocol: 'acp', name: 'OpenCode',
      client: {
        ensureSession: vi.fn(async () => ({ sessionId: 'session-1', configOptions: [] })),
        configureSession: vi.fn(async () => []),
        prompt: vi.fn(({ signal }) => new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            const error = new Error('cancelled');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        })),
      },
    };
    const options = turnOptions(agent);
    const cancel = startExternalAgentTurn(options);
    await vi.waitFor(() => expect(options.activeTurns.has('opencode:local:session-1')).toBe(true));
    const respond = vi.fn();
    options.pendingTools.set('response-1', {
      threadId: 'opencode:local:session-1', timer: setTimeout(() => {}, 60_000), respond,
    });

    cancel();

    expect(options.activeTurns.size).toBe(0);
    expect(options.pendingTools.size).toBe(0);
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    await vi.waitFor(() => expect(options.close).toHaveBeenCalled());
  });

  it('removes one-shot Claude MCP credentials after an adapter failure', async () => {
    const agent = {
      id: 'claude', protocol: 'claude', name: 'Claude Code',
      client: { prompt: vi.fn(async () => { throw new Error('service failed'); }) },
    };
    const options = turnOptions(agent);
    startExternalAgentTurn(options);
    await vi.waitFor(() => expect(options.close).toHaveBeenCalled());
    expect(options.activeTurns.size).toBe(0);
    expect(options.mcpSessions.size).toBe(0);
    expect(options.sessionMcp.size).toBe(0);
  });

  it('replays visible history when continuing a one-shot OpenClaw conversation', async () => {
    const agent = {
      id: 'openclaw', protocol: 'openclaw', name: 'OpenClaw',
      client: { prompt: vi.fn(async ({ sessionId, onEvent }) => {
        onEvent({ type: 'session', sessionId, model: 'openai/gpt-5.6-sol' });
        onEvent({ type: 'done', finishReason: 'stop' });
      }) },
    };
    const options = turnOptions(agent);
    options.requestedThreadId = 'conversation-1';
    options.requestedActiveKey = 'openclaw:conversation-1';
    options.history = [
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
    ];
    startExternalAgentTurn(options);
    await vi.waitFor(() => expect(options.close).toHaveBeenCalled());
    expect(agent.client.prompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'conversation-1',
      prompt: [expect.objectContaining({
        type: 'text', text: expect.stringContaining('Earlier visible conversation:'),
      })],
    }));
    expect(agent.client.prompt.mock.calls[0][0].prompt[0].text).toContain('Earlier question');
    expect(agent.client.prompt.mock.calls[0][0].prompt[0].text).toContain('Earlier answer');
    expect(options.mcpSessions.size).toBe(0);
  });

  it('keeps personal gateway sessions remote without creating a local MCP credential or replaying history', async () => {
    const agent = {
      id: 'openclaw', protocol: 'openclaw', name: 'OpenClaw',
      target: { id: 'gateway-main', kind: 'gateway', supportsLocalTools: false },
      client: { prompt: vi.fn(async ({ sessionId, onEvent }) => {
        onEvent({ type: 'session', sessionId, model: 'openai/gpt-5.6-sol' });
        onEvent({ type: 'done', finishReason: 'stop' });
      }) },
    };
    const options = turnOptions(agent);
    options.targetId = 'gateway-main';
    options.requestedThreadId = 'personal-session-1';
    options.requestedActiveKey = 'openclaw:gateway-main:personal-session-1';
    options.history = [
      { role: 'user', content: 'Do not replay this remote history' },
      { role: 'assistant', content: 'The gateway already owns it' },
    ];
    startExternalAgentTurn(options);
    await vi.waitFor(() => expect(options.close).toHaveBeenCalled());
    expect(agent.client.prompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'personal-session-1',
      mcpConfig: { mcpServers: {} },
      prompt: [expect.objectContaining({ type: 'text', text: 'Hello' })],
    }));
    expect(agent.client.prompt.mock.calls[0][0].prompt[0].text).not.toContain('Earlier visible conversation:');
    expect(options.mcpSessions.size).toBe(0);
    expect(options.sessionMcp.size).toBe(0);
  });
});
