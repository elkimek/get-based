#!/usr/bin/env node
// Test only a downloaded release package in an owned temporary prefix.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export async function smokeInstalledSelfHost(directory: string) {
  const archives = (await fs.readdir(directory)).filter(file => /^getbased-self-host-.*\.tgz$/.test(file));
  assert.equal(archives.length, 1, 'One exact release package');
  const archive = path.join(directory, archives[0]!), expected = (await fs.readFile(archive + '.sha256', 'utf8')).trim().split(/\s+/);
  assert.equal(expected[1], path.basename(archive), 'Checksum names this package');
  assert.equal(createHash('sha256').update(await fs.readFile(archive)).digest('hex'), expected[0], 'Release tarball checksum');
  const prefix = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-release-install-'));
  let child: ReturnType<typeof spawn> | undefined;
  try {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--global', '--prefix', prefix,
      '--cache', path.join(prefix, 'npm-cache'), '--offline', '--ignore-scripts', '--no-audit', '--no-fund', archive], {stdio: 'pipe', shell: process.platform === 'win32'});
    const modules = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib/node_modules');
    const root = path.join(modules, 'getbased-self-host'), bin = path.join(root, 'bin/getbased.mjs');
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as {version: string; dependencies?: unknown; scripts?: unknown};
    assert.equal(manifest.dependencies, undefined, 'No production install dependencies'); assert.equal(manifest.scripts, undefined, 'No install scripts');
    assert((await fs.stat(path.join(prefix, process.platform === 'win32' ? 'getbased.cmd' : 'bin/getbased'))).isFile(), 'Actual npm command shim');
    assert.equal(execFileSync(process.execPath, [bin, '--version'], {encoding: 'utf8'}).trim(), manifest.version);
    assert.match(execFileSync(process.execPath, [bin, '--help'], {encoding: 'utf8'}), /tailscale serve --bg/);
    const inventory = JSON.parse(await fs.readFile(path.join(root, 'artifact-manifest.json'), 'utf8')) as {files: Array<{file: string; sha256: string; bytes: number}>};
    for (const file of inventory.files) {
      assert(file.file.startsWith('dist/') && file.file.split('/').every(part => part && part !== '..' && part !== '.'), 'Public artifact path');
      const body = await fs.readFile(path.join(root, file.file)); assert.equal(body.length, file.bytes);
      assert.equal(createHash('sha256').update(body).digest('hex'), file.sha256, 'Exact installed artifact body');
    }
    const probe = net.createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as net.AddressInfo).port; await new Promise<void>(resolve => probe.close(() => resolve()));
    child = spawn(process.execPath, [bin], {env: {...process.env, GETBASED_SELF_HOST_PORT: String(port)}, stdio: ['ignore', 'pipe', 'pipe']});
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Installed server startup timed out.')), 10000);
      child!.stdout!.on('data', (data: Buffer) => {if (data.toString().includes('getbased is running')) {clearTimeout(timer); resolve();}});
      child!.once('error', error => {clearTimeout(timer); reject(error);}); child!.once('exit', code => {clearTimeout(timer); reject(new Error('Installed server exited: ' + code));});
    });
    const origin = 'http://127.0.0.1:' + port, response = await fetch(origin + '/app');
    assert.equal(response.status, 200); assert.match(await response.text(), /getbased/i); assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
    const recovery = await fetch(origin + '/app/migration.html'); assert.equal(recovery.status, 200); assert.match(await recovery.text(), /migration-root/);
    assert.equal((await fetch(origin + '/package.json')).status, 404); assert.equal((await fetch(origin + '/api/proxy', {method: 'POST', body: '{}'})).status, 405);
    return {platform: process.platform, node: process.versions.node, version: manifest.version, files: inventory.files.length, status: 'passed'};
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {const exited = new Promise(resolve => child!.once('exit', resolve)); child.kill(); await exited;}
    await fs.rm(prefix, {recursive: true, force: true});
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Supply the directory containing the package and checksum.');
  console.log(JSON.stringify(await smokeInstalledSelfHost(path.resolve(process.argv[2])), null, 2));
}
