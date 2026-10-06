import type { Component } from 'svelte';
import type { PpqSettingsSnapshot, PpqSettingsComponentView } from '../ppq-settings-contract.js';
declare const PpqSettings: Component<{ initial: PpqSettingsSnapshot; submitCustom(): void; cancelCustom(): void }, PpqSettingsComponentView>;
export default PpqSettings;
export { mount, unmount, flushSync } from 'svelte';
