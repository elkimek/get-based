import { describe, expect, it } from 'vitest';

import {
  REPORT_DATA_SCHEMA_VERSION,
  buildReportDataSnapshot,
  formatReportDataForAgent,
} from '../js/export-report-data.js';

function reportOptions(sections = ['flagged', 'categories', 'summary', 'trends', 'supplements', 'notes', 'genetics', 'context']) {
  return {
    preset: 'full',
    presetLabel: 'Full lab report',
    dateRange: 'all',
    sections,
    categoryKeys: ['chemistry'],
  };
}

function reportInput(rangeMode = 'optimal') {
  return {
    data: {
      dates: ['2026-01-10', '2026-08-10'],
      entryContextByDate: {
        '2026-01-10': { fasting: true, sampleTime: '08:15' },
        '2026-08-10': { fasting: false, sampleTime: '14:30' },
      },
      categories: {
        chemistry: {
          label: 'Chemistry',
          markers: {
            contextual: {
              markerId: 'builtin.contextual',
              storageDotKey: 'chemistry.contextual',
              name: 'Contextual marker',
              unit: 'u',
              refMin: 0,
              refMax: 12,
              optimalMin: 2,
              optimalMax: 5,
              contextOptimalRanges: [{ min: 2, max: 5 }, { min: 4, max: 8 }],
              contextOptimalRangeLabels: ['Earlier guidance', 'Current guidance'],
              values: [6, 6],
            },
            flagged: {
              storageDotKey: 'chemistry.flagged',
              name: 'Flagged marker',
              unit: 'mg/L',
              refMin: 0,
              refMax: 15,
              optimalMin: 0,
              optimalMax: 10,
              values: [9, 12],
            },
            unrated: {
              storageDotKey: 'chemistry.unrated',
              name: 'Needs fasting',
              unit: '',
              refMin: 0,
              refMax: 20,
              contextOptimalRanges: [null, { min: null, max: null }],
              contextOptimalRangeLabels: [null, 'Requires fasting sample'],
              values: [null, 8],
            },
            hidden: {
              name: 'Internal score input',
              unit: '',
              hidden: true,
              refMin: 0,
              refMax: 1,
              values: [0.5, 0.6],
            },
          },
        },
      },
    },
    profile: {
      id: 'profile-one',
      name: 'Report Person',
      sex: 'female',
      dob: '1990-02-03',
      tags: ['runner'],
    },
    importedData: {
      entries: [
        {
          id: 'entry-earlier',
          date: '2026-01-10',
          markers: { 'chemistry.contextual': 6 },
          markerSources: { 'chemistry.contextual': { file: 'earlier.pdf', snapshotId: 'snapshot-earlier' } },
        },
        {
          id: 'entry-current',
          date: '2026-08-10',
          markers: { 'chemistry.contextual': 6 },
          markerSources: { 'chemistry.contextual': { file: 'current.pdf', snapshotId: 'snapshot-current' } },
          collectionContextSources: { sampleTime: 'snapshot-current', fasting: 'snapshot-current' },
        },
      ],
      importSnapshots: [{
        id: 'snapshot-current',
        fileName: 'current.pdf',
        markers: [{
          mappedKey: 'chemistry.contextual',
          refMin: 1,
          refMax: 9,
          unit: 'raw-u',
        }],
      }],
      notes: [{ date: '2026-08-11', text: 'Follow-up note' }],
      supplements: [{ name: 'Magnesium', ingredients: [{ name: 'Magnesium', amount: '100 mg' }] }],
      genetics: { apoe: 'E3/E4' },
      markerNotes: { 'chemistry.contextual': 'Overall marker note' },
      markerValueNotes: { 'chemistry.contextual:2026-08-10': 'Afternoon retest' },
      healthGoals: [{ severity: 'major', text: 'Improve energy' }],
      diagnoses: { conditions: [{ name: 'Condition A' }] },
      wearableSummary: { metrics: { rhr: { latest: 55 } } },
    },
    reportOptions: reportOptions(),
    contextSections: [{ title: 'Health Goals', text: '[major] Improve energy' }],
    rangeMode,
    unitSystem: 'ANZ',
    generatedAt: '2026-08-24T10:00:00.000Z',
  };
}

describe('portable report data', () => {
  it('resolves every result against its own contextual range and provenance', () => {
    const snapshot = buildReportDataSnapshot(reportInput());
    const markers = snapshot.labs.categories[0].markers;
    const contextual = markers.find(marker => marker.name === 'Contextual marker');
    const unrated = markers.find(marker => marker.name === 'Needs fasting');

    expect(snapshot.schemaVersion).toBe(REPORT_DATA_SCHEMA_VERSION);
    expect(snapshot.scope).toMatchObject({ rangeMode: 'optimal', unitSystem: 'ANZ' });
    expect(contextual.results.map(result => result.status)).toEqual(['high', 'normal']);
    expect(contextual.results[0].ranges.judging).toMatchObject({
      min: 2,
      max: 5,
      label: 'Earlier guidance',
      kind: 'optimal',
      source: 'context',
      usedForStatus: true,
    });
    expect(contextual.latestResult.ranges.judging).toMatchObject({ min: 4, max: 8, label: 'Current guidance' });
    expect(contextual.latestResult.ranges.available).toEqual(expect.arrayContaining([
      expect.objectContaining({ min: 0, max: 12, kind: 'reference' }),
      expect.objectContaining({ min: 4, max: 8, kind: 'optimal' }),
    ]));
    expect(contextual.latestResult.collectionContext).toEqual({ fasting: false, sampleTime: '14:30' });
    expect(contextual.latestResult.collectionContextSources).toEqual({
      sampleTime: 'snapshot-current',
      fasting: 'snapshot-current',
    });
    expect(contextual.latestResult.source).toEqual({
      file: 'current.pdf',
      snapshotId: 'snapshot-current',
      entryId: 'entry-current',
    });
    expect(contextual.latestResult.sourceReportedRange).toEqual({
      min: 1,
      max: 9,
      unit: 'raw-u',
      snapshotId: 'snapshot-current',
      file: 'current.pdf',
    });
    expect(contextual.note).toBe('Overall marker note');
    expect(contextual.latestResult.note).toBe('Afternoon retest');
    expect(unrated.latestResult.status).toBe('unrated');
    expect(unrated.latestResult.ranges.judging.label).toBe('Requires fasting sample');
    expect(snapshot.labs.summary).toMatchObject({
      dateCount: 2,
      categoryCount: 1,
      markerCount: 3,
      resultCount: 5,
      latestInRangeCount: 1,
      latestOutOfRangeCount: 1,
      latestUnratedCount: 1,
    });
    expect(snapshot.labs.flags).toEqual([
      expect.objectContaining({ name: 'Flagged marker', date: '2026-08-10', value: 12, status: 'high' }),
    ]);
  });

  it('keeps optimal guidance available when reference ranges judge status', () => {
    const snapshot = buildReportDataSnapshot(reportInput('reference'));
    const contextual = snapshot.labs.categories[0].markers[0];

    expect(contextual.latestResult.status).toBe('normal');
    expect(contextual.latestResult.ranges.judging).toMatchObject({ min: 0, max: 12, kind: 'reference' });
    expect(contextual.latestResult.ranges.available).toEqual(expect.arrayContaining([
      expect.objectContaining({ min: 4, max: 8, kind: 'optimal', usedForStatus: false }),
    ]));
  });

  it('projects the portable snapshot into bounded agent context without rereading app state', () => {
    const snapshot = buildReportDataSnapshot(reportInput());
    const context = formatReportDataForAgent(snapshot);

    expect(context).toContain('Profile: Report Person');
    expect(context).toContain('Lab collection context:');
    expect(context).toContain('fasting=false');
    expect(context).toContain('Latest out-of-range markers:');
    expect(context).toContain('Flagged marker: 12 mg/L high');
    expect(context).toContain('Current guidance 4-8');
    expect(context).toContain('Afternoon retest');
    expect(context).toContain('Notable trends:');
    expect(context).toContain('Magnesium');
    expect(context).toContain('Follow-up note');
    expect(context).toContain('Genetics: APOE E3/E4');
  });

  it('honors section selection and returns a detached JSON-safe value', () => {
    const input = reportInput();
    input.reportOptions = reportOptions(['notes']);
    const snapshot = buildReportDataSnapshot(input);

    expect(snapshot.labs).toBeNull();
    expect(snapshot.notes).toEqual([{ date: '2026-08-11', text: 'Follow-up note' }]);
    expect(snapshot.supplements).toEqual([]);
    expect(snapshot.genetics).toBeNull();
    expect(snapshot.context).toBeNull();
    expect(() => JSON.stringify(snapshot)).not.toThrow();

    input.importedData.notes[0].text = 'mutated later';
    input.profile.tags.push('mutated');
    expect(snapshot.notes[0].text).toBe('Follow-up note');
    expect(snapshot.profile.tags).toEqual([]);
    expect(snapshot.profile.notes).toBe('');
  });
});
