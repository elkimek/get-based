import {describe, expect, it} from 'vitest';
import {resolveMarkerChartScale} from '../js/marker-chart-scale.js';
import {formatChartTickValue} from '../js/charts.js';

describe('marker chart framing', () => {
  it('distinguishes fractional tick labels instead of rounding neighbouring ticks together', () => {
    expect([0.005,0.0055,0.006,0.0065,0.007].map(formatChartTickValue))
      .toEqual(['0.005','0.0055','0.006','0.0065','0.007']);
    expect(formatChartTickValue(0.000000125)).toBe('1.25e-7');
    expect(formatChartTickValue(12.345)).toBe('12.3');
  });
  it('makes the screenshot readings visible without rescaling their values or ranges', () => {
    const values = [0.020,0.021,0.022,0.024,0.027,0.031], bounds = [0,5];
    const axis = resolveMarkerChartScale(values,bounds);
    expect(axis.focused).toBe(true);
    expect(axis.min).toBeLessThan(0.020);
    expect(axis.min).toBeGreaterThan(0);
    expect(axis.max).toBeGreaterThan(0.031);
    expect(axis.max).toBeLessThan(0.04);
    expect((0.031 - 0.020) / (axis.max - axis.min)).toBeGreaterThan(0.7);
    expect(values).toEqual([0.020,0.021,0.022,0.024,0.027,0.031]);
    expect(bounds).toEqual([0,5]);
  });

  it('retains ordinary range context and the original padding', () => {
    expect(resolveMarkerChartScale([4.8,5,5.1,5.3,5.5,9],[4,10,5,7]))
      .toEqual({min:3.1,max:10.9,focused:false});
    expect(resolveMarkerChartScale([5,5,5],[4,6]).focused).toBe(false);
  });

  it('is invariant under positive unit conversion, including tiny fractions', () => {
    const values = [0.005,0.006,0.007], bounds = [0,2];
    const original = resolveMarkerChartScale(values,bounds);
    for (const factor of [100,0.000001]) {
      const converted = resolveMarkerChartScale(values.map(v=>v*factor),bounds.map(v=>v*factor));
      expect(converted.focused).toBe(original.focused);
      expect(converted.min/factor).toBeCloseTo(original.min,12);
      expect(converted.max/factor).toBeCloseTo(original.max,12);
    }
  });

  it('keeps zero, flat, negative and missing readings finite', () => {
    const zero = resolveMarkerChartScale([0,0,0],[0,5]);
    expect(zero).toEqual({min:0,max:5.75,focused:false});
    const flat = resolveMarkerChartScale([0.02,0.02,0.02],[0,5]);
    expect(flat.min).toBeLessThan(0.02); expect(flat.max).toBeGreaterThan(0.02);
    expect(resolveMarkerChartScale([-0.031,-0.02],[-5,0]).focused).toBe(true);
    expect(resolveMarkerChartScale([NaN,Infinity],[])).toEqual({min:0,max:1,focused:false});
  });

  it('does not zoom a single isolated result or invent absent ranges', () => {
    expect(resolveMarkerChartScale([0.02],[0,5]).focused).toBe(false);
    expect(resolveMarkerChartScale([1,2,3],[undefined,null,Infinity])).toEqual({min:0.7,max:3.3,focused:false});
  });
});
