// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { planCustomMarkerCreation, applyCustomMarkerCreation, removeCustomMarkerData, customMarkerRemovalEffects } from '../js/custom-marker-core.js';
import { mergeCustomMarkerRemovalState, planCustomMarkerRestore, reconcileCustomMarkerLifecycle, normalizeCustomMarkerLifecycle, customMarkerRemovalNeedsRebroadcast } from '../js/custom-marker-lifecycle.js';
import { mergeRestoredLabEntry } from '../js/lab-entry-restore.js';
import { mergeImportedData } from '../js/data-merge.js';
import { createDefaultProfileData, migrateProfileData } from '../js/profile.js';
import type { ProfileData } from '../types/app-state.js';

const id = 'custom:synthetic-marker-a', key = 'biochemistry.fixtureMarker_syntheticmarkera';
function fixture() {
  const data = createDefaultProfileData();
  data.customMarkers = { [key]: { markerId: id, name: 'Fixture marker', unit: 'widgets', refMin: 1, refMax: 9, categoryLabel: 'Biochemistry' } };
  data.entries = [{ date: '2026-10-20', markers: { [key]: 4, 'biochemistry.glucose': 5 }, sourceFile: 'PRIVATE_ORIGINAL.pdf', manualOriginals: { [key]: { value: 3, source: null }, 'biochemistry.glucose': { value: 6, source: null } } }];
  data.markerNotes = { [key]: 'selected', 'biochemistry.glucose': 'keep' }; data.refOverrides = { [key]: { optimalMin: 2, optimalMax: 8 } };
  data.markerValueNotes = { [key + ':2026-10-20']: 'dated selected', 'biochemistry.glucose:2026-10-20': 'keep' };
  data.manualValues = { [key + ':2026-10-20']: 4 }; data.markerLabels = { [key]: 'Display name' };
  data.markerPlacements = { [id]: { categoryKey: 'diabetes', markerKey: 'fixture' } };
  return data;
}
describe('custom marker identity and removal lifecycle', () => {
  it('plans unique canonical definitions and keeps partial optimal bounds explicit', () => {
    const data = createDefaultProfileData(), before = structuredClone(data);
    const input = { name: 'Fixture Marker', unit: '', category: 'biochemistry', refMin: null, refMax: 5, optimalMax: 4 };
    const plan = planCustomMarkerCreation(data, input, id), other = planCustomMarkerCreation(data, input, 'custom:synthetic-marker-b');
    expect(data).toEqual(before); expect(plan.markerKey).not.toBe(other.markerKey); expect(plan.markerKey.length).toBeLessThanOrEqual(128);
    applyCustomMarkerCreation(data, plan); expect(data.customMarkers[plan.markerKey]).toMatchObject({ markerId: id, unit: '', refMin: null, refMax: 5 });
    expect(data.refOverrides[plan.markerKey]).toEqual({ optimalMin: null, optimalMax: 4, optimalSource: 'manual' });
  });
  it.each([{ name: '!!!', unit: '', category: 'biochemistry' }, { name: 'Fixture', category: 'biochemistry' }, { name: 'Fixture', unit: '', category: 'toString' }, { name: 'Fixture', unit: '', category: 'biochemistry', refMin: 8, refMax: 2 }, { name: 'Fixture', unit: '', newCategory: 'Biochemistry' }])('rejects ambiguous or invalid creation %j without mutation', input => {
    const data = fixture(), before = structuredClone(data); expect(() => planCustomMarkerCreation(data, input as never, id)).toThrow(); expect(data).toEqual(before);
  });
  it('previews only selected effects and keeps sibling observations and original reports', () => {
    const data = fixture(), before = structuredClone(data), effects = customMarkerRemovalEffects(data, key);
    expect(effects).toMatchObject({ results: 1, datedNotes: 1, manualEdits: 1, emptiedSamples: 0, originalReportsKept: true }); expect(data).toEqual(before);
    removeCustomMarkerData(data, key, 200); expect(data.customMarkers[key]).toBeUndefined();
    expect(data.entries[0]!.markers).toEqual({ 'biochemistry.glucose': 5 }); expect(data.entries[0]!.sourceFile).toBe('PRIVATE_ORIGINAL.pdf');
    expect(data.entries[0]!.manualOriginals).toEqual({ 'biochemistry.glucose': { value: 6, source: null } }); expect(data.markerNotes).toEqual({ 'biochemistry.glucose': 'keep' });
    expect(data.markerValueNotes[key + ':2026-10-20']).toBeNull(); expect(data.markerPlacements[id]).toBeUndefined();
    expect(data.customMarkerLifecycle).toEqual({ [id]: { markerKey: key, deletedAt: 200, restoredAt: 0 } });
  });
  it('does not mistake built-in assay metadata for a removable marker', () => {
    const data = fixture(); data.customMarkers['biochemistry.glucose'] = { name: 'Glucose', unit: 'mmol/l' }; const before = structuredClone(data);
    expect(() => removeCustomMarkerData(data, 'biochemistry.glucose')).toThrow(); expect(data).toEqual(before);
  });
  it.each([false, true])('keeps removal intent across stale peer merges (deleted local %s)', localDeleted => {
    const stale = fixture(), deleted = structuredClone(stale); removeCustomMarkerData(deleted, key, 200);
    const inputs = [structuredClone(stale), structuredClone(deleted)];
    const merged = mergeImportedData(localDeleted ? deleted : stale, localDeleted ? stale : deleted) as ProfileData;
    expect(stale).toEqual(inputs[0]); expect(deleted).toEqual(inputs[1]);
    expect(merged.customMarkers[key]).toBeUndefined(); expect(merged.entries.every(row => !Object.hasOwn(row.markers, key))).toBe(true);
    expect(merged.markerNotes[key]).toBeUndefined(); expect(merged.markerValueNotes[key + ':2026-10-20']).toBeNull();
    expect(merged.entries.find(row => Object.hasOwn(row.markers, 'biochemistry.glucose'))?.markers['biochemistry.glucose']).toBe(5);
    expect(customMarkerRemovalNeedsRebroadcast(deleted, stale)).toBe(true); expect(customMarkerRemovalNeedsRebroadcast(deleted, merged)).toBe(false);
  });
  it('restores an explicitly imported old backup but preserves unrelated removal history', () => {
    const backup = fixture(), data = structuredClone(backup); removeCustomMarkerData(data, key, 9e12);
    data.customMarkerLifecycle = { ...(data.customMarkerLifecycle as object), 'custom:other': { markerKey: 'custom.other', deletedAt: 300, restoredAt: 0 } };
    const restore = planCustomMarkerRestore(data, backup, 1000); expect(restore.at).toBeGreaterThan(9e12);
    data.customMarkers = structuredClone(backup.customMarkers); data.entries[0] = mergeRestoredLabEntry(data.entries[0]!, backup.entries[0]!, restore.at) as typeof data.entries[number];
    data.customMarkerLifecycle = restore.lifecycle; reconcileCustomMarkerLifecycle(data);
    expect(data.customMarkers[key]).toEqual(backup.customMarkers[key]); expect(data.entries[0]!.markers[key]).toBe(4);
    expect(restore.lifecycle['custom:other']).toEqual({ markerKey: 'custom.other', deletedAt: 300, restoredAt: 0 });
    const peer = mergeCustomMarkerRemovalState(data, backup, structuredClone(data)); expect(peer.customMarkers[key]).toBeDefined();
    removeCustomMarkerData(data, key, 10); expect((data.customMarkerLifecycle as Record<string, {deletedAt:number}>)[id]!.deletedAt).toBeGreaterThan(restore.at);
  });
  it('refuses conflicting imported storage identities before any mutation', () => {
    const data = fixture(), incoming = fixture(); incoming.customMarkers[key]!.markerId = 'custom:different'; const before = structuredClone(data);
    expect(() => planCustomMarkerRestore(data, incoming)).toThrow(/different identity/); expect(data).toEqual(before);
  });
  it('does not let a different imported identity reuse a retired storage key', () => {
    const local = fixture(), incoming = fixture(); removeCustomMarkerData(local, key, 200); incoming.customMarkers[key]!.markerId = 'custom:different'; const before = structuredClone(local);
    expect(() => planCustomMarkerRestore(local, incoming)).toThrow(/different retained identity/); expect(local).toEqual(before);
  });
  it('validates every retained identity before applying any reconciliation', () => {
    const data = fixture(); data.customMarkers['custom.conflict'] = { markerId: 'custom:new', name: 'Keep new', unit: '' };
    data.customMarkerLifecycle = { [id]: { markerKey: key, deletedAt: 100, restoredAt: 0 }, 'custom:old': { markerKey: 'custom.conflict', deletedAt: 100, restoredAt: 0 } }; const before = structuredClone(data);
    expect(() => reconcileCustomMarkerLifecycle(data)).toThrow(/identities/); expect(data).toEqual(before);
  });
  it('keeps corrupt removal history and original marker data available during native recovery loads', () => {
    const data = fixture(), raw = { foreign: { preserve: true } }; data.customMarkerLifecycle = raw;
    expect(() => migrateProfileData(data)).not.toThrow(); expect(data.customMarkerLifecycle).toEqual(raw);
    expect(data.entries[0]!.markers[key]).toBe(4); expect(data.customMarkers[key]).toMatchObject({ markerId: id, name: 'Fixture marker' });
  });
  it.each([[], { bad: {} }, { [id]: { markerKey: 'biochemistry.glucose', deletedAt: 1, restoredAt: 0 } }, { [id]: { markerKey: key, deletedAt: NaN, restoredAt: 0 } }])('rejects malformed removal state %j atomically', life => {
    const data = fixture(); data.customMarkerLifecycle = life; const before = structuredClone(data);
    expect(() => normalizeCustomMarkerLifecycle(life)).toThrow(); expect(() => reconcileCustomMarkerLifecycle(data)).toThrow(); expect(data).toEqual(before);
  });
});
