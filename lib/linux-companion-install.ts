// Linux user-service installer for the single-file getbased Companion bundle.

import { execFileSync } from 'node:child_process';
import {
  existsSync, rmSync, unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { CompanionInstallOptions, CompanionLocationOptions, CompanionServiceOptions, CompanionServiceCommand, CompanionServiceSource } from './companion-install-support.js';
import { prepareCompanionAgentCommands, requireSafeAbsolutePath, installPosixCompanionFiles, findExecutable } from './companion-install-support.js';

export const LINUX_COMPANION_SERVICE = 'getbased-companion.service';

function systemdQuote(value: string) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replace(/[\r\n]/g, '')}"`;
}

export { findExecutable } from './companion-install-support.js';

export function resolveLinuxCompanionPaths(options: CompanionLocationOptions = {}) {
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

export function renderLinuxCompanionService(options: CompanionServiceSource & { pathValue: string }) {
  const commands = options.agentCommands || (options.codexCommand ? { GETBASED_CODEX_COMMAND: options.codexCommand } : {});
  const commandEnvironment = Object.entries(commands).map(([name, value]) => `Environment=${systemdQuote(`${name}=${value}`)}\n`).join('');
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
${commandEnvironment}${options.sourceCodexHome ? `Environment=${systemdQuote(`GETBASED_SOURCE_CODEX_HOME=${options.sourceCodexHome}`)}\n` : ''}Environment=${systemdQuote('GETBASED_COMPANION_SERVICE=1')}

[Install]
WantedBy=default.target
`;
}

export function installLinuxCompanion(options: CompanionInstallOptions) {
  if ((options.platform || process.platform) !== 'linux') {
    throw new Error('Automatic companion installation currently supports Linux only.');
  }
  const env = options.env || process.env;
  const bundlePath = requireSafeAbsolutePath(options.bundlePath, 'Companion bundle');
  if (!existsSync(bundlePath)) throw new Error(`Companion bundle was not found: ${bundlePath}`);
  const nodePath = findExecutable(options.nodePath || process.execPath, env.PATH || '');
  if (!nodePath) throw new Error('Node.js was not found. Install Node.js 20 or newer first.');
  const homeDirectory = requireSafeAbsolutePath(options.homeDirectory || homedir(), 'Home directory');
  const agentCommands = prepareCompanionAgentCommands(env, 'linux', homeDirectory);
  const codexCommand = agentCommands.GETBASED_CODEX_COMMAND || '';
  const sourceCodexHome = env.GETBASED_SOURCE_CODEX_HOME || env.CODEX_HOME || join(homeDirectory, '.codex');

  const paths = resolveLinuxCompanionPaths({ env, homeDirectory });
  const serviceSource = renderLinuxCompanionService({
    nodePath, bundlePath: paths.installedBundle, codexCommand, sourceCodexHome, agentCommands,
    pathValue: env.PATH || dirname(Object.values(agentCommands)[0]!),
  });
  if (options.dryRun) return { ...paths, nodePath, codexCommand, serviceSource, installed: false };

  installPosixCompanionFiles(paths, bundlePath, serviceSource, nodePath);

  const run = options.execFileSyncImpl || execFileSync;
  run('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit', env });
  const startService = options.startService !== false;
  run('systemctl', ['--user', 'enable', LINUX_COMPANION_SERVICE], { stdio: 'inherit', env });
  if (startService) {
    // `enable --now` leaves an already-running older bundle in memory. An
    // explicit restart makes the same one-line install command also update it.
    run('systemctl', ['--user', 'restart', LINUX_COMPANION_SERVICE], { stdio: 'inherit', env });
    run('systemctl', ['--user', 'is-active', '--quiet', LINUX_COMPANION_SERVICE], { stdio: 'inherit', env });
  }
  return { ...paths, nodePath, codexCommand, serviceSource, installed: true };
}

// Remove only installed runtime/service files; preserve private pairing state.
export function uninstallLinuxCompanion(options: CompanionServiceOptions = {}) {
  const env = options.env || process.env;
  const paths = resolveLinuxCompanionPaths({ env, homeDirectory: options.homeDirectory });
  if (basename(paths.runtimeDirectory) !== 'getbased-companion') throw new Error('Refusing an unsafe runtime path.');
  const run = options.execFileSyncImpl || execFileSync;
  try { run('systemctl', ['--user', 'disable', ...(options.stopService === false ? [] : ['--now']), LINUX_COMPANION_SERVICE], { stdio: 'inherit', env }); } catch {}
  if (existsSync(paths.serviceFile)) unlinkSync(paths.serviceFile);
  if (existsSync(paths.launcher)) unlinkSync(paths.launcher);
  rmSync(paths.runtimeDirectory, { recursive: true, force: true });
  run('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit', env });
  return paths;
}

export function runLinuxCompanionServiceCommand(command: CompanionServiceCommand, options: CompanionServiceOptions = {}) {
  if (!['start', 'stop', 'restart', 'status'].includes(command)) throw new Error('Unsupported companion service command.');
  const env = options.env || process.env;
  const run = options.execFileSyncImpl || execFileSync;
  const args = command === 'status'
    ? ['--user', 'status', '--no-pager', LINUX_COMPANION_SERVICE]
    : ['--user', command, LINUX_COMPANION_SERVICE];
  run('systemctl', args, { stdio: 'inherit', env });
}
