// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createCompanionRuntimeController } from '../lib/companion-runtime-control.js';
import { GETBASED_COMPANION_VERSION } from '../shared/agent-host-protocol.js';

const VALID_BUNDLE = '#!/usr/bin/env node\nconst title = "getbased Companion"; const service = "getbased-agent-host";\nconst GETBASED_COMPANION_VERSION = "99.0.0";\n';

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

  it('hands an installed terminal runtime over without two listeners', async () => {
    const order = [];
    let scheduled;
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() }, bundlePath: '/tmp/getbased-companion.mjs',
      env: {}, installImpl: vi.fn(), scheduleImpl: callback => { scheduled = callback; },
      stopRuntime: async () => { order.push('stop-listener'); },
      serviceCommandImpl: () => { order.push('start-service'); },
      exitRuntime: () => { order.push('exit'); },
    });
    await controller.handle('install', { origin: 'http://127.0.0.1:8324' });
    expect(controller.getInfo()).toMatchObject({ runtimeMode: 'installed', processMode: 'terminal' });
    await controller.handle('restart-companion', { origin: 'http://127.0.0.1:8324' });
    expect(order).toEqual([]);
    await scheduled();
    expect(order).toEqual(['stop-listener', 'start-service', 'exit']);
  });

  it.each(['linux', 'darwin', 'win32'])('restores the terminal listener after a failed %s service handoff', async platform => {
    let scheduled;
    const order = [];
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const controller = createCompanionRuntimeController({
        appServer: { restart: vi.fn(), initialize: vi.fn() },
        bundlePath: '/tmp/getbased-companion.mjs', env: {}, platform,
        installImpl: vi.fn(), scheduleImpl: callback => { scheduled = callback; },
        stopRuntime: async () => { order.push('stop-listener'); },
        recoverRuntime: async () => { order.push('restore-listener'); },
        serviceCommandImpl: () => { order.push('start-service'); throw new Error('Service unavailable'); },
        exitRuntime: () => { order.push('exit'); },
      });
      await controller.handle('install', { origin: 'http://127.0.0.1:8324' });
      await controller.handle('restart-companion', { origin: 'http://127.0.0.1:8324' });
      await scheduled();
      expect(order).toEqual(['stop-listener', 'start-service', 'restore-listener']);
      expect(controller.getInfo().restartStatus).toBe('failed');
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Service unavailable'));
    } finally { stderr.mockRestore(); }
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

  it.each([GETBASED_COMPANION_VERSION, '1.0.0'])('does not install the same or an older release (%s)', async version => {
    const installImpl = vi.fn();
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() }, bundlePath: '/tmp/getbased-companion.mjs',
      env: { GETBASED_COMPANION_SERVICE: '1' }, installImpl,
      fetchImpl: async () => new Response(VALID_BUNDLE.replace('99.0.0', version)),
    });
    await expect(controller.handle('update', { origin: 'http://localhost:8000' }))
      .resolves.toMatchObject({ updated: false, upToDate: true, restartRequired: false });
    expect(installImpl).not.toHaveBeenCalled();
  });

  it('installs a newer release once and preserves the pending restart across status checks', async () => {
    const installImpl = vi.fn();
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() }, bundlePath: '/tmp/getbased-companion.mjs',
      env: { GETBASED_COMPANION_SERVICE: '1' }, installImpl,
      fetchImpl: async () => new Response(VALID_BUNDLE),
    });
    await controller.handle('update', { origin: 'http://localhost:8000' });
    expect(controller.getInfo()).toMatchObject({ pendingUpdateVersion: '99.0.0', restartRequired: true });
    await expect(controller.handle('update', { origin: 'http://localhost:8000' }))
      .resolves.toMatchObject({ updated: false, upToDate: false, restartRequired: true });
    expect(installImpl).toHaveBeenCalledOnce();
  });

  it('rejects an update without a verifiable version before installing anything', async () => {
    const installImpl = vi.fn();
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() }, bundlePath: '/tmp/getbased-companion.mjs',
      env: { GETBASED_COMPANION_SERVICE: '1' }, installImpl,
      fetchImpl: async () => new Response(VALID_BUNDLE.replace('99.0.0', 'unknown')),
    });
    await expect(controller.handle('update', { origin: 'http://localhost:8000' })).rejects.toThrow('verify');
    expect(installImpl).not.toHaveBeenCalled();
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
