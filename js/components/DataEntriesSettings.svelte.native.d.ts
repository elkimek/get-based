import type { Component } from 'svelte';
import type { DataEntriesSnapshot, SettingsRecordsView } from '../settings-records-contract.js';
declare const DataEntriesSettings: Component<{ initial: DataEntriesSnapshot }, SettingsRecordsView<DataEntriesSnapshot>>;
export default DataEntriesSettings;
export { mount, unmount, flushSync } from 'svelte';
