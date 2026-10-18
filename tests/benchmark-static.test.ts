import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import {BENCHMARK_NOW, CASE_NAMES, parseBenchmarkOptions, makeLabProfile, makeMeals, makeWearables, makeBenchmarkCase, makeLaboratorySeed, LABORATORY_SEED_FIELDS, assertBenchmarkParity, benchmarkMedian} from '../scripts/benchmark-static-fixtures.mjs';
import type {BenchmarkCaseName, SemanticSample} from '../scripts/benchmark-static-fixtures.mjs';

const artifactArgs = ['--baseline', 'before', '--candidate', 'after'];
const demo: unknown = JSON.parse(fs.readFileSync(new URL('../data/demo-male.json', import.meta.url), 'utf8'));
const digest = (value: string) => value.repeat(64);
function paired(name: BenchmarkCaseName = 'combined', pairs = 2): SemanticSample[] {
  return Array.from({length: pairs}, (_, pair) => (['baseline', 'candidate'] as const).map(variant => ({caseName: name, pair, variant,
    seedProfileSHA256: digest('a'), storedProfileSHA256: digest('a'), textSHA256: digest('b'), htmlSHA256: digest('c')}))).flat();
}
describe('bounded benchmark options', () => {
  it('requires explicit artifacts and normalizes known case/device names', () => {
    expect(parseBenchmarkOptions([...artifactArgs, '--cases', ' LAB40, combined ', '--device', 'DESKTOP', '--pairs', '2'])).toEqual({
      baseline: 'before', candidate: 'after', output: '.local-notes/benchmarks', cases: ['lab40', 'combined'], pairs: 2, device: 'desktop'});
    expect(parseBenchmarkOptions(artifactArgs).cases).toEqual(['empty', 'control', 'combined']);
  });
  it.each([[], ['--baseline', 'before'], [...artifactArgs, '--pairs', '0'], [...artifactArgs, '--pairs', '6'],
    [...artifactArgs, '--pairs', '1.5'], [...artifactArgs, '--cases', 'lab40,LAB40'], [...artifactArgs, '--cases', ''],
    [...artifactArgs, '--cases', 'combined,'], [...artifactArgs, '--cases', 'private-data'], [...artifactArgs, '--device', 'tablet'],
    [...artifactArgs, '--unknown', 'x'], [...artifactArgs, '--pairs'], [...artifactArgs, '--candidate', 'duplicate'],
    [...artifactArgs, '--output', '   ']].map(args => ({args})))('rejects malformed or unbounded options $args', ({args}) => {
    expect(() => parseBenchmarkOptions(args)).toThrow();
  });
});
describe('deterministic synthetic scale fixtures', () => {
  it.each([40, 120] as const)('preserves actual demo metadata/units/provenance with %i sparse panels', count => {
    const original = structuredClone(demo), profile = makeLabProfile(demo, count);
    expect(demo).toEqual(original); expect(profile).toEqual(makeLabProfile(demo, count));
    expect(profile.entries).toHaveLength(count); expect(new Set(profile.entries.map(row => row.date)).size).toBe(count);
    expect(profile.entries.at(-1)?.date).toBe('2026-10-02');
    const sizes = profile.entries.map(row => Object.keys(row.markers).length);
    expect(Math.min(...sizes)).toBeLessThan(Math.max(...sizes));
    const {entries: _entries, ...metadata} = profile;
    expect(metadata).toEqual(Object.fromEntries(Object.entries(demo as Record<string, unknown>).filter(([key]) => key !== 'entries')));
    const latest = new Map<string, number | null>();
    for (const row of [...(demo as typeof profile).entries].sort((a, b) => a.date.localeCompare(b.date)))
      for (const [key, value] of Object.entries(row.markers)) latest.set(key, value);
    for (const row of profile.entries) {
      for (const [key, value] of Object.entries(row.markers)) expect(value).toEqual(latest.get(key));
      for (const value of Object.values(row.markerSources ?? {})) {
        if (value && typeof value === 'object' && 'at' in value) expect(value.at).toBe(Date.parse(row.date + 'T00:00:00.000Z'));
      }
    }
  });
  it('makes empty genuinely empty and keeps control data unchanged', () => {
    expect(makeBenchmarkCase('empty', demo).profile).toEqual({entries: []});
    expect(makeBenchmarkCase('control', demo).profile).toEqual(makeLaboratorySeed(demo));
    expect(makeBenchmarkCase('empty', demo).initialView).toBe('dashboard');
    expect(makeBenchmarkCase('control', demo).initialView).toBe('biology-scores');
  });
  it('uses real finite mixed meal and wearable schedules with explicit missingness', () => {
    const meals = makeMeals(365), wearables = makeWearables(365);
    expect(meals).toHaveLength(1460); expect(makeMeals(1825)).toHaveLength(7300);
    expect(new Set(meals.map(row => row.id)).size).toBe(meals.length);
    expect(meals.filter(row => row.mealType === 'drink')).toHaveLength(365);
    expect(meals.some(row => !row.reviewed)).toBe(true);
    expect(meals.some(row => row.mealType !== 'drink' && !('fiberG' in row.nutrients))).toBe(true);
    expect(wearables).toHaveLength(690); expect(new Set(wearables.map(row => row.source))).toEqual(new Set(['oura', 'fitbit']));
    expect(wearables.every(row => row.importedAt === Date.parse(BENCHMARK_NOW))).toBe(true);
    expect(wearables.some(row => row.date === BENCHMARK_NOW.slice(0, 10))).toBe(false);
    expect(makeBenchmarkCase('combined', demo).profile.entries).toHaveLength(120);
    expect(makeBenchmarkCase('combined', demo).meals).toHaveLength(1460);
    expect(new Set(makeBenchmarkCase('wearable3', demo).wearables.map(row => row.source)).size).toBe(3);
    for (const name of CASE_NAMES) expect(makeBenchmarkCase(name, demo)).toEqual(makeBenchmarkCase(name, demo));
  });
  it.each([-1, 0.5, 1826, Infinity])('rejects meal fixture outside finite scope %s', days => expect(() => makeMeals(days)).toThrow());
  it.each([-1, 0.5, 1096, Infinity])('rejects wearable fixture outside finite scope %s', days => expect(() => makeWearables(days)).toThrow());
  it.each([null, {}, {entries: []}, {entries: [{date: '2026-01-01', markers: {value: NaN}}]}])('rejects malformed laboratory inputs', value => {
    expect(() => makeLabProfile(value, 40)).toThrow();
  });
});
describe('exact semantic and durable-data benchmark acceptance', () => {
  it('accepts complete exact paired owners', () => expect(() => assertBenchmarkParity(paired(), ['combined'], 2)).not.toThrow());
  it('rejects missing rows, duplicated owners, unexpected pair and variant ownership', () => {
    const base = paired();
    expect(() => assertBenchmarkParity(base.slice(1), ['combined'], 2)).toThrow('Missing measured rows');
    expect(() => assertBenchmarkParity([base[0]!, base[0]!, ...base.slice(2)], ['combined'], 2)).toThrow('Duplicate measured row');
    expect(() => assertBenchmarkParity(base.map((row, i) => i === 0 ? {...row, pair: 3} : row), ['combined'], 2)).toThrow('Missing paired owner');
  });
  it.each(['seedProfileSHA256', 'storedProfileSHA256', 'textSHA256'] as const)('rejects exact %s corruption, including whitespace/data changes', key => {
    const rows = paired(); rows[1] = {...rows[1]!, [key]: digest('d')};
    expect(() => assertBenchmarkParity(rows, ['combined'], 2)).toThrow();
  });
  it.each(['empty', 'control', 'lab40', 'lab120'] as const)('rejects any complete markup change on %s', name => {
    const rows = paired(name); rows[1] = {...rows[1]!, htmlSHA256: digest('d')};
    expect(() => assertBenchmarkParity(rows, [name], 2)).toThrow('Complete startup/Biology markup differs');
  });
  it('retains scale markup digests without substituting them for exact text/data checks', () => {
    const rows = paired(); rows[1] = {...rows[1]!, htmlSHA256: digest('d')};
    expect(() => assertBenchmarkParity(rows, ['combined'], 2)).not.toThrow();
    rows[1] = {...rows[1]!, textSHA256: digest('d')};
    expect(() => assertBenchmarkParity(rows, ['combined'], 2)).toThrow('Raw rendered text differs');
  });
  it('rejects absent or malformed receipt hashes', () => {
    const rows = paired(); rows[0] = {...rows[0]!, textSHA256: ''};
    expect(() => assertBenchmarkParity(rows, ['combined'], 2)).toThrow('Missing or invalid semantic digest');
  });
});

it('reports conventional odd/even medians without sorting input or accepting absent observations', () => {
  const observations = [9, 1, 3, 5];
  expect(benchmarkMedian(observations)).toBe(4); expect(observations).toEqual([9, 1, 3, 5]);
  expect(benchmarkMedian([9, 1, 3])).toBe(3); expect(benchmarkMedian([2])).toBe(2);
  expect(() => benchmarkMedian([])).toThrow(); expect(() => benchmarkMedian([1, NaN])).toThrow();
});

it('selects only declared lab lanes while preserving exact markers, units, references and provenance', () => {
  const original = structuredClone(demo), selected = makeLaboratorySeed(demo);
  expect(Object.keys(selected).sort()).toEqual([...LABORATORY_SEED_FIELDS].sort());
  const exported = demo as Record<string, unknown>;
  for (const field of LABORATORY_SEED_FIELDS) expect(selected[field]).toEqual(exported[field]);
  for (const field of ['sunSessions', 'deviceSessions', 'lightDevices', 'lightEnvironment', 'lightMeasurements', 'lightAudits',
    'sunDefaults', 'lifelightProfile', 'channelMixAI', 'focusCard', 'contextHealth', 'biologyScoreContextAI', '_source', 'version', 'exportedAt', 'unknownRemoteProvider']) {
    const contaminated = {...exported, [field]: {url: 'https://invalid.example', credential: 'SYNTHETIC-NOT-A-CREDENTIAL'}};
    expect(makeLaboratorySeed(contaminated)).toEqual(selected); expect(selected).not.toHaveProperty(field);
  }
  expect(selected.entries).toHaveLength(8); expect(selected.entries).toEqual((demo as typeof selected).entries);
  selected.entries[0]!.date = '2000-01-01'; expect(demo).toEqual(original);
});
