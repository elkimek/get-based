import type { Component } from 'svelte';
import type { WalletWithdrawActions, WalletWithdrawComponentView } from '../wallet-withdraw-contract.js';
declare const WalletWithdraw: Component<{ actions: WalletWithdrawActions }, WalletWithdrawComponentView>;
export default WalletWithdraw;
export { mount, unmount, flushSync } from 'svelte';
