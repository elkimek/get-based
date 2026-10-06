import type { Component } from 'svelte';
import type { EncryptionSettingsSnapshot, ProtectionView } from '../settings-protection-contract.js';
declare const EncryptionSettings: Component<{ initial: EncryptionSettingsSnapshot }, ProtectionView<EncryptionSettingsSnapshot>>;
export default EncryptionSettings;
export { mount, unmount, flushSync } from 'svelte';
