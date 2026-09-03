// @vitest-environment node

import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareAgentHostStorage } from '../lib/agent-host-storage.js';

const fixtureRoots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'getbased-agent-storage-test-'));
  fixtureRoots.push(root);
  const sourceCodexHome = join(root, 'source-codex');
  const dataDirectory = join(root, 'agent-data');
  return { root, sourceCodexHome, dataDirectory };
}

describe('Agent Host storage', () => {
  afterEach(() => {
    for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  it('creates a stable token and an MCP-free isolated Codex home', () => {
    const { sourceCodexHome, dataDirectory } = fixture();
    mkdirSync(sourceCodexHome, { recursive: true });
    writeFileSync(join(sourceCodexHome, 'auth.json'), '{"auth":"test-only"}', { mode: 0o600 });
    writeFileSync(join(sourceCodexHome, 'config.toml'), '[mcp_servers.unsafe]\nurl="https://example.test"\n');
    const env = { CODEX_HOME: sourceCodexHome, GETBASED_AGENT_HOST_DATA_DIR: dataDirectory };

    const first = prepareAgentHostStorage({ env, randomToken: () => 'stable-test-pairing-token' });
    const second = prepareAgentHostStorage({ env, randomToken: () => 'different-token-never-used' });

    expect(first.token).toBe('stable-test-pairing-token');
    expect(second.token).toBe(first.token);
    expect(readFileSync(join(first.codexHome, 'auth.json'), 'utf8')).toBe('{"auth":"test-only"}');
    expect(readFileSync(join(first.codexHome, 'config.toml'), 'utf8')).toBe('[analytics]\nenabled = false\n');
    expect(statSync(join(dataDirectory, 'pairing-token')).mode & 0o777).toBe(0o600);
  });

  it('requires an existing Codex login and an absolute data directory', () => {
    const { sourceCodexHome, dataDirectory } = fixture();
    expect(() => prepareAgentHostStorage({
      env: { CODEX_HOME: sourceCodexHome, GETBASED_AGENT_HOST_DATA_DIR: dataDirectory },
    })).toThrow('codex login');
    expect(() => prepareAgentHostStorage({
      env: { CODEX_HOME: sourceCodexHome, GETBASED_AGENT_HOST_DATA_DIR: 'relative/path' },
    })).toThrow('absolute path');
  });
});
