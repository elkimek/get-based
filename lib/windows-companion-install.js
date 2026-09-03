// @ts-check
// Windows Task Scheduler installer for the single-file getbased Companion.

import { execFileSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { win32 } from 'node:path';
import { LOCAL_AGENT_SPECS } from './local-agent-registry.js';

export const WINDOWS_COMPANION_TASK = 'getbased Companion';

function requireWindowsAbsolutePath(value, label) {
  const normalized = win32.resolve(String(value || ''));
  if (!value || !win32.isAbsolute(String(value)) || /^[A-Za-z]:\\?$/.test(normalized)) {
    throw new Error(`${label} must be a specific absolute path.`);
  }
  return normalized;
}

/** @param {{env?: NodeJS.ProcessEnv, homeDirectory?: string}} [options] */
export function resolveWindowsCompanionPaths(options = {}) {
  const env = options.env || process.env;
  const homeDirectory = requireWindowsAbsolutePath(options.homeDirectory || env.USERPROFILE || homedir(), 'Home directory');
  const localAppData = requireWindowsAbsolutePath(env.LOCALAPPDATA || win32.join(homeDirectory, 'AppData', 'Local'), 'LOCALAPPDATA');
  const runtimeDirectory = win32.join(localAppData, 'getbased', 'companion');
  return Object.freeze({
    runtimeDirectory,
    installedBundle: win32.join(runtimeDirectory, 'getbased-companion.mjs'),
    runnerScript: win32.join(runtimeDirectory, 'run-hidden.vbs'),
    launcher: win32.join(runtimeDirectory, 'getbased-companion.cmd'),
    serviceFile: WINDOWS_COMPANION_TASK,
  });
}

function vbsString(value) {
  return `"${String(value).replaceAll('"', '""').replace(/[\r\n]/g, '')}"`;
}

/** @param {{nodePath: string, bundlePath: string, codexCommand?: string, sourceCodexHome?: string, pathValue?: string, agentCommands?: Record<string, string>}} options */
export function renderWindowsCompanionRunner(options) {
  const command = `"${options.nodePath}" "${options.bundlePath}" run`;
  const commands = options.agentCommands || (options.codexCommand ? { GETBASED_CODEX_COMMAND: options.codexCommand } : {});
  const commandEnvironment = Object.entries(commands).map(([name, value]) => `shell.Environment("Process")(${vbsString(name)}) = ${vbsString(value)}\r\n`).join('');
  return `Set shell = CreateObject("WScript.Shell")\r\nshell.Environment("Process")("GETBASED_COMPANION_SERVICE") = "1"\r\n${commandEnvironment}${options.sourceCodexHome ? `shell.Environment("Process")("GETBASED_SOURCE_CODEX_HOME") = ${vbsString(options.sourceCodexHome)}\r\n` : ''}${options.pathValue ? `shell.Environment("Process")("PATH") = ${vbsString(options.pathValue)}\r\n` : ''}shell.Run ${vbsString(command)}, 0, True\r\n`;
}

/** @param {{nodePath: string, bundlePath: string}} options */
export function renderWindowsCompanionLauncher(options) {
  return `@echo off\r\n"${options.nodePath}" "${options.bundlePath}" %*\r\n`;
}

function findWindowsExecutable(command, env) {
  if (win32.isAbsolute(command) && existsSync(command)) return win32.resolve(command);
  const extensions = ['', ...String(env.PATHEXT || '.EXE;.CMD;.BAT').split(';').map(value => value.toLowerCase())];
  for (const directory of String(env.PATH || '').split(';').filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = win32.join(directory, command.toLowerCase().endsWith(extension) ? command : `${command}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return '';
}

/**
 * @param {{bundlePath: string, env?: NodeJS.ProcessEnv, homeDirectory?: string, nodePath?: string, platform?: NodeJS.Platform, dryRun?: boolean, startService?: boolean, execFileSyncImpl?: typeof execFileSync}} options
 */
export function installWindowsCompanion(options) {
  if ((options.platform || process.platform) !== 'win32') throw new Error('This companion installer requires Windows.');
  const env = options.env || process.env;
  const bundlePath = requireWindowsAbsolutePath(options.bundlePath, 'Companion bundle');
  if (!existsSync(bundlePath)) throw new Error(`Companion bundle was not found: ${bundlePath}`);
  const nodePath = findWindowsExecutable(options.nodePath || process.execPath, env);
  if (!nodePath) throw new Error('Node.js was not found. Install Node.js 20 or newer first.');
  const agentCommands = Object.fromEntries(LOCAL_AGENT_SPECS.flatMap(spec => {
    const command = findWindowsExecutable(String(env[spec.env] || spec.command).trim(), env);
    return command ? [[spec.env, command]] : [];
  }));
  if (!Object.keys(agentCommands).length) throw new Error('No supported CLI agent was found. Install Codex, Claude Code, OpenCode, Hermes, or Grok first.');
  const codexCommand = agentCommands.GETBASED_CODEX_COMMAND || '';
  const homeDirectory = requireWindowsAbsolutePath(options.homeDirectory || env.USERPROFILE || homedir(), 'Home directory');
  const sourceCodexHome = requireWindowsAbsolutePath(env.GETBASED_SOURCE_CODEX_HOME || env.CODEX_HOME || win32.join(homeDirectory, '.codex'), 'Codex home');
  const paths = resolveWindowsCompanionPaths({ env, homeDirectory });
  const runnerSource = renderWindowsCompanionRunner({
    nodePath, bundlePath: paths.installedBundle, codexCommand, sourceCodexHome, agentCommands,
    pathValue: env.PATH || win32.dirname(codexCommand),
  });
  if (options.dryRun) return { ...paths, nodePath, codexCommand, runnerSource, installed: false };

  mkdirSync(paths.runtimeDirectory, { recursive: true });
  copyFileSync(bundlePath, paths.installedBundle);
  writeFileSync(paths.runnerScript, runnerSource);
  writeFileSync(paths.launcher, renderWindowsCompanionLauncher({ nodePath, bundlePath: paths.installedBundle }));
  const systemRoot = requireWindowsAbsolutePath(env.SystemRoot || 'C:\\Windows', 'SystemRoot');
  const wscript = win32.join(systemRoot, 'System32', 'wscript.exe');
  const taskAction = `"${wscript}" "${paths.runnerScript}"`;
  const run = options.execFileSyncImpl || execFileSync;
  run('schtasks.exe', ['/Create', '/TN', WINDOWS_COMPANION_TASK, '/TR', taskAction, '/SC', 'ONLOGON', '/RL', 'LIMITED', '/F'], { stdio: 'inherit', env });
  const settingsCommand = `$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries; Set-ScheduledTask -TaskName '${WINDOWS_COMPANION_TASK.replaceAll("'", "''")}' -Settings $settings | Out-Null`;
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', settingsCommand], { stdio: 'inherit', env });
  if (options.startService !== false) run('schtasks.exe', ['/Run', '/TN', WINDOWS_COMPANION_TASK], { stdio: 'inherit', env });
  return { ...paths, nodePath, codexCommand, runnerSource, installed: true };
}

/** @param {{env?: NodeJS.ProcessEnv, homeDirectory?: string, stopService?: boolean, execFileSyncImpl?: typeof execFileSync}} [options] */
export function uninstallWindowsCompanion(options = {}) {
  const env = options.env || process.env;
  const paths = resolveWindowsCompanionPaths({ env, homeDirectory: options.homeDirectory });
  if (win32.basename(paths.runtimeDirectory) !== 'companion') throw new Error('Refusing an unsafe runtime path.');
  const run = options.execFileSyncImpl || execFileSync;
  if (options.stopService !== false) {
    try { run('schtasks.exe', ['/End', '/TN', WINDOWS_COMPANION_TASK], { stdio: 'ignore', env }); } catch {}
  }
  try { run('schtasks.exe', ['/Delete', '/TN', WINDOWS_COMPANION_TASK, '/F'], { stdio: 'ignore', env }); } catch {}
  if (existsSync(paths.runnerScript)) unlinkSync(paths.runnerScript);
  if (existsSync(paths.launcher)) unlinkSync(paths.launcher);
  rmSync(paths.runtimeDirectory, { recursive: true, force: true });
  return paths;
}

/** @param {'start'|'stop'|'restart'|'status'} command @param {{env?: NodeJS.ProcessEnv, execFileSyncImpl?: typeof execFileSync}} [options] */
export function runWindowsCompanionServiceCommand(command, options = {}) {
  if (!['start', 'stop', 'restart', 'status'].includes(command)) throw new Error('Unsupported companion service command.');
  const env = options.env || process.env;
  const run = options.execFileSyncImpl || execFileSync;
  if (command === 'status') run('schtasks.exe', ['/Query', '/TN', WINDOWS_COMPANION_TASK, '/FO', 'LIST'], { stdio: 'inherit', env });
  else if (command === 'stop') run('schtasks.exe', ['/End', '/TN', WINDOWS_COMPANION_TASK], { stdio: 'inherit', env });
  else {
    if (command === 'restart') {
      try { run('schtasks.exe', ['/End', '/TN', WINDOWS_COMPANION_TASK], { stdio: 'ignore', env }); } catch {}
    }
    run('schtasks.exe', ['/Run', '/TN', WINDOWS_COMPANION_TASK], { stdio: 'inherit', env });
  }
}
