// @vitest-environment node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgentVersionRefresher } from '../lib/local-agent-registry.js';
import type { DetectedLocalAgent } from '../lib/local-agent-registry.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(source = `process.stdout.write(readFileSync(new URL('./version.txt', import.meta.url), 'utf8'));`) {
  const root = mkdtempSync(join(tmpdir(), 'getbased-cli-version-'));
  roots.push(root);
  const script = join(root, 'CLI launcher.mjs');
  const version = join(root, 'version.txt');
  const calls = join(root, 'calls.txt');
  writeFileSync(script, `import { readFileSync, appendFileSync } from 'node:fs';\nappendFileSync(new URL('./calls.txt', import.meta.url), JSON.stringify(process.argv.slice(2)) + '\\n');\n${source}\n`);
  writeFileSync(version, 'codex-cli 0.156.1\n');
  const agent: DetectedLocalAgent = { id: 'codex', name: 'Codex CLI', description: 'CLI', env: 'GETBASED_CODEX_COMMAND',
    protocol: 'codex', command: process.execPath, args: [script, 'acp', '--pure'], versionArgs: [script],
    compatible: true, status: 'available', version: 'codex-cli 0.156.1' };
  return { root, script, version, calls, agent };
}

describe('installed CLI version refresh', () => {
  it('reads an upgraded CLI in the same running bridge using launcher argv without protocol arguments', async () => {
    const f = fixture();
    const refresh = createAgentVersionRefresher([f.agent]);
    expect((await refresh()).get('codex')).toBe('codex-cli 0.156.1');
    writeFileSync(f.version, 'codex-cli 0.163.0\nignored second line\n');
    expect((await refresh()).get('codex')).toBe('codex-cli 0.163.0');
    expect(readFileSync(f.calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))).toEqual([
      ['--version'], ['--version'],
    ]);
    expect(f.agent.args).toEqual([f.script, 'acp', '--pure']);
    expect(f.agent.status).toBe('available');
  });

  it('shares concurrent refresh requests and can probe again after completion', async () => {
    const f = fixture(`await new Promise(resolve => setTimeout(resolve, 50)); process.stdout.write('codex-cli 0.163.0');`);
    const refresh = createAgentVersionRefresher([f.agent]);
    const first = refresh(), second = refresh();
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(readFileSync(f.calls, 'utf8').trim().split('\n')).toHaveLength(1);
    await refresh();
    expect(readFileSync(f.calls, 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it.each(['process.stdout.write("old version"); process.exit(1);', 'process.stdout.write("x".repeat(20000));'])('clears stale metadata when a probe fails or exceeds its output limit: %s', async source => {
    const f = fixture(source);
    const versions = await createAgentVersionRefresher([f.agent])();
    expect(versions.get('codex')).toBe('');
    expect(f.agent.status).toBe('available');
  });

  it('keeps missing and incompatible launchers out of version metadata', async () => {
    const f = fixture();
    f.agent.command = join(f.root, 'missing-command');
    expect((await createAgentVersionRefresher([f.agent])()).get('codex')).toBe('');
    f.agent.command = process.execPath;
    f.agent.compatible = false;
    expect((await createAgentVersionRefresher([f.agent])()).get('codex')).toBe('');
    expect(() => readFileSync(f.calls, 'utf8')).toThrow();
  });

  it('normalizes supported version labels while refreshing all agents independently', async () => {
    const codex = fixture();
    const claude = fixture(`process.stdout.write('2.1.259 (Claude Code)');`);
    claude.agent.id = 'claude';
    const refresh = createAgentVersionRefresher([codex.agent, claude.agent]);
    expect(Object.fromEntries(await refresh())).toEqual({ codex: 'codex-cli 0.156.1', claude: '2.1.259' });
  });
});
