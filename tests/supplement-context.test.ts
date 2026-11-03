import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getContextSummary } from '../js/chat-context-summary.js';
import {
  buildCompactSupplementContextRecords,
  buildSupplementAIContext,
  resolveSupplementContextMode,
} from '../js/supplement-context.js';
import type { SupplementRecord } from '../types/supplement-data.js';
type ProductFixture = SupplementRecord & Required<Pick<SupplementRecord, 'schedule' | 'qualityTests'>>;
type HistoryFixture = SupplementRecord & Required<Pick<SupplementRecord, 'schedule' | 'periods'>>;

function product(overrides: Partial<SupplementRecord> = {}): ProductFixture {
  return {
    name: 'Multilingual Daily',
    type: 'supplement',
    startDate: '2026-01-01',
    schedule: { mode: 'daily', timesPerDay: 1 },
    servingSize: { value: 1, unit: 'capsule' },
    ingredients: Array.from({ length: 10 }, (_, index) => ({
      name: `Active ${index + 1}`,
      amount: `${index + 1} mg`,
    })),
    inactiveIngredients: [
      'Rice flour',
      'Silicon dioxide',
      'Magnesium stearate',
      'Natural color',
      'Vegetable capsule (hypromellose)',
      'Sunflower lecithin',
    ],
    qualityTests: [
      {
        category: 'contaminant', analyte: 'Кадмий', canonicalAnalyte: 'cadmium',
        resultText: 'ND', unit: 'mg', basis: 'per capsule', status: 'not-detected',
        method: 'ICP-MS full method should only appear in detail',
      },
      { category: 'potency', analyte: 'Active 1', resultText: '101%', status: 'pass' },
      { category: 'microbiology', analyte: 'Salmonella', resultText: 'positive', status: 'fail' },
    ],
    ...overrides,
  };
}

describe('token-bounded supplement AI context', () => {
  it('keeps routine context lean while quality and excipient details remain available on relevant questions', () => {
    const context = buildSupplementAIContext([product()], { mode: 'compact', maxChars: 3000 });
    expect(context.length).toBeLessThanOrEqual(3000);
    expect(context).toContain('Active 1');
    expect(context).toContain('(+2 more stored)');
    for (const detail of ['Vegetable capsule', 'Salmonella', 'cadmium', 'ICP-MS']) expect(context).not.toContain(detail);
    const detail = buildSupplementAIContext([product()], { mode: 'detail' });
    expect(detail).toContain('Vegetable capsule (hypromellose)');
    expect(detail).toContain('explicit source failures: Salmonella: positive');
    expect(detail).toContain('cadmium — Multilingual Daily: ND · mg per capsule');
    expect(detail).toContain('0/1 result(s) convertible to scheduled daily mass');
    expect(detail).toContain('relationship to the user’s bottle lot not verified');
    expect(detail).toContain('1 informational/excluded result(s) retained outside AI context');
    expect(detail).toContain('keep ND/NQ distinct from zero');
    expect(detail).toContain('For source-reported contaminant results, keep ND/NQ distinct from zero');
  });

  it('unlocks detail from stored terms in arbitrary scripts and includes full evidence', () => {
    const supplement = product({
      inactiveIngredients: ['植物性カプセル', '米粉'],
    });

    expect(resolveSupplementContextMode('Покажи подробнее Кадмий', [supplement])).toBe('detail');
    expect(resolveSupplementContextMode('植物性カプセルについて教えて', [supplement])).toBe('detail');
    expect(resolveSupplementContextMode('How was my sleep?', [supplement])).toBe('compact');
    expect(resolveSupplementContextMode('What is the source of my fatigue?', [supplement])).toBe('compact');
    for (const query of ['Any interactions?', 'Show label warnings', 'Why am I taking these?', 'Show original source links', 'Who prescribed this?']) {
      expect(resolveSupplementContextMode(query, [supplement])).toBe('detail');
    }

    const detail = buildSupplementAIContext([supplement], { mode: 'detail' });
    expect(detail).toContain('ICP-MS full method should only appear in detail');
    expect(detail).toContain('植物性カプセル');
  });

  it('honors an explicit per-result AI exclusion without deleting other quality evidence', () => {
    const supplement = product();
    supplement.qualityTests[0]!.includeInAIContext = false;
    const context = buildSupplementAIContext([supplement], { mode: 'detail' });

    expect(context).not.toContain('cadmium —');
    expect(context).toContain('Salmonella: positive');
    expect(context).toContain('2 informational/excluded result(s) retained outside AI context');
  });

  it('keeps archived records discoverable without expanding their full data', () => {
    const current = product();
    const ended = product({ name: 'Past course', startDate: '2025-01-01', endDate: '2025-02-01' });
    const context = buildSupplementAIContext([current], {
      mode: 'compact',
      inventorySupplements: [current, ended],
    });

    expect(context).toContain('Other stored therapy records (not detailed in this prompt; name, type, status and dates only): Past course [supplement; ended; 2025-01-01→2025-02-01]');
    expect(context.match(/Past course/gu)).toHaveLength(1);
  });

  it('enforces hard prompt budgets and marks omitted records', () => {
    const supplements = Array.from({ length: 35 }, (_, index) => product({
      name: `Product ${index + 1}`,
      note: 'Long but bounded context note '.repeat(20),
    }));
    const context = buildSupplementAIContext(supplements, { mode: 'compact', maxChars: 1200 });
    const records = buildCompactSupplementContextRecords(supplements, { maxChars: 900 });

    expect(context.length).toBeLessThanOrEqual(1200);
    expect(context).toContain('full records remain stored');
    expect(JSON.stringify(records).length).toBeLessThanOrEqual(900);
    expect(records.at(-1)).toHaveProperty('moreTherapyRecordsStored');
    expect(JSON.stringify(records)).not.toContain('ICP-MS full method');
  });
});


describe('dated doses in AI context', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-29T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());
  it('preserves a reported legacy amount without inventing a dated or elemental dose', () => {
    const legacy = { name: 'Iron Bisglycinate', type: 'supplement', dosage: '36 mg with vitamin C', startDate: '2026-01-01', endDate: '' };
    const before = structuredClone(legacy);
    const record = buildCompactSupplementContextRecords([legacy])[0]!;
    const expected = 'undated reported regimen: 36 mg with vitamin C; dated dose not recorded';
    expect(record.currentDose).toBe(expected);
    expect(record.doseHistory).toEqual(['2026-01-01→ongoing [current]: dose not recorded']);
    for (const mode of ['compact', 'detail'] as const) {
      const context = buildSupplementAIContext([legacy], { mode });
      expect(context).toContain(expected);
      expect(context).not.toContain('36 mg/day');
      expect(context).not.toContain('36 mg elemental');
    }
    expect(legacy).toEqual(before);
  });

  it('keeps dated doses authoritative over legacy text and product-label directions', () => {
    const record = { name: 'Iron', dosage: '36 mg with vitamin C', labelDirections: 'Two tablets daily',
      periods: [{ start: '2026-01-01', end: null, dose: { value: 18, unit: 'mg', basis: 'day' } }] };
    expect(buildCompactSupplementContextRecords([record])[0]!.currentDose).toBe('18 mg/day (2026-01-01→ongoing)');
    const labelOnly = { name: 'Iron', startDate: '2026-01-01', labelDirections: '36 mg daily' };
    expect(buildCompactSupplementContextRecords([labelOnly])[0]!.currentDose).toBe('dose not recorded (2026-01-01→ongoing)');
  });

  it.each([
    { startDate: '2026-01-01', endDate: '2026-02-01', expected: 'none (ended)' },
    { startDate: '2027-01-01', expected: 'none (scheduled)' },
  ])('does not turn an inactive legacy regimen into current use: $expected', ({ expected, ...dates }) => {
    const record = { name: 'Iron', dosage: '36 mg with vitamin C', ...dates };
    expect(buildCompactSupplementContextRecords([record])[0]!.currentDose).toBe(expected);
  });
  const changed = (): HistoryFixture => ({ name: 'TMG', ingredients: [{ name: 'TMG', amount: '500 mg' }], timesPerDay: 1,
    schedule: { mode: 'daily', timesPerDay: 1 }, dosage: '500 mg with food', currentDose: '1500 mg/day', periods: [
      { start: '2026-08-01', end: '2026-09-28', dose: '500 mg/day', schedule: { mode: 'daily', timesPerDay: 1 } },
      { start: '2026-09-29', end: '2026-10-31', dose: { value: 1000, unit: 'mg', basis: 'day', ingredient: 'TMG' } },
      { start: '2026-11-01', end: null, dose: '1500 mg/day' },
    ] });
  it.each(['compact', 'detail'] as const)('includes the increased current dose, earlier dose and planned dose distinctly in %s mode', mode => {
    const context = buildSupplementAIContext([changed()], { mode, historyRange: { start: '2026-08-15', end: '2026-08-15' } });
    expect(context).toContain('current recorded dose as of 2026-09-29: TMG: 1000 mg/day (2026-09-29→2026-10-31)');
    expect(context).toContain('2026-08-01→2026-09-28 [past]: 500 mg/day; schedule: daily, 1×/day');
    expect(context).toContain('2026-11-01→ongoing [planned]: 1500 mg/day');
    expect(context).toContain('TMG 500 mg per label serving');
    expect(context).not.toContain('= 500 mg/day');
    expect(context).toContain('undated directions/current schedule (not historical dose): 500 mg with food');
  });
  it('keeps current dose and dated periods in specialized compact JSON context too', () => {
    const [record] = buildCompactSupplementContextRecords([changed()], { historyRange: { start: '2026-08-15', end: '2026-08-15' } });
    expect(record!.currentDose).toContain('1000 mg/day');
    expect(record!.doseHistory).toContain('2026-11-01→ongoing [planned]: 1500 mg/day');
    expect(record!.doseHistory).toContain('2026-08-01→2026-09-28 [past]: 500 mg/day; schedule: daily, 1×/day');
  });
  it('keeps unknown historical doses unknown and includes multi-ingredient snapshots', () => {
    const record = changed();
    delete record.periods[0]!.dose;
    record.periods[1] = { start: '2026-09-29', end: null, ingredientDoses: [
      { ingredient: 'TMG', value: 1000, unit: 'mg', basis: 'day' }, { ingredient: 'B12', value: 100, unit: 'mcg', basis: 'day' },
    ] };
    record.periods.pop();
    const context = buildSupplementAIContext([record], { mode: 'detail' });
    expect(context).toContain('2026-08-01→2026-09-28 [past]: dose not recorded');
    expect(context).toContain('TMG: 1000 mg/day, B12: 100 mcg/day');
  });
  it('does not call an ended or paused dose current', () => {
    const record = changed();
    record.periods = [record.periods[0]!];
    record.lifecycle = { state: 'paused' };
    expect(buildSupplementAIContext([record])).toContain('current recorded dose as of 2026-09-29: none (paused)');
  });
  it('omits unrelated older doses by default, retaining current and next planned doses', () => {
    for (const context of [buildSupplementAIContext([changed()]), JSON.stringify(buildCompactSupplementContextRecords([changed()]))]) {
      expect(context).toContain('1000 mg/day');
      expect(context).toContain('2026-11-01');
      expect(context).not.toContain('2026-08-01');
    }
  });
  it('recognizes dose-only questions as requests for detailed therapy context', () => {
    expect(resolveSupplementContextMode('What is my current dosage?', [])).toBe('detail');
  });
});

const medication = (): HistoryFixture => ({
  name: 'Example medicine', type: 'medication', genericName: 'Generic Example', brand: 'Example brand',
  dosageForm: 'tablet', route: 'oral', reason: 'Example indication', prescriber: 'Example clinician',
  servingSize: { value: 2, unit: 'tablet' }, labelDirections: 'Label instructions', labelWarnings: ['Example warning'],
  importProvenance: { kind: 'url', url: 'https://example.org/medicine' }, note: 'Personal note',
  schedule: { mode: 'prn', maxPerDay: 3, details: 'Only when needed' },
  periods: [{ start: '2026-01-01', end: null, dose: { value: 10, unit: 'mg', basis: 'dose' } }],
  ingredients: [{ name: 'Example active', amount: '10 mg' }], inactiveIngredients: ['Tablet coating'],
});

describe('complete therapy facts and conservative exposure', () => {
  it.each([
    ['What is the source of my therapy?', true],
    ['What is the source of my treatment?', true],
    ['Show the source for Example medicine', true],
    ['What is the source of my fatigue?', false],
    ['What is the source of my poor sleep?', false],
    ['What is the source of my fatigue while on therapy?', false],
  ])('only expands therapy provenance for relevant source queries: %s', (queryText, includeSource) => {
    const records = [medication()];
    const mode = resolveSupplementContextMode(queryText, records);
    expect(mode).toBe(includeSource ? 'detail' : 'compact');
    const context = buildSupplementAIContext(records, { mode, queryText });
    expect(context.includes('https://example.org/medicine')).toBe(includeSource);
    expect(context).not.toContain('Example clinician');
  });

  it('does not add provenance merely because a symptom-source question names a medicine', () => {
    const records = [medication()];
    const queryText = 'What is the source of my fatigue while taking Example medicine?';
    const mode = resolveSupplementContextMode(queryText, records);
    expect(mode).toBe('detail');
    expect(buildSupplementAIContext(records, { mode, queryText })).not.toContain('https://example.org/medicine');
  });

  it('separates essential facts, descriptive detail and requested metadata without mutating storage', () => {
    const record = medication();
    const before = structuredClone(record);
    const compact = buildSupplementAIContext([record]);
    const biology = JSON.stringify(buildCompactSupplementContextRecords([record]));
    const detail = buildSupplementAIContext([record], { mode: 'detail', queryText: 'Tell me about Example medicine' });
    const source = buildSupplementAIContext([record], { mode: 'detail', queryText: 'Show the source link for Example medicine' });
    const prescriber = buildSupplementAIContext([record], { mode: 'detail', queryText: 'Who prescribed Example medicine?' });
    for (const context of [compact, biology, detail, source, prescriber]) {
      for (const fact of ['Generic Example', 'oral', '2 tablet', 'maximum 3/day', 'Only when needed', '10 mg/dose']) expect(context).toContain(fact);
      expect(context).not.toContain('= 10 mg/day');
    }
    for (const fact of ['Example indication', 'Label instructions', 'Example warning', 'Personal note', 'Tablet coating']) {
      expect(detail).toContain(fact);
      expect(compact).not.toContain(fact);
      expect(biology).not.toContain(fact);
    }
    for (const context of [compact, biology, detail]) {
      expect(context).not.toContain('Example clinician');
      expect(context).not.toContain('https://example.org/medicine');
    }
    expect(source).toContain('https://example.org/medicine');
    expect(source).not.toContain('Example clinician');
    expect(prescriber).toContain('Example clinician');
    expect(prescriber).not.toContain('https://example.org/medicine');
    expect(compact.length).toBeLessThan(detail.length * 0.6);
    expect(record).toEqual(before);
  });

  it('preserves weekdays, intervals and free text together, with stop reasons', () => {
    const record = medication();
    record.schedule = { mode: 'selected-days', daysOfWeek: [1, 3], intervalDays: 2, details: 'With food' };
    record.periods[0]!.end = '2026-02-01';
    record.periods[0]!.endReason = 'Course completed';
    record.lifecycle = { state: 'ended', reason: 'No longer needed' };
    for (const context of [buildSupplementAIContext([record]), JSON.stringify(buildCompactSupplementContextRecords([record]))]) {
      for (const fact of ['weekdays Mon, Wed', 'every 2 days', 'With food']) expect(context).toContain(fact);
      expect(context).not.toContain('Course completed');
      expect(context).not.toContain('No longer needed');
    }
  });

  it('includes stop reasons in detailed context', () => {
    const record = medication();
    record.periods[0]!.end = '2026-02-01';
    record.periods[0]!.endReason = 'Course completed';
    record.lifecycle = { state: 'ended', reason: 'No longer needed' };
    const detail = buildSupplementAIContext([record], { mode: 'detail' });
    expect(detail).toContain('ended: Course completed');
    expect(detail).toContain('No longer needed');
  });

  it.each(['ended', 'scheduled', 'prn', 'selected-days', 'manual-dose'])('does not infer daily contaminant exposure for %s', scenario => {
    const record = product({ ingredients: [], inactiveIngredients: [], qualityEvidenceScope: 'matching-lot', qualityTests: [
      { category: 'contaminant', analyte: 'Lead', value: 2, unit: 'mcg', basis: 'per serving', status: 'pass' },
    ] });
    if (scenario === 'ended') record.endDate = '2026-01-02';
    if (scenario === 'scheduled') record.startDate = '2099-01-01';
    if (scenario === 'prn' || scenario === 'selected-days') record.schedule.mode = scenario;
    if (scenario === 'manual-dose') record.periods = [{ start: '2026-01-01', dose: '1000 mg/day' }];
    expect(buildSupplementAIContext([record], { mode: 'detail' })).toContain('0/1 result(s) convertible');
    if (scenario !== 'manual-dose') {
      record.startDate = '2026-01-01'; delete record.endDate; record.schedule.mode = 'daily';
      expect(buildSupplementAIContext([record], { mode: 'detail' })).toContain('2 mcg/day measured');
    }
  });

  it('prioritizes a named record beyond the inventory limit and excludes private quality results from both projections', () => {
    const records = Array.from({ length: 30 }, (_, i) => ({ ...medication(), name: `Product ${i}` }));
    records[29]!.name = 'Zebra medicine';
    records[29]!.qualityTests = [{ category: 'contaminant', analyte: 'PrivateAnalyte', resultText: 'PrivateResult', includeInAIContext: false }];
    const detail = buildSupplementAIContext(records, { mode: 'detail', queryText: 'Tell me about Zebra medicine' });
    expect(detail.indexOf('Zebra medicine')).toBeLessThan(detail.indexOf('Product 0'));
    expect(detail).toMatch(/Therapy records in this prompt: \d+ of 30 with dose detail; \d+ listed below by name and dates only/u);
    expect(detail).toContain('Product 28 [medication;');
    expect(detail).not.toContain('PrivateAnalyte');
    expect(JSON.stringify(buildCompactSupplementContextRecords([records[29]!]))).not.toContain('PrivateResult');
  });

  it('retains a brief record and an omission marker when the first full record exceeds the JSON budget', () => {
    const record = medication();
    record.labelWarnings = Array(8).fill('Long warning '.repeat(30));
    const result = buildCompactSupplementContextRecords([record, { ...record, name: 'Another medicine' }, { ...record, name: 'Third medicine' }], { maxChars: 400 });
    expect(result[0]).toMatchObject({ name: 'Example medicine', furtherDetailsStored: true });
    expect(result.at(-1)).toHaveProperty('moreTherapyRecordsStored');
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(400);
  });
});

it('retains a legacy undated dose without inventing historical amounts', () => {
  const legacy = { name: 'Legacy medicine', currentDose: { value: 25, unit: 'mg', basis: 'dose' }, startDate: '2026-01-01' };
  for (const context of [buildSupplementAIContext([legacy]), JSON.stringify(buildCompactSupplementContextRecords([legacy]))]) {
    expect(context).toContain('undatedDoseSnapshot');
    expect(context).toContain('25 mg/dose');
    expect(context).toContain('dose not recorded');
  }
});

describe('therapy selection never hides a dated medication course', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());
  // Fictional medication; one record per dose change, as users commonly log titrations.
  const course = (dose: string, start: string, end: string | null, note = ''): SupplementRecord => ({
    name: `Zentarol ${dose}`, type: 'medication', genericName: 'zentarolum', note,
    periods: [{ start, end, dose: `${dose}/day` }],
  });
  const inventory = (): SupplementRecord[] => [
    ...Array.from({ length: 12 }, (_, i): SupplementRecord => ({
      name: `Daily supplement ${i + 1}`, type: 'supplement', periods: [{ start: '2025-07-01', end: null }],
      ingredients: [{ name: `Nutrient ${i + 1}`, amount: '100 mg' }],
    })),
    course('10 mg', '2026-01-10', '2026-03-31'),
    course('20 mg', '2026-04-01', '2026-04-30'),
    course('30 mg', '2026-06-01', '2026-07-31', 'restarted after a planned pause'),
    course('40 mg', '2026-08-01', null),
    ...Array.from({ length: 4 }, (_, i): SupplementRecord => ({ name: `Old course ${i + 1}`, type: 'supplement', periods: [{ start: '2024-01-01', end: '2024-06-01' }] })),
  ];
  const historyRange = { start: '2025-10-01', end: '2026-10-15' };

  it.each([
    'What could explain my recent blood results?',
    'najprv si precitaj kompletnu evidenciu brania zentarolu s poznamkami',
    'zentarol 30 bol od 1.6.2026',
  ])('keeps every course of a titrated medication with its dates for: %s', queryText => {
    const records = inventory();
    const mode = resolveSupplementContextMode(queryText, records);
    const context = buildSupplementAIContext(records, { mode, queryText, inventorySupplements: records, historyRange });
    for (const dates of ['2026-01-10→2026-03-31', '2026-04-01→2026-04-30', '2026-06-01→2026-07-31', '2026-08-01→ongoing']) {
      expect(context).toContain(dates);
    }
    for (const dose of ['10 mg/day', '20 mg/day', '30 mg/day', '40 mg/day']) expect(context).toContain(dose);
    expect(context).toContain('Never fill a gap in a therapy timeline by assumption');
    expect(context).not.toContain('outside this prompt projection');
  });

  it('opens detail for inflected, diacritic-free and Slovak therapy questions', () => {
    const records = inventory();
    for (const query of ['kompletnu evidenciu brania zentarolu', 'zentarol 30 bol od 1.6.2026', 'zentarolum', 'aké lieky a doplnky beriem?', 'dávkovanie tabliet']) {
      expect(resolveSupplementContextMode(query, records)).toBe('detail');
    }
    expect(resolveSupplementContextMode('How was my sleep last week?', records)).toBe('compact');
    expect(resolveSupplementContextMode('Ako som spal minulý týždeň?', records)).toBe('compact');
  });

  it('includes medication notes in detail and lists every omitted record by name and dates', () => {
    const records = inventory();
    const detail = buildSupplementAIContext(records, { mode: 'detail', queryText: 'zentarolu', inventorySupplements: records, historyRange });
    expect(detail).toContain('restarted after a planned pause');
    const tight = buildSupplementAIContext(records, { mode: 'compact', maxChars: 2200, inventorySupplements: records, historyRange });
    expect(tight.length).toBeLessThanOrEqual(2200);
    expect(tight).toMatch(/Therapy records in this prompt: \d+ of 20 with dose detail; \d+ listed below by name and dates only/u);
    expect(tight).toContain('Zentarol 30 mg');
    expect(tight).toContain('2026-06-01→2026-07-31');
  });

  it('discloses partial therapy coverage in the response receipt', () => {
    const records = inventory();
    const tight = buildSupplementAIContext(records, { mode: 'compact', maxChars: 2200, inventorySupplements: records, historyRange });
    const full = buildSupplementAIContext(records, { mode: 'compact', maxChars: 20000, inventorySupplements: records, historyRange });
    const receipt = (ctx: string) => getContextSummary(`[section:supplements]\n## Supplements & Medications\n${ctx}[/section:supplements]\n`)[0];
    expect(receipt(tight)).toMatchObject({ label: 'Supplements & Medications', detail: expect.stringMatching(/^\d+ of 20 records detailed/u) });
    expect(receipt(full)).toEqual({ label: 'Supplements & Medications', detail: '20 records' });
  });
});
