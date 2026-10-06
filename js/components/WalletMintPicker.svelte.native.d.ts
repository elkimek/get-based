import type { Component } from 'svelte';
import type { WalletMintActions, WalletMintComponentView } from '../wallet-mint-contract.js';
declare const WalletMintPicker: Component<{ actions: WalletMintActions }, WalletMintComponentView>;
export default WalletMintPicker;
export { mount, unmount, flushSync } from 'svelte';
