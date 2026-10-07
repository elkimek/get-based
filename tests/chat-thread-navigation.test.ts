// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { projectThreadNavigation } from '../js/chat-thread-navigation-presentation.js';
import { disposeChatThreadNavigation, mountChatThreadNavigation } from '../js/chat-thread-navigation-component.js';
import type { ChatThreadNavigationActions, ChatThreadNavigationState } from '../js/chat-thread-navigation-contract.js';
import type { ChatThread } from '../types/chat-data.js';
const now = new Date('2026-10-07T12:00:00'), stamp = now.toISOString();
const thread = (id: string, extra: Partial<ChatThread> = {}): ChatThread => ({ id, name: id, createdAt: stamp, updatedAt: stamp, messageCount: 1, personality: 'default', ...extra });
function projection(threads: ChatThread[], sort = 'recent', query = '') { return projectThreadNavigation(threads, 'a', sort, query, ['Project'], { default: '🔬' }, now); }
function setup(initial = projection([thread('a'), thread('b', { projectName: 'Project' })])) {
  const host = document.body.appendChild(document.createElement('div')); host.id = 'chat-thread-list';
  const actions: ChatThreadNavigationActions = { switch: vi.fn(), pin: vi.fn(), rename: vi.fn(), delete: vi.fn(), move: vi.fn(), renameProject: vi.fn(), deleteProject: vi.fn(), jump: vi.fn() };
  const live = { current: true }; const view = mountChatThreadNavigation(host, initial, actions, () => live.current);
  return { host, actions, view, live };
}
const button = (host: HTMLElement, selector: string) => host.querySelector<HTMLButtonElement>(selector)!;
afterEach(() => { disposeChatThreadNavigation(); document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('projects dates, pinned/projects/time groups, sorting, personalities and safe message counts without mutating storage rows', () => {
  const items = [thread('a', { pinned: true, messageCount: -4.3 }), thread('z', { projectName: 'Project', messageCount: 3.7, personalityIcon: 'X' }), thread('today'), thread('yesterday', { updatedAt: new Date(now.getTime() - 86400000).toISOString() }), thread('earlier', { updatedAt: 'invalid', messageCount: NaN })];
  const before = structuredClone(items), state = projection(items);
  expect(state.groups.map(group => group.label)).toEqual(['Pinned','Project','Today','Yesterday','Earlier']);
  expect(state.groups[0]!.threads[0]).toMatchObject({ active: true, icon: '🔬', messageCount: 0 }); expect(state.groups[1]!.threads[0]).toMatchObject({ icon: 'X', messageCount: 3 });
  expect(projection(items,'name','  YESTERDAY ').groups[0]!.threads.map(row => row.id)).toEqual(['yesterday']); expect(projection(items,'oldest').groups.map(group => group.label)).toEqual(['Pinned','Project','Conversations']); expect(items).toEqual(before);
});
it('retains focused controls and open menus across same-group refreshes, then dispatches one owned action', async () => {
  const { host, view, actions } = setup(), first = button(host, '[data-thread-id="a"] .chat-thread-item-main'); first.focus();
  view.setState(projection([thread('a', { name: 'Updated', messageCount: 9 }), thread('b', { projectName: 'Project' })]));
  expect(button(host, '[data-thread-id="a"] .chat-thread-item-main')).toBe(first); expect(document.activeElement).toBe(first);
  const toggle = host.querySelector<HTMLElement>('[data-thread-id="a"] summary')!; toggle.click(); await Promise.resolve(); expect(toggle.parentElement!.hasAttribute('open')).toBe(true);
  view.setState(projection([thread('a', { name: 'Updated twice' }), thread('b', { projectName: 'Project' })])); expect(toggle.parentElement!.hasAttribute('open')).toBe(true);
  button(host, '[data-thread-id="a"] [data-chat-thread-action="pin"]').click(); expect(actions.pin).toHaveBeenCalledExactlyOnceWith('a'); await Promise.resolve(); expect(toggle.parentElement!.hasAttribute('open')).toBe(false);
});
it('owns Escape focus and outside-click capture for both thread and project menus', async () => {
  const { host } = setup(); const toggle = host.querySelector<HTMLElement>('[data-thread-id="a"] summary')!; toggle.click(); await Promise.resolve();
  toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await Promise.resolve(); expect(toggle.parentElement!.hasAttribute('open')).toBe(false); expect(document.activeElement).toBe(toggle);
  const project = host.querySelector<HTMLElement>('.chat-project-action')!; project.click(); await Promise.resolve(); const outside = document.body.appendChild(document.createElement('button')); outside.addEventListener('click', event => event.stopPropagation()); outside.click(); await Promise.resolve(); expect(project.parentElement!.hasAttribute('open')).toBe(false);
});
it('renders inert snippets and binds result navigation privately without raw content-prefix attributes', () => {
  const { host, view, actions } = setup(projection([], 'recent', 'needle'));
  const result = { threadId: 'private', threadName: '<img onerror=unsafe>', msgIndex: 2, role: 'user', pre: '<svg>', match: 'needle', post: '</svg>', contentPrefix: 'PRIVATE-PREFIX-NOT-SHOWN' };
  view.setSearch({ phase: 'done', progress: '', results: [result], truncated: true });
  expect(host.querySelector('img,svg[onload],[onerror],[data-prefix]')).toBeNull(); expect(host.innerHTML).not.toContain(result.contentPrefix); expect(host.textContent).toContain('Showing first 30 matches'); button(host, '.chat-search-result').click(); expect(actions.jump).toHaveBeenCalledExactlyOnceWith(result);
  view.setState(projection([], 'recent', 'different')); expect(host.querySelector('.chat-search-result')).toBeNull();
});
it('rejects old profile, detached and replaced-owner actions and search replies', () => {
  const { host, view, live, actions } = setup(); const retained = button(host, '[data-thread-id="a"] .chat-thread-item-main');
  live.current = false; retained.click(); view.setSearch({ phase: 'pending', progress: 'STALE', results: [], truncated: false }); expect(actions.switch).not.toHaveBeenCalled(); expect(host.textContent).not.toContain('STALE');
  live.current = true; host.replaceChildren(); setup(); retained.click(); view.setState({} as ChatThreadNavigationState); expect(actions.switch).not.toHaveBeenCalled(); expect(view.isCurrent()).toBe(false);
});
it('clears owned menus and search when disposed, preventing retained controls from dispatching', () => {
  const { host, view, actions } = setup(); const retained = button(host, '[data-chat-thread-action="delete"]'); disposeChatThreadNavigation(); retained.click(); expect(actions.delete).not.toHaveBeenCalled(); expect(view.isCurrent()).toBe(false); expect(host.textContent).toBe('');
});

function pointer(target: EventTarget, type: string, pointerId = 1, x = 10, pointerType = 'mouse') {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 10 });
  Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType }, isPrimary: { value: true } });
  target.dispatchEvent(event);
}
it('owns the pointer threshold and target, moves once and suppresses the following switch click', async () => {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const { host, actions } = setup(), source = button(host, '[data-thread-id="a"] .chat-thread-item-main');
  const target = host.querySelector<HTMLElement>('[data-chat-project-drop="Project"]')!;
  const previous = document.elementFromPoint;
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });
  try {
    pointer(source, 'pointerdown'); pointer(document, 'pointermove', 1, 13); await Promise.resolve();
    expect(document.body.classList.contains('is-chat-thread-pointer-dragging')).toBe(false);
    pointer(document, 'pointermove', 1, 20); await Promise.resolve();
    expect(document.body.classList.contains('is-chat-thread-pointer-dragging')).toBe(true);
    pointer(document, 'pointerup', 2, 20); expect(actions.move).not.toHaveBeenCalled();
    pointer(document, 'pointerup', 1, 20); source.click();
    expect(actions.move).toHaveBeenCalledExactlyOnceWith('a', 'Project'); expect(actions.switch).not.toHaveBeenCalled();
    expect(document.body.classList.contains('is-chat-thread-pointer-dragging')).toBe(false);
    await vi.advanceTimersByTimeAsync(0); source.click(); expect(actions.switch).toHaveBeenCalledExactlyOnceWith('a');
  } finally { Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: previous }); }
});
it('ignores touch dragging and releases cursor ownership on cancellation blur and disposal', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const { host, actions } = setup(), source = button(host, '[data-thread-id="a"] .chat-thread-item-main');
  const previous = document.elementFromPoint;
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
  try {
  pointer(source, 'pointerdown', 1, 10, 'touch'); pointer(document, 'pointermove', 1, 20); await Promise.resolve();
  expect(document.body.classList.contains('is-chat-thread-pointer-dragging')).toBe(false);
  for (const end of ['cancel', 'blur', 'dispose']) {
    pointer(source, 'pointerdown'); pointer(document, 'pointermove', 1, 20); await Promise.resolve();
    expect(document.body.classList.contains('is-chat-thread-pointer-dragging')).toBe(true);
    if (end === 'cancel') pointer(document, 'pointercancel');
    if (end === 'blur') window.dispatchEvent(new Event('blur'));
    if (end === 'dispose') disposeChatThreadNavigation();
    expect(document.body.classList.contains('is-chat-thread-pointer-dragging')).toBe(false);
  }
  pointer(document, 'pointerup', 1, 20); expect(actions.move).not.toHaveBeenCalled();
  } finally { Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: previous }); }
});
