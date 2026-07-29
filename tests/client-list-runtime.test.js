// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { state } from '../js/state.js';
import { configureClientListRuntimeDeps } from '../js/client-list-runtime.js';

let importId = 0;

function profile(overrides) {
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
  return import(/* @vite-ignore */ `../js/client-list.js?runtime=${importId++}`);
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
  window.requestAnimationFrame = (fn) => fn();
  globalThis.requestAnimationFrame = window.requestAnimationFrame;
  configureClientListRuntimeDeps({
    navigate: vi.fn(),
    renderProfileButton: vi.fn(),
    showNotification: vi.fn(),
  });
  window.showConfirmDialog = vi.fn(async () => false);
  state.currentProfile = 'alice';
  state.importedData = { wearableSummary: { metrics: { weight: { latest: 70 } } }, genetics: { mtdna: {} } };
  state.profiles = [
    profile({ id: 'alice', name: 'Alice', notes: 'sleep focus', tags: ['vip'], height: 170, heightUnit: 'cm', lastUpdated: Date.now() - 60_000 }),
    profile({ id: 'bob', name: 'Bob', notes: 'metabolic panel', tags: ['metabolic'], status: 'flagged', lastUpdated: Date.now() - 120_000 }),
    profile({ id: 'cara', name: 'Cara', status: 'archived', tags: ['archive'], lastUpdated: Date.now() - 180_000 }),
  ];
});

afterEach(() => {
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
    expect(document.getElementById('client-list-overlay').classList.contains('show')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(topLevelNames()).toEqual(['Alice', 'Bob']);
    expect(document.querySelector('.cl-archived-section')).not.toBeNull();

    const search = document.getElementById('cl-search');
    search.value = 'metabolic';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(topLevelNames()).toEqual(['Bob']);

    const clearedSearch = document.getElementById('cl-search');
    clearedSearch.value = '';
    clearedSearch.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-cl-action="tag-filter"][data-cl-tag="vip"]').click();
    expect(topLevelNames()).toEqual(['Alice']);

    document.querySelector('[data-cl-action="tag-filter"][data-cl-tag="vip"]').click();
    const flaggedStatusFilter = document.querySelector('.cl-status-filter');
    flaggedStatusFilter.value = 'flagged';
    flaggedStatusFilter.dispatchEvent(new Event('change', { bubbles: true }));
    expect(topLevelNames()).toEqual(['Bob']);

    const allStatusFilter = document.querySelector('.cl-status-filter');
    allStatusFilter.value = 'all';
    allStatusFilter.dispatchEvent(new Event('change', { bubbles: true }));
    const sort = document.querySelector('.cl-sort');
    sort.value = 'az';
    sort.dispatchEvent(new Event('change', { bubbles: true }));
    expect(topLevelNames().slice(0, 3)).toEqual(['Alice', 'Bob', 'Cara']);

    document.querySelector('[data-cl-action="toggle-menu"][data-cl-profile-id="alice"]').click();
    expect(document.getElementById('cl-active-menu').classList.contains('show')).toBe(true);
    document.querySelector('#cl-active-menu [data-cl-action="pin-profile"]').click();
    await vi.waitFor(() => {
      expect(state.profiles.find(p => p.id === 'alice').pinned).toBe(true);
      expect(document.querySelector('[data-id="alice"] .cl-badge-pinned')).not.toBeNull();
    });

    document.querySelector('[data-cl-action="edit-profile"][data-cl-profile-id="alice"]').click();
    expect(document.querySelector('.cl-form')).not.toBeNull();

    document.getElementById('cl-name').value = 'Alice Smith';
    document.querySelector('[data-cl-action="set-sex"][data-cl-sex="female"]').click();
    expect(document.querySelector('[data-sex="female"]').classList.contains('active')).toBe(true);

    const tagInput = document.getElementById('cl-tag-input');
    tagInput.value = 'longevity';
    tagInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect([...document.querySelectorAll('.cl-tag-pill')].map(el => el.firstChild.textContent.trim())).toContain('longevity');
    const emptyTagPill = document.createElement('span');
    emptyTagPill.className = 'cl-tag-pill';
    document.getElementById('cl-tags-wrap').prepend(emptyTagPill);

    document.getElementById('cl-height').value = '170';
    document.getElementById('cl-height-unit-toggle').click();
    expect(document.getElementById('cl-height-unit').value).toBe('in');
    expect(document.getElementById('cl-height').step).toBe('0.1');
    expect(document.getElementById('cl-bmi-display').textContent).toMatch(/24\.[0-9]/);

    document.querySelector('.cl-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(showNotificationSpy).toHaveBeenCalledWith('"Alice Smith" updated', 'info');
    });
    const alice = state.profiles.find(p => p.id === 'alice');
    expect(alice).toMatchObject({
      name: 'Alice Smith',
      sex: 'female',
      tags: ['vip', 'longevity'],
      status: 'active',
      pinned: true,
    });
    expect(alice.height).toBeCloseTo(169.9, 1);
    expect(alice.heightUnit).toBe('in');
    expect(renderProfileButtonSpy).toHaveBeenCalled();
    expect(showNotificationSpy).toHaveBeenCalledWith('"Alice Smith" updated', 'info');

    clientList.closeClientList();
    expect(document.getElementById('client-list-overlay').classList.contains('show')).toBe(false);
    expect(document.body.style.overflow).toBe('');
  }, 15_000);
});
