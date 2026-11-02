import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {expect, it} from 'vitest';
import {productionFunctionIndex} from '../scripts/coverage-source.mjs';
import {sourceFingerprint} from '../scripts/coverage-model-helpers.mjs';
import {addBrowserEntriesToModel, readPlaywrightCoverageShards, summarizeCoverageModel} from '../scripts/playwright-coverage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
it('streaming preserves exact function/byte unions, source rejection and unreadable-shard diagnostics', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-coverage-fold-'));
  try {
    const file = 'js/unique-id.js', source = fs.readFileSync(path.join(root, file), 'utf8');
    const functions = productionFunctionIndex(source, file, root).owned;
    expect(functions.length).toBeGreaterThan(1);
    const entry = (called: number) => ({url: '/' + file, text: source, ...sourceFingerprint(source),
      functions: functions.map((fn, index) => ({functionName: fn.name, ranges: [{startOffset: fn.start, endOffset: fn.end, count: index === called ? 1 : 0}]}))});
    const entries = [entry(0), {...entry(0), sourceHash: '0'.repeat(64)}, entry(1)];
    entries.forEach((value, index) => fs.writeFileSync(path.join(directory, `${index}.json`), JSON.stringify({entries: [value]})));
    fs.writeFileSync(path.join(directory, 'broken.json'), '{broken');
    const expected: Parameters<typeof summarizeCoverageModel>[0] = new Map(); addBrowserEntriesToModel(expected, entries);
    const rejected: Parameters<typeof summarizeCoverageModel>[0] = new Map(); addBrowserEntriesToModel(rejected, [entries[1]!]);
    expect(rejected.size).toBe(0);
    const streamed = readPlaywrightCoverageShards(directory);
    expect(summarizeCoverageModel(streamed.model)).toEqual(summarizeCoverageModel(expected));
    const covered = new Uint8Array(source.length);
    for (const fn of functions.slice(0, 2)) covered.fill(1, fn.start, fn.end);
    expect(summarizeCoverageModel(streamed.model).totals).toEqual({total: source.length,
      covered: covered.reduce((total, byte) => total + byte, 0), fnTotal: functions.length, fnCalled: 2});
    expect(streamed.fixtures).toHaveLength(3); expect(streamed.files).toHaveLength(4);
    expect(streamed.unreadable.map(item => item.file)).toEqual(['broken.json']);
    expect(readPlaywrightCoverageShards(path.join(directory, 'missing')).model.size).toBe(0);
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
});
it('reads thousands of real-source shards within a fixed small Node heap', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-coverage-stream-'));
  try {
    const file = 'js/cashu-wallet.js', source = fs.readFileSync(path.join(root, file), 'utf8');
    const fn = productionFunctionIndex(source, file, root).owned[0]!;
    const entry = {url: '/' + file, text: source, ...sourceFingerprint(source),
      functions: [{functionName: fn.name, ranges: [{startOffset: fn.start, endOffset: fn.end, count: 1}]}]};
    const first = path.join(directory, '0000.json'); fs.writeFileSync(first, JSON.stringify({entries: [entry]}));
    // Hard links provide independent shard reads without writing hundreds of MB.
    const count = 4000;
    for (let index = 1; index < count; index++) fs.linkSync(first, path.join(directory, `${String(index).padStart(4, '0')}.json`));
    const module = pathToFileURL(path.join(root, 'scripts/playwright-coverage.mjs')).href;
    const script = `import {readPlaywrightCoverageShards} from ${JSON.stringify(module)}; const result = readPlaywrightCoverageShards(process.argv[1]); console.log(JSON.stringify({fixtures: result.fixtures.length, files: result.files.length}));`;
    const child = spawnSync(process.execPath, ['--max-old-space-size=96', '--input-type=module', '--eval', script, directory],
      {cwd: root, encoding: 'utf8', timeout: 12000, maxBuffer: 2 * 1024 * 1024});
    expect(child.status, child.stderr.slice(0, 1600)).toBe(0);
    expect(JSON.parse(child.stdout.trim())).toEqual({fixtures: count, files: count});
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
}, 15000);
