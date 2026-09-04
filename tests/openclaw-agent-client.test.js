// @vitest-environment node

import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOpenClawTurnConfig, extractOpenClawResult, normalizeOpenClawModelCatalog, OpenClawAgentClient,
} from '../lib/openclaw-agent-client.js';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'getbased-openclaw-test-'));
  roots.push(cwd);
  return cwd;
}

function fakeChild(payload, stdio, code = 0, stderrText = '') {
  const child = new EventEmitter();
  child.kill = vi.fn();
  setImmediate(() => {
    if (payload !== undefined) writeSync(stdio[1], typeof payload === 'string' ? payload : JSON.stringify(payload));
    if (stderrText) writeSync(stdio[2], stderrText);
    child.emit('exit', code);
  });
  return child;
}

const modelPayload = {
  models: [
    { key: 'openai/gpt-5.6-sol', name: 'GPT-5.6 Sol', available: true, missing: false, tags: ['default', 'configured'] },
    { key: 'ollama/qwen3.5:9b', name: 'Qwen 3.5', available: true, local: true, tags: [] },
    { key: 'missing/model', name: 'Missing', available: false, missing: true, tags: [] },
  ],
};

describe('OpenClaw agent adapter', () => {
  it('normalizes models, thinking levels, and the text-only boundary', () => {
    const catalog = normalizeOpenClawModelCatalog(modelPayload);
    expect(catalog).toHaveLength(2);
    expect(catalog[0]).toMatchObject({
      id: 'openai/gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true, inputModalities: ['text'],
    });
    expect(catalog[0].supportedReasoningEfforts.map(item => item.reasoningEffort))
      .toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'adaptive']);
  });

  it('creates a restrictive turn-scoped config', () => {
    expect(buildOpenClawTurnConfig({ mcpServers: { getbased: {
      type: 'stdio', command: '/usr/bin/node', args: ['/app/bridge.mjs', 'mcp-bridge'],
      env: { GETBASED_MCP_TOKEN: 'private-token' },
    } } }, ['getbased_lab_context'])).toEqual({
      tools: { allow: ['web_search', 'web_fetch', 'getbased__*'] },
      mcp: { servers: { getbased: {
        command: '/usr/bin/node', args: ['/app/bridge.mjs', 'mcp-bridge'],
        env: { GETBASED_MCP_TOKEN: 'private-token' }, enabled: true,
        toolFilter: { include: ['getbased_lab_context'] },
      } } },
    });
  });

  it('reads the OpenClaw catalog through its stable JSON command', async () => {
    const cwd = fixture();
    const spawnImpl = vi.fn((command, args, options) => fakeChild(modelPayload, options.stdio));
    const client = new OpenClawAgentClient({ command: '/opt/openclaw', cwd, env: { HOME: cwd }, spawnImpl });
    await expect(client.getModelCatalog()).resolves.toHaveLength(2);
    expect(spawnImpl).toHaveBeenCalledWith('/opt/openclaw', ['models', 'list', '--json'], expect.objectContaining({
      cwd, stdio: ['ignore', expect.any(Number), expect.any(Number)],
    }));
  });

  it('keeps health context and MCP credentials out of argv and cleans private files', async () => {
    const cwd = fixture();
    let observedConfig;
    let observedPrompt = '';
    const spawnImpl = vi.fn((command, args, spawnOptions) => {
      const configPath = args[args.indexOf('--config') + 1];
      const promptPath = args[args.indexOf('--message-file') + 1];
      observedConfig = JSON.parse(readFileSync(configPath, 'utf8'));
      observedPrompt = readFileSync(promptPath, 'utf8');
      return fakeChild({
        ok: true, status: 'ok', final: 'All set.', provider: 'openai', model: 'gpt-5.6-sol',
        sessionId: 'openclaw-private-session', usage: { input: 120, output: 8, total: 128 },
      }, spawnOptions.stdio);
    });
    const client = new OpenClawAgentClient({ command: '/opt/openclaw', cwd, env: { HOME: cwd }, spawnImpl });
    client.modelCatalogPromise = Promise.resolve(normalizeOpenClawModelCatalog(modelPayload));
    const onEvent = vi.fn();
    await client.prompt({
      sessionId: 'getbased-session', model: 'openai/gpt-5.6-sol', effort: 'xhigh',
      instructions: 'Private health instructions', prompt: [{ type: 'text', text: 'Sensitive health question' }],
      outputSchema: null, allowedToolNames: ['getbased_lab_context'], signal: new AbortController().signal,
      mcpConfig: { mcpServers: { getbased: {
        command: process.execPath, args: ['/app/bridge.mjs', 'mcp-bridge'],
        env: { GETBASED_MCP_ENDPOINT: 'http://127.0.0.1:8324', GETBASED_MCP_TOKEN: 'private-token' },
      } } }, onEvent,
    });

    const argv = spawnImpl.mock.calls[0][1];
    expect(argv).toEqual(expect.arrayContaining([
      'agent', 'exec', '--code-mode', 'direct', '--json', '--model', 'openai/gpt-5.6-sol', '--thinking', 'xhigh',
    ]));
    expect(argv.join(' ')).not.toContain('private-token');
    expect(argv.join(' ')).not.toContain('Sensitive health question');
    expect(observedConfig).toMatchObject({
      tools: { allow: ['web_search', 'web_fetch', 'getbased__*'] },
      mcp: { servers: { getbased: { env: { GETBASED_MCP_TOKEN: 'private-token' } } } },
    });
    expect(observedPrompt).toContain('Private health instructions');
    expect(observedPrompt).toContain('Sensitive health question');
    expect(onEvent.mock.calls.map(call => call[0])).toEqual([
      { type: 'session', sessionId: 'getbased-session', model: 'openai/gpt-5.6-sol' },
      { type: 'text_delta', delta: 'All set.' },
      { type: 'usage', inputTokens: 120, outputTokens: 8 },
      { type: 'done', finishReason: 'stop' },
    ]);
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('routes a personal-agent turn through the configured gateway without a temporary config overlay', async () => {
    const cwd = fixture();
    let observedPrompt = '';
    const spawnImpl = vi.fn((command, args, spawnOptions) => {
      if (args[0] === 'models') return fakeChild(modelPayload, spawnOptions.stdio);
      const promptPath = args[args.indexOf('--message-file') + 1];
      observedPrompt = readFileSync(promptPath, 'utf8');
      return fakeChild({
        ok: true, status: 'ok', final: 'From my personal agent.', provider: 'openai', model: 'gpt-5.6-sol',
        sessionId: 'gateway-session', usage: { input: 10, output: 5 },
      }, spawnOptions.stdio);
    });
    const client = new OpenClawAgentClient({
      command: '/opt/openclaw', cwd, env: { HOME: cwd, OPENCLAW_CONFIG_PATH: '/private/openclaw.json' },
      spawnImpl, mode: 'gateway', gatewayAgentId: 'main',
    });
    client.modelCatalogPromise = Promise.resolve(normalizeOpenClawModelCatalog(modelPayload));
    await client.prompt({
      sessionId: 'getbased-personal-session', model: 'openai/gpt-5.6-sol', effort: 'medium',
      instructions: 'Keep your configured identity.', prompt: [{ type: 'text', text: 'Who is there?' }],
      outputSchema: null, mcpConfig: {}, allowedToolNames: [], onEvent: vi.fn(),
    });
    const [command, args, options] = spawnImpl.mock.calls[0];
    expect(command).toBe('/opt/openclaw');
    expect(args).toEqual(expect.arrayContaining([
      'agent', '--agent', 'main', '--session-id', 'getbased-personal-session', '--message-file', expect.any(String),
      '--json', '--model', 'openai/gpt-5.6-sol', '--thinking', 'medium',
    ]));
    expect(args).not.toContain('exec');
    expect(args).not.toContain('--config');
    expect(options.env.OPENCLAW_CONFIG_PATH).toBe('/private/openclaw.json');
    expect(observedPrompt).toContain('Keep your configured identity.');
    expect(observedPrompt).toContain('Who is there?');
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('rejects failed envelopes', () => {
    expect(() => extractOpenClawResult({ ok: false, status: 'error', error: { message: 'Provider unavailable' } }))
      .toThrow('Provider unavailable');
  });

  it('fails closed when an image reaches the text-only headless interface', async () => {
    const cwd = fixture();
    const client = new OpenClawAgentClient({ command: '/opt/openclaw', cwd, env: { HOME: cwd } });
    client.modelCatalogPromise = Promise.resolve(normalizeOpenClawModelCatalog(modelPayload));
    await expect(client.prompt({
      instructions: '', prompt: [{ type: 'image', source: { type: 'base64', data: 'abc' } }],
      mcpConfig: {}, allowedToolNames: [], onEvent: vi.fn(),
    })).rejects.toThrow('image input is not available');
    expect(existsSync(cwd)).toBe(true);
    expect(readdirSync(cwd)).toEqual([]);
  });
});
