import { describe, expect, it } from 'vitest';

import { getLabDateRangeBounds } from '../js/lab-date-range.js';

const NOW = new Date('2026-07-20T12:00:00Z');

describe('lab timeline date-range bounds', () => {
  it('uses the selected rolling window when it contains lab dates', () => {
    expect(getLabDateRangeBounds(['2026-05-02'], '3m', NOW)).toEqual({
      min: '2026-04-20',
      max: '2026-07-20',
    });
    expect(getLabDateRangeBounds(['2026-02-02'], '6m', NOW)).toEqual({
      min: '2026-01-20',
      max: '2026-07-20',
    });
    expect(getLabDateRangeBounds(['2025-08-02'], '1y', NOW)).toEqual({
      min: '2025-07-20',
      max: '2026-07-20',
    });
  });

  it('clamps calendar-month cutoffs at the end of shorter months', () => {
    const monthEnd = new Date('2026-05-31T12:00:00Z');
    expect(getLabDateRangeBounds([], '3m', monthEnd, { fallbackToAll: false })).toEqual({
      min: '2026-02-28',
      max: '2026-05-31',
    });
  });

  it('uses the earliest real date through today for All', () => {
    expect(getLabDateRangeBounds(['2026-03-10', 'bad', '2025-11-04'], 'all', NOW)).toEqual({
      min: '2025-11-04',
      max: '2026-07-20',
    });
  });

  it('mirrors the existing all-data fallback when a rolling window is empty', () => {
    expect(getLabDateRangeBounds(['2024-01-10', '2024-03-10'], '3m', NOW)).toEqual({
      min: '2024-01-10',
      max: '2026-07-20',
    });
    expect(getLabDateRangeBounds(
      ['2024-01-10', '2024-03-10'],
      '3m',
      NOW,
      { fallbackToAll: false },
    )).toEqual({
      min: '2026-04-20',
      max: '2026-07-20',
    });
  });

  it('pads a one-date All window without adding another observation', () => {
    expect(getLabDateRangeBounds(['2026-07-20'], 'all', NOW)).toEqual({
      min: '2026-06-20',
      max: '2026-07-20',
    });
  });

  it('returns no All bounds when there are no valid dates', () => {
    expect(getLabDateRangeBounds(['bad'], 'all', NOW)).toBeNull();
  });
});
