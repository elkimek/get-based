// @vitest-environment node
import {mkdtemp, mkdir, copyFile, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {afterEach, expect, it} from 'vitest';
import {assertLegacyEvoluEncoding, compactLegacyEvoluAssets} from '../scripts/legacy-evolu-compaction.mjs';

const directories: string[] = [];
const files = ['Db.worker.js', 'evolu-bundle.js'];
afterEach(async () => {for (const directory of directories.splice(0)) await rm(directory, {recursive: true, force: true});});
async function copiedGraph() {
  const directory = await mkdtemp(path.join(tmpdir(), 'getbased-legacy-encoding-')); directories.push(directory);
  await mkdir(path.join(directory, 'vendor/evolu'), {recursive: true});
  for (const file of files) await copyFile('vendor/evolu/' + file, path.join(directory, 'vendor/evolu', file));
  return directory;
}
it('compacts the complete frozen graph without changing sources, names, coordinates or legal notices', async () => {
  const originals = await Promise.all(files.map(file => readFile('vendor/evolu/' + file, 'utf8')));
  const directory = await copiedGraph();
  const result = await compactLegacyEvoluAssets(directory);
  expect(result).toEqual({files: 2, before: 1802787, after: 1105530, saved: 697257});
  const hashes = ['5e04be37348b943afec706709331291f11555180719fa6a6cb4cd0cc65ebf734', '1d7aaa40fdc632d47b5d3ae9e265d2903b8ecb7160bad8e2cb634ee5259e0103'];
  for (const [index, file] of files.entries()) {
    const output = await readFile(path.join(directory, 'vendor/evolu', file), 'utf8');
    expect(createHash('sha256').update(output).digest('hex')).toBe(hashes[index]);
    await assertLegacyEvoluEncoding(originals[index]!, output);
    expect(await readFile('vendor/evolu/' + file, 'utf8')).toBe(originals[index]);
  }
});
it('rejects an unexpected input before replacing any copied body', async () => {
  const directory = await copiedGraph();
  const first = path.join(directory, 'vendor/evolu', files[0]!);
  const before = await readFile(first, 'utf8');
  const changed = path.join(directory, 'vendor/evolu', files[1]!);
  await writeFile(changed, (await readFile(changed, 'utf8')) + '\n');
  await expect(compactLegacyEvoluAssets(directory)).rejects.toThrow('Exact frozen legacy input');
  expect(await readFile(first, 'utf8')).toBe(before);
});
it('accepts only formatting and equivalent untagged string quoting', async () => {
  await assertLegacyEvoluEncoding('export const text = "a\\nb"; const n = 0x10;', 'export const text=`a\\nb`;const n=16;');
});
it.each([
  ['export const n=1;', 'export const n=2;'],
  ['export const n=1;', 'export const renamed=1;'],
  ['import "./sqlite.js";', 'import "./other.js";'],
  ['new Worker(new URL("./Db.worker.js",import.meta.url));', 'new Worker(new URL("./other.js",import.meta.url));'],
  ['function f(){return\n1;}', 'function f(){return 1;}'],
  ['(value?.method)();', 'value?.method();'],
  ['const r=/a/i;', 'const r=/a/g;'],
  ['const n=123n;', 'const n=124n;'],
  ['const n=-0;', 'const n=0;'],
  ['tag`\\u0061`;', 'tag`a`;'],
  ['"use strict";run();', '`use strict`;run();'],
  ['/*! MIT License */ const n=1;', 'const n=1;'],
  ['/* Copyright A */ /* Permission B */ const n=1;', '/* Permission B */ /* Copyright A */ const n=1;'],
])('rejects executable or notice changes: %s', async (source, output) => {
  await expect(assertLegacyEvoluEncoding(source, output)).rejects.toThrow();
});
it('rejects invalid source or output', async () => {
  await expect(assertLegacyEvoluEncoding('const broken=;', 'const valid=1;')).rejects.toThrow('Valid original');
  await expect(assertLegacyEvoluEncoding('const valid=1;', 'const broken=;')).rejects.toThrow('Valid compact');
});
