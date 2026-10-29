// @vitest-environment node
import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { createAgentHostService } from '../lib/agent-host-service.js';
import { streamAgentTurn } from '../js/agent-chat-client.js';
import type { AgentHostServiceOptions } from '../lib/agent-host-turn-state.js';

const TOKEN = 'synthetic-test-token';
const GENERIC_ERROR = 'The agent request failed. Check the Companion and selected agent, then try again.';
const SCHEMA_ERROR = 'Codex rejected the output schema. Update getbased and the Companion, then retry.';
const PRIVATE_ERROR = 'secret-token /home/private/report.pdf glucose: 123\n at private.js:45';

function fixture() {
  const appServer = Object.assign(new EventEmitter(), {
    initialize: vi.fn(async () => ({})),
    request: vi.fn(async (method: string) => {
      if (method === 'thread/start') return { thread: { id: 'thread-1' } };
      if (method === 'turn/start') return { turn: { id: 'turn-1' } };
      if (method === 'turn/interrupt') return {};
      throw new Error(`Unexpected test request: ${method}`);
    }),
    respond: vi.fn(),
  });
  const service = createAgentHostService({ appServer: appServer as unknown as AgentHostServiceOptions['appServer'], token: TOKEN, workspaceRoot: '/tmp/agent-test' });
  const request = (tools: unknown[] = []) => new Request('http://127.0.0.1:8324/v1/turns', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Synthetic report', purpose: 'feature', tools }),
  });
  const notify = (method: string, params: Record<string, unknown>) => appServer.emit('notification', {
    method, params: { threadId: 'thread-1', turnId: 'turn-1', ...params },
  });
  const start = async (tools: unknown[] = []) => {
    const response = await service.handleRequest(request(tools));
    const reader = response.body!.getReader();
    expect(await readEvent(reader)).toMatchObject({ type: 'session' });
    return reader;
  };
  return { appServer, service, request, notify, start };
}
async function readEvent(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value, done } = await reader.read();
  if (done) throw new Error('Test stream ended before the expected event');
  return JSON.parse(new TextDecoder().decode(value)) as Record<string, unknown>;
}
afterEach(() => vi.unstubAllGlobals());

it.each([
  [{ message: `invalid_json_schema: Missing labName. ${PRIVATE_ERROR}`, codexErrorInfo: 'badRequest', additionalDetails: PRIVATE_ERROR }, SCHEMA_ERROR],
  [{ message: `unsupported_value for reasoning_effort: ${PRIVATE_ERROR}`, codexErrorInfo: 'badRequest' }, 'Codex rejected the reasoning effort. Choose a supported effort in AI settings and retry.'],
  [{ message: PRIVATE_ERROR, codexErrorInfo: 'unauthorized' }, 'Codex could not authenticate. Sign in to the Codex CLI and retry.'],
  [{ message: PRIVATE_ERROR, codexErrorInfo: 'rateLimitExceeded' }, 'Codex reached a rate limit. Wait before retrying.'],
  [{ message: PRIVATE_ERROR }, GENERIC_ERROR],
  [null, GENERIC_ERROR],
])('reports a failed turn safely instead of returning successful empty output: %j', async (error, message) => {
  const f = fixture();
  const reader = await f.start();
  f.notify('turn/completed', { turn: { id: 'turn-1', status: 'failed', error } });
  expect(await readEvent(reader)).toEqual({ type: 'error', message });
  expect((await reader.read()).done).toBe(true);
});

it('forwards a terminal error notification and releases the active request even without a completion event', async () => {
  const f = fixture();
  const reader = await f.start();
  f.notify('error', { willRetry: false, error: { message: 'invalid_json_schema', additionalDetails: PRIVATE_ERROR } });
  expect(await readEvent(reader)).toEqual({ type: 'error', message: SCHEMA_ERROR });
  expect((await reader.read()).done).toBe(true);
  const response = await f.service.handleRequest(new Request('http://127.0.0.1:8324/v1/control', {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'pause' }),
  }));
  expect(response.status).toBe(200);
  // A late completion cannot emit another terminal result.
  f.notify('turn/completed', { turn: { id: 'turn-1', status: 'failed' } });
});

it('ignores retryable and unrelated errors and lets a recovered turn finish successfully', async () => {
  const f = fixture();
  const reader = await f.start();
  f.notify('error', { willRetry: true, error: { message: PRIVATE_ERROR } });
  f.notify('error', { turnId: 'retired-turn', willRetry: false, error: { message: PRIVATE_ERROR } });
  f.notify('error', { threadId: 'another-thread', willRetry: false, error: { message: PRIVATE_ERROR } });
  f.notify('turn/completed', { turnId: 'retired-turn', turn: { id: 'retired-turn', status: 'failed' } });
  f.notify('item/agentMessage/delta', { delta: '{"ok":true}' });
  f.notify('turn/completed', { turn: { id: 'turn-1', status: 'completed' } });
  expect(await readEvent(reader)).toEqual({ type: 'text_delta', delta: '{"ok":true}' });
  expect(await readEvent(reader)).toEqual({ type: 'done', finishReason: 'stop' });
  expect((await reader.read()).done).toBe(true);
});

it('rejects an interrupted turn instead of accepting its partial text', async () => {
  const f = fixture();
  const reader = await f.start();
  f.notify('item/agentMessage/delta', { delta: '{\"markers\":[]}' });
  expect(await readEvent(reader)).toMatchObject({ type: 'text_delta' });
  f.notify('turn/completed', { turn: { id: 'turn-1', status: 'interrupted' } });
  expect(await readEvent(reader)).toEqual({ type: 'error', message: 'The CLI agent response was interrupted. Please retry.' });
});

it('carries a safe schema failure through the actual host and browser client', async () => {
  const f = fixture();
  vi.stubGlobal('fetch', vi.fn(async () => f.service.handleRequest(f.request())));
  const result = streamAgentTurn({ endpoint: 'http://127.0.0.1:8324', token: TOKEN, prompt: 'Synthetic report', purpose: 'feature', tools: [] });
  const rejected = expect(result).rejects.toThrow(SCHEMA_ERROR);
  await vi.waitFor(() => expect(f.appServer.request).toHaveBeenCalledWith('turn/start', expect.anything()));
  f.notify('turn/completed', { turn: { id: 'turn-1', status: 'failed', error: { message: 'invalid_json_schema' } } });
  await rejected;
});

it('releases pending tool requests on a terminal error', async () => {
  const f = fixture();
  const reader = await f.start([{ type: 'function', name: 'getbased_lab_context', description: 'Read synthetic context', inputSchema: { type: 'object' } }]);
  f.appServer.emit('serverRequest', { id: 41, method: 'item/tool/call', params: {
    threadId: 'thread-1', turnId: 'turn-1', tool: 'getbased_lab_context', arguments: {},
  } });
  expect(await readEvent(reader)).toMatchObject({ type: 'tool_call' });
  f.notify('error', { willRetry: false, error: { message: PRIVATE_ERROR } });
  expect(await readEvent(reader)).toEqual({ type: 'error', message: GENERIC_ERROR });
  expect(f.appServer.respond).toHaveBeenCalledWith(41, {
    success: false, contentItems: [{ type: 'inputText', text: 'Error: The agent turn ended before this tool completed.' }],
  });
});

it('classifies a rejected start RPC without exposing its raw provider error', async () => {
  const f = fixture();
  f.appServer.request.mockResolvedValueOnce({ thread: { id: 'thread-1' } })
    .mockRejectedValueOnce(new Error(`invalid_json_schema: ${PRIVATE_ERROR}`));
  const response = await f.service.handleRequest(f.request());
  const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  expect(events).toEqual([{ type: 'error', message: SCHEMA_ERROR }]);
});
