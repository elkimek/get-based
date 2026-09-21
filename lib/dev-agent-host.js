// @ts-check
// Automatic local-agent companion lifecycle for the development server.

import { execFileSync, spawn as spawnChild } from 'node:child_process';
import { join } from 'node:path';
import { prepareAgentHostStorage } from './agent-host-storage.js';
import {
  detectLocalAgents, findBundledOpenClawExecutable, isLocalAgentSpecEnabled, publicAgentDescriptors,
  normalizeAgentVersion, readCommandJson,
} from './local-agent-registry.js';
import {
  AGENT_HOST_CAPABILITY_LIST, AGENT_HOST_PROTOCOL_VERSION, GETBASED_COMPANION_VERSION,
} from '../shared/agent-host-protocol.js';

const LOCAL_CLI_SPECS = [
  { id: 'codex', command: 'codex', env: 'GETBASED_CODEX_COMMAND', name: 'Codex CLI', description: 'OpenAI official CLI', compatible: true },
  { id: 'claude', command: 'claude', env: 'GETBASED_CLAUDE_COMMAND', name: 'Claude Agent', description: 'Anthropic agent · API/Console billing only', compatible: true },
  { id: 'opencode', command: 'opencode', env: 'GETBASED_OPENCODE_COMMAND', name: 'OpenCode', description: 'Open-source multi-model agent CLI', compatible: true },
  { id: 'hermes', command: 'hermes', env: 'GETBASED_HERMES_COMMAND', name: 'Hermes Agent', description: 'Nous Research agent CLI', compatible: true },
  { id: 'grok', command: 'grok', env: 'GETBASED_GROK_COMMAND', name: 'Grok Build', description: 'SpaceXAI coding agent CLI', compatible: true },
  { id: 'openclaw', command: 'openclaw', env: 'GETBASED_OPENCLAW_COMMAND', name: 'OpenClaw', description: 'Open-source personal AI assistant', compatible: true },
];

function detectLocalClis(execImpl, env, platform = process.platform) {
  if (platform === 'win32') {
    return publicAgentDescriptors(detectLocalAgents({ env, platform, execFileSyncImpl: execImpl }));
  }
  return LOCAL_CLI_SPECS.flatMap(spec => {
    if (!isLocalAgentSpecEnabled(/** @type {any} */ (spec), env)) return [];
    const configured = String(env[spec.env] || '').trim();
    const command = configured || (spec.id === 'openclaw'
      ? findBundledOpenClawExecutable({ env, platform }) || spec.command
      : spec.command);
    try {
      const version = normalizeAgentVersion(spec.id, execImpl(command, ['--version'], {
        encoding: 'utf8', env, timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
      }));
      let status = 'detected';
      let message = '';
      if (spec.id === 'claude') {
        try {
          const auth = readCommandJson(() => execImpl(command, ['auth', 'status', '--json'], {
            encoding: 'utf8', env, timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
          }));
          if (auth?.loggedIn !== true) {
            status = 'login_required';
            message = 'Run `claude auth login --console` for API billing, then check the connection again.';
          }
        } catch {
          status = 'login_required';
          message = 'Claude Agent is installed, but its API/Console sign-in could not be verified.';
        }
      }
      return [{ ...spec, version, status, ...(message ? { message } : {}) }];
    } catch { return []; }
  });
}

/**
 * @param {{
 *   root: string,
 *   env?: NodeJS.ProcessEnv,
 *   execFileSyncImpl?: typeof execFileSync,
 *   spawnImpl?: typeof spawnChild,
 *   prepareStorage?: typeof prepareAgentHostStorage,
 *   platform?: NodeJS.Platform,
 * }} options
 */
export function startDevAgentHost(options) {
  const env = options.env || process.env;
  if (String(env.GETBASED_AUTO_AGENT_HOST || '').trim() === '0') {
    return { describe: () => ({ agents: [] }), refresh: () => ({ agents: [] }), close() {} };
  }

  const execImpl = options.execFileSyncImpl || execFileSync;
  let agents = detectLocalClis(execImpl, env, options.platform);
  if (!agents.length) return {
    describe: () => ({ agents }),
    refresh: () => {
      agents = detectLocalClis(execImpl, env, options.platform);
      return { agents };
    },
    close() {},
  };

  let storage;
  try {
    storage = (options.prepareStorage || prepareAgentHostStorage)({ env, requireCodexAuth: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local agent storage is unavailable.';
    for (const agent of agents) Object.assign(agent, { compatible: false, status: 'unavailable', message });
    const refreshUnavailable = () => {
      agents = detectLocalClis(execImpl, env, options.platform);
      for (const agent of agents) Object.assign(agent, { compatible: false, status: 'unavailable', message });
      return { agents };
    };
    return {
      describe: () => ({ agents }),
      refresh: refreshUnavailable,
      close() {},
    };
  }

  const configuredPort = String(env.GETBASED_AGENT_HOST_PORT || '').trim();
  const port = Number(configuredPort || 8324);
  let endpoint = `http://127.0.0.1:${port}`;
  let status = 'starting';
  let message = '';
  let hostInfo = {};
  const entrypoint = join(options.root, 'server', 'agent-host-server.js');
  const childArgs = String(env.GETBASED_AGENT_HOST_WATCH || '').trim() === '0'
    ? [entrypoint]
    : ['--watch-preserve-output', '--watch', entrypoint];
  const child = (options.spawnImpl || spawnChild)(process.execPath, childArgs, {
    cwd: options.root,
    env: {
      ...env,
      GETBASED_AGENT_HOST_TOKEN: storage.token,
      GETBASED_AGENT_HOST_PORT: configuredPort,
      GETBASED_AGENT_HOST_STRICT_PORT: configuredPort ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', chunk => {
    const output = String(chunk);
    const listening = output.match(/(?:getbased Companion|getbased Agent Host) listening at (http:\/\/127\.0\.0\.1:\d+)/);
    if (listening) {
      endpoint = listening[1];
      hostInfo = {
        protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
        capabilities: AGENT_HOST_CAPABILITY_LIST,
        companionVersion: GETBASED_COMPANION_VERSION,
        runtimeMode: 'temporary',
        platform: options.platform || process.platform,
      };
      status = 'available';
      message = '';
    }
  });
  child.stderr?.on('data', chunk => {
    message = String(chunk).trim().slice(0, 240);
    if (!message.includes('EADDRINUSE')) return;
    if (!configuredPort) {
      status = 'starting';
      return;
    }
    // Port occupancy is not proof of companion identity. Never send the
    // installation bearer token to the process that happens to own this port.
    status = 'unavailable';
    message = `The configured companion port is already in use at ${endpoint}. Stop the other process or choose another port.`;
  });
  child.once('error', error => { status = 'unavailable'; message = error.message; });
  child.once('exit', code => {
    if (message.includes('EADDRINUSE') || status === 'unavailable') return;
    status = 'unavailable';
    if (!message && code !== null) message = `Local agent companion stopped (${code}).`;
  });

  const describe = () => ({ agents: agents.map(agent => ({
    ...agent,
    ...hostInfo,
    status: agent.status === 'login_required' ? agent.status : status,
    endpoint, token: status === 'available' ? storage.token : '',
    ...(agent.message ? { message: agent.message } : message ? { message } : {}),
  })) });
  return {
    describe,
    refresh() {
      agents = detectLocalClis(execImpl, env, options.platform);
      return describe();
    },
    close() {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    },
  };
}
