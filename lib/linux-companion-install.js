// @ts-check
// Linux user-service installer for the single-file Get-based Companion bundle.

import { execFileSync } from 'node:child_process';
import {
  accessSync, chmodSync, constants, copyFileSync, existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path';

export const LINUX_COMPANION_SERVICE = 'getbased-companion.service';

function requireSafeAbsolutePath(value, label) {
  const normalized = resolve(String(value || ''));
  if (!value || !isAbsolute(String(value)) || normalized === '/') {
    throw new Error(`${label} must be a specific absolute path.`);
  }
  return normalized;
}

/** @param {string} value */
function systemdQuote(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replace(/[\r\n]/g, '')}"`;
}

/** @param {string} value */
function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''").replace(/[\r\n]/g, '')}'`;
}

/** @param {string} command @param {string} pathValue */
export function findExecutable(command, pathValue = '') {
  if (isAbsolute(command)) {
    try { accessSync(command, constants.X_OK); return resolve(command); } catch { return ''; }
  }
  for (const directory of String(pathValue).split(delimiter).filter(Boolean)) {
    const candidate = join(directory, command);
    try { accessSync(candidate, constants.X_OK); return resolve(candidate); } catch {}
  }
  return '';
}

/**
 * @param {{env?: NodeJS.ProcessEnv, homeDirectory?: string}} [options]
 */
export function resolveLinuxCompanionPaths(options = {}) {
  const env = options.env || process.env;
  const homeDirectory = requireSafeAbsolutePath(options.homeDirectory || homedir(), 'Home directory');
  const dataRoot = env.XDG_DATA_HOME
    ? requireSafeAbsolutePath(env.XDG_DATA_HOME, 'XDG_DATA_HOME')
    : join(homeDirectory, '.local', 'share');
  const configRoot = env.XDG_CONFIG_HOME
    ? requireSafeAbsolutePath(env.XDG_CONFIG_HOME, 'XDG_CONFIG_HOME')
    : join(homeDirectory, '.config');
  const runtimeDirectory = join(dataRoot, 'getbased-companion');
  return Object.freeze({
    runtimeDirectory,
    installedBundle: join(runtimeDirectory, 'getbased-companion.mjs'),
    serviceFile: join(configRoot, 'systemd', 'user', LINUX_COMPANION_SERVICE),
    launcher: join(homeDirectory, '.local', 'bin', 'getbased-companion'),
  });
}

/**
 * @param {{nodePath: string, bundlePath: string, codexCommand: string, sourceCodexHome: string, pathValue: string}} options
 */
export function renderLinuxCompanionService(options) {
  return `[Unit]
Description=getbased Companion for local AI agents
After=network-online.target

[Service]
Type=simple
ExecStart=${systemdQuote(options.nodePath)} ${systemdQuote(options.bundlePath)} run
Restart=on-failure
RestartSec=2
UMask=0077
Environment=${systemdQuote(`PATH=${options.pathValue}`)}
Environment=${systemdQuote(`GETBASED_CODEX_COMMAND=${options.codexCommand}`)}
Environment=${systemdQuote(`GETBASED_SOURCE_CODEX_HOME=${options.sourceCodexHome}`)}

[Install]
WantedBy=default.target
`;
}

/**
 * @param {{nodePath: string, bundlePath: string}} options
 */
function renderLauncher(options) {
  return `#!/bin/sh\nexec ${shellQuote(options.nodePath)} ${shellQuote(options.bundlePath)} "$@"\n`;
}

/**
 * @param {{
 *   bundlePath: string,
 *   env?: NodeJS.ProcessEnv,
 *   homeDirectory?: string,
 *   nodePath?: string,
 *   platform?: NodeJS.Platform,
 *   dryRun?: boolean,
 *   execFileSyncImpl?: typeof execFileSync,
 * }} options
 */
export function installLinuxCompanion(options) {
  if ((options.platform || process.platform) !== 'linux') {
    throw new Error('Automatic companion installation currently supports Linux only.');
  }
  const env = options.env || process.env;
  const bundlePath = requireSafeAbsolutePath(options.bundlePath, 'Companion bundle');
  if (!existsSync(bundlePath)) throw new Error(`Companion bundle was not found: ${bundlePath}`);
  const nodePath = findExecutable(options.nodePath || process.execPath, env.PATH || '');
  if (!nodePath) throw new Error('Node.js was not found. Install Node.js 20 or newer first.');
  const configuredCodex = String(env.GETBASED_CODEX_COMMAND || 'codex').trim();
  const codexCommand = findExecutable(configuredCodex, env.PATH || '');
  if (!codexCommand) throw new Error('Codex CLI was not found. Install it and run `codex login` first.');
  const homeDirectory = requireSafeAbsolutePath(options.homeDirectory || homedir(), 'Home directory');
  const sourceCodexHome = env.GETBASED_SOURCE_CODEX_HOME || env.CODEX_HOME || join(homeDirectory, '.codex');
  const sourceAuth = join(requireSafeAbsolutePath(sourceCodexHome, 'Codex home'), 'auth.json');
  if (!existsSync(sourceAuth)) throw new Error('Codex login was not found. Run `codex login` first.');

  const paths = resolveLinuxCompanionPaths({ env, homeDirectory });
  const serviceSource = renderLinuxCompanionService({
    nodePath, bundlePath: paths.installedBundle, codexCommand, sourceCodexHome,
    pathValue: env.PATH || dirname(codexCommand),
  });
  if (options.dryRun) return { ...paths, nodePath, codexCommand, serviceSource, installed: false };

  mkdirSync(paths.runtimeDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(dirname(paths.serviceFile), { recursive: true, mode: 0o700 });
  mkdirSync(dirname(paths.launcher), { recursive: true, mode: 0o755 });
  copyFileSync(bundlePath, paths.installedBundle);
  chmodSync(paths.installedBundle, 0o700);
  writeFileSync(paths.serviceFile, serviceSource, { mode: 0o600 });
  writeFileSync(paths.launcher, renderLauncher({ nodePath, bundlePath: paths.installedBundle }), { mode: 0o755 });
  chmodSync(paths.launcher, 0o755);

  const run = options.execFileSyncImpl || execFileSync;
  run('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit', env });
  run('systemctl', ['--user', 'enable', '--now', LINUX_COMPANION_SERVICE], { stdio: 'inherit', env });
  run('systemctl', ['--user', 'is-active', '--quiet', LINUX_COMPANION_SERVICE], { stdio: 'inherit', env });
  return { ...paths, nodePath, codexCommand, serviceSource, installed: true };
}

/**
 * Remove only the installed runtime and service definition. Private pairing
 * state remains in getbased-agent-host so reinstalling does not rotate it.
 * @param {{env?: NodeJS.ProcessEnv, homeDirectory?: string, execFileSyncImpl?: typeof execFileSync}} [options]
 */
export function uninstallLinuxCompanion(options = {}) {
  const env = options.env || process.env;
  const paths = resolveLinuxCompanionPaths({ env, homeDirectory: options.homeDirectory });
  if (basename(paths.runtimeDirectory) !== 'getbased-companion') throw new Error('Refusing an unsafe runtime path.');
  const run = options.execFileSyncImpl || execFileSync;
  try { run('systemctl', ['--user', 'disable', '--now', LINUX_COMPANION_SERVICE], { stdio: 'inherit', env }); } catch {}
  if (existsSync(paths.serviceFile)) unlinkSync(paths.serviceFile);
  if (existsSync(paths.launcher)) unlinkSync(paths.launcher);
  rmSync(paths.runtimeDirectory, { recursive: true, force: true });
  run('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit', env });
  return paths;
}

/**
 * @param {'start'|'stop'|'restart'|'status'} command
 * @param {{env?: NodeJS.ProcessEnv, execFileSyncImpl?: typeof execFileSync}} [options]
 */
export function runLinuxCompanionServiceCommand(command, options = {}) {
  if (!['start', 'stop', 'restart', 'status'].includes(command)) throw new Error('Unsupported companion service command.');
  const env = options.env || process.env;
  const run = options.execFileSyncImpl || execFileSync;
  const args = command === 'status'
    ? ['--user', 'status', '--no-pager', LINUX_COMPANION_SERVICE]
    : ['--user', command, LINUX_COMPANION_SERVICE];
  run('systemctl', args, { stdio: 'inherit', env });
}
