import { describe, expect, it } from 'vitest';

import { normalizeToSI, reconcileImportMarkerMappings } from '../js/pdf-import-marker-mapping.js';

function reconcile(markers) {
  reconcileImportMarkerMappings(markers, { testType: 'blood' });
  return markers;
}

describe('lab-reported ratio unit conventions', () => {
  it('normalizes a conventional TG/HDL ratio using its component units', () => {
    const markers = reconcile([
      { rawName: 'TG/HDL ratio', mappedKey: 'calculatedRatios.tgHdlRatio', matched: true, value: 2.4, unit: '' },
      { rawName: 'Triglycerides', mappedKey: 'lipids.triglycerides', matched: true, value: 120, unit: 'mg/dL' },
      { rawName: 'HDL', mappedKey: 'lipids.hdl', matched: true, value: 50, unit: 'mg/dL' },
    ]);

    expect(markers[0].ratioUnitConvention).toBe('conventional');
    expect(normalizeToSI(markers[0].mappedKey, markers[0].value, markers[0].unit, markers[0]))
      .toBeCloseTo(2.4 / 2.29, 5);
  });

  it('does not reinterpret an SI TG/HDL ratio through the unitless fallback', () => {
    const markers = reconcile([
      { rawName: 'TG/HDL ratio', mappedKey: 'calculatedRatios.tgHdlRatio', matched: true, value: 1.3, unit: '' },
      { rawName: 'Triglycerides', mappedKey: 'lipids.triglycerides', matched: true, value: 1.3, unit: 'mmol/L' },
      { rawName: 'HDL', mappedKey: 'lipids.hdl', matched: true, value: 1, unit: 'mmol/L' },
    ]);

    expect(markers[0].ratioUnitConvention).toBe('si');
    expect(normalizeToSI(markers[0].mappedKey, markers[0].value, markers[0].unit, markers[0])).toBe(1.3);
  });

  it('normalizes conventional FT3/FT4 while preserving an SI report', () => {
    const conventional = reconcile([
      { rawName: 'FT3/FT4 ratio', mappedKey: 'calculatedRatios.ft3ft4Ratio', matched: true, value: 2.5, unit: '' },
      { rawName: 'Free T3', mappedKey: 'thyroid.ft3', matched: true, value: 3, unit: 'pg/mL' },
      { rawName: 'Free T4', mappedKey: 'thyroid.ft4', matched: true, value: 1.2, unit: 'ng/dL' },
    ]);
    const si = reconcile([
      { rawName: 'FT3/FT4 ratio', mappedKey: 'calculatedRatios.ft3ft4Ratio', matched: true, value: 0.3, unit: '' },
      { rawName: 'Free T3', mappedKey: 'thyroid.ft3', matched: true, value: 4.5, unit: 'pmol/L' },
      { rawName: 'Free T4', mappedKey: 'thyroid.ft4', matched: true, value: 15, unit: 'pmol/L' },
    ]);

    expect(conventional[0].ratioUnitConvention).toBe('conventional');
    expect(normalizeToSI(conventional[0].mappedKey, conventional[0].value, '', conventional[0]))
      .toBeCloseTo(2.5 / 8.3833, 5);
    expect(si[0].ratioUnitConvention).toBe('si');
    expect(normalizeToSI(si[0].mappedKey, si[0].value, '', si[0])).toBe(0.3);
  });
});
