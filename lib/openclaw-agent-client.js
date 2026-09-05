// @ts-check
// Restricted, one-shot OpenClaw adapter for the getbased companion.

import { spawn as spawnChild } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { open, unlink, writeFile } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { readBoundedFile } from './read-bounded-file.js';

const OPENCLAW_REASONING_EFFORTS = Object.freeze([
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'adaptive',
]);
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

/** @param {unknown} value @param {number} [max] */
function cleanText(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** @param {any} payload */
export function normalizeOpenClawModelCatalog(payload) {
  if (!Array.isArray(payload?.models)) return [];
  return payload.models.filter(model => model && typeof model === 'object'
    && model.available !== false && model.missing !== true).flatMap(model => {
    const id = cleanText(model.key || model.id, 160);
    if (!id) return [];
    const tags = Array.isArray(model.tags) ? model.tags.map(value => cleanText(value, 40)) : [];
    return [{
      id,
      model: id,
      displayName: cleanText(model.name, 180) || id,
      description: model.local === true ? 'Local model configured in OpenClaw' : 'Model configured in OpenClaw',
      isDefault: tags.includes('default'),
      defaultReasoningEffort: '',
      supportedReasoningEfforts: OPENCLAW_REASONING_EFFORTS.map(reasoningEffort => ({
        reasoningEffort, description: reasoningEffort === 'adaptive' ? 'Let OpenClaw choose dynamically.' : '',
      })),
      // OpenClaw's isolated agent-exec interface currently accepts text prompts only.
      inputModalities: ['text'],
    }];
  }).slice(0, 500);
}

/** @param {any} payload */
export function extractOpenClawResult(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('OpenClaw returned an invalid response.');
  if (payload.ok !== true || payload.status !== 'ok') {
    throw new Error(cleanText(payload.error?.message || payload.error, 1_000) || 'OpenClaw could not complete the request.');
  }
  const payloadText = Array.isArray(payload.payloads)
    ? payload.payloads.map(item => cleanText(item?.text, MAX_OUTPUT_BYTES)).filter(Boolean).join('\n\n') : '';
  return {
    text: cleanText(payload.final, MAX_OUTPUT_BYTES) || payloadText,
    model: cleanText(payload.model, 160),
    provider: cleanText(payload.provider, 80),
    sessionId: cleanText(payload.sessionId, 200),
    usage: payload.usage && typeof payload.usage === 'object' ? {
      inputTokens: Number(payload.usage.input || 0),
      outputTokens: Number(payload.usage.output || 0),
    } : null,
  };
}

/** @param {any[]} prompt */
function promptText(prompt) {
  const blocks = Array.isArray(prompt) ? prompt : [];
  if (blocks.some(block => block?.type === 'image')) {
    throw new Error('OpenClaw image input is not available through its headless CLI yet. Choose a vision-capable provider for this image.');
  }
  return blocks.filter(block => block?.type === 'text').map(block => String(block.text || '')).join('\n\n').trim();
}

/** @param {NodeJS.ProcessEnv} env */
export function resolveOpenClawAmbientConfig(env = process.env) {
  const explicit = cleanText(env.OPENCLAW_CONFIG_PATH, 4_096);
  if (explicit && isAbsolute(explicit)) return explicit;
  const home = cleanText(env.OPENCLAW_HOME || env.HOME || env.USERPROFILE, 4_096);
  const state = cleanText(env.OPENCLAW_STATE_DIR, 4_096);
  if (state && isAbsolute(state)) return join(state, 'openclaw.json');
  if (!home || !isAbsolute(home)) return '';
  const profile = cleanText(env.OPENCLAW_PROFILE, 80);
  return join(home, profile && profile !== 'default' ? `.openclaw-${profile}` : '.openclaw', 'openclaw.json');
}

/** @param {any} mcpConfig @param {string[]} allowedToolNames @param {string} [ambientConfigPath] */
export function buildOpenClawTurnConfig(mcpConfig, allowedToolNames = [], ambientConfigPath = '') {
  const source = mcpConfig?.mcpServers?.getbased || {};
  const include = [...new Set(allowedToolNames.map(value => cleanText(value, 160)).filter(Boolean))];
  return {
    ...(ambientConfigPath ? { $include: ambientConfigPath } : {}),
    // The exact server prefix admits getbased's bundle-MCP tools without
    // admitting unrelated MCP servers or other installed plugin tools.
    tools: { allow: ['web_search', 'web_fetch', 'getbased__*'] },
    mcp: { servers: { getbased: {
      command: String(source.command || ''),
      args: Array.isArray(source.args) ? source.args.map(String) : [],
      env: source.env && typeof source.env === 'object' ? source.env : {},
      enabled: true,
      ...(include.length ? { toolFilter: { include } } : {}),
    } } },
  };
}

export class OpenClawAgentClient {
  /** @param {{command: string, args?: string[], cwd: string, env?: NodeJS.ProcessEnv, spawnImpl?: typeof spawnChild, mode?: 'isolated'|'gateway', gatewayAgentId?: string}} options */
  constructor(options) {
    this.command = options.command;
    this.args = options.args || [];
    this.cwd = options.cwd;
    this.env = options.env;
    this.spawnImpl = options.spawnImpl || spawnChild;
    this.mode = options.mode === 'gateway' ? 'gateway' : 'isolated';
    this.gatewayAgentId = cleanText(options.gatewayAgentId, 80);
    this.children = new Set();
    this.modelCatalogPromise = null;
    const ambientConfigPath = resolveOpenClawAmbientConfig(options.env);
    this.ambientConfigPath = ambientConfigPath && existsSync(ambientConfigPath) ? ambientConfigPath : '';
  }

  /** @param {string} path */
  async readBoundedOutput(path) {
    const handle = await open(path, 'r');
    try {
      return await readBoundedFile(handle, MAX_OUTPUT_BYTES, 'OpenClaw response exceeded the companion limit.');
    } finally { await handle.close(); }
  }

  /** @param {string[]} args @param {AbortSignal | undefined} signal */
  async runCommand(args, signal) {
    const privateId = randomUUID();
    const stdoutPath = join(this.cwd, `openclaw-stdout-${privateId}.json`);
    const stderrPath = join(this.cwd, `openclaw-stderr-${privateId}.txt`);
    let stdoutHandle;
    let stderrHandle;
    let child;
    let abort = () => {};
    try {
      [stdoutHandle, stderrHandle] = await Promise.all([
        open(stdoutPath, 'wx', 0o600), open(stderrPath, 'wx', 0o600),
      ]);
      const env = { ...this.env };
      if (this.ambientConfigPath) {
        const includeRoot = dirname(this.ambientConfigPath);
        env.OPENCLAW_INCLUDE_ROOTS = [...new Set([
          ...String(env.OPENCLAW_INCLUDE_ROOTS || '').split(delimiter).filter(Boolean), includeRoot,
        ])].join(delimiter);
      }
      // --config is authoritative only for isolated turns. Gateway turns must
      // retain OpenClaw's ambient routing so they reach the user's agent.
      if (this.mode === 'isolated') delete env.OPENCLAW_CONFIG_PATH;
      child = this.spawnImpl(this.command, [...this.args, ...args], {
        cwd: this.cwd, env, stdio: ['ignore', stdoutHandle.fd, stderrHandle.fd],
      });
      this.children.add(child);
      abort = () => child.kill('SIGTERM');
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
      const code = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
      });
      this.children.delete(child);
      await Promise.all([stdoutHandle.close(), stderrHandle.close()]);
      stdoutHandle = undefined;
      stderrHandle = undefined;
      const [stdout, stderr] = await Promise.all([
        this.readBoundedOutput(stdoutPath), this.readBoundedOutput(stderrPath),
      ]);
      if (signal?.aborted) {
        const error = new Error('OpenClaw request cancelled.');
        error.name = 'AbortError';
        throw error;
      }
      if (code !== 0) throw new Error(cleanText(stderr, 4_000) || `OpenClaw exited with code ${code ?? 'unknown'}.`);
      return { stdout, stderr };
    } finally {
      signal?.removeEventListener('abort', abort);
      if (child) this.children.delete(child);
      await Promise.all([
        stdoutHandle?.close().catch(() => {}), stderrHandle?.close().catch(() => {}),
        unlink(stdoutPath).catch(() => {}), unlink(stderrPath).catch(() => {}),
      ]);
    }
  }

  async loadModelCatalog() {
    const { stdout } = await this.runCommand(['models', 'list', '--json'], undefined);
    let payload;
    try { payload = JSON.parse(String(stdout)); } catch { throw new Error('OpenClaw returned an invalid model catalog.'); }
    const catalog = normalizeOpenClawModelCatalog(payload);
    if (!catalog.length) throw new Error('OpenClaw has no available configured models. Open OpenClaw and connect a model provider first.');
    return catalog;
  }

  /** @param {{refresh?: boolean}} [options] */
  async getModelCatalog(options = {}) {
    if (options.refresh) this.modelCatalogPromise = null;
    if (!this.modelCatalogPromise) this.modelCatalogPromise = this.loadModelCatalog()
      .catch(error => { this.modelCatalogPromise = null; throw error; });
    return this.modelCatalogPromise;
  }

  /**
   * @param {{sessionId?: string, prompt: any[], model?: string, effort?: string, instructions: string, outputSchema?: any, mcpConfig: any, allowedToolNames: string[], signal?: AbortSignal, onEvent: (event: any) => void}} options
   */
  async prompt(options) {
    const catalog = await this.getModelCatalog();
    const model = cleanText(options.model, 160)
      || catalog.find(entry => entry.isDefault)?.id || catalog[0]?.id || '';
    if (!model) throw new Error('OpenClaw has no model available for this request.');
    const sessionId = options.sessionId || randomUUID();
    const privateId = randomUUID();
    const configPath = join(this.cwd, `openclaw-config-${privateId}.json`);
    const promptPath = join(this.cwd, `openclaw-prompt-${privateId}.txt`);
    const userPrompt = promptText(options.prompt);
    const schemaText = options.outputSchema
      ? `\n\nReturn only JSON matching this schema: ${JSON.stringify(options.outputSchema)}` : '';
    const completePrompt = `${options.instructions.trim()}\n\nUser request:\n${userPrompt}${schemaText}`.trim();
    const config = buildOpenClawTurnConfig(options.mcpConfig, options.allowedToolNames, this.ambientConfigPath);
    try {
      const writes = [writeFile(promptPath, completePrompt, { mode: 0o600, flag: 'wx' })];
      if (this.mode === 'isolated') writes.push(writeFile(configPath, JSON.stringify(config), { mode: 0o600, flag: 'wx' }));
      await Promise.all(writes);
      const args = this.mode === 'gateway'
        ? [
          'agent', ...(this.gatewayAgentId ? ['--agent', this.gatewayAgentId] : []),
          '--session-id', sessionId, '--message-file', promptPath, '--json', '--model', model,
          ...(options.effort ? ['--thinking', options.effort] : []),
        ]
        : [
          'agent', 'exec', '--config', configPath, '--code-mode', 'direct', '--json',
          '--cwd', this.cwd, '--message-file', promptPath, '--model', model,
          ...(options.effort ? ['--thinking', options.effort] : []),
        ];
      const { stdout } = await this.runCommand(args, options.signal);
      let payload;
      try { payload = JSON.parse(stdout); } catch { throw new Error('OpenClaw returned an invalid response.'); }
      const result = extractOpenClawResult(payload);
      const reportedModel = result.provider && result.model && !result.model.includes('/')
        ? `${result.provider}/${result.model}` : result.model || model;
      options.onEvent({ type: 'session', sessionId, model: reportedModel });
      if (result.text) options.onEvent({ type: 'text_delta', delta: result.text });
      if (result.usage) options.onEvent({ type: 'usage', ...result.usage });
      options.onEvent({ type: 'done', finishReason: 'stop' });
      return { sessionId };
    } finally {
      await Promise.all([unlink(configPath).catch(() => {}), unlink(promptPath).catch(() => {})]);
    }
  }

  async restart() {
    for (const child of this.children) child.kill('SIGTERM');
    this.children.clear();
    this.modelCatalogPromise = null;
  }

  async close() { await this.restart(); }
}
