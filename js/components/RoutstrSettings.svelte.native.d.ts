import type { Component } from 'svelte';
import type { RoutstrSettingsState, RoutstrSettingsActions, RoutstrSettingsComponentView } from '../routstr-settings-contract.js';
declare const RoutstrSettings: Component<{ initial: RoutstrSettingsState; actions: RoutstrSettingsActions }, RoutstrSettingsComponentView>;
export default RoutstrSettings;
export { mount, unmount, flushSync } from 'svelte';
