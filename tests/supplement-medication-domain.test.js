import { describe, expect, it } from 'vitest';

import {
  SUPPLEMENT_RECORD_VERSION,
  getSupplementDailyDoses,
  recordIngredientDoseChange,
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


describe('ingredient dose references and confirmed history', () => {
  const record = { name: 'TMG', timesPerDay: 1, ingredients: [{ name: 'TMG', amountValue: 500, amountUnit: 'mg' }] };
  it('uses the same daily quantity and frequency override as the ingredient panel without combining ingredients', () => {
    expect(getSupplementDailyDoses(record)).toEqual([{ ingredient: 'TMG', value: 500, unit: 'mg', basis: 'day', source: 'ingredient' }]);
    expect(getSupplementDailyDoses({ ...record, timesPerDay: 4 })[0].value).toBe(2000);
    expect(getSupplementDailyDoses({ ...record, timesPerDay: 4, ingredients: [{ ...record.ingredients[0], timesPerDay: 2 }] })[0].value).toBe(1000);
    expect(getSupplementDailyDoses({ ...record, ingredients: [...record.ingredients, { name: 'B12', amount: '25 mcg' }] })).toHaveLength(2);
  });
  it('rejects unknown frequency, PRN, intermittent schedules, concentrations and ambiguous ingredient names', () => {
    expect(getSupplementDailyDoses({ ...record, timesPerDay: undefined })).toEqual([]);
    for (const mode of ['prn', 'interval', 'selected-days']) expect(getSupplementDailyDoses({ ...record, schedule: { mode } })).toEqual([]);
    expect(getSupplementDailyDoses({ ...record, ingredients: [{ name: 'TMG', amount: '50%' }] })).toEqual([]);
    expect(getSupplementDailyDoses({ ...record, ingredients: [...record.ingredients, ...record.ingredients] })).toEqual([]);
  });
  it('splits a confirmed ingredient dose at the date of an edit and keeps older doses intact', () => {
    const entry = { ...record, timesPerDay: 4, schedule: { mode: 'daily', timesPerDay: 4 }, periods: [
      { start: '2026-01-01', end: null, dose: getSupplementDailyDoses(record)[0] },
    ] };
    recordIngredientDoseChange(entry, '2026-09-28');
    expect(entry.periods).toHaveLength(2);
    expect(entry.periods[0]).toMatchObject({ end: '2026-09-27', dose: { value: 500 } });
    expect(entry.periods[1]).toMatchObject({ start: '2026-09-28', end: null, dose: { value: 2000, basis: 'day' } });
    recordIngredientDoseChange(entry, '2026-09-28');
    expect(entry.periods).toHaveLength(2);
    entry.ingredients = [];
    recordIngredientDoseChange(entry, '2026-09-28');
    expect(entry.periods[1].dose).toBeUndefined();
    expect(entry.periods[0].dose.value).toBe(500);
  });
  it('does not backfill unconfirmed or manually specified historical doses', () => {
    for (const dose of ['250 mg/day']) {
      const entry = { ...record, periods: [{ start: '2026-01-01', end: null, dose }] };
      const before = structuredClone(entry);
      recordIngredientDoseChange(entry, '2026-09-28');
      expect(entry).toEqual(before);
    }
  });
});

import { parseCorrelationDose } from '../js/therapy-correlations.js';
it.each(['0.500 g', '0,500 g', '2,000 mg', '1 000 mg'])('uses the same quantity interpretation for current ingredients and dated doses: %s', raw => {
  const ingredient = parseSupplementQuantity(raw);
  const history = parseCorrelationDose(raw);
  expect(history.value).toBe(ingredient.value * (ingredient.unit === 'g' ? 1000 : 1));
});
it.each(['1.2.3 mg', '0.50.0 g', '1,,2 mg', '1.500 g'])('rejects malformed quantities consistently: %s', raw => {
  expect(parseSupplementQuantity(raw)).toBeNull();
  expect(parseCorrelationDose(raw)).toBeNull();
});

it('preserves unambiguous structured precision even when its display text could be mistaken for grouping', () => {
  expect(parseCorrelationDose({ value: 1.005, unit: 'mg', text: '1.005 mg' }).value).toBe(1.005);
});


it('starts an ingredient regimen today without backfilling an existing unknown period', () => {
  const entry = { ingredients: [{ name: 'TMG', amount: '500 mg' }], timesPerDay: 1, schedule: { mode: 'daily', timesPerDay: 1 }, periods: [{ start: '2026-01-01', end: null }] };
  recordIngredientDoseChange(entry, '2026-09-28');
  expect(entry.periods[0]).toEqual({ start: '2026-01-01', end: '2026-09-27' });
  expect(entry.periods[1]).toMatchObject({ start: '2026-09-28', dose: { ingredient: 'TMG', value: 500, basis: 'day' } });
  const before = structuredClone(entry);
  recordIngredientDoseChange(entry, '2026-09-28');
  expect(entry).toEqual(before);
});

it('keeps all ingredient snapshots distinct through frequency changes, pauses and restarting', () => {
  const entry = { ingredients: [{ name: 'A', amount: '500 mg' }, { name: 'B', amount: '25 mcg', timesPerDay: 2 }], timesPerDay: 1, schedule: { mode: 'daily', timesPerDay: 1 }, periods: [{ start: '2026-01-01', end: null }] };
  recordIngredientDoseChange(entry, '2026-01-01');
  expect(entry.periods[0].dose).toBeUndefined();
  expect(entry.periods[0].ingredientDoses.map(d => d.value)).toEqual([500, 50]);
  const original = structuredClone(entry.periods[0].ingredientDoses);
  entry.schedule.timesPerDay = 4;
  recordIngredientDoseChange(entry, '2026-02-01');
  expect(entry.periods[0].ingredientDoses).toEqual(original);
  expect(entry.periods[1].ingredientDoses.map(d => d.value)).toEqual([2000, 50]);
  entry.periods[1].end = '2026-02-15';
  recordIngredientDoseChange(entry, '2026-03-01');
  expect(entry.periods).toHaveLength(2);
  entry.periods.push({ start: '2026-04-01', end: null });
  recordIngredientDoseChange(entry, '2026-04-01');
  expect(entry.periods[2].ingredientDoses.map(d => d.value)).toEqual([2000, 50]);
});

it('does not turn an as-needed regimen into a numeric dose', () => {
  const entry = { ingredients: [{ name: 'TMG', amount: '500 mg' }], timesPerDay: 1, schedule: { mode: 'prn' }, periods: [{ start: '2026-01-01', end: null }] };
  recordIngredientDoseChange(entry, '2026-01-01');
  expect(entry.periods[0].dose).toBeUndefined();
  expect(entry.periods).toHaveLength(1);
});


it('preserves a planned end date when a finite daily regimen changes', () => {
  const previous = { schedule: { mode: 'daily', timesPerDay: 1 } };
  const entry = { ingredients: [{ name: 'A', amount: '500 mg' }], schedule: previous.schedule, periods: [{ start: '2026-01-01', end: '2026-03-01' }] };
  recordIngredientDoseChange(entry, '2026-01-01');
  entry.schedule = { mode: 'daily', timesPerDay: 2 };
  entry.periods = recordSupplementSchedule(previous, entry.periods, entry.schedule, '2026-02-01');
  recordIngredientDoseChange(entry, '2026-02-01');
  expect(entry.periods).toHaveLength(2);
  expect(entry.periods[0]).toMatchObject({ end: '2026-01-31', dose: { value: 500 } });
  expect(entry.periods[1]).toMatchObject({ start: '2026-02-01', end: '2026-03-01', dose: { value: 1000 } });
});


it('does not split corrected dates on repeated saves when the current ingredient amount has not changed', () => {
  const previous = { ingredients: [{ name: 'TMG', amount: '500 mg' }], timesPerDay: 1, schedule: { mode: 'daily', timesPerDay: 1 }, periods: [{ start: '2026-03-24', end: '2026-09-27' }, { start: '2026-09-28', end: null, dose: { value: 500, unit: 'mg', basis: 'day', ingredient: 'TMG', source: 'ingredient' } }] };
  const edited = { ...previous, periods: [{ start: '2026-03-24', end: null }] };
  recordIngredientDoseChange(edited, '2026-09-28', previous);
  expect(edited.periods).toEqual([{ start: '2026-03-24', end: null }]);
  const saved = structuredClone(edited);
  recordIngredientDoseChange(edited, '2026-09-29', saved);
  expect(edited.periods).toEqual(saved.periods);
  edited.ingredients = [{ name: 'TMG', amount: '2000 mg' }];
  recordIngredientDoseChange(edited, '2026-09-29', saved);
  expect(edited.periods).toHaveLength(2);
  expect(edited.periods[1]).toMatchObject({ start: '2026-09-29', dose: { value: 2000 } });
});
