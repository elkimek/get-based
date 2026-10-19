import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {expect, it} from 'vitest';
import type {TestProject} from 'vitest/node';
import coverageGlobalSetup from './helpers/coverage-global-setup.js';
import {createCoverageInventory, qualifyCoverageUnion} from '../scripts/ci-results.mjs';
import {matchSourceFunction, productionFunctionIndex, sourceFunctions} from '../scripts/coverage-source.mjs';

type Position = {line: number; column: number | null};
type Span = {start: Position; end: Position};
type FileCoverage = {
  path: string;
  b: Record<string, number[]>;
  s: Record<string, number>;
  f: Record<string, number>;
  branchMap: Record<string, {type: string; loc: Span}>;
  fnMap: Record<string, {name: string; loc: Span; decl: Span}>;
};
const root = process.cwd();
const component = 'js/components/WearableDetailFeedback.svelte';
const decision = `export async function decision(mode, confirm) {
  const apply = mode === 'apply' ? true : mode === 'review' ? false : await confirm();
  if (!apply) {
    return 'declined';
  }
  return 'applied';
}
export const first = {run() { return 'first'; }};
export const second = {run() { return 'second'; }};
`;

function locationOffset(source: string, position: Position) {
  const lines = source.split('\n');
  expect(Number.isInteger(position.line) && position.line > 0 && position.line <= lines.length).toBe(true);
  expect(position.column === null || (Number.isInteger(position.column) && position.column >= 0)).toBe(true);
  return lines.slice(0, position.line - 1).reduce((sum, line) => sum + line.length + 1, 0) + (position.column || 0);
}
function functionIdentity(source: string, entry: FileCoverage['fnMap'][string], file: string) {
  // Use the same body-first coordinate contract as the combined collector.
  const body = [locationOffset(source, entry.loc.start), locationOffset(source, entry.loc.end)] as const;
  const span = body[1] > body[0] ? body : [locationOffset(source, entry.decl.start), locationOffset(source, entry.decl.end)] as const;
  const index = file.endsWith('.svelte.native.js') || file.endsWith('.svelte.html.js')
    ? productionFunctionIndex(source, file, root) : {owned: sourceFunctions(source, file), thirdParty: []};
  return {
    owned: matchSourceFunction(index.owned, span[0], span[1], 'istanbul'),
    framework: matchSourceFunction(index.thirdParty, span[0], span[1], 'istanbul'),
  };
}

it.each([
  {enabled: false, provider: 'istanbul', include: ['**/*.js'], exclude: [], expected: []},
  {enabled: true, provider: 'v8', include: ['**/*.js'], exclude: [], expected: []},
  {enabled: true, provider: 'istanbul', include: ['service-worker-runtime.js'], exclude: [], expected: ['service-worker-runtime.js']},
  {enabled: true, provider: 'istanbul', include: ['**/*.js'], exclude: ['service-worker-assets.js'], expected: ['service-worker.js', 'service-worker-runtime.js']},
  {enabled: true, provider: 'istanbul', include: ['**/*.js'], exclude: ['service-worker*.js'], expected: []},
])('qualifies only configured classic scripts: $enabled/$provider/$include/$exclude', options => {
  const provided: {key: string; files: string[]}[] = [];
  coverageGlobalSetup({config: {root, coverage: options},
    provide: (key: string, files: string[]) => provided.push({key, files}),
  } as unknown as TestProject);
  expect(provided).toEqual([{key: 'getbasedClassicCoverageFiles', files: options.expected.map(file => path.join(root, file))}]);
});

it('produces genuine nonnegative branch counts and preserves compiled function identities across unit and browser coverage', async () => {
  const notes = path.join(root, '.local-notes'); fs.mkdirSync(notes, {recursive: true});
  const directory = fs.mkdtempSync(path.join(notes, 'coverage-producer-'));
  const relative = (file: string) => path.relative(root, file).replaceAll(path.sep, '/');
  try {
    const mixed = path.join(directory, 'mixed.js'), awaited = path.join(directory, 'awaited.js');
    fs.writeFileSync(mixed, decision); fs.writeFileSync(awaited, decision);
    const fixture = path.join(directory, 'producer.test.js');
    fs.writeFileSync(fixture, `// @vitest-environment jsdom
import {expect, it} from 'vitest';
import * as mixed from './mixed.js';
import * as awaited from './awaited.js';
import Feedback, {mount, unmount, flushSync} from ${JSON.stringify(path.join(root, `${component}.native.js`))};
import {renderHTML} from ${JSON.stringify(path.join(root, `${component}.html.js`))};
it('executes both async paths, a distinct same-named method and genuine compiled components', async () => {
  const cases = [
    ...Array.from({length: 9}, () => ['review', false]),
    ...Array.from({length: 8}, () => ['apply', true]),
    ['interactive', false], ['interactive', true], ['interactive', true],
  ];
  const controls = [
    ...Array.from({length: 10}, () => ['interactive', false]),
    ...Array.from({length: 10}, () => ['interactive', true]),
  ];
  for (const [module, inputs] of [[mixed, cases], [awaited, controls]]) {
    const outcomes = [];
    for (const [mode, answer] of inputs) outcomes.push(await module.decision(mode, async () => answer));
    expect(outcomes.filter(value => value === 'declined')).toHaveLength(10);
    expect(outcomes.filter(value => value === 'applied')).toHaveLength(10);
    expect(module.second.run()).toBe('second');
  }
  const view = {kind: 'zeroActivity'};
  expect(renderHTML({view})).toContain('Every day shows 0');
  const target = document.createElement('div'); document.body.append(target);
  const mounted = mount(Feedback, {target, props: {view}}); flushSync();
  expect(target.textContent).toContain('Every day shows 0');
  await unmount(mounted); target.remove();
});
`);
    const config = path.join(directory, 'vitest.config.mjs'), reports = path.join(directory, 'coverage');
    fs.writeFileSync(config, `import base from ${JSON.stringify(path.join(root, 'vitest.config.js'))};
export default {...base, root: ${JSON.stringify(root)}, test: {...base.test,
  include: [${JSON.stringify(relative(fixture))}, 'tests/service-worker-client-cache.test.ts'], setupFiles: [],
  coverage: {...base.test.coverage, provider: 'istanbul', enabled: true,
    include: ${JSON.stringify([relative(mixed), relative(awaited), `${component}.native.js`, `${component}.html.js`, 'service-worker-runtime.js'])},
    reportsDirectory: ${JSON.stringify(reports)}}}};
`);
    await promisify(execFile)(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', config, '--maxWorkers=1'], {
      cwd: root, timeout: 25_000, maxBuffer: 2 * 1024 * 1024,
    });
    const unitFile = path.join(reports, 'coverage-final.json');
    const coverage = JSON.parse(fs.readFileSync(unitFile, 'utf8')) as Record<string, FileCoverage>;
    const entries = Object.values(coverage);
    expect(entries.map(entry => path.resolve(entry.path)).sort()).toEqual([mixed, awaited, path.join(root, `${component}.native.js`), path.join(root, `${component}.html.js`), path.join(root, 'service-worker-runtime.js')].sort());
    for (const entry of entries) {
      for (const counts of Object.values(entry.b)) expect(counts.every(count => Number.isFinite(count) && count >= 0)).toBe(true);
      for (const map of [entry.s, entry.f]) expect(Object.values(map).every(count => Number.isFinite(count) && count >= 0)).toBe(true);
    }
    for (const file of [mixed, awaited]) {
      const entry = entries.find(entry => entry.path === file)!;
      const branches = Object.entries(entry.branchMap).filter(([, branch]) => branch.type === 'if');
      expect(branches).toHaveLength(1);
      expect(entry.b[branches[0]![0]]).toEqual([10, 10]);
      const methods = Object.entries(entry.fnMap).map(([id, fn]) => ({id, identity: functionIdentity(decision, fn, relative(file)).owned}))
        .filter(method => method.identity?.name === 'run').sort((first, second) => first.identity!.start - second.identity!.start);
      expect(methods).toHaveLength(2);
      expect(methods.map(({id}) => entry.f[id])).toEqual([0, 1]);
      expect(methods[0]!.identity!.start).not.toBe(methods[1]!.identity!.start);
    }
    for (const suffix of ['native.js', 'html.js']) {
      const file = `${component}.${suffix}`, entry = entries.find(entry => entry.path === path.join(root, file))!;
      const source = fs.readFileSync(path.join(root, file), 'utf8'); let ownedCalled = 0, frameworkCalled = 0;
      for (const [id, fn] of Object.entries(entry.fnMap)) {
        if (!entry.f[id]) continue;
        const identity = functionIdentity(source, fn, file);
        expect(identity.owned !== null || identity.framework !== null, `${file}: ${fn.name}`).toBe(true);
        if (identity.owned) ownedCalled++; if (identity.framework) frameworkCalled++;
      }
      expect(ownedCalled).toBeGreaterThan(0); expect(frameworkCalled).toBeGreaterThan(0);
    }

    const worker = entries.find(entry => entry.path === path.join(root, 'service-worker-runtime.js'))!;
    expect(Object.values(worker.s).some(count => count > 0)).toBe(true);
    expect(Object.values(worker.f).some(count => count > 0)).toBe(true);
    expect(Object.values(worker.b).some(counts => counts.some(count => count > 0))).toBe(true);
    // This file executes only inside the original VM helper. Real counters must
    // reach the parent collector without inventing execution for untouched code.
    expect(Object.values(worker.f).some(count => count === 0)).toBe(true);
    const workerSource = fs.readFileSync(worker.path, 'utf8');
    for (const [id, fn] of Object.entries(worker.fnMap)) {
      if (worker.f[id]) expect(functionIdentity(workerSource, fn, 'service-worker-runtime.js').owned, fn.name).not.toBeNull();
    }
    const browser = path.join(directory, 'browser'); fs.mkdirSync(browser);
    // This is the transport validator's unit input seam, not a browser execution receipt.
    fs.writeFileSync(path.join(browser, 'one.json'), JSON.stringify({entries: [{url: '/js/probe.js'}]}));
    const inventory = createCoverageInventory(browser, '1/1');
    expect(qualifyCoverageUnion(browser, [inventory], 1, unitFile)).toMatchObject({status: 'passed', unit: {files: 5}});
    const first = entries.find(entry => entry.path === mixed)!;
    const branch = Object.entries(first.branchMap).find(([, value]) => value.type === 'if')![0];
    first.b[branch]![1] = -1;
    fs.writeFileSync(unitFile, JSON.stringify(coverage));
    expect(() => qualifyCoverageUnion(browser, [inventory], 1, unitFile)).toThrow('Invalid unit branch counts');
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
}, 30_000);
