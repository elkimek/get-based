import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createTestPlan, fileReferences, testCommands, validationCommands, kitMatrixArguments, additivePrecacheModules } from '../scripts/pr-test-scope.mjs';

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
    for (const suite of ['unit', 'browser', 'firefox', 'pwa', 'kit']) expect(testCommands(plan, suite)).toEqual([]);
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
    expect(testCommands(plan, 'browser')[0]).not.toContain('--workers=2');
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

  it('preserves explicit full release verification and the complete combined coverage gate while PRs use an explicit plan', () => {
    const workflow = fs.readFileSync(new URL('../.github/workflows/test.yml', import.meta.url), 'utf8');
    const release = fs.readFileSync(new URL('../.github/workflows/release-evidence.yml', import.meta.url), 'utf8');
    expect(workflow).toContain("github.event_name != 'pull_request' || inputs.full_suite == true");
    expect(workflow).toMatch(/name: Full unit coverage and unchanged critical behavior floors\n\s+if: needs.prepare.outputs.full == 'true'/);
    expect(workflow).toContain('node node_modules/vitest/vitest.mjs run --coverage');
    expect(workflow).toContain('node node_modules/vitest/vitest.mjs run --config vitest.critical.config.js');
    expect(workflow).toContain('INCLUDE_VITEST_COVERAGE: \'1\'');
    expect(workflow).toContain('REQUIRE_PLAYWRIGHT_COVERAGE_SHARDS: \'1\'');
    expect(workflow).toContain('run: node scripts/playwright-coverage.mjs');
    expect(workflow).toContain('ci-results.mjs coverage-verify');
    expect(workflow).toMatch(/name: Affected unit tests and mandatory changed-source checks\n\s+if: needs.prepare.outputs.full != 'true'/);
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
      expect(validationCommands(plan)).toEqual([check === 'marker-schema:check'
        ? ['node', 'scripts/build-marker-schema.mjs', '--check']
        : ['npm', 'run', check]]);
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
    expect(pkg.scripts['premarker-schema:check']).toBe('npm run typescript:build');
    expect(validationCommands({checks: ['marker-schema:check']})).toEqual([['node', 'scripts/build-marker-schema.mjs', '--check']]);
    const source = fs.readFileSync('scripts/pr-test-scope.mts', 'utf8');
    expect(source.indexOf("process.env.GITHUB_ACTIONS !== 'true'")).toBeLessThan(source.indexOf('for (const command of validationCommands(plan))'));
    expect(source).toContain('spawnSync(command[0]!, command.slice(1)');
    expect(source.indexOf('for (const command of validationCommands(plan))')).toBeLessThan(source.indexOf('for (const command of testCommands(plan'));
  });
});


describe('shipping transfer-budget PR scope', () => {
  const shipping = () => fixture({
    'scripts/sveltekit-performance-budget.mts': "import './benchmark-static.mjs'; read('scripts/sveltekit-performance-budget.json');",
    'scripts/benchmark-static.mts': "import './benchmark-static-fixtures.mjs'; read('vercel.json');",
    'scripts/benchmark-static-fixtures.mts': 'export const fixture = 1;',
    'scripts/sveltekit-performance-budget.json': '{}',
    'scripts/build-sveltekit.mts': "import '../tooling/svelte/build-static.mjs'; read('scripts/sveltekit-resource-budget.json');",
    'scripts/sveltekit-resource-budget.json': '{}',
    'tooling/svelte/build-static.mts': "import './config-helper.mjs'; import '../../scripts/kit-build-helper.mjs';",
    'scripts/kit-build-helper.mts': 'export const shared = 1;',
    'tooling/svelte/config-helper.mts': 'export const config = 1;',
    'js/kit/routes/app/+page.svelte': '<main>Shipping route</main>',
    'vercel.json': '{}',
    'tests/sveltekit-performance-budget.test.ts': "import '../scripts/sveltekit-performance-budget.mjs';",
    'tests/production-build.test.ts': "import '../scripts/build-sveltekit.mjs';",
  });

  it.each([
    'scripts/sveltekit-performance-budget.json',
    'scripts/sveltekit-performance-budget.mts',
    'scripts/sveltekit-performance-budget.mjs',
    'scripts/benchmark-static.mts',
    'scripts/benchmark-static-fixtures.mts',
    'scripts/build-sveltekit.mts',
    'scripts/build-sveltekit.mjs',
    'scripts/sveltekit-resource-budget.json',
    'tooling/svelte/build-static.mts',
    'tooling/svelte/config-helper.mts',
    'scripts/kit-build-helper.mts',
    'js/kit/routes/app/+page.svelte',
    'vercel.json',
    'css/settings.base.css',
    '.github/workflows/test.yml',
  ])('requires the real shipping transfer gate for %s', changed => {
    expect(createTestPlan(shipping(), [changed]).performance).toBe(true);
  });

  it('keeps existing browser/PWA selection and runners unchanged while adding the gate', () => {
    const browser = createTestPlan(shipping(), ['js/leaf.js']);
    expect(browser.performance).toBe(true);
    expect(browser.browser).toEqual(['tests/playwright/consumer.spec.js']);
    expect(browser.pwa).toEqual([]);
    expect(testCommands(browser, 'browser')).toEqual([
      ['playwright', 'test', 'tests/playwright/consumer.spec.js'],
    ]);
    expect(() => testCommands(browser, 'performance')).toThrow('Unknown test suite: performance');
    const pwa = createTestPlan(shipping(), ['service-worker-runtime.js']);
    expect(pwa.performance).toBe(true);
    expect(pwa.pwa).toEqual(['tests/pwa/lifecycle.spec.js']);
    expect(pwa.browser).toEqual([]);
    expect(testCommands(pwa, 'pwa')).toEqual([
      ['playwright', 'test', 'tests/pwa/lifecycle.spec.js', '--config=playwright.pwa.config.js'],
    ]);
  });

  it.each(['README.md', 'AGENTS.md', 'tests/unrelated.test.js', 'tests/firefox/smoke.spec.js'])('does not acquire Chromium solely for %s', changed => {
    const plan = createTestPlan(shipping(), [changed]);
    expect(plan.performance).toBe(false);
    expect(plan.browser).toEqual([]);
    expect(plan.pwa).toEqual([]);
  });

  it('builds once after catalog resolution and conditionally enforces the committed policy on that same immutable artifact', () => {
    const workflow = fs.readFileSync('.github/workflows/test.yml', 'utf8');
    const catalog = workflow.indexOf('name: Resolve catalog before compiling and freezing build inputs');
    const build = workflow.indexOf('run: node scripts/build-sveltekit.mjs --output dist');
    const units = workflow.indexOf('name: Affected unit tests and mandatory changed-source checks');
    expect(catalog).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(catalog);
    expect(units).toBeGreaterThan(build);
    expect(workflow.match(/run: node scripts\/build-sveltekit.mjs --output dist/g)).toHaveLength(1);
    expect(workflow).toContain('GETBASED_KIT_ARTIFACT: ${{ github.workspace }}/dist');
    expect(workflow).toContain('run: node node_modules/vitest/vitest.mjs run tests/production-build.test.ts');
    expect(workflow).toContain("if: needs.prepare.outputs.performance == 'true'");
    expect(workflow).toContain('run: node scripts/sveltekit-performance-budget.mjs --artifact "$GETBASED_KIT_ARTIFACT" --output .local-notes/ci/performance');
    expect(workflow).toContain('name: shipping-inputs');
    expect(workflow.match(/ci-artifact.mjs verify --artifact dist --transport \.local-notes\/ci\/transport --github-env/g)).toHaveLength(5);
    expect(workflow).toContain('run: node scripts/ci-plan.mjs --run-kit "$LANE" --output "$CI_TEST_PLAN"');
    expect(workflow).toContain('ci-results.mjs kit --collection .local-notes/ci/kit-collection.json');
    expect(workflow).not.toContain('performance:check -- --record');
    expect(workflow).not.toContain('sveltekit-performance-budget.mjs --record');
  });
});


describe('shipping SvelteKit suite routing', () => {
  const sources = () => fixture({
    'js/kit/routes/app/+page.svelte': '<main>App</main>',
    'scripts/kit-acceptance-reporter.mts': '',
    'tests/pwa/sveltekit.spec.ts': "import '/js/consumer.js';",
    'tests/pwa/sveltekit-compare.spec.ts': '',
    'tests/pwa/kit-server.ts': "import '/js/consumer.js';",
    'tests/pwa/sveltekit-helper.spec.ts': "import './kit-server.js';",
  });
  it('routes directly affected Kit specs only through their genuine projects', () => {
    const plan = createTestPlan(sources(), ['tests/pwa/sveltekit-compare.spec.ts']);
    expect(plan.kit).toContain('tests/pwa/sveltekit-compare.spec.ts');
    expect(plan.pwa).toEqual([]);
    expect(plan.kit.every(file => file.includes('sveltekit'))).toBe(true);
    expect(testCommands(plan, 'kit')).toEqual([['playwright', 'test', ...plan.kit, '--config=playwright.sveltekit.config.js']]);
    expect(testCommands(plan, 'pwa')).toEqual([]);
  });
  it.each(['package-lock.json', 'service-worker-runtime.js', 'playwright.config.js', 'playwright.pwa.config.js', 'index.html'])('preserves broad native and Kit lifecycle coverage for %s', file => {
    const plan = createTestPlan(sources(), [file]);
    expect(plan.pwa).toEqual(['tests/pwa/lifecycle.spec.js']);
    expect(plan.kit).toHaveLength(3);
    expect(plan.performance).toBe(true);
  });
  it.each(['js/kit/routes/app/+page.svelte', 'playwright.sveltekit.config.js', 'scripts/kit-acceptance-reporter.mts', 'css/settings.base.css', 'scripts/build-sveltekit.mjs'])('selects all Kit acceptance for its shipping boundary %s', file => {
    const plan = createTestPlan(sources(), [file]);
    expect(plan.kit).toHaveLength(3);
    expect(plan.pwa).toEqual([]);
  });
  it('follows ordinary and deleted runtime dependencies into both direct and helper Kit consumers', () => {
    for (const deleted of [false, true]) {
      const files = sources(); if (deleted) files.delete('js/leaf.js');
      const plan = createTestPlan(files, ['js/leaf.js']);
      expect(plan.kit).toEqual(['tests/pwa/sveltekit-helper.spec.ts', 'tests/pwa/sveltekit.spec.ts']);
      expect(plan.uncovered).toEqual([]);
    }
  });
  it('leaves documentation-only changes free of all browser acquisition', () => {
    const plan = createTestPlan(sources(), ['README.md']);
    expect(plan.kit).toEqual([]); expect(plan.pwa).toEqual([]); expect(plan.performance).toBe(false);
  });
});


describe('Kit matrix arguments', () => {
  it('supports exact projects and bounded positive shard pairs without changing file selection', () => {
    expect(kitMatrixArguments({GETBASED_KIT_PROJECT: 'kit-mobile-webkit', GETBASED_KIT_SHARD: '2/2'})).toEqual(['--project=kit-mobile-webkit', '--shard=2/2']);
    expect(kitMatrixArguments({})).toEqual([]);
    const plan = createTestPlan(fixture({'tests/pwa/sveltekit.spec.ts': ''}), ['tests/pwa/sveltekit.spec.ts']);
    expect(testCommands(plan, 'kit', file => file, {GETBASED_KIT_PROJECT: 'kit-chromium', GETBASED_KIT_SHARD: '1/2'})).toEqual([['playwright', 'test', 'tests/pwa/sveltekit.spec.ts', '--config=playwright.sveltekit.config.js', '--project=kit-chromium', '--shard=1/2']]);
  });
  it('rejects unknown projects and malformed, inverted, unbounded or injected shards', () => {
    for (const value of ['pwa-chromium', 'kit-chromium --headed', '']) expect(() => kitMatrixArguments({GETBASED_KIT_PROJECT: value})).toThrow();
    for (const value of ['0/2', '3/2', '1/0', '1/65', '01/2', '1.5/2', '1/2 --headed', '', '9007199254740992/9007199254740992']) expect(() => kitMatrixArguments({GETBASED_KIT_SHARD: value})).toThrow();
  });
});


describe('implicit framework and retired owner scope', () => {
  it.each(['native', 'html'])('routes changed or removed %s declarations through their actual component owner', mode => {
    const declaration = `js/components/Feature.svelte.${mode}.d.ts`;
    const sources = new Map([
      ['js/components/Feature.svelte', '<strong>Feature</strong>'],
      [declaration, 'export {};'],
      ['js/feature.ts', "import Feature from './components/Feature.svelte.native.js';"],
      ['tests/feature.test.ts', "import '../js/feature.js';"],
      ['tests/unrelated.test.ts', ''],
    ]);
    for (const removed of [false, true]) {
      if (removed) sources.delete(declaration);
      const plan = createTestPlan(sources, [declaration]);
      expect(plan.unit).toEqual(['tests/feature.test.ts']);
      expect(plan.uncovered).toEqual([]);
    }
  });

  it.each(['html', 'svg'])('propagates shared %s attribute augmentations to genuine component consumers', kind => {
    const declaration = `js/components/svelte-${kind}-attributes.d.ts`;
    const plan = createTestPlan(new Map([
      [declaration, 'export {};'],
      ['js/components/Feature.svelte', '<strong>Feature</strong>'],
      ['tests/feature.test.ts', "read('js/components/Feature.svelte');"],
      ['tests/unrelated.test.ts', ''],
    ]), [declaration]);
    expect(plan.unit).toEqual(['tests/feature.test.ts']);
    expect(plan.uncovered).toEqual([]);
  });

  it('keeps orphan, untested and unknown declarations fail closed despite unrelated tests', () => {
    const changes = ['js/components/Orphan.svelte.html.d.ts', 'js/components/Untested.svelte.native.d.ts', 'js/components/unknown.d.ts'];
    const plan = createTestPlan(new Map([
      ['js/components/Untested.svelte', '<span>Untested</span>'],
      ['tests/unrelated.test.ts', ''],
    ]), [...changes, 'tests/unrelated.test.ts']);
    expect(plan.uncovered).toEqual(changes);
    expect(createTestPlan(new Map([['tests/unrelated.test.ts', '']]), ['js/components/svelte-html-attributes.d.ts', 'tests/unrelated.test.ts']).uncovered)
      .toEqual(['js/components/svelte-html-attributes.d.ts']);
  });

  it.each(['js/kit/hooks.ts', 'js/kit/routes/app/+layout.ts'])('selects actual static artifact and alias contracts for discovered %s', source => {
    const plan = createTestPlan(new Map([
      [source, 'export const prerender = true;'],
      ['tests/production-build.test.ts', ''],
      ['tests/pwa/sveltekit.spec.ts', ''],
      ['tests/unrelated.test.ts', ''],
    ]), [source]);
    expect(plan.unit).toEqual(['tests/production-build.test.ts']);
    expect(plan.kit).toEqual(['tests/pwa/sveltekit.spec.ts']);
    expect(plan.performance).toBe(true);
    expect(plan.uncovered).toEqual([]);
  });

  it.each([
    ['js/provider-wallet-panel-renderers.ts', 'tests/wallet-mint-export-owned.test.ts'],
    ['js/provider-wallet-refund-recovery.ts', 'tests/provider-wallet-recovery-html.test.ts'],
  ])('retains replacement regression scope for retired %s', (source, test) => {
    const plan = createTestPlan(new Map([[test!, ''], ['tests/unrelated.test.ts', '']]), [source!]);
    expect(plan.unit).toEqual([test]);
    expect(plan.uncovered).toEqual([]);
    expect(createTestPlan(new Map([['tests/unrelated.test.ts', '']]), [source!, 'tests/unrelated.test.ts']).uncovered).toEqual([source]);
  });

  it('does not exempt arbitrary auto-discovered-looking or retired-looking modules', () => {
    const changes = ['js/kit/unknown.ts', 'js/provider-wallet-unknown.ts'];
    expect(createTestPlan(new Map([['tests/unrelated.test.ts', '']]), [...changes, 'tests/unrelated.test.ts']).uncovered).toEqual(changes);
  });
});


describe('behavior dependencies stop at packaging and runnable test boundaries', () => {
  const application = () => fixture({
    'js/main.js': "import './consumer.js';",
    'index.html': '<script type="module" src="/js/main.js"></script>',
    'service-worker-assets.ts': "const APP_SHELL = ['/js/leaf.js', '/js/unrelated.js'];",
    'service-worker.ts': "importScripts('/service-worker-assets.js');",
    'tests/pwa/kit-server.ts': "read('/index.html'); read('/service-worker.js');",
    'tests/pwa/sveltekit-unrelated.spec.ts': "import './kit-server.js';",
    'tests/pwa/sveltekit-app-shell.spec.ts': "read('index.html');",
    'tests/leaf-contract.test.ts': "read('js/leaf.js');",
    'scripts/known-tests.mts': "const contracts = ['tests/leaf-contract.test.js'];",
    'tests/planner.test.ts': "import '../scripts/known-tests.mjs';",
    'tests/service-worker-app-shell.test.ts': "read('service-worker-assets.js');",
    'tests/production-build.test.ts': "read('index.html');",
  });
  it('checks the changed feature plus packaging contracts without selecting every cached journey or a test consumer', () => {
    const plan = createTestPlan(application(), ['js/leaf.js']);
    expect(plan.unit).toContain('tests/leaf-contract.test.ts');
    expect(plan.unit).toContain('tests/service-worker-app-shell.test.ts'); expect(plan.unit).toContain('tests/production-build.test.ts');
    expect(plan.unit).not.toContain('tests/planner.test.ts'); expect(plan.kit).toEqual(['tests/pwa/sveltekit-app-shell.spec.ts']);
    expect(plan.browser).toEqual(['tests/playwright/consumer.spec.js']); expect(plan.uncovered).toEqual([]);
  });
  it.each(['service-worker-assets.ts', 'service-worker.ts', 'index.html', 'js/main.js'])('preserves full shipping acceptance for directly changed shared boundary %s', file => {
    expect(createTestPlan(application(), [file]).kit).toEqual(['tests/pwa/sveltekit-app-shell.spec.ts', 'tests/pwa/sveltekit-unrelated.spec.ts']);
  });
  it('does not let mandatory packaging contracts falsely cover an otherwise untested feature', () => {
    const plan = createTestPlan(application(), ['js/no-behavior-test.ts', 'js/components/Untested.svelte']);
    expect(plan.unit).toContain('tests/production-build.test.ts'); expect(plan.uncovered).toEqual(['js/no-behavior-test.ts', 'js/components/Untested.svelte']);
  });
  it('follows changed test helpers and retains each changed runnable test itself', () => {
    const sources = application();
    expect(createTestPlan(sources, ['tests/pwa/kit-server.ts']).kit).toEqual(['tests/pwa/sveltekit-app-shell.spec.ts', 'tests/pwa/sveltekit-unrelated.spec.ts']);
    const changedTest = createTestPlan(sources, ['tests/leaf-contract.test.ts']);
    expect(changedTest.unit).toEqual(['tests/leaf-contract.test.ts']);
    expect(changedTest.kit).toEqual([]);
  });
});


describe('additive module precache qualification', () => {
  const before = "const APP_SHELL = ['/index.html'];\nself.assets = APP_SHELL;";
  const after = "const APP_SHELL = ['/index.html', '/js/leaf.js'];\nself.assets = APP_SHELL;";
  const app = () => fixture({
    'service-worker-assets.ts': after,
    'tests/pwa/sveltekit-feature.spec.ts': "import '/js/leaf.js';",
    'tests/pwa/sveltekit-unrelated.spec.ts': '',
    'tests/service-worker-app-shell.test.ts': "read('service-worker-assets.js');",
    'tests/production-build.test.ts': '',
  });
  it('selects the added module behavior and exact graph contracts without every offline journey', () => {
    const plan = createTestPlan(app(), ['service-worker-assets.ts'], new Map([['service-worker-assets.ts', before]]));
    expect(plan.kit).toEqual(['tests/pwa/sveltekit-feature.spec.ts']);
    expect(plan.unit).toContain('tests/service-worker-app-shell.test.ts');
    expect(plan.unit).toContain('tests/production-build.test.ts');
    expect(plan.uncovered).toEqual([]); expect(plan.reasons.join(' ')).toContain('Additive precache');
  });
  it('fails closed if the added module has no behavior contract, despite unrelated graph contracts', () => {
    const files = app(); files.set('service-worker-assets.ts', after.replace('leaf.js', 'uncovered.js')); files.set('js/uncovered.ts', '');
    expect(createTestPlan(files, ['service-worker-assets.ts'], new Map([['service-worker-assets.ts', before]])).uncovered).toEqual(['js/uncovered.ts']);
  });
  it.each([
    undefined,
    "const APP_SHELL = ['/index.html', '/js/removed.js'];\nself.assets = APP_SHELL;",
    "const APP_SHELL = ['/index.html'];\nself.changed = APP_SHELL;",
  ])('keeps complete offline coverage for unavailable or nonadditive base %s', baseline => {
    const plan = createTestPlan(app(), ['service-worker-assets.ts'], new Map(baseline ? [['service-worker-assets.ts', baseline]] : []));
    expect(plan.kit).toHaveLength(2);
  });
  it.each([
    '/js/unknown.js', '/css/feature.css', '/js/../escape.js', '/js/leaf.js?changed=1', 'https://external.invalid/leaf.js',
  ])('rejects unqualified additions %s', url => {
    expect(additivePrecacheModules(before, after.replace('/js/leaf.js', url), new Set(['js/leaf.js']))).toBeNull();
  });
  it('rejects executable array elements, duplicate entries, and outside-array mutations', () => {
    const known = new Set(['js/leaf.js']);
    for (const changed of [after.replace("'/js/leaf.js'", 'load()'), after.replace("'/js/leaf.js'", "'/js/leaf.js', '/js/leaf.js'"), after + '\nself.extra = true;']) {
      expect(additivePrecacheModules(before, changed, known)).toBeNull();
    }
  });
});
