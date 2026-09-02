// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { configureCompareCorrelationViews, renderCompareTable } from '../js/compare-correlations.js';
import { resolveMarkerRangeContext } from '../js/marker-analysis.js';
import { state } from '../js/state.js';

const originalRangeMode = state.rangeMode;

function marker(overrides = {}) {
  return {
    name: 'Test marker',
    unit: 'mmol/L',
    values: [4, 7],
    refMin: 3,
    refMax: 8,
    optimalMin: 4.5,
    optimalMax: 5.5,
    ...overrides,
  };
}

function dataFor(testMarker) {
  return {
    dates: ['2026-01-01', '2026-02-01'],
    dateLabels: ['Jan 1', 'Feb 1'],
    categories: {
      biochemistry: { label: 'Biochemistry', markers: { test: testMarker } },
    },
  };
}

afterEach(() => {
  state.rangeMode = originalRangeMode;
  configureCompareCorrelationViews({
    renderTableColgroup: () => '',
    renderScrollableTableShell: (_kind, _wrapper, _table, _cols, head, body) => `<table>${head}${body}</table>`,
    renderCategoryGlyph: (_key, label) => label,
  });
});

describe('date-aware Compare Dates ranges', () => {
  it('makes the status range explicit in Both mode', () => {
    state.rangeMode = 'both';
    const context = resolveMarkerRangeContext(marker(), 0);
    expect(context.judgingRange).toMatchObject({ min: 4.5, max: 5.5, kind: 'optimal' });
    expect(context.displayedRanges).toHaveLength(2);
    expect(context.displayedRanges.find(range => range.usedForStatus)?.label).toBe('Optimal');

    const html = renderCompareTable(dataFor(marker()), 0, 1);
    expect(html).toContain('Reference');
    expect(html).toContain('Optimal');
    expect(html).toContain('compare-range-used');
  });

  it('labels per-date ranges when collection context changes', () => {
    state.rangeMode = 'reference';
    const html = renderCompareTable(dataFor(marker({
      contextRefRanges: [
        { min: 3, max: 6 },
        { min: 4, max: 9 },
      ],
      contextRangeLabels: ['Morning assay', 'Afternoon assay'],
    })), 0, 1);

    expect(html).toContain('Jan 1');
    expect(html).toContain('Feb 1');
    expect(html).toContain('Morning assay');
    expect(html).toContain('Afternoon assay');
    expect(html).toContain('3 – 6');
    expect(html).toContain('4 – 9');
  });

  it('renders open-ended ranges without inventing a missing boundary', () => {
    state.rangeMode = 'reference';
    const html = renderCompareTable(dataFor(marker({ refMin: null, refMax: 5 })), 0, 1);
    expect(html).toContain('≤5');
    expect(html).not.toContain('null');
  });

  it('preserves imported and custom optimal-range provenance', () => {
    const imported = resolveMarkerRangeContext(marker({ optimalRangeSource: 'import' }), 0, 'both');
    const custom = resolveMarkerRangeContext(marker({ optimalRangeSource: 'manual' }), 0, 'both');

    expect(imported.displayedRanges.find(range => range.kind === 'optimal')).toMatchObject({
      label: 'Lab optimal guidance',
      source: 'lab',
    });
    expect(custom.displayedRanges.find(range => range.kind === 'optimal')).toMatchObject({
      label: 'Custom optimal guidance',
      source: 'custom',
    });
  });

  it('scores improvement against each date’s actual range instead of its midpoint', () => {
    state.rangeMode = 'reference';
    const html = renderCompareTable(dataFor(marker({
      values: [10, 8],
      contextRefRanges: [{ min: 3, max: 6 }, { min: 4, max: 9 }],
    })), 0, 1);
    expect(html).toContain('compare-improved');
    expect(html).not.toContain('compare-worsened');
  });
});
