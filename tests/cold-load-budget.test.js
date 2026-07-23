import { describe, expect, it } from 'vitest';

import {
  enforceColdLoadBudget,
  formatColdLoadSummary,
  summarizeColdLoad,
} from '../scripts/cold-load-budget.mjs';

const BUDGET = {
  maximums: {
    requests: 3,
    transferBytes: 1000,
    decodedBytes: 2000,
  },
};

describe('cold-load performance budget', () => {
  it('summarizes same-origin application resources and excludes APIs', () => {
    const metrics = summarizeColdLoad([
      {
        name: 'http://127.0.0.1:8000/app',
        transferSize: 300,
        decodedBodySize: 500,
      },
      {
        name: 'http://127.0.0.1:8000/js/main.js',
        transferSize: 200,
        decodedBodySize: 400,
      },
      {
        name: 'http://127.0.0.1:8000/api/commit',
        transferSize: 100,
        decodedBodySize: 100,
      },
      {
        name: 'https://example.com/font.woff2',
        transferSize: 100,
        decodedBodySize: 100,
      },
    ], 'http://127.0.0.1:8000');

    expect(metrics).toEqual({
      requests: 2,
      transferBytes: 500,
      decodedBytes: 900,
    });
  });

  it('passes at the ceilings and reports remaining margin', () => {
    expect(enforceColdLoadBudget({
      requests: 3,
      transferBytes: 900,
      decodedBytes: 1800,
    }, BUDGET)).toEqual({
      requests: { actual: 3, maximum: 3, remaining: 0 },
      transferBytes: { actual: 900, maximum: 1000, remaining: 100 },
      decodedBytes: { actual: 1800, maximum: 2000, remaining: 200 },
    });
  });

  it('reports every exceeded ceiling in one actionable failure', () => {
    expect(() => enforceColdLoadBudget({
      requests: 4,
      transferBytes: 1100,
      decodedBytes: 2200,
    }, BUDGET)).toThrow(
      'requests 4 exceeds 3; compressed transfer bytes 1100 exceeds 1000; decoded bytes 2200 exceeds 2000',
    );
  });

  it('rejects malformed measurements and budgets', () => {
    expect(() => summarizeColdLoad([], 'not a URL')).toThrow();
    expect(() => enforceColdLoadBudget({
      requests: -1,
      transferBytes: 0,
      decodedBytes: 0,
    }, BUDGET)).toThrow('cold-load requests must be a non-negative number');
    expect(() => enforceColdLoadBudget({
      requests: 0,
      transferBytes: 0,
      decodedBytes: 0,
    }, { maximums: {} })).toThrow('maximums.requests');
  });

  it('formats a compact CI summary', () => {
    expect(formatColdLoadSummary({
      requests: 420,
      transferBytes: 2048,
      decodedBytes: 4096,
    })).toBe('420 requests, 2.0 KiB compressed, 4.0 KiB decoded');
  });
});
