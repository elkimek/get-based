import type { Component } from 'svelte';
import type { SyncSettingsSnapshot, SyncSettingsComponentView } from '../settings-sync-contract.js';
declare const SyncSettings: Component<{ initial: SyncSettingsSnapshot }, SyncSettingsComponentView>;
export default SyncSettings;
export { mount, unmount, flushSync } from 'svelte';
