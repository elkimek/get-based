import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createTestPlan, fileReferences, testCommands, validationCommands } from '../scripts/pr-test-scope.mjs';

const fixture = (extra?: Record<string, string>) => new Map(Object.entries({
  'js/leaf.js': 'export const value = 1;',
  'js/consumer.js': "export { value } from './leaf.js';",
  'js/unrelated.js': 'export const other = 2;',
  'tests/consumer.test.js': "import { value } from '../js/consumer.js';",
  'tests/unrelated.test.js': "import { other } from '../js/unrelated.js';",
  'tests/playwright/consumer.spec.js': "await import('/js/consumer.js?cache=1');",
  'tests/playwright/unrelated.spec.js': "await import('/js/unrelated.js');",
  'tests/firefox/smoke.spec.js': '',
  'tests/pwa/lifecycle.spec.js': '',
  'tests/_vitest-legacy.test.js': "const cases = ['./test-one.js', './test-two.js'];",
  'tests/test-one.js': "read('js/leaf.js');",
  'tests/test-two.js': "read('js/unrelated.js');",
  ...extra,
}));

describe('affected PR test planning', () => {
  it('follows transitive dependencies and source-reading contracts without expanding the legacy harness', () => {
    const plan = createTestPlan(fixture(), ['js/leaf.js']);
    expect(plan.unit).toEqual(['tests/consumer.test.js']);
    expect(plan.legacy).toEqual(['tests/test-one.js']);
    expect(plan.browser).toEqual(['tests/playwright/consumer.spec.js']);
    expect(plan.firefox).toEqual([]);
    expect(plan.pwa).toEqual([]);
    expect(plan.uncovered).toEqual([]);
    expect(testCommands(plan, 'unit')).toEqual([
      ['vitest', 'run', 'tests/consumer.test.js'],
      ['vitest', 'run', 'tests/_vitest-legacy.test.js', '-t', '^test-one\\.js$'],
    ]);
  });

  it('runs a changed test itself without selecting unrelated tests', () => {
    const plan = createTestPlan(fixture(), ['tests/unrelated.test.js']);
    expect(plan.unit).toEqual(['tests/unrelated.test.js']);
    expect(plan.browser).toEqual([]);
  });

  it('retains consumers of deleted or renamed modules', () => {
    const sources = fixture();
    sources.delete('js/leaf.js');
    const plan = createTestPlan(sources, ['js/leaf.js', 'js/replacement.js']);
    expect(plan.unit).toEqual(['tests/consumer.test.js']);
    expect(plan.uncovered).toEqual(['js/replacement.js']);
  });

  it('rejects each uncovered runtime change even if an unrelated changed test was selected', () => {
    const plan = createTestPlan(fixture({ 'js/untested.js': '' }), ['js/untested.js', 'tests/unrelated.test.js']);
    expect(plan.uncovered).toEqual(['js/untested.js']);
  });

  it('allows documentation-only diffs without launching empty test commands', () => {
    const plan = createTestPlan(fixture(), ['README.md', 'AGENTS.md']);
    expect(plan.uncovered).toEqual([]);
    for (const suite of ['unit', 'browser', 'firefox', 'pwa']) expect(testCommands(plan, suite)).toEqual([]);
  });

  it('scopes catalog changes to provider and model UI contracts rather than the app-startup barrel', () => {
    const plan = createTestPlan(fixture({
      'js/api-models.js': '',
      'js/main.js': "import './api-models.js';",
      'tests/playwright/dashboard.spec.js': "import '/js/main.js';",
      'tests/api-provider-runtime.test.js': '',
      'tests/catalog-regression.test.js': "import '../js/api-models.js';",
      'tests/playwright/chat-model-controls.spec.js': '',
      'tests/playwright/nutrition-module.spec.js': '',
    }), ['js/api-models.js']);
    expect(plan.unit).toEqual(['tests/api-provider-runtime.test.js', 'tests/catalog-regression.test.js']);
    expect(plan.browser).toEqual(['tests/playwright/chat-model-controls.spec.js', 'tests/playwright/nutrition-module.spec.js']);
    expect(plan.uncovered).toEqual([]);
  });

  it('expands shared test infrastructure to affected suites and keeps coverage out of PR commands', () => {
    const plan = createTestPlan(fixture(), ['package-lock.json']);
    expect(plan.unit).toHaveLength(2);
    expect(plan.legacy).toHaveLength(2);
    expect(plan.browser).toHaveLength(2);
    expect(plan.firefox).toHaveLength(1);
    expect(testCommands(plan, 'browser')[0]).toContain('--workers=2');
    expect(JSON.stringify(testCommands(plan, 'unit'))).not.toContain('coverage');
  });

  it('selects PWA and Firefox cases when their own lifecycle or harness changes', () => {
    expect(createTestPlan(fixture(), ['service-worker-runtime.js']).pwa).toEqual(['tests/pwa/lifecycle.spec.js']);
    expect(createTestPlan(fixture(), ['playwright.firefox.config.js']).firefox).toEqual(['tests/firefox/smoke.spec.js']);
  });

  it('selects sync matrices for sync dependencies, but not provider catalog changes', () => {
    const sources = fixture({
      'js/sync-core.js': "import './leaf.js';",
      'tests/evolu8-browser/compat.spec.js': "import '/js/sync-core.js';",
      'js/api-models.js': '',
      'tests/api-provider-runtime.test.js': '',
    });
    expect(createTestPlan(sources, ['js/leaf.js']).sync).toBe(true);
    expect(createTestPlan(sources, ['js/api-models.js']).sync).toBe(false);
    expect(createTestPlan(sources, ['.github/workflows/sync-compat.yml']).sync).toBe(true);
  });

  it('keeps browser-only harness changes out of unrelated unit tests', () => {
    const plan = createTestPlan(fixture(), ['playwright.config.js']);
    expect(plan.unit).toEqual([]);
    expect(plan.browser).toHaveLength(2);
    expect(plan.firefox).toHaveLength(1);
    expect(plan.pwa).toHaveLength(1);
  });

  it('recognizes root-relative, relative and computed-import literal arguments but ignores external URLs', () => {
    const files = new Set(['js/leaf.js', 'js/consumer.js']);
    expect([...fileReferences('tests/browser.js', "moduleUrl('/js/leaf.js?x=1'); import('../js/consumer.js'); fetch('https://example.test/js/leaf.js')", files)].sort())
      .toEqual(['js/consumer.js', 'js/leaf.js']);
  });

  it('preserves explicit full release verification and coverage while PRs use an explicit plan', () => {
    const workflow = fs.readFileSync(new URL('../.github/workflows/test.yml', import.meta.url), 'utf8');
    const release = fs.readFileSync(new URL('../.github/workflows/release-evidence.yml', import.meta.url), 'utf8');
    expect(workflow).toContain("github.event_name != 'pull_request' || inputs.full_suite == true");
    expect(workflow).toMatch(/name: Run test suite with coverage ratchet\n\s+if: env.CI_SCOPE_FULL == 'true'\n\s+run: COVERAGE=1 SKIP_TYPECHECK=1 \.\/run-tests.sh/);
    expect(workflow).toMatch(/name: Run affected unit tests\n\s+if: env.CI_SCOPE_FULL != 'true'/);
    expect(release).toMatch(/uses: \.\/\.github\/workflows\/test.yml\n\s+with:\n\s+full_suite: true/);
  });
});


describe('native tooling and mandatory PR validation', () => {
  const scopes = [
    ['scripts/build-browser-vendors.mts', 'vendor:check'],
    ['scripts/build-evolu8-vendor.mts', 'vendor:evolu8:check'],
    ['scripts/build-marker-schema.mts', 'marker-schema:check'],
    ...['cashu', 'ehbp', 'tinfoil', 'venice-e2ee', 'venice-nvidia', 'venice-dcap', 'routstr-crypto', 'zlib-browser-shim'].map(name => [`scripts/vendor-entries/${name}.ts`, 'vendor:check']),
    ...['evolu8', 'evolu8-db-worker', 'evolu8-shared-worker'].map(name => [`scripts/vendor-entries/${name}.ts`, 'vendor:evolu8:check']),
  ];
  it.each(scopes)('requires the real build validation for %s and its deleted runtime alias', (native, check) => {
    const runtime = native!.replace(/\.mts$/, '.mjs').replace(/\.ts$/, '.js');
    for (const changed of [native!, runtime]) {
      const plan = createTestPlan(new Map([[native!, '']]), [changed]);
      expect(plan.checks).toEqual([check]);
      expect(validationCommands(plan)).toEqual([['npm', 'run', check]]);
      expect(plan.uncovered).toEqual([]);
      expect(testCommands(plan, 'unit')).toEqual([]);
    }
  });

  it.each([
    ['scripts/fetch-catalog.mts', 'tests/project-owned-ci.test.ts'],
    ['scripts/generate-import-reference-pdf.mts', 'tests/playwright/import-benchmarks.spec.ts'],
    ['scripts/playwright-coverage.mts', 'tests/coverage-gate.test.ts'],
    ['scripts/quality-guardrails.mts', 'tests/quality-guardrails.test.ts'],
    ['scripts/upgrade-demos.mts', 'tests/project-owned-ci.test.ts'],
  ])('selects the precise artifact contract for %s without selecting unrelated tests', (native, test) => {
    const sources = new Map([[native!, ''], [test!, ''], ['tests/unrelated.test.ts', '']]);
    for (const changed of [native!, native!.replace(/\.mts$/, '.mjs')]) {
      const plan = createTestPlan(sources, [changed]);
      expect([...plan.unit, ...plan.browser]).toEqual([test]);
      expect(plan.uncovered).toEqual([]);
      expect(plan.checks).toEqual([]);
    }
  });

  it('follows deleted runtime aliases into their current native owner and actual imported consumers', () => {
    const plan = createTestPlan(new Map([
      ['scripts/leaf.mts', 'export const value = 1;'],
      ['tests/leaf.test.ts', "import { value } from '../scripts/leaf.mts';"],
    ]), ['scripts/leaf.mjs']);
    expect(plan.unit).toEqual(['tests/leaf.test.ts']);
    expect(plan.uncovered).toEqual([]);
  });

  it('keeps unknown tooling, missing contract tests and untested owned vendor code fail closed', () => {
    const sources = new Map([
      ['scripts/fetch-catalog.mts', ''],
      ['scripts/unmapped.mts', ''],
      ['scripts/vendor-entries/unmapped.ts', ''],
      ['vendor/components.json', JSON.stringify({ projectFiles: ['vendor/owned.ts'] })],
      ['vendor/owned.ts', ''], ['tests/unrelated.test.ts', ''],
    ]);
    expect(createTestPlan(sources, ['scripts/fetch-catalog.mts', 'scripts/unmapped.mts', 'scripts/vendor-entries/unmapped.ts', 'vendor/owned.ts', 'tests/unrelated.test.ts']).uncovered)
      .toEqual(['scripts/fetch-catalog.mts', 'scripts/unmapped.mts', 'scripts/vendor-entries/unmapped.ts', 'vendor/owned.ts']);
    expect(() => validationCommands({ checks: ['arbitrary-script'] })).toThrow('Unknown mandatory validation');
  });

  it('deduplicates mandatory checks and propagates helper changes into their generator contracts', () => {
    const plan = createTestPlan(new Map([
      ['scripts/helper.ts', ''],
      ['scripts/build-browser-vendors.mts', "import './helper.js';"],
      ['scripts/vendor-entries/cashu.ts', ''],
      ['tests/cashu-vendor-compat.test.ts', ''],
    ]), ['scripts/helper.ts', 'scripts/build-browser-vendors.mjs', 'scripts/vendor-entries/cashu.ts']);
    expect(plan.unit).toEqual(['tests/cashu-vendor-compat.test.ts']);
    expect(plan.checks).toEqual(['vendor:check']);
    expect(plan.uncovered).toEqual([]);
    const checksOnly = new Map([['scripts/helper.ts', ''], ['scripts/build-browser-vendors.mts', "import './helper.js';"]]);
    expect(createTestPlan(checksOnly, ['scripts/helper.ts']).uncovered).toEqual([]);
    expect(createTestPlan(checksOnly, ['scripts/helper.ts']).checks).toEqual(['vendor:check']);
  });

  it('uses existing package commands and executes validators directly before the npx test runner in CI only', () => {
    const pkg: { scripts: Record<string, string> } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(pkg.scripts['vendor:check']).toBe('node scripts/build-browser-vendors.mjs --check');
    expect(pkg.scripts['vendor:evolu8:check']).toBe('node scripts/build-evolu8-vendor.mjs --check');
    expect(pkg.scripts['marker-schema:check']).toBe('node scripts/build-marker-schema.mjs --check');
    const source = fs.readFileSync('scripts/pr-test-scope.mts', 'utf8');
    expect(source.indexOf("process.env.GITHUB_ACTIONS !== 'true'")).toBeLessThan(source.indexOf('for (const command of validationCommands(plan))'));
    expect(source).toContain('spawnSync(command[0]!, command.slice(1)');
    expect(source.indexOf('for (const command of validationCommands(plan))')).toBeLessThan(source.indexOf('for (const command of testCommands(plan'));
  });
});
