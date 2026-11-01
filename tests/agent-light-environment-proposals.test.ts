// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import * as utils from '../js/utils.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import { addRoom, addScreen, deleteRoom, deleteScreen, isActiveToday, updateRoom, updateScreen } from '../js/light-env-store.js';
import type { ProfileData } from '../types/app-state.js';

const original = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string;
const evidence = 'My office now uses warm LEDs. Remove my office room. Add a nursery with some daylight. My laptop has a blue blocker enabled.';
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
const tools = () => createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) });
async function proposal(resource = 'lightRooms', recordId = 'room-office', patch = '{"primarySource":"led-warm"}', operation = 'update', create = false) {
  const runtime = tools();
  const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource, ...(create ? { create: true } : { recordId }) } });
  expect(read.success, read.contentItems[0].text).toBe(true);
  const snapshot = JSON.parse(read.contentItems[0].text);
  const prepared = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource, operation, snapshotId: snapshot.snapshotId, patch, evidence, reason: 'The user reported a changed light environment.' } });
  expect(prepared.success, prepared.contentItems[0].text).toBe(true);
  return { runtime, snapshot, prepared, draft: { ...runtime.getDrafts()[0]!, profileId: profile } };
}
beforeEach(async () => {
  profile = `light-tools-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported');
  localStorage.setItem('labcharts-active-profile', profile); state.currentProfile = profile; state.importedData = createDefaultProfileData();
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, true);
  state.importedData.lightEnvironment = { rooms: [{ id: 'room-office', name: 'Office', primarySource: 'led-cool', daylightLevel: 'unknown', hoursOccupiedPerDay: 8, eveningHoursAfterSunset: null, privateMetadata: '/private/light-sentinel' }],
    screens: [{ id: 'screen-laptop', device: 'laptop', roomId: 'room-office', blueBlockerEnabled: false, hoursPerDay: null, eveningUseAfterSunset: null }], settings: { retained: true } };
  state.importedData.lightMeasurements = [{ id: 'measurement', roomId: 'room-office', tool: 'lux', value: 100, capturedAt: 100, extra: { source: '/private/measurement-sentinel' } }];
  state.importedData.contextNotes = 'Keep this profile note';
  expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {
  vi.restoreAllMocks(); clearSyncSaveTimers();
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, true); setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true);
  await storage.encryptedRemoveItem(key); state.currentProfile = original.profile; state.importedData = original.data;
});
it('discovers exact Light records under Light consent without leaking private evidence or changing storage', async () => {
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, false);
  const before = await stored(), runtime = tools();
  const list = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'lightRooms' } });
  expect(list.success, list.contentItems[0].text).toBe(true);
  expect(JSON.parse(list.contentItems[0].text).records).toEqual([expect.objectContaining({ recordId: 'room-office' })]);
  const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'lightRooms', recordId: 'room-office' } });
  expect(read.success).toBe(true); expect(JSON.parse(read.contentItems[0].text).current).toMatchObject({ name: 'Office', primarySource: 'led-cool' });
  expect(JSON.stringify([list, read])).not.toMatch(/private|sentinel/); expect(await stored()).toEqual(before);
});
it('applies only a reviewed room correction and preserves hidden metadata and unrelated profile data', async () => {
  const before = await stored(), { draft, prepared } = await proposal();
  expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  expect(JSON.stringify([draft.payload, prepared])).not.toMatch(/private|sentinel/);
  await applyAgentDraft(draft);
  const saved = await stored(); expect(saved.lightEnvironment!.rooms[0]).toMatchObject({ primarySource: 'led-warm', privateMetadata: '/private/light-sentinel' });
  expect(saved.lightEnvironment!.screens).toEqual(before.lightEnvironment!.screens); expect(saved.lightMeasurements).toEqual(before.lightMeasurements); expect(saved.contextNotes).toBe(before.contextNotes);
});
it('reviews room removal cascades, unlinks screens and preserves measurement evidence and the room name', async () => {
  const before = await stored(), { draft, prepared } = await proposal('lightRooms', 'room-office', '{}', 'remove');
  const review = JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] }));
  expect(review).toContain('Unlinked screens'); expect(review).toContain('Preserved measurements'); expect(JSON.stringify(prepared)).not.toMatch(/private|sentinel/);
  await applyAgentDraft(draft); const saved = await stored();
  expect(saved.lightEnvironment!.rooms).toEqual([]); expect(saved.lightEnvironment!.screens[0]).toMatchObject({ id: 'screen-laptop', roomId: null });
  expect(saved.lightMeasurements).toEqual([{ ...before.lightMeasurements![0], roomSnapshot: { id: 'room-office', name: 'Office' }, updatedAt: expect.any(Number) }]);
  expect(saved._deleted['lightEnvironment.rooms']).toContain('room-office'); expect(saved.contextNotes).toBe(before.contextNotes);
});
it('native room save failure leaves both the visible and durable room unchanged', async () => {
  const before = await stored(); vi.spyOn(storage, 'encryptedSetItem').mockRejectedValueOnce(new Error('Synthetic storage failure'));
  expect(await updateRoom('room-office', { primarySource: 'led-warm' })).toBeNull();
  expect(state.importedData).toEqual(before); expect(await stored()).toEqual(before);
});
it('creates only reported room facts and keeps unreported defaults unknown', async () => {
  state.importedData.sunDefaults = { ...state.importedData.sunDefaults, homeLight: 'led-cool' }; expect(await saveImportedData()).toBe(true);
  const { draft, snapshot } = await proposal('lightRooms', '', '{"name":"Nursery","daylightLevel":"some"}', 'add', true);
  expect(snapshot.recordId).toMatch(/^room_/); await applyAgentDraft(draft);
  const room = (await stored()).lightEnvironment!.rooms.find((row: { id: string }) => row.id === snapshot.recordId);
  expect(room).toMatchObject({ name: 'Nursery', daylightLevel: 'some', primarySource: 'unknown', hoursOccupiedPerDay: null, eveningHoursAfterSunset: null, cct: null, flickerScore: null });
});
it('creates and corrects an exact screen without inventing filter status or use hours', async () => {
  const added = await proposal('lightScreens', '', '{"device":"monitor","roomId":"room-office"}', 'add', true);
  await applyAgentDraft(added.draft);
  let screen = (await stored()).lightEnvironment!.screens.find((row: { id: string }) => row.id === added.snapshot.recordId);
  expect(screen).toMatchObject({ device: 'monitor', roomId: 'room-office', blueBlockerEnabled: null, hoursPerDay: null, eveningUseAfterSunset: null });
  const changed = await proposal('lightScreens', added.snapshot.recordId, '{"blueBlockerEnabled":true,"eveningUseAfterSunset":1.5}'); await applyAgentDraft(changed.draft);
  screen = (await stored()).lightEnvironment!.screens.find((row: { id: string }) => row.id === added.snapshot.recordId);
  expect(screen).toMatchObject({ blueBlockerEnabled: true, hoursPerDay: null, eveningUseAfterSunset: 1.5 });
  await applyAgentDraft((await proposal('lightScreens', added.snapshot.recordId, '{}', 'remove')).draft);
  expect((await stored()).lightEnvironment!.screens.some((row: { id: string }) => row.id === added.snapshot.recordId)).toBe(false);
});
it('records a dated Today override, then clears it without changing usual settings', async () => {
  const before = await stored(), first = await proposal('lightRooms', 'room-office', '{"todayActive":false}');
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [first.draft] }))).toContain('Day override');
  await applyAgentDraft(first.draft);
  expect((await stored()).lightEnvironment!.rooms[0].todayOverride).toEqual({ date: first.snapshot.localDate, active: false });
  expect(isActiveToday(state.importedData.lightEnvironment!.rooms[0])).toBe(false);
  await applyAgentDraft((await proposal('lightRooms', 'room-office', '{"todayActive":null}')).draft);
  const room = (await stored()).lightEnvironment!.rooms[0]; expect(room.todayOverride).toBeUndefined(); expect(room.hoursOccupiedPerDay).toBe(before.lightEnvironment!.rooms[0].hoursOccupiedPerDay);
});
it.each([
  ['lightRooms', 'room-office', { hoursOccupiedPerDay: 25 }],
  ['lightRooms', 'room-office', { eveningHoursAfterSunset: 1.25 }],
  ['lightRooms', 'room-office', { cct: 2750 }],
  ['lightRooms', 'room-office', { primarySource: 'made-up-source' }],
  ['lightRooms', 'room-office', { id: 'different-id' }],
  ['lightScreens', 'screen-laptop', { roomId: 'missing-room' }],
  ['lightScreens', 'screen-laptop', { blueBlockerEnabled: 'yes' }],
  ['lightScreens', 'screen-laptop', { flickerScore: 4 }],
] as const)('rejects unsupported %s facts without clamping them into different saved facts (%s, %j)', async (resource, recordId, patch) => {
  const before = await stored(), runtime = tools();
  const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource, recordId } }); expect(read.success).toBe(true);
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource, operation: 'update', snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, patch: JSON.stringify(patch), evidence, reason: 'Reported correction' } });
  expect(result.success).toBe(false); expect(runtime.getDrafts()).toHaveLength(0); expect(await stored()).toEqual(before);
});
it('preserves an explicitly unknown evening value rather than converting it to zero', async () => {
  state.importedData.lightEnvironment!.rooms[0].eveningHoursAfterSunset = 2; expect(await saveImportedData()).toBe(true);
  await applyAgentDraft((await proposal('lightRooms', 'room-office', '{"eveningHoursAfterSunset":null}')).draft);
  expect((await stored()).lightEnvironment!.rooms[0].eveningHoursAfterSunset).toBeNull();
});
it('rejects private metadata changed by a peer inside the canonical locked save', async () => {
  const before = await stored(), { draft } = await proposal(), read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  const peer = structuredClone(before); peer.lightEnvironment!.rooms[0].privateMetadata = 'peer evidence';
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow('changed'); expect(await stored()).toEqual(peer); expect(state.importedData).toEqual(before);
});
it('rejects a late screen link change rather than applying unreviewed room-removal effects', async () => {
  const before = await stored(), { draft } = await proposal('lightRooms', 'room-office', '{}', 'remove');
  const peer = structuredClone(before); peer.lightEnvironment!.screens.push({ id: 'late-screen', device: 'phone', roomId: 'room-office' });
  await storage.encryptedSetItem(key, JSON.stringify(peer)); await expect(applyAgentDraft(draft)).rejects.toThrow('changed'); expect(await stored()).toEqual(peer);
});
it('does not disclose Light data when only Insight context remains enabled', async () => {
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, false);
  const runtime = tools(), result = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'lightRooms' } });
  expect(result.success).toBe(false); expect(result.contentItems[0].text).not.toContain('Office');
});
it('rechecks Light consent inside the locked save', async () => {
  const before = await stored(), { draft } = await proposal(), read = storage.encryptedGetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, false); return read(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow(/access|authorized/); expect(await stored()).toEqual(before); expect(state.importedData).toEqual({ ...before, contextSourceSettings: { ...before.contextSourceSettings, [CONTEXT_SOURCE_IDS.LIGHT_SUN]: false } });
});
it('keeps a storage failure retryable and publishes only a successful room save', async () => {
  const before = await stored(), { draft } = await proposal(), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic storage failure'); return write(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow('Could not save'); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  vi.mocked(storage.encryptedSetItem).mockRestore(); await applyAgentDraft(draft); expect((await stored()).lightEnvironment!.rooms[0].primarySource).toBe('led-warm');
});
it('rejects an unreviewed effect plan', async () => {
  const before = await stored(), { draft } = await proposal('lightRooms', 'room-office', '{}', 'remove');
  const payload = draft.payload as { baseline: string }, snapshot = JSON.parse(payload.baseline); snapshot.plan.effects.unlinkedScreens = []; payload.baseline = JSON.stringify(snapshot);
  await expect(applyAgentDraft(draft)).rejects.toThrow('changed'); expect(await stored()).toEqual(before);
});
it('preserves unrelated unsaved notes while refusing to overwrite an unsaved Light editor', async () => {
  const before = await stored(), first = await proposal(); state.importedData.contextNotes = 'Unsaved other note'; await applyAgentDraft(first.draft);
  expect(state.importedData.contextNotes).toBe('Unsaved other note'); expect((await stored()).contextNotes).toBe(before.contextNotes);
  const second = await proposal('lightScreens', 'screen-laptop', '{"blueBlockerEnabled":true}'); state.importedData.lightEnvironment!.screens[0].hoursPerDay = 3;
  await expect(applyAgentDraft(second.draft)).rejects.toThrow('changed'); expect(state.importedData.lightEnvironment!.screens[0].hoursPerDay).toBe(3); expect((await stored()).lightEnvironment!.screens[0].blueBlockerEnabled).toBe(false);
});
it('serializes native room and screen edits without dropping either intent', async () => {
  const [room, screen] = await Promise.all([updateRoom('room-office', { notes: 'New note' }), updateScreen('screen-laptop', { hoursPerDay: 2 })]);
  expect(room).not.toBeNull(); expect(screen).not.toBeNull(); const saved = await stored(); expect(saved.lightEnvironment!.rooms[0].notes).toBe('New note'); expect(saved.lightEnvironment!.screens[0].hoursPerDay).toBe(2);
});
it('ordinary add/update commands do not invent deletion-restoration clocks', async () => {
  const before = await stored();
  expect(await addRoom('Nursery')).toBeTruthy(); expect(await addScreen('phone')).toBeTruthy();
  await updateRoom('room-office', { primarySource: 'led-warm' }); await updateScreen('screen-laptop', { hoursPerDay: 2 });
  const saved = await stored();
  for (const field of ['_deleted', '_deletedAt', '_deletedClearedAt'] as const) expect(saved[field]).toEqual(before[field]);
});
it.each(['addRoom', 'addScreen', 'deleteRoom', 'deleteScreen'] as const)('native %s failure preserves visible identity and all saved data', async kind => {
  const before = await stored(), observed = state.importedData, write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic storage failure'); return write(...args); });
  const result = await (kind === 'addRoom' ? addRoom('Nursery') : kind === 'addScreen' ? addScreen('tv') : kind === 'deleteRoom' ? deleteRoom('room-office') : deleteScreen('screen-laptop'));
  expect(result).toBeFalsy(); expect(state.importedData).toBe(observed); expect(state.importedData).toEqual(before); expect(await stored()).toEqual(before);
});
it('a room-name prompt cannot create a room or refresh the editor of a replacement profile', async () => {
  const other = `light-other-${crypto.randomUUID()}`, otherKey = profileStorageKey(other, 'imported'), otherData = structuredClone(state.importedData);
  await storage.encryptedSetItem(otherKey, JSON.stringify(otherData));
  const editor = await import('../js/light-env-editor.js'), refreshUI = vi.fn(), previous = editor.configureLightEnvEditor({ refreshUI });
  vi.spyOn(utils, 'showPromptDialog').mockImplementationOnce(async () => { state.currentProfile = other; state.importedData = otherData; return 'Nursery'; });
  try {
    await editor.lightEnvEditorActionHandlers.addLightEnvRoomCustom();
    expect(JSON.parse((await storage.encryptedGetItem(otherKey))!)).toEqual(otherData); expect(otherData.lightEnvironment!.rooms).toHaveLength(1); expect(refreshUI).not.toHaveBeenCalled();
  } finally { editor.configureLightEnvEditor(previous); await storage.encryptedRemoveItem(otherKey); }
});
it('a failed manual spectrum classification cannot announce that it saved a source', async () => {
  state.importedData.lightEnvironment!.rooms[0].primarySource = 'unknown'; expect(await saveImportedData()).toBe(true);
  const editor = await import('../js/light-env-editor.js'), notification = vi.spyOn(utils, 'showNotification'), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic storage failure'); return write(...args); });
  await editor.suggestRoomSourceFromSpectrum('room-office', 'Warm LED (2700–3000K)', { method: 'manual-classification' });
  expect(notification.mock.calls.some(([text]) => String(text).includes('Auto-set'))).toBe(false); expect(state.importedData.lightEnvironment!.rooms[0].primarySource).toBe('unknown');
});
