import type { Component } from 'svelte';
import type { VeniceSettingsSnapshot, VeniceSettingsComponentView } from '../venice-settings-contract.js';
declare const VeniceSettings: Component<{ initial: VeniceSettingsSnapshot }, VeniceSettingsComponentView>;
export default VeniceSettings;
export { mount, unmount, flushSync } from 'svelte';
