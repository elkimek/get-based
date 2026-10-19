// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { state } from '../js/state.js';
import { configureClientListRuntimeDeps } from '../js/client-list-runtime.js';
import { closeModalOverlay } from '../js/modal-lifecycle.js';

let importId = 0;

function profile(overrides: Record<string, unknown>) {
  const now = Date.now();
  return {
    id: 'profile-' + Math.random().toString(36).slice(2),
    name: 'Client',
    sex: null,
    dob: null,
    location: { country: '', zip: '' },
    tags: [],
    notes: '',
    status: 'active',
    avatar: null,
    height: null,
    heightUnit: 'cm',
    createdAt: now,
    lastUpdated: now,
    pinned: false,
    ...overrides,
  };
}

async function loadClientList() {
  return import(/* @vite-ignore */ `../js/client-list.js?runtime=${importId++}` as '../js/client-list.js');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.querySelectorAll(
    '[data-client-list-stylesheet-anchor], link[data-client-list-stylesheet]',
  ).forEach(element => element.remove());
  const stylesheetAnchor = document.createElement('meta');
  stylesheetAnchor.dataset.clientListStylesheetAnchor = '';
  document.head.appendChild(stylesheetAnchor);
  const insertBefore = document.head.insertBefore.bind(document.head);
  vi.spyOn(document.head, 'insertBefore').mockImplementation((node, referenceNode) => {
    const inserted = insertBefore(node, referenceNode);
    if (node instanceof HTMLLinkElement && node.dataset.clientListStylesheet !== undefined) {
      queueMicrotask(() => node.dispatchEvent(new Event('load')));
    }
    return inserted;
  });
  document.body.innerHTML = `
    <div id="modal-overlay" class="show"></div>
    <div id="client-list-overlay"><div id="client-list-modal"></div></div>
    <div id="wearable-strip"></div>
  `;
  (window as unknown as {requestAnimationFrame: (fn: () => void) => void}).requestAnimationFrame = (fn) => fn();
  globalThis.requestAnimationFrame = window.requestAnimationFrame;
  configureClientListRuntimeDeps({
    navigate: vi.fn(),
    renderProfileButton: vi.fn(),
    showNotification: vi.fn(),
  });
  (window as Window & {showConfirmDialog?: unknown}).showConfirmDialog = vi.fn(async () => false);
  state.currentProfile = 'alice';
  (state as unknown as {importedData: unknown}).importedData = { wearableSummary: { metrics: { weight: { latest: 70 } } }, genetics: { mtdna: {} } };
  state.profiles = [
    profile({ id: 'alice', name: 'Alice', notes: 'sleep focus', tags: ['vip'], height: 170, heightUnit: 'cm', lastUpdated: Date.now() - 60_000 }),
    profile({ id: 'bob', name: 'Bob', notes: 'metabolic panel', tags: ['metabolic'], status: 'flagged', lastUpdated: Date.now() - 120_000 }),
    profile({ id: 'cara', name: 'Cara', status: 'archived', tags: ['archive'], lastUpdated: Date.now() - 180_000 }),
  ];
});

afterEach(() => {
  closeModalOverlay('client-list-overlay');
  vi.restoreAllMocks();
  document.querySelectorAll(
    '[data-client-list-stylesheet-anchor], link[data-client-list-stylesheet]',
  ).forEach(element => element.remove());
});

describe('client list runtime behavior', () => {
  it('keeps the lazy facade safe before startup runtime injection', async () => {
    const clientList = await loadClientList();
    const defaults = clientList.configureClientListRuntime();
    const file = new File(['{}'], 'client.json', { type: 'application/json' });

    expect(clientList.isClientListModuleLoaded()).toBe(false);
    expect(() => {
      defaults.exportAllDataJSON();
      defaults.exportClientJSON('alice', true);
      defaults.importDataJSON(file);
      defaults.loadDemoData('female');
      defaults.openProfileShareModal('alice');
    }).not.toThrow();
    expect(clientList.isClientListModuleLoaded()).toBe(false);
  });

  it('restores the real delegated opener across lazy loading when its click did not focus it', async () => {
    const clientList = await loadClientList();
    const nav = await import('../js/nav.js');
    const previousActions = nav.configureNavActions({openClientList: clientList.openClientList});
    try {
      document.body.insertAdjacentHTML('beforeend', '<div id="profile-selector"></div><button id="previous-focus">Previous</button>');
      nav.renderProfileButton();
      const trigger = document.querySelector<HTMLButtonElement>('#profile-selector [data-nav-action="open-client-list"]')!;
      const previous = document.getElementById('previous-focus')!; previous.focus();
      const profile = state.importedData, before = structuredClone(profile), registry = JSON.stringify(state.profiles);
      expect(trigger).not.toBeNull(); expect(clientList.isClientListModuleLoaded()).toBe(false);
      expect(document.activeElement).toBe(previous);
      trigger.click();
      await vi.waitFor(() => expect(document.getElementById('cl-search')).toBe(document.activeElement));
      expect(document.getElementById('client-list-overlay')?.classList.contains('show')).toBe(true);
      clientList.closeClientList();
      expect(document.activeElement).toBe(trigger);
      expect(document.getElementById('client-list-overlay')?.classList.contains('show')).toBe(false);
      expect(state.importedData).toBe(profile); expect(state.importedData).toEqual(before);
      expect(JSON.stringify(state.profiles)).toBe(registry);
    } finally {
      clientList.closeClientList(); nav.configureNavActions(previousActions);
    }
  });

  it('keeps focused search continuously attached through a deferred-RAF typing burst', async () => {
    const clientList = await loadClientList();
    await clientList.openClientList();
    const frames: FrameRequestCallback[] = [];
    const previous = globalThis.requestAnimationFrame;
    const deferred = (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; };
    globalThis.requestAnimationFrame = window.requestAnimationFrame = deferred;
    try {
      const modal = document.getElementById('client-list-modal')!;
      const search = document.getElementById('cl-search') as HTMLInputElement;
      search.focus();
      const observer = new MutationObserver(() => {});
      observer.observe(modal, {childList: true, subtree: true});
      for (const value of ['A', 'Al', 'Ali', 'Alic', 'Alice']) {
        search.value = value; search.setSelectionRange(value.length, value.length);
        search.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: value.at(-1)!}));
        expect(document.getElementById('cl-search')).toBe(search);
        expect(document.activeElement).toBe(search);
        expect([search.value, search.defaultValue, search.getAttribute('value')]).toEqual([value, value, value]);
        expect([search.selectionStart, search.selectionEnd]).toEqual([value.length, value.length]);
        expect(frames).toHaveLength(0);
        expect(observer.takeRecords().every(record => [...record.removedNodes].every(node => node !== search && !node.contains(search)))).toBe(true);
      }
      observer.disconnect();
      expect([...document.querySelectorAll('.cl-list > .cl-row')].map(node => node.getAttribute('data-id'))).toEqual(['alice']);
    } finally { globalThis.requestAnimationFrame = window.requestAnimationFrame = previous; }
  });

  it('preserves mid-string selection direction and deletion without a stale end-caret callback', async () => {
    const clientList = await loadClientList(); await clientList.openClientList();
    const frames: FrameRequestCallback[] = [], previous = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = window.requestAnimationFrame = callback => {frames.push(callback);return frames.length;};
    try {
      const search = document.getElementById('cl-search') as HTMLInputElement; search.focus();
      search.value = 'Alice'; search.setSelectionRange(1, 4, 'backward');
      search.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: 'lic'}));
      expect(document.getElementById('cl-search')).toBe(search);
      expect([search.selectionStart, search.selectionEnd, search.selectionDirection]).toEqual([1, 4, 'backward']);
      search.value = 'Ae'; search.setSelectionRange(1, 1, 'forward');
      search.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'deleteContentBackward'}));
      expect([search.value, search.defaultValue, search.selectionStart, search.selectionEnd, search.selectionDirection]).toEqual(['Ae', 'Ae', 1, 1, 'forward']);
      expect(document.activeElement).toBe(search); expect(frames).toHaveLength(0);
    } finally {globalThis.requestAnimationFrame = window.requestAnimationFrame = previous;}
  });

  it('keeps the same control for composing input until composition ends', async () => {
    const clientList = await loadClientList(); await clientList.openClientList();
    const search = document.getElementById('cl-search') as HTMLInputElement; search.focus();
    search.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true, data: ''}));
    for (const value of ['A', 'Al']) {
      search.value = value; search.setSelectionRange(value.length, value.length);
      search.dispatchEvent(new InputEvent('input', {bubbles: true, data: value, isComposing: true}));
      expect(document.getElementById('cl-search')).toBe(search); expect(document.activeElement).toBe(search);
      expect(search.defaultValue).toBe(value);
    }
    search.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: 'Al'}));
    search.dispatchEvent(new InputEvent('input', {bubbles: true, data: 'Al', isComposing: false}));
    expect(document.getElementById('cl-search')).toBe(search); expect(search.selectionStart).toBe(2);
  });

  it('retains the exact nonfocused programmatic search RAF fallback', async () => {
    const clientList = await loadClientList(); await clientList.openClientList();
    const frames: FrameRequestCallback[] = [], previous = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = window.requestAnimationFrame = callback => {frames.push(callback);return frames.length;};
    try {
      const old = document.getElementById('cl-search') as HTMLInputElement; old.blur(); old.value = 'Bob';
      old.dispatchEvent(new Event('input', {bubbles: true}));
      expect(old.isConnected).toBe(false); expect(frames).toHaveLength(1);
      frames.shift()!(performance.now());
      const current = document.getElementById('cl-search') as HTMLInputElement;
      expect(current).not.toBe(old); expect(document.activeElement).toBe(current);
      expect([current.value, current.defaultValue, current.selectionStart, current.selectionEnd]).toEqual(['Bob', 'Bob', 3, 3]);
    } finally {globalThis.requestAnimationFrame = window.requestAnimationFrame = previous;}
  });

  it('does not let a prior nonfocused RAF move the caret after focused typing', async () => {
    const clientList = await loadClientList(); await clientList.openClientList();
    const frames: FrameRequestCallback[] = [], previous = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = window.requestAnimationFrame = callback => {frames.push(callback);return frames.length;};
    try {
      const old = document.getElementById('cl-search') as HTMLInputElement; old.blur(); old.value = 'Bob';
      old.dispatchEvent(new Event('input', {bubbles: true})); expect(frames).toHaveLength(1);
      const current = document.getElementById('cl-search') as HTMLInputElement; current.focus();
      current.value = 'Alice'; current.setSelectionRange(1, 3, 'backward');
      current.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: 'Alice'}));
      expect(document.getElementById('cl-search')).toBe(current); expect(frames).toHaveLength(1);
      frames.shift()!(performance.now());
      expect(document.activeElement).toBe(current); expect([current.value, current.selectionStart, current.selectionEnd, current.selectionDirection]).toEqual(['Alice', 1, 3, 'backward']);
    } finally {globalThis.requestAnimationFrame = window.requestAnimationFrame = previous;}
  });

  it('leaves all existing rendered nodes and focused caret intact when a profile getter throws', async () => {
    const clientList = await loadClientList(); await clientList.openClientList();
    const modal = document.getElementById('client-list-modal')!, search = document.getElementById('cl-search') as HTMLInputElement;
    search.focus(); search.value = 'A'; search.setSelectionRange(1, 1);
    const before = modal.innerHTML, first = modal.firstChild, profiles = state.profiles as ReturnType<typeof profile>[];
    const descriptor = Object.getOwnPropertyDescriptor(profiles[0]!, 'name')!;
    const errors: string[] = []; const observed = (event: ErrorEvent) => {errors.push(event.message);event.preventDefault();};
    window.addEventListener('error', observed);
    Object.defineProperty(profiles[0]!, 'name', {configurable: true, enumerable: true, get() {throw new Error('search profile getter');}});
    try {
      search.dispatchEvent(new Event('input', {bubbles: true}));
      expect(errors).toEqual(['search profile getter']); expect(modal.innerHTML).toBe(before); expect(modal.firstChild).toBe(first);
      expect(document.getElementById('cl-search')).toBe(search); expect(document.activeElement).toBe(search);
      expect([search.value, search.defaultValue, search.selectionStart, search.selectionEnd]).toEqual(['A', '', 1, 1]);
    } finally {Object.defineProperty(profiles[0]!, 'name', descriptor);window.removeEventListener('error', observed);}
  });

  it('drives list filters, row menus, and edit form through delegated handlers', async () => {
    const clientList = await loadClientList();
    const renderProfileButtonSpy = vi.fn();
    const showNotificationSpy = vi.fn();
    configureClientListRuntimeDeps({
      renderProfileButton: renderProfileButtonSpy,
      showNotification: showNotificationSpy,
    });
    const topLevelNames = () => [...document.querySelectorAll('.cl-list > .cl-row .cl-row-name')].map(el => el.textContent);

    await clientList.openClientList();
    expect((document.getElementById('client-list-overlay') as HTMLElement).classList.contains('show')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(topLevelNames()).toEqual(['Alice', 'Bob']);
    expect(document.querySelector<HTMLElement>('.cl-archived-section')!).not.toBeNull();

    const search = (document.getElementById('cl-search') as HTMLInputElement);
    search.value = 'metabolic';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(topLevelNames()).toEqual(['Bob']);

    const clearedSearch = (document.getElementById('cl-search') as HTMLInputElement);
    clearedSearch.value = '';
    clearedSearch.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector<HTMLElement>('[data-cl-action="tag-filter"][data-cl-tag="vip"]')!.click();
    expect(topLevelNames()).toEqual(['Alice']);

    document.querySelector<HTMLElement>('[data-cl-action="tag-filter"][data-cl-tag="vip"]')!.click();
    const flaggedStatusFilter = document.querySelector<HTMLInputElement>('.cl-status-filter')!;
    flaggedStatusFilter.value = 'flagged';
    flaggedStatusFilter.dispatchEvent(new Event('change', { bubbles: true }));
    expect(topLevelNames()).toEqual(['Bob']);

    const allStatusFilter = document.querySelector<HTMLInputElement>('.cl-status-filter')!;
    allStatusFilter.value = 'all';
    allStatusFilter.dispatchEvent(new Event('change', { bubbles: true }));
    const sort = document.querySelector<HTMLInputElement>('.cl-sort')!;
    sort.value = 'az';
    sort.dispatchEvent(new Event('change', { bubbles: true }));
    expect(topLevelNames().slice(0, 3)).toEqual(['Alice', 'Bob', 'Cara']);

    document.querySelector<HTMLElement>('[data-cl-action="toggle-menu"][data-cl-profile-id="alice"]')!.click();
    expect((document.getElementById('cl-active-menu') as HTMLElement).classList.contains('show')).toBe(true);
    document.querySelector<HTMLElement>('#cl-active-menu [data-cl-action="pin-profile"]')!.click();
    await vi.waitFor(() => {
      expect((state as unknown as {profiles: ReturnType<typeof profile>[]}).profiles.find(p => p.id === 'alice')!.pinned).toBe(true);
      expect(document.querySelector<HTMLElement>('[data-id="alice"] .cl-badge-pinned')!).not.toBeNull();
    });

    document.querySelector<HTMLElement>('[data-cl-action="edit-profile"][data-cl-profile-id="alice"]')!.click();
    expect(document.querySelector<HTMLElement>('.cl-form')!).not.toBeNull();

    (document.getElementById('cl-name') as HTMLInputElement).value = 'Alice Smith';
    document.querySelector<HTMLElement>('[data-cl-action="set-sex"][data-cl-sex="female"]')!.click();
    expect(document.querySelector<HTMLElement>('[data-sex="female"]')!.classList.contains('active')).toBe(true);

    const tagInput = (document.getElementById('cl-tag-input') as HTMLInputElement);
    tagInput.value = 'longevity';
    tagInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const tagPills = [...document.querySelectorAll('.cl-tag-pill')];
    expect(tagPills.map(el => Array.from(el.childNodes)
      .filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim()))
      .toEqual(['vip', 'longevity']);
    // Rendering anchors are comments; only direct text nodes carry saved tag data.
    expect(tagPills.map(el => ({ type: el.firstChild!.nodeType, value: el.firstChild!.nodeValue })))
      .toEqual([{ type: 8, value: '' }, { type: 8, value: '[' }]);
    const emptyTagPill = document.createElement('span');
    emptyTagPill.className = 'cl-tag-pill';
    (document.getElementById('cl-tags-wrap') as HTMLElement).prepend(emptyTagPill);

    (document.getElementById('cl-height') as HTMLInputElement).value = '170';
    (document.getElementById('cl-height-unit-toggle') as HTMLElement).click();
    expect((document.getElementById('cl-height-unit') as HTMLInputElement).value).toBe('in');
    expect((document.getElementById('cl-height') as HTMLInputElement).step).toBe('0.1');
    expect((document.getElementById('cl-bmi-display') as HTMLElement).textContent).toMatch(/24\.[0-9]/);

    document.querySelector<HTMLElement>('.cl-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(showNotificationSpy).toHaveBeenCalledWith('"Alice Smith" updated', 'info');
    });
    const alice = (state as unknown as {profiles: ReturnType<typeof profile>[]}).profiles.find(p => p.id === 'alice');
    expect(alice).toMatchObject({
      name: 'Alice Smith',
      sex: 'female',
      tags: ['vip', 'longevity'],
      status: 'active',
      pinned: true,
    });
    expect(alice!.height).toBeCloseTo(169.9, 1);
    expect(alice!.heightUnit).toBe('in');
    expect(renderProfileButtonSpy).toHaveBeenCalled();
    expect(showNotificationSpy).toHaveBeenCalledWith('"Alice Smith" updated', 'info');

    clientList.closeClientList();
    expect((document.getElementById('client-list-overlay') as HTMLElement).classList.contains('show')).toBe(false);
    expect(document.body.style.overflow).toBe('');
  }, 15_000);

  it('keeps nested row buttons native while only row-target Enter/Space selects a profile', async () => {
    const service = await import('../js/profile.js');
    const chronology: string[] = [];
    const switchProfile = vi.spyOn(service, 'switchProfile').mockImplementation(async id => {chronology.push('switch:' + id);});
    configureClientListRuntimeDeps({renderProfileButton: () => chronology.push('refresh')});
    const appEvents = await import('../js/app-event-listeners.js');
    appEvents.installGlobalEventListeners();
    const clientList = await loadClientList();
    await clientList.openClientList();
    const overlay = document.getElementById('client-list-overlay')!;
    const more = document.querySelector<HTMLButtonElement>('.cl-list > .cl-row[data-id="bob"] [data-cl-action="toggle-menu"]')!;
    more.focus();
    const nestedEnter = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});
    more.dispatchEvent(nestedEnter);
    expect(nestedEnter.defaultPrevented).toBe(false);
    expect(switchProfile).not.toHaveBeenCalled();
    expect(overlay.classList.contains('show')).toBe(true);
    // JSDOM key dispatch has no native activation default. Exercise its actual click delegate separately.
    more.click();
    expect(document.getElementById('cl-active-menu')!.classList.contains('show')).toBe(true);
    expect(switchProfile).not.toHaveBeenCalled();
    const edit = document.querySelector<HTMLButtonElement>('.cl-list > .cl-row[data-id="bob"] [data-cl-action="edit-profile"]')!;
    const editEnter = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});
    edit.dispatchEvent(editEnter);
    expect(editEnter.defaultPrevented).toBe(false);
    expect(switchProfile).not.toHaveBeenCalled();
    edit.click();
    expect(document.querySelector('.cl-form')).not.toBeNull();
    for (const key of ['Enter', ' ']) {
      await clientList.openClientList();
      const row = document.querySelector<HTMLElement>('.cl-list > .cl-row[data-id="bob"]')!;
      row.focus();
      const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true});
      row.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(overlay.classList.contains('show')).toBe(false);
    }
    expect(switchProfile.mock.calls).toEqual([['bob'], ['bob']]);
    expect(chronology).toEqual(['switch:bob', 'refresh', 'switch:bob', 'refresh']);
  });
});
