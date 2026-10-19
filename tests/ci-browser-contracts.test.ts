import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import strictAssert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {chromiumWorkers} from '../scripts/ci-workers.mjs';
import {allowedKitSkip, validateKitCases, portableKitIdentity, KIT_PROJECTS, type KitCase} from '../scripts/kit-acceptance-reporter.mjs';
import base from '../playwright.config.js';
import pwa from '../playwright.pwa.config.js';
import kit, {kitCaseSelection} from '../playwright.sveltekit.config.js';

const example = (overrides: Partial<KitCase> = {}): KitCase => ({id: 'case-a', file: 'tests/pwa/sveltekit.spec.ts', project: 'kit-chromium', title: 'acceptance', status: 'passed', expectedStatus: 'passed', ...overrides});
describe('bounded browser CPU scheduling', () => {
  it.each([[1, 1], [2, 1], [3, 2], [4, 2], [64, 2]])('uses %i CPUs without oversubscribing the default browser lane', (cpus, workers) => expect(chromiumWorkers({}, cpus)).toBe(workers));
  it('permits explicit whole-CPU tuning only within actual capacity', () => {
    expect(chromiumWorkers({GETBASED_CHROMIUM_WORKERS: '4'}, 4)).toBe(4);
    expect(chromiumWorkers({GETBASED_CHROMIUM_WORKERS: '1'}, 4)).toBe(1);
    for (const value of ['0', '-1', '50%', '1.5', '2x', '', '5', '9007199254740992']) expect(() => chromiumWorkers({GETBASED_CHROMIUM_WORKERS: value}, 4)).toThrow();
    for (const cpus of [0, -1, 1.5, NaN]) expect(() => chromiumWorkers({}, cpus)).toThrow();
  });
  it('separates native and Kit projects while keeping offline lifecycle serial', () => {
    expect(base.workers).toBe(chromiumWorkers());
    expect(pwa.testIgnore).toBe('**/sveltekit*.spec.{js,ts}');
    expect(kit.testMatch).toBe('sveltekit*.spec.ts');
    expect(pwa.workers).toBe(1); expect(kit.workers).toBe(1);
    expect(pwa.fullyParallel).toBe(false); expect(kit.fullyParallel).toBe(false);
    expect(kit.projects?.map(project => project.name)).toEqual([...KIT_PROJECTS]);
    expect(kit.reporter).toContainEqual(['./scripts/kit-acceptance-reporter.mjs']);
    expect(base.use?.headless).toBe(true); expect(kit.use?.headless).toBe(true);
  });
});
describe('SvelteKit acceptance collection and terminal-result guard', () => {
  it('accepts genuine collection-only discovery and executed acceptance', () => {
    expect(validateKitCases([example({status: undefined, expectedStatus: undefined})], false)).toEqual([]);
    expect(validateKitCases([example()], true)).toEqual([]);
  });
  it('uses portable file, title path and repeat identity across checkout roots', () => {
    const first = portableKitIdentity('/one/tests/pwa/sveltekit.spec.ts', 'kit-chromium', ['project', 'file', 'case'], 0, '/one');
    const second = portableKitIdentity('/two/tests/pwa/sveltekit.spec.ts', 'kit-chromium', ['project', 'file', 'case'], 0, '/two');
    expect(first).toEqual(second); expect(first.file).toBe('tests/pwa/sveltekit.spec.ts');
    expect(portableKitIdentity('/one/tests/pwa/sveltekit.spec.ts', 'kit-chromium', ['project', 'file', 'case'], 1, '/one').id).not.toBe(first.id);
  });
  it('fails closed for empty collections, wrong project/owner and duplicate identities', () => {
    expect(validateKitCases([], false).join()).toContain('No SvelteKit acceptance cases');
    expect(validateKitCases([example({project: 'pwa-chromium'})], false).join()).toContain('Unexpected project');
    expect(validateKitCases([example({file: 'tests/pwa/lifecycle.spec.ts'})], false).join()).toContain('Unexpected test owner');
    expect(validateKitCases([example(), example()], false).join()).toContain('Duplicate');
    expect(validateKitCases([example({declaredExpectedStatus: 'failed'})], false).join()).toContain('Unapproved declared expectation');
  });
  it('rejects missing terminal results, interrupted runs, false expected failures and unexpected skips', () => {
    for (const overrides of [{status: undefined}, {status: 'interrupted'}, {status: 'failed', expectedStatus: 'failed'}, {status: 'passed', expectedStatus: 'failed'}, {outcome: 'flaky', attemptCount: 2}, {outcome: 'expected', attemptCount: 0}, {status: 'skipped', expectedStatus: 'skipped', annotations: [{type: 'skip', description: 'temporary'}]}]) {
      expect(validateKitCases([example(overrides)], true).length).toBeGreaterThan(0);
    }
  });
  it('accepts only exact existing browser capability skips, with an executing companion', () => {
    const skip = example({id: 'capability', project: 'kit-firefox', file: 'tests/pwa/sveltekit-install.spec.ts', title: 'actual headless PWA install, standalone launch and zero-client offline launch retain local state', status: 'skipped', expectedStatus: 'skipped', annotations: [{type: 'skip', description: 'The installed-app protocol is specific to Chromium; other engines have separate browser acceptance.'}]});
    expect(allowedKitSkip(skip)).toBe(true);
    expect(validateKitCases([example(), skip], true)).toEqual([]);
    expect(validateKitCases([skip], true).join()).toContain('No SvelteKit acceptance case executed');
    expect(validateKitCases([skip], true, true)).toEqual([]);
    expect(validateKitCases([{...skip, expectedStatus: 'passed'}], true, true).length).toBeGreaterThan(0);
    for (const changed of [{project: 'kit-chromium'}, {file: 'tests/pwa/sveltekit-other.spec.ts'}, {title: skip.title + '!'}, {annotations: [{type: 'skip', description: 'new reason'}]}, {annotations: [{type: 'fixme', description: skip.annotations![0]!.description!}]}]) expect(allowedKitSkip({...skip, ...changed})).toBe(false);
  });
  it('pins every approved skip to its actual maintained test declaration', () => {
    const cases = [
      ['sveltekit-release-accessibility.spec.ts', 'The genuine chrome.tabs zoom proof uses bundled Chromium; keyboard Nutrition runs cross-engine separately.'],
      ['sveltekit-startup-performance.spec.ts', 'CDP startup diagnostics are Chromium-specific'],
      ['sveltekit-main-route-acceptance.spec.ts', 'This finite supplement selects desktop Chromium and emulated mobile WebKit only.'],
      ['sveltekit-main-route-acceptance.spec.ts', 'Finite desktop Chromium and emulated mobile WebKit contrast check.'],
      ['sveltekit-category.spec.ts', 'Finite actual desktop Chromium and emulated mobile WebKit contrast matrix.'],
      ['sveltekit-install.spec.ts', 'The installed-app protocol is specific to Chromium; other engines have separate browser acceptance.'],
    ];
    for (const [file, reason] of cases) expect(fs.readFileSync(`tests/pwa/${file}`, 'utf8')).toContain(reason);
  });
});


it('limits native OPFS placement to its exact maintained file, WebKit modes and platform', () => {
  expect(kitCaseSelection()).toEqual({testMatch: 'sveltekit*.spec.ts'});
  for (const project of ['kit-webkit', 'kit-mobile-webkit']) {
    expect(kitCaseSelection('webkit-standard', project, 'darwin')).toEqual({testMatch: 'sveltekit*.spec.ts', testIgnore: '**/sveltekit-knowledge-base.spec.ts'});
    expect(kitCaseSelection('webkit-opfs', project, 'darwin')).toEqual({testMatch: 'sveltekit-knowledge-base.spec.ts'});
    expect(() => kitCaseSelection('webkit-standard', project, 'linux')).toThrow('native platform');
    expect(() => kitCaseSelection('webkit-opfs', project, 'linux')).toThrow('native platform');
  }
  for (const scope of ['webkit-standard', 'webkit-opfs']) {
    for (const project of [undefined, 'kit-chromium', 'kit-firefox', 'foreign']) expect(() => kitCaseSelection(scope, project, 'darwin')).toThrow('WebKit project');
  }
  for (const scope of ['', '*', 'all-but-kb', 'webkit-opfs --headed']) expect(() => kitCaseSelection(scope)).toThrow('Unknown planned');
  const workflow = fs.readFileSync('.github/workflows/test.yml', 'utf8');
  expect(workflow).toContain('runs-on: ${{ matrix.runner }}');
  expect(workflow).toContain('needs: [prepare, unit, native, kit, performance, coverage]');
  expect(workflow).toContain('Prove every selected shipping case executed exactly once across all shards');
});


it('qualifies the native Linux font environment before unchanged shipping acceptance', () => {
  const workflow = fs.readFileSync('.github/workflows/test.yml', 'utf8');
  const start = workflow.indexOf('- name: Qualify the native Chart font before exact canvas acceptance');
  const end = workflow.indexOf('- name: Run selected shipping acceptance headlessly', start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const step = workflow.slice(start, end);
  expect(step).toContain("if: runner.os == 'Linux'");
  expect(step).toContain('node scripts/ci-native-fonts.mjs');
  expect(step).toContain('7c25be4d78155523080ab85b10277150657ff7dabbcad7037bdd536c9b6d0d08');
  expect(step).toContain('sha256sum --check --strict');
  expect(step).not.toMatch(/sudo.*(?:fonts\.conf|conf\.d)|sed.*(?:fonts\.conf|conf\.d)/);
});

describe('manual WebKit diagnostic isolation', () => {
  const workflow = fs.readFileSync('.github/workflows/test.yml', 'utf8');
  function job(source: string, name: string): string {
    const match = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z_]+:|$(?![\\s\\S]))`, 'm').exec(source);
    expect(match, `actual ${name} job`).not.toBeNull();
    return match![1]!;
  }
  function expression(source: string, name: string, key: string): string {
    const value = new RegExp(`^    ${key}: (.+)$`, 'm').exec(job(source, name))?.[1];
    expect(value, `${name}.${key}`).toBeTruthy();
    return value!.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  }
  function evaluate(value: string, event: string, diagnostic: string, success = true): unknown {
    // Evaluate only the actual finite GitHub predicate subset used by these jobs.
    return runInNewContext(value, {github: {event_name: event}, inputs: {diagnostic}, always: () => true, success: () => success}, {timeout: 100});
  }
  function verifyGates(source: string) {
    const prepare = expression(source, 'prepare', 'if'), aggregate = expression(source, 'test', 'if');
    const diagnosticJob = expression(source, 'webkit_diagnostics', 'if'), pwaDiagnosticJob = expression(source, 'webkit_pwa_routstr_diagnostics', 'if'), aggregateName = expression(source, 'test', 'name');
    expect(source).toContain("default: 'off'\n        options: ['off', 'webkit-lens-wearable', 'webkit-pwa-routstr']");
    for (const event of ['pull_request', 'push', 'workflow_call', 'workflow_dispatch']) for (const mode of ['off', '', 'webkit-lens-wearable', 'webkit-pwa-routstr', 'foreign']) {
      const lensDiagnostic = event === 'workflow_dispatch' && mode === 'webkit-lens-wearable';
      const pwaDiagnostic = event === 'workflow_dispatch' && mode === 'webkit-pwa-routstr';
      const diagnostic = lensDiagnostic || pwaDiagnostic;
      expect(evaluate(prepare, event, mode), `${event}/${mode} prepare`).toBe(!diagnostic);
      expect(evaluate(diagnosticJob, event, mode), `${event}/${mode} Lens diagnostic`).toBe(lensDiagnostic);
      expect(evaluate(pwaDiagnosticJob, event, mode), `${event}/${mode} PWA diagnostic`).toBe(pwaDiagnostic);
      expect(evaluate(aggregateName, event, mode), `${event}/${mode} required-name isolation`).toBe(diagnostic ? 'DIAGNOSTIC normal gate omitted' : 'test');
      // GitHub injects success() when no explicit status function is present.
      for (const priorSuccess of [true, false]) {
        const actual = /\balways\(\)/.test(aggregate) ? aggregate : `success() && (${aggregate})`;
        expect(evaluate(actual, event, mode, priorSuccess), `${event}/${mode}/${priorSuccess} aggregate`).toBe(!diagnostic);
      }
    }
    const group = /^  group: (.+)$/m.exec(source)?.[1];
    expect(group).toContain("${{ inputs.full_suite == true && 'full' || 'scoped' }}${{ github.event_name == 'workflow_dispatch' && inputs.diagnostic == 'webkit-lens-wearable' && '-webkit-diagnostic' || '' }}");
    expect(group).toContain("${{ github.event_name == 'workflow_dispatch' && inputs.diagnostic == 'webkit-pwa-routstr' && '-webkit-pwa-routstr-diagnostic' || '' }}");
    expect(source).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' && inputs.full_suite != true }}");
  }
  it('keeps every normal event and failed-prepare aggregator intact, including forged diagnostic inputs', () => verifyGates(workflow));
  it('rejects event bypass, missing always, default-on diagnostics and a misleading required check name', () => {
    for (const changed of [
      workflow.replace("    if: github.event_name != 'workflow_dispatch' || (inputs.diagnostic != 'webkit-lens-wearable' && inputs.diagnostic != 'webkit-pwa-routstr')", "    if: inputs.diagnostic != 'webkit-lens-wearable' && inputs.diagnostic != 'webkit-pwa-routstr'"),
      workflow.replace('    if: always() && (', '    if: ('),
      workflow.replace("    if: github.event_name == 'workflow_dispatch' && inputs.diagnostic == 'webkit-lens-wearable'", "    if: inputs.diagnostic == 'webkit-lens-wearable'"),
      workflow.replace("    if: github.event_name == 'workflow_dispatch' && inputs.diagnostic == 'webkit-pwa-routstr'", "    if: inputs.diagnostic == 'webkit-pwa-routstr'"),
      workflow.replace(" && inputs.diagnostic != 'webkit-pwa-routstr'", ""),
      workflow.replace('DIAGNOSTIC normal gate omitted', 'test'),
      workflow.replace("default: 'off'", "default: 'webkit-lens-wearable'"),
    ]) expect(() => verifyGates(changed)).toThrow();
  });
  it('preserves the exact native font commands, identity guards and bounded diagnostic command', () => {
    const diagnostic = job(workflow, 'webkit_diagnostics');
    expect(diagnostic).toContain('timeout-minutes: 20');
    expect(diagnostic).toContain('GETBASED_KIT_ACCEPTANCE_GUARD: \'1\'');
    expect(diagnostic).toContain('GETBASED_KIT_GUARD_REPORT: .local-notes/ci/webkit-diagnostics/guard.json');
    expect(diagnostic).toContain('PLAYWRIGHT_KIT_OUTPUT_DIR: .local-notes/ci/webkit-diagnostics/results');
    expect(diagnostic).toContain('--project=kit-webkit --workers=1 --retries=0');
    expect(diagnostic.match(/node scripts\/build-sveltekit\.mjs --output dist/g)).toHaveLength(1);
    expect(diagnostic).toContain('node scripts/ci-artifact.mjs seal --artifact dist');
    expect(diagnostic).toContain('node scripts/ci-artifact.mjs verify --artifact dist --transport "$DIAGNOSTIC_DIR/transport" --github-env');
    expect(diagnostic).not.toMatch(/\b(?:secrets|continue-on-error)\b|--(?:grep|headed|shard)\b|needs:/);
    const start = workflow.indexOf('- name: Qualify the native Chart font before exact canvas acceptance');
    const run = workflow.indexOf('        run: |\n', start) + '        run: |\n'.length;
    const end = workflow.indexOf('      - name: Run selected shipping acceptance headlessly', run);
    const originalCommands = workflow.slice(run, end).trimEnd().split('\n').map(line => line.slice(10)).join('\n');
    const copied = /          \{\n([\s\S]*?)          \} 2>&1 \| tee/.exec(diagnostic)?.[1];
    expect(copied?.trimEnd().split('\n').map(line => line.slice(12)).join('\n')).toBe(originalCommands);
  });
  it('executes the actual scope guard and rejects missing, duplicate, foreign, skipped or repeated cases', () => {
    const diagnostic = job(workflow, 'webkit_diagnostics');
    const block = /          node --input-type=module <<'NODE'\n([\s\S]*?)          NODE/.exec(diagnostic)?.[1];
    expect(block).toBeTruthy();
    const guard = block!.split('\n').map(line => line.slice(10)).filter(line => !line.startsWith('import ')).join('\n');
    const one = {file: 'tests/pwa/sveltekit-lens-shell.spec.ts', project: 'kit-webkit', attemptCount: 1, status: 'passed', expectedStatus: 'passed', annotations: [] as {type: string}[]};
    const two = {...one, file: 'tests/pwa/sveltekit-wearable-detail.spec.ts'};
    const report = {execution: true, issues: [], tests: [one, two]};
    const check = (value: unknown) => runInNewContext(guard, {assert: strictAssert, fs: {readFileSync: () => JSON.stringify(value), writeFileSync: () => {}}, process: {env: {GETBASED_KIT_GUARD_REPORT: 'synthetic', DIAGNOSTIC_DIR: 'synthetic'}}}, {timeout: 100});
    expect(() => check(report)).not.toThrow();
    for (const value of [
      {...report, tests: [one]}, {...report, tests: [one, one]}, {...report, tests: [one, {...two, file: 'tests/pwa/foreign.spec.ts'}]},
      {...report, tests: [one, {...two, project: 'kit-mobile-webkit'}]}, {...report, tests: [one, {...two, attemptCount: 2}]},
      {...report, tests: [one, {...two, status: 'skipped', expectedStatus: 'skipped'}]}, {...report, tests: [one, {...two, annotations: [{type: 'skip'}]}]},
      {...report, tests: [one, {...two, status: 'failed', expectedStatus: 'failed'}]}, {...report, execution: false}, {...report, issues: ['scope failure']},
    ]) expect(() => check(value)).toThrow();
  });
  it('keeps the Cocoa PWA diagnostic private, headless, single-case and naturally verified', () => {
    const diagnostic = job(workflow, 'webkit_pwa_routstr_diagnostics');
    expect(diagnostic).toContain('name: DIAGNOSTIC Cocoa mobile WebKit Routstr PWA (not a release gate)');
    expect(diagnostic).toContain('runs-on: macos-15');
    expect(diagnostic).toContain('timeout-minutes: 20');
    expect(diagnostic).toContain("GETBASED_KIT_ACCEPTANCE_GUARD: '1'");
    expect(diagnostic).toContain('GETBASED_KIT_PROJECT: kit-mobile-webkit');
    expect(diagnostic).toContain('GETBASED_PWA_DIAGNOSTIC: routstr-service-worker');
    expect(workflow.match(/^      GETBASED_PWA_DIAGNOSTIC:/gm)).toHaveLength(1);
    expect(workflow.slice(0, workflow.indexOf('  webkit_pwa_routstr_diagnostics:'))).not.toContain('GETBASED_PWA_DIAGNOSTIC');
    expect(diagnostic).toContain('GETBASED_KIT_CASE_SCOPE: all');
    expect(diagnostic).toContain('GETBASED_KIT_GUARD_REPORT: .local-notes/ci/webkit-pwa-routstr-diagnostics/guard.json');
    expect(diagnostic).toContain('PLAYWRIGHT_KIT_OUTPUT_DIR: .local-notes/ci/webkit-pwa-routstr-diagnostics/results');
    expect(diagnostic).toContain('persist-credentials: false');
    expect(diagnostic).toContain('node-version: 24');
    expect(diagnostic).toContain('run: node scripts/fetch-catalog.mts');
    expect(diagnostic).toContain('run: npm ci');
    expect(diagnostic).toContain('npx --no-install playwright install --with-deps webkit');
    expect(diagnostic.match(/node scripts\/build-sveltekit\.mjs --output dist/g)).toHaveLength(1);
    expect(diagnostic).toContain('node scripts/ci-artifact.mjs seal --artifact dist --transport "$DIAGNOSTIC_DIR/transport"');
    expect(diagnostic).toContain('node scripts/ci-artifact.mjs verify --artifact dist --transport "$DIAGNOSTIC_DIR/transport" --github-env');
    expect(diagnostic).toContain('--config=playwright.sveltekit.config.js --project=kit-mobile-webkit --workers=1 --retries=0');
    expect(diagnostic).toContain('tests/pwa/sveltekit-routstr-model-settings.spec.ts 2>&1 | tee "$DIAGNOSTIC_DIR/case.log"');
    const command = /      - name: Run only the unchanged mobile WebKit Routstr PWA case headlessly\n([\s\S]*?)      - name: Require exactly/.exec(diagnostic)?.[1];
    expect(command).toBeTruthy();
    expect(command!.match(/tests\/pwa\/[^\s]+\.spec\.ts/g)).toEqual(['tests/pwa/sveltekit-routstr-model-settings.spec.ts']);
    expect(command).toContain('set -euo pipefail');
    expect(diagnostic).not.toMatch(/\b(?:secrets|continue-on-error)\b|--(?:grep|headed|shard|timeout)\b|needs:|WEBKIT_SKIA|PLAYWRIGHT_WEBKIT_EXECUTABLE|FONTCONFIG|apt-get/);
    expect(diagnostic).toContain("if: always() && steps.diagnostic_cases.outcome != 'skipped'");
    expect(diagnostic).toContain('This run does not execute the normal matrix or provide the test release gate.');
    expect(diagnostic).toContain('name: diagnostic-webkit-pwa-routstr-${{ github.run_id }}-${{ github.run_attempt }}');
    for (const file of ['results', 'guard.json', 'scope.json', 'case.log', 'build.log', 'build-seal.json', 'build-verify.json', 'build-metrics.json', 'transport/manifest.json']) expect(diagnostic).toContain('.local-notes/ci/webkit-pwa-routstr-diagnostics/' + file);
    for (const pin of ['actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a']) expect(diagnostic).toContain(pin);
    const canonical = fs.readFileSync('tests/pwa/sveltekit-routstr-model-settings.spec.ts', 'utf8');
    expect(canonical.match(/^test\('/gm)).toHaveLength(1);
    expect(canonical).toContain("test('static Routstr models retain private and regular choices through unavailable-origin cold launch'");
    expect(canonical).toContain('test.setTimeout(120_000)');
  });
  it('executes the actual Cocoa PWA scope guard and rejects every false one-case result', () => {
    const diagnostic = job(workflow, 'webkit_pwa_routstr_diagnostics');
    const block = /          node --input-type=module <<'NODE'\n([\s\S]*?)          NODE/.exec(diagnostic)?.[1];
    expect(block).toBeTruthy();
    const guard = block!.split('\n').map(line => line.slice(10)).filter(line => !line.startsWith('import ')).join('\n');
    const one = {file: 'tests/pwa/sveltekit-routstr-model-settings.spec.ts', title: 'static Routstr models retain private and regular choices through unavailable-origin cold launch', project: 'kit-mobile-webkit', attemptCount: 1, status: 'passed', expectedStatus: 'passed', declaredExpectedStatus: 'passed', outcome: 'expected', annotations: [] as {type: string}[], declaredAnnotations: [] as {type: string}[]};
    const report = {execution: true, status: 'passed', issues: [], tests: [one]};
    let saved = '';
    const check = (value: unknown) => runInNewContext(guard, {assert: strictAssert, fs: {readFileSync: () => JSON.stringify(value), writeFileSync: (_path: string, body: string) => {saved = body;}}, process: {env: {GETBASED_KIT_GUARD_REPORT: 'synthetic', DIAGNOSTIC_DIR: 'synthetic'}}}, {timeout: 100});
    expect(() => check(report)).not.toThrow();
    expect(JSON.parse(saved)).toMatchObject({diagnosticOnly: true, releaseGate: false, platform: 'darwin', expectedFile: one.file, expectedTitle: one.title, expectedProject: one.project, report});
    for (const value of [
      {...report, tests: []}, {...report, tests: [one, one]},
      ...[{file: 'tests/pwa/sveltekit-foreign.spec.ts'}, {title: one.title + '!'}, {project: 'kit-webkit'}, {attemptCount: 0}, {attemptCount: 2}, {status: 'skipped', expectedStatus: 'skipped'}, {status: 'failed', expectedStatus: 'failed'}, {expectedStatus: 'failed'}, {declaredExpectedStatus: 'failed'}, {outcome: 'flaky'}, {annotations: [{type: 'skip'}]}, {annotations: [{type: 'fixme'}]}, {declaredAnnotations: [{type: 'skip'}]}, {declaredAnnotations: [{type: 'fixme'}]}].map(change => ({...report, tests: [{...one, ...change}]})),
      {...report, execution: false}, {...report, status: 'failed'}, {...report, issues: ['scope failure']},
    ]) expect(() => check(value)).toThrow();
  });
});
