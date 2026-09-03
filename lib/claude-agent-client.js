// @ts-check
// Restricted, non-interactive Claude Code adapter for the getbased companion.

import { randomUUID } from 'node:crypto';
import { spawn as spawnChild } from 'node:child_process';
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
  /** @param {{command: string, cwd: string, env?: NodeJS.ProcessEnv, spawnImpl?: typeof spawnChild}} options */
  constructor(options) {
    this.command = options.command;
    this.cwd = options.cwd;
    this.env = options.env;
    this.spawnImpl = options.spawnImpl || spawnChild;
    this.children = new Set();
  }

  async getModelCatalog() { return getClaudeModelCatalog(); }

  /**
   * @param {{sessionId?: string, prompt: any[], model?: string, effort?: string, instructions: string, outputSchema?: any, mcpConfig: any, allowedToolNames: string[], signal?: AbortSignal, onEvent: (event: any) => void}} options
   */
  async prompt(options) {
    const sessionId = options.sessionId || randomUUID();
    const args = [
      '-p', '--input-format', 'stream-json', '--output-format', 'stream-json',
      '--include-partial-messages', '--verbose', '--restricted', '--strict-mcp-config',
      '--mcp-config', JSON.stringify(options.mcpConfig), '--disable-slash-commands', '--no-chrome',
      '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--tools', '',
      '--system-prompt', options.instructions,
      ...(options.allowedToolNames.length ? ['--allowedTools', options.allowedToolNames.map(name => `mcp__getbased__${name}`).join(',')] : []),
      ...(options.model ? ['--model', options.model] : []),
      ...(options.effort ? ['--effort', options.effort] : []),
      ...(options.outputSchema ? ['--json-schema', JSON.stringify(options.outputSchema)] : []),
      ...(options.sessionId ? ['--resume', sessionId] : ['--session-id', sessionId]),
    ];
    const child = this.spawnImpl(this.command, args, {
      cwd: this.cwd, env: this.env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.children.add(child);
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = `${stderr}${String(chunk)}`.slice(-4_000); });
    const completion = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => {
        this.children.delete(child);
        if (code === 0) resolve(undefined);
        else reject(new Error(stderr.trim() || `Claude Code exited with code ${code ?? 'unknown'}.`));
      });
    });
    const abort = () => child.kill('SIGTERM');
    options.signal?.addEventListener('abort', abort, { once: true });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let sawText = false;
    const input = { type: 'user', message: { role: 'user', content: options.prompt } };
    child.stdin.end(`${JSON.stringify(input)}\n`);
    try {
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
      await completion;
      return { sessionId };
    } finally {
      options.signal?.removeEventListener('abort', abort);
    }
  }

  async restart() {
    for (const child of this.children) child.kill('SIGTERM');
    this.children.clear();
  }

  async close() { await this.restart(); }
}
