// @ts-check
// Cross-platform discovery metadata for CLI harnesses supported by the companion.

import { execFileSync } from 'node:child_process';
import { delimiter, isAbsolute } from 'node:path';
import { accessSync, constants, existsSync } from 'node:fs';

export const LOCAL_AGENT_SPECS = Object.freeze([
  Object.freeze({ id: 'codex', command: 'codex', env: 'GETBASED_CODEX_COMMAND', name: 'Codex CLI', description: 'OpenAI official CLI', protocol: 'codex' }),
  Object.freeze({ id: 'claude', command: 'claude', env: 'GETBASED_CLAUDE_COMMAND', name: 'Claude Code', description: 'Anthropic official CLI', protocol: 'claude' }),
  Object.freeze({ id: 'opencode', command: 'opencode', env: 'GETBASED_OPENCODE_COMMAND', name: 'OpenCode', description: 'Open-source multi-model agent CLI', protocol: 'acp', args: Object.freeze(['acp', '--pure']) }),
  Object.freeze({ id: 'hermes', command: 'hermes', env: 'GETBASED_HERMES_COMMAND', name: 'Hermes Agent', description: 'Nous Research agent CLI', protocol: 'acp', args: Object.freeze(['acp']) }),
  Object.freeze({ id: 'grok', command: 'grok', env: 'GETBASED_GROK_COMMAND', name: 'Grok Build', description: 'xAI coding CLI', protocol: 'acp', args: Object.freeze(['agent', 'stdio']) }),
]);

/** @param {string} command @param {NodeJS.ProcessEnv} env @param {NodeJS.Platform} platform */
export function findAgentExecutable(command, env = process.env, platform = process.platform) {
  if (isAbsolute(command)) {
    try { accessSync(command, constants.X_OK); return command; } catch { return ''; }
  }
  const extensions = platform === 'win32'
    ? ['', ...String(env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean)] : [''];
  const pathDelimiter = platform === 'win32' ? ';' : delimiter;
  for (const directory of String(env.PATH || '').split(pathDelimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = `${directory}${platform === 'win32' ? '\\' : '/'}${command}${extension}`;
      if (existsSync(candidate)) return candidate;
    }
  }
  return '';
}

/** @param {{env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, execFileSyncImpl?: typeof execFileSync}} [options] */
export function detectLocalAgents(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const run = options.execFileSyncImpl || execFileSync;
  return LOCAL_AGENT_SPECS.flatMap(spec => {
    const configured = String(env[spec.env] || spec.command).trim();
    const command = findAgentExecutable(configured, env, platform);
    if (!command) return [];
    let version = '';
    try {
      version = String(run(command, ['--version'], {
        encoding: 'utf8', env, timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
      })).trim().split('\n')[0].slice(0, 120);
    } catch { /* a resolvable executable is still useful */ }
    let status = 'available';
    let message = '';
    if (spec.id === 'claude') {
      try {
        const auth = JSON.parse(String(run(command, ['auth', 'status', '--json'], {
          encoding: 'utf8', env, timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
        })) || '{}');
        if (auth?.loggedIn !== true) {
          status = 'login_required';
          message = 'Run `claude auth login` once, then check the connection again.';
        }
      } catch {
        status = 'login_required';
        message = 'Claude Code is installed, but its sign-in could not be verified.';
      }
    }
    return [{ ...spec, args: [...('args' in spec ? spec.args : [])], command, version, compatible: true, status, ...(message ? { message } : {}) }];
  });
}

/** @param {ReturnType<typeof detectLocalAgents>} agents */
export function publicAgentDescriptors(agents) {
  return agents.map(({ id, name, description, version, compatible, status, message, protocol }) => ({
    id, name, description, version, compatible, status, protocol, ...(message ? { message } : {}),
  }));
}

/**
 * Keep normal CLI login/config discovery while preventing unrelated process
 * secrets from becoming visible to an agent's built-in tools.
 * @param {NodeJS.ProcessEnv} [source]
 */
export function buildLocalAgentEnvironment(source = process.env) {
  const exact = new Set([
    'HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH', 'LANG', 'TMPDIR', 'TEMP', 'TMP',
    'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SystemRoot', 'ComSpec', 'PATHEXT',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
  ]);
  const env = Object.fromEntries(Object.entries(source).filter(([name, value]) => (
    value !== undefined && (exact.has(name) || name.startsWith('LC_'))
  )));
  return { ...env, CI: '1', NO_COLOR: '1', TERM: 'dumb' };
}
