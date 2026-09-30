import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseClueCycleJson, parseDripCycleCsv, parseNaturalCyclesCsv, parseNaturalCyclesCsvBundle } from '../js/cycle-import-adapters.js';
import { recentCyclePeriods, stitchCyclePeriodsFromObservations, upgradeMenstrualCycleProfile } from '../js/cycle-summary.js';

const cycleFixture = (name: string) => readFileSync(new URL(`./spike-fixtures/${name}`, import.meta.url), 'utf8');
const DRIP_NATIVE_CSV = cycleFixture('cycle-drip-native.csv');
const NATURAL_CYCLES_CSV = cycleFixture('cycle-natural-cycles.csv');
const CLUE_BACKUP: unknown = JSON.parse(cycleFixture('cycle-clue-backup.json'));

describe('cycle summaries and import adapters', () => {
  it('stitches bleeding observations into compact period episodes', () => {
    const periods = stitchCyclePeriodsFromObservations([
      { source: 'drip', date: '2026-01-01', bleeding: { flow: 'light' }, symptoms: ['Cramps'] },
      { source: 'drip', date: '2026-01-02', bleeding: { flow: 'heavy' }, symptoms: ['Fatigue'] },
      { source: 'drip', date: '2026-01-03', bleeding: { flow: 'heavy' }, symptoms: ['Cramps'] },
      { source: 'drip', date: '2026-01-07', bleeding: { flow: 'moderate', excluded: true } },
      { source: 'drip', date: '2026-02-01', bleeding: { flow: 'moderate' } },
    ], {
      source: 'drip',
      importId: 'drip-2026-07-08',
      updatedAt: '2026-07-08T00:00:00.000Z',
    });

    expect(periods).toHaveLength(2);
    expect(periods[0]).toMatchObject({
      startDate: '2026-01-01',
      endDate: '2026-01-03',
      flow: 'heavy',
      source: 'drip',
      confidence: 'observed',
      importId: 'drip-2026-07-08',
    });
    expect(periods[0]!.symptoms).toEqual(['Cramps', 'Fatigue']);
    expect(periods[1]!.startDate).toBe('2026-02-01');
  });

  it('keeps spotting raw without using it as cycle day one', () => {
    const periods = stitchCyclePeriodsFromObservations([
      { source: 'drip', date: '2026-01-01', bleeding: { flow: 'spotting' } },
      { source: 'drip', date: '2026-01-02', bleeding: { flow: 'light' } },
      { source: 'drip', date: '2026-01-03', bleeding: { flow: 'spotting' } },
      { source: 'drip', date: '2026-02-01', bleeding: { flow: 'spotting' } },
    ], { source: 'drip' });

    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({
      startDate: '2026-01-02',
      endDate: '2026-01-02',
      flow: 'light',
    });
  });

  it('upgrades legacy menstrualCycle data into a compact schema v2 summary', () => {
    const endDateFor = (startDate: string) => {
      const d = new Date(startDate + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 4);
      return d.toISOString().slice(0, 10);
    };
    const periods = [
      '2025-07-01', '2025-07-30', '2025-08-28', '2025-09-27',
      '2025-10-27', '2025-11-26', '2025-12-26', '2026-01-25',
      '2026-02-24', '2026-03-27', '2026-04-27', '2026-05-28',
      '2026-06-29',
    ].map((startDate, idx) => ({
      startDate,
      endDate: endDateFor(startDate),
      flow: idx % 5 === 0 ? 'heavy' : 'moderate',
      symptoms: ['Cramps'],
    }));

    const upgraded = upgradeMenstrualCycleProfile({
      cycleLength: 28,
      periodLength: 5,
      regularity: 'regular',
      flow: 'moderate',
      periods,
    }, { now: '2026-07-08T00:00:00.000Z' });

    expect(upgraded!.schemaVersion).toBe(2);
    expect(upgraded!.coverage.periodCount).toBe(13);
    expect(upgraded!.coverage.observationCount).toBe(0);
    expect(upgraded!.coverage.sources.manual!.periods).toBe(13);
    expect(upgradeMenstrualCycleProfile(upgraded)!.coverage.sources.manual!.periods).toBe(13);
    expect(upgraded!.historySummary.recent12.avgCycle).toBeGreaterThanOrEqual(29);
    expect(upgraded!.historySummary.recent12.range).toEqual([29, 32]);
    expect(upgraded!.historySummary.allTime.periodCount).toBe(13);
    expect(recentCyclePeriods(upgraded, 12)).toHaveLength(12);
    expect(JSON.stringify(upgraded)).not.toContain('daily-observations');
  });

  it('parses Drip CSV exports into observations and derived periods', () => {
    const parsed = parseDripCycleCsv([
      'date,bleeding,symptoms,temperature,mucus,ovulation,note',
      '2026-02-01,2,"Cramps; Fatigue",98.2,egg white,negative,start',
      '2026-02-02,4,Cramps,98.0,sticky,,heavy day',
      '2026-02-07,0,,97.8,,,no bleed',
    ].join('\n'), 'drip.csv');

    expect(parsed!.source).toBe('drip');
    expect(parsed!.observations).toHaveLength(3);
    expect(parsed!.observations[0]!.bleeding!.flow).toBe('light');
    expect(parsed!.observations[0]!.bbtC).toBeCloseTo(36.78, 2);
    expect(parsed!.periods).toHaveLength(1);
    expect(parsed!.periods[0]).toMatchObject({
      startDate: '2026-02-01',
      endDate: '2026-02-02',
      flow: 'heavy',
      source: 'drip',
    });
  });

  it('parses native Drip dotted columns, exclusions, and symptom booleans', () => {
    const parsed = parseDripCycleCsv(DRIP_NATIVE_CSV, 'drip-export.csv');

    expect(parsed!.observations.map(row => row.bleeding!.flow)).toEqual([
      'light', 'heavy', 'moderate', 'spotting',
    ]);
    expect(parsed!.observations[0]).toMatchObject({
      bbtC: 36.61,
      symptoms: ['Cramps', 'Fatigue'],
      note: 'start',
    });
    expect(parsed!.observations[1]).toMatchObject({
      bbtC: 36.72,
      bbtExcluded: true,
      symptoms: ['Headache'],
      cervicalMucus: { quality: 'eggwhite / stretchy' },
    });
    expect(parsed!.observations[2]!.bleeding!.excluded).toBe(true);
    expect(parsed!.periods).toHaveLength(1);
    expect(parsed!.periods[0]).toMatchObject({
      startDate: '2026-02-01',
      endDate: '2026-02-02',
      flow: 'heavy',
      symptoms: ['Cramps', 'Fatigue', 'Headache'],
    });
  });

  it('parses Natural Cycles daily CSV exports and merges archive CSV bundles', () => {
    const parsed = parseNaturalCyclesCsv(NATURAL_CYCLES_CSV, 'tracking_data.csv');
    expect(parsed).toMatchObject({ source: 'natural_cycles', sourceLabel: 'Natural Cycles' });
    expect(parsed!.observations).toHaveLength(5);
    expect(parsed!.warnings).toEqual([]);
    expect(parsed!.observations[0]).toMatchObject({
      bbtC: 36.4,
      bleeding: { flow: 'light', excluded: false },
      symptoms: ['Fatigue', 'Cramps'],
    });
    expect(parsed!.observations[2]).toMatchObject({
      bleeding: { flow: 'spotting', excluded: true, intermenstrual: true },
      ovulationTest: 'positive',
      cervicalMucus: { quality: 'egg white' },
    });
    expect(parsed!.periods.map(period => period.startDate)).toEqual(['2026-05-01', '2026-06-01']);

    const bundled = parseNaturalCyclesCsvBundle([
      { name: 'profile.csv', text: 'setting,value\nlocale,en' },
      { name: 'exports/tracking_data.csv', text: NATURAL_CYCLES_CSV },
    ], 'natural-cycles-export.zip');
    expect(bundled).toMatchObject({
      source: 'natural_cycles',
      sourceFile: 'natural-cycles-export.zip',
      detectedRange: { firstDate: '2026-05-01', lastDate: '2026-06-01' },
    });
    expect(bundled!.observations).toHaveLength(5);
    expect(bundled!.periods).toHaveLength(2);
  });

  it('parses Clue daily JSON exports with flow, symptoms, BBT, and fertility signs', () => {
    const parsed = parseClueCycleJson(CLUE_BACKUP, 'ClueBackup.json');

    expect(parsed).toMatchObject({ source: 'clue', sourceLabel: 'Clue' });
    expect(parsed!.observations).toHaveLength(5);
    expect(parsed!.warnings).toEqual([]);
    expect(parsed!.observations[0]).toMatchObject({
      bbtC: 36.41,
      bleeding: { flow: 'light', excluded: false },
      symptoms: ['Cramps', 'Sensitive'],
    });
    expect(parsed!.observations[1]!.symptoms).toEqual(['Headache', 'Fatigue']);
    expect(parsed!.observations[2]!.bleeding).toMatchObject({
      flow: 'spotting',
      excluded: true,
      intermenstrual: true,
    });
    expect(parsed!.observations[3]).toMatchObject({
      cervicalMucus: { quality: 'egg_white' },
      ovulationTest: 'positive',
    });
    expect(parsed!.periods.map(period => period.startDate)).toEqual(['2026-07-01', '2026-08-01']);
  });

  it('only warns when tracked observations do not produce a period', () => {
    const parsed = parseClueCycleJson({
      source: 'Clue',
      data: [{ day: '2026-09-01', temperature: 36.5, pain: ['cramps'] }],
    }, 'ClueBackup.json');

    expect(parsed!.periods).toEqual([]);
    expect(parsed!.warnings).toEqual([
      'Clue includes tracked cycle observations, but no periods were detected.',
    ]);
  });

  it('keeps menstrual flow when Clue or Natural Cycles also marks spotting that day', () => {
    const natural = parseNaturalCyclesCsv([
      'Date,Temperature,Period,Period Flow,Spotting,Cycle Day',
      '2026-09-01,36.5,true,heavy,true,1',
    ].join('\n'), 'natural-cycles-tracking-data.csv');
    const clue = parseClueCycleJson({
      source: 'Clue',
      data: [{ day: '2026-09-01', period: 'heavy', spotting: true }],
    }, 'ClueBackup.json');

    expect(natural!.observations[0]!.bleeding).toEqual({ flow: 'heavy', excluded: false });
    expect(clue!.observations[0]!.bleeding).toEqual({ flow: 'heavy', excluded: false });
  });

  it('parses an eight-year daily Drip export without expanding the compact period model', () => {
    const rows = ['date,bleeding,temperature'];
    const cursor = new Date('2018-01-01T00:00:00Z');
    const end = new Date('2025-12-31T00:00:00Z');
    while (cursor <= end) {
      const date = cursor.toISOString().slice(0, 10);
      rows.push(`${date},${cursor.getUTCDate() <= 5 ? 2 : 0},36.5`);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const parsed = parseDripCycleCsv(rows.join('\n'), 'drip-eight-years.csv');
    expect(parsed!.observations.length).toBeGreaterThan(2900);
    expect(parsed!.periods).toHaveLength(96);
    expect(JSON.stringify(parsed!.periods).length).toBeLessThan(30000);
  });
});
