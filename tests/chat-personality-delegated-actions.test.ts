// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderHTML } from '../js/components/ChatShell.svelte.html.js';
import { ensureChatShell } from '../js/chat-shell-component.js';
import { state } from '../js/state.js';
import * as personalities from '../js/chat-personalities.js';
import { callAssistantFeatureAI, hasAssistantFeatureProvider } from '../js/ai-feature-routing.js';
import { saveCustomPersonalitiesToStorage } from '../js/chat-personality-storage.js';
import { configureChatRuntimeCallbacks } from '../js/chat-runtime.js';
import { showConfirmDialog } from '../js/utils.js';
import { removeModalOverlay } from '../js/modal-lifecycle.js';
import { getPersonalityPickerView, personalityPickerActions } from '../js/chat-personality-picker-view.js';
vi.mock('../js/ai-feature-routing.js', () => ({ callAssistantFeatureAI: vi.fn(), hasAssistantFeatureProvider: vi.fn(() => true) }));
vi.mock('../js/utils.js', async original => ({ ...await original<typeof import('../js/utils.js')>(), showNotification: vi.fn(), showConfirmDialog: vi.fn().mockResolvedValue(true) }));
vi.mock('../js/chat-personality-storage.js', async original => ({ ...await original<typeof import('../js/chat-personality-storage.js')>(), saveCustomPersonalitiesToStorage: vi.fn().mockResolvedValue([]) }));
function field() { return document.querySelector<HTMLTextAreaElement>('.chat-personality-custom-textarea')!; }
function name() { return document.getElementById('chat-personality-custom-name') as HTMLInputElement; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => resolve = done); return { promise, resolve }; }
async function settled() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
afterEach(async () => { document.querySelectorAll('.modal-overlay').forEach(removeModalOverlay); await settled(); configureChatRuntimeCallbacks({ onChatSaved: null }); });
beforeEach(async () => {
  vi.clearAllMocks(); vi.mocked(hasAssistantFeatureProvider).mockReturnValue(true); vi.mocked(showConfirmDialog).mockResolvedValue(true);
  vi.mocked(saveCustomPersonalitiesToStorage).mockResolvedValue([]);
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
  await personalities.saveCustomPersonality(); expect(saveCustomPersonalitiesToStorage).not.toHaveBeenCalled();
  const checkbox = document.getElementById('chat-personality-agreement-checkbox') as HTMLInputElement; checkbox.checked = true; checkbox.dispatchEvent(new Event('input', { bubbles: true }));
  await personalities.saveCustomPersonality(); expect(saveCustomPersonalitiesToStorage).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ personaAgreement: expect.objectContaining({ accepted: true, version: 1, host: 'getbased.health' }) })]), 'persona-origin');
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
  const pending = deferred<Awaited<ReturnType<typeof saveCustomPersonalitiesToStorage>>>(); vi.mocked(saveCustomPersonalitiesToStorage).mockReturnValue(pending.promise);
  const saved = vi.fn(); configureChatRuntimeCallbacks({ onChatSaved: saved });
  const running = personalities.saveCustomPersonality(); await personalities.saveCustomPersonality(); expect(saveCustomPersonalitiesToStorage).toHaveBeenCalledTimes(1);
  state.currentProfile = 'persona-next'; state.currentThreadId = 'next-thread'; personalities.startNewCustomPersonality(); await settled(); name().value = 'Next'; field().value = 'Next instructions';
  pending.resolve([]); await running;
  expect(vi.mocked(saveCustomPersonalitiesToStorage).mock.calls[0]?.[1]).toBe('persona-origin'); expect(saved).toHaveBeenCalledWith({ customPersonality: true, profileId: 'persona-origin' });
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
  const pending = deferred<Awaited<ReturnType<typeof saveCustomPersonalitiesToStorage>>>(); vi.mocked(saveCustomPersonalitiesToStorage).mockReturnValue(pending.promise);
  const running = personalities.saveCustomPersonality(); field().value = 'New unsaved instructions'; field().dispatchEvent(new Event('input', { bubbles: true })); pending.resolve([]); await running;
  expect(field().value).toBe('New unsaved instructions'); expect(document.querySelector<HTMLButtonElement>('.chat-personality-custom-save')!.disabled).toBe(false);
});
it('retains further edits made while a discard confirmation is pending', async () => {
  personalities.startNewCustomPersonality(); name().value = 'Dirty'; name().dispatchEvent(new Event('input', { bubbles: true }));
  const pending = deferred<boolean>(); vi.mocked(showConfirmDialog).mockReturnValueOnce(pending.promise); const cancel = personalities.cancelCustomPersonalityEditor();
  field().value = 'Further edits'; field().dispatchEvent(new Event('input', { bubbles: true })); pending.resolve(true); await cancel;
  expect(field().value).toBe('Further edits');
});
