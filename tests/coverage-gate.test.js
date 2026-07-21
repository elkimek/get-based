import { describe, expect, it } from 'vitest';

import {
  enforceFunctionCoverage,
  resolveCoverageMinimum,
} from '../scripts/coverage-gate.mjs';

const BASELINE = { minimumFunctionPct: 67 };

describe('coverage ratchet', () => {
  it('uses the committed minimum by default', () => {
    expect(resolveCoverageMinimum({ baseline: BASELINE })).toEqual({
      minimum: 67,
      baselineMinimum: 67,
      source: 'scripts/coverage-baseline.json',
    });
  });

  it('accepts an environment override that raises the minimum', () => {
    expect(resolveCoverageMinimum({ baseline: BASELINE, envValue: '67.25' })).toEqual({
      minimum: 67.25,
      baselineMinimum: 67,
      source: 'COVERAGE_MIN',
    });
  });

  it('refuses overrides that weaken the committed baseline', () => {
    expect(() => resolveCoverageMinimum({ baseline: BASELINE, envValue: '60' }))
      .toThrow('cannot lower the committed coverage baseline');
  });

  it('rejects missing or invalid baseline values', () => {
    expect(() => resolveCoverageMinimum({ baseline: {} }))
      .toThrow('coverage baseline minimumFunctionPct');
    expect(() => resolveCoverageMinimum({ baseline: { minimumFunctionPct: 101 } }))
      .toThrow('coverage baseline minimumFunctionPct');
  });

  it('passes at the minimum and reports the available margin', () => {
    const gate = resolveCoverageMinimum({ baseline: BASELINE });
    const result = enforceFunctionCoverage(67.23, gate);
    expect(result.actual).toBe(67.23);
    expect(result.minimum).toBe(67);
    expect(result.margin).toBeCloseTo(0.23);
    expect(() => enforceFunctionCoverage(67, gate)).not.toThrow();
  });

  it('fails below the minimum with an actionable message', () => {
    const gate = resolveCoverageMinimum({ baseline: BASELINE });
    expect(() => enforceFunctionCoverage(66.99, gate))
      .toThrow('function coverage 66.99% is below 67.00%');
  });
});
