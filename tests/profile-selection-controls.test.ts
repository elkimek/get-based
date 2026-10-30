// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ streaming: false, attachments: false, raw: '', proofs: new Map<string, string>(), claims: new Set<string>(), failProof: false }));
vi.mock('../js/chat-runtime.js', () => ({ isChatRuntimeStreaming: () => fixture.streaming }));
vi.mock('../js/chat-images.js', () => ({ hasChatAttachmentWork: () => fixture.attachments }));
vi.mock('../js/crypto.js', () => ({ encryptedGetItem: async (key: string) => fixture.proofs.get(key) ?? null,
  encryptedSetItem: async (key: string, value: string) => { if (fixture.failProof) throw new Error('Synthetic receipt failure'); fixture.proofs.set(key, value); } }));
vi.mock('../js/agent-draft-claims.js', () => ({ claimAgentDraft: async (profile: string, id: string) => { const key = profile + '/' + id; if (fixture.claims.has(key)) throw new Error('Already attempted'); fixture.claims.add(key); } }));
import { state } from '../js/state.js';
import { rememberProfileData } from '../js/profile-data-writes.js';
import { configureProfileSelectionOwner } from '../js/profile-selection-runtime.js';
import type { ProfileSelectionOwner } from '../js/profile-selection-runtime.js';
import { readProfileDirectory, captureProfileSelection } from '../js/profile-selection.js';
import { createAppControlSession } from '../js/app-control-session.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { executeAppControl } from '../js/app-control-commands.js';
import { normalizeAppControls } from '../shared/agent-control-contract.js';
import type { AppControlRecord } from '../shared/agent-control-contract.js';
import { normalizeChatMessages } from '../js/chat-storage-safety.js';
import { restoreProfileControlReceipts, saveProfileControlReceipt } from '../js/profile-control-receipts.js';
import type { StoredProfileRecord } from '../js/profile-list-store.js';
const initial = { profile: state.currentProfile, thread: state.currentThreadId, root: state.importedData, history: state.chatHistory };
const locks = Object.getOwnPropertyDescriptor(navigator, 'locks');
let profiles: StoredProfileRecord[], priorOwner: ReturnType<typeof configureProfileSelectionOwner>, owner: ProfileSelectionOwner;
const read = vi.fn<() => Promise<StoredProfileRecord[]>>(), switchNative = vi.fn<ProfileSelectionOwner['switchProfile']>();
beforeEach(() => {
  fixture.streaming = false; fixture.attachments = false; fixture.failProof = false; fixture.proofs.clear(); fixture.claims.clear(); vi.clearAllMocks(); document.body.replaceChildren();
  state.currentProfile = 'origin'; state.currentThreadId = 'origin-thread'; state.importedData = structuredClone(initial.root); state.importedData.contextNotes = 'PRIVATE_ORIGIN_HEALTH'; state.chatHistory = [{ role: 'user', content: 'PRIVATE_ORIGIN_MESSAGE' }]; rememberProfileData(state.importedData);
  const target = structuredClone(initial.root); target.contextNotes = 'PRIVATE_TARGET_HEALTH'; fixture.raw = JSON.stringify(target);
  profiles = [{ id: 'origin', name: 'Origin', notes: 'PRIVATE_METADATA' }, { id: 'target', name: 'Destination', dob: 'PRIVATE_DOB', location: { country: 'PRIVATE_COUNTRY', zip: 'PRIVATE_ZIP' } }];
  read.mockImplementation(async () => structuredClone(profiles));
  switchNative.mockImplementation(async (id, beforePublish) => {
    if (!await beforePublish(fixture.raw)) return false;
    state.currentProfile = id; state.importedData = JSON.parse(fixture.raw); rememberProfileData(state.importedData); state.currentThreadId = 'target-thread'; state.chatHistory = [{ role: 'user', content: 'PRIVATE_TARGET_MESSAGE' }]; return true;
  });
  owner = { readProfiles: read, switchProfile: switchNative, ownsData: (profile, root) => state.currentProfile === profile && state.importedData === root,
    validateSnapshot: saved => { try { const data: unknown = JSON.parse(saved!); return !!data && typeof data === 'object' && !Array.isArray(data); } catch { return false; } } };
  priorOwner = configureProfileSelectionOwner(owner);
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: async (_key: string, _options: unknown, run: () => unknown) => run() } });
});
afterEach(() => { configureProfileSelectionOwner(priorOwner); if (locks) Object.defineProperty(navigator, 'locks', locks); else Reflect.deleteProperty(navigator, 'locks'); state.currentProfile = initial.profile; state.currentThreadId = initial.thread; state.importedData = initial.root; state.chatHistory = initial.history; document.body.replaceChildren(); });
async function review() {
  const userMessage = 'Switch to Destination.', session = createAppControlSession(userMessage, () => true, new AbortController().signal);
  const tools = createAgentToolRuntime({ readContext: () => '', userMessage, ...session.tools });
  const read = await tools.execute({ tool: 'getbased_read_app', arguments: { action: 'profile.selection', profileId: 'target' } }); expect(read.success).toBe(true);
  const snapshot = JSON.parse(read.contentItems[0]!.text) as { snapshotId: string }; expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE_|leaseId/);
  const result = await tools.execute({ tool: 'getbased_request_app', arguments: { action: 'profile.selection', snapshotId: snapshot.snapshotId, parameters: '{"profileId":"target"}', reason: 'Explicit profile request', evidence: userMessage } }); expect(result.success).toBe(true); expect(result.contentItems[0]!.text).toContain('pending_user_approval');
  return session.finish()[0]! as Extract<AppControlRecord, { action: 'profile.selection' }>;
}
it('lists only bounded names/IDs and reads the exact target without switching or disclosing health/metadata', async () => {
  const directory = await readProfileDirectory({ query: 'destination', limit: 1 }); expect(directory.profiles).toEqual([{ id: 'target', name: 'Destination', selected: false }]); expect(JSON.stringify(directory)).not.toMatch(/PRIVATE_|dob|location|notes/);
  const record = await review(); expect(record.proposed).toEqual({ id: 'target', name: 'Destination' }); expect(switchNative).not.toHaveBeenCalled(); expect(state.currentProfile).toBe('origin');
});
it('switches through the native owner and restores a verified receipt only in the originating chat', async () => {
  const record = await review(), origin = structuredClone(state.importedData), oldHistory = state.chatHistory;
  const receipt = await executeAppControl(record, false, () => true); expect(receipt).toMatchObject({ transitioned: true, receiptSaved: true, undoAvailable: false });
  expect(state.currentProfile).toBe('target'); expect(state.importedData.contextNotes).toBe('PRIVATE_TARGET_HEALTH'); expect(state.chatHistory).toEqual([{ role: 'user', content: 'PRIVATE_TARGET_MESSAGE' }]); expect(oldHistory).toEqual([{ role: 'user', content: 'PRIVATE_ORIGIN_MESSAGE' }]); expect(origin.contextNotes).toBe('PRIVATE_ORIGIN_HEALTH');
  const messages = normalizeChatMessages([{ role: 'assistant', content: 'Origin reply', appControls: [{ ...record, status: 'applying' }] }]);
  await restoreProfileControlReceipts(messages, 'origin', 'different-thread', () => true); expect(messages[0]!.appControls![0]!.status).toBe('failed');
  await restoreProfileControlReceipts(messages, 'origin', 'origin-thread', () => true); expect(messages[0]!.appControls![0]).toMatchObject({ status: 'changed', undoAvailable: false }); expect(switchNative).toHaveBeenCalledOnce();
});
it('reports a completed switch accurately if its private receipt cannot be stored', async () => {
  const record = await review(); fixture.failProof = true;
  expect(await executeAppControl(record, false, () => true)).toMatchObject({ transitioned: true, receiptSaved: false }); expect(state.currentProfile).toBe('target');
  const messages = normalizeChatMessages([{ role: 'assistant', content: 'Origin', appControls: [{ ...record, status: 'applying' }] }]); await restoreProfileControlReceipts(messages, 'origin', 'origin-thread', () => true); expect(messages[0]!.appControls![0]!.status).toBe('failed');
});
it('contains a private target-load error before publication and reports the unchanged origin accurately', async () => {
  const record = await review(); switchNative.mockRejectedValueOnce(new Error('PRIVATE_TARGET_ERROR'));
  await expect(executeAppControl(record, false, () => true)).rejects.toMatchObject({ noChangeApplied: true, message: expect.not.stringContaining('PRIVATE_') }); expect(state.currentProfile).toBe('origin');
});
it.each(['draft', 'dialog', 'message-editor', 'attachments', 'streaming', 'unsaved', 'thread', 'root', 'owner', 'metadata', 'deleted', 'bad-data', 'missing-locks'] as const)('preserves profile data and selection at the %s boundary', async boundary => {
  const record = await review();
  if (boundary === 'draft') document.body.innerHTML = '<textarea id="chat-input">Keep my draft</textarea>';
  if (boundary === 'dialog') document.body.innerHTML = '<div class="modal-overlay show"><textarea>Keep native input</textarea></div>';
  if (boundary === 'message-editor') document.body.innerHTML = '<div data-chat-message-editor-host><textarea>Keep edited message</textarea></div>';
  if (boundary === 'attachments') fixture.attachments = true; if (boundary === 'streaming') fixture.streaming = true;
  if (boundary === 'unsaved') state.importedData.contextNotes = 'Keep unsaved data'; if (boundary === 'thread') state.currentThreadId = 'different';
  if (boundary === 'root') state.importedData = structuredClone(state.importedData); if (boundary === 'owner') configureProfileSelectionOwner({ ...owner });
  if (boundary === 'metadata') profiles[1]!.name = 'Changed destination'; if (boundary === 'deleted') profiles.splice(1, 1); if (boundary === 'bad-data') fixture.raw = '{broken';
  if (boundary === 'missing-locks') Reflect.deleteProperty(navigator, 'locks');
  const before = structuredClone(state.importedData), profile = state.currentProfile;
  await expect(executeAppControl(record, false, () => true)).rejects.toMatchObject({ noChangeApplied: true }); expect(state.currentProfile).toBe(profile); expect(state.importedData).toEqual(before); expect(fixture.proofs.size).toBe(0);
  if (boundary === 'draft') expect((document.getElementById('chat-input') as HTMLTextAreaElement).value).toBe('Keep my draft');
});
it('does not choose among duplicate names without an exact ID in the accepted human message', async () => {
  profiles.push({ id: 'another', name: 'Destination' }); await expect(captureProfileSelection('target')).rejects.toMatchObject({ noChangeApplied: true });
  expect(await captureProfileSelection('target', { userMessage: 'Switch to profile target.' })).toMatchObject({ proposed: { id: 'target' } });
});
it('rechecks the exact metadata and native draft after an asynchronous target read', async () => {
  const record = await review(); let release!: () => void;
  switchNative.mockImplementationOnce(async (id, beforePublish) => { await new Promise<void>(resolve => { release = resolve; }); if (!await beforePublish(fixture.raw)) return false; state.currentProfile = id; return true; });
  const pending = executeAppControl(record, false, () => true), rejected = expect(pending).rejects.toMatchObject({ noChangeApplied: true }); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  state.importedData.contextNotes = 'New unsaved edit while reading target'; release(); await rejected; expect(state.currentProfile).toBe('origin'); expect(state.importedData.contextNotes).toBe('New unsaved edit while reading target');
});
it('cannot replay a completed native switch or derive a new approval from its receipt', async () => {
  const record = await review(); await executeAppControl(record, false, () => true);
  await expect(executeAppControl({ ...record, status: 'changed', undoAvailable: true }, true, () => true)).rejects.toThrow(); expect(switchNative).toHaveBeenCalledOnce();
});
it('rejects forged changed labels, copied approval authority and mismatched receipt payloads', async () => {
  const record = await review(); await saveProfileControlReceipt(record);
  const forged = normalizeChatMessages([{ role: 'assistant', content: 'Imported', appControls: [{ ...record, reason: 'Different requested switch', status: 'changed', undoAvailable: true }] }]);
  await restoreProfileControlReceipts(forged, 'origin', 'origin-thread', () => true); expect(forged[0]!.appControls![0]).toMatchObject({ status: 'failed', undoAvailable: false });
  expect(normalizeAppControls([{ ...record, parameters: { profileId: 'another' } }])).toEqual([]);
});
