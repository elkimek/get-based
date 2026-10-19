import {describe, expect, it} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import MagicString from 'magic-string';
import {moduleRunnerTransform, transformWithOxc} from 'vite';
import {decode, encode} from '@jridgewell/sourcemap-codec';
import type {EncodedSourceMap} from '@jridgewell/trace-mapping';
import {nativeFunctionMapper, UnmappedNativeFunction} from '../scripts/native-coverage-functions.mjs';
import {replayNativeTransform, NATIVE_WRAPPER_PREFIX} from '../scripts/native-coverage-transform.mjs';
import {nativeDigest, writeNativeBlob} from '../scripts/native-coverage-storage.mjs';
import {readNativeFunctionCoverage} from '../scripts/native-coverage-receipt.mjs';
import {createNativeCoverageFixture} from './helpers/native-coverage-fixture.js';
import type {NativeEnvironment, NativeGeometry, NativeObservation, NativeSnapshot, NativeTransform, NativeCapture, NativeRaw, NativeSuiteCapture} from '../scripts/native-coverage-types.mjs';

// Pure synthetic syntax/transport controls. Public SDK output is real; no native/test behavior is claimed.
async function fixture(canonical: string, post = canonical, client = false) {
  const root = process.cwd(), relative = 'js/__native-coverage-syntax-fixture.js', file = path.join(root, relative);
  const environment: NativeEnvironment = client ? {name: 'jsdom', viteEnvironment: 'client', consumer: 'client'} : {name: 'node', viteEnvironment: 'ssr', consumer: 'server'};
  const initial = new MagicString(canonical), generated = initial.generateMap({hires: true, includeContent: true, source: file});
  if (!generated.sourcesContent) throw new Error('Missing synthetic source-map content');
  const initialMap = {file: generated.file, version: generated.version, sources: generated.sources, sourcesContent: generated.sourcesContent, names: generated.names, mappings: generated.mappings, toString: () => generated.toString(), toUrl: () => generated.toUrl()};
  const transformed = await moduleRunnerTransform(post, initialMap, file, post); expect(transformed?.map).toBeTruthy();
  const map = transformed!.map as EncodedSourceMap, inline = 'data:application/json;base64,' + Buffer.from(JSON.stringify(map)).toString('base64');
  const trailer = '\n//# sourceMappingSource=vite-generated\n//# sourceMappingURL=' + inline + '\n', cache = '\n//# vitestCache=' + Buffer.from('{}').toString('base64');
  const code = transformed!.code.replace(/^#!.*/, hashbang => ' '.repeat(hashbang.length));
  const runtime = NATIVE_WRAPPER_PREFIX + code.trimEnd() + trailer + cache + '\n}}', lines = runtime.split('\n');
  const snapshot: NativeSnapshot = {file: relative, scriptId: 'synthetic', url: pathToFileURL(file).href, source: {file: 'synthetic-source.js', sha256: nativeDigest(runtime), bytes: Buffer.byteLength(runtime)}, sourceLength: runtime.length, metadata: {scriptId: 'synthetic', url: pathToFileURL(file).href, startLine: 0, startColumn: 0, endLine: lines.length - 1, endColumn: lines.at(-1)!.length, executionContextId: 1, hash: nativeDigest(runtime), sourceMapURL: inline}};
  const geometry: NativeGeometry = {file: relative, environment: environment.viteEnvironment, consumer: environment.consumer, originalHash: nativeDigest(canonical), code: canonical};
  const observation: NativeObservation = {file: relative, environment: environment.viteEnvironment, consumer: environment.consumer, code: post, ordering: [{name: 'vite:import-analysis', order: null}, {name: 'getbased-native-coverage-observer', order: 'post'}], ownIndex: 1, analysisIndex: 0};
  return {root, relative, file, canonical, runtime, snapshot, geometry, observation, environment, transform: {file, canonical, runtime, code, map, offset: NATIVE_WRAPPER_PREFIX.length} satisfies NativeTransform};
}
const source = 'export function run(value) { return value ? 1 : 0; }';
function own(transform: NativeTransform, count: number) {
  const startOffset = transform.runtime.indexOf('function run'), body = source.slice(source.indexOf('function run'));
  expect(startOffset).toBeGreaterThan(0);
  return {functionName: 'run', isBlockCoverage: true, ranges: [{startOffset, endOffset: startOffset + body.length, count}]};
}

describe('native own-entry identities and whole public source witnesses', () => {
  it('replays a whole SSR module before rejecting wrapper, source-map and observation corruption', async () => {
    const value = await fixture(source);
    const replay = () => replayNativeTransform(value.root, value.relative, value.canonical, value.runtime, value.snapshot, NATIVE_WRAPPER_PREFIX.length, value.geometry, value.observation, value.environment);
    await expect(replay()).resolves.toMatchObject({canonical: source, runtime: value.runtime});
    await expect(replayNativeTransform(value.root, value.relative, source, value.runtime.replace('use strict', 'use sloppy'), value.snapshot, NATIVE_WRAPPER_PREFIX.length, value.geometry, value.observation, value.environment)).rejects.toThrow();
    await expect(replayNativeTransform(value.root, value.relative, source, value.runtime, {...value.snapshot, metadata: {...value.snapshot.metadata, sourceMapURL: 'data:application/json;base64,broken'}}, NATIVE_WRAPPER_PREFIX.length, value.geometry, value.observation, value.environment)).rejects.toThrow();
    await expect(replayNativeTransform(value.root, value.relative, source, value.runtime, value.snapshot, NATIVE_WRAPPER_PREFIX.length, value.geometry, {...value.observation, code: source + '/* altered */'}, value.environment)).rejects.toThrow();
    await expect(replayNativeTransform(value.root, value.relative, source, value.runtime, value.snapshot, NATIVE_WRAPPER_PREFIX.length, value.geometry, {...value.observation, ordering: [...value.observation.ordering, {name: 'later-mutator', order: 'post'}]}, value.environment)).rejects.toThrow();
  });
  it('accepts public SSR builtin and bare imports before rejecting changed external literals', async () => {
    const canonical = "import path from 'node:path'; import external from 'unloaded-pure-fixture'; " + source;
    const value = await fixture(canonical), replay = (code: string) => replayNativeTransform(value.root, value.relative, canonical, value.runtime, value.snapshot, NATIVE_WRAPPER_PREFIX.length, value.geometry, {...value.observation, code}, value.environment);
    await expect(replay(canonical)).resolves.toMatchObject({canonical});
    await expect(replay(canonical.replace('node:path', '/arbitrary-builtin.js'))).rejects.toThrow();
    await expect(replay(canonical.replace('unloaded-pure-fixture', '/arbitrary-external.js'))).rejects.toThrow();
  });
  it('keeps client and SSR environment identities distinct', async () => {
    const value = await fixture(source, source, true);
    await expect(replayNativeTransform(value.root, value.relative, source, value.runtime, value.snapshot, NATIVE_WRAPPER_PREFIX.length, value.geometry, value.observation, value.environment)).resolves.toMatchObject({canonical: source});
    await expect(replayNativeTransform(value.root, value.relative, source, value.runtime, value.snapshot, NATIVE_WRAPPER_PREFIX.length, value.geometry, value.observation, {name: 'node', viteEnvironment: 'ssr', consumer: 'server'})).rejects.toThrow();
  });
  it('uses the exact own entry count and never promotes a nested positive block', async () => {
    const {transform} = await fixture(source), map = nativeFunctionMapper(transform), entry = own(transform, 2);
    expect(map(entry)).toEqual({start: 0, end: source.length, count: 2});
    const zero = own(transform, 0); zero.ranges.push({startOffset: zero.ranges[0]!.startOffset + 20, endOffset: zero.ranges[0]!.endOffset - 1, count: 9});
    expect(map(zero).count).toBe(0);
    expect(() => map({...entry, ranges: [{...entry.ranges[0]!, count: -1}]})).toThrow();
    expect(() => map({...entry, ranges: [{...entry.ranges[0]!, endOffset: transform.runtime.length + 1}]})).toThrow();
    expect(() => map({...entry, ranges: [{...entry.ranges[0]!, startOffset: entry.ranges[0]!.startOffset + 1}]})).toThrow(UnmappedNativeFunction);
  });
  it('does not infer identity from missing or duplicated exact source-map points', async () => {
    const {transform} = await fixture(source), entry = own(transform, 1); expect(nativeFunctionMapper(transform)(entry).count).toBe(1);
    const map = structuredClone(transform.map!); const decoded = decode(map.mappings), at = entry.ranges[0]!.startOffset - transform.offset;
    let position = 0, line = 0; while (line + 1 < transform.code.split('\n').length && position + transform.code.split('\n')[line]!.length + 1 <= at) {position += transform.code.split('\n')[line]!.length + 1; line++;}
    const index = decoded[line]!.findIndex(segment => segment[0] === at - position); expect(index).toBeGreaterThanOrEqual(0);
    decoded[line]!.splice(index, 1); map.mappings = encode(decoded);
    expect(() => nativeFunctionMapper({...transform, map})(entry)).toThrow(UnmappedNativeFunction);
    const duplicate = structuredClone(transform.map!), points = decode(duplicate.mappings); points[line]!.push([...points[line]![index]!] as typeof points[number][number]); points[line]!.sort((a, b) => a[0] - b[0]); duplicate.mappings = encode(points);
    expect(() => nativeFunctionMapper({...transform, map: duplicate})(entry)).toThrow(UnmappedNativeFunction);
  });
});

it('keeps authenticated anonymous VM source visible with zero credit and rejects a missing snapshot', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-native-anonymous-')), root = path.join(directory, 'project'), output = path.join(directory, 'coverage');
  fs.mkdirSync(path.join(root, 'js'), {recursive: true}); fs.mkdirSync(path.join(root, 'tests'), {recursive: true});
  fs.copyFileSync(path.join(process.cwd(), 'js/unique-id.js'), path.join(root, 'js/unique-id.js'));
  fs.copyFileSync(path.join(process.cwd(), 'tests/ci-results.test.ts'), path.join(root, 'tests/ci-results.test.ts'));
  try {
    const revision = '1'.repeat(40), value = createNativeCoverageFixture(root, output, revision);
    // This is explicitly synthetic codec evidence, preserving a real canonical body while withholding its URL/ownership.
    const raw = JSON.parse(fs.readFileSync(path.join(output, value.rawFile), 'utf8')) as NativeRaw; raw.result[0]!.url = '';
    const update = (file: string, body: unknown) => {const bytes = Buffer.from(JSON.stringify(body)); fs.writeFileSync(path.join(output, file), bytes); return {file, bytes: bytes.length, sha256: nativeDigest(bytes)};};
    const rawBlob = update(value.rawFile, raw), capture = JSON.parse(fs.readFileSync(path.join(output, value.captureFile), 'utf8')) as NativeCapture;
    capture.raw = rawBlob; capture.snapshots[0]!.file = null; capture.snapshots[0]!.url = ''; capture.snapshots[0]!.metadata.url = '';
    const captureBlob = update(value.captureFile, capture), captures = JSON.parse(fs.readFileSync(path.join(output, 'captures.json'), 'utf8')) as NativeSuiteCapture[]; captures[0]!.file = captureBlob; update('captures.json', captures);
    const sourceReceipt = value.receipt.files.find(file => file.file === value.sourceFile); expect(sourceReceipt).toBeTruthy(); sourceReceipt!.called = [];
    value.receipt.unattributed = [{capture: value.captureFile, scriptId: '1', sourceHash: capture.snapshots[0]!.source.sha256, runtimeLength: capture.snapshots[0]!.sourceLength, functions: 1, positiveOwnFunctions: 1}];
    value.receipt.transport = value.receipt.transport.map(item => {const bytes = fs.readFileSync(path.join(output, item.file)); return {...item, bytes: bytes.length, sha256: nativeDigest(bytes)};}); update(path.basename(value.file), value.receipt);
    const receipt = await readNativeFunctionCoverage(value.file, {root, expectedRevision: revision});
    expect(receipt.files.flatMap(file => file.called)).toEqual([]); expect(receipt.unattributed).toHaveLength(1); expect(receipt.unattributed[0]!.positiveOwnFunctions).toBe(1);
    fs.unlinkSync(path.join(output, capture.snapshots[0]!.source.file));
    await expect(readNativeFunctionCoverage(value.file, {root, expectedRevision: revision})).rejects.toThrow();
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
});

it('publishes identical complete native records safely across worker processes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-native-publication-'));
  try {
    const module = new URL('../scripts/native-coverage-storage.mjs', import.meta.url).href;
    const body = `const {writeNativeBlob,writeNativeJSON}=await import(${JSON.stringify(module)}); const directory=process.argv[1]; for(let i=0;i<3;i++){writeNativeBlob(directory,'complete shared native source');writeNativeJSON(directory,'shared.json',{complete:true});}`;
    const results = await Promise.allSettled(Array.from({length: 3}, () => promisify(execFile)(
      process.execPath, ['--input-type=module', '--eval', body, directory],
      {timeout: 3_000, maxBuffer: 8192, killSignal: 'SIGKILL', encoding: 'utf8'},
    )));
    // Every child has exited before either reporting failures or removing its output directory.
    const failures: unknown[] = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
    if (failures.length) throw new AggregateError(failures, failures.map(error => String(error)).join('\n'));
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'shared.json'), 'utf8'))).toEqual({complete: true});
    const sources = fs.readdirSync(path.join(directory, 'blobs')); expect(sources).toHaveLength(1);
    expect(fs.readFileSync(path.join(directory, 'blobs', sources[0]!), 'utf8')).toBe('complete shared native source');
    expect(fs.readdirSync(directory).some(name => name.includes('.tmp-'))).toBe(false);
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
}, 10_000);

it('rejects a conflicting published native blob and removes its own temporary file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-native-collision-'));
  try {
    const blob = writeNativeBlob(directory, 'expected complete source'); fs.writeFileSync(path.join(directory, blob.file), 'conflicting bytes');
    expect(() => writeNativeBlob(directory, 'expected complete source')).toThrow('Native record collision');
    expect(fs.readdirSync(path.join(directory, 'blobs'))).toEqual([path.basename(blob.file)]);
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
});


// These source-only controls use the real public SSR transform. The finite
// pre-SSR client rewrites below are the installed Vite/Vitest URL spellings;
// real original-module capture is exercised by the existing chat/voice/lens tests.
const assetExpression = "new URL('./voice-local-stt-worker.js', import.meta.url)";
const assetReplacement = `new URL("/js/voice-local-stt-worker.js", '' + ${'self.location'.padEnd(15, ' ')})`;
const workerReplacement = `new URL(/* @vite-ignore */ "/js/voice-local-stt-worker.js?worker_file&type=module", '' + ${'self.location'.padEnd(15, ' ')})`;
async function assetFixture(canonical: string, post: string, client: boolean) {
  const value = await fixture(canonical, post, client);
  if (client) {
    value.observation.ordering.unshift({name: 'vite:worker-import-meta-url', order: null}, {name: 'vite:asset-import-meta-url', order: null}, {name: 'vitest:normalize-url', order: null});
    value.observation.analysisIndex += 3; value.observation.ownIndex += 3;
  }
  return value;
}
const assetForms = [
  ['top-level href', `const asset = ${assetExpression}.href; export {asset};`],
  ['array property href', `const assets = [{url: ${assetExpression}.href}]; export {assets};`],
  ['URL object property', `const assets = {url: ${assetExpression}}; export {assets};`],
  ['function Worker argument', `export function run() { return new Worker(${assetExpression}, {type: 'module'}); }`],
] as const;
describe('literal URL source witnesses in their actual containing expressions', () => {
  it.each(assetForms)('preserves unchanged SSR %s URLs without client asset plugins', async (_name, canonical) => {
    const value = await assetFixture(canonical, canonical, false);
    await expect(replayNativeTransform(value.root, value.relative, canonical, value.runtime, value.snapshot, NATIVE_WRAPPER_PREFIX.length, value.geometry, value.observation, value.environment)).resolves.toMatchObject({canonical, runtime: value.runtime});
  });
  it.each(assetForms)('reconstructs exact client %s URLs before rejecting changed paths, bytes and plugin order', async (name, canonical) => {
    const replacement = name === 'function Worker argument' ? workerReplacement : assetReplacement, post = canonical.replace(assetExpression, replacement);
    const value = await assetFixture(canonical, post, true);
    const replay = (observation: NativeObservation) => replayNativeTransform(value.root, value.relative, canonical, value.runtime, value.snapshot, NATIVE_WRAPPER_PREFIX.length, value.geometry, observation, value.environment);
    await expect(replay(value.observation)).resolves.toMatchObject({canonical, runtime: value.runtime});
    await expect(replay({...value.observation, code: post.replace('/js/voice-local-stt-worker.js', '/js/voice-local-tts-worker.js')})).rejects.toThrow();
    await expect(replay({...value.observation, code: post + '/* unrelated mutation */'})).rejects.toThrow();
    const ordering = value.observation.ordering.map(plugin => ({...plugin})); [ordering[1], ordering[2]] = [ordering[2]!, ordering[1]!];
    await expect(replay({...value.observation, ordering})).rejects.toThrow();
    if (name === 'function Worker argument') await expect(replay({...value.observation, code: post.replace('?worker_file&type=module', '?worker_file&type=classic')})).rejects.toThrow();
  });
  it('preserves a leading-interpolation template argument through only the exact client base normalization', async () => {
    const canonical = 'const directory = "../vendor/evolu8/"; export const asset = new URL(`${directory}evolu-bundle.js`, import.meta.url).href;';
    const server = await assetFixture(canonical, canonical, false);
    await expect(replayNativeTransform(server.root, server.relative, canonical, server.runtime, server.snapshot, NATIVE_WRAPPER_PREFIX.length, server.geometry, server.observation, server.environment)).resolves.toMatchObject({canonical});
    const post = canonical.replace('import.meta.url', 'self.location'.padEnd(15, ' ')), value = await assetFixture(canonical, post, true);
    const replay = (observation: NativeObservation) => replayNativeTransform(value.root, value.relative, canonical, value.runtime, value.snapshot, NATIVE_WRAPPER_PREFIX.length, value.geometry, observation, value.environment);
    await expect(replay(value.observation)).resolves.toMatchObject({canonical});
    await expect(replay({...value.observation, code: post.replace('${directory}evolu-bundle.js', '${directory}other.js')})).rejects.toThrow();
    await expect(replay({...value.observation, code: post.replace('self.location  ', 'self.location')})).rejects.toThrow();
    const ordering = value.observation.ordering.map(plugin => plugin.name === 'vitest:normalize-url' ? {...plugin, name: 'unqualified-normalizer'} : plugin);
    await expect(replay({...value.observation, ordering})).rejects.toThrow();
  });
  it('rejects a rewritten URL shadowed by a local parameter', async () => {
    const canonical = `export function run(URL) { return ${assetExpression}; }`, post = canonical.replace(assetExpression, assetReplacement), value = await assetFixture(canonical, post, true);
    await expect(replayNativeTransform(value.root, value.relative, canonical, value.runtime, value.snapshot, NATIVE_WRAPPER_PREFIX.length, value.geometry, value.observation, value.environment)).rejects.toThrow('Shadowed static URL constructor');
  });
});


it('reconstructs the complete public server identity-define output with canonical map provenance', async () => {
  // Real public SDK output over synthetic source, never an application capture.
  const canonical = 'const environment=globalThis.process?.env?.NODE_ENV;export function run(value){return value?environment:null;}', file = path.join(process.cwd(), 'js/__native-coverage-syntax-fixture.js');
  const projected = await transformWithOxc(canonical, file, {lang: 'js', sourceType: 'module', define: {'process.env.NODE_ENV': 'process.env.NODE_ENV'}, sourcemap: true, tsconfig: false});
  expect(projected.code).not.toBe(canonical);
  const value = await fixture(canonical, projected.code), ordering = [{name: 'vite:define', order: null}, ...value.observation.ordering];
  const observation: NativeObservation = {...value.observation, ordering, ownIndex: value.observation.ownIndex + 1, analysisIndex: value.observation.analysisIndex + 1};
  const replay = (changed: NativeObservation) => replayNativeTransform(value.root, value.relative, canonical, value.runtime, value.snapshot, NATIVE_WRAPPER_PREFIX.length, value.geometry, changed, value.environment);
  const transform = await replay(observation); expect(transform.canonical).toBe(canonical); expect(transform.runtime).toBe(value.runtime);
  expect(transform.map?.sourcesContent).toEqual([canonical]);
  const startOffset = transform.runtime.indexOf('function run'), endOffset = transform.runtime.indexOf('}', startOffset) + 1;
  expect(startOffset).toBeGreaterThan(0); expect(endOffset).toBeGreaterThan(startOffset);
  const entry = {functionName: 'run', isBlockCoverage: true, ranges: [{startOffset, endOffset, count: 3}]};
  // Oxc does not provide an exact mapping at the end of the `function`
  // keyword. Keep that count3 native entry visible and ineligible; never
  // fabricate an anchor or borrow a nearby point to manufacture coverage.
  expect(() => nativeFunctionMapper(transform)(entry)).toThrow(UnmappedNativeFunction);
  expect(() => nativeFunctionMapper(transform)(entry)).toThrow('MAP_EXACT');
  await expect(replay({...observation, code: projected.code + '/* altered projection */'})).rejects.toThrow();
  await expect(replay({...observation, ordering: observation.ordering.map(plugin => plugin.name === 'vite:define' ? {...plugin, name: 'unqualified-define'} : plugin)})).rejects.toThrow();
  const corrupted = structuredClone(transform.map!); corrupted.sourcesContent = [canonical + '/* changed source */'];
  expect(() => nativeFunctionMapper({...transform, map: corrupted})(entry)).toThrow('Source map does not bind canonical source');
});


it.each(['moduleUrl', 'urls.active'])('reconstructs the public query helper around the exact %s import argument', async argument => {
  // Real public runtime transform over synthetic source; no module behavior runs.
  const canonical = `const moduleUrl='/vendor/pdf.min.mjs',urls={active:moduleUrl};export function run(){return import(${argument});}`;
  const helper = 'import { injectQuery as __vite__injectQuery } from "/@vite/client";';
  const post = helper + canonical.replace(`import(${argument})`, `import(__vite__injectQuery(${argument}, 'import'))`), value = await fixture(canonical, post, true);
  const replay = (observation: NativeObservation) => replayNativeTransform(value.root, value.relative, canonical, value.runtime, value.snapshot, NATIVE_WRAPPER_PREFIX.length, value.geometry, observation, value.environment);
  await expect(replay(value.observation)).resolves.toMatchObject({canonical, runtime: value.runtime});
  await expect(replay({...value.observation, code: post.replace(`__vite__injectQuery(${argument},`, '__vite__injectQuery(otherUrl,')})).rejects.toThrow();
  await expect(replay({...value.observation, code: post.replace(", 'import')", ", 'other')")})).rejects.toThrow();
  await expect(replay({...value.observation, code: post.slice(helper.length)})).rejects.toThrow();
  await expect(replay({...value.observation, code: post + '/* unrelated mutation */'})).rejects.toThrow();
  const server = await fixture(canonical, post, false);
  await expect(replayNativeTransform(server.root, server.relative, canonical, server.runtime, server.snapshot, NATIVE_WRAPPER_PREFIX.length, server.geometry, server.observation, server.environment)).rejects.toThrow('Unsupported dynamic import rewrite');
});


it.each([
  ['undici', '/node_modules/undici/index.js'],
  ['@vercel/blob', '/node_modules/@vercel/blob/dist/index.js'],
])('reconstructs the installed SSR ESM package entry for %s without loading it', async (specifier, target) => {
  // Synthetic source and real public runtime output, not a native application capture.
  const canonical = `import external from '${specifier}'; ` + source;
  const post = canonical.replace(`'${specifier}'`, JSON.stringify(target)), value = await fixture(canonical, post);
  const replay = (observation: NativeObservation) => replayNativeTransform(value.root, value.relative, canonical, value.runtime, value.snapshot, NATIVE_WRAPPER_PREFIX.length, value.geometry, observation, value.environment);
  await expect(replay(value.observation)).resolves.toMatchObject({canonical, runtime: value.runtime});
  await expect(replay({...value.observation, code: post.replace(target, target.replace(/\.js$/, '.cjs'))})).rejects.toThrow();
  await expect(replay({...value.observation, code: post.replace(target, '/node_modules/other/index.js')})).rejects.toThrow();
  await expect(replay({...value.observation, code: post + '/* changed package source */'})).rejects.toThrow();
  const client = await fixture(canonical, post, true);
  await expect(replayNativeTransform(client.root, client.relative, canonical, client.runtime, client.snapshot, NATIVE_WRAPPER_PREFIX.length, client.geometry, client.observation, client.environment)).rejects.toThrow('Package import rewrite requires SSR');
});


it('reconstructs only the public fetch-layer leading hashbang blanking without moving native entries',async()=>{
 const hashbang='#!/usr/bin/env node',canonical=hashbang+'\n'+source,value=await fixture(canonical);
 const replay=(runtime=value.runtime,observation=value.observation,geometry=value.geometry)=>replayNativeTransform(value.root,value.relative,canonical,runtime,value.snapshot,NATIVE_WRAPPER_PREFIX.length,geometry,observation,value.environment);
 const transform=await replay();expect(transform.code.startsWith(' '.repeat(hashbang.length)+'\n')).toBe(true);
 expect(transform.map?.sourcesContent).toEqual([canonical]);
 const entry=own(transform,2);expect(nativeFunctionMapper(transform)(entry)).toEqual({start:canonical.indexOf('export function'),end:canonical.length,count:2});
 await expect(replay(value.runtime.replace(' '.repeat(hashbang.length)+'\n',' '.repeat(hashbang.length-1)+'\n'))).rejects.toThrow('Whole public Vite runtime reconstruction failed');
 await expect(replay(value.runtime.replace(' '.repeat(hashbang.length)+'\n',hashbang+'\n'))).rejects.toThrow('Whole public Vite runtime reconstruction failed');
 await expect(replay(value.runtime,{...value.observation,code:canonical.replace('env node','env other')})).rejects.toThrow();
 await expect(replay(value.runtime,value.observation,{...value.geometry,code:canonical.replace(hashbang,' '.repeat(hashbang.length))})).rejects.toThrow('Unqualified pre-transform projection');
 const corrupted=structuredClone(transform.map!);corrupted.sourcesContent=[canonical.replace(hashbang,' '.repeat(hashbang.length))];
 expect(()=>nativeFunctionMapper({...transform,map:corrupted})(entry)).toThrow('Source map does not bind canonical source');
});
