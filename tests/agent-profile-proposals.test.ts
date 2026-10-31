// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ notify: vi.fn(), enabled: vi.fn(), sync: vi.fn() }));
vi.mock('../js/data.js', () => ({ notifyProfileDataContextChanged: mocks.notify, saveImportedDataForProfile: vi.fn(), getActiveData: vi.fn(), navigateDataViewRuntime: vi.fn(), showDataMarkerDetailRuntime: vi.fn() }));
vi.mock('../js/profile-sync-policy.js', () => ({ queueEligibleProfileSync: mocks.sync }));
vi.mock('../js/context-source-registry.js', async original => ({ ...await original<typeof import('../js/context-source-registry.js')>(), isContextSourceEnabled: mocks.enabled }));
import { state } from '../js/state.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { configureProfileDeps, configureProfileRuntimeDeps } from '../js/profile.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { projectProfileRecord } from '../js/profile-record-commands.js';
import type { StoredProfileRecord } from '../js/profile-list-store.js';

const evidence = 'My height is 70 inches and I moved to Czechia.';
let durable: StoredProfileRecord[], writes: ReturnType<typeof vi.fn<(key: string, value: string) => Promise<void>>>, previous: ReturnType<typeof configureProfileDeps>, runtimeDeps: ReturnType<typeof configureProfileRuntimeDeps>;
beforeEach(() => {
  vi.resetAllMocks(); mocks.enabled.mockReturnValue(true);
  durable = [{ id: 'a', name: 'Original', sex: null, dob: null, height: 170, heightUnit: 'cm', location: { country: 'Germany', zip: '12345' }, tags: ['keep'], notes: 'Private list note', status: 'active', pinned: false, avatar: 'data:image/png;base64,opaque', extra: { retained: true }, lastUpdated: 1 }];
  state.currentProfile = 'a'; state.profiles = structuredClone(durable); localStorage.setItem('labcharts-active-profile', 'a');
  writes = vi.fn(async (_key: string, value: string) => { durable = JSON.parse(value) as StoredProfileRecord[]; });
  previous = configureProfileDeps({ encryptedGetItem: async () => JSON.stringify(durable), encryptedSetItem: writes });
  runtimeDeps = configureProfileRuntimeDeps({ invalidateProfileContextCache: mocks.notify, refreshProfileButton: mocks.notify });
});
afterEach(() => { configureProfileDeps(previous); configureProfileRuntimeDeps(runtimeDeps); });
async function draft(patch: object) {
  const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies('a') });
  const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'profile' } });
  expect(read.success).toBe(true);
  const snapshot = JSON.parse(read.contentItems[0].text) as { snapshotId: string; current: Record<string, unknown> };
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'profile', operation: 'update', snapshotId: snapshot.snapshotId, patch: JSON.stringify(patch), evidence, reason: 'The user reported updated details.' } });
  return { result, snapshot, proposal: { ...runtime.getDrafts()[0]!, profileId: 'a' } };
}
it('converts height, preserves a partial location and writes through profile metadata only after approval', async () => {
  const { result, snapshot, proposal } = await draft({ height: { value: 70, unit: 'in' }, location: { country: 'Czechia' } });
  expect(result.success).toBe(true); expect(writes).not.toHaveBeenCalled();
  expect(snapshot.current).not.toHaveProperty('avatar'); expect(snapshot.current).not.toHaveProperty('extra');
  for (const field of ['heightUnit', 'tags', 'notes', 'status', 'pinned']) expect(snapshot.current).not.toHaveProperty(field);
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [proposal] }))).toContain('177.8');
  await applyAgentDraft(proposal);
  expect(durable[0]).toMatchObject({ height: 177.8, heightUnit: 'cm', location: { country: 'Czechia', zip: '12345' }, tags: ['keep'], extra: { retained: true }, avatar: 'data:image/png;base64,opaque' });
  expect(mocks.sync).toHaveBeenCalled(); expect(mocks.notify).toHaveBeenCalled();
});
it('rejects a durable peer correction even when the local profile cache is stale', async () => {
  const { proposal } = await draft({ name: 'Renamed' });
  durable[0]!.name = 'Peer name';
  await expect(applyAgentDraft(proposal)).rejects.toMatchObject({ noChangeApplied: true });
  expect(writes).not.toHaveBeenCalled(); expect(durable[0]!.name).toBe('Peer name');
  const retry = await draft({ name: 'Confirmed name' });
  expect(retry.snapshot.current.name).toBe('Peer name');
  await applyAgentDraft(retry.proposal); expect(durable[0]!.name).toBe('Confirmed name');
});
it('preserves unknown metadata and other profiles added by another renderer', async () => {
  const { proposal } = await draft({ name: 'Renamed', sex: 'female', dob: '1990-05-02' });
  durable[0]!.extra = { peer: true }; durable.push({ id: 'b', name: 'Peer profile' });
  await applyAgentDraft(proposal);
  expect(durable).toHaveLength(2); expect(durable[0]).toMatchObject({ name: 'Renamed', extra: { peer: true } });
  expect(state.profileSex).toBe('female'); expect(state.profileDob).toBe('1990-05-02');
});
it('does not overwrite a field that was absent in the reviewed legacy profile', async () => {
  delete durable[0]!.sex; state.profiles = structuredClone(durable);
  const { proposal } = await draft({ sex: 'female' });
  durable[0]!.sex = 'male';
  await expect(applyAgentDraft(proposal)).rejects.toMatchObject({ noChangeApplied: true });
  expect(writes).not.toHaveBeenCalled();
});
it('rejects deleted profiles, disabled sources and cross-profile baselines', async () => {
  const { proposal } = await draft({ height: { value: 175, unit: 'cm' } });
  durable = []; await expect(applyAgentDraft(proposal)).rejects.toMatchObject({ noChangeApplied: true });
  mocks.enabled.mockReturnValue(false); await expect(applyAgentDraft(proposal)).rejects.toThrow('disabled');
  mocks.enabled.mockReturnValue(true);
  await expect(applyAgentDraft({ ...proposal, payload: { ...proposal.payload, baseline: '{"id":"other"}' } })).rejects.toMatchObject({ noChangeApplied: true });
  expect(writes).not.toHaveBeenCalled();
});
it('clears optional details and changes display units without changing physical height', () => {
  expect(projectProfileRecord(durable[0], { heightUnit: 'in', dob: null, sex: null, notes: '', tags: [] }, '2026-10-23').after).toMatchObject({ height: 170, heightUnit: 'in', dob: null, sex: null, notes: '', tags: [] });
  expect(projectProfileRecord(durable[0], { height: null }, '2026-10-23').after.height).toBeNull();
});
it('fails closed when durable metadata cannot be read without publishing an empty cache', async () => {
  configureProfileDeps({ encryptedGetItem: async () => { throw new Error('Profile storage is locked.'); } });
  const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies('a') });
  const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'profile' } });
  expect(read.success).toBe(false); expect(read.contentItems[0].text).toBe('Error: getbased context is temporarily unavailable.');
  expect(state.profiles).toEqual(durable); expect(writes).not.toHaveBeenCalled();
});
it.each([{ name: '' }, { sex: 'guess' }, { dob: '2026-02-30' }, { dob: '2027-01-01' }, { height: 70 }, { height: { value: 200, unit: 'in' } }, { heightUnit: 'ft' }, { status: 'deleted' }, { avatar: 'invented' }, { id: 'other' }, { tags: [''] }, { pinned: 'true' }])('rejects invalid or unsupported profile fields %j', async patch => {
  expect((await draft(patch)).result.success).toBe(false); expect(writes).not.toHaveBeenCalled();
});

it.each([{ heightUnit: 'in' }, { pinned: true }, { status: 'archived' }, { notes: 'Management note' }, { tags: ['new'] }])('keeps administrative profile patch %j out of both proposal and replay paths', async patch => {
  const before = structuredClone(durable);
  const rejected = await draft(patch); expect(rejected.result.success).toBe(false); expect(writes).not.toHaveBeenCalled();
  const { proposal } = await draft({ height: { value: 175, unit: 'cm' } });
  await expect(applyAgentDraft({ ...proposal, payload: { ...proposal.payload, patch: JSON.stringify(patch) } })).rejects.toThrow('native settings');
  expect(durable).toEqual(before); expect(writes).not.toHaveBeenCalled();
  const cards = projectAgentDraftCards({ agentDrafts: [{ ...proposal, payload: { ...proposal.payload, patch: JSON.stringify(patch) } }] });
  expect(cards[0]).toMatchObject({ nativeOnly: true, status: 'failed' });
});
