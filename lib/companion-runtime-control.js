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

function companionBundleUrl() {
  // Never let the calling web page select executable update content.
  return 'https://app.getbased.health/getbased-companion.mjs';
}

/** @param {Response} response */
async function readVerifiedBundle(response) {
  if (!response.ok) throw new Error(`Could not download the companion update (HTTP ${response.status}).`);
  const declaredBytes = Number(response.headers.get('Content-Length') || 0);
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_COMPANION_BUNDLE_BYTES) {
    throw new Error('The companion update is unexpectedly large.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The companion update is empty.');
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_COMPANION_BUNDLE_BYTES) throw new Error('The companion update is unexpectedly large.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks, total);
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
 *   stopRuntime?: () => Promise<void>,
 *   recoverRuntime?: () => Promise<void>,
 *   exitRuntime?: () => void,
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
    processMode: String(env.GETBASED_COMPANION_SERVICE || '').trim() === '1' ? 'service' : 'terminal',
    platform,
  });

  /** @param {'install'|'restart'|'restart-companion'|'update'|'uninstall'} action @param {{origin: string}} _context */
  async function handle(action, _context) {
    if (action === 'restart') {
      await options.appServer.restart();
      await options.appServer.initialize();
      return { ...getInfo(), restarted: true };
    }
    if (action === 'restart-companion') {
      if (runtimeMode !== 'installed') {
        throw new Error('Start the companion automatically before restarting it from getbased.');
      }
      scheduleImpl(async () => {
        let listenerStopped = false;
        try {
          // A terminal process that just installed login startup must release
          // its listener before the installed service takes over the port.
          const handoff = String(env.GETBASED_COMPANION_SERVICE || '').trim() !== '1' && options.stopRuntime;
          if (handoff) {
            await options.stopRuntime();
            listenerStopped = true;
          }
          serviceCommandImpl('restart', { env, platform });
          if (handoff) options.exitRuntime?.();
        }
        catch (error) {
          process.stderr.write(`getbased Companion restart failed: ${error instanceof Error ? error.message : String(error)}\n`);
          if (listenerStopped) {
            try { await options.recoverRuntime?.(); }
            catch (recoveryError) {
              process.stderr.write(`getbased Companion recovery failed: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}\n`);
            }
          }
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
      const response = await fetchImpl(companionBundleUrl(), {
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000),
      });
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
