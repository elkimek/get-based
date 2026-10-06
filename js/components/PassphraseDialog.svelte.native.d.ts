import type { Component } from 'svelte';
import type { PassphraseState, PassphraseActions, PassphraseView } from '../passphrase-contract.js';
declare const PassphraseDialog: Component<{ initial: PassphraseState; actions: PassphraseActions }, PassphraseView>;
export default PassphraseDialog;
export { mount, unmount, flushSync } from 'svelte';
