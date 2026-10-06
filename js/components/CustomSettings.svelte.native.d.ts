import type { Component } from 'svelte';
import type { CustomSettingsSnapshot, CustomSettingsActions, CustomSettingsComponentView } from '../custom-settings-contract.js';
declare const CustomSettings: Component<{ initial: CustomSettingsSnapshot; actions: CustomSettingsActions }, CustomSettingsComponentView>;
export default CustomSettings;
export { mount, unmount, flushSync } from 'svelte';
