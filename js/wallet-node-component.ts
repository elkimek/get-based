import WalletNode, { mount, unmount, flushSync } from './components/WalletNode.svelte.native.js';
import type { WalletNodeActions, WalletNodeComponentView, WalletNodeView, WalletNodeState } from './wallet-node-contract.js';
let component: WalletNodeComponentView | null = null; let view: WalletNodeView | null = null;
export function disposeWalletNode(): void { if (component) { component.clearPrivateFields(); void unmount(component); flushSync(); } component = null; view = null; }
export function mountWalletNode(host: HTMLElement, actions: WalletNodeActions, mode: WalletNodeState['mode'], node = ''): WalletNodeView {
  disposeWalletNode(); host.replaceChildren(); let mounted: WalletNodeView | null = null;
  const run = (action: () => unknown) => mounted?.isCurrent() ? action() : undefined;
  const scoped: WalletNodeActions = { connect: node => run(() => actions.connect(node)), refresh: () => run(actions.refresh), chooseMint: mint => run(() => actions.chooseMint(mint)), deposit: amount => run(() => actions.deposit(amount)), newSession: () => run(actions.newSession), retry: index => run(() => actions.retry(index)), copy: index => run(() => actions.copy(index)), reclaim: index => run(() => actions.reclaim(index)), close: () => run(actions.close) };
  const owner = mount(WalletNode, { target: host, props: { actions: scoped } }); component = owner; flushSync();
  const root = host.querySelector('[data-wallet-node-view]');
  const isCurrent = () => component === owner && !!root && host.isConnected && host.contains(root) && host.style.display !== 'none';
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = { isCurrent, getState: () => owner.getState(), setState: next => apply(() => owner.setState(next)), readAmount: () => isCurrent() ? owner.readAmount() : '', setAmount: amount => apply(() => owner.setAmount(amount)), setSession: session => apply(() => owner.setSession(session)), readSession: () => isCurrent() ? owner.readSession() : null, setRecoveries: records => apply(() => owner.setRecoveries(records)), readRecovery: index => isCurrent() ? owner.readRecovery(index) : null, clearPrivateFields: () => apply(() => owner.clearPrivateFields()) };
  mounted = view; view.setState({ ...view.getState(), mode, node }); return view;
}
export function getWalletNodeView(): WalletNodeView | null { return view?.isCurrent() ? view : null; }
