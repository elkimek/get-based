import type { Component } from 'svelte';
import type { WearablesSettingsSnapshot, WearablesSettingsComponentView } from '../wearables-settings-contract.js';
declare const WearablesSettings: Component<{ initial: WearablesSettingsSnapshot }, WearablesSettingsComponentView>;
export default WearablesSettings;
export { mount, unmount, flushSync } from 'svelte';
