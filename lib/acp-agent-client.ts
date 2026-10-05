// Minimal Agent Client Protocol v1 client for local CLI harnesses.

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { RpcClientOptions, RpcClientState } from './rpc-client-state.js';
import { rejectPendingRequests } from './rpc-client-state.js';

import { EventEmitter } from 'node:events';
import { spawn as spawnChild } from 'node:child_process';
import { createInterface } from 'node:readline';

interface ACPClientOptions extends RpcClientOptions {
  id: string;
  command: string;
  args: string[];
  cwd: string;
}
interface ACPConfigOption extends Record<string, unknown> {
  id?: unknown;
  category?: unknown;
  currentValue?: unknown;
  options?: unknown;
}
interface ACPModelState extends Record<string, unknown> {
  availableModels?: unknown;
  currentModelId?: unknown;
}
interface ACPMetadata extends ACPWireResult {
  modelState?: ACPModelState | null;
  'x.ai/sessionConfig'?: { options?: unknown } | null;
}
interface ACPWireResult extends Record<string, unknown> {
  protocolVersion?: unknown;
  configOptions?: (ACPConfigOption | null | undefined)[] | null;
  models?: ACPModelState | null;
  sessionId?: unknown;
  _meta?: ACPMetadata | null;
  agentCapabilities?: {
    sessionCapabilities?: { resume?: unknown } | null;
    loadSession?: unknown;
    promptCapabilities?: { image?: unknown } | null;
  } | null;
}
interface ACPPermissionParams {
  sessionId?: string;
  toolCall?: { rawInput?: { variant?: unknown; tool_name?: string } | null } | null;
  options?: ({ kind?: unknown; optionId?: unknown } | null)[] | null;
}
interface ACPNotification extends Record<string, unknown> {
  params?: ACPPermissionParams | null;
}
interface CatalogOption {
  id: string;
  name: string;
  description: string;
  meta: Record<string, unknown>;
  selected: boolean;
}
type ModelCatalog = ReturnType<typeof normalizeACPModelCatalog>;
type SessionOptions = (ACPConfigOption | null | undefined)[];
type CatalogRequest = { model?: string; refresh?: boolean };

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const PROMPT_TIMEOUT_MS = 10 * 60_000;
const MAX_TRACKED_SESSIONS = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value: unknown, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function flattenOptions(value: unknown): CatalogOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    if (!isRecord(entry)) return [];
    if (Array.isArray(entry.options) && !('value' in entry)) return flattenOptions(entry.options);
    if (entry.available === false || entry.enabled === false || entry.disabled === true
      || entry.unavailable === true || entry.missing === true
      || ['disabled', 'offline', 'removed', 'unavailable'].includes(cleanText(entry.status, 40).toLowerCase())) return [];
    const id = cleanText(entry.value || entry.id || entry.modelId, 160);
    if (!id) return [];
    return [{
      id,
      name: cleanText(entry.name || entry.label || id, 180),
      description: cleanText(entry.description, 300),
      meta: isRecord(entry._meta) ? entry._meta : {},
      selected: entry.selected === true || entry.default === true,
    }];
  });
}

export function normalizeACPModelCatalog(result: ACPWireResult | null | undefined) {
  const configOptions = Array.isArray(result?.configOptions) ? result.configOptions.filter(isRecord) : [];
  const modelConfig = configOptions.find(option => option.category === 'model' || option.id === 'model');
  const thoughtConfig = configOptions.find(option => option.category === 'thought_level'
    || option.id === 'thought_level' || option.id === 'reasoning_effort' || option.id === 'effort');
  let models = flattenOptions(modelConfig?.options);
  let currentModel = cleanText(modelConfig?.currentValue, 160);

  const modelState = isRecord(result?.models)
    ? result.models
    : isRecord(result?._meta?.modelState)
      ? result._meta.modelState
      : null;
  if (modelState) {
    models = flattenOptions(modelState.availableModels);
    currentModel = cleanText(modelState.currentModelId, 160);
  }

  const metaOptions = Array.isArray(result?._meta?.['x.ai/sessionConfig']?.options)
    ? result._meta['x.ai/sessionConfig'].options.filter(isRecord)
    : [];
  if (!models.length) models = flattenOptions(metaOptions.filter(option => option.category === 'model'));
  if (!currentModel) currentModel = cleanText(metaOptions.find(option => option.category === 'model' && option.selected)?.id, 160);

  const globalEfforts = flattenOptions(thoughtConfig?.options);
  const currentEffort = cleanText(thoughtConfig?.currentValue, 40);
  if (currentModel) models.sort((left, right) => Number(right.id === currentModel) - Number(left.id === currentModel));
  return models.slice(0, 500).map(model => {
    const modelEfforts = flattenOptions(model.meta?.reasoningEfforts || model.meta?.reasoning_efforts);
    const efforts = modelEfforts.length ? modelEfforts : globalEfforts;
    const defaultEffort = cleanText(model.meta?.reasoningEffort, 40)
      || efforts.find(item => item.selected)?.id || currentEffort;
    return {
      id: model.id,
      model: model.id,
      displayName: model.name || model.id,
      description: model.description,
      isDefault: model.id === currentModel || (!currentModel && model.selected),
      defaultReasoningEffort: defaultEffort,
      supportedReasoningEfforts: efforts.map(item => ({ reasoningEffort: item.id, description: item.description })),
      inputModalities: ['text', 'image'],
    };
  });
}

export interface ACPAgentClient extends RpcClientState<number, ACPWireResult | null | undefined> {
  cwd: string;
}

export class ACPAgentClient extends EventEmitter {
  declare id: string;
  declare initializeResult: ACPWireResult | null | undefined;
  declare modelCatalogPromise: Promise<ModelCatalog> | null;
  declare sessions: Set<string>;
  declare sessionCatalogs: Map<string, SessionOptions>;
  declare sessionModelStates: Map<string, ACPModelState | null>;
  declare catalogSessionId: string;
  declare turnToolPermissions: Map<string | undefined, Set<string | undefined>>;

  constructor(options: ACPClientOptions) {
    super();
    this.id = options.id;
    this.command = options.command;
    this.args = options.args;
    this.cwd = options.cwd;
    this.env = options.env;
    this.spawnImpl = options.spawnImpl || spawnChild;
    this.requestTimeoutMs = options.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;
    this.child = null;
    this.nextRequestId = 1;
    this.pending = new Map();
    this.initializePromise = null;
    this.initializeResult = null;
    this.modelCatalogPromise = null;
    this.closed = false;
    this.sessions = new Set();
    this.sessionCatalogs = new Map();
    this.sessionModelStates = new Map();
    this.catalogSessionId = '';
    this.turnToolPermissions = new Map();
  }

  start() {
    if (this.child) return;
    if (this.closed) throw new Error(`${this.id} ACP client is closed.`);
    const child = this.spawnImpl(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = (child as ChildProcessWithoutNullStreams);
    createInterface({ input: this.child.stdout, crlfDelay: Infinity }).on('line', line => {
      if (this.child === child) this.handleLine(line);
    });
    this.child.stderr.on('data', chunk => this.emit('diagnostic', String(chunk).slice(0, 2_000)));
    // A closed pipe emits on stdin, independently of the process error event.
    this.child.stdin.on('error', error => { if (this.child === child) this.handleExit(error); });
    this.child.once('error', error => { if (this.child === child) this.handleExit(error); });
    this.child.once('exit', (code, signal) => { if (this.child === child) this.handleExit(new Error(
      `${this.id} ACP process exited with ${signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`}.`,
    )); });
  }

  handleLine(line: string) {
    if (!line.trim()) return;
    let message: unknown;
    try { message = JSON.parse(line); } catch {
      this.emit('protocolError', new Error(`${this.id} returned invalid ACP JSON.`));
      return;
    }
    if (!isRecord(message)) return;
    if (Object.hasOwn(message, 'id') && !Object.hasOwn(message, 'method')) {
      const pending = this.pending.get(Number(message.id));
      if (!pending) return;
      this.pending.delete(Number(message.id));
      clearTimeout(pending.timer);
      if (isRecord(message.error)) pending.reject(new Error(cleanText(message.error.message, 500) || `${this.id} ACP request failed.`));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method !== 'string') return;
    if (Object.hasOwn(message, 'id')) {
      let result: { outcome: { outcome: string; optionId?: unknown } } | null = null;
      if (message.method === 'session/request_permission') {
        const params = message.params as ACPPermissionParams | null | undefined;
        const input = params?.toolCall?.rawInput;
        // Grok asks for permission around MCP calls. Authorize only this
        // turn's declared tools, never a display title or an always-allow grant.
        const allowed = this.id === 'grok' && input?.variant === 'UseTool'
          && this.turnToolPermissions.get(params?.sessionId)?.has(input?.tool_name);
        const option = allowed && Array.isArray(params?.options)
          ? params.options.find(item => item?.kind === 'allow_once' && typeof item.optionId === 'string') : null;
        result = { outcome: option
          ? { outcome: 'selected', optionId: option.optionId }
          : { outcome: 'cancelled' } };
      }
      this.child?.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`);
      return;
    }
    this.emit('notification', message);
  }

  handleExit(error: unknown) {
    if (!this.child) return;
    this.child = null;
    this.initializePromise = null;
    this.initializeResult = null;
    this.modelCatalogPromise = null;
    this.sessions.clear();
    this.sessionCatalogs.clear();
    this.sessionModelStates.clear();
    this.turnToolPermissions.clear();
    this.catalogSessionId = '';
    rejectPendingRequests(() => this.pending, () => error);
    this.emit('exit', error);
  }

  request<T = unknown>(method: string, params: unknown, options: { timeoutMs?: number } = {}): Promise<T> {
    this.start();
    if (!this.child) return Promise.reject(new Error(`${this.id} ACP process is unavailable.`));
    const id = this.nextRequestId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.id} ACP ${method} timed out.`));
      }, options.timeoutMs || this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const rejectWrite = (error: unknown) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        clearTimeout(pending.timer);
        pending.reject(error);
      };
      try {
        this.child!.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`, rejectWrite);
      } catch (error) {
        rejectWrite(error);
      }
    }) as Promise<T>;
  }

  initialize() {
    if (!this.initializePromise) this.initializePromise = this.request<ACPWireResult | null | undefined>('initialize', {
      protocolVersion: 1,
      clientCapabilities: { session: { configOptions: { boolean: {} } } },
      clientInfo: { name: 'getbased', title: 'getbased', version: '1.0.0' },
    }).then(result => {
      if (Number(result?.protocolVersion) !== 1) throw new Error(`${this.id} uses an unsupported ACP version.`);
      this.initializeResult = result;
      return result;
    }).catch(error => {
      this.initializePromise = null;
      throw error;
    });
    return this.initializePromise;
  }

  rememberSession(sessionId: string, result: ACPWireResult | null | undefined) {
    if (!this.sessions.has(sessionId)) {
      while (this.sessions.size >= MAX_TRACKED_SESSIONS) {
        const oldest = this.sessions.values().next().value;
        if (!oldest) break;
        this.sessions.delete(oldest);
        this.sessionCatalogs.delete(oldest);
        this.sessionModelStates.delete(oldest);
      }
      this.sessions.add(sessionId);
    }
    this.sessionCatalogs.set(sessionId, result?.configOptions || []);
    this.sessionModelStates.set(sessionId, result?.models || result?._meta?.modelState || null);
  }

  async ensureSession(options: { requestedSessionId?: string | undefined; mcpServers: unknown[] }) {
    const initialized = await this.initialize();
    const requested = cleanText(options.requestedSessionId, 200);
    if (requested && this.sessions.has(requested)) {
      return {
        sessionId: requested,
        configOptions: this.sessionCatalogs.get(requested) || [],
        modelState: this.sessionModelStates.get(requested) || null,
      };
    }
    if (requested) {
      const capabilities = initialized?.agentCapabilities || {};
      const method = capabilities?.sessionCapabilities?.resume ? 'session/resume'
        : capabilities?.loadSession ? 'session/load' : '';
      if (method) {
        try {
          const result = await this.request<ACPWireResult | null | undefined>(method, {
            sessionId: requested, cwd: this.cwd, mcpServers: options.mcpServers,
          });
          this.rememberSession(requested, result);
          return {
            sessionId: requested,
            configOptions: result?.configOptions || [],
            modelState: result?.models || result?._meta?.modelState || null,
          };
        } catch {
          this.sessions.delete(requested);
          this.sessionCatalogs.delete(requested);
          this.sessionModelStates.delete(requested);
        }
      }
    }
    const result = await this.request<ACPWireResult | null | undefined>('session/new', { cwd: this.cwd, mcpServers: options.mcpServers });
    const sessionId = cleanText(result?.sessionId, 200);
    if (!sessionId) throw new Error(`${this.id} did not return an ACP session ID.`);
    this.rememberSession(sessionId, result);
    return {
      sessionId,
      configOptions: result?.configOptions || [],
      modelState: result?.models || result?._meta?.modelState || null,
      raw: result,
    };
  }

  async configureSession(sessionId: string, configOptions: SessionOptions, model: string, effort: string, modelState: ACPModelState | null = null) {
    let modelOption = configOptions.find(item => item?.category === 'model' || item?.id === 'model');
    if (model && modelOption?.id && modelOption.currentValue !== model) {
      const result = await this.request<ACPWireResult | null | undefined>('session/set_config_option', {
        sessionId, configId: modelOption.id, value: model,
      });
      if (Array.isArray(result?.configOptions)) {
        configOptions = result.configOptions;
        this.sessionCatalogs.set(sessionId, configOptions);
      }
    } else if (model && isRecord(modelState)) {
      const currentModel = cleanText(modelState.currentModelId, 160);
      const available = flattenOptions(modelState.availableModels);
      if (currentModel !== model && available.length && !available.some(item => item.id === model)) {
        throw new Error(`The selected ${this.id} model is unavailable. Refresh the model catalog and choose an available model.`);
      }
      if (currentModel !== model && (!available.length || available.some(item => item.id === model))) {
        await this.request('session/set_model', { sessionId, modelId: model });
        modelState = { ...modelState, currentModelId: model };
        this.sessionModelStates.set(sessionId, modelState);
      }
    }

    const effortOption = configOptions.find(item => item?.category === 'thought_level'
      || item?.id === 'thought_level' || item?.id === 'reasoning_effort' || item?.id === 'effort');
    if (effort && effortOption?.id && effortOption.currentValue !== effort) {
      const result = await this.request<ACPWireResult | null | undefined>('session/set_config_option', {
        sessionId, configId: effortOption.id, value: effort,
      });
      if (Array.isArray(result?.configOptions)) {
        configOptions = result.configOptions;
        this.sessionCatalogs.set(sessionId, configOptions);
      }
    }
    return configOptions;
  }

  async prompt(options: { sessionId: string; prompt: unknown[]; allowedToolNames?: string[]; onNotification: (message: ACPNotification) => void; signal?: AbortSignal }) {
    const permissions = new Set((options.allowedToolNames || []).map(name => `getbased__${name}`));
    this.turnToolPermissions.set(options.sessionId, permissions);
    const listener = (message: ACPNotification) => {
      if (message?.params?.sessionId === options.sessionId) options.onNotification(message);
    };
    this.on('notification', listener);
    const abort = () => {
      if (this.turnToolPermissions.get(options.sessionId) === permissions) this.turnToolPermissions.delete(options.sessionId);
      this.child?.stdin.write(`${JSON.stringify({
        jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: options.sessionId },
      })}\n`);
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      return await this.request('session/prompt', {
        sessionId: options.sessionId, prompt: options.prompt,
      }, { timeoutMs: PROMPT_TIMEOUT_MS });
    } finally {
      if (this.turnToolPermissions.get(options.sessionId) === permissions) this.turnToolPermissions.delete(options.sessionId);
      this.off('notification', listener);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  async loadModelCatalog(options: CatalogRequest = {}) {
    const selectedModel = cleanText(options.model, 160);
    const initialized = await this.initialize();
    const supportsImages = initialized?.agentCapabilities?.promptCapabilities?.image === true;
    if (!selectedModel && !options.refresh) {
      const fromInitialize = normalizeACPModelCatalog(initialized?._meta || initialized);
      if (fromInitialize.length) {
        return fromInitialize.map(model => ({ ...model, inputModalities: supportsImages ? ['text', 'image'] : ['text'] }));
      }
    }
    const session = await this.ensureSession({ requestedSessionId: options.refresh ? '' : this.catalogSessionId, mcpServers: [] });
    this.catalogSessionId = session.sessionId;
    let configOptions = session.configOptions;
    let modelState = session.modelState;
    if (selectedModel) {
      configOptions = await this.configureSession(session.sessionId, configOptions, selectedModel, '', modelState);
      if (isRecord(modelState)) modelState = { ...modelState, currentModelId: selectedModel };
    }
    const catalog = normalizeACPModelCatalog({
      configOptions,
      ...(isRecord(modelState) ? { models: modelState } : {}),
    });
    return catalog.map(model => ({ ...model, inputModalities: supportsImages ? ['text', 'image'] : ['text'] }));
  }

  async getModelCatalog(options: CatalogRequest = {}) {
    const selectedModel = cleanText(options.model, 160);
    if (options.refresh) this.modelCatalogPromise = null;
    if (selectedModel) return this.loadModelCatalog(options);
    if (!this.modelCatalogPromise) this.modelCatalogPromise = (async () => {
      return this.loadModelCatalog(options);
    })().catch(error => { this.modelCatalogPromise = null; throw error; });
    return this.modelCatalogPromise;
  }

  async restart() {
    await this.close();
    this.closed = false;
  }

  async close() {
    this.closed = true;
    this.initializePromise = null;
    this.initializeResult = null;
    this.modelCatalogPromise = null;
    const child = this.child;
    this.child = null;
    this.sessions.clear();
    this.sessionCatalogs.clear();
    this.sessionModelStates.clear();
    this.turnToolPermissions.clear();
    this.catalogSessionId = '';
    if (!child) return;
    rejectPendingRequests(() => this.pending, () => new Error(`${this.id} ACP client closed.`));
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
}
