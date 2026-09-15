// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildExtraReportSections } from '../js/export-report-sections.js';
import { buildReportDataSnapshot, formatReportDataForAgent, selectReportGenomeFindings } from '../js/export-report-data.js';
import { buildReportHTML } from '../js/export-report-html.js';
import { summarizeWearables, reportDay } from '../js/export-report-aggregates.js';
const scope = { startDate: '2026-04-01', endDate: '2026-04-30', unitSystem: 'EU' };
const meal = (id, day, nutrients, source = { kind: 'manual' }) => ({ id, localDate: `2026-04-${day}`, name: `Meal ${id}`, nutrients, source });

describe('summary-first health reports', () => {
  it('uses canonical nutrients, daily totals, incomplete-day coverage, explicit zero and drink events', () => {
    const [section] = buildExtraReportSections({ nutritionMeals: [
      meal('a', '01', { energyKcal: 400, proteinG: 20, sodiumMg: 200 }),
      meal('b', '01', { energyKcal: 600, proteinG: 30 }),
      meal('c', '02', { energyKcal: 200, proteinG: 0, sodiumMg: 0 }),
      meal('water', '01', { fluidMl: 250, plainWaterMl: 250 }, { kind: 'manual-water' }),
      meal('old', '31', { energyKcal: 9999 }), // invalid April date is not an eligible day
      { ...meal('deleted', '01', { energyKcal: 99999 }), id: 'deleted' },
    ], _deleted: { nutritionMeals: ['deleted'] } }, ['nutrition'], scope);
    const rows = Object.fromEntries(section.summary.rows.map(row => [row[0], row]));
    expect(rows.Energy[1]).toBe('600 kcal');
    expect(rows.Protein[1]).toBe('25 g');
    expect(rows.Sodium[1]).toBe('0 mg');
    expect(rows.Sodium[2]).toContain('1 eligible / 2 logged days');
    expect(rows.Sodium[3]).toBe('200 mg');
    expect(rows['Beverage volume'][1]).toBe('250 mL');
    expect(rows['Plain water'][1]).toBe('250 mL');
    expect(rows.Fat[1]).toBe('Insufficient recorded values');
    expect(section.summary.note).toContain('1 undated entries');
    expect(JSON.stringify(section)).not.toContain('Meal deleted');
  });
  it('does not invent photo micronutrient coverage', () => {
    const [section] = buildExtraReportSections({ nutritionMeals: [meal('photo', '01', { energyKcal: 400, sodiumMg: 500 }, { kind: 'ai-photo-estimate' })] }, ['nutrition'], scope);
    expect(section.summary.rows.find(row => row[0] === 'Energy')[1]).toBe('400 kcal');
    expect(section.summary.rows.find(row => row[0] === 'Sodium')).toBeUndefined();
  });
  it('replaces duplicate synced readings, averages days equally and separates device sources', () => {
    const records = [
      { id: 'weight', value: 80, date: '2026-04-01', source: 'manual', kind: 'Local daily history' },
      { id: 'weight', value: 82, date: '2026-04-02', source: 'manual', kind: 'Local daily history' },
      { id: 'weight', value: 82, date: '2026-04-02', source: 'manual', kind: 'Synced latest reading' },
      { id: 'weight', value: 90, date: '2026-04-02', source: 'oura', kind: 'Synced latest reading' },
    ];
    const summary = summarizeWearables(records, scope);
    expect(summary.rows).toHaveLength(2);
    expect(summary.rows[0][4]).toBe('81; 80–82');
    expect(summary.rows[0][5]).toContain('2 days / 2 readings');
  });
  it('excludes unfinished light sessions and preserves dose compatibility and recorded flags', () => {
    const startedAt = Date.parse('2026-04-02T12:00:00Z');
    const [section] = buildExtraReportSections({ sunSessions: [
      { startedAt, endedAt: startedAt + 600000, durationMin: 10, doses: { nir_solar: 10000 } },
      { startedAt: startedAt + 86400000, endedAt: startedAt + 86400000 + 1200000, durationMin: 20, doses: { nir_solar: 20000 }, safety: { unsafeEyeExposure: true, erythemalSED: 0.3 } },
      { startedAt, durationMin: 1000 },
    ] }, ['light'], scope);
    expect(section.summary.rows[0][1]).toContain('2 completed / 2 logged days; 1 in progress');
    expect(section.summary.rows[0][2]).toContain('15 min/session');
    expect(section.summary.rows[0][3]).toContain('mean/session; 2/2 sessions');
    expect(section.summary.rows[0][4]).toContain('1 recorded eye-exposure flags');
    expect(section.summary.rows[0][4]).toMatch(/0\.30* SED/);
  });
  it('compares environmental records within the same room/method, leaving one-off methods separate', () => {
    const [section] = buildExtraReportSections({ lightMeasurements: [
      { id: 'a', roomId: 'room', tool: 'lux', capturedAt: '2026-04-01', value: 100, extra: { source: 'meter' } },
      { id: 'b', roomId: 'room', tool: 'lux', capturedAt: '2026-04-20', value: 200, extra: { source: 'meter' } },
      { id: 'c', roomId: 'room', tool: 'lux', capturedAt: '2026-04-22', value: 999, extra: { source: 'camera-estimate' } },
    ] }, ['environment'], scope);
    expect(section.summary.rows).toHaveLength(2);
    expect(section.summary.rows[0][2]).toContain('Earlier (2026-04-01): Value: 100');
    expect(section.summary.rows[0][1]).toContain('200');
    expect(section.summary.rows[1][2]).toBe('1 recorded observation');
    expect(JSON.stringify(section.summary)).not.toContain('Room not recorded');
  });
  it('omits empty room settings and opaque IDs, and never compares portable readings as one room', () => {
    const [section] = buildExtraReportSections({
      lightEnvironment: { rooms: [{ id: 'empty', name: 'Empty room' }, { id: 'named', name: 'Bedroom', cct: 2700 }] },
      lightMeasurements: [
        { id: 'a', roomId: 'room_opaque_secret', tool: 'lux', value: 20, capturedAt: '2026-04-01' },
        { id: 'b', roomId: 'different_opaque_secret', tool: 'lux', value: 80, capturedAt: '2026-04-02' },
        { id: 'c', tool: 'lux', value: 100, capturedAt: '2026-04-01' },
        { id: 'd', tool: 'lux', value: 200, capturedAt: '2026-04-20' },
        { id: 'e', tool: 'darkness', value: 0 },
        { id: 'old', roomId: 'outside_scope', tool: 'lux', value: 5, capturedAt: '2025-04-01' },
      ],
    }, ['environment'], scope);
    const text = JSON.stringify(section.summary);
    expect(text).not.toMatch(/opaque_secret|outside_scope|Empty room|Room not recorded|No earlier/);
    expect(text).toContain('Bedroom');
    expect(text).toContain('Unlinked location 1');
    expect(text).toContain('Unlinked location 2');
    const portable = section.summary.rows.find(row => row[0] === 'Light level');
    expect(portable[1]).toContain('200');
    expect(portable[2]).toBe('2 recorded observations');
    expect(section.summary.rows.find(row => row[0] === 'Sleep-light check')[1]).toContain('Value: 0');
    expect(section.summary.note).toContain('3 readings have no linked location');
  });
  it('keeps all period nutrient data in AI input, while raw records require an appendix', () => {
    const importedData = { nutritionMeals: Array.from({ length: 20 }, (_, i) => meal(`private-${i}`, String(i + 1).padStart(2, '0'), { energyKcal: i === 0 ? 1000 : 100 })) };
    const options = { preset: 'full', sections: ['nutrition'], ...scope, purpose: '<img src=x onerror=alert(1)> Questions' };
    const report = buildReportDataSnapshot({ importedData, reportOptions: options });
    const text = formatReportDataForAgent(report);
    expect(text).toContain('145 kcal');
    expect(text).not.toContain('Meal private');
    const render = extra => buildReportHTML('Fixture', 'Female', { dates: [], categories: {} }, [], [], [], [], { ...options, reportData: report, ...extra });
    const doc = new DOMParser().parseFromString(render({}), 'text/html');
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.body.textContent).toContain(options.purpose);
    expect(doc.querySelectorAll('.report-history-summary tbody tr')).toHaveLength(7);
    expect(doc.querySelector('#report-appendix')).toBeNull();
    expect(doc.body.textContent).not.toContain('Meal private');
    const detailed = new DOMParser().parseFromString(render({ appendixSections: ['nutrition'] }), 'text/html');
    expect(detailed.querySelectorAll('#report-appendix .report-history tbody tr')).toHaveLength(20);
    expect(detailed.querySelector('#report-appendix').textContent).toContain('Meal private-0');
  });

  it('does not pool modeled doses when recorded exposure settings differ', () => {
    const startedAt = Date.parse('2026-04-02T12:00:00Z');
    const [section] = buildExtraReportSections({ deviceSessions: [10, 20].map(distanceCm => ({ deviceId: 'same', mode: 'red', distanceCm, startedAt, endedAt: startedAt + 600000, durationMin: 10, doses: { pbm_red: 10000 } })) }, ['light'], scope);
    expect(section.summary.rows).toHaveLength(1);
    expect(section.summary.rows[0][3]).toBe('Exposure settings vary; doses not pooled.');
  });
  it('excludes unselected context from the builder snapshot and AI projection', () => {
    const report = buildReportDataSnapshot({
      profile: { name: 'Fixture', notes: 'PRIVATE profile note', tags: ['PRIVATE tag'] },
      importedData: { diagnoses: { note: 'PRIVATE diagnosis' } },
      contextSections: [{ title: 'Diet', text: 'Selected context' }, { title: 'Medical History', text: 'PRIVATE diagnosis' }],
      reportOptions: { sections: ['context'], contextTitles: ['Diet'] },
    });
    expect(report.context.raw).toEqual({});
    expect(JSON.stringify(report)).not.toContain('PRIVATE');
    expect(formatReportDataForAgent(report)).toContain('Selected context');
  });
  it.each(['reference', 'optimal', 'both'])('shows one lab comparison with the selected %s range status', rangeMode => {
    const data = { dates: ['2026-04-01', '2026-04-02'], categories: { chemistry: { label: 'Chemistry', markers: {
      sample: { name: 'Unique marker', values: [6, 7], unit: 'u', refMin: 1, refMax: 10, optimalMin: 3, optimalMax: 5 },
    } } } };
    const options = { sections: ['categories', 'flagged', 'summary', 'trends'], rangeMode };
    const report = buildReportDataSnapshot({ data, reportOptions: options, rangeMode });
    const doc = new DOMParser().parseFromString(buildReportHTML('Fixture', 'Female', data, [], [], [], [], { ...options, reportData: report }), 'text/html');
    expect(doc.querySelectorAll('.report-lab-summary tbody tr')).toHaveLength(1);
    expect(doc.body.textContent).toContain(`${rangeMode === 'reference' ? 0 : 1} outside the selected range`);
    expect(doc.querySelector('#report-appendix')).toBeNull();
    expect(doc.querySelector('.report-lab-summary').textContent).toContain('2026-04-01');
    if (rangeMode === 'both') expect(doc.querySelector('.report-lab-summary').textContent).toContain('Reference: normal');
  });
  it.each([
    ['risks', ['risk']], ['traits', ['trait']], ['risks-traits', ['risk', 'trait']], ['all', ['risk', 'trait', 'protective', 'unclassified']],
  ])('keeps the %s Genome selection identical in the summary, appendix and AI context', (genomeMode, tones) => {
    const findings = ['risk', 'trait', 'protective', 'unclassified'].map((tone, i) => ({ rsid: `rs${i}`, gene: `Unique_${tone}`, tone, direction: tone, genotype: 'AG', note: `${tone} interpretation`, evidence: { evidenceLabel: 'Limited', relevanceLabel: 'Contextual' }, references: [] }));
    const genetics = { source: 'Fixture', findings, snps: {}, apoe: 'PRIVATE_APOE', mtdna: { haplogroup: 'PRIVATE_LINEAGE' } };
    const options = { sections: ['genetics'], appendixSections: ['genetics'], genomeMode };
    const report = buildReportDataSnapshot({ reportOptions: options });
    report.genetics = genetics;
    expect(selectReportGenomeFindings(genetics, options).map(f => f.tone)).toEqual(tones);
    const text = formatReportDataForAgent(report);
    const doc = new DOMParser().parseFromString(buildReportHTML('Fixture', 'Female', { dates: [], categories: {} }, [], [], [], [], { ...options, reportData: report }), 'text/html');
    expect(doc.querySelectorAll('#report-genetics .genetics-table tbody tr')).toHaveLength(tones.length);
    expect(doc.querySelectorAll('#report-appendix .genetics-table tbody tr')).toHaveLength(tones.length);
    for (const tone of ['risk', 'trait', 'protective', 'unclassified']) {
      expect(doc.querySelector('#report-genetics').textContent.includes(`Unique_${tone}`)).toBe(tones.includes(tone));
      expect(text.includes(`Unique_${tone}`)).toBe(tones.includes(tone));
    }
    if (genomeMode !== 'all') {
      expect(text).not.toContain('PRIVATE_');
      expect(doc.querySelector('#report-genetics').textContent).not.toContain('PRIVATE_');
      expect(doc.querySelector('#report-appendix').textContent).not.toContain('PRIVATE_');
    }
  });
  it('rejects invalid calendar dates', () => { expect(reportDay('2026-02-30')).toBe(''); });
});
