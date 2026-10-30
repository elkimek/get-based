import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, expect, it} from 'vitest';
import {build, RolldownMagicString, type Plugin, type FunctionPluginHooks, type RolldownOutput} from 'rolldown';
import {TraceMap, originalPositionFor} from '@jridgewell/trace-mapping';
import {createKitRetryChunksPlugin, readKitRetrySummary, type KitRetrySummary} from '../scripts/kit-retry-chunks.mjs';

let root: string, serial = 0;
beforeAll(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-kit-retry-')); });
afterAll(async () => { if (root) await fs.rm(root, {recursive: true, force: true}); });
async function fixture(body = 'let counter=0;export function next(){return ++counter;}', options: {differentBody?: boolean; differentMap?: boolean; differentAssets?: boolean; differentAssetOrder?: boolean; cssDeps?: string[]; unstable?: boolean; staticRetry?: boolean} = {}) {
  const directory = path.join(root, String(++serial)); await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
  const main = ["export const canonical=()=>import('./feature.js');", "export const retry=()=>import('./feature.js?lazy-retry=1');", "export const owner=()=> 'synthetic-parent';", ...(options.staticRetry ? ["import {next} from './feature.js?lazy-retry=1'; export const staticRetry=next;"] : [])].join('\n');
  await fs.writeFile(path.join(directory, 'main.js'), main); await fs.writeFile(path.join(directory, 'feature.js'), body);
  const planFile = path.join(directory, 'plan.json'), summaryFile = path.join(directory, 'summary.json');
  let pass = 0;
  let currentProof: ReturnType<typeof createKitRetryChunksPlugin> | null = null;
  const run = async (phase: 'inventory' | 'transport', withProof = true) => {
    const current = ++pass;
    const loader: Plugin = {name: 'exact-fixture-query-source',
      resolveId(source, importer) { return source.endsWith('?lazy-retry=1') && importer ? path.resolve(path.dirname(importer), source) : null; },
      async load(id) {
        if (!id.endsWith('?lazy-retry=1')) return null;
        const source = await fs.readFile(id.slice(0, -'?lazy-retry=1'.length), 'utf8');
        if (options.differentMap) return {code: source, map: {version: 3, sources: [id], sourcesContent: [source + '\n// different map evidence'], names: [], mappings: 'AAAA'}};
        return options.differentBody ? source + '\nexport const extra=1;' : source;
      },
      renderChunk(code) { return options.unstable ? new RolldownMagicString(code).append('\nexport const fixturePass=' + current + ';') : null; },
    };
    const proof = createKitRetryChunksPlugin({pass: phase, planFile, summaryFile});
    currentProof = proof;
    if (options.differentAssets || options.differentAssetOrder || options.cssDeps) for (const owner of [proof.plugin, proof.finalizePlugin]) {
      const hook = owner.generateBundle;
      const generate = typeof hook === 'function' ? hook : hook && 'handler' in hook ? hook.handler : null;
      if (typeof generate !== 'function') throw new Error('Expected proof callback');
      // Match Vite's per-callback metadata injection, including CSS order.
      const wrapped: NonNullable<FunctionPluginHooks['generateBundle']> = function(output, bundle, isWrite) {
        for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk' && /feature\.js(?:\?lazy-retry=1)?$/.test(chunk.facadeModuleId || '')) {
          const retry = chunk.facadeModuleId!.endsWith('?lazy-retry=1');
          const css = options.cssDeps || (options.differentAssetOrder ? retry ? ['b.css', 'a.css'] : ['a.css', 'b.css'] : retry ? ['different.css'] : []);
          Object.defineProperty(chunk, 'viteMetadata', {value: {importedCss: new Set(css), importedAssets: new Set()}, enumerable: true});
        }
        return generate.call(this, output, bundle, isWrite);
      };
      owner.generateBundle = typeof hook === 'object' ? {...hook, handler: wrapped} : wrapped;
    }
    return build({input: path.join(directory, 'main.js'), write: phase === 'transport', platform: 'browser',
      plugins: [loader, ...(withProof ? [proof.plugin, proof.finalizePlugin] : [])],
      output: {dir: path.join(directory, 'out'), format: 'es', minify: true, sourcemap: 'hidden',
        entryFileNames: '_app/immutable/entry/[name]-[hash].js', chunkFileNames: '_app/immutable/chunks/[name]-[hash].js'}});
  };
  return {directory, main, planFile, summaryFile, run, dependencies(filename: string, values: string[], context?: {hostId: string}) { if (!currentProof) throw new Error('Build the proof first'); return currentProof.resolveDependencies(filename, values, context); }};
}
const chunks = (result: RolldownOutput) => result.output.filter(item => item.type === 'chunk');

it('removes only the duplicate body, keeps independent retry namespaces and exact source maps', async () => {
  const f = await fixture(), first = chunks(await f.run('inventory')), result = await f.run('transport'), output = chunks(result);
  const summary = JSON.parse(await fs.readFile(f.summaryFile, 'utf8')) as KitRetrySummary;
  expect(summary.removedPhysicalFiles).toBe(1); expect(output).toHaveLength(first.length - 1);
  expect(Object.keys(summary.canonicalBodyHashes)).toHaveLength(1);
  const entry = output.find(chunk => chunk.isEntry)!;
  const api = await import(pathToFileURL(path.join(f.directory, 'out', entry.fileName)).href) as {canonical(): Promise<{next(): number}>; retry(): Promise<{next(): number}>};
  const canonical = await api.canonical(), retry = await api.retry();
  expect(canonical).not.toBe(retry); expect([canonical.next(), canonical.next(), retry.next()]).toEqual([1, 2, 1]);
  expect(await api.canonical()).toBe(canonical); expect(await api.retry()).toBe(retry);
  expect(entry.code).toContain('?lazy-retry=1');
  for (const chunk of output) {
    expect(chunk.code).not.toContain('sourceMappingURL=');
    expect(await fs.readFile(path.join(f.directory, 'out', chunk.fileName), 'utf8')).toBe(chunk.code);
    const map = JSON.parse(await fs.readFile(path.join(f.directory, 'out', chunk.fileName + '.map'), 'utf8')) as {sourcesContent: string[]};
    expect(map.sourcesContent.length).toBeGreaterThan(0);
  }
  const map = JSON.parse(await fs.readFile(path.join(f.directory, 'out', entry.fileName + '.map'), 'utf8'));
  expect(map.sourcesContent).toContain(f.main);
  const at = entry.code.indexOf('synthetic-parent'); expect(at).toBeGreaterThan(0);
  const prefix = entry.code.slice(0, at), lines = prefix.split('\n');
  const original = originalPositionFor(new TraceMap(map), {line: lines.length, column: lines.at(-1)!.length});
  expect(original.source).toMatch(/main\.js$/); expect(original.line).toBe(3);
});
it.each([
  ['import.meta', 'export const next=()=>import.meta.url;', {}],
  ['different bodies/exports', undefined, {differentBody: true}],
  ['different source maps', undefined, {differentMap: true}],
  ['different CSS ownership', undefined, {differentAssets: true}],
  ['different CSS order', undefined, {differentAssetOrder: true}],
  ['static retry dependency', undefined, {staticRetry: true}],
] as const)('keeps physical entries for %s', async (_name, body, options) => {
  const f = await fixture(body, options); const first = chunks(await f.run('inventory')); const output = chunks(await f.run('transport'));
  const summary = JSON.parse(await fs.readFile(f.summaryFile, 'utf8')) as KitRetrySummary;
  expect(summary.removedPhysicalFiles).toBe(0); expect(summary.canonicalBodyHashes).toEqual({});
  expect(output).toHaveLength(first.length);
});
it('rejects changed prehash inputs before emitting a qualified transport', async () => {
  const f = await fixture(undefined, {unstable: true}); await f.run('inventory');
  await expect(f.run('transport')).rejects.toThrow('Non-deterministic Kit prehash input');
  await expect(fs.access(f.summaryFile)).rejects.toMatchObject({code: 'ENOENT'});
});
it('salts immutable filenames when selecting hidden-map retry production', async () => {
  const f = await fixture(); const ordinary = chunks(await f.run('inventory', false)); const salted = chunks(await f.run('inventory'));
  for (const chunk of salted) expect(ordinary.some(previous => previous.fileName === chunk.fileName)).toBe(false);
});

it('rejects a tampered plan that tries to remove the canonical entry itself', async () => {
  const f = await fixture(); await f.run('inventory');
  const plan = JSON.parse(await fs.readFile(f.planFile, 'utf8'));
  plan.pairs[0].retryId = plan.pairs[0].canonicalId;
  await fs.writeFile(f.planFile, JSON.stringify(plan));
  await expect(f.run('transport')).rejects.toThrow('Invalid Kit retry pair in plan');
});
it('checks actual emitted bytes again before returning the shipping proof', async () => {
  const f = await fixture(); await f.run('inventory'); await f.run('transport');
  const directory = path.join(f.directory, 'out'), summary = await readKitRetrySummary(f.summaryFile, directory);
  const canonical = Object.keys(summary.canonicalBodyHashes)[0]!;
  await fs.appendFile(path.join(directory, canonical.slice(1)), '\n// changed after hashing');
  await expect(readKitRetrySummary(f.summaryFile, directory)).rejects.toThrow('Kit retry file changed after hashing');
});
it('retains source coordinates when both a retry root and its nested retry are rewritten', async () => {
  const f = await fixture("export const next=()=>1;export const children=()=>Promise.all([import('./leaf.js'),import('./leaf.js?lazy-retry=1')]);");
  await fs.writeFile(path.join(f.directory, 'leaf.js'), 'export const leaf=1;');
  await f.run('inventory'); const result = await f.run('transport');
  const summary = await readKitRetrySummary(f.summaryFile, path.join(f.directory, 'out'));
  expect(summary.removedPhysicalFiles).toBe(2);
  for (const chunk of chunks(result)) if (chunk.map) expect(JSON.parse(chunk.map.toString()).sourcesContent.every((source: unknown) => typeof source === 'string')).toBe(true);
});

it('keeps the retry root and ordered CSS preloads while leaving unowned requests alone', async () => {
  const f = await fixture(undefined, {cssDeps: ['a.css', 'b.css']}); await f.run('inventory'); await f.run('transport');
  const summary = await readKitRetrySummary(f.summaryFile, path.join(f.directory, 'out'));
  expect(summary.removedPhysicalFiles).toBe(1);
  const query = Object.keys(summary.canonicalBodyHashes)[0]!.slice(1) + '?lazy-retry=1';
  expect(f.dependencies(query, [], {hostId: 'different-parent.js'})).toEqual([query, 'a.css', 'b.css']);
  expect(f.dependencies(query, [], {hostId: query.slice(0, -'?lazy-retry=1'.length)})).toEqual([]);
  const original = ['unchanged.css']; expect(f.dependencies('unowned.js?lazy-retry=1', original)).toBe(original);
});
