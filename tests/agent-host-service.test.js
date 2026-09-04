// @vitest-environment node

import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createAgentHostService, getAgentHostToolSpecs, isAllowedAgentHostOrigin,
} from '../lib/agent-host-service.js';
import { getCodexDynamicTools } from '../js/agent-tool-runtime.js';
import {
  AGENT_HOST_CAPABILITIES, AGENT_HOST_PROTOCOL_VERSION,
} from '../shared/agent-host-protocol.js';

const TOKEN = 'test-pairing-token';

class FakeAppServer extends EventEmitter {
  constructor() {
    super();
    this.requests = [];
    this.responses = [];
  }

  async initialize() { return { userAgent: 'fake' }; }

  async request(method, params) {
    this.requests.push({ method, params });
    if (method === 'thread/start') return { thread: { id: 'thread-1' }, model: 'gpt-5.4' };
    if (method === 'thread/resume') return { thread: { id: params.threadId }, model: 'gpt-5.4' };
    if (method === 'model/list') return { data: [{
      id: 'gpt-5.6-sol', model: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol', isDefault: true,
      inputModalities: ['text', 'image'],
      defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low', description: 'Fast' }],
    }] };
    if (method === 'turn/start') return { turn: { id: 'turn-1' } };
    if (method === 'thread/inject_items') return {};
    if (method === 'turn/interrupt') return {};
    throw new Error(`Unexpected method ${method}`);
  }

  respond(id, result) { this.responses.push({ id, result }); }
}

function turnRequest(body = {}) {
  return new Request('http://127.0.0.1:8324/v1/turns', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Origin: 'http://127.0.0.1:8000',
    },
    body: JSON.stringify({
      prompt: 'What changed in my labs?',
      tools: [{
        type: 'function',
        name: 'getbased_lab_context',
        description: 'Read context',
        inputSchema: { type: 'object', additionalProperties: false },
      }],
      ...body,
    }),
  });
}

async function nextEvent(reader, decoder, bufferRef) {
  while (true) {
    const newline = bufferRef.value.indexOf('\n');
    if (newline >= 0) {
      const line = bufferRef.value.slice(0, newline);
      bufferRef.value = bufferRef.value.slice(newline + 1);
      return JSON.parse(line);
    }
    const { value, done } = await reader.read();
    if (done) throw new Error('Stream ended before the next event.');
    bufferRef.value += decoder.decode(value, { stream: true });
  }
}

describe('agent host service', () => {
  it('keeps the host-side allowlist identical to the browser tool contract', () => {
    expect(getAgentHostToolSpecs()).toEqual(getCodexDynamicTools());
  });

  it('accepts only local development and official Get-based origins', () => {
    expect(isAllowedAgentHostOrigin('http://localhost:8080')).toBe(true);
    expect(isAllowedAgentHostOrigin('http://127.0.0.1:4173')).toBe(true);
    expect(isAllowedAgentHostOrigin('https://getbased.health')).toBe(true);
    expect(isAllowedAgentHostOrigin('https://app.getbased.health')).toBe(true);
    expect(isAllowedAgentHostOrigin('https://beta.getbased.health')).toBe(true);
    expect(isAllowedAgentHostOrigin('https://get-based.vercel.app')).toBe(true);
    expect(isAllowedAgentHostOrigin('https://self-host.example', ['https://self-host.example'])).toBe(true);
    expect(isAllowedAgentHostOrigin('https://evil.example')).toBe(false);
    expect(isAllowedAgentHostOrigin('https://getbased.health.evil.example')).toBe(false);
    expect(isAllowedAgentHostOrigin('https://untrusted.getbased.health')).toBe(false);
  });

  it('requires a bearer token for turn requests', async () => {
    const appServer = new FakeAppServer();
    const service = createAgentHostService({ appServer, token: TOKEN, workspaceRoot: '/tmp/agent-test' });
    const response = await service.handleRequest(new Request('http://127.0.0.1:8324/v1/turns', {
      method: 'POST',
      headers: { Origin: 'https://getbased.health' },
      body: '{}',
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('advertises a versioned companion only to an allowed browser origin', async () => {
    const appServer = new FakeAppServer();
    const service = createAgentHostService({ appServer, token: TOKEN, workspaceRoot: '/tmp/agent-test' });
    const missingOrigin = await service.handleRequest(new Request('http://127.0.0.1:8324/v1/discovery'));
    expect(missingOrigin.status).toBe(403);

    const response = await service.handleRequest(new Request('http://127.0.0.1:8324/v1/discovery', {
      headers: { Origin: 'https://getbased.health' },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://getbased.health');
    const discovery = await response.json();
    expect(discovery).toMatchObject({
      service: 'getbased-agent-host',
      protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
      capabilities: expect.arrayContaining([
        AGENT_HOST_CAPABILITIES.CHAT_STREAM,
        AGENT_HOST_CAPABILITIES.IMAGE_UPLOAD,
        AGENT_HOST_CAPABILITIES.STRUCTURED_OUTPUT,
      ]),
      endpoint: 'http://127.0.0.1:8324',
      token: expect.stringMatching(/^[0-9a-f-]{36}$/),
      tokenExpiresAt: expect.any(String),
      agents: [expect.objectContaining({ id: 'codex', compatible: true, status: 'available' })],
    });

    const sessionStatus = await service.handleRequest(new Request('http://127.0.0.1:8324/v1/status', {
      headers: { Authorization: `Bearer ${discovery.token}`, Origin: 'https://getbased.health' },
    }));
    expect(sessionStatus.status).toBe(200);
    const wrongOrigin = await service.handleRequest(new Request('http://127.0.0.1:8324/v1/status', {
      headers: { Authorization: `Bearer ${discovery.token}`, Origin: 'https://app.getbased.health' },
    }));
    expect(wrongOrigin.status).toBe(401);

    const rejectedInstallToken = await service.handleRequest(new Request('http://127.0.0.1:8324/v1/status', {
      headers: { Authorization: `Bearer ${TOKEN}`, Origin: 'https://getbased.health' },
    }));
    expect(rejectedInstallToken.status).toBe(401);

    const status = await service.handleRequest(new Request('http://127.0.0.1:8324/v1/status', {
      headers: { Authorization: `Bearer ${TOKEN}`, Origin: 'http://127.0.0.1:8000' },
    }));
    expect(await status.json()).toMatchObject({
      protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
      capabilities: expect.arrayContaining([AGENT_HOST_CAPABILITIES.DYNAMIC_TOOLS]),
    });
  });

  it('returns the sanitized Codex model and reasoning catalog', async () => {
    const appServer = new FakeAppServer();
    const service = createAgentHostService({ appServer, token: TOKEN, workspaceRoot: '/tmp/agent-test' });
    const response = await service.handleRequest(new Request('http://127.0.0.1:8324/v1/models', {
      headers: { Authorization: `Bearer ${TOKEN}`, Origin: 'http://127.0.0.1:8000' },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ models: [{
      id: 'gpt-5.6-sol', model: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol', isDefault: true,
      inputModalities: ['text', 'image'],
      defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low', description: 'Fast' }],
    }] });
  });

  it('routes model discovery and streaming turns through an ACP agent', async () => {
    const acp = {
      getModelCatalog: vi.fn(async () => [{
        id: 'open-model', model: 'open-model', displayName: 'Open Model', isDefault: true,
        inputModalities: ['text'], supportedReasoningEfforts: [],
      }]),
      ensureSession: vi.fn(async () => ({ sessionId: 'acp/session:1', configOptions: [] })),
      configureSession: vi.fn(async () => []),
      prompt: vi.fn(async options => {
        options.onNotification({ params: { sessionId: options.sessionId, update: {
          sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'From OpenCode' },
        } } });
        return { stopReason: 'end_turn' };
      }),
    };
    const service = createAgentHostService({
      appServer: null, token: TOKEN, workspaceRoot: '/tmp/agent-test', bundlePath: '/tmp/getbased-companion.mjs',
      agents: [{ id: 'opencode', name: 'OpenCode', description: 'Agent', protocol: 'acp', client: acp }],
    });
    const models = await service.handleRequest(new Request('http://127.0.0.1:8324/v1/models?agent=opencode&model=open-model', {
      headers: { Authorization: `Bearer ${TOKEN}`, Origin: 'http://127.0.0.1:8000' },
    }));
    expect(await models.json()).toMatchObject({ models: [expect.objectContaining({ id: 'open-model' })] });
    expect(acp.getModelCatalog).toHaveBeenCalledWith({ model: 'open-model' });

    const response = await service.handleRequest(turnRequest({ agent: 'opencode', model: 'open-model' }));
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const buffer = { value: '' };
    const session = await nextEvent(reader, decoder, buffer);
    expect(session).toMatchObject({ type: 'session', model: 'open-model' });
    expect(session.threadId).toMatch(/^v3\.opencode\./);
    expect(await nextEvent(reader, decoder, buffer)).toEqual({ type: 'text_delta', delta: 'From OpenCode' });
    expect(await nextEvent(reader, decoder, buffer)).toEqual({ type: 'done', finishReason: 'end_turn' });
    expect(acp.ensureSession.mock.calls[0][0].mcpServers[0]).toMatchObject({ name: 'getbased', command: process.execPath });

    const resumed = await service.handleRequest(turnRequest({ agent: 'opencode', threadId: session.threadId }));
    const resumedReader = resumed.body.getReader();
    const resumedBuffer = { value: '' };
    expect(await nextEvent(resumedReader, decoder, resumedBuffer)).toMatchObject({ type: 'session', resumed: true });
    expect(acp.ensureSession).toHaveBeenLastCalledWith(expect.objectContaining({ requestedSessionId: 'acp/session:1' }));
    await nextEvent(resumedReader, decoder, resumedBuffer);
    await nextEvent(resumedReader, decoder, resumedBuffer);

    const restartedService = createAgentHostService({
      appServer: null, token: TOKEN, workspaceRoot: '/tmp/agent-test-new', bundlePath: '/tmp/getbased-companion.mjs',
      agents: [{ id: 'opencode', name: 'OpenCode', description: 'Agent', protocol: 'acp', client: acp }],
    });
    const stale = await restartedService.handleRequest(turnRequest({ agent: 'opencode', threadId: session.threadId }));
    expect(stale.status).toBe(400);
    expect(await stale.json()).toEqual({ error: 'invalid_thread_session' });
  });

  it('pauses and resumes new AI work through the authenticated control endpoint', async () => {
    const appServer = new FakeAppServer();
    const service = createAgentHostService({
      appServer, token: TOKEN, workspaceRoot: '/tmp/agent-test',
      runtimeInfo: () => ({ companionVersion: '1.0.0', runtimeMode: 'installed', platform: 'linux' }),
    });
    const control = action => service.handleRequest(new Request('http://127.0.0.1:8324/v1/control', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:8000' },
      body: JSON.stringify({ action }),
    }));

    const paused = await control('pause');
    expect(await paused.json()).toMatchObject({
      state: 'paused', paused: true, companionVersion: '1.0.0', runtimeMode: 'installed',
    });
    const blockedTurn = await service.handleRequest(turnRequest());
    expect(blockedTurn.status).toBe(503);
    expect(await blockedTurn.json()).toEqual({ error: 'companion_paused' });
    const resumed = await control('resume');
    expect(await resumed.json()).toMatchObject({ state: 'running', paused: false });
  });

  it('delegates installation controls but rejects them while a turn is active', async () => {
    const appServer = new FakeAppServer();
    const controlHandler = vi.fn(async action => ({ action, installed: true }));
    const service = createAgentHostService({
      appServer, token: TOKEN, workspaceRoot: '/tmp/agent-test', controlHandler,
    });
    const request = action => service.handleRequest(new Request('http://127.0.0.1:8324/v1/control', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:8000' },
      body: JSON.stringify({ action }),
    }));
    const installed = await request('install');
    expect(await installed.json()).toMatchObject({ action: 'install', installed: true });
    expect(controlHandler).toHaveBeenCalledWith('install', { origin: 'http://127.0.0.1:8000' });

    const turn = await service.handleRequest(turnRequest());
    const reader = turn.body.getReader();
    await nextEvent(reader, new TextDecoder(), { value: '' });
    const blocked = await request('uninstall');
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({ error: 'finish_the_active_response_first' });
    appServer.emit('notification', {
      method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } },
    });
  });

  it('starts a read-only Codex turn and relays text and completion', async () => {
    const appServer = new FakeAppServer();
    const service = createAgentHostService({ appServer, token: TOKEN, workspaceRoot: '/tmp/agent-test' });
    const response = await service.handleRequest(turnRequest({ model: 'gpt-5.6-sol', effort: 'high' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:8000');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const buffer = { value: '' };
    const session = await nextEvent(reader, decoder, buffer);
    expect(session).toMatchObject({ type: 'session', turnId: 'turn-1' });
    expect(session.threadId).toMatch(/^v1\.thread-1\.[A-Za-z0-9_-]{43}$/);

    const start = appServer.requests.find(entry => entry.method === 'thread/start');
    expect(start.params).toMatchObject({
      sandbox: 'read-only',
      approvalPolicy: 'never',
      runtimeWorkspaceRoots: [],
      environments: [],
    });
    expect(start.params.dynamicTools.map(tool => tool.name)).toEqual(['getbased_lab_context']);
    const turn = appServer.requests.find(entry => entry.method === 'turn/start');
    expect(turn.params).toMatchObject({ model: 'gpt-5.6-sol', effort: 'high' });

    appServer.emit('notification', {
      method: 'model/rerouted',
      params: { threadId: 'thread-1', turnId: 'turn-1', fromModel: 'gpt-5.6-sol', toModel: 'gpt-5.6-terra' },
    });
    expect(await nextEvent(reader, decoder, buffer)).toEqual({ type: 'model', model: 'gpt-5.6-terra' });
    appServer.emit('notification', {
      method: 'item/started',
      params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'webSearch', query: 'generic research' } },
    });
    expect(await nextEvent(reader, decoder, buffer)).toEqual({
      type: 'activity', activity: 'web_search', status: 'started', query: 'generic research',
    });
    appServer.emit('notification', {
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-1', turnId: 'turn-1', delta: 'Your ApoB improved.' },
    });
    expect(await nextEvent(reader, decoder, buffer)).toEqual({ type: 'text_delta', delta: 'Your ApoB improved.' });
    appServer.emit('notification', {
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } },
    });
    expect(await nextEvent(reader, decoder, buffer)).toEqual({ type: 'done', finishReason: 'stop' });
    expect((await reader.read()).done).toBe(true);
  });

  it('validates a temporary image upload and supplies it to a structured feature turn', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'getbased-agent-host-test-'));
    try {
      const appServer = new FakeAppServer();
      const service = createAgentHostService({ appServer, token: TOKEN, workspaceRoot });
      const upload = await service.handleRequest(new Request('http://127.0.0.1:8324/v1/uploads', {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'image/png', Origin: 'http://127.0.0.1:8000' },
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      }));
      expect(upload.status).toBe(201);
      const { uploadId } = await upload.json();

      const response = await service.handleRequest(turnRequest({
        purpose: 'feature', tools: [], imageUploadIds: [uploadId],
        outputSchema: { type: 'object', properties: { mealName: { type: 'string' } } },
      }));
      const reader = response.body.getReader();
      const buffer = { value: '' };
      await nextEvent(reader, new TextDecoder(), buffer);
      const turn = appServer.requests.find(entry => entry.method === 'turn/start');
      expect(turn.params.input[0]).toMatchObject({ type: 'localImage' });
      expect(existsSync(turn.params.input[0].path)).toBe(true);
      expect(turn.params.outputSchema).toMatchObject({ type: 'object' });
      expect(appServer.requests.find(entry => entry.method === 'thread/start').params.dynamicTools).toEqual([]);

      appServer.emit('notification', {
        method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } },
      });
      await nextEvent(reader, new TextDecoder(), buffer);
      await vi.waitFor(() => expect(existsSync(turn.params.input[0].path)).toBe(false));
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('injects bounded visible history only when starting a new Codex thread', async () => {
    const appServer = new FakeAppServer();
    const service = createAgentHostService({ appServer, token: TOKEN, workspaceRoot: '/tmp/agent-test' });
    const response = await service.handleRequest(turnRequest({
      history: [
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Earlier answer' },
      ],
    }));
    const reader = response.body.getReader();
    const buffer = { value: '' };
    await nextEvent(reader, new TextDecoder(), buffer);
    expect(appServer.requests).toContainEqual({
      method: 'thread/inject_items',
      params: {
        threadId: 'thread-1',
        items: [
          { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Earlier question' }] },
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Earlier answer' }] },
        ],
      },
    });
    appServer.emit('notification', {
      method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } },
    });
    await nextEvent(reader, new TextDecoder(), buffer);
  });

  it('round-trips an allowlisted dynamic tool and declines other requests', async () => {
    vi.useFakeTimers();
    const appServer = new FakeAppServer();
    const service = createAgentHostService({ appServer, token: TOKEN, workspaceRoot: '/tmp/agent-test' });
    const response = await service.handleRequest(turnRequest());
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const buffer = { value: '' };
    await nextEvent(reader, decoder, buffer);

    appServer.emit('serverRequest', {
      id: 41,
      method: 'item/tool/call',
      params: {
        threadId: 'thread-1', turnId: 'turn-1', callId: 'call-1',
        tool: 'getbased_lab_context', namespace: null, arguments: {},
      },
    });
    const toolCall = await nextEvent(reader, decoder, buffer);
    expect(toolCall).toMatchObject({ type: 'tool_call', tool: 'getbased_lab_context' });

    const toolResponse = await service.handleRequest(new Request(`http://127.0.0.1:8324/v1/responses/${toolCall.responseId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, contentItems: [{ type: 'inputText', text: 'ApoB: 80 mg/dL' }] }),
    }));
    expect(toolResponse.status).toBe(200);
    expect(appServer.responses).toContainEqual({
      id: 41,
      result: { success: true, contentItems: [{ type: 'inputText', text: 'ApoB: 80 mg/dL' }] },
    });

    appServer.emit('serverRequest', { id: 42, method: 'item/commandExecution/requestApproval', params: {} });
    expect(appServer.responses).toContainEqual({ id: 42, result: { decision: 'decline' } });
    vi.useRealTimers();
    appServer.emit('notification', {
      method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } },
    });
    await nextEvent(reader, decoder, buffer);
  });

  it('does not resume an unsigned Codex thread identifier', async () => {
    const appServer = new FakeAppServer();
    const service = createAgentHostService({ appServer, token: TOKEN, workspaceRoot: '/tmp/agent-test' });
    const response = await service.handleRequest(turnRequest({ threadId: 'thread-from-another-client' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_thread_session' });
    expect(appServer.requests).toEqual([]);
  });

  it('resumes only a host-signed thread handle', async () => {
    const appServer = new FakeAppServer();
    const service = createAgentHostService({ appServer, token: TOKEN, workspaceRoot: '/tmp/agent-test' });
    const first = await service.handleRequest(turnRequest());
    const firstReader = first.body.getReader();
    const firstBuffer = { value: '' };
    const session = await nextEvent(firstReader, new TextDecoder(), firstBuffer);
    appServer.emit('notification', {
      method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } },
    });
    await nextEvent(firstReader, new TextDecoder(), firstBuffer);

    const second = await service.handleRequest(turnRequest({ threadId: session.threadId }));
    const secondReader = second.body.getReader();
    const secondBuffer = { value: '' };
    await nextEvent(secondReader, new TextDecoder(), secondBuffer);
    expect(appServer.requests).toContainEqual({
      method: 'thread/resume',
      params: expect.objectContaining({ threadId: 'thread-1', sandbox: 'read-only', runtimeWorkspaceRoots: [] }),
    });
    appServer.emit('notification', {
      method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } },
    });
    await nextEvent(secondReader, new TextDecoder(), secondBuffer);
  });
});
