import WalletWithdraw, { mount, unmount, flushSync } from './components/WalletWithdraw.svelte.native.js';
import type { WalletWithdrawActions, WalletWithdrawComponentView, WalletWithdrawView } from './wallet-withdraw-contract.js';
let component: WalletWithdrawComponentView | null = null; let view: WalletWithdrawView | null = null;
export function disposeWalletWithdraw(): void { if (component) { component.clearPrivateFields(); void unmount(component); flushSync(); } component = null; view = null; }
export function mountWalletWithdraw(host: HTMLElement, actions: WalletWithdrawActions): WalletWithdrawView {
  disposeWalletWithdraw(); host.replaceChildren();
  const owner = mount(WalletWithdraw, { target: host, props: { actions } }); component = owner; flushSync();
  const root = host.querySelector('[data-wallet-withdraw-view]');
  const isCurrent = () => component === owner && !!root && host.isConnected && host.contains(root) && host.style.display !== 'none';
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = { isCurrent, getState: () => owner.getState(), setState: next => apply(() => owner.setState(next)), readDraft: () => owner.readDraft(), setAmount: amount => apply(() => owner.setAmount(amount)), showQuote: quote => apply(() => owner.showQuote(quote)), readQuote: () => isCurrent() ? owner.readQuote() : null, showToken: token => apply(() => owner.showToken(token)), readToken: () => isCurrent() ? owner.readToken() : '', clearPrivateFields: () => apply(() => owner.clearPrivateFields()) };
  return view;
}
export function getWalletWithdrawView(): WalletWithdrawView | null { return view?.isCurrent() ? view : null; }
