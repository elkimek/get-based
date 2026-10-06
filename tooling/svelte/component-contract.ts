// Compare actual inferred component exports with the native artifact boundary.
import DisplaySettings from '../../js/components/DisplaySettings.svelte';
import type NativeDisplaySettings from '../../js/components/DisplaySettings.svelte.native.js';
export const compatible: typeof NativeDisplaySettings = DisplaySettings;

import SettingsShell from '../../js/components/SettingsShell.svelte';
import type NativeSettingsShell from '../../js/components/SettingsShell.svelte.native.js';
export const shellCompatible: typeof NativeSettingsShell = SettingsShell;
