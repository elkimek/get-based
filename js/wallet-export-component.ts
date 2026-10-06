import WalletExport, { mount, unmount, flushSync } from './components/WalletExport.svelte.native.js';
import type { WalletExportActions, WalletExportComponentView, WalletExportView } from './wallet-export-contract.js';
let component: WalletExportComponentView | null = null; let view: WalletExportView | null = null;
export function disposeWalletExport(): void { if (component) { component.clearPrivateFields(); void unmount(component); flushSync(); } component = null; view = null; }
export function mountWalletExport(host: HTMLElement, actions: WalletExportActions): WalletExportView {
  disposeWalletExport(); host.replaceChildren();
  const owner = mount(WalletExport, { target: host, props: { actions } }); component = owner; flushSync();
  const root = host.querySelector('[data-wallet-export-view]');
  const isCurrent = () => component === owner && !!root && host.isConnected && host.contains(root) && host.style.display !== 'none';
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = { isCurrent, getState: () => owner.getState(), setState: next => apply(() => owner.setState(next)), showToken: token => apply(() => owner.showToken(token)), readToken: () => isCurrent() ? owner.readToken() : '', clearPrivateFields: () => apply(() => owner.clearPrivateFields()) };
  return view;
}
export function getWalletExportView(): WalletExportView | null { return view?.isCurrent() ? view : null; }
