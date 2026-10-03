import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTypeScript, extractClassicBrowserFixtureBody } from '../scripts/build-typescript.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixtureRoot(source: string) {
  const directory = mkdtempSync(path.join(tmpdir(), 'getbased-classic-fixture-'));
  directories.push(directory);
  mkdirSync(path.join(directory, 'scripts'));
  mkdirSync(path.join(directory, 'tests'));
  writeFileSync(path.join(directory, 'scripts/classic-browser-fixture-entries.json'), JSON.stringify(['tests/test-classic-lane.ts']));
  writeFileSync(path.join(directory, 'tests/test-classic-lane.ts'), source);
  return directory;
}

describe('classic browser fixture body emission', () => {
  it('preserves synchronous return, sloppy execution and authored strict directives', () => {
    const sloppy = extractClassicBrowserFixtureBody('"use strict"; export function runBrowserFixture() { return this; }');
    const strict = extractClassicBrowserFixtureBody('export function runBrowserFixture() { "use strict"; return this; }');
    expect(new Function(sloppy)()).toBe(globalThis);
    expect(new Function(strict)()).toBeUndefined();
    expect(extractClassicBrowserFixtureBody('export function runBrowserFixture() { return 42; }')).toContain('return 42;');
    expect(new Function(extractClassicBrowserFixtureBody('export function runBrowserFixture() { return 42; }'))()).toBe(42);
  });

  it('retains returned promise identity, synchronous errors and microtask timing', async () => {
    const pending = Promise.resolve('finished');
    const unchanged = new Function('pending', extractClassicBrowserFixtureBody('export function runBrowserFixture() { return pending; }')) as (value: unknown) => unknown;
    expect(unchanged(pending)).toBe(pending);
    const failure = new Error('fixture synchronous error');
    const throwing = new Function('failure', extractClassicBrowserFixtureBody('export function runBrowserFixture() { throw failure; }'));
    expect(() => throwing(failure)).toThrow(failure);
    const trace: string[] = [];
    const execute = new Function('trace', 'pending', extractClassicBrowserFixtureBody('export function runBrowserFixture() { trace.push("before"); return pending.then(value => { trace.push(value); return 7; }); }'));
    const returned: unknown = (execute as (...args: unknown[]) => unknown)(trace, pending);
    expect(trace).toEqual(['before']);
    expect(await returned).toBe(7);
    expect(trace).toEqual(['before', 'finished']);
  });

  it.each([
    'export function runBrowserFixture() {} console.log("outside payload");',
    'console.log("outside payload"); export function runBrowserFixture() {}',
    'import "./payload.js"; export function runBrowserFixture() {}',
    'export async function runBrowserFixture() {}',
    'export function* runBrowserFixture() {}',
    'export function runBrowserFixture(argument) {}',
    'export default function runBrowserFixture() {}',
    'export function differentEntry() {}',
    'export function runBrowserFixture() {} export function runBrowserFixture() {}',
    '"use strict"; "use strict"; export function runBrowserFixture() {}',
    'export function runBrowserFixture() {',
  ])('rejects extraneous or changed compiled entry shape: %s', source => {
    expect(() => extractClassicBrowserFixtureBody(source)).toThrow();
  });

  it('rejects outside source payload and unapproved imports before any emission', () => {
    for (const source of [
      'export function runBrowserFixture() {} globalThis.payload = true;',
      'import { value } from "./unapproved.js"; export function runBrowserFixture() { return value; }',
      '"use strict"; export function runBrowserFixture() {}',
    ]) {
      const directory = fixtureRoot(source);
      writeFileSync(path.join(directory, 'tests/test-classic-lane.js'), 'original classic bytes');
      expect(() => buildTypeScript(directory)).toThrow(/expected only/);
      expect(readFileSync(path.join(directory, 'tests/test-classic-lane.js'), 'utf8')).toBe('original classic bytes');
    }
  });

  it('rejects invalid manifest entries and unregistered classic wrappers', () => {
    const directory = fixtureRoot('export function runBrowserFixture() { return 1; }');
    const manifest = path.join(directory, 'scripts/classic-browser-fixture-entries.json');
    for (const entries of [null, ['../outside.ts'], ['tests/test-classic-lane.ts', 'tests/test-classic-lane.ts']]) {
      writeFileSync(manifest, JSON.stringify(entries));
      expect(() => buildTypeScript(directory)).toThrow(/manifest/);
    }
    writeFileSync(manifest, '[]');
    expect(() => buildTypeScript(directory)).toThrow(/not registered/);
  });

  it('strictly compiles native Node fixtures and extracts classic bodies without emitting unit or browser specs', async () => {
    const directory = fixtureRoot('type FixtureResult = {checked: boolean};\nexport function runBrowserFixture(): Promise<FixtureResult> { return Promise.resolve({checked: true}); }');
    symlinkSync(path.join(repo, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    mkdirSync(path.join(directory, 'js'));
    mkdirSync(path.join(directory, 'tests/playwright'));
    writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
    const config = { extends: path.join(repo, 'tsconfig.migration.json'), include: ['runtime.ts'], exclude: [] };
    writeFileSync(path.join(directory, 'tsconfig.migration.json'), JSON.stringify(config));
    writeFileSync(path.join(directory, 'runtime.ts'), 'export const ready = true;');
    const bootstraps = ['service-worker', 'service-worker-runtime', 'service-worker-assets', 'version', 'js/theme-bootstrap', 'js/extra-theme-bootstrap', 'js/legal-consent-bootstrap', 'js/analytics-bootstrap', 'js/app-extension-bootstrap'];
    for (const name of bootstraps) writeFileSync(path.join(directory, name + '.ts'), 'console.log("bootstrap fixture");');
    writeFileSync(path.join(directory, 'tsconfig.worker-migration.json'), JSON.stringify({ extends: './tsconfig.migration.json', include: bootstraps.slice(0, 4).map(name => name + '.ts') }));
    writeFileSync(path.join(directory, 'tsconfig.bootstrap-migration.json'), JSON.stringify({ extends: './tsconfig.migration.json', include: bootstraps.slice(4).map(name => name + '.ts') }));
    writeFileSync(path.join(directory, 'tsconfig.fixture-migration.json'), readFileSync(path.join(repo, 'tsconfig.fixture-migration.json')));
    writeFileSync(path.join(directory, 'tests/test-node-lane.ts'), 'export const nodeFixture = "regular Node module";');
    writeFileSync(path.join(directory, 'tests/not-emitted.test.ts'), 'export const unitFixture = true;');
    writeFileSync(path.join(directory, 'tests/playwright/not-emitted.spec.ts'), 'export const browserSpec = true;');
    buildTypeScript(directory);
    const emitted = readFileSync(path.join(directory, 'tests/test-classic-lane.js'), 'utf8');
    expect(emitted).not.toContain('export');
    expect(emitted).not.toContain('use strict');
    expect(await new Function(emitted)()).toEqual({ checked: true });
    expect(readFileSync(path.join(directory, 'tests/test-node-lane.js'), 'utf8')).toContain('export const nodeFixture');
    expect(existsSync(path.join(directory, 'tests/not-emitted.test.js'))).toBe(false);
    expect(existsSync(path.join(directory, 'tests/playwright/not-emitted.spec.js'))).toBe(false);
    for (const name of bootstraps) expect(readFileSync(path.join(directory, name + '.js'), 'utf8')).not.toMatch(/^"use strict"/);
  });
});
