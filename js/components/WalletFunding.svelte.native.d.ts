import type { Component } from 'svelte';
import type { WalletFundingActions, WalletFundingComponentView } from '../wallet-funding-contract.js';
declare const WalletFunding: Component<{ feePct: number; actions: WalletFundingActions }, WalletFundingComponentView>;
export default WalletFunding;
export { mount, unmount, flushSync } from 'svelte';
