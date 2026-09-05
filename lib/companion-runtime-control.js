// @ts-check
// Authenticated companion management used by the loopback control endpoint.

import { chmodSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  installCompanion, runCompanionServiceCommand, uninstallCompanion,
} from './companion-install.js';
import { GETBASED_COMPANION_VERSION } from '../shared/agent-host-protocol.js';

const MAX_COMPANION_BUNDLE_BYTES = 250_000;

/** @param {string} origin */
function companionBundleUrl(origin) {
  const url = new URL('/getbased-companion.mjs', origin);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Companion updates require HTTPS or a loopback development site.');
  }
  return url.href;
}

/** @param {Response} response */
async function readVerifiedBundle(response) {
  if (!response.ok) throw new Error(`Could not download the companion update (HTTP ${response.status}).`);
  const declaredBytes = Number(response.headers.get('Content-Length') || 0);
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_COMPANION_BUNDLE_BYTES) {
    throw new Error('The companion update is unexpectedly large.');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_COMPANION_BUNDLE_BYTES) {
    throw new Error('The companion update is empty or unexpectedly large.');
  }
  const source = new TextDecoder().decode(bytes);
  if (!source.startsWith('#!/usr/bin/env node\n')
    || !source.includes('getbased Companion')
    || !source.includes('getbased-agent-host')) {
    throw new Error('The downloaded file is not a getbased Companion bundle.');
  }
  return bytes;
}

/**
 * @param {{
 *   appServer: {restart: () => Promise<unknown>, initialize: () => Promise<unknown>},
 *   bundlePath: string,
 *   env?: NodeJS.ProcessEnv,
 *   platform?: NodeJS.Platform,
 *   fetchImpl?: typeof fetch,
 *   installImpl?: typeof installCompanion,
 *   uninstallImpl?: typeof uninstallCompanion,
 *   serviceCommandImpl?: typeof runCompanionServiceCommand,
 *   scheduleImpl?: (callback: () => void, delay: number) => unknown,
 * }} options
 */
export function createCompanionRuntimeController(options) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const fetchImpl = options.fetchImpl || fetch;
  const installImpl = options.installImpl || installCompanion;
  const uninstallImpl = options.uninstallImpl || uninstallCompanion;
  const serviceCommandImpl = options.serviceCommandImpl || runCompanionServiceCommand;
  const scheduleImpl = options.scheduleImpl || setTimeout;
  let runtimeMode = String(env.GETBASED_COMPANION_SERVICE || '').trim() === '1' ? 'installed' : 'temporary';

  const getInfo = () => ({
    companionVersion: GETBASED_COMPANION_VERSION,
    runtimeMode,
    platform,
  });

  /** @param {'install'|'restart'|'restart-companion'|'update'|'uninstall'} action @param {{origin: string}} context */
  async function handle(action, context) {
    if (action === 'restart') {
      await options.appServer.restart();
      await options.appServer.initialize();
      return { ...getInfo(), restarted: true };
    }
    if (action === 'restart-companion') {
      if (runtimeMode !== 'installed') {
        throw new Error('Start the companion automatically before restarting it from getbased.');
      }
      scheduleImpl(() => {
        try { serviceCommandImpl('restart', { env, platform }); }
        catch (error) {
          process.stderr.write(`getbased Companion restart failed: ${error instanceof Error ? error.message : String(error)}\n`);
        }
      }, 300);
      return { ...getInfo(), restarting: true };
    }
    if (action === 'install') {
      installImpl({ bundlePath: options.bundlePath, env, platform, startService: false });
      runtimeMode = 'installed';
      return { ...getInfo(), installed: true };
    }
    if (action === 'uninstall') {
      if (runtimeMode !== 'installed') return { ...getInfo(), uninstalled: true };
      uninstallImpl({ env, platform, stopService: false });
      runtimeMode = 'temporary';
      return { ...getInfo(), uninstalled: true };
    }
    if (action === 'update') {
      if (runtimeMode !== 'installed') throw new Error('Start the companion automatically before updating it.');
      const response = await fetchImpl(companionBundleUrl(context.origin), { cache: 'no-store' });
      const bytes = await readVerifiedBundle(response);
      const temporaryBundle = join(tmpdir(), `getbased-companion-update-${randomUUID()}.mjs`);
      try {
        writeFileSync(temporaryBundle, bytes, { mode: 0o700, flag: 'wx' });
        chmodSync(temporaryBundle, 0o700);
        installImpl({ bundlePath: temporaryBundle, env, platform, startService: false });
      } finally {
        rmSync(temporaryBundle, { force: true });
      }
      return { ...getInfo(), updated: true, restartRequired: true };
    }
    throw new Error('Unsupported companion control action.');
  }

  return { getInfo, handle };
}
