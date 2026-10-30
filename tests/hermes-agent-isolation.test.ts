// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareHermesAgentEnvironment } from '../lib/hermes-agent-isolation.js';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'getbased-hermes-isolation-test-')); roots.push(cwd);
  return { command: '/synthetic/hermes', launchArgs: ['/synthetic/launcher'], cwd, env: { HOME: '/login/source', PATH: '/bin' }, existsSyncImpl: vi.fn(() => false) };
}
it('uses a private process policy with no credentials, native tools, ambient MCP, plugins or external memory', () => {
  const options = fixture();
  const run = vi.fn((...args: unknown[]) => {
    expect(args[0]).toBe(options.command);
    expect(args[1]).toEqual(['/synthetic/launcher', 'config', 'get', 'platform_toolsets', '--json']);
    const execution = args[2] as {env: NodeJS.ProcessEnv; timeout: number; maxBuffer: number};
    expect(execution.timeout).toBe(10_000); expect(execution.maxBuffer).toBe(131_072);
    const scope = execution.env.HERMES_MANAGED_DIR!;
    expect(scope.startsWith(join(options.cwd, 'hermes-scope-'))).toBe(true);
    const raw = readFileSync(join(scope, 'config.yaml'), 'utf8');
    const policy = JSON.parse(raw);
    expect(policy).toEqual({ platform_toolsets: { acp: ['no_mcp'], getbased_scope_probe: [expect.stringMatching(/^[0-9a-f-]{36}$/)] }, plugins: { enabled: [] }, context: { engine: 'compressor' }, memory: { memory_enabled: false, user_profile_enabled: false }, agent: { disabled_toolsets: ['memory', 'context_engine', 'x_search'] } });
    expect(raw).not.toContain('/login/source'); expect(raw).not.toMatch(/api_key|token|password/);
    if (process.platform !== 'win32') { expect(statSync(scope).mode & 0o777).toBe(0o700); expect(statSync(join(scope, 'config.yaml')).mode & 0o777).toBe(0o600); }
    return JSON.stringify(policy.platform_toolsets);
  });
  const env = prepareHermesAgentEnvironment({ ...options, execFileSyncImpl: run as never });
  expect(run).toHaveBeenCalledTimes(1); expect(env.HOME).toBe('/login/source'); expect(options.env).toEqual({ HOME: '/login/source', PATH: '/bin' });
  expect(readdirSync(options.cwd)).toHaveLength(1);
});
it.each(['ignored', 'replaced', 'malformed', 'failed'] as const)('refuses an unverified %s scope and removes only its own policy', outcome => {
  const options = fixture();
  const run = vi.fn(() => { if (outcome === 'failed') throw new Error('Private configuration must not leak'); return outcome === 'ignored' ? '{"acp":["no_mcp"]}' : outcome === 'replaced' ? '{"acp":["hermes-acp"],"getbased_scope_probe":["foreign"]}' : 'not JSON'; });
  expect(() => prepareHermesAgentEnvironment({ ...options, execFileSyncImpl: run as never })).toThrow('restricted getbased tool scope');
  expect(readdirSync(options.cwd)).toEqual([]);
});
it.each(['explicit', 'system'] as const)('preserves an existing %s administrator policy without invoking Hermes', kind => {
  const options = fixture(), run = vi.fn();
  expect(() => prepareHermesAgentEnvironment({ ...options, existingManagedDirectory: kind === 'explicit' ? '/private/admin-scope' : undefined, existsSyncImpl: () => kind === 'system', execFileSyncImpl: run as never })).toThrow('administrator policy');
  expect(run).not.toHaveBeenCalled(); expect(readdirSync(options.cwd)).toEqual([]);
});
