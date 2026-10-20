import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildSvelte } from '../scripts/build-svelte.mjs';
import { parseModuleSpecifiers } from '../scripts/architecture-map.mjs';
import { createTestPlan } from '../scripts/pr-test-scope.mjs';
import { productionSources, productionFunctionIndex, partitionComponentFunctions, matchSourceFunction } from '../scripts/coverage-source.mjs';
import { assertDisplayCoverageCalls, displayCoverageOwnerSHA256, expectedDisplayCoverageRoles, qualifyDisplayCoverageRoles } from './helpers/display-settings-coverage-contract.js';

let directory: string;
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-svelte-test-'));
  await buildSvelte({ outputDirectory: directory });
});
afterAll(async () => { await fs.rm(directory, { recursive: true, force: true }); });

it('emits a self-contained native ESM component without unresolved npm imports', async () => {
  const source = await fs.readFile(path.join(directory, 'DisplaySettings.svelte.native.js'), 'utf8');
  expect(parseModuleSpecifiers(source).dependencies).toEqual([]);
  expect(source).toContain('sourceMappingURL=DisplaySettings.svelte.native.js.map');
  await buildSvelte({ outputDirectory: directory, check: true });
});

it('rejects stale generated code without modifying it', async () => {
  const output = path.join(directory, 'DisplaySettings.svelte.native.js');
  await fs.writeFile(output, 'stale');
  await expect(buildSvelte({ outputDirectory: directory, check: true })).rejects.toThrow('Svelte output is stale');
  expect(await fs.readFile(output, 'utf8')).toBe('stale');
});

it('includes authored components once in architecture, test planning and runtime coverage', async () => {
  const component = 'js/components/DisplaySettings.svelte';
  const source = await fs.readFile(component, 'utf8');
  expect(parseModuleSpecifiers(source, component).dependencies).toContainEqual({ specifier: 'svelte', kind: 'static' });
  const sources = new Map([
    [component, source],
    ['js/settings-display-panel.ts', `import './components/DisplaySettings.svelte.native.js';`],
    ['tests/playwright/settings-display-pilot.spec.ts', `await import('/js/settings-display-panel.js');`],
  ]);
  const declarationPlan = createTestPlan(sources, [`${component}.native.d.ts`]);
  expect(declarationPlan.uncovered).toEqual([]);
  expect(declarationPlan.browser).toContain('tests/playwright/settings-display-pilot.spec.ts');
  expect(createTestPlan(sources, [component]).browser).toContain('tests/playwright/settings-display-pilot.spec.ts');
  const canonical = productionSources(process.cwd()).filter(file => file.includes('DisplaySettings'));
  expect(canonical).toEqual([component]);
  expect(productionSources(process.cwd(), { runtime: true }).filter(file => file.includes('DisplaySettings')))
    .toEqual([`${component}.native.js`]);
  const runtime = await fs.readFile(`${component}.native.js`, 'utf8');
  const index = productionFunctionIndex(runtime, `${component}.native.js`);
  expect(index.owned.length).toBeGreaterThan(0);
  expect(index.thirdParty.length).toBeGreaterThan(0);
});

it('retains owned and unmapped functions while excluding positively mapped library functions', () => {
  const source = 'function library() { return 1; }\nfunction owned() { return 2; }\nfunction unmapped() { return 3; }';
  const index = partitionComponentFunctions(source, {
    version: 3, file: 'component.js', sourceRoot: '', names: [],
    sources: ['../node_modules/svelte/runtime.js', '../js/View.svelte'],
    mappings: 'AAAA;ACAA;A', sourcesContent: ['', ''],
  });
  expect(index.thirdParty.map(fn => fn.name)).toEqual(['library']);
  expect(index.owned.map(fn => fn.name)).toEqual(['owned', 'unmapped']);
});

it('fails closed if the component coverage map is missing', () => {
  expect(() => productionFunctionIndex('function owned() {}', 'missing.svelte.native.js', directory)).toThrow();
});


it('checks actual component exports from a nested tooling workspace and rejects incompatible signatures', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-svelte-check-'));
  try {
    const tooling = path.join(root, 'tooling/svelte');
    await fs.mkdir(tooling, { recursive: true });
    await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'junction');
    await fs.symlink(path.resolve('tooling/svelte/node_modules'), path.join(tooling, 'node_modules'), 'junction');
    await fs.copyFile('tooling/svelte/package.json', path.join(tooling, 'package.json'));
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
    await fs.writeFile(path.join(root, 'tsconfig.svelte.json'), JSON.stringify({
      extends: path.resolve('tsconfig.svelte.json'), include: ['View.svelte', 'contract.ts'],
    }));
    const source = `<script lang="ts">
      import { untrack } from 'svelte';
      let { initial }: { initial: string } = $props();
      let value = $state(untrack(() => initial));
      export function refresh(next: string): void { value = next; }
    </script><p>{value}</p>`;
    const component = path.join(root, 'View.svelte');
    await fs.writeFile(component, source);
    await fs.writeFile(path.join(root, 'contract.ts'), `
      import type { Component } from 'svelte';
      import View from './View.svelte';
      export const view: Component<{ initial: string }, { refresh(next: string): void }> = View;
    `);
    const run = () => execFileSync('npm', ['run', 'check', '--prefix', tooling], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(run()).toContain('0 errors and 0 warnings');
    await fs.writeFile(component, source.replace('refresh(next: string): void { value = next; }',
      'refresh(next: number): void { void next; }'));
    let failure: unknown;
    try { run(); } catch (error) { failure = error; }
    expect(failure).toBeDefined();
    expect(String((failure as { stdout?: string }).stdout)).toContain('not assignable');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});


it('reads both authored component scripts without treating markup or type imports as runtime edges', () => {
  const source = `<script module lang="ts">import './module.js';</script>
    <script lang="ts">import type { Props } from './types.js'; import './instance.js';</script>
    <p>import './markup.js'</p>`;
  expect(parseModuleSpecifiers(source, 'js/View.svelte').dependencies).toEqual([
    { specifier: './module.js', kind: 'static' }, { specifier: './instance.js', kind: 'static' },
  ]);
});

it('merges real unit coverage in native coordinates without counting bundled framework functions', async () => {
  const reports = path.join(directory, 'unit-coverage');
  execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run',
    // This format witness inspects this self-contained native component's
    // owned and bundled framework functions. Release coverage stays global.
    'tests/unit-profile-active-data.test.ts', '--coverage', '--coverage.provider=istanbul',
    '--coverage.include=js/components/DisplaySettings.svelte.native.js', `--coverage.reportsDirectory=${reports}`], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000,
  });
  const file = 'js/components/DisplaySettings.svelte.native.js';
  const coverage = JSON.parse(await fs.readFile(path.join(reports, 'coverage-final.json'), 'utf8'));
  expect(Object.keys(coverage)).toEqual([path.resolve(file)]);
  expect(coverage[path.resolve('js/components/DisplaySettings.svelte')]).toBeUndefined();
  const collected = coverage[path.resolve(file)];
  expect(collected).toBeDefined();
  const source = await fs.readFile(file, 'utf8');
  const index = productionFunctionIndex(source, file);
  const offsets = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') offsets.push(i + 1);
  const range = (span: { start: { line: number; column: number | null }; end: { line: number; column: number | null } }) => {
    const start = offsets[span.start.line - 1]! + (span.start.column || 0);
    const end = offsets[span.end.line - 1]! + (span.end.column || 0);
    return end > start ? { start, end } : null;
  };
  const owned = new Set<number>();
  const called = new Set<number>();
  for (const [id, fn] of Object.entries(collected.fnMap) as Array<[string, { loc: Parameters<typeof range>[0]; decl: Parameters<typeof range>[0] }]>) {
    const span = range(fn.loc) || range(fn.decl)!;
    const match = matchSourceFunction(index.owned, span.start, span.end, 'istanbul');
    if (match) {
      owned.add(match.start);
      if (collected.f[id] > 0) called.add(match.start);
    } else {
      expect(matchSourceFunction(index.thirdParty, span.start, span.end, 'istanbul')).not.toBeNull();
    }
  }
  expect(owned.size).toBe(index.owned.length);
  const payload = JSON.parse(await fs.readFile(`${file}.map`, 'utf8')) as import('node:module').SourceMapPayload;
  const authored = Object.fromEntries(await Promise.all(Object.keys(displayCoverageOwnerSHA256).map(async name =>
    [name, await fs.readFile(path.join('js/components', name), 'utf8')],
  )));
  const roles = qualifyDisplayCoverageRoles(source, payload, index.owned, authored);
  assertDisplayCoverageCalls(roles, called);
  expect(called.size).toBe(Object.values(expectedDisplayCoverageRoles).filter(Boolean).length);

  // The old numeric cardinality alone would accept this equally sized wrong
  // set. A missed reactive getter and an unexpectedly called refresh must fail.
  const wrongCalls = new Set(called);
  wrongCalls.delete(roles.find(role => role.role === 'display:product-recs')!.start);
  wrongCalls.add(roles.find(role => role.role === 'display:refresh')!.start);
  expect(wrongCalls.size).toBe(called.size);
  expect(() => assertDisplayCoverageCalls(roles, wrongCalls)).toThrow();

  // A child event handler is owned even when this fixture does not call it.
  // Neither hiding that function nor changing complete map ownership is valid.
  const change = roles.find(role => role.role === 'toggle:change')!;
  expect(() => qualifyDisplayCoverageRoles(source, payload,
    index.owned.filter(fn => fn.start !== change.start), authored)).toThrow();
  const corruptMap = structuredClone(payload);
  if (!corruptMap.sourcesContent) throw new Error('Component source content is required');
  const toggle = corruptMap.sources.indexOf('SettingsToggle.svelte');
  corruptMap.sourcesContent[toggle] = `${corruptMap.sourcesContent[toggle]}\n`;
  expect(() => qualifyDisplayCoverageRoles(source, corruptMap, index.owned, authored)).toThrow();
  expect(called.size).toBeLessThan(owned.size); // Unit fixture does not call refresh.
}, 30_000);


it.each(['client', 'html'] as const)('emits identical %s code and source maps across checkout paths', async output => {
  await fs.mkdir('.local-notes', {recursive: true});
  const root = await fs.mkdtemp(path.join(path.resolve('.local-notes'), 'svelte-portable-'));
  try {
    const outputs: Buffer[][] = [];
    for (const checkout of ['short-checkout', 'a-different-checkout-path']) {
      const directory = path.join(root, checkout, 'js/components'); await fs.mkdir(directory, {recursive: true});
      const component = path.join(directory, 'Portable.svelte'); await fs.writeFile(component, '<script lang="ts">let {value}: {value: string} = $props();</script><p>{value}</p>');
      await buildSvelte({component, outputDirectory: directory, output});
      const suffix = output === 'html' ? 'html' : 'native';
      outputs.push(await Promise.all([`${component}.${suffix}.js`, `${component}.${suffix}.js.map`].map(file => fs.readFile(file))));
    }
    expect(outputs[0]).toEqual(outputs[1]);
  } finally {await fs.rm(root, {recursive: true, force: true});}
});
