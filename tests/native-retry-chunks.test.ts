import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {afterAll, beforeAll, expect, it} from 'vitest';
import {type Plugin} from 'rolldown';
import {buildNativeRetryChunks, type NativeRetryOptions} from '../scripts/native-retry-chunks.mjs';

let root: string;
let sequence = 0;
beforeAll(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-retry-chunks-')); });
afterAll(async () => { if (root) await fs.rm(root, {recursive: true, force: true}); });

async function fixture(body: string, options: {differentRetry?: boolean; maps?: boolean; unstable?: boolean} = {}) {
  const directory = path.join(root, String(++sequence));
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
  await fs.writeFile(path.join(directory, 'main.js'), [
    "export const canonical = () => import('./feature.js');",
    "export const retry = () => import('./feature.js?lazy-retry=1');",
  ].join('\n'));
  await fs.writeFile(path.join(directory, 'feature.js'), body);
  let pass = 0;
  const createOptions = (): NativeRetryOptions => {
    pass += 1;
    const currentPass = pass;
    const loader: Plugin = {
      name: 'fixture-exact-source-query-loader',
      resolveId(source, importer) {
        if (!source.endsWith('?lazy-retry=1') || !importer) return null;
        return path.resolve(path.dirname(importer), source);
      },
      async load(id) {
        if (!id.endsWith('?lazy-retry=1')) return null;
        const source = await fs.readFile(id.slice(0, -'?lazy-retry=1'.length), 'utf8');
        return options.differentRetry ? source + '\nexport const retryOnly = 1;' : source;
      },
      renderChunk(code) {
        return options.unstable ? code + '\nexport const fixturePass=' + currentPass + ';' : null;
      },
    };
    return {input: path.join(directory, 'main.js'), plugins: [loader], platform: 'browser',
      output: {dir: path.join(directory, 'out'), format: 'es', minify: true,
        sourcemap: options.maps ?? false, entryFileNames: 'bundle-main-[hash].js',
        chunkFileNames: 'bundle-[name]-[hash].js'}};
  };
  return {directory, createOptions};
}

it('removes an exact physical retry while retaining two evaluated ESM namespaces and exact body hashes', async () => {
  const f = await fixture('let counter=0;export function next(){return ++counter;}');
  const output = await buildNativeRetryChunks(f.createOptions);
  expect(output.removedPhysicalFiles).toBe(1);
  expect(Object.keys(output.canonicalBodyHashes)).toHaveLength(1);
  const chunks = output.result.output.filter(item => item.type === 'chunk');
  expect(chunks).toHaveLength(2);
  const entry = chunks.find(chunk => chunk.isEntry);
  if (!entry) throw Error('Missing real fixture entry');
  const [canonical, hash] = Object.entries(output.canonicalBodyHashes)[0]!;
  const body = await fs.readFile(path.join(f.directory, 'out', canonical.slice('/js/'.length)), 'utf8');
  expect(createHash('sha256').update(body).digest('hex')).toBe(hash);
  expect(entry.code).toContain(canonical.slice('/js/'.length) + '?lazy-retry=1');
  const module: unknown = await import(pathToFileURL(path.join(f.directory, 'out', entry.fileName)).href);
  if (!module || typeof module !== 'object' || !('canonical' in module) || typeof module.canonical !== 'function'
    || !('retry' in module) || typeof module.retry !== 'function') throw Error('Missing real fixture API');
  const original: unknown = await module.canonical();
  const retry: unknown = await module.retry();
  expect(retry).not.toBe(original);
  expect(await module.canonical()).toBe(original);
  expect(await module.retry()).toBe(retry);
  if (!original || typeof original !== 'object' || !('next' in original) || typeof original.next !== 'function'
    || !retry || typeof retry !== 'object' || !('next' in retry) || typeof retry.next !== 'function') throw Error('Missing independent counters');
  expect([original.next(), original.next(), retry.next(), retry.next()]).toEqual([1, 2, 1, 2]);
  expect(output.removedPhysicalBodyBytes).toBe(Buffer.byteLength(body));
  expect(output.qualifiedRetries).toHaveLength(1);
  const proof = output.qualifiedRetries[0]!;
  expect(proof.canonicalId).toBe(path.join(f.directory, 'feature.js'));
  expect(proof.retryId).toBe(proof.canonicalId + '?lazy-retry=1');
  expect(proof.canonicalFileName).toBe(canonical.slice('/js/'.length));
  expect(proof.bodySHA256).toBe(hash);
  expect(chunks.some(chunk => chunk.fileName === proof.removedRetryFileName)).toBe(false);
  const retained = chunks.find(chunk => chunk.fileName === proof.canonicalFileName);
  if (!retained) throw Error('Missing qualified actual canonical chunk');
  expect(proof.exports).toEqual(retained.exports);
  expect(proof.imports).toEqual(retained.imports);
  expect(proof.dynamicImports).toEqual(retained.dynamicImports);
  expect(Object.keys(output.canonicalBodyHashes).sort())
    .toEqual(output.qualifiedRetries.map(item => '/js/' + item.canonicalFileName).sort());
});

it('leaves import.meta roots as two real physical files with their original URL semantics', async () => {
  const f = await fixture('export const url=import.meta.url;');
  const output = await buildNativeRetryChunks(f.createOptions);
  expect(output.removedPhysicalFiles).toBe(0);
  expect(output.canonicalBodyHashes).toEqual({});
  expect(output.result.output.filter(item => item.type === 'chunk')).toHaveLength(3);
});

it('does not merge different exports or bodies just because their source roots share a basename', async () => {
  const f = await fixture('export const ordinary=1;', {differentRetry: true});
  const output = await buildNativeRetryChunks(f.createOptions);
  expect(output.removedPhysicalFiles).toBe(0);
  expect(output.canonicalBodyHashes).toEqual({});
  expect(output.result.output.filter(item => item.type === 'chunk')).toHaveLength(3);
});

it('keeps source maps and their distinct physical retry entries intact', async () => {
  const f = await fixture('export const value=1;', {maps: true});
  const output = await buildNativeRetryChunks(f.createOptions);
  expect(output.removedPhysicalFiles).toBe(0);
  expect(output.result.output.filter(item => item.type === 'chunk')).toHaveLength(3);
  expect(output.result.output.filter(item => item.type === 'asset')).toHaveLength(3);
});

it('fails closed if a plugin changes the same prehash input between passes', async () => {
  const f = await fixture('export const value=1;', {unstable: true});
  await expect(buildNativeRetryChunks(f.createOptions)).rejects.toThrow('Non-deterministic prehash input');
});
