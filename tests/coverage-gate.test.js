import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  enforceFunctionCoverage,
  enforceFeatureCoverage,
  resolveCoverageMinimum,
} from '../scripts/coverage-gate.mjs';
import {
  coverageEntryMatchesSource,
  coverageFunctionRange,
  isTopLevelScriptFunction,
  sourceFingerprint,
} from '../scripts/coverage-model-helpers.mjs';

const BASELINE = { minimumFunctionPct: 67.1 };
const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));

describe('coverage ratchet', () => {
  it('uses the committed minimum by default', () => {
    expect(resolveCoverageMinimum({ baseline: BASELINE })).toEqual({
      minimum: 67.1,
      baselineMinimum: 67.1,
      source: 'scripts/coverage-baseline.json',
    });
  });

  it('accepts an environment override that raises the minimum', () => {
    expect(resolveCoverageMinimum({ baseline: BASELINE, envValue: '67.25' })).toEqual({
      minimum: 67.25,
      baselineMinimum: 67.1,
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
    expect(result.minimum).toBe(67.1);
    expect(result.margin).toBeCloseTo(0.13);
    expect(() => enforceFunctionCoverage(67.1, gate)).not.toThrow();
  });

  it('fails below the minimum with an actionable message', () => {
    const gate = resolveCoverageMinimum({ baseline: BASELINE });
    expect(() => enforceFunctionCoverage(67.09, gate))
      .toThrow('function coverage 67.09% is below 67.10%');
  });

  it('collects every browser-coverage suite through the coverage fixture', () => {
    const playwrightDir = path.join(TESTS_DIR, 'playwright');
    const uncoveredSuites = fs.readdirSync(playwrightDir)
      .filter(name => name.endsWith('-browser-coverage.spec.js'))
      .filter(name => {
        const source = fs.readFileSync(path.join(playwrightDir, name), 'utf8');
        return !/from ['"]\.\/coverage-fixture\.js['"]/.test(source);
      });

    expect(uncoveredSuites).toEqual([]);
  });
});

describe('browser coverage model', () => {
  it('accepts captured coverage only when it fingerprints the repository source', () => {
    const source = 'export function realSource() { return true; }\n';
    const fingerprint = sourceFingerprint(source);

    expect(coverageEntryMatchesSource(fingerprint, source)).toBe(true);
    expect(coverageEntryMatchesSource(fingerprint, source.replace('true', 'false'))).toBe(false);
    expect(coverageEntryMatchesSource({ ...fingerprint, sourceLength: source.length + 1 }, source))
      .toBe(false);
  });

  it('accepts legacy shards without a fingerprint', () => {
    expect(coverageEntryMatchesSource({}, 'export const legacy = true;\n')).toBe(true);
  });

  it('normalizes V8 ranges into stable function identities', () => {
    expect(coverageFunctionRange({
      ranges: [{ startOffset: 17, endOffset: 42, count: 1 }],
    })).toEqual({ start: 17, end: 42 });
    expect(coverageFunctionRange({
      ranges: [{ start: 17, end: 42, count: 1 }],
    })).toEqual({ start: 17, end: 42 });
    expect(coverageFunctionRange({ ranges: [] })).toBeNull();
  });

  it('excludes only the anonymous whole-script V8 function', () => {
    const topLevel = {
      functionName: '',
      ranges: [{ startOffset: 0, endOffset: 100, count: 1 }],
    };
    const anonymousCallback = {
      functionName: '',
      ranges: [{ startOffset: 10, endOffset: 30, count: 1 }],
    };

    expect(isTopLevelScriptFunction(topLevel, 0, 100)).toBe(true);
    expect(isTopLevelScriptFunction(anonymousCallback, 1, 100)).toBe(false);
  });
});

describe('per-feature coverage gates', () => {
  const baseline = { features: { Chat: { minimumFunctionPct: 80, referenceCalled: 8, referenceTotal: 10 }, Sync: { minimumFunctionPct: 90, referenceCalled: 9, referenceTotal: 10 } } };
  const features = [{ name: 'Chat', fnCalled: 8, fnTotal: 10 }, { name: 'Sync', fnCalled: 9, fnTotal: 10 }];
  it('passes exactly at each floor using counts, not a supplied percentage', () => {
    expect(enforceFeatureCoverage(features.map(f => ({ ...f, fnPct: 0 })), baseline)).toHaveLength(2);
  });
  it('fails a feature regression even when another feature improves', () => {
    expect(() => enforceFeatureCoverage([{ ...features[0], fnCalled: 10 }, { ...features[1], fnCalled: 8 }], baseline)).toThrow('feature: Sync');
  });
  it('rejects missing, duplicated and newly unbaselined feature groups', () => {
    expect(() => enforceFeatureCoverage(features.slice(0, 1), baseline)).toThrow('Missing measured');
    expect(() => enforceFeatureCoverage([...features, features[0]], baseline)).toThrow('Duplicate');
    expect(() => enforceFeatureCoverage([...features, { ...features[0], name: 'New' }], baseline)).toThrow('Missing coverage baseline');
    expect(() => enforceFeatureCoverage(features, {})).toThrow('baseline is required');
  });
  it.each([0, -1, NaN, 1.5])('rejects invalid denominators: %s', fnTotal => {
    expect(() => enforceFeatureCoverage([{ ...features[0], fnTotal }], baseline)).toThrow('Invalid function counts');
  });
});


describe('coverage baseline integrity', () => {
  it.each(['9oops', '90%', '0x50', '', null, true, [], {}])('rejects malformed percentages: %j', value => {
    expect(() => resolveCoverageMinimum({ baseline: { minimumFunctionPct: value } })).toThrow('minimumFunctionPct');
    expect(() => resolveCoverageMinimum({ baseline: BASELINE, envValue: typeof value === 'string' && value ? value : '90oops' })).toThrow('COVERAGE_MIN');
  });
  const features = [{ name: 'Chat', fnTotal: 10, fnCalled: 10 }];
  it('rejects a floor lowered below its retained measurement', () => {
    expect(() => enforceFeatureCoverage(features, { features: { Chat: {
      minimumFunctionPct: 9, referenceCalled: 9, referenceTotal: 10,
    } } })).toThrow('below its rounded reference');
  });
  it.each([{}, { referenceCalled: 11, referenceTotal: 10 }, { referenceCalled: 0, referenceTotal: 0 }])('rejects invalid reference counts: %j', reference => {
    expect(() => enforceFeatureCoverage(features, { features: { Chat: {
      minimumFunctionPct: 90, ...reference,
    } } })).toThrow('Invalid reference');
  });
  it('allows deliberate tightening above the retained measurement', () => {
    expect(enforceFeatureCoverage(features, { features: { Chat: {
      minimumFunctionPct: 95, referenceCalled: 9, referenceTotal: 10,
    } } })).toHaveLength(1);
  });
});
