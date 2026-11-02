// A process-owned Hermes policy preserves its login source while narrowing ACP
// to the MCP tools supplied by getbased. Never replace an administrator policy.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

interface HermesIsolationOptions {
  command: string;
  launchArgs?: readonly string[] | undefined;
  cwd: string;
  env: NodeJS.ProcessEnv;
  existingManagedDirectory?: string | undefined;
  execFileSyncImpl?: typeof execFileSync;
  existsSyncImpl?: typeof existsSync;
}
const unavailable = () => new Error('Hermes could not verify its restricted getbased tool scope. Update Hermes and check the connection again.');

export function prepareHermesAgentEnvironment(options: HermesIsolationOptions): NodeJS.ProcessEnv {
  if ((options.existingManagedDirectory || '').trim() || (options.existsSyncImpl || existsSync)('/etc/hermes')) {
    throw new Error('Hermes already has an administrator policy. getbased cannot replace that policy to configure its restricted ACP tools.');
  }
  const directory = mkdtempSync(join(options.cwd, 'hermes-scope-'));
  const marker = randomUUID();
  const policy = {
    platform_toolsets: { acp: ['no_mcp'], getbased_scope_probe: [marker] },
    plugins: { enabled: [] },
    context: { engine: 'compressor' },
    memory: { memory_enabled: false, user_profile_enabled: false },
    // Hermes can add X search from its saved login even with an empty selection.
    agent: { disabled_toolsets: ['memory', 'context_engine', 'x_search'] },
  };
  const env = { ...options.env, HERMES_MANAGED_DIR: directory };
  try {
    writeFileSync(join(directory, 'config.yaml'), JSON.stringify(policy), { mode: 0o600 });
    // The random marker proves this process policy was loaded, even when the
    // user's own ACP selection already happens to equal no_mcp. No auth or
    // private configuration value is logged, returned or placed in the policy.
    const output = (options.execFileSyncImpl || execFileSync)(options.command, [...(options.launchArgs || []), 'config', 'get', 'platform_toolsets', '--json'], {
      cwd: options.cwd, env, encoding: 'utf8', timeout: 10_000, maxBuffer: 131_072,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const observed = JSON.parse(String(output)) as { acp?: unknown; getbased_scope_probe?: unknown };
    if (JSON.stringify(observed?.acp) !== '["no_mcp"]' || JSON.stringify(observed?.getbased_scope_probe) !== JSON.stringify([marker])) throw unavailable();
    return env;
  } catch {
    rmSync(directory, { recursive: true, force: true });
    throw unavailable();
  }
}
