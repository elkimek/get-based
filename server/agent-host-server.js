#!/usr/bin/env node
// @ts-check

import { createServer } from 'node:http';
import { createCompanionRequestHandler } from '../lib/companion-http.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexAppServerClient } from '../lib/codex-app-server-client.js';
import { ACPAgentClient } from '../lib/acp-agent-client.js';
import { ClaudeAgentClient } from '../lib/claude-agent-client.js';
import { createHermesGatewayRouteProvider } from '../lib/hermes-gateway-client.js';
import { OpenClawAgentClient } from '../lib/openclaw-agent-client.js';
import { createAgentHostService } from '../lib/agent-host-service.js';
import {
  buildIsolatedCodexArgs, buildIsolatedCodexEnvironment,
} from '../lib/codex-agent-isolation.js';
import { prepareAgentHostStorage } from '../lib/agent-host-storage.js';
import { createCompanionRuntimeController } from '../lib/companion-runtime-control.js';
import { recoverCompanionListener } from '../lib/companion-listener.js';
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
let recoveringListener = false;
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
const hermesRouteProvider = detectedAgents.some(agent => agent.id === 'hermes')
  ? createHermesGatewayRouteProvider({ env: process.env }) : null;
if (!detectedAgents.length) {
  rmSync(workspaceRoot, { recursive: true, force: true });
  process.stderr.write('getbased Companion did not find Codex, OpenCode, Hermes, Grok, or OpenClaw on this computer.\n');
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
        command: agent.command, cwd: workspaceRoot, args: [...agent.args, ...buildIsolatedCodexArgs()],
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
    client = new ClaudeAgentClient({ command: agent.command, args: agent.args, cwd: workspaceRoot, env: localAgentEnvironment });
  } else if (agent.protocol === 'openclaw' && status === 'available') {
    client = new OpenClawAgentClient({ command: agent.command, args: agent.args, cwd: workspaceRoot, env: localAgentEnvironment });
  }
  const routes = agent.id === 'openclaw' && client ? [{
    id: 'gateway-default',
    label: 'Personal gateway · default agent',
    description: 'Use the default agent, memory, sessions, and tools configured in your OpenClaw gateway.',
    kind: 'gateway', status: 'available', supportsLocalTools: false, supportsFeatureJobs: false,
    protocol: 'openclaw',
    client: new OpenClawAgentClient({
      command: agent.command, args: agent.args, cwd: workspaceRoot, env: localAgentEnvironment, mode: 'gateway',
    }),
  }] : [];
  return {
    ...agent, status, message, client, routes,
    ...(agent.id === 'hermes' && hermesRouteProvider ? { routeProvider: hermesRouteProvider } : {}),
  };
});
const invokedPath = resolve(process.argv[1] || '');
const bundlePath = invokedPath.endsWith('getbased-companion.mjs')
  ? invokedPath
  : fileURLToPath(new URL('../getbased-companion.mjs', import.meta.url));
const bridgePath = invokedPath.endsWith('getbased-companion.mjs')
  ? invokedPath
  : fileURLToPath(new URL('../bin/getbased-companion.js', import.meta.url));
const runtimeClients = [
  ...agentAdapters.map(agent => agent.client),
  ...agentAdapters.flatMap(agent => (agent.routes || []).map(route => route.client)),
  hermesRouteProvider,
].filter(Boolean);
const runtimeController = createCompanionRuntimeController({
  appServer: {
    async restart() { await Promise.all(runtimeClients.map(client => /** @type {any} */ (client).restart?.())); },
    async initialize() {},
  },
  bundlePath,
  // Keep agent clients and their workspace intact until the service starts.
  stopRuntime: () => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }),
  recoverRuntime: async () => {
    recoveringListener = true;
    try {
      await recoverCompanionListener(server, { host, port, lastPort, onPort: value => { port = value; } });
    } finally { recoveringListener = false; }
  },
  exitRuntime: () => { void shutdown().finally(() => process.exit(0)); },
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

const server = createServer(createCompanionRequestHandler({
  handleRequest: request => service.handleRequest(request),
  host, getPort: () => port, maxRequestBytes, maxImageRequestBytes,
}));

function listen() {
  server.listen(port, host);
}

server.on('listening', () => {
  process.stdout.write(`getbased Companion listening at http://${host}:${port}\n`);
  process.stdout.write('Automatic browser discovery enabled.\n');
  process.stdout.write(`Private agent state: ${agentStorage.dataDirectory}\n`);
  process.stdout.write(`Local management: http://${host}:${port}/manage\n`);
  process.stdout.write(process.env.GETBASED_COMPANION_SERVICE === '1'
    ? 'Installed Companion service is running in the background.\n'
    : 'Temporary Companion: keep this terminal open. Closing it stops this instance, not other installed or development Companions.\n');
});
server.on('error', error => {
  // Recovery owns its retries and error settlement; do not destroy the retained
  // clients/workspace through the normal startup failure path.
  if (recoveringListener) return;
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
    // Stop accepting connections immediately, but let clients settle active
    // requests before waiting for those connections to finish draining.
    const listenerClosed = server.listening
      ? new Promise(resolve => server.close(() => resolve())) : Promise.resolve();
    try {
      await Promise.allSettled(runtimeClients.map(async client => { await client.close?.(); }));
      await listenerClosed;
    } finally { rmSync(workspaceRoot, { recursive: true, force: true }); }
  })();
  return shutdownPromise;
}

process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));

listen();
