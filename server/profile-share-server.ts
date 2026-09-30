// Minimal Node adapter for the SQLite-backed encrypted profile-share service.
// It never logs request URLs, identifiers, headers, bodies, or responses.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProfileShareObjectStore, ProfileShareHandler } from '../lib/profile-share-service.js';

import { boundedInteger, requestUrl } from '../lib/node-request-routing.js';

import { createServer } from 'node:http';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  handleProfileShareRequest,
  maintainProfileShareStorage,
} from '../lib/profile-share-service.js';
import { createSqliteProfileShareStore } from '../lib/profile-share-sqlite-store.js';

export interface ServerOptions {
  store?: ProfileShareObjectStore & {
    check?: () => void;
    close?: () => void;
  };
  handler?: ProfileShareHandler;
  maxRequestBytes?: number;
}

const DEFAULT_BIND_HOST = '0.0.0.0';
const DEFAULT_PORT = 8790;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;
const UNTRUSTED_CLIENT_IDENTITY_HEADERS = new Set([
  'x-forwarded-for',
  'x-real-ip',
  'x-vercel-forwarded-for',
  'cf-connecting-ip',
]);

function lastForwardedValue(value: unknown) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean).at(-1) || '';
}

function trustedHeaders(incoming: IncomingMessage) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value == null || UNTRUSTED_CLIENT_IDENTITY_HEADERS.has(name.toLowerCase())) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else {
      headers.set(name, value);
    }
  }
  const clientAddress = lastForwardedValue(incoming.headers['x-forwarded-for'])
    || String(incoming.socket.remoteAddress || 'unknown-client');
  headers.set('x-forwarded-for', clientAddress.slice(0, 128));
  return headers;
}

class RequestTooLargeError extends Error {}

async function readRequestBody(incoming: IncomingMessage, maxBytes: number) {
  const declared = Number.parseInt(String(incoming.headers['content-length'] || ''), 10);
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestTooLargeError();
  return new Promise<Buffer<ArrayBuffer>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const finish = <T>(callback: (value: T) => unknown, value: T) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    incoming.on('data', (chunk: string | Uint8Array) => {
      if (settled) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.byteLength;
      if (total > maxBytes) {
        finish(reject, new RequestTooLargeError());
        incoming.resume();
        return;
      }
      chunks.push(bytes);
    });
    incoming.once('end', () => finish(resolve, Buffer.concat(chunks, total)));
    incoming.once('aborted', () => finish(reject, new Error('Client disconnected')));
    incoming.once('error', error => finish(reject, error));
  });
}

async function webRequest(incoming: IncomingMessage, maxBytes: number) {
  const method = String(incoming.method || 'GET').toUpperCase();
  const init: RequestInit = {
    method,
    headers: trustedHeaders(incoming),
  };
  if (method !== 'GET' && method !== 'HEAD') {
    const body = await readRequestBody(incoming, maxBytes);
    if (body.byteLength) init.body = body;
  }
  return new Request(requestUrl(incoming), init);
}

async function writeWebResponse(outgoing: ServerResponse, response: Response) {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => outgoing.setHeader(name, value));
  outgoing.setHeader('X-Content-Type-Options', 'nosniff');
  outgoing.setHeader('Referrer-Policy', 'no-referrer');
  const body = response.body ? Buffer.from(await response.arrayBuffer()) : null;
  if (body) outgoing.setHeader('Content-Length', String(body.byteLength));
  outgoing.end(body);
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

export function createProfileShareServer(options: ServerOptions = {}) {
  const store = options.store || createSqliteProfileShareStore({
    databasePath: process.env.PROFILE_SHARE_SQLITE_PATH || '',
    rateLimitHmacKey: process.env.PROFILE_SHARE_RATE_LIMIT_KEY || '',
    maxDatabaseBytes: process.env.PROFILE_SHARE_DATABASE_MAX_BYTES,
  });
  const handler = options.handler || handleProfileShareRequest;
  const maxRequestBytes = boundedInteger(
    options.maxRequestBytes,
    DEFAULT_MAX_REQUEST_BYTES,
    64 * 1024,
    DEFAULT_MAX_REQUEST_BYTES,
  );

  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url || '/', 'http://localhost');
      if (incoming.method === 'GET' && url.pathname === '/health') {
        store.check?.();
        await writeWebResponse(outgoing, jsonResponse(200, { status: 'ok' }));
        return;
      }
      if (url.pathname !== '/api/share') {
        await writeWebResponse(outgoing, jsonResponse(404, { error: 'Not found' }));
        return;
      }
      const request = await webRequest(incoming, maxRequestBytes);
      await writeWebResponse(outgoing, await handler(request, store));
    } catch (error) {
      if (!outgoing.headersSent) {
        const tooLarge = error instanceof RequestTooLargeError;
        if (tooLarge) outgoing.setHeader('Connection', 'close');
        await writeWebResponse(outgoing, jsonResponse(
          tooLarge ? 413 : 500,
          { error: tooLarge ? 'Encrypted profile share is too large.' : 'Profile sharing is temporarily unavailable.' },
        ));
      } else if (!outgoing.destroyed) {
        outgoing.destroy();
      }
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = boundedInteger(
    process.env.PROFILE_SHARE_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    1_000,
    DEFAULT_REQUEST_TIMEOUT_MS,
  );
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 1_000;
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  return { server, store };
}

export async function startProfileShareServer() {
  const { server, store } = createProfileShareServer();
  const host = process.env.PROFILE_SHARE_BIND || DEFAULT_BIND_HOST;
  const port = boundedInteger(process.env.PROFILE_SHARE_PORT, DEFAULT_PORT, 1, 65_535);
  let maintenanceTimer: ReturnType<typeof setInterval> | undefined;
  try {
    store.check?.();
    await maintainProfileShareStorage(store).catch(() => {});
    maintenanceTimer = setInterval(() => {
      maintainProfileShareStorage(store).catch(() => {});
    }, MAINTENANCE_INTERVAL_MS);
    maintenanceTimer.unref();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => resolve(undefined));
    });
  } catch (error) {
    clearInterval(maintenanceTimer);
    try { store.close?.(); } catch {}
    throw error;
  }
  process.stdout.write(`Encrypted profile-share service listening on ${host}:${port}\n`);
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`Encrypted profile-share service stopping after ${signal}\n`);
    clearInterval(maintenanceTimer);
    const shutdownTimer = setTimeout(() => process.exit(1), 10_000);
    shutdownTimer.unref();
    server.close(() => {
      clearTimeout(shutdownTimer);
      try { store.close?.(); } catch {}
      process.exit(0);
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  return { server, store };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
  startProfileShareServer().catch(() => {
    process.stderr.write('Encrypted profile-share service failed to start\n');
    process.exit(1);
  });
}
