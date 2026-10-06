import type { Component } from 'svelte';
import type { AiSettingsSnapshot, AiSettingsActions, AiSettingsComponentView } from '../ai-settings-contract.js';
declare const AiSettings: Component<{ initial:AiSettingsSnapshot; actions:AiSettingsActions },AiSettingsComponentView>;
export default AiSettings;
export { mount,unmount,flushSync } from 'svelte';
