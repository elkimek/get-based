// Minimal JSON-RPC client for the local `codex app-server` process.

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { RpcClientOptions, RpcClientState } from './rpc-client-state.js';
import { rejectPendingRequests } from './rpc-client-state.js';

import { EventEmitter } from 'node:events';
import { spawn as spawnChild } from 'node:child_process';
import { createInterface } from 'node:readline';

interface RpcError { message?: unknown; code?: unknown }

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class CodexAppServerError extends Error {
  declare code: string;
  constructor(message: string, code = 'codex_app_server_error') {
    super(message);
    this.name = 'CodexAppServerError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  return 'Codex app-server request failed.';
}

export interface CodexAppServerClient extends RpcClientState<unknown, unknown> {}

export class CodexAppServerClient extends EventEmitter {

  constructor(options: RpcClientOptions = {}) {
    super();
    this.command = options.command || 'codex';
    this.args = options.args || ['app-server'];
    this.cwd = options.cwd;
    this.env = options.env;
    this.requestTimeoutMs = options.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;
    this.spawnImpl = options.spawnImpl || spawnChild;
    this.child = null;
    this.nextRequestId = 1;
    this.pending = new Map();
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
    this.child = (child as ChildProcessWithoutNullStreams);
    const lines = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    lines.on('line', line => { if (this.child === child) this.handleLine(line); });
    this.child.stderr.on('data', chunk => this.emit('diagnostic', String(chunk)));
    // A closed pipe emits on stdin, independently of the process error event.
    this.child.stdin.on('error', error => { if (this.child === child) this.handleExit(error); });
    this.child.once('error', error => { if (this.child === child) this.handleExit(error); });
    this.child.once('exit', (code, signal) => {
      if (this.child !== child) return;
      const suffix = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
      this.handleExit(new CodexAppServerError(`Codex app-server exited with ${suffix}.`, 'process_exit'));
    });
  }

  handleLine(line: string) {
    if (!line.trim()) return;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      this.emit('protocolError', new CodexAppServerError('Codex app-server returned invalid JSON.', 'invalid_json'));
      return;
    }
    if (!isRecord(message)) return;
    if (Object.hasOwn(message, 'id') && !Object.hasOwn(message, 'method')) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (Object.hasOwn(message, 'error')) {
        const rpcError = message.error as RpcError | null | undefined;
        pending.reject(new CodexAppServerError(
          typeof rpcError?.message === 'string' ? rpcError.message : 'Codex app-server request failed.',
          typeof rpcError?.code === 'string' || typeof rpcError?.code === 'number'
            ? String(rpcError.code)
            : 'rpc_error',
        ));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (typeof message.method !== 'string') return;
    if (Object.hasOwn(message, 'id')) this.emit('serverRequest', message);
    else this.emit('notification', message);
  }

  handleExit(reason: unknown) {
    if (!this.child) return;
    this.child = null;
    this.initializePromise = null;
    rejectPendingRequests(() => this.pending, () => reason);
    this.emit('exit', reason);
  }

  request<T = unknown>(method: string, params: unknown = {}, options: { timeoutMs?: number } = {}): Promise<T> {
    this.start();
    const child = this.child;
    if (!child) return Promise.reject(new CodexAppServerError('Codex app-server is unavailable.', 'process_unavailable'));
    const id = this.nextRequestId++;
    return new Promise<unknown>((resolve, reject) => {
      const timeoutMs = options.timeoutMs || this.requestTimeoutMs;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CodexAppServerError(`Codex app-server ${method} timed out.`, 'request_timeout'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const rejectWrite = (error: unknown) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        clearTimeout(pending.timer);
        pending.reject(new CodexAppServerError(errorMessage(error), 'write_failed'));
      };
      try {
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, rejectWrite);
      } catch (error) {
        rejectWrite(error);
      }
    }) as Promise<T>;
  }

  respond(id: number | string, result: unknown) {
    if (!this.child) throw new CodexAppServerError('Codex app-server is unavailable.', 'process_unavailable');
    this.child.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }

  notify(method: string, params: unknown = {}) {
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
    rejectPendingRequests(() => this.pending, () => error);
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
}
