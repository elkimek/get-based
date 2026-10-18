#!/usr/bin/env node
// Plan from tracked files only. Planning is read-only; execution is CI-only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript/unstable/ast';
import { withParsedSource, withParsedSources } from './native-typescript-ast.js';
import { runtimePath, sourcePath } from './source-files.js';
import { scriptSource, syntaxFile } from './svelte-source.mjs';
import { projectOwnedVendorSources, readVendorManifest } from './project-owned-vendor.mjs';

type BrowserSuite = 'browser' | 'firefox' | 'pwa' | 'kit';
type ValidationCheck = 'vendor:check' | 'vendor:evolu8:check' | 'marker-schema:check';
export interface TestPlan {
  changedFiles: string[]; reasons: string[]; unit: string[]; legacy: string[];
  browser: string[]; firefox: string[]; pwa: string[]; kit: string[]; performance: boolean; sync: boolean; uncovered: string[]; checks: ValidationCheck[];
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY = 'tests/_vitest-legacy.test.js';
const SOURCE = /\.(?:[cm]?[jt]s|svelte|json|html|css|yml|yaml)$/;
const isUnit = (file: string) => file.startsWith('tests/') && /\.test\.[jt]s$/.test(file) && runtimePath(file) !== LEGACY;
const isBrowser = (file: string) => /^tests\/playwright\/.*\.spec\.[jt]s$/.test(file);
const isFirefox = (file: string) => /^tests\/firefox\/.*\.spec\.[jt]s$/.test(file);
const isKit = (file: string) => /^tests\/pwa\/sveltekit[^/]*\.spec\.[jt]s$/.test(file);
const isPwa = (file: string) => /^tests\/pwa\/.*\.spec\.[jt]s$/.test(file) && !isKit(file);
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Explicit edges cover UI-only tests that exercise these catalogs through DOM
// controls rather than importing their implementation directly.
const MODEL_SOURCES = new Set(['js/api-models.js', 'js/api-ppq.js', 'js/api-routstr.js']);
const MODEL_TESTS = /(?:api-provider|provider-model|provider-coverage|provider-polling|private-tee-provider|chat-model|nutrition-module|nutrition-ai-settings|openrouter-settings|test-openrouter|test-ppq-provider)/;

// Build inputs and split path.join source readers are not ordinary module
// imports. These exact tool boundaries select their real artifact contracts;
// generators with a read-only reproducibility check also run it in PR CI.
interface ToolScope { sources: readonly string[]; tests: readonly string[]; check?: ValidationCheck }
const TOOL_SCOPES: readonly ToolScope[] = [
  { sources: ['scripts/build-svelte.mjs', 'scripts/svelte-source.mjs', 'js/components/DisplaySettings.svelte.native.js', 'js/components/DisplaySettings.svelte.native.d.ts', 'tsconfig.svelte.json', 'tooling/svelte/package.json'], tests: ['tests/svelte-pilot-build.test.js', 'tests/playwright/settings-display-pilot.spec.js', 'tests/pwa/settings-display-pilot.spec.js'] },
  { sources: ['scripts/build-styles.mjs', 'css/settings-display.tailwind.css', 'css/settings.base.css'], tests: ['tests/styles-build.test.js', 'tests/playwright/settings-display-pilot.spec.js'] },
  {
    sources: ['scripts/build-browser-vendors.mjs', ...['cashu', 'ehbp', 'tinfoil', 'venice-e2ee', 'venice-nvidia', 'venice-dcap', 'routstr-crypto', 'zlib-browser-shim'].map(name => `scripts/vendor-entries/${name}.js`)],
    tests: ['tests/cashu-vendor-compat.test.js', 'tests/cashu-durable-vendor.test.js', 'tests/tinfoil-secure-fetch.test.js', 'tests/venice-dcap-verify-only.test.js', 'tests/playwright/ppq-private-tee-provider.spec.js'],
    check: 'vendor:check',
  },
  {
    sources: ['scripts/build-evolu8-vendor.mjs', ...['evolu8', 'evolu8-db-worker', 'evolu8-shared-worker'].map(name => `scripts/vendor-entries/${name}.js`)],
    tests: ['tests/sync-evolu8-candidate.test.js', 'tests/sync-evolu8-identity-vault.test.js', 'tests/playwright/sync-evolu8-identity-vault.spec.js'],
    check: 'vendor:evolu8:check',
  },
  // Kit discovers these entrypoints by filename rather than an import edge.
  { sources: ['js/kit/hooks.js', 'js/kit/routes/app/+layout.js'], tests: ['tests/production-build.test.js', 'tests/pwa/sveltekit.spec.js'] },
  // Retired serializers have no remaining importers. Their replacement owners
  // retain these concrete mint/seed/withdraw/node and refund recovery contracts.
  { sources: ['js/provider-wallet-panel-renderers.js'], tests: ['tests/wallet-mint-export-owned.test.js', 'tests/wallet-seed-owned.test.js', 'tests/wallet-withdraw-owned.test.js', 'tests/wallet-node-owned.test.js', 'tests/playwright/routstr-wallet-dom.spec.js', 'tests/pwa/sveltekit-wallet-mints.spec.js', 'tests/pwa/sveltekit-wallet-seed.spec.js', 'tests/pwa/sveltekit-wallet-withdraw.spec.js', 'tests/pwa/sveltekit-wallet-node.spec.js'] },
  { sources: ['js/provider-wallet-refund-recovery.js'], tests: ['tests/provider-wallet-recovery-html.test.js', 'tests/wallet-node-owned.test.js', 'tests/playwright/routstr-wallet-dom.spec.js', 'tests/pwa/sveltekit-wallet-node.spec.js'] },
  { sources: ['scripts/build-marker-schema.mjs'], tests: ['tests/marker-schema-contract.test.js', 'tests/profile-marker-schema-migration.test.js'], check: 'marker-schema:check' },
  { sources: ['scripts/fetch-catalog.mjs'], tests: ['tests/project-owned-ci.test.js', 'tests/test-dev-server-helpers.js', 'tests/recommendations-runtime.test.js'] },
  { sources: ['scripts/generate-import-reference-pdf.mjs'], tests: ['tests/project-owned-ci.test.js', 'tests/playwright/import-benchmarks.spec.js'] },
  { sources: ['scripts/playwright-coverage.mjs'], tests: ['tests/coverage-source.test.js', 'tests/coverage-gate.test.js', 'tests/playwright/coverage-fixture.spec.js'] },
  { sources: ['scripts/quality-guardrails.mjs'], tests: ['tests/quality-guardrails.test.js'] },
  { sources: ['scripts/upgrade-demos.mjs'], tests: ['tests/project-owned-ci.test.js', 'tests/test-demo.js', 'tests/playwright/demo-biology.spec.js', 'tests/playwright/demo-nutrition.spec.js'] },
];

// These are actual shipping entry/configuration owners, not artificial test
// edges. Their imported helpers and JSON policies are reached by the same
// reverse dependency graph as affected tests. Auto-discovered Kit route files
// have no ordinary import edge, so keep that real framework boundary explicit.
const SHIPPING_PERFORMANCE_ROOTS = new Set([
  'scripts/sveltekit-performance-budget.mjs',
  'scripts/build-sveltekit.mjs',
  'tooling/svelte/build-static.mjs',
  '.github/workflows/test.yml',
]);

export function fileReferences(file: string, source: string, knownFiles: Set<string>): Set<string> {
  // Non-code text used the JavaScript grammar in the original source reader.
  const syntaxName = file.endsWith('.svelte') ? syntaxFile(file) : /\.[cm]?[jt]s$/.test(file) ? file : `${file}.js`;
  return withParsedSource(scriptSource(file, source), syntaxName, parsed => referencesFromFile(file, source, knownFiles, parsed));
}

function referencesFromFile(file: string, source: string, knownFiles: Set<string>, parsed: ts.SourceFile): Set<string> {
  const refs = new Set<string>();
  const add = (raw: string) => {
    const clean = raw.split(/[?#]/, 1)[0]!;
    const candidates = [
      clean.replace(/^\//, ''),
      path.posix.normalize(path.posix.join(path.posix.dirname(file), clean)),
    ];
    for (const candidate of candidates.flatMap(candidate => [/\.svelte\.(?:native|html)\.js$/.test(candidate) ? candidate.replace(/\.(?:native|html)\.js$/, '') : candidate.replace(/\.mjs$/, '.mts').replace(/\.cjs$/, '.cts').replace(/\.js$/, '.ts'), candidate])) {
      if (candidate !== file && knownFiles.has(candidate)) refs.add(candidate);
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLikeNode(node)) add(node.text);
    node.forEachChild(visit);
  };
  visit(parsed);
  // Also handle HTML script/link attributes and paths embedded in HTML strings.
  for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) add(match[1]!);
  return refs;
}

function referencesForSources(sources: Map<string, string>, knownFiles: Set<string>) {
  const eligible = [...sources].filter(([file]) => SOURCE.test(file));
  const syntaxSources = new Map(eligible.map(([file, source]) => [
    file.endsWith('.svelte') ? syntaxFile(file) : /\.[cm]?[jt]s$/.test(file) ? file : `${file}.js`, scriptSource(file, source),
  ]));
  // Preserve independent source reads when a non-code syntax alias collides.
  if (!eligible.length || syntaxSources.size !== eligible.length) {
    return new Map(eligible.map(([file, source]) => [file, fileReferences(file, source, knownFiles)]));
  }
  return withParsedSources(syntaxSources, parsed => new Map(eligible.map(([file, source]) => {
    const syntaxName = file.endsWith('.svelte') ? syntaxFile(file) : /\.[cm]?[jt]s$/.test(file) ? file : `${file}.js`;
    return [file, referencesFromFile(file, source, knownFiles, parsed.get(syntaxName)!)];
  })));
}

export function createTestPlan(sources: Map<string, string>, changedFiles: string[]): TestPlan {
  const known = new Set([...sources.keys(), ...changedFiles]);
  const ownedVendor = new Set(projectOwnedVendorSources(sources.get('vendor/components.json'), [...known]));
  const reverse = new Map<string, Set<string>>();
  const references = referencesForSources(sources, known);
  for (const [file] of sources) {
    if (!SOURCE.test(file)) continue;
    for (const dependency of references.get(file)!) {
      if (!reverse.has(dependency)) reverse.set(dependency, new Set());
      reverse.get(dependency)!.add(file);
    }
  }
  // A deleted authored JS path can still be the runtime URL of its current
  // native owner. Preserve that real alias edge rather than exempting deletion.
  for (const file of sources.keys()) {
    const runtime = runtimePath(file);
    if (runtime !== file && known.has(runtime)) {
      if (!reverse.has(runtime)) reverse.set(runtime, new Set());
      reverse.get(runtime)!.add(file);
    }
  }
  // Native facade declarations and ambient HTML/SVG augmentations are resolved
  // implicitly by the component compiler. Keep them connected to their actual
  // authored owners, including a deleted declaration, instead of exempting all
  // declaration files from the missing-relevant-tests guard.
  const components = [...sources.keys()].filter(file => file.startsWith('js/components/') && file.endsWith('.svelte'));
  for (const file of known) {
    const component = /^js\/components\/.+\.svelte\.(?:native|html)\.d\.ts$/.test(file)
      ? file.replace(/\.(?:native|html)\.d\.ts$/, '') : undefined;
    const owners = component && sources.has(component) ? [component]
      : ['js/components/svelte-html-attributes.d.ts', 'js/components/svelte-svg-attributes.d.ts'].includes(file) ? components : [];
    if (!owners.length) continue;
    if (!reverse.has(file)) reverse.set(file, new Set());
    owners.forEach(owner => reverse.get(file)!.add(owner));
  }
  const checks = new Set<ValidationCheck>();
  for (const scope of TOOL_SCOPES) {
    // Explicit edges also propagate a helper dependency into its tool's scope.
    for (const [file] of sources) {
      if (!scope.sources.includes(runtimePath(file))) continue;
      for (const test of sources.keys()) {
        if (!scope.tests.includes(runtimePath(test))) continue;
        if (!reverse.has(file)) reverse.set(file, new Set());
        reverse.get(file)!.add(test);
      }
    }
    for (const changed of changedFiles) {
      if (!scope.sources.includes(runtimePath(changed))) continue;
      for (const test of sources.keys()) {
        if (!scope.tests.includes(runtimePath(test))) continue;
        if (!reverse.has(changed)) reverse.set(changed, new Set());
        reverse.get(changed)!.add(test);
      }
    }
  }
  const affected = new Set(changedFiles);
  // These catalog modules have an explicit feature boundary: following their
  // api.js barrel into app startup would otherwise select almost every UI test.
  const queue = changedFiles.filter(file => !MODEL_SOURCES.has(runtimePath(file)));
  for (const file of changedFiles.filter(file => MODEL_SOURCES.has(runtimePath(file)))) {
    for (const consumer of reverse.get(file) || []) {
      if (consumer.startsWith('tests/')) {
        affected.add(consumer);
        queue.push(consumer);
      }
    }
  }
  while (queue.length) {
    for (const consumer of reverse.get(queue.pop()!) || []) {
      // The legacy harness lists every script; select its individual cases below.
      if (runtimePath(consumer) === LEGACY || affected.has(consumer)) continue;
      affected.add(consumer);
      queue.push(consumer);
    }
  }
  for (const scope of TOOL_SCOPES) {
    if (scope.check && [...affected].some(file => scope.sources.includes(runtimePath(file)))) checks.add(scope.check);
  }
  const all = [...sources.keys()];
  const legacyHarness = all.find(file => runtimePath(file) === LEGACY) || LEGACY;
  const legacyScripts = [...fileReferences(legacyHarness, sources.get(legacyHarness) || '', known)]
    .filter(file => /^tests\/test-.*\.[jt]s$/.test(file));
  const reasons: string[] = [];
  const addMatching = (predicate: (file: string) => boolean, reason: string): void => {
    all.filter(predicate).forEach(file => affected.add(file));
    reasons.push(reason);
  };
  if (changedFiles.some(file => MODEL_SOURCES.has(runtimePath(file)))) {
    addMatching(file => file.startsWith('tests/') && MODEL_TESTS.test(file), 'Provider model catalogs: include DOM model selectors and routing contracts.');
  }
  if (changedFiles.some(file => /^(package(?:-lock)?\.json|vitest.*\.js|tests\/_vitest.*\.js)$/.test(runtimePath(file)))) {
    addMatching(file => isUnit(file) || legacyScripts.includes(file), 'Shared unit dependencies or harness changed: all unit cases are affected.');
  }
  if (changedFiles.some(file => /^(package(?:-lock)?\.json|playwright\.config\.js|dev-server\.js|index\.html|css\/|js\/(?:main|startup[^/]*|state|utils)\.js|tests\/playwright\/.*(?:fixture|helper).*\.js)/.test(runtimePath(file)))) {
    addMatching(isBrowser, 'Shared browser runtime, styling, dependencies, or harness changed: all Chromium specs are affected.');
  }
  if (changedFiles.some(file => /^(package(?:-lock)?\.json|service-worker[^/]*\.js|version\.js|index\.html|manifest.*\.json|playwright(?:\.pwa)?\.config\.js|tests\/pwa\/.*(?:fixture|helper|server|support)[^/]*\.[cm]?js$)/.test(runtimePath(file)))) {
    addMatching(file => isPwa(file) || isKit(file), 'Offline lifecycle or PWA harness changed.');
  }
  if (changedFiles.some(file => /^(playwright\.sveltekit\.config\.js|scripts\/kit-acceptance-reporter\.mjs|js\/kit\/|tooling\/svelte\/|scripts\/build-sveltekit\.mjs|css\/|js\/(?:main|startup[^/]*|state|utils)\.js)/.test(runtimePath(file)))) {
    addMatching(isKit, 'Shipping SvelteKit routes, styling, artifact builder or acceptance harness changed.');
  }
  if (changedFiles.some(file => /^(playwright(?:\.firefox)?\.config\.js|tests\/firefox\/|package(?:-lock)?\.json)/.test(runtimePath(file)))) {
    addMatching(isFirefox, 'Firefox harness or shared dependencies changed.');
  }
  if (changedFiles.some(file => file.startsWith('.github/workflows/') || runtimePath(file) === 'scripts/pr-test-scope.mjs')) {
    affected.add(all.find(file => runtimePath(file) === 'tests/pr-test-scope.test.js') || 'tests/pr-test-scope.test.js');
  }
  const select = (predicate: (file: string) => boolean) => all.filter(file => affected.has(file) && predicate(file)).sort();
  const browser = select(isBrowser);
  const pwa = select(isPwa);
  const kit = select(isKit);
  const performance = browser.length > 0 || pwa.length > 0 || kit.length > 0 || [...affected].some(file =>
    SHIPPING_PERFORMANCE_ROOTS.has(runtimePath(file)) || file.startsWith('js/kit/')
      || file.startsWith('tooling/svelte/'));
  const plan: Omit<TestPlan, 'uncovered'> & Partial<Pick<TestPlan, 'uncovered'>> = {
    changedFiles: [...changedFiles].sort(), reasons, checks: [...checks].sort(),
    unit: select(isUnit), legacy: legacyScripts.filter(file => affected.has(file)).sort(),
    browser, firefox: select(isFirefox), pwa, kit, performance,
    sync: all.some(file => affected.has(file) && (/^tests\/evolu8-browser\//.test(file) || runtimePath(file) === 'tests/playwright/sync-relay-transport-e2e.spec.js'))
      || changedFiles.some(file => /^(package(?:-lock)?\.json|playwright(?:\.evolu8)?\.config\.js|\.github\/workflows\/sync-compat\.yml)$/.test(runtimePath(file))),
  };
  // An unknown runtime change must never silently produce an empty green check.
  const selected = new Set([...plan.unit, ...plan.legacy, ...plan.browser, ...plan.firefox, ...plan.pwa, ...plan.kit]);
  plan.uncovered = changedFiles.filter(file => {
    if (!/^(js\/|lib\/|api\/|server\/|scripts\/).*\.[cm]?[jt]s$/.test(file) && !ownedVendor.has(file)) return false;
    if (MODEL_SOURCES.has(runtimePath(file))) return ![...selected].some(test => MODEL_TESTS.test(test));
    if (TOOL_SCOPES.some(scope => scope.sources.includes(runtimePath(file)) && scope.check && checks.has(scope.check))) return false;
    const visited = new Set([file]);
    const pending = [file];
    while (pending.length) {
      const current = pending.pop()!;
      if (selected.has(current) || TOOL_SCOPES.some(scope => scope.sources.includes(runtimePath(current)) && scope.check && checks.has(scope.check))) return false;
      for (const consumer of reverse.get(current) || []) {
        if (runtimePath(consumer) === LEGACY || visited.has(consumer)) continue;
        visited.add(consumer);
        pending.push(consumer);
      }
    }
    return true;
  });
  return plan as TestPlan;
}

/** Matrix routing is independent of test selection and cannot escape Kit projects. */
export function kitMatrixArguments(environment: NodeJS.ProcessEnv = process.env): string[] {
  const args: string[] = [];
  const project = environment['GETBASED_KIT_PROJECT'];
  if (project !== undefined) {
    if (!['kit-chromium', 'kit-firefox', 'kit-webkit', 'kit-mobile-webkit'].includes(project)) throw new Error('Invalid GETBASED_KIT_PROJECT');
    args.push(`--project=${project}`);
  }
  const shard = environment['GETBASED_KIT_SHARD'];
  if (shard !== undefined) {
    const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(shard);
    const current = Number(match?.[1]), total = Number(match?.[2]);
    if (!match || !Number.isSafeInteger(current) || !Number.isSafeInteger(total) || current > total || total > 64) throw new Error('Invalid GETBASED_KIT_SHARD (expected N/M, 1 <= N <= M <= 64)');
    args.push(`--shard=${shard}`);
  }
  return args;
}

export function testCommands(plan: TestPlan, suite: string | undefined, resolvePath: (file: string) => string = file => file, environment: NodeJS.ProcessEnv = process.env): string[][] {
  const commands = [];
  if (suite === 'unit') {
    if (plan.unit.length) commands.push(['vitest', 'run', ...plan.unit]);
    if (plan.legacy.length) commands.push(['vitest', 'run', resolvePath(LEGACY), '-t', plan.legacy.map(file => {
      const name = path.posix.basename(file);
      return /\.[cm]?ts$/.test(name)
        ? `^(?:${escapeRegex(name)}|${escapeRegex(path.posix.basename(runtimePath(file)))})$`
        : `^${escapeRegex(name)}$`;
    }).join('|')]);
  } else if ((['browser', 'firefox', 'pwa', 'kit'] as readonly (string | undefined)[]).includes(suite)) {
    if (plan[suite as BrowserSuite].length) commands.push(['playwright', 'test', ...plan[suite as BrowserSuite], ...(suite === 'browser' ? [] : [`--config=playwright.${suite === 'kit' ? 'sveltekit' : suite}.config.js`]), ...(suite === 'kit' ? kitMatrixArguments(environment) : [])]);
  } else throw new Error(`Unknown test suite: ${suite}`);
  return commands;
}

/** Consumers compile before selection. Reuse that emission for marker checks;
 * the standard local npm command retains its compilation safety prehook. */
export function validationCommands(plan: { checks?: readonly string[] }): string[][] {
  return (plan.checks || []).map(check => {
    if (!['vendor:check', 'vendor:evolu8:check', 'marker-schema:check'].includes(check)) throw new Error(`Unknown mandatory validation: ${check}`);
    return check === 'marker-schema:check'
      ? ['node', 'scripts/build-marker-schema.mjs', '--check']
      : ['npm', 'run', check];
  });
}

export function planningSourceFiles(files: readonly string[], vendorManifest: string | undefined): string[] {
  const ownedVendor = new Set(projectOwnedVendorSources(vendorManifest, files));
  return files.filter(file => SOURCE.test(file) && !/^(docs|dist-docs)\//.test(file)
    && (!file.startsWith('vendor/') || file === 'vendor/components.json' || ownedVendor.has(file)));
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

function main(): void {
  const args = process.argv.slice(2);
  const value = (flag: string) => args[args.indexOf(flag) + 1];
  const output = value('--output');
  if (!args.includes('--output') || !output) throw new Error('--output is required');
  if (args.includes('--run')) {
    if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Automatic test execution is GitHub Actions-only. Run explicit relevant tests locally.');
    const plan = JSON.parse(fs.readFileSync(output, 'utf8')) as TestPlan;
    if (plan.uncovered.length) throw new Error(`Add test scope for: ${plan.uncovered.join(', ')}`);
    if (value('--run') === 'unit') {
      for (const command of validationCommands(plan)) {
        console.log(JSON.stringify(command));
        const result = spawnSync(command[0]!, command.slice(1), { cwd: ROOT, stdio: 'inherit', env: process.env });
        if (result.error) throw result.error;
        if (result.status !== 0) process.exit(result.status || 1);
      }
    }
    for (const command of testCommands(plan, value('--run'), sourcePath)) {
      console.log(JSON.stringify(command));
      const result = spawnSync('npx', ['--no-install', ...command], { cwd: ROOT, stdio: 'inherit', env: process.env });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status || 1);
    }
    return;
  }
  const base = value('--base');
  if (!args.includes('--base') || !/^[a-f0-9]{40}$/.test(base || '')) throw new Error('--base must be a full Git SHA');
  const changedFiles = git('diff', '--name-only', '-z', `${base}...HEAD`).split('\0').filter(Boolean);
  const files = git('ls-files', '-z').split('\0').filter(Boolean);
  const sources = new Map(planningSourceFiles(files, readVendorManifest(ROOT)).filter(file => fs.existsSync(path.join(ROOT, file)))
    .map(file => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')]));
  const plan = createTestPlan(sources, changedFiles);
  fs.writeFileSync(output, JSON.stringify(plan, null, 2) + '\n');
  const summary = ['## Affected PR tests', ...['unit', 'legacy', 'browser', 'firefox', 'pwa', 'kit'].map(suite => `- ${suite}: ${plan[suite as BrowserSuite].length}`), `- shipping transfer budget: ${plan.performance}`, `- mandatory validation: ${plan.checks.join(', ') || 'none'}`, ...plan.reasons.map(reason => `- ${reason}`), '\nFull coverage runs on main, manual dispatch, and explicit release verification.'].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, ['browser', 'firefox', 'pwa', 'kit'].map(suite => `${suite}=${Boolean(plan[suite as BrowserSuite].length)}\n`).join('') + `sync=${plan.sync}\nperformance=${plan.performance}\n`);
  if (plan.uncovered.length) throw new Error(`No tests selected. Add explicit scope for: ${plan.uncovered.join(', ')}`);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) main();
