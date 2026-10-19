import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (body: Uint8Array): string => createHash('sha256').update(body).digest('hex');
interface FileIdentity {file: string; bytes: number; sha256: string}
interface ArtifactManifest {
  schemaVersion: 1; revision: string; buildId: string; verificationDigest: string; producerRoot: string;
  sourceInputCount: number; catalog: {bytes: number; sha256: string}; files: FileIdentity[];
}
export interface CIArtifactOptions {root?: string; artifact: string; transport: string}
function portable(file: unknown): asserts file is string {
  assert(typeof file === 'string' && file.length > 0 && !file.includes('\\') && !file.includes('\0')
    && !path.posix.isAbsolute(file) && !/^[A-Za-z]:/.test(file)
    && file.split('/').every(part => part && part !== '.' && part !== '..'), 'Canonical relative artifact member');
}
function producerRoot(value: unknown): asserts value is string {
  assert(typeof value === 'string' && value.length > 1 && value.length <= 4096
    && !/[\\\0\r\n]/.test(value) && path.posix.isAbsolute(value)
    && path.posix.normalize(value) === value && !value.endsWith('/'), 'Canonical private artifact producer root');
}
function digest(value: unknown): asserts value is string {assert(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'SHA-256 identity');}
function count(value: unknown): asserts value is number {assert(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, 'Nonnegative exact byte count');}
function paths(options: CIArtifactOptions) {
  const root = path.resolve(options.root ?? ROOT), artifact = path.resolve(root, options.artifact), transport = path.resolve(root, options.transport);
  assert(artifact !== root && artifact.startsWith(root + path.sep), 'Artifact is a dedicated checkout child');
  assert(transport.startsWith(path.join(root, '.local-notes') + path.sep), 'Transport stays in ignored local notes');
  assert(!transport.startsWith(artifact + path.sep) && !artifact.startsWith(transport + path.sep) && artifact !== transport, 'Artifact and transport are disjoint');
  return {root, artifact, transport};
}
async function regular(file: string): Promise<Buffer> {
  // Validate and consume the same opened object; a pathname replacement cannot
  // redirect the read after qualification. NONBLOCK also avoids hanging on FIFOs.
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {assert((await handle.stat()).isFile(), 'Regular non-symlink file: ' + file); return await handle.readFile();}
  finally {await handle.close();}
}
async function directory(file: string): Promise<void> {
  assert((await fs.lstat(file)).isDirectory(), 'Regular non-symlink directory: ' + file);
  assert.equal(await fs.realpath(file), path.resolve(file), 'No linked artifact directory ancestors');
}
async function createTransportDirectory(root: string, target: string): Promise<void> {
  await directory(root);
  let current = root;
  for (const part of path.relative(root, target).split(path.sep)) {
    current = path.join(current, part);
    try {await fs.mkdir(current, {mode: 0o700});}
    catch (error) {if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;}
    await directory(current);
  }
}
export async function inventoryCIArtifact(artifact: string): Promise<FileIdentity[]> {
  await directory(artifact);
  const files: FileIdentity[] = [];
  async function visit(relative: string): Promise<void> {
    for (const entry of await fs.readdir(path.join(artifact, relative), {withFileTypes: true})) {
      const file = relative ? relative + '/' + entry.name : entry.name;
      portable(file);
      assert(!entry.isSymbolicLink(), 'No linked artifact member: ' + file);
      if (entry.isDirectory()) await visit(file);
      else {assert(entry.isFile(), 'Only regular artifact files'); const body = await regular(path.join(artifact, file)); files.push({file, bytes: body.length, sha256: hash(body)});}
    }
  }
  await visit('');
  assert(files.length > 0, 'Nonempty artifact inventory');
  return files.sort((left, right) => left.file.localeCompare(right.file, 'en'));
}
function validateManifest(value: unknown): ArtifactManifest {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Artifact transport manifest');
  const manifest = value as ArtifactManifest;
  assert.equal(manifest.schemaVersion, 1, 'Known transport schema'); producerRoot(manifest.producerRoot);
  assert(typeof manifest.revision === 'string' && /^[a-f0-9]{40}$/.test(manifest.revision), 'Full source revision');
  digest(manifest.buildId); digest(manifest.verificationDigest); count(manifest.sourceInputCount); assert(manifest.sourceInputCount > 0, 'Nonempty authored source inventory');
  assert(manifest.catalog && typeof manifest.catalog === 'object', 'Qualified catalog'); count(manifest.catalog.bytes); digest(manifest.catalog.sha256);
  assert(Array.isArray(manifest.files) && manifest.files.length > 0, 'Complete artifact inventory');
  const names = new Set<string>();
  for (const file of manifest.files) {portable(file.file); count(file.bytes); digest(file.sha256); assert(!names.has(file.file), 'Unique artifact member'); names.add(file.file);}
  return manifest;
}
function revision(root: string): string {
  const value = execFileSync('git', ['--no-optional-locks', 'rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
  assert(/^[a-f0-9]{40}$/.test(value), 'Full checkout revision'); return value;
}
async function metadata(artifact: string): Promise<Pick<ArtifactManifest, 'revision' | 'buildId' | 'verificationDigest' | 'sourceInputCount'>> {
  const metrics = JSON.parse((await regular(path.join(artifact, 'build-metrics.json'))).toString()) as ArtifactManifest & {framework: string; static: boolean};
  assert.equal(metrics.framework, 'SvelteKit 3 / Svelte 5'); assert.equal(metrics.static, true);
  assert(typeof metrics.revision === 'string' && /^[a-f0-9]{40}$/.test(metrics.revision)); digest(metrics.buildId); digest(metrics.verificationDigest); count(metrics.sourceInputCount); assert(metrics.sourceInputCount > 0);
  const version = (await regular(path.join(artifact, 'version.js'))).toString();
  const worker = (await regular(path.join(artifact, 'service-worker.js'))).toString();
  assert.equal([...version.matchAll(/self\.APP_BUILD_ID = '([a-f0-9]{64})';/g)].length, 1, 'Unique document build identity');
  assert(version.includes(`self.APP_BUILD_ID = '${metrics.buildId}';`), 'Document build identity');
  assert.equal([...worker.matchAll(/const BUILD_ID = '([a-f0-9]{64})';/g)].length, 1, 'Unique worker build identity');
  assert(worker.includes(`const BUILD_ID = '${metrics.buildId}';`), 'Worker build identity');
  await regular(path.join(artifact, 'index.html'));
  return {revision: metrics.revision, buildId: metrics.buildId, verificationDigest: metrics.verificationDigest, sourceInputCount: metrics.sourceInputCount};
}
async function currentSources(root: string, artifact: string, manifest: Pick<ArtifactManifest, 'revision' | 'verificationDigest' | 'sourceInputCount'>): Promise<void> {
  // These emitted dependencies are deliberately loaded only AFTER installation.
  // restore needs only Node builtins and works in a pristine checkout.
  const [{createStaticBuildFingerprint}, {inlineServiceWorkerAssets}, {parseAppShellEntries}] = await Promise.all([
    import('./static-build-inputs.mjs'), import('./service-worker-source.js'), import('./app-shell-budget.mjs'),
  ]);
  const inventory = execFileSync('git', ['--no-optional-locks', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {cwd: root, encoding: 'utf8'}).split('\0');
  const current = await createStaticBuildFingerprint(root, manifest.revision, '', inventory);
  assert.equal(current.verificationDigest, manifest.verificationDigest, 'Exact current authored source fingerprint');
  assert.equal(current.sourceFiles.length, manifest.sourceInputCount, 'Exact current authored source inventory');
  const metadataFiles = ['robots.txt', 'sitemap.xml', ...(await inventoryCIArtifact(path.join(root, '.well-known'))).map(file => '.well-known/' + file.file)];
  for (const file of metadataFiles) assert.deepEqual(await regular(path.join(artifact, file)), await regular(path.join(root, file)), 'Exact copied discovery metadata: ' + file);
  const nativeWorker = inlineServiceWorkerAssets((await regular(path.join(root, 'service-worker.js'))).toString(), (await regular(path.join(root, 'service-worker-assets.js'))).toString());
  const shipping = new Set(parseAppShellEntries((await regular(path.join(artifact, 'service-worker.js'))).toString()));
  const assembled = new Set(['/app', '/index.html', '/version.js', '/service-worker-assets.js', '/getbased-companion.mjs']);
  for (const url of parseAppShellEntries(nativeWorker)) {
    if (assembled.has(url) || (url.startsWith('/js/') && !shipping.has(url))) continue;
    assert(url.startsWith('/'), 'Absolute app shell URL'); portable(url.slice(1));
    assert.deepEqual(await regular(path.join(artifact, url.slice(1))), await regular(path.join(root, url.slice(1))), 'Exact copied public body: ' + url);
  }
}
async function readTransport(options: CIArtifactOptions) {
  const resolved = paths(options); await directory(resolved.transport);
  const manifest = validateManifest(JSON.parse((await regular(path.join(resolved.transport, 'manifest.json'))).toString()));
  assert.equal(manifest.revision, revision(resolved.root), 'Transport revision matches checkout');
  const catalog = await regular(path.join(resolved.transport, 'catalog.json'));
  assert.equal(catalog.length, manifest.catalog.bytes, 'Exact catalog size'); assert.equal(hash(catalog), manifest.catalog.sha256, 'Exact catalog hash');
  assert.deepEqual((await fs.readdir(resolved.transport)).sort(), ['catalog.json', 'manifest.json'], 'No undeclared transport members');
  assert.deepEqual(await inventoryCIArtifact(resolved.artifact), manifest.files, 'Exact artifact tree: no missing, extra or changed files');
  assert.deepEqual(await metadata(resolved.artifact), {revision: manifest.revision, buildId: manifest.buildId, verificationDigest: manifest.verificationDigest, sourceInputCount: manifest.sourceInputCount}, 'Transport metadata matches artifact');
  return {...resolved, manifest, catalog};
}
export async function sealCIArtifact(options: CIArtifactOptions): Promise<ArtifactManifest> {
  const {root, artifact, transport} = paths(options);
  const metrics = await metadata(artifact); assert.equal(metrics.revision, revision(root), 'Produced revision matches checkout');
  await currentSources(root, artifact, metrics);
  const catalog = await fs.readFile(path.join(root, 'data/recommendations.json'));
  assert.deepEqual(await regular(path.join(artifact, 'data/recommendations.json')), catalog, 'Produced catalog matches current source');
  JSON.parse(catalog.toString());
  producerRoot(root);
  const manifest: ArtifactManifest = {schemaVersion: 1, producerRoot: root, ...metrics, catalog: {bytes: catalog.length, sha256: hash(catalog)}, files: await inventoryCIArtifact(artifact)};
  await createTransportDirectory(root, transport);
  assert.equal((await fs.readdir(transport)).length, 0, 'Seal creates a new empty transport');
  await fs.writeFile(path.join(transport, 'catalog.json'), catalog, {flag: 'wx'});
  await fs.writeFile(path.join(transport, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
  return manifest;
}
export async function restoreCIArtifactCatalog(options: CIArtifactOptions): Promise<ArtifactManifest> {
  const {root, catalog, manifest} = await readTransport(options);
  JSON.parse(catalog.toString());
  const data = path.join(root, 'data'); await directory(data);
  const target = path.join(data, 'recommendations.json');
  // A clean fork may retain a dangling maintainer-only catalog symlink.
  const previous = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {if (error.code === 'ENOENT') return null; throw error;});
  if (previous) assert(previous.isFile() || previous.isSymbolicLink(), 'Catalog target is a regular file');
  const temporary = path.join(data, `.recommendations-ci-${randomUUID()}.tmp`);
  const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    try {await handle.writeFile(catalog);}
    finally {await handle.close();}
    // rename replaces the directory entry itself, including a symlink introduced
    // after lstat, without opening or truncating its destination. The original
    // catalog remains available until the complete qualified body is published.
    await fs.rename(temporary, target);
  } finally {
    await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => {if (error.code !== 'ENOENT') throw error;});
  }
  return manifest;
}
export async function verifyCIArtifact(options: CIArtifactOptions): Promise<ArtifactManifest> {
  const {root, artifact, catalog, manifest} = await readTransport(options);
  assert.deepEqual(await regular(path.join(root, 'data/recommendations.json')), catalog, 'Restored source catalog remains exact');
  assert.deepEqual(await regular(path.join(artifact, 'data/recommendations.json')), catalog, 'Artifact catalog remains exact');
  await currentSources(root, artifact, manifest);
  return manifest;
}
async function cli(): Promise<void> {
  const [mode, ...args] = process.argv.slice(2), values = new Map<string, string>(); let githubEnv = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === '--github-env') {assert(!githubEnv, 'No duplicate GitHub env flag'); githubEnv = true; continue;}
    assert(['--artifact', '--transport'].includes(flag) && !values.has(flag), 'Known unique artifact option');
    const value = args[++index]; assert(value && !value.startsWith('--'), 'Artifact option requires a value'); values.set(flag, value);
  }
  assert(values.has('--artifact') && values.has('--transport'), '--artifact and --transport are required');
  assert(!githubEnv || (mode === 'verify' && process.env.GITHUB_ENV), '--github-env requires verify and the runner-provided GITHUB_ENV file');
  const options = {artifact: values.get('--artifact')!, transport: values.get('--transport')!};
  const operation = mode === 'seal' ? sealCIArtifact : mode === 'restore' ? restoreCIArtifactCatalog : mode === 'verify' ? verifyCIArtifact : undefined;
  assert(operation, 'Use seal, restore or verify');
  const manifest = await operation(options);
  if (githubEnv) await fs.appendFile(process.env.GITHUB_ENV!, `GETBASED_EXPECTED_KIT_BUILD_ID=${manifest.buildId}\nGETBASED_KIT_PRODUCER_ROOT=${manifest.producerRoot}\n`);
  console.log(JSON.stringify({mode, revision: manifest.revision, buildId: manifest.buildId, files: manifest.files.length, catalogBytes: manifest.catalog.bytes}));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cli();
