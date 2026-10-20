// Transport only portable generated siblings. Dependencies still install normally
// on each OS; the compiler/semantic gates run on the producer before sealing.
import assert from 'node:assert/strict';
import fs, {constants} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {brotliCompressSync, brotliDecompressSync, constants as zlibConstants} from 'node:zlib';
import type {withAppShellSnapshot as WithShell} from './app-shell-snapshot.mjs';
import type {withInlineThemeStyleSnapshot as WithThemes} from './inline-theme-style-snapshot.mjs';
import type {withLegalConsentSnapshot as WithLegal} from './legal-consent-snapshot.mjs';
// These preinstall helpers are canonical sources with no package dependencies.
const {withAppShellSnapshot}: {withAppShellSnapshot: typeof WithShell} = await import(new URL('./app-shell-snapshot.mts', import.meta.url).href);
const {withInlineThemeStyleSnapshot}: {withInlineThemeStyleSnapshot: typeof WithThemes} = await import(new URL('./inline-theme-style-snapshot.mts', import.meta.url).href);
const {withLegalConsentSnapshot}: {withLegalConsentSnapshot: typeof WithLegal} = await import(new URL('./legal-consent-snapshot.mts', import.meta.url).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRANSPORT = '.local-notes/ci/compiled';
interface Member {file: string; bytes: number; sha256: string}
interface CompiledManifest {schemaVersion: 1; revision: string; nodeMajor: number; inputs: Member[]; outputs: Member[]}
const hash = (body: Buffer) => createHash('sha256').update(body).digest('hex');
function portable(value: unknown): asserts value is string {
  assert(typeof value === 'string' && value.length > 0 && !/[\\\0\r\n]/.test(value)
    && !/^[A-Za-z]:/.test(value) && !path.posix.isAbsolute(value)
    && value.split('/').every(part => part && part !== '.' && part !== '..'), 'Canonical compiled member');
}
async function regular(file: string): Promise<Buffer> {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {assert((await handle.stat()).isFile(), 'Regular compiled member'); return await handle.readFile();}
  finally {await handle.close();}
}
async function safeDirectory(root: string, relative = ''): Promise<string> {
  assert.equal(await fs.realpath(root), path.resolve(root), 'No linked checkout root');
  let current = root;
  for (const part of relative.split('/').filter(Boolean)) {
    current = path.join(current, part);
    await fs.mkdir(current, {recursive: false}).catch((error: NodeJS.ErrnoException) => {if (error.code !== 'EEXIST') throw error;});
    assert((await fs.lstat(current)).isDirectory(), 'No linked output ancestor');
  }
  return current;
}
function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['--no-optional-locks', ...args], {cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
}
async function member(root: string, file: string): Promise<Member> {
  portable(file); const body = await regular(path.join(root, file));
  return {file, bytes: body.length, sha256: hash(body)};
}
function inputIdentity(file: string, body: Buffer): Member {
  // Only the existing compiler-owned shell, legal gate and two inline style bodies are
  // derived. Their owners validate unique boundaries and exact boot order;
  // every other HTML byte and every canonical source remain exact inputs.
  const authored = file === 'index.html'
    ? Buffer.from(withLegalConsentSnapshot(withAppShellSnapshot(withInlineThemeStyleSnapshot(body.toString('utf8'), '#main-content{}', ''), ''), '')) : body;
  return {file, bytes: authored.length, sha256: hash(authored)};
}
async function inputMember(root: string, file: string): Promise<Member> {
  portable(file); return inputIdentity(file, await regular(path.join(root, file)));
}
async function authoredInputs(root: string): Promise<Member[]> {
  const files = git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean).sort();
  // macOS runners can have a much lower open-file limit than Linux.
  const inputs: Member[] = [];
  for (let index = 0; index < files.length; index += 16) inputs.push(...await Promise.all(files.slice(index, index + 16).map(file => inputMember(root, file))));
  return inputs;
}
function outputAllowed(file: string, inputs: ReadonlySet<string>): boolean {
  if (file === 'index.html') return inputs.has(file);
  if (inputs.has(file)) return false;
  const runtime = file.replace(/\.map$/, '');
  if (/\.(?:js|mjs)$/.test(runtime) && inputs.has(runtime.replace(/\.mjs$/, '.mts').replace(/\.js$/, '.ts'))) return true;
  if (/\.svelte\.(?:native|html)\.js$/.test(runtime) && inputs.has(runtime.replace(/\.(?:native|html)\.js$/, ''))) return true;
  return /^(?:css\/[^/]+\.css|styles\.css|themes-extra\.css|js\/[^/]+\.generated\.(?:js|d\.ts))$/.test(file);
}
function validate(value: unknown): CompiledManifest {
  assert(value && typeof value === 'object', 'Compiled manifest');
  const manifest = value as CompiledManifest;
  assert.equal(manifest.schemaVersion, 1); assert.match(manifest.revision, /^[a-f0-9]{40}$/);
  assert.equal(manifest.nodeMajor, 24, 'Portable Node 24 output');
  for (const rows of [manifest.inputs, manifest.outputs]) {
    assert(Array.isArray(rows) && rows.length > 0, 'Nonempty compiled inventory');
    const names = new Set<string>();
    for (const row of rows) {
      portable(row.file); assert(!names.has(row.file), 'Unique compiled member'); names.add(row.file);
      assert(Number.isSafeInteger(row.bytes) && row.bytes >= 0, 'Exact compiled byte count'); assert.match(row.sha256, /^[a-f0-9]{64}$/);
    }
    assert.deepEqual(rows.map(row => row.file), [...names].sort(), 'Sorted compiled inventory');
  }
  const bytes = manifest.outputs.reduce((sum, output) => sum + output.bytes, 0);
  assert(Number.isSafeInteger(bytes) && bytes > 0 && bytes <= 1024 ** 3, 'Bounded portable compiler payload');
  const inputs = new Set(manifest.inputs.map(row => row.file));
  for (const row of manifest.outputs) assert(outputAllowed(row.file, inputs), 'Only compiler-owned outputs, never other authored/dependency files');
  return manifest;
}
export async function sealCompiledInputs(root = ROOT): Promise<CompiledManifest> {
  const transport = path.join(root, TRANSPORT), inputs = await authoredInputs(root), known = new Set(inputs.map(row => row.file));
  const candidates = new Set<string>();
  for (const file of known) {
    if (/\.(?:ts|mts)$/.test(file) && !/\.d\.[cm]?ts$/.test(file)) {
      const runtime = file.replace(/\.mts$/, '.mjs').replace(/\.ts$/, '.js'); candidates.add(runtime); candidates.add(runtime + '.map');
    }
    if (file.endsWith('.svelte')) for (const mode of ['native', 'html']) {candidates.add(file + '.' + mode + '.js'); candidates.add(file + '.' + mode + '.js.map');}
  }
  for (const directory of ['css', 'js']) {
    for (const entry of await fs.readdir(path.join(root, directory)).catch((error: NodeJS.ErrnoException) => {if (error.code === 'ENOENT') return []; throw error;})) candidates.add(directory + '/' + entry);
  }
  candidates.add('styles.css'); candidates.add('themes-extra.css'); candidates.add('index.html');
  const outputs: Member[] = [];
  for (const file of [...candidates].sort()) {
    if (!outputAllowed(file, known)) continue;
    const exists = await fs.lstat(path.join(root, file)).catch((error: NodeJS.ErrnoException) => {if (error.code === 'ENOENT') return null; throw error;});
    if (exists) outputs.push(await member(root, file));
  }
  const manifest = validate({schemaVersion: 1, revision: git(root, 'rev-parse', 'HEAD').trim(), nodeMajor: Number(process.versions.node.split('.')[0]), inputs, outputs});
  await safeDirectory(root, TRANSPORT);
  assert.equal((await fs.readdir(transport)).length, 0, 'Seal a new compiled transport');
  const bodies: Buffer[] = [];
  for (const output of outputs) {
    const body = await regular(path.join(root, output.file));
    assert.equal(hash(body), output.sha256, 'Stable output while sealing'); bodies.push(body);
  }
  await fs.writeFile(path.join(transport, 'payload.br'), brotliCompressSync(Buffer.concat(bodies), {params: {[zlibConstants.BROTLI_PARAM_QUALITY]: 4, [zlibConstants.BROTLI_PARAM_LGWIN]: 24}}), {flag: 'wx'});
  await fs.writeFile(path.join(transport, 'manifest.json'), JSON.stringify(manifest) + '\n', {flag: 'wx'});
  return manifest;
}
async function qualified(root: string) {
  const transport = path.join(root, TRANSPORT);
  assert.equal(await fs.realpath(transport), transport, 'No linked compiled transport');
  const manifest = validate(JSON.parse((await regular(path.join(transport, 'manifest.json'))).toString()));
  assert.equal(manifest.revision, git(root, 'rev-parse', 'HEAD').trim(), 'Exact compiled revision');
  assert.equal(Number(process.versions.node.split('.')[0]), manifest.nodeMajor, 'Exact compiler runtime major');
  assert.deepEqual(await authoredInputs(root), manifest.inputs, 'Exact current authored inputs');
  assert.deepEqual((await fs.readdir(transport)).sort(), ['manifest.json', 'payload.br'], 'Closed compiled transport');
  const bytes = manifest.outputs.reduce((sum, output) => sum + output.bytes, 0);
  assert(Number.isSafeInteger(bytes) && bytes > 0 && bytes <= 1024 ** 3, 'Bounded portable compiler payload');
  const payload = brotliDecompressSync(await regular(path.join(transport, 'payload.br')), {maxOutputLength: bytes});
  assert.equal(payload.length, bytes, 'Exact decompressed payload size');
  let offset = 0;
  for (const output of manifest.outputs) {
    const body = payload.subarray(offset, offset + output.bytes);
    assert.equal(hash(body), output.sha256, 'Exact compiled payload');
    if (output.file === 'index.html') assert.deepEqual(inputIdentity(output.file, body), manifest.inputs.find(row => row.file === output.file), 'Exact authored HTML outside generated sections');
    offset += output.bytes;
  }
  return {manifest, payload};
}
export async function restoreCompiledInputs(root = ROOT): Promise<CompiledManifest> {
  // Prequalify the complete payload and every input before replacing any output.
  const {manifest, payload} = await qualified(root);
  let offset = 0;
  for (const output of manifest.outputs) {
    await safeDirectory(root, path.posix.dirname(output.file));
    const target = path.join(root, output.file);
    // Open without truncating; qualify and write the same object. A pathname
    // swap cannot redirect the write, and hard links cannot clobber source data.
    const handle = await fs.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      .catch((error: NodeJS.ErrnoException) => {if (error.code === 'ELOOP') throw new Error('No linked output target'); throw error;});
    try {
      const info = await handle.stat(); assert(info.isFile() && info.nlink === 1, 'No linked output target');
      await handle.truncate(0); await handle.writeFile(payload.subarray(offset, offset + output.bytes));
    } finally {await handle.close();}
    offset += output.bytes;
  }
  return manifest;
}
export async function verifyCompiledInputs(root = ROOT): Promise<CompiledManifest> {
  const {manifest} = await qualified(root);
  for (const output of manifest.outputs) assert.deepEqual(await member(root, output.file), output, 'Exact restored compiler output');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const operations = {seal: sealCompiledInputs, restore: restoreCompiledInputs, verify: verifyCompiledInputs};
  const mode = process.argv[2]; assert(mode && Object.hasOwn(operations, mode) && process.argv.length === 3, 'Use seal, restore or verify');
  const manifest = await operations[mode as keyof typeof operations]();
  console.log(JSON.stringify({mode, revision: manifest.revision, outputs: manifest.outputs.length}));
}
