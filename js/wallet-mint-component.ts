import WalletMintPicker, { mount, unmount, flushSync } from './components/WalletMintPicker.svelte.native.js';
import type { WalletMintActions, WalletMintComponentView, WalletMintView } from './wallet-mint-contract.js';
let component: WalletMintComponentView | null = null; let view: WalletMintView | null = null;
export function disposeWalletMint(): void { if (component) { component.clearFields(); void unmount(component); flushSync(); } component = null; view = null; }
export function mountWalletMint(host: HTMLElement, actions: WalletMintActions): WalletMintView {
  disposeWalletMint(); host.replaceChildren();
  const owner = mount(WalletMintPicker, { target: host, props: { actions } }); component = owner; flushSync();
  const root = host.querySelector('[data-wallet-mint-view]');
  const isCurrent = () => component === owner && !!root && host.isConnected && host.contains(root) && host.style.display !== 'none';
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = { isCurrent, getState: () => owner.getState(), setState: next => apply(() => owner.setState(next)), readDraft: () => isCurrent() ? owner.readDraft() : '', setDraft: mint => apply(() => owner.setDraft(mint)), focusSelect: () => apply(() => owner.focusSelect()), clearFields: () => apply(() => owner.clearFields()) };
  return view;
}
export function getWalletMintView(): WalletMintView | null { return view?.isCurrent() ? view : null; }
