import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {createCiPlan, ciPlanOutputs, nativeLaneCommand, kitLaneCommand, kitCollectionCommand, KIT_OPFS_FILE} from '../scripts/ci-plan.mjs';
import type {TestPlan} from '../scripts/pr-test-scope.mjs';
function affected(changes: Partial<TestPlan> = {}): TestPlan {
  return {changedFiles: [], reasons: [], checks: [], unit: [], legacy: [], browser: [], firefox: [], pwa: [], kit: [], performance: false, sync: false, uncovered: [], ...changes};
}
describe('isolated CI matrix selection', () => {
  it('covers the complete native and four-project Kit families on full runs', () => {
    const plan = createCiPlan(true, null);
    expect(plan.nativeMatrix.include.filter(lane => lane.suite === 'browser').map(lane => lane.shard)).toEqual(['1/4', '2/4', '3/4', '4/4']);
    expect(plan.nativeMatrix.include.filter(lane => lane.suite !== 'browser').map(lane => lane.suite)).toEqual(['firefox', 'pwa', 'display']);
    expect(plan.kitMatrix.include.map(lane => [lane.project, lane.shard])).toEqual([
      ['kit-chromium', '1/2'], ['kit-chromium', '2/2'], ['kit-firefox', '1/2'], ['kit-firefox', '2/2'],
      ['kit-webkit', '1/2'], ['kit-webkit', '2/2'], ['kit-webkit', '1/1'],
      ['kit-mobile-webkit', '1/2'], ['kit-mobile-webkit', '2/2'], ['kit-mobile-webkit', '1/1'],
    ]);
    expect(plan.kitMatrix.include.map(lane => lane.engine)).toEqual(['chromium', 'chromium', 'firefox', 'firefox', 'webkit', 'webkit', 'webkit', 'webkit', 'webkit', 'webkit']);
    expect(plan.unit && plan.performance && plan.native && plan.kit).toBe(true);
    expect(plan.jobs).toEqual({prepare: true, unit: true, native: true, kit: true, performance: true, coverage: true});
    expect(new Set([...plan.nativeMatrix.include, ...plan.kitMatrix.include].map(lane => lane.id)).size).toBe(17);
  });
  it('keeps the required unit job but acquires no browsers for documentation-only changes', () => {
    const plan = createCiPlan(false, affected({changedFiles: ['README.md']}));
    expect(plan.nativeMatrix.include).toEqual([]); expect(plan.kitMatrix.include).toEqual([]);
    expect(plan.unit).toBe(true); expect(plan.performance || plan.native || plan.kit).toBe(false);
    expect(plan.jobs).toEqual({prepare: true, unit: true, native: false, kit: false, performance: false, coverage: false});
  });
  it('retains unit and mandatory tool checks without selecting browser lanes', () => {
    for (const selection of [{unit: ['tests/logic.test.ts']}, {legacy: ['tests/test-profile.ts']}, {checks: ['vendor:check'] as const}]) {
      const plan = createCiPlan(false, affected({...selection, checks: [...(selection.checks || [])]}));
      expect(plan.unit).toBe(true); expect(plan.native).toBe(false); expect(plan.kit).toBe(false);
    }
  });
  it.each([1, 2, 3, 4, 8])('bounds affected Chromium scheduling for %i selected files without dropping files', count => {
    const files = Array.from({length: count}, (_, index) => `tests/playwright/feature-${index}.spec.ts`);
    const plan = createCiPlan(false, affected({browser: files}));
    expect(plan.nativeMatrix.include).toHaveLength(Math.min(count, 4));
    for (const lane of plan.nativeMatrix.include) {
      const {command, environment} = nativeLaneCommand(plan, lane.id);
      expect(command).toEqual(['playwright', 'test', ...files, `--shard=${lane.shard}`]);
      expect(environment['PLAYWRIGHT_SUITE_COVERAGE']).toBe('0');
    }
  });
  it('selects all four Kit projects with one nonempty shard for a single affected acceptance file', () => {
    const file = 'tests/pwa/sveltekit-wearable-detail.spec.ts';
    const plan = createCiPlan(false, affected({kit: [file], performance: true}));
    expect(plan.nativeMatrix.include).toEqual([]); expect(plan.kitMatrix.include).toHaveLength(4); expect(plan.performance).toBe(true);
    expect(plan.kitMatrix.include.every(lane => lane.shard === '1/1')).toBe(true);
    for (const lane of plan.kitMatrix.include) expect(kitLaneCommand(plan, lane.id).command).toEqual(['playwright', 'test', file, '--config=playwright.sveltekit.config.js', `--project=${lane.project}`, `--shard=${lane.shard}`]);
  });
  it('retains the cross-engine Display supplement only when its maintained case is selected', () => {
    const plan = createCiPlan(false, affected({browser: ['tests/playwright/settings-display-pilot.spec.ts'], firefox: ['tests/firefox/offline.spec.ts'], pwa: ['tests/pwa/lifecycle.spec.ts']}));
    expect(plan.nativeMatrix.include.map(lane => lane.suite)).toEqual(['browser', 'firefox', 'pwa', 'display']);
    expect(nativeLaneCommand(plan, 'display-1-of-1').command).toEqual(['playwright', 'test', '--config=playwright.display-pilot.config.js', '--shard=1/1']);
    expect(nativeLaneCommand(plan, 'firefox-1-of-1').command).toEqual(['playwright', 'test', 'tests/firefox/offline.spec.ts', '--config=playwright.firefox.config.js', '--shard=1/1']);
    expect(nativeLaneCommand(plan, 'pwa-1-of-1').command).toEqual(['playwright', 'test', 'tests/pwa/lifecycle.spec.ts', '--config=playwright.pwa.config.js', '--shard=1/1']);
  });
  it('keeps full raw coverage shard directories distinct and enables collection only for full Chromium', () => {
    const plan = createCiPlan(true, null), directories: string[] = [];
    for (const lane of plan.nativeMatrix.include) {
      const {command, environment} = nativeLaneCommand(plan, lane.id);
      expect(environment['PLAYWRIGHT_REUSE_SERVER']).toBe('0');
      expect(environment['PLAYWRIGHT_SUITE_COVERAGE']).toBe(lane.suite === 'browser' ? '1' : '0');
      expect(environment['PLAYWRIGHT_COVERAGE_DIR']).toBe(path.join(process.cwd(), '.local-notes/ci/coverage', lane.id));
      expect(command).toContain(`--shard=${lane.shard}`);
      directories.push(environment['PLAYWRIGHT_COVERAGE_DIR']!);
    }
    expect(new Set(directories).size).toBe(7);
  });
  it('writes isolated exact Kit acceptance receipts and output directories', () => {
    const plan = createCiPlan(true, null);
    const receipts = plan.kitMatrix.include.map(lane => {
      const {command, environment} = kitLaneCommand(plan, lane.id);
      expect(command).toEqual(['playwright', 'test', ...(lane.caseScope === 'webkit-opfs' ? [KIT_OPFS_FILE] : []), '--config=playwright.sveltekit.config.js', `--project=${lane.project}`, `--shard=${lane.shard}`]);
      expect(environment['GETBASED_KIT_CASE_SCOPE']).toBe(lane.caseScope);
      expect(environment['GETBASED_KIT_ACCEPTANCE_GUARD']).toBe('1');
      expect(environment['PLAYWRIGHT_KIT_OUTPUT_DIR']).toBe(path.join(process.cwd(), '.local-notes/ci/results', lane.id));
      return environment['GETBASED_KIT_GUARD_REPORT'];
    });
    expect(new Set(receipts).size).toBe(10);
  });
  it('serializes exact GitHub matrix outputs and booleans', () => {
    const plan = createCiPlan(false, affected({performance: true})), outputs = ciPlanOutputs(plan);
    expect(outputs['performance']).toBe('true'); expect(outputs['full']).toBe('false'); expect(outputs['native']).toBe('false');
    expect(JSON.parse(outputs['native_matrix']!)).toEqual(plan.nativeMatrix); expect(JSON.parse(outputs['kit_matrix']!)).toEqual(plan.kitMatrix);
  });
  it('fails closed for uncovered runtime, malformed decisions, injected lanes and edited matrix plans', () => {
    expect(() => createCiPlan(false, affected({uncovered: ['js/uncovered.ts']}))).toThrow();
    expect(() => createCiPlan(true, affected())).toThrow(); expect(() => createCiPlan(false, null)).toThrow();
    const plan = createCiPlan(true, null);
    for (const id of ['', 'browser-1-of-5', 'browser-1-of-4 --headed', '../foreign']) expect(() => nativeLaneCommand(plan, id)).toThrow();
    expect(() => kitLaneCommand(plan, 'pwa-chromium-1-of-2')).toThrow();
    const edited = structuredClone(plan); edited.nativeMatrix.include[0]!.shard = '1/1';
    expect(() => nativeLaneCommand(edited, edited.nativeMatrix.include[0]!.id)).toThrow('Exact derived CI scheduling plan');
    const wrongCoverage = structuredClone(plan); wrongCoverage.nativeMatrix.include[0]!.coverage = false;
    expect(() => nativeLaneCommand(wrongCoverage, wrongCoverage.nativeMatrix.include[0]!.id)).toThrow();
  });
});

it('collects the same complete or affected Kit union without applying a matrix filter or starting browsers', () => {
  const full = kitCollectionCommand(createCiPlan(true, null));
  expect(full.command).toEqual(['playwright', 'test', '--config=playwright.sveltekit.config.js', '--list']);
  const files = ['tests/pwa/sveltekit.spec.ts', 'tests/pwa/sveltekit-wearable-detail.spec.ts'];
  const selected = kitCollectionCommand(createCiPlan(false, affected({kit: files})));
  expect(selected.command).toEqual(['playwright', 'test', ...files, '--config=playwright.sveltekit.config.js', '--list']);
  expect(selected.environment['GETBASED_KIT_ACCEPTANCE_GUARD']).toBe('1');
  expect(selected.environment['GETBASED_KIT_CASE_SCOPE']).toBe('all');
  expect(selected.environment['GETBASED_KIT_GUARD_REPORT']).toBe(path.join(process.cwd(), '.local-notes/ci/kit-collection.json'));
  expect(() => kitCollectionCommand(createCiPlan(false, affected()))).toThrow('Kit collection requires selected acceptance cases');
});

it('bounds affected Kit shards by selected file groups while preserving every selected file and project', () => {
  for (const count of [1, 2, 3]) {
    const files = Array.from({length: count}, (_, index) => `tests/pwa/sveltekit-feature-${index}.spec.ts`);
    const plan = createCiPlan(false, affected({kit: files}));
    expect(plan.kitMatrix.include).toHaveLength(4 * Math.min(2, count));
    for (const lane of plan.kitMatrix.include) {
      expect(kitLaneCommand(plan, lane.id).command).toEqual(['playwright', 'test', ...files, '--config=playwright.sveltekit.config.js', `--project=${lane.project}`, `--shard=${lane.shard}`]);
    }
  }
});


describe('native Cocoa shipping acceptance placement', () => {
  it('requires every original WebKit partition on Cocoa and retains Linux Chromium and Firefox', () => {
    const plan = createCiPlan(true, null);
    const cocoa = plan.kitMatrix.include.filter(lane => lane.runner === 'macos-15');
    expect(cocoa.map(lane => [lane.project, lane.shard, lane.caseScope])).toEqual([
      ['kit-webkit', '1/2', 'webkit-standard'], ['kit-webkit', '2/2', 'webkit-standard'], ['kit-webkit', '1/1', 'webkit-opfs'],
      ['kit-mobile-webkit', '1/2', 'webkit-standard'], ['kit-mobile-webkit', '2/2', 'webkit-standard'], ['kit-mobile-webkit', '1/1', 'webkit-opfs'],
    ]);
    expect(plan.kitMatrix.include.filter(lane => lane.runner === 'ubuntu-latest')).toHaveLength(4);
    expect(plan.jobs.kit).toBe(true);
    for (const lane of plan.kitMatrix.include) {
      expect(lane.runner).toBe(lane.engine === 'webkit' ? 'macos-15' : 'ubuntu-latest');
      if (lane.engine !== 'webkit') expect(lane.caseScope).toBe('all');
    }
  });
  it.each([[], ['tests/pwa/sveltekit.spec.ts'], ['tests/pwa/sveltekit.spec.ts', 'tests/pwa/sveltekit-wearable-detail.spec.ts']].map(companions => ({companions})))('partitions KB and $companions without dropping a browser identity', ({companions}) => {
    const files = [KIT_OPFS_FILE, ...companions];
    const plan = createCiPlan(false, affected({kit: files}));
    const cocoa = plan.kitMatrix.include.filter(lane => lane.caseScope === 'webkit-opfs');
    expect(cocoa).toHaveLength(2);
    for (const project of ['kit-chromium', 'kit-firefox', 'kit-webkit', 'kit-mobile-webkit']) {
      const lanes = plan.kitMatrix.include.filter(lane => lane.project === project);
      expect(lanes.length).toBeGreaterThan(0);
      const groups = new Map(lanes.map(lane => [lane.caseScope, kitLaneCommand(plan, lane.id).command.filter(arg => arg.endsWith('.spec.ts'))]));
      const observed = [...groups.values()].flat();
      expect(observed.toSorted()).toEqual(files.toSorted());
      expect(new Set(observed).size).toBe(files.length);
      for (const lane of lanes) {
        const selected = kitLaneCommand(plan, lane.id).command.filter(arg => arg.endsWith('.spec.ts'));
        expect(selected.length).toBeGreaterThan(0);
        if (lane.caseScope === 'webkit-opfs') expect(selected).toEqual([KIT_OPFS_FILE]);
        if (lane.caseScope === 'webkit-standard') expect(selected).toEqual(companions);
      }
    }
  });
  it('rejects removed Cocoa lanes and forged platform or case partitions', () => {
    const plan = createCiPlan(true, null);
    for (const mutate of [
      (value: typeof plan) => {value.kitMatrix.include = value.kitMatrix.include.filter(lane => lane.caseScope !== 'webkit-opfs');},
      (value: typeof plan) => {value.kitMatrix.include.find(lane => lane.caseScope === 'webkit-opfs')!.runner = 'ubuntu-latest';},
      (value: typeof plan) => {value.kitMatrix.include.find(lane => lane.caseScope === 'webkit-standard')!.runner = 'ubuntu-latest';},
      (value: typeof plan) => {value.kitMatrix.include.find(lane => lane.caseScope === 'webkit-standard')!.caseScope = 'all';},
    ]) {
      const corrupted = structuredClone(plan); mutate(corrupted);
      expect(() => kitLaneCommand(corrupted, corrupted.kitMatrix.include[0]!.id)).toThrow('Exact derived CI scheduling plan');
    }
  });
});
