import { afterEach, describe, expect, it } from 'vitest';

import { getActiveData, getEffectiveRangeForDate, invalidateActiveDataCache } from '../js/data.js';
import {
  cortisolReferenceForSampleTime,
  parseSampleHour,
  resolveAgeSexRange,
  wholeAgeAtDate,
} from '../js/marker-context-ranges.js';
import { CONTEXT_REFERENCE_RANGES, OPTIMAL_RANGES } from '../js/schema.js';
import { state } from '../js/state.js';

const originalState = {
  importedData: state.importedData,
  profileDob: state.profileDob,
  profileSex: state.profileSex,
  rangeMode: state.rangeMode,
  unitSystem: state.unitSystem,
};

function useProfile({ dob, sex, entries, refOverrides = {} }) {
  state.profileDob = dob;
  state.profileSex = sex;
  state.rangeMode = 'optimal';
  state.unitSystem = 'EU';
  state.importedData = { entries, refOverrides };
  invalidateActiveDataCache();
  return getActiveData();
}

afterEach(() => {
  Object.assign(state, originalState);
  invalidateActiveDataCache();
});

describe('marker context range helpers', () => {
  it('parses common collection times and rejects ambiguous prose', () => {
    expect(parseSampleHour('08:30')).toBe(8);
    expect(parseSampleHour('2:15 p.m.')).toBe(14);
    expect(parseSampleHour('morning')).toBe(8);
    expect(parseSampleHour('sample time unknown')).toBeNull();
  });

  it('resolves exact age at draw and age/sex bands', () => {
    expect(wholeAgeAtDate('1950-06-16', '2025-06-15')).toBe(74);
    expect(wholeAgeAtDate('1950-06-15', '2025-06-15')).toBe(75);
    expect(resolveAgeSexRange(CONTEXT_REFERENCE_RANGES, 'hormones.dheaS', 75, 'male')).toEqual({
      min: 0.179,
      max: 4.39,
      label: 'Age/sex assay range (71+)',
    });
  });

  it('uses assay-specific AM and PM cortisol intervals only for supported times', () => {
    expect(cortisolReferenceForSampleTime('08:30', 'nmol/l')).toEqual({
      range: { min: 193.1, max: 689.7 },
      label: 'Morning assay range',
    });
    expect(cortisolReferenceForSampleTime('14:00', 'µg/dl')).toEqual({
      range: { min: 2, max: 14 },
      label: 'Afternoon assay range',
    });
    expect(cortisolReferenceForSampleTime('23:00', 'nmol/l')).toBeNull();
  });
});

describe('dated clinical-wellness ranges in the data pipeline', () => {
  it('attaches age-aware DHEA-S, NfL, and older-men testosterone guidance', () => {
    const data = useProfile({
      dob: '1950-06-15',
      sex: 'male',
      entries: [{
        date: '2025-06-15',
        markers: {
          'hormones.dheaS': 3,
          'hormones.testosterone': 12,
          'proteins.neurofilamentLight': 30,
        },
      }],
    });
    const hormones = data.categories.hormones.markers;
    const nfl = data.categories.proteins.markers.neurofilamentLight;

    expect(hormones.dheaS.contextRefRanges[0]).toEqual({ min: 0.179, max: 4.39 });
    expect(nfl.contextRefRanges[0]).toEqual({ min: 0, max: 42.1 });
    expect(hormones.testosterone.contextOptimalRanges[0]).toEqual({ min: 9.8, max: 15.8 });
    expect(getEffectiveRangeForDate(hormones.testosterone, 0, 'optimal')).toEqual({ min: 9.8, max: 15.8 });
  });

  it('attaches female AMH/IGF-1 and collection-aware cortisol/zinc guidance', () => {
    const data = useProfile({
      dob: '1987-06-15',
      sex: 'female',
      entries: [{
        date: '2025-06-15',
        context: { sampleTime: '08:30', fasting: true },
        markers: {
          'hormones.amh': 20,
          'hormones.igf1': 140,
          'hormones.cortisol': 400,
          'electrolytes.zinc': 11,
        },
      }],
    });
    const hormones = data.categories.hormones.markers;
    const zinc = data.categories.electrolytes.markers.zinc;

    expect(hormones.amh.contextRefRanges[0]).toEqual({ min: 1.07, max: 53.6 });
    expect(hormones.igf1.contextRefRanges[0]).toEqual({ min: 69, max: 227 });
    expect(hormones.cortisol.contextRefRanges[0]).toEqual({ min: 193.1, max: 689.7 });
    expect(zinc.contextOptimalRanges[0]).toEqual({ min: 10.7, max: 18 });
    expect(getEffectiveRangeForDate(zinc, 0, 'optimal')).toEqual({ min: 10.7, max: 18 });
  });

  it('keeps imported ranges authoritative and suppresses known non-fasting TyG guidance', () => {
    const data = useProfile({
      dob: '1950-06-15',
      sex: 'male',
      refOverrides: {
        'hormones.dheaS': { refMin: 1, refMax: 9, refSource: 'import' },
        'hormones.testosterone': { optimalMin: 11, optimalMax: 17, optimalSource: 'manual' },
      },
      entries: [{
        date: '2025-06-15',
        context: { fasting: false },
        markers: {
          'hormones.dheaS': 3,
          'hormones.testosterone': 12,
          'lipids.triglycerides': 1.5,
          'biochemistry.glucose': 5.5,
        },
      }],
    });
    const hormones = data.categories.hormones.markers;
    const tyg = data.categories.calculatedRatios.markers.tygIndex;

    expect(hormones.dheaS.contextRefRanges).toBeUndefined();
    expect(hormones.dheaS.refMin).toBe(1);
    expect(hormones.testosterone.contextOptimalRanges).toBeUndefined();
    expect(hormones.testosterone.optimalRangeSource).toBe('manual');
    expect(getEffectiveRangeForDate(hormones.testosterone, 0, 'optimal')).toEqual({ min: 11, max: 17 });
    expect(OPTIMAL_RANGES['calculatedRatios.tygIndex']).toEqual({ optimalMin: null, optimalMax: 8.6 });
    expect(getEffectiveRangeForDate(tyg, 0, 'optimal')).toEqual({ min: null, max: null });
  });
});
