// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { navigateFromAgent, bindAgentToolDependenciesToProfile } from '../js/agent-tool-bindings.js';
const native = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('../js/app-navigation-runtime.js', () => ({ openNativeAppDestination: native.open }));
const original = { profile: state.currentProfile, data: state.importedData, thread: state.currentThreadId, history: state.chatHistory };
beforeEach(() => { state.currentProfile = 'receipt-origin'; state.importedData = createDefaultProfileData(); state.currentThreadId = 'receipt-thread'; state.chatHistory = []; native.open.mockReset(); document.body.innerHTML = '<main id="main-content"><p>Native view</p></main><div id="modal-overlay"><div id="detail-modal"></div></div>'; });
afterEach(() => { state.currentProfile = original.profile; state.importedData = original.data; state.currentThreadId = original.thread; state.chatHistory = original.history; document.body.innerHTML = ''; });
it.each(['profile', 'thread', 'root', 'history', 'abort'] as const)('preserves a redacted uncertain outcome after %s retirement through the real navigation wrappers', async cause => {
  let active = true; native.open.mockImplementationOnce(async () => { if (cause === 'profile') state.currentProfile = 'replacement'; if (cause === 'thread') state.currentThreadId = 'replacement'; if (cause === 'root') state.importedData = createDefaultProfileData(); if (cause === 'history') state.chatHistory = []; if (cause === 'abort') active = false; return { changed: false, persistenceUncertain: true, opened: 'PRIVATE_VIEW', undoId: 'PRIVATE_PROOF', details: 'PRIVATE_SELECTION' }; });
  const deps = bindAgentToolDependenciesToProfile({ navigate: request => navigateFromAgent(request, () => active) }, 'receipt-origin'); const result = await deps.navigate({ view: 'nutritionHistory', marker: '' }); expect(result).toMatchObject({ changed: false, persistenceUncertain: true, dataSaved: false }); expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|undoId|details|opened/);
});
it('retains a confirmed save without private presentation details after thread retirement', async () => {
  native.open.mockImplementationOnce(async () => { state.currentThreadId = 'replacement'; return { changed: true, settingsSaved: true, opened: 'PRIVATE_VIEW', undoId: 'PRIVATE_PROOF' }; }); expect(await navigateFromAgent({ view: 'nutritionHistory', marker: '' })).toEqual({ changed: true, settingsSaved: true, dataSaved: false, reason: expect.any(String) });
});

it('leaves AI Settings to native UI without dispatching navigation', async () => {
  const before = structuredClone(state.importedData);
  await expect(navigateFromAgent({ view: 'aiSettings', marker: '' })).rejects.toThrow('native settings');
  expect(native.open).not.toHaveBeenCalled();
  expect(state.importedData).toEqual(before);
  expect(document.querySelector('#settings-modal-overlay')).toBeNull();
});
