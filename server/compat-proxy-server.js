// @ts-check
// Minimal Node adapter for the shared compatibility proxy Request handler.
// It deliberately has no request/access logging: wearable payloads can contain
// health data and OAuth credentials and must remain transient in memory.

import { createServer } from 'node:http';
import { resolve as resolvePath } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const DEFAULT_BIND_HOST = '0.0.0.0';
const DEFAULT_PORT = 8787;
const DEFAULT_REQUEST_TIMEOUT_MS = 190_000;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function firstForwardedValue(value) {
  return String(value || '').split(',')[0].trim();
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
function webRequest(incoming) {
  const method = String(incoming.method || 'GET').toUpperCase();
  const controller = new AbortController();
  incoming.once('aborted', () => controller.abort(new Error('Client disconnected')));
  /** @type {RequestInit & { duplex?: 'half' }} */
  const init = {
    method,
    headers: /** @type {HeadersInit} */ (incoming.headers),
    signal: controller.signal,
  };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = /** @type {BodyInit} */ (Readable.toWeb(incoming));
    init.duplex = 'half';
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
  if (!response.body) {
    outgoing.end();
    return;
  }
  try {
    await new Promise((resolve, reject) => {
      const body = Readable.fromWeb(response.body);
      body.once('error', reject);
      outgoing.once('error', reject);
      outgoing.once('finish', resolve);
      body.pipe(outgoing);
    });
  } catch {
    if (!outgoing.destroyed) outgoing.destroy();
  }
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
 * @param {{ proxyHandler?: (request: Request) => Promise<Response> | Response }} [options]
 */
export function createCompatProxyServer(options = {}) {
  let proxyHandler = options.proxyHandler;
  const resolveProxyHandler = async () => {
    if (proxyHandler) return proxyHandler;
    const module = await import('../api/proxy.js');
    proxyHandler = module.handler;
    return proxyHandler;
  };

  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url || '/', 'http://localhost');
      if (incoming.method === 'GET' && url.pathname === '/health') {
        await writeWebResponse(outgoing, jsonResponse(200, { status: 'ok' }));
        return;
      }
      if (url.pathname !== '/api/proxy') {
        await writeWebResponse(outgoing, jsonResponse(404, { error: 'Not found' }));
        return;
      }
      const handler = await resolveProxyHandler();
      await writeWebResponse(outgoing, await handler(webRequest(incoming)));
    } catch {
      if (!outgoing.headersSent) {
        await writeWebResponse(outgoing, jsonResponse(500, { error: 'Compatibility relay failed' }));
      } else if (!outgoing.destroyed) {
        outgoing.destroy();
      }
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = boundedInteger(
    process.env.COMPAT_PROXY_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    1_000,
    DEFAULT_REQUEST_TIMEOUT_MS,
  );
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 1_000;
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  return server;
}

export async function startCompatProxyServer() {
  const server = createCompatProxyServer();
  const host = process.env.COMPAT_PROXY_BIND || DEFAULT_BIND_HOST;
  const port = boundedInteger(process.env.COMPAT_PROXY_PORT, DEFAULT_PORT, 1, 65_535);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  process.stdout.write(`Compatibility relay listening on ${host}:${port}\n`);
  const shutdown = signal => {
    process.stdout.write(`Compatibility relay stopping after ${signal}\n`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
  startCompatProxyServer().catch(() => {
    process.stderr.write('Compatibility relay failed to start\n');
    process.exit(1);
  });
}
