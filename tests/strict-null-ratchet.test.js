import { describe, expect, it } from 'vitest';

import { findRegressions, validateBaseline } from '../scripts/strict-null-ratchet.mjs';

describe('strict-null debt ratchet', () => {
  const baseline = {
    totalDiagnostics: 3,
    files: {
      'js/existing-a.js': 2,
      'js/existing-b.js': 1,
    },
  };

  it('accepts matching and reduced per-file debt', () => {
    expect(findRegressions({
      total: 2,
      files: new Map([
        ['js/existing-a.js', 1],
        ['js/existing-b.js', 1],
      ]),
    }, baseline)).toEqual([]);
  });

  it('rejects per-file growth even when total debt falls', () => {
    expect(findRegressions({
      total: 2,
      files: new Map([['js/existing-b.js', 2]]),
    }, baseline)).toContain('js/existing-b.js: 2 diagnostics exceed baseline 1');
  });

  it('rejects strict-null debt in a previously clean file', () => {
    expect(findRegressions({
      total: 1,
      files: new Map([['js/new-file.js', 1]]),
    }, baseline)).toContain('js/new-file.js: 1 new diagnostic');
  });

  it('rejects inconsistent baseline totals', () => {
    expect(validateBaseline({
      totalDiagnostics: 4,
      files: baseline.files,
    })).toContain('does not match');
  });
});
