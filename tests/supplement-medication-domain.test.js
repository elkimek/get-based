import { describe, expect, it } from 'vitest';

import {
  SUPPLEMENT_RECORD_VERSION,
  createSupplementRecordId,
  getCurrentSupplements,
  getInactiveSupplements,
  getSupplementRecordId,
  getSupplementStatus,
  getSupplementsOverlappingRange,
  legacySupplementId,
  isSupplementExpectedOnDate,
  migrateSupplementMedicationRecords,
  parseSupplementQuantity,
} from '../js/supplement-medication-domain.js';
import { DELTA_ARRAY_CONFIG } from '../js/sync-delta-surface-config.js';

describe('supplement and medication domain', () => {
  it('derives current, scheduled, paused, and ended states without mutating records', () => {
    const records = [
      { name: 'Current', startDate: '2026-01-01', endDate: null },
      { name: 'Future', startDate: '2026-09-01', endDate: null },
      { name: 'Future with legacy state', startDate: '2026-10-01', endDate: null, lifecycle: { state: 'ended' } },
      { name: 'Paused', periods: [{ start: '2026-01-01', end: '2026-05-01' }], lifecycle: { state: 'paused' } },
      { name: 'Ended', startDate: '2025-01-01', endDate: '2025-02-01' },
    ];
    const snapshot = structuredClone(records);

    expect(records.map(record => getSupplementStatus(record, '2026-08-09')))
      .toEqual(['active', 'scheduled', 'scheduled', 'paused', 'ended']);
    expect(getCurrentSupplements(records, '2026-08-09').map(record => record.name)).toEqual(['Current']);
    expect(getInactiveSupplements(records, '2026-08-09').map(record => record.name)).toEqual(['Paused', 'Ended']);
    expect(records).toEqual(snapshot);
  });

  it('handles cycling periods and historical range overlap', () => {
    const cycling = {
      name: 'Cycling therapy',
      periods: [
        { start: '2026-01-01', end: '2026-01-31' },
        { start: '2026-03-01', end: '2026-03-31' },
      ],
    };

    expect(getSupplementStatus(cycling, '2026-02-15')).toBe('paused');
    expect(getSupplementStatus(cycling, '2026-03-15')).toBe('active');
    expect(getSupplementsOverlappingRange([cycling], '2026-02-01', '2026-02-28')).toEqual([]);
    expect(getSupplementsOverlappingRange([cycling], '2026-03-15', '2026-04-01')).toEqual([cycling]);
  });

  it('does not assume PRN exposure and resolves structured weekday and interval schedules', () => {
    const active = { startDate: '2026-08-01', endDate: null };
    expect(isSupplementExpectedOnDate({ ...active, schedule: { mode: 'prn' } }, '2026-08-09')).toBe(false);
    expect(isSupplementExpectedOnDate({ ...active, schedule: { mode: 'selected-days', daysOfWeek: [0, 2] } }, '2026-08-09')).toBe(true);
    expect(isSupplementExpectedOnDate({ ...active, schedule: { mode: 'selected-days', daysOfWeek: [1] } }, '2026-08-09')).toBe(false);
    expect(isSupplementExpectedOnDate({ ...active, schedule: { mode: 'interval', intervalDays: 4 } }, '2026-08-09')).toBe(true);
    expect(isSupplementExpectedOnDate({ ...active, schedule: { mode: 'interval', intervalDays: 3 } }, '2026-08-09')).toBe(false);
  });

  it('parses common and custom quantities while retaining the raw value', () => {
    expect(parseSupplementQuantity('1,000 mg')).toEqual({ value: 1000, unit: 'mg', raw: '1,000 mg' });
    expect(parseSupplementQuantity('5,4 µg')).toEqual({ value: 5.4, unit: 'mcg', raw: '5,4 µg' });
    expect(parseSupplementQuantity('25 billion CFU')).toEqual({ value: 25, unit: 'billion CFU', raw: '25 billion CFU' });
    expect(parseSupplementQuantity('500 мг')).toEqual({ value: 500, unit: 'mg', raw: '500 мг' });
    expect(parseSupplementQuantity('25 微克')).toEqual({ value: 25, unit: 'mcg', raw: '25 微克' });
    expect(parseSupplementQuantity('10 ملغ')).toEqual({ value: 10, unit: 'mg', raw: '10 ملغ' });
    expect(parseSupplementQuantity('as needed')).toBeNull();
  });

  it('migrates legacy rows additively and idempotently with the old sync identity', () => {
    const legacy = {
      name: 'Magnesium',
      startDate: '2026-01-01',
      endDate: null,
      type: 'supplement',
      dosage: 'with food',
      ingredients: [{ name: 'Magnesium', amount: '200 mystery-units', vendorField: { untouched: true } }],
      inactiveIngredients: ['Rice flour'],
      qualityTests: [{ category: 'contaminant', analyte: 'Lead', resultText: 'ND', includeInAIContext: false, vendorField: 'keep' }],
      qualityEvidenceScope: 'matching-lot',
      unknownFutureField: ['keep', 'me'],
    };
    const data = { supplements: [legacy] };
    const oldSyncId = DELTA_ARRAY_CONFIG.supplements.itemIdFn(legacy);

    migrateSupplementMedicationRecords(data);
    const once = structuredClone(data);
    migrateSupplementMedicationRecords(data);

    expect(data).toEqual(once);
    expect(data.supplements[0]).toMatchObject({
      id: oldSyncId,
      schemaVersion: SUPPLEMENT_RECORD_VERSION,
      dosage: 'with food',
      unknownFutureField: ['keep', 'me'],
      ingredients: [{ amount: '200 mystery-units', vendorField: { untouched: true } }],
      inactiveIngredients: ['Rice flour'],
      qualityTests: [{ category: 'contaminant', analyte: 'Lead', resultText: 'ND', includeInAIContext: false, vendorField: 'keep' }],
      qualityEvidenceScope: 'matching-lot',
    });
    expect(getSupplementRecordId(data.supplements[0])).toBe(legacySupplementId(legacy));
    expect(DELTA_ARRAY_CONFIG.supplements.itemIdFn(data.supplements[0])).toBe(oldSyncId);
  });

  it('creates collision-resistant stable ids for newly entered records', () => {
    const first = createSupplementRecordId();
    const second = createSupplementRecordId();
    expect(first).toMatch(/^sm_[a-zA-Z0-9_.-]+$/);
    expect(second).not.toBe(first);
  });
});

import { recordSupplementSchedule, supplementDoseText } from '../js/supplement-medication-domain.js';

describe('dated schedule edits', () => {
  const periods = [{ start: '2026-01-01', end: null, dose: '500 mg' }];
  const previous = { periods, schedule: { mode: 'daily', timesPerDay: 1 } };
  it('keeps earlier dose periods when frequency changes and records the new schedule today', () => {
    const result = recordSupplementSchedule(previous, periods, { mode: 'multiple', timesPerDay: 4 }, '2026-03-01');
    expect(result).toEqual([
      { start: '2026-01-01', end: '2026-02-28', dose: '500 mg' },
      { start: '2026-03-01', end: null, dose: '500 mg', schedule: { mode: 'multiple', timesPerDay: 4 } },
    ]);
    expect(periods[0].end).toBeNull();
    expect(result[0].schedule).toBeUndefined();
  });
  it('does not invent historical snapshots on an unchanged save', () => {
    expect(recordSupplementSchedule(previous, periods, { timesPerDay: 1, mode: 'daily' }, '2026-03-01')).toEqual(periods);
  });
  it('snapshots new periods and same-day changes without creating overlapping dates', () => {
    const today = [{ start: '2026-03-01', end: null, dose: '2000 mg' }];
    const result = recordSupplementSchedule(previous, today, previous.schedule, '2026-03-01');
    expect(result).toHaveLength(1);
    expect(result[0].schedule).toEqual(previous.schedule);
  });
  it('retains structured dose rendering and explicit daily basis', () => {
    expect(supplementDoseText({ value: 500, unit: 'mg', basis: 'day' })).toBe('500 mg/day');
    expect(supplementDoseText({ text: '500 mg with food', value: 500, unit: 'mg' })).toBe('500 mg with food');
    expect(supplementDoseText('2 tablets')).toBe('2 tablets');
  });
});
