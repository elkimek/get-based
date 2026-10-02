import { describe, expect, it } from 'vitest';

import {
  getLabGroupContextSourceSlug,
  normalizeContextSourceSettings,
} from '../js/context-source-registry.js';

describe('Context source registry', () => {
  it('preserves generated lab-group context keys with spaces during normalization', () => {
    const fattyAcids = getLabGroupContextSourceSlug('Fatty Acids');
    const specialtyPanel = getLabGroupContextSourceSlug('Specialty Panel');

    expect(fattyAcids).toBe('lab-group-Fatty Acids');
    expect(specialtyPanel).toBe('lab-group-Specialty Panel');
    expect(normalizeContextSourceSettings({
      [fattyAcids]: false,
      [specialtyPanel]: true,
      'lab-group-Bad\u0000Group': false,
    })).toEqual({
      [fattyAcids]: false,
      [specialtyPanel]: true,
    });
  });
});
