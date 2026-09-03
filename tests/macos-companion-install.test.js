// @vitest-environment node

import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installMacOSCompanion, MACOS_COMPANION_LABEL, resolveMacOSCompanionPaths,
  runMacOSCompanionServiceCommand, uninstallMacOSCompanion,
} from '../lib/macos-companion-install.js';

const roots = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'getbased-macos-companion-'));
  roots.push(root);
  const homeDirectory = join(root, 'home');
  const binDirectory = join(root, 'bin');
  const bundlePath = join(root, 'getbased-companion.mjs');
  const codexCommand = join(binDirectory, 'codex');
  const codexHome = join(root, 'codex-home');
  mkdirSync(homeDirectory, { recursive: true });
  mkdirSync(binDirectory, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(bundlePath, '#!/usr/bin/env node\n');
  writeFileSync(codexCommand, '#!/bin/sh\n');
  writeFileSync(join(codexHome, 'auth.json'), '{}');
  chmodSync(codexCommand, 0o755);
  return {
    homeDirectory, bundlePath, nodePath: process.execPath, platform: /** @type {const} */ ('darwin'), uid: 501,
    env: { PATH: binDirectory, GETBASED_CODEX_COMMAND: codexCommand, GETBASED_SOURCE_CODEX_HOME: codexHome },
  };
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('macOS companion installer', () => {
  it('installs a user LaunchAgent and supports lifecycle controls', () => {
    const setup = fixture();
    const launchctl = vi.fn();
    const result = installMacOSCompanion({ ...setup, execFileSyncImpl: launchctl });
    expect(result.installed).toBe(true);
    expect(readFileSync(result.serviceFile, 'utf8')).toContain(`<string>${MACOS_COMPANION_LABEL}</string>`);
    expect(readFileSync(result.serviceFile, 'utf8')).toContain('<key>RunAtLoad</key><true/>');
    expect(readFileSync(result.launcher, 'utf8')).toContain(result.installedBundle);
    expect(launchctl.mock.calls.map(call => call[1][0])).toEqual(['bootout', 'bootstrap', 'kickstart']);

    runMacOSCompanionServiceCommand('status', { ...setup, execFileSyncImpl: launchctl });
    runMacOSCompanionServiceCommand('restart', { ...setup, execFileSyncImpl: launchctl });
    expect(launchctl).toHaveBeenCalledWith('launchctl', ['print', `gui/501/${MACOS_COMPANION_LABEL}`], expect.anything());
    expect(launchctl).toHaveBeenCalledWith('launchctl', ['kickstart', '-k', `gui/501/${MACOS_COMPANION_LABEL}`], expect.anything());

    uninstallMacOSCompanion({ ...setup, execFileSyncImpl: launchctl });
    expect(existsSync(result.runtimeDirectory)).toBe(false);
    expect(existsSync(result.serviceFile)).toBe(false);
  });

  it('resolves user-owned macOS paths', () => {
    const paths = resolveMacOSCompanionPaths({ homeDirectory: '/Users/alex' });
    expect(paths.runtimeDirectory).toBe('/Users/alex/Library/Application Support/getbased/companion');
    expect(paths.serviceFile).toBe(`/Users/alex/Library/LaunchAgents/${MACOS_COMPANION_LABEL}.plist`);
  });
});
