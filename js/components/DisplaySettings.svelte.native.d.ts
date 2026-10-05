// Public boundary for the generated native-browser component bundle.
// svelte-check validates the original component and these props separately.
import type { Component } from 'svelte';
import type { DisplayPreferences } from '../settings-display-contract.js';
declare const DisplaySettings: Component<{ initial: DisplayPreferences }, {
  refresh(next: DisplayPreferences): void;
}>;
export default DisplaySettings;
export { mount, unmount, flushSync } from 'svelte';
