import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sourcePath, runtimePath, walkSourceFiles } from '../scripts/source-files.js';
import { countLines, migrationSourceFiles, buildMigrationProgress } from '../scripts/migration-progress.js';
import { productionSources } from '../scripts/coverage-source.mjs';
import { parseModuleSpecifiers } from '../scripts/architecture-map.mjs';
import { createTestPlan } from '../scripts/pr-test-scope.mjs';
import { getAgentToolCatalog, getCodexDynamicTools } from '../shared/agent-tool-contract.js';

describe('TypeScript migration boundaries', () => {
  it('counts each authored module once while resolving unchanged runtime URLs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-typescript-inventory-'));
    const source = path.join(root, 'js/contract.ts');
    const emitted = path.join(root, 'js/contract.js');
    try {
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, 'export const value: number = 1;');
      fs.writeFileSync(emitted, 'export const value = 1;');
      fs.writeFileSync(path.join(root, 'js/contract.d.ts'), 'export declare const value: number;');
      expect(sourcePath(emitted)).toBe(source);
      expect(runtimePath(source)).toBe(emitted);
      expect(walkSourceFiles(root)).toEqual([source]);
      expect(productionSources(root)).toEqual(['js/contract.ts']);
      // V8 offsets must use emitted JS in both Node and browser coverage.
      expect(productionSources(root, { runtime: true })).toEqual(['js/contract.js']);
      fs.unlinkSync(emitted);
      expect(() => productionSources(root, { runtime: true })).toThrow('Missing emitted runtime');
    } finally { fs.rmSync(root, { recursive: true }); }
  });

  it('counts both authored siblings and excludes emitted files absent from the Git inventory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-migration-siblings-'));
    const authored = ['tests/integration.test.js', 'tests/integration.test.ts', 'js/native.ts'];
    try {
      for (const file of [...authored, 'js/native.js', 'vendor/dependency.js']) {
        const target = path.join(root, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, 'export const value = 1;');
      }
      expect(migrationSourceFiles(root, [...authored, authored[0]!, 'vendor/dependency.js', 'missing.js']))
        .toEqual(authored);
    } finally { fs.rmSync(root, { recursive: true }); }
  });

  it('parses typed source while separating type-only imports from runtime edges', () => {
    const graph = parseModuleSpecifiers(`
      import type { User } from './types.js';
      export type { User } from './types.js';
      import { load } from './runtime.js';
      const user: User | null = null;
      const lazy = import('./feature.js?lazy-retry=1');
    `, 'module.ts');
    expect(graph.dependencies).toEqual([
      { specifier: './runtime.js', kind: 'static' },
      { specifier: './feature.js?lazy-retry=1', kind: 'dynamic' },
    ]);
  });

  it('follows erased literal URL assertions while still rejecting asserted computed imports', () => {
    const graph = parseModuleSpecifiers(`
      const retry = import(('./feature.js?lazy-retry=1' as string));
      const typed = import(('./other.js' satisfies string)!);
      const computed = import(runtimeUrl as string);
    `, 'module.ts');
    expect(graph.dependencies).toEqual([
      { specifier: './feature.js?lazy-retry=1', kind: 'dynamic' },
      { specifier: './other.js', kind: 'dynamic' },
    ]);
    expect(graph.nonLiteralDynamicImports).toEqual(['import(runtimeUrl as string)']);
  });

  it('selects existing JS runtime tests for a change to their canonical TS module', () => {
    const sources = new Map([
      ['js/leaf.ts', 'export const value: number = 1;'],
      ['js/consumer.js', "import { value } from './leaf.js';"],
      ['tests/consumer.test.js', "import '../js/consumer.js';"],
    ]);
    const plan = createTestPlan(sources, ['js/leaf.ts']);
    expect(plan.unit).toEqual(['tests/consumer.test.js']);
    expect(plan.uncovered).toEqual([]);
  });

  it.each([['mts', 'mjs'], ['cts', 'cjs']] as const)('follows %s imports at unchanged %s runtime paths', (sourceExtension, runtimeExtension) => {
    const sources = new Map([
      [`scripts/planner.${sourceExtension}`, 'export const value: number = 1;'],
      [`scripts/consumer.${sourceExtension}`, `import { value } from './planner.${runtimeExtension}';`],
      ['tests/consumer.test.ts', `import '../scripts/consumer.${runtimeExtension}';`],
    ]);
    const plan = createTestPlan(sources, [`scripts/planner.${sourceExtension}`]);
    expect(plan.unit).toEqual(['tests/consumer.test.ts']);
    expect(plan.uncovered).toEqual([]);
  });

  it('retains shared-runtime browser scope for a TypeScript startup file', () => {
    const sources = new Map([
      ['js/startup.ts', 'export const ready = true;'],
      ['tests/playwright/startup.spec.ts', "test('loads', () => {});"],
    ]);
    expect(createTestPlan(sources, ['js/startup.ts']).browser).toEqual(['tests/playwright/startup.spec.ts']);
  });

  it('retains every field in the original agent tool JSON contracts', () => {
    const contract = { catalog: getAgentToolCatalog(), codex: getCodexDynamicTools() };
    expect(createHash('sha256').update(JSON.stringify(contract)).digest('hex')).toBe('91d5ca6b12033a5b2838397b958c9200d25ac95125154295ea6db33f9ca287fa');
    contract.catalog[0]!.name = 'caller mutation';
    expect(getAgentToolCatalog()[0]!.name).toBe('getbased_lab_context');
  });

  it('measures physical and nonblank lines consistently across file endings', () => {
    expect(countLines('one\r\n\r\ntwo\r\n')).toEqual({ lines: 3, nonblank: 2 });
    expect(countLines('one\ntwo')).toEqual({ lines: 2, nonblank: 2 });
    expect(countLines('')).toEqual({ lines: 0, nonblank: 0 });
  });
});

// First-party vendor accounting is intentionally separate from the fixed LOC baseline.
describe('Project-owned vendor migration inventory', () => {
  function withInventory(operation: (root: string, write: (file: string, source: string) => void) => void) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-owned-vendor-inventory-'));
    const write = (file: string, source: string) => {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
    };
    try { operation(root, write); } finally { fs.rmSync(root, { recursive: true }); }
  }

  it('includes only listed, existing, Git-inventoried project vendor files and preserves authored siblings', () => {
    withInventory((root, write) => {
      const authored = ['js/native.ts', 'vendor/owned.js', 'vendor/owned.ts', 'vendor/owned.d.ts'];
      const unowned = ['vendor/dependency.js', 'vendor/unlisted.ts'];
      for (const file of [...authored, ...unowned, 'vendor/ignored.js']) write(file, 'export const value = 1;');
      write('vendor/components.json', JSON.stringify({
        projectFiles: ['vendor/owned.js', 'vendor/owned.ts', 'vendor/owned.d.ts', 'vendor/ignored.js', 'vendor/missing.ts'],
        components: [{ files: unowned }],
      }));
      expect(migrationSourceFiles(root, [...authored, ...unowned, authored[1]!, 'vendor/missing.ts']))
        .toEqual(authored);
    });
  });

  it('reports owned vendor lines separately without changing the nonvendor LOC baseline', () => {
    withInventory((root, write) => {
      write('js/native.ts', 'one\ntwo\n');
      write('vendor/chartjs-adapter-native.js', 'first\n\nthird\n');
      write('vendor/bip39-minimal.ts', 'one\ntwo\nthree\n');
      write('vendor/owned.d.ts', 'export declare const value: number;\n');
      write('vendor/dependency.js', 'third-party\n'.repeat(40));
      const owned = ['vendor/chartjs-adapter-native.js', 'vendor/bip39-minimal.ts', 'vendor/owned.d.ts'];
      write('vendor/components.json', JSON.stringify({ projectFiles: owned }));
      const baseline = { commit: 'fixed-baseline', totals: { lines: 100, nonblank: 80 } };
      const before = structuredClone(baseline);
      const report = buildMigrationProgress(root, ['js/native.ts', ...owned, 'vendor/dependency.js'], baseline);
      expect(report.baseline).toEqual(before.totals);
      expect(report.current).toEqual({ lines: 2, nonblank: 2 });
      expect(report.reduction).toEqual({ lines: 0.98, nonblank: 0.975 });
      expect(report.projectOwnedVendor).toEqual({ files: owned, lines: 7, nonblank: 6 });
      expect(report.authoredJavaScriptFiles).toBe(1);
      expect(report.authoredTypeScriptFiles).toBe(2);
      expect(report.migrated).toBe(false);
      expect(report.remainingRuntimeJavaScriptFiles).toEqual(['vendor/chartjs-adapter-native.js']);
      expect(baseline).toEqual(before);
    });
  });

  it('does not invent emitted JavaScript or uninventoried project files when determining completion', () => {
    withInventory((root, write) => {
      write('vendor/owned.ts', 'export const value = 1;\n');
      write('vendor/owned.js', 'export const value = 1;\n');
      write('vendor/chartjs-adapter-native.js', 'globalThis.adapter = true;\n');
      write('vendor/components.json', JSON.stringify({ projectFiles: ['vendor/owned.ts', 'vendor/owned.js', 'vendor/chartjs-adapter-native.js'] }));
      const report = buildMigrationProgress(root, ['vendor/owned.ts'], { commit: 'fixed', totals: { lines: 100, nonblank: 80 } });
      expect(report.projectOwnedVendor.files).toEqual(['vendor/owned.ts']);
      expect(report.current).toEqual({ lines: 0, nonblank: 0 });
      expect(report.authoredJavaScriptFiles).toBe(0);
      expect(report.authoredTypeScriptFiles).toBe(1);
      expect(report.migrated).toBe(true);
      expect(report.remainingRuntimeJavaScriptFiles).toEqual([]);
    });
  });

  it('propagates malformed JSON and metadata file read errors', () => {
    withInventory((root, write) => {
      write('vendor/components.json', '{');
      expect(() => migrationSourceFiles(root, [])).toThrow(SyntaxError);
      fs.unlinkSync(path.join(root, 'vendor/components.json'));
      fs.mkdirSync(path.join(root, 'vendor/components.json'));
      expect(() => migrationSourceFiles(root, [])).toThrow();
    });
  });

  it.each([null, [], {}, { projectFiles: null }, { projectFiles: 'vendor/owned.ts' }])
    ('rejects malformed ownership metadata %j', metadata => {
      withInventory((root, write) => {
        write('vendor/components.json', JSON.stringify(metadata));
        expect(() => migrationSourceFiles(root, [])).toThrow('must contain a projectFiles array');
      });
    });

  it.each([
    '../js/app.ts', 'js/app.ts', '/vendor/app.ts', 'vendor/../js/app.ts',
    'vendor/folder/../../js/app.ts', 'vendor/./app.ts', 'vendor//app.ts',
    'vendor/app.ts/', 'vendor\\app.ts', 'vendor/app\0.ts', 'vendor', '', 7,
  ])('rejects unsafe projectFiles path %j', file => {
    withInventory((root, write) => {
      write('vendor/components.json', JSON.stringify({ projectFiles: [file] }));
      expect(() => migrationSourceFiles(root, [])).toThrow('must contain canonical paths inside vendor/');
    });
  });
});

describe('Project-owned vendor wildcard metadata', () => {
  function withVendorFiles(files: readonly string[], patterns: readonly string[], operation: (root: string) => void) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-owned-vendor-wildcards-'));
    try {
      for (const file of files) {
        const target = path.join(root, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, 'export const value = 1;\n');
      }
      fs.writeFileSync(path.join(root, 'vendor/components.json'), JSON.stringify({ projectFiles: patterns }));
      operation(root);
    } finally { fs.rmSync(root, { recursive: true }); }
  }

  it('counts wildcard-owned runtime JavaScript and cannot report false completion', () => {
    const files = ['vendor/owned-adapter.js', 'vendor/owned.ts', 'vendor/dependency.js', 'vendor/nested/owned-second.js'];
    withVendorFiles([...files, 'vendor/owned-ignored.js'], ['vendor/owned*.js'], root => {
      expect(migrationSourceFiles(root, files)).toEqual(['vendor/owned-adapter.js']);
      const report = buildMigrationProgress(root, files, { commit: 'fixed', totals: { lines: 100, nonblank: 80 } });
      expect(report.authoredJavaScriptFiles).toBe(1);
      expect(report.migrated).toBe(false);
      expect(report.remainingRuntimeJavaScriptFiles).toEqual(['vendor/owned-adapter.js']);
      expect(report.projectOwnedVendor.files).toEqual(['vendor/owned-adapter.js']);
      expect(report.current).toEqual({ lines: 0, nonblank: 0 });
    });
  });

  it('matches one directory segment per wildcard and deduplicates overlapping ownership patterns', () => {
    const owned = ['vendor/tools/owned-one.js', 'vendor/other/owned-two.js', 'vendor/tools/owned.ts'];
    const files = [...owned, 'vendor/tools/deeper/owned.js', 'vendor/owned-root.js', 'vendor/tools/dependency.js'];
    withVendorFiles(files, ['vendor/*/owned*.js', 'vendor/tools/owned*'], root => {
      expect(migrationSourceFiles(root, [...files, owned[0]!])).toEqual(owned);
      const report = buildMigrationProgress(root, files, { commit: 'fixed', totals: { lines: 100, nonblank: 80 } });
      expect(report.authoredJavaScriptFiles).toBe(2);
      expect(report.authoredTypeScriptFiles).toBe(1);
      expect(report.projectOwnedVendor.files).toEqual(owned);
    });
  });

  it('uses literal regex metacharacters with the existing star-only pattern semantics', () => {
    const owned = ['vendor/owned[1]+(x)?.js', 'vendor/owned[1]+(part).js'];
    const files = [...owned, 'vendor/owned1xxx.js', 'vendor/owned[1]+(x)Q.js', 'vendor/owned[1]+/part.js'];
    withVendorFiles(files, ['vendor/owned[1]+(x)?.js', 'vendor/owned[1]+(*).js'], root => {
      expect(migrationSourceFiles(root, files)).toEqual(owned);
    });
  });
});
