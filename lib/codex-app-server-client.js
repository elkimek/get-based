// @ts-check
// Minimal JSON-RPC client for the local `codex app-server` process.

import { EventEmitter } from 'node:events';
import { spawn as spawnChild } from 'node:child_process';
import { createInterface } from 'node:readline';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class CodexAppServerError extends Error {
  constructor(message, code = 'codex_app_server_error') {
    super(message);
    this.name = 'CodexAppServerError';
    this.code = code;
  }
}

/** @param {unknown} value */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value */
function errorMessage(value) {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  return 'Codex app-server request failed.';
}

export class CodexAppServerClient extends EventEmitter {
  /**
   * @param {{
   *   command?: string,
   *   args?: string[],
   *   cwd?: string,
   *   env?: NodeJS.ProcessEnv,
   *   requestTimeoutMs?: number,
   *   spawnImpl?: typeof spawnChild,
   * }} [options]
   */
  constructor(options = {}) {
    super();
    this.command = options.command || 'codex';
    this.args = options.args || ['app-server'];
    this.cwd = options.cwd;
    this.env = options.env;
    this.requestTimeoutMs = options.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;
    this.spawnImpl = options.spawnImpl || spawnChild;
    /** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
    this.child = null;
    this.nextRequestId = 1;
    /** @type {Map<number | string, {resolve: (value: any) => void, reject: (reason?: any) => void, timer: ReturnType<typeof setTimeout>}>} */
    this.pending = new Map();
    /** @type {Promise<any> | null} */
    this.initializePromise = null;
    this.closed = false;
  }

  start() {
    if (this.child) return;
    if (this.closed) throw new CodexAppServerError('Codex app-server client is closed.', 'client_closed');
    const child = this.spawnImpl(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = /** @type {import('node:child_process').ChildProcessWithoutNullStreams} */ (child);
    const lines = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    lines.on('line', line => { if (this.child === child) this.handleLine(line); });
    this.child.stderr.on('data', chunk => this.emit('diagnostic', String(chunk)));
    this.child.once('error', error => { if (this.child === child) this.handleExit(error); });
    this.child.once('exit', (code, signal) => {
      if (this.child !== child) return;
      const suffix = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
      this.handleExit(new CodexAppServerError(`Codex app-server exited with ${suffix}.`, 'process_exit'));
    });
  }

  /** @param {string} line */
  handleLine(line) {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.emit('protocolError', new CodexAppServerError('Codex app-server returned invalid JSON.', 'invalid_json'));
      return;
    }
    if (!isRecord(message)) return;
    if (Object.hasOwn(message, 'id') && !Object.hasOwn(message, 'method')) {
      const pending = this.pending.get(/** @type {any} */ (message).id);
      if (!pending) return;
      this.pending.delete(/** @type {any} */ (message).id);
      clearTimeout(pending.timer);
      if (Object.hasOwn(message, 'error')) {
        const rpcError = /** @type {any} */ (message).error;
        pending.reject(new CodexAppServerError(
          typeof rpcError?.message === 'string' ? rpcError.message : 'Codex app-server request failed.',
          typeof rpcError?.code === 'string' || typeof rpcError?.code === 'number'
            ? String(rpcError.code)
            : 'rpc_error',
        ));
      } else {
        pending.resolve(/** @type {any} */ (message).result);
      }
      return;
    }
    if (typeof /** @type {any} */ (message).method !== 'string') return;
    if (Object.hasOwn(message, 'id')) this.emit('serverRequest', message);
    else this.emit('notification', message);
  }

  /** @param {unknown} reason */
  handleExit(reason) {
    if (!this.child) return;
    this.child = null;
    this.initializePromise = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(reason);
    }
    this.pending.clear();
    this.emit('exit', reason);
  }

  /**
   * @param {string} method
   * @param {unknown} [params]
   * @param {{timeoutMs?: number}} [options]
   */
  request(method, params = {}, options = {}) {
    this.start();
    const child = this.child;
    if (!child) return Promise.reject(new CodexAppServerError('Codex app-server is unavailable.', 'process_unavailable'));
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timeoutMs = options.timeoutMs || this.requestTimeoutMs;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CodexAppServerError(`Codex app-server ${method} timed out.`, 'request_timeout'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, error => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        clearTimeout(pending.timer);
        pending.reject(new CodexAppServerError(errorMessage(error), 'write_failed'));
      });
    });
  }

  /** @param {number|string} id @param {unknown} result */
  respond(id, result) {
    if (!this.child) throw new CodexAppServerError('Codex app-server is unavailable.', 'process_unavailable');
    this.child.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }

  /** @param {string} method @param {unknown} [params] */
  notify(method, params = {}) {
    if (!this.child) throw new CodexAppServerError('Codex app-server is unavailable.', 'process_unavailable');
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  initialize() {
    if (!this.initializePromise) {
      this.initializePromise = this.request('initialize', {
        clientInfo: {
          name: 'getbased-agent-host',
          title: 'getbased Agent Host',
          version: '0.1.0',
        },
        capabilities: { experimentalApi: true },
      }).then(result => {
        this.notify('initialized');
        return result;
      }).catch(error => {
        this.initializePromise = null;
        throw error;
      });
    }
    return this.initializePromise;
  }

  async restart() {
    await this.close();
    this.closed = false;
  }

  async close() {
    this.closed = true;
    this.initializePromise = null;
    const child = this.child;
    this.child = null;
    if (!child) return;
    const error = new CodexAppServerError('Codex app-server client closed.', 'client_closed');
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
}
