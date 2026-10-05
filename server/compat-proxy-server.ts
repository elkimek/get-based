// Minimal Node adapter for the shared compatibility proxy Request handler.
// It deliberately has no request/access logging: wearable payloads can contain
// health data and OAuth credentials and must remain transient in memory.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { boundedInteger, requestUrl } from '../lib/node-request-routing.js';

import { createServer } from 'node:http';
import { resolve as resolvePath } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_BIND_HOST = '0.0.0.0';
const DEFAULT_PORT = 8787;
const DEFAULT_REQUEST_TIMEOUT_MS = 190_000;

function webRequest(incoming: IncomingMessage) {
  const method = String(incoming.method || 'GET').toUpperCase();
  const controller = new AbortController();
  incoming.once('aborted', () => controller.abort(new Error('Client disconnected')));
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers: (incoming.headers as HeadersInit),
    signal: controller.signal,
  };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = (Readable.toWeb(incoming) as unknown as BodyInit);
    init.duplex = 'half';
  }
  return new Request(requestUrl(incoming), init);
}

async function writeWebResponse(outgoing: ServerResponse, response: Response) {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => outgoing.setHeader(name, value));
  if (!response.body) {
    outgoing.end();
    return;
  }
  try {
    await pipeline(Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>), outgoing);
  } catch {
    if (!outgoing.destroyed) outgoing.destroy();
  }
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

export function createCompatProxyServer(options: { proxyHandler?: (request: Request) => Promise<Response> | Response } = {}) {
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
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(undefined));
  });
  process.stdout.write(`Compatibility relay listening on ${host}:${port}\n`);
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(`Compatibility relay stopping after ${signal}\n`);
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    server.close(() => { clearTimeout(forceExit); process.exit(0); });
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
