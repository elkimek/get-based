#!/usr/bin/env node
// @ts-check

import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexAppServerClient } from '../lib/codex-app-server-client.js';
import { createAgentHostService } from '../lib/agent-host-service.js';
import {
  buildIsolatedCodexArgs, buildIsolatedCodexEnvironment,
} from '../lib/codex-agent-isolation.js';
import { prepareAgentHostStorage } from '../lib/agent-host-storage.js';

const host = '127.0.0.1';
const configuredPort = String(process.env.GETBASED_AGENT_HOST_PORT || '').trim();
let port = Number(configuredPort || 8324);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write('GETBASED_AGENT_HOST_PORT must be an integer from 1 to 65535.\n');
  process.exit(1);
}
const strictPort = configuredPort !== '' || String(process.env.GETBASED_AGENT_HOST_STRICT_PORT || '').trim() === '1';
const lastPort = strictPort ? port : Math.min(65535, port + 7);
const maxRequestBytes = 1_200_000;
const maxImageRequestBytes = 20 * 1024 * 1024;
const allowedOrigins = String(process.env.GETBASED_AGENT_HOST_ALLOWED_ORIGINS || '')
  .split(',').map(value => value.trim()).filter(Boolean);
const workspaceRoot = mkdtempSync(join(tmpdir(), 'getbased-agent-'));
let agentStorage;
try {
  agentStorage = prepareAgentHostStorage();
} catch (error) {
  rmSync(workspaceRoot, { recursive: true, force: true });
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`getbased Agent Host refused to start: ${message}\n`);
  process.exit(1);
}
const { codexHome, token } = agentStorage;
const codexCommand = String(process.env.GETBASED_CODEX_COMMAND || 'codex').trim();
if (!codexCommand || codexCommand.includes('\0') || /[\r\n]/.test(codexCommand)) {
  process.stderr.write('GETBASED_CODEX_COMMAND is invalid.\n');
  process.exit(1);
}
const appServer = new CodexAppServerClient({
  command: codexCommand,
  cwd: workspaceRoot,
  args: buildIsolatedCodexArgs(),
  env: buildIsolatedCodexEnvironment(process.env, codexHome),
});
const service = createAgentHostService({ appServer, token, workspaceRoot, allowedOrigins });

const server = createServer(async (incoming, outgoing) => {
  try {
    const abortController = new AbortController();
    incoming.once('aborted', () => abortController.abort());
    outgoing.once('close', () => { if (!outgoing.writableEnded) abortController.abort(); });
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) headers.set(name, value.join(', '));
      else if (typeof value === 'string') headers.set(name, value);
    }
    const chunks = [];
    let receivedBytes = 0;
    const requestLimit = String(incoming.url || '').split('?')[0] === '/v1/uploads'
      ? maxImageRequestBytes
      : maxRequestBytes;
    if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
      const declaredBytes = Number(incoming.headers['content-length'] || 0);
      if (Number.isFinite(declaredBytes) && declaredBytes > requestLimit) {
        outgoing.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        outgoing.end('{"error":"request_too_large"}');
        incoming.destroy();
        return;
      }
      for await (const chunk of incoming) {
        const buffer = Buffer.from(chunk);
        receivedBytes += buffer.byteLength;
        if (receivedBytes > requestLimit) {
          outgoing.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
          outgoing.end('{"error":"request_too_large"}');
          incoming.destroy();
          return;
        }
        chunks.push(buffer);
      }
    }
    const request = new Request(`http://${host}:${port}${incoming.url || '/'}`, {
      method: incoming.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
      signal: abortController.signal,
    });
    const response = await service.handleRequest(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (!response.body) {
      outgoing.end();
      return;
    }
    for await (const chunk of response.body) outgoing.write(chunk);
    outgoing.end();
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    outgoing.end('{"error":"internal_error"}');
  }
});

function listen() {
  server.listen(port, host);
}

server.on('listening', () => {
  process.stdout.write(`getbased Companion listening at http://${host}:${port}\n`);
  process.stdout.write('Automatic browser discovery enabled.\n');
  process.stdout.write(`Private agent state: ${agentStorage.dataDirectory}\n`);
  process.stdout.write('Keep this process running while using CLI agents in getbased.\n');
});
server.on('error', error => {
  if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EADDRINUSE' && port < lastPort) {
    port += 1;
    process.stderr.write(`getbased Companion port busy; trying http://${host}:${port}\n`);
    listen();
    return;
  }
  process.stderr.write(`getbased Companion could not start: ${error.message}\n`);
  void shutdown().finally(() => { process.exitCode = 1; });
});

/** @type {Promise<void>|undefined} */
let shutdownPromise;
async function shutdown() {
  if (!shutdownPromise) shutdownPromise = (async () => {
    if (server.listening) await new Promise(resolve => server.close(() => resolve()));
    await appServer.close();
    rmSync(workspaceRoot, { recursive: true, force: true });
  })();
  return shutdownPromise;
}

process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));

listen();
