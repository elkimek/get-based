// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createCompanionRuntimeController } from '../lib/companion-runtime-control.js';
import { GETBASED_COMPANION_VERSION } from '../shared/agent-host-protocol.js';

const VALID_BUNDLE = '#!/usr/bin/env node\nconst title = "getbased Companion"; const service = "getbased-agent-host";\n';

describe('running companion controls', () => {
  it('installs automatic startup from a temporary connection without starting a duplicate host', async () => {
    const installImpl = vi.fn(() => ({ installed: true }));
    const appServer = { restart: vi.fn(), initialize: vi.fn() };
    const controller = createCompanionRuntimeController({
      appServer, bundlePath: '/tmp/getbased-companion.mjs', env: {}, platform: 'linux', installImpl,
    });

    expect(controller.getInfo()).toMatchObject({ runtimeMode: 'temporary', companionVersion: GETBASED_COMPANION_VERSION });
    await expect(controller.handle('install', { origin: 'https://getbased.health' }))
      .resolves.toMatchObject({ runtimeMode: 'installed', installed: true });
    expect(installImpl).toHaveBeenCalledWith(expect.objectContaining({
      bundlePath: '/tmp/getbased-companion.mjs', platform: 'linux', startService: false,
    }));
  });

  it('reopens CLI connections while keeping the companion control channel available', async () => {
    const appServer = { restart: vi.fn(), initialize: vi.fn() };
    const controller = createCompanionRuntimeController({
      appServer, bundlePath: '/tmp/getbased-companion.mjs', env: {}, platform: 'linux',
    });
    await expect(controller.handle('restart', { origin: 'https://getbased.health' }))
      .resolves.toMatchObject({ restarted: true });
    expect(appServer.restart).toHaveBeenCalledOnce();
    expect(appServer.initialize).toHaveBeenCalledOnce();
  });

  it('schedules an installed companion service restart after the response can be sent', async () => {
    const serviceCommandImpl = vi.fn();
    let scheduled;
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() },
      bundlePath: '/tmp/getbased-companion.mjs',
      env: { GETBASED_COMPANION_SERVICE: '1' }, platform: 'linux', serviceCommandImpl,
      scheduleImpl: callback => { scheduled = callback; },
    });

    await expect(controller.handle('restart-companion', { origin: 'https://getbased.health' }))
      .resolves.toMatchObject({ restarting: true, runtimeMode: 'installed' });
    expect(serviceCommandImpl).not.toHaveBeenCalledWith('restart', expect.anything());
    scheduled();
    expect(serviceCommandImpl).toHaveBeenCalledWith('restart', expect.objectContaining({ platform: 'linux' }));
  });

  it('does not pretend a temporary terminal companion can restart itself', async () => {
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() },
      bundlePath: '/tmp/getbased-companion.mjs', env: {}, platform: 'linux',
    });
    await expect(controller.handle('restart-companion', { origin: 'http://localhost:8000' }))
      .rejects.toThrow('Start the companion automatically');
  });

  it('updates only from the fixed official endpoint, never from a calling page', async () => {
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
    expect(fetchImpl).toHaveBeenCalledWith('https://app.getbased.health/getbased-companion.mjs', expect.objectContaining({ cache: 'no-store', redirect: 'error' }));
    expect(installImpl).toHaveBeenCalledWith(expect.objectContaining({ platform: 'linux', startService: false }));
    await controller.handle('update', { origin: 'http://localhost:9999' });
    expect(fetchImpl.mock.calls.every(([url]) => url === 'https://app.getbased.health/getbased-companion.mjs')).toBe(true);
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
