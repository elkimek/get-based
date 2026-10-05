// macOS LaunchAgent installer for the single-file getbased Companion bundle.

import { execFileSync } from 'node:child_process';
import {
  existsSync, rmSync, unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { CompanionInstallOptions, CompanionLocationOptions, CompanionServiceOptions, CompanionServiceCommand, CompanionServiceSource } from './companion-install-support.js';
import { prepareCompanionAgentCommands, requireSafeAbsolutePath, installPosixCompanionFiles, findExecutable } from './companion-install-support.js';

export const MACOS_COMPANION_LABEL = 'health.getbased.companion';

function xml(value: string) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function resolveMacOSCompanionPaths(options: CompanionLocationOptions = {}) {
  const homeDirectory = requireSafeAbsolutePath(options.homeDirectory || homedir(), 'Home directory');
  const runtimeDirectory = join(homeDirectory, 'Library', 'Application Support', 'getbased', 'companion');
  return Object.freeze({
    runtimeDirectory,
    installedBundle: join(runtimeDirectory, 'getbased-companion.mjs'),
    logFile: join(runtimeDirectory, 'companion.log'),
    serviceFile: join(homeDirectory, 'Library', 'LaunchAgents', `${MACOS_COMPANION_LABEL}.plist`),
    launcher: join(homeDirectory, '.local', 'bin', 'getbased-companion'),
  });
}

export function renderMacOSCompanionService(options: CompanionServiceSource & { pathValue: string; logFile: string }) {
  const commands = options.agentCommands || (options.codexCommand ? { GETBASED_CODEX_COMMAND: options.codexCommand } : {});
  const commandEnvironment = Object.entries(commands).map(([name, value]) => `    <key>${xml(name)}</key><string>${xml(value)}</string>\n`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${MACOS_COMPANION_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(options.nodePath)}</string><string>${xml(options.bundlePath)}</string><string>run</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${xml(options.logFile)}</string>
  <key>StandardErrorPath</key><string>${xml(options.logFile)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(options.pathValue)}</string>
${commandEnvironment}${options.sourceCodexHome ? `    <key>GETBASED_SOURCE_CODEX_HOME</key><string>${xml(options.sourceCodexHome)}</string>\n` : ''}
    <key>GETBASED_COMPANION_SERVICE</key><string>1</string>
  </dict>
</dict>
</plist>
`;
}

export function installMacOSCompanion(options: CompanionInstallOptions) {
  if ((options.platform || process.platform) !== 'darwin') {
    throw new Error('This companion installer requires macOS.');
  }
  const env = options.env || process.env;
  const bundlePath = requireSafeAbsolutePath(options.bundlePath, 'Companion bundle');
  if (!existsSync(bundlePath)) throw new Error(`Companion bundle was not found: ${bundlePath}`);
  const nodePath = findExecutable(options.nodePath || process.execPath, env.PATH || '');
  if (!nodePath) throw new Error('Node.js was not found. Install Node.js 20 or newer first.');
  const homeDirectory = requireSafeAbsolutePath(options.homeDirectory || homedir(), 'Home directory');
  const agentCommands = prepareCompanionAgentCommands(env, 'darwin', homeDirectory);
  const codexCommand = agentCommands.GETBASED_CODEX_COMMAND || '';
  const sourceCodexHome = requireSafeAbsolutePath(env.GETBASED_SOURCE_CODEX_HOME || env.CODEX_HOME || join(homeDirectory, '.codex'), 'Codex home');
  const paths = resolveMacOSCompanionPaths({ env, homeDirectory });
  const serviceSource = renderMacOSCompanionService({
    nodePath, bundlePath: paths.installedBundle, codexCommand, sourceCodexHome, agentCommands,
    pathValue: env.PATH || dirname(Object.values(agentCommands)[0]!), logFile: paths.logFile,
  });
  if (options.dryRun) return { ...paths, nodePath, codexCommand, serviceSource, installed: false };

  installPosixCompanionFiles(paths, bundlePath, serviceSource, nodePath);

  const run = options.execFileSyncImpl || execFileSync;
  if (options.startService !== false) {
    const target = `gui/${options.uid ?? process.getuid?.() ?? 0}`;
    try { run('launchctl', ['bootout', `${target}/${MACOS_COMPANION_LABEL}`], { stdio: 'ignore', env }); } catch {}
    run('launchctl', ['bootstrap', target, paths.serviceFile], { stdio: 'inherit', env });
    run('launchctl', ['kickstart', '-k', `${target}/${MACOS_COMPANION_LABEL}`], { stdio: 'inherit', env });
  }
  return { ...paths, nodePath, codexCommand, serviceSource, installed: true };
}

export function uninstallMacOSCompanion(options: CompanionServiceOptions = {}) {
  const env = options.env || process.env;
  const paths = resolveMacOSCompanionPaths({ env, homeDirectory: options.homeDirectory });
  if (basename(paths.runtimeDirectory) !== 'companion') throw new Error('Refusing an unsafe runtime path.');
  const target = `gui/${options.uid ?? process.getuid?.() ?? 0}`;
  if (options.stopService !== false) {
    try { (options.execFileSyncImpl || execFileSync)('launchctl', ['bootout', `${target}/${MACOS_COMPANION_LABEL}`], { stdio: 'ignore', env }); } catch {}
  }
  if (existsSync(paths.serviceFile)) unlinkSync(paths.serviceFile);
  if (existsSync(paths.launcher)) unlinkSync(paths.launcher);
  rmSync(paths.runtimeDirectory, { recursive: true, force: true });
  return paths;
}

export function runMacOSCompanionServiceCommand(command: CompanionServiceCommand, options: CompanionServiceOptions = {}) {
  if (!['start', 'stop', 'restart', 'status'].includes(command)) throw new Error('Unsupported companion service command.');
  const env = options.env || process.env;
  const run = options.execFileSyncImpl || execFileSync;
  const target = `gui/${options.uid ?? process.getuid?.() ?? 0}/${MACOS_COMPANION_LABEL}`;
  if (command === 'status') run('launchctl', ['print', target], { stdio: 'inherit', env });
  else if (command === 'stop') run('launchctl', ['kill', 'SIGTERM', target], { stdio: 'inherit', env });
  else {
    // In-app installation writes the LaunchAgent without loading it. Register
    // that service before its first start/restart during this login session.
    try { run('launchctl', ['print', target], { stdio: 'ignore', env }); }
    catch {
      const paths = resolveMacOSCompanionPaths({ env, homeDirectory: options.homeDirectory || env.HOME });
      run('launchctl', ['bootstrap', target.slice(0, target.lastIndexOf('/')), paths.serviceFile], { stdio: 'inherit', env });
    }
    run('launchctl', ['kickstart', ...(command === 'restart' ? ['-k'] : []), target], { stdio: 'inherit', env });
  }
}
