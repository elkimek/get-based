// @vitest-environment node

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareAgentHostStorage } from '../lib/agent-host-storage.js';

const fixtureRoots: string[] = [];

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

  it('can prepare companion state when only a non-Codex CLI is used', () => {
    const { sourceCodexHome, dataDirectory } = fixture();
    const result = prepareAgentHostStorage({
      env: { CODEX_HOME: sourceCodexHome, GETBASED_AGENT_HOST_DATA_DIR: dataDirectory },
      requireCodexAuth: false,
      randomToken: () => 'non-codex-pairing-token',
    });
    expect(result.codexAuthenticated).toBe(false);
    expect(result.token).toBe('non-codex-pairing-token');
  });

  it('retires a copied login when the source disappears and refreshes a replaced older file', () => {
    const { sourceCodexHome, dataDirectory } = fixture();
    mkdirSync(sourceCodexHome, { recursive: true });
    const source = join(sourceCodexHome, 'auth.json');
    writeFileSync(source, '{"auth":"first synthetic login"}');
    const env = { CODEX_HOME: sourceCodexHome, GETBASED_AGENT_HOST_DATA_DIR: dataDirectory };
    const { codexHome } = prepareAgentHostStorage({ env });
    const copy = join(codexHome, 'auth.json');
    writeFileSync(source, '{"auth":"second synthetic login"}');
    utimesSync(source, 100, 100);
    expect(prepareAgentHostStorage({ env }).codexAuthenticated).toBe(true);
    expect(readFileSync(copy, 'utf8')).toBe('{"auth":"second synthetic login"}');
    rmSync(source);
    expect(prepareAgentHostStorage({ env, requireCodexAuth: false }).codexAuthenticated).toBe(false);
    expect(existsSync(copy)).toBe(false);
  });
});
