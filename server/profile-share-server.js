// @ts-check
// Minimal Node adapter for the SQLite-backed encrypted profile-share service.
// It never logs request URLs, identifiers, headers, bodies, or responses.

import { createServer } from 'node:http';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  handleProfileShareRequest,
  maintainProfileShareStorage,
} from '../lib/profile-share-service.js';
import { createSqliteProfileShareStore } from '../lib/profile-share-sqlite-store.js';

const DEFAULT_BIND_HOST = '0.0.0.0';
const DEFAULT_PORT = 8790;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function firstForwardedValue(value) {
  return String(value || '').split(',')[0].trim();
}

function lastForwardedValue(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean).at(-1) || '';
}

/** @param {import('node:http').IncomingMessage} incoming */
function requestUrl(incoming) {
  const forwardedProto = firstForwardedValue(incoming.headers['x-forwarded-proto']);
  const protocol = forwardedProto === 'https' ? 'https' : 'http';
  const forwardedHost = firstForwardedValue(incoming.headers['x-forwarded-host']);
  const host = forwardedHost || firstForwardedValue(incoming.headers.host) || 'localhost';
  return new URL(incoming.url || '/', `${protocol}://${host}`).toString();
}

/** @param {import('node:http').IncomingMessage} incoming */
function trustedHeaders(incoming) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value == null || ['x-forwarded-for', 'x-real-ip'].includes(name.toLowerCase())) continue;
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

/**
 * @param {import('node:http').IncomingMessage} incoming
 * @param {number} maxBytes
 */
async function readRequestBody(incoming, maxBytes) {
  const declared = Number.parseInt(String(incoming.headers['content-length'] || ''), 10);
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestTooLargeError();
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    incoming.on('data', chunk => {
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

/**
 * @param {import('node:http').IncomingMessage} incoming
 * @param {number} maxBytes
 */
async function webRequest(incoming, maxBytes) {
  const method = String(incoming.method || 'GET').toUpperCase();
  /** @type {RequestInit} */
  const init = {
    method,
    headers: trustedHeaders(incoming),
  };
  if (method !== 'GET' && method !== 'HEAD') {
    const body = await readRequestBody(incoming, maxBytes);
    if (body.byteLength) init.body = body;
  }
  return new Request(requestUrl(incoming), init);
}

/**
 * @param {import('node:http').ServerResponse} outgoing
 * @param {Response} response
 */
async function writeWebResponse(outgoing, response) {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => outgoing.setHeader(name, value));
  outgoing.setHeader('X-Content-Type-Options', 'nosniff');
  outgoing.setHeader('Referrer-Policy', 'no-referrer');
  const body = response.body ? Buffer.from(await response.arrayBuffer()) : null;
  if (body) outgoing.setHeader('Content-Length', String(body.byteLength));
  outgoing.end(body);
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

/**
 * @param {{
 *   store?: import('../lib/profile-share-service.js').ProfileShareObjectStore & { check?: () => void, close?: () => void },
 *   handler?: typeof handleProfileShareRequest,
 *   maxRequestBytes?: number,
 * }} [options]
 */
export function createProfileShareServer(options = {}) {
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
  store.check?.();
  await maintainProfileShareStorage(store).catch(() => {});
  const maintenanceTimer = setInterval(() => {
    maintainProfileShareStorage(store).catch(() => {});
  }, MAINTENANCE_INTERVAL_MS);
  maintenanceTimer.unref();

  const host = process.env.PROFILE_SHARE_BIND || DEFAULT_BIND_HOST;
  const port = boundedInteger(process.env.PROFILE_SHARE_PORT, DEFAULT_PORT, 1, 65_535);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(undefined));
  });
  process.stdout.write(`Encrypted profile-share service listening on ${host}:${port}\n`);
  const shutdown = signal => {
    process.stdout.write(`Encrypted profile-share service stopping after ${signal}\n`);
    clearInterval(maintenanceTimer);
    server.close(() => {
      try { store.close?.(); } catch {}
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
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
