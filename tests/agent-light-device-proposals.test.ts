// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import * as analysis from '../js/light-sun-analysis-runtime.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { addCustomDevice, addDeviceFromPresetRecord, configureLightDevicesStore, deleteDevice, deleteDeviceSession, hydrateDevicesFromPresetRecords, logDeviceSession, startDeviceSession, stopDeviceSession, updateDeviceRecord, updateDeviceSession } from '../js/light-devices-store.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import type { ProfileData } from '../types/app-state.js';

const previous = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string, previousStore: ReturnType<typeof configureLightDevicesStore>;
const evidence = 'My recorded panel session was actually 20 minutes, not 10. Remove my recorded panel. The panel is called Corrected Panel.';
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
const tools = () => createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) });
async function propose(resource = 'lightDeviceSessions', id = '', patch = '{"durationMin":20}', operation = 'update', create = false) {
  const runtime = tools(), read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource, ...(create ? { create: true } : { recordId: id }) } });
  expect(read.success, read.contentItems[0].text).toBe(true); const current = JSON.parse(read.contentItems[0].text);
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource, operation, snapshotId: current.snapshotId, patch, evidence, reason: 'The user explicitly reported this device/session correction.' } });
  expect(result.success, result.contentItems[0].text).toBe(true);
  return { runtime, current, result, draft: { ...runtime.getDrafts()[0]!, profileId: profile } };
}
beforeEach(async () => {
  profile = `light-device-tools-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported');
  localStorage.setItem('labcharts-active-profile', profile); state.currentProfile = profile; state.importedData = createDefaultProfileData();
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, true);
  vi.spyOn(analysis, 'requestDeviceSessionAnalysis').mockImplementation(() => {});
  previousStore = configureLightDevicesStore({ maybeAnalyzeDeviceSessionAfterFinish: analysis.requestDeviceSessionAnalysis });
  state.importedData.lightDevices = [{ id: 'dev-panel', brand: 'Synthetic', model: 'Panel', type: 'combined', peakWavelengths: [660, 850], peakShares: [0.5, 0.5], peakShareBasis: 'relative', mwPerCm2At15cm: 20, recommendedDistanceCm: 15, distanceModel: 'reference-only', irradianceBasis: 'user-entered', annotation: '/private/device-sentinel' }];
  state.importedData.contextNotes = 'Preserve this profile note';
  expect(await saveImportedData()).toBe(true);
  const session = await logDeviceSession({ deviceId: 'dev-panel', durationMin: 10, distanceCm: 15, bodyArea: 'torso', eyesProtected: true });
  expect(session).not.toBeNull(); if (!session || !session.endedAt) throw new Error('The synthetic completed session is missing.');
  session.startedAt -= 3600000; session.endedAt -= 3600000; expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {
  configureLightDevicesStore(previousStore); vi.restoreAllMocks(); clearSyncSaveTimers(); setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, true);
  await storage.encryptedRemoveItem(key); state.currentProfile = previous.profile; state.importedData = previous.data;
});
it('reads saved devices without disclosing private specification metadata or mutating storage', async () => {
  const before = await stored(), read = await tools().execute({ tool: 'getbased_read_data', arguments: { resource: 'lightDevices', recordId: 'dev-panel' } });
  expect(read.success, read.contentItems[0].text).toBe(true); expect(JSON.parse(read.contentItems[0].text).current).toMatchObject({ brand: 'Synthetic', model: 'Panel' });
  expect(read.contentItems[0].text).not.toMatch(/private|device-sentinel/); expect(await stored()).toEqual(before);
});
it('reviews and applies a duration correction with recomputed doses and a matching end time', async () => {
  const before = await stored(), session = before.deviceSessions![0]!, { draft, result } = await propose('lightDeviceSessions', session.id);
  expect(await stored()).toEqual(before); expect(JSON.stringify(result)).toContain('pending_user_approval');
  await applyAgentDraft(draft); const after = (await stored()).deviceSessions![0]!;
  expect(after.durationMin).toBe(20); expect(after.endedAt).toBe(after.startedAt + 20 * 60000);
  expect(after.doses!.pbm_red).toBeCloseTo(session.doses!.pbm_red! * 2, 8); expect(after.deviceSnapshot).toEqual(session.deviceSnapshot);
  expect((await stored()).contextNotes).toBe(before.contextNotes);
});
it('a failed native session correction cannot change the visible record or announce analysis', async () => {
  const before = await stored(), id = before.deviceSessions![0]!.id, write = storage.encryptedSetItem;
  vi.mocked(analysis.requestDeviceSessionAnalysis).mockClear();
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic disk failure'); return write(...args); });
  expect(await updateDeviceSession(id, { durationMin: 20 })).toBeNull(); expect(state.importedData).toEqual(before); expect(await stored()).toEqual(before); expect(analysis.requestDeviceSessionAnalysis).not.toHaveBeenCalled();
});
it('creates a reported custom device without inventing its type, irradiance or reference distance', async () => {
  const { current, draft } = await propose('lightDevices', '', '{"brand":"Reported","model":"New Panel"}', 'add', true);
  await applyAgentDraft(draft); const device = (await stored()).lightDevices!.find(row => row.id === current.recordId)!;
  expect(device).toMatchObject({ brand: 'Reported', model: 'New Panel', type: null, peakWavelengths: [], mwPerCm2At15cm: null, recommendedDistanceCm: null });
});
it('recalculates linked completed sessions after a reviewed specification correction and retains old evidence', async () => {
  const before = await stored(), { draft, result } = await propose('lightDevices', 'dev-panel', '{"mwPerCm2At15cm":40}');
  expect(JSON.stringify(result)).not.toMatch(/private|device-sentinel/);
  const review = JSON.parse(result.contentItems[0].text).review; expect(review.effects.recalculatedSessions).toHaveLength(1);
  await applyAgentDraft(draft); const saved = await stored(), session = saved.deviceSessions![0]!;
  expect(session.doses!.pbm_red).toBeCloseTo(before.deviceSessions![0]!.doses!.pbm_red! * 2, 8);
  expect(session.editHistory).toEqual([expect.objectContaining({ record: expect.objectContaining({ doses: before.deviceSessions![0]!.doses, deviceSnapshot: before.deviceSessions![0]!.deviceSnapshot }) })]);
  expect(saved.lightDevices![0].specHistory).toEqual([expect.objectContaining({ record: expect.objectContaining({ annotation: '/private/device-sentinel', mwPerCm2At15cm: 20 }) })]);
  expect(session.deviceSnapshot!.mwPerCm2At15cm).toBe(40); expect(saved.contextNotes).toBe(before.contextNotes);
});
it('removes a device while retaining its recorded sessions and usable specification snapshots', async () => {
  const before = await stored(), { draft, result } = await propose('lightDevices', 'dev-panel', '{}', 'remove');
  expect(JSON.parse(result.contentItems[0].text).review.effects.retainedSessionCount).toBe(1); await applyAgentDraft(draft);
  let saved = await stored(); expect(saved.lightDevices).toEqual([]); expect(saved.deviceSessions).toEqual(before.deviceSessions); expect(saved._deleted.lightDevices).toContain('dev-panel');
  await applyAgentDraft((await propose('lightDeviceSessions', saved.deviceSessions![0]!.id, '{"durationMin":20}')).draft);
  saved = await stored(); expect(saved.deviceSessions![0]!.durationMin).toBe(20); expect(saved.deviceSessions![0]!.deviceSnapshot).toEqual(before.deviceSessions![0]!.deviceSnapshot); expect(saved.deviceSessions![0]!.doses!.pbm_red).toBeCloseTo(before.deviceSessions![0]!.doses!.pbm_red! * 2, 8);
});
it('records a fully reported historical session with exact time, mode-independent settings and protected fields', async () => {
  const before = await stored(), patch = { deviceId: 'dev-panel', startedAt: '2026-10-23T10:00:00+02:00', durationMin: 12, distanceCm: 15, bodyArea: 'torso', eyesProtected: true, notes: 'Reported earlier session' };
  const { current, draft } = await propose('lightDeviceSessions', '', JSON.stringify(patch), 'add', true); await applyAgentDraft(draft);
  const saved = await stored(), session = saved.deviceSessions!.find(row => row.id === current.recordId)!;
  expect(session.startedAt).toBe(Date.parse(patch.startedAt)); expect(session.endedAt).toBe(Date.parse(patch.startedAt) + 12 * 60000); expect(session.notes).toBe(patch.notes); expect(session.doses!.pbm_red).toBeGreaterThan(0);
  expect(saved.deviceSessions![0]).toEqual(before.deviceSessions![0]); expect(saved.contextNotes).toBe(before.contextNotes);
});
it('removes only the selected completed session with its canonical deletion identity', async () => {
  const before = await stored(), id = before.deviceSessions![0]!.id;
  await applyAgentDraft((await propose('lightDeviceSessions', id, '{}', 'remove')).draft);
  const saved = await stored(); expect(saved.deviceSessions).toEqual([]); expect(saved.lightDevices).toEqual(before.lightDevices); expect(saved._deleted.deviceSessions).toContain(id);
});
it('preserves explicit unknown specification values rather than filling native form defaults', async () => {
  await applyAgentDraft((await propose('lightDevices', 'dev-panel', '{"recommendedDistanceCm":null,"mwPerCm2At15cm":null,"type":null}')).draft);
  const saved = await stored(); expect(saved.lightDevices![0]).toMatchObject({ recommendedDistanceCm: null, mwPerCm2At15cm: null, type: null }); expect(saved.deviceSessions![0]!.doses!.pbm_red).toBeUndefined();
});
it('retains reported irradiance when clearing its reference distance and withholds numerical estimates', async () => {
  await applyAgentDraft((await propose('lightDevices', 'dev-panel', '{"recommendedDistanceCm":null}')).draft);
  const saved = await stored(); expect(saved.lightDevices![0]).toMatchObject({ recommendedDistanceCm: null, mwPerCm2At15cm: 20 });
  expect(saved.deviceSessions![0]!.doses).toEqual({}); expect(saved.deviceSessions![0]!.calculationStatus).toBe('partial');
});
it('refuses device removal and completed-record edits while a related timer is active', async () => {
  const active = await startDeviceSession({ deviceId: 'dev-panel', distanceCm: 15, eyesProtected: true }); expect(active).toBeTruthy(); const before = await stored(), runtime = tools();
  for (const [resource, recordId] of [['lightDevices', 'dev-panel'], ['lightDeviceSessions', active!]]) {
    const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource, recordId } }); expect(read.success).toBe(true);
    const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource, operation: 'remove', snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, patch: '{}', evidence, reason: 'Explicit removal' } });
    expect(result.success).toBe(false);
  }
  expect(await stored()).toEqual(before); expect(runtime.getDrafts()).toHaveLength(0);
});
it.each([
  ['lightDevices', { peakWavelengths: [660, 660] }], ['lightDevices', { mwPerCm2At15cm: -1 }], ['lightDevices', { doses: { pbm_red: 99 } }],
  ['lightDeviceSessions', { durationMin: 601 }], ['lightDeviceSessions', { distanceCm: 0 }], ['lightDeviceSessions', { startedAt: '2026-02-30T10:00:00Z' }],
  ['lightDeviceSessions', { startedAt: '2026-10-23' }], ['lightDeviceSessions', { mode: 'invented-mode' }], ['lightDeviceSessions', { bodyAreas: ['invented-region'] }], ['lightDeviceSessions', { eyesProtected: 'yes' }],
] as const)('rejects invalid reported %s inputs without a proposal or a save (%j)', async (resource, patch) => {
  const before = await stored(), recordId = resource === 'lightDevices' ? 'dev-panel' : before.deviceSessions![0]!.id, runtime = tools();
  const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource, recordId } }); expect(read.success).toBe(true);
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource, operation: 'update', snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, patch: JSON.stringify(patch), evidence, reason: 'Reported correction' } });
  expect(result.success).toBe(false); expect(runtime.getDrafts()).toHaveLength(0); expect(await stored()).toEqual(before);
});
it('does not assume missing completed-session facts or a mode from the native defaults', async () => {
  const before = await stored(), runtime = tools(), read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'lightDeviceSessions', create: true } });
  expect(read.success).toBe(true);
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'lightDeviceSessions', operation: 'add', snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, patch: '{"deviceId":"dev-panel","durationMin":10}', evidence, reason: 'Reported use' } });
  expect(result.success).toBe(false); expect(result.contentItems[0].text).toContain('missing facts'); expect(await stored()).toEqual(before);
});
it('rejects completed-session corrections that would put the start or end in the future', async () => {
  const before = await stored(), recordId = before.deviceSessions![0]!.id, runtime = tools();
  for (const patch of [{ startedAt: new Date(Date.now() + 86400000).toISOString() }, { durationMin: 600 }]) {
    const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'lightDeviceSessions', recordId } });
    expect(read.success).toBe(true);
    const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'lightDeviceSessions', operation: 'update', snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, patch: JSON.stringify(patch), evidence, reason: 'Reported completed-session correction' } });
    expect(result.success).toBe(false); expect(result.contentItems[0].text).toContain('future');
    expect(runtime.getDrafts()).toHaveLength(0); expect(await stored()).toEqual(before);
  }
});
it('keeps sorted wavelength shares paired and does not invent weights for a newly reported wavelength', async () => {
  const created = await addCustomDevice({ brand: 'Reported', model: 'Weighted', type: 'combined', peakWavelengths: [850, 660], peakShares: [0.8, 0.2] });
  expect(created!.peakWavelengths).toEqual([660, 850]); expect(created!.peakShares).toEqual([0.2, 0.8]);
  await updateDeviceRecord(created!.id, { peakWavelengths: [850, 660] }); let device = (await stored()).lightDevices!.find(row => row.id === created!.id)!; expect(device.peakShares).toEqual([0.2, 0.8]);
  await updateDeviceRecord(created!.id, { peakWavelengths: [660, 810] }); device = (await stored()).lightDevices!.find(row => row.id === created!.id)!; expect(device.peakShares).toBeNull();
});
it('rechecks private specification changes inside the locked canonical save', async () => {
  const before = await stored(), { draft } = await propose('lightDeviceSessions', before.deviceSessions![0]!.id), read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  const peer = structuredClone(before); peer.lightDevices![0].annotation = 'Private peer evidence';
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow('changed'); expect(await stored()).toEqual(peer); expect(state.importedData).toEqual(before);
});
it('rechecks revoked Light consent in the locked commit', async () => {
  const before = await stored(), { draft } = await propose('lightDevices', 'dev-panel', '{"model":"Corrected Panel"}'), read = storage.encryptedGetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, false); return read(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow(/authorization|authorized/); expect(await stored()).toEqual(before);
});
it('keeps storage failure retryable without publishing staged calculations', async () => {
  const before = await stored(), { draft } = await propose('lightDeviceSessions', before.deviceSessions![0]!.id), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic disk failure'); return write(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow('Could not save'); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  vi.mocked(storage.encryptedSetItem).mockRestore(); await applyAgentDraft(draft); expect((await stored()).deviceSessions![0]!.durationMin).toBe(20);
});
it('does not create a proposal for an already recorded device name', async () => {
  const before = await stored(), runtime = tools(), read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'lightDevices', recordId: 'dev-panel' } });
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'lightDevices', operation: 'update', snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, patch: '{"model":"Panel"}', evidence, reason: 'Reported name' } });
  expect(result.success).toBe(false); expect(runtime.getDrafts()).toHaveLength(0); expect(await stored()).toEqual(before);
});
it.each(['addCustom', 'addPreset', 'deleteDevice', 'log', 'start', 'stop', 'deleteSession'] as const)('native %s failure leaves all canonical data and visible identity unchanged', async kind => {
  if (kind === 'stop') expect(await startDeviceSession({ deviceId: 'dev-panel' })).toBeTruthy();
  const before = await stored(), observed = state.importedData, write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic disk failure'); return write(...args); });
  const result = await (kind === 'addCustom' ? addCustomDevice({ brand: 'New', model: 'Panel' }) : kind === 'addPreset' ? addDeviceFromPresetRecord({ id: 'preset', brand: 'New', model: 'Panel' }) : kind === 'deleteDevice' ? deleteDevice('dev-panel') : kind === 'log' ? logDeviceSession({ deviceId: 'dev-panel', durationMin: 5 }) : kind === 'start' ? startDeviceSession({ deviceId: 'dev-panel' }) : kind === 'stop' ? stopDeviceSession() : deleteDeviceSession(before.deviceSessions![0]!.id));
  expect(result).toBeFalsy(); expect(state.importedData).toBe(observed); expect(state.importedData).toEqual(before); expect(await stored()).toEqual(before);
});
it('a duration prompt cannot edit a same-ID session in a replacement profile', async () => {
  const before = await stored(), other = `device-other-${crypto.randomUUID()}`, otherKey = profileStorageKey(other, 'imported'), otherData = structuredClone(state.importedData);
  await storage.encryptedSetItem(otherKey, JSON.stringify(otherData));
  const runtime = await import('../js/light-devices-runtime.js'), controller = await import('../js/light-devices.js');
  vi.spyOn(runtime, 'promptLightDeviceSessionDuration').mockImplementationOnce(async () => { state.currentProfile = other; state.importedData = otherData; return '20'; });
  const refresh = vi.spyOn(runtime, 'refreshLightDevicesView');
  try {
    await controller.editDeviceSessionDuration(before.deviceSessions![0]!.id);
    expect(JSON.parse((await storage.encryptedGetItem(otherKey))!)).toEqual(otherData); expect(await stored()).toEqual(before); expect(refresh).not.toHaveBeenCalled();
  } finally { await storage.encryptedRemoveItem(otherKey); }
});
it('a completed edit received while a duration prompt is open wins over its stale reply', async () => {
  const before = await stored(), id = before.deviceSessions![0]!.id, runtime = await import('../js/light-devices-runtime.js'), controller = await import('../js/light-devices.js');
  vi.spyOn(runtime, 'promptLightDeviceSessionDuration').mockImplementationOnce(async () => { await updateDeviceSession(id, { durationMin: 30 }); return '20'; });
  await controller.editDeviceSessionDuration(id);
  const saved = await stored(); expect(saved.deviceSessions![0]!.durationMin).toBe(30); expect(saved.deviceSessions![0]!.editHistory).toHaveLength(1); expect(saved.contextNotes).toBe(before.contextNotes);
});
it('a native session edit preserves an unrelated visible draft without saving it', async () => {
  const before = await stored(); state.importedData.contextNotes = 'Unapproved note draft';
  expect(await updateDeviceSession(before.deviceSessions![0]!.id, { durationMin: 20 })).not.toBeNull();
  expect((await stored()).contextNotes).toBe(before.contextNotes); expect(state.importedData.contextNotes).toBe('Unapproved note draft');
});
it('preset hydration adopts its accepted fields over their unsaved deletion and is idempotent', async () => {
  const preset = { id: 'preset-demo', brand: 'Reported', model: 'Modeled', type: 'combined', peakWavelengths: [660], channelGroups: [{ id: 'red', peaks: [660] }], modes: [{ id: 'red', groups: ['red'], default: true }] };
  const device = await addDeviceFromPresetRecord(preset); expect(device).not.toBeNull(); device!.channelGroups = undefined; device!.modes = undefined;
  expect(await hydrateDevicesFromPresetRecords([preset])).toBe(true); expect(device!.modes).toEqual(preset.modes); expect(device!.channelGroups).toEqual(preset.channelGroups);
  expect(await hydrateDevicesFromPresetRecords([preset])).toBe(false);
});
