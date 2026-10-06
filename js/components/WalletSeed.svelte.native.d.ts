import type { Component } from 'svelte';
import type { WalletSeedActions, WalletSeedComponentView } from '../wallet-seed-contract.js';
declare const WalletSeed: Component<{ actions: WalletSeedActions }, WalletSeedComponentView>;
export default WalletSeed;
export { mount, unmount, flushSync } from 'svelte';
