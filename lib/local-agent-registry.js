// @ts-check
// Cross-platform discovery metadata for CLI harnesses supported by the companion.

import { execFileSync } from 'node:child_process';
import { delimiter, isAbsolute, win32 } from 'node:path';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';

export const LOCAL_AGENT_SPECS = Object.freeze([
  Object.freeze({ id: 'codex', command: 'codex', env: 'GETBASED_CODEX_COMMAND', name: 'Codex CLI', description: 'OpenAI official CLI', protocol: 'codex' }),
  Object.freeze({ id: 'claude', command: 'claude', env: 'GETBASED_CLAUDE_COMMAND', name: 'Claude Code', description: 'Anthropic official CLI', protocol: 'claude' }),
  Object.freeze({ id: 'opencode', command: 'opencode', env: 'GETBASED_OPENCODE_COMMAND', name: 'OpenCode', description: 'Open-source multi-model agent CLI', protocol: 'acp', args: Object.freeze(['acp', '--pure']) }),
  Object.freeze({ id: 'hermes', command: 'hermes', env: 'GETBASED_HERMES_COMMAND', name: 'Hermes Agent', description: 'Nous Research agent CLI', protocol: 'acp', args: Object.freeze(['acp']) }),
  Object.freeze({ id: 'grok', command: 'grok', env: 'GETBASED_GROK_COMMAND', name: 'Grok Build', description: 'xAI coding CLI', protocol: 'acp', args: Object.freeze(['agent', 'stdio']) }),
]);

/** @param {string} command @param {NodeJS.ProcessEnv} env @param {NodeJS.Platform} platform */
export function findAgentExecutable(command, env = process.env, platform = process.platform) {
  const absolute = platform === 'win32' ? win32.isAbsolute(command) : isAbsolute(command);
  if (absolute) {
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

/**
 * Resolve the standard npm Windows `.cmd` launcher to its JavaScript entry
 * point. This keeps every argument in an argv array instead of invoking a
 * command shell, where a custom personality or schema could become syntax.
 * @param {string} command
 * @param {string} source
 * @param {string} [nodePath]
 */
export function resolveWindowsNodeShim(command, source, nodePath = process.execPath) {
  const matches = [...String(source).matchAll(/["']%dp0%[\\/]([^"'\r\n]+\.(?:cjs|mjs|js))["']\s+%\*/gi)];
  const relative = matches.at(-1)?.[1]?.replaceAll('/', '\\') || '';
  if (!relative) throw new Error('The Windows CLI launcher is not a supported Node command shim.');
  const directory = win32.dirname(command);
  const script = win32.resolve(directory, relative);
  const fromLauncher = win32.relative(directory, script);
  if (!fromLauncher || fromLauncher.startsWith('..') || win32.isAbsolute(fromLauncher)) {
    throw new Error('The Windows CLI launcher points outside its installation directory.');
  }
  return { command: nodePath, args: [script] };
}

/** @param {string} command @param {{platform?: NodeJS.Platform, nodePath?: string, readFileSyncImpl?: typeof readFileSync}} [options] */
export function resolveAgentLaunch(command, options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(command)) return { command, args: [] };
  const source = String((options.readFileSyncImpl || readFileSync)(command, 'utf8'));
  return resolveWindowsNodeShim(command, source, options.nodePath || process.execPath);
}

/** @param {{env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, execFileSyncImpl?: typeof execFileSync, readFileSyncImpl?: typeof readFileSync, nodePath?: string}} [options] */
export function detectLocalAgents(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const run = options.execFileSyncImpl || execFileSync;
  return LOCAL_AGENT_SPECS.flatMap(spec => {
    const configured = String(env[spec.env] || spec.command).trim();
    const command = findAgentExecutable(configured, env, platform);
    if (!command) return [];
    let launch;
    try {
      launch = resolveAgentLaunch(command, {
        platform, nodePath: options.nodePath, readFileSyncImpl: options.readFileSyncImpl,
      });
    } catch (error) {
      return [{
        ...spec, args: [...('args' in spec ? spec.args : [])], command, version: '', compatible: false,
        status: 'unavailable', message: error instanceof Error ? error.message : 'This CLI launcher is not supported.',
      }];
    }
    let version = '';
    try {
      version = String(run(launch.command, [...launch.args, '--version'], {
        encoding: 'utf8', env, timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
      })).trim().split('\n')[0].slice(0, 120);
    } catch { /* a resolvable executable is still useful */ }
    let status = 'available';
    let message = '';
    if (spec.id === 'claude') {
      try {
        const auth = JSON.parse(String(run(launch.command, [...launch.args, 'auth', 'status', '--json'], {
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
    return [{
      ...spec, args: [...launch.args, ...('args' in spec ? spec.args : [])], command: launch.command,
      version, compatible: true, status, ...(message ? { message } : {}),
    }];
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
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  ]);
  const env = Object.fromEntries(Object.entries(source).filter(([name, value]) => (
    value !== undefined && (exact.has(name) || name.startsWith('LC_'))
  )));
  return { ...env, CI: '1', NO_COLOR: '1', TERM: 'dumb' };
}
