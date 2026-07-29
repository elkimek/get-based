import { describe, expect, it } from 'vitest';

import {
  findBoundaryViolations,
  parseModuleSpecifiers,
  stronglyConnectedComponents,
  validateArchitecture,
} from '../scripts/architecture-map.mjs';

describe('architecture map tooling', () => {
  it('parses ESM and classic-worker dependencies without accepting computed targets', () => {
    const parsed = parseModuleSpecifiers(`
      // import './ignored-comment.js';
      import value from './static.js';
      export { helper } from './re-export.js';
      const lazy = import('./lazy.js');
      const computed = import(runtimeUrl);
      importScripts('/classic-worker.js');
      importScripts(workerUrl);
      const text = "import './ignored-string.js'";
    `);

    expect(parsed.dependencies).toEqual([
      { specifier: './static.js', kind: 'static' },
      { specifier: './re-export.js', kind: 'static' },
      { specifier: './lazy.js', kind: 'dynamic' },
      { specifier: '/classic-worker.js', kind: 'static' },
    ]);
    expect(parsed.nonLiteralDynamicImports).toEqual([
      'import(runtimeUrl)',
      'importScripts(workerUrl)',
    ]);
  });

  it('finds strongly connected components without treating one-way edges as cycles', () => {
    const components = stronglyConnectedComponents(new Map([
      ['a.js', new Set(['b.js'])],
      ['b.js', new Set(['a.js', 'c.js'])],
      ['c.js', new Set()],
      ['self.js', new Set(['self.js'])],
    ]));

    expect(components).toContainEqual(['a.js', 'b.js']);
    expect(components).toContainEqual(['c.js']);
    expect(components).toContainEqual(['self.js']);
  });

  it('reports imports that cross configured source boundaries', () => {
    const architecture = {
      modules: new Map([
        ['js/feature.js', {
          file: 'js/feature.js',
          group: 'browser',
          imports: [{ target: 'lib/server.js', kind: 'static' }],
        }],
        ['lib/server.js', {
          file: 'lib/server.js',
          group: 'server-shared',
          imports: [],
        }],
      ]),
    };
    const rules = {
      groups: [
        { name: 'browser', mayImport: ['browser'] },
        { name: 'server-shared', mayImport: ['server-shared'] },
      ],
    };

    expect(findBoundaryViolations(architecture, rules)).toEqual([{
      from: 'js/feature.js',
      fromGroup: 'browser',
      to: 'lib/server.js',
      toGroup: 'server-shared',
    }]);
  });

  it('rejects unreviewable imports and new cycle participation', () => {
    const architecture = {
      modules: new Map([
        ['js/new-feature.js', {
          file: 'js/new-feature.js',
          group: 'browser',
          imports: [],
          repositoryFiles: ['tests/helper.js'],
        }],
      ]),
      unresolvedImports: [],
      computedDynamicImports: [{ file: 'js/new-feature.js', expression: 'import(runtimeUrl)' }],
      cyclicModules: ['js/new-feature.js'],
      cyclicComponents: [['js/new-feature.js']],
    };
    const rules = {
      groups: [{ name: 'browser', mayImport: ['browser'] }],
      entryPoints: ['js/new-feature.js'],
      forbiddenRepositoryImportRoots: ['tests', 'scripts'],
    };
    const baseline = {
      maxCyclicModules: 0,
      maxLargestCyclicComponent: 0,
      allowedCyclicModules: [],
      allowedComputedDynamicImports: [],
    };

    expect(validateArchitecture(architecture, rules, baseline)).toEqual(expect.arrayContaining([
      expect.stringContaining('may not import tests/helper.js'),
      expect.stringContaining('new modules entered dependency cycles'),
      expect.stringContaining('cyclic module count increased'),
      expect.stringContaining('largest cyclic component increased'),
      expect.stringContaining('new computed dynamic import cannot be checked statically'),
    ]));
  });
});
