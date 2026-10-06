import type { Component } from 'svelte';
import type { VoiceSettingsSnapshot, VoiceSettingsView } from '../settings-voice-contract.js';
declare const VoiceSettings: Component<{ initial: VoiceSettingsSnapshot }, Omit<VoiceSettingsView, 'refresh'> & { refresh(next: VoiceSettingsSnapshot): void }>;
export default VoiceSettings;
export { mount, unmount, flushSync } from 'svelte';
