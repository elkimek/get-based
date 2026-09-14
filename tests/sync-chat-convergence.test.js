import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { state } from '../js/state.js';
import { applyChatData, chatDataNeedsRebroadcast } from '../js/sync-chat-apply.js';
import { collectChatData } from '../js/sync-payload-collectors.js';
import { chatHasLocalChanges, mergeChatData } from '../js/sync-chat-merge.js';
import { buildSyncPayload, parseSyncPayload } from '../js/sync-payload.js';
import { configureSyncReconcile, reconcileLocalStorageWithEvolu } from '../js/sync-reconcile.js';
import { configureSyncPush, pushProfile } from '../js/sync-push.js';
import { configureSyncDelta } from '../js/sync-delta.js';
import { maybeScheduleRebroadcast } from '../js/sync-pull-rebroadcast.js';
import { resetSyncStatus } from '../js/sync-state.js';

const profileId = 'chat-regression';
const key = `labcharts-${profileId}-chat-threads`;
const deletedKey = `labcharts-${profileId}-chat-deleted-threads`;
const bodyKey = id => `labcharts-${profileId}-chat-t_${id}`;
const oldDate = '2026-09-01T12:00:00.000Z';
const newDate = '2026-09-12T12:00:00.000Z';
const thread = (id, updatedAt = oldDate, messageCount = 1) => ({ id, updatedAt, messageCount });
const payload = id => ({ threads: [thread(id)], messages: { [id]: [{ role: 'user', content: id }] } });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear(); sessionStorage.clear(); resetSyncStatus();
  state.currentProfile = profileId; state.importedData = {};
  configureSyncDelta({ getEvolu: () => null, getItemRowQuery: () => null });
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); });

function configureReplica(chatData) {
  let row = { id: 'replica-row', profileId, dataJson: JSON.stringify({ _v: 4, chatData }), syncedAt: oldDate };
  const evolu = {
    getQueryRows: () => [row],
    update: (_table, next, { onComplete }) => { row = { ...row, ...next }; onComplete(); },
  };
  const deps = { getEvolu: () => evolu, getProfileQuery: () => ({}), isSyncEnabled: () => true, getProfiles: () => [{ id: profileId }] };
  configureSyncPush({ ...deps, isPhase2CutoverEnabled: () => false });
  configureSyncReconcile({ ...deps, pushProfile });
  return async () => (await parseSyncPayload(row.dataJson)).chatData;
}

test('startup republishes a chat-only union for a third device, then becomes a no-op', async () => {
  await applyChatData(profileId, payload('a'));
  const remote = payload('b');
  const readRelay = configureReplica(remote);
  await applyChatData(profileId, remote);
  expect(await chatDataNeedsRebroadcast(profileId, remote)).toBe(true);
  await reconcileLocalStorageWithEvolu();
  const union = await readRelay();
  expect(union.threads.map(t => t.id).sort()).toEqual(['a', 'b']);
  expect(await chatDataNeedsRebroadcast(profileId, union)).toBe(false);
  localStorage.clear();
  await applyChatData(profileId, union);
  expect((await collectChatData(profileId)).threads.map(t => t.id).sort()).toEqual(['a', 'b']);
});

test('an empty device push preserves remote messages and deletion records', async () => {
  const remote = { ...payload('remote'), deletedThreads: { removed: Date.parse(newDate) } };
  const readRelay = configureReplica(remote);
  expect(await pushProfile(profileId, {})).toMatchObject({ ok: true });
  expect(await readRelay()).toMatchObject(remote);
});

test('local deletion-only state is reconciled and prevents a stale outbound thread resurrection', async () => {
  localStorage.setItem(deletedKey, JSON.stringify({ a: Date.parse(newDate) }));
  const readRelay = configureReplica(payload('a'));
  await reconcileLocalStorageWithEvolu();
  expect(await readRelay()).toMatchObject({ threads: [], messages: {}, deletedThreads: { a: Date.parse(newDate) } });
});

test('all 201 deletion markers survive pulls and prevent old threads returning', async () => {
  const base = Date.parse(newDate);
  const deletions = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`deleted-${i}`, base + i]));
  localStorage.setItem(deletedKey, JSON.stringify(deletions));
  await applyChatData(profileId, { threads: [], messages: {} });
  expect(JSON.parse(localStorage.getItem(deletedKey))).toEqual(deletions);
  await applyChatData(profileId, payload('deleted-0'));
  expect((await collectChatData(profileId)).threads).toEqual([]);
});

test('missing and malformed bodies recover without giving old messages the new metadata clock', async () => {
  await applyChatData(profileId, { threads: [thread('partial', newDate)], messages: {} });
  localStorage.setItem(bodyKey('partial'), '{invalid');
  await applyChatData(profileId, payload('partial'));
  expect(JSON.parse(localStorage.getItem(bodyKey('partial')))[0].content).toBe('partial');
  expect(JSON.parse(localStorage.getItem(key))[0]).toMatchObject({ updatedAt: newDate, messagesUpdatedAt: oldDate });
  await applyChatData(profileId, { threads: [thread('partial', newDate)], messages: { partial: [{ role: 'user', content: 'actual newer body' }] } });
  expect(JSON.parse(localStorage.getItem(bodyKey('partial')))[0].content).toBe('actual newer body');
});

test('newer explicit clears and thread tombstones never recover stale messages', async () => {
  const cleared = { threads: [{ ...thread('a', newDate, 0), messagesUpdatedAt: newDate }], messages: {} };
  expect(mergeChatData(cleared, payload('a')).messages.a).toEqual([]);
  const explicitEmpty = { threads: [thread('a', newDate)], messages: { a: [] } };
  expect(mergeChatData(explicitEmpty, payload('a')).messages.a).toEqual([]);
  const restoredShell = { threads: [thread('a', newDate)], messages: {}, deletedThreads: { a: Date.parse(oldDate) + 1 } };
  expect(mergeChatData(restoredShell, payload('a')).messages.a).toBeUndefined();
});

test('message-write failure leaves previous metadata available for retry', async () => {
  await applyChatData(profileId, payload('a'));
  const before = localStorage.getItem(key);
  const realSet = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (key === bodyKey('a')) throw new Error('quota');
    realSet(key, value);
  });
  await expect(applyChatData(profileId, { threads: [thread('a', newDate)], messages: { a: [{ role: 'user', content: 'new body' }] } })).rejects.toThrow('quota');
  expect(localStorage.getItem(key)).toBe(before);
});

test('deletion-record write failure leaves the thread and messages intact', async () => {
  await applyChatData(profileId, payload('a'));
  const realSet = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (key === deletedKey) throw new Error('quota');
    realSet(key, value);
  });
  await expect(applyChatData(profileId, { threads: [], deletedThreads: { a: Date.parse(newDate) } })).rejects.toThrow('quota');
  expect(JSON.parse(localStorage.getItem(key))).toHaveLength(1);
  expect(localStorage.getItem(bodyKey('a'))).not.toBeNull();
});

test('same-time conflicts converge in either order without selection or key-order push loops', () => {
  const a = payload('a');
  const b = { ...payload('a'), messages: { a: [{ role: 'user', content: 'different edit' }] } };
  const merged = mergeChatData(a, b);
  expect(mergeChatData(b, a)).toEqual(merged);
  expect(chatHasLocalChanges(merged, merged)).toBe(false);
  expect(chatHasLocalChanges({ ...merged, activePersonality: 'one' }, { ...merged, activePersonality: 'two' })).toBe(false);
  const nested = { ...a, messages: { a: [{ content: 'same', metadata: { a: 1, b: [2, 3] } }] } };
  const reordered = { ...a, messages: { a: [{ metadata: { b: [2, 3], a: 1 }, content: 'same' }] } };
  expect(chatHasLocalChanges(nested, reordered)).toBe(false);
  expect(chatHasLocalChanges(reordered, nested)).toBe(false);
});

test('inactive-profile chat repair reads that profile at send time', async () => {
  state.currentProfile = 'different-profile'; state.importedData = { notes: ['wrong profile'] };
  const read = vi.fn(async () => ({ notes: ['right profile'] }));
  const push = vi.fn();
  expect(maybeScheduleRebroadcast({ profileId, needsRebroadcast: true, readProfileData: read, pushProfile: push })).toBe(true);
  await vi.advanceTimersByTimeAsync(100);
  expect(push).toHaveBeenCalledWith(profileId, { notes: ['right profile'] });
});

test('outbound payload merges chat without changing local storage before the pull', async () => {
  await applyChatData(profileId, payload('a'));
  const wire = await buildSyncPayload(profileId, {}, payload('b'));
  expect((await parseSyncPayload(wire)).chatData.threads).toHaveLength(2);
  expect((await collectChatData(profileId)).threads).toHaveLength(1);
});

test('a corrupted index cannot discard deletion evidence during recovery', async () => {
  localStorage.setItem(key, '{broken index');
  localStorage.setItem(deletedKey, JSON.stringify({ a: Date.parse(newDate) }));
  await applyChatData(profileId, payload('a'));
  expect((await collectChatData(profileId)).threads).toEqual([]);
  expect(JSON.parse(localStorage.getItem(deletedKey))).toEqual({ a: Date.parse(newDate) });
});

test('a later rename cannot override a newer message edit or clear', () => {
  const renamed = { threads: [{ ...thread('a', '2026-09-14T12:00:00Z'), messagesUpdatedAt: oldDate }], messages: payload('a').messages };
  const cleared = { threads: [{ ...thread('a', newDate, 0), messagesUpdatedAt: newDate }], messages: {} };
  const merged = mergeChatData(renamed, cleared);
  expect(merged.messages.a).toEqual([]);
  expect(merged.threads[0].messageCount).toBe(0);
  const renamedClear = { ...cleared, threads: [{ ...cleared.threads[0], updatedAt: '2026-09-14T12:00:00Z' }] };
  const newerMessage = { threads: [thread('a', '2026-09-13T12:00:00Z')], messages: payload('a').messages };
  const edited = mergeChatData(renamedClear, newerMessage);
  expect(edited.messages.a).toEqual(payload('a').messages.a);
  expect(edited.threads[0].messageCount).toBe(1);
});

test('legacy metadata edits preserve the old body clock before rename, pin or project changes', async () => {
  const { markThreadMetadataChanged } = await import('../js/chat-thread-search.js');
  const legacy = payload('a');
  markThreadMetadataChanged(legacy.threads[0], '2026-09-14T12:00:00Z');
  const edited = { threads: [thread('a', newDate)], messages: { a: [{ role: 'user', content: 'new edit' }] } };
  expect(legacy.threads[0].messagesUpdatedAt).toBe(oldDate);
  expect(mergeChatData(legacy, edited).messages.a).toEqual(edited.messages.a);
});

test('an unreadable duplicate replica does not block preserving the usable remote chat', async () => {
  const good = { id: 'good', profileId, dataJson: JSON.stringify({ _v: 4, chatData: payload('remote') }), syncedAt: newDate };
  const bad = { id: 'bad', profileId, dataJson: '{malformed', syncedAt: oldDate };
  let sent;
  configureSyncPush({ getEvolu: () => ({ getQueryRows: () => [bad, good], update: (_table, value, { onComplete }) => { sent = value; onComplete(); } }),
    getProfileQuery: () => ({}), isSyncEnabled: () => true, getProfiles: () => [{ id: profileId }], isPhase2CutoverEnabled: () => false });
  expect(await pushProfile(profileId, {})).toMatchObject({ ok: true });
  expect(sent.id).toBe('good');
  expect((await parseSyncPayload(sent.dataJson)).chatData.messages.remote).toEqual(payload('remote').messages.remote);
});

test('an unversioned metadata-only empty shell cannot mask a stored body', () => {
  const shell = { threads: [thread('a', newDate, 0)], messages: {} };
  expect(mergeChatData(shell, payload('a')).messages.a).toEqual(payload('a').messages.a);
});
