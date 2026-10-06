import type { Component } from 'svelte';
import type { PrivacyPreferences, PrivacySettingsView } from '../settings-privacy-contract.js';
declare const PrivacySettings: Component<{ initial: PrivacyPreferences }, PrivacySettingsView>;
export default PrivacySettings;
export { mount, unmount, flushSync } from 'svelte';
