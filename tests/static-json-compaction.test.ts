// @vitest-environment node
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach, expect, it} from 'vitest';
import {compactStaticJson} from '../scripts/static-build-assets.mjs';
const roots: string[] = [];
afterEach(async () => {for (const root of roots.splice(0)) await rm(root, {recursive: true, force: true});});
it('preserves exact numeric and string literals and duplicate-key order', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'getbased-data-copy-')); roots.push(root);
  await mkdir(path.join(root, 'data'));
  const file = path.join(root, 'data/catalog.json');
  const source = '{\n "n": 9007199254740993, "fraction": 1.2300e+4, "zero": -0, "text": "two  spaces \\" quote \\\\ slash", "same": 1, "same": 2\n}\n';
  const expected = '{"n":9007199254740993,"fraction":1.2300e+4,"zero":-0,"text":"two  spaces \\" quote \\\\ slash","same":1,"same":2}';
  await writeFile(file, source);
  const result = await compactStaticJson(root, ['/data/catalog.json', '/data/catalog.json']);
  expect(await readFile(file, 'utf8')).toBe(expected);
  expect(result).toEqual({before: Buffer.byteLength(source), after: Buffer.byteLength(expected), saved: Buffer.byteLength(source) - Buffer.byteLength(expected)});
  expect(JSON.parse(expected)).toEqual(JSON.parse(source));
});
it('rejects invalid data and path traversal without rewriting source bytes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'getbased-data-copy-')); roots.push(root);
  await mkdir(path.join(root, 'data'));
  const invalid = path.join(root, 'data/invalid.json'); await writeFile(invalid, '{ "broken": }');
  await expect(compactStaticJson(root, ['/data/invalid.json'])).rejects.toThrow();
  expect(await readFile(invalid, 'utf8')).toBe('{ "broken": }');
  await expect(compactStaticJson(root, ['/data/../outside.json'])).rejects.toThrow('leaves copied data directory');
});
