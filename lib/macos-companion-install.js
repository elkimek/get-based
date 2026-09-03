// @ts-check
// macOS LaunchAgent installer for the single-file getbased Companion bundle.

import { execFileSync } from 'node:child_process';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { findExecutable } from './linux-companion-install.js';

export const MACOS_COMPANION_LABEL = 'health.getbased.companion';

function requireSafeAbsolutePath(value, label) {
  const normalized = resolve(String(value || ''));
  if (!value || !isAbsolute(String(value)) || normalized === '/') {
    throw new Error(`${label} must be a specific absolute path.`);
  }
  return normalized;
}

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''").replace(/[\r\n]/g, '')}'`;
}

/** @param {{env?: NodeJS.ProcessEnv, homeDirectory?: string}} [options] */
export function resolveMacOSCompanionPaths(options = {}) {
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

/**
 * @param {{nodePath: string, bundlePath: string, codexCommand: string, sourceCodexHome: string, pathValue: string, logFile: string}} options
 */
export function renderMacOSCompanionService(options) {
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
    <key>GETBASED_CODEX_COMMAND</key><string>${xml(options.codexCommand)}</string>
    <key>GETBASED_SOURCE_CODEX_HOME</key><string>${xml(options.sourceCodexHome)}</string>
  </dict>
</dict>
</plist>
`;
}

function launcherSource(nodePath, bundlePath) {
  return `#!/bin/sh\nexec ${shellQuote(nodePath)} ${shellQuote(bundlePath)} "$@"\n`;
}

/**
 * @param {{bundlePath: string, env?: NodeJS.ProcessEnv, homeDirectory?: string, nodePath?: string, platform?: NodeJS.Platform, uid?: number, dryRun?: boolean, execFileSyncImpl?: typeof execFileSync}} options
 */
export function installMacOSCompanion(options) {
  if ((options.platform || process.platform) !== 'darwin') {
    throw new Error('This companion installer requires macOS.');
  }
  const env = options.env || process.env;
  const bundlePath = requireSafeAbsolutePath(options.bundlePath, 'Companion bundle');
  if (!existsSync(bundlePath)) throw new Error(`Companion bundle was not found: ${bundlePath}`);
  const nodePath = findExecutable(options.nodePath || process.execPath, env.PATH || '');
  if (!nodePath) throw new Error('Node.js was not found. Install Node.js 20 or newer first.');
  const codexCommand = findExecutable(String(env.GETBASED_CODEX_COMMAND || 'codex').trim(), env.PATH || '');
  if (!codexCommand) throw new Error('Codex CLI was not found. Install it and run `codex login` first.');
  const homeDirectory = requireSafeAbsolutePath(options.homeDirectory || homedir(), 'Home directory');
  const sourceCodexHome = requireSafeAbsolutePath(env.GETBASED_SOURCE_CODEX_HOME || env.CODEX_HOME || join(homeDirectory, '.codex'), 'Codex home');
  if (!existsSync(join(sourceCodexHome, 'auth.json'))) throw new Error('Codex login was not found. Run `codex login` first.');
  const paths = resolveMacOSCompanionPaths({ env, homeDirectory });
  const serviceSource = renderMacOSCompanionService({
    nodePath, bundlePath: paths.installedBundle, codexCommand, sourceCodexHome,
    pathValue: env.PATH || dirname(codexCommand), logFile: paths.logFile,
  });
  if (options.dryRun) return { ...paths, nodePath, codexCommand, serviceSource, installed: false };

  mkdirSync(paths.runtimeDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(dirname(paths.serviceFile), { recursive: true, mode: 0o700 });
  mkdirSync(dirname(paths.launcher), { recursive: true, mode: 0o755 });
  copyFileSync(bundlePath, paths.installedBundle);
  chmodSync(paths.installedBundle, 0o700);
  writeFileSync(paths.serviceFile, serviceSource, { mode: 0o600 });
  writeFileSync(paths.launcher, launcherSource(nodePath, paths.installedBundle), { mode: 0o755 });
  chmodSync(paths.launcher, 0o755);

  const run = options.execFileSyncImpl || execFileSync;
  const target = `gui/${options.uid ?? process.getuid?.() ?? 0}`;
  try { run('launchctl', ['bootout', `${target}/${MACOS_COMPANION_LABEL}`], { stdio: 'ignore', env }); } catch {}
  run('launchctl', ['bootstrap', target, paths.serviceFile], { stdio: 'inherit', env });
  run('launchctl', ['kickstart', '-k', `${target}/${MACOS_COMPANION_LABEL}`], { stdio: 'inherit', env });
  return { ...paths, nodePath, codexCommand, serviceSource, installed: true };
}

/** @param {{env?: NodeJS.ProcessEnv, homeDirectory?: string, uid?: number, execFileSyncImpl?: typeof execFileSync}} [options] */
export function uninstallMacOSCompanion(options = {}) {
  const env = options.env || process.env;
  const paths = resolveMacOSCompanionPaths({ env, homeDirectory: options.homeDirectory });
  if (basename(paths.runtimeDirectory) !== 'companion') throw new Error('Refusing an unsafe runtime path.');
  const target = `gui/${options.uid ?? process.getuid?.() ?? 0}`;
  try { (options.execFileSyncImpl || execFileSync)('launchctl', ['bootout', `${target}/${MACOS_COMPANION_LABEL}`], { stdio: 'ignore', env }); } catch {}
  if (existsSync(paths.serviceFile)) unlinkSync(paths.serviceFile);
  if (existsSync(paths.launcher)) unlinkSync(paths.launcher);
  rmSync(paths.runtimeDirectory, { recursive: true, force: true });
  return paths;
}

/** @param {'start'|'stop'|'restart'|'status'} command @param {{env?: NodeJS.ProcessEnv, uid?: number, execFileSyncImpl?: typeof execFileSync}} [options] */
export function runMacOSCompanionServiceCommand(command, options = {}) {
  if (!['start', 'stop', 'restart', 'status'].includes(command)) throw new Error('Unsupported companion service command.');
  const env = options.env || process.env;
  const run = options.execFileSyncImpl || execFileSync;
  const target = `gui/${options.uid ?? process.getuid?.() ?? 0}/${MACOS_COMPANION_LABEL}`;
  if (command === 'status') run('launchctl', ['print', target], { stdio: 'inherit', env });
  else if (command === 'stop') run('launchctl', ['kill', 'SIGTERM', target], { stdio: 'inherit', env });
  else run('launchctl', ['kickstart', ...(command === 'restart' ? ['-k'] : []), target], { stdio: 'inherit', env });
}
