// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createCompanionRuntimeController } from '../lib/companion-runtime-control.js';

const VALID_BUNDLE = '#!/usr/bin/env node\nconst title = "getbased Companion"; const service = "getbased-agent-host";\n';

describe('running companion controls', () => {
  it('installs automatic startup from a temporary connection without starting a duplicate host', async () => {
    const installImpl = vi.fn(() => ({ installed: true }));
    const appServer = { restart: vi.fn(), initialize: vi.fn() };
    const controller = createCompanionRuntimeController({
      appServer, bundlePath: '/tmp/getbased-companion.mjs', env: {}, platform: 'linux', installImpl,
    });

    expect(controller.getInfo()).toMatchObject({ runtimeMode: 'temporary', companionVersion: '1.0.0' });
    await expect(controller.handle('install', { origin: 'https://getbased.health' }))
      .resolves.toMatchObject({ runtimeMode: 'installed', installed: true });
    expect(installImpl).toHaveBeenCalledWith(expect.objectContaining({
      bundlePath: '/tmp/getbased-companion.mjs', platform: 'linux', startService: false,
    }));
  });

  it('restarts only the Codex connection while keeping the control channel available', async () => {
    const appServer = { restart: vi.fn(), initialize: vi.fn() };
    const controller = createCompanionRuntimeController({
      appServer, bundlePath: '/tmp/getbased-companion.mjs', env: {}, platform: 'linux',
    });
    await expect(controller.handle('restart', { origin: 'https://getbased.health' }))
      .resolves.toMatchObject({ restarted: true });
    expect(appServer.restart).toHaveBeenCalledOnce();
    expect(appServer.initialize).toHaveBeenCalledOnce();
  });

  it('updates only from the active HTTPS getbased origin and keeps the service registered', async () => {
    const installImpl = vi.fn(() => ({ installed: true }));
    const fetchImpl = vi.fn(async () => new Response(VALID_BUNDLE, { status: 200 }));
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() },
      bundlePath: '/tmp/getbased-companion.mjs',
      env: { GETBASED_COMPANION_SERVICE: '1' },
      platform: 'linux',
      installImpl,
      fetchImpl,
    });

    await expect(controller.handle('update', { origin: 'https://getbased.health' }))
      .resolves.toMatchObject({ updated: true, restartRequired: true, runtimeMode: 'installed' });
    expect(fetchImpl).toHaveBeenCalledWith('https://getbased.health/getbased-companion.mjs', { cache: 'no-store' });
    expect(installImpl).toHaveBeenCalledWith(expect.objectContaining({ platform: 'linux', startService: false }));
    await expect(controller.handle('update', { origin: 'http://remote.example' }))
      .rejects.toThrow('HTTPS or a loopback');
  });

  it('removes automatic startup without killing the response in flight', async () => {
    const uninstallImpl = vi.fn();
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() },
      bundlePath: '/tmp/getbased-companion.mjs',
      env: { GETBASED_COMPANION_SERVICE: '1' },
      platform: 'linux',
      uninstallImpl,
    });
    await expect(controller.handle('uninstall', { origin: 'https://getbased.health' }))
      .resolves.toMatchObject({ uninstalled: true, runtimeMode: 'temporary' });
    expect(uninstallImpl).toHaveBeenCalledWith(expect.objectContaining({ platform: 'linux', stopService: false }));
  });
});
