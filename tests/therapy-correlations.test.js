import { describe, expect, it, vi } from 'vitest';
import {
  correlationDay, parseCorrelationDose, prepareTherapyHistory, therapyExposure,
  therapySegments, prepareTherapyComparison, prepareCorrelationSelection, therapyCorrelationPrompt,
} from '../js/therapy-correlations.js';

const today = '2026-09-01';
const record = {
  id: 'sm_test', name: 'Recorded treatment', type: 'medication',
  schedule: { mode: 'daily', timesPerDay: 4 },
  periods: [
    { start: '2026-01-01', end: '2026-02-28', dose: '500 mg' },
    { start: '2026-03-01', end: '2026-04-30', dose: '2,000 mg' },
    { start: '2026-06-01', end: null, dose: '1 g' },
  ],
};
const dates = ['2026-01-10', '2026-01-20', '2026-02-10', '2026-03-10', '2026-03-20', '2026-04-10'];
const marker = { name: 'Marker', unit: 'mmol/L', values: [1, 1, 1, 4, 4, 4] };
const compare = (overrides = {}) => prepareTherapyComparison({ history: prepareTherapyHistory(record, today), marker, markerKey: 'test.marker', dates, ...overrides });

describe('recorded-dose interpretation', () => {
  it.each([
    ['500 mg', 500, 'mg', 'dose'], ['2,000 mg', 2000, 'mg', 'dose'], ['0.500 g', 500, 'mg', 'dose'],
    ['0,5 g', 500, 'mg', 'dose'], ['500 µg', 0.5, 'mg', 'dose'], ['2 capsules', 2, 'capsule', 'dose'],
    ['2000 IU/day', 2000, 'IU', 'day'], ['2 mL per day', 2, 'mL', 'day'],
    [{ value: 5, unit: 'mg' }, 5, 'mg', 'dose'], [{ text: '25 mcg' }, 0.025, 'mg', 'dose'],
  ])('normalizes explicit %j without inventing frequency', (raw, value, unit, basis) => {
    expect(parseCorrelationDose(raw)).toMatchObject({ value, unit, basis });
  });
  it.each(['', 'with food', '500 mg twice daily', '1–2 tablets', '500', '0 mg', '-5 mg', '50%', '1.2.3 mg', 'Infinity mg'])('leaves %s nonnumeric', raw => {
    expect(parseCorrelationDose(raw)).toBeNull();
  });
  it('validates calendar dates including leap days', () => {
    expect(correlationDay('2026-02-30')).toBeNull();
    expect(correlationDay('2026-02-29')).toBeNull();
    expect(correlationDay('2024-02-29')).not.toBeNull();
  });
});

describe('historical dose and pause alignment', () => {
  it('preserves dose increases, decreases and breaks; never multiplies by current frequency', () => {
    const snapshot = structuredClone(record), history = prepareTherapyHistory(record, today);
    expect(therapyExposure(history, '2026-02-28')).toMatchObject({ value: 500, daysSinceChange: 58 });
    expect(therapyExposure(history, '2026-03-01')).toMatchObject({ value: 2000, daysSinceChange: 0 });
    expect(therapyExposure(history, '2026-05-01')).toMatchObject({ value: 0, status: 'paused', daysSinceChange: 0 });
    expect(therapyExposure(history, '2026-06-01')).toMatchObject({ value: 1000 });
    expect(therapyExposure(history, '2025-12-31')).toMatchObject({ value: null });
    expect(therapyExposure(history, '2026-09-02')).toMatchObject({ value: null });
    expect(record).toEqual(snapshot);
  });
  it('does not replace an unknown historical dose with the current dose or ingredient strength', () => {
    const history = prepareTherapyHistory({ ...record, currentDose: '2000 mg', ingredients: [{ amount: '500 mg' }], periods: [{ start: '2026-01-01', end: null }] }, today);
    expect(therapyExposure(history, '2026-02-01').value).toBeNull();
  });
  it('keeps recorded usage separate from unknown dose and from unknown history', () => {
    const history = prepareTherapyHistory({ ...record, periods: [
      { start: '2026-01-01', end: '2026-01-31' },
      { start: '2026-03-01', end: null },
    ] }, today);
    expect(therapyExposure(history, '2025-12-31')).toMatchObject({ usage: null, value: null });
    expect(therapyExposure(history, '2026-01-10')).toMatchObject({ usage: 1, value: null });
    expect(therapyExposure(history, '2026-02-10')).toMatchObject({ usage: 0, value: null });
    expect(therapyExposure(history, '2026-03-10')).toMatchObject({ usage: 1, value: null });
    expect(compare({ history })).toMatchObject({ n: 0, r: null, groups: [] });
    const prn = prepareTherapyHistory({ ...record, schedule: { mode: 'prn' } }, today);
    expect(therapyExposure(prn, '2026-01-10')).toMatchObject({ usage: 1, value: null });
    const invalid = prepareTherapyHistory({ ...record, periods: [{ start: 'invalid' }] }, today);
    expect(therapyExposure(invalid, '2026-01-10')).toMatchObject({ usage: null, value: null });
  });
  it('supports legacy dates without pretending legacy personal directions are period doses', () => {
    const history = prepareTherapyHistory({ name: 'Legacy', dosage: '500 mg', startDate: '2026-01-01', endDate: '2026-01-31' }, today);
    expect(history.periods).toHaveLength(1);
    expect(therapyExposure(history, '2026-01-10').value).toBeNull();
  });
  it('does not infer PRN intake and honors a historical schedule over the current one', () => {
    const history = prepareTherapyHistory({ ...record, schedule: { mode: 'prn' } }, today);
    expect(therapyExposure(history, '2026-02-01').value).toBeNull();
    const dated = prepareTherapyHistory({ ...record, schedule: { mode: 'prn' }, periods: [{ ...record.periods[0], schedule: { mode: 'daily' } }] }, today);
    expect(therapyExposure(dated, '2026-02-01').value).toBe(500);
  });
  it.each([
    [{ start: '2026-02-30', end: null, dose: '500 mg' }],
    [{ start: '2026-01-01', end: 'invalid', dose: '500 mg' }],
    [{ start: '2026-02-01', end: '2026-01-01', dose: '500 mg' }],
    [{ start: '2026-01-01', end: null, dose: '500 mg' }, { start: '2026-02-01', end: null, dose: '1000 mg' }],
    [{ start: '2026-01-01', end: '2026-02-01', dose: '500 mg' }, { start: '2026-02-01', end: null, dose: '1000 mg' }],
  ].map(periods => [periods]))('rejects ambiguous periods %j', periods => {
    const history = prepareTherapyHistory({ ...record, periods }, today);
    expect(history.invalid).toBe(true);
    expect(therapyExposure(history, '2026-02-10').value).toBeNull();
  });
  it('uses exact day boundaries and retains unknown gaps in chart segments', () => {
    const history = prepareTherapyHistory(record, today);
    const segments = therapySegments(history, '2026-02-28', '2026-06-01');
    expect(segments.map(s => s.value)).toEqual([500, 2000, 0, 1000]);
    expect(segments[1].start).toBe(correlationDay('2026-03-01'));
    expect(segments[1].end).toBe(correlationDay('2026-05-01'));
  });
});

describe('exploratory comparisons', () => {
  it('uses the recorded doses at measured dates, with explicit group counts', () => {
    const result = compare();
    expect(result.r).toBeCloseTo(1);
    expect(result.n).toBe(6);
    expect(result.groups.map(g => [g.dose, g.mean, g.n])).toEqual([[500, 1, 3], [2000, 4, 3]]);
  });
  it('detects an inverse association after decreases without changing dose history', () => {
    expect(compare({ marker: { ...marker, values: [4, 4, 4, 1, 1, 1] } }).r).toBeCloseTo(-1);
  });
  it('shifts exposure backwards by the selected lag, without nearest-lab interpolation', () => {
    const result = compare({ dates: ['2026-03-03'], marker: { ...marker, values: [2] }, lagDays: 7 });
    expect(result.rows[0]).toMatchObject({ date: '2026-03-03', exposureDate: '2026-02-24', exposure: { value: 500 } });
    expect(result.r).toBeNull();
  });
  it('excludes conflicting draws, collapses identical duplicates and keeps source provenance', () => {
    const entries = [{ date: dates[0], markers: { 'test.marker': 1 }, sourceFile: 'a.pdf' }, { date: dates[0], markers: { 'test.marker': 2 }, sourceFile: 'b.pdf' }];
    const result = compare({ entries });
    expect(result.n).toBe(5);
    expect(result.rows[0].reason).toContain('Conflicting');
    expect(result.rows[0].sources.map(s => s.source)).toEqual(['a.pdf', 'b.pdf']);
    entries[1].markers['test.marker'] = 1;
    expect(compare({ entries }).n).toBe(6);
  });
  it('resolves provenance through a moved marker storage identity', () => {
    const result = compare({ markerKey: 'moved.marker', marker: { ...marker, storageDotKey: 'test.marker' }, entries: [{ date: dates[0], markers: { 'test.marker': 1 } }, { date: dates[0], markers: { 'test.marker': 9 } }] });
    expect(result.n).toBe(5);
  });
  it('does not count null/nonfinite values or future measurements', () => {
    const result = compare({ dates: [...dates, '2026-10-01'], marker: { ...marker, values: [1, null, NaN, 4, 4, 4, 7] } });
    expect(result.rows).toHaveLength(5);
    expect(result.n).toBe(4);
    expect(result.rows.at(-1).reason).toBe('Future measurement');
  });
  it('keeps before-use measurements as a descriptive baseline, never zero exposure', () => {
    const result = compare({ dates: ['2025-12-01', ...dates], marker: { ...marker, values: [2, ...marker.values] } });
    expect(result.baseline).toEqual({ n: 1, mean: 2 });
    expect(result.n).toBe(6);
    expect(result.rows[0].exposure.value).toBeNull();
  });
  it('withholds coefficients for sparse, constant and incompatible data', () => {
    expect(compare({ marker: { ...marker, values: [1, 1, 1, 1, 1, 1] } }).r).toBeNull();
    expect(compare({ dates: dates.slice(0, 3), marker: { ...marker, values: [1, 2, 3] } }).r).toBeNull();
    const history = prepareTherapyHistory({ ...record, periods: [{ ...record.periods[0], dose: '500 mg/day' }, ...record.periods.slice(1)] }, today);
    expect(compare({ history }).unavailable).toContain('Incompatible');
  });
  it('produces identical measurements for charts/tables/AI, flags overlaps and keeps profiles separate', () => {
    const data = { dates, categories: { test: { markers: { marker } } } };
    const imported = { supplements: [record, { id: 'other', name: 'Other therapy', startDate: '2026-01-15', endDate: null }], entries: [] };
    const selection = prepareCorrelationSelection(data, imported, ['test.marker'], ['sm_test'], 7);
    expect(selection.comparisons[0].warnings.join(' ')).toContain('Other therapy');
    const prompt = therapyCorrelationPrompt(selection);
    const payload = JSON.parse(prompt.slice(prompt.indexOf('{')));
    expect(payload.comparisons).toEqual(selection.comparisons);
    expect(payload.histories[0].record).toBeUndefined();
    expect(prepareCorrelationSelection(data, { supplements: [], entries: [] }, ['test.marker'], ['sm_test']).comparisons).toEqual([]);
    expect(prepareCorrelationSelection(data, { supplements: [record, record] }, ['test.marker'], ['sm_test']).comparisons).toEqual([]);
  });
});

describe('interpretation boundaries', () => {
  it('does not call post-start labs a baseline when a lag points before treatment', () => {
    const result = compare({ dates: ['2025-12-01', '2026-01-10'], marker: { ...marker, values: [2, 9] }, lagDays: 30 });
    expect(result.baseline).toEqual({ n: 1, mean: 2 });
    expect(result.rows[1].exposure.value).toBeNull();
  });
  it('rejects conflicting structured dose text and unsupported amount bases', () => {
    expect(parseCorrelationDose({ value: 500, unit: 'mg', text: '2000 mg' })).toBeNull();
    expect(parseCorrelationDose({ value: 500, unit: 'mg', basis: 'per bottle' })).toBeNull();
    expect(parseCorrelationDose('500 mg DAILY')?.basis).toBe('day');
  });
  it('retains a dated frequency without multiplying an ambiguous dose/strength field', () => {
    const history = prepareTherapyHistory({ ...record, periods: [{ ...record.periods[0], schedule: { mode: 'multiple', timesPerDay: 4 } }] }, today);
    const exposure = therapyExposure(history, '2026-02-01');
    expect(exposure.value).toBe(500);
    expect(exposure.label).toContain('4 uses/day');
  });
});


it('shows current ingredients separately while keeping unknown past doses excluded', () => {
  const history = prepareTherapyHistory({ name: 'TMG', timesPerDay: 1,
    ingredients: [{ name: 'TMG', amountValue: 500, amountUnit: 'mg' }],
    periods: [{ start: '2026-01-01', end: null }],
  }, today);
  expect(history.currentDoses[0].quantity).toMatchObject({ value: 500, basis: 'day', ingredient: 'TMG' });
  expect(compare({ history })).toMatchObject({ n: 0, r: null, groups: [] });
  expect(therapyExposure(history, '2026-01-10').value).toBeNull();
});

it('does not pool different ingredients just because both use mg/day', () => {
  const history = prepareTherapyHistory({ ...record, periods: [
    { start: '2026-01-01', end: '2026-02-28', dose: { value: 500, unit: 'mg', basis: 'day', ingredient: 'TMG' } },
    { start: '2026-03-01', end: null, dose: { value: 2000, unit: 'mg', basis: 'day', ingredient: 'Inositol' } },
  ] }, today);
  expect(compare({ history }).r).toBeNull();
  expect(history.selectedIngredient).toBe('TMG');
  expect(history.periods[1].quantity).toBeNull();
});


it.each(['', '   '])('excludes empty historical dose %j even when other periods have numeric doses', dose => {
  const history = prepareTherapyHistory({ ...record, periods: record.periods.map((p, i) => i === 1 ? { ...p, dose } : p) }, today);
  const comparison = compare({ history });
  expect(comparison.n).toBe(3);
  expect(comparison.rows.slice(3).every(r => r.reason === 'Dose not recorded')).toBe(true);
  expect(comparison.groups.every(g => typeof g.dose === 'number')).toBe(true);
});

it('expands historical weekday and interval schedules without using today’s schedule as historical fact', () => {
  const monday = prepareTherapyHistory({ periods: [{ start: '2026-01-05', end: null, dose: '500 mg', schedule: { mode: 'selected-days', daysOfWeek: [1] } }] }, today);
  expect(therapyExposure(monday, '2026-01-05').value).toBe(500);
  expect(therapyExposure(monday, '2026-01-06')).toMatchObject({ value: 0, status: 'scheduled-off' });
  expect(therapySegments(monday, '2026-01-05', '2026-01-12').map(s => s.value)).toEqual([500, 0, 0, 0, 0, 0, 0, 500]);
  const interval = prepareTherapyHistory({ periods: [{ start: '2026-01-05', dose: '500 mg', schedule: { mode: 'interval', intervalDays: 3 } }] }, today);
  expect(therapyExposure(interval, '2026-01-08').value).toBe(500);
  expect(therapyExposure(interval, '2026-01-09').value).toBe(0);
  const missing = prepareTherapyHistory({ schedule: { mode: 'selected-days', daysOfWeek: [1] }, periods: [{ start: '2026-01-05', dose: '500 mg' }] }, today);
  expect(therapyExposure(missing, '2026-01-05').value).toBeNull();
  const invalid = prepareTherapyHistory({ periods: [{ start: '2026-01-05', dose: '500 mg', schedule: { mode: 'selected-days', daysOfWeek: [] } }] }, today);
  expect(therapyExposure(invalid, '2026-01-05').value).toBeNull();
});

it('filters the same observations for pairs, marker plots, provenance and AI without altering history', () => {
  const data = { dates, categories: { test: { markers: { marker, other: { ...marker, name: 'Other', values: [2, 2, 2, 8, 8, 8] } } } } };
  const imported = { supplements: [record], entries: [] };
  const selection = prepareCorrelationSelection(data, imported, ['test.marker', 'test.other'], ['sm_test'], 7, { start: '2026-03-01', end: '2026-03-31' });
  expect(selection.markers[0].rows.map(r => r.date)).toEqual(['2026-03-10', '2026-03-20']);
  expect(selection.comparisons[0].n).toBe(2);
  expect(selection.markerPairs[0].n).toBe(2);
  expect(selection.histories[0].periods).toHaveLength(3);
  const prompt = therapyCorrelationPrompt(selection);
  const payload = JSON.parse(prompt.slice(prompt.indexOf('{')));
  expect(payload.range).toEqual(selection.range);
  expect(payload.comparisons).toEqual(selection.comparisons);
  expect(payload.markers[0].rows).toEqual(selection.markers[0].rows);
  const invalid = prepareCorrelationSelection(data, imported, ['test.marker'], ['sm_test'], 0, { start: '2026-04-01', end: '2026-01-01' });
  expect(invalid.rangeError).toContain('Start date');
  expect(invalid.comparisons[0].n).toBe(0);
});

it('never interpolates missing same-date marker pairs or includes conflicting draws', () => {
  const data = { dates, categories: { test: { markers: { marker, other: { ...marker, name: 'Other', values: [2, null, 2, 8, 8, 8] } } } } };
  const selection = prepareCorrelationSelection(data, { entries: [{ date: dates[0], markers: { 'test.other': 2 } }, { date: dates[0], markers: { 'test.other': 3 } }] }, ['test.marker', 'test.other'], []);
  expect(selection.markerPairs[0].n).toBe(4);
  expect(selection.markerPairs[0].rows[1].reason).toBe('No measurement on this date');
  expect(selection.markerPairs[0].rows[0].reason).toContain('Conflicting');
});


it('resolves a selected ingredient from dated regimen snapshots without mixing ingredients or rewriting history', () => {
  const dose = (ingredient, value, unit = 'mg') => ({ ingredient, value, unit, basis: 'day', source: 'ingredient' });
  const record = { id: 'combo', name: 'Combination', schedule: { mode: 'daily', timesPerDay: 1 }, ingredients: [{ name: 'A', amount: '2000 mg' }, { name: 'B', amount: '25 mcg' }], periods: [
    { start: '2026-01-01', end: '2026-02-28', ingredientDoses: [dose('A', 500), dose('B', 25, 'mcg')] },
    { start: '2026-03-01', end: null, ingredientDoses: [dose('A', 2000), dose('B', 25, 'mcg')] },
  ] };
  const before = structuredClone(record);
  const a = prepareTherapyHistory(record, today, 'A');
  const b = prepareTherapyHistory(record, today, 'B');
  expect(a.ingredientOptions).toEqual(['A', 'B']);
  expect(therapyExposure(a, '2026-01-10').value).toBe(500);
  expect(therapyExposure(a, '2026-03-10').value).toBe(2000);
  expect(therapyExposure(b, '2026-03-10').value).toBe(0.025);
  expect(b.currentDoses.every(d => d.confirmedSince)).toBe(true);
  expect(compare({ history: a }).r).toBe(1);
  expect(record).toEqual(before);
});


it('rejects duplicate ingredient snapshots and malformed history without guessing a dose', () => {
  const duplicate = { ingredient: 'A', value: 500, unit: 'mg', basis: 'day', source: 'ingredient' };
  const history = prepareTherapyHistory({ periods: [{ start: '2026-01-01', end: null, ingredientDoses: [duplicate, { ...duplicate, value: 2000 }] }] }, today);
  expect(therapyExposure(history, '2026-02-01').value).toBeNull();
  expect(prepareTherapyHistory({ periods: [null] }, today).invalid).toBe(true);
});

it.each([null, undefined, ''])('keeps a TMG period with end=%s ongoing through today', end => {
  const tmg = { id: 'tmg-ongoing', name: 'TMG Powder', timesPerDay: 1, schedule: { mode: 'daily', timesPerDay: 1 },
    ingredients: [{ name: 'Trimethylglycine (TMG)', amountValue: 500, amountUnit: 'mg' }],
    periods: [{ start: '2026-03-24', end }],
  };
  const today = '2026-09-28';
  const referenceOnly = prepareTherapyHistory(tmg, today);
  expect(referenceOnly.invalid).toBe(false);
  expect(referenceOnly.currentDoses[0].value).toBe(500);
  expect(therapyExposure(referenceOnly, today)).toMatchObject({ usage: 1, value: null });
  expect(therapySegments(referenceOnly, '2026-03-24', today).every(s => s.usage === 1)).toBe(true);
  tmg.periods[0].ingredientDoses = [{ ingredient: 'Trimethylglycine (TMG)', value: 500, unit: 'mg', basis: 'day', source: 'ingredient' }];
  const snapshot = structuredClone(tmg);
  const linked = prepareTherapyHistory(tmg, today);
  expect(linked.invalid).toBe(false);
  expect(therapyExposure(linked, today)).toMatchObject({ usage: 1, value: 500 });
  const segments = therapySegments(linked, '2026-03-24', today);
  expect(segments.every(s => s.value === 500)).toBe(true);
  expect(segments.at(-1).end).toBe(correlationDay(today) + 1);
  expect(tmg).toEqual(snapshot);
});


it('uses calendar-month presets through today with no silent all-data fallback', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-31T12:00:00Z'));
  try {
    const data = { dates: ['2025-01-01', '2026-02-27', '2026-02-28', '2026-05-31'], categories: { test: { markers: { marker: { ...marker, values: [1, 2, 3, 4] } } } } };
    for (const [rangePreset, start] of [['3m', '2026-02-28'], ['6m', '2025-11-30'], ['1y', '2025-05-31']]) {
      const selection = prepareCorrelationSelection(data, { supplements: [record] }, ['test.marker'], ['sm_test'], 0, { rangePreset });
      expect(selection.range).toEqual({ start, end: '2026-05-31' });
      expect(selection.markers[0].rows.every(r => r.date >= start)).toBe(true);
      expect(therapyCorrelationPrompt(selection)).not.toContain('2025-01-01');
    }
    const empty = prepareCorrelationSelection({ ...data, dates: ['2025-01-01'] }, {}, ['test.marker'], [], 0, { rangePreset: '3m' });
    expect(empty.markers[0].rows).toEqual([]);
    expect(empty.range.start).toBe('2026-02-28');
  } finally { vi.useRealTimers(); }
});


it('keeps every pair available and gives AI the active pair, original values and all dated ingredient snapshots', () => {
  const dose = (ingredient, value) => ({ ingredient, value, unit: 'mg', basis: 'day', source: 'ingredient' });
  const product = { id: 'combo', name: 'Combined supplement', ingredients: [{ name: 'A', amount: '500 mg' }, { name: 'B', amount: '25 mg' }], timesPerDay: 1, periods: [{ start: '2026-01-01', end: null, ingredientDoses: [dose('A', 500), dose('B', 25)] }] };
  const data = { dates, categories: { test: { markers: { marker, other: { ...marker, name: 'Other', unit: '%', values: [31, 32, 33, 34, 35, 36] } } } } };
  const pairKey = JSON.stringify(['test.marker', 'test.other']);
  const options = { pairKey, layout: 'overlay', tab: 'data', hidden: ['test.other'], ingredients: { combo: 'B' }, start: dates[1], end: dates[4] };
  const selection = prepareCorrelationSelection(data, { supplements: [product] }, ['test.marker', 'test.other'], ['combo'], 0, options);
  expect(selection.pairs).toHaveLength(3);
  expect(selection.activePairKey).toBe(pairKey);
  expect(selection.pairs.find(p => p.pairKey === pairKey).xMarkerKey).toBe('test.other');
  const prompt = therapyCorrelationPrompt(selection);
  const payload = JSON.parse(prompt.slice(prompt.indexOf('{')));
  expect(payload.activePairKey).toBe(pairKey);
  expect(payload.view).toEqual({ layout: 'overlay', tab: 'data', hiddenSeries: ['test.other'] });
  expect(payload.histories[0]).toMatchObject({ id: 'combo', selectedIngredient: 'B', periods: [{ ingredientDoses: product.periods[0].ingredientDoses }] });
  expect(payload.markers[0].rows.map(r => r.value)).toEqual([1, 1, 4, 4]);
  expect(payload.comparisons[0].rows.every(r => r.exposure.value === 25)).toBe(true);
  expect(payload.markers[1].key).toBe('test.other');
  expect(payload.markers[1].rows.map(r => r.value)).toEqual([32, 33, 34, 35]);
  expect(prompt).toContain('use original values');
});
