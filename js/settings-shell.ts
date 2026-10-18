// Lifecycle boundary for the Settings shell. Feature delegates remain on its host.
import SettingsShell, { mount, unmount, flushSync } from './components/SettingsShell.svelte.native.js';
import { SETTINGS_MODAL_CLASS, SETTINGS_TAB_CLASS, SETTINGS_TABS } from './settings-shell-contract.js';
import type { SettingsShellProps } from './settings-shell-contract.js';
let mounted: { selectTab(id: string): void } | null = null;
export function mountSettingsShell(target: HTMLElement, props: SettingsShellProps): void {
  disposeSettingsShell();
  target.replaceChildren();
  target.className = SETTINGS_MODAL_CLASS;
  target.setAttribute('aria-labelledby', 'settings-title');
  mounted = mount(SettingsShell, { target, props });
  flushSync();
  const coreTabs = new Set<string>(SETTINGS_TABS.map(tab => tab.id));
  // The configured edition adapter owns its existing trusted HTML tab contract.
  for (const button of target.querySelectorAll<HTMLElement>('.settings-tabs-bar [role="tab"][data-settings-tab]')) {
    if (!coreTabs.has(button.dataset.settingsTab || '')) {
      button.classList.add(...SETTINGS_TAB_CLASS.split(' '));
    }
  }
}
export function selectSettingsShellTab(id: string): void {
  if (mounted) flushSync(() => mounted!.selectTab(id));
}

export function disposeSettingsShell(): void {
  if (mounted) { void unmount(mounted); flushSync(); }
  mounted = null;
}
