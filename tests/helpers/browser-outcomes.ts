interface OutcomeAssertion { toBe(expected: unknown): unknown; toEqual(expected: unknown): unknown }
interface OutcomeExpect {
  (value: unknown, message?: string): OutcomeAssertion;
  soft(value: unknown, message?: string): OutcomeAssertion;
}
type OutcomeMode = 'collect' | 'individual' | 'soft';

/** Preserve each browser suite's hard, soft or collected failure reporting. */
export function createExpectAll(expect: OutcomeExpect, mode: OutcomeMode) {
  return function expectAll(outcomes: Readonly<Record<string, unknown>>): void {
    if (mode === 'collect') {
      const failed = Object.entries(outcomes)
        .filter(([, value]) => value !== true)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
      expect(failed).toEqual([]);
      return;
    }
    for (const [name, passed] of Object.entries(outcomes)) {
      if (mode === 'soft') expect.soft(passed, name).toBe(true);
      else expect(passed, name).toBe(true);
    }
  };
}
