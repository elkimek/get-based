// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createProfile, createDefaultProfileData, getProfiles, saveProfiles, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as crypto from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { createAppControlSession } from '../js/app-control-session.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { executeAppControl } from '../js/app-control-commands.js';
import { normalizeAppControls } from '../shared/agent-control-contract.js';
import { restoreLabOverlayReceipts } from '../js/lab-overlay-receipts.js';
import { commitLabOverlayPreferences, readLabOverlayPreferences } from '../js/lab-overlay-preferences.js';
import { setNoteOverlay, configureDataRuntimeDeps } from '../js/data-view-controls.js';
import { setContextSourceEnabled } from '../js/context-source-registry.js';
import { projectChatMessageActions } from '../js/chat-message-actions-contract.js';
import { buildAgentApplicationContext } from '../js/agent-chat-context.js';
import type { LabOverlayPatch } from '../shared/lab-overlay-contract.js';
const message = 'Show note markers, supplement periods and cycle phase at blood draw on my charts from now on.';
const patch: LabOverlayPatch = { notes: true, supplements: true, cycle: true };
const original = { profile: state.currentProfile, data: state.importedData, history: state.chatHistory, thread: state.currentThreadId, sex: state.profileSex, notes: state.noteOverlayMode, supps: state.suppOverlayMode, cycle: state.phaseOverlayMode }, active = localStorage.getItem('labcharts-active-profile');
const locks = Object.getOwnPropertyDescriptor(navigator, 'locks'); let profile: string, key: string;
beforeEach(async () => {
  const queues = new Map<string, Promise<unknown>>(); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (name: string, options: unknown, callback?: () => unknown) => { const run = typeof options === 'function' ? options as () => unknown : callback!; const next = (queues.get(name) || Promise.resolve()).then(run); queues.set(name, next.catch(() => {})); return next; } } });
  profile = await createProfile('Synthetic chart layers', { skipInitialSync: true }); key = profileStorageKey(profile, 'imported'); state.currentProfile = profile; state.importedData = createDefaultProfileData(); state.chatHistory = []; state.currentThreadId = 'layer-thread'; state.profileSex = 'female'; localStorage.setItem('labcharts-active-profile', profile);
  state.noteOverlayMode = state.suppOverlayMode = state.phaseOverlayMode = 'off'; Object.assign(state.importedData, { contextNotes: 'PRIVATE_HEALTH', entries: [{ date: '2026-10-20', markers: { 'biochemistry.glucose': 5 }, context: { cyclePhase: 'luteal' }, sourceFile: 'PRIVATE_REPORT.pdf' }], notes: [{ date: '2026-10-20', text: 'PRIVATE_NOTE' }], supplements: [{ id: 'supp', name: 'PRIVATE_THERAPY' }] });
  for (const id of ['lab-markers', 'insight-cards', 'supplements-meds']) setContextSourceEnabled(id, true); expect(await saveImportedData()).toBe(true); document.body.innerHTML = '';
});
afterEach(async () => {
  vi.restoreAllMocks(); clearSyncSaveTimers(); document.body.innerHTML = ''; if (locks) Object.defineProperty(navigator, 'locks', locks); else Reflect.deleteProperty(navigator, 'locks');
  for (const name of Object.keys(localStorage).filter(name => name.startsWith(`labcharts-${profile}-`))) await crypto.encryptedRemoveItem(name); await saveProfiles(getProfiles().filter(row => row.id !== profile));
  state.currentProfile = original.profile; state.importedData = original.data; state.chatHistory = original.history; state.currentThreadId = original.thread; state.profileSex = original.sex; state.noteOverlayMode = original.notes; state.suppOverlayMode = original.supps; state.phaseOverlayMode = original.cycle;
  if (active === null) localStorage.removeItem('labcharts-active-profile'); else localStorage.setItem('labcharts-active-profile', active);
});
async function prepare(parameters: LabOverlayPatch = patch) {
  const owner = createAppControlSession(message, () => true, new AbortController().signal), runtime = createAgentToolRuntime({ readContext: () => 'PRIVATE_HEALTH', userMessage: message, ...owner.tools });
  const read = await runtime.execute({ tool: 'getbased_read_app', arguments: { action: 'labs.overlays' } }); expect(read.success, read.contentItems[0].text).toBe(true); const snapshot = JSON.parse(read.contentItems[0].text);
  const proposal = await runtime.execute({ tool: 'getbased_request_app', arguments: { action: 'labs.overlays', snapshotId: snapshot.snapshotId, parameters: JSON.stringify(parameters), reason: 'Explicit chart-layer preference', evidence: message } }); expect(proposal.success, proposal.contentItems[0].text).toBe(true);
  const record = owner.finish()[0]!; if (record.action !== 'labs.overlays') throw new Error('Wrong action'); return { snapshot, record };
}
it('prepares only a permitted metadata review without reading private records or writing preferences', async () => {
  const before = await crypto.encryptedGetItem(key); for (const field of ['notes', 'supplements', 'menstrualCycle', 'entries']) Object.defineProperty(state.importedData, field, { configurable: true, get() { throw new Error('Health content accessed'); } });
  const { snapshot, record } = await prepare(); expect(JSON.stringify({ snapshot, record })).not.toMatch(/PRIVATE_|hasNotes|hasSupps|hasCycle/); expect(snapshot).toMatchObject({ status: 'read_only', reviewCreated: false, values: { notes: false, supplements: false, cycle: false } }); expect(readLabOverlayPreferences()).toEqual({ notes: false, supplements: false, cycle: false }); expect(await crypto.encryptedGetItem(key)).toBe(before);
});
it('saves all three layers only after native Apply and undoes only the reviewed switches', async () => {
  const before = await crypto.encryptedGetItem(key), { record } = await prepare(), receipt = await executeAppControl(record, false, () => true); expect(receipt.undoAvailable).toBe(true); expect(readLabOverlayPreferences()).toEqual(patch); expect(await crypto.encryptedGetItem(key)).toBe(before);
  record.status = 'changed'; await executeAppControl(record, true, () => true); expect(readLabOverlayPreferences()).toEqual({ notes: false, supplements: false, cycle: false }); expect(await crypto.encryptedGetItem(key)).toBe(before); await expect(executeAppControl(record, true, () => true)).rejects.toMatchObject({ noChangeApplied: true });
});
it('shares native UI writes and refuses stale reviews instead of overwriting a manual change', async () => {
  const { record } = await prepare({ notes: true }); setNoteOverlay('on'); await vi.waitFor(() => expect(readLabOverlayPreferences().notes).toBe(true)); expect(state.noteOverlayMode).toBe('on'); await expect(executeAppControl(record, false, () => true)).rejects.toMatchObject({ noChangeApplied: true }); expect(readLabOverlayPreferences().notes).toBe(true);
});
it('preserves unrelated layer changes during Undo', async () => {
  const { record } = await prepare({ notes: true }); await executeAppControl(record, false, () => true); record.status = 'changed'; await commitLabOverlayPreferences({ supplements: true }); await executeAppControl(record, true, () => true); expect(readLabOverlayPreferences()).toEqual({ notes: false, supplements: true, cycle: false });
});
it('refuses Undo after a reviewed switch changed and never overwrites the newer state', async () => {
  const { record } = await prepare(); await executeAppControl(record, false, () => true); record.status = 'changed'; await commitLabOverlayPreferences({ notes: false }); await expect(executeAppControl(record, true, () => true)).rejects.toMatchObject({ noChangeApplied: true }); expect(readLabOverlayPreferences()).toEqual({ notes: false, supplements: true, cycle: true });
});
it.each(['profile', 'thread', 'root', 'authorization', 'source'] as const)('refuses Apply after %s changes without a preference write', async cause => {
  const { record } = await prepare(); if (cause === 'profile') state.currentProfile = 'other'; if (cause === 'thread') state.currentThreadId = 'other'; if (cause === 'root') state.importedData = structuredClone(state.importedData); if (cause === 'source') setContextSourceEnabled('insight-cards', false);
  await expect(executeAppControl(record, false, () => cause !== 'authorization')).rejects.toMatchObject({ noChangeApplied: true }); expect(localStorage.getItem(profileStorageKey(profile, 'noteOverlay'))).toBeNull();
});
it('rolls back a partially failed multi-switch save before publishing cached modes', async () => {
  const writer = Storage.prototype.setItem; vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === profileStorageKey(profile, 'suppOverlay')) throw new Error('No space'); return writer.call(this, name, value); });
  await expect(commitLabOverlayPreferences(patch, { requireLocks: true })).rejects.toMatchObject({ noChangeApplied: true }); expect(readLabOverlayPreferences()).toEqual({ notes: false, supplements: false, cycle: false }); expect(state.noteOverlayMode).toBe('off'); expect(localStorage.getItem(profileStorageKey(profile, 'noteOverlay'))).toBeNull();
});
it('keeps native checkbox and cached mode unchanged on failed durable storage', async () => {
  document.body.innerHTML = '<input type="checkbox" checked data-lab-data-change="set-note-overlay">'; const writer = Storage.prototype.setItem; vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === profileStorageKey(profile, 'noteOverlay')) throw new Error('No space'); return writer.call(this, name, value); });
  setNoteOverlay('on'); await vi.waitFor(() => expect(document.querySelector<HTMLInputElement>('input')!.checked).toBe(false)); expect(state.noteOverlayMode).toBe('off'); expect(readLabOverlayPreferences().notes).toBe(false);
});
it('withholds Undo when proof storage fails while keeping the layer save truthful', async () => {
  const { record } = await prepare(), write = crypto.encryptedSetItem; vi.spyOn(crypto, 'encryptedSetItem').mockImplementation((name, ...args) => name.includes('-app-control-') ? Promise.reject(new Error('Proof failed')) : write(name, ...args)); expect(await executeAppControl(record, false, () => true)).toMatchObject({ undoAvailable: false, receiptSaved: false }); expect(readLabOverlayPreferences()).toEqual(patch);
});
it('does not change switches or offer a replay when recording an Undo attempt fails', async () => {
  const { record } = await prepare(); await executeAppControl(record, false, () => true); record.status = 'changed'; const write = crypto.encryptedSetItem;
  vi.spyOn(crypto, 'encryptedSetItem').mockImplementation((name, ...args) => name.includes('-app-control-') ? Promise.reject(new Error('Attempt proof failed')) : write(name, ...args));
  await expect(executeAppControl(record, true, () => true)).rejects.toMatchObject({ noChangeApplied: true }); expect(readLabOverlayPreferences()).toEqual(patch);
  vi.restoreAllMocks(); const restored = normalizeAppControls([record]); await restoreLabOverlayReceipts([{ appControls: restored }], profile, record.threadId, () => true); expect(restored[0]).toMatchObject({ status: 'changed', undoAvailable: false });
});
it('keeps a native save successful when the optional view repaint rejects', async () => {
  const previous = configureDataRuntimeDeps({ navigate: () => Promise.reject(new Error('Synthetic repaint rejected')) });
  try { setNoteOverlay('on'); await vi.waitFor(() => expect(readLabOverlayPreferences().notes).toBe(true)); expect(state.noteOverlayMode).toBe('on'); }
  finally { configureDataRuntimeDeps(previous); }
});
it('expires restored pending reviews and authenticates saved and undone labels with native proof', async () => {
  const { record } = await prepare(); expect(normalizeAppControls([record])[0]!.status).toBe('expired'); const forged = normalizeAppControls([{ ...record, status: 'changed', undoAvailable: true }]); await restoreLabOverlayReceipts([{ appControls: forged }], profile, record.threadId, () => true); expect(forged[0]!.status).toBe('failed');
  await executeAppControl(record, false, () => true); const saved = normalizeAppControls([{ ...record, status: 'changed' }]); await restoreLabOverlayReceipts([{ appControls: saved }], profile, record.threadId, () => true); expect(saved[0]).toMatchObject({ status: 'changed', undoAvailable: true }); await executeAppControl(saved[0]!, true, () => true);
  const undone = normalizeAppControls([{ ...record, status: 'undone' }]); await restoreLabOverlayReceipts([{ appControls: undone }], profile, record.threadId, () => true); expect(undone[0]).toMatchObject({ status: 'undone', undoAvailable: false });
});
it('withholds restored Undo after an interrupted attempt or newer manual switch', async () => {
  const { record } = await prepare(); await executeAppControl(record, false, () => true); await commitLabOverlayPreferences({ notes: false }); const saved = normalizeAppControls([{ ...record, status: 'changed', undoAvailable: true }]); await restoreLabOverlayReceipts([{ appControls: saved }], profile, record.threadId, () => true); expect(saved[0]).toMatchObject({ status: 'changed', undoAvailable: false });
});
it('hides disabled layer reviews in cards and future model metadata', async () => {
  const { record } = await prepare(); state.chatHistory = [{ role: 'assistant', content: '', appControls: [record] }]; expect(projectChatMessageActions(state.chatHistory, 0)!.reviews.filter(review => review.kind === 'app').map(review => review.control)).toHaveLength(1); setContextSourceEnabled('insight-cards', false); expect(projectChatMessageActions(state.chatHistory, 0)!.reviews.filter(review => review.kind === 'app').map(review => review.control)).toHaveLength(0); expect(buildAgentApplicationContext('', state.chatHistory)).not.toContain(record.id);
});
it('omits cycle or disabled-source switches without reading their health content and refuses guessed parameters', async () => {
  state.profileSex = 'male'; setContextSourceEnabled('supplements-meds', false); const owner = createAppControlSession(message, () => true, new AbortController().signal), read = await owner.tools.readAppState({ action: 'labs.overlays' }) as { values: unknown; snapshotId: string }; expect(read.values).toEqual({ notes: false }); await expect(owner.tools.prepareAppControl({ action: 'labs.overlays', snapshotId: read.snapshotId, parameters: '{"cycle":true}', reason: 'Requested', evidence: message })).rejects.toMatchObject({ noChangeApplied: true });
});
