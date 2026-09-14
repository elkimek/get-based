// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { prepareImportCommit } from '../js/import-commit-validation.js';
import { mergeLabEntry } from '../js/data-merge-lab-entries.js';
import { mergeRestoredLabEntry } from '../js/lab-entry-restore.js';
import { migrateProfileData } from '../js/profile-data-migrations.js';

const date = '2026-01-01';
const key = 'biochemistry.glucose';
const row = { matched: true, mappedKey: key, value: 5, unit: 'mmol/l' };
it.each([null, undefined, NaN, Infinity, '5'])('blocks invalid numeric value %s without mutating the draft', value => {
  const draft = { date, markers: [{ ...row, value }] };
  expect(prepareImportCommit(draft, new Set()).error).toContain('numeric value');
  expect(draft.markers[0].value).toBe(value);
});
it('accepts zero and allows explicit exclusion of an invalid row', () => {
  const result = prepareImportCommit({ date, markers: [{ ...row, value: 0 }, { ...row, value: null }] }, new Set([1]));
  expect(result.error).toBeNull();
  expect(result.markers[0].value).toBe(0);
});
it('detects collisions between canonical insulin and its aliases', () => {
  const markers = ['diabetes.insulin', 'hormones.insulin'].map(mappedKey => ({ ...row, mappedKey }));
  expect(prepareImportCommit({ date, markers }, new Set()).error).toContain('same marker');
});
it.each(['2026-02-30', '', 'invalid'])('rejects invalid date %s', date => {
  expect(prepareImportCommit({ date, markers: [row] }, new Set()).error).toContain('valid collection date');
});
it('converts custom values and ranges to the established unit, preserving raw report data', () => {
  const marker = { matched: false, suggestedKey: 'custom.analyte', value: 1, unit: 'g/l', refMin: 0.5, refMax: 2 };
  const result = prepareImportCommit({ date, markers: [marker] }, new Set(), { 'custom.analyte': { unit: 'mg/l' } });
  expect(result.markers[0]).toMatchObject({ value: 1000, unit: 'mg/l', refMin: 500, refMax: 2000 });
  expect(marker).toMatchObject({ value: 1, unit: 'g/l' });
  expect(prepareImportCommit({ date, markers: [marker] }, new Set(), { 'custom.analyte': { unit: 'mmol/l' } }).error).toContain('cannot be converted');
});
it('keeps specialty urine magnesium separate from an existing blood magnesium value', () => {
  const customKey = 'metabolomixNutrientElements.magnesium';
  const data = migrateProfileData({ entries: [{ date, markers: { [customKey]: 123, 'electrolytes.magnesium': 0.9 } }], customMarkers: { [customKey]: { name: 'Magnesium (Urine)', unit: 'mcg/g creatinine', categoryLabel: 'Metabolomix+: Nutrient Elements', group: 'Metabolomix+' } } });
  expect(data.entries[0].markers).toEqual({ [customKey]: 123, 'electrolytes.magnesium': 0.9 });
  expect(data.customMarkers[customKey].unit).toBe('mcg/g creatinine');
});
it('preserves an identical value source in either merge direction but respects explicit manual sources and different values', () => {
  const imported = { date, updatedAt: 100, markers: { [key]: 5 }, markerSources: { [key]: { snapshotId: 'report', file: 'lab.pdf', at: 100 } } };
  const incomplete = { date, updatedAt: 200, markers: { [key]: 5 } };
  for (const merged of [mergeLabEntry(imported, incomplete), mergeLabEntry(incomplete, imported)]) {
    expect(merged.markerSources[key]).toMatchObject({ snapshotId: 'report', at: 200 });
  }
  const manual = { ...incomplete, markerSources: { [key]: { file: null, at: 200 } } };
  expect(mergeLabEntry(imported, manual).markerSources[key]).toEqual(manual.markerSources[key]);
  expect(mergeLabEntry(imported, { ...incomplete, markers: { [key]: 6 } }).markerSources).toBeUndefined();
  expect(mergeLabEntry(imported, { ...incomplete, markerSources: { [key]: null } }).markerSources[key]).toBeNull();
  expect(mergeLabEntry(imported, { date, deletedMarkers: { [key]: 300 } }).markers[key]).toBeUndefined();
});
it('restores supplied values without losing unrelated markers or collection metadata', () => {
  const current = { date, updatedAt: 100, markers: { [key]: 5, 'biochemistry.alt': 0.5 }, context: { fasting: true }, deletedMarkers: { 'biochemistry.ast': 100 } };
  const restored = mergeRestoredLabEntry(current, { date, markers: { [key]: 6 }, context: { sampleTime: '08:00' } }, 300);
  expect(restored.markers).toEqual({ [key]: 6, 'biochemistry.alt': 0.5 });
  expect(restored.context).toEqual({ fasting: true, sampleTime: '08:00' });
  expect(restored.deletedMarkers).toEqual(current.deletedMarkers);
});

it('round trips report timestamps and canonicalizes restored insulin aliases', () => {
  const restored = mergeRestoredLabEntry({ date, markers: {} }, {
    date, markers: { 'hormones.insulin': 8 }, markerSources: { 'hormones.insulin': { at: 100, snapshotId: 'report', file: 'lab.pdf' } },
  }, 300);
  expect(restored.markers['diabetes.insulin']).toBe(8);
  expect(restored.markers['hormones.insulin']).toBeUndefined();
  expect(restored.markerSources['diabetes.insulin']).toEqual({ at: 100, snapshotId: 'report', file: 'lab.pdf' });
});
