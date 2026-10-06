import type { Component } from 'svelte';
import type { AIUsageSnapshot, SettingsRecordsView } from '../settings-records-contract.js';
declare const AIUsageSettings: Component<{ initial: AIUsageSnapshot }, SettingsRecordsView<AIUsageSnapshot>>;
export default AIUsageSettings;
export { mount, unmount, flushSync } from 'svelte';
