import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import {chromiumWorkers} from '../scripts/ci-workers.mjs';
import {allowedKitSkip, validateKitCases, portableKitIdentity, KIT_PROJECTS, type KitCase} from '../scripts/kit-acceptance-reporter.mjs';
import base from '../playwright.config.js';
import pwa from '../playwright.pwa.config.js';
import kit from '../playwright.sveltekit.config.js';

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
