// @vitest-environment node

import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installLinuxCompanion, LINUX_COMPANION_SERVICE, resolveLinuxCompanionPaths,
  runLinuxCompanionServiceCommand, uninstallLinuxCompanion,
} from '../lib/linux-companion-install.js';

const roots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'getbased-companion-install-'));
  roots.push(root);
  const homeDirectory = join(root, 'home');
  const binDirectory = join(root, 'commands');
  const bundlePath = join(root, 'getbased-companion.mjs');
  const codexCommand = join(binDirectory, 'codex');
  const codexHome = join(root, 'codex-home');
  mkdirSync(homeDirectory, { recursive: true });
  mkdirSync(binDirectory, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(bundlePath, '#!/usr/bin/env node\n');
  writeFileSync(codexCommand, '#!/bin/sh\nexit 0\n');
  writeFileSync(join(codexHome, 'auth.json'), '{}');
  chmodSync(codexCommand, 0o755);
  const env = {
    PATH: binDirectory,
    XDG_DATA_HOME: join(root, 'data'),
    XDG_CONFIG_HOME: join(root, 'config'),
    GETBASED_CODEX_COMMAND: codexCommand,
    GETBASED_SOURCE_CODEX_HOME: codexHome,
  };
  return { root, homeDirectory, bundlePath, codexCommand, codexHome, env };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Linux companion installer', () => {
  it('installs only user-owned runtime files and enables a systemd user service', () => {
    const setup = fixture();
    const systemctl = vi.fn();
    const result = installLinuxCompanion({
      ...setup, nodePath: process.execPath, platform: 'linux', execFileSyncImpl: systemctl,
    });

    expect(result.installed).toBe(true);
    expect(readFileSync(result.installedBundle, 'utf8')).toContain('#!/usr/bin/env node');
    expect(statSync(result.installedBundle).mode & 0o777).toBe(0o700);
    const service = readFileSync(result.serviceFile, 'utf8');
    expect(service).toContain('WantedBy=default.target');
    expect(service).toContain(`GETBASED_CODEX_COMMAND=${setup.codexCommand}`);
    expect(service).toContain(`GETBASED_SOURCE_CODEX_HOME=${setup.codexHome}`);
    expect(service).toContain('GETBASED_COMPANION_SERVICE=1');
    expect(service).toContain(`${result.installedBundle}" run`);
    expect(readFileSync(result.launcher, 'utf8')).toContain(result.installedBundle);
    expect(systemctl.mock.calls.map(call => call[1])).toEqual([
      ['--user', 'daemon-reload'],
      ['--user', 'enable', '--now', LINUX_COMPANION_SERVICE],
      ['--user', 'is-active', '--quiet', LINUX_COMPANION_SERVICE],
    ]);
  });

  it('can register automatic startup without launching a duplicate bridge', () => {
    const setup = fixture();
    const systemctl = vi.fn();
    installLinuxCompanion({
      ...setup, nodePath: process.execPath, platform: 'linux', startService: false, execFileSyncImpl: systemctl,
    });
    expect(systemctl.mock.calls.map(call => call[1])).toEqual([
      ['--user', 'daemon-reload'],
      ['--user', 'enable', LINUX_COMPANION_SERVICE],
    ]);
  });

  it('supports a write-free dry run and rejects a missing Codex CLI', () => {
    const setup = fixture();
    const paths = resolveLinuxCompanionPaths(setup);
    const result = installLinuxCompanion({
      ...setup, nodePath: process.execPath, platform: 'linux', dryRun: true,
    });
    expect(result.installed).toBe(false);
    expect(existsSync(paths.runtimeDirectory)).toBe(false);

    expect(() => installLinuxCompanion({
      ...setup,
      env: { ...setup.env, PATH: '', GETBASED_CODEX_COMMAND: 'codex' },
      nodePath: process.execPath,
      platform: 'linux',
      dryRun: true,
    })).toThrow('Codex CLI was not found');
  });

  it('uninstalls the exact service runtime while preserving separate pairing state', () => {
    const setup = fixture();
    const systemctl = vi.fn();
    const result = installLinuxCompanion({
      ...setup, nodePath: process.execPath, platform: 'linux', execFileSyncImpl: systemctl,
    });
    const pairingState = join(setup.env.XDG_DATA_HOME, 'getbased-agent-host', 'pairing-token');
    mkdirSync(join(setup.env.XDG_DATA_HOME, 'getbased-agent-host'), { recursive: true });
    writeFileSync(pairingState, 'keep-me');

    uninstallLinuxCompanion({ ...setup, execFileSyncImpl: systemctl });

    expect(existsSync(result.runtimeDirectory)).toBe(false);
    expect(existsSync(result.serviceFile)).toBe(false);
    expect(existsSync(result.launcher)).toBe(false);
    expect(readFileSync(pairingState, 'utf8')).toBe('keep-me');
  });

  it('supports start, stop, restart, and status controls', () => {
    const systemctl = vi.fn();
    for (const command of ['start', 'stop', 'restart', 'status']) {
      runLinuxCompanionServiceCommand(/** @type {'start'|'stop'|'restart'|'status'} */ (command), {
        execFileSyncImpl: systemctl,
      });
    }
    expect(systemctl.mock.calls.map(call => call[1])).toEqual([
      ['--user', 'start', LINUX_COMPANION_SERVICE],
      ['--user', 'stop', LINUX_COMPANION_SERVICE],
      ['--user', 'restart', LINUX_COMPANION_SERVICE],
      ['--user', 'status', '--no-pager', LINUX_COMPANION_SERVICE],
    ]);
  });
});
