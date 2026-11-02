// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderHTML } from '../js/components/ChatShell.svelte.html.js';
import { ensureChatShell } from '../js/chat-shell-component.js';
import { state } from '../js/state.js';
import { openPreparedPersonaEditor } from '../js/chat-personality-editing.js';
import * as personalities from '../js/chat-personalities.js';
import { callAssistantFeatureAI, hasAssistantFeatureProvider } from '../js/ai-feature-routing.js';
import { captureCustomPersonalityEdit, commitCustomPersonalityEdit, PersonaStorageConflict } from '../js/chat-personality-storage.js';
import { configureChatRuntimeCallbacks } from '../js/chat-runtime.js';
import { showConfirmDialog, showNotification } from '../js/utils.js';
import { removeModalOverlay } from '../js/modal-lifecycle.js';
import { getPersonalityPickerView, personalityPickerActions } from '../js/chat-personality-picker-view.js';
vi.mock('../js/ai-feature-routing.js', () => ({ callAssistantFeatureAI: vi.fn(), hasAssistantFeatureProvider: vi.fn(() => true) }));
vi.mock('../js/utils.js', async original => ({ ...await original<typeof import('../js/utils.js')>(), showNotification: vi.fn(), showConfirmDialog: vi.fn().mockResolvedValue(true) }));
vi.mock('../js/chat-personality-storage.js', async original => ({ ...await original<typeof import('../js/chat-personality-storage.js')>(), captureCustomPersonalityEdit: vi.fn(), commitCustomPersonalityEdit: vi.fn() }));
function field() { return document.querySelector<HTMLTextAreaElement>('.chat-personality-custom-textarea')!; }
function name() { return document.getElementById('chat-personality-custom-name') as HTMLInputElement; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => resolve = done); return { promise, resolve }; }
async function settled() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
afterEach(async () => { document.querySelectorAll('.modal-overlay').forEach(removeModalOverlay); await settled(); configureChatRuntimeCallbacks({ onChatSaved: null }); });
beforeEach(async () => {
  vi.clearAllMocks(); vi.mocked(hasAssistantFeatureProvider).mockReturnValue(true); vi.mocked(showConfirmDialog).mockResolvedValue(true);
  vi.mocked(captureCustomPersonalityEdit).mockImplementation(async id => ({ id: id || 'custom_mock', leaseId: id || 'custom_mock' }));
  vi.mocked(commitCustomPersonalityEdit).mockImplementation(async (leaseId, fields) => ({ id: leaseId, profileId: 'persona-origin', name: fields.name, icon: fields.icon || 'P', saved: true, leaseId: 'renewed', recoveryPending: false, isCurrent: () => true }));
  localStorage.clear(); state.currentProfile = 'persona-origin'; state.currentThreadId = 'persona-thread'; state.currentChatPersonality = 'default'; state.chatThreads = []; state.chatHistory = [];
  const host = document.createElement('div'); host.id = 'chat-shell-host'; host.innerHTML = renderHTML(); document.body.replaceChildren(host); ensureChatShell(); await settled();
  personalities.updatePersonalityBar();
});
it('renders literal custom metadata and owns edit/add without global delegates', () => {
  localStorage.setItem('labcharts-persona-origin-chatPersonalityCustom', JSON.stringify([{ id: 'custom_literal', name: '<img src=x onerror=alert(1)>', icon: '🌿', promptText: 'Literal instructions' }]));
  personalities.updatePersonalityBar();
  expect(document.querySelector('#chat-personality-custom-section img')).toBeNull();
  expect(document.querySelector('#chat-personality-custom-section')!.textContent).toContain('<img src=x onerror=alert(1)>');
  document.querySelector<HTMLButtonElement>('.chat-personality-edit')!.click();
  expect(name().value).toBe('<img src=x onerror=alert(1)>'); expect(field().value).toBe('Literal instructions'); expect(state.currentChatPersonality).toBe('default');
  expect(document.querySelector('#chat-personality-editor-overlay [onclick]')).toBeNull();
});
it('releases stale picker callbacks when the shell is replaced', async () => {
  const old = getPersonalityPickerView()!; expect(old.isCurrent()).toBe(true);
  document.body.replaceChildren(); expect(old.isCurrent()).toBe(false); expect(getPersonalityPickerView()).toBeNull(); await settled();
});
it('keeps required hosted consent explicit and blocks saves until accepted', async () => {
  personalities.startNewCustomPersonality({ hostname: 'getbased.health' }); name().value = 'A careful reviewer'; field().value = 'Review carefully.'; personalities.markPersonalityDirty();
  await personalities.saveCustomPersonality(); expect(commitCustomPersonalityEdit).not.toHaveBeenCalled();
  const checkbox = document.getElementById('chat-personality-agreement-checkbox') as HTMLInputElement; checkbox.checked = true; checkbox.dispatchEvent(new Event('input', { bubbles: true }));
  await personalities.saveCustomPersonality(); expect(commitCustomPersonalityEdit).toHaveBeenCalledWith('custom_mock', expect.objectContaining({ name: 'A careful reviewer', promptText: 'Review carefully.', personaAgreement: expect.objectContaining({ accepted: true, version: 1, host: 'getbased.health' }) }), expect.objectContaining({ canCommit: expect.any(Function) }));
  expect(captureCustomPersonalityEdit).toHaveBeenCalledWith(null, 'persona-origin', undefined);
});
it('does not overwrite a draft edited while generation streams or completes', async () => {
  personalities.startNewCustomPersonality(); name().value = 'Reviewer'; field().value = 'Original';
  const pending = deferred<{ text: string; }>(); vi.mocked(callAssistantFeatureAI).mockReturnValue(pending.promise);
  const running = personalities.generateCustomPersonality();
  const options = vi.mocked(callAssistantFeatureAI).mock.calls[0]![0]; options.onStream?.('First streamed draft'); expect(field().value).toBe('First streamed draft');
  field().value = 'My own revised instructions'; field().dispatchEvent(new Event('input', { bubbles: true })); options.onStream?.('Late stream'); pending.resolve({ text: '🌿\n\nLate final draft' }); await running;
  expect(field().value).toBe('My own revised instructions'); expect((document.getElementById('chat-personality-generate-btn') as HTMLButtonElement).disabled).toBe(false);
});
it('does not apply a generated result to a replacement editor', async () => {
  personalities.startNewCustomPersonality(); name().value = 'Old'; const pending = deferred<{ text: string; }>(); vi.mocked(callAssistantFeatureAI).mockReturnValue(pending.promise);
  const running = personalities.generateCustomPersonality(); personalities.startNewCustomPersonality(); name().value = 'New'; field().value = 'New draft'; pending.resolve({ text: '🔥\n\nOld result' }); await running;
  expect(name().value).toBe('New'); expect(field().value).toBe('New draft');
});
it('persists an accepted save for its original profile and does not close a newer editor', async () => {
  personalities.startNewCustomPersonality(); name().value = 'Origin'; field().value = 'Origin instructions';
  const pending = deferred<Awaited<ReturnType<typeof commitCustomPersonalityEdit>>>(); vi.mocked(commitCustomPersonalityEdit).mockReturnValue(pending.promise);
  const saved = vi.fn(); configureChatRuntimeCallbacks({ onChatSaved: saved });
  const running = personalities.saveCustomPersonality(); await personalities.saveCustomPersonality(); await vi.waitFor(() => expect(commitCustomPersonalityEdit).toHaveBeenCalledTimes(1));
  state.currentProfile = 'persona-next'; state.currentThreadId = 'next-thread'; personalities.startNewCustomPersonality(); await settled(); name().value = 'Next'; field().value = 'Next instructions';
  pending.resolve({ id: 'custom_mock', profileId: 'persona-origin', name: 'Origin', icon: 'O', saved: true, leaseId: null, recoveryPending: false, isCurrent: () => true }); await running;
  expect(vi.mocked(captureCustomPersonalityEdit).mock.calls[0]?.[1]).toBe('persona-origin'); expect(vi.mocked(commitCustomPersonalityEdit).mock.calls[0]?.[0]).toBe('custom_mock'); expect(saved).toHaveBeenCalledWith({ customPersonality: true, profileId: 'persona-origin' });
  expect(name().value).toBe('Next'); expect(field().value).toBe('Next instructions'); expect(state.currentChatPersonality).toBe('default');
});
it('does not let a delayed discard confirmation close a replacement editor', async () => {
  personalities.startNewCustomPersonality(); name().value = 'Dirty'; name().dispatchEvent(new Event('input', { bubbles: true }));
  const pending = deferred<boolean>(); vi.mocked(showConfirmDialog).mockReturnValueOnce(pending.promise); const cancel = personalities.cancelCustomPersonalityEditor();
  document.getElementById('chat-personality-editor-overlay')!.remove(); await settled(); personalities.snapshotPersonalityClean(); personalities.startNewCustomPersonality(); name().value = 'Replacement';
  pending.resolve(true); await cancel; expect(name().value).toBe('Replacement');
});

it('rejects an old rendered picker action after changing profiles', async () => {
  localStorage.setItem('labcharts-persona-origin-chatPersonalityCustom', JSON.stringify([{ id: 'custom_origin', name: 'Origin', icon: 'O', promptText: 'Origin' }])); personalities.updatePersonalityBar();
  const root = document.querySelector<HTMLElement>('[data-chat-personality-view]')!;
  let version = 0; const view = getPersonalityPickerView()!; const render = view.render;
  view.render = next => { version = next.version; render(next); }; personalities.updatePersonalityBar(); view.render = render;
  state.currentProfile = 'other'; personalityPickerActions(root)!.edit('custom_origin', version);
  expect(document.getElementById('chat-personality-editor-overlay')).toBeNull();
  await personalityPickerActions(root)!.select('custom_origin', version); expect(state.currentChatPersonality).toBe('default');
});
it('retains edits made while an accepted save is pending', async () => {
  personalities.startNewCustomPersonality(); name().value = 'Original'; field().value = 'Saved instructions';
  const pending = deferred<Awaited<ReturnType<typeof commitCustomPersonalityEdit>>>(); vi.mocked(commitCustomPersonalityEdit).mockReturnValue(pending.promise);
  const running = personalities.saveCustomPersonality(); field().value = 'New unsaved instructions'; field().dispatchEvent(new Event('input', { bubbles: true })); pending.resolve({ id: 'custom_mock', profileId: 'persona-origin', name: 'Original', icon: 'O', saved: true, leaseId: 'renewed', recoveryPending: false, isCurrent: () => true }); await running;
  expect(field().value).toBe('New unsaved instructions'); expect(document.querySelector<HTMLButtonElement>('.chat-personality-custom-save')!.disabled).toBe(false);
});
it('retains further edits made while a discard confirmation is pending', async () => {
  personalities.startNewCustomPersonality(); name().value = 'Dirty'; name().dispatchEvent(new Event('input', { bubbles: true }));
  const pending = deferred<boolean>(); vi.mocked(showConfirmDialog).mockReturnValueOnce(pending.promise); const cancel = personalities.cancelCustomPersonalityEditor();
  field().value = 'Further edits'; field().dispatchEvent(new Event('input', { bubbles: true })); pending.resolve(true); await cancel;
  expect(field().value).toBe('Further edits');
});
it('keeps a draft and disables another Save when persistence is uncertain', async () => {
  vi.mocked(commitCustomPersonalityEdit).mockRejectedValueOnce(new PersonaStorageConflict('Persona outcome unconfirmed', true));
  personalities.startNewCustomPersonality(); name().value = 'Retained'; field().value = 'Keep this unsaved draft'; personalities.markPersonalityDirty();
  await personalities.saveCustomPersonality(); expect(field().value).toBe('Keep this unsaved draft');
  field().value = 'Keep this newer draft too'; field().dispatchEvent(new Event('input', { bubbles: true }));
  expect(document.querySelector<HTMLButtonElement>('.chat-personality-custom-save')!.disabled).toBe(true);
  await personalities.saveCustomPersonality(); expect(commitCustomPersonalityEdit).toHaveBeenCalledTimes(1);
});
it('does not submit a saved draft against a replaced health-data owner', async () => {
  const pending = deferred<Awaited<ReturnType<typeof captureCustomPersonalityEdit>>>(); vi.mocked(captureCustomPersonalityEdit).mockReturnValueOnce(pending.promise);
  personalities.startNewCustomPersonality(); name().value = 'Draft'; field().value = 'Original owner only'; const running = personalities.saveCustomPersonality();
  state.importedData = { ...state.importedData }; pending.resolve({ id: 'custom_mock', leaseId: 'custom_mock' }); await running;
  expect(commitCustomPersonalityEdit).not.toHaveBeenCalled(); expect(field().value).toBe('Original owner only');
});
it('rechecks hosted agreement acceptance at the native commit boundary', async () => {
  personalities.startNewCustomPersonality({ hostname: 'getbased.health' }); name().value = 'Reviewed'; field().value = 'Reviewed instructions';
  const checkbox = document.getElementById('chat-personality-agreement-checkbox') as HTMLInputElement; checkbox.checked = true;
  vi.mocked(commitCustomPersonalityEdit).mockImplementationOnce(async (_lease, _fields, options) => {
    checkbox.checked = false; expect(options.canCommit()).toBe(false); throw new PersonaStorageConflict('Agreement was revoked before saving.');
  });
  await personalities.saveCustomPersonality(); expect(field().value).toBe('Reviewed instructions'); expect(document.querySelector<HTMLButtonElement>('.chat-personality-custom-save')!.disabled).toBe(true);
});
it('keeps a verified save successful when notifying sync fails', async () => {
  configureChatRuntimeCallbacks({ onChatSaved: () => { throw new Error('Synthetic observer failure'); } });
  personalities.startNewCustomPersonality(); name().value = 'Saved'; field().value = 'Stored instructions'; await personalities.saveCustomPersonality();
  expect(commitCustomPersonalityEdit).toHaveBeenCalledTimes(1); expect(showNotification).toHaveBeenCalledWith('Custom personality saved on this device. Sync could not be notified.', 'success'); expect(document.getElementById('chat-personality-editor-overlay')).toBeNull();
});
it('keeps a retired data owner draft until its visible editor receives explicit discard approval', async () => {
  personalities.startNewCustomPersonality(); name().value = 'Retained draft'; name().dispatchEvent(new Event('input', { bubbles: true })); field().value = 'Keep after a root replacement';
  state.importedData = { ...state.importedData }; vi.mocked(showConfirmDialog).mockResolvedValueOnce(false);
  await personalities.cancelCustomPersonalityEditor(); expect(showConfirmDialog).toHaveBeenCalledWith('Discard your unsaved personality changes?'); expect(field().value).toBe('Keep after a root replacement');
  vi.mocked(showConfirmDialog).mockResolvedValueOnce(true); await personalities.cancelCustomPersonalityEditor(); expect(document.getElementById('chat-personality-editor-overlay')).toBeNull(); expect(commitCustomPersonalityEdit).not.toHaveBeenCalled();
});

it('prepares an append in the native editor without reading instructions into tool output or saving', () => {
  const key = 'labcharts-persona-origin-chatPersonalityCustom', original = { id: 'custom_draft', name: 'Private reviewer', icon: 'R', promptText: 'PRIVATE_ORIGINAL_INSTRUCTIONS' };
  localStorage.setItem(key, JSON.stringify([original])); const before = localStorage.getItem(key);
  expect(openPreparedPersonaEditor(original.id, { promptText: 'Use concise responses.', promptMode: 'append' }, () => true)).toBe(true);
  expect(field().value).toBe(original.promptText + '\n\nUse concise responses.'); expect(name().value).toBe(original.name);
  expect(localStorage.getItem(key)).toBe(before); expect(vi.mocked(commitCustomPersonalityEdit)).not.toHaveBeenCalled();
  expect((document.querySelector('.chat-personality-custom-save') as HTMLButtonElement).disabled).toBe(false);
});
it('prepares a name-only edit while keeping native instruction text unchanged', () => {
  localStorage.setItem('labcharts-persona-origin-chatPersonalityCustom', JSON.stringify([{ id: 'custom_draft', name: 'Original', icon: 'R', promptText: 'PRIVATE_ORIGINAL' }]));
  expect(openPreparedPersonaEditor('custom_draft', { name: 'New name' }, () => true)).toBe(true); expect(field().value).toBe('PRIVATE_ORIGINAL'); expect(name().value).toBe('New name');
});
it('requires hosted agreement acceptance after a model-prepared new draft', () => {
  expect(openPreparedPersonaEditor(null, { name: 'New reviewer', promptText: 'Use concise responses.' }, () => true, { hostname: 'getbased.health' })).toBe(true);
  expect((document.querySelector('#chat-personality-agreement-checkbox') as HTMLInputElement).checked).toBe(false);
  expect((document.querySelector('.chat-personality-custom-save') as HTMLButtonElement).disabled).toBe(true);
});
it('keeps an existing dirty native draft when a second model-prepared draft arrives', () => {
  expect(openPreparedPersonaEditor(null, { promptText: 'Keep this first draft.' }, () => true)).toBe(true);
  expect(openPreparedPersonaEditor(null, { promptText: 'Do not replace the first draft.' }, () => true)).toBe(false); expect(field().value).toBe('Keep this first draft.');
});
it('does not open a prepared editor after its source authority ends', () => {
  expect(openPreparedPersonaEditor(null, { promptText: 'Do not open this draft.' }, () => false)).toBe(false); expect(document.querySelector('#chat-personality-editor-overlay')).toBeNull();
});

it('keeps a reviewed definition save available during a reply without claiming its label was refreshed', async () => {
  localStorage.setItem('labcharts-persona-origin-chatPersonalityCustom', JSON.stringify([{ id: 'custom_selected', name: 'Selected', icon: 'S', promptText: 'Old instructions' }])); state.currentChatPersonality = 'custom_selected'; personalities.editCustomPersonality('custom_selected'); field().value = 'Keep this reviewed new draft.';
  configureChatRuntimeCallbacks({ isChatStreaming: () => true });
  try { await personalities.saveCustomPersonality(); expect(commitCustomPersonalityEdit).toHaveBeenCalledWith('custom_selected', expect.objectContaining({ promptText: 'Keep this reviewed new draft.' }), expect.anything()); expect(showNotification).toHaveBeenCalledWith('Persona saved. The conversation label update was not confirmed.', 'info'); }
  finally { configureChatRuntimeCallbacks({ isChatStreaming: null }); }
});
