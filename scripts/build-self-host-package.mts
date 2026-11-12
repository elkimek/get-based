#!/usr/bin/env node
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'rolldown';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
async function readPublicArtifactFile(file: string): Promise<Buffer> {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('A self-host package requires regular files without hard links.');
    return await handle.readFile();
  } finally {await handle.close();}
}

export async function buildSelfHostPackage(options: {artifact?: string; output?: string} = {}) {
  const artifact = await fs.realpath(path.resolve(ROOT, options.artifact ?? 'dist'));
  const metrics = JSON.parse(await fs.readFile(path.join(artifact, 'build-metrics.json'), 'utf8')) as {static?: unknown; buildId?: unknown; revision?: unknown};
  if (metrics.static !== true || typeof metrics.buildId !== 'string' || !/^[a-f0-9]{64}$/.test(metrics.buildId)) throw new Error('Package a qualified production artifact first.');
  for (const file of ['index.html', 'app/migration.html', 'version.js', 'service-worker.js']) {
    if (!(await fs.lstat(path.join(artifact, file))).isFile()) throw new Error('The production artifact is incomplete.');
  }
  const versionBody = await fs.readFile(path.join(artifact, 'version.js'), 'utf8');
  const versionMatches = [...versionBody.matchAll(/\bAPP_VERSION\s*=\s*['"](\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)['"]/g)];
  if (versionMatches.length !== 1) throw new Error('The app version is missing or ambiguous.');
  const version = versionMatches[0]![1]!;
  const original = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')) as {version: string; engines: {node: string}};
  const output = path.resolve(ROOT, options.output ?? 'artifacts'); await fs.mkdir(output, {recursive: true});
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-self-host-package-'));
  try {
    const directory = path.join(temporary, 'package'); await fs.mkdir(directory);
    const files: Array<{file: string; sha256: string; bytes: number}> = [];
    async function copy(relative = ''): Promise<void> {
      for (const entry of await fs.readdir(path.join(artifact, relative), {withFileTypes: true})) {
        if (entry.name.startsWith('.') && !(relative === '' && entry.name === '.well-known')) throw new Error('Private file in public artifact.');
        const name = relative ? relative + '/' + entry.name : entry.name, source = path.join(artifact, name);
        if (entry.isSymbolicLink()) throw new Error('A self-host package cannot contain symlinks.');
        if (entry.isDirectory()) await copy(name);
        else if (entry.isFile()) {
          const body = await readPublicArtifactFile(source), target = path.join(directory, 'dist', name);
          await fs.mkdir(path.dirname(target), {recursive: true}); await fs.writeFile(target, body);
          files.push({file: 'dist/' + name.replaceAll(path.sep, '/'), sha256: createHash('sha256').update(body).digest('hex'), bytes: body.length});
        } else throw new Error('Unsupported public artifact file.');
      }
    }
    await copy();
    await build({input: path.join(ROOT, 'server/self-host-server.js'), platform: 'node', external: id => id.startsWith('node:'),
      output: {dir: path.join(directory, 'bin'), format: 'es', codeSplitting: false, entryFileNames: 'getbased.mjs', banner: '#!/usr/bin/env node', minify: true}});
    await fs.chmod(path.join(directory, 'bin/getbased.mjs'), 0o755);
    await fs.copyFile(path.join(ROOT, 'LICENSE'), path.join(directory, 'LICENSE'));
    const deployment = JSON.parse(await fs.readFile(path.join(ROOT, 'vercel.json'), 'utf8')) as {routes: Array<{headers?: Record<string, string>}>};
    const headerNames = ['Content-Security-Policy', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Cross-Origin-Opener-Policy', 'Cross-Origin-Embedder-Policy'];
    const headers = Object.fromEntries(headerNames.map(name => [name, deployment.routes.map(route => route.headers?.[name]).find(Boolean)]));
    if (Object.values(headers).some(value => typeof value !== 'string')) throw new Error('Missing production security headers.');
    await fs.writeFile(path.join(directory, 'vercel.json'), JSON.stringify({routes: [{headers}]}));
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({name: 'getbased-self-host', version, private: true,
      description: 'Prebuilt getbased app and private loopback server', type: 'module', license: 'AGPL-3.0-only',
      engines: original.engines, bin: {getbased: 'bin/getbased.mjs'}, files: ['bin', 'dist', 'vercel.json', 'artifact-manifest.json', 'LICENSE', 'README.md']}, null, 2) + '\n');
    await fs.writeFile(path.join(directory, 'artifact-manifest.json'), JSON.stringify({schemaVersion: 1, buildId: metrics.buildId, revision: metrics.revision, files: files.sort((a,b) => a.file.localeCompare(b.file))}, null, 2) + '\n');
    await fs.writeFile(path.join(directory, 'README.md'), '# getbased self-host package\n\nRequires Node.js 24.20 or later within version 24. Run `getbased`, keep it running, then use `tailscale serve --bg http://127.0.0.1:8000` in another terminal for private HTTPS.\n\nChoose the HTTPS address before restoring. Each browser has its own data. Installation, updates and uninstalling this package do not export browser data. Keep a verified migration file.\n\nSee https://docs.getbased.health/guides/self-hosting for installation and recovery. The corresponding AGPL source is available from https://github.com/elkimek/get-based (release revision: ' + String(metrics.revision ?? 'local development build') + ').\n');
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const packed = JSON.parse(execFileSync(npm, ['pack', directory, '--pack-destination', output, '--json', '--ignore-scripts'], {encoding: 'utf8', shell: process.platform === 'win32'})) as Array<{filename: string}>;
    if (packed.length !== 1 || !packed[0]?.filename || path.basename(packed[0].filename) !== packed[0].filename) throw new Error('Unexpected package output.');
    const archive = path.join(output, packed[0].filename), bytes = await fs.readFile(archive), sha256 = createHash('sha256').update(bytes).digest('hex');
    await fs.writeFile(archive + '.sha256', sha256 + '  ' + path.basename(archive) + '\n');
    return {archive, sha256, bytes: bytes.length, buildId: metrics.buildId};
  } finally {await fs.rm(temporary, {recursive: true, force: true});}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = (name: string) => {const index = process.argv.indexOf(name); if (index < 0) return undefined; const value = process.argv[index+1]; if (!value || value.startsWith('--')) throw new Error(name + ' requires a path.'); return value;};
  const artifact = option('--artifact'), output = option('--output');
  console.log(JSON.stringify(await buildSelfHostPackage({...artifact ? {artifact} : {}, ...output ? {output} : {}}), null, 2));
}
