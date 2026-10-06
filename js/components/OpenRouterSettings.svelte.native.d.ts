import type { Component } from 'svelte';
import type { OpenRouterSettingsSnapshot, OpenRouterSettingsComponentView } from '../openrouter-settings-contract.js';
declare const OpenRouterSettings: Component<{ initial: OpenRouterSettingsSnapshot }, OpenRouterSettingsComponentView>;
export default OpenRouterSettings;
export { mount, unmount, flushSync } from 'svelte';
