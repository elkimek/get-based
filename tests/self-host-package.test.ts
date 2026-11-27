import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {afterEach, expect, it, vi} from 'vitest';
import {gunzipSync} from 'node:zlib';
import {buildSelfHostPackage} from '../scripts/build-self-host-package.mjs';
import {smokeInstalledSelfHost} from '../scripts/self-host-install-smoke.mjs';

it('installs the dependency-free tarball into an empty prefix and runs its portable CLI', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-packed-test-'));
  try {
    const artifact = path.join(temporary, 'artifact'); await fs.mkdir(path.join(artifact, 'app'), {recursive: true});
    for (const [name, value] of Object.entries({
      'index.html': '<!doctype html><title>Synthetic getbased installed app</title>',
      'version.js': 'self.APP_VERSION="1.0.0";self.APP_BUILD_ID="' + 'a'.repeat(64) + '";',
      'service-worker.js': 'self.addEventListener("fetch",()=>{});',
      'build-metrics.json': JSON.stringify({static: true, buildId: 'a'.repeat(64)}),
      'app/migration.html': '<!doctype html><title>Synthetic recovery</title><main id="migration-root"></main>',
    })) await fs.writeFile(path.join(artifact, name), value);
    const output = path.join(temporary, 'output'), packaged = await buildSelfHostPackage({artifact, output});
    expect(await fs.readFile(packaged.archive + '.sha256', 'utf8')).toContain(packaged.sha256);
    expect(await smokeInstalledSelfHost(output)).toMatchObject({status: 'passed', version: '1.0.0', files: 5});
  } finally {await fs.rm(temporary, {recursive: true, force: true});}
}, 30000);

afterEach(() => vi.restoreAllMocks());
it('reads the checked opened artifact even if its pathname is replaced before reading', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-package-race-'));
  try {
    const artifact = path.join(temporary, 'artifact'); await fs.mkdir(path.join(artifact, 'app'), {recursive: true});
    const original = '<!doctype html><title>Synthetic getbased original bytes</title>';
    for (const [name, value] of Object.entries({
      'index.html': original, 'version.js': 'self.APP_VERSION="1.0.0";', 'service-worker.js': 'self.addEventListener("fetch",()=>{});',
      'build-metrics.json': JSON.stringify({static: true, buildId: 'a'.repeat(64)}), 'app/migration.html': '<main id="migration-root"></main>',
    })) await fs.writeFile(path.join(artifact, name), value);
    const canary = path.join(temporary, 'private-canary.txt'), secret = 'Synthetic private canary must never enter the public package';
    await fs.writeFile(canary, secret);
    const nativeOpen = fs.open.bind(fs); let substituted = false;
    vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      const handle = await nativeOpen(...args);
      if (!substituted && args[0] === path.join(artifact, 'index.html')) {
        substituted = true;
        await fs.rename(path.join(artifact, 'index.html'), path.join(artifact, '.retained-index.html'));
        await fs.symlink(canary, path.join(artifact, 'index.html'));
      }
      return handle;
    });
    const result = await buildSelfHostPackage({artifact, output: path.join(temporary, 'output')});
    expect(substituted).toBe(true);
    const tar = gunzipSync(await fs.readFile(result.archive));
    expect(tar.includes(Buffer.from(original))).toBe(true); expect(tar.includes(Buffer.from(secret))).toBe(false);
  } finally {await fs.rm(temporary, {recursive: true, force: true});}
}, 30000);
