// @vitest-environment node

import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { extractClaudeStreamEvent, getClaudeModelCatalog } from '../lib/claude-agent-client.js';
import { ClaudeAgentClient } from '../lib/claude-agent-client.js';

describe('Claude Code adapter', () => {
  it('offers alias models with image and reasoning metadata', () => {
    const models = getClaudeModelCatalog();
    expect(models.map(model => model.id)).toEqual(expect.arrayContaining(['sonnet', 'opus', 'fable']));
    expect(models[0]).toMatchObject({ inputModalities: ['text', 'image'] });
    expect(models[0].supportedReasoningEfforts.map(item => item.reasoningEffort))
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
    let capturedArgs = [];
    let mcpPath = '';
    let promptPath = '';
    const spawnImpl = vi.fn((command, args) => {
      capturedArgs = args;
      mcpPath = args[args.indexOf('--mcp-config') + 1];
      promptPath = args[args.indexOf('--system-prompt-file') + 1];
      expect(command).toBe('claude');
      expect(JSON.parse(readFileSync(mcpPath, 'utf8'))).toMatchObject({
        mcpServers: { getbased: { env: { GETBASED_MCP_TOKEN: 'private-mcp-token' } } },
      });
      expect(readFileSync(promptPath, 'utf8')).toBe('Custom & private instructions');
      const child = new EventEmitter();
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
    const client = new ClaudeAgentClient({ command: 'claude', cwd: '/tmp', spawnImpl });

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
