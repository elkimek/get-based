import WalletSeed, { mount, unmount, flushSync } from './components/WalletSeed.svelte.native.js';
import type { WalletSeedActions, WalletSeedComponentView, WalletSeedView } from './wallet-seed-contract.js';
let component: WalletSeedComponentView | null = null;
let view: WalletSeedView | null = null;
export function disposeWalletSeed(): void {
  if (component) { component.clearPrivateFields(); void unmount(component); flushSync(); }
  component = null; view = null;
}
export function mountWalletSeed(host: HTMLElement, actions: WalletSeedActions): WalletSeedView {
  disposeWalletSeed(); host.replaceChildren();
  const owner = mount(WalletSeed, { target: host, props: { actions } }); component = owner; flushSync();
  const root = host.querySelector('[data-wallet-seed-view]');
  const isCurrent = () => component === owner && !!root && host.isConnected && host.contains(root) && host.style.display !== 'none';
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = { isCurrent, getState: () => owner.getState(), setState: next => apply(() => owner.setState(next)),
    setMnemonic: words => apply(() => owner.setMnemonic(words)), readMnemonic: () => isCurrent() ? owner.readMnemonic() : '',
    readRestore: () => isCurrent() ? owner.readRestore() : '', clearRestore: () => apply(() => owner.clearRestore()),
    isAcknowledged: () => isCurrent() && owner.isAcknowledged(), setCopied: () => apply(() => owner.setCopied()),
    clearPrivateFields: () => apply(() => owner.clearPrivateFields()) };
  return view;
}
export function getWalletSeedView(): WalletSeedView | null { return view?.isCurrent() ? view : null; }
