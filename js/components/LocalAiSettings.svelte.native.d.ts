import type { Component } from 'svelte';
import type { LocalAiSettingsSnapshot, LocalAiSettingsActions, LocalAiSettingsComponentView } from '../local-ai-settings-contract.js';
declare const LocalAiSettings: Component<{ initial: LocalAiSettingsSnapshot; actions: LocalAiSettingsActions }, LocalAiSettingsComponentView>;
export default LocalAiSettings;
export { mount, unmount, flushSync } from 'svelte';
