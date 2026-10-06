import type { Component } from 'svelte';
import type { WalletNodeActions, WalletNodeComponentView } from '../wallet-node-contract.js';
declare const WalletNode: Component<{ actions: WalletNodeActions }, WalletNodeComponentView>;
export default WalletNode;
export { mount, unmount, flushSync } from 'svelte';
