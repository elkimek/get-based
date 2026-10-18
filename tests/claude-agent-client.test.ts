// @vitest-environment node

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AgentUsage } from '../lib/agent-turn-types.js';
import { EventEmitter, once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { extractClaudeStreamEvent, getClaudeModelCatalog } from '../lib/claude-agent-client.js';
import { ClaudeAgentClient } from '../lib/claude-agent-client.js';

describe('Claude Agent adapter', () => {
  it('offers alias models with image and reasoning metadata', () => {
    const models = getClaudeModelCatalog();
    expect(models.map(model => model.id)).toEqual(expect.arrayContaining(['sonnet', 'opus', 'fable']));
    expect(models[0]).toMatchObject({ inputModalities: ['text', 'image'] });
    expect(models[0]!.supportedReasoningEfforts.map(item => item.reasoningEffort))
      .toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('maps init, partial text, usage, and result events', () => {
    expect(extractClaudeStreamEvent({ type: 'system', subtype: 'init', session_id: 'session-1', model: 'sonnet' }))
      .toEqual({ type: 'session', sessionId: 'session-1', model: 'sonnet' });
    expect(extractClaudeStreamEvent({ type: 'stream_event', event: {
      type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' },
    } })).toEqual({ type: 'text_delta', delta: 'Hello' });
    expect(extractClaudeStreamEvent({ type: 'result', subtype: 'success', session_id: 'session-1' }))
      .toMatchObject({ type: 'done', finishReason: 'success', sessionId: 'session-1' });
  });

  it('keeps MCP credentials and custom instructions out of process arguments', async () => {
    let capturedArgs: readonly string[] = [];
    let mcpPath = '';
    let promptPath = '';
    const spawnImpl = vi.fn((command: string, args: readonly string[]) => {
      capturedArgs = args;
      mcpPath = args[args.indexOf('--mcp-config') + 1]!;
      promptPath = args[args.indexOf('--system-prompt-file') + 1]!;
      expect(command).toBe('node');
      expect(args.slice(0, 2)).toEqual(['C:\\cli\\claude.js', '-p']);
      expect(JSON.parse(readFileSync(mcpPath, 'utf8'))).toMatchObject({
        mcpServers: { getbased: { env: { GETBASED_MCP_TOKEN: 'private-mcp-token' } } },
      });
      expect(readFileSync(promptPath, 'utf8')).toBe('Custom & private instructions');
      const child = new EventEmitter() as ChildProcessWithoutNullStreams & { stdout: PassThrough };
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      queueMicrotask(() => {
        child.stdout.end(`${JSON.stringify({ type: 'result', subtype: 'success', session_id: 'session-1', result: 'Done' })}\n`);
        child.emit('exit', 0);
      });
      return child;
    });
    const client = new ClaudeAgentClient({ command: 'node', args: ['C:\\cli\\claude.js'], cwd: '/tmp', spawnImpl });

    await client.prompt({
      prompt: [{ type: 'text', text: 'Hello' }],
      instructions: 'Custom & private instructions',
      mcpConfig: { mcpServers: { getbased: { env: { GETBASED_MCP_TOKEN: 'private-mcp-token' } } } },
      allowedToolNames: ['getbased_lab_context'],
      onEvent: vi.fn(),
    });

    expect(capturedArgs).not.toContain('private-mcp-token');
    expect(capturedArgs).not.toContain('Custom & private instructions');
    expect(existsSync(mcpPath)).toBe(false);
    expect(existsSync(promptPath)).toBe(false);
  });
});

describe('Claude event protocol boundaries', () => {
  it.each([null, {}, { type: 'unknown' }, { type: 'stream_event' }, { type: 'stream_event', event: { type: 'content_block_delta' } }])('ignores unsupported or incomplete event %j', message => {
    expect(extractClaudeStreamEvent(message)).toBeNull();
  });
  it('normalizes missing session metadata and non-text deltas', () => {
    expect(extractClaudeStreamEvent({ type: 'system', subtype: 'init', session_id: 42 }))
      .toEqual({ type: 'session', sessionId: '', model: '' });
    expect(extractClaudeStreamEvent({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 42 } } }))
      .toEqual({ type: 'text_delta', delta: '' });
  });
  it.each([{}, { input_tokens: 4, output_tokens: 9 }])('reports usage with defaults for missing counters: %j', (usage: AgentUsage) => {
    expect(extractClaudeStreamEvent({ type: 'stream_event', event: { type: 'message_delta', usage } }))
      .toEqual({ type: 'usage', inputTokens: usage.input_tokens || 0, outputTokens: usage.output_tokens || 0 });
  });
  it.each([{ result: 'denied' }, { error: 'denied' }, {}])('reports an error result without success text: %j', (details: { result?: unknown; error?: unknown }) => {
    expect(extractClaudeStreamEvent({ type: 'result', is_error: true, ...details }))
      .toMatchObject({ type: 'error', message: details.result || details.error || '', resultText: '', finishReason: '' });
  });
});

type SyntheticClaudeChild = ChildProcessWithoutNullStreams & {stdout: PassThrough; stderr: PassThrough};

it.each([
  {stderr: 'late CLI failure', code: 7, message: 'late CLI failure'},
  {stderr: '', code: 7, message: 'Claude Agent exited with code 7.'},
  {stderr: '', code: null, message: 'Claude Agent exited with code unknown.'},
])('rejects late process failure after stdout drains: $message', async ({stderr, code, message}) => {
  const cwd = mkdtempSync(join(tmpdir(), 'getbased-claude-late-exit-'));
  let child: SyntheticClaudeChild | undefined;
  const spawnImpl = vi.fn(() => {
    const process = new EventEmitter() as SyntheticClaudeChild;
    process.stdin = new PassThrough(); process.stdout = new PassThrough(); process.stderr = new PassThrough(); process.kill = vi.fn();
    child = process; return process;
  });
  const client = new ClaudeAgentClient({command: 'synthetic-claude', cwd, spawnImpl});
  try {
    let settled = false;
    const pending = client.prompt({prompt: [], instructions: 'synthetic only', mcpConfig: {}, allowedToolNames: [], onEvent: vi.fn()});
    void pending.then(() => {settled = true;}, () => {settled = true;});
    const rejection = expect(pending).rejects.toThrow(message);
    await vi.waitFor(() => expect(child).toBeDefined());
    const drained = once(child!.stdout, 'end');
    child!.stdout.end();
    await drained;
    // Yield one event-loop turn so the completed stdout iterator wins the race.
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(settled).toBe(false);
    if (stderr) child!.stderr.write(stderr);
    child!.emit('exit', code); child!.emit('close', code);
    await rejection;
    expect(client.children.size).toBe(0);
    expect(client.cancellations.size).toBe(0);
    expect(readdirSync(cwd)).toEqual([]);
  } finally {await client.close(); rmSync(cwd, {recursive: true, force: true});}
});
