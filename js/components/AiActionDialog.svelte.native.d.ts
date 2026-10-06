import type { Component } from 'svelte';
import type { AiDialogContent, AiDialogActions, AiDialogComponentView } from '../ai-action-dialog-contract.js';
declare const AiActionDialog: Component<{ content: AiDialogContent; actions: AiDialogActions }, AiDialogComponentView>;
export default AiActionDialog;
export { mount, unmount, flushSync } from 'svelte';
