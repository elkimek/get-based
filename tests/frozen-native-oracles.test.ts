import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {qualifyFrozenNativeOracles} from '../scripts/frozen-native-oracles.mjs';
import {buildMigrationProgress, migrationSourceFiles} from '../scripts/migration-progress.js';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archive = 'tests/fixtures/archived-native-ui';
const manifests = ['original-source-pins.json', 'marker-original-source-pins.json'];
const renderers = fs.readdirSync(path.join(repository, archive, 'components')).filter(file => file.endsWith('.js')).map(file => `${archive}/components/${file}`).sort();
const originals = [...manifests.map(file => `${archive}/${file}`), ...renderers];
const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fixture(run: (root: string, inventory: string[]) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-frozen-oracles-'));
  try {
    for (const file of originals) {fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.copyFileSync(path.join(repository, file), path.join(root, file));}
    fs.mkdirSync(path.join(root, 'js')); fs.writeFileSync(path.join(root, 'js/native.ts'), 'export const value: number = 1;\n');
    run(root, [...originals, 'js/native.ts']);
  } finally {fs.rmSync(root, {recursive: true, force: true});}
}
describe('finite frozen native renderer classification', () => {
  it('qualifies the original fifteen renderer bytes without altering source or LOC accounting', () => fixture((root, inventory) => {
    expect(renderers).toHaveLength(15);
    const before = Object.fromEntries(originals.map(file => [file, hash(path.join(root, file))]));
    expect([...qualifyFrozenNativeOracles(root, inventory)].sort()).toEqual(renderers);
    expect(migrationSourceFiles(root, inventory)).toEqual([...renderers, 'js/native.ts']);
    const report = buildMigrationProgress(root, inventory, {commit: 'fixed', totals: {lines: 10000, nonblank: 9000}});
    expect(report.migrated).toBe(true); expect(report.authoredJavaScriptFiles).toBe(0); expect(report.authoredTypeScriptFiles).toBe(1);
    expect(report.remainingRuntimeJavaScriptFiles).toEqual([]); expect(report.frozenHistoricalOracles.files.sort()).toEqual(renderers);
    expect(report.current.lines).toBe(report.frozenHistoricalOracles.lines + 1);
    expect(report.current.nonblank).toBe(report.frozenHistoricalOracles.nonblank + 1);
    expect(Object.fromEntries(originals.map(file => [file, hash(path.join(root, file))]))).toEqual(before);
  }));
  it.each(renderers)('rejects changed original renderer %s', file => fixture((root, inventory) => {
    fs.appendFileSync(path.join(root, file), '\n// changed\n');
    expect(() => buildMigrationProgress(root, inventory, {commit: 'fixed', totals: {lines: 1, nonblank: 1}})).toThrow('Changed frozen native renderer');
  }));
  it.each(manifests)('rejects even JSON-equivalent byte changes to original pin manifest %s', file => fixture((root, inventory) => {
    fs.appendFileSync(path.join(root, archive, file), '\n');
    expect(() => qualifyFrozenNativeOracles(root, inventory)).toThrow('Changed frozen native manifest');
  }));
  it.each([renderers[0]!, ...manifests.map(file => `${archive}/${file}`)])('rejects missing original bytes before source-existence filtering: %s', file => fixture((root, inventory) => {
    fs.unlinkSync(path.join(root, file));
    expect(() => migrationSourceFiles(root, inventory)).toThrow();
  }));
  it('rejects a removed complete archive while it is still inventoried', () => fixture((root, inventory) => {
    fs.rmSync(path.join(root, archive), {recursive: true});
    expect(() => migrationSourceFiles(root, inventory)).toThrow('Missing inventoried frozen native archive');
  }));
  it.each([renderers[0]!, `${archive}/${manifests[0]}`])('rejects linked original evidence: %s', file => fixture((root, inventory) => {
    const body = fs.readFileSync(path.join(root, file)), linked = path.join(root, 'same-original-bytes');
    fs.writeFileSync(linked, body); fs.unlinkSync(path.join(root, file)); fs.symlinkSync(linked, path.join(root, file));
    expect(() => qualifyFrozenNativeOracles(root, inventory)).toThrow('regular file');
  }));
  it('does not follow linked component directories even when their bytes are identical', () => fixture((root, inventory) => {
    const directory = path.join(root, archive, 'components'), moved = path.join(root, 'same-components');
    fs.renameSync(directory, moved); fs.symlinkSync(moved, directory, 'dir');
    expect(() => qualifyFrozenNativeOracles(root, inventory)).toThrow('linked ancestors');
  }));
  it.each([`${archive}/components/Unknown.svelte.html.js`, `${archive}/unknown.js`, 'js/unknown.js', 'tests/unknown.test.js'])('keeps unknown authored JavaScript blocking migration: %s', file => fixture((root, inventory) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.writeFileSync(path.join(root, file), 'export const unknown = 1;');
    const report = buildMigrationProgress(root, [...inventory, file], {commit: 'fixed', totals: {lines: 10000, nonblank: 9000}});
    expect(report.migrated).toBe(false); expect(report.authoredJavaScriptFiles).toBe(1); expect(report.frozenHistoricalOracles.files).toHaveLength(15);
    expect(migrationSourceFiles(root, [...inventory, file])).toContain(file);
  }));
  it('allows synthetic roots without archival inputs without exempting ordinary JavaScript', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-no-archive-'));
    try {
      expect([...qualifyFrozenNativeOracles(root, [])]).toEqual([]);
      fs.writeFileSync(path.join(root, 'ordinary.js'), 'export const value = 1;');
      expect(buildMigrationProgress(root, ['ordinary.js'], {commit: 'fixed', totals: {lines: 1, nonblank: 1}}).migrated).toBe(false);
    } finally {fs.rmSync(root, {recursive: true, force: true});}
  });
});
