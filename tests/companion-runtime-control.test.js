// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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


describe('companion update failure boundaries', () => {
  function setup(response, overrides = {}) {
    const installImpl = vi.fn();
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() }, bundlePath: '/tmp/unused.mjs',
      env: { GETBASED_COMPANION_SERVICE: '1' }, installImpl,
      fetchImpl: vi.fn().mockResolvedValue(response), ...overrides,
    });
    return { controller, installImpl, update: () => controller.handle('update', { origin: 'https://app.test' }) };
  }
  it.each([
    ['HTTP failure', () => new Response('error', { status: 503 }), 'HTTP 503'],
    ['declared oversize', () => new Response('small', { headers: { 'content-length': '250001' } }), 'large'],
    ['streamed oversize', () => new Response('x'.repeat(250001)), 'large'],
    ['missing body', () => new Response(null), 'empty'],
    ['empty body', () => new Response(''), 'empty'],
    ['invalid signature', () => new Response('untrusted code'), 'not a getbased'],
    ['ambiguous version', () => new Response(VALID_BUNDLE + 'const GETBASED_COMPANION_VERSION = "100.0.0";\n'), 'verify'],
  ])('rejects %s before installing or changing runtime state', async (_label, response, message) => {
    const f = setup(response());
    await expect(f.update()).rejects.toThrow(message);
    expect(f.installImpl).not.toHaveBeenCalled();
    expect(f.controller.getInfo()).toMatchObject({ restartRequired: false, runtimeMode: 'installed' });
  });
  it('cancels an oversized stream rather than downloading the remaining data', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(250001)); }, cancel,
    }));
    const f = setup(response);
    await expect(f.update()).rejects.toThrow('large');
    expect(cancel).toHaveBeenCalledOnce();
    expect(f.installImpl).not.toHaveBeenCalled();
  });
  it('propagates transport failures without publishing an update', async () => {
    const f = setup(null, { fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) });
    await expect(f.update()).rejects.toThrow('offline');
    expect(f.installImpl).not.toHaveBeenCalled();
    expect(f.controller.getInfo().restartRequired).toBe(false);
  });
  it('removes the temporary bundle after installation failure and permits retry', async () => {
    let temporary;
    const installImpl = vi.fn(({ bundlePath }) => {
      temporary = bundlePath;
      expect(readFileSync(bundlePath, 'utf8')).toBe(VALID_BUNDLE);
      throw new Error('disk full');
    });
    const f = setup(null, { installImpl, fetchImpl: async () => new Response(VALID_BUNDLE) });
    await expect(f.update()).rejects.toThrow('disk full');
    expect(existsSync(temporary)).toBe(false);
    expect(f.controller.getInfo().restartRequired).toBe(false);
    installImpl.mockImplementation(({ bundlePath }) => { temporary = bundlePath; });
    await expect(f.update()).resolves.toMatchObject({ pendingUpdateVersion: '99.0.0' });
    expect(existsSync(temporary)).toBe(false);
  });
  it('preserves a pending update when a later download fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(VALID_BUNDLE)).mockRejectedValueOnce(new Error('offline'));
    const f = setup(null, { fetchImpl });
    await f.update();
    await expect(f.update()).rejects.toThrow('offline');
    expect(f.controller.getInfo()).toMatchObject({ restartRequired: true, pendingUpdateVersion: '99.0.0' });
    expect(f.installImpl).toHaveBeenCalledOnce();
  });
  it('does not initialize a client whose restart failed', async () => {
    const appServer = { restart: vi.fn().mockRejectedValue(new Error('restart failed')), initialize: vi.fn() };
    const f = setup(null, { appServer });
    await expect(f.controller.handle('restart', { origin: '' })).rejects.toThrow('restart failed');
    expect(appServer.initialize).not.toHaveBeenCalled();
  });
});
