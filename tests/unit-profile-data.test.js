// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { applyUnitConversion } from '../js/data.js';

describe('ANZ conversion in active marker data', () => {
  it('converts values and every range shape while preserving metadata', () => {
    const data = {
      categories: {
        biochemistry: {
          markers: {
            alt: {
              unit: 'µkat/l',
              values: [0.5, null],
              refMin: null,
              refMax: 0.75,
              optimalMin: 0.2,
              optimalMax: 0.6,
              phaseRefRanges: [{ min: 0.1, max: 0.7, label: 'phase' }, null],
              contextRefRanges: [{ min: null, max: 0.8, label: 'context' }],
              contextOptimalRanges: [{ min: 0.25, max: null, label: 'guide' }],
            },
          },
        },
        customPanel: {
          markers: {
            myMarker: {
              unit: 'µg/g creatinine',
              values: [12.5],
              refMin: 1,
              refMax: 10,
            },
          },
        },
        thyroid: {
          markers: {
            tsh: {
              unit: 'mU/l',
              values: [2.55555],
              refMin: 0.123456,
              refMax: 4.98765,
            },
          },
        },
      },
    };

    applyUnitConversion(data, 'ANZ');

    expect(data.categories.biochemistry.markers.alt).toMatchObject({
      unit: 'U/L',
      values: [30, null],
      refMin: null,
      refMax: 45,
      optimalMin: 12,
      optimalMax: 36,
      phaseRefRanges: [{ min: 6, max: 42, label: 'phase' }, null],
      contextRefRanges: [{ min: null, max: 48, label: 'context' }],
      contextOptimalRanges: [{ min: 15, max: null, label: 'guide' }],
    });
    expect(data.categories.customPanel.markers.myMarker).toEqual({
      unit: 'µg/g creatinine',
      values: [12.5],
      refMin: 1,
      refMax: 10,
    });
    expect(data.categories.thyroid.markers.tsh).toEqual({
      unit: 'mIU/L',
      values: [2.55555],
      refMin: 0.123456,
      refMax: 4.98765,
    });
  });
});
