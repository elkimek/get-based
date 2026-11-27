import type { CompanionRuntimeOptions } from './companion-install-support.js';
import type { HostControlAction } from './agent-host-turn-state.js';
// Authenticated companion management used by the loopback control endpoint.

import { chmodSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicKey, randomUUID, verify } from 'node:crypto';
import {
  installCompanion, runCompanionServiceCommand, uninstallCompanion,
} from './companion-install.js';
import { GETBASED_COMPANION_VERSION } from '../shared/agent-host-protocol.js';

const MAX_COMPANION_BUNDLE_BYTES = 250_000;
const RELEASE_UPDATE_PUBLIC_KEY = process.env.GETBASED_COMPANION_UPDATE_PUBLIC_KEY || '';

function companionBundleUrl() {
  // Never let the calling web page select executable update content.
  return 'https://app.getbased.health/getbased-companion.mjs';
}

async function readBoundedUpdate(response: Response, limit: number) {
  if (!response.ok) throw new Error(`Could not download the companion update (HTTP ${response.status}).`);
  const declaredBytes = Number(response.headers.get('Content-Length') || 0);
  if (Number.isFinite(declaredBytes) && declaredBytes > limit) {
    throw new Error('The companion update is unexpectedly large.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The companion update is empty.');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new Error('The companion update is unexpectedly large.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks, total);
  if (!bytes.byteLength || bytes.byteLength > limit) {
    throw new Error('The companion update is empty or unexpectedly large.');
  }
  return bytes;
}

function validateBundleSource(bytes: Buffer) {
  const source = new TextDecoder().decode(bytes);
  if (!source.startsWith('#!/usr/bin/env node\n')
    || !source.includes('getbased Companion')
    || !source.includes('getbased-agent-host')) {
    throw new Error('The downloaded file is not a getbased Companion bundle.');
  }
}

// Read the release version as data; never evaluate downloaded code.
function bundleVersion(bytes: Buffer) {
  const matches = [...bytes.toString('utf8').matchAll(/\bGETBASED_COMPANION_VERSION\s*=\s*(["'`])(\d+\.\d+\.\d+)\1(?=\s*[;,)])/g)];
  if (matches.length !== 1) throw new Error('Could not verify the Companion update version. Nothing was installed.');
  return matches[0]![2]!;
}

function newerVersion(candidate: string, current: string) {
  const next = candidate.split('.').map(Number);
  const previous = current.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    if (next[index] !== previous[index]) return next[index]! > previous[index]!;
  }
  return false;
}

export function createCompanionRuntimeController(options: CompanionRuntimeOptions) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const fetchImpl = options.fetchImpl || fetch;
  const installImpl = options.installImpl || installCompanion;
  const uninstallImpl = options.uninstallImpl || uninstallCompanion;
  const serviceCommandImpl = options.serviceCommandImpl || runCompanionServiceCommand;
  const scheduleImpl = options.scheduleImpl || setTimeout;
  let runtimeMode = String(env.GETBASED_COMPANION_SERVICE || '').trim() === '1' ? 'installed' : 'temporary';

  let pendingUpdateVersion = '';
  let restartStatus = '';
  const getInfo = () => ({
    restartRequired: Boolean(pendingUpdateVersion),
    restartStatus,
    ...(pendingUpdateVersion ? { pendingUpdateVersion } : {}),
    companionVersion: GETBASED_COMPANION_VERSION,
    runtimeMode,
    processMode: String(env.GETBASED_COMPANION_SERVICE || '').trim() === '1' ? 'service' : 'terminal',
    platform,
  });

  async function handle(action: HostControlAction, _context: { origin: string }) {
    if (action === 'restart') {
      await options.appServer.restart();
      await options.appServer.initialize();
      return { ...getInfo(), restarted: true };
    }
    if (action === 'restart-companion') {
      if (runtimeMode !== 'installed') {
        throw new Error('Start the companion automatically before restarting it from getbased.');
      }
      restartStatus = 'restarting';
      scheduleImpl(async () => {
        let listenerStopped = false;
        try {
          // A terminal process that just installed login startup must release
          // its listener before the installed service takes over the port.
          const handoff = String(env.GETBASED_COMPANION_SERVICE || '').trim() !== '1' && options.stopRuntime;
          if (handoff) {
            await options.stopRuntime!();
            listenerStopped = true;
          }
          serviceCommandImpl('restart', { env, platform });
          if (handoff) options.exitRuntime?.();
        }
        catch (error) {
          restartStatus = 'failed';
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
      pendingUpdateVersion = '';
      return { ...getInfo(), uninstalled: true };
    }
    if (action === 'update') {
      if (runtimeMode !== 'installed') throw new Error('Start the companion automatically before updating it.');
      const pinnedKey = env.GETBASED_COMPANION_UPDATE_PUBLIC_KEY || RELEASE_UPDATE_PUBLIC_KEY;
      if (!pinnedKey) throw new Error('This Companion has no trusted update signing key. See the official installation instructions.');
      const publicKey = createPublicKey(pinnedKey);
      if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('The Companion update key must use Ed25519.');
      const fetchOptions: RequestInit = {
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000),
      };
      const url = companionBundleUrl();
      const bytes = await readBoundedUpdate(await fetchImpl(url, fetchOptions), MAX_COMPANION_BUNDLE_BYTES);
      const signatureText = (await readBoundedUpdate(await fetchImpl(url + '.sig', fetchOptions), 256)).toString('ascii').trim();
      if (!/^[A-Za-z0-9+/]{86}==$/.test(signatureText) || !verify(null, bytes, publicKey, Buffer.from(signatureText, 'base64'))) {
        throw new Error('Could not verify the Companion update signature. No update was installed.');
      }
      validateBundleSource(bytes);
      const availableVersion = bundleVersion(bytes);
      // A local preview or pending update must never be replaced by the same
      // release or an older production bundle.
      if (!newerVersion(availableVersion, pendingUpdateVersion || GETBASED_COMPANION_VERSION)) {
        return { ...getInfo(), availableVersion, updated: false, upToDate: !pendingUpdateVersion };
      }
      const temporaryBundle = join(tmpdir(), `getbased-companion-update-${randomUUID()}.mjs`);
      try {
        writeFileSync(temporaryBundle, bytes, { mode: 0o700, flag: 'wx' });
        chmodSync(temporaryBundle, 0o700);
        installImpl({ bundlePath: temporaryBundle, env, platform, startService: false });
      } finally {
        rmSync(temporaryBundle, { force: true });
      }
      pendingUpdateVersion = availableVersion;
      return { ...getInfo(), updated: true, restartRequired: true };
    }
    throw new Error('Unsupported companion control action.');
  }

  return { getInfo, handle };
}
