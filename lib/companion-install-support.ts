// Shared installation operations; platform launchers and service commands stay explicit.
import { accessSync, chmodSync, constants, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { LOCAL_AGENT_SPECS, isLocalAgentSpecEnabled, resolveLocalAgentCommand } from './local-agent-registry.js';

export type CompanionServiceCommand = 'start' | 'stop' | 'restart' | 'status';
export type CompanionServiceExecutor = (command: string, args: readonly string[], options: { stdio: 'inherit' | 'ignore'; env: NodeJS.ProcessEnv }) => unknown;
export interface CompanionLocationOptions { env?: NodeJS.ProcessEnv; homeDirectory?: string | undefined }
export interface CompanionServiceOptions extends CompanionLocationOptions {
  platform?: NodeJS.Platform;
  uid?: number;
  stopService?: boolean;
  execFileSyncImpl?: CompanionServiceExecutor;
}
export interface CompanionInstallOptions extends CompanionServiceOptions {
  bundlePath: string;
  nodePath?: string;
  dryRun?: boolean;
  startService?: boolean;
}
export interface CompanionLaunch { nodePath: string; bundlePath: string }
export interface CompanionServiceSource extends CompanionLaunch {
  codexCommand?: string;
  sourceCodexHome?: string;
  agentCommands?: Record<string, string>;
}
export interface PosixCompanionPaths { runtimeDirectory: string; installedBundle: string; serviceFile: string; launcher: string }
export interface CompanionRuntimeOptions {
  appServer: { restart(): unknown; initialize(): unknown };
  bundlePath: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  fetchImpl?: (url: string, options: RequestInit) => Promise<Response>;
  installImpl?: (options: CompanionInstallOptions) => unknown;
  uninstallImpl?: (options: CompanionServiceOptions) => unknown;
  serviceCommandImpl?: (command: CompanionServiceCommand, options: CompanionServiceOptions) => unknown;
  scheduleImpl?: (callback: () => unknown, delay: number) => unknown;
  stopRuntime?: () => Promise<void>;
  recoverRuntime?: () => Promise<void>;
  exitRuntime?: () => void;
}

export function requireSafeAbsolutePath(value: unknown, label: string) {
  const normalized = resolve(String(value || ''));
  if (!value || !isAbsolute(String(value)) || normalized === '/') {
    throw new Error(`${label} must be a specific absolute path.`);
  }
  return normalized;
}

export function prepareCompanionAgentCommands(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, homeDirectory: string) {
  const agentCommands: Record<string, string> = Object.fromEntries(LOCAL_AGENT_SPECS.filter(spec => isLocalAgentSpecEnabled(spec, env)).flatMap(spec => {
    const command = resolveLocalAgentCommand(spec, { env, platform, homeDirectory });
    return command ? [[spec.env, command]] : [];
  }));
  if (!Object.keys(agentCommands).length) throw new Error('No supported CLI agent was found. Install Codex, OpenCode, Hermes, Grok, or OpenClaw first.');
  if (String(env.GETBASED_ENABLE_CLAUDE_AGENT || '').trim().toLowerCase() === 'api-console') {
    agentCommands.GETBASED_ENABLE_CLAUDE_AGENT = 'api-console';
  }
  return agentCommands;
}

function shellQuote(value: string) {
  return `'${String(value).replaceAll("'", "'\\''").replace(/[\r\n]/g, '')}'`;
}

export function installPosixCompanionFiles(paths: PosixCompanionPaths, bundlePath: string, serviceSource: string, nodePath: string) {
  mkdirSync(paths.runtimeDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(dirname(paths.serviceFile), { recursive: true, mode: 0o700 });
  mkdirSync(dirname(paths.launcher), { recursive: true, mode: 0o755 });
  copyFileSync(bundlePath, paths.installedBundle);
  chmodSync(paths.installedBundle, 0o700);
  writeFileSync(paths.serviceFile, serviceSource, { mode: 0o600 });
  writeFileSync(paths.launcher, `#!/bin/sh\nexec ${shellQuote(nodePath)} ${shellQuote(paths.installedBundle)} "$@"\n`, { mode: 0o755 });
  chmodSync(paths.launcher, 0o755);
}

export function findExecutable(command: string, pathValue = '') {
  if (isAbsolute(command)) {
    try { accessSync(command, constants.X_OK); return resolve(command); } catch { return ''; }
  }
  for (const directory of String(pathValue).split(delimiter).filter(Boolean)) {
    const candidate = join(directory, command);
    try { accessSync(candidate, constants.X_OK); return resolve(candidate); } catch {}
  }
  return '';
}
