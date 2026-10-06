// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SettingsShell, { mount, unmount, flushSync } from '../js/components/SettingsShell.svelte.native.js';
import { mountSettingsShell, selectSettingsShellTab, disposeSettingsShell } from '../js/settings-shell.js';
import { SETTINGS_TABS } from '../js/settings-shell-contract.js';
let component: { selectTab(id: string): void } | null = null;
let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
beforeEach(() => {
  media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', () => media);
  document.body.innerHTML = '<div id="settings-modal"></div>';
});
afterEach(async () => {
  if (component) await unmount(component);
  component = null; disposeSettingsShell(); document.body.replaceChildren(); vi.unstubAllGlobals();
});
function render(extra: { extensionTabs?: string; onNavigateTab?: (id: string) => unknown } = {}) {
  component = mount(SettingsShell, { target: document.getElementById('settings-modal')!, props: {
    initialTab: 'display', legacyPanels: '<section id="retained-panel"><input value="saved draft"></section>',
    extensionTabs: '', onNavigateTab: () => {}, ...extra,
  } }); flushSync(); return component;
}
it('renders every core tab and updates selection without recreating panel drafts', () => {
  const instance = render();
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  expect(buttons.map(button => button.dataset.settingsTab)).toEqual(SETTINGS_TABS.map(tab => tab.id));
  for (const button of buttons) expect(button.getAttribute('aria-controls')).toBe(`settings-tab-${button.dataset.settingsTab}`);
  const draft = document.querySelector<HTMLInputElement>('#retained-panel input')!;
  draft.value = 'unsaved edit'; flushSync(() => instance.selectTab('privacy'));
  expect(document.querySelectorAll('[role="tab"][aria-selected="true"]')).toHaveLength(1);
  expect(document.querySelector('[aria-selected="true"]')?.getAttribute('data-settings-tab')).toBe('privacy');
  expect(document.querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
  expect(document.querySelector('#retained-panel input')).toBe(draft); expect(draft.value).toBe('unsaved edit');
});
it('supports the trusted edition tab slot, orientation, keyboard wrap and async selection', async () => {
  const select = vi.fn((id: string) => { flushSync(() => component!.selectTab(id)); });
  render({ extensionTabs: '<button role="tab" data-settings-tab="edition">Edition</button>', onNavigateTab: select });
  expect(document.querySelector('[role="tablist"]')?.getAttribute('aria-orientation')).toBe('vertical');
  const first = document.querySelector<HTMLButtonElement>('[data-settings-tab="display"]')!;
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })); await Promise.resolve();
  expect(select).toHaveBeenLastCalledWith('agent'); expect(document.activeElement?.getAttribute('data-settings-tab')).toBe('agent');
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })); await Promise.resolve();
  expect(select).toHaveBeenLastCalledWith('agent');
  const voice = document.querySelector<HTMLButtonElement>('[data-settings-tab="voice"]')!;
  voice.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); await Promise.resolve();
  expect(select).toHaveBeenLastCalledWith('edition'); expect(document.activeElement?.textContent).toBe('Edition');
  media.matches = false; media.addEventListener.mock.calls[0]![1](); flushSync();
  expect(document.querySelector('[role="tablist"]')?.getAttribute('aria-orientation')).toBe('horizontal');
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); await Promise.resolve();
  expect(select).toHaveBeenLastCalledWith('ai');
  await unmount(component!); component = null;
  expect(media.removeEventListener).toHaveBeenCalledWith('change', media.addEventListener.mock.calls[0]![1]);
});
it('does not move keyboard focus when a tab prerequisite fails', async () => {
  render({ onNavigateTab: () => false });
  const first = document.querySelector<HTMLButtonElement>('[data-settings-tab="display"]')!;
  first.focus(); first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); await Promise.resolve();
  expect(document.activeElement).toBe(first); expect(first.getAttribute('aria-selected')).toBe('true');
});

it('styles only edition navigation tabs and leaves ordinary panel links and drafts alone', () => {
  const host = document.getElementById('settings-modal')!;
  mountSettingsShell(host, { initialTab: 'display', legacyPanels: '<button data-settings-tab="ai">AI settings</button><input id="draft" value="unsaved">',
    extensionTabs: '<button role="tab" data-settings-tab="edition">Edition</button>', onNavigateTab: () => {} });
  const link = host.querySelector<HTMLButtonElement>('.settings-content [data-settings-tab]')!;
  const edition = host.querySelector<HTMLButtonElement>('[data-settings-tab="edition"]')!;
  expect(link.className).toBe(''); expect(link.hasAttribute('aria-selected')).toBe(false);
  expect(edition.classList.contains('settings-tab-btn')).toBe(true);
  const draft = host.querySelector<HTMLInputElement>('#draft')!; draft.value = 'edited';
  selectSettingsShellTab('voice'); expect(host.querySelector('#draft')).toBe(draft); expect(draft.value).toBe('edited');
  mountSettingsShell(host, { initialTab: 'privacy', legacyPanels: '<p>new profile</p>', extensionTabs: '', onNavigateTab: () => {} });
  expect(host.querySelectorAll('#settings-title')).toHaveLength(1); expect(host.querySelector('#draft')).toBeNull();
  expect(host.querySelector('[aria-selected="true"]')?.getAttribute('data-settings-tab')).toBe('privacy');
});
