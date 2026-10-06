import WalletFunding, { mount, unmount, flushSync } from './components/WalletFunding.svelte.native.js';
import type { WalletFundingActions, WalletFundingComponentView, WalletFundingView } from './wallet-funding-contract.js';
let component: WalletFundingComponentView | null = null;
let target: HTMLElement | null = null;
let view: WalletFundingView | null = null;
export function disposeWalletFunding(): void {
  if (component) { component.clearPrivateFields(); void unmount(component); flushSync(); }
  component = null; target = null; view = null;
}
export function mountWalletFunding(host: HTMLElement, feePct: number, actions: WalletFundingActions): WalletFundingView {
  disposeWalletFunding(); host.replaceChildren(); target = host;
  const owner = mount(WalletFunding, { target: host, props: { feePct, actions } }); component = owner; flushSync();
  const root = host.querySelector('[data-wallet-funding-view]');
  const isCurrent = () => !!root && host.isConnected && host.contains(root) && host.style.display !== 'none' && component === owner && target === host;
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = { isCurrent, getState: () => owner.getState(), setState: next => apply(() => owner.setState(next)),
    showInvoice: value => apply(() => owner.showInvoice(value)), readInvoice: () => isCurrent() ? owner.readInvoice() : null,
    clearInvoice: () => apply(() => owner.clearInvoice()), setCopied: () => apply(() => owner.setCopied()),
    readToken: () => isCurrent() ? owner.readToken() : '', clearToken: () => apply(() => owner.clearToken()),
    readCustomAmount: () => isCurrent() ? owner.readCustomAmount() : '', focusCustomAmount: () => apply(() => owner.focusCustomAmount()),
    clearPrivateFields: () => apply(() => owner.clearPrivateFields()) };
  return view;
}
export function getWalletFundingView(): WalletFundingView | null { return view?.isCurrent() ? view : null; }
