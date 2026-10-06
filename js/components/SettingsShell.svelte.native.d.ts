import type { Component } from 'svelte';
import type { SettingsShellProps } from '../settings-shell-contract.js';
declare const SettingsShell: Component<SettingsShellProps, { selectTab(id: string): void }>;
export default SettingsShell;
export { mount, unmount, flushSync } from 'svelte';
