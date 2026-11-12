import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {expect, it} from 'vitest';
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
