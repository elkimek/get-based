import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createTestPlan, fileReferences, testCommands } from '../scripts/pr-test-scope.mjs';

const fixture = extra => new Map(Object.entries({
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
