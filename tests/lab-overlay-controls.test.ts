// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createProfile, createDefaultProfileData, getProfiles, saveProfiles, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as crypto from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { commitLabOverlayPreferences, readLabOverlayPreferences } from '../js/lab-overlay-preferences.js';
import { setNoteOverlay, configureDataRuntimeDeps } from '../js/data-view-controls.js';
import { setContextSourceEnabled } from '../js/context-source-registry.js';
import type { LabOverlayPatch } from '../shared/lab-overlay-contract.js';
const patch: LabOverlayPatch = { notes: true, supplements: true, cycle: true };
const original = { profile: state.currentProfile, data: state.importedData, history: state.chatHistory, thread: state.currentThreadId, sex: state.profileSex, notes: state.noteOverlayMode, supps: state.suppOverlayMode, cycle: state.phaseOverlayMode }, active = localStorage.getItem('labcharts-active-profile');
const locks = Object.getOwnPropertyDescriptor(navigator, 'locks'); let profile: string;
beforeEach(async () => {
  const queues = new Map<string, Promise<unknown>>(); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (name: string, options: unknown, callback?: () => unknown) => { const run = typeof options === 'function' ? options as () => unknown : callback!; const next = (queues.get(name) || Promise.resolve()).then(run); queues.set(name, next.catch(() => {})); return next; } } });
  profile = await createProfile('Synthetic chart layers', { skipInitialSync: true }); state.currentProfile = profile; state.importedData = createDefaultProfileData(); state.chatHistory = []; state.currentThreadId = 'layer-thread'; state.profileSex = 'female'; localStorage.setItem('labcharts-active-profile', profile);
  state.noteOverlayMode = state.suppOverlayMode = state.phaseOverlayMode = 'off'; Object.assign(state.importedData, { contextNotes: 'PRIVATE_HEALTH', entries: [{ date: '2026-10-20', markers: { 'biochemistry.glucose': 5 }, context: { cyclePhase: 'luteal' }, sourceFile: 'PRIVATE_REPORT.pdf' }], notes: [{ date: '2026-10-20', text: 'PRIVATE_NOTE' }], supplements: [{ id: 'supp', name: 'PRIVATE_THERAPY' }] });
  for (const id of ['lab-markers', 'insight-cards', 'supplements-meds']) setContextSourceEnabled(id, true); expect(await saveImportedData()).toBe(true); document.body.innerHTML = '';
});
afterEach(async () => {
  vi.restoreAllMocks(); clearSyncSaveTimers(); document.body.innerHTML = ''; if (locks) Object.defineProperty(navigator, 'locks', locks); else Reflect.deleteProperty(navigator, 'locks');
  for (const name of Object.keys(localStorage).filter(name => name.startsWith(`labcharts-${profile}-`))) await crypto.encryptedRemoveItem(name); await saveProfiles(getProfiles().filter(row => row.id !== profile));
  state.currentProfile = original.profile; state.importedData = original.data; state.chatHistory = original.history; state.currentThreadId = original.thread; state.profileSex = original.sex; state.noteOverlayMode = original.notes; state.suppOverlayMode = original.supps; state.phaseOverlayMode = original.cycle;
  if (active === null) localStorage.removeItem('labcharts-active-profile'); else localStorage.setItem('labcharts-active-profile', active);
});
import { defineRetiredManagement } from './helpers/chat-management-retirement.js';
defineRetiredManagement('labs.overlays');

it('rolls back a partially failed multi-switch save before publishing cached modes', async () => {
  const writer = Storage.prototype.setItem; vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === profileStorageKey(profile, 'suppOverlay')) throw new Error('No space'); return writer.call(this, name, value); });
  await expect(commitLabOverlayPreferences(patch, { requireLocks: true })).rejects.toMatchObject({ noChangeApplied: true }); expect(readLabOverlayPreferences()).toEqual({ notes: false, supplements: false, cycle: false }); expect(state.noteOverlayMode).toBe('off'); expect(localStorage.getItem(profileStorageKey(profile, 'noteOverlay'))).toBeNull();
});
it('keeps native checkbox and cached mode unchanged on failed durable storage', async () => {
  document.body.innerHTML = '<input type="checkbox" checked data-lab-data-change="set-note-overlay">'; const writer = Storage.prototype.setItem; vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === profileStorageKey(profile, 'noteOverlay')) throw new Error('No space'); return writer.call(this, name, value); });
  setNoteOverlay('on'); await vi.waitFor(() => expect(document.querySelector<HTMLInputElement>('input')!.checked).toBe(false)); expect(state.noteOverlayMode).toBe('off'); expect(readLabOverlayPreferences().notes).toBe(false);
});
it('keeps a native save successful when the optional view repaint rejects', async () => {
  const previous = configureDataRuntimeDeps({ navigate: () => Promise.reject(new Error('Synthetic repaint rejected')) });
  try { setNoteOverlay('on'); await vi.waitFor(() => expect(readLabOverlayPreferences().notes).toBe(true)); expect(state.noteOverlayMode).toBe('on'); }
  finally { configureDataRuntimeDeps(previous); }
});
