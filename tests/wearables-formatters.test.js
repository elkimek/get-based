import { describe, expect, it } from 'vitest';

import {
  formatWearableMetricValue,
  wearableDisplayUnit,
  wearableDisplayValue,
  weightFromKilograms,
  weightToKilograms,
  weightUnitForSystem,
} from '../js/wearables-formatters.js';

describe('wearable weight units', () => {
  it('canonicalizes pound inputs to kilograms', () => {
    expect(weightToKilograms(180, 'lb')).toBeCloseTo(81.6466, 4);
    expect(weightToKilograms(180, 'lbs')).toBeCloseTo(81.6466, 4);
    expect(weightToKilograms(82, 'kg')).toBe(82);
  });

  it('converts only weight for US display', () => {
    const kg = weightToKilograms(180, 'lb');

    expect(weightFromKilograms(kg, 'US')).toBeCloseTo(180, 8);
    expect(weightUnitForSystem('US')).toBe('lb');
    expect(wearableDisplayValue('weight', kg, 'US')).toBeCloseTo(180, 8);
    expect(wearableDisplayUnit('weight', 'kg', 'US')).toBe('lb');
    expect(wearableDisplayValue('rhr', 62, 'US')).toBe(62);
    expect(wearableDisplayUnit('rhr', 'bpm', 'US')).toBe('bpm');
  });

  it('keeps EU weight display in kilograms', () => {
    expect(wearableDisplayValue('weight', 82.4, 'EU')).toBe(82.4);
    expect(wearableDisplayUnit('weight', 'kg', 'EU')).toBe('kg');
    expect(formatWearableMetricValue('weight', 82.4, 'kg', 'EU')).toBe('82.4');
  });

  it('formats canonical weights in pounds for US display', () => {
    const kg = weightToKilograms(180, 'lb');
    expect(formatWearableMetricValue('weight', kg, 'kg', 'US')).toBe('180');
  });
});
