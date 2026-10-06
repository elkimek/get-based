import type { Component } from 'svelte';
import type { SyncDialogState, SyncDialogView } from '../sync-dialog-contract.js';
declare const SyncDialog: Component<{ initial: SyncDialogState; dismiss: () => void }, SyncDialogView>;
export default SyncDialog;
export { mount, unmount, flushSync } from 'svelte';
