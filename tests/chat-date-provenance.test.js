import { describe, expect, it } from 'vitest';

import { formatLabDateAge } from '../js/lab-context.js';
import { formatMarkerValuesForChat } from '../js/marker-analysis.js';

function marker(overrides = {}) {
  return {
    values: [12],
    unit: 'ng/mL',
    refMin: 10,
    refMax: 20,
    ...overrides,
  };
}

describe('chat measurement date provenance', () => {
  it('uses calendar days instead of rounding elapsed hours', () => {
    const lateSameDay = new Date(2026, 8, 2, 23, 59, 59).getTime();
    const earlyNextDay = new Date(2026, 8, 3, 0, 0, 1).getTime();

    expect(formatLabDateAge('2026-09-02', lateSameDay)).toBe('today');
    expect(formatLabDateAge('2026-09-02', earlyNextDay)).toBe('yesterday');
  });

  it('dates single-point measurements from their category-specific date', () => {
    const text = formatMarkerValuesForChat(
      marker({ singlePoint: true, singleDate: '2025-07-08' }),
      { dates: [] },
    );

    expect(text).toContain('2025-07-08: 12 ng/mL');
  });

  it('labels a measurement whose source has no recorded date', () => {
    const text = formatMarkerValuesForChat(
      marker({ singlePoint: true, singleDate: null }),
      { dates: [] },
    );

    expect(text).toContain('date not recorded: 12 ng/mL');
  });

  it('pairs every time-series value with its own date', () => {
    const text = formatMarkerValuesForChat(
      marker({ values: [10, 12] }),
      { dates: ['2025-01-10', '2026-01-10'] },
    );

    expect(text).toContain('2025-01-10: 10');
    expect(text).toContain('2026-01-10: 12');
  });

  it('can put supplied relative ages directly beside values', () => {
    const text = formatMarkerValuesForChat(
      marker({ values: [10, 12] }),
      { dates: ['2025-01-10', '2026-01-10'] },
      { dateLabel: date => date === '2025-01-10' ? '~20 months ago' : '~8 months ago' },
    );

    expect(text).toContain('~20 months ago: 10');
    expect(text).toContain('~8 months ago: 12');
    expect(text).not.toContain('2025-01-10:');
  });
});
