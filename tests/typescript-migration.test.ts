import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sourcePath, runtimePath, walkSourceFiles } from '../scripts/source-files.js';
import { countLines } from '../scripts/migration-progress.js';
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
