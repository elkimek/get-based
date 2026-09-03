// @ts-check
// Automatic Codex bridge lifecycle for the loopback development server.

import { execFileSync, spawn as spawnChild } from 'node:child_process';
import { join } from 'node:path';
import { prepareAgentHostStorage } from './agent-host-storage.js';

const LOCAL_CLI_SPECS = [
  { id: 'codex', command: 'codex', name: 'Codex CLI', description: 'OpenAI official CLI', compatible: true },
  { id: 'opencode', command: 'opencode', name: 'OpenCode', description: 'Open-source agent CLI', compatible: false },
  { id: 'hermes', command: 'hermes', name: 'Hermes', description: 'ACP agent CLI', compatible: false },
  { id: 'grok', command: 'grok', name: 'Grok Build', description: 'xAI coding CLI', compatible: false },
];

function detectLocalClis(execImpl, env) {
  return LOCAL_CLI_SPECS.flatMap(spec => {
    try {
      const version = String(execImpl(spec.command, ['--version'], {
        encoding: 'utf8', env, timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
      })).trim().split('\n')[0].slice(0, 100);
      return [{ ...spec, version, status: 'detected' }];
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
 * }} options
 */
export function startDevAgentHost(options) {
  const env = options.env || process.env;
  if (String(env.GETBASED_AUTO_AGENT_HOST || '').trim() === '0') {
    return { describe: () => ({ agents: [] }), refresh: () => ({ agents: [] }), close() {} };
  }

  const execImpl = options.execFileSyncImpl || execFileSync;
  let agents = detectLocalClis(execImpl, env);
  const codex = agents.find(agent => agent.id === 'codex');
  if (!codex) return {
    describe: () => ({ agents }),
    refresh: () => {
      agents = detectLocalClis(execImpl, env);
      const newlyInstalledCodex = agents.find(agent => agent.id === 'codex');
      if (newlyInstalledCodex) Object.assign(newlyInstalledCodex, {
        compatible: false,
        status: 'unavailable',
        message: 'Restart Get-based once to finish connecting Codex.',
      });
      return { agents };
    },
    close() {},
  };

  let storage;
  try {
    storage = (options.prepareStorage || prepareAgentHostStorage)({ env });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Codex login is unavailable.';
    Object.assign(codex, { compatible: false, status: 'unavailable', message });
    const refreshUnavailable = () => {
      agents = detectLocalClis(execImpl, env);
      const refreshedCodex = agents.find(agent => agent.id === 'codex');
      if (refreshedCodex) Object.assign(refreshedCodex, { compatible: false, status: 'unavailable', message });
      return { agents };
    };
    return {
      describe: () => ({ agents }),
      refresh: refreshUnavailable,
      close() {},
    };
  }

  const port = Number(env.GETBASED_AGENT_HOST_PORT || 8324);
  const endpoint = `http://127.0.0.1:${port}`;
  let status = 'starting';
  let message = '';
  let existingHostProbePending = false;
  const entrypoint = join(options.root, 'server', 'agent-host-server.js');
  const childArgs = String(env.GETBASED_AGENT_HOST_WATCH || '').trim() === '0'
    ? [entrypoint]
    : ['--watch-preserve-output', '--watch', entrypoint];
  const child = (options.spawnImpl || spawnChild)(process.execPath, childArgs, {
    cwd: options.root,
    env: {
      ...env,
      GETBASED_AGENT_HOST_TOKEN: storage.token,
      GETBASED_AGENT_HOST_PORT: String(port),
      GETBASED_AGENT_HOST_STRICT_PORT: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', chunk => {
    const output = String(chunk);
    if (output.includes('Get-based Companion listening') || output.includes('Get-based Agent Host listening')) {
      status = 'available';
      message = '';
    }
  });
  child.stderr?.on('data', chunk => {
    message = String(chunk).trim().slice(0, 240);
    if (!message.includes('EADDRINUSE')) return;
    existingHostProbePending = true;
    status = 'starting';
    void fetch(`${endpoint}/v1/status`, {
      headers: { Authorization: `Bearer ${storage.token}` },
      signal: AbortSignal.timeout(2_000),
    }).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      status = 'available';
      message = '';
    }).catch(() => {
      status = 'unavailable';
      message = `Another application is already using ${endpoint}.`;
    }).finally(() => { existingHostProbePending = false; });
  });
  child.once('error', error => { status = 'unavailable'; message = error.message; });
  child.once('exit', code => {
    if (existingHostProbePending || message.includes('EADDRINUSE')) return;
    status = 'unavailable';
    if (!message && code !== null) message = `Local Codex connection stopped (${code}).`;
  });

  const describe = () => ({ agents: agents.map(agent => agent.id === 'codex' ? {
      ...agent, status, endpoint, token: storage.token, ...(message ? { message } : {}),
    } : agent) });
  return {
    describe,
    refresh() {
      agents = detectLocalClis(execImpl, env);
      return describe();
    },
    close() {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    },
  };
}
