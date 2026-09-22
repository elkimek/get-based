// @ts-check
// Restricted, non-interactive Claude Agent adapter for the getbased companion.

import { assertAgentNotAborted, observeAgentProcess } from './agent-process-lifecycle.js';
import { randomUUID } from 'node:crypto';
import { spawn as spawnChild } from 'node:child_process';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const CLAUDE_MODELS = Object.freeze([
  Object.freeze({ id: 'sonnet', model: 'sonnet', displayName: 'Sonnet (latest)', isDefault: true }),
  Object.freeze({ id: 'opus', model: 'opus', displayName: 'Opus (latest)' }),
  Object.freeze({ id: 'fable', model: 'fable', displayName: 'Fable (latest)' }),
]);
const CLAUDE_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

export function getClaudeModelCatalog() {
  return CLAUDE_MODELS.map(model => ({
    ...model,
    inputModalities: ['text', 'image'],
    defaultReasoningEffort: 'high',
    supportedReasoningEfforts: CLAUDE_EFFORTS.map(reasoningEffort => ({ reasoningEffort, description: '' })),
  }));
}

/** @param {unknown} value */
function text(value) { return typeof value === 'string' ? value : ''; }

/** @param {any} message */
export function extractClaudeStreamEvent(message) {
  if (message?.type === 'system' && message?.subtype === 'init') {
    return { type: 'session', sessionId: text(message.session_id), model: text(message.model) };
  }
  if (message?.type === 'stream_event') {
    const event = message.event || {};
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      return { type: 'text_delta', delta: text(event.delta.text) };
    }
    if (event.type === 'message_delta' && event.usage) {
      return { type: 'usage', inputTokens: Number(event.usage.input_tokens || 0), outputTokens: Number(event.usage.output_tokens || 0) };
    }
  }
  if (message?.type === 'result') {
    return {
      type: message.is_error ? 'error' : 'done',
      message: message.is_error ? text(message.result || message.error) : '',
      resultText: message.is_error ? '' : text(message.result),
      finishReason: message.is_error ? '' : text(message.subtype || 'stop'),
      sessionId: text(message.session_id),
      usage: message.usage || null,
    };
  }
  return null;
}

export class ClaudeAgentClient {
  /** @param {{command: string, args?: string[], cwd: string, env?: NodeJS.ProcessEnv, spawnImpl?: typeof spawnChild}} options */
  constructor(options) {
    this.command = options.command;
    this.args = options.args || [];
    this.cwd = options.cwd;
    this.env = options.env;
    this.spawnImpl = options.spawnImpl || spawnChild;
    this.children = new Set();
    this.cancellations = new Map();
  }

  async getModelCatalog() { return getClaudeModelCatalog(); }

  /**
   * @param {{sessionId?: string, prompt: any[], model?: string, effort?: string, instructions: string, outputSchema?: any, mcpConfig: any, allowedToolNames: string[], signal?: AbortSignal, onEvent: (event: any) => void}} options
   */
  async prompt(options) {
    assertAgentNotAborted(options.signal);
    const sessionId = options.sessionId || randomUUID();
    const privateId = randomUUID();
    const mcpConfigPath = join(this.cwd, `claude-mcp-${privateId}.json`);
    const systemPromptPath = join(this.cwd, `claude-system-${privateId}.txt`);
    const cleanup = () => Promise.all([
      unlink(mcpConfigPath).catch(() => {}), unlink(systemPromptPath).catch(() => {}),
    ]);
    let lifecycle;
    let child;
    let lines;
    try {
      const writes = await Promise.allSettled([
        writeFile(mcpConfigPath, JSON.stringify(options.mcpConfig), { mode: 0o600, flag: 'wx' }),
        writeFile(systemPromptPath, options.instructions, { mode: 0o600, flag: 'wx' }),
      ]);
      for (const result of writes) if (result.status === 'rejected') throw result.reason;
      assertAgentNotAborted(options.signal);
      const args = [
        ...this.args,
        '-p', '--input-format', 'stream-json', '--output-format', 'stream-json',
        '--include-partial-messages', '--verbose', '--restricted', '--strict-mcp-config',
        '--mcp-config', mcpConfigPath, '--disable-slash-commands', '--no-chrome',
        '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--tools', '',
        '--system-prompt-file', systemPromptPath,
        ...(options.allowedToolNames.length ? ['--allowedTools', options.allowedToolNames.map(name => `mcp__getbased__${name}`).join(',')] : []),
        ...(options.model ? ['--model', options.model] : []),
        ...(options.effort ? ['--effort', options.effort] : []),
        ...(options.outputSchema ? ['--json-schema', JSON.stringify(options.outputSchema)] : []),
        ...(options.sessionId ? ['--resume', sessionId] : ['--session-id', sessionId]),
      ];
      child = this.spawnImpl(this.command, args, {
        cwd: this.cwd, env: this.env, stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.children.add(child);
      let stderr = '';
      child.stderr.on('data', chunk => { stderr = `${stderr}${String(chunk)}`.slice(-4_000); });
      lifecycle = observeAgentProcess(child, options.signal);
      this.cancellations.set(child, lifecycle.stop);
      lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      let sawText = false;
      const input = { type: 'user', message: { role: 'user', content: options.prompt } };
      child.stdin.end(`${JSON.stringify(input)}\n`);
      const readOutput = async () => {
        for await (const line of lines) {
          if (!line.trim()) continue;
          let message;
          try { message = JSON.parse(line); } catch { continue; }
          const event = extractClaudeStreamEvent(message);
          if (event?.type === 'text_delta') sawText = true;
          if (event?.type === 'done' && !sawText && event.resultText) {
            sawText = true;
            options.onEvent({ type: 'text_delta', delta: event.resultText });
          }
          if (event) options.onEvent(event);
        }
      };
      // Process failure must interrupt a stdout iterator that never closes.
      await Promise.race([readOutput(), lifecycle.completion.then(code => {
        if (code !== 0) throw new Error(stderr.trim() || `Claude Agent exited with code ${code ?? 'unknown'}.`);
        return new Promise(() => {});
      })]);
      const code = await lifecycle.completion;
      if (code !== 0) throw new Error(stderr.trim() || `Claude Agent exited with code ${code ?? 'unknown'}.`);
      return { sessionId };
    } finally {
      lifecycle?.dispose(cleanup);
      lines?.close();
      child?.stdout.destroy();
      if (child) { this.children.delete(child); this.cancellations.delete(child); }
      await cleanup();
    }
  }

  async restart() {
    for (const child of this.children) this.cancellations.get(child)?.();
    this.children.clear();
  }

  async close() { await this.restart(); }
}
