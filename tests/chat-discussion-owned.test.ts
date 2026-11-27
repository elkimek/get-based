// @vitest-environment jsdom
import {createRequire} from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INITIAL_CHAT_DISCUSSION, configureChatDiscussionContext, currentChatDiscussion,
  ownChatDiscussion, publishDiscussionButton, publishDiscussionPicker, publishDiscussionRound,
  publishDiscussionProgress, publishDiscussionSaving, selectDiscussionPersona, discussionPickerSelection,
  closeOwnedDiscussionPicker, guardDiscussionAction, type ChatDiscussionView,
} from '../js/chat-discussion-view.js';
import { registerChatComposerInput, ownChatComposerPlaceholder, publishChatComposerPlaceholder } from '../js/chat-composer-input-port.js';
let root: HTMLElement, scope: string, view: ChatDiscussionView, dispose: () => void;
const options = [{ id: 'a', name: '<img src=x onerror=alert(1)>', icon: '🔬', locked: true }, { id: 'b', name: 'House', icon: '🦯', locked: false }, { id: 'c', name: 'Third', icon: '', locked: false }];
beforeEach(() => {
  document.body.innerHTML = '<div data-chat-discussion-view><button id="chat-discuss-btn"></button><textarea id="chat-input"></textarea></div>';
  root = document.querySelector('[data-chat-discussion-view]')!; scope = 'origin'; configureChatDiscussionContext(() => scope);
  view = { ...INITIAL_CHAT_DISCUSSION }; dispose = ownChatDiscussion(root, next => { view = next; }).destroy;
});
afterEach(() => { dispose(); });
describe('composer-owned discussion selection and lifetime', () => {
  it('blocks discussion actions during a durable save and restores them after failure', () => {
    publishDiscussionRound(scope, {participants: ['Analyst', 'House'], pending: 1, progress: ''});
    publishDiscussionSaving(true); expect(view.round?.saving).toBe(true);
    const blocked = new MouseEvent('click', {cancelable: true}); guardDiscussionAction(root, blocked); expect(blocked.defaultPrevented).toBe(true);
    publishDiscussionSaving(false); expect(view.round?.participants).toEqual(['Analyst', 'House']);
    const retry = new MouseEvent('click', {cancelable: true}); guardDiscussionAction(root, retry); expect(retry.defaultPrevented).toBe(false);
  });
  it('requires one additional perspective and preserves literal metadata', () => {
    publishDiscussionPicker(scope, { options, selected: [], addingToExisting: false });
    expect(discussionPickerSelection(view.picker)).toBeNull();
    selectDiscussionPersona(root, 'b', true);
    expect(discussionPickerSelection(view.picker)).toEqual({ allPersonas: options.slice(0, 2).map(({ id, name, icon }) => ({ id, name, icon })), newPersonas: [{ id: 'b', name: 'House', icon: '🦯' }], addingToExisting: false });
  });
  it('requires two fresh choices when there is no locked current persona', () => {
    publishDiscussionPicker(scope, { options: options.map(option => ({ ...option, locked: false })), selected: [], addingToExisting: false });
    selectDiscussionPersona(root, 'b', true); expect(discussionPickerSelection(view.picker)).toBeNull();
    selectDiscussionPersona(root, 'c', true); expect(discussionPickerSelection(view.picker)?.newPersonas).toHaveLength(2);
  });
  it('ignores unknown, locked and excess choices; deselection permits another participant', () => {
    publishDiscussionPicker(scope, { options, selected: [], addingToExisting: true });
    selectDiscussionPersona(root, 'unknown', true); selectDiscussionPersona(root, 'a', false); expect(view.picker?.selected).toEqual([]);
    selectDiscussionPersona(root, 'b', true); selectDiscussionPersona(root, 'c', true); expect(view.picker?.selected).toEqual(['b']);
    selectDiscussionPersona(root, 'b', false); selectDiscussionPersona(root, 'c', true); expect(view.picker?.selected).toEqual(['c']);
  });
  it('rejects manipulated selections and preserves all locked participants when adding', () => {
    expect(discussionPickerSelection({ options, selected: ['unknown'], addingToExisting: true })).toBeNull();
    const picker = { options: options.map((option, i) => ({ ...option, locked: i < 2 })), selected: ['c'], addingToExisting: true };
    expect(discussionPickerSelection(picker)?.allPersonas.map(persona => persona.id)).toEqual(['a', 'b', 'c']);
  });
  it.each(['profile', 'thread'])('rejects obsolete %s controls before delegated domain actions', boundary => {
    publishDiscussionPicker(scope, { options, selected: ['b'], addingToExisting: false }); scope = boundary;
    selectDiscussionPersona(root, 'b', false); expect(view.picker?.selected).toEqual(['b']); expect(currentChatDiscussion()).toBeNull();
    const event = new MouseEvent('click', { cancelable: true }); const stop = vi.spyOn(event, 'stopImmediatePropagation');
    guardDiscussionAction(root, event); expect(event.defaultPrevented).toBe(true); expect(stop).toHaveBeenCalledOnce();
  });
  it('clears previous conversation presentation when a new scope is published', () => {
    publishDiscussionRound(scope, { participants: ['Analyst', 'House'], pending: 1, progress: '' });
    publishDiscussionPicker(scope, { options, selected: ['b'], addingToExisting: true });
    scope = 'next'; publishDiscussionButton(scope, { visible: true, dim: false, active: false });
    expect(view).toMatchObject({ scope: 'next', round: null, picker: null, visible: true });
  });
  it('publishes accessible progress without changing participant or pending state', () => {
    publishDiscussionRound(scope, { participants: ['Analyst', 'House'], pending: 1, progress: '' });
    publishDiscussionProgress('House is responding · 2 of 2'); expect(view.round).toEqual({ participants: ['Analyst', 'House'], pending: 1, progress: 'House is responding · 2 of 2' });
    publishDiscussionProgress(''); expect(view.round?.progress).toBe('');
  });
  it('closes the picker and restores trigger focus', () => {
    publishDiscussionPicker(scope, { options, selected: ['b'], addingToExisting: true }); closeOwnedDiscussionPicker(root, true);
    expect(view.picker).toBeNull(); expect(document.activeElement?.id).toBe('chat-discuss-btn');
  });
  it.each(['removed', 'replaced', 'disposed'])('retires %s composer controls', boundary => {
    publishDiscussionPicker(scope, { options, selected: ['b'], addingToExisting: true });
    if (boundary === 'removed') root.remove(); else if (boundary === 'replaced') { const other = root.cloneNode(true); root.replaceWith(other); } else dispose();
    expect(currentChatDiscussion()).toBeNull(); expect(publishDiscussionRound(scope, null)).toBe(false);
    selectDiscussionPersona(root, 'b', false); expect(view.picker?.selected).toEqual(['b']);
  });
});
it('lets the current Svelte input own backend placeholders and retires its publication port', () => {
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  const inputOwner = registerChatComposerInput(input), render = vi.fn();
  const presentation = ownChatComposerPlaceholder(input, render); publishChatComposerPlaceholder('AI features are paused');
  expect(render).toHaveBeenCalledExactlyOnceWith('AI features are paused');
  inputOwner.destroy(); publishChatComposerPlaceholder(null); expect(render).toHaveBeenCalledTimes(1); presentation.destroy();
});

const load = createRequire(import.meta.url);
it('keeps the native discussion controls scoped through selection, pause, and save', async () => {
  dispose();
  const model = load('../js/chat-discussion-view.js') as typeof import('../js/chat-discussion-view.js');
  model.configureChatDiscussionContext(() => scope);
  const native = load('../js/components/ChatComposer.svelte.native.js') as typeof import('../js/components/ChatComposer.svelte.native.js');
  const host = document.createElement('section');
  document.body.replaceChildren(host);
  const mounted = native.mount(native.default, {target: host});
  native.flushSync();
  const action = (id: string) => host.querySelector<HTMLButtonElement>('[data-chat-message-action="' + id + '"]')!;
  const pick = (id: string) => host.querySelector<HTMLInputElement>('input[type="checkbox"][value="' + id + '"]')!;
  const start = () => action('start-discussion-from-picker');
  try {
    model.publishDiscussionButton(scope, {visible: true, dim: false, active: false});
    model.publishDiscussionPicker(scope, {options, selected: [], addingToExisting: false});
    expect(start().disabled).toBe(true);
    expect(pick('a').disabled).toBe(true);
    expect(host.querySelector('img')).toBeNull();

    pick('b').click();
    expect(model.discussionPickerSelection(model.currentChatDiscussion()?.picker ?? null)?.newPersonas[0]?.id).toBe('b');
    expect(start().disabled).toBe(false);
    expect(pick('c').disabled).toBe(true);
    expect(host.querySelector('[role="note"]')?.textContent).toContain('Future messages use 2 sequential responses');

    pick('b').focus();
    const escape = new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true});
    pick('b').dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement?.id).toBe('chat-discuss-btn');

    model.publishDiscussionRound(scope, {participants: ['Analyst', 'House'], pending: 1, progress: ''});
    expect(action('resume-discussion').textContent).toBe('Resume 1');
    expect(action('pause-discussion').hidden).toBe(true);
    expect(host.querySelector('#chat-input')?.getAttribute('aria-describedby')).toBe('chat-discussion-composer-help');
    model.publishDiscussionProgress('Fixture round in progress');
    expect(action('pause-discussion').hidden).toBe(false);
    model.publishDiscussionSaving(true);
    expect(action('end-discussion').disabled).toBe(true);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Saving discussion…');
    model.publishDiscussionSaving(false);
    const stale = new MouseEvent('click', {bubbles: true, cancelable: true});
    scope = 'new-thread';
    expect(action('end-discussion').dispatchEvent(stale)).toBe(false);
    expect(model.currentChatDiscussion()).toBeNull();
  } finally {
    await native.unmount(mounted);
    model.configureChatDiscussionContext(() => '');
    host.remove();
  }
});
