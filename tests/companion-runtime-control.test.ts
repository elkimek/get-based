// @vitest-environment node

import type { CompanionRuntimeOptions } from '../lib/companion-install-support.js';
import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createCompanionRuntimeController } from '../lib/companion-runtime-control.js';
import { GETBASED_COMPANION_VERSION } from '../shared/agent-host-protocol.js';

type InstallImpl = NonNullable<CompanionRuntimeOptions['installImpl']>;
type RuntimeFetch = NonNullable<CompanionRuntimeOptions['fetchImpl']>;

const VALID_BUNDLE = '#!/usr/bin/env node\nconst title = "getbased Companion"; const service = "getbased-agent-host";\nconst GETBASED_COMPANION_VERSION = "99.0.0";\n';

const signingKey = generateKeyPairSync('ed25519');
const installedEnv = {
  GETBASED_COMPANION_SERVICE: '1',
  GETBASED_COMPANION_UPDATE_PUBLIC_KEY: signingKey.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
};
function signatureFor(body: string) {
  return sign(null, Buffer.from(body), signingKey.privateKey).toString('base64');
}
function signedFixture(body = VALID_BUNDLE): RuntimeFetch {
  return async url => new Response(url.endsWith('.sig') ? signatureFor(body) : body);
}

describe('running companion controls', () => {
  it('installs automatic startup from a temporary connection without starting a duplicate host', async () => {
    const installImpl = vi.fn<InstallImpl>(() => ({ installed: true }));
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
    let scheduled!: () => unknown;
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() },
      bundlePath: '/tmp/getbased-companion.mjs',
      env: installedEnv, platform: 'linux', serviceCommandImpl,
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
    const order: string[] = [];
    let scheduled!: () => unknown;
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

  it.each(['linux', 'darwin', 'win32'] as const)('restores the terminal listener after a failed %s service handoff', async platform => {
    let scheduled!: () => unknown;
    const order: string[] = [];
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
    const installImpl = vi.fn<InstallImpl>(() => ({ installed: true }));
    const fetchImpl = vi.fn<RuntimeFetch>(signedFixture());
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() },
      bundlePath: '/tmp/getbased-companion.mjs',
      env: installedEnv,
      platform: 'linux',
      installImpl,
      fetchImpl,
    });

    await expect(controller.handle('update', { origin: 'https://getbased.health' }))
      .resolves.toMatchObject({ updated: true, restartRequired: true, runtimeMode: 'installed' });
    expect(fetchImpl).toHaveBeenCalledWith('https://app.getbased.health/getbased-companion.mjs', expect.objectContaining({ cache: 'no-store', redirect: 'error' }));
    expect(installImpl).toHaveBeenCalledWith(expect.objectContaining({ platform: 'linux', startService: false }));
    await controller.handle('update', { origin: 'http://localhost:9999' });
    expect(new Set(fetchImpl.mock.calls.map(([url]) => url))).toEqual(new Set([
      'https://app.getbased.health/getbased-companion.mjs',
      'https://app.getbased.health/getbased-companion.mjs.sig',
    ]));
  });

  it.each([GETBASED_COMPANION_VERSION, '1.0.0'])('does not install the same or an older release (%s)', async version => {
    const installImpl = vi.fn<InstallImpl>();
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() }, bundlePath: '/tmp/getbased-companion.mjs',
      env: installedEnv, installImpl,
      fetchImpl: signedFixture(VALID_BUNDLE.replace('99.0.0', version)),
    });
    await expect(controller.handle('update', { origin: 'http://localhost:8000' }))
      .resolves.toMatchObject({ updated: false, upToDate: true, restartRequired: false });
    expect(installImpl).not.toHaveBeenCalled();
  });

  it('installs a newer release once and preserves the pending restart across status checks', async () => {
    const installImpl = vi.fn<InstallImpl>();
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() }, bundlePath: '/tmp/getbased-companion.mjs',
      env: installedEnv, installImpl,
      fetchImpl: signedFixture(),
    });
    await controller.handle('update', { origin: 'http://localhost:8000' });
    expect(controller.getInfo()).toMatchObject({ pendingUpdateVersion: '99.0.0', restartRequired: true });
    await expect(controller.handle('update', { origin: 'http://localhost:8000' }))
      .resolves.toMatchObject({ updated: false, upToDate: false, restartRequired: true });
    expect(installImpl).toHaveBeenCalledOnce();
  });

  it('rejects an update without a verifiable version before installing anything', async () => {
    const installImpl = vi.fn<InstallImpl>();
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() }, bundlePath: '/tmp/getbased-companion.mjs',
      env: installedEnv, installImpl,
      fetchImpl: signedFixture(VALID_BUNDLE.replace('99.0.0', 'unknown')),
    });
    await expect(controller.handle('update', { origin: 'http://localhost:8000' })).rejects.toThrow('verify');
    expect(installImpl).not.toHaveBeenCalled();
  });

  it('removes automatic startup without killing the response in flight', async () => {
    const uninstallImpl = vi.fn();
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() },
      bundlePath: '/tmp/getbased-companion.mjs',
      env: installedEnv,
      platform: 'linux',
      uninstallImpl,
    });
    await expect(controller.handle('uninstall', { origin: 'https://getbased.health' }))
      .resolves.toMatchObject({ uninstalled: true, runtimeMode: 'temporary' });
    expect(uninstallImpl).toHaveBeenCalledWith(expect.objectContaining({ platform: 'linux', stopService: false }));
  });
});


describe('companion update failure boundaries', () => {
  function setup(response: Response | null, overrides: Partial<CompanionRuntimeOptions> = {}, signature = signatureFor(VALID_BUNDLE)) {
    const installImpl = vi.fn<InstallImpl>();
    const { fetchImpl: download = async () => response as Response, ...options } = overrides;
    const controller = createCompanionRuntimeController({
      appServer: { restart: vi.fn(), initialize: vi.fn() }, bundlePath: '/tmp/unused.mjs',
      env: installedEnv, installImpl,
      fetchImpl: (url, init) => url.endsWith('.sig') ? Promise.resolve(new Response(signature)) : download(url, init), ...options,
    });
    return { controller, installImpl, update: () => controller.handle('update', { origin: 'https://app.test' }) };
  }
  it.each<[string, () => Response, string]>([
    ['HTTP failure', () => new Response('error', { status: 503 }), 'HTTP 503'],
    ['declared oversize', () => new Response('small', { headers: { 'content-length': '250001' } }), 'large'],
    ['streamed oversize', () => new Response('x'.repeat(250001)), 'large'],
    ['missing body', () => new Response(null), 'empty'],
    ['empty body', () => new Response(''), 'empty'],
    ['changed bundle bytes', () => new Response(VALID_BUNDLE + '// unexpected change'), 'signature'],
  ])('rejects %s before installing or changing runtime state', async (_label, response, message) => {
    const f = setup(response());
    await expect(f.update()).rejects.toThrow(message);
    expect(f.installImpl).not.toHaveBeenCalled();
    expect(f.controller.getInfo()).toMatchObject({ restartRequired: false, runtimeMode: 'installed' });
  });
  it('rejects an ambiguous release version after verifying its signature', async () => {
    const body = VALID_BUNDLE + 'const GETBASED_COMPANION_VERSION = "100.0.0";\n';
    const fixture = setup(new Response(body), {}, signatureFor(body));
    await expect(fixture.update()).rejects.toThrow('version');
    expect(fixture.installImpl).not.toHaveBeenCalled();
  });
  it('rejects a valid download when no trusted key is configured', async () => {
    const fetchImpl = vi.fn<RuntimeFetch>(signedFixture());
    const fixture = setup(null, { fetchImpl, env: { GETBASED_COMPANION_SERVICE: '1', GETBASED_COMPANION_UPDATE_PUBLIC_KEY: '' } });
    await expect(fixture.update()).rejects.toThrow('signing key');
    expect(fetchImpl).not.toHaveBeenCalled();
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
    let temporary!: string;
    const installImpl = vi.fn<InstallImpl>(({ bundlePath }) => {
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
    const fetchImpl = vi.fn<RuntimeFetch>().mockResolvedValueOnce(new Response(VALID_BUNDLE)).mockRejectedValueOnce(new Error('offline'));
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

it('refuses updates from a temporary companion without fetching or installing', async () => {
  const fetchImpl=vi.fn<RuntimeFetch>(),installImpl=vi.fn<InstallImpl>();
  const controller=createCompanionRuntimeController({appServer:{restart:vi.fn(),initialize:vi.fn()},bundlePath:'/tmp/getbased-companion.mjs',env:{},platform:'linux',fetchImpl,installImpl});
  await expect(controller.handle('update',{origin:'https://getbased.health'})).rejects.toThrow('Start the companion automatically');
  expect(fetchImpl).not.toHaveBeenCalled();expect(installImpl).not.toHaveBeenCalled();
  await expect(controller.handle('uninstall',{origin:'https://getbased.health'})).resolves.toMatchObject({uninstalled:true,runtimeMode:'temporary'});
});
