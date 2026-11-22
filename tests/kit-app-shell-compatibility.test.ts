// @vitest-environment jsdom
import {createRequire} from 'node:module';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';

const load = createRequire(import.meta.url);
const page = load('../js/kit/routes/app/+page.svelte.native.js') as typeof import('../js/kit/routes/app/+page.svelte.native.js');
const layout = load('../js/chat-layout.js') as typeof import('../js/chat-layout.js');
const header = load('../js/chat-header-view.js') as typeof import('../js/chat-header-view.js');
const voice = load('../js/chat-voice-view.js') as typeof import('../js/chat-voice-view.js');
const discussion = load('../js/chat-discussion-view.js') as typeof import('../js/chat-discussion-view.js');
const modelPicker = load('../js/chat-model-picker-view.js') as typeof import('../js/chat-model-picker-view.js');
const persona = load('../js/chat-personality-picker-view.js') as typeof import('../js/chat-personality-picker-view.js');

let root: HTMLElement;
let sibling: HTMLButtonElement;
let shell: ReturnType<typeof page.mount> | null;
function control<ElementType extends HTMLElement = HTMLElement>(selector: string): ElementType {
  const node = root.querySelector<ElementType>(selector);
  expect(node, selector).not.toBeNull();
  return node!;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('innerWidth', 1400);
  vi.stubGlobal('matchMedia', vi.fn(() => ({matches: globalThis.innerWidth >= 769})));
  root = document.createElement('div');
  root.id = 'kit-root';
  sibling = document.createElement('button');
  sibling.textContent = 'Outside the app shell';
  document.body.replaceChildren(root, sibling);
  shell = page.mount(page.default, {target: root});
  page.flushSync();
});
afterEach(async () => {
  try {
    if (shell) await page.unmount(shell);
    expect(root.childElementCount).toBe(0);
    expect(sibling.isConnected).toBe(true);
  } finally {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    localStorage.clear();
  }
});

it('keeps Kit chat geometry and rail focus with the same live draft through keyboard and viewport changes', () => {
  const panel = control('#chat-panel'), rail = control('#chat-thread-rail');
  const draft = control<HTMLTextAreaElement>('#chat-input');
  draft.value = 'Unsaved synthetic draft';
  panel.classList.add('open');
  layout.initChatLayout();
  expect(panel.style.getPropertyValue('--chat-panel-width')).toBe('600px');
  expect(rail.inert).toBe(true);
  const handle = control('#chat-panel-resize-handle');
  handle.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true, cancelable: true}));
  expect(panel.style.getPropertyValue('--chat-panel-width')).toBe('616px');
  expect(localStorage.getItem('labcharts-chat-panel-width')).toBe('616');

  rail.classList.add('open');
  layout.syncChatLayout();
  expect(rail.inert).toBe(false);
  expect(panel.style.getPropertyValue('--chat-panel-width')).toBe('820px');
  expect(control('#chat-rail-resize-handle').getAttribute('aria-valuenow')).toBe('220');
  control('.chat-rail-back').focus();
  rail.classList.remove('open');
  layout.syncChatLayout();
  expect(document.activeElement).toBe(control('.chat-rail-toggle'));
  expect(rail.inert).toBe(true);

  vi.stubGlobal('innerWidth', 390);
  window.dispatchEvent(new Event('resize'));
  expect(panel.style.getPropertyValue('--chat-panel-width')).toBe('');
  expect(draft.value).toBe('Unsaved synthetic draft');
  expect(control('#chat-input')).toBe(draft);
});

it('bounds Kit chat header keyboard and privacy actions to the current shell', () => {
  const act = vi.fn(), webSearch = vi.fn();
  header.configureChatHeaderActions({act, webSearch});
  header.renderChatHeader({
    title: '<em>Saved conversation</em>', model: 'Synthetic model', privateMode: true,
    attestation: {nonceVerified: true, signingKeyBound: true},
    canSummarize: true, hasSummary: true, summaryLabel: 'View summary',
    webSearchVisible: true, webSearchEnabled: true,
    context: {label: 'Active context', description: 'Explicitly selected', pending: false, error: false, announcement: 'Context is available'},
  });
  expect(control('.chat-header-title').textContent).toBe('<em>Saved conversation</em>');
  expect(root.querySelector('em')).toBeNull();
  expect(control('.e2ee-attestation-badge').textContent).toContain('basic');
  expect(control('#chat-context-live-status').textContent).toBe('Context is available');
  const checkbox = control<HTMLInputElement>('#chat-websearch-checkbox');
  expect(checkbox.checked).toBe(true);
  checkbox.checked = false;
  checkbox.dispatchEvent(new Event('change', {bubbles: true}));
  expect(webSearch).toHaveBeenCalledExactlyOnceWith(false);
  control<HTMLButtonElement>('.chat-summary-btn').click();
  control<HTMLButtonElement>('[data-chat-action="open-chat-context"]').click();

  const trigger = control('.chat-more-menu summary');
  trigger.click();
  page.flushSync();
  expect(control<HTMLDetailsElement>('.chat-more-menu').open).toBe(true);
  document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
  page.flushSync();
  expect(control<HTMLDetailsElement>('.chat-more-menu').open).toBe(false);
  expect(document.activeElement).toBe(trigger);
  trigger.click();
  sibling.click();
  page.flushSync();
  expect(control<HTMLDetailsElement>('.chat-more-menu').open).toBe(false);
  expect(act.mock.calls).toEqual([['summary'], ['context']]);
});

it('keeps the same Kit composer while model, personality, discussion and voice presentations update', () => {
  const text = control<HTMLTextAreaElement>('#chat-input');
  text.value = 'Retain this unsent synthetic draft';
  const view = modelPicker.getChatModelPickerView();
  expect(view).not.toBeNull();
  const select = vi.fn(async () => {}), effort = vi.fn(async () => {});
  modelPicker.configureChatModelPicker({refreshView: vi.fn(), open: vi.fn(), select, refresh: async () => {}, effort});
  view!.render({
    version: 7, provider: 'synthetic', selectedName: 'Alpha', label: 'Alpha', searchable: true, refreshing: false,
    groups: [{key: 'synthetic', label: 'Synthetic provider', options: [
      {value: 'a', label: 'Alpha', search: 'alpha', selected: true},
      {value: 'b', label: 'Beta', search: 'beta', selected: false},
    ]}],
    efforts: [{value: 'low', label: 'Low'}, {value: 'high', label: 'High'}], selectedEffort: 0,
  });
  const modelMenu = control<HTMLDetailsElement>('#chat-model-menu');
  modelMenu.open = true;
  modelMenu.dispatchEvent(new Event('toggle'));
  page.flushSync();
  const query = control<HTMLInputElement>('#chat-model-search');
  query.value = 'beta';
  query.dispatchEvent(new Event('input', {bubbles: true}));
  page.flushSync();
  expect(control<HTMLButtonElement>('[data-chat-model-value="a"]').hidden).toBe(true);
  control<HTMLButtonElement>('[data-chat-model-value="b"]').click();
  expect(select).toHaveBeenCalledExactlyOnceWith('b', 7);
  const slider = control<HTMLInputElement>('#chat-model-effort');
  slider.value = '1';
  slider.dispatchEvent(new Event('input', {bubbles: true}));
  slider.dispatchEvent(new Event('change', {bubbles: true}));
  page.flushSync();
  expect(effort).toHaveBeenCalledExactlyOnceWith('high', 7);
  view!.close();

  const selectPersona = vi.fn(), edit = vi.fn();
  persona.configurePersonalityPicker({refresh: vi.fn(), toggle: vi.fn(), select: selectPersona, edit, delete: vi.fn(), add: vi.fn()});
  const picker = persona.getPersonalityPickerView();
  expect(picker).not.toBeNull();
  picker!.render({version: 9, current: 'one', name: '<em>Saved perspective</em>', icon: '◌',
    options: [{id: 'one', name: '<em>Saved perspective</em>', icon: '◌', description: 'Private synthetic label', custom: true}],
  });
  picker!.setOpen(true);
  control<HTMLButtonElement>('[data-personality="one"]').click();
  control<HTMLButtonElement>('[data-chat-personality-action="edit-custom"]').click();
  expect(selectPersona).toHaveBeenCalledExactlyOnceWith('one', 9);
  expect(edit).toHaveBeenCalledExactlyOnceWith('one', 9);
  expect(root.querySelector('em')).toBeNull();
  picker!.setOpen(false);

  discussion.configureChatDiscussionContext(() => 'synthetic-thread');
  expect(discussion.publishDiscussionRound('synthetic-thread', {participants: ['Alpha', 'Beta'], pending: 1, progress: 'Waiting on a synthetic response'})).toBe(true);
  expect(text.placeholder).toBe('Reply to the discussion…');
  expect(control('#chat-discussion-composer-help').textContent).toContain('1 response remaining');
  discussion.publishDiscussionSaving(true);
  expect(control<HTMLButtonElement>('[data-chat-message-action="resume-discussion"]').disabled).toBe(true);
  discussion.publishDiscussionRound('synthetic-thread', null);

  const toggleVoice = vi.fn();
  voice.configureChatVoiceActions(toggleVoice);
  voice.publishChatCapture('recording', 'Synthetic recording indicator');
  const voiceButton = control<HTMLButtonElement>('#chat-voice-btn');
  expect(voiceButton.getAttribute('aria-label')).toBe('Stop recording');
  voiceButton.click();
  expect(toggleVoice).toHaveBeenCalledOnce();
  voice.publishChatCapture('idle');
  expect(text.value).toBe('Retain this unsent synthetic draft');
  expect(control('#chat-input')).toBe(text);
});


it('ignores queued details events from retired Kit chat menus', async () => {
  const menus = [
    control<HTMLDetailsElement>('.chat-more-menu'),
    control<HTMLDetailsElement>('#chat-model-menu'),
    control<HTMLDetailsElement>('#chat-context-menu'),
  ];
  const opened = vi.fn();
  modelPicker.configureChatModelPicker({refreshView: vi.fn(), open: opened, select: async () => {}, refresh: async () => {}, effort: async () => {}});
  for (const menu of menus) menu.open = true;
  await page.unmount(shell!);
  shell = null;
  for (const menu of menus) {
    expect(menu.isConnected).toBe(false);
    menu.dispatchEvent(new Event('toggle'));
  }
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  expect(opened).not.toHaveBeenCalled();
  expect(root.childElementCount).toBe(0);
});
