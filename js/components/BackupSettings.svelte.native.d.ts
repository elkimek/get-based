import type { Component } from 'svelte';
import type { BackupSettingsSnapshot, BackupSettingsView } from '../settings-protection-contract.js';
declare const BackupSettings: Component<{ initial: BackupSettingsSnapshot }, BackupSettingsView>;
export default BackupSettings;
export { mount, unmount, flushSync } from 'svelte';
