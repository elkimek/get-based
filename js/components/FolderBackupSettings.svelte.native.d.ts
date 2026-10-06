import type { Component } from 'svelte';
import type { FolderBackupSnapshot, ProtectionView } from '../settings-protection-contract.js';
declare const FolderBackupSettings: Component<{ snapshot: FolderBackupSnapshot }, ProtectionView<FolderBackupSnapshot>>;
export default FolderBackupSettings;
export { mount, unmount, flushSync } from 'svelte';
