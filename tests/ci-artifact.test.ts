import {afterEach, describe, expect, it, vi} from 'vitest';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inventoryCIArtifact, restoreCIArtifactCatalog, sealCIArtifact, verifyCIArtifact} from '../scripts/ci-artifact.mjs';
import {createStaticBuildFingerprint} from '../scripts/static-build-inputs.mjs';

const cleanup: string[] = [];
afterEach(async () => {vi.restoreAllMocks(); for (const directory of cleanup.splice(0)) await fs.rm(directory, {recursive: true, force: true});});
const sha = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-ci-artifact-')); cleanup.push(root);
  const options = {root, artifact: 'dist', transport: '.local-notes/ci/transport'};
  const write = async (file: string, body: string): Promise<void> => {await fs.mkdir(path.dirname(path.join(root, file)), {recursive: true}); await fs.writeFile(path.join(root, file), body);};
  const git = (...args: string[]): string => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  git('init'); git('-c', 'user.name=Synthetic CI fixture', '-c', 'user.email=ci@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--allow-empty', '-m', 'Synthetic artifact test');
  const revision = git('rev-parse', 'HEAD'), buildId = 'a'.repeat(64);
  for (const [file, body] of [['robots.txt', 'User-agent: *\n'], ['sitemap.xml', '<urlset/>'], ['.well-known/mcp.json', '{\"synthetic\":true}']]) {await write(file!, body!); await write('dist/' + file!, body!);}
  await write('app.ts', 'export const source = 1;\n');
  await write('data/recommendations.json', '{"slots":{},"products":{}}\n');
  await write('css/source.css', '.synthetic {color: red;}\n');
  await write('js/raw.js', 'export const raw = 1;\n');
  await write('service-worker.js', "importScripts('/service-worker-assets.js');\n");
  const shell = "const APP_SHELL = ['/app', '/index.html', '/version.js', '/data/recommendations.json', '/css/source.css', '/js/raw.js'];\n";
  await write('service-worker-assets.js', shell);
  await write('dist/index.html', '<!doctype html><html><body>Synthetic artifact contract</body></html>');
  await write('dist/version.js', `self.APP_BUILD_ID = '${buildId}';\n`);
  await write('dist/service-worker.js', `const BUILD_ID = '${buildId}';\n` + shell);
  for (const file of ['data/recommendations.json', 'css/source.css', 'js/raw.js']) await write('dist/' + file, await fs.readFile(path.join(root, file), 'utf8'));
  const source = await createStaticBuildFingerprint(root, revision, '', []);
  await write('dist/build-metrics.json', JSON.stringify({framework: 'SvelteKit 3 / Svelte 5', static: true, revision, buildId, verificationDigest: source.verificationDigest, sourceInputCount: source.sourceFiles.length}));
  return {root, options, write, revision, buildId};
}

describe('exact CI artifact transport', () => {
  it('seals once, restores the exact catalog before install, then verifies source, identity and every artifact file', async () => {
    const sample = await fixture();
    const manifest = await sealCIArtifact(sample.options);
    expect(manifest.revision).toBe(sample.revision); expect(manifest.buildId).toBe(sample.buildId);
    expect(manifest.files).toHaveLength(10);
    await fs.unlink(path.join(sample.root, 'data/recommendations.json'));
    await fs.symlink('/synthetic-missing-personal-catalog', path.join(sample.root, 'data/recommendations.json'));
    expect(await restoreCIArtifactCatalog(sample.options)).toEqual(manifest);
    expect((await fs.lstat(path.join(sample.root, 'data/recommendations.json'))).isSymbolicLink()).toBe(false);
    expect(await verifyCIArtifact(sample.options)).toEqual(manifest);
    await expect(sealCIArtifact(sample.options)).rejects.toThrow('new empty transport');
  });

  it('keeps the attested producer root while verifying the same immutable artifact in a different consumer checkout', async () => {
    const sample = await fixture(), manifest = await sealCIArtifact(sample.options);
    expect(manifest.producerRoot).toBe(sample.root);
    const consumer = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'getbased-ci-consumer-')); cleanup.push(consumer);
    await fs.cp(sample.root, consumer, {recursive: true});
    const options = {...sample.options, root: consumer};
    expect(consumer).not.toBe(manifest.producerRoot);
    expect(await restoreCIArtifactCatalog(options)).toEqual(manifest);
    expect(await verifyCIArtifact(options)).toEqual(manifest);
    expect(await inventoryCIArtifact(path.join(consumer, 'dist'))).toEqual(manifest.files);
  });

  it.each([undefined, '', '/', 'relative/root', '/producer/../foreign', '/producer/', '/producer\\foreign', '/producer\nINJECTED=value'])('rejects an unqualified private producer root %j', async value => {
    const sample = await fixture(); await sealCIArtifact(sample.options);
    const file = path.join(sample.root, sample.options.transport, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(file, 'utf8')) as {producerRoot?: string};
    if (value === undefined) delete manifest.producerRoot; else manifest.producerRoot = value;
    await fs.writeFile(file, JSON.stringify(manifest));
    await expect(restoreCIArtifactCatalog(sample.options)).rejects.toThrow('Canonical private artifact producer root');
    await expect(verifyCIArtifact(sample.options)).rejects.toThrow('Canonical private artifact producer root');
  });

  it.each(['missing', 'extra', 'changed', 'linked-file', 'linked-directory'])('rejects a %s artifact tree before restoring any catalog', async mutation => {
    const sample = await fixture(); await sealCIArtifact(sample.options);
    const original = await fs.readFile(path.join(sample.root, 'data/recommendations.json'));
    const file = path.join(sample.root, 'dist/css/source.css');
    if (mutation === 'missing') await fs.unlink(file);
    if (mutation === 'extra') await sample.write('dist/undeclared.txt', 'extra');
    if (mutation === 'changed') await fs.appendFile(file, '/* changed */');
    if (mutation === 'linked-file') {await fs.unlink(file); await fs.symlink(path.join(sample.root, 'css/source.css'), file);}
    if (mutation === 'linked-directory') {await fs.rm(path.join(sample.root, 'dist/css'), {recursive: true}); await fs.symlink(path.join(sample.root, 'css'), path.join(sample.root, 'dist/css'));}
    await expect(restoreCIArtifactCatalog(sample.options)).rejects.toThrow();
    expect(await fs.readFile(path.join(sample.root, 'data/recommendations.json'))).toEqual(original);
  });

  it.each(['revision', 'catalog', 'extra-transport', 'manifest-link', 'duplicate', 'traversal'])('rejects unqualified %s transport data', async mutation => {
    const sample = await fixture(); await sealCIArtifact(sample.options);
    const location = path.join(sample.root, sample.options.transport, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(location, 'utf8')) as {revision: string; files: Array<{file: string; bytes: number; sha256: string}>};
    if (mutation === 'revision') manifest.revision = 'b'.repeat(40);
    if (mutation === 'duplicate') manifest.files.push(manifest.files[0]!);
    if (mutation === 'traversal') manifest.files[0]!.file = '../outside';
    if (['revision', 'duplicate', 'traversal'].includes(mutation)) await fs.writeFile(location, JSON.stringify(manifest));
    if (mutation === 'catalog') await fs.appendFile(path.join(sample.root, sample.options.transport, 'catalog.json'), ' ');
    if (mutation === 'extra-transport') await sample.write(sample.options.transport + '/undeclared.txt', 'extra');
    if (mutation === 'manifest-link') {await fs.rename(location, path.join(sample.root, 'manifest-copy')); await fs.symlink(path.join(sample.root, 'manifest-copy'), location);}
    await expect(restoreCIArtifactCatalog(sample.options)).rejects.toThrow();
  });

  it('rejects source changes and a copied emitted public body that no longer matches its source', async () => {
    const sample = await fixture(); await sealCIArtifact(sample.options);
    await sample.write('app.ts', 'export const source = 2;\n');
    await expect(verifyCIArtifact(sample.options)).rejects.toThrow('authored source fingerprint');
    await sample.write('app.ts', 'export const source = 1;\n');
    await sample.write('js/raw.js', 'export const raw = 2;\n');
    await expect(verifyCIArtifact(sample.options)).rejects.toThrow('Exact copied public body: /js/raw.js');
  });

  it('rejects document or worker identity mismatch even when the transport inventory is recomputed', async () => {
    const sample = await fixture(); await sealCIArtifact(sample.options);
    await sample.write('dist/version.js', `self.APP_BUILD_ID = '${'b'.repeat(64)}';\n`);
    const location = path.join(sample.root, sample.options.transport, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(location, 'utf8')) as {files: unknown}; manifest.files = await inventoryCIArtifact(path.join(sample.root, 'dist'));
    await fs.writeFile(location, JSON.stringify(manifest));
    await expect(verifyCIArtifact(sample.options)).rejects.toThrow('Document build identity');
  });

  it('rejects unsafe transport destinations before writing anything', async () => {
    const sample = await fixture();
    for (const transport of ['.', 'dist/transport', 'data/transport', '.local-notes']) await expect(sealCIArtifact({...sample.options, transport})).rejects.toThrow();
    for (const artifact of ['.', '../outside']) await expect(sealCIArtifact({...sample.options, artifact})).rejects.toThrow();
  });

  it('rejects linked transport ancestors before creating any directory outside the checkout', async () => {
    const sample = await fixture();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-ci-artifact-outside-')); cleanup.push(outside);
    await fs.symlink(outside, path.join(sample.root, '.local-notes'));
    await expect(sealCIArtifact(sample.options)).rejects.toThrow('non-symlink directory');
    expect(await fs.readdir(outside)).toEqual([]);
  });

  it('requires exact manifest byte counts and hashes rather than mere file presence', async () => {
    const sample = await fixture(); const manifest = await sealCIArtifact(sample.options);
    const catalog = await fs.readFile(path.join(sample.root, sample.options.transport, 'catalog.json'));
    expect(manifest.catalog).toEqual({bytes: catalog.length, sha256: sha(catalog)});
    expect(manifest.files.every(file => Number.isSafeInteger(file.bytes) && /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
  });
});


describe('artifact file replacement races', () => {
  it('rejects a symlink substituted just before opening a listed artifact member', async () => {
    const sample = await fixture(), member = path.join(sample.root, 'dist/css/source.css'), outside = path.join(sample.root, 'outside.txt');
    await fs.writeFile(outside, 'outside must not be consumed');
    const open = fs.open.bind(fs); let swapped = false;
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      if (args[0] === member && !swapped) {swapped = true; await fs.unlink(member); await fs.symlink(outside, member);}
      return open(...args);
    });
    await expect(inventoryCIArtifact(path.join(sample.root, 'dist'))).rejects.toThrow();
    expect(swapped).toBe(true); expect(await fs.readFile(outside, 'utf8')).toBe('outside must not be consumed');
  });

  it('reads the qualified open object when its pathname is replaced during a read', async () => {
    const sample = await fixture(), member = path.join(sample.root, 'dist/css/source.css'), outside = path.join(sample.root, 'outside.txt');
    const original = await fs.readFile(member); await fs.writeFile(outside, 'replacement must not be consumed');
    const open = fs.open.bind(fs); let swapped = false;
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args);
      if (args[0] === member && !swapped) {swapped = true; await fs.unlink(member); await fs.symlink(outside, member);}
      return handle;
    });
    const inventory = await inventoryCIArtifact(path.join(sample.root, 'dist'));
    expect(inventory.find(file => file.file === 'css/source.css')).toEqual({file: 'css/source.css', bytes: original.length, sha256: sha(original)});
    expect(swapped).toBe(true);
  });

  it('closes the opened artifact descriptor when its read fails', async () => {
    const sample = await fixture(), member = path.join(sample.root, 'dist/css/source.css'), open = fs.open.bind(fs);
    let closed: unknown;
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args);
      if (args[0] === member) {vi.spyOn(handle, 'readFile').mockRejectedValueOnce(new Error('synthetic read failure')); closed = vi.spyOn(handle, 'close');}
      return handle;
    });
    await expect(inventoryCIArtifact(path.join(sample.root, 'dist'))).rejects.toThrow('synthetic read failure');
    expect(closed).toHaveBeenCalledOnce();
  });

  it('replaces a catalog symlink introduced at publication without modifying its destination', async () => {
    const sample = await fixture(); await sealCIArtifact(sample.options);
    const target = path.join(sample.root, 'data/recommendations.json'), outside = path.join(sample.root, 'outside.txt');
    await fs.writeFile(outside, 'external catalog stays untouched');
    const rename = fs.rename.bind(fs); let swapped = false;
    vi.spyOn(fs, 'rename').mockImplementation(async (...args) => {
      if (args[1] === target) {swapped = true; await fs.unlink(target); await fs.symlink(outside, target);}
      return rename(...args);
    });
    await restoreCIArtifactCatalog(sample.options);
    expect(swapped).toBe(true); expect(await fs.readFile(outside, 'utf8')).toBe('external catalog stays untouched');
    expect((await fs.lstat(target)).isSymbolicLink()).toBe(false);
    expect(await fs.readFile(target)).toEqual(await fs.readFile(path.join(sample.root, sample.options.transport, 'catalog.json')));
    expect((await fs.readdir(path.dirname(target))).filter(file => file.startsWith('.recommendations-ci-'))).toEqual([]);
  });

  it('retains the old catalog and closes and removes a failed staging write', async () => {
    const sample = await fixture(); await sealCIArtifact(sample.options);
    const target = path.join(sample.root, 'data/recommendations.json'), original = await fs.readFile(target), open = fs.open.bind(fs);
    let closed: unknown;
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args);
      if (String(args[0]).includes('.recommendations-ci-')) {vi.spyOn(handle, 'writeFile').mockRejectedValueOnce(new Error('synthetic staging failure')); closed = vi.spyOn(handle, 'close');}
      return handle;
    });
    await expect(restoreCIArtifactCatalog(sample.options)).rejects.toThrow('synthetic staging failure');
    expect(closed).toHaveBeenCalledOnce(); expect(await fs.readFile(target)).toEqual(original);
    expect((await fs.readdir(path.dirname(target))).filter(file => file.startsWith('.recommendations-ci-'))).toEqual([]);
  });
});
