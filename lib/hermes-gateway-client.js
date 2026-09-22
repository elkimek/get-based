// @ts-check
// Authenticated Hermes Desktop gateway adapter. Credentials never cross the
// companion's loopback boundary; the browser sees only opaque execution IDs.

import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readBoundedFile } from './read-bounded-file.js';

const REQUEST_TIMEOUT_MS = 30_000;
const PROMPT_TIMEOUT_MS = 10 * 60_000;
const REGISTRY_MAX_BYTES = 1_000_000;
const HERMES_REASONING_EFFORTS = Object.freeze([
  'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra',
]);

/** @param {unknown} value @param {number} [max] */
function cleanText(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** @param {string} value */
function routeHash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/** @param {NodeJS.Platform} platform @param {NodeJS.ProcessEnv} env */
export function hermesDesktopRegistryPath(platform = process.platform, env = process.env) {
  const home = cleanText(env.HOME || env.USERPROFILE || homedir(), 4_096);
  if (platform === 'win32') return join(cleanText(env.APPDATA, 4_096) || join(home, 'AppData', 'Roaming'), 'Hermes', 'connections.json');
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Hermes', 'connections.json');
  return join(cleanText(env.XDG_CONFIG_HOME, 4_096) || join(home, '.config'), 'Hermes', 'connections.json');
}

/** @param {unknown} value */
export function normalizeHermesGatewayBaseUrl(value) {
  let url;
  try { url = new URL(cleanText(value, 2_048)); } catch { throw new Error('Hermes gateway URL is invalid.'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Hermes gateway URL is invalid.');
  }
  if (url.protocol === 'http:' && !loopback) throw new Error('Remote Hermes gateways must use HTTPS.');
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

/** @param {string} baseUrl @param {string} token */
export function buildHermesGatewayWebSocketUrl(baseUrl, token) {
  const url = new URL(normalizeHermesGatewayBaseUrl(baseUrl));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/ws`;
  url.searchParams.set('token', token);
  return url.toString();
}

/** @param {any} payload */
export function normalizeHermesGatewayModelCatalog(payload) {
  const currentProvider = cleanText(payload?.provider, 80);
  const currentModel = cleanText(payload?.model, 160);
  const providers = Array.isArray(payload?.providers) ? payload.providers : [];
  const rows = [];
  for (const provider of providers) {
    if (!provider || typeof provider !== 'object' || provider.authenticated === false) continue;
    const slug = cleanText(provider.slug || provider.id, 80);
    if (!slug) continue;
    const models = Array.isArray(provider.models) ? provider.models : [];
    const unavailable = new Set((Array.isArray(provider.unavailable_models) ? provider.unavailable_models : [])
      .map(item => cleanText(item, 160)).filter(Boolean));
    for (const item of models) {
      const rawId = cleanText(typeof item === 'string' ? item : item?.id || item?.model, 160);
      if (!rawId || unavailable.has(rawId)) continue;
      const id = rawId.startsWith(`${slug}:`) ? rawId : `${slug}:${rawId}`;
      const displayName = cleanText(typeof item === 'object' ? item?.name || item?.display_name : '', 180) || rawId;
      rows.push({
        id, model: id, displayName,
        description: `${cleanText(provider.name, 100) || slug} model on this Hermes profile`,
        isDefault: slug === currentProvider && rawId === currentModel,
        defaultReasoningEffort: '',
        supportedReasoningEfforts: HERMES_REASONING_EFFORTS.map(reasoningEffort => ({ reasoningEffort, description: '' })),
        // The gateway transport currently accepts text. Vision feature jobs
        // continue through the local ACP adapter until remote file.attach is
        // exposed as a bounded, browser-safe upload contract.
        inputModalities: ['text'],
      });
    }
  }
  return rows.slice(0, 500);
}

/** @param {string} model */
function splitHermesModel(model) {
  const separator = model.indexOf(':');
  return separator > 0
    ? { provider: model.slice(0, separator), model: model.slice(separator + 1) }
    : { provider: '', model };
}

export class HermesGatewayClient {
  /** @param {{baseUrl: string, token: string, profile?: string, label?: string, WebSocketImpl?: typeof WebSocket, fetchImpl?: typeof fetch}} options */
  constructor(options) {
    this.baseUrl = normalizeHermesGatewayBaseUrl(options.baseUrl);
    this.token = options.token;
    this.profile = cleanText(options.profile, 100) || 'default';
    this.label = cleanText(options.label, 100) || 'Hermes gateway';
    this.WebSocketImpl = options.WebSocketImpl || globalThis.WebSocket;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.socket = null;
    this.connectPromise = null;
    this.cancelHandshake = null;
    this.turnFailures = new Set();
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.sessions = new Map();
    this.modelCatalogPromise = null;
  }

  async connect() {
    if (this.socket?.readyState === 1) return;
    if (this.connectPromise) return this.connectPromise;
    if (!this.WebSocketImpl) throw new Error('This companion runtime cannot open a Hermes gateway WebSocket.');
    const connection = new Promise((resolve, reject) => {
      const socket = new this.WebSocketImpl(buildHermesGatewayWebSocketUrl(this.baseUrl, this.token));
      let settled = false;
      const cleanupHandshake = () => {
        clearTimeout(timer);
        if (this.cancelHandshake === failHandshake) this.cancelHandshake = null;
      };
      const failHandshake = error => {
        if (settled) return;
        settled = true;
        cleanupHandshake();
        reject(error);
        try { socket.close(); } catch { /* ignored */ }
      };
      const timer = setTimeout(() => failHandshake(new Error(`${this.label} did not accept a live connection.`)), 10_000);
      this.cancelHandshake = failHandshake;
      socket.addEventListener('open', () => {
        if (settled) return;
        settled = true;
        cleanupHandshake();
        this.socket = socket;
        resolve(undefined);
      }, { once: true });
      socket.addEventListener('error', () => failHandshake(new Error(`${this.label} could not be reached.`)), { once: true });
      socket.addEventListener('message', event => {
        if (this.socket === socket) this.handleMessage(event.data);
      });
      socket.addEventListener('close', () => {
        const error = new Error(`${this.label} closed the connection.`);
        if (!settled) failHandshake(error);
        if (this.socket !== socket) return;
        this.socket = null;
        this.rejectActiveWork(error);
      });
    });
    const tracked = connection.finally(() => {
      if (this.connectPromise === tracked) this.connectPromise = null;
    });
    this.connectPromise = tracked;
    return tracked;
  }

  /** @param {Error} error */
  rejectActiveWork(error) {
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(error);
    }
    this.pending.clear();
    for (const reject of this.turnFailures) reject(error);
  }

  /** @param {unknown} raw */
  handleMessage(raw) {
    let frame;
    try { frame = JSON.parse(typeof raw === 'string' ? raw : String(raw)); } catch { return; }
    if (frame?.id !== undefined && frame?.id !== null) {
      const call = this.pending.get(frame.id);
      if (!call) return;
      this.pending.delete(frame.id);
      clearTimeout(call.timer);
      if (frame.error) call.reject(new Error(cleanText(frame.error.message, 500) || 'Hermes gateway request failed.'));
      else call.resolve(frame.result);
      return;
    }
    if (frame?.method === 'event' && frame.params?.type) {
      for (const listener of this.listeners) listener(frame.params);
    }
  }

  /** @param {string} method @param {Record<string, unknown>} [params] @param {number} [timeoutMs] @param {AbortSignal} [signal] */
  async request(method, params = {}, timeoutMs = REQUEST_TIMEOUT_MS, signal) {
    signal?.throwIfAborted();
    await this.connect();
    signal?.throwIfAborted();
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) throw new Error(`${this.label} is not connected.`);
    const id = `gb${this.nextId++}`;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.pending.delete(id);
        signal?.removeEventListener('abort', abort);
      };
      const fail = error => { cleanup(); reject(error); };
      const abort = () => fail(signal.reason);
      const timer = setTimeout(() => fail(new Error(`Hermes gateway ${method} timed out.`)), timeoutMs);
      this.pending.set(id, {
        resolve: value => { cleanup(); resolve(value); }, reject: fail, timer,
      });
      signal?.addEventListener('abort', abort, { once: true });
      try { socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params })); }
      catch (error) { fail(error); }
    });
  }

  /** @param {boolean} [refresh] */
  async loadModelCatalog(refresh = false) {
    const url = new URL(`${this.baseUrl}/api/model/options`);
    url.searchParams.set('profile', this.profile);
    url.searchParams.set('explicit_only', 'true');
    if (refresh) url.searchParams.set('refresh', 'true');
    const response = await this.fetchImpl(url, {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { 'X-Hermes-Session-Token': this.token },
    });
    if (!response.ok) throw new Error(`${this.label} could not load the ${this.profile} model catalog.`);
    const catalog = normalizeHermesGatewayModelCatalog(await response.json());
    if (!catalog.length) throw new Error(`${this.label} has no configured models for ${this.profile}.`);
    return catalog;
  }

  /** @param {{refresh?: boolean}} [options] */
  async getModelCatalog(options = {}) {
    if (options.refresh) this.modelCatalogPromise = null;
    if (!this.modelCatalogPromise) {
      const pending = this.loadModelCatalog(options.refresh === true).catch(error => {
        if (this.modelCatalogPromise === pending) this.modelCatalogPromise = null;
        throw error;
      });
      this.modelCatalogPromise = pending;
    }
    return this.modelCatalogPromise;
  }

  /** @param {string} externalSessionId @param {string} model @param {string} effort */
  async createSession(externalSessionId, model, effort) {
    const selected = splitHermesModel(model);
    const created = await this.request('session.create', {
      source: 'tool', close_on_disconnect: false, profile: this.profile,
      title: 'getbased',
      ...(selected.model ? { model: selected.model } : {}),
      ...(selected.provider ? { provider: selected.provider } : {}),
      ...(effort ? { reasoning_effort: effort } : {}),
    });
    const runtimeSessionId = cleanText(created?.session_id, 200);
    if (!runtimeSessionId) throw new Error(`${this.label} did not create a Hermes session.`);
    const state = { runtimeSessionId, model, effort };
    this.sessions.set(externalSessionId, state);
    return state;
  }

  /** @param {{runtimeSessionId: string, model: string, effort: string}} state @param {string} model @param {string} effort */
  async configureSession(state, model, effort) {
    if (model && model !== state.model) {
      const result = await this.request('config.set', {
        key: 'model', value: model, session_id: state.runtimeSessionId,
      });
      if (result?.confirm_required) {
        throw new Error(result.confirm_message || result.warning || 'Confirm this Hermes model change in Hermes Desktop, then retry in getbased.');
      }
      state.model = model;
    }
    if (effort !== state.effort) {
      let effectiveEffort = effort;
      if (!effectiveEffort) {
        const inherited = await this.request('config.get', { key: 'reasoning', profile: this.profile });
        effectiveEffort = cleanText(inherited?.value, 40) || 'medium';
      }
      await this.request('config.set', {
        key: 'reasoning', value: effectiveEffort, session_id: state.runtimeSessionId,
      });
      state.effort = effort;
    }
  }

  /**
   * @param {{sessionId?: string, prompt: any[], model?: string, effort?: string, instructions?: string, outputSchema?: any, signal?: AbortSignal, onEvent: (event: any) => void}} options
   */
  async prompt(options) {
    options.signal?.throwIfAborted();
    if ((options.prompt || []).some(block => block?.type === 'image')) {
      throw new Error('Remote Hermes image input is not available through the safe gateway connection yet. Choose the local Hermes target for images.');
    }
    const userText = (options.prompt || []).filter(block => block?.type === 'text')
      .map(block => String(block.text || '')).join('\n\n').trim();
    if (!userText) throw new Error('Hermes gateway received an empty prompt.');
    const schemaText = options.outputSchema
      ? `\n\nReturn only JSON matching this schema: ${JSON.stringify(options.outputSchema)}` : '';
    const text = `${cleanText(options.instructions, 100_000)}\n\nUser request:\n${userText}${schemaText}`.trim();
    await this.connect();
    options.signal?.throwIfAborted();
    const externalSessionId = cleanText(options.sessionId, 200) || routeHash(`${Date.now()}:${Math.random()}`);
    const selectedModel = cleanText(options.model, 160);
    const selectedEffort = cleanText(options.effort, 40).toLowerCase();
    const state = this.sessions.get(externalSessionId)
      || await this.createSession(externalSessionId, selectedModel, selectedEffort);
    options.signal?.throwIfAborted();
    await this.configureSession(state, selectedModel, selectedEffort);
    options.signal?.throwIfAborted();
    const runtimeSessionId = state.runtimeSessionId;
    options.onEvent({ type: 'session', sessionId: externalSessionId, model: options.model || 'Hermes' });
    let emittedText = false;
    let complete = false;
    let resolveTurn;
    let rejectTurn;
    const turnDone = new Promise((resolve, reject) => { resolveTurn = resolve; rejectTurn = reject; });
    const processEvent = event => {
      if (event.session_id !== runtimeSessionId) return;
      const payload = event.payload || {};
      if (event.type === 'message.delta' && typeof payload.text === 'string') {
        emittedText = true;
        options.onEvent({ type: 'text_delta', delta: payload.text });
      } else if (event.type === 'message.complete') {
        complete = true;
        if (!emittedText && typeof payload.text === 'string' && payload.text) options.onEvent({ type: 'text_delta', delta: payload.text });
        if (payload.usage) options.onEvent({
          type: 'usage', inputTokens: Number(payload.usage.input_tokens || payload.usage.input || 0),
          outputTokens: Number(payload.usage.output_tokens || payload.usage.output || 0),
        });
        resolveTurn();
      } else if (['tool.start', 'tool.progress', 'tool.complete'].includes(event.type)) {
        options.onEvent({ type: 'activity', activity: 'tool', status: event.type.slice(5), query: cleanText(payload.name || payload.title, 300) });
      } else if (['approval.request', 'clarify.request', 'sudo.request', 'secret.request'].includes(event.type)) {
        rejectTurn(new Error(`Your Hermes agent needs input in Hermes Desktop (${event.type.replace('.', ' ')}). Complete it there, then retry in getbased.`));
      } else if (event.type === 'error') rejectTurn(new Error(cleanText(payload.message || payload.error, 500) || 'Hermes gateway turn failed.'));
    };
    const listener = event => {
      try { processEvent(event); } catch (error) { rejectTurn(error); }
    };
    this.listeners.add(listener);
    this.turnFailures.add(rejectTurn);
    const abort = () => {
      void this.request('session.interrupt', { session_id: runtimeSessionId }, 5_000).catch(() => {});
      rejectTurn(Object.assign(new Error('Hermes gateway request cancelled.'), { name: 'AbortError' }));
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    const submission = new AbortController();
    const timer = setTimeout(() => rejectTurn(new Error('Hermes gateway turn timed out.')), PROMPT_TIMEOUT_MS);
    try {
      options.signal?.throwIfAborted();
      await Promise.all([
        this.request('prompt.submit', { session_id: runtimeSessionId, text }, REQUEST_TIMEOUT_MS, submission.signal),
        turnDone,
      ]);
      if (!complete) throw new Error('Hermes gateway ended without a response.');
      options.onEvent({ type: 'done', finishReason: 'stop' });
      return { sessionId: externalSessionId };
    } finally {
      clearTimeout(timer);
      submission.abort();
      this.listeners.delete(listener);
      this.turnFailures.delete(rejectTurn);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  async restart() {
    const error = new Error(`${this.label} closed the connection.`);
    this.cancelHandshake?.(error);
    this.connectPromise = null;
    const socket = this.socket;
    this.socket = null;
    this.rejectActiveWork(error);
    try { socket?.close(); } catch { /* ignored */ }
    this.modelCatalogPromise = null;
    this.sessions.clear();
  }

  async close() { await this.restart(); }
}

/**
 * Reads Hermes Desktop's connection registry and returns a provider that keeps
 * credential envelopes private. Unsupported safeStorage/OAuth/SSH entries are
 * visible as unavailable instead of being silently copied into the browser.
 * @param {{platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, WebSocketImpl?: typeof WebSocket, registryPath?: string}} [options]
 */
export function createHermesGatewayRouteProvider(options = {}) {
  const registryPath = options.registryPath || hermesDesktopRegistryPath(options.platform, options.env);
  const clients = new Map();
  const clientOwners = new Map();
  const knownProfiles = new Map();
  let closed = false;
  let refreshQueue = Promise.resolve();

  async function readRegistry() {
    let handle;
    try {
      handle = await open(registryPath, 'r');
      const parsed = JSON.parse(await readBoundedFile(handle, REGISTRY_MAX_BYTES, 'Hermes registry exceeds the companion limit.'));
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch { return null; } finally { await handle?.close(); }
  }

  async function refreshRoutes() {
    if (closed) throw new Error('Hermes gateway provider is closed.');
    const retained = new Set();
    const retainedProfiles = new Set();
    const registry = await readRegistry();
    /** @type {Array<{id: string, status: string, message?: string, client?: HermesGatewayClient, [key: string]: unknown}>} */
    const routes = [];
    for (const connection of Array.isArray(registry?.connections) ? registry.connections : []) {
      if (!connection || connection.kind !== 'remote') continue;
      const connectionId = cleanText(connection.id, 120);
      const label = cleanText(connection.label, 100) || 'Remote Hermes';
      let baseUrl;
      try { baseUrl = normalizeHermesGatewayBaseUrl(connection.url); }
      catch (error) {
        routes.push({ id: `gateway-${routeHash(connectionId || label)}`, label: `${label} · unavailable`, description: error instanceof Error ? error.message : 'Invalid gateway URL.', kind: 'gateway', status: 'unavailable', supportsLocalTools: false });
        continue;
      }
      const token = connection.authMode === 'token' && connection.token?.encoding === 'plain'
        ? cleanText(connection.token.value, 4_096) : '';
      const previous = knownProfiles.get(connectionId);
      if (previous && (previous.baseUrl !== baseUrl || previous.token !== token)) knownProfiles.delete(connectionId);
      let profiles = [{ name: 'default', display_name: '', description: '', is_default: true }];
      let status = 'available';
      let message = '';
      let probeFailed = false;
      if (!token) {
        status = 'unavailable';
        message = connection.authMode === 'oauth'
          ? 'Open this gateway in Hermes Desktop first. OAuth credentials cannot be copied into getbased.'
          : 'This Hermes credential is protected by Desktop and is not available to the companion.';
      } else {
        try {
          const response = await (options.fetchImpl || globalThis.fetch)(new URL(`${baseUrl}/api/profiles`), {
            cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(2_500),
            headers: { 'X-Hermes-Session-Token': token },
          });
          if (!response.ok) throw new Error('gateway rejected the profile request');
          const payload = await response.json();
          const discovered = Array.isArray(payload?.profiles) ? payload.profiles.filter(item => cleanText(item?.name, 100)) : [];
          if (discovered.length) profiles = discovered;
          knownProfiles.set(connectionId, { baseUrl, token, profiles });
        } catch {
          status = 'unavailable';
          probeFailed = true;
          const previousProfiles = knownProfiles.get(connectionId);
          if (previousProfiles) profiles = previousProfiles.profiles;
          message = 'Gateway detected in Hermes Desktop but not reachable. Start it or restore its tunnel, then check again.';
        }
      }
      if (token) retainedProfiles.add(connectionId);
      if (closed) throw new Error('Hermes gateway provider is closed.');
      if (probeFailed) {
        // A metadata outage must not tear down an established conversation.
        // Credential changes and removal still revoke the old connection.
        for (const [id, client] of clients) {
          if (clientOwners.get(id) === connectionId && client.baseUrl === baseUrl && client.token === token) retained.add(id);
        }
      }
      for (const profile of profiles) {
        const profileName = cleanText(profile.name, 100) || 'default';
        const id = `gateway-${routeHash(`${connectionId}:${profileName}`)}`;
        let client = clients.get(id);
        if (client && (client.baseUrl !== baseUrl || client.token !== token)) {
          await client.close();
          clients.delete(id);
          clientOwners.delete(id);
          client = null;
        }
        if (!client && token && status === 'available') {
          if (closed) throw new Error('Hermes gateway provider is closed.');
          client = new HermesGatewayClient({
            baseUrl, token, profile: profileName, label,
            fetchImpl: options.fetchImpl, WebSocketImpl: options.WebSocketImpl,
          });
          clients.set(id, client);
          clientOwners.set(id, connectionId);
        }
        if (client && status === 'available') retained.add(id);
        const profileLabel = cleanText(profile.display_name, 100) || profileName;
        const route = {
          id, label: `${profileLabel} · ${label}`,
          description: cleanText(profile.description, 240) || `Personal Hermes profile on ${label}`,
          kind: 'gateway', status, message, profile: profileName, gatewayLabel: label,
          supportsLocalTools: false, supportsFeatureJobs: false, supportsTextFeatureJobs: true, protocol: 'hermes-gateway',
        };
        Object.defineProperty(route, 'client', { value: client, enumerable: false });
        routes.push(route);
      }
    }
    for (const [id, client] of clients) {
      if (retained.has(id)) continue;
      await client.close();
      clients.delete(id);
      clientOwners.delete(id);
    }
    for (const id of knownProfiles.keys()) {
      if (!retainedProfiles.has(id)) knownProfiles.delete(id);
    }
    return routes;
  }

  function listRoutes() {
    if (closed) return Promise.reject(new Error('Hermes gateway provider is closed.'));
    const next = refreshQueue.then(refreshRoutes);
    refreshQueue = next.then(() => {}, () => {});
    return next;
  }

  return {
    listRoutes,
    async resolve(routeId) {
      const route = (await listRoutes()).find(item => item.id === routeId);
      if (!route) throw new Error('This Hermes execution target is no longer registered in Hermes Desktop.');
      if (route.status === 'unavailable' || !route.client) throw new Error(route.message || 'This Hermes gateway cannot be used by the companion.');
      return route;
    },
    async close() {
      closed = true;
      const closing = refreshQueue.then(async () => {
        await Promise.all([...clients.values()].map(client => client.close()));
        clients.clear();
        clientOwners.clear();
        knownProfiles.clear();
      });
      refreshQueue = closing.then(() => {}, () => {});
      await closing;
    },
  };
}
