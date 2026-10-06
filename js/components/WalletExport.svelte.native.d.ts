import type { Component } from 'svelte';
import type { WalletExportActions, WalletExportComponentView } from '../wallet-export-contract.js';
declare const WalletExport: Component<{ actions: WalletExportActions }, WalletExportComponentView>;
export default WalletExport;
export { mount, unmount, flushSync } from 'svelte';
