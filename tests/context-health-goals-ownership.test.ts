import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as crypto from '../js/crypto.js';
import { createHealthGoalsSession } from '../js/context-health-goals-session.js';
import { healthGoalList, healthGoalRows } from '../js/health-goals-utils.js';
import { mergeImportedData, getConfiguredArrayItemId } from '../js/data-merge.js';
const profile = 'owned-health-goals', key = profileStorageKey(profile, 'imported');
const stored = async () => JSON.parse((await crypto.encryptedGetItem(key))!);
beforeEach(async () => { state.currentProfile = profile; state.importedData = createDefaultProfileData(); await crypto.encryptedRemoveItem(key); expect(await saveImportedData()).toBe(true); });
afterEach(() => vi.restoreAllMocks());
it('projects priorities stably without changing storage indices or unknown literal values', () => {
  const goals = [{ text: 'Low', severity: 'minor', extra: 'retained' }, { text: '<High> & text', severity: 'major' }, { text: 'Medium', severity: 'mild' }, { text: 'Legacy', severity: '<custom>' }, { text: 'Second high', severity: 'major' }];
  expect(healthGoalRows(goals).map(row => [row.index, row.priority, row.text])).toEqual([[1, 'High', '<High> & text'], [4, 'High', 'Second high'], [2, 'Medium', 'Medium'], [0, 'Low', 'Low'], [3, '<custom>', 'Legacy']]);
  expect(goals[0]).toEqual({ text: 'Low', severity: 'minor', extra: 'retained' });
  expect(healthGoalList({ goals: ' Legacy goals ', extra: 'kept' })).toEqual([{ goals: ' Legacy goals ', extra: 'kept', text: 'Legacy goals', severity: 'mild' }]);
});
it('commits successive adds/removals with history and durable deletion markers', async () => {
  const session = createHealthGoalsSession();
  expect(await session.mutate({ kind: 'add', text: '  First <goal>  ', severity: 'major' }, [])).toBe('saved');
  const old = structuredClone(state.importedData); expect(old.healthGoals[0]).toMatchObject({ text: 'First <goal>', severity: 'major' });
  expect(await session.mutate({ kind: 'add', text: 'Second', severity: 'minor' }, old.healthGoals)).toBe('saved');
  expect(await session.mutate({ kind: 'remove', index: 0 }, structuredClone(state.importedData.healthGoals))).toBe('saved');
  const removed = await stored(); expect(removed.healthGoals.map((goal: { text: string }) => goal.text)).toEqual(['Second']);
  expect(removed._deleted.healthGoals).toContain(getConfiguredArrayItemId('healthGoals', old.healthGoals[0]));
  expect(mergeImportedData(removed, old).healthGoals.map((goal: { text: string }) => goal.text)).toEqual(['Second']);
  expect(await session.mutate({ kind: 'clear' }, structuredClone(state.importedData.healthGoals))).toBe('saved');
  const cleared = await stored(); expect(cleared.healthGoals).toEqual([]); expect(cleared._deleted.healthGoals).toHaveLength(2);
  expect(cleared.changeHistory.filter((item: { field: string }) => item.field === 'healthGoals')).toEqual([expect.objectContaining({ snapshot: [] })]);
});
it('does not publish an accepted mutation until storage commits and finishes on its originating profile', async () => {
  const source = state.importedData, original = crypto.encryptedSetItem;
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(crypto, 'encryptedSetItem').mockImplementation(async (...args) => { await held; return original(...args); });
  const session = createHealthGoalsSession(), pending = session.mutate({ kind: 'add', text: 'Captured goal', severity: 'mild' }, []);
  expect(source.healthGoals).toEqual([]); expect(source.changeHistory).toEqual([]);
  expect(await session.mutate({ kind: 'add', text: 'Duplicate', severity: 'mild' }, [])).toBe('busy');
  session.retire(); state.currentProfile = 'other-goals-profile'; state.importedData = createDefaultProfileData(); state.importedData.contextNotes = 'Other profile';
  release(); expect(await pending).toBe('saved'); expect((await stored()).healthGoals[0].text).toBe('Captured goal'); expect(source.healthGoals[0]?.text).toBe('Captured goal');
  expect(state.importedData.healthGoals).toEqual([]); expect(state.importedData.contextNotes).toBe('Other profile');
  expect(await session.mutate({ kind: 'clear' }, source.healthGoals)).toBe('retired');
});
it('keeps failed mutations unpublished and supports an explicit retry', async () => {
  const session = createHealthGoalsSession(), write = vi.spyOn(crypto, 'encryptedSetItem').mockRejectedValueOnce(new Error('Storage failed'));
  const intent = { kind: 'add', text: 'Retained input', severity: 'major' } as const;
  expect(await session.mutate(intent, [])).toBe('failed'); expect(state.importedData.healthGoals).toEqual([]); expect(state.importedData.changeHistory).toEqual([]);
  write.mockRestore(); expect(await session.mutate(intent, [])).toBe('saved'); expect((await stored()).healthGoals).toHaveLength(1);
});
it('rejects goals changed in live state or inside the locked storage transaction', async () => {
  const session = createHealthGoalsSession();
  state.importedData.healthGoals = [{ text: 'Live peer', severity: 'minor' }];
  expect(await session.mutate({ kind: 'clear' }, [])).toBe('conflict'); expect(state.importedData.healthGoals[0]?.text).toBe('Live peer');
  state.importedData.healthGoals = [];
  const peer = await stored(); peer.healthGoals = [{ text: 'Stored peer', severity: 'major' }]; await crypto.encryptedSetItem(key, JSON.stringify(peer));
  expect(await session.mutate({ kind: 'add', text: 'Local', severity: 'mild' }, [])).toBe('conflict'); expect((await stored()).healthGoals).toEqual(peer.healthGoals);
});
it('retains unrelated live drafts and peer fields while preserving unknown goal metadata', async () => {
  state.importedData.healthGoals = [{ text: 'Existing', severity: 'unknown', extra: { literal: '<value>' } }]; expect(await saveImportedData()).toBe(true);
  const peer = await stored(); peer.contextNotes = 'Peer notes'; await crypto.encryptedSetItem(key, JSON.stringify(peer));
  state.importedData.stress = { note: 'Unsaved stress' };
  expect(await createHealthGoalsSession().mutate({ kind: 'add', text: 'Next', severity: 'mild' }, structuredClone(state.importedData.healthGoals))).toBe('saved');
  const saved = await stored(); expect(saved.healthGoals[0]).toMatchObject({ extra: { literal: '<value>' }, severity: 'unknown' });
  expect(saved.contextNotes).toBe('Peer notes'); expect(saved.stress).toBeNull(); expect(state.importedData.stress).toEqual({ note: 'Unsaved stress' });
});
it('rejects empty additions and invalid indices without writing history', async () => {
  const session = createHealthGoalsSession();
  expect(await session.mutate({ kind: 'add', text: '  ', severity: 'mild' }, [])).toBe('empty');
  expect(await session.mutate({ kind: 'remove', index: 2 }, [])).toBe('empty'); expect((await stored()).changeHistory).toEqual([]);
});
it('retains the original legacy goal and its metadata when the first accepted edit creates an array', async () => {
  const legacy = { goals: 'Prior goal', extra: { literal: '<retained>' } };
  (state.importedData as { healthGoals: unknown }).healthGoals = legacy; expect(await saveImportedData()).toBe(true);
  expect(await createHealthGoalsSession().mutate({ kind: 'add', text: 'New goal', severity: 'major' }, legacy)).toBe('saved');
  expect((await stored()).healthGoals).toEqual([expect.objectContaining({ text: 'Prior goal', goals: 'Prior goal', extra: { literal: '<retained>' } }), expect.objectContaining({ text: 'New goal', severity: 'major' })]);
});
it('explicitly re-adds a deleted goal and survives merging an older deletion', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1791400000000);
  const session = createHealthGoalsSession();
  expect(await session.mutate({ kind: 'add', text: 'Return to exercise', severity: 'mild' }, [])).toBe('saved');
  expect(await session.mutate({ kind: 'clear' }, structuredClone(state.importedData.healthGoals))).toBe('saved'); const deleted = await stored();
  expect(await session.mutate({ kind: 'add', text: 'Return to exercise', severity: 'major' }, [])).toBe('saved');
  const saved = await stored(); expect(saved.healthGoals).toEqual([expect.objectContaining({ text: 'Return to exercise', severity: 'major' })]);
  expect(mergeImportedData(saved, deleted).healthGoals).toEqual(saved.healthGoals);
});
