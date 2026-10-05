// Cross-platform discovery metadata for CLI harnesses supported by the companion.

import { execFileSync } from 'node:child_process';
import { delimiter, isAbsolute, posix, win32 } from 'node:path';
import { accessSync, constants, existsSync, readFileSync, readdirSync } from 'node:fs';

export interface LocalAgentSpec {
  id: string;
  command: string;
  env: string;
  name: string;
  description: string;
  protocol: 'codex' | 'claude' | 'acp' | 'openclaw';
  args?: readonly string[];
}
export interface LocalAgentDiscoveryOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDirectory?: string;
  existsSyncImpl?: typeof existsSync;
  readdirSyncImpl?: (path: string, options: { withFileTypes: true }) => { name: string; isDirectory(): boolean }[];
  execFileSyncImpl?: typeof execFileSync;
  readFileSyncImpl?: typeof readFileSync | undefined;
  nodePath?: string | undefined;
}
export interface DetectedLocalAgent extends Omit<LocalAgentSpec, 'args'> {
  args: string[];
  version: string;
  compatible: boolean;
  status: string;
  message?: string;
}

export const LOCAL_AGENT_SPECS: readonly Readonly<LocalAgentSpec>[] = Object.freeze([
  Object.freeze({ id: 'codex', command: 'codex', env: 'GETBASED_CODEX_COMMAND', name: 'Codex CLI', description: 'OpenAI official CLI', protocol: 'codex' }),
  Object.freeze({ id: 'claude', command: 'claude', env: 'GETBASED_CLAUDE_COMMAND', name: 'Claude Agent', description: 'Anthropic agent · API/Console billing only', protocol: 'claude' }),
  Object.freeze({ id: 'opencode', command: 'opencode', env: 'GETBASED_OPENCODE_COMMAND', name: 'OpenCode', description: 'Open-source multi-model agent CLI', protocol: 'acp', args: Object.freeze(['acp', '--pure']) }),
  Object.freeze({ id: 'hermes', command: 'hermes', env: 'GETBASED_HERMES_COMMAND', name: 'Hermes Agent', description: 'Nous Research agent CLI', protocol: 'acp', args: Object.freeze(['acp']) }),
  Object.freeze({ id: 'grok', command: 'grok', env: 'GETBASED_GROK_COMMAND', name: 'Grok Build', description: 'SpaceXAI coding agent CLI', protocol: 'acp', args: Object.freeze(['agent', 'stdio']) }),
  Object.freeze({ id: 'openclaw', command: 'openclaw', env: 'GETBASED_OPENCLAW_COMMAND', name: 'OpenClaw', description: 'Open-source personal AI assistant', protocol: 'openclaw' }),
]);

// Claude remains dormant unless a self-hosting operator opts into API/Console billing.
// Anthropic requires approval for third-party use of claude.ai Free/Pro/Max credentials.
export function isLocalAgentSpecEnabled(spec: Pick<LocalAgentSpec, 'id'>, env: NodeJS.ProcessEnv = process.env) {
  return spec.id !== 'claude'
    || String(env.GETBASED_ENABLE_CLAUDE_AGENT || '').trim().toLowerCase() === 'api-console';
}

// Negative status commands may exit non-zero with valid JSON on stdout.
export function readCommandJson<T = unknown>(execute: () => unknown): T {
  let output;
  try { output = execute(); }
  catch (error) {
    output = error && typeof error === 'object' && 'stdout' in error
      ? error.stdout
      : '';
    if (!output) throw error;
  }
  return JSON.parse(String(output || '{}')) as T;
}

export function normalizeAgentVersion(agentId: string, value: unknown) {
  const version = String(value || '').trim().split('\n')[0]!.slice(0, 120);
  return agentId === 'claude'
    ? version.replace(/\s*\(Claude Code\)\s*/gi, ' ').trim()
    : version;
}

export function findAgentExecutable(command: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform) {
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

// Probe documented user-owned installs: the official wrapper need not be on PATH.
// An explicit GETBASED_OPENCLAW_COMMAND takes precedence in resolveLocalAgentCommand.
export function findBundledOpenClawExecutable(options: LocalAgentDiscoveryOptions = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const pathApi = platform === 'win32' ? win32 : posix;
  const homeDirectory = String(options.homeDirectory || (platform === 'win32' ? env.USERPROFILE : env.HOME) || '').trim();
  const prefix = String(env.OPENCLAW_PREFIX || '').trim();
  const absolutePrefix = prefix && pathApi.isAbsolute(prefix) ? prefix : '';
  if ((!homeDirectory || !pathApi.isAbsolute(homeDirectory)) && !absolutePrefix) return '';
  const exists = options.existsSyncImpl || existsSync;
  const executableName = platform === 'win32' ? 'openclaw.cmd' : 'openclaw';
  const candidates = absolutePrefix ? [pathApi.join(absolutePrefix, 'bin', executableName)] : [];
  if (homeDirectory && pathApi.isAbsolute(homeDirectory)) {
    candidates.push(platform === 'win32'
      ? pathApi.join(homeDirectory, '.local', 'bin', executableName)
      : pathApi.join(homeDirectory, '.openclaw', 'bin', executableName));
  }
  const toolsDirectory = pathApi.join(absolutePrefix || pathApi.join(homeDirectory, '.openclaw'), 'tools');
  let versions: string[] = [];
  try {
    versions = (options.readdirSyncImpl || readdirSync)(toolsDirectory, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^node-v/i.test(entry.name))
      .map(entry => entry.name).sort().reverse();
  } catch { /* OpenClaw may use only its PATH wrapper. */ }
  for (const version of versions) {
    if (platform === 'win32') {
      candidates.push(pathApi.join(toolsDirectory, version, 'openclaw.cmd'));
      candidates.push(pathApi.join(toolsDirectory, version, 'bin', 'openclaw.cmd'));
    } else candidates.push(pathApi.join(toolsDirectory, version, 'bin', 'openclaw'));
  }
  return candidates.find(candidate => exists(candidate)) || '';
}

export function resolveLocalAgentCommand(spec: LocalAgentSpec, options: LocalAgentDiscoveryOptions = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const configured = String(env[spec.env] || '').trim();
  if (configured) return findAgentExecutable(configured, env, platform);
  return findAgentExecutable(spec.command, env, platform)
    || (spec.id === 'openclaw' ? findBundledOpenClawExecutable({ ...options, env, platform }) : '');
}

// Resolve npm Windows launchers to a Node argv array; never invoke a command shell.
export function resolveWindowsNodeShim(command: string, source: string, nodePath = process.execPath) {
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

export function resolveAgentLaunch(command: string, options: LocalAgentDiscoveryOptions = {}) {
  const platform = options.platform || process.platform;
  if (platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(command)) return { command, args: [] };
  const source = String((options.readFileSyncImpl || readFileSync)(command, 'utf8'));
  return resolveWindowsNodeShim(command, source, options.nodePath || process.execPath);
}

export function detectLocalAgents(options: LocalAgentDiscoveryOptions = {}): DetectedLocalAgent[] {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const run = options.execFileSyncImpl || execFileSync;
  return LOCAL_AGENT_SPECS.flatMap<DetectedLocalAgent>(spec => {
    if (!isLocalAgentSpecEnabled(spec, env)) return [];
    const command = resolveLocalAgentCommand(spec, { env, platform });
    if (!command) return [];
    let launch;
    try {
      launch = resolveAgentLaunch(command, {
        platform, nodePath: options.nodePath, readFileSyncImpl: options.readFileSyncImpl,
      });
    } catch (error) {
      return [{
        ...spec, args: [...('args' in spec ? spec.args! : [])], command, version: '', compatible: false,
        status: 'unavailable', message: error instanceof Error ? error.message : 'This CLI launcher is not supported.',
      }];
    }
    let version = '';
    try {
      version = normalizeAgentVersion(spec.id, run(launch.command, [...launch.args, '--version'], {
        encoding: 'utf8', env, timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
      }));
    } catch { /* a resolvable executable is still useful */ }
    let status = 'available';
    let message = '';
    if (spec.id === 'claude') {
      try {
        const auth = readCommandJson<{ loggedIn?: unknown } | null>(() => run(launch.command, [...launch.args, 'auth', 'status', '--json'], {
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
    return [{
      ...spec, args: [...launch.args, ...('args' in spec ? spec.args! : [])], command: launch.command,
      version, compatible: true, status, ...(message ? { message } : {}),
    }];
  });
}

export function publicAgentDescriptors(agents: DetectedLocalAgent[]) {
  return agents.map(({ id, name, description, version, compatible, status, message, protocol }) => ({
    id, name, description, version, compatible, status, protocol, ...(message ? { message } : {}),
  }));
}

// Preserve login/config discovery without exposing unrelated process secrets.
export function buildLocalAgentEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const exact = new Set([
    'HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH', 'LANG', 'TMPDIR', 'TEMP', 'TMP',
    'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SystemRoot', 'ComSpec', 'PATHEXT',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
    'OPENCLAW_HOME', 'OPENCLAW_STATE_DIR', 'OPENCLAW_CONFIG_PATH', 'OPENCLAW_PROFILE',
    'OPENCLAW_PREFIX', 'OPENCLAW_INCLUDE_ROOTS',
  ]);
  const env = Object.fromEntries(Object.entries(source).filter(([name, value]) => (
    value !== undefined && (exact.has(name) || name.startsWith('LC_'))
  )));
  return { ...env, CI: '1', NO_COLOR: '1', TERM: 'dumb' };
}
