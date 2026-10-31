import {expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {NativeCaptureMapper} from '../scripts/native-coverage-capture.mjs';
import {nativeDigest, writeNativeBlob, writeNativeCapture, writeNativeJSON} from '../scripts/native-coverage-storage.mjs';
import type {NativeCapture, NativeContext, NativeRaw, NativeSnapshot, NativeSuiteCapture} from '../scripts/native-coverage-types.mjs';

// Synthetic transport controls exercise ordering and counter isolation, without
// claiming execution of production code or manufacturing a release receipt.
it('preserves script order and actual per-capture counters across full and partial batches', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-mapping-batch-'));
  try {
    const directory = path.join(root, 'captures'); fs.mkdirSync(directory); fs.mkdirSync(path.join(root, 'js'));
    const sources = Array.from({length: 19}, (_, index) => `js/file-${index}.js`);
    const texts = new Map(sources.map((file, index) => [file, `export function run() { return ${index}; }`]));
    for (const [file, text] of texts) fs.writeFileSync(path.join(root, file), text);
    const config: NativeContext = {root, directory, runId: randomUUID(), revision: 'a'.repeat(40), sources};
    const mapper = new NativeCaptureMapper(config);
    function capture(rows: Array<{index: number; count: number}>): NativeSuiteCapture {
      const id = randomUUID(), raw: NativeRaw = {timestamp: Date.now(), result: []}, snapshots: NativeSnapshot[] = [];
      for (const [position, row] of rows.entries()) {
        const file = sources[row.index]!, text = texts.get(file)!, scriptId = String(position + 1), url = pathToFileURL(path.join(root, file)).href;
        raw.result.push({scriptId, url, functions: [{functionName: 'run', isBlockCoverage: true, ranges: [{startOffset: text.indexOf('function'), endOffset: text.length, count: row.count}]}]});
        snapshots.push({file, scriptId, url, metadata: {scriptId, url, startLine: 0, startColumn: 0, endLine: 0, endColumn: text.length, executionContextId: 1, hash: nativeDigest(text)}, source: writeNativeBlob(directory, text), sourceLength: text.length});
      }
      const value: NativeCapture = {schemaVersion: 1, runId: config.runId, revision: config.revision, holderId: randomUUID(), pid: process.pid, environment: {name: 'node', viteEnvironment: 'ssr', consumer: 'server'}, raw: writeNativeJSON(directory, `raw-${id}.json`, raw), snapshots, moduleExecutionInfo: [], completed: true};
      return {file: writeNativeCapture(directory, `capture-${id}.json`, value), testFiles: ['tests/native-coverage-batching.test.ts'], project: '', environment: 'ssr'};
    }
    const initial = Array.from({length: 17}, (_, index) => ({index, count: index + 1}));
    const first = await mapper.map(capture(initial));
    expect(first.called.map(value => [value.file, value.count])).toEqual(initial.map(value => [sources[value.index], value.count]));
    expect(first.unmapped).toEqual([]);
    const mixed = [{index: 17, count: 3}, {index: 16, count: 4}, {index: 18, count: 5}, {index: 0, count: 0}];
    const second = await mapper.map(capture(mixed));
    expect(second.called.map(value => [value.file, value.count])).toEqual(mixed.filter(value => value.count > 0).map(value => [sources[value.index], value.count]));
    expect(second.unmapped).toEqual([]);
    const zeros = await mapper.map(capture(initial.map(value => ({...value, count: 0}))));
    expect(zeros.called).toEqual([]);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
