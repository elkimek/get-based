import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {execFileSync, spawn} from 'node:child_process';
import {expect, it} from 'vitest';
import {buildSelfHostPackage} from '../scripts/build-self-host-package.mjs';

it('installs the dependency-free tarball into an empty prefix and runs its portable CLI', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-packed-test-'));
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const artifact = path.join(temporary, 'artifact'); await fs.mkdir(path.join(artifact, 'app'), {recursive: true});
    for (const [name, value] of Object.entries({
      'index.html': '<!doctype html><title>Synthetic installed app</title>',
      'version.js': 'self.APP_VERSION="1.0.0";self.APP_BUILD_ID="' + 'a'.repeat(64) + '";',
      'service-worker.js': 'self.addEventListener("fetch",()=>{});',
      'build-metrics.json': JSON.stringify({static: true, buildId: 'a'.repeat(64)}),
      'app/migration.html': '<!doctype html><title>Synthetic recovery</title>',
    })) await fs.writeFile(path.join(artifact, name), value);
    const packaged = await buildSelfHostPackage({artifact, output: path.join(temporary, 'output')});
    expect(await fs.readFile(packaged.archive + '.sha256', 'utf8')).toContain(packaged.sha256);
    const prefix = path.join(temporary, 'installed'), npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFileSync(npm, ['install', '--global', '--prefix', prefix, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', packaged.archive], {encoding: 'utf8', shell: process.platform === 'win32'});
    const modules = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib/node_modules');
    const root = path.join(modules, 'getbased-self-host'), bin = path.join(root, 'bin/getbased.mjs');
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    expect(manifest.dependencies).toBeUndefined(); expect(manifest.scripts).toBeUndefined(); expect(manifest.bin).toEqual({getbased: 'bin/getbased.mjs'});
    expect(await fs.stat(path.join(prefix, process.platform === 'win32' ? 'getbased.cmd' : 'bin/getbased'))).toBeTruthy();
    expect(execFileSync(process.execPath, [bin, '--help'], {encoding: 'utf8'})).toContain('tailscale serve --bg');
    expect(execFileSync(process.execPath, [bin, '--version'], {encoding: 'utf8'}).trim()).toBe(manifest.version);
    const probe = net.createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as net.AddressInfo).port; await new Promise<void>(resolve => probe.close(() => resolve()));
    child = spawn(process.execPath, [bin], {env: {...process.env, GETBASED_SELF_HOST_PORT: String(port)}, stdio: ['ignore', 'pipe', 'pipe']});
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Installed server did not start.')), 10000);
      const ready = (data: Buffer) => {if (data.toString().includes('getbased is running')) {clearTimeout(timer); resolve();}};
      child!.stdout!.on('data', ready); child!.once('error', error => {clearTimeout(timer); reject(error);});
      child!.once('exit', code => {clearTimeout(timer); reject(new Error('Installed server exited: ' + code));});
    });
    const origin = 'http://127.0.0.1:' + port;
    const response = await fetch(origin + '/app'); expect(await response.text()).toContain('Synthetic installed app');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(await (await fetch(origin + '/app/migration.html')).text()).toContain('Synthetic recovery');
    expect((await fetch(origin + '/package.json')).status).toBe(404);
    expect((await fetch(origin + '/api/proxy', {method: 'POST', body: '{}'})).status).toBe(405);
  } finally {
    if (child && child.exitCode === null) {const exited = new Promise(resolve => child!.once('exit', resolve)); child.kill(); await exited;}
    await fs.rm(temporary, {recursive: true, force: true});
  }
}, 30000);
