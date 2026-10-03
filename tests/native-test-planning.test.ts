import { describe, expect, it } from 'vitest';
import { createTestPlan, testCommands } from '../scripts/pr-test-scope.mjs';

function nativeSources(): Map<string, string> {
  return new Map([
    ['js/leaf.ts', 'export const value = 1;'],
    ['tests/consumer.test.ts', "import { value } from '../js/leaf.js';"],
    ['tests/_vitest-legacy.test.ts', "const cases = ['./test-one.js', './test-two.ts'];"],
    ['tests/test-one.ts', "read('js/leaf.js');"],
    ['tests/test-two.ts', "read('js/other.js');"],
    ['tests/pr-test-scope.test.ts', ''],
    ['tests/playwright/sync-relay-transport-e2e.spec.ts', "import '/js/leaf.js';"],
  ]);
}

describe('native test path planning', () => {
  it('selects the affected native legacy case without expanding its wrapper', () => {
    const plan = createTestPlan(nativeSources(), ['js/leaf.ts']);
    expect(plan.unit).toEqual(['tests/consumer.test.ts']);
    expect(plan.legacy).toEqual(['tests/test-one.ts']);
    expect(plan.uncovered).toEqual([]);
    expect(plan.sync).toBe(true);
  });

  it('selects all real cases when the native wrapper changes, excluding the wrapper from ordinary unit cases', () => {
    const plan = createTestPlan(nativeSources(), ['tests/_vitest-legacy.test.ts']);
    expect(plan.unit).toEqual(['tests/consumer.test.ts', 'tests/pr-test-scope.test.ts']);
    expect(plan.legacy).toEqual(['tests/test-one.ts', 'tests/test-two.ts']);
  });

  it('resolves the native wrapper command while matching either retained runtime or authored case names', () => {
    const plan = createTestPlan(nativeSources(), ['js/leaf.ts']);
    const commands = testCommands(plan, 'unit', file => file.replace(/\.js$/, '.ts'));
    expect(commands[1]?.slice(0, 4)).toEqual(['vitest', 'run', 'tests/_vitest-legacy.test.ts', '-t']);
    const pattern = new RegExp(commands[1]![4]!);
    expect(pattern.test('test-one.js')).toBe(true);
    expect(pattern.test('test-one.ts')).toBe(true);
    expect(pattern.test('test-two.ts')).toBe(false);
    expect(pattern.test('prefix-test-one.ts')).toBe(false);
  });

  it('selects the actual native planner test when CI planning code changes', () => {
    const plan = createTestPlan(nativeSources(), ['.github/workflows/unit.yml']);
    expect(plan.unit).toEqual(['tests/pr-test-scope.test.ts']);
  });

  it('retains the uncovered-runtime guard for an untested native source', () => {
    const sources = nativeSources();
    sources.set('js/orphan.ts', 'export const orphan = 1;');
    expect(createTestPlan(sources, ['js/orphan.ts']).uncovered).toEqual(['js/orphan.ts']);
  });
});
