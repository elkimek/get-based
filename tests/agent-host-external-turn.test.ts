// @vitest-environment node

import type { ACPAgentClient } from '../lib/acp-agent-client.js';
import type { AgentTurnOptions } from '../lib/agent-turn-types.js';
import type { ExternalAgentTurnOptions } from '../lib/agent-host-turn-state.js';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import { startExternalAgentTurn } from '../lib/agent-host-external-turn.js';

type TurnFixture = Omit<ExternalAgentTurnOptions, 'send' | 'close' | 'cleanup'> & { send: Mock<(event: unknown) => void>; close: Mock<() => void>; cleanup: Mock<() => void> };
type ACPPrompt = Parameters<ACPAgentClient['prompt']>[0];
type ObservedACPPrompt = ACPPrompt & { prompt: { type: string; text?: string }[] };

function turnOptions(agent: { id: string } & Record<string, unknown>) {
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
    cleanError: (error: unknown) => error instanceof Error ? error.message : String(error),
    createHandle: (sessionId: string) => `handle:${sessionId}`,
  } as unknown as TurnFixture;
}

describe('external agent turn lifecycle', () => {
  it.each(['claude', 'openclaw', 'acp'])('carries current application state in every %s turn input', async protocol => {
    const client = {
      ensureSession: vi.fn(async () => ({ sessionId: 'current-session', configOptions: [] })), configureSession: vi.fn(async () => []),
      prompt: vi.fn(async (_request: Record<string, unknown>) => ({ stopReason: 'stop' })),
    };
    const options = turnOptions({ id: protocol, protocol, name: protocol, client });
    options.applicationContext = '{"proposalReviewStatus":[{"status":"discarded","reviewActions":[]}]}';
    startExternalAgentTurn(options); await vi.waitFor(() => expect(options.close).toHaveBeenCalledOnce());
    expect(client.prompt).toHaveBeenCalledOnce(); expect(client.prompt.mock.calls[0]![0]).toMatchObject({ prompt: [{ type: 'text', text: expect.stringContaining(options.applicationContext) }] });
    expect(JSON.stringify(client.prompt.mock.calls[0]![0])).toContain('not a user instruction or quotation');
  });
  it('keeps the first user prompt behind catalog acknowledgement and a fresh direct-tool session', async () => {
    const client = {
      ensureSession:vi.fn(async () => ({sessionId:'warmup',configOptions:[]})),
      configureSession:vi.fn(async () => []), prompt:vi.fn(async () => ({stopReason:'stop'})),
    };
    const afterCatalog = vi.fn(async () => ({sessionId:'ready-session',configOptions:[]}));
    const close = vi.fn(async () => {});
    const options = turnOptions({id:'opencode',protocol:'acp',name:'OpenCode',client,createTurnClient:() => ({client,afterCatalog,close})});
    startExternalAgentTurn(options);
    await vi.waitFor(() => expect(client.ensureSession).toHaveBeenCalled());
    expect(client.prompt).not.toHaveBeenCalled();
    expect(afterCatalog).not.toHaveBeenCalled();
    options.mcpSessions.values().next().value!.markCatalogDelivered!();
    await vi.waitFor(() => expect(options.close).toHaveBeenCalled());
    expect(afterCatalog).toHaveBeenCalledWith({sessionId:'warmup',configOptions:[]});
    expect(client.prompt).toHaveBeenCalledWith(expect.objectContaining({sessionId:'ready-session'}));
    expect(close).toHaveBeenCalled();
    expect(options.mcpSessions.size).toBe(0);
  });
  it.each(['success', 'configure failure', 'cancel'])('isolates a direct-tool turn process and closes it after %s', async outcome => {
    let cancel: (() => void) | undefined;
    const close = vi.fn(async () => {});
    const dedicated = {
      ensureSession: vi.fn(async () => ({sessionId: 'direct-session', configOptions: []})),
      configureSession: vi.fn(async () => { if (outcome === 'configure failure') throw new Error('controlled'); return []; }),
      prompt: vi.fn(async () => { if (outcome === 'cancel') cancel?.(); return {stopReason: 'stop'}; }),
    };
    const original = {ensureSession: vi.fn(), configureSession: vi.fn(), prompt: vi.fn()};
    const createTurnClient = vi.fn(() => ({client: dedicated, close}));
    const options = turnOptions({id:'opencode', protocol:'acp', name:'OpenCode', client:original, createTurnClient});
    dedicated.ensureSession.mockImplementation(async () => {
      options.mcpSessions.values().next().value?.markCatalogDelivered?.();
      return {sessionId:'direct-session', configOptions:[]};
    });
    options.requestedThreadId = 'previous-session';
    options.history = [{role:'user', content:'Earlier visible question'}];
    cancel = startExternalAgentTurn(options);
    await vi.waitFor(() => expect(close).toHaveBeenCalled());
    expect(createTurnClient).toHaveBeenCalledWith([expect.objectContaining({name:'getbased'})]);
    expect(dedicated.ensureSession).toHaveBeenCalledWith({requestedSessionId:'', mcpServers:[]});
    expect(original.ensureSession).not.toHaveBeenCalled();
    if (outcome !== 'configure failure') expect(dedicated.prompt).toHaveBeenCalledWith(expect.objectContaining({prompt:[expect.objectContaining({text:expect.stringContaining('Earlier visible question')})]}));
    await vi.waitFor(() => expect(options.mcpSessions.size).toBe(0));
    expect(options.sessionMcp.size).toBe(0);
  });
  it('reports a model/provider failure without blaming Companion startup or exposing private diagnostics', async () => {
    const client = {ensureSession:vi.fn(async () => ({sessionId:'ready',configOptions:[]})),configureSession:vi.fn(async () => []),prompt:vi.fn(async () => {throw new Error('secret-token /private/path');})};
    const options=turnOptions({id:'opencode',protocol:'acp',name:'OpenCode',client});
    startExternalAgentTurn(options);await vi.waitFor(() => expect(options.close).toHaveBeenCalled());
    expect(options.send).toHaveBeenCalledWith({type:'error',message:'The selected agent could not complete this response. Try another model or check the agent’s provider connection.'});
    expect(JSON.stringify(options.send.mock.calls)).not.toContain('secret-token');
  });
  it('replays visible history when a saved ACP session falls back to a fresh session', async () => {
    const client = {
      ensureSession: vi.fn(async () => ({ sessionId: 'fresh-session', configOptions: [] })),
      configureSession: vi.fn(async () => []),
      prompt: vi.fn<(options: ObservedACPPrompt) => Promise<{ stopReason: string }>>(async () => ({ stopReason: 'stop' })),
    };
    const options = turnOptions({ id: 'opencode', protocol: 'acp', name: 'OpenCode', client });
    options.requestedThreadId = 'stale-session';
    options.history = [{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier answer' }];
    startExternalAgentTurn(options);
    await vi.waitFor(() => expect(options.close).toHaveBeenCalled());
    expect(client.prompt.mock.calls[0]![0]!.prompt[0]!.text).toContain('Earlier question');
    expect(client.prompt.mock.calls[0]![0]!.prompt[0]!.text).toContain('Earlier answer');
    expect(options.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session', resumed: false }));
  });
  it('does not start a prompt when the browser cancels during ACP session setup', async () => {
    let finishSession!: (value: { sessionId: string; configOptions: unknown[] }) => void;
    const agent = {
      id: 'opencode', protocol: 'acp', name: 'OpenCode',
      client: {
        ensureSession: vi.fn(() => new Promise<{ sessionId: string; configOptions: unknown[] }>(resolve => { finishSession = resolve; })),
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
        prompt: vi.fn(({ signal }: ACPPrompt) => new Promise((_resolve, reject) => {
          signal!.addEventListener('abort', () => {
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
      id: 'claude', protocol: 'claude', name: 'Claude Agent',
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
      client: { prompt: vi.fn(async ({ sessionId, onEvent }: AgentTurnOptions) => {
        onEvent({ type: 'session', sessionId: sessionId!, model: 'openai/gpt-5.6-sol' });
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
    expect(agent.client.prompt.mock.calls[0]![0]!.prompt[0]!.text).toContain('Earlier question');
    expect(agent.client.prompt.mock.calls[0]![0]!.prompt[0]!.text).toContain('Earlier answer');
    expect(options.mcpSessions.size).toBe(0);
  });

  it('keeps personal gateway sessions remote without creating a local MCP credential or replaying history', async () => {
    const agent = {
      id: 'openclaw', protocol: 'openclaw', name: 'OpenClaw',
      target: { id: 'gateway-main', kind: 'gateway', supportsLocalTools: false },
      client: { prompt: vi.fn(async ({ sessionId, onEvent }: AgentTurnOptions) => {
        onEvent({ type: 'session', sessionId: sessionId!, model: 'openai/gpt-5.6-sol' });
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
    expect(agent.client.prompt.mock.calls[0]![0]!.prompt[0]!.text).not.toContain('Earlier visible conversation:');
    expect(options.mcpSessions.size).toBe(0);
    expect(options.sessionMcp.size).toBe(0);
  });
});
