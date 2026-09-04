#!/usr/bin/env node
// @ts-check

import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexAppServerClient } from '../lib/codex-app-server-client.js';
import { ACPAgentClient } from '../lib/acp-agent-client.js';
import { ClaudeAgentClient } from '../lib/claude-agent-client.js';
import { OpenClawAgentClient } from '../lib/openclaw-agent-client.js';
import { createAgentHostService } from '../lib/agent-host-service.js';
import {
  buildIsolatedCodexArgs, buildIsolatedCodexEnvironment,
} from '../lib/codex-agent-isolation.js';
import { prepareAgentHostStorage } from '../lib/agent-host-storage.js';
import { createCompanionRuntimeController } from '../lib/companion-runtime-control.js';
import { buildLocalAgentEnvironment, detectLocalAgents } from '../lib/local-agent-registry.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

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
  agentStorage = prepareAgentHostStorage({ requireCodexAuth: false });
} catch (error) {
  rmSync(workspaceRoot, { recursive: true, force: true });
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`getbased Agent Host refused to start: ${message}\n`);
  process.exit(1);
}
const { codexHome, token } = agentStorage;
const detectedAgents = detectLocalAgents();
const localAgentEnvironment = buildLocalAgentEnvironment(process.env);
if (!detectedAgents.length) {
  rmSync(workspaceRoot, { recursive: true, force: true });
  process.stderr.write('getbased Companion did not find Codex, Claude Code, OpenCode, Hermes, Grok, or OpenClaw on this computer.\n');
  process.exit(1);
}
/** @type {CodexAppServerClient | null} */
let appServer = null;
const agentAdapters = detectedAgents.map(agent => {
  let client = null;
  let status = agent.status;
  let message = agent.message;
  if (agent.compatible === false) {
    status = 'unavailable';
  } else if (agent.protocol === 'codex') {
    if (agentStorage.codexAuthenticated) {
      appServer = new CodexAppServerClient({
        command: agent.command, cwd: workspaceRoot, args: buildIsolatedCodexArgs(),
        env: buildIsolatedCodexEnvironment(process.env, codexHome),
      });
      client = appServer;
    } else {
      status = 'login_required';
      message = 'Run `codex login` once, then check the connection again.';
    }
  } else if (agent.protocol === 'acp') {
    client = new ACPAgentClient({
      id: agent.id, command: agent.command, args: agent.args, cwd: workspaceRoot, env: localAgentEnvironment,
    });
  } else if (agent.protocol === 'claude' && status === 'available') {
    client = new ClaudeAgentClient({ command: agent.command, cwd: workspaceRoot, env: localAgentEnvironment });
  } else if (agent.protocol === 'openclaw' && status === 'available') {
    client = new OpenClawAgentClient({ command: agent.command, cwd: workspaceRoot, env: localAgentEnvironment });
  }
  return { ...agent, status, message, client };
});
const invokedPath = resolve(process.argv[1] || '');
const bundlePath = invokedPath.endsWith('getbased-companion.mjs')
  ? invokedPath
  : fileURLToPath(new URL('../getbased-companion.mjs', import.meta.url));
const bridgePath = invokedPath.endsWith('getbased-companion.mjs')
  ? invokedPath
  : fileURLToPath(new URL('../bin/getbased-companion.js', import.meta.url));
const runtimeClients = agentAdapters.map(agent => agent.client).filter(Boolean);
const runtimeController = createCompanionRuntimeController({
  appServer: {
    async restart() { await Promise.all(runtimeClients.map(client => client.restart?.())); },
    async initialize() {},
  },
  bundlePath,
});
const service = createAgentHostService({
  appServer,
  agents: agentAdapters,
  bundlePath: bridgePath,
  token,
  workspaceRoot,
  allowedOrigins,
  runtimeInfo: runtimeController.getInfo,
  controlHandler: runtimeController.handle,
});

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
    await Promise.all(runtimeClients.map(client => client.close?.()));
    rmSync(workspaceRoot, { recursive: true, force: true });
  })();
  return shutdownPromise;
}

process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));

listen();
