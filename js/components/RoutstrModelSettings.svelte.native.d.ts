import type { Component } from 'svelte';
import type { RoutstrModelSettingsSnapshot, RoutstrModelSettingsComponentView } from '../routstr-model-settings-contract.js';
declare const RoutstrModelSettings: Component<{ initial: RoutstrModelSettingsSnapshot }, RoutstrModelSettingsComponentView>;
export default RoutstrModelSettings;
export { mount, unmount, flushSync } from 'svelte';
