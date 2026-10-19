import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {productionSources, productionFunctionIndex} from './coverage-source.mjs';
import {nativeDigest, readNativeRegular, readNativeBlob, portable} from './native-coverage-storage.mjs';
import {NativeCaptureMapper} from './native-coverage-capture.mjs';
import {validateNativeCases} from './native-coverage-cases.mjs';
import type {NativeContext, NativeSuiteCapture, NativeMappedCapture, NativeUnattributedScript} from './native-coverage-types.mjs';
export {nativeDigest, readNativeRegular} from './native-coverage-storage.mjs';

export const NATIVE_COVERAGE_FILE = 'coverage-functions.json';
export interface NativeCalledFunction {start: number; end: number; count: number;}
export interface NativeUnmappedFunction {start: number; end: number; count: number; runtimeLength: number; reason: string;}
export interface NativeCoverageFile {
  file: string;
  sourceHash: string;
  sourceLength: number;
  mapHash?: string;
  called: NativeCalledFunction[];
  unmapped: NativeUnmappedFunction[];
}
export interface NativeTransportFile {file: string; sha256: string; bytes: number;}
export interface NativeCoverageReceipt {
  schemaVersion: 1;
  producer: 'native-v8-own-functions';
  revision: string;
  runId: string;
  complete: true;
  functionsOnly: true;
  statements: null;
  branches: null;
  bytes: null;
  files: NativeCoverageFile[];
  unattributed: NativeUnattributedScript[];
  tests: {modules: number; cases: number; passed: number; skipped: number;};
  transport: NativeTransportFile[];
}
export interface NativeCoverageReadOptions {root?: string; expectedRevision?: string;}
function record(value: unknown): Record<string, unknown> {assert(value && typeof value === 'object' && !Array.isArray(value)); return value as Record<string, unknown>;}
function integer(value: unknown): asserts value is number {assert(Number.isSafeInteger(value) && Number(value) >= 0, 'Invalid native coverage integer');}
function hash(value: unknown): asserts value is string {assert(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'Invalid native coverage hash');}
/** Structural/current-source validation; consumers must use readNativeFunctionCoverage to authenticate raw counts and case membership. */
export function validateNativeFunctionCoverage(value: unknown, {root = process.cwd(), expectedRevision}: NativeCoverageReadOptions = {}): NativeCoverageReceipt {
  const receipt = record(value);
  assert(receipt['schemaVersion'] === 1 && receipt['producer'] === 'native-v8-own-functions' && receipt['complete'] === true && receipt['functionsOnly'] === true, 'Incomplete native function coverage');
  assert(receipt['statements'] === null && receipt['branches'] === null && receipt['bytes'] === null, 'Native function coverage cannot claim Istanbul or byte metrics');
  assert(typeof receipt['revision'] === 'string' && /^[a-f0-9]{40}$/.test(receipt['revision']));
  const revision = expectedRevision ?? execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
  assert.equal(receipt['revision'], revision, 'Native coverage belongs to another revision');
  assert(typeof receipt['runId'] === 'string' && /^[a-f0-9-]{36}$/.test(receipt['runId']));
  assert(Array.isArray(receipt['files']));
  const expected = productionSources(root, {runtime: true});
  const files = receipt['files'].map(raw => record(raw));
  assert.deepEqual(files.map(file => file['file']), expected, 'Native coverage must inventory every current production source once, in canonical order');
  for (const file of files) {
    portable(file['file']); hash(file['sourceHash']); integer(file['sourceLength']);
    const bytes = readNativeRegular(path.join(root, file['file'])), source = bytes.toString('utf8');
    assert.equal(nativeDigest(bytes), file['sourceHash'], `Stale native source: ${file['file']}`);
    assert.equal(source.length, file['sourceLength'], 'Native coverage source length mismatch');
    if (/\.svelte\.(?:native|html)\.js$/.test(file['file'])) {hash(file['mapHash']); assert.equal(nativeDigest(readNativeRegular(path.join(root, `${file['file']}.map`))), file['mapHash'], 'Stale native component ownership map');}
    else assert(file['mapHash'] === undefined, 'Unexpected component ownership map');
    const index = productionFunctionIndex(source, file['file'], root), owned = new Set(index.owned.map(fn => `${fn.start}:${fn.end}`)), seen = new Set<string>();
    assert(Array.isArray(file['called']) && Array.isArray(file['unmapped']));
    for (const raw of file['called']) {const fn = record(raw); integer(fn['start']); integer(fn['end']); integer(fn['count']); const key = `${fn['start']}:${fn['end']}`; assert(Number(fn['count']) > 0 && Number(fn['end']) > Number(fn['start']) && owned.has(key) && !seen.has(key), 'Invalid, duplicate or non-owned canonical native function'); seen.add(key);}
    for (const raw of file['unmapped']) {const fn = record(raw); for (const field of ['start', 'end', 'count', 'runtimeLength']) integer(fn[field]); assert(Number(fn['end']) > Number(fn['start']) && Number(fn['end']) <= Number(fn['runtimeLength']) && typeof fn['reason'] === 'string' && fn['reason'].length > 0, 'Malformed unmapped native entry');}
  }
  assert(Array.isArray(receipt['unattributed']));
  for (const raw of receipt['unattributed']) {const item = record(raw); portable(item['capture']); hash(item['sourceHash']); assert(typeof item['scriptId'] === 'string' && item['scriptId'].length > 0); for (const field of ['runtimeLength', 'functions', 'positiveOwnFunctions']) integer(item[field]); assert(Number(item['functions']) > 0 && Number(item['positiveOwnFunctions']) <= Number(item['functions']));}
  const tests = record(receipt['tests']); for (const field of ['modules', 'cases', 'passed', 'skipped']) integer(tests[field]);
  assert(Number(tests['modules']) > 0 && Number(tests['passed']) > 0 && Number(tests['cases']) === Number(tests['passed']) + Number(tests['skipped']), 'Incomplete native test execution');
  assert(Array.isArray(receipt['transport']) && receipt['transport'].length > 0, 'Missing native capture transport');
  const names = new Set<string>();
  for (const raw of receipt['transport']) {const file = record(raw); portable(file['file']); hash(file['sha256']); integer(file['bytes']); assert(!names.has(file['file']), 'Duplicate native capture transport'); names.add(file['file']);}
  return receipt as unknown as NativeCoverageReceipt;
}
/** Derive the portable summary from raw own entries. Unknown ranges remain visible and earn zero credit. */
export function nativeCoverageSummary(config: NativeContext, mapped: readonly NativeMappedCapture[]): NativeCoverageFile[] {
  const called = new Map<string, Map<string, NativeCalledFunction>>(), unmapped = new Map<string, Map<string, NativeUnmappedFunction>>();
  for (const capture of mapped) {
    for (const item of capture.called) {const rows = called.get(item.file) ?? new Map<string, NativeCalledFunction>(), key = `${item.start}:${item.end}`, previous = rows.get(key); rows.set(key, {start: item.start, end: item.end, count: Math.max(previous?.count ?? 0, item.count)}); called.set(item.file, rows);}
    for (const item of capture.unmapped) {const rows = unmapped.get(item.file) ?? new Map<string, NativeUnmappedFunction>(), key = JSON.stringify([item.start, item.end, item.runtimeLength, item.reason]), previous = rows.get(key); rows.set(key, {start: item.start, end: item.end, count: Math.max(previous?.count ?? 0, item.count), runtimeLength: item.runtimeLength, reason: item.reason}); unmapped.set(item.file, rows);}
  }
  return config.sources.map(file => {
    const bytes = readNativeRegular(path.join(config.root, file)), result: NativeCoverageFile = {file, sourceHash: nativeDigest(bytes), sourceLength: bytes.toString('utf8').length, called: [...(called.get(file)?.values() ?? [])].sort((a, b) => a.start - b.start || a.end - b.end), unmapped: [...(unmapped.get(file)?.values() ?? [])].sort((a, b) => a.start - b.start || a.end - b.end || a.runtimeLength - b.runtimeLength || a.reason.localeCompare(b.reason))};
    if (/\.svelte\.(?:native|html)\.js$/.test(file)) result.mapHash = nativeDigest(readNativeRegular(path.join(config.root, file + '.map'))); return result;
  });
}
/** Hash all transport, replay whole public transforms, rederive exact scalar keys/counts, and bind actual test membership. */
export async function readNativeFunctionCoverage(file: string, options: NativeCoverageReadOptions = {}): Promise<NativeCoverageReceipt> {
  const root = options.root ?? process.cwd(), directory = path.dirname(file), receipt = validateNativeFunctionCoverage(JSON.parse(readNativeRegular(file).toString('utf8')), options);
  const names = new Set<string>(), sealed = new Map<string, Buffer>();
  for (const item of receipt.transport) {const bytes = readNativeBlob(directory, item); if (['context.json', 'captures.json', 'cases.json'].includes(item.file)) sealed.set(item.file, bytes); names.add(item.file);}
  assert(names.has('captures.json') && names.has('cases.json') && names.has('context.json'), 'Missing independent native capture/case proof');
  // Every candidate transform is sealed. Extra unsealed observations cannot influence replay.
  for (const name of fs.readdirSync(directory)) if (/^(?:geometry|observation)-[a-f0-9]{64}\.json$/.test(name)) assert(names.has(name), 'Unsealed native transform observation');
  const context = JSON.parse(sealed.get('context.json')!.toString('utf8')) as NativeContext;
  assert.equal(context.root, root, 'Native coverage source root differs'); assert.equal(context.runId, receipt.runId); assert.equal(context.revision, receipt.revision); assert.deepEqual(context.sources, receipt.files.map(item => item.file));
  const config: NativeContext = {...context, root, directory};
  const captures = JSON.parse(sealed.get('captures.json')!.toString('utf8')) as NativeSuiteCapture[];
  assert(Array.isArray(captures) && captures.length > 0); const captureNames = new Set<string>();
  for (const capture of captures) {
    assert(capture && typeof capture.project === 'string' && typeof capture.environment === 'string' && Array.isArray(capture.testFiles) && capture.testFiles.length > 0);
    capture.testFiles.forEach(portable); assert(names.has(capture.file.file) && !captureNames.has(capture.file.file), 'Missing or reused native capture'); captureNames.add(capture.file.file);
    const raw = JSON.parse(readNativeBlob(directory, capture.file).toString('utf8')) as {raw: NativeTransportFile; snapshots: {source: NativeTransportFile}[]};
    assert(names.has(raw.raw.file)); readNativeBlob(directory, raw.raw); assert(Array.isArray(raw.snapshots));
    for (const snapshot of raw.snapshots) {assert(names.has(snapshot.source.file)); readNativeBlob(directory, snapshot.source);}
  }
  const cases: unknown = JSON.parse(sealed.get('cases.json')!.toString('utf8'));
  assert.deepEqual(validateNativeCases(cases, config, captures), receipt.tests, 'Native test summary differs from independent public membership proof');
  const mapper = new NativeCaptureMapper(config, names), mapped: NativeMappedCapture[] = [];
  for (const capture of captures) mapped.push(await mapper.map(capture));
  assert.deepEqual(mapped.flatMap(capture => capture.unattributed), receipt.unattributed, 'Unattributed script summary differs from authenticated raw captures');
  assert.deepEqual(nativeCoverageSummary(config, mapped), receipt.files, 'Native key/count/unknown summary differs from actual raw own-entry witnesses');
  // Return the original object: callers can compare a second descriptor-bound read after asynchronous replay.
  return receipt;
}
